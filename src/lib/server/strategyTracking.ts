/**
 * "What-if" strategy tracking (from GW5 on).
 *
 * Each matchday we record the #1 team each of the 4 strategies would field, plus
 * the user's actual team, into `strategy_picks`. The base for the what-if is the
 * PREVIOUS matchday's team; each strategy fills exactly the slots the user freed
 * (the players released vs. that previous team), taking incomers only from the
 * round watchlist. Once a round's results are imported, `scoreRound` fills each
 * pick's XI points, and `getStandings` tallies the season.
 */
import { and, asc, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	finalSquads,
	matchdayPlan,
	mySquad,
	players,
	playerSnapshots,
	strategyPicks,
	teams,
	watchlistRound
} from '$lib/server/db/schema';
import { seasonPoints, lastRoundPoints } from '$lib/stats';
import { vlfm } from '$lib/playerMetrics';
import { buildTransfers, OBJECTIVES, type ObjectiveKey, type TPlayer } from '$lib/server/matchdayTransfers';
import {
	getUpcomingFixturesByTeamIds,
	type UpcomingFixture
} from '$lib/server/upcomingFixtures';
import type { FixtureDifficulty } from '$lib/server/db/schema';

/** What-if tracking begins here; snapshots before this are ignored as "previous". */
export const TRACKING_START_GW = 5;

export const STRATEGY_LABELS: Record<string, string> = {
	points: 'מקסימום נקודות',
	vlfm: 'תמורה למחיר',
	fixtures: 'לוח קל למחזור',
	fixtures5: 'לוח קל (5 מחזורים)',
	form: 'כושר',
	actual: 'הבחירה שלי'
};

/** Each strategy is tracked under three constraint modes. */
export const MODES = [
	{ key: 'constrained', label: 'מוגבל (יציאה+כניסה)', short: 'מוגבל' },
	{ key: 'out', label: 'יציאה בלבד', short: 'יציאה בלבד' },
	{ key: 'free', label: 'בחירה חופשית', short: 'חופשי' }
] as const;
export type ModeKey = (typeof MODES)[number]['key'];
export const MODE_LABELS: Record<string, string> = Object.fromEntries(
	MODES.map((m) => [m.key, m.short])
);

/** strategy_picks.strategy for a variant is `<objective>:<mode>` (or 'actual'). */
export function strategyKey(objective: string, mode: string): string {
	return `${objective}:${mode}`;
}
export function parseStrategyKey(s: string): { objective: string; mode: string | null } {
	const i = s.indexOf(':');
	return i < 0 ? { objective: s, mode: null } : { objective: s.slice(0, i), mode: s.slice(i + 1) };
}

const EASE: Record<FixtureDifficulty, number> = { green: 3, yellow: 1, red: -2 };

function matchdayEaseOf(upcoming: UpcomingFixture[], currentGw: number): number {
	const f = upcoming.find((u) => u.gameweekNumber === currentGw) ?? upcoming[0];
	return f ? EASE[f.difficulty] ?? 0 : 0;
}

/** Average ease over the next up-to-5 fixtures (matches /squad's "לוח (5)"). */
function fixtureEase5Of(upcoming: UpcomingFixture[]): number {
	const slice = upcoming.slice(0, 5);
	if (!slice.length) return 0;
	return slice.reduce((s, f) => s + (EASE[f.difficulty] ?? 0), 0) / slice.length;
}

type Row = { player: typeof players.$inferSelect; teamName: string | null; teamLogo: string | null };
function toTPlayer(r: Row, upcoming: UpcomingFixture[], currentGw: number): TPlayer {
	return {
		id: r.player.id,
		name: r.player.name,
		teamId: r.player.teamId,
		teamName: r.teamName,
		position: r.player.position,
		price: r.player.price,
		logo: r.teamLogo ?? r.player.teamLogoPath,
		points: seasonPoints(r.player) ?? 0,
		form: lastRoundPoints(r.player) ?? 0,
		vlfm: vlfm(r.player) ?? 0,
		matchdayEase: matchdayEaseOf(upcoming, currentGw),
		fixtureEase5: fixtureEase5Of(upcoming),
		upcomingFixtures: upcoming
	};
}

