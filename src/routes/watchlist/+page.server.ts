import { fail } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { players, teams, watchlistPermanent, watchlistRound } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const permanent = await db
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

	const round = await db
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

	const allPlayers = await db
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

	return { permanent, round, allPlayers };
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
