import { fail } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { players, teams, watchlistPermanent, watchlistRound } from '$lib/server/db/schema';
import {
	attachUpcoming,
	getUpcomingFixturesByTeamIds,
	resolveCurrentGwNumber
} from '$lib/server/upcomingFixtures';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const permanentRaw = await db
		.select({
			row: watchlistPermanent,
			player: players,
			teamName: teams.name,
			teamLogo: teams.logoPath,
			difficulty: teams.difficulty
		})
		.from(watchlistPermanent)
		.innerJoin(players, eq(watchlistPermanent.playerId, players.id))
		.leftJoin(teams, eq(players.teamId, teams.id))
		.orderBy(asc(players.name));

	const roundRaw = await db
		.select({
			row: watchlistRound,
			player: players,
			teamName: teams.name,
			teamLogo: teams.logoPath,
			difficulty: teams.difficulty
		})
		.from(watchlistRound)
		.innerJoin(players, eq(watchlistRound.playerId, players.id))
		.leftJoin(teams, eq(players.teamId, teams.id))
		.orderBy(asc(players.name));

	const allPlayersRaw = await db
		.select({
			player: players,
			teamName: teams.name,
			teamLogo: teams.logoPath,
			difficulty: teams.difficulty
		})
		.from(players)
		.leftJoin(teams, eq(players.teamId, teams.id))
		.orderBy(asc(players.name))
		.limit(500);

	const fromGw = await resolveCurrentGwNumber(4);
	const teamIds = [
		...permanentRaw.map((r) => r.player.teamId),
		...roundRaw.map((r) => r.player.teamId),
		...allPlayersRaw.map((r) => r.player.teamId)
	];
	const upcomingByTeam = await getUpcomingFixturesByTeamIds(teamIds, fromGw, 5);

	return {
		permanent: attachUpcoming(permanentRaw, upcomingByTeam),
		round: attachUpcoming(roundRaw, upcomingByTeam),
		allPlayers: attachUpcoming(allPlayersRaw, upcomingByTeam)
	};
};

export const actions: Actions = {
	addPermanent: async ({ request }) => {
		const form = await request.formData();
		const playerId = Number(form.get('playerId'));
		if (!playerId) return fail(400, { message: 'חסר שחקן' });
		await db.insert(watchlistPermanent).values({ playerId }).onConflictDoNothing();
		return { success: true };
	},
	removePermanent: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400);
		await db.delete(watchlistPermanent).where(eq(watchlistPermanent.id, id));
		return { success: true };
	},
	addRound: async ({ request }) => {
		const form = await request.formData();
		const playerId = Number(form.get('playerId'));
		if (!playerId) return fail(400, { message: 'חסר שחקן' });
		await db
			.insert(watchlistRound)
			.values({ playerId, gameweekNumber: 4 })
			.onConflictDoNothing();
		return { success: true };
	},
	removeRound: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400);
		await db.delete(watchlistRound).where(eq(watchlistRound.id, id));
		return { success: true };
	}
};
