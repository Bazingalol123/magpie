# Magpie — P0 Change Plan
## Draft for Approval

**Status:** טיוטה לאישור — אין לבצע שינויי קוד או פריסה לפני אישור מפורש.

**Project:** Magpie
**Repository:** `https://github.com/Bazingalol123/magpie`
**Application:** `https://magpiecapture.com`
**Prepared by:** Alfred
**Analysis model:** `gpt-5.6-luna` via `openai-codex`
**Date:** 2026-08-14

---

## 1. מטרת המסמך

מסמך זה מגדיר את השינויים הקריטיים הבאים ב-Magpie, את גבולותיהם, את שכבות המערכת שיושפעו, את חוזי ה-API, את הבדיקות ואת תנאי היציאה לפריסה.

המסמך נועד לקריאה ולאישור לפני ביצוע.

הוא **אינו** אישור ל:

- שינוי קוד.
- יצירת branch או worktree.
- commit או push.
- שינוי Entities או Functions מרוחקים.
- פריסת Backend, Agent או אתר.
- שינוי הרשאות או הגדרות production.

---

## 2. החלטות יסוד

### 2.1 נשארים בשלב זה עם Base44

אין לבצע migration מ-Base44 במסגרת תוכנית P0.

הסיבה: צווארי הבקבוק הנוכחיים הם אמינות מסלול המוצר, pagination, חוויית הפעלה, תמונות והגנות abuse — לא עצם בחירת Base44.

כן נשמור על גבולות API שיאפשרו migration עתידי אם יופיע bottleneck מוכח.

### 2.2 שומרים על גבול האמון הקיים

```text
Dashboard user
  → authenticated SDK / backend functions

Chrome Extension
  → plain fetch
  → pairing-authenticated backend functions בלבד

Backend functions
  → authentication + owner validation
  → shared domain logic
  → service-role entity operations

Realtime
  → owner-scoped Dashboard subscriptions
```

ה-Extension נשאר client לא-מהימן ובעל יכולת כתיבה מוגבלת בלבד. אין להוסיף לו יכולת לקרוא Records, Collections, Enrichments או נתוני משתמש.

### 2.3 כל שינוי חייב להיות הפיך

אין לבצע migration הרסני, rename ל-Base44 Entities, שינוי מבנה היררכי בלתי הפיך או מחיקת מידע כחלק מה-P0.

כל פיצ'ר חדש צריך להיות ניתן להסתרה, rollback או השבתה בלי לפגוע בנתונים קיימים.

### 2.4 מסמך זה קודם לקוד

לפני כל שינוי:

1. מאשרים את הסקופ.
2. מאמתים את חוזה ה-API הרלוונטי מול Base44.
3. מוסיפים או מעדכנים fixtures ובדיקות.
4. מבצעים שינוי מקומי בלבד.
5. מריצים gates.
6. מציגים diff ותוצאות.
7. מבקשים אישור נפרד לכל פעולה מרוחקת או deploy.

---

## 3. המצב הקיים שנבדק

### 3.1 שכבות המערכת

#### Dashboard

```text
src/App.jsx
  → src/api/base44Client.js
  → @base44/sdk
  → Base44 Auth / Entities / Functions / Realtime
```

ה-Dashboard משתמש כיום ב-Entity reads, subscriptions ו-function invocations.

#### Extension

```text
extension/content.js / popup.js
  → extension/service-worker.js
  → plain fetch()
  → Base44 function endpoint
  → pairing token ב-chrome.storage.local
```

ה-Extension אינו מייבא `@base44/sdk`.

#### Backend

```text
Base44 function
  → createClientFromRequest()
  → caller authentication
  → owner / principal validation
  → shared domain logic
  → asServiceRole
  → entities / file storage
```

### 3.2 מסמכי API קיימים

- `docs/API.md` — API ציבורי: principals, endpoints, requests ו-responses.
- `docs/API_AND_FAILURE_MAP.md` — חוזים הנדסיים, failure states, HTTP statuses ו-security invariants.
- `docs/V3_1_PRODUCT_AND_RISK_PLAN.md` — מטריצת שינוי, סיכון, Backend surface, migration ו-rollback.

### 3.3 פער שנמצא בין התיעוד לקוד

התיעוד קובע שכל durable write עובר דרך Backend Function.

ב-`src/App.jsx` קיימת לפחות כתיבה ישירה אחת:

```js
base44.entities.Record.update(...)
```

