# Bruce — Training & Nutrition Tracker

A phone-first tracker built around one specific plan: a 9-day lifting rotation
with running and stability work folded in, and a protein-led diet. No accounts,
no server, no dependencies — everything lives in your browser's local storage.

## Running it

Any static file server works:

```bash
npm start                  # python3 -m http.server 8765
# then open http://localhost:8765
```

**On your phone:** push this repo to GitHub and turn on GitHub Pages
(Settings → Pages → deploy from branch). Open the URL on your phone and use
"Add to Home Screen" — it installs as a standalone app, works offline, and
keeps the camera scanner working (HTTPS is required for camera access, and
Pages gives you that).

## What's in it

**Home** — what to do today (session name, first lift's prescription, scheduled
run), today's calorie / protein / step numbers, and an **Objectives** panel that
scores the four goals this app was built around: strength & muscle (main lifts
that beat their last top set), running (minutes vs what the rotation asks for
across 7 days), core strength and leg stability (tagged sets completed vs
prescribed so far this cycle), plus protein adherence. Everything is derived
from what you already log — no extra tracking.

**Food** — daily calories and macros against your targets, split by meal.
Log food by scanning a barcode, searching, or tapping a meal. Bodyweight goes
in here too.

**Your usual** — the app learns each meal from your own log. A food joins your
"usual breakfast" once it appears on at least 2 of your logged breakfasts and
in at least 40% of them, suggested at the **median** amount so one unusual day
does not drag it around. Tapping a usual meal — or one of the plan's starting
meals — opens a review sheet: every item is pre-ticked with its amount, and you
untick anything you did not have (no honey today) or edit the grams before
anything is written to the log. The running total updates as you go. Thresholds
are `MIN_DAYS` / `MIN_FREQ` / `LOOKBACK` at the top of the learned-meals section
in `js/store.js`.

**Train** — today's session pulled from the 9-day rotation, with weight × reps ×
RPE per set, what you lifted for that exercise last time, and a rest timer that
starts when you tick a set. Ticking an empty set copies the previous set's
numbers forward.

Every exercise shows **what to do today**, worked out from your last session by
double progression (`js/progression.js`): hold the weight until every set hits
the top of the rep range, then add load — 5 kg on lower-body compounds, 2.5 kg
elsewhere — and drop back to the bottom of the range. Fall below the floor and
it prescribes a 10% cut instead. The target weight and reps appear as greyed
placeholders in the set fields, so the numbers are already in front of you.
Bodyweight work progresses on reps or time; pull-ups are scored on total reps;
every 6th cycle is flagged as a deload.

**Swapping exercises** — machine or bench taken? The ⇄ button on any exercise
offers alternatives that train the same pattern (`ALTERNATIVES` in
`js/data.js` — 45 exercises, 143 alternatives), or you can type your own. The
swap applies to that day only, and the replacement keeps its **own** weight
history, because a dumbbell incline press is not the same load as a Smith
incline press and the progression must not pretend otherwise.

Cardio lives inside Train, behind a **Session / Cardio** segmented control —
run/walk log with automatic pace, steps, and a 7-day-vs-previous-7-day load
comparison that warns you when mileage is climbing faster than your connective
tissue can keep up with. Cardio days open on that panel by default.

**Progress** — segmented into Nutrition (14-day protein adherence), Training
(top set per main lift, volume) and Body (bodyweight trend), with your targets
and JSON export/import below.

**Plan** — the whole program and the nutrition reasoning, readable at the gym,
plus the **routine editor**.

### Your own routines

Tap **Edit** on any day in Plan to replace its exercises with your own — name,
sets, reps and rest, reorderable, with autocomplete over every exercise the app
knows. A saved routine overrides that day for every cycle until you reset it.

The editor checks **weekly sets per muscle across the whole rotation** and
suggests one or two additions for what is short. `js/volume.js` classifies
exercises by rule rather than lookup, so names you type yourself are still
understood — "Flat press" is chest, "Cable bicep curls" is biceps, "Leg curl"
is hamstrings and not biceps. Assistance work counts as a fraction of a set.
Suggestions are filtered to muscles that belong on that day, so a push day is
never told to add hamstring curls.

Weekly minimums live in `TARGETS` at the top of `js/volume.js`. They are
minimums for growth, not goals — the shipped rotation sits slightly under on
side delts, which the analyser correctly flags.

## Design

Light theme throughout: white cards floating on a soft grey ground, large
light-weight headings, pill chips, a calorie donut with thin macro bars,
segmented controls with count badges, and a dark floating rail on the Plan tab
for jumping between sections. Icons are inline SVG, so there are no font or
image requests. Layout tokens live at the top of `css/styles.css` — the
palette, corner radii and the three shadow levels are all CSS custom
properties, so retheming is a matter of editing `:root`.

## Icons

The mark is the app's own calorie donut — ink field, muted track ring, lime arc
— with a barbell through it. Colours come straight from the CSS tokens, so the
icon and the UI cannot drift apart.

```bash
npm run icons
```

