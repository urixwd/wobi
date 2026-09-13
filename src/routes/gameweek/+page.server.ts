import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	fixtures,
	gameweeks,
	mySquad,
	players,
	teams,
	watchlistPermanent,
	watchlistRound,
	type FixtureDifficulty
} from '$lib/server/db/schema';
import {
	attachUpcoming,
	getUpcomingFixturesByTeamIds,
	MAX_GW,
	MIN_GW,
	resolveCurrentGwNumber
} from '$lib/server/upcomingFixtures';
import type { PageServerLoad } from './$types';

function clampGw(n: number): number {
	if (!Number.isFinite(n)) return MIN_GW;
	return Math.min(MAX_GW, Math.max(MIN_GW, Math.round(n)));
}

export const load: PageServerLoad = async ({ url }) => {
	const currentNumber = await resolveCurrentGwNumber(4);
	const gwParam = url.searchParams.get('gw');
	const selectedGw = clampGw(gwParam != null && gwParam !== '' ? Number(gwParam) : currentNumber);

	const prevGw = selectedGw > MIN_GW ? selectedGw - 1 : null;
	const nextGw = selectedGw < MAX_GW ? selectedGw + 1 : null;

	const existingGws = await db
		.select({ number: gameweeks.number })
		.from(gameweeks)
		.orderBy(asc(gameweeks.number));
	const allGwNumbers =
		existingGws.length > 0
			? existingGws.map((g) => g.number)
			: Array.from({ length: MAX_GW - MIN_GW + 1 }, (_, i) => MIN_GW + i);

	let gwRow = (await db.select().from(gameweeks).where(eq(gameweeks.number, selectedGw)).limit(1))[0];

	// Ensure row exists so fixtures can join; empty fixtures OK
	if (!gwRow) {
		const [created] = await db
			.insert(gameweeks)
			.values({
				number: selectedGw,
				label: `מחזור ${selectedGw}`,
				isCurrent: selectedGw === currentNumber
			})
			.onConflictDoUpdate({
				target: gameweeks.number,
				set: { label: `מחזור ${selectedGw}` }
			})
			.returning();
		gwRow = created;
	}

	const rawFixtures = await db.select().from(fixtures).where(eq(fixtures.gameweekId, gwRow.id));
	const allTeams = await db.select().from(teams);
	const teamsById = new Map(allTeams.map((t) => [t.id, t]));

	const fixtureRows = rawFixtures
		.map((f) => {
			const home = teamsById.get(f.homeTeamId);
			const away = teamsById.get(f.awayTeamId);
			if (!home || !away) return null;
			return { fixture: f, home, away };
		})
		.filter(Boolean) as {
		fixture: (typeof rawFixtures)[number];
		home: (typeof allTeams)[number];
		away: (typeof allTeams)[number];
	}[];

	const opponentDifficultyByTeamId = new Map<number, FixtureDifficulty>();
	for (const row of fixtureRows) {
		opponentDifficultyByTeamId.set(row.home.id, row.away.difficulty);
		opponentDifficultyByTeamId.set(row.away.id, row.home.difficulty);
	}

	const squad = (await db.select().from(mySquad).limit(1))[0];
	const squadIds = squad ? [...squad.xiPlayerIds, ...squad.benchPlayerIds] : [];
	const perm = await db.select().from(watchlistPermanent);
	const round = await db.select().from(watchlistRound);
	const focusIds = [
		...new Set([...squadIds, ...perm.map((p) => p.playerId), ...round.map((p) => p.playerId)])
	];

	const focusPlayersRaw =
		focusIds.length > 0
			? await db
					.select({
						player: players,
						teamName: teams.name,
						teamLogo: teams.logoPath,
						teamDifficulty: teams.difficulty
					})
					.from(players)
					.leftJoin(teams, eq(players.teamId, teams.id))
					.where(inArray(players.id, focusIds))
					.orderBy(asc(players.position), asc(players.name))
			: [];

	const upcomingByTeam = await getUpcomingFixturesByTeamIds(
		focusPlayersRaw.map((r) => r.player.teamId),
		selectedGw,
		5
	);
	const focusPlayers = attachUpcoming(focusPlayersRaw, upcomingByTeam).map((r) => ({
		...r,
		opponentDifficulty: opponentDifficultyByTeamId.get(r.player.teamId) ?? null
	}));

	return {
		selectedGw,
		prevGw,
		nextGw,
		allGwNumbers,
		currentNumber,
		fixtures: fixtureRows,
		focusPlayers,
		hasFixtures: fixtureRows.length > 0
	};
};
