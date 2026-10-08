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
import { gameweeks, players, playerSnapshots, strategyPicks } from '../src/lib/server/db/schema';

type RoundStats = { points?: number; totalPoints?: number; roundId?: number; statsData?: string } | null;

function minutesPlayed(st: RoundStats): number {
	try {
		const d = typeof st?.statsData === 'string' ? JSON.parse(st.statsData) : st?.statsData;
		return Number(d?.MinutesPlayed?.Count ?? 0) || 0;
	} catch {
		return 0;
	}
}

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
		// A player who sat out round N keeps an older round's stats in the dump,
		// so only count stats from round N's Sport5 roundId (the most common one).
		const ridCount = new Map<number, number>();
		for (const s of snaps) {
			const rid = Number((s.lastRoundPlayerStats as RoundStats)?.roundId);
			if (Number.isFinite(rid)) ridCount.set(rid, (ridCount.get(rid) ?? 0) + 1);
		}
		const roundRid = [...ridCount].sort((a, b) => b[1] - a[1])[0]?.[0];
		const pts = new Map<number, number>();
		const played = new Set<number>();
		for (const s of snaps) {
			const st = s.lastRoundPlayerStats as RoundStats;
			if (Number(st?.roundId) !== roundRid) continue;
			const n = Number(st?.points ?? st?.totalPoints);
			pts.set(s.playerId, Number.isFinite(n) ? n : 0);
			if (minutesPlayed(st) > 0) played.add(s.playerId);
		}
		const posOf = new Map(
			(await db.select({ id: players.id, position: players.position }).from(players)).map((p) => [p.id, p.position])
		);
		// Sport5 auto-sub: an XI player who didn't play is replaced by the bench player of the same position.
		const scoreXi = (xi: number[], bench: number[]) => {
			const pool = [...bench];
			let total = 0;
			for (const id of xi) {
				if (played.has(id)) {
					total += pts.get(id) ?? 0;
					continue;
				}
				const i = pool.findIndex((b) => posOf.get(b) === posOf.get(id));
				if (i >= 0) total += pts.get(pool.splice(i, 1)[0]) ?? 0;
			}
			return total;
		};
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
				const total = scoreXi(pk.xiPlayerIds as number[], (pk.benchPlayerIds as number[]) ?? []);
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
