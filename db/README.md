# Database

Live source of truth: local Postgres **`WOBI`** (`DATABASE_URL`).

## What is tracked here
- `db/dumps/latest.sql` — full `pg_dump` of WOBI (schema + data), refreshed with `bun run db:dump`.
- Dated copies `db/dumps/wobi-YYYYMMDD-HHMM.sql` are **gitignored**.

## What is NOT here
- Sport5 **`players.json`** dumps — temporary import input only; never commit. See `docs/PRODUCT.md`.

## Commands
```bash
bun run db:dump
psql "$DATABASE_URL" -f db/dumps/latest.sql
bun run db:import-players -- --gw=5 ./incoming/players-gw5.json
bun run db:export-players -- --gw=4
```
