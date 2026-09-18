# WOBI — עזר חילופים Dream Team (Sport5)

Bun + SvelteKit + Drizzle + Postgres. ממשק עברית RTL לעזרה בחילופים בליגת החלומות של Sport5.

## דרישות

- [Bun](https://bun.sh)
- Postgres עם מסד בשם **`WOBI`** (case-sensitive)
- נתוני שחקנים ב־DB לפי מחזור (`player_snapshots`; כרגע **GW4**)

## נתוני שחקנים — אין `players.json` בריפו

מקור האמת הוא **Postgres**, לא קובץ JSON בגיט.

| סוג קובץ | מה זה | בגיט? |
|---|---|---|
| dump של Sport5 (JSON) | קובץ זמני שמביאים לכל מחזור חדש | **לא** (`players.json` / `players-gw*.json` ב־gitignore) |
| `db/dumps/latest.sql` | גיבוי מלא של ה־DB (`pg_dump`) | **כן** — commit נפרד של הדאטהבייס |

### עדכון מחזור (חוזר עד סוף העונה)
הצ׳קליסט המלא, כולל **תוצאות** של המחזור שהסתיים: [docs/NEW-GAMEWEEK.md](docs/NEW-GAMEWEEK.md).

1. dump שחקנים (לא בגיט): `bun run db:import-players -- --gw=P ./incoming/players-gwP.json`
2. תוצאות: לעדכן `fixtures.json` (לוח מלא שכבר בגיט) ואז `bun run db:import-fixtures` — הסקריפט מוחק את כל המשחקים ומייבא מחדש, אז אסור קובץ חלקי
3. `bun run db:dump` ואז commit של `fixtures.json`, ו־commit נפרד של `db/dumps/latest.sql`

פירוט: [docs/PRODUCT.md](docs/PRODUCT.md) · [docs/TECHNICAL.md](docs/TECHNICAL.md) · [db/README.md](db/README.md)

## התקנה

```bash
cd /Users/uri/projects/hobby/wobi
cp .env.example .env   # postgresql://uri@localhost:5432/WOBI
bun install
bun run db:push
# אם יש dump SQL בריפו:
# psql "$DATABASE_URL" -f db/dumps/latest.sql
# או ייבוא JSON למחזור:
# bun run db:import-players -- --gw=5 ./incoming/players-gw5.json
bun run db:import-fixtures   # אופציונלי
bun run dev
```

פתחו את הכתובת ש־Vite מדפיס (בדרך כלל http://localhost:5173).

## סקריפטים

| פקודה | תיאור |
|---|---|
| `bun run dev` | שרת פיתוח |
| `bun run db:push` | דחיפת סכמה ל־WOBI |
| `bun run db:import-players -- --gw=N ./dump.json` | ייבוא dump Sport5 למחזור N → `players` + `player_snapshots` |
| `bun run db:export-players -- --gw=N` | בניית JSON דמוי-Sport5 מ־`player_snapshots` |
| `bun run db:dump` | `pg_dump` → `db/dumps/latest.sql` (+ עותק מתוארך ב־gitignore) |
| `bun run db:import-fixtures` | ייבוא מ־`./fixtures.json` |
| `bun run db:studio` | Drizzle Studio |

## עמודים

1. **הקבוצה שלי** (`/squad`) — ברירת מחדל; XI + ספסל, פילטרים, staged  
2. **סקיצות** — טיוטות לפי מחזור  
3. **מחזור** — לוח משחקים + הרכב סופי  
4. **אפשרויות קבוצה** — עד 3 חילופים מהשמור  
5. **מעקב / הצעות חילופים** — קיימים; בתפריט נראים כבויים  

## קושי יריבות

- 🔴 מכבי תל אביב, הפועל תל אביב, מכבי חיפה, בית״ר/ביתר ירושלים, הפועל באר שבע  
- 🟡 מכבי נתניה, הפועל חיפה  
- 🟢 כל השאר  

עמדות: 1=שוער, 2=הגנה, 3=קישור, 4=התקפה.

## הערות

- אל תעלו `.env` ל־git
- אל תעלו dumps של **Sport5 JSON** לגיט — רק import עם `--gw`
- כן לעדכן בגיט את **`db/dumps/latest.sql`** אחרי `db:dump` (commit נפרד מהקוד)
- התעלמו מ־`1st.md` אם קיים

## Round history / momentum

כל `db:import-players` מעדכן גם `player_round_stats` מתוך `lastRoundPlayerStats`.  
UI מומנטום מתוכנן מ־**מחזור 7** (צריך ~3 מחזורים שמורים לשחקן).
