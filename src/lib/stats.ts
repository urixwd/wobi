type Statsish = {
	lastRoundPlayerStats?: unknown;
};

export function lastRoundPoints(p: Statsish): number | null {
	const stats = p.lastRoundPlayerStats as { points?: number; totalPoints?: number } | null;
	if (!stats) return null;
	const n = Number(stats.points ?? stats.totalPoints);
	return Number.isFinite(n) ? n : null;
}
