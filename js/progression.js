/* ------------------------------------------------------------------
   progression.js — decides what you should do THIS session for a given
   exercise, based on what you actually logged last time.

   The rule is double progression: hold the weight until every set hits
   the TOP of the prescribed rep range, then add load and drop back to
   the bottom of the range. Fall below the bottom and the weight comes
   down instead.

   parseReps() and plan() are pure so they can be unit-tested.
------------------------------------------------------------------- */

const Progression = (() => {

  /* Lower-body compounds take a bigger jump than everything else. */
  const LOWER = /squat|deadlift|romanian|leg press|hip thrust|lunge|step-up/i;
  function increment(name){ return LOWER.test(name || '') ? 5 : 2.5; }

  /* ---------- parse a prescription like "5-8" or "30-45s/side" ---------- */
  function parseReps(str){
    const raw = String(str == null ? '' : str).trim();

    const amrap = raw.match(/^AMRAP-(\d+)$/i);
    if(amrap) return { kind:'amrap', shy:+amrap[1], min:0, max:0, perSide:false, unit:'reps' };

    const perSide = /\/\s*side/i.test(raw);
    const s = raw.replace(/\/\s*side/i, '').trim();
    let m;

    // "8 min" before "…m", otherwise metres would swallow it.
    if((m = s.match(/^(\d+)(?:\s*-\s*(\d+))?\s*min$/i)))
      return { kind:'time', min:+m[1]*60, max:+(m[2] || m[1])*60, perSide, unit:'min' };
    if((m = s.match(/^(\d+)(?:\s*-\s*(\d+))?\s*s$/i)))
      return { kind:'time', min:+m[1], max:+(m[2] || m[1]), perSide, unit:'s' };
    if((m = s.match(/^(\d+)(?:\s*-\s*(\d+))?\s*m$/i)))
      return { kind:'distance', min:+m[1], max:+(m[2] || m[1]), perSide, unit:'m' };
    if((m = s.match(/^(\d+)(?:\s*-\s*(\d+))?$/)))
      return { kind:'reps', min:+m[1], max:+(m[2] || m[1]), perSide, unit:'reps' };

    return { kind:'reps', min:0, max:0, perSide, unit:'reps' };
  }

  /* Round a weight to something you can actually load on a bar. */
  function loadable(kg, inc){
    return Math.max(inc, Math.round(kg / inc) * inc);
  }

  /* ---------- the decision ---------- */
  function plan(spec, sets, inc){
    const done = (sets || []).filter(s => s.done && (s.w !== '' || s.r !== ''));
    if(!done.length) return { action:'first' };

    const nums = done.map(s => parseFloat(s.r) || 0);   // reps, seconds or metres
    const wts  = done.map(s => parseFloat(s.w) || 0);
    const weight = Math.max(...wts);
    const loaded = weight > 0;

    // Pull-ups etc: beat the total, there is no ceiling to reset from.
    if(spec.kind === 'amrap'){
      const total = nums.reduce((a, b) => a + b, 0);
      return { action:'beat', weight, last:nums, total, target: total + 1 };
    }

    const allAtMax = nums.every(n => n >= spec.max);
    const lowest = Math.min(...nums);

    if(allAtMax){
      // Earned the increase. Loaded lifts add weight; bodyweight work
      // needs a harder variation or added load instead.
      return loaded
        ? { action:'add-weight', weight: round(weight + inc, 1), from: weight, reps: spec.min, last:nums }
        : { action:'add-load', reps: spec.max, last:nums };
    }

    if(loaded && lowest < spec.min){
      const dropped = loadable(weight * 0.9, inc);
      // Only actually a drop if it lands below where you were.
      if(dropped < weight)
        return { action:'drop-weight', weight: dropped, from: weight, reps: spec.min, last:nums };
    }

    return { action:'add-reps', weight, reps: Math.min(spec.max, lowest + 1), target: spec.max, last:nums };
  }

  /* ---------- human-readable instruction ---------- */
  function describe(spec, res, exName){
    const side = spec.perSide ? ' each side' : '';
    const u = spec.unit === 'reps' ? '' : spec.unit === 'min' ? ' min' : spec.unit;
    const n = v => spec.unit === 'min' ? Math.round(v/60) : v;
    const kg = w => `${w} kg`;

    switch(res.action){
      case 'first':
        return spec.kind === 'reps'
          ? `First time: pick a weight you can do ${spec.min}-${spec.max}${side} with 1-2 reps left in the tank.`
          : `First time: work up to ${n(spec.min)}-${n(spec.max)}${u}${side}.`;

      case 'deload':
        return `Deload cycle — 2 sets at about 60% of your usual weight. Do not chase reps this week.`;

      case 'add-weight':
        return `Go up: ${kg(res.weight)} × ${spec.min}${side}. You hit ${spec.max} on every set at ${kg(res.from)}.`;

      case 'add-load':
        return `You maxed the range at bodyweight. Add load (belt, vest, dumbbell) or move to the harder variation, then restart at ${n(spec.min)}${u}${side}.`;

      case 'drop-weight':
        return `Drop to ${kg(res.weight)} — you fell to ${res.last.join(', ')} last time, below the ${spec.min} floor.`;

      case 'beat':
        return `Beat ${res.total} total reps (last: ${res.last.join(', ')}). Still stop 2 short of failure on each set.`;

      case 'add-reps':
        return res.weight > 0
          ? `Stay at ${kg(res.weight)}. Last: ${res.last.join(', ')} — get ${res.reps}${side} on every set, then ${spec.max} unlocks the next jump.`
          : `Last: ${res.last.join(', ')}${u}. Get ${n(res.reps)}${u}${side} on every set, then ${n(spec.max)}${u} unlocks harder work.`;

      default:
        return '';
    }
  }

  /* Tone for the UI: up / hold / down. */
  function tone(action){
    if(action === 'add-weight' || action === 'add-load' || action === 'beat') return 'up';
    if(action === 'drop-weight') return 'down';
    return 'hold';
  }

  /* ---------- wired to the store ---------- */
  function nextTarget(ex, date){
    const spec = parseReps(ex.reps);
    const inc = ex.inc || increment(ex.name);

    // Every 6th cycle is a planned deload — no progression that week.
    if(Store.cycleNumberFor(date) % 6 === 0){
      const res = { action:'deload' };
      return { spec, res, text: describe(spec, res, ex.name), tone:'hold', last:null };
    }

    const last = Store.lastPerformance(ex.name, date);
    const res = plan(spec, last ? last.sets : [], inc);
    return { spec, res, text: describe(spec, res, ex.name), tone: tone(res.action), last };
  }

  return { parseReps, plan, describe, increment, loadable, tone, nextTarget };
})();

/* Allow the pure functions to be unit-tested under Node. */
if(typeof module !== 'undefined' && module.exports) module.exports = Progression;
