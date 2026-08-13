/* Unit tests for merging two devices' data. Run: npm run test:unit
   The property that matters most: merging must never lose anything. */

const M = require('../js/merge.js');

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if(a === b){ pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n         got  ' + a + '\n         want ' + b); }
};
const ok = (label, cond, detail) => {
  if(cond){ pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '\n         ' + detail : '')); }
};

const entry = (id, kcal, p) => ({ id, name:'food ' + id, grams:100, kcal, p, c:0, f:0, meal:'lunch' });
const blank = () => ({ profile:{}, settings:{}, days:{}, sessions:{}, cardio:{}, customFoods:[], routines:{} });

console.log('— the case this exists for: same day logged on two devices —');
{
  const phone = blank();
  phone.days['2026-08-13'] = { entries:[entry('a', 500, 40)], weight:75, steps:9000, note:'' };
  const safari = blank();
  safari.days['2026-08-13'] = { entries:[entry('b', 300, 25)], weight:null, steps:null, note:'' };

  const { state, stats } = M.mergeState(phone, safari);
  const day = state.days['2026-08-13'];
  eq('both entries survive', day.entries.map(e => e.id), ['a','b']);
  eq('nothing was dropped', day.entries.length, 2);
  eq('the weight already here is kept', day.weight, 75);
  eq('steps already here are kept', day.steps, 9000);
  eq('one new entry counted', stats.entries, 1);
  console.log('         ' + M.summarise(stats));
}

console.log('\n— a day only the other device has —');
{
  const a = blank();
  const b = blank();
  b.days['2026-08-10'] = { entries:[entry('x', 700, 50), entry('y', 200, 10)], weight:74, steps:null, note:'hi' };
  const { state, stats } = M.mergeState(a, b);
  eq('the whole day comes across', state.days['2026-08-10'].entries.length, 2);
  eq('counted as a new day', stats.days, 1);
  eq('and its entries', stats.entries, 2);
}

console.log('\n— importing the same file twice changes nothing —');
{
  const a = blank();
  a.days['2026-08-13'] = { entries:[entry('a', 500, 40)], weight:75, steps:null, note:'' };
  const b = JSON.parse(JSON.stringify(a));
  const once  = M.mergeState(a, b);
  const twice = M.mergeState(once.state, b);
  eq('no duplicate entries', twice.state.days['2026-08-13'].entries.map(e => e.id), ['a']);
  eq('second merge reports nothing new', M.summarise(twice.stats), 'Nothing new — already up to date');
}

console.log('\n— blanks are filled, real values are not overwritten —');
{
  const a = blank(); a.days['d'] = { entries:[], weight:null, steps:null, note:'' };
  const b = blank(); b.days['d'] = { entries:[], weight:76,  steps:8000, note:'ate late' };
  const { state } = M.mergeState(a, b);
  eq('missing weight filled from the file', state.days['d'].weight, 76);
  eq('missing steps filled', state.days['d'].steps, 8000);
  eq('missing note filled', state.days['d'].note, 'ate late');

  const c = blank(); c.days['d'] = { entries:[], weight:75, steps:9000, note:'mine' };
  const merged = M.mergeState(c, b).state.days['d'];
  eq('existing weight untouched', merged.weight, 75);
  eq('existing steps untouched', merged.steps, 9000);
  eq('existing note untouched', merged.note, 'mine');
}

