/**
 * Decision insights for a candidate lineup (a sketch, an option…) for matchday `gw`:
 * legality, cost, transfers vs the saved team, XI strength, position-aware fixture
 * ease, and risks. Pure given its context; `loadInsightContext` fetches that context.
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { players, teams } from '$lib/server/db/schema';
import { getUpcomingFixturesByTeamIds, type UpcomingFixture } from '$lib/server/upcomingFixtures';
import { getBenchOnlyIds, getRecentMinutes } from '$lib/server/benchOnly';
import { getPointsHistory } from '$lib/server/playerHistory';
import { difficultyFor, fixtureEase, matchdayEase } from '$lib/difficulty';
import { BUDGET_TOTAL, MAX_PER_CLUB, XI_POS_MAX } from '$lib/squadRules';
import { positionLabel } from '$lib/positions';
import { lastRoundPoints, seasonPoints } from '$lib/stats';
import { vlfm } from '$lib/playerMetrics';

/** XI minimums per position (GK exactly 1). */
const XI_POS_MIN: Record<number, number> = { 1: 1, 2: 3, 3: 3, 4: 1 };
/** Average minutes over the last rounds below this = rotation risk. */
const LOW_MINUTES = 45;

type Row = { player: typeof players.$inferSelect; teamName: string | null };

export type InsightContext = {
	gw: number;
	byId: Map<number, Row>;
	upcoming: Map<number, UpcomingFixture[]>;
	benchOnly: Set<number>;
	minutes: Map<number, number[]>;
	/** Points in each recent matchday he played (newest first). */
	roundPoints: Map<number, number[]>;
	savedIds: number[];
	freeTransfers: number;
};

export type InsightRisk = { kind: string; text: string; players: string[] };

export type LineupInsights = {
	valid: boolean;
	issues: string[];
	transfers: number;
	freeTransfers: number;
	overTransfers: boolean;
	spend: number;
	remaining: number;
	xiPoints: number;
	xiForm: number;
	xiVlfm: number;
	/** Average EASE_SCORE over the XI, by each player's position (higher = easier). */
	easeMatchday: number;
	ease3: number;
	ease5: number;
	/** XI players with a red (hard) fixture this matchday. */
	hardThisMatchday: string[];
	/** XI players with a green (easy) fixture this matchday. */
	easyThisMatchday: number;
	risks: InsightRisk[];
	/** Estimated spread (± points, 1 SD) of the XI's matchday total — see `volatilityOf`. */
	volatility: number;
	/** XI players from the same club (they share a match, so their points move together). */
	linkedPairs: { team: string; players: string[]; kind: 'attack' | 'defence' | 'mixed' }[];
	/** XI GK/DEF facing an XI attacker this matchday — their points tend to cancel out. */
	hedgePairs: { players: [string, string] }[];
};

/** Everything `lineupInsights` needs for these player ids (one round of queries). */
export async function loadInsightContext(
	ids: number[],
	gw: number,
	savedIds: number[],
	freeTransfers: number
): Promise<InsightContext> {
	const unique = [...new Set(ids)];
	const rows = unique.length
		? await db
				.select({ player: players, teamName: teams.name })
				.from(players)
				.leftJoin(teams, eq(players.teamId, teams.id))
				.where(inArray(players.id, unique))
		: [];
	const [upcoming, benchOnly, minutes, history] = await Promise.all([
		getUpcomingFixturesByTeamIds(
			rows.map((r) => r.player.teamId),
			gw,
			5,
			gw
		),
		getBenchOnlyIds(),
		getRecentMinutes(unique, 3),
		getPointsHistory()
	]);
	const roundPoints = new Map<number, number[]>();
	for (const id of unique) {
		const played = (history.byPlayer.get(id) ?? []).filter((h) => !('played' in h)) as { points: number }[];
		roundPoints.set(id, played.map((h) => h.points));
	}
	return {
		gw,
		byId: new Map(rows.map((r) => [r.player.id, r])),
		upcoming,
		benchOnly,
		minutes,
		roundPoints,
		savedIds,
		freeTransfers
	};
}

