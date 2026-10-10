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

/** Easy → hard, for selectors / legends. */
export const DIFFICULTY_LEVELS: FixtureDifficulty[] = ['green', 'yellow', 'red'];

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


/**
 * A fixture as seen from one of our players: the opponent's overall rating plus
 * the optional per-position ones (UpcomingFixture has all three).
 */
export type DifficultyFixture = {
	difficulty: FixtureDifficulty;
	/** For our GK + defenders (positions 1,2). */
	difficultyDef?: FixtureDifficulty | null;
	/** For our midfielders + attackers (positions 3,4). */
	difficultyAtt?: FixtureDifficulty | null;
};

/**
 * THE difficulty of a fixture for a player in `position` (1=GK, 2=DEF → vs-defence
 * rating; 3=MID, 4=ATT → vs-attack rating). No/unknown position → overall.
 */
export function difficultyFor(
	fx: DifficultyFixture,
	position: number | null | undefined
): FixtureDifficulty {
	if (position === 1 || position === 2) return fx.difficultyDef ?? fx.difficulty;
	if (position === 3 || position === 4) return fx.difficultyAtt ?? fx.difficulty;
	return fx.difficulty;
}

/** Higher = harder. Used for the 5-fixture run average (shown 1.0–3.0). */
export const DIFFICULTY_SCORE: Record<FixtureDifficulty, number> = {
	green: 1,
	yellow: 2,
	red: 3
};

/** Higher = easier. The scale every strategy / option ranking uses. */
export const EASE_SCORE: Record<FixtureDifficulty, number> = {
	green: 3,
	yellow: 1,
	red: -2
};

/**
 * Mean EASE_SCORE of the first `slots` fixtures for a player in `position`
 * (position-aware via difficultyFor). 0 when there are no fixtures.
 */
export function fixtureEase(
	fixtures: DifficultyFixture[] | undefined | null,
	position: number | null | undefined,
	slots = 5
): number {
	const slice = (fixtures ?? []).slice(0, slots);
	if (!slice.length) return 0;
	return slice.reduce((s, f) => s + (EASE_SCORE[difficultyFor(f, position)] ?? 0), 0) / slice.length;
}

/**
 * EASE_SCORE of the fixture in gameweek `gw` (else the next one) for a player in
 * `position`. 0 when there are no fixtures. (Single-matchday "fixtures" strategy.)
 */
export function matchdayEase(
	fixtures: (DifficultyFixture & { gameweekNumber: number })[] | undefined | null,
	position: number | null | undefined,
	gw: number
): number {
	const list = fixtures ?? [];
	const f = list.find((u) => u.gameweekNumber === gw) ?? list[0];
	return f ? (EASE_SCORE[difficultyFor(f, position)] ?? 0) : 0;
}

/**
 * Mean difficulty score of the next `slots` fixtures (1=easy … 3=hard).
 * With `position`, each fixture is rated for that position; without, overall.
 */
export function fixtureRunAverage(
	fixtures: DifficultyFixture[] | undefined | null,
	slots = 5,
	position?: number | null
): number | null {
	const slice = (fixtures ?? []).slice(0, slots);
	if (!slice.length) return null;
	const sum = slice.reduce((s, f) => s + (DIFFICULTY_SCORE[difficultyFor(f, position)] ?? 2), 0);
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
