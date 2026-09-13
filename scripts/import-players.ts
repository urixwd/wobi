/**
 * Import a Sport5 Dream Team players dump into Postgres.
 *
 * Usage:
 *   bun run db:import-players -- --gw=5 /path/to/players-gw5.json
 *   bun run db:import-players -- --gw=4 ./incoming/players.json
 *
 * - Upserts live `players` + `teams` (latest view)
 * - Writes `player_snapshots` for that gameweek (source of truth per round)
 * - Appends `player_round_stats` for momentum
 *
 * The repo does NOT keep players.json — bring a new file each round and import with --gw=N.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client';
import { playerRoundStats, playerSnapshots, players, teams } from '../src/lib/server/db/schema';
import { difficultyForTeamName } from '../src/lib/difficulty';

type RawPlayer = {
	id: number;
	teamId: number;
	name: string;
	price: number;
	shirtNumber?: number | null;
	teamShirtPath?: string | null;
	teamLogoPath?: string | null;
	position: number;
	imagePath?: string | null;
	injuredStatus?: boolean | number | null;
	expelledStatus?: boolean | number | null;
	missingStatus?: boolean | number | null;
	lastRoundPlayerStats?: unknown;
	lastSeasonPlayerStats?: unknown;
};

type RawTeam = {
	id: number;
	name: string;
	teamLogoPath?: string | null;
	teamShirtPath?: string | null;
	teamPageLink?: string | null;
	players: RawPlayer[];
};

type PlayersFile = {
	result?: unknown;
	error?: unknown;
	data: RawTeam[];
};

function toMillions(price: unknown): number {
	const n = Number(price) || 0;
	return n >= 1000 ? Math.round(n / 1_000_000) : n;
}

function asMissing(v: unknown): number {
	const n = Number(v);
	if (n === 1 || n === 2) return n;
	return 0;
}

function asBool(v: unknown): boolean {
	if (typeof v === 'boolean') return v;
	if (typeof v === 'number') return v !== 0;
	if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
	return false;
}

function parseArgs(argv: string[]) {
	let gw: number | null = null;
	let file: string | null = null;
	for (const a of argv) {
		if (a.startsWith('--gw=')) gw = Number(a.slice(5));
		else if (a === '--gw') continue;
		else if (!a.startsWith('-')) file = a;
	}
	// support `--gw 5`
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--gw' && argv[i + 1]) gw = Number(argv[i + 1]);
	}
	return { gw, file };
}

async function main() {
	const { gw, file } = parseArgs(process.argv.slice(2));
	if (!gw || !Number.isFinite(gw) || gw < 1) {
		throw new Error('Required: --gw=N (e.g. --gw=5). Example: bun run db:import-players -- --gw=5 ./players-gw5.json');
	}
	if (!file) {
		throw new Error('Required: path to Sport5 dump JSON. Example: bun run db:import-players -- --gw=5 ./players-gw5.json');
	}

	const path = resolve(process.cwd(), file);
	const raw = JSON.parse(readFileSync(path, 'utf8')) as PlayersFile;
	if (!raw?.data?.length) throw new Error(`${file} missing data[]`);

	const { db, client } = createDb();
	let teamCount = 0;
	let playerCount = 0;

	try {
		for (const t of raw.data) {
			const difficulty = difficultyForTeamName(t.name);
			await db
				.insert(teams)
				.values({
					id: t.id,
					name: t.name,
					logoPath: t.teamLogoPath ?? null,
					shirtPath: t.teamShirtPath ?? null,
					pageLink: t.teamPageLink ?? null,
					difficulty
				})
				.onConflictDoUpdate({
					target: teams.id,
					set: {
						name: t.name,
						logoPath: t.teamLogoPath ?? null,
						shirtPath: t.teamShirtPath ?? null,
						pageLink: t.teamPageLink ?? null,
						difficulty
					}
				});
			teamCount++;

			for (const p of t.players ?? []) {
				if (asMissing(p.missingStatus) === 2) continue;
				const teamId = p.teamId ?? t.id;
				const row = {
					id: p.id,
					teamId,
					name: p.name,
					price: toMillions(p.price),
					shirtNumber: p.shirtNumber ?? null,
					position: p.position,
					imagePath: p.imagePath ?? null,
					teamShirtPath: p.teamShirtPath ?? null,
					teamLogoPath: p.teamLogoPath ?? null,
					injuredStatus: asBool(p.injuredStatus),
					expelledStatus: asBool(p.expelledStatus),
					missingStatus: asMissing(p.missingStatus),
					lastRoundPlayerStats: p.lastRoundPlayerStats ?? null,
					lastSeasonPlayerStats: p.lastSeasonPlayerStats ?? null,
					updatedAt: new Date(),
					asOfGameweek: gw
				};

				await db
					.insert(players)
					.values(row)
					.onConflictDoUpdate({
						target: players.id,
						set: {
							teamId: row.teamId,
							name: row.name,
							price: row.price,
							shirtNumber: row.shirtNumber,
							position: row.position,
							imagePath: row.imagePath,
							teamShirtPath: row.teamShirtPath,
							teamLogoPath: row.teamLogoPath,
							injuredStatus: row.injuredStatus,
							expelledStatus: row.expelledStatus,
							missingStatus: row.missingStatus,
							lastRoundPlayerStats: row.lastRoundPlayerStats,
							lastSeasonPlayerStats: row.lastSeasonPlayerStats,
							updatedAt: row.updatedAt,
							asOfGameweek: gw
						}
					});

				await db
					.insert(playerSnapshots)
					.values({
						gameweekNumber: gw,
						playerId: p.id,
						teamId,
						name: row.name,
						price: row.price,
						shirtNumber: row.shirtNumber,
						position: row.position,
						imagePath: row.imagePath,
						teamShirtPath: row.teamShirtPath,
						teamLogoPath: row.teamLogoPath,
						injuredStatus: row.injuredStatus,
						expelledStatus: row.expelledStatus,
						missingStatus: row.missingStatus,
						lastRoundPlayerStats: row.lastRoundPlayerStats,
						lastSeasonPlayerStats: row.lastSeasonPlayerStats,
						capturedAt: new Date()
					})
					.onConflictDoUpdate({
						target: [playerSnapshots.gameweekNumber, playerSnapshots.playerId],
						set: {
							teamId,
							name: row.name,
							price: row.price,
							shirtNumber: row.shirtNumber,
							position: row.position,
							imagePath: row.imagePath,
							teamShirtPath: row.teamShirtPath,
							teamLogoPath: row.teamLogoPath,
							injuredStatus: row.injuredStatus,
							expelledStatus: row.expelledStatus,
							missingStatus: row.missingStatus,
							lastRoundPlayerStats: row.lastRoundPlayerStats,
							lastSeasonPlayerStats: row.lastSeasonPlayerStats,
							capturedAt: new Date()
						}
					});

				const lr = p.lastRoundPlayerStats as
					| {
							roundId?: number;
							points?: number;
							seasonPoints?: number;
							statsData?: unknown;
					  }
					| null
					| undefined;
				if (lr && Number.isFinite(Number(lr.roundId))) {
					const sport5RoundId = Number(lr.roundId);
					const points = Number(lr.points ?? 0) || 0;
					const seasonPts = Number.isFinite(Number(lr.seasonPoints))
						? Number(lr.seasonPoints)
						: null;
					let statsData: unknown = lr.statsData ?? null;
					if (typeof statsData === 'string') {
						try {
							statsData = JSON.parse(statsData);
						} catch {
							/* keep */
						}
					}
					await db
						.insert(playerRoundStats)
						.values({
							playerId: p.id,
							sport5RoundId,
							gameweekNumber: gw,
							points,
							seasonPoints: seasonPts,
							statsData,
							capturedAt: new Date()
						})
						.onConflictDoUpdate({
							target: [playerRoundStats.playerId, playerRoundStats.sport5RoundId],
							set: {
								gameweekNumber: gw,
								points,
								seasonPoints: seasonPts,
								statsData,
								capturedAt: new Date()
							}
						});
				}

				playerCount++;
			}
		}

		const [{ count: snapCount }] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(playerSnapshots)
			.where(eq(playerSnapshots.gameweekNumber, gw));

		console.log(`Imported GW ${gw} from ${path}`);
		console.log(`Upserted ${teamCount} teams, ${playerCount} live players`);
		console.log(`Snapshots for GW ${gw}: ${snapCount}`);
	} finally {
		await client.end({ timeout: 5 });
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
