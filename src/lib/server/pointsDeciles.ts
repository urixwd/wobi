import { db } from '$lib/server/db';
import { players } from '$lib/server/db/schema';
import { buildPointsDeciles, type DecileInfo } from '$lib/playerMetrics';
import { seasonPoints } from '$lib/stats';

/**
 * Season-points deciles over the same pool /squad uses: active players with points > 0,
 * plus `alwaysInclude` (the players being shown) so every card gets a decile.
 */
export async function getPointsDeciles(alwaysInclude: Iterable<number> = []): Promise<Map<number, DecileInfo>> {
	const keep = new Set(alwaysInclude);
	const rows = await db
		.select({
			id: players.id,
			lastSeasonPlayerStats: players.lastSeasonPlayerStats,
			missingStatus: players.missingStatus
		})
		.from(players);
	const pool = rows.filter(
		(r) => r.missingStatus !== 2 && ((seasonPoints(r) ?? 0) > 0 || keep.has(r.id))
	);
	return buildPointsDeciles(pool);
}
