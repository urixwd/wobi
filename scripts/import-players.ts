/**
 * Upsert teams + players from ./players.json (Sport5 Dream Team dump).
 * Usage: bun run db:import-players
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client';
import { gameweeks, playerRoundStats, players, teams } from '../src/lib/server/db/schema';
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

/** Sport5 prices are raw (e.g. 9000000); we store millions 1–15. */
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

async function main() {
	const path = resolve(process.cwd(), 'players.json');
	const raw = JSON.parse(readFileSync(path, 'utf8')) as PlayersFile;
	if (!raw?.data?.length) throw new Error('players.json missing data[]');

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
				// 2 = leftover / not in live game pool
				if (asMissing(p.missingStatus) === 2) continue;
				await db
					.insert(players)
					.values({
						id: p.id,
						teamId: p.teamId ?? t.id,
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
						updatedAt: new Date()
					})
					.onConflictDoUpdate({
						target: players.id,
						set: {
							teamId: p.teamId ?? t.id,
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
							updatedAt: new Date()
						}
					});

				// Accumulate round history for momentum (from GW 7 UI)
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
							/* keep string */
						}
					}
					await db
						.insert(playerRoundStats)
						.values({
							playerId: p.id,
							sport5RoundId,
							gameweekNumber: null, // filled below from current GW when possible
							points,
							seasonPoints: seasonPts,
							statsData,
							capturedAt: new Date()
						})
						.onConflictDoUpdate({
							target: [playerRoundStats.playerId, playerRoundStats.sport5RoundId],
							set: {
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

		// Tag latest snapshots missing gameweek with current GW number (best-effort)
		const currentGw = (
			await db.select().from(gameweeks).where(eq(gameweeks.isCurrent, true)).limit(1)
		)[0];
		if (currentGw) {
			await db
				.update(playerRoundStats)
				.set({ gameweekNumber: currentGw.number })
				.where(sql`${playerRoundStats.gameweekNumber} is null`);
		}

		const [{ count: dbPlayers }] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(players);
		const [{ count: dbTeams }] = await db.select({ count: sql<number>`count(*)::int` }).from(teams);

		const [{ count: roundRows }] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(playerRoundStats);
		console.log(`Upserted ${teamCount} teams, ${playerCount} players from players.json`);
		console.log(`DB now has ${dbTeams} teams, ${dbPlayers} players, ${roundRows} round-stat rows`);
	} finally {
		await client.end({ timeout: 5 });
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
