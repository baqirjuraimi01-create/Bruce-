/* Unit tests for the muscle classifier and volume analysis.
   Run: npm run test:unit */

global.round = (n, dp = 0) => { const m = Math.pow(10, dp); return Math.round(n * m) / m; };

const V = require('../js/volume.js');

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if(a === b){ pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n         got  ' + a + '\n         want ' + b); }
};
const primary = name => {
  const p = V.muscleProfile(name);
  let best = null, top = 0;
  for(const m in p) if(p[m] > top){ top = p[m]; best = m; }
  return best;
};
const isPrimary = (name, want) => eq(`"${name}" → ${want}`, primary(name), want);

console.log('— classifying exercises the user types themselves —');
// The exact wording from the routine the user described.
isPrimary('Flat press',         'chest');
isPrimary('Incline presses',    'chest');
isPrimary('Cable bicep curls',  'biceps');
isPrimary('Dips',               'chest');

console.log('\n— ordering traps: the patterns that overlap —');
isPrimary('Leg curl',            'hamstrings');   // not "curl" → biceps
isPrimary('Seated Leg Curl',     'hamstrings');
isPrimary('Close-grip Bench',    'triceps');      // not "bench" → chest
isPrimary('EZ Bar Skullcrusher', 'triceps');
isPrimary('Leg Press',           'quads');        // not "press" → chest
isPrimary('Overhead Press',      'front_delts');  // not "press" → chest
isPrimary('Standing Calf Raise', 'calves');       // not "raise" → side delts
isPrimary('Lateral Raise',       'side_delts');
isPrimary('Hanging Leg Raise',   'core');
isPrimary('Face Pull',           'rear_delts');   // not "pull" → back
isPrimary('Cable Row',           'back');
isPrimary('Hip Thrust',          'hamstrings');

console.log('\n— assisting muscles are counted as fractions —');
eq('bench profile', V.muscleProfile('Barbell Bench Press'), { chest:1, triceps:0.5, front_delts:0.3 });
eq('mobility work trains nothing', V.muscleProfile('Couch Stretch'), {});
eq('unknown name is not guessed at', V.muscleProfile('Zercher Widowmaker'), {});

console.log('\n— set counting —');
{
  const push = [
    { name:'Flat press',        sets:4 },
    { name:'Incline presses',   sets:3 },
    { name:'Cable bicep curls', sets:3 },
    { name:'Dips',              sets:3 }
  ];
  const s = V.daySets(push);
  eq('chest sets', round(s.chest, 1), 10);          // 4 + 3 + 3
  eq('biceps sets', round(s.biceps, 1), 3);
  eq('triceps sets', round(s.triceps, 1), 5.6);     // 4*.5 + 3*.5 + 3*.7
  eq('no side-delt work at all', s.side_delts, undefined);
  eq('no core work at all', s.core, undefined);
}

console.log('\n— weekly volume is scaled by cycle length —');
{
  // one day of 10 chest sets inside a 9-day rotation
  const plan = [{ exercises:[{ name:'Bench Press', sets:10 }] }].concat(
    Array.from({ length:8 }, () => ({ exercises:[] })));
  eq('10 sets / 9 days → per week', V.weeklySets(plan).chest, round(10*7/9, 1));
}

console.log('\n— deficits —');
{
  // start everything at target, then knock two muscles down, so the
  // ranking is actually comparing those two
  const full = {};
  for(const m in V.TARGETS) full[m] = V.TARGETS[m];
  const d = V.deficits({ ...full, chest:12, side_delts:2, core:6 });
  const byMuscle = Object.fromEntries(d.map(x => [x.muscle, x.short]));
  eq('chest above target is not flagged', byMuscle.chest, undefined);
  eq('side delts short by 6', byMuscle.side_delts, 6);
  eq('core short by 2', byMuscle.core, 2);
  eq('only the two shortfalls are listed', d.length, 2);
  eq('worst proportional shortfall ranks first', d[0].muscle, 'side_delts');
}

console.log('\n— suggestions for the user\'s push day —');
{
  const push = [
    { name:'Flat press',        sets:4 },
    { name:'Incline presses',   sets:3 },
    { name:'Cable bicep curls', sets:3 },
    { name:'Dips',              sets:3 }
  ];
  // that day repeated in a 9-day rotation, nothing else logged
  const plan = [{ exercises:push }].concat(Array.from({ length:8 }, () => ({ exercises:[] })));
  const perWeek = V.weeklySets(plan);
  // theme comes from the original programmed push day
  const theme = [
    { name:'Barbell Bench Press', sets:4 }, { name:'Standing Overhead Press', sets:3 },
    { name:'Cable Lateral Raise', sets:3 }, { name:'Ab Wheel Rollout', sets:3 }
  ];
  const s = V.suggestFor(push, perWeek, theme, 2);

  eq('two suggestions offered', s.length, 2);
  const muscles = s.map(x => x.muscle);
  console.log('         suggests: ' + s.map(x => `${x.exercise.name} (${x.label})`).join(', '));
  eq('side delts flagged — no lateral work in the routine', muscles.includes('side_delts'), true);

  // hamstrings are also short, but must not be suggested on a push day
  eq('hamstrings are short overall', V.deficits(perWeek).some(d => d.muscle === 'hamstrings'), true);
  eq('...but never suggested on push day', muscles.includes('hamstrings'), false);
}

console.log('\n— suggestions never repeat what is already there —');
{
  const day = [{ name:'Cable Lateral Raise', sets:3 }, { name:'Bench Press', sets:3 }];
  const plan = [{ exercises:day }].concat(Array.from({ length:8 }, () => ({ exercises:[] })));
  const s = V.suggestFor(day, V.weeklySets(plan), day, 3);
  eq('does not re-suggest an exercise in the list',
     s.some(x => x.exercise.name === 'Cable Lateral Raise'), false);
}

console.log('\n— every built-in fix classifies to the muscle it claims to fix —');
{
  const wrong = [];
  for(const m in V.FIXES)
    for(const f of V.FIXES[m]){
      const p = V.muscleProfile(f.name);
      if(!(p[m] >= 0.5)) wrong.push(`${f.name} does not train ${m}`);
    }
  eq('all fixes hit their target muscle', wrong, []);
}

console.log('\n— the shipped program covers every muscle it should —');
{
  const fs = require('fs'), vm = require('vm');
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(__dirname + '/../js/data.js', 'utf8') +
    ';globalThis.D = { PROGRAM };', ctx);
  const perWeek = V.weeklySets(ctx.D.PROGRAM.map(d => ({ exercises:d.exercises || [] })));
  const all = V.deficits(perWeek);
  console.log('         ' + Object.keys(perWeek).sort()
    .map(m => `${V.LABELS[m]} ${perWeek[m]}`).join(', '));
  if(all.length) console.log('         at or below minimum: ' +
    all.map(d => `${d.label} ${d.have}/${d.target}`).join(', '));
  // Mild shortfalls are a judgement call — this is a strength-and-running
  // program, not a bodybuilding split. A muscle under half its minimum
  // would be a genuine hole, and there should not be one.
  const severe = all.filter(d => d.have < d.target * 0.5).map(d => d.label);
  eq('no muscle is under half its weekly minimum', severe, []);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