// --- Volatility -------------------------------------------------------------
// SD of the XI matchday total: sqrt(Σσᵢ² + 2Σ ρᵢⱼ σᵢ σⱼ).
// σᵢ: the player's spread over his recent played matchdays, shrunk toward a typical
//     per-position spread (few rounds = noisy): σ² = (n·s² + K·prior²) / (n + K).
// ρᵢⱼ: same club (same match) — two attackers (MID/FWD) share goals/assists, two of
//     GK/DEF share the clean sheet → strongly linked; one of each → weakly linked.
//     Opposite sides of the same match → see RHO_HEDGE / RHO_OPPOSED_SAME_UNIT.
const PRIOR_SD: Record<number, number> = { 1: 2.5, 2: 3, 3: 3, 4: 3.5 };
const PRIOR_WEIGHT = 2;
const RHO_SAME_UNIT = 0.5;
const RHO_MIXED = 0.15;
// Opposite sides of the same match: my GK/DEF vs my attacker on the other team → when the
// attacker scores the defender loses his clean sheet (a hedge); attacker vs attacker or
// defence vs defence → an open / tight game helps both a little.
const RHO_HEDGE = -0.3;
const RHO_OPPOSED_SAME_UNIT = 0.1;
const isDef = (pos: number) => pos === 1 || pos === 2;

function playerSd(points: number[], position: number): number {
	const prior = PRIOR_SD[position] ?? 3;
	const n = points.length;
	if (n < 2) return prior;
	const mean = points.reduce((a, b) => a + b, 0) / n;
	const s2 = points.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
	return Math.sqrt((n * s2 + PRIOR_WEIGHT * prior ** 2) / (n + PRIOR_WEIGHT));
}


const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0);

