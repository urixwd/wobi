---
name: feature
description: Entry point for any new WOBI feature, requirement, or behavior change Uri asks for (Hebrew or English). Routes it — a concrete requirement is implemented in one shot (implement → verify → /review → report); a vague idea goes to /grill first. Use whenever Uri describes something the app should do differently, unless it's a matchday/data update (new-matchday) or a DB backup (db-backup).
---

# Feature (WOBI) — entry point

Uri writes one message. This session is both orchestrator and implementer: no handoff, no task file for normal work.

## 1. Route the message

| Message is… | Path |
|---|---|
| **Requirement** — says what to build; a reasonable dev could start now | One-shot (below) |
| **Idea** — "maybe", "what if", unclear goal, several real product options | `/grill` (writes a spec into `docs/FUTURE-FEATURES.md`), then one-shot per phase once Uri approves |
| **Question** — "should we…?", "what do you think…?" | Answer it. Don't build until Uri says go. |
| New player dump / round results | `new-matchday` skill |
| Backup / dump the DB | `db-backup` skill |

When unsure between requirement and idea, treat it as a requirement and state the assumption you're making in one line.

## 2. One-shot chain

1. **Read context** — the files the change touches, plus `docs/TECHNICAL.md` (data model, modules) and `docs/PRODUCT.md` (pages, rules) where relevant. If the requirement matches an entry in `docs/FUTURE-FEATURES.md`, follow it.
2. **Blocking questions only** — ask only what you can't decide from the code and that would make you redo the work if you guessed wrong (e.g. which page, which gameweek number). Max one `AskUserQuestion` round. Everything else: pick the sensible option and list it under "Assumptions" in the report.
3. **Implement** — smallest change that does the job. No drive-by refactors. Match existing patterns (Hebrew RTL UI, team logos only, Tailwind 4, Svelte 5 runes, server logic in `src/lib/server/`).
   - Schema change: edit `src/lib/server/db/schema.ts` → `bun run db:push`. Data changed → note that a `db-backup` is due (don't run it unasked).
4. **Verify** — `bun run check` must end with `0 ERRORS 0 WARNINGS`. For every route touched, `curl -s -o /dev/null -w '%{http_code}' http://localhost:5174/<route>` → 200 (start dev with `sh dev/kill-ports.sh && sh dev/run.sh` in the background if it isn't running). DB changes: row count before/after.
5. **`/review`** — run the review skill on your diff. Fix what it flags, re-verify.
6. **Report**: what changed (files), the **Proof** section from `/review` (proof picked for this change, real output), and assumptions made. Visual claims that text can't prove → ask Uri for a screenshot or short video of the named page. No browser automation unless Uri allows it.
7. **Backlog** — if this implemented a `FUTURE-FEATURES.md` entry, set its `סטטוס` to `בוצע`.
8. **Commit only when Uri asks.** Then: one feature = one commit, code separate from `db/dumps/latest.sql`, self-describing message, no AI attribution (see `CLAUDE.md`).

## Rules

- Never claim done on a check you didn't run — say what's missing instead.
- A blocker (DB down, port taken, missing dump) → stop and tell Uri; don't work around it with fake data.
- Data/fixture files (`fixtures.json`, `player_snapshots`) are never edited as a side effect of a feature.
