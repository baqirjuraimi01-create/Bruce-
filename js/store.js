/* ------------------------------------------------------------------
   store.js — localStorage persistence, date helpers, macro maths and
   the 9-day cycle calculation. Everything else reads from here.
------------------------------------------------------------------- */

const KEY = 'bruce.tracker.v1';

const Store = (() => {
  let state = load();

  function blank(){
    return {
      profile: JSON.parse(JSON.stringify(DEFAULT_PROFILE)),
      settings: { cycleStart: today(), restTimer:true, usdaKey:'', stepGoal:10000 },
      days: {},          // 'YYYY-MM-DD' -> { entries:[], weight:null, steps:null, note:'' }
      sessions: {},      // 'YYYY-MM-DD' -> { dayKey, exercises:{name:[{w,r,done}]}, note, done }
      cardio: {},        // 'YYYY-MM-DD' -> [{mode,minutes,km,note}]
      customFoods: [],   // foods saved from barcode scans / manual entry
      routines: {},      // dayKey -> [exercise] — overrides the built-in program
      version: 1
    };
  }

  function load(){
    try{
      const raw = localStorage.getItem(KEY);
      if(!raw) return blank();
      const s = JSON.parse(raw);
      const b = blank();
      return Object.assign(b, s, { profile:Object.assign(b.profile, s.profile||{}),
                                   settings:Object.assign(b.settings, s.settings||{}) });
    }catch(e){
      console.warn('Could not read saved data, starting fresh.', e);
      return blank();
    }
  }

  const saveHooks = [];
  function onSave(fn){ saveHooks.push(fn); }

  function save(){
    try{ localStorage.setItem(KEY, JSON.stringify(state)); }
    catch(e){ console.warn('Save failed', e); toast('Storage full — export your data'); }
    for(const fn of saveHooks){ try{ fn(); }catch(e){} }
  }

  /* A detached copy, for merging and for sync. */
  function snapshot(){ return JSON.parse(JSON.stringify(state)); }

  /* Used by sync after a merge. Does not fire save hooks — the caller
     already knows, and re-entering sync from its own write would loop. */
  function replaceState(next){
    state = Object.assign(blank(), next);
    try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){}
  }

  /* ---------- day records ---------- */
  function day(d){
    if(!state.days[d]) state.days[d] = { entries:[], weight:null, steps:null, note:'' };
    return state.days[d];
  }
  function session(d){
    if(!state.sessions[d]){
      state.sessions[d] = { dayKey: cycleDayFor(d).key, exercises:{}, swaps:{}, note:'', done:false };
    }
    if(!state.sessions[d].swaps) state.sessions[d].swaps = {};   // records saved before swaps existed
    return state.sessions[d];
  }
  function cardioFor(d){
    if(!state.cardio[d]) state.cardio[d] = [];
    return state.cardio[d];
  }

  /* ---------- 9-day cycle ---------- */
  function cycleIndexFor(dstr){
    const start = state.settings.cycleStart || today();
    const diff = Math.floor((dateOnly(dstr) - dateOnly(start)) / 86400000);
    const n = PROGRAM.length;
    return ((diff % n) + n) % n;
  }
  function cycleDayFor(dstr){ return PROGRAM[cycleIndexFor(dstr)]; }
  function cycleNumberFor(dstr){
    const start = state.settings.cycleStart || today();
    const diff = Math.floor((dateOnly(dstr) - dateOnly(start)) / 86400000);
    return Math.floor(diff / PROGRAM.length) + 1;
  }
  function shiftCycle(days){
    const s = dateOnly(state.settings.cycleStart);
    s.setDate(s.getDate() + days);
    state.settings.cycleStart = fmt(s);
    save();
  }

  /* ---------- targets ---------- */
  // Mifflin-St Jeor, then goal adjustment. Protein anchored to bodyweight.
  function computeTargets(p){
    const bmr = 10*p.weightKg + 6.25*p.heightCm - 5*p.age + (p.sex === 'male' ? 5 : -161);
    let kcal = bmr * p.activity;
    if(p.goal === 'cut')  kcal -= 400;
    if(p.goal === 'gain') kcal += 300;
    kcal = Math.round(kcal/10)*10;

    const protein = Math.round(p.weightKg * 2.0);        // 2.0 g/kg — top of the useful range
    const fat     = Math.round(p.weightKg * 1.0);        // 1.0 g/kg — enough for hormones
    const carbs   = Math.max(0, Math.round((kcal - protein*4 - fat*9) / 4));
    return { kcal, protein, carbs, fat };
  }
  function targets(){
    const p = state.profile;
    return p.autoTargets ? computeTargets(p) : p.targets;
  }

  /* ---------- totals ---------- */
  function totalsFor(dstr){
    const t = { kcal:0, p:0, c:0, f:0 };
    for(const e of day(dstr).entries){
      t.kcal += e.kcal; t.p += e.p; t.c += e.c; t.f += e.f;
    }
    return { kcal:Math.round(t.kcal), p:Math.round(t.p), c:Math.round(t.c), f:Math.round(t.f) };
  }
  function totalsByMeal(dstr, meal){
    const t = { kcal:0, p:0, c:0, f:0 };
    for(const e of day(dstr).entries.filter(x => x.meal === meal)){
      t.kcal += e.kcal; t.p += e.p; t.c += e.c; t.f += e.f;
    }
    return { kcal:Math.round(t.kcal), p:Math.round(t.p), c:Math.round(t.c), f:Math.round(t.f) };
  }

  /* ---------- food entries ---------- */
  function addEntry(dstr, entry){
    entry.id = uid();
    day(dstr).entries.push(entry);
    save();
  }
  function removeEntry(dstr, id){
    const d = day(dstr);
    d.entries = d.entries.filter(e => e.id !== id);
    save();
  }
  function updateEntry(dstr, id, grams){
    const e = day(dstr).entries.find(x => x.id === id);
    if(!e) return;
    const ratio = grams / e.grams;
    e.grams = grams;
    e.kcal *= ratio; e.p *= ratio; e.c *= ratio; e.f *= ratio;
    save();
  }

  /* ---------- custom foods (scans, manual) ---------- */
  function saveFood(food){
    const i = state.customFoods.findIndex(f =>
      (food.barcode && f.barcode === food.barcode) || f.id === food.id);
    if(i >= 0) state.customFoods[i] = food; else state.customFoods.unshift(food);
    if(state.customFoods.length > 400) state.customFoods.length = 400;
    save();
    return food;
  }
  function foodByBarcode(code){
    return state.customFoods.find(f => f.barcode === code) || null;
  }
  function allFoods(){
    return state.customFoods.concat(LOCAL_FOODS.map(f => Object.assign({ source:'local', serving:100 }, f)));
  }
  function recentFoods(n = 12){
    const seen = new Set(), out = [];
    const dates = Object.keys(state.days).sort().reverse();
    for(const d of dates){
      for(const e of [...state.days[d].entries].reverse()){
        const k = e.name.toLowerCase();
        if(seen.has(k)) continue;
        seen.add(k);
        out.push(e);
        if(out.length >= n) return out;
      }
    }
    return out;
  }

  /* ---------- training ---------- */
  function setLog(dstr, exName, sets){
    session(dstr).exercises[exName] = sets;
    save();
  }
  function lastPerformance(exName, beforeDate){
    const dates = Object.keys(state.sessions).filter(d => d < beforeDate).sort().reverse();
    for(const d of dates){
      const sets = state.sessions[d].exercises[exName];
      if(sets && sets.some(s => s.done && (s.w || s.r))) return { date:d, sets:sets.filter(s => s.done) };
    }
    return null;
  }
  function sessionVolume(dstr){
    const s = state.sessions[dstr];
    if(!s) return 0;
    let v = 0;
    for(const name in s.exercises)
      for(const set of s.exercises[name])
        if(set.done) v += (parseFloat(set.w)||0) * (parseFloat(set.r)||0);
    return Math.round(v);
  }

  /* ---------- cardio ---------- */
  function addCardio(dstr, item){
    item.id = uid();
    cardioFor(dstr).push(item);
    save();
  }
  function removeCardio(dstr, id){
    state.cardio[dstr] = cardioFor(dstr).filter(c => c.id !== id);
    save();
  }

  /* ---------- learned meals ----------
     What you actually eat, worked out from your own log. A food counts
     as part of your "usual" for a meal slot once it shows up on at
     least MIN_DAYS of that meal and in at least MIN_FREQ of them. The
     amount suggested is the median, so one odd 300 g day does not drag
     the suggestion around. */
  const MIN_DAYS = 2, MIN_FREQ = 0.4, LOOKBACK = 60;

  function median(ns){
    const s = [...ns].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
  }

  function usualMeal(mealKey, beforeDate){
    const before = beforeDate || today();
    const seen = {};          // key -> { name, brand, barcode, per100, grams:[], days:Set }
    let mealDays = 0;

    for(let i = 1; i <= LOOKBACK; i++){
      const d = addDays(before, -i);
      const rec = state.days[d];
      if(!rec) continue;
      const entries = rec.entries.filter(e => e.meal === mealKey);
      if(!entries.length) continue;
      mealDays++;

      for(const e of entries){
        if(!e.grams) continue;
        const key = (e.name + '|' + (e.brand || '')).toLowerCase();
        const r = 100 / e.grams;
        if(!seen[key]) seen[key] = {
          name:e.name, brand:e.brand || '', barcode:e.barcode || '',
          per100:{ kcal:e.kcal*r, p:e.p*r, c:e.c*r, f:e.f*r },
          grams:[], days:new Set()
        };
        seen[key].grams.push(e.grams);
        seen[key].days.add(d);
      }
    }

    if(mealDays < MIN_DAYS) return null;

    const items = Object.values(seen)
      .map(v => ({
        name:v.name, brand:v.brand, barcode:v.barcode,
        kcal:round(v.per100.kcal, 1), p:round(v.per100.p, 1),
        c:round(v.per100.c, 1), f:round(v.per100.f, 1),
        grams:round(median(v.grams), 0),
        count:v.days.size, freq:v.days.size / mealDays,
        source:'Your usual'
      }))
      .filter(v => v.count >= MIN_DAYS && v.freq >= MIN_FREQ)
      .sort((a, b) => b.freq - a.freq || b.count - a.count);

    return items.length ? { mealDays, items } : null;
  }

  /* Foods you log most often in a given meal, for the quick-add list. */
  function frequentFoods(mealKey, n = 15){
    const seen = {};
    for(const d of Object.keys(state.days)){
      for(const e of state.days[d].entries){
        if(mealKey && e.meal !== mealKey) continue;
        const key = (e.name + '|' + (e.brand || '')).toLowerCase();
        if(!seen[key]) seen[key] = { entry:e, count:0, last:d };
        seen[key].count++;
        if(d > seen[key].last){ seen[key].last = d; seen[key].entry = e; }
      }
    }
    return Object.values(seen)
      .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1))
      .slice(0, n);
  }

  /* ---------- custom routines ----------
     A routine saved against a cycle day replaces the built-in one for
     that day, every cycle, until it is reset. */
  function exercisesFor(dayKey){
    const custom = state.routines[dayKey];
    if(custom && custom.length) return custom;
    const day = PROGRAM.find(d => d.key === dayKey);
    return (day && day.exercises) || [];
  }
  function isCustom(dayKey){
    return !!(state.routines[dayKey] && state.routines[dayKey].length);
  }
  function setRoutine(dayKey, exercises){
    if(!exercises || !exercises.length) delete state.routines[dayKey];
    else state.routines[dayKey] = exercises;
    save();
  }
  function resetRoutine(dayKey){ delete state.routines[dayKey]; save(); }

  /* The programmed day with the effective exercise list swapped in. */
  function dayPlan(dayKey){
    const day = PROGRAM.find(d => d.key === dayKey);
    return Object.assign({}, day, { exercises: exercisesFor(dayKey), custom: isCustom(dayKey) });
  }
  function dayPlanFor(dstr){ return dayPlan(cycleDayFor(dstr).key); }

  /* The whole rotation as it currently stands — what the volume
     analysis reads. */
  function effectivePlan(){
    return PROGRAM.map(d => dayPlan(d.key));
  }

  /* ---------- exercise swaps ---------- */
  // Machine busy? Log the session against a different exercise for today
  // only. The replacement keeps its own weight history.
  function setSwap(dstr, original, replacement){
    const s = session(dstr);
    if(!replacement || replacement === original) delete s.swaps[original];
    else s.swaps[original] = replacement;
    save();
  }
  function swapFor(dstr, original){ return session(dstr).swaps[original] || null; }

  /* ---------- steps ---------- */
  function setSteps(dstr, n){
    day(dstr).steps = n > 0 ? Math.round(n) : null;
    save();
  }
  function stepsFor(dstr){ return day(dstr).steps || 0; }

  /* The last n sessions for one exercise, newest first. */
  function performanceHistory(exName, beforeDate, n = 2){
    const out = [];
    const dates = Object.keys(state.sessions).filter(d => d <= beforeDate).sort().reverse();
    for(const d of dates){
      const sets = state.sessions[d].exercises[exName];
      if(sets && sets.some(s => s.done && (s.w || s.r))){
        out.push({ date:d, sets: sets.filter(s => s.done) });
        if(out.length >= n) break;
      }
    }
    return out;
  }

  /* ---------- bodyweight ---------- */
  function setWeight(dstr, kg){
    day(dstr).weight = kg;
    if(kg && state.profile.autoTargets) state.profile.weightKg = kg;
    save();
  }
  function weightSeries(){
    return Object.keys(state.days)
      .filter(d => state.days[d].weight)
      .sort()
      .map(d => ({ date:d, kg:state.days[d].weight }));
  }

  /* ---------- import / export ---------- */
  function exportJSON(){ return JSON.stringify(state, null, 2); }
  function importJSON(txt){
    const s = JSON.parse(txt);
    if(!s || typeof s !== 'object') throw new Error('Not a valid backup file');
    state = Object.assign(blank(), s);
    save();
  }

  /* Combine a backup with what is already here, losing nothing.
     This is the one to use when both copies hold real logs. */
  function mergeJSON(txt){
    const incoming = JSON.parse(txt);
    const { state: merged, stats } = Merge.mergeState(Object.assign(blank(), state), incoming);
    state = merged;
    save();
    return stats;
  }
  function reset(){ state = blank(); save(); }

  return {
    get state(){ return state; },
    save, day, session, cardioFor,
    cycleIndexFor, cycleDayFor, cycleNumberFor, shiftCycle,
    targets, computeTargets, totalsFor, totalsByMeal,
    addEntry, removeEntry, updateEntry,
    saveFood, foodByBarcode, allFoods, recentFoods,
    setLog, lastPerformance, sessionVolume,
    addCardio, removeCardio,
    setWeight, weightSeries, setSteps, stepsFor, performanceHistory,
    setSwap, swapFor, usualMeal, frequentFoods,
    exercisesFor, isCustom, setRoutine, resetRoutine, dayPlan, dayPlanFor, effectivePlan,
    exportJSON, importJSON, mergeJSON, reset, onSave, snapshot, replaceState
  };
})();

/* ---------------- shared little helpers ---------------- */
function uid(){ return Math.random().toString(36).slice(2, 10); }
function pad(n){ return n < 10 ? '0'+n : ''+n; }
function fmt(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function today(){ return fmt(new Date()); }
function dateOnly(s){ const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function addDays(s, n){ const d = dateOnly(s); d.setDate(d.getDate()+n); return fmt(d); }
function prettyDate(s){
  const d = dateOnly(s), t = today();
  if(s === t) return 'Today';
  if(s === addDays(t,-1)) return 'Yesterday';
  if(s === addDays(t, 1)) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday:'short', day:'numeric', month:'short' });
}
function round(n, dp = 0){ const m = Math.pow(10, dp); return Math.round(n*m)/m; }
function clamp(n, lo, hi){ return Math.min(hi, Math.max(lo, n)); }
