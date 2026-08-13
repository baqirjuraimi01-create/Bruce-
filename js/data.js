/* ------------------------------------------------------------------
   data.js — the training program, food presets and offline food table.
   Pure data + a couple of tiny helpers. No DOM, no storage.
------------------------------------------------------------------- */

/* ==================================================================
   TRAINING PROGRAM
   Bruce's own 9-day rotation, kept intact, with three changes:
     1. Rest days carry the running/walking work (they are not empty).
     2. Arms day gains unilateral lower-body work, so legs get trained
        twice per cycle instead of once.
     3. Every lifting day ends with a core block; the two blocks that
        matter most for a lifter who runs are anti-extension and
        anti-rotation, so those come first in the week.
   Tags: "core" = trunk work, "stab" = single-leg / balance / ankle.
================================================================== */

const PROGRAM = [
  {
    key: 'push', name: 'Push', type: 'lift',
    focus: 'Chest, shoulders, triceps + anti-extension core',
    exercises: [
      { name:'Barbell Bench Press',        sets:4, reps:'5-8',    rest:180, note:'Main strength lift. Leave 1-2 reps in reserve on the first 3 sets.' },
      { name:'Incline Dumbbell Press',     sets:3, reps:'8-12',   rest:120 },
      { name:'Standing Overhead Press',    sets:3, reps:'6-10',   rest:150, note:'Standing, not seated — the trunk work is the point. Ribs down, glutes tight.' },
      { name:'Cable Lateral Raise',        sets:3, reps:'12-15',  rest:60 },
      { name:'Overhead Cable Triceps Ext', sets:3, reps:'10-12',  rest:60 },
      { name:'Dips or Triceps Pushdown',   sets:2, reps:'10-15',  rest:60 },
      { name:'Ab Wheel Rollout',           sets:3, reps:'8-12',   rest:75, tag:'core', note:'Anti-extension. Stop at the range where your lower back stays flat.' },
      { name:'Long-lever Plank',           sets:3, reps:'30-45s', rest:45, tag:'core' }
    ],
    finisher:'10-15 min easy walk to cool down.'
  },
  {
    key: 'pull', name: 'Pull', type: 'lift',
    focus: 'Back, rear delts, biceps + anti-rotation core',
    exercises: [
      { name:'Weighted Pull-up / Lat Pulldown', sets:4, reps:'6-10', rest:180 },
      { name:'Chest-supported Row',             sets:4, reps:'8-12', rest:120 },
      { name:'Half-kneeling 1-arm Cable Row',   sets:3, reps:'10-12/side', rest:75, tag:'core', note:'Half-kneeling makes this an anti-rotation drill as much as a row.' },
      { name:'Face Pull',                       sets:3, reps:'15',   rest:60 },
      { name:'Incline Dumbbell Curl',           sets:3, reps:'10-12', rest:60 },
      { name:'Hammer Curl',                     sets:2, reps:'12',   rest:60 },
      { name:'Pallof Press',                    sets:3, reps:'12/side', rest:45, tag:'core', note:'Anti-rotation. Slow out, slow back, no hip shift.' },
      { name:'Suitcase Carry',                  sets:3, reps:'30-40m/side', rest:75, tag:'core', note:'Heavy. Do not lean away from the weight.' }
    ],
    finisher:'15 min easy walk.'
  },
  {
    key: 'rest_runA', name: 'Rest — Easy Run A', type: 'cardio',
    focus: 'Zone 2 aerobic base + mobility',
    cardio: { mode:'run', minutes:'20-30', effort:'Conversational. If you cannot talk in full sentences, slow down.' },
    exercises: [
      { name:'Ankle Dorsiflexion Rock', sets:2, reps:'10/side', rest:30, tag:'stab' },
      { name:'90/90 Hip Switch',        sets:2, reps:'8/side',  rest:30 },
      { name:'Couch Stretch',           sets:2, reps:'45s/side', rest:30 }
    ],
    note:'If you have not run in a while, do 30-40 min brisk walking for the first two weeks, then start run/walk intervals (2 min run / 2 min walk).'
  },
  {
    key: 'legs', name: 'Legs', type: 'lift',
    focus: 'Bilateral strength + single-leg stability + ankle durability',
    exercises: [
      { name:'Back Squat',                sets:4, reps:'4-6',  rest:210, note:'Your main lower-body strength driver. Full depth, controlled descent.' },
      { name:'Romanian Deadlift',         sets:3, reps:'6-8',  rest:180 },
      { name:'Bulgarian Split Squat',     sets:3, reps:'8-10/side', rest:120, tag:'stab', note:'The single best stability builder here. Front foot flat, slow 3s down, no wobble.' },
      { name:'Single-leg Leg Curl / Nordic', sets:3, reps:'6-10', rest:90, note:'Hamstring health — this is what keeps you running injury-free.' },
      { name:'Standing Calf Raise',       sets:4, reps:'8-12', rest:75, note:'Pause 1s at the top and 2s at the bottom stretch.' },
      { name:'Tibialis Raise',            sets:3, reps:'15-20', rest:45, tag:'stab', note:'Front of the shin. This is your shin-splint insurance once mileage climbs.' },
      { name:'Copenhagen Plank',          sets:2, reps:'20-30s/side', rest:45, tag:'stab', note:'Adductors — the muscle most lifters neglect and most runners strain.' },
      { name:'Dead Bug',                  sets:3, reps:'8/side', rest:45, tag:'core' }
    ],
    finisher:'No run today. Walk only if you feel like it.'
  },
  {
    key: 'rest_runB', name: 'Rest — Run B / Balance', type: 'cardio',
    focus: 'Intervals (from week 5) + balance work',
    cardio: { mode:'run', minutes:'25-30', effort:'Weeks 1-4: easy. Week 5+: 6-8 x (1 min hard / 2 min easy) inside an easy run.' },
    exercises: [
      { name:'Single-leg Stance, Eyes Closed', sets:3, reps:'30s/side', rest:30, tag:'stab', note:'Barefoot. Eyes closed removes vision and forces the ankle to do the work.' },
      { name:'Single-leg RDL (bodyweight)',    sets:3, reps:'10/side',  rest:45, tag:'stab' },
      { name:'Lateral Band Walk',              sets:3, reps:'15/side',  rest:45, tag:'stab' }
    ],
    note:'Only one hard running day per cycle for the first 6 weeks. Two hard days is how people get shin splints.'
  },
  {
    key: 'upper', name: 'Upper', type: 'lift',
    focus: 'Higher-rep upper body volume + hanging/lateral core',
    exercises: [
      { name:'Incline Bench Press',       sets:3, reps:'8-12',  rest:120 },
      { name:'Pull-up',                   sets:3, reps:'AMRAP-2', rest:120, note:'Stop 2 reps short of failure on each set.' },
      { name:'Seated Dumbbell Press',     sets:3, reps:'10-12', rest:90 },
      { name:'Cable Row',                 sets:3, reps:'12-15', rest:90 },
      { name:'Lateral Raise',             sets:3, reps:'15-20', rest:45 },
      { name:'Rear Delt Fly',             sets:3, reps:'15-20', rest:45 },
      { name:'Hanging Leg Raise',         sets:3, reps:'10-15', rest:75, tag:'core', note:'No swinging. If you swing, switch to knee raises.' },
      { name:'Side Plank with Reach',     sets:3, reps:'30s/side', rest:45, tag:'core' }
    ],
    finisher:'10 min walk.'
  },
  {
    key: 'rest_long', name: 'Rest — Long Easy', type: 'cardio',
    focus: 'Longest aerobic session of the cycle',
    cardio: { mode:'run', minutes:'35-50', effort:'Easy the whole way. Walk breaks are fine and do not count as failure.' },
    exercises: [
      { name:'Foam Roll: quads, calves, glutes', sets:1, reps:'8 min', rest:0 }
    ]
  },
  {
    key: 'arms', name: 'Arms + Lower Stability', type: 'lift',
    focus: 'Arms + the second lower-body session of the cycle',
    exercises: [
      { name:'Slow Step-up (knee over toe)', sets:3, reps:'8-10/side', rest:90, tag:'stab', note:'3s up, 3s down, no push off the back foot. Knee tracks over the toe.' },
      { name:'Reverse Lunge',                sets:3, reps:'10/side',   rest:90, tag:'stab' },
      { name:'Single-leg Calf Raise',        sets:3, reps:'12-15/side', rest:60, tag:'stab' },
      { name:'Banded Ankle Eversion',        sets:2, reps:'20/side',   rest:30, tag:'stab', note:'Boring, 90 seconds, and it is why your ankles stop rolling.' },
      { name:'EZ Bar Curl',                  sets:3, reps:'8-12',  rest:75 },
      { name:'Incline / Preacher Curl',      sets:3, reps:'10-12', rest:60 },
      { name:'Close-grip Bench or Dips',     sets:3, reps:'8-12',  rest:90 },
      { name:'Cable Pushdown',               sets:3, reps:'12-15', rest:60 },
      { name:'Weighted Plank',               sets:3, reps:'30-45s', rest:45, tag:'core' },
      { name:'Hollow Hold',                  sets:3, reps:'20-30s', rest:45, tag:'core' }
    ],
    finisher:'Optional 15 min walk.'
  },
  {
    key: 'rest_full', name: 'Full Rest', type: 'rest',
    focus: 'Actual recovery',
    note:'Optional 20-30 min walk, 8h sleep, eat your protein target. Nothing else. This day is where the adaptation happens.'
  }
];

