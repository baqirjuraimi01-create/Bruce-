/* Unit tests for the pure progression logic.  Run: npm run test:unit */

global.round = (n, dp = 0) => { const m = Math.pow(10, dp); return Math.round(n * m) / m; };

const P = require('../js/progression.js');

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if(a === b){ pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n         got  ' + a + '\n         want ' + b); }
};
const has = (label, got, needle) => {
  if(String(got).includes(needle)){ pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n         got "' + got + '"\n         want to contain "' + needle + '"'); }
};

const set = (w, r, done = true) => ({ w:String(w), r:String(r), rpe:'', done });

console.log('— parseReps: every prescription used in the program —');
const cases = [
  ['5-8',           { kind:'reps', min:5,  max:8,  perSide:false, unit:'reps' }],
  ['15',            { kind:'reps', min:15, max:15, perSide:false, unit:'reps' }],
  ['8-10/side',     { kind:'reps', min:8,  max:10, perSide:true,  unit:'reps' }],
  ['12/side',       { kind:'reps', min:12, max:12, perSide:true,  unit:'reps' }],
  ['30-45s',        { kind:'time', min:30, max:45, perSide:false, unit:'s' }],
  ['20-30s/side',   { kind:'time', min:20, max:30, perSide:true,  unit:'s' }],
  ['45s/side',      { kind:'time', min:45, max:45, perSide:true,  unit:'s' }],
  ['30-40m/side',   { kind:'distance', min:30, max:40, perSide:true, unit:'m' }],
  ['8 min',         { kind:'time', min:480, max:480, perSide:false, unit:'min' }],
  ['AMRAP-2',       { kind:'amrap', shy:2, min:0, max:0, perSide:false, unit:'reps' }]
];
for(const [input, want] of cases) eq(`"${input}"`, P.parseReps(input), want);

console.log('\n— every exercise in the program parses to something usable —');
{
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../js/data.js', 'utf8');
  const reps = [...src.matchAll(/reps:'([^']+)'/g)].map(m => m[1]);
  const bad = reps.filter(r => {
    const s = P.parseReps(r);
    return !(s.max > 0 || s.kind === 'amrap');
  });
  eq(`${reps.length} prescriptions, none unparsed`, bad, []);
}

console.log('\n— exercise alternatives —');
{
  const fs = require('fs'), vm = require('vm');
  const ctx = { console };
  vm.createContext(ctx);
  // top-level `const` is lexical, not a context property — export explicitly
  vm.runInContext(fs.readFileSync(__dirname + '/../js/data.js', 'utf8') +
    ';globalThis.D = { PROGRAM, ALTERNATIVES, altsFor };', ctx);
  const D = ctx.D;

  // Mobility and stretching do not need equipment swaps; loaded work does.
  const MOBILITY = /stretch|foam roll|hip switch|dorsiflexion rock/i;
  const lifting = [];
  for(const day of D.PROGRAM)
    for(const ex of (day.exercises || []))
      if(!MOBILITY.test(ex.name)) lifting.push(ex.name);

  const missing = [...new Set(lifting)].filter(n => D.altsFor(n).length === 0);
  eq(`${new Set(lifting).size} loaded exercises all have alternatives`, missing, []);

  // Alternatives must not point back at the exercise itself.
  const selfRef = Object.keys(D.ALTERNATIVES).filter(k => D.ALTERNATIVES[k].includes(k));
  eq('no exercise lists itself as its own alternative', selfRef, []);

  // Every alternative should be a real, non-empty name.
  const bad = [];
  for(const k in D.ALTERNATIVES)
    for(const a of D.ALTERNATIVES[k])
      if(typeof a !== 'string' || !a.trim()) bad.push(k);
  eq('all alternatives are named', bad, []);

  const counts = Object.values(D.ALTERNATIVES).map(a => a.length);
  console.log(`         ${Object.keys(D.ALTERNATIVES).length} exercises, ` +
              `${counts.reduce((a,b)=>a+b,0)} alternatives, ` +
              `${Math.min(...counts)}-${Math.max(...counts)} each`);
}

console.log('\n— plan: the double-progression decision —');
const r58 = P.parseReps('5-8');

eq('no history → first time',
   P.plan(r58, [], 2.5).action, 'first');

eq('unticked sets do not count as history',
   P.plan(r58, [set(80, 6, false), set(80, 6, false)], 2.5).action, 'first');

{ // top of range on every set → add weight, reset to bottom
  const res = P.plan(r58, [set(80,8), set(80,8), set(80,8)], 2.5);
  eq('all sets at max → add-weight', res.action, 'add-weight');
  eq('  new weight = 80 + 2.5', res.weight, 82.5);
  eq('  reps reset to the floor', res.reps, 5);
}

{ // one set short → hold the weight, chase the rep
  const res = P.plan(r58, [set(80,8), set(80,7), set(80,6)], 2.5);
  eq('one set short → add-reps', res.action, 'add-reps');
  eq('  weight unchanged', res.weight, 80);
  eq('  target = lowest + 1', res.reps, 7);
}

{ // never target beyond the top of the range
  const res = P.plan(P.parseReps('12'), [set(30,12), set(30,11)], 2.5);
  eq('target caps at the range max', res.reps, 12);
}

{ // fell under the floor → back the weight off
  const res = P.plan(r58, [set(100,4), set(100,3)], 2.5);
  eq('below the floor → drop-weight', res.action, 'drop-weight');
  eq('  90% rounded to a loadable 2.5 kg step', res.weight, 90);
}

{ // a drop that would not actually drop must not fire
  const res = P.plan(r58, [set(2.5,3)], 2.5);
  eq('cannot drop below one increment → holds instead', res.action, 'add-reps');
}

{ // lower-body compounds jump 5 kg
  eq('squat increment', P.increment('Back Squat'), 5);
  eq('RDL increment', P.increment('Romanian Deadlift'), 5);
  eq('split squat increment', P.increment('Bulgarian Split Squat'), 5);
  eq('bench increment', P.increment('Barbell Bench Press'), 2.5);
  eq('lateral raise increment', P.increment('Cable Lateral Raise'), 2.5);
}

{ // bodyweight work has no bar to load
  const res = P.plan(P.parseReps('30-45s'), [set('', 45), set('', 45)], 2.5);
  eq('bodyweight at max → add-load', res.action, 'add-load');
}

{ // AMRAP is scored on the total
  const res = P.plan(P.parseReps('AMRAP-2'), [set('',9), set('',8), set('',8)], 2.5);
  eq('amrap → beat', res.action, 'beat');
  eq('  total', res.total, 25);
  eq('  target', res.target, 26);
}

console.log('\n— describe: the sentence the app shows —');
has('add-weight names both weights',
    P.describe(r58, P.plan(r58, [set(80,8), set(80,8)], 2.5), 'Bench'), '82.5 kg × 5');
has('add-reps quotes last session',
    P.describe(r58, P.plan(r58, [set(80,6), set(80,5)], 2.5), 'Bench'), 'Last: 6, 5');
has('per-side prescriptions say so',
    P.describe(P.parseReps('8-10/side'),
               P.plan(P.parseReps('8-10/side'), [set(20,10), set(20,10)], 5), 'Split squat'), 'each side');
has('deload is explicit',
    P.describe(r58, { action:'deload' }, 'Bench'), '60%');
has('first time gives a starting instruction',
    P.describe(r58, { action:'first' }, 'Bench'), '1-2 reps left');
has('seconds render with the s unit',
    P.describe(P.parseReps('30-45s'),
               P.plan(P.parseReps('30-45s'), [set('',30), set('',30)], 2.5), 'Plank'), '31s');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
