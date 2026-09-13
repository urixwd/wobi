import { fail, redirect } from '@sveltejs/kit';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mySquad, players, teams } from '$lib/server/db/schema';
import {
	getUpcomingFixturesByTeamIds,
	resolveCurrentGwNumber
} from '$lib/server/upcomingFixtures';
import { generateSquadOptions, toOptionPlayer, type SquadOption } from '$lib/server/squadOptions';
import type { Actions, PageServerLoad } from './$types';

export type TransferPlayer = { id: number; name: string; position: number };

export type SquadOptionWithTransfers = SquadOption & {
	out: TransferPlayer[];
	in: TransferPlayer[];
};

function transferDiff(
	savedIds: number[],
	optionIds: number[],
	nameById: Map<number, { name: string; position: number }>
): { out: TransferPlayer[]; in: TransferPlayer[] } {
	const saved = new Set(savedIds);
	const next = new Set(optionIds);
	const out: TransferPlayer[] = [];
	const inn: TransferPlayer[] = [];
	for (const id of savedIds) {
		if (!next.has(id)) {
			const meta = nameById.get(id);
			out.push({ id, name: meta?.name ?? `#${id}`, position: meta?.position ?? 0 });
		}
	}
	for (const id of optionIds) {
		if (!saved.has(id)) {
			const meta = nameById.get(id);
			inn.push({ id, name: meta?.name ?? `#${id}`, position: meta?.position ?? 0 });
		}
	}
	out.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'he'));
	inn.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'he'));
	return { out, in: inn };
}

export const load: PageServerLoad = async () => {
	const rows = await db
		.select({
			player: players,
			teamName: teams.name,
			teamLogo: teams.logoPath
		})
		.from(players)
		.leftJoin(teams, eq(players.teamId, teams.id))
		.where(inArray(players.missingStatus, [0, 1]))
		.orderBy(asc(players.position), asc(players.name));

	const fromGw = await resolveCurrentGwNumber(4);
	const upcoming = await getUpcomingFixturesByTeamIds(
		rows.map((r) => r.player.teamId),
		fromGw,
		5
	);

	const pool = rows.map((r) =>
		toOptionPlayer({
			id: r.player.id,
			name: r.player.name,
			teamId: r.player.teamId,
			teamName: r.teamName,
			position: r.player.position,
			price: r.player.price,
			logo: r.teamLogo ?? r.player.teamLogoPath,
			upcomingFixtures: upcoming.get(r.player.teamId) ?? [],
			lastRoundPlayerStats: r.player.lastRoundPlayerStats,
			lastSeasonPlayerStats: r.player.lastSeasonPlayerStats
		})
	);

	const nameById = new Map(
		pool.map((p) => [p.id, { name: p.name, position: p.position }] as const)
	);

	const squad = (await db.select().from(mySquad).limit(1))[0];
	const savedIds = squad ? [...squad.xiPlayerIds, ...squad.benchPlayerIds] : [];

	// names for saved players not in pool edge-case
	if (savedIds.length) {
		const missing = savedIds.filter((id) => !nameById.has(id));
		if (missing.length) {
			const extra = await db
				.select({ id: players.id, name: players.name, position: players.position })
				.from(players)
				.where(inArray(players.id, missing));
			for (const p of extra) nameById.set(p.id, { name: p.name, position: p.position });
		}
	}

	const baseXi = squad?.xiPlayerIds ?? [];
	const baseBench = squad?.benchPlayerIds ?? [];
	const maxTransfers = Math.min(3, squad?.freeTransfers ?? 3);

	const rawOptions = generateSquadOptions(pool, baseXi, baseBench, maxTransfers);
	const options: SquadOptionWithTransfers[] = rawOptions.map((opt) => {
		const optionIds = [...opt.xi, ...opt.bench].map((p) => p.id);
		const { out, in: inn } = transferDiff(savedIds, optionIds, nameById);
		return { ...opt, out, in: inn };
	});

	return {
		options,
		savedCount: savedIds.length,
		maxTransfers
	};
};

export const actions: Actions = {
	/** Stage option on /squad — does NOT write my_squad until user clicks שמור קבוצה. */
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

		if (xi.length !== 11 || bench.length !== 4) {
			return fail(400, { message: 'הרכב לא מלא (צריך 11+4)' });
		}

		const qs = new URLSearchParams({
			staged: '1',
			xi: xi.join(','),
			bench: bench.join(',')
		});
		throw redirect(303, `/squad?${qs.toString()}`);
	}
};
