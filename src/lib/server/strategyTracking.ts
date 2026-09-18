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
	fixtures: 'לוח קל',
	form: 'כושר',
	actual: 'הבחירה שלי'
};

function matchdayEaseOf(upcoming: UpcomingFixture[], currentGw: number): number {
	const f = upcoming.find((u) => u.gameweekNumber === currentGw) ?? upcoming[0];
	if (!f) return 0;
	const rank: Record<FixtureDifficulty, number> = { green: 3, yellow: 1, red: -2 };
	return rank[f.difficulty] ?? 0;
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
export async function recordWhatIf(currentGw: number): Promise<{ recorded: string[]; released: number[] }> {
	const current = (
		await db.select().from(finalSquads).where(eq(finalSquads.gameweekNumber, currentGw)).limit(1)
	)[0];
	if (!current) return { recorded: [], released: [] };
	const currentIds = [...current.xiPlayerIds, ...current.benchPlayerIds];

	const { ids: baseIds, fromGw } = await getBaseSquad(currentGw);
	const released = fromGw != null ? detectReleased(baseIds, currentIds) : [];
	// Wishlist players the user locked as mandatory incomers (only those not already owned).
	const mustIn = (await getMustIn(currentGw)).filter((id) => !baseIds.includes(id));

	// Always record the actual team.
	const { base, wishlist } = await buildTransferInputs(currentGw, baseIds);
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

	// No previous matchday → GW5 baseline: only the actual team is stored.
	if (fromGw == null) return { recorded, released };

	if (released.length === 0 && mustIn.length === 0) {
		// No transfers and nothing locked in → every strategy equals your team.
		for (const { key } of OBJECTIVES) {
			await upsertPick({
				gameweekNumber: currentGw,
				strategy: key,
				xiPlayerIds: current.xiPlayerIds,
				benchPlayerIds: current.benchPlayerIds,
				formation: formationOf(actualXi),
				spend: spendOf(actualPlayers),
				releasedPlayerIds: []
			});
			recorded.push(key);
		}
		return { recorded, released };
	}

	// Released = mandatory outs, mustIn = mandatory incomers; up to 3 transfers total.
	const res = buildTransfers(base, wishlist, new Set(released), new Set(mustIn), 3);
	for (const b of res.best) {
		if (!b.combo) continue;
		await upsertPick({
			gameweekNumber: currentGw,
			strategy: b.key,
			xiPlayerIds: b.combo.xi.map((p) => p.id),
			benchPlayerIds: b.combo.bench.map((p) => p.id),
			formation: b.combo.formation,
			spend: b.combo.spend,
			releasedPlayerIds: released
		});
		recorded.push(b.key);
	}
	return { recorded, released };
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
	label: string;
	total: number;
	perGw: { gw: number; points: number; cumulative: number }[];
};
export type Standings = {
	gameweeks: number[]; // scored gameweeks, ascending
	series: StandingSeries[]; // 'actual' first, then strategies by total desc
	leader: string | null;
};

export async function getStandings(): Promise<Standings> {
	const rows = await db
		.select()
		.from(strategyPicks)
		.orderBy(asc(strategyPicks.gameweekNumber));
	const scored = rows.filter((r) => r.points != null);
	const gameweeks = [...new Set(scored.map((r) => r.gameweekNumber))].sort((a, b) => a - b);

	const keys = ['actual', ...OBJECTIVES.map((o) => o.key)];
	const series: StandingSeries[] = keys.map((key) => {
		let cumulative = 0;
		const perGw = gameweeks.map((gw) => {
			const row = scored.find((r) => r.gameweekNumber === gw && r.strategy === key);
			const points = row?.points ?? 0;
			cumulative += points;
			return { gw, points, cumulative };
		});
		return { key, label: STRATEGY_LABELS[key] ?? key, total: cumulative, perGw };
	});

	const strategiesOnly = series.filter((s) => s.key !== 'actual');
	const leaderSeries = [...series].sort((a, b) => b.total - a.total)[0];
	const ordered = [
		series.find((s) => s.key === 'actual')!,
		...strategiesOnly.sort((a, b) => b.total - a.total)
	].filter(Boolean);

	return { gameweeks, series: ordered, leader: gameweeks.length ? leaderSeries?.key ?? null : null };
}