היא משמשת לעדכון `decision_status` ו-`next_action`.

ב-P0 נבדוק אם היא חייבת לעבור ל-Backend Function ייעודית, כדי שכל הכתיבות יקבלו אותו owner validation, audit ו-contract. אין להניח שהמעבר יבוצע לפני אימות השפעתו על המוצר.

---

# 4. P0-A — סגירת מסלול הדמו מקצה לקצה

## מטרת השינוי

להבטיח שמשתמש חדש יכול לעבור בצורה ברורה וצפויה:

```text
Landing
  → Sign in
  → Pair extension
  → Capture ראשון
  → ingest
  → routing
  → Record
  → Dashboard realtime
```

## הבעיה

המערכת כוללת את הרכיבים, אך המסלול אינו חד מספיק למשתמש חדש. לא תמיד ברור:

- מה לעשות אחרי sign-in.
- איך לבצע pairing.
- איך לדעת שה-Extension מחובר.
- מה קרה ל-Capture.
- איפה נמצא Item חדש.
- מה לעשות כאשר routing נכנס ל-Needs review.

## Frontend surface

- Landing CTA ברור להתקנת Extension.
- Dashboard first-run checklist.
- Pairing state machine:
  - לא מחובר.
  - token נוצר.
  - ממתין לחיבור.
  - מחובר.
  - token לא תקף.
  - נדרש re-pair.
- Empty state שמסביר את הפעולה הבאה.
- הודעת capture ברורה עם `routing_status`.
- Deep link ל-Needs review או ל-Item כאשר יש מזהה בטוח.
- מצבי loading, error, success ו-retry.

## Backend/API surface

בשלב הראשון יש להעדיף שימוש ב-endpoints הקיימים:

- `create-extension-pairing`
- `extension-context`
- `ingest-clip`
- `resolve-routing`
- `classify-clip`

אין להוסיף endpoint חדש אם חוזה קיים מספיק.

## Acceptance criteria

- משתמש חדש מבין בתוך כמה שניות מה הצעד הבא.
- Pairing failure אינו נראה כמו capture failure.
- Capture מקבל status מפורש.
- `needs_review` מוצג כמצב עסקי תקין ולא כ-crash.
- במסלול replay מלא, Capture מופיע ב-Dashboard ללא reload ידני.

## סיכון

**Likelihood:** 2
**Impact:** 3
**Score:** 6 — Moderate

## Rollback

UI-only rollback או הסתרת checklist. אין שינוי schema נדרש.

---

# 5. P0-B — הפרדת Dashboard משכבת Base44 באמצעות API/Repository layer

## מטרת השינוי

לרכז את התלות ב-Base44 במקום לפזר אותה ברחבי ה-UI, בלי לצאת מ-Base44.

## המצב הרצוי

```text
React components
  → application API / repositories
  → Base44 adapter
  → SDK או Backend Functions
```

## השינוי המוצע

ליצור שכבה ברורה, לדוגמה:

```text
src/api/dashboardRepository.js
src/api/records.js
src/api/collections.js
src/api/pairing.js
src/api/functions.js
```

שמות הקבצים הסופיים ייקבעו לאחר audit של השימושים הקיימים.

השכבה תבודד:

- Entity reads.
- Realtime subscriptions.
- Function invocation.
- DTO mapping.
- Error normalization.
- Pagination parameters.

## כלל כתיבה

יש לבדוק ולהחליט על העברת הכתיבה הישירה:

```js
base44.entities.Record.update(...)
```

אל Backend Function ייעודית, לדוגמה:

```text
update-item-decision
```

הפונקציה, אם תאושר, תבצע:

- authentication.
- owner validation.
- validation של `decision_status` ו-`next_action`.
- write server-side.
- response typed וברור.

## API contract מוצע לכתיבה

```text
POST /functions/update-item-decision
```

Request:

```json
{
  "record_id": "string",
  "decision_status": "shortlisted | contacted | rejected | ..."
}
```

Success:

```json
{
  "updated": true,
  "record_id": "string",
  "decision_status": "string",
  "next_action": "string"
}
```

Expected failures:

- `400` — input לא תקין.
- `401` — משתמש לא מחובר.
- `403` — Record אינו בבעלות המשתמש.
- `404` — Record לא נמצא.
- `409` — state conflict, אם רלוונטי.
- `500` — תקלה פנימית כללית.

## Acceptance criteria

