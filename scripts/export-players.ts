/**
 * Rebuild a Sport5-shaped players dump FROM the DB for a given gameweek.
 *
 * Usage:
 *   bun run db:export-players -- --gw=4
 *   bun run db:export-players -- --gw=4 ./exports/players-gw4.json
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client';
import { playerSnapshots, teams } from '../src/lib/server/db/schema';

function parseArgs(argv: string[]) {
	let gw: number | null = null;
	let out: string | null = null;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--gw=')) gw = Number(a.slice(5));
		else if (a === '--gw') gw = Number(argv[++i]);
		else if (!a.startsWith('-')) out = a;
	}
	return { gw, out };
}

async function main() {
	const { gw, out } = parseArgs(process.argv.slice(2));
	if (!gw || !Number.isFinite(gw)) {
		throw new Error('Required: --gw=N');
	}

	const { db, client } = createDb();
	try {
		const allTeams = await db.select().from(teams).orderBy(asc(teams.id));
		const snaps = await db
			.select()
			.from(playerSnapshots)
			.where(eq(playerSnapshots.gameweekNumber, gw))
			.orderBy(asc(playerSnapshots.playerId));

		if (!snaps.length) {
			throw new Error(`No player_snapshots for GW ${gw}. Import a dump first.`);
		}

		const byTeam = new Map<number, typeof snaps>();
		for (const s of snaps) {
			const list = byTeam.get(s.teamId) ?? [];
			list.push(s);
			byTeam.set(s.teamId, list);
		}

		const data = allTeams
			.filter((t) => byTeam.has(t.id))
			.map((t) => ({
				id: t.id,
				name: t.name,
				teamLogoPath: t.logoPath,
				teamShirtPath: t.shirtPath,
				teamPageLink: t.pageLink,
				players: (byTeam.get(t.id) ?? []).map((s) => ({
					id: s.playerId,
					teamId: s.teamId,
					name: s.name,
					// export millions as Sport5-like raw (*1e6) for round-trip friendliness
					price: Math.round(Number(s.price) * 1_000_000),
					shirtNumber: s.shirtNumber,
					position: s.position,
					imagePath: s.imagePath,
					teamShirtPath: s.teamShirtPath,
					teamLogoPath: s.teamLogoPath,
					injuredStatus: s.injuredStatus,
					expelledStatus: s.expelledStatus,
					missingStatus: s.missingStatus,
					lastRoundPlayerStats: s.lastRoundPlayerStats,
					lastSeasonPlayerStats: s.lastSeasonPlayerStats
				}))
			}));

		const payload = {
			result: 'ok',
			exportedFrom: 'WOBI player_snapshots',
			gameweekNumber: gw,
			exportedAt: new Date().toISOString(),
			data
		};
		const json = JSON.stringify(payload, null, 2);
		if (out) {
			const path = resolve(process.cwd(), out);
			writeFileSync(path, json, 'utf8');
			console.log(`Wrote GW ${gw} → ${path} (${snaps.length} players)`);
		} else {
			process.stdout.write(json + '\n');
		}
	} finally {
		await client.end({ timeout: 5 });
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
