/* ------------------------------------------------------------------
   volume.js — works out which muscles a routine actually trains, how
   many sets per week that comes to, and what is missing.

   Exercises you type yourself will never be in a lookup table, so the
   classifier is rule-based: an ordered list of patterns, first match
   wins. Order matters — "leg curl" must be caught before "curl", and
   "close-grip bench" before "bench".

   Set counting uses the usual convention: a set counts 1.0 for the
   muscle doing the work and a fraction for muscles helping out.

   Pure functions — unit tested in test/volume.test.cjs.
------------------------------------------------------------------- */

const Volume = (() => {

  const LABELS = {
    chest:'Chest', back:'Back', front_delts:'Front delts', side_delts:'Side delts',
    rear_delts:'Rear delts', biceps:'Biceps', triceps:'Triceps', quads:'Quads',
    hamstrings:'Hamstrings', glutes:'Glutes', calves:'Calves', adductors:'Adductors',
    core:'Core', traps:'Traps'
  };

  /* Weekly direct-set minimums. Below these, a muscle is being
     under-stimulated for growth; the app flags it rather than nagging
     about an upper bound. */
  const TARGETS = {
    chest:10, back:10, quads:10, hamstrings:8, glutes:8,
    front_delts:6, side_delts:8, rear_delts:6,
    biceps:8, triceps:8, calves:8, core:8, adductors:3, traps:3
  };

  /* Ordered. First pattern that matches decides the profile. */
  const RULES = [
    [/close-?grip|jm press|skull ?crusher|skullcrusher/i,        { triceps:1, chest:0.3 }],
    [/leg curl|nordic|ham(string)? curl|glute ham/i,             { hamstrings:1 }],
    [/leg press|hack squat/i,                                    { quads:1, glutes:0.5 }],
    [/squat|lunge|step-?up|split squat/i,                        { quads:1, glutes:0.5, hamstrings:0.3, adductors:0.3 }],
    [/rdl|romanian|deadlift|good ?morning|back extension|hip thrust|hyperextension/i,
                                                                 { hamstrings:1, glutes:1, back:0.3, traps:0.3 }],
    [/calf|tibialis|ankle|heel raise|soleus/i,                   { calves:1 }],
    [/adductor|copenhagen|cossack/i,                             { adductors:1 }],
    [/abduction|band walk|monster walk|glute med/i,              { glutes:1 }],
    [/lateral raise|side raise|lat raise|upright row/i,          { side_delts:1 }],
    [/rear delt|face pull|reverse pec|pull-?apart|reverse fly/i, { rear_delts:1 }],
    [/shrug/i,                                                   { traps:1 }],
    [/overhead press|shoulder press|ohp|military|arnold|push press|landmine press|seated dumbbell press/i,
                                                                 { front_delts:1, triceps:0.5, chest:0.3 }],
    [/pull-?up|chin-?up|pulldown|pull ?down|straight-?arm/i,      { back:1, biceps:0.5 }],
    [/row(ing)?\b|row$/i,                                        { back:1, biceps:0.5, rear_delts:0.3, traps:0.3 }],
    [/pushdown|push ?down|triceps|tricep|overhead extension|kickback/i, { triceps:1 }],
    [/curl/i,                                                    { biceps:1 }],
    [/carry|farmer/i,                                            { core:0.7, traps:0.5, back:0.3 }],
    [/plank|ab wheel|rollout|dead ?bug|hollow|leg raise|knee raise|pallof|bird ?dog|crunch|sit-?up|woodchop|anti-?rotation/i,
                                                                 { core:1 }],
    [/fly|pec deck|crossover/i,                                  { chest:1, front_delts:0.3 }],
    [/dip\b|dips\b/i,                                            { chest:1, triceps:0.7, front_delts:0.3 }],
    [/incline/i,                                                 { chest:1, front_delts:0.5, triceps:0.5 }],
    [/bench|chest press|flat press|flat bench|push-?up|press-?up|floor press/i,
                                                                 { chest:1, triceps:0.5, front_delts:0.3 }],
    [/stance|balance|dorsiflex|hip switch|90\/90/i,              { core:0.5 }],
    [/stretch|foam roll|mobility/i,                              {}],
    /* Last resort: a bare "press" is a chest press more often than not. */
    [/press/i,                                                   { chest:1, triceps:0.5, front_delts:0.3 }]
  ];

  function muscleProfile(name){
    for(const [re, profile] of RULES) if(re.test(name || '')) return profile;
    return {};
  }

  /* Sets per muscle for one day's list of exercises. */
  function daySets(exercises){
    const out = {};
    for(const ex of exercises || []){
      const p = muscleProfile(ex.name);
      for(const m in p) out[m] = (out[m] || 0) + (ex.sets || 0) * p[m];
    }
    return out;
  }

  /* Sets per muscle per week, across the whole rotation.
     `plan` is an array of days, each with an `exercises` array. */
  function weeklySets(plan){
    const total = {};
    for(const day of plan){
      const d = daySets(day.exercises);
      for(const m in d) total[m] = (total[m] || 0) + d[m];
    }
    const perWeek = {};
    const days = plan.length || 1;
    for(const m in total) perWeek[m] = round(total[m] * 7 / days, 1);
    return perWeek;
  }

  /* Muscles below their weekly minimum, worst shortfall first. */
  function deficits(perWeek){
    const out = [];
    for(const m in TARGETS){
      const have = perWeek[m] || 0;
      if(have < TARGETS[m])
        out.push({ muscle:m, label:LABELS[m], have:round(have, 1), target:TARGETS[m],
                   short:round(TARGETS[m] - have, 1) });
    }
    return out.sort((a, b) => (b.short / b.target) - (a.short / a.target));
  }

  /* One-tap fixes, keyed by muscle. */
  const FIXES = {
    chest:       [{ name:'Incline Dumbbell Press', sets:3, reps:'8-12', rest:120 },
                  { name:'Machine Chest Press',    sets:3, reps:'10-12', rest:90 }],
    back:        [{ name:'Chest-supported Row',    sets:3, reps:'8-12', rest:120 },
                  { name:'Lat Pulldown',           sets:3, reps:'8-12', rest:120 }],
    front_delts: [{ name:'Seated Dumbbell Press',  sets:3, reps:'8-12', rest:90 }],
    side_delts:  [{ name:'Cable Lateral Raise',    sets:3, reps:'12-15', rest:60 },
                  { name:'Dumbbell Lateral Raise', sets:3, reps:'12-15', rest:60 }],
    rear_delts:  [{ name:'Face Pull',              sets:3, reps:'15', rest:60 },
                  { name:'Rear Delt Fly',          sets:3, reps:'15-20', rest:45 }],
    biceps:      [{ name:'Incline Dumbbell Curl',  sets:3, reps:'10-12', rest:60 }],
    triceps:     [{ name:'Cable Pushdown',         sets:3, reps:'12-15', rest:60 },
                  { name:'Overhead Cable Triceps Ext', sets:3, reps:'10-12', rest:60 }],
    quads:       [{ name:'Leg Press',              sets:3, reps:'8-12', rest:150 },
                  { name:'Bulgarian Split Squat',  sets:3, reps:'8-10/side', rest:120, tag:'stab' }],
    hamstrings:  [{ name:'Seated Leg Curl',        sets:3, reps:'8-12', rest:90 },
                  { name:'Romanian Deadlift',      sets:3, reps:'6-8', rest:180 }],
    glutes:      [{ name:'Hip Thrust',             sets:3, reps:'8-12', rest:120 }],
    calves:      [{ name:'Standing Calf Raise',    sets:4, reps:'8-12', rest:75 }],
    adductors:   [{ name:'Copenhagen Plank',       sets:2, reps:'20-30s/side', rest:45, tag:'stab' }],
    core:        [{ name:'Ab Wheel Rollout',       sets:3, reps:'8-12', rest:75, tag:'core' },
                  { name:'Hanging Leg Raise',      sets:3, reps:'10-15', rest:75, tag:'core' }],
    traps:       [{ name:'Dumbbell Shrug',         sets:3, reps:'10-15', rest:60 }]
  };

  /* Suggestions for ONE day. Only offers muscles that already belong on
     that day — nobody wants hamstring work suggested on push day — which
     it decides from the muscles the day already trains, falling back to
     the day's original programmed profile. */
  function suggestFor(dayExercises, perWeek, themeExercises, max = 2){
    const theme = daySets((themeExercises && themeExercises.length) ? themeExercises : dayExercises);
    const onTheme = new Set(Object.keys(theme).filter(m => theme[m] >= 0.5));
    const already = new Set((dayExercises || []).map(e => (e.name || '').toLowerCase()));

    const out = [];
    for(const d of deficits(perWeek)){
      if(!onTheme.has(d.muscle)) continue;
      const fix = (FIXES[d.muscle] || []).find(f => !already.has(f.name.toLowerCase()));
      if(!fix) continue;
      out.push({ ...d, exercise:fix });
      if(out.length >= max) break;
    }
    return out;
  }

  return { LABELS, TARGETS, RULES, muscleProfile, daySets, weeklySets, deficits, suggestFor, FIXES };
})();

if(typeof module !== 'undefined' && module.exports) module.exports = Volume;
