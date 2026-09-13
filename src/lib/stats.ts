type Statsish = {
	lastRoundPlayerStats?: unknown;
	lastSeasonPlayerStats?: unknown;
};

type RoundStats = {
	points?: number;
	totalPoints?: number;
	seasonPoints?: number;
	statsData?: string | Record<string, { Count?: number; Points?: number }>;
};

const STAT_LABELS: Record<string, string> = {
	MinutesPlayed: 'דקות',
	OpenLineup: 'הרכב פותח',
	SubstituteIn: 'נכנס כמחליף',
	SubstituteOut: 'יצא',
	Goals: 'שערים',
	OwnGoals: 'שער עצמי',
	Assists: 'בישולים',
	YellowCards: 'צהובים',
	RedCards: 'אדומים',
	PenaltiesStopped: 'פנדלים עצורים',
	PenaltiesMissed: 'פנדלים שהוחמצו',
	CausedPenalty: 'גרם לפנדל',
	FailedForPenalty: 'נכשל בפנדל',
	GoalsAbsorbed: 'ספיגות',
	CleanGames: 'משחק נקי'
};

export function lastRoundPoints(p: Statsish): number | null {
	const stats = p.lastRoundPlayerStats as RoundStats | null;
	if (!stats) return null;
	const n = Number(stats.points ?? stats.totalPoints);
	return Number.isFinite(n) ? n : null;
}

/** Season points accumulated so far (Dream Team). */
export function seasonPoints(p: Statsish): number | null {
	const round = p.lastRoundPlayerStats as RoundStats | null;
	if (round && Number.isFinite(Number(round.seasonPoints))) return Number(round.seasonPoints);
	const season = p.lastSeasonPlayerStats as RoundStats | null;
	if (!season) return null;
	const n = Number(season.points ?? season.totalPoints);
	return Number.isFinite(n) ? n : null;
}

/** e.g. "21 (5) נק׳" — season total, last round in parentheses */
export function formatPointsLabel(p: Statsish): string {
	const season = seasonPoints(p) ?? 0;
	const round = lastRoundPoints(p);
	if (round == null) return `${season} נק׳`;
	return `${season} (${round}) נק׳`;
}

export type StatLine = {
	key: string;
	label: string;
	count: number;
	points: number;
};

function parseStatsDataRaw(statsData: RoundStats['statsData']): StatLine[] {
	if (!statsData) return [];
	let obj: Record<string, { Count?: number; Points?: number }>;
	try {
		obj = typeof statsData === 'string' ? JSON.parse(statsData) : statsData;
	} catch {
		return [];
	}
	const lines: StatLine[] = [];
	for (const [key, val] of Object.entries(obj ?? {})) {
		const count = Number(val?.Count ?? 0);
		const points = Number(val?.Points ?? 0);
		if (!count && !points) continue;
		lines.push({
			key,
			label: STAT_LABELS[key] ?? key,
			count,
			points
		});
	}
	return lines;
}

/** Prefer last-round breakdown; fall back to season. */
export function playerStatLines(p: Statsish): StatLine[] {
	const round = p.lastRoundPlayerStats as RoundStats | null;
	const fromRound = parseStatsDataRaw(round?.statsData);
	if (fromRound.length) return fromRound;
	const season = p.lastSeasonPlayerStats as RoundStats | null;
	return parseStatsDataRaw(season?.statsData);
}