- רכיבי UI אינם מבצעים Entity writes ישירים.
- כל write חדש מקבל validation בצד השרת.
- שגיאות API מנורמלות באותה צורה.
- לא משתנה חוזה ה-Extension.
- אין שינוי ביכולת הקריאה או הכתיבה של ה-Extension.

## סיכון

**Likelihood:** 3
**Impact:** 3
**Score:** 9 — Moderate

## Rollback

להחזיר את ה-adapter הקודם או להשבית את הפעולה החדשה. אין migration אם משתמשים בשדות קיימים בלבד.

---

# 6. P0-C — Pagination אמיתי בצד השרת

## מטרת השינוי

להפסיק להציג pagination מקומי שמוגבל ל-200 רשומות, ולבנות טעינה אמיתית לפי Collection/עמוד.

## הבעיה המאומתת

ב-`src/App.jsx` קיימות קריאות עם מגבלה:

```js
Record.list(..., 200)
Clip.list(..., 200)
Enrichment.list(..., 200)
RoutingDecision.list(..., 200)
WatchRule.list(..., 200)
```

לאחר מכן ה-UI משתמש ב-`slice()` מקומי. לכן עמוד 2 אינו בהכרח מידע חדש מהשרת.

## שינוי מוצע

```text
Active Collection
  → scoped query
  → limit + cursor/skip מאומת
  → page records
  → hasMore או count
```

יש לאמת מול Base44 את חתימות:

- `filter`.
- `list`.
- `limit`.
- `skip` או cursor.
- count, אם קיים.

אין להניח חתימות SDK.

## Backend surface

אפשרות מועדפת:

```text
GET/POST backend query function
  → owner validation
  → Collection scope validation
  → paginated Records
  → bounded related Clip metadata
```

אפשרות חלופית:

- adapter שמרכז את SDK query, אם ה-SDK מספק pagination בטוח.

הבחירה תיעשה רק אחרי contract spike.

## Frontend surface

- טעינה לפי Collection פעילה.
- `hasMore` או count אמיתי.
- loading בין עמודים.
- reset עמוד בעת החלפת Collection.
- הודעה ברורה כאשר אין נתונים נוספים.
- לא להציג count שגוי על בסיס מערך חלקי.

## Acceptance criteria

- Dataset עם יותר מ-200 Records נטען בשלמותו בעמודים.
- שתי Collections אינן מערבבות נתונים.
- הרשאות owner נשמרות.
- realtime אינו גורם לטעינת כל הנתונים מחדש ללא צורך.
- pagination fixture עובר עם יותר מעמוד אחד.

## סיכון

**Likelihood:** 4
**Impact:** 4
**Score:** 16 — Critical

## Rollback

Feature flag או חזרה לטעינת המימוש הקודם, בלי מחיקת מידע. אין deploy לפני contract tests ו-fixtures.

---

# 7. P0-D — תיקון ואימות תמונות

## מטרת השינוי

למנוע מתמונות או screenshots להימתח, להיחתך או לקבל יחס שגוי ב-Collection Cards.

## הניתוח

כבר קיים ניסיון CSS עם `aspect-ratio` ו-`object-fit: contain`, ולכן אין להניח שהבעיה היא CSS בלבד.

יש לבדוק את המסלול המלא:

```text
content.js
  → capture rectangle
  → service-worker crop
  → upload/storage
  → screenshot_id
  → screenshotUrlFor()
  → RecordCardGrid
  → browser rendering
```

## בדיקת root cause

לשחזר:

- תמונה רחבה.
- תמונה אנכית.
- תמונה ריבועית.
- screenshot של element.
- image capture.
- תמונה חסרה או URL שבור.

## שינוי אפשרי

בהתאם ל-root cause:

- תיקון crop ב-Extension.
- שמירת width/height או aspect ratio.
- הפרדת image capture מ-element screenshot.
- התאמת container ליחס טבעי.
- `contain` לתמונה מקורית ו-`cover` רק כאשר crop מכוון.
- fallback יציב ללא layout shift.

## Acceptance criteria

- אין עיוות תמונה.
- crop מכוון נשאר מכוון.
- תמונה אנכית אינה נמתחת לרוחב.
- תמונה רחבה אינה נמחצת לגובה.
- אין regression למסלול capture הקיים.

## סיכון

**Likelihood:** 3
**Impact:** 3
**Score:** 9 — Moderate

## Rollback

