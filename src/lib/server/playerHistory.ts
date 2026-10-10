import { db } from '$lib/server/db';
import { playerRoundStats, playerSnapshots } from '$lib/server/db/schema';

export type RoundEntry = { matchday: number; points: number; minutes: number } | { matchday: number; played: false };

/**
 * Per-matchday points for every player, newest first, over the matchdays we have full data for.
 *
 * Sport5 rows are keyed by their own round id. The dump taken after matchday N (gameweek N+1)
 * mostly carries round N, so the most common round id per snapshot gives the id→matchday
 * offset. A missing row for a covered matchday = he didn't play (the dump repeats his older
 * round instead).
 */
export async function getPointsHistory(): Promise<{ matchdays: number[]; byPlayer: Map<number, RoundEntry[]> }> {
	const [snaps, rows] = await Promise.all([
		db
			.select({ gw: playerSnapshots.gameweekNumber, stats: playerSnapshots.lastRoundPlayerStats })
			.from(playerSnapshots),
		db
			.select({
				playerId: playerRoundStats.playerId,
				roundId: playerRoundStats.sport5RoundId,
				points: playerRoundStats.points,
				statsData: playerRoundStats.statsData
			})
			.from(playerRoundStats)
	]);

	// Most common round id per dump → the matchday it represents (gw - 1).
	const counts = new Map<number, Map<number, number>>();
	for (const s of snaps) {
		const rid = Number((s.stats as { roundId?: number } | null)?.roundId);
		if (!Number.isFinite(rid)) continue;
		const m = counts.get(s.gw) ?? new Map<number, number>();
		m.set(rid, (m.get(rid) ?? 0) + 1);
		counts.set(s.gw, m);
	}
	const roundToMatchday = new Map<number, number>();
	for (const [gw, m] of counts) {
		const rid = [...m].sort((a, b) => b[1] - a[1])[0]?.[0];
		if (rid != null) roundToMatchday.set(rid, gw - 1);
	}
	const matchdays = [...roundToMatchday.values()].sort((a, b) => b - a);

	const byRound = new Map<number, Map<number, { points: number; minutes: number }>>();
	for (const r of rows) {
		const md = roundToMatchday.get(r.roundId);
		if (md == null) continue;
		const d = (typeof r.statsData === 'string' ? JSON.parse(r.statsData) : r.statsData) as {
			MinutesPlayed?: { Count?: number };
		} | null;
		const m = byRound.get(r.playerId) ?? new Map();
		m.set(md, { points: r.points, minutes: Number(d?.MinutesPlayed?.Count ?? 0) || 0 });
		byRound.set(r.playerId, m);
	}

	const byPlayer = new Map<number, RoundEntry[]>();
	for (const [playerId, m] of byRound)
		byPlayer.set(
			playerId,
			matchdays.map((md) => {
				const e = m.get(md);
				return e && e.minutes > 0 ? { matchday: md, ...e } : { matchday: md, played: false as const };
			})
		);
	return { matchdays, byPlayer };
}
