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
	missingStatus: boolean('missing_status').notNull().default(false),
	lastRoundPlayerStats: jsonb('last_round_player_stats'),
	lastSeasonPlayerStats: jsonb('last_season_player_stats'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
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

export type Team = typeof teams.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Gameweek = typeof gameweeks.$inferSelect;
export type Fixture = typeof fixtures.$inferSelect;
export type MySquad = typeof mySquad.$inferSelect;
