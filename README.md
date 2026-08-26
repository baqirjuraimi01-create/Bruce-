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
run), Watch-style **activity rings** — protein outermost, then calories, then
steps, with a second lap drawn when a target is beaten rather than clamping —
a line of Watch context (active energy, exercise minutes, resting HR, sleep),
and an **Objectives** panel that
scores the four goals this app was built around: strength & muscle (main lifts
that beat their last top set), running (minutes vs what the rotation asks for
across 7 days), core strength and leg stability (tagged sets completed vs
prescribed so far this cycle), plus protein adherence. Everything is derived
from what you already log — no extra tracking.

**Food** — a calorie donut and a **protein ring** side by side (protein is the
number this app treats as the one that matters), carbs and fat as thin bars,
all split by meal below.
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

Search matches **words, not substrings**. The query is split into tokens and
each is looked for anywhere in the product name or the brand, so "rokeby
protein", "protein rokeby" and "Rokeby Farms protein" all find a drink whose
name is *Protein Drink* and whose brand is *Rokeby Farms* — a plain
`includes()` finds none of them. Results are ranked: matching every word beats
matching some, a name match beats a brand-only match, and your own saved foods
outrank an identical remote result. If nothing matches every word the search
loosens to half, and no further — one word out of three is noise.

Online search runs by itself a beat after you stop typing, so no button press
is needed, and a stale response can never overwrite a newer one.

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

`test/worker.test.mjs` runs the sync server's whole protocol against a fake KV
— versioning, conflict refusal, id isolation, malformed input, CORS — with no
Cloudflare account and no network. `test/sync.test.mjs` exercises the client's
crypto under Node's WebCrypto: round trips, that plaintext never appears in the
uploaded blob, that a wrong code fails rather than returning junk, and that
tampered ciphertext is rejected.

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

## Apple Watch, steps and health data

A web app cannot talk to a watch directly — Safari has no Web Bluetooth, and
Apple Health is native-only. But the Watch writes everything into Apple Health,
and an iOS Shortcut can read Health and hand it to the app by URL:

```
https://<your-site>/index.html?steps=8432&akcal=650&exmin=42&rhr=54&sleep=7.5
```

Any subset of the parameters works; `&date=YYYY-MM-DD` back-dates. Values are
saved, then the query string is stripped so a refresh cannot double-import;
junk is ignored rather than stored. Everything can also be typed by hand:
Home → **Watch data**.

| Param | Health sample | Why it is worth tracking |
|---|---|---|
| `steps` | Steps (Sum) | General activity floor |
| `akcal` | Active Energy (Sum) | Calibrates your calorie target against reality |
| `exmin` | Exercise Minutes (Sum) | Confirms the rotation's cardio is happening |
| `rhr` | Resting Heart Rate (Average) | The classic under-recovery signal — a 3-day rise means back off |
| `sleep` | Sleep hours | The biggest recovery lever there is |

Deliberately not imported: stand hours and move streaks (noise for these
goals), HRV (too volatile day-to-day to act on without more context), and
workout detail (the app's own session log is the source of truth for lifting).

Resting heart rate and sleep get trend cards under **Progress → Body** once
data arrives — 14-day average, sparkline, and plain advice when the trend says
to ease off.

### The iOS Shortcut

1. Shortcuts app → **+** → for each metric, add *Find Health Samples where*
   (Type as in the table, date range **Today**) followed by *Calculate
   Statistics* (**Sum**, or **Average** for resting heart rate)
2. Add *Text* → the URL above, inserting each Statistics result after its
   parameter name
3. Add *Open URLs* with that text
4. Automation tab → daily at 22:00 → run it, with *Ask Before Running* off

Start with steps only if the multi-metric version feels fiddly — one *Find
Health Samples* + *Statistics* pair and `?steps=` is enough to be useful.

### Non-Apple trackers

The Shortcut reads whatever is already in Apple Health. Whether a third-party
band's numbers are there depends on its companion app — some write to Health,
some keep data walled in. If yours does not, the iPhone's own step count still
works, or type numbers in by hand.

## Sync

Optional, off until you set it up, and the app is unchanged without it.

**Progress → Sync → Set up sync.** The server is a single Cloudflare Worker you
deploy yourself in about five minutes, entirely from a browser — see
[`server/README.md`](server/README.md). Free tier covers this many times over.

Once on, it syncs when you open the app, when you switch back to it, and a few
seconds after you log something. There is a *Sync now* button for certainty.

**It is end-to-end encrypted.** The sync code is the only secret, and two
independent things are derived from it:

```
id      = SHA-256("bruce.sync.id.v1|" + code)      names the row
enc key = PBKDF2(code, "bruce.sync.enc.v1", 150k)  AES-GCM 256
```

Because they come from different derivations, the id handed to the server
reveals nothing about the key. The server stores ciphertext under a hash and
can read none of it — which matters, since it is a free service on the public
internet holding a record of what you eat and what you weigh.

Conflicts use the same `Merge` as manual transfer, so two devices that both
logged something end up with both. A write states the version it read; if the
server has moved on it returns 409 with the current copy, and the client merges
and retries. Sync settings live outside the synced state on purpose, so turning
sync off on one device does not turn it off everywhere.

**The code cannot be recovered.** Lose it and the data on the server can never
be decrypted, by anyone. Local data is untouched, so it is not a catastrophe,
but write it down.

## Your data, and using it in two places

Everything is in `localStorage` on the device and browser you entered it in.
There is no account and no server, so **nothing syncs by itself**.

On iOS this bites in a way that looks like a bug but is not: a web app added to
the Home Screen runs in a **different storage container from Safari**, even at
the same URL. Log lunch in Safari and it will not appear in the home-screen
app, and the reverse. A desktop browser is a third separate store again.

Three ways to live with it:

1. **Turn on sync** (above). This is the real fix.
2. **Pick one and stay there.** The home-screen app is the better choice —
   fullscreen, offline, and the camera scanner works.
3. **Transfer by hand.** Progress → Transfer & backup → **Copy my data** in
   one, **Paste & merge** in the other. No server needed.

Merging (`js/merge.js`) is built so it cannot lose anything: collections are
unioned by id, and where two copies disagree on a single value the one already
on this device wins — the incoming file only fills blanks. A session keeps
whichever side recorded more completed sets. Merging the same backup twice
changes nothing. Replacing is still offered, but it is the second option and
clearly labelled, because it discards whatever is on the device.

Clipboard rather than files is the primary route on purpose: file downloads are
unreliable inside an iOS home-screen app, which is exactly where half the data
tends to live. Files still work via *Save as file* / *Load a file* where the
browser supports them.

---

The training and nutrition guidance in this app is general information for a
healthy adult, not medical advice.