/* Progression rules shown in the app so you are never guessing. */
const PROGRESSION = [
  'Double progression: stay at the same weight until you hit the TOP of the rep range on every set, then add 2.5 kg (upper body) or 5 kg (lower body).',
  'Main lifts (bench, squat, OHP, RDL, pull-up): stop 1-2 reps short of failure. Accessories: 0-1 reps short.',
  'Deload every 6th cycle: same exercises, 2 sets each, ~60% of your usual weight, no running intervals.',
  'Running volume goes up by no more than ~10% per week. Legs day and run days never sit back to back — the rotation already handles that.',
  'If a joint hurts (not muscle soreness) for 3 sessions running, swap the exercise rather than pushing through.'
];

/* ==================================================================
   NUTRITION DEFAULTS
================================================================== */

const DEFAULT_PROFILE = {
  sex:'male', age:25, heightCm:175, weightKg:75,
  goal:'recomp',                 // 'cut' | 'recomp' | 'gain'
  activity:1.55,                 // 5 lifts + 3 cardio per 9 days
  targets:{ kcal:2750, protein:155, carbs:330, fat:75 },
  autoTargets:true
};

/* Bruce's actual meals, one tap each. Amounts are his stated amounts. */
const PRESET_MEALS = [
  {
    name:'Breakfast (fixed: + eggs)', meal:'breakfast',
    items:[
      { food:'oats_raw', grams:80 },
      { food:'greek_yogurt_0', grams:100 },
      { food:'whey_powder', grams:30 },
      { food:'honey', grams:20 },
      { food:'egg_whole', grams:100 }   // 2 large eggs — the fat your plan was missing
    ]
  },
  {
    name:'Lunch (fixed: + rice, veg, oil)', meal:'lunch',
    items:[
      { food:'chicken_breast_cooked', grams:150 },
      { food:'white_rice_cooked', grams:300 },
      { food:'mixed_veg', grams:150 },
      { food:'olive_oil', grams:10 }
    ]
  },
  {
    name:'Dinner (fixed: 150g + carbs)', meal:'dinner',
    items:[
      { food:'chicken_breast_cooked', grams:150 },
      { food:'white_rice_cooked', grams:300 },
      { food:'mixed_veg', grams:150 },
      { food:'olive_oil', grams:10 }
    ]
  },
  {
    name:'Afternoon snack', meal:'snack',
    items:[
      { food:'banana', grams:118 },
      { food:'almonds', grams:30 }
    ]
  },
  {
    name:'Pre-bed (the missing 20-25g)', meal:'snack',
    items:[
      { food:'greek_yogurt_0', grams:200 },
      { food:'peanut_butter', grams:15 }
    ]
  }
];

