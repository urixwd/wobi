/**
 * Per-matchday, position-aware opponent difficulty (table `team_difficulty`).
 *
 * Ratings are keyed by the PLANNING matchday (normally the current gameweek):
 * every fixture shown while planning matchday N is coloured with N's ratings,
 * whatever gameweek the fixture itself is in. A new matchday starts as a copy of
 * the latest earlier one (carry-forward); with no rows at all, `teams.difficulty`
 * seeds all three columns.
 *
 * Relative imports only (no `$lib` / `$env`) so CLI scripts can use it too —
 * pass their own `createDb()` handle as `database`; the app default is lazy.
 */
import { and, desc, eq, lt, lte } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from './db/schema';
import { teamDifficulty, teams, type FixtureDifficulty } from './db/schema';

type Db = PostgresJsDatabase<typeof schema>;

export type DifficultyRating = {
	overall: FixtureDifficulty;
	/** Facing this team, for our GK + defenders (positions 1,2). */
	vsDef: FixtureDifficulty;
	/** Facing this team, for our midfielders + attackers (positions 3,4). */
	vsAtt: FixtureDifficulty;
};
export type DifficultyField = keyof DifficultyRating;

export const DIFFICULTY_FIELDS: DifficultyField[] = ['overall', 'vsDef', 'vsAtt'];
const VALUES: FixtureDifficulty[] = ['green', 'yellow', 'red'];

export const isDifficulty = (v: unknown): v is FixtureDifficulty =>
	VALUES.includes(v as FixtureDifficulty);
export const isDifficultyField = (v: unknown): v is DifficultyField =>
	DIFFICULTY_FIELDS.includes(v as DifficultyField);

async function appDb(database?: Db): Promise<Db> {
	return database ?? ((await import('./db')).db as Db);
}

/** Latest gameweek ≤ gw (or < gw when `strict`) that has rating rows, or null. */
async function latestRatedGw(database: Db, gw: number, strict: boolean): Promise<number | null> {
	const row = (
		await database
			.select({ gw: teamDifficulty.gameweekNumber })
			.from(teamDifficulty)
			.where(strict ? lt(teamDifficulty.gameweekNumber, gw) : lte(teamDifficulty.gameweekNumber, gw))
			.orderBy(desc(teamDifficulty.gameweekNumber))
			.limit(1)
	)[0];
	return row?.gw ?? null;
}

/**
 * Ratings in effect for planning matchday `gw`: its own rows, else the latest
 * earlier matchday's, else `teams.difficulty` for all three. Read-only.
 */
export async function getDifficultyRatings(
	gw: number,
	database?: Db
): Promise<Map<number, DifficultyRating>> {
	const d = await appDb(database);
	const out = new Map<number, DifficultyRating>();
	// Base layer: legacy team rating (also covers teams missing from the rows).
	for (const t of await d.select({ id: teams.id, difficulty: teams.difficulty }).from(teams)) {
		out.set(t.id, { overall: t.difficulty, vsDef: t.difficulty, vsAtt: t.difficulty });
	}
	const source = await latestRatedGw(d, gw, false);
	if (source == null) return out;
	const rows = await d.select().from(teamDifficulty).where(eq(teamDifficulty.gameweekNumber, source));
	for (const r of rows) out.set(r.teamId, { overall: r.overall, vsDef: r.vsDef, vsAtt: r.vsAtt });
	return out;
}

/**
 * Make sure matchday `gw` has its own rows (one per team): copy the latest earlier
 * matchday's ratings, falling back to `teams.difficulty`. Also fills in teams
 * added since. Never overwrites existing rows. Returns how many rows it inserted.
 */
export async function ensureDifficultyForGw(gw: number, database?: Db): Promise<number> {
	const d = await appDb(database);
	const existing = new Set(
		(
			await d
				.select({ teamId: teamDifficulty.teamId })
				.from(teamDifficulty)
				.where(eq(teamDifficulty.gameweekNumber, gw))
		).map((r) => r.teamId)
	);
	const allTeams = await d.select({ id: teams.id }).from(teams);
	if (allTeams.every((t) => existing.has(t.id))) return 0;

	const prev = await latestRatedGw(d, gw, true);
	const base = await getDifficultyRatings(prev ?? gw, d);
	const values = allTeams
		.filter((t) => !existing.has(t.id) && base.has(t.id))
		.map((t) => ({ gameweekNumber: gw, teamId: t.id, ...base.get(t.id)! }));
	if (!values.length) return 0;
	await d.insert(teamDifficulty).values(values).onConflictDoNothing();
	return values.length;
}

/** Set one rating cell for (gw, team); creates the matchday's rows first if needed. */
export async function setDifficulty(
	gw: number,
	teamId: number,
	field: DifficultyField,
	value: FixtureDifficulty,
	database?: Db
): Promise<void> {
	const d = await appDb(database);
	await ensureDifficultyForGw(gw, d);
	await d
		.update(teamDifficulty)
		.set({ [field]: value, updatedAt: new Date() })
		.where(and(eq(teamDifficulty.gameweekNumber, gw), eq(teamDifficulty.teamId, teamId)));
}

/** Matchdays that have their own rating rows (ascending). */
export async function getRatedGameweeks(database?: Db): Promise<number[]> {
	const d = await appDb(database);
	const rows = await d
		.selectDistinct({ gw: teamDifficulty.gameweekNumber })
		.from(teamDifficulty)
		.orderBy(teamDifficulty.gameweekNumber);
	return rows.map((r) => r.gw);
}
