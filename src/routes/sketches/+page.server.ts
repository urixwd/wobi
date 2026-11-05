import { getPointsDeciles } from '$lib/server/pointsDeciles';
import { fail, redirect } from '@sveltejs/kit';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { downloadedLineups, mySquad, players, sketches, teams } from '$lib/server/db/schema';
import { lineupKey } from '$lib/squadDraft';
import {
	getUpcomingFixturesByTeamIds,
	resolveCurrentGwNumber,
	MAX_GW
} from '$lib/server/upcomingFixtures';
import { formatPrice } from '$lib/format';
import { isExactSquad } from '$lib/squadDraft';
import { lastRoundPoints, seasonPoints } from '$lib/stats';
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
	const deciles = await getPointsDeciles(playerRows.map((r) => r.player.id));
	const cardById = new Map(
		playerRows.map((r) => [
			r.player.id,
			{
				id: r.player.id,
				name: r.player.name,
				price: r.player.price,
				points: seasonPoints(r.player) ?? 0,
				roundPoints: lastRoundPoints(r.player),
				decile: deciles.get(r.player.id) ?? null,
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

	// Same XI + same bench (bench order ignored) = the same lineup saved twice. The list is newest
	// first, so the last sketch seen per lineup (the oldest) is the one to keep.
	const byLineup = new Map<string, (typeof list)[number][]>();
	for (const s of list) {
		const key = lineupKey(s.xiPlayerIds, s.benchPlayerIds);
		byLineup.set(key, [...(byLineup.get(key) ?? []), s]);
	}

	const downloaded = new Set(
		(
			await db
				.select({ key: downloadedLineups.lineupKey })
				.from(downloadedLineups)
				.where(eq(downloadedLineups.gameweekNumber, gw))
		).map((r) => r.key)
	);

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
				...duplicateInfo(s, byLineup.get(lineupKey(s.xiPlayerIds, s.benchPlayerIds))!),
				lineupKey: lineupKey(s.xiPlayerIds, s.benchPlayerIds),
				downloaded: downloaded.has(lineupKey(s.xiPlayerIds, s.benchPlayerIds)),
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

type SketchRow = typeof sketches.$inferSelect;

function duplicateInfo(s: SketchRow, group: SketchRow[]) {
	const keeper = group[group.length - 1];
	const ref = (d: SketchRow) => ({
		id: d.id,
		name: d.name,
		updatedAt: d.updatedAt,
		benchOrderDiffers: d.benchPlayerIds.join(',') !== keeper.benchPlayerIds.join(',')
	});
	return {
		/** Older identical sketch this one repeats (null = it's the one shown). */
		duplicateOf: keeper.id === s.id ? null : ref(keeper),
		/** Newer identical sketches folded into this one. */
		duplicates: keeper.id === s.id ? group.slice(0, -1).map(ref) : []
	};
}

export const actions: Actions = {
	/** Remember these lineups (by content, see `lineupKey`) as downloaded for the matchday. */
	markDownloaded: async ({ request }) => {
		const form = await request.formData();
		const gw = Number(form.get('gameweekNumber'));
		const keys = [...new Set(form.getAll('lineupKey').map(String).filter(Boolean))];
		if (!Number.isFinite(gw) || !keys.length) return fail(400, { message: 'חסרים נתונים' });
		await db
			.insert(downloadedLineups)
			.values(keys.map((lineupKey) => ({ gameweekNumber: gw, lineupKey })))
			.onConflictDoUpdate({
				target: [downloadedLineups.gameweekNumber, downloadedLineups.lineupKey],
				set: { downloadedAt: sql`now()` }
			});
		return { success: true };
	},
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
	/** Delete several sketches at once (the older copies of an identical lineup). */
	deleteMany: async ({ request }) => {
		const form = await request.formData();
		const ids = String(form.get('ids') ?? '')
			.split(',')
			.map((v) => Number(v.trim()))
			.filter((n) => Number.isFinite(n) && n > 0);
		if (ids.length === 0) return fail(400, { message: 'אין מה למחוק' });
		await db.delete(sketches).where(inArray(sketches.id, ids));
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