async function fetchRows(ids: number[]): Promise<Row[]> {
	if (!ids.length) return [];
	return db
		.select({ player: players, teamName: teams.name, teamLogo: teams.logoPath })
		.from(players)
		.leftJoin(teams, eq(players.teamId, teams.id))
		.where(inArray(players.id, ids));
}

async function wishlistRows(currentGw: number): Promise<Row[]> {
	return db
		.select({ player: players, teamName: teams.name, teamLogo: teams.logoPath })
		.from(watchlistRound)
		.innerJoin(players, eq(watchlistRound.playerId, players.id))
		.leftJoin(teams, eq(players.teamId, teams.id))
		.where(eq(watchlistRound.gameweekNumber, currentGw));
}

/** The team the matchday starts from: previous matchday's snapshot, else live my_squad. */
export async function getBaseSquad(
	currentGw: number
): Promise<{ ids: number[]; fromGw: number | null }> {
	const prev = (
		await db
			.select()
			.from(finalSquads)
			.where(
				and(gte(finalSquads.gameweekNumber, TRACKING_START_GW), lt(finalSquads.gameweekNumber, currentGw))
			)
			.orderBy(desc(finalSquads.gameweekNumber))
			.limit(1)
	)[0];
	if (prev) return { ids: [...prev.xiPlayerIds, ...prev.benchPlayerIds], fromGw: prev.gameweekNumber };
	const squad = (await db.select().from(mySquad).limit(1))[0];
	return { ids: squad ? [...squad.xiPlayerIds, ...squad.benchPlayerIds] : [], fromGw: null };
}

export function detectReleased(baseIds: number[], currentIds: number[]): number[] {
	const cur = new Set(currentIds);
	return baseIds.filter((id) => !cur.has(id));
}

/** Wishlist players the user insists on bringing in this matchday (persisted). */
export async function getMustIn(gameweekNumber: number): Promise<number[]> {
	const row = (
		await db.select().from(matchdayPlan).where(eq(matchdayPlan.gameweekNumber, gameweekNumber)).limit(1)
	)[0];
	return row?.mustInIds ?? [];
}

export async function setMustIn(gameweekNumber: number, ids: number[]): Promise<void> {
	await db
		.insert(matchdayPlan)
		.values({ gameweekNumber, mustInIds: ids })
		.onConflictDoUpdate({
			target: matchdayPlan.gameweekNumber,
			set: { mustInIds: ids, updatedAt: new Date() }
		});
}

/** Squad players the user marked to release this matchday (persisted, for live suggestions). */
export async function getMustOut(gameweekNumber: number): Promise<number[]> {
	const row = (
		await db.select().from(matchdayPlan).where(eq(matchdayPlan.gameweekNumber, gameweekNumber)).limit(1)
	)[0];
	return row?.mustOutIds ?? [];
}

export async function setMustOut(gameweekNumber: number, ids: number[]): Promise<void> {
	await db
		.insert(matchdayPlan)
		.values({ gameweekNumber, mustOutIds: ids })
		.onConflictDoUpdate({
			target: matchdayPlan.gameweekNumber,
			set: { mustOutIds: ids, updatedAt: new Date() }
		});
}

/** Build base + wishlist TPlayers for the transfer engine (shared by page + recorder). */
export async function buildTransferInputs(currentGw: number, baseIds: number[]) {
	const [baseRows, wlRows] = await Promise.all([fetchRows(baseIds), wishlistRows(currentGw)]);
	const teamIds = [...baseRows, ...wlRows].map((r) => r.player.teamId);
	const upcoming = await getUpcomingFixturesByTeamIds(teamIds, currentGw, 5);
	const base = baseRows.map((r) => toTPlayer(r, upcoming.get(r.player.teamId) ?? [], currentGw));
	const wishlist = wlRows.map((r) => toTPlayer(r, upcoming.get(r.player.teamId) ?? [], currentGw));
	// keep base ordered like baseIds
	const byId = new Map(base.map((p) => [p.id, p]));
	const baseOrdered = baseIds.map((id) => byId.get(id)).filter(Boolean) as TPlayer[];
	return { base: baseOrdered, wishlist };
}