החזרת CSS/renderer או ביטול Cards עבור Collections בעייתיות. אין שינוי backend אם לא נדרש metadata חדש.

---

# 8. P0-E — הגנת abuse ל-report-bug

## מטרת השינוי

להגן על endpoint שמייצר GitHub Issues דרך token server-side.

## הבעיה המאומתת

`report-bug` כולל authentication ו-validation, אך אין בו מנגנון durable וברור של:

- rate limit per user.
- quota.
- duplicate detection.
- backoff.
- מניעת יצירת מאות Issues.

## שינוי מוצע

```text
Signed-in user
  → validate
  → durable rate limit/quota
  → duplicate fingerprint
  → GitHub API
```

אין להשתמש ב-in-memory Map כמנגנון יחיד, כי פונקציות עשויות לרוץ על instances שונים.

יש לבחור מנגנון state נתמך ומאובטח, לדוגמה Entity ייעודי או storage רשמי, לאחר בדיקת Base44.

## כלל חשוב

ה-token של GitHub נשאר אך ורק בצד השרת. הוא אינו מגיע ל-Frontend או ל-Extension.

## Acceptance criteria

- משתמש מחובר יכול לשלוח דיווח תקין.
- חריגה מהמכסה נעצרת לפני פנייה ל-GitHub.
- דיווח כפול מזוהה או מוחזר כדיווח קיים.
- משתמשים שונים אינם חולקים quota בטעות.
- כשל GitHub אינו חושף response גולמי.
- בדיקות מוודאות ש-GitHub לא נקרא כאשר הבקשה נחסמה מראש.

## סיכון

**Likelihood:** 3
**Impact:** 4
**Score:** 12 — High

## Rollback

להשבית זמנית את הטופס או להחזיר validation בסיסי בלבד, בלי לחשוף את ה-token ובלי לשנות Issues קיימים.

---

# 9. P0-F — Pairing, revoke ו-re-pair

## מטרת השינוי

להפוך את חיבור ה-Extension לזרימה ברורה וניתנת לשחזור.

## מצבים שיש לתמוך בהם

- token נוצר אך לא שומש.
- token לא תקף.
- התקנה ישנה.
- Extension הותקן מחדש.
- המשתמש רוצה revoke.
- מספר התקנות פעילות.
- capture נכשל לאחר pairing.

## Frontend surface

- מצב חיבור.
- last seen / last capture, אם קיים מידע בטוח לכך.
- revoke להתקנה.
- יצירת token חדש.
- הודעת recovery.

## Backend surface

להעדיף הרחבה של מנגנונים קיימים. כל endpoint חדש חייב:

- להיות dashboard-only.
- לבצע owner validation.
- לא להחזיר pairing secret לאחר יצירתו הראשונית.
- לא להוסיף read capability ל-Extension.

## סיכון

**Likelihood:** 3
**Impact:** 4
**Score:** 12 — High

## Rollback

להסתיר את פעולות revoke/re-pair ולהשאיר את מנגנון pairing הקיים.

---

# 10. P0-G — בדיקות אמון, API ו-replay

## מטרת השינוי

להוכיח שהמערכת עובדת, לא רק שהקוד נבנה.

## בדיקות נדרשות

### API contracts

- בקשה תקינה.
- JSON לא תקין.
- auth חסר.
- token לא תקף.
- cross-owner ID.
- resource חסר.
- conflict.
- expected source failure.
- unexpected fault.

### Trust boundary

- Extension token אינו קורא Records.
- Extension token אינו קורא Collections.
- Extension token אינו קורא Enrichments.
- Dashboard user אינו קורא נתוני owner אחר.
- Admin role אינו עוקף owner isolation.
- Agent אינו מקבל entity tools ישירים.

### Pagination

- יותר מ-200 Records.
- מעבר עמודים.
- Collection scope.
- realtime בזמן pagination.
- count/hasMore.

### Images

- wide / portrait / square.
- crop.
- missing image.
- broken image URL.

### Replay מלא

```text
pair
→ capture product
→ capture article
→ capture job
→ ingest
→ routing existing/new/review
→ realtime Dashboard
→ resolve review
→ enrich one Item
→ blocked-source recovery
```

## תנאי הצלחה

אין לסמן שלב כ-complete על בסיס build בלבד. כל שלב צריך:

- test output אמיתי.
- fixture או replay.
- תיעוד של known limitations.
- הבחנה בין local verified לבין hosted verified.

---

# 11. Documentation updates

