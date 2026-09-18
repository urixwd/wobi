import { fail } from '@sveltejs/kit';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { finalSquads, fixtures, gameweeks, mySquad, players, sketches, teams } from '$lib/server/db/schema';
import { recordWhatIf } from '$lib/server/strategyTracking';
import {
	attachUpcoming,
	getUpcomingFixturesByTeamIds,
	MAX_GW,
	MIN_GW,
	resolveCurrentGwNumber
} from '$lib/server/upcomingFixtures';
import type { Actions, PageServerLoad } from './$types';

async function getOrCreateSquad() {
	const existing = await db.select().from(mySquad).limit(1);
	if (existing[0]) return existing[0];
	const [created] = await db.insert(mySquad).values({}).returning();
	return created;
}

function parseIdList(raw: string | null): number[] {
	if (!raw) return [];
	return raw
		.split(',')
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isFinite(n) && n > 0);
}

export const load: PageServerLoad = async ({ url }) => {
	const squad = await getOrCreateSquad();
	const currentGw = await resolveCurrentGwNumber(4);
	const stagedXi = parseIdList(url.searchParams.get('xi'));
	const stagedBench = parseIdList(url.searchParams.get('bench'));
	const staged =
		url.searchParams.get('staged') === '1' && stagedXi.length + stagedBench.length > 0
			? { xi: stagedXi, bench: stagedBench }
			: null;
	const allPlayersRaw = await db
		.select({
			player: players,
			teamName: teams.name,
			teamLogo: teams.logoPath,
			difficulty: teams.difficulty
		})
		.from(players)
		.leftJoin(teams, eq(players.teamId, teams.id))
		.orderBy(asc(players.position), asc(players.name));

	const teamIds = allPlayersRaw.map((r) => r.player.teamId);
	const upcomingByTeam = await getUpcomingFixturesByTeamIds(teamIds, currentGw, 5);
	const allPlayers = attachUpcoming(allPlayersRaw, upcomingByTeam);

	const ids = [...squad.xiPlayerIds, ...squad.benchPlayerIds];
	const selected =
		ids.length > 0
			? attachUpcoming(
					await db
						.select({
							player: players,
							teamName: teams.name,
							teamLogo: teams.logoPath,
							difficulty: teams.difficulty
						})
						.from(players)
						.leftJoin(teams, eq(players.teamId, teams.id))
						.where(inArray(players.id, ids)),
					upcomingByTeam
				)
			: [];


	const allTeams = await db.select().from(teams);
	const teamsById = new Map(allTeams.map((tm) => [tm.id, tm]));
	const fixtureRows = await db
		.select({
			id: fixtures.id,
			homeTeamId: fixtures.homeTeamId,
			awayTeamId: fixtures.awayTeamId,
			kickoff: fixtures.kickoff,
			homeScore: fixtures.homeScore,
			awayScore: fixtures.awayScore,
			gwNumber: gameweeks.number
		})
		.from(fixtures)
		.innerJoin(gameweeks, eq(fixtures.gameweekId, gameweeks.id))
		.orderBy(asc(gameweeks.number), asc(fixtures.kickoff), asc(fixtures.id));

	const gwFixtures = fixtureRows.flatMap((f) => {
		const home = teamsById.get(f.homeTeamId);
		const away = teamsById.get(f.awayTeamId);
		if (!home || !away) return [];
		return [
			{
				id: f.id,
				gwNumber: f.gwNumber,
				kickoff: f.kickoff,
				homeScore: f.homeScore,
				awayScore: f.awayScore,
				home: {
					id: home.id,
					name: home.name,
					logoPath: home.logoPath,
					difficulty: home.difficulty
				},
				away: {
					id: away.id,
					name: away.name,
					logoPath: away.logoPath,
					difficulty: away.difficulty
				}
			}
		];
	});

	return {
		squad,
		allPlayers,
		selected,
		staged,
		currentGw,
		/** Schedule section can browse finished early rounds; player strip still uses MIN_GW. */
		minGw: 1,
		maxGw: MAX_GW,
		gwFixtures
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

		// Snapshot this matchday's team + record the what-if for strategy tracking (GW5 on).
		const currentGw = await resolveCurrentGwNumber(4);
		await db
			.insert(finalSquads)
			.values({ gameweekNumber: currentGw, xiPlayerIds: xi, benchPlayerIds: bench })
			.onConflictDoUpdate({
				target: finalSquads.gameweekNumber,
				set: { xiPlayerIds: xi, benchPlayerIds: bench, updatedAt: new Date() }
			});
		try {
			await recordWhatIf(currentGw);
		} catch (e) {
			console.error('recordWhatIf failed', e);
		}

		return { success: true };
	},
	saveSketch: async ({ request }) => {
		const form = await request.formData();
		const xi = String(form.get('xi') ?? '')
			.split(',')
			.map((s) => Number(s.trim()))
			.filter((n) => Number.isFinite(n) && n > 0);
		const bench = String(form.get('bench') ?? '')
			.split(',')
			.map((s) => Number(s.trim()))
			.filter((n) => Number.isFinite(n) && n > 0);
		const name = String(form.get('sketchName') ?? '').trim() || 'סקיצה';
		const gw = Number(form.get('gameweekNumber'));
		const gameweekNumber = Number.isFinite(gw) && gw > 0 ? Math.trunc(gw) : await resolveCurrentGwNumber(4);

		if (xi.length + bench.length === 0) {
			return fail(400, { message: 'אי אפשר לשמור סקיצה ריקה' });
		}
		if (new Set([...xi, ...bench]).size !== xi.length + bench.length) {
			return fail(400, { message: 'שחקן לא יכול להיות גם ב־XI וגם בספסל' });
		}

		await db.insert(sketches).values({
			name,
			gameweekNumber,
			xiPlayerIds: xi,
			benchPlayerIds: bench
		});

		return { success: true, sketchSaved: true, sketchGw: gameweekNumber };
	}
};

