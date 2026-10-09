# Log It! — Product & Technical Spec

A personal, mobile-first web app for logging gym and pool sessions, estimating calories burned, and reviewing history. Hosted on GitHub Pages, synced with Firebase, mirrored to a Google Sheet, and exportable to Excel.

Single user (the owner). Primary device: iPhone (Safari, added to Home Screen). Secondary: desktop browser.

---

## 1. Goals

- Log everything inside a **session**: start it on arrival, add exercises as you go, finish it on leaving.
- Capture per-set lifting data (weight + reps, any number of sets) and per-stroke swim laps.
- Estimate calories burned per exercise and per session, to support a calorie-deficit diet.
- Record session context: location, times, duration, journal, ratings.
- Record daily body weight, and use it for calorie estimates.
- Show a calendar with colored markers by exercise type.
- Sync across devices, work offline at the gym, mirror finished sessions to Google Sheets automatically, and export to Excel/CSV.

## 2. Non-goals (v1)

- Multiple users or sharing.
- Importing historical data, including body weight from Lose It! or Apple Health (a web app can't read Apple Health; weight is entered manually).
- Two-way sync with Google Sheets (the sheet is a read-only mirror).
- Logging exercises outside a session.
- Workout programs, plans or recommendations.

---

## 3. Tech stack

| Concern | Choice |
|---|---|
| Frontend | React + TypeScript, built with Vite. React Router (hash routing, so deep links work on GitHub Pages without server rewrites). Firestore listeners wrapped in custom hooks (`useSession`, `useSessions(range)`, `useSettings`, `useWeights(range)`), subscribing in `useEffect` and unsubscribing on cleanup |
| Hosting | GitHub Pages, deployed by a GitHub Actions workflow on push to `main` |
| Auth | Firebase Authentication, Google provider |
| Database | Cloud Firestore with persistent local cache (offline support) |
| Sheets mirror | Firebase Cloud Functions (2nd gen, Node 20+) using the Google Sheets API |
| Excel export | SheetJS (client-side). Note: install from the SheetJS CDN tarball, not the outdated npm registry version |
| App shell | PWA manifest + Apple touch icon so it runs full-screen from the iPhone Home Screen; service worker for offline loading of the app shell |

Firebase project must be on the **Blaze (pay-as-you-go)** plan for Cloud Functions. Expected usage is well within the free allowance.

### Auth notes for iOS Safari
- Use `signInWithPopup`, not `signInWithRedirect`. Redirect sign-in is unreliable on Safari when the app is hosted on a different domain from the Firebase auth domain.
- Add the GitHub Pages domain (e.g. `<username>.github.io`) to Firebase Auth → Authorized domains.

---

## 4. Concepts

- **Session**: one visit to a gym/pool. Has a start, an end, a location, ratings, a journal and a list of entries. A session may contain both lifting and swimming.
- **Entry**: one exercise within a session. Either a **lifting entry** (exercise + sets) or a **swim entry** (laps per stroke).
- **Group**: the category used for calorie factors and calendar colors.

| Group | Covers | Calorie factor | Color |
|---|---|---|---|
| `arms` | biceps, triceps | 0.8 | orange |
| `upper` | shoulders, chest, back, core | 1.0 | blue |
| `legs` | quads, hamstrings, glutes, calves | 1.3 | purple |
| `swim` | all swimming | n/a | teal |

Only **one session can be active** at a time.

---

## 5. Data model (Firestore)

All data lives under the signed-in user's document.

```
users/{uid}                         settings document
users/{uid}/sessions/{sessionId}    one document per session, entries embedded
users/{uid}/locations/{locationId}  remembered gyms/pools
users/{uid}/exercises/{exerciseId}  user-added custom exercises, plus remembered preferences for built-ins
users/{uid}/weights/{YYYY-MM-DD}    one body-weight entry per day
```

Entries are embedded in the session document (a session is small and bounded), so editing a session is a single atomic write.

### 5.1 `users/{uid}` — settings

```ts
{
  bodyWeight: number;          // fallback when no weigh-in exists (see §5.5)
  bodyUnit: "lb" | "kg";       // unit for body weight entry and display
  liftUnit: "lb" | "kg";       // unit for weights lifted
  restSec: number;             // default 90
  restMode: "fixed" | "actual";// default "fixed" (see §6.3)
  calorieMode: "net" | "total";// default "net"
  eatBackPct: number;          // default 50
  defaultPool: "25m" | "25yd" | "50m";
  forgotFinishHours: number;   // default 4
  sheetId: string | null;      // Google Sheet ID for the mirror
  updatedAt: Timestamp;
}
```

### 5.2 `users/{uid}/sessions/{sessionId}`

```ts
{
  status: "active" | "finished";
  date: string;                // local "YYYY-MM-DD" of startedAt, for calendar queries
  startedAt: Timestamp;
  endedAt: Timestamp | null;
  durationMin: number | null;  // derived on finish/edit
  locationId: string | null;
  locationName: string | null; // denormalized for display and the sheet
  bodyWeightKg: number;        // snapshot at session creation (see §5.5); used for all calories in this session

  energy: 1|2|3|4|5 | null;    // asked at start
  sleep: 1|2|3|4|5 | null;     // asked at start
  mood: 1|2|3|4|5 | null;      // asked at finish
  effort: number | null;       // derived: mean RPE of entries that have one, 1 decimal
  journal: string;             // session-level only

  entries: Entry[];

  totals: {                    // derived on every change
    kcalGross: number;
    kcalNet: number;
    byGroup: { arms: number; upper: number; legs: number; swim: number }; // net kcal
    sets: number;
    laps: number;
    liftVolume: number;        // sum of weight × count × reps, in liftUnit
  };

  sheetSync?: {                // written ONLY by the Cloud Function
    state: "ok" | "error";
    syncedAt: Timestamp;
    error?: string;
  };

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 5.3 Entry

```ts
type Entry = LiftEntry | SwimEntry;

interface BaseEntry {
  id: string;
  loggedAt: Timestamp;         // when added; editable
  rpe: number | null;          // 1–10, see §7.6
  kcalGross: number;
  kcalNet: number;
}

type Equipment =
  | "dumbbell" | "barbell" | "machine" | "cable"
  | "kettlebell" | "smith" | "bodyweight" | "band";

interface LiftEntry extends BaseEntry {
  kind: "lift";
  exercise: string;            // display name
  group: "arms" | "upper" | "legs";
  equipment: Equipment;
  count: 1 | 2;                // implements: 2 = a pair (dumbbell/kettlebell only); always 1 otherwise
  unit: "lb" | "kg";
  bandLabel?: string;          // band only, e.g. "light", "medium", "heavy"
  sets: { weight: number | null; reps: number }[]; // ≥ 1 set, reps ≥ 1
}

interface SwimEntry extends BaseEntry {
  kind: "swim";
  group: "swim";
  pool: "25m" | "25yd" | "50m";
  laps: Partial<Record<"free"|"back"|"breast"|"fly"|"kick", number>>; // lap = there and back
  treadMinutes: number;        // 0 if none
}
```

#### Weight semantics by equipment

| Equipment | `weight` means | `count` | Display | Volume per rep |
|---|---|---|---|---|
| Dumbbell, Kettlebell | weight of each implement | 1 or 2 (One / Pair toggle) | `12+12 lb` or `12 lb` | weight × count |
| Barbell, Smith machine | total on the bar | 1 | `95 lb` | weight |
| Machine, Cable | stack/pin setting | 1 | `25 lb` | weight |
| Bodyweight | added weight (vest, belt); `null` = none | 1 | `BW` or `BW+20 lb` | added weight only (0 if none) |
| Resistance band | not used (`null`); `bandLabel` instead | 1 | `medium band` | 0 |

Uneven pairs (e.g. 12+10) are not supported.

### 5.4 Locations and exercises

```ts
// locations
{ name: string; lastUsedAt: Timestamp; }

// exercises: custom exercises, and remembered preferences for built-ins
{
  name: string;
  group: "arms" | "upper" | "legs";
  builtIn: boolean;            // true = preference record for a built-in exercise
  lastEquipment: Equipment;    // pre-fills the next entry of this exercise
  lastCount: 1 | 2;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Saving a lifting entry upserts that exercise's `lastEquipment` and `lastCount`. Built-ins with no record use the defaults in §12. Document ID: a slug of the exercise name.

### 5.5 `users/{uid}/weights/{YYYY-MM-DD}` — body weight

```ts
{
  date: string;                // "YYYY-MM-DD", same as the document ID
  weight: number;
  unit: "lb" | "kg";
  loggedAt: Timestamp;
}
```

- One entry per day; logging again for the same day overwrites it.
- **Weight used for calories** (`bodyWeightKg` on a session) = the most recent weigh-in on or before the session's date; if none exists, `settings.bodyWeight`.
- Saving a weigh-in that is the newest on record also updates `settings.bodyWeight`.
- Sessions keep their snapshot: adding or editing a weigh-in does not change existing sessions' calories, except a **"Recalculate with this weight"** action offered when a weigh-in is saved for a date that already has sessions.

---

## 6. Calorie formulas

All calories use the MET method: `kcal = MET × bodyWeightKg × hours`.
Use the session's `bodyWeightKg` snapshot. `lb → kg = × 0.45359237`.

**Net** = gross minus what the person would burn sitting still over the same time (MET 1). The UI shows net or total based on `settings.calorieMode`; both are stored.

### 6.1 Lifting (per set, summed over sets)

```
SEC_PER_REP = 3
MET_WORK    = 6.0
MET_REST    = 2.5

workSec = reps × SEC_PER_REP
restSec = rest seconds after the set (see §6.3)

grossSet = bodyWeightKg × (MET_WORK × workSec + MET_REST × restSec) / 3600 × groupFactor
sitSet   = bodyWeightKg × (workSec + restSec) / 3600
netSet   = max(0, grossSet − sitSet)
```

Weight lifted and equipment do **not** affect calories (the mechanical work is negligible); they are tracked for progress and volume only. Volume uses the rules in §5.3.

### 6.2 Swimming

```
MET and pace (seconds per 25 m length):
  free    8.3   40
  back    6.0   50
  breast  7.0   50
  fly    13.8   45
  kick    6.0   60
  tread   3.5   (entered in minutes)

pool scale: 25m = 1.0, 25yd = 0.914, 50m = 2.0

swimSec(stroke) = laps × 2 × pace × poolScale     // lap = there and back
treadSec        = treadMinutes × 60

gross = Σ MET × bodyWeightKg × sec / 3600
sit   = Σ bodyWeightKg × sec / 3600
net   = max(0, gross − sit)
```

### 6.3 Rest time

- `restMode = "fixed"` (default): every set uses `settings.restSec`.
- `restMode = "actual"`: when a session is finished (or its times are edited), recompute lifting calories using the real time available:

```
totalSets   = all lifting sets in the session
liftWorkSec = Σ reps × SEC_PER_REP
swimSec     = Σ swim seconds (§6.2)
available   = durationSec − liftWorkSec − swimSec
restPerSet  = clamp(available / totalSets, 30, 240)
```

While a session is active, always use `settings.restSec` for live estimates.

### 6.4 Acceptance values (180 lb person, fixed rest 90 s)

| Case | Gross | Net |
|---|---|---|
| Upper body, 3 sets × 10 reps | 27.6 | 19.4 |
| Swim, 25 m pool, 4 laps freestyle + 4 laps backstroke | 114.7 | 98.3 |

Implement the formulas as pure functions with unit tests asserting these values (±0.1).

---

## 7. Screens and flows

Mobile-first, one column, max width ~520 px, bottom tab bar: **Session**, **Calendar**, **Export**, **Settings**. Light and dark themes following the system setting. Large tap targets (≥ 44 px). Tabular numerals for figures.

### 7.1 Session tab — no active session

- **Start session** (primary button).
- **Log past session** (secondary).
- Today's summary: sessions finished today, net kcal, eat-back amount (`eatBackPct`).
- Today's body weight, or a **Log weight** button if none (see §7.14).
- List of recent sessions (last 7 days), each showing date, location, duration, kcal and group color markers. Tap to open Session detail.

### 7.2 Start session sheet

- Start time: defaults to now, editable.
- Location: picker of saved locations sorted by `lastUsedAt` (most recent pre-selected) + "Add new location".
- Energy (1–5) and Sleep quality (1–5): rows of five tappable circles with end labels (Energy: "Drained" → "Great"; Sleep: "Poor" → "Great"). Optional.
- Body weight line showing the weight that will be used (from §5.5), with a **Log today's weight** shortcut if there's no weigh-in today.
- **Start** creates the session with `status: "active"` and snapshots `bodyWeightKg`.
- If a session is already active, this sheet is replaced by a prompt to finish or resume it.

### 7.3 Active session screen

Shown on the Session tab whenever a session is active (on any device).

- Header: location, start time, live elapsed timer.
- Running totals: net/total kcal, sets, laps.
- Buttons: **Add lifting**, **Add swim**.
- Entry list in logged order. Each row: colored stripe by group, name, equipment, compact detail using the display rules in §5.3 (e.g. `12+12 lb × 10, 10, 8` or `25×8 · 25×5 · 15×4 lb`), RPE badge, kcal. Tap to edit; edit sheet includes Delete (with in-page confirmation, no `confirm()` dialogs).
- **Journal** text area for the whole session. Autosaves after 1 s of no typing and on blur.
- **Finish session** button.

### 7.4 Lifting entry sheet

- Exercise picker: searchable list of built-ins (§12) plus custom exercises, grouped by Arms / Upper body / Legs. "Add your own" creates a custom exercise with a name and group.
- "Last time" line under the picker: date, equipment and sets from the most recent entry of the same exercise.
- Equipment: segmented control or compact picker (Dumbbell, Barbell, Machine, Cable, Kettlebell, Smith machine, Bodyweight, Band). Pre-filled from the exercise's `lastEquipment`, else the §12 default.
- **One / Pair** toggle, shown only for Dumbbell and Kettlebell. Pre-filled from `lastCount`, default Pair.
- Set rows: set number, weight, reps, remove button. Any number of sets. The weight field adapts to equipment:
  - Dumbbell/Kettlebell: header "Each (lb)"; the row shows the formatted value, e.g. `12+12`, next to the field when Pair is selected.
  - Barbell/Smith/Machine/Cable: header "Weight (lb)".
  - Bodyweight: header "Added (lb)", optional; placeholder "BW".
  - Band: weight column hidden; a band label field (light / medium / heavy / custom text) appears above the sets.
- **+ Add set** copies the previous set's weight and reps and focuses the new reps field.
- RPE selector (§7.6), optional.
- Live calorie preview.
- Save rules: exercise required; drop sets with empty/zero reps; at least one set must remain. Show an inline message otherwise.

### 7.5 Swim entry sheet

- Pool length: segmented control (25 m / 25 yd / 50 m), default `settings.defaultPool`.
- Helper text: "One lap = there and back."
- One row per stroke (Freestyle, Backstroke, Breaststroke, Butterfly, Kickboard) with − / + stepper for laps; one row for Treading water with − / + in minutes.
- Summary line: total laps, distance (m or yd), kcal.
- RPE selector, optional.
- Save requires at least one lap or one minute.

### 7.6 RPE

Scale 1–10 (whole numbers), shown as a row of buttons with a label for the selected value:

| RPE | Label |
|---|---|
| 1–3 | Very easy |
| 4–5 | Easy |
| 6 | Moderate, 4+ reps left |
| 7 | Hard, ~3 reps left |
| 8 | Very hard, ~2 reps left |
| 9 | ~1 rep left |
| 10 | Max effort |

Session **effort** = mean RPE of entries with a value, rounded to 1 decimal; `null` if none.

### 7.7 Finish session sheet

- End time: defaults to now, editable; must be after start.
- Mood (1–5, "Low" → "Great"), optional.
- Summary: duration, entry count, sets, laps, effort (auto), net and total kcal.
- **Finish** sets `status: "finished"`, `endedAt`, `durationMin`, recalculates calories if `restMode = "actual"`, updates `locations/{id}.lastUsedAt`.

### 7.8 Forgotten finish

On app open (and when the Session tab gains focus), if the active session started more than `forgotFinishHours` ago, show a banner: "Still at <location>? This session started <time>." with **Finish now** and **Set end time**. Suggested end time = last entry's `loggedAt` + 10 minutes (or start + 1 hour if no entries).

### 7.9 Session detail (finished sessions)

Same layout as the active screen, without the live timer. Everything is editable: location, start/end time, energy, sleep, mood, journal, entries (add, edit, delete). Duration, effort, totals and calories recompute on save. **Delete session** at the bottom with in-page confirmation.

### 7.10 Log past session

Opens the Start sheet with start and end time fields both required, then goes straight to Session detail for adding entries. Created with `status: "finished"`.

### 7.11 Calendar tab

- Month grid (Sunday first), prev/next month arrows, today highlighted.
- Each day shows up to four short horizontal bars, one per group present that day, in fixed order arms → upper → legs → swim.
- Legend under the header.
- Month stats: active days, sessions, net kcal.
- Days with a weigh-in show a small weight indicator (e.g. a dot in the corner); the bars stay reserved for exercise groups.
- Tapping a day selects it and shows, below the grid, that day's body weight (with Log/Edit) and its sessions (location, time range, kcal); tap a session to open Session detail.
- Month stats also show the change in body weight between the first and last weigh-in of the month.

### 7.12 Export tab

- Date range: This week, This month, Last 30 days, All time, Custom (from/to).
- **Download Excel (.xlsx)** and **Download CSV** (CSV exports the Lifting tab layout plus a separate Sessions CSV, zipped or as two downloads).
- Workbook tabs and columns: same as the Google Sheet raw tabs (§9.3), plus **Daily** and **Weekly** summary tabs computed in the app.
- File name: `gym-log_<from>_<to>.xlsx`.

### 7.13 Settings tab

Body weight unit (converting the fallback value when switched), fallback body weight (used only before the first weigh-in), lifting unit, rest seconds, rest mode, calorie mode (net/total), eat-back %, default pool, forgotten-finish hours, Google Sheet (paste URL → extract ID; show the service-account email to share the sheet with; **Rebuild sheet** button; last sync status), manage locations (rename/delete), manage custom exercises (rename/regroup/delete), sign out, and a short "How calories are estimated" explanation.

### 7.14 Log weight sheet

- Opened from the Session tab, the Start sheet shortcut, or a Calendar day.
- Date (defaults to today, or the selected calendar day), weight, unit (defaults to `settings.bodyUnit`).
- Shows the previous weigh-in and the change since then.
- Save writes `weights/{date}` (overwriting any entry for that day); Delete removes it, with in-page confirmation.
- If the date already has sessions, after saving offer **Recalculate those sessions with this weight** (updates their `bodyWeightKg` and all calories).

---

## 8. Offline and sync

- Initialize Firestore with persistent local cache (multi-tab manager) so the app works with no signal and syncs when back online.
- All writes go to Firestore directly; the UI renders from snapshot listeners, never from local-only state.
- Show a small "Offline — changes will sync" indicator when disconnected and a pending-writes indicator using snapshot metadata.
- Journal autosave and stepper taps are debounced so a burst of input becomes one write per document.
- Timestamps: use client-generated `Timestamp.fromDate(new Date())` for user-facing times (start, end, loggedAt) so they're correct offline; `serverTimestamp()` only for `updatedAt`/`createdAt`.

---

## 9. Google Sheets mirror (Cloud Functions)

### 9.1 Setup

- Enable the Google Sheets API in the Firebase project's Google Cloud project.
- Functions run as the default compute service account. The user shares their Google Sheet with that service-account email as **Editor**. Settings displays the email.
- `settings.sheetId` tells the function which sheet to write.

### 9.2 Trigger: `onSessionWritten`

`onDocumentWritten("users/{uid}/sessions/{sessionId}")`, `maxInstances: 1` to avoid concurrent row edits, retries enabled.

1. **Ignore** the event if the only changed field is `sheetSync` (prevents an infinite loop, since the function writes that field), or if `updatedAt` didn't change.
2. **Ignore** sessions with `status: "active"` (only finished sessions are mirrored).
3. Load `settings.sheetId`; if missing, exit.
4. Ensure the tabs and header rows exist (create if missing).
5. **Replace by session**: in each raw tab, delete all rows whose `SessionId` equals this session, then append the session's new rows. If the session was deleted (no `after` data) or reverted to active, only delete.
6. Write `sheetSync: { state: "ok", syncedAt }` back to the session, or `{ state: "error", error }` on failure (and rethrow so the retry policy applies to transient errors).

Steps are idempotent, so retries are safe.

### 9.2b Trigger: `onWeightWritten`

`onDocumentWritten("users/{uid}/weights/{date}")`, `maxInstances: 1`, retries enabled. Replaces the row for that date in the **Body weight** tab (or deletes it if the weigh-in was deleted), keeping rows sorted by date. No status field is written back.

### 9.3 Sheet tabs

Raw tabs (written by the function):

**Sessions** — one row per session
`SessionId, Date, Location, Start, End, Duration (min), Energy, Sleep, Mood, Effort (avg RPE), Entries, Sets, Laps, Lift volume, Kcal net, Kcal total, Kcal arms, Kcal upper, Kcal legs, Kcal swim, Journal`

**Lifting** — one row per set
`SessionId, EntryId, Date, Location, Logged at, Exercise, Group, Equipment, Count, Set #, Weight each, Total weight, Unit, Band, Reps, Volume, RPE, Entry kcal net, Entry kcal total`
(`Weight each` = the entered weight; `Total weight` = weight × count; for Bodyweight both are the added weight, blank if none; for Band both are blank and `Band` holds the label.)
(Entry kcal repeats on each set row of that entry; summaries should use the Sessions tab.)

**Swimming** — one row per stroke per entry
`SessionId, EntryId, Date, Location, Logged at, Stroke, Laps or minutes, Pool, Distance, RPE, Entry kcal net, Entry kcal total`

**Body weight** — one row per weigh-in, kept sorted by date
`Date, Weight, Unit, Weight (lb), Weight (kg)`

Summary tabs (created once with formulas over the raw tabs, never written row-by-row):

**Daily** — per date: body weight (if logged), sessions, total duration, net kcal, eat-back kcal, sets, laps, lift volume, average mood, average effort.
**Weekly** — per week (Monday start): active days, sessions, net kcal by group, total net kcal, average effort.

Use `QUERY`/`SUMIFS`-based formulas so they update automatically.

### 9.4 Callable: `rebuildSheet`

`onCall`, authenticated, only for the caller's own `uid`. Clears the raw tabs (keeping headers), writes every finished session and every weigh-in in date order, recreates the summary tabs, and returns a row count. Triggered from Settings.

---

## 10. Security

Firestore rules: only the owner's account can read or write, and only under their own `users/{uid}` path.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null
        && request.auth.uid == uid
        && request.auth.token.email == "YOUR_EMAIL";   // single-user allowlist
    }
  }
}
```

- The rules must reject client writes to `sheetSync` (only the function, using admin privileges, writes it). Add a field check on session writes.
- The Firebase web config in the public repo is expected and safe; access is enforced by Auth + rules.
- The `rebuildSheet` callable checks `context.auth.uid` and the email allowlist.
- Optional: enable Firebase App Check later.

---

## 11. Repository layout and deployment

```
/                       Vite + React app (index.html, src/, public/)
/src/calc/              pure calorie, volume and weight-formatting functions + tests (Vitest)
/src/data/              Firestore access, types, React hooks
/src/screens/           route-level React components
/src/components/        shared components (rating row, RPE picker, stepper, set row, sheets)
/functions/             Cloud Functions (TypeScript)
/firestore.rules
/firebase.json
/.github/workflows/pages.yml   build + deploy to GitHub Pages
```

- Vite `base` set to the repo name for project Pages (`/<repo>/`), or `/` for a user site.
- Frontend deploys via GitHub Actions on push to `main`.
- Functions and rules deploy via `firebase deploy --only functions,firestore:rules` from the desktop.

---

## 12. Built-in exercise list

Default equipment (and count, for dumbbells) in parentheses. The user's last choice per exercise overrides these (§5.4).

| Group | Exercises |
|---|---|
| Arms | Bicep curl (dumbbell, pair), Hammer curl (dumbbell, pair), Preacher curl (machine), Tricep extension (dumbbell, one), Tricep pushdown (cable), Dips (bodyweight) |
| Upper | Shoulder press (dumbbell, pair), Lateral raise (dumbbell, pair), Front raise (dumbbell, pair), Rear delt fly (machine), Chest press (machine), Bench press (barbell), Incline press (dumbbell, pair), Chest fly (machine), Push-up (bodyweight), Row (cable), Lat pulldown (cable), Pull-up (bodyweight), Face pull (cable), Pallof press (cable), Cable crunch (cable), Russian twist (bodyweight) |
| Legs | Squat (barbell), Deadlift (barbell), Romanian deadlift (barbell), Leg press (machine), Lunge (dumbbell, pair), Leg curl (machine), Leg extension (machine), Hip thrust (barbell), Calf raise (machine) |

---

## 13. Owner setup checklist (manual steps)

1. Create a Firebase project; upgrade to Blaze; set a budget alert (e.g. $1).
2. Enable Authentication → Google provider; add `<username>.github.io` to Authorized domains.
3. Create Firestore (Native mode) in a nearby region (e.g. `us-west2`).
4. Enable the Google Sheets API in Google Cloud Console for the same project.
5. Create the Google Sheet; share it with the functions service-account email as Editor; paste its URL in Settings.
6. Create the GitHub repo; enable Pages with "GitHub Actions" as the source.
7. Put the Firebase web config in the app (e.g. `src/firebase-config.ts`).
8. Replace `YOUR_EMAIL` in `firestore.rules` and the functions allowlist.

---

## 14. Suggested build order

1. Project scaffold, Firebase init, Google sign-in, Pages deployment working end-to-end.
2. Calorie, volume and weight-display functions with unit tests (§6.4, §5.3 table).
3. Data layer and security rules.
4. Session flow: start, active screen, lifting and swim sheets, journal, finish.
5. Session detail editing, log past session, forgotten-finish banner.
6. Body weight logging (§5.5, §7.14), then Calendar.
7. Settings, locations, custom exercises.
8. Excel/CSV export.
9. Cloud Function sheet mirror + rebuild callable.
10. PWA manifest, icons, service worker, offline indicators.
11. Polish: dark mode, empty states, accessibility (labels, focus states, reduced motion).

---

## 15. Future ideas (not v1)

- Charts: weight lifted per exercise over time, weekly calories.
- Body-weight trend chart (data is already logged in v1).
- Rest timer between sets.
- Apple Health integration (would require a native app).