function spendOf(ps: TPlayer[]): number {
	return Math.round(ps.reduce((s, p) => s + p.price, 0) * 10) / 10;
}
function formationOf(xi: TPlayer[]): string {
	const c = { 2: 0, 3: 0, 4: 0 } as Record<number, number>;
	for (const p of xi) if (p.position >= 2 && p.position <= 4) c[p.position]++;
	return `${c[2]}-${c[3]}-${c[4]}`;
}

async function upsertPick(row: {
	gameweekNumber: number;
	strategy: string;
	xiPlayerIds: number[];
	benchPlayerIds: number[];
	formation: string | null;
	spend: number | null;
	releasedPlayerIds: number[];
}) {
	await db
		.insert(strategyPicks)
		.values({ ...row, points: null })
		.onConflictDoUpdate({
			target: [strategyPicks.gameweekNumber, strategyPicks.strategy],
			set: {
				xiPlayerIds: row.xiPlayerIds,
				benchPlayerIds: row.benchPlayerIds,
				formation: row.formation,
				spend: row.spend,
				releasedPlayerIds: row.releasedPlayerIds,
				points: null,
				updatedAt: new Date()
			}
		});
}

/**
 * Record the actual team + the 4 strategies' what-if for `currentGw`.
 * Call right after the user's final team is saved into `final_squads[currentGw]`.
 */
export async function recordWhatIf(currentGw: number): Promise<{ recorded: string[] }> {
	const current = (
		await db.select().from(finalSquads).where(eq(finalSquads.gameweekNumber, currentGw)).limit(1)
	)[0];
	if (!current) return { recorded: [] };
	const currentIds = [...current.xiPlayerIds, ...current.benchPlayerIds];

	const { ids: baseIds, fromGw } = await getBaseSquad(currentGw);
	const released = fromGw != null ? detectReleased(baseIds, currentIds) : [];

	const { base, wishlist } = await buildTransferInputs(currentGw, baseIds);
	const inboundIds = new Set(wishlist.map((p) => p.id).filter((id) => !baseIds.includes(id)));
	// Mandatory picks come from the persisted planners (must_out ⊆ base, must_in ⊆ inbound).
	const mustOut = (await getMustOut(currentGw)).filter((id) => baseIds.includes(id));
	const mustIn = (await getMustIn(currentGw)).filter((id) => inboundIds.has(id));

	// Freeze the constraints onto the official snapshot (a permanent per-matchday log).
	await db
		.update(finalSquads)
		.set({ mustInIds: mustIn, mustOutIds: mustOut })
		.where(eq(finalSquads.gameweekNumber, currentGw));

	// Always record the actual team.
	const actualPlayers = (await buildTransferInputs(currentGw, currentIds)).base;
	const actualXi = actualPlayers.filter((p) => current.xiPlayerIds.includes(p.id));
	await upsertPick({
		gameweekNumber: currentGw,
		strategy: 'actual',
		xiPlayerIds: current.xiPlayerIds,
		benchPlayerIds: current.benchPlayerIds,
		formation: formationOf(actualXi),
		spend: spendOf(actualPlayers),
		releasedPlayerIds: released
	});
	const recorded = ['actual'];

	// Record each strategy under three constraint modes. (At the first tracked
	// matchday there's no previous team, so the base is the current squad.)
	const modeDefs = [
		{ mode: 'constrained', out: new Set(mustOut), in: new Set(mustIn), rel: mustOut },
		{ mode: 'out', out: new Set(mustOut), in: new Set<number>(), rel: mustOut },
		{ mode: 'free', out: new Set<number>(), in: new Set<number>(), rel: [] as number[] }
	];
	for (const md of modeDefs) {
		const res = buildTransfers(base, wishlist, md.out, md.in, 3);
		for (const b of res.best) {
			if (!b.combo) continue;
			const key = strategyKey(b.key, md.mode);
			await upsertPick({
				gameweekNumber: currentGw,
				strategy: key,
				xiPlayerIds: b.combo.xi.map((p) => p.id),
				benchPlayerIds: b.combo.bench.map((p) => p.id),
				formation: b.combo.formation,
				spend: b.combo.spend,
				releasedPlayerIds: md.rel
			});
			recorded.push(key);
		}
	}
	return { recorded };
}