export function lineupInsights(xiIds: number[], benchIds: number[], ctx: InsightContext): LineupInsights {
	const get = (id: number) => ctx.byId.get(id);
	const xi = xiIds.map(get).filter((r): r is Row => !!r);
	const bench = benchIds.map(get).filter((r): r is Row => !!r);
	const all = [...xi, ...bench];
	const name = (r: Row) => r.player.name;
	const fx = (r: Row) => ctx.upcoming.get(r.player.teamId) ?? [];

	// Legality
	const issues: string[] = [];
	if (xiIds.length !== 11) issues.push(`${xiIds.length}/11 בהרכב`);
	if (benchIds.length !== 4) issues.push(`${benchIds.length}/4 בספסל`);
	for (const pos of [1, 2, 3, 4]) {
		const n = xi.filter((r) => r.player.position === pos).length;
		const min = XI_POS_MIN[pos];
		const max = XI_POS_MAX[pos] ?? 0;
		if (xiIds.length === 11 && (n < min || n > max))
			issues.push(`${n} ב${positionLabel(pos)} בהרכב (${min}–${max})`);
		const b = bench.filter((r) => r.player.position === pos).length;
		if (benchIds.length === 4 && b !== 1) issues.push(`ספסל: ${b} ב${positionLabel(pos)} (צריך 1)`);
	}
	const byClub = new Map<string, number>();
	for (const r of all) byClub.set(r.teamName ?? '?', (byClub.get(r.teamName ?? '?') ?? 0) + 1);
	for (const [club, n] of byClub) if (n > MAX_PER_CLUB) issues.push(`${n} שחקנים מ${club} (מקס׳ ${MAX_PER_CLUB})`);
	const spend = round1(all.reduce((s, r) => s + r.player.price, 0));
	if (spend > BUDGET_TOTAL) issues.push(`חריגה מתקציב: ${spend}/${BUDGET_TOTAL}`);

	// Transfers vs the saved team
	const saved = new Set(ctx.savedIds);
	const transfers = ctx.savedIds.length ? [...xiIds, ...benchIds].filter((id) => !saved.has(id)).length : 0;

	// Fixtures (position-aware)
	const easeOf = (f: (r: Row) => number) => Math.round(avg(xi.map(f)) * 100) / 100;
	const hardThisMatchday: string[] = [];
	let easyThisMatchday = 0;
	for (const r of xi) {
		const next = fx(r).find((f) => f.gameweekNumber === ctx.gw);
		if (!next) continue;
		const d = difficultyFor(next, r.player.position);
		if (d === 'red') hardThisMatchday.push(name(r));
		if (d === 'green') easyThisMatchday++;
	}

	// Risks
	const risks: InsightRisk[] = [];
	const add = (kind: string, text: string, rs: Row[]) => {
		if (rs.length) risks.push({ kind, text, players: rs.map(name) });
	};
	add('injured', 'פצועים בהרכב', xi.filter((r) => r.player.injuredStatus));
	add('expelled', 'מורחקים בהרכב', xi.filter((r) => r.player.expelledStatus));
	add('missing', 'לא זמינים בהרכב', xi.filter((r) => r.player.missingStatus !== 0));
	add('benchOnly', 'פותחים למרות «ספסל בלבד»', xi.filter((r) => ctx.benchOnly.has(r.player.id)));
	add(
		'lowMinutes',
		`בהרכב עם פחות מ־${LOW_MINUTES} דק׳ בממוצע לאחרונה`,
		xi.filter((r) => {
			const m = ctx.minutes.get(r.player.id);
			return !!m?.length && avg(m) < LOW_MINUTES && !ctx.benchOnly.has(r.player.id);
		})
	);
	add(
		'deadBench',
		'בספסל ולא משחקים — חילוף אוטומטי לא ייתן נקודות',
		bench.filter((r) => {
			const m = ctx.minutes.get(r.player.id);
			return !!m?.length && m.every((x) => x === 0);
		})
	);

	// Volatility (see above)
	const sd = xi.map((r) => playerSd(ctx.roundPoints.get(r.player.id) ?? [], r.player.position));
	let variance = sd.reduce((a, x) => a + x * x, 0);
	const linkedPairs: LineupInsights['linkedPairs'] = [];
	const hedgePairs: LineupInsights['hedgePairs'] = [];
	for (let i = 0; i < xi.length; i++)
		for (let j = i + 1; j < xi.length; j++) {
			const a = xi[i].player;
			const b = xi[j].player;
			if (a.teamId !== b.teamId) {
				// Same match, opposite sides (this matchday's fixture, matched by team name).
				const aFx = fx(xi[i]).find((f) => f.gameweekNumber === ctx.gw);
				if (!aFx || aFx.opponentName !== xi[j].teamName) continue;
				const hedge = isDef(a.position) !== isDef(b.position);
				variance += 2 * (hedge ? RHO_HEDGE : RHO_OPPOSED_SAME_UNIT) * sd[i] * sd[j];
				if (hedge) {
					const [d, att] = isDef(a.position) ? [a, b] : [b, a];
					hedgePairs.push({ players: [d.name, att.name] });
				}
				continue;
			}
			const same = isDef(a.position) === isDef(b.position);
			variance += 2 * (same ? RHO_SAME_UNIT : RHO_MIXED) * sd[i] * sd[j];
			linkedPairs.push({
				team: xi[i].teamName ?? '?',
				players: [a.name, b.name],
				kind: same ? (isDef(a.position) ? 'defence' : 'attack') : 'mixed'
			});
		}

	return {
		volatility: Math.round(Math.sqrt(Math.max(0, variance)) * 10) / 10,
		linkedPairs,
		hedgePairs,
		valid: issues.length === 0,
		issues,
		transfers,
		freeTransfers: ctx.freeTransfers,
		overTransfers: transfers > ctx.freeTransfers,
		spend,
		remaining: round1(BUDGET_TOTAL - spend),
		xiPoints: xi.reduce((s, r) => s + (seasonPoints(r.player) ?? 0), 0),
		xiForm: xi.reduce((s, r) => s + (lastRoundPoints(r.player) ?? 0), 0),
		xiVlfm: Math.round(avg(xi.map((r) => vlfm(r.player) ?? 0)) * 100) / 100,
		easeMatchday: easeOf((r) => matchdayEase(fx(r), r.player.position, ctx.gw)),
		ease3: easeOf((r) => fixtureEase(fx(r), r.player.position, 3)),
		ease5: easeOf((r) => fixtureEase(fx(r), r.player.position, 5)),
		hardThisMatchday,
		easyThisMatchday,
		risks
	};
}
