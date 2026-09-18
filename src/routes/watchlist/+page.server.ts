import { fail, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { players, sketches, teams, watchlistPermanent, watchlistRound } from '$lib/server/db/schema';
import {
	attachUpcoming,
	getUpcomingFixturesByTeamIds,
	resolveCurrentGwNumber
} from '$lib/server/upcomingFixtures';
import { buildTransfers, OBJECTIVES, type TransferResult } from '$lib/server/matchdayTransfers';
import {
	buildTransferInputs,
	getBaseSquad,
	getMustIn,
	getMustOut,
	MODES,
	setMustIn,
	setMustOut
} from '$lib/server/strategyTracking';
import type { Actions, PageServerLoad } from './$types';

function parseIdList(raw: string | null): number[] {
	if (!raw) return [];
	return raw
		.split(',')
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isFinite(n) && n > 0);
}

export const load: PageServerLoad = async () => {
	const currentGw = await resolveCurrentGwNumber(4);

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

	// Round watchlist for THIS matchday only.
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
		.where(eq(watchlistRound.gameweekNumber, currentGw))
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

	const upcomingByTeam = await getUpcomingFixturesByTeamIds(
		[
			...permanentRaw.map((r) => r.player.teamId),
			...roundRaw.map((r) => r.player.teamId),
			...allPlayersRaw.map((r) => r.player.teamId)
		],
		currentGw,
		5
	);

	// Transfer base = previous matchday's team (else the live squad).
	const { ids: baseIds, fromGw } = await getBaseSquad(currentGw);
	const { base, wishlist } = await buildTransferInputs(currentGw, baseIds);

	// Both pickers are persisted per matchday (sticky across reloads).
	const baseIdSet = new Set(baseIds);
	const forcedOut = (await getMustOut(currentGw)).filter((id) => baseIdSet.has(id));

	// Players that MUST come in — chosen from the wishlist (excluding ones already owned).
	const inboundForPicker = wishlist
		.filter((p) => !baseIdSet.has(p.id))
		.sort((a, b) => a.position - b.position || b.points - a.points);
	const inboundIds = new Set(inboundForPicker.map((p) => p.id));
	const forcedIn = (await getMustIn(currentGw)).filter((id) => inboundIds.has(id));

	// Each objective under three constraint modes: constrained (out+in), out-only, free.
	const modeResults: Record<string, TransferResult> = {
		constrained: buildTransfers(base, wishlist, new Set(forcedOut), new Set(forcedIn), 3),
		out: buildTransfers(base, wishlist, new Set(forcedOut), new Set(), 3),
		free: buildTransfers(base, wishlist, new Set(), new Set(), 3)
	};
	const byObjective = OBJECTIVES.map((o) => ({
		key: o.key,
		title: o.title,
		variants: MODES.map((m) => ({
			mode: m.key,
			modeLabel: m.short,
			combo: modeResults[m.key].best.find((b) => b.key === o.key)?.combo ?? null
		}))
	}));
	const transfers = {
		hasSquad: modeResults.free.hasSquad,
		feasible: MODES.some((m) => modeResults[m.key].feasible),
		notes: modeResults.free.feasible ? [] : modeResults.free.notes,
		capped: MODES.some((m) => modeResults[m.key].capped),
		byObjective
	};

	const squadForPicker = [...base].sort((a, b) => a.position - b.position || b.points - a.points);

	return {
		currentGw,
		baseFromGw: fromGw,
		permanent: attachUpcoming(permanentRaw, upcomingByTeam),
		round: attachUpcoming(roundRaw, upcomingByTeam),
		allPlayers: attachUpcoming(allPlayersRaw, upcomingByTeam),
		squadForPicker,
		inboundForPicker,
		forcedOut,
		forcedIn,
		transfers
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
		const currentGw = await resolveCurrentGwNumber(4);
		await db
			.insert(watchlistRound)
			.values({ playerId, gameweekNumber: currentGw })
			.onConflictDoUpdate({
				target: watchlistRound.playerId,
				set: { gameweekNumber: currentGw }
			});
		return { success: true };
	},
	removeRound: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400);
		await db.delete(watchlistRound).where(eq(watchlistRound.id, id));
		return { success: true };
	},
	/** Toggle a wishlist player as a mandatory incomer for the current matchday (max 3). */
	toggleMustIn: async ({ request }) => {
		const form = await request.formData();
		const playerId = Number(form.get('playerId'));
		if (!playerId) return fail(400, { message: 'חסר שחקן' });
		const currentGw = await resolveCurrentGwNumber(4);
		const cur = new Set(await getMustIn(currentGw));
		if (cur.has(playerId)) cur.delete(playerId);
		else {
			if (cur.size >= 3) return fail(400, { message: 'עד 3 שחייבים להיכנס' });
			cur.add(playerId);
		}
		await setMustIn(currentGw, [...cur]);
		return { success: true };
	},
	clearMustIn: async () => {
		const currentGw = await resolveCurrentGwNumber(4);
		await setMustIn(currentGw, []);
		return { success: true };
	},
	/** Toggle a squad player as a mandatory release for the current matchday (max 3). */
	toggleMustOut: async ({ request }) => {
		const form = await request.formData();
		const playerId = Number(form.get('playerId'));
		if (!playerId) return fail(400, { message: 'חסר שחקן' });
		const currentGw = await resolveCurrentGwNumber(4);
		const cur = new Set(await getMustOut(currentGw));
		if (cur.has(playerId)) cur.delete(playerId);
		else {
			if (cur.size >= 3) return fail(400, { message: 'עד 3 לשחרר' });
			cur.add(playerId);
		}
		await setMustOut(currentGw, [...cur]);
		return { success: true };
	},
	clearMustOut: async () => {
		const currentGw = await resolveCurrentGwNumber(4);
		await setMustOut(currentGw, []);
		return { success: true };
	},
	/** Save a suggested combo as a sketch (same as /squad). */
	saveSketch: async ({ request }) => {
		const form = await request.formData();
		const xi = parseIdList(String(form.get('xi') ?? ''));
		const bench = parseIdList(String(form.get('bench') ?? ''));
		const name = String(form.get('sketchName') ?? '').trim() || 'סקיצה';
		const gw = Number(form.get('gameweekNumber'));
		const gameweekNumber =
			Number.isFinite(gw) && gw > 0 ? Math.trunc(gw) : await resolveCurrentGwNumber(4);

		if (xi.length + bench.length === 0) return fail(400, { message: 'אי אפשר לשמור סקיצה ריקה' });
		if (new Set([...xi, ...bench]).size !== xi.length + bench.length) {
			return fail(400, { message: 'שחקן לא יכול להיות גם ב־XI וגם בספסל' });
		}

		await db.insert(sketches).values({ name, gameweekNumber, xiPlayerIds: xi, benchPlayerIds: bench });
		return { success: true, sketchSaved: true, sketchGw: gameweekNumber };
	},
	/** Stage a suggested combo on /squad (same as /sketches, /options). */
	apply: async ({ request }) => {
		const form = await request.formData();
		const xi = parseIdList(String(form.get('xi') ?? ''));
		const bench = parseIdList(String(form.get('bench') ?? ''));
		if (xi.length + bench.length === 0) return fail(400, { message: 'הרכב ריק' });
		const qs = new URLSearchParams({ staged: '1', xi: xi.join(','), bench: bench.join(',') });
		throw redirect(303, `/squad?${qs.toString()}`);
	}
};
