import { and, asc, eq, gte, inArray, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	fixtures,
	gameweeks,
	teams,
	type FixtureDifficulty
} from '$lib/server/db/schema';

export type UpcomingFixture = {
	opponentLogo: string | null;
	opponentName: string;
	difficulty: FixtureDifficulty;
	isHome: boolean;
	gameweekNumber: number;
};

export const MIN_GW = 4;
export const MAX_GW = 26;

/** Resolve current GW number (isCurrent) or fallback. */
export async function resolveCurrentGwNumber(fallback = 4): Promise<number> {
	const current = (
		await db.select().from(gameweeks).where(eq(gameweeks.isCurrent, true)).limit(1)
	)[0];
	return current?.number ?? fallback;
}

/**
 * For each teamId, return up to `limit` upcoming fixtures starting from fromGameweek
 * (inclusive), ordered closest-first (ascending gameweek number).
 */
export async function getUpcomingFixturesByTeamIds(
	teamIds: number[],
	fromGameweek: number,
	limit = 5
): Promise<Map<number, UpcomingFixture[]>> {
	const result = new Map<number, UpcomingFixture[]>();
	const unique = [...new Set(teamIds.filter((id) => Number.isFinite(id) && id > 0))];
	for (const id of unique) result.set(id, []);
	if (unique.length === 0) return result;

	const from = Math.max(MIN_GW, fromGameweek);
	const allTeams = await db.select().from(teams);
	const teamsById = new Map(allTeams.map((t) => [t.id, t]));

	const fixtureRows = await db
		.select({
			id: fixtures.id,
			homeTeamId: fixtures.homeTeamId,
			awayTeamId: fixtures.awayTeamId,
			gwNumber: gameweeks.number
		})
		.from(fixtures)
		.innerJoin(gameweeks, eq(fixtures.gameweekId, gameweeks.id))
		.where(
			and(
				gte(gameweeks.number, from),
				or(inArray(fixtures.homeTeamId, unique), inArray(fixtures.awayTeamId, unique))
			)
		)
		.orderBy(asc(gameweeks.number), asc(fixtures.id));

	for (const f of fixtureRows) {
		const home = teamsById.get(f.homeTeamId);
		const away = teamsById.get(f.awayTeamId);
		if (!home || !away) continue;

		if (result.has(f.homeTeamId)) {
			const list = result.get(f.homeTeamId)!;
			if (list.length < limit) {
				list.push({
					opponentLogo: away.logoPath,
					opponentName: away.name,
					difficulty: away.difficulty,
					isHome: true,
					gameweekNumber: f.gwNumber
				});
			}
		}
		if (result.has(f.awayTeamId)) {
			const list = result.get(f.awayTeamId)!;
			if (list.length < limit) {
				list.push({
					opponentLogo: home.logoPath,
					opponentName: home.name,
					difficulty: home.difficulty,
					isHome: false,
					gameweekNumber: f.gwNumber
				});
			}
		}
	}

	return result;
}

/** Attach upcomingFixtures onto rows that have player.teamId */
export function attachUpcoming<T extends { player: { teamId: number } }>(
	rows: T[],
	byTeam: Map<number, UpcomingFixture[]>
): (T & { upcomingFixtures: UpcomingFixture[] })[] {
	return rows.map((r) => ({
		...r,
		upcomingFixtures: byTeam.get(r.player.teamId) ?? []
	}));
}
