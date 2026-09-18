/**
 * Score the what-if strategy picks for a finished round.
 *
 * Round N's points live in the dump taken after it (player_snapshots[N+1]).
 * So run this as part of the new-matchday update, AFTER importing the new
 * player dump. Fills strategy_picks.points for the finished round.
 *
 * Usage:
 *   bun run db:score-strategies                 # scores (is_current - 1)
 *   bun run db:score-strategies -- --round=5    # scores a specific round
 */
import { asc, eq } from 'drizzle-orm';
import { createDb } from '../src/lib/server/db/client';
import { gameweeks, playerSnapshots, strategyPicks } from '../src/lib/server/db/schema';

function parseRound(argv: string[]): number | null {
	for (const a of argv) if (a.startsWith('--round=')) return Number(a.slice(8));
	for (let i = 0; i < argv.length; i++) if (argv[i] === '--round' && argv[i + 1]) return Number(argv[i + 1]);
	return null;
}

const { db, client } = createDb();
try {
	let round = parseRound(process.argv.slice(2));
	if (!round) {
		const cur = (await db.select().from(gameweeks).where(eq(gameweeks.isCurrent, true)).limit(1))[0];
		round = cur ? cur.number - 1 : null;
	}
	if (!round || round < 5) {
		console.log(`Nothing to score (round=${round}; tracking starts at GW5).`);
	} else {
		const snaps = await db
			.select()
			.from(playerSnapshots)
			.where(eq(playerSnapshots.gameweekNumber, round + 1));
		const pts = new Map<number, number>();
		for (const s of snaps) {
			const st = s.lastRoundPlayerStats as { points?: number; totalPoints?: number } | null;
			const n = Number(st?.points ?? st?.totalPoints);
			pts.set(s.playerId, Number.isFinite(n) ? n : 0);
		}
		if (pts.size === 0) {
			console.log(
				`No player_snapshots for GW ${round + 1}. Import the post-round-${round} dump first (--gw=${round + 1}).`
			);
		} else {
			const picks = await db
				.select()
				.from(strategyPicks)
				.where(eq(strategyPicks.gameweekNumber, round))
				.orderBy(asc(strategyPicks.strategy));
			for (const pk of picks) {
				const total = pk.xiPlayerIds.reduce((s, id) => s + (pts.get(id) ?? 0), 0);
				await db
					.update(strategyPicks)
					.set({ points: Math.round(total * 10) / 10, updatedAt: new Date() })
					.where(eq(strategyPicks.id, pk.id));
			}
			console.log(`Scored round ${round} (${picks.length} picks) from snapshot GW ${round + 1}:`);
			const scored = await db
				.select()
				.from(strategyPicks)
				.where(eq(strategyPicks.gameweekNumber, round));
			for (const pk of scored.sort((a, b) => (b.points ?? 0) - (a.points ?? 0))) {
				console.log(`  ${pk.strategy.padEnd(10)} ${pk.points ?? 0} pts  (${pk.formation ?? '-'})`);
			}
		}
	}
} finally {
	await client.end();
}
