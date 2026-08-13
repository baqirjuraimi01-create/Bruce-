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

**Food** — daily calories and macros against your targets, split by meal.
Log food by scanning a barcode, searching, or tapping one of your four preset
meals. Bodyweight goes in here too.

**Train** — today's session pulled from the 9-day rotation, with weight × reps ×
RPE per set, what you lifted for that exercise last time, and a rest timer that
starts when you tick a set. Ticking an empty set copies the previous set's
numbers forward.

**Cardio** — run/walk log with automatic pace, plus a 7-day-vs-previous-7-day
load comparison that warns you when mileage is climbing faster than your
connective tissue can keep up with.

**Progress** — 14-day protein adherence, bodyweight trend, top set per main
lift, training volume, your targets, and JSON export/import.

**Plan** — the whole program and the nutrition reasoning, readable at the gym.

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
npm test
```

Drives the real app in Chromium at phone viewport: logging, editing, the
rotation, the rest timer, volume maths, pace, target recalculation,
persistence across reload, and barcode parsing against Open Food Facts response
fixtures (including kJ-only products, missing nutrition data and unknown
barcodes). Set `CHROME_PATH` to use a pre-installed Chromium.

## Your data

Everything is in `localStorage` on that one device — nothing is uploaded
anywhere. Clearing site data wipes it. Export a backup from the Progress tab
now and then, and before switching phones.

---

The training and nutrition guidance in this app is general information for a
healthy adult, not medical advice.
