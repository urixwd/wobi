/**
 * "What-if" strategy tracking (from GW5 on).
 *
 * Each matchday we record the #1 team each strategy would field, plus
 * the user's actual team, into `strategy_picks`. The base for the what-if is the
 * PREVIOUS matchday's team; each strategy fills exactly the slots the user freed
 * (the players released vs. that previous team), taking incomers only from the
 * round watchlist. Once a round's results are imported, `scoreRound` fills each
 * pick's XI points, and `getStandings` tallies the season.
 */
import { asc, desc, eq, inArray, lt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	finalSquads,
	gameweeks,
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
import { fixtureEase, matchdayEase } from '$lib/difficulty';
import { formationLabel } from '$lib/positions';
import { transferDiff } from '$lib/transfers';

/** What-if tracking begins here; snapshots before this are ignored as "previous". */
export const TRACKING_START_GW = 5;

export const STRATEGY_LABELS: Record<string, string> = {
	points: 'מקסימום נקודות',
	vlfm: 'תמורה למחיר',
	fixtures: 'לוח קל למחזור',
	fixtures3: 'לוח קל (3 מחזורים)',
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
		// Ease on the shared scale, rated for THIS player's position.
		matchdayEase: matchdayEase(upcoming, r.player.position, currentGw),
		fixtureEase3: fixtureEase(upcoming, r.player.position, 3),
		fixtureEase5: fixtureEase(upcoming, r.player.position, 5),
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

/**
 * The team the matchday starts from: the latest official squad before it (the
 * pre-tracking GW4 one counts too, so GW5's history doesn't drift with my_squad),
 * else live my_squad.
 */
export async function getBaseSquad(
	currentGw: number
): Promise<{ ids: number[]; fromGw: number | null }> {
	const prev = (
		await db
			.select()
			.from(finalSquads)
			.where(lt(finalSquads.gameweekNumber, currentGw))
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

/** Toggle a player in a matchday planner (max 3). Returns an error message when full. */
export async function toggleMustPick(
	kind: 'in' | 'out',
	gameweekNumber: number,
	playerId: number
): Promise<string | null> {
	const cur = new Set(kind === 'in' ? await getMustIn(gameweekNumber) : await getMustOut(gameweekNumber));
	if (cur.has(playerId)) cur.delete(playerId);
	else {
		if (cur.size >= 3) return kind === 'in' ? 'עד 3 שחייבים להיכנס' : 'עד 3 לשחרר';
		cur.add(playerId);
	}
	await (kind === 'in' ? setMustIn : setMustOut)(gameweekNumber, [...cur]);
	return null;
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

type WhatIfRow = {
	strategy: string;
	xiPlayerIds: number[];
	benchPlayerIds: number[];
	formation: string | null;
	spend: number | null;
	releasedPlayerIds: number[];
};

/**
 * The actual team + each strategy's what-if for `currentGw`, from the given
 * squad and the persisted must-in / must-out planners. Pure: writes nothing.
 */
async function computeWhatIf(
	currentGw: number,
	xiIds: number[],
	benchIds: number[]
): Promise<{ rows: WhatIfRow[]; mustIn: number[]; mustOut: number[] }> {
	const currentIds = [...xiIds, ...benchIds];
	const { ids: baseIds, fromGw } = await getBaseSquad(currentGw);
	const released = fromGw != null ? detectReleased(baseIds, currentIds) : [];

	const { base, wishlist } = await buildTransferInputs(currentGw, baseIds);
	const inboundIds = new Set(wishlist.map((p) => p.id).filter((id) => !baseIds.includes(id)));
	// Mandatory picks come from the persisted planners (must_out ⊆ base, must_in ⊆ inbound).
	const mustOut = (await getMustOut(currentGw)).filter((id) => baseIds.includes(id));
	const mustIn = (await getMustIn(currentGw)).filter((id) => inboundIds.has(id));

	const actualPlayers = (await buildTransferInputs(currentGw, currentIds)).base;
	const actualXi = actualPlayers.filter((p) => xiIds.includes(p.id));
	const rows: WhatIfRow[] = [
		{
			strategy: 'actual',
			xiPlayerIds: xiIds,
			benchPlayerIds: benchIds,
			formation: formationLabel(actualXi),
			spend: spendOf(actualPlayers),
			releasedPlayerIds: released
		}
	];

	// Each strategy under three constraint modes. (At the first tracked
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
			rows.push({
				strategy: strategyKey(b.key, md.mode),
				xiPlayerIds: b.combo.xi.map((p) => p.id),
				benchPlayerIds: b.combo.bench.map((p) => p.id),
				formation: b.combo.formation,
				spend: b.combo.spend,
				releasedPlayerIds: md.rel
			});
		}
	}
	return { rows, mustIn, mustOut };
}

/**
 * Record the actual team + each strategy's what-if for `currentGw`.
 * Call right after the user's final team is saved into `final_squads[currentGw]`.
 */
export async function recordWhatIf(currentGw: number): Promise<{ recorded: string[] }> {
	const current = (
		await db.select().from(finalSquads).where(eq(finalSquads.gameweekNumber, currentGw)).limit(1)
	)[0];
	if (!current) return { recorded: [] };

	const { rows, mustIn, mustOut } = await computeWhatIf(
		currentGw,
		current.xiPlayerIds,
		current.benchPlayerIds
	);

	// Freeze the constraints onto the official snapshot (a permanent per-matchday log).
	await db
		.update(finalSquads)
		.set({ mustInIds: mustIn, mustOutIds: mustOut })
		.where(eq(finalSquads.gameweekNumber, currentGw));

	for (const r of rows) await upsertPick({ gameweekNumber: currentGw, ...r });
	return { recorded: rows.map((r) => r.strategy) };
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
	/** Sum over the matchdays this series has data for (see `fromGw`). */
	total: number;
	/**
	 * One entry per scored gameweek. `points`/`cumulative` are null where the
	 * series has no pick (e.g. a strategy added later — fixtures3 has no GW5):
	 * that's "no data", never 0 points.
	 */
	perGw: { gw: number; points: number | null; cumulative: number | null }[];
	/** First scored gameweek this series has data for. */
	fromGw: number | null;
	/** True when the series is missing some scored gameweek (started later). */
	partial: boolean;
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
		const perGw: StandingSeries['perGw'] = gameweeks.map((gw) => {
			const row = scored.find((r) => r.gameweekNumber === gw && r.strategy === key);
			if (row?.points == null) return { gw, points: null, cumulative: null };
			cumulative += row.points;
			return { gw, points: row.points, cumulative };
		});
		const covered = perGw.filter((p) => p.points != null);
		return {
			key,
			objective,
			mode,
			label: STRATEGY_LABELS[objective] ?? objective,
			modeLabel: mode ? MODE_LABELS[mode] ?? mode : null,
			total: cumulative,
			perGw,
			fromGw: covered[0]?.gw ?? null,
			partial: covered.length < gameweeks.length
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
	points: number | null; // XI round points once scored
	xi: PendingCardPlayer[];
	bench: PendingCardPlayer[];
	/** Transfers vs. the team the matchday started from (see `baseFromGw`). */
	out: ConstraintPlayer[];
	in: ConstraintPlayer[];
	/** XI metrics from current player data — open matchday only (past ones would be anachronistic). */
	metrics: PickMetrics | null;
};
export type PickMetrics = {
	remaining: number;
	points: number;
	vlfm: number;
	matchdayEase: number;
	fixtureEase3: number;
	fixtureEase5: number;
	form: number;
};
export type ConstraintPlayer = { id: number; name: string; position: number };
export type PendingConstraints = {
	squad: ConstraintPlayer[]; // base squad (the release picker's list)
	inbound: ConstraintPlayer[]; // wishlist candidates (the must-in picker's list)
	forcedOut: number[];
	forcedIn: number[];
};
export type MatchdayDetail = {
	gameweekNumber: number;
	scored: boolean;
	/** Not recorded yet: computed now from my_squad + this matchday's planners. */
	live: boolean;
	/** Matchday whose official squad is the transfer base (null = live my_squad). */
	baseFromGw: number | null;
	picks: PendingPick[];
	constraints: PendingConstraints;
} | null;

const OBJ_ORDER = ['points', 'vlfm', 'fixtures', 'fixtures3', 'fixtures5', 'form'];
const MODE_ORDER = ['constrained', 'out', 'free'];

/** Gameweeks that have any recorded strategy picks, ascending. */
export async function getRecordedGameweeks(): Promise<number[]> {
	const rows = await db.select({ gw: strategyPicks.gameweekNumber }).from(strategyPicks);
	return [...new Set(rows.map((r) => r.gw))].sort((a, b) => a - b);
}

/** One matchday's recorded line-ups + constraints, hydrated for display. */
export async function getMatchdayDetail(gw: number): Promise<MatchdayDetail> {
	const recorded = await db.select().from(strategyPicks).where(eq(strategyPicks.gameweekNumber, gw));
	const live = !recorded.length;
	let picks: { strategy: string; xiPlayerIds: number[]; benchPlayerIds: number[]; formation: string | null; spend: number | null; points: number | null }[] = recorded;
	let liveConstraints: { mustIn: number[]; mustOut: number[] } | null = null;
	if (live) {
		// Only the open matchday gets a live preview; a past unrecorded one has nothing to show.
		const cur = (await db.select().from(gameweeks).where(eq(gameweeks.isCurrent, true)).limit(1))[0];
		const squad = (await db.select().from(mySquad).limit(1))[0];
		if (cur?.number !== gw || !squad) return null;
		const res = await computeWhatIf(gw, squad.xiPlayerIds, squad.benchPlayerIds);
		picks = res.rows.map((r) => ({ ...r, points: null }));
		liveConstraints = { mustIn: res.mustIn, mustOut: res.mustOut };
	}
	if (!picks.length) return null;
	const scored = picks.some((r) => r.points != null);

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
			points: p.points,
			xi: hydrate(p.xiPlayerIds),
			bench: hydrate(p.benchPlayerIds),
			out: [],
			in: [],
			metrics: null
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
	const { ids: baseIds, fromGw: baseFromGw } = await getBaseSquad(gw);
	const { base, wishlist } = await buildTransferInputs(gw, baseIds);
	const baseIdSet = new Set(baseIds);

	// Each pick's transfers vs. the base team.
	const metaById = new Map<number, { name: string; position: number }>(
		[...base, ...list.flatMap((pk) => [...pk.xi, ...pk.bench])].map((p) => [p.id, p])
	);
	for (const pk of list) {
		const diff = transferDiff(baseIds, [...pk.xi, ...pk.bench].map((p) => p.id), metaById);
		pk.out = diff.out;
		pk.in = diff.in;
	}

	// Same XI metrics the transfer engine optimises (see makeCombo), for the open matchday.
	if (live) {
		const allIds = [...new Set(list.flatMap((pk) => [...pk.xi, ...pk.bench].map((p) => p.id)))];
		const tById = new Map((await buildTransferInputs(gw, allIds)).base.map((p) => [p.id, p]));
		for (const pk of list) {
			const xi = pk.xi.map((p) => tById.get(p.id)).filter(Boolean) as TPlayer[];
			if (!xi.length) continue;
			const avg = (f: (p: TPlayer) => number) => xi.reduce((s, p) => s + f(p), 0) / xi.length;
			const spend = [...pk.xi, ...pk.bench].reduce((s, p) => s + p.price, 0);
			pk.metrics = {
				remaining: Math.round((120 - spend) * 10) / 10,
				points: xi.reduce((s, p) => s + p.points, 0),
				vlfm: avg((p) => p.vlfm),
				matchdayEase: avg((p) => p.matchdayEase),
				fixtureEase3: avg((p) => p.fixtureEase3),
				fixtureEase5: avg((p) => p.fixtureEase5),
				form: xi.reduce((s, p) => s + p.form, 0)
			};
		}
	}
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
		forcedOut: (liveConstraints?.mustOut ?? finalRow?.mustOutIds ?? []).filter((id) => baseIdSet.has(id)),
		forcedIn: (liveConstraints?.mustIn ?? finalRow?.mustInIds ?? []).filter((id) => inboundSet.has(id))
	};

	return { gameweekNumber: gw, scored, live, baseFromGw, picks: list, constraints };
}
