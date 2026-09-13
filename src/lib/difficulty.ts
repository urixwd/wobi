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
