---
name: grill
description: Turn a vague WOBI feature idea into an agreed spec before any code — interview Uri in short rounds (product + technical), then write the result as an entry in docs/FUTURE-FEATURES.md with a phase plan. Use when Uri floats an idea rather than a concrete requirement, or says /grill. Not for clear requirements (use feature).
---

# Grill (WOBI) — idea → spec

No code in this skill. Output is one entry in `docs/FUTURE-FEATURES.md`.

## Before asking anything

Read the relevant code, `docs/PRODUCT.md`, `docs/TECHNICAL.md`, and existing entries in `docs/FUTURE-FEATURES.md` (the idea may already be there — update it, don't duplicate). Never ask Uri for a fact you can find in the repo or DB.

## Rounds

Use `AskUserQuestion` (up to 4 questions per round), each with a **recommended** option first. Ask only the frontier — questions whose prerequisites are already settled. Stop as soon as you could implement without guessing; 1–2 rounds is normal, 3 is a lot.

Cover what's actually open, from:
- **Product:** which decision does this help Uri make (transfers, lineup, captain)? Which page? What does he see/click? Non-goals?
- **Data:** do we already have it (`player_snapshots`, `player_round_stats`, `fixtures`, …)? Per-gameweek or season? What before GW5/GW7 when history is thin?
- **Technical:** new route vs extend existing; schema change or query only; risk to existing pages.

Real architecture choices get real options with trade-offs — don't present one as "the approach".

## Write the spec

Add/update the entry using the file's template (Hebrew, like the rest of the file):

```
## N. <שם>

**סטטוס:** מאושר

### מה
### למה
### UX מוצע
### נתונים
### סקיצת מימוש
### פתוחות / סיכונים
### שלבים
| # | שלב | בדיקה | ✓ |
|---|-----|-------|---|
| 1 | … | `bun run check` 0 errors + curl /route 200 | [ ] |
```

Phases: one testable unit each, ordered schema → server logic → route → component. Small features get one phase. Each phase names its concrete check.

## After writing

Show Uri the entry and wait for approval. Then implement phase by phase through the `feature` one-shot chain (each phase = one run of implement → verify → /review), ticking `✓` and setting `סטטוס: בעבודה` → `בוצע`.