console.log('\n— training sessions —');
{
  const a = blank();
  a.sessions['2026-08-13'] = { dayKey:'push', exercises:{ 'Bench':[{w:'80',r:'8',done:true}] },
                               swaps:{}, note:'', done:false };
  const b = blank();
  b.sessions['2026-08-13'] = { dayKey:'push',
    exercises:{ 'Bench':[{w:'80',r:'8',done:true},{w:'80',r:'8',done:true}],
                'Incline':[{w:'30',r:'10',done:true}] },
    swaps:{ Bench:'Smith Bench' }, note:'felt good', done:true };

  const { state, stats } = M.mergeState(a, b);
  const s = state.sessions['2026-08-13'];
  eq('an exercise only the file has is added', Object.keys(s.exercises).sort(), ['Bench','Incline']);
  eq('the fuller record of a shared exercise wins', s.exercises['Bench'].length, 2);
  // one extra Bench set, plus the single Incline set that was not here at all
  eq('every completed set gained is counted', stats.sets, 2);
  eq('a swap comes across', s.swaps.Bench, 'Smith Bench');
  eq('the note fills the blank one', s.note, 'felt good');
  eq('done stays true if either says so', s.done, true);
}
{
  // the reverse: this device has more, and must not be downgraded
  const a = blank();
  a.sessions['d'] = { dayKey:'push', exercises:{ 'Bench':[{w:'80',r:'8',done:true},{w:'80',r:'8',done:true}] }, swaps:{}, note:'mine', done:true };
  const b = blank();
  b.sessions['d'] = { dayKey:'push', exercises:{ 'Bench':[{w:'60',r:'5',done:true}] }, swaps:{}, note:'theirs', done:false };
  const s = M.mergeState(a, b).state.sessions['d'];
  eq('this device keeps its fuller session', s.exercises['Bench'].length, 2);
  eq('and its own note', s.note, 'mine');
}

console.log('\n— cardio and saved foods —');
{
  const a = blank();
  a.cardio['d'] = [{ id:'r1', mode:'run', minutes:30 }];
  a.customFoods = [{ id:'f1', name:'Shake', barcode:'111' }];
  const b = blank();
  b.cardio['d'] = [{ id:'r1', mode:'run', minutes:30 }, { id:'r2', mode:'walk', minutes:20 }];
  b.customFoods = [{ id:'f1', name:'Shake', barcode:'111' }, { id:'f2', name:'Bar', barcode:'222' }];

  const { state, stats } = M.mergeState(a, b);
  eq('cardio unioned without duplicating', state.cardio['d'].map(c => c.id), ['r1','r2']);
  eq('one cardio session counted', stats.cardio, 1);
  eq('saved foods unioned', state.customFoods.map(f => f.id), ['f1','f2']);
  eq('one food counted', stats.foods, 1);
}

console.log('\n— routines and settings —');
{
  const a = blank();
  a.routines = { push:[{ name:'Flat press', sets:4 }] };
  a.profile = { weightKg:75 };
  a.settings = { stepGoal:10000 };
  const b = blank();
  b.routines = { push:[{ name:'Bench', sets:3 }], legs:[{ name:'Squat', sets:4 }] };
  b.profile = { weightKg:80, heightCm:175 };
  b.settings = { stepGoal:12000, usdaKey:'abc' };

  const { state, stats } = M.mergeState(a, b);
  eq('your own routine is kept', state.routines.push[0].name, 'Flat press');
  eq('a day you have not customised is taken', state.routines.legs[0].name, 'Squat');
  eq('one routine counted', stats.routines, 1);
  eq('your bodyweight is kept', state.profile.weightKg, 75);
  eq('a field you lack is filled', state.profile.heightCm, 175);
  eq('your step goal is kept', state.settings.stepGoal, 10000);
  eq('a setting you lack is filled', state.settings.usdaKey, 'abc');
}

console.log('\n— merging never destroys —');
{
  const a = blank();
  a.days['d1'] = { entries:[entry('a1', 100, 10), entry('a2', 200, 20)], weight:75, steps:1, note:'' };
  a.cardio['d1'] = [{ id:'c1', minutes:10 }];
  a.customFoods = [{ id:'f1' }];
  const b = blank();
  b.days['d2'] = { entries:[entry('b1', 300, 30)], weight:null, steps:null, note:'' };

  const before = a.days['d1'].entries.length + a.cardio['d1'].length + a.customFoods.length;
  const { state } = M.mergeState(a, b);
  const after = state.days['d1'].entries.length + state.cardio['d1'].length + state.customFoods.length;
  ok('everything already here is still here', after === before, `${before} -> ${after}`);
  ok('and the other device\'s day arrived', !!state.days['d2']);
}

console.log('\n— bad input —');
{
  let threw = false;
  try { M.mergeState(blank(), null); } catch(e){ threw = true; }
  ok('null backup is rejected', threw);
  const empty = M.mergeState(blank(), {});
  eq('an empty object merges to nothing', M.summarise(empty.stats), 'Nothing new — already up to date');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
