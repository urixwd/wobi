import { fail, redirect } from '@sveltejs/kit';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { players, sketches, teams } from '$lib/server/db/schema';
import { resolveCurrentGwNumber, MIN_GW, MAX_GW } from '$lib/server/upcomingFixtures';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const current = await resolveCurrentGwNumber(4);
	const raw = Number(url.searchParams.get('gw') ?? current);
	const gw = Number.isFinite(raw) ? Math.min(MAX_GW, Math.max(MIN_GW, Math.trunc(raw))) : current;

	const list = await db
		.select()
		.from(sketches)
		.where(eq(sketches.gameweekNumber, gw))
		.orderBy(desc(sketches.updatedAt));

	const ids = [...new Set(list.flatMap((s) => [...s.xiPlayerIds, ...s.benchPlayerIds]))];
	const playerRows =
		ids.length > 0
			? await db
					.select({
						player: players,
						teamName: teams.name,
						teamLogo: teams.logoPath
					})
					.from(players)
					.leftJoin(teams, eq(players.teamId, teams.id))
					.where(inArray(players.id, ids))
			: [];
	const byId = Object.fromEntries(playerRows.map((r) => [r.player.id, r]));

	return {
		gw,
		currentGw: current,
		minGw: MIN_GW,
		maxGw: MAX_GW,
		sketches: list.map((s) => {
			const xiCount = s.xiPlayerIds.length;
			const benchCount = s.benchPlayerIds.length;
			return {
				...s,
				xiCount,
				benchCount,
				total: xiCount + benchCount,
				isWip: xiCount < 11 || benchCount < 4,
				xiPlayers: s.xiPlayerIds.map((id) => byId[id]).filter(Boolean),
				benchPlayers: s.benchPlayerIds.map((id) => byId[id]).filter(Boolean)
			};
		})
	};
};

export const actions: Actions = {
	delete: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isFinite(id)) return fail(400, { message: 'מזהה לא תקין' });
		await db.delete(sketches).where(eq(sketches.id, id));
		return { success: true };
	},
	apply: async ({ request }) => {
		const form = await request.formData();
		const xi = String(form.get('xi') ?? '')
			.split(',')
			.map((s) => Number(s.trim()))
			.filter((n) => Number.isFinite(n) && n > 0);
		const bench = String(form.get('bench') ?? '')
			.split(',')
			.map((s) => Number(s.trim()))
			.filter((n) => Number.isFinite(n) && n > 0);
		if (xi.length + bench.length === 0) {
			return fail(400, { message: 'סקיצה ריקה' });
		}
		const qs = new URLSearchParams({
			staged: '1',
			xi: xi.join(','),
			bench: bench.join(',')
		});
		throw redirect(303, `/squad?${qs.toString()}`);
	}
};
