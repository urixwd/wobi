import { fail } from '@sveltejs/kit';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mySquad, players, teams } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

async function getOrCreateSquad() {
	const existing = await db.select().from(mySquad).limit(1);
	if (existing[0]) return existing[0];
	const [created] = await db.insert(mySquad).values({}).returning();
	return created;
}

export const load: PageServerLoad = async () => {
	const squad = await getOrCreateSquad();
	const allPlayers = await db
		.select({
			player: players,
			teamName: teams.name,
			teamLogo: teams.logoPath,
			difficulty: teams.difficulty
		})
		.from(players)
		.leftJoin(teams, eq(players.teamId, teams.id))
		.orderBy(asc(players.position), asc(players.name));

	const ids = [...squad.xiPlayerIds, ...squad.benchPlayerIds];
	const selected =
		ids.length > 0
			? await db
					.select({
						player: players,
						teamName: teams.name,
						teamLogo: teams.logoPath,
						difficulty: teams.difficulty
					})
					.from(players)
					.leftJoin(teams, eq(players.teamId, teams.id))
					.where(inArray(players.id, ids))
			: [];

	return {
		squad,
		allPlayers,
		selected
	};
};

export const actions: Actions = {
	save: async ({ request }) => {
		const form = await request.formData();
		const xi = String(form.get('xi') ?? '')
			.split(',')
			.map((s) => Number(s.trim()))
			.filter((n) => Number.isFinite(n) && n > 0);
		const bench = String(form.get('bench') ?? '')
			.split(',')
			.map((s) => Number(s.trim()))
			.filter((n) => Number.isFinite(n) && n > 0);
		const freeTransfers = Number(form.get('freeTransfers') ?? 3);

		if (xi.length > 11) return fail(400, { message: 'XI יכול לכלול עד 11 שחקנים' });
		if (new Set([...xi, ...bench]).size !== xi.length + bench.length) {
			return fail(400, { message: 'שחקן לא יכול להיות גם ב־XI וגם בספסל' });
		}

		const squad = await getOrCreateSquad();
		await db
			.update(mySquad)
			.set({
				xiPlayerIds: xi,
				benchPlayerIds: bench,
				freeTransfers: Number.isFinite(freeTransfers) ? freeTransfers : 3,
				updatedAt: new Date()
			})
			.where(eq(mySquad.id, squad.id));

		return { success: true };
	}
};
