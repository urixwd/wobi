import { fail } from '@sveltejs/kit';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	finalSquads,
	fixtures,
	gameweeks,
	mySquad,
	players,
	teams,
	watchlistPermanent,
	watchlistRound,
	type FixtureDifficulty
} from '$lib/server/db/schema';
import {
	attachUpcoming,
	getUpcomingFixturesByTeamIds,
	MAX_GW,
	resolveCurrentGwNumber
} from '$lib/server/upcomingFixtures';
import type { Actions, PageServerLoad } from './$types';

const NAV_MIN_GW = 1;

function clampGw(n: number): number {
	if (!Number.isFinite(n)) return 4;
	return Math.min(MAX_GW, Math.max(NAV_MIN_GW, Math.round(n)));
}

export const load: PageServerLoad = async ({ url }) => {
	const currentNumber = await resolveCurrentGwNumber(4);
	const gwParam = url.searchParams.get('gw');
	const selectedGw = clampGw(gwParam != null && gwParam !== '' ? Number(gwParam) : currentNumber);

	const prevGw = selectedGw > NAV_MIN_GW ? selectedGw - 1 : null;
	const nextGw = selectedGw < MAX_GW ? selectedGw + 1 : null;

	let gwRow = (await db.select().from(gameweeks).where(eq(gameweeks.number, selectedGw)).limit(1))[0];

	if (!gwRow) {
		const [created] = await db
			.insert(gameweeks)
			.values({
				number: selectedGw,
				label: `מחזור ${selectedGw}`,
				isCurrent: selectedGw === currentNumber
			})
			.onConflictDoUpdate({
				target: gameweeks.number,
				set: { label: `מחזור ${selectedGw}` }
			})
			.returning();
		gwRow = created;
	}

	const rawFixtures = await db.select().from(fixtures).where(eq(fixtures.gameweekId, gwRow.id));
	const allTeams = await db.select().from(teams);
	const teamsById = new Map(allTeams.map((t) => [t.id, t]));

	const fixtureRows = rawFixtures
		.map((f) => {
			const home = teamsById.get(f.homeTeamId);
			const away = teamsById.get(f.awayTeamId);
			if (!home || !away) return null;
			return { fixture: f, home, away };
		})
		.filter(Boolean) as {
		fixture: (typeof rawFixtures)[number];
		home: (typeof allTeams)[number];
		away: (typeof allTeams)[number];
	}[];

	const opponentDifficultyByTeamId = new Map<number, FixtureDifficulty>();
	for (const row of fixtureRows) {
		opponentDifficultyByTeamId.set(row.home.id, row.away.difficulty);
		opponentDifficultyByTeamId.set(row.away.id, row.home.difficulty);
	}

	const squad = (await db.select().from(mySquad).limit(1))[0];
	const squadIds = squad ? [...squad.xiPlayerIds, ...squad.benchPlayerIds] : [];

	const finalRow = (
		await db.select().from(finalSquads).where(eq(finalSquads.gameweekNumber, selectedGw)).limit(1)
	)[0];
	const finalIds = finalRow ? [...finalRow.xiPlayerIds, ...finalRow.benchPlayerIds] : [];

	const perm = await db.select().from(watchlistPermanent);
	const round = await db.select().from(watchlistRound);
	const focusIds = [
		...new Set([
			...squadIds,
			...finalIds,
			...perm.map((p) => p.playerId),
			...round.map((p) => p.playerId)
		])
	];

	const focusPlayersRaw =
		focusIds.length > 0
			? await db
					.select({
						player: players,
						teamName: teams.name,
						teamLogo: teams.logoPath,
						teamDifficulty: teams.difficulty
					})
					.from(players)
					.leftJoin(teams, eq(players.teamId, teams.id))
					.where(inArray(players.id, focusIds))
					.orderBy(asc(players.position), asc(players.name))
			: [];

	const upcomingByTeam = await getUpcomingFixturesByTeamIds(
		focusPlayersRaw.map((r) => r.player.teamId),
		Math.max(selectedGw, 4),
		5
	);
	const focusPlayers = attachUpcoming(focusPlayersRaw, upcomingByTeam).map((r) => ({
		...r,
		opponentDifficulty: opponentDifficultyByTeamId.get(r.player.teamId) ?? null
	}));
	const byId = new Map(focusPlayers.map((r) => [r.player.id, r]));

	const mapPlayers = (ids: number[]) =>
		ids.flatMap((id) => {
			const row = byId.get(id);
			return row ? [row] : [];
		});

	return {
		selectedGw,
		prevGw,
		nextGw,
		currentNumber,
		fixtures: fixtureRows,
		focusPlayers,
		hasFixtures: fixtureRows.length > 0,
		currentSquad: squad
			? {
					xi: mapPlayers(squad.xiPlayerIds),
					bench: mapPlayers(squad.benchPlayerIds),
					xiIds: squad.xiPlayerIds,
					benchIds: squad.benchPlayerIds
				}
			: null,
		finalSquad: finalRow
			? {
					xi: mapPlayers(finalRow.xiPlayerIds),
					bench: mapPlayers(finalRow.benchPlayerIds),
					xiIds: finalRow.xiPlayerIds,
					benchIds: finalRow.benchPlayerIds,
					updatedAt: finalRow.updatedAt
				}
			: null
	};
};

export const actions: Actions = {
	/** Snapshot current my_squad as the final lineup for the selected gameweek. */
	saveFinal: async ({ request }) => {
		const form = await request.formData();
		const gw = Number(form.get('gameweekNumber'));
		if (!Number.isFinite(gw) || gw < 1) {
			return fail(400, { message: 'מחזור לא תקין' });
		}

		const squad = (await db.select().from(mySquad).limit(1))[0];
		if (!squad || squad.xiPlayerIds.length === 0) {
			return fail(400, { message: 'אין קבוצה שמורה להעתיק. שמור קודם ב־/squad' });
		}

		const existing = (
			await db.select().from(finalSquads).where(eq(finalSquads.gameweekNumber, gw)).limit(1)
		)[0];

		if (existing) {
			await db
				.update(finalSquads)
				.set({
					xiPlayerIds: squad.xiPlayerIds,
					benchPlayerIds: squad.benchPlayerIds,
					updatedAt: new Date()
				})
				.where(eq(finalSquads.id, existing.id));
		} else {
			await db.insert(finalSquads).values({
				gameweekNumber: gw,
				xiPlayerIds: squad.xiPlayerIds,
				benchPlayerIds: squad.benchPlayerIds
			});
		}

		return { success: true, savedGw: gw };
	}
};
