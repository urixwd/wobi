import { fail, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	finalSquads,
	players,
	sketches,
	teams,
	watchlistPermanent,
	watchlistRound
} from '$lib/server/db/schema';
import {
	attachUpcoming,
	getUpcomingFixturesByTeamIds,
	resolveCurrentGwNumber
} from '$lib/server/upcomingFixtures';
import { buildTransfers } from '$lib/server/matchdayTransfers';
import {
	buildTransferInputs,
	detectReleased,
	getBaseSquad,
	getMustIn,
	setMustIn
} from '$lib/server/strategyTracking';
import type { Actions, PageServerLoad } from './$types';

function parseIdList(raw: string | null): number[] {
	if (!raw) return [];
	return raw
		.split(',')
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isFinite(n) && n > 0);
}

export const load: PageServerLoad = async ({ url }) => {
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
	const savedThis = (
		await db.select().from(finalSquads).where(eq(finalSquads.gameweekNumber, currentGw)).limit(1)
	)[0];
	const savedThisIds = savedThis ? [...savedThis.xiPlayerIds, ...savedThis.benchPlayerIds] : [];
	// Auto-marked releases: what you dropped vs. the previous matchday (once saved).
	const autoReleased = savedThis && fromGw != null ? detectReleased(baseIds, savedThisIds) : [];

	const outParam = url.searchParams.get('out');
	const forcedOut = (outParam != null ? parseIdList(outParam) : autoReleased).filter((id) =>
		baseIds.includes(id)
	);

	const { base, wishlist } = await buildTransferInputs(currentGw, baseIds);

	// Players that MUST come in — chosen from the wishlist (excluding ones already owned).
	const baseIdSet = new Set(baseIds);
	const inboundForPicker = wishlist
		.filter((p) => !baseIdSet.has(p.id))
		.sort((a, b) => a.position - b.position || b.points - a.points);
	const inboundIds = new Set(inboundForPicker.map((p) => p.id));
	// Must-come-in is persisted per matchday (so the recorded what-if respects it).
	const forcedIn = (await getMustIn(currentGw)).filter((id) => inboundIds.has(id));

	// Marked outs are mandatory; marked ins are mandatory; still consider up to 3 total.
	const transfers = buildTransfers(base, wishlist, new Set(forcedOut), new Set(forcedIn), 3);

	const squadForPicker = [...base].sort((a, b) => a.position - b.position || b.points - a.points);

	return {
		currentGw,
		baseFromGw: fromGw,
		autoReleased,
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
