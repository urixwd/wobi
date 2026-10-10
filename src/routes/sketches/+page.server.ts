import { fail, redirect } from '@sveltejs/kit';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mySquad, players, sketches, teams } from '$lib/server/db/schema';
import {
	getUpcomingFixturesByTeamIds,
	resolveCurrentGwNumber,
	MAX_GW
} from '$lib/server/upcomingFixtures';
import { formatPrice } from '$lib/format';
import { isExactSquad } from '$lib/squadDraft';
import { seasonPoints } from '$lib/stats';
import { transferDiff } from '$lib/transfers';
import { lineupInsights, loadInsightContext } from '$lib/server/lineupInsights';
import type { Actions, PageServerLoad } from './$types';
import { getBaseSquad } from '$lib/server/strategyTracking';

export const load: PageServerLoad = async ({ url }) => {
	const current = await resolveCurrentGwNumber(4);
	const raw = Number(url.searchParams.get('gw') ?? current);
	const gw = Number.isFinite(raw) ? Math.min(MAX_GW, Math.max(1, Math.trunc(raw))) : current;

	const list = await db
		.select()
		.from(sketches)
		.where(eq(sketches.gameweekNumber, gw))
		.orderBy(desc(sketches.updatedAt));

	const squad = (await db.select().from(mySquad).limit(1))[0];
	const savedIds = squad ? [...squad.xiPlayerIds, ...squad.benchPlayerIds] : [];
	// Transfers count against the previous matchday's official team (what Sport5's 3 transfers
	// are measured from), not the last save — saving the lineup as my team mustn't zero them.
	const transferBase = await getBaseSquad(gw);
	const baseIds = transferBase.ids.length ? transferBase.ids : savedIds;

	const ids = [
		...new Set([...list.flatMap((s) => [...s.xiPlayerIds, ...s.benchPlayerIds]), ...savedIds, ...baseIds])
	];
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
	// Fixtures coloured with this sketch's matchday ratings (and each player's position).
	const upcoming = await getUpcomingFixturesByTeamIds(
		playerRows.map((r) => r.player.teamId),
		gw,
		5,
		gw
	);
	const cardById = new Map(
		playerRows.map((r) => [
			r.player.id,
			{
				id: r.player.id,
				name: r.player.name,
				price: r.player.price,
				points: seasonPoints(r.player) ?? 0,
				position: r.player.position,
				logo: r.teamLogo ?? r.player.teamLogoPath,
				teamName: r.teamName,
				upcomingFixtures: upcoming.get(r.player.teamId) ?? []
			}
		])
	);
	const metaById = new Map(
		playerRows.map((r) => [
			r.player.id,
			{
				name: r.player.name,
				position: r.player.position,
				detail: `${seasonPoints(r.player) ?? 0} נק׳ · ${formatPrice(r.player.price)}`
			}
		])
	);
	const cards = (ids: number[]) => ids.map((id) => cardById.get(id)).filter((p) => p != null);

	const insightCtx = await loadInsightContext(ids, gw, baseIds, squad?.freeTransfers ?? 3);

	return {
		gw,
		/** Matchday whose official team is the transfer baseline (null = the saved team). */
		transferBaseGw: transferBase.ids.length ? transferBase.fromGw : null,
		currentGw: current,
		minGw: 1,
		maxGw: MAX_GW,
		sketches: list.map((s) => {
			const xiCount = s.xiPlayerIds.length;
			const benchCount = s.benchPlayerIds.length;
			const sketchIds = [...s.xiPlayerIds, ...s.benchPlayerIds];
			const { out, in: inn } = transferDiff(baseIds, sketchIds, metaById);
			const insights = lineupInsights(s.xiPlayerIds, s.benchPlayerIds, insightCtx);
			const savedXi = squad?.xiPlayerIds ?? [];
			const savedBench = squad?.benchPlayerIds ?? [];
			return {
				...s,
				xiCount,
				benchCount,
				total: xiCount + benchCount,
				isWip: xiCount < 11 || benchCount < 4,
				matchesSaved: isExactSquad(s.xiPlayerIds, s.benchPlayerIds, savedXi, savedBench),
				xiPlayers: cards(s.xiPlayerIds),
				benchPlayers: cards(s.benchPlayerIds),
				insights,
				transfers: {
					out,
					in: inn
				}
			};
		})
	};
};

export const actions: Actions = {
	/** Rename only — keeps updatedAt (the time the lineup itself was saved). */
	rename: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const name = String(form.get('name') ?? '').trim();
		if (!Number.isFinite(id)) return fail(400, { message: 'מזהה לא תקין' });
		if (!name) return fail(400, { message: 'שם ריק' });
		await db.update(sketches).set({ name: name.slice(0, 80) }).where(eq(sketches.id, id));
		return { success: true };
	},
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
