import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { benchOnly, playerRoundStats } from '$lib/server/db/schema';

/** Players marked «ספסל בלבד» (never start). */
export async function getBenchOnlyIds(): Promise<Set<number>> {
	const rows = await db.select({ id: benchOnly.playerId }).from(benchOnly);
	return new Set(rows.map((r) => r.id));
}

export async function toggleBenchOnly(playerId: number): Promise<void> {
	const deleted = await db.delete(benchOnly).where(eq(benchOnly.playerId, playerId)).returning();
	if (!deleted.length) await db.insert(benchOnly).values({ playerId }).onConflictDoNothing();
}

/** Minutes in each of the player's last `rounds` recorded matchdays, newest first. */
export async function getRecentMinutes(ids: number[], rounds = 3): Promise<Map<number, number[]>> {
	const out = new Map<number, number[]>();
	if (!ids.length) return out;
	const rows = await db
		.select({ id: playerRoundStats.playerId, statsData: playerRoundStats.statsData })
		.from(playerRoundStats)
		.where(inArray(playerRoundStats.playerId, ids))
		.orderBy(desc(playerRoundStats.gameweekNumber));
	for (const r of rows) {
		const list = out.get(r.id) ?? [];
		if (list.length >= rounds) continue;
		const d = (typeof r.statsData === 'string' ? JSON.parse(r.statsData) : r.statsData) as {
			MinutesPlayed?: { Count?: number };
		} | null;
		list.push(Number(d?.MinutesPlayed?.Count ?? 0) || 0);
		out.set(r.id, list);
	}
	return out;
}

/** Suggest «ספסל בלבד» for players with 0 minutes in all of their last `rounds` (at least 2 recorded). */
export function looksBenchOnly(minutes: number[] | undefined): boolean {
	return !!minutes && minutes.length >= 2 && minutes.every((m) => m === 0);
}