/** XI round points for round N come from the dump taken after it: snapshot[N+1]. */
export async function scoreRound(
	roundN: number
): Promise<{ scored: number; round: number; snapshotGw: number; note?: string }> {
	const snaps = await db
		.select()
		.from(playerSnapshots)
		.where(eq(playerSnapshots.gameweekNumber, roundN + 1));
	const ptsById = new Map<number, number>();
	for (const s of snaps) {
		const st = s.lastRoundPlayerStats as { points?: number; totalPoints?: number } | null;
		const n = Number(st?.points ?? st?.totalPoints);
		ptsById.set(s.playerId, Number.isFinite(n) ? n : 0);
	}
	if (ptsById.size === 0)
		return { scored: 0, round: roundN, snapshotGw: roundN + 1, note: `אין snapshot למחזור ${roundN + 1}` };

	const picks = await db.select().from(strategyPicks).where(eq(strategyPicks.gameweekNumber, roundN));
	let scored = 0;
	for (const pk of picks) {
		const pts = pk.xiPlayerIds.reduce((s, id) => s + (ptsById.get(id) ?? 0), 0);
		await db
			.update(strategyPicks)
			.set({ points: Math.round(pts * 10) / 10, updatedAt: new Date() })
			.where(eq(strategyPicks.id, pk.id));
		scored++;
	}
	return { scored, round: roundN, snapshotGw: roundN + 1 };
}

export type StandingSeries = {
	key: string;
	objective: string;
	mode: string | null; // null for 'actual'
	label: string; // objective label
	modeLabel: string | null;
	total: number;
	perGw: { gw: number; points: number; cumulative: number }[];
};
export type Standings = {
	gameweeks: number[]; // scored gameweeks, ascending
	series: StandingSeries[]; // 'actual' first, then variants by total desc
	leader: string | null;
};

export async function getStandings(): Promise<Standings> {
	const rows = await db.select().from(strategyPicks).orderBy(asc(strategyPicks.gameweekNumber));
	const scored = rows.filter((r) => r.points != null);
	const gameweeks = [...new Set(scored.map((r) => r.gameweekNumber))].sort((a, b) => a - b);

	// Every strategy key that appears in the scored data (plus 'actual').
	const keys = [...new Set(scored.map((r) => r.strategy))];
	if (!keys.includes('actual') && gameweeks.length) keys.push('actual');

	const series: StandingSeries[] = keys.map((key) => {
		const { objective, mode } = parseStrategyKey(key);
		let cumulative = 0;
		const perGw = gameweeks.map((gw) => {
			const row = scored.find((r) => r.gameweekNumber === gw && r.strategy === key);
			const points = row?.points ?? 0;
			cumulative += points;
			return { gw, points, cumulative };
		});
		return {
			key,
			objective,
			mode,
			label: STRATEGY_LABELS[objective] ?? objective,
			modeLabel: mode ? MODE_LABELS[mode] ?? mode : null,
			total: cumulative,
			perGw
		};
	});

	const leader = [...series].sort((a, b) => b.total - a.total)[0]?.key ?? null;
	const ordered = [
		...series.filter((s) => s.key === 'actual'),
		...series.filter((s) => s.key !== 'actual').sort((a, b) => b.total - a.total)
	];

	return { gameweeks, series: ordered, leader: gameweeks.length ? leader : null };
}

export type PendingCardPlayer = {
	id: number;
	name: string;
	price: number;
	points: number;
	position: number;
	logo: string | null;
	upcomingFixtures: UpcomingFixture[];
};
export type PendingPick = {
	strategy: string;
	objective: string;
	mode: string | null;
	label: string;
	modeLabel: string | null;
	formation: string | null;
	spend: number | null;
	xi: PendingCardPlayer[];
	bench: PendingCardPlayer[];
};
export type ConstraintPlayer = { id: number; name: string; position: number };
export type PendingConstraints = {
	squad: ConstraintPlayer[]; // base squad (the release picker's list)
	inbound: ConstraintPlayer[]; // wishlist candidates (the must-in picker's list)
	forcedOut: number[];
	forcedIn: number[];
};
export type PendingMatchday = {
	gameweekNumber: number;
	picks: PendingPick[];
	constraints: PendingConstraints;
} | null;

