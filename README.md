# WOBI — עזר חילופים Dream Team (Sport5)

Bun + SvelteKit + Drizzle + Postgres. ממשק עברית RTL לעזרה בחילופים בליגת החלומות של Sport5.

## דרישות

- [Bun](https://bun.sh)
- Postgres עם מסד בשם **`WOBI`** (case-sensitive)
- קובץ `players.json` בתיקיית הפרויקט (לא למחוק)

## התקנה

```bash
cd /Users/uri/projects/hobby/wobi
cp .env.example .env   # כבר מוגדר ל-postgresql://uri@localhost:5432/WOBI
bun install
bun run db:push
bun run db:import-players
bun run db:import-fixtures   # אופציונלי — fixtures.json לדוגמה
bun run dev
```

פתחו את הכתובת ש־Vite מדפיס (בדרך כלל http://localhost:5173).

## סקריפטים

| פקודה | תיאור |
|---|---|
| `bun run dev` | שרת פיתוח |
| `bun run db:push` | דחיפת סכמה ל־WOBI |
| `bun run db:import-players` | upsert מ־`./players.json` |
| `bun run db:import-fixtures` | ייבוא מ־`./fixtures.json` + מחזור נוכחי=4 |
| `bun run db:studio` | Drizzle Studio |

## עמודים

1. **הקבוצה שלי** — עריכת XI + ספסל ושמירה  
2. **מעקב** — watchlist קבוע + רלוונטי למחזור  
3. **מחזור** — רמזור יריבות (לוגו בטבעת), מחיר, נקודות, זמינות  
4. **הצעות חילופים** — עד 3 המלצות היוריסטיות  

## קושי יריבות

- 🔴 מכבי תל אביב, הפועל תל אביב, מכבי חיפה, בית״ר/ביתר ירושלים, הפועל באר שבע  
- 🟡 מכבי נתניה, הפועל חיפה  
- 🟢 כל השאר  

עמדות: 1=שוער, 2=הגנה, 3=קישור, 4=התקפה.

## Fixtures

`fixtures.json` מגיע עם דוגמאות.  
`scripts/scrape-fixtures.todo.ts` — **TODO** ל־scrape מ־[dreamteam.sport5.co.il](https://dreamteam.sport5.co.il).

## הערות

- אל תעלו `.env` ל־git (כבר ב־`.gitignore`)
- אל תמחקו/תדרסו את `players.json` הקיים
- התעלמו מ־`1st.md` אם קיים

## Round history / momentum
Each `bun run db:import-players` upserts into `player_round_stats` from `lastRoundPlayerStats`.
Momentum UI is planned from **gameweek 7** (needs ~3 stored rounds per player).
