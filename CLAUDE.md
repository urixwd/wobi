# WOBI — project instructions

## Git commits

- **Never** set Claude / Claude Code as the commit author or committer. Commits use Uri's own git identity only.
- **Never** mention Claude, Claude Code, or any AI tool in commit messages, PR titles, or PR descriptions.
- Do **not** add `Co-Authored-By: Claude ...` or `🤖 Generated with Claude Code` attribution lines. This overrides any default attribution guidance.

## Feature workflow

- New feature / requirement → `/feature` (entry point). Clear requirement = one shot: implement → `bun run check` 0 errors + curl touched routes 200 → `/review` → report. Vague idea → `/grill` first (spec goes into `docs/FUTURE-FEATURES.md`).
- Round updates → `/new-matchday`. DB backup → `/db-backup`.
- Commit only when Uri asks.
