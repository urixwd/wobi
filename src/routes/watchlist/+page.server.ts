import { fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mySquad, players, teams, watchlistPermanent, watchlistRound } from '$lib/server/db/schema';
import {
	attachUpcoming,
	getUpcomingFixturesByTeamIds,
	resolveCurrentGwNumber,
	type UpcomingFixture
} from '$lib/server/upcomingFixtures';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const currentGw = await resolveCurrentGwNumber(4);

	// The whole pool (~430 rows) — the watchlist table and the search both read from it,
	// so search can find anyone and membership badges are computed client-side.
	// Inactive players (missing_status=2, previous season) are excluded unless watched.
	const [allRaw, permanentRows, roundRows, squadRows] = await Promise.all([
		db
			.select({
				player: players,
				teamName: teams.name,
				teamLogo: teams.logoPath
			})
			.from(players)
			.leftJoin(teams, eq(players.teamId, teams.id))
			.orderBy(asc(players.name)),
		db
			.select({ id: watchlistPermanent.id, playerId: watchlistPermanent.playerId })
			.from(watchlistPermanent),
		// Round list for THIS matchday only (rows from older matchdays are ignored).
		db
			.select({ id: watchlistRound.id, playerId: watchlistRound.playerId })
			.from(watchlistRound)
			.where(eq(watchlistRound.gameweekNumber, currentGw)),
		db.select().from(mySquad).limit(1)
	]);

	const watched = new Set([
		...permanentRows.map((r) => r.playerId),
		...roundRows.map((r) => r.playerId)
	]);
	const poolRaw = allRaw.filter((r) => r.player.missingStatus !== 2 || watched.has(r.player.id));

	// Unwatched players only feed the search dropdown: keep their payload slim (no per-stat
	// breakdown, no fixtures). They get the full row after being added (load re-runs).
	const watchedRaw = poolRaw.filter((r) => watched.has(r.player.id));
	const upcomingByTeam = await getUpcomingFixturesByTeamIds(
		watchedRaw.map((r) => r.player.teamId),
		currentGw,
		5
	);
	const withUpcoming = new Map(
		attachUpcoming(watchedRaw, upcomingByTeam).map((r) => [r.player.id, r])
	);
	const pool = poolRaw.map(
		(r) =>
			withUpcoming.get(r.player.id) ?? {
				...r,
				player: {
					...r.player,
					lastRoundPlayerStats: slimStats(r.player.lastRoundPlayerStats),
					lastSeasonPlayerStats: slimStats(r.player.lastSeasonPlayerStats)
				},
				upcomingFixtures: [] as UpcomingFixture[]
			}
	);

	const squad = squadRows[0];
	return {
		currentGw,
		players: pool,
		permanent: permanentRows,
		round: roundRows,
		squad: {
			xi: squad?.xiPlayerIds ?? [],
			bench: squad?.benchPlayerIds ?? []
		}
	};
};

/** Keep only the point totals the search needs (drops the per-stat `statsData` breakdown). */
function slimStats(raw: unknown): unknown {
	if (!raw || typeof raw !== 'object') return raw ?? null;
	const { points, totalPoints, seasonPoints } = raw as Record<string, unknown>;
	return { points, totalPoints, seasonPoints };
}

/** Remove actions accept either the row `id` or a `playerId`. */
function readIds(form: FormData) {
	const id = Number(form.get('id'));
	const playerId = Number(form.get('playerId'));
	return {
		id: Number.isFinite(id) && id > 0 ? id : null,
		playerId: Number.isFinite(playerId) && playerId > 0 ? playerId : null
	};
}

export const actions: Actions = {
	addPermanent: async ({ request }) => {
		const form = await request.formData();
		const playerId = Number(form.get('playerId'));
		if (!playerId) return fail(400, { message: 'חסר שחקן' });
		await db.insert(watchlistPermanent).values({ playerId }).onConflictDoNothing();
		return { success: true };
	},
	removePermanent: async ({ request }) => {
		const { id, playerId } = readIds(await request.formData());
		if (id) await db.delete(watchlistPermanent).where(eq(watchlistPermanent.id, id));
		else if (playerId)
			await db.delete(watchlistPermanent).where(eq(watchlistPermanent.playerId, playerId));
		else return fail(400, { message: 'חסר שחקן' });
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
		const { id, playerId } = readIds(await request.formData());
		if (id) await db.delete(watchlistRound).where(eq(watchlistRound.id, id));
		else if (playerId) {
			// Only this matchday's entry — never touch a row that belongs to another round.
			const currentGw = await resolveCurrentGwNumber(4);
			await db
				.delete(watchlistRound)
				.where(and(eq(watchlistRound.playerId, playerId), eq(watchlistRound.gameweekNumber, currentGw)));
		} else return fail(400, { message: 'חסר שחקן' });
		return { success: true };
	}
};
