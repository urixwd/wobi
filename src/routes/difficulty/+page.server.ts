import { fail } from '@sveltejs/kit';
import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { teams } from '$lib/server/db/schema';
import {
	ensureDifficultyForGw,
	getDifficultyRatings,
	getRatedGameweeks,
	isDifficulty,
	isDifficultyField,
	setDifficulty
} from '$lib/server/teamDifficulty';
import { resolveCurrentGwNumber } from '$lib/server/upcomingFixtures';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	// The open matchday always has its own rows (carried forward on first visit).
	const currentGw = await resolveCurrentGwNumber(4);
	await ensureDifficultyForGw(currentGw);

	const gameweeks = [...new Set([...(await getRatedGameweeks()), currentGw])].sort((a, b) => a - b);
	const requested = Number(url.searchParams.get('gw'));
	const selectedGw = Number.isFinite(requested) && gameweeks.includes(requested) ? requested : currentGw;

	const ratings = await getDifficultyRatings(selectedGw);
	const allTeams = await db.select().from(teams).orderBy(asc(teams.name));
	return {
		currentGw,
		selectedGw,
		gameweeksAvailable: gameweeks,
		editable: selectedGw === currentGw,
		rows: allTeams.map((t) => ({
			id: t.id,
			name: t.name,
			logoPath: t.logoPath,
			...(ratings.get(t.id) ?? { overall: t.difficulty, vsDef: t.difficulty, vsAtt: t.difficulty })
		}))
	};
};

export const actions: Actions = {
	/** One cell, open matchday only (past matchdays are a read-only log). */
	set: async ({ request }) => {
		const form = await request.formData();
		const teamId = Number(form.get('teamId'));
		const field = form.get('field');
		const value = form.get('value');
		if (!Number.isInteger(teamId) || teamId <= 0) return fail(400, { message: 'חסרה קבוצה' });
		if (!isDifficultyField(field) || !isDifficulty(value)) return fail(400, { message: 'ערך לא חוקי' });
		await setDifficulty(await resolveCurrentGwNumber(4), teamId, field, value);
		return { success: true };
	}
};
