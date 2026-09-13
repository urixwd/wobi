/**
 * Import fixtures from ./fixtures.json and ensure gameweeks exist.
 * Current round concept starts at 4.
 * Usage: bun run db:import-fixtures
 *
 * TODO: scrape upcoming fixtures from https://dreamteam.sport5.co.il later.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client';
import { fixtures, gameweeks } from '../src/lib/server/db/schema';


const CURRENT_ROUND = 4;

type FixtureRow = {
	gameweek: number;
	homeTeamId: number;
	awayTeamId: number;
	kickoff?: string | null;
	homeScore?: number | null;
	awayScore?: number | null;
	externalId?: string | null;
};

type FixturesFile = {
	currentRound?: number;
	fixtures: FixtureRow[];
};

async function main() {
	const path = resolve(process.cwd(), 'fixtures.json');
	const raw = JSON.parse(readFileSync(path, 'utf8')) as FixturesFile;
	const currentRound = raw.currentRound ?? CURRENT_ROUND;
	const { db, client } = createDb();

	try {
		const gwNumbers = new Set<number>([currentRound, ...(raw.fixtures ?? []).map((f) => f.gameweek)]);
		for (const n of [...gwNumbers].sort((a, b) => a - b)) {
			await db
				.insert(gameweeks)
				.values({
					number: n,
					label: `מחזור ${n}`,
					isCurrent: n === currentRound
				})
				.onConflictDoUpdate({
					target: gameweeks.number,
					set: {
						label: `מחזור ${n}`,
						isCurrent: n === currentRound
					}
				});
		}

		// Clear isCurrent on non-current
		await db.update(gameweeks).set({ isCurrent: false }).where(eq(gameweeks.isCurrent, true));
		await db.update(gameweeks).set({ isCurrent: true }).where(eq(gameweeks.number, currentRound));

		const allGw = await db.select().from(gameweeks);
		const byNumber = new Map(allGw.map((g) => [g.number, g.id]));

		// Replace fixtures for imported gameweeks (sample/idempotent re-import)
		const gwIds = [...byNumber.values()];
		for (const id of gwIds) {
			await db.delete(fixtures).where(eq(fixtures.gameweekId, id));
		}

		let inserted = 0;
		for (const f of raw.fixtures ?? []) {
			const gameweekId = byNumber.get(f.gameweek);
			if (!gameweekId) continue;
			await db.insert(fixtures).values({
				gameweekId,
				homeTeamId: f.homeTeamId,
				awayTeamId: f.awayTeamId,
				kickoff: f.kickoff ? new Date(f.kickoff) : null,
				homeScore: f.homeScore ?? null,
				awayScore: f.awayScore ?? null,
				externalId: f.externalId ?? null
			});
			inserted++;
		}

		console.log(
			`Gameweeks ensured (current=${currentRound}). Inserted ${inserted} fixtures from fixtures.json`
		);
		console.log('TODO: scrape fixtures from dreamteam.sport5.co.il');
	} finally {
		await client.end({ timeout: 5 });
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