במהלך הביצוע יש לעדכן:

- `docs/API.md` — חוזים ציבוריים.
- `docs/API_AND_FAILURE_MAP.md` — failure states ו-security invariants.
- `docs/BUILD_GUIDE.md` — checkpoints ותוצאות אמיתיות.
- `docs/ENGINEERING_NOTES.md` — quirks, dead ends ופתרונות.
- `docs/DECISIONS.md` — מה בכוונה לא נבנה ולמה.
- מסמך זה — סטטוס, החלטות, verification ו-rollback.

אין להציג יכולת כ-"working" אם נבדקה רק מקומית, ואין להציג deployment אם לא נמצא evidence חי.

---

# 12. מה מחוץ לסקופ

ב-P0 לא לבצע:

- יציאה מ-Base44.
- migration ל-Cloudflare, Supabase או Backend אחר.
- שינוי שמות Base44 Entities.
- schema editor מלא.
- crawler או server-side arbitrary URL retrieval.
- mobile share target.
- arbitrary folder depth.
- folders שמשפיעים על routing.
- swarm מרובה-סוכנים ללא צורך ממשי.
- שינוי credentials או authentication provider.
- deploy מרוחק ללא אישור מפורש.

---

# 13. סדר ביצוע מוצע

## Gate 0 — אישור התוכנית

- אישור המסמך.
- אישור הסקופ.
- אישור סדר העדיפויות.
- החלטה אם `update-item-decision` נכנס ל-P0 או ל-P1.

## Gate 1 — Audit ו-contract spikes

- אימות Base44 pagination.
- אימות state storage ל-rate limit.
- audit של כל Entity writes מה-Frontend.
- שחזור תמונות.
- הוספת fixtures לפני implementation.

## Gate 2 — Local implementation

1. API/repository boundary.
2. P0 capture/onboarding.
3. Pagination.
4. Image fix.
5. Bug-report abuse controls.
6. Pairing recovery.

## Gate 3 — Local verification

- backend tests.
- frontend build.
- extension syntax/import checks.
- contract fixtures.
- replay מלא.
- security checks.

## Gate 4 — אישור פריסה נפרד

לפני כל פעולה מרוחקת יוצג דוח הכולל:

- קבצים שהשתנו.
- diff summary.
- tests.
- known failures.
- migration impact.
- exact deploy commands.
- rollback.
- האם משתנים Entities, Functions, Agent או Site.

רק לאחר אישור נפרד תתבצע פעולה מרוחקת.

---

# 14. החלטות נדרשות מהבעלים

יש לאשר או לדחות:

1. האם תוכנית P0 היא הסקופ הרצוי.
2. האם להעביר את `Record.update` הישיר ל-Backend Function.
3. האם pagination ימומש דרך Function ייעודית או דרך SDK adapter, בכפוף לאימות חתימות Base44.
4. האם Pairing revoke/re-pair הוא P0 או P1.
5. האם abuse controls ל-report-bug הם תנאי חסימה לפני כל שימוש רחב.
6. האם לאשר יצירת branch/worktree לאחר אישור המסמך.
7. האם לאשר בהמשך פעולות deploy בנפרד.

---

# 15. סטטוס אישור

```text
P0 plan approved:        [ ] כן   [ ] לא   [ ] עם תיקונים
API layer approved:      [ ] כן   [ ] לא   [ ] עם תיקונים
Direct Record.update:    [ ] להעביר ל-Backend Function
Pagination approach:     [ ] Function   [ ] SDK adapter   [ ] להחליט לאחר spike
Pairing recovery:        [ ] P0        [ ] P1
Bug-report abuse gate:   [ ] חובה לפני הרחבה   [ ] P1
Code changes approved:   [ ] כן   [ ] לא
Remote deploy approved:  [ ] כן   [ ] לא — יידרש אישור נפרד
```

---

## סיכום מנהלים

ה-P0 אינו migration ואינו refactor כולל. הוא נועד להפוך את Magpie למוצר שאפשר להדגים, לבדוק ולתחזק בביטחון:

1. מסלול משתמש ברור.
2. שכבת API מבודדת.
3. pagination אמיתי.
4. תמונות תקינות.
5. הגנת abuse.
6. pairing ניתן לשחזור.
7. בדיקות replay ו-trust boundary.
8. תיעוד שמפריד בין verified local, verified hosted ו-planned.

**המסמך מוכן לקריאה ולאישור.**
