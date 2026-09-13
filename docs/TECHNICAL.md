# WOBI — תיעוד טכני

## Stack
- **Runtime / pkg**: Bun
- **App**: SvelteKit (Svelte 5) + TypeScript + Tailwind v4
- **DB**: PostgreSQL database `WOBI` (case-sensitive)
- **ORM**: Drizzle (`drizzle-orm` + `drizzle-kit`)
- **Connection**: `DATABASE_URL` in `.env` (see `.env.example`)

## Project layout
```
wobi/
  players.json          # Sport5 dump (manual update each round)
  fixtures.json         # fixtures import source (from ONE scrape / manual)
  one-fixtures.json     # raw ONE schedule snapshot
  scripts/
    import-players.ts   # upsert teams/players + round history
    import-fixtures.ts  # upsert gameweeks/fixtures
  src/
    lib/
      difficulty.ts     # red/yellow/green by opponent name
      format.ts         # price display
      stats.ts          # season/last-round points + statsData parse
      playerMetrics.ts  # vlfm, points decile, momentum constants
      squadRules.ts     # XI/bench limits + BUDGET_TOTAL=120
      server/db/        # drizzle client + schema
      components/       # UI pieces (FixtureStrip, PriceRangeSlider, …)
    routes/
      squad/            # my team + pitch + player table
      watchlist/
      gameweek/
      transfers/
  docs/                 # this folder
```

## Database schema (main tables)
| Table | Purpose |
|---|---|
| `teams` | Club id/name/logo + fixture `difficulty` |
| `players` | Player pool; `price` in millions; `missing_status` 0/1/2 |
| `gameweeks` | Rounds 1–26; `is_current` |
| `fixtures` | Home/away per gameweek |
| `my_squad` | Single-user XI + bench JSON arrays + free transfers |
| `watchlist_permanent` / `watchlist_round` | Tracking lists |
| `player_round_stats` | Per Sport5 `roundId` points snapshots for future momentum |

### `missing_status`
- `0` — available
- `1` — נעדר (selectable)
- `2` — inactive / previous season (**excluded on import**)

### Prices
Sport5 raw prices (e.g. `9000000`) are stored as millions (`9`) via `toMillions` in import.

## Scripts
| Command | What it does |
|---|---|
| `bun install` | deps |
| `bun run dev` | Vite/SvelteKit |
| `bun run check` | `svelte-check` |
| `bun run db:push` | Push Drizzle schema (`--force`) |
| `bun run db:import-players` | Upsert from `players.json` + append `player_round_stats` |
| `bun run db:import-fixtures` | Upsert from `fixtures.json` |
| `bun run db:studio` | Drizzle Studio |

## Key algorithms (app code)
- **Fixture difficulty**: Hebrew name sets in `difficulty.ts` (red/yellow; else green).
- **Upcoming strip**: next 5 fixtures per club from current GW (`upcomingFixtures.ts`).
- **vlfm**: `seasonPoints / price`.
- **Points decile**: rank pool by season points into 1–10 (10 = top).
- **Squad validity**: `squadRules.ts` — XI caps + bench one-per-position + budget 120.
- **Momentum**: **not shown until GW 7**; history accumulates in `player_round_stats` on each import.

## External data
- Players: manual `players.json` from Dream Team / Sport5.
- Fixtures: ONE league API / `one-fixtures.json` mapped to team ids, then `fixtures.json`.

## Local git
Repo on `main` at project path; remote GitHub TBD by user.
