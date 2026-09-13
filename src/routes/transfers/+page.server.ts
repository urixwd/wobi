import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	fixtures,
	gameweeks,
	mySquad,
	players,
	teams,
	type FixtureDifficulty
} from '$lib/server/db/schema';
import { suggestTransfers } from '$lib/server/suggestions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const squad = (await db.select().from(mySquad).limit(1))[0];
	const allPlayers = await db.select().from(players);
	const allTeams = await db.select().from(teams);
	const teamsById = new Map(allTeams.map((t) => [t.id, t]));

	const current = (
		await db.select().from(gameweeks).where(eq(gameweeks.isCurrent, true)).limit(1)
	)[0];

	const opponentDifficultyByTeamId = new Map<number, FixtureDifficulty>();
	if (current) {
		const gwFixtures = await db.select().from(fixtures).where(eq(fixtures.gameweekId, current.id));
		for (const f of gwFixtures) {
			const home = teamsById.get(f.homeTeamId);
			const away = teamsById.get(f.awayTeamId);
			if (home && away) {
				opponentDifficultyByTeamId.set(home.id, away.difficulty);
				opponentDifficultyByTeamId.set(away.id, home.difficulty);
			}
		}
	}

	const squadIds = squad ? [...squad.xiPlayerIds, ...squad.benchPlayerIds] : [];
	const suggestions =
		squadIds.length > 0
			? suggestTransfers({
					squadIds,
					players: allPlayers,
					teamsById,
					opponentDifficultyByTeamId,
					max: 3
				})
			: [];

	return {
		squad,
		suggestions,
		freeTransfers: squad?.freeTransfers ?? 3,
		playerCount: allPlayers.length
	};
};
