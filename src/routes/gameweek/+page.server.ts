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
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	let current = (
		await db.select().from(gameweeks).where(eq(gameweeks.isCurrent, true)).limit(1)
	)[0];

	if (!current) {
		const [created] = await db
			.insert(gameweeks)
			.values({ number: 4, label: 'מחזור 4', isCurrent: true })
			.onConflictDoUpdate({
				target: gameweeks.number,
				set: { isCurrent: true, label: 'מחזור 4' }
			})
			.returning();
		current = created;
	}

	const rawFixtures = await db.select().from(fixtures).where(eq(fixtures.gameweekId, current.id));
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
	const focusIds = [...new Set([...squadIds, ...perm.map((p) => p.playerId), ...round.map((p) => p.playerId)])];

	const focusPlayers =
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

	return {
		current,
		fixtures: fixtureRows,
		focusPlayers: focusPlayers.map((r) => ({
			...r,
			opponentDifficulty: opponentDifficultyByTeamId.get(r.player.teamId) ?? null
		})),
		hasFixtures: fixtureRows.length > 0
	};
};
