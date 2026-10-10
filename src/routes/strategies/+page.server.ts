import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { gameweeks as gameweeksTable, sketches } from '$lib/server/db/schema';
import {
	getStandings,
	getMatchdayDetail,
	getRecordedGameweeks,
	toggleMustPick,
	type PlanKind
} from '$lib/server/strategyTracking';
import { resolveCurrentGwNumber } from '$lib/server/upcomingFixtures';
import { toggleBenchOnly } from '$lib/server/benchOnly';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	// Recorded matchdays + the open one (shown as a live preview until the team is saved).
	const current = (await db.select().from(gameweeksTable).where(eq(gameweeksTable.isCurrent, true)).limit(1))[0];
	const recorded = await getRecordedGameweeks();
	const gameweeks = [...new Set([...recorded, ...(current ? [current.number] : [])])].sort((a, b) => a - b);
	const requested = Number(url.searchParams.get('gw'));
	const selectedGw =
		Number.isFinite(requested) && gameweeks.includes(requested)
			? requested
			: (current?.number ?? gameweeks.at(-1) ?? null);

	return {
		standings: await getStandings(),
		gameweeksAvailable: gameweeks,
		selectedGw,
		detail: selectedGw != null ? await getMatchdayDetail(selectedGw) : null
	};
};

/** Planner toggles, open matchday only (past matchdays are a frozen log). */
async function toggle(kind: PlanKind, request: Request) {
	const playerId = Number((await request.formData()).get('playerId'));
	if (!playerId) return fail(400, { message: 'חסר שחקן' });
	const err = await toggleMustPick(kind, await resolveCurrentGwNumber(4), playerId);
	if (err) return fail(400, { message: err });
	return { success: true };
}

function parseIdList(raw: FormDataEntryValue | null): number[] {
	return String(raw ?? '')
		.split(',')
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isFinite(n) && n > 0);
}

export const actions: Actions = {
	toggleMustIn: ({ request }) => toggle('in', request),
	toggleMustOut: ({ request }) => toggle('out', request),
	togglePreferKeep: ({ request }) => toggle('keep', request),
	/** «ספסל בלבד» is per player (not per matchday). */
	toggleBenchOnly: async ({ request }) => {
		const playerId = Number((await request.formData()).get('playerId'));
		if (!playerId) return fail(400, { message: 'חסר שחקן' });
		await toggleBenchOnly(playerId);
		return { success: true };
	},
	/** Save a strategy's lineup as a sketch (same as /watchlist, /squad). */
	saveSketch: async ({ request }) => {
		const form = await request.formData();
		const xi = parseIdList(form.get('xi'));
		const bench = parseIdList(form.get('bench'));
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
	/** Stage a pick on /squad (same as /options) — my_squad only changes on «שמור קבוצה». */
	apply: async ({ request }) => {
		const form = await request.formData();
		const ids = (k: string) =>
			String(form.get(k) ?? '')
				.split(',')
				.map((s) => Number(s.trim()))
				.filter((n) => Number.isFinite(n) && n > 0);
		const xi = ids('xi');
		const bench = ids('bench');
		if (xi.length !== 11 || bench.length !== 4) return fail(400, { message: 'הרכב לא מלא (צריך 11+4)' });
		const qs = new URLSearchParams({ staged: '1', xi: xi.join(','), bench: bench.join(',') });
		redirect(303, `/squad?${qs.toString()}`);
	}
};
