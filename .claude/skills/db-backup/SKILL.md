---
name: db-backup
description: Back up the WOBI Postgres database to db/dumps/latest.sql and commit it. Use whenever the user asks to back up, dump, or snapshot the DB, or to commit/refresh the database dump after data changes. Postgres is the source of truth; latest.sql is the only tracked dump.
---

# DB backup (WOBI)

Postgres is the source of truth. `db/dumps/latest.sql` is a full `pg_dump` and the **only** dump tracked in git. Dated copies `db/dumps/wobi-*.sql` are gitignored.

## Steps

1. Dump:
   ```bash
   bun run db:dump
   ```
   Writes both a dated `db/dumps/wobi-<ts>.sql` (gitignored) and `db/dumps/latest.sql` (tracked).

2. Commit **only** `latest.sql`, on its own commit (data is always a separate commit from code/files):
   ```bash
   git add db/dumps/latest.sql
   git commit -m "Refresh DB dump: <what changed>."
   ```

3. Push if the user asked to (or if this is part of a matchday update):
   ```bash
   git push
   ```

## Rules

- Never commit `players.json`, `players-gw*.json`, `incoming/`, `.env`, or dated `wobi-*.sql`. Confirm with `git status --short` — only `db/dumps/latest.sql` (and any intended code/data files) should appear.
- Data goes in its own commit, separate from `fixtures.json`/logos/code.
- Do not push unless asked; the dump commit alone is the backup.
- End commit messages with the attribution line the session's system reminder specifies.