const OBJ_ORDER = ['points', 'vlfm', 'fixtures', 'fixtures5', 'form'];
const MODE_ORDER = ['constrained', 'out', 'free'];

/** Latest recorded-but-not-yet-scored matchday, with hydrated line-ups for preview. */
export async function getPendingMatchday(): Promise<PendingMatchday> {
	const rows = await db.select().from(strategyPicks);
	const unscored = rows.filter((r) => r.points == null);
	if (!unscored.length) return null;
	const gw = Math.max(...unscored.map((r) => r.gameweekNumber));
	const picks = rows.filter((r) => r.gameweekNumber === gw);

	const ids = [...new Set(picks.flatMap((p) => [...p.xiPlayerIds, ...p.benchPlayerIds]))];
	const prows = ids.length
		? await db
				.select({ player: players, logo: teams.logoPath })
				.from(players)
				.leftJoin(teams, eq(players.teamId, teams.id))
				.where(inArray(players.id, ids))
		: [];
	const upcoming = await getUpcomingFixturesByTeamIds(
		prows.map((r) => r.player.teamId),
		gw,
		5
	);
	const byId = new Map(
		prows.map((r) => [
			r.player.id,
			{
				id: r.player.id,
				name: r.player.name,
				price: r.player.price,
				points: seasonPoints(r.player) ?? 0,
				position: r.player.position,
				logo: r.logo ?? r.player.teamLogoPath,
				upcomingFixtures: upcoming.get(r.player.teamId) ?? []
			} satisfies PendingCardPlayer
		])
	);
	const hydrate = (arr: number[]) => arr.map((id) => byId.get(id)).filter(Boolean) as PendingCardPlayer[];

	const list: PendingPick[] = picks.map((p) => {
		const { objective, mode } = parseStrategyKey(p.strategy);
		return {
			strategy: p.strategy,
			objective,
			mode,
			label: STRATEGY_LABELS[objective] ?? objective,
			modeLabel: mode ? MODE_LABELS[mode] ?? mode : null,
			formation: p.formation,
			spend: p.spend,
			xi: hydrate(p.xiPlayerIds),
			bench: hydrate(p.benchPlayerIds)
		};
	});
	list.sort((a, b) => {
		if (a.strategy === 'actual') return -1;
		if (b.strategy === 'actual') return 1;
		const o = OBJ_ORDER.indexOf(a.objective) - OBJ_ORDER.indexOf(b.objective);
		return o !== 0 ? o : MODE_ORDER.indexOf(a.mode ?? '') - MODE_ORDER.indexOf(b.mode ?? '');
	});

	// Constraint log for this matchday (frozen on the snapshot at save time).
	const finalRow = (
		await db.select().from(finalSquads).where(eq(finalSquads.gameweekNumber, gw)).limit(1)
	)[0];
	const { ids: baseIds } = await getBaseSquad(gw);
	const { base, wishlist } = await buildTransferInputs(gw, baseIds);
	const baseIdSet = new Set(baseIds);
	const inbound = wishlist.filter((p) => !baseIdSet.has(p.id));
	const inboundSet = new Set(inbound.map((p) => p.id));
	const asCP = (p: { id: number; name: string; position: number }) => ({
		id: p.id,
		name: p.name,
		position: p.position
	});
	const constraints: PendingConstraints = {
		squad: base.map(asCP).sort((a, b) => a.position - b.position),
		inbound: inbound.map(asCP).sort((a, b) => a.position - b.position),
		forcedOut: (finalRow?.mustOutIds ?? []).filter((id) => baseIdSet.has(id)),
		forcedIn: (finalRow?.mustInIds ?? []).filter((id) => inboundSet.has(id))
	};

	return { gameweekNumber: gw, picks: list, constraints };
}
