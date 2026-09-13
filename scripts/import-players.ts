/**
 * Upsert teams + players from ./players.json (Sport5 Dream Team dump).
 * Usage: bun run db:import-players
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client';
import { players, teams } from '../src/lib/server/db/schema';
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
				await db
					.insert(players)
					.values({
						id: p.id,
						teamId: p.teamId ?? t.id,
						name: p.name,
						price: Number(p.price) || 0,
						shirtNumber: p.shirtNumber ?? null,
						position: p.position,
						imagePath: p.imagePath ?? null,
						teamShirtPath: p.teamShirtPath ?? null,
						teamLogoPath: p.teamLogoPath ?? null,
						injuredStatus: asBool(p.injuredStatus),
						expelledStatus: asBool(p.expelledStatus),
						missingStatus: asBool(p.missingStatus),
						lastRoundPlayerStats: p.lastRoundPlayerStats ?? null,
						lastSeasonPlayerStats: p.lastSeasonPlayerStats ?? null,
						updatedAt: new Date()
					})
					.onConflictDoUpdate({
						target: players.id,
						set: {
							teamId: p.teamId ?? t.id,
							name: p.name,
							price: Number(p.price) || 0,
							shirtNumber: p.shirtNumber ?? null,
							position: p.position,
							imagePath: p.imagePath ?? null,
							teamShirtPath: p.teamShirtPath ?? null,
							teamLogoPath: p.teamLogoPath ?? null,
							injuredStatus: asBool(p.injuredStatus),
							expelledStatus: asBool(p.expelledStatus),
							missingStatus: asBool(p.missingStatus),
							lastRoundPlayerStats: p.lastRoundPlayerStats ?? null,
							lastSeasonPlayerStats: p.lastSeasonPlayerStats ?? null,
							updatedAt: new Date()
						}
					});
				playerCount++;
			}
		}

		const [{ count: dbPlayers }] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(players);
		const [{ count: dbTeams }] = await db.select({ count: sql<number>`count(*)::int` }).from(teams);

		console.log(`Upserted ${teamCount} teams, ${playerCount} players from players.json`);
		console.log(`DB now has ${dbTeams} teams, ${dbPlayers} players`);
	} finally {
		await client.end({ timeout: 5 });
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