/* ==================================================================
   OFFLINE FOOD TABLE — per 100 g, so the app is useful with no signal.
   Barcode scanning covers packaged food; this covers the whole foods
   that barcodes are bad at (raw chicken, rice, oats).
================================================================== */

const LOCAL_FOODS = [
  { id:'chicken_breast_cooked', name:'Chicken breast, cooked',   kcal:165, p:31.0, c:0,    f:3.6 },
  { id:'chicken_breast_raw',    name:'Chicken breast, raw',      kcal:120, p:22.5, c:0,    f:2.6 },
  { id:'chicken_thigh_cooked',  name:'Chicken thigh, cooked',    kcal:209, p:26.0, c:0,    f:10.9 },
  { id:'oats_raw',              name:'Oats, dry/raw',            kcal:379, p:13.2, c:67.7, f:6.5 },
  { id:'greek_yogurt_0',        name:'Greek yogurt, 0% fat',     kcal:59,  p:10.0, c:3.6,  f:0.4 },
  { id:'greek_yogurt_5',        name:'Greek yogurt, 5% fat',     kcal:97,  p:9.0,  c:3.8,  f:5.0 },
  { id:'whey_powder',           name:'Whey protein powder',      kcal:400, p:80.0, c:8.0,  f:6.0 },
  { id:'honey',                 name:'Honey',                    kcal:304, p:0.3,  c:82.4, f:0 },
  { id:'white_rice_cooked',     name:'White rice, cooked',       kcal:130, p:2.7,  c:28.2, f:0.3 },
  { id:'white_rice_raw',        name:'White rice, raw',          kcal:365, p:7.1,  c:80.0, f:0.7 },
  { id:'brown_rice_cooked',     name:'Brown rice, cooked',       kcal:123, p:2.7,  c:25.6, f:1.0 },
  { id:'potato_boiled',         name:'Potato, boiled',           kcal:87,  p:1.9,  c:20.1, f:0.1 },
  { id:'sweet_potato_baked',    name:'Sweet potato, baked',      kcal:90,  p:2.0,  c:20.7, f:0.2 },
  { id:'pasta_cooked',          name:'Pasta, cooked',            kcal:158, p:5.8,  c:30.9, f:0.9 },
  { id:'bread_wholemeal',       name:'Bread, wholemeal',         kcal:247, p:13.0, c:41.0, f:3.4 },
  { id:'egg_whole',             name:'Egg, whole',               kcal:143, p:12.6, c:0.7,  f:9.5 },
  { id:'egg_white',             name:'Egg white',                kcal:52,  p:10.9, c:0.7,  f:0.2 },
  { id:'salmon_cooked',         name:'Salmon, cooked',           kcal:208, p:22.1, c:0,    f:12.4 },
  { id:'tuna_canned_water',     name:'Tuna, canned in water',    kcal:116, p:25.5, c:0,    f:0.8 },
  { id:'beef_mince_5',          name:'Beef mince, 5% fat',       kcal:137, p:21.0, c:0,    f:5.0 },
  { id:'tofu_firm',             name:'Tofu, firm',               kcal:144, p:15.8, c:2.8,  f:8.7 },
  { id:'cottage_cheese',        name:'Cottage cheese, low fat',  kcal:72,  p:12.4, c:2.7,  f:1.0 },
  { id:'milk_semi',             name:'Milk, semi-skimmed',       kcal:50,  p:3.4,  c:4.8,  f:1.8 },
  { id:'olive_oil',             name:'Olive oil',                kcal:884, p:0,    c:0,    f:100 },
  { id:'peanut_butter',         name:'Peanut butter',            kcal:588, p:25.1, c:20.0, f:50.4 },
  { id:'almonds',               name:'Almonds',                  kcal:579, p:21.2, c:21.6, f:49.9 },
  { id:'banana',                name:'Banana',                   kcal:89,  p:1.1,  c:22.8, f:0.3 },
  { id:'apple',                 name:'Apple',                    kcal:52,  p:0.3,  c:13.8, f:0.2 },
  { id:'blueberries',           name:'Blueberries',              kcal:57,  p:0.7,  c:14.5, f:0.3 },
  { id:'mixed_veg',             name:'Mixed vegetables',         kcal:45,  p:2.4,  c:8.0,  f:0.3 },
  { id:'broccoli',              name:'Broccoli',                 kcal:34,  p:2.8,  c:6.6,  f:0.4 },
  { id:'avocado',               name:'Avocado',                  kcal:160, p:2.0,  c:8.5,  f:14.7 }
];

const MEALS = [
  { key:'breakfast', label:'Breakfast' },
  { key:'lunch',     label:'Lunch' },
  { key:'dinner',    label:'Dinner' },
  { key:'snack',     label:'Snacks' }
];

/* Look up a local food by id. */
function localFood(id){ return LOCAL_FOODS.find(f => f.id === id) || null; }
