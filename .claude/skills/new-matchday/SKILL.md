---
name: new-matchday
description: Run the WOBI end-of-round update — import a new Sport5 player dump for a gameweek, fill the finished round's results in fixtures.json, reimport fixtures, verify, dump the DB, commit, push, and start dev. Use whenever Uri brings a new players.json dump and/or results for a completed round. See docs/NEW-GAMEWEEK.md for the canonical checklist.
---

# New matchday (WOBI)

Two separate jobs — do not mix them. Canonical checklist: `docs/NEW-GAMEWEEK.md`.

| Job | What | Where it lives |
|---|---|---|
| Finished-round results | who won, goals per team | `fixtures.json` (in git) + `fixtures` table |
| Player dump | prices, points, status after that round | temporary JSON (not in git) → `players` + `player_snapshots` |

## Two numbers — do not guess, ask if unstated

- **F** = the round that **finished** and needs results filled. `fixtures.json` `currentRound` is F before you start; its GW-F scores are `null`.
- **P** = the round the player dump **represents** (`--gw`). Normally `P = F + 1` (dump taken after the round ended). `--gw` writes `players.as_of_gameweek` and `player_snapshots.gameweek_number` — not Sport5's internal `roundId`. Don't guess a different number unless the file clearly isn't the post-round-F dump.

## Job 1 — player dump (P)

The dump is Sport5 format: `data[]` of teams, each with `players[]`.

```bash
mkdir -p incoming            # gitignored
cp <the dump> incoming/players-gw<P>.json
bun run db:import-players -- --gw=<P> ./incoming/players-gw<P>.json
```

Effect: `players` updated live (`as_of_gameweek = P`), full `player_snapshots` for P, `player_round_stats` updated (momentum, shown from GW7), team logos refreshed into `static/assets/sport5/` (logos only — ignore player headshots/shirts), players with `missingStatus = 2` skipped. Some players may stay at an older `as_of_gameweek` if not in the P live set — expected; their old snapshot is preserved.

**Never** commit the JSON or restore `players.json` to the repo root.

Sanity-check the dump before importing: valid JSON, `data[]` with ~14 teams and hundreds of players.

## Job 2 — results for finished round F

Source: results Uri pastes, else `https://www.one.co.il/Soccer/League/1` (JS-rendered; WebFetch won't read scores, so rely on the pasted text). `fixtures.json` is the **full** season (GW1–26, 182 games), already in git.

For each GW-F match set `homeScore` / `awayScore`, and set top-level `currentRound` to the **next** round (F+1).

**Score orientation** (critical): map each pasted match to its fixture by team. The pasted top team is the home team, and the left score number is the home score — verify by confirming every pasted top-team equals that fixture's `homeTeamId` in `fixtures.json`. Get team ids from the `teams` table (`SELECT id, name FROM teams`); the fixtures already carry Sport5 ids — never invent ids.

Edit `fixtures.json` with **targeted edits** (a full JSON round-trip is not byte-identical, so don't rewrite the whole file). Keep GW1–26 intact at 7 games each; the diff should be only the changed score lines + `currentRound`.

Then:
```bash
bun run db:import-fixtures
```
**Warning:** this deletes **every** `fixtures` row and reimports from `fixtures.json`. Never point it at a partial file — a missing match is deleted from the DB.

## Verify

```bash
DB="postgresql://uri@localhost:5432/WOBI"
psql "$DB" -c "SELECT gameweek_number, count(*) FROM player_snapshots GROUP BY 1 ORDER BY 1;"   # P present with full count
psql "$DB" -c "SELECT g.number, count(f.id) games, count(f.home_score) scored FROM fixtures f JOIN gameweeks g ON g.id=f.gameweek_id GROUP BY g.number ORDER BY g.number;"  # F = 7/7 scored
psql "$DB" -c "SELECT number, is_current FROM gameweeks WHERE is_current;"                       # is_current = P
```

## Save + push (two commits)

```bash
bun run db:dump
git add fixtures.json                       # + static/assets/sport5/ if logos changed
git commit -m "Fill round <F> results; open gameweek <F+1>."
git add db/dumps/latest.sql
git commit -m "Refresh DB dump: GW<P> snapshots + round <F> scores."
git push
```

Confirm `git status --short` shows nothing forbidden. Never commit `players.json`, `players-gw*.json`, `incoming/`, `.env`, or dated `wobi-*.sql`. (DB commit half = the [db-backup](../db-backup/SKILL.md) skill.)

## Finish

```bash
bun run dev
```
Start the dev server and report the URL.

## Don't

- Import a dump without `--gw`.
- Run `db:import-fixtures` on a partial file.
- Commit `.env`, `incoming/`, or any player JSON.
- Delete previous gameweeks' snapshots — every round is kept.
