import type { FixtureDifficulty } from '$lib/server/db/schema';

/** Normalize Hebrew team names for fuzzy match (בית"ר / ביתר). */
export function normalizeTeamName(name: string): string {
	return name
		.replace(/["״"']/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

const RED = new Set(
	[
		'מכבי תל אביב',
		'הפועל תל אביב',
		'מכבי חיפה',
		'ביתר ירושלים',
		'בית"ר ירושלים',
		'הפועל באר שבע'
	].map(normalizeTeamName)
);

const YELLOW = new Set(['מכבי נתניה', 'הפועל חיפה'].map(normalizeTeamName));

export function difficultyForTeamName(name: string): FixtureDifficulty {
	const n = normalizeTeamName(name);
	if (RED.has(n)) return 'red';
	if (YELLOW.has(n)) return 'yellow';
	return 'green';
}

export const DIFFICULTY_RING: Record<FixtureDifficulty, string> = {
	red: 'ring-red-500',
	yellow: 'ring-yellow-400',
	green: 'ring-emerald-500'
};

export const DIFFICULTY_BG: Record<FixtureDifficulty, string> = {
	red: 'bg-red-500/15 text-red-700',
	yellow: 'bg-yellow-400/20 text-yellow-800',
	green: 'bg-emerald-500/15 text-emerald-800'
};

export const DIFFICULTY_LABEL: Record<FixtureDifficulty, string> = {
	red: 'קשה',
	yellow: 'בינוני',
	green: 'קל'
};


/** Higher = harder. Used for 5-fixture run average. */
export const DIFFICULTY_SCORE: Record<FixtureDifficulty, number> = {
	green: 1,
	yellow: 2,
	red: 3
};

/** Mean difficulty score of the next `slots` fixtures (1=easy … 3=hard). */
export function fixtureRunAverage(
	fixtures: { difficulty: FixtureDifficulty }[] | undefined | null,
	slots = 5
): number | null {
	const slice = (fixtures ?? []).slice(0, slots);
	if (!slice.length) return null;
	const sum = slice.reduce((s, f) => s + (DIFFICULTY_SCORE[f.difficulty] ?? 2), 0);
	return sum / slice.length;
}

/**
 * Bucket the 5-game run into traffic-light:
 * ≤1.5 קל · ≤2.25 בינוני · else קשה
 */
export function fixtureRunBucket(avg: number | null): FixtureDifficulty | null {
	if (avg == null || !Number.isFinite(avg)) return null;
	if (avg <= 1.5) return 'green';
	if (avg <= 2.25) return 'yellow';
	return 'red';
}

export function formatFixtureRun(avg: number | null): string {
	if (avg == null || !Number.isFinite(avg)) return '—';
	return avg.toFixed(1);
}
