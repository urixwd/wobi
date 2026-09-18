import {
	pgTable,
	serial,
	integer,
	text,
	real,
	boolean,
	timestamp,
	jsonb,
	uniqueIndex
} from 'drizzle-orm/pg-core';

/** Position codes from Sport5: 1=שוער, 2=הגנה, 3=קישור, 4=התקפה */
export const POSITION_LABELS: Record<number, string> = {
	1: 'שוער',
	2: 'הגנה',
	3: 'קישור',
	4: 'התקפה'
};

export type FixtureDifficulty = 'red' | 'yellow' | 'green';

export const teams = pgTable('teams', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	logoPath: text('logo_path'),
	shirtPath: text('shirt_path'),
	pageLink: text('page_link'),
	/** Traffic-light fixture difficulty when this team is the opponent */
	difficulty: text('difficulty').$type<FixtureDifficulty>().notNull().default('green')
});

export const players = pgTable('players', {
	id: integer('id').primaryKey(),
	teamId: integer('team_id')
		.notNull()
		.references(() => teams.id),
	name: text('name').notNull(),
	price: real('price').notNull().default(0),
	shirtNumber: integer('shirt_number'),
	position: integer('position').notNull(),
	imagePath: text('image_path'),
	teamShirtPath: text('team_shirt_path'),
	teamLogoPath: text('team_logo_path'),
	injuredStatus: boolean('injured_status').notNull().default(false),
	expelledStatus: boolean('expelled_status').notNull().default(false),
		/** Sport5: 0=available, 1=נעדר (selectable), 2=inactive/previous season */
	missingStatus: integer('missing_status').notNull().default(0),
	lastRoundPlayerStats: jsonb('last_round_player_stats'),
	lastSeasonPlayerStats: jsonb('last_season_player_stats'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	/** Which Sport5/Dream Team gameweek this live row reflects */
	asOfGameweek: integer('as_of_gameweek')
});

export const gameweeks = pgTable('gameweeks', {
	id: serial('id').primaryKey(),
	number: integer('number').notNull().unique(),
	label: text('label'),
	isCurrent: boolean('is_current').notNull().default(false),
	startsAt: timestamp('starts_at', { withTimezone: true }),
	endsAt: timestamp('ends_at', { withTimezone: true })
});

export const fixtures = pgTable('fixtures', {
	id: serial('id').primaryKey(),
	gameweekId: integer('gameweek_id')
		.notNull()
		.references(() => gameweeks.id),
	homeTeamId: integer('home_team_id')
		.notNull()
		.references(() => teams.id),
	awayTeamId: integer('away_team_id')
		.notNull()
		.references(() => teams.id),
	kickoff: timestamp('kickoff', { withTimezone: true }),
	homeScore: integer('home_score'),
	awayScore: integer('away_score'),
	/** Optional Sport5 / scrape source id */
	externalId: text('external_id')
});

/** Single-user squad: starting XI + bench */
export const mySquad = pgTable('my_squad', {
	id: serial('id').primaryKey(),
	name: text('name').notNull().default('ברירת מחדל'),
	/** Exactly 11 player ids for the starting XI */
	xiPlayerIds: jsonb('xi_player_ids').$type<number[]>().notNull().default([]),
	/** Bench player ids (typically 4) */
	benchPlayerIds: jsonb('bench_player_ids').$type<number[]>().notNull().default([]),
	freeTransfers: integer('free_transfers').notNull().default(3),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const watchlistPermanent = pgTable(
	'watchlist_permanent',
	{
		id: serial('id').primaryKey(),
		playerId: integer('player_id')
			.notNull()
			.references(() => players.id),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [uniqueIndex('watchlist_permanent_player_uidx').on(t.playerId)]
);

export const watchlistRound = pgTable(
	'watchlist_round',
	{
		id: serial('id').primaryKey(),
		playerId: integer('player_id')
			.notNull()
			.references(() => players.id),
		gameweekNumber: integer('gameweek_number'),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [uniqueIndex('watchlist_round_player_uidx').on(t.playerId)]
);


/** Per-round points snapshot for momentum (filled on each player dump import). */
export const playerRoundStats = pgTable(
	'player_round_stats',
	{
		id: serial('id').primaryKey(),
		playerId: integer('player_id')
			.notNull()
			.references(() => players.id),
		/** Sport5 round id from lastRoundPlayerStats.roundId */
		sport5RoundId: integer('sport5_round_id').notNull(),
		/** Our league gameweek number when known (nullable until mapped) */
		gameweekNumber: integer('gameweek_number'),
		points: real('points').notNull().default(0),
		seasonPoints: real('season_points'),
		statsData: jsonb('stats_data'),
		capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [uniqueIndex('player_round_stats_player_s5_uidx').on(t.playerId, t.sport5RoundId)]
);

export type Team = typeof teams.$inferSelect;

/** Full player row snapshot per gameweek (source of truth per round; live `players` = latest). */
export const playerSnapshots = pgTable(
	'player_snapshots',
	{
		id: serial('id').primaryKey(),
		gameweekNumber: integer('gameweek_number').notNull(),
		playerId: integer('player_id')
			.notNull()
			.references(() => players.id),
		teamId: integer('team_id')
			.notNull()
			.references(() => teams.id),
		name: text('name').notNull(),
		price: real('price').notNull().default(0),
		shirtNumber: integer('shirt_number'),
		position: integer('position').notNull(),
		imagePath: text('image_path'),
		teamShirtPath: text('team_shirt_path'),
		teamLogoPath: text('team_logo_path'),
		injuredStatus: boolean('injured_status').notNull().default(false),
		expelledStatus: boolean('expelled_status').notNull().default(false),
		missingStatus: integer('missing_status').notNull().default(0),
		lastRoundPlayerStats: jsonb('last_round_player_stats'),
		lastSeasonPlayerStats: jsonb('last_season_player_stats'),
		capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [uniqueIndex('player_snapshots_gw_player_uidx').on(t.gameweekNumber, t.playerId)]
);

export type Player = typeof players.$inferSelect;
export type Gameweek = typeof gameweeks.$inferSelect;
export type Fixture = typeof fixtures.$inferSelect;

/** Lineup sketches / drafts, keyed by gameweek. WIP (incomplete) allowed. */
export const sketches = pgTable('sketches', {
	id: serial('id').primaryKey(),
	name: text('name').notNull().default('סקיצה'),
	gameweekNumber: integer('gameweek_number').notNull(),
	xiPlayerIds: jsonb('xi_player_ids').$type<number[]>().notNull().default([]),
	benchPlayerIds: jsonb('bench_player_ids').$type<number[]>().notNull().default([]),
	notes: text('notes'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});


/** Locked/final squad snapshot per gameweek (after deadline). */
export const finalSquads = pgTable(
	'final_squads',
	{
		id: serial('id').primaryKey(),
		gameweekNumber: integer('gameweek_number').notNull(),
		xiPlayerIds: jsonb('xi_player_ids').$type<number[]>().notNull().default([]),
		benchPlayerIds: jsonb('bench_player_ids').$type<number[]>().notNull().default([]),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [uniqueIndex('final_squads_gw_uidx').on(t.gameweekNumber)]
);

/**
 * What-if tracking: per matchday, the #1 team each strategy would field, plus
 * the user's actual team (strategy = 'actual'). `points` is filled once the
 * round is scored (during the next matchday's import). Tracked from GW5 on.
 */
export const strategyPicks = pgTable(
	'strategy_picks',
	{
		id: serial('id').primaryKey(),
		gameweekNumber: integer('gameweek_number').notNull(),
		/** 'points' | 'vlfm' | 'fixtures' | 'form' | 'actual' */
		strategy: text('strategy').notNull(),
		xiPlayerIds: jsonb('xi_player_ids').$type<number[]>().notNull().default([]),
		benchPlayerIds: jsonb('bench_player_ids').$type<number[]>().notNull().default([]),
		formation: text('formation'),
		spend: real('spend'),
		/** Player ids released vs the previous matchday (the freed slots). */
		releasedPlayerIds: jsonb('released_player_ids').$type<number[]>().notNull().default([]),
		/** XI round points; null until the round is scored. */
		points: real('points'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [uniqueIndex('strategy_picks_gw_strategy_uidx').on(t.gameweekNumber, t.strategy)]
);

/**
 * Per-matchday planning prefs, persisted so the watchlist pickers are sticky.
 * `mustInIds` = wishlist players the user insists on bringing in (forced into
 * all four recorded strategies). `mustOutIds` = squad players marked to release
 * for the live suggestions.
 */
export const matchdayPlan = pgTable(
	'matchday_plan',
	{
		id: serial('id').primaryKey(),
		gameweekNumber: integer('gameweek_number').notNull(),
		mustInIds: jsonb('must_in_ids').$type<number[]>().notNull().default([]),
		mustOutIds: jsonb('must_out_ids').$type<number[]>().notNull().default([]),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [uniqueIndex('matchday_plan_gw_uidx').on(t.gameweekNumber)]
);

export type MySquad = typeof mySquad.$inferSelect;
export type FinalSquad = typeof finalSquads.$inferSelect;
export type Sketch = typeof sketches.$inferSelect;
export type PlayerRoundStats = typeof playerRoundStats.$inferSelect;
export type PlayerSnapshot = typeof playerSnapshots.$inferSelect;
export type StrategyPick = typeof strategyPicks.$inferSelect;
export type MatchdayPlan = typeof matchdayPlan.$inferSelect;
