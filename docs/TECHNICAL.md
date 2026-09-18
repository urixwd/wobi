# WOBI — תיעוד טכני

## Stack
Bun · SvelteKit 5 · TS · Tailwind 4 · Drizzle · Postgres `WOBI`

## Player data model
| Store | Role |
|---|---|
| `players` | Live pool (= latest imported GW). Column `as_of_gameweek`. |
| `player_snapshots` | Full row per `(gameweek_number, player_id)` — **source of truth per round**. |
| `player_round_stats` | Points history by Sport5 `roundId` (momentum). |

**No committed `players.json`.** The Sport5 JSON dump is ephemeral input only.

### Sport5 JSON vs Postgres dump
| Artifact | Command | Purpose | Git |
|---|---|---|---|
| Sport5 players JSON | `db:import-players -- --gw=N file.json` | Load one gameweek into `players` + `player_snapshots` | ignore |
| Rebuild JSON from DB | `db:export-players -- --gw=N` | Round-trip / backup of one GW as JSON | ignore (optional under `exports/`) |
| Full DB SQL | `db:dump` → `db/dumps/latest.sql` | Restore whole WOBI | **commit** (separate from code) |

Import/export examples:

```bash
# Import next round (example GW5)
bun run db:import-players -- --gw=5 ./incoming/players-gw5.json

# Rebuild a Sport5-shaped dump FROM DB
bun run db:export-players -- --gw=4
bun run db:export-players -- --gw=4 ./exports/players-gw4.json
```

Gitignore: `players.json`, `players-gw*.json`, `incoming/`, `exports/`.

## Other schema
`teams`, `gameweeks`, `fixtures` (scores), `my_squad`, `final_squads`, `sketches`, `watchlist_*`

## Key app modules
- `difficulty.ts` — traffic light + לוח(5) average/buckets
- `squadRules.ts` — budget 120, max 2/club, XI/bench caps
- `squadOptions.ts` — ≤3 transfer suggestions
- `squadDraft.ts` — sessionStorage draft for sketches badges
- `CompactPlayerCard.svelte` — shared XI/bench card

## Scripts
`dev` · `check` · `db:push` · `db:dump` · `db:import-players` · `db:export-players` · `db:import-fixtures` · `db:studio`

## Season workflow (ops)
Full checklist: [docs/NEW-GAMEWEEK.md](NEW-GAMEWEEK.md).

- Player dump is ephemeral. `--gw` is the gameweek the dump represents (`as_of_gameweek` + `player_snapshots`), usually the round *after* the one that just finished. Confirm with Uri; do not guess.
- Results live in tracked `fixtures.json` (full season, GW1–26). Fill `homeScore`/`awayScore` for the finished round and set `currentRound` to the next one, then `bun run db:import-fixtures`.
- `db:import-fixtures` **deletes every fixture row** and reinserts from that file. Never point it at a partial file.
- Starting point in git: player snapshot GW4 only; fixture scores filled for GW1–3; GW4 scores still null.

## Static assets (no CDN at runtime)
- Team logos only: `static/assets/sport5/Files/...` (paths in DB like `/assets/sport5/...`)
- Fonts: `static/fonts/noto-sans-hebrew/` + `src/lib/fonts-noto.css`
- Player headshots / shirts are **not** used in the UI and are not stored locally
- Refresh logos: `bun run db:localize-assets` (also runs as part of player import for team logos)