Rebuilds `icon.svg` (rounded, for browser tabs), `icon-192.png` / `icon-512.png`
(PWA, declared both `any` and `maskable` — the ring sits inside the 80% safe
circle so Android's crop cannot clip it) and `apple-touch-icon.png` at 180×180.
That last one matters: **iOS ignores the web manifest** for Add to Home Screen
and reads `<link rel="apple-touch-icon">`, so without it you get a screenshot
thumbnail instead of an icon. Edit the SVG in `icons/build-icons.mjs` and re-run;
it renders through Chromium, so the curves are properly anti-aliased.

## Barcode scanning

Uses the browser's native `BarcodeDetector` API — no library, no bundle.
Works in Chrome, Edge, Android browsers and Safari 17+. Where it isn't
available (or the camera is blocked), the same lookup runs off typed digits, so
the feature degrades rather than disappearing.

Barcodes resolve against **Open Food Facts** — free, no API key, roughly 3M
products worldwide. Scanned products are cached locally, so a re-scan is
instant and works offline. If a product isn't in the database, or has no
nutrition data, you get a manual-entry form pre-filled with whatever was known;
saved products are reused on the next scan.

Text search checks the built-in table first (instant, offline, and more
accurate than crowd-sourced entries for raw foods like chicken and rice), then
USDA FoodData Central if you add a free API key in Progress → Targets, then
Open Food Facts.

## Adjusting the plan

- **Exercises, sets, reps, rest, coaching notes** — `js/data.js`, the `PROGRAM`
  array. Tag an exercise `tag:'core'` or `tag:'stab'` to badge it.
- **Preset meals** — `PRESET_MEALS` in the same file.
- **Built-in foods** — `LOCAL_FOODS`, values per 100 g.
- **Rotation drifted?** Train tab → Shift. Nudge it a day either way, or restart
  the cycle from today.

Targets are calculated with Mifflin-St Jeor and your goal, anchoring protein at
2.0 g/kg and fat at 1.0 g/kg. Turn off auto-targets in Progress to set your own.

## Tests

```bash
npm install
npx playwright install chromium     # skip if browsers are already provisioned
npm test          # unit tests, then the browser suite
npm run test:unit # progression logic only — no browser needed
```

`test/progression.test.cjs` covers the progression logic in isolation: every
rep prescription in the program parses, and each branch of the decision (add
weight, add reps, back off, bodyweight, AMRAP, deload) is asserted.

`test/smoke.mjs` drives the real app in Chromium at phone viewport: logging, editing, the
rotation, the rest timer, volume maths, pace, target recalculation,
persistence across reload, progression carrying across a full 9-day cycle, and
barcode parsing against Open Food Facts response fixtures (including kJ-only
products, missing nutrition data and unknown barcodes). Set `CHROME_PATH` to
use a pre-installed Chromium.

## Things that are not a meal

A fifth slot, **Extras**, sits alongside breakfast / lunch / dinner / snacks for
anything that belongs to no sitting — a shake from a stall, a coffee, a bite of
something. It counts toward the day's totals exactly like everything else, and
it is never chosen by the time-of-day guess, so it only holds what you put
there deliberately.

Entries can be measured in **servings** instead of grams. A packet has a
per-100 g column; a cup from a stall does not — you know roughly what one of
them contains and nothing more. Manual entry therefore defaults to *per
serving*, and the portion picker then counts servings (0.5, 1, 1.5, 2). Under
the hood a serving is stored as 100 in the grams field, so the per-100 maths
and every total, average and learned meal work unchanged.

`SERVING_FOODS` in `js/data.js` seeds a few of these — shakes, coffees, bubble
tea, protein bars — as mid-range starting points. They vary enormously between
stalls, so edit the numbers once you know your regular place; a food saved by
hand is reused from search forever after.

## Eating out

You cannot weigh a restaurant plate and you cannot see the oil, which is where
the calories hide — the same chicken and rice is ~485 kcal grilled or ~775 kcal
with a rich sauce, and nothing visible on the plate distinguishes them.

So the estimator (`js/eatout.js`) asks only what can actually be judged at a
table — portions by hand, and how the food was cooked — and reports a **range**
rather than a false-precision number. 1 palm ≈ 110 g cooked meat or fish,
1 fist ≈ 150 g cooked rice or potato. Uncertainty starts at ±22% and widens for
rich sauces, frying and big portions, capped at ±35%. The midpoint is logged.

The component values are in the tables at the top of the module.

## Steps and your fitness tracker

Steps can be entered by hand on Home or the Cardio tab, and the daily goal is
set in Progress → Targets.

They can also be pushed in by URL, which is what makes automation possible:

```
https://<your-site>/index.html?steps=8432
https://<your-site>/index.html?steps=8432&date=2026-08-13
```

The value is saved, then the query string is stripped from the address bar so a
refresh cannot double-import. A missing or malformed `date` falls back to
today; a non-numeric `steps` is ignored rather than stored.

### iOS Shortcut

1. Shortcuts app → **+** → **Add Action** → *Find Health Samples where* →
   Type = **Steps**, sort by Start Date, and set the date range to **Today**
2. Add *Calculate Statistics* → **Sum** over the Health Samples
3. Add *Text* → `https://<your-site>/index.html?steps=` then insert the
   Statistics result
4. Add *Open URLs* with that text
5. Optionally: Automation tab → daily at 22:00 → run this Shortcut, and turn
   off *Ask Before Running*

### What will and will not connect

A web app cannot talk to a Bluetooth tracker on iOS — Safari has no Web
Bluetooth — and it cannot read Apple Health, which is native-only. So the
Shortcut above reads whatever is *already in Apple Health*. Whether your
tracker's steps are there depends on its companion app: some write to Apple
Health, some only keep data in their own app. If yours does not, the Shortcut
still works using your iPhone's own step count, or enter the number by hand.

## Your data

Everything is in `localStorage` on that one device — nothing is uploaded
anywhere. Clearing site data wipes it. Export a backup from the Progress tab
now and then, and before switching phones.

---

The training and nutrition guidance in this app is general information for a
healthy adult, not medical advice.
