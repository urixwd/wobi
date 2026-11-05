---
name: review
description: Self-review gate for WOBI changes before claiming work done. Checks the diff against what Uri asked and project conventions, runs the real checks (svelte-check, curl touched routes), and proves the behavior with evidence picked per change. For visual claims it asks Uri for a screenshot or video. Use at the end of every feature/fix, or when Uri asks "check your work" / /review.
---

# Review (WOBI) — before saying "done"

## 1. Scope the diff

```bash
git status --short
git diff            # plus untracked files the change added
```

The working tree may already hold Uri's unrelated uncommitted changes. Review only the files this task touched; never revert or "clean up" the rest.

## 2. Against the request

- Does every part of Uri's message (or the spec phase) have a matching change?
- Anything changed that wasn't asked for? Drive-by edits → revert or flag them.
- Any assumption made silently? It goes in the report.

## 3. Against WOBI conventions

- UI is Hebrew RTL; new strings in Hebrew, matching the tone of the surrounding UI.
- Images: team logos only, from `static/assets/sport5/` — no player headshots/shirts, no runtime CDN.
- Server-only logic and DB access in `src/lib/server/`; squad rules come from `squadRules.ts` (budget 120, max 2 per club), not re-hardcoded.
- Gameweek logic: snapshot data is per `gameweek_number`; don't mix it with Sport5 `roundId` (see `docs/TECHNICAL.md`).
- No edits to `fixtures.json`, `incoming/`, `.env`, or dumps as a side effect.
- Docs: if behavior described in `docs/PRODUCT.md` / `docs/TECHNICAL.md` changed (pages, modules, scripts), update that line.

## 4. Run the checks (paste real output in the report)

```bash
bun run check                       # must be 0 ERRORS 0 WARNINGS
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5174/<each touched route>   # 200
```

Schema touched → `bun run db:push` succeeded and affected tables still have the expected row counts.

## 5. Prove the behavior

Steps 1–4 show the code is healthy. They don't show the feature works: a 200 means the page loads, not that the new thing is on it or correct. Every change needs proof that it **does what Uri asked**.

**Choose the proof for this specific change.** Don't run a fixed checklist. Ask: *what is the cheapest evidence that would convince Uri this works, and that would fail if it didn't?* Prefer direct, falsifiable checks over indirect ones. Combine tactics when one isn't enough, and skip the ones that add nothing.

Tactics to choose from (examples, not a mandatory list):

| Change looks like… | Strong proof |
|---|---|
| New / changed UI text or element | `curl` the page and grep the HTML for it, quoting the matched lines. Check it's absent (or different) on `git stash` if "before" matters. |
| Server logic / load function | Run it against real gameweek data (`bun -e` / a scratch script) and show the output before and after. |
| DB / schema | SQL showing the new columns or rows, with row counts before and after. |
| Calculation (points, deciles, difficulty, suggestions) | One worked example: a specific real player or fixture, the value computed by hand from the DB, and the value the app shows. Include an edge case (0 minutes, early GW with thin history). |
| Filter / sort / rule (budget, max 2 per club) | A case that should pass and a case that should be rejected, both shown. |
| Interaction, layout, RTL alignment, spacing, anything "how it looks/feels" | This can't be proven from text. Ask Uri for a **screenshot** of the exact page and spot, or a short **screen recording** when it involves motion or a sequence (hover, drag, modal flow, transitions). Name the URL and what to look for. Use browser automation only if Uri explicitly allows it. |
| PNG / file export | Generate the file and inspect it (open the image with Read, check dimensions and contents). |

Ask for a screenshot or video only when it's actually needed, meaning the claim is visual and no text-level check can settle it. Don't ask for visual proof of something a grep or query already proves.

## 6. Report

End with a **Proof** section, one line per claim:

```
Proof
- <claim> → <command or method> → <real output, trimmed>
- <claim> → NOT PROVEN: <why> — <what's needed, e.g. "screenshot of /squad bench row">
```

Never paraphrase output you didn't see. Anything unproven is labeled as such. It isn't rounded up to "done".

## Blocks "done"

- `bun run check` has any error or warning
- A touched route isn't 200
- A check couldn't be run (say what's needed — e.g. dev server, DB)
- Unexplained out-of-scope changes
- No behavior proof for a claim. It's either proven or reported as NOT PROVEN together with what's needed (for visual claims, ask Uri for the screenshot or video).
