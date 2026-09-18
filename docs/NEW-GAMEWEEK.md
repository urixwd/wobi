# מחזור חדש — מה עושים

מדריך תפעול. לקרוא אותו בכל פעם ש־Uri מביא dump חדש של שחקנים ו/או תוצאות של מחזור שהסתיים.

יש כאן **שתי עבודות נפרדות**. לא לערבב אותן.

| עבודה | מה זה | איפה נשמר |
|---|---|---|
| תוצאות המחזור שהסתיים | מי ניצח, כמה כל קבוצה כבשה | `fixtures.json` (כן בגיט) + טבלת `fixtures` |
| dump שחקנים | מחירים, נקודות, סטטוס אחרי אותו מחזור | JSON זמני (לא בגיט) → `players` + `player_snapshots` |

## לפני שמתחילים — שני מספרים

אל תניח. אם Uri לא אמר במפורש, לשאול:

1. **F** — המחזור **שהסתיים** ושצריך למלא לו תוצאות. בפעם הראשונה אחרי ההקמה זה מחזור 4 (ב־`fixtures.json` המחזור הנוכחי הוא 4, והתוצאות שם עדיין ריקות).
2. **P** — המחזור שה־dump של השחקנים **מייצג** (`--gw`). בדרך כלל זה המחזור הבא, P = F+1, כי הקובץ נלקח אחרי שהמחזור נגמר. לא לנחש אם יש ספק.

`--gw` נכתב ל־`players.as_of_gameweek` ול־`player_snapshots.gameweek_number`. זה לא אותו דבר כמו `lastRoundPlayerStats.roundId` של Sport5 (מזהה פנימי שלהם, לא בהכרח 1–26).

## 1. dump שחקנים

Uri מביא קובץ JSON בפורמט Sport5 (אותו מבנה שהיה ל־`players.json` הישן: `data[]` של קבוצות, ובתוכן `players`).

```bash
mkdir -p incoming
# לשים את הקובץ תחת incoming/ — התיקייה ב־gitignore
bun run db:import-players -- --gw=P ./incoming/players-gwP.json
```

מה קורה:

- `players` מתעדכן (תצוגה חיה) ו־`as_of_gameweek = P`
- נשמר snapshot מלא ב־`player_snapshots` למחזור P
- `player_round_stats` מתעדכן מ־`lastRoundPlayerStats` (בשביל מומנטום, מוצג מ־מחזור 7)
- לוגואים חדשים של קבוצות יורדים ל־`static/assets/sport5/` (רק לוגואים; תמונות שחקנים לא בשימוש)
- שחקנים עם `missingStatus = 2` לא נכנסים

**לא** לעשות commit ל־JSON. לא להחזיר `players.json` לשורש הריפו כקובץ קבוע.

## 2. תוצאות המחזור שהסתיים

מקור התוצאות עד עכשיו: [one.co.il — ליגת העל](https://www.one.co.il/Soccer/League/1). אפשר גם ממה ש־Uri מדביק.

הקובץ `fixtures.json` **כבר בגיט** והוא לוח העונה המלא (מחזורים 1–26, 182 משחקים). תוצאות של 1–3 ממולאות. ממחזור 4 והלאה `homeScore` / `awayScore` הם `null`.

לכל משחק במחזור F לעדכן:

```json
{ "gameweek": 4, "homeTeamId": 134, "awayTeamId": 130, "kickoff": "...", "homeScore": 2, "awayScore": 1 }
```

ולשנות בראש הקובץ את `currentRound` למחזור **הבא** (הפתוח עכשיו), לא למחזור שהסתיים.

אחרי שהקובץ המלא מעודכן:

```bash
bun run db:import-fixtures
```

**אזהרה:** הסקריפט מוחק את **כל** שורות `fixtures` ומייבא מחדש מ־`fixtures.json`. אסור להחליף את הקובץ ברשימה חלקית של מחזור אחד. אם חסר משחק בקובץ — הוא יימחק מה־DB.

התוצאה מופיעה ב־`/squad` וב־`/gameweek` באמצע בין הסמלים (למשל `2:1`) במקום המילה «נגד».

מזהי קבוצות (homeTeamId / awayTeamId) הם ה־id של Sport5 שכבר בטבלת `teams`. לא להמציא id.

## 3. בדיקה קצרה

```bash
# snapshots של P, ותוצאות של F
psql "$DATABASE_URL" -c "SELECT as_of_gameweek, count(*) FROM players GROUP BY 1;"
psql "$DATABASE_URL" -c "SELECT gameweek_number, count(*) FROM player_snapshots GROUP BY 1 ORDER BY 1;"
psql "$DATABASE_URL" -c "SELECT g.number, count(f.id) AS games, count(f.home_score) AS scored FROM fixtures f JOIN gameweeks g ON g.id = f.gameweek_id GROUP BY g.number ORDER BY g.number;"
psql "$DATABASE_URL" -c "SELECT number, is_current FROM gameweeks WHERE is_current OR number IN (F);"
```

ואז `bun run dev` ולוודא ב־`/gameweek` שהתוצאות של F מופיעות, וב־`/squad` שהשחקנים והלוגו תקינים.

## 4. לשמור בגיט

```bash
bun run db:dump
```

שני commits, כמו תמיד כשיש גם קוד/קבצים וגם דאטה:

1. `fixtures.json` (ואם השתנו לוגואים — גם `static/assets/sport5/`)
2. `db/dumps/latest.sql` לבד

ואז `git push`. ה־JSON של השחקנים לא נכנס.

עותקים מתוארכים `db/dumps/wobi-*.sql` ב־gitignore. בגיט רק `latest.sql`.

## 5. מה לא לעשות

- לא לייבא dump בלי `--gw`
- לא להריץ `db:import-fixtures` על קובץ חלקי
- לא לעשות commit ל־`.env`, ל־`incoming/`, או ל־`players.json`
- לא למחוק snapshots של מחזורים קודמים — כל מחזור נשאר
- מומנטום (שלושה מחזורים) עדיין לא ב־UI; הנתונים רק נאגרים עד מחזור 7

## מצב נוכחי (נקודת הפתיחה)

- שחקנים: snapshot של **מחזור 4** בלבד
- תוצאות משחקים: מחזורים 1–3 מלאים, **מחזור 4 בלי תוצאות**
- `currentRound` ב־`fixtures.json`: 4
