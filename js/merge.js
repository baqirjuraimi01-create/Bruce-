/* ------------------------------------------------------------------
   merge.js — combining two copies of the app's data.

   The app has no server, so every browser holds its own separate log.
   On iOS a home-screen web app and Safari are two different storage
   containers even at the same URL, so it is entirely possible to end up
   with real data in both and no way to see one from the other.

   Restoring a backup used to replace everything, which would throw away
   whichever side you did not export. This merges instead, and the rule
   throughout is: NEVER DELETE. Collections are unioned by id, and where
   two copies disagree about a single value the one already on this
   device wins — the incoming file only fills gaps.

   Pure functions — unit tested in test/merge.test.cjs.
------------------------------------------------------------------- */

const Merge = (() => {

  /* Union two arrays of {id:...}, keeping base's version of a clash. */
  function unionById(base, incoming){
    const out = (base || []).slice();
    const seen = new Set(out.map(x => x && x.id).filter(Boolean));
    let added = 0;
    for(const item of (incoming || [])){
      if(!item) continue;
      if(item.id && seen.has(item.id)) continue;
      if(item.id) seen.add(item.id);
      out.push(item);
      added++;
    }
    return { out, added };
  }

  /* base wins when it holds a real value; incoming fills blanks. */
  function preferBase(a, b){
    return (a === undefined || a === null || a === '') ? b : a;
  }

  function mergeDay(base, incoming, stats){
    if(!base) { stats.days++; stats.entries += (incoming.entries || []).length; return incoming; }
    const u = unionById(base.entries, incoming.entries);
    stats.entries += u.added;
    return {
      entries: u.out,
      weight:  preferBase(base.weight, incoming.weight),
      steps:   preferBase(base.steps,  incoming.steps),
      note:    preferBase(base.note,   incoming.note)
    };
  }

  /* A session's sets are keyed by exercise name. Keep whichever copy
     actually has completed sets; if both do, keep this device's. */
  function mergeSession(base, incoming, stats){
    if(!base){ stats.sessions++; return incoming; }
    const exercises = Object.assign({}, incoming.exercises, base.exercises);
    for(const name in incoming.exercises || {}){
      const mine = (base.exercises || {})[name];
      const theirs = incoming.exercises[name];
      const doneMine   = (mine   || []).filter(s => s && s.done).length;
      const doneTheirs = (theirs || []).filter(s => s && s.done).length;
      if(doneTheirs > doneMine){ exercises[name] = theirs; stats.sets += doneTheirs - doneMine; }
    }
    return {
      dayKey: preferBase(base.dayKey, incoming.dayKey),
      exercises,
      swaps: Object.assign({}, incoming.swaps || {}, base.swaps || {}),
      note:  preferBase(base.note, incoming.note),
      done:  base.done || incoming.done || false
    };
  }

  function mergeState(base, incoming){
    if(!incoming || typeof incoming !== 'object') throw new Error('Not a valid backup file');

    const stats = { days:0, entries:0, sessions:0, sets:0, cardio:0, foods:0, routines:0 };
    const out = JSON.parse(JSON.stringify(base));

    out.days = Object.assign({}, base.days);
    for(const d in (incoming.days || {}))
      out.days[d] = mergeDay(base.days ? base.days[d] : null, incoming.days[d], stats);

    out.sessions = Object.assign({}, base.sessions);
    for(const d in (incoming.sessions || {}))
      out.sessions[d] = mergeSession(base.sessions ? base.sessions[d] : null, incoming.sessions[d], stats);

    out.cardio = Object.assign({}, base.cardio);
    for(const d in (incoming.cardio || {})){
      const u = unionById((base.cardio || {})[d], incoming.cardio[d]);
      out.cardio[d] = u.out;
      stats.cardio += u.added;
    }

    const f = unionById(base.customFoods, incoming.customFoods);
    out.customFoods = f.out;
    stats.foods = f.added;

    // A routine you have set here is yours; the file only adds days you
    // have not customised.
    out.routines = Object.assign({}, base.routines);
    for(const k in (incoming.routines || {}))
      if(!out.routines[k] || !out.routines[k].length){
        out.routines[k] = incoming.routines[k];
        stats.routines++;
      }

    out.profile  = Object.assign({}, incoming.profile  || {}, base.profile  || {});
    out.settings = Object.assign({}, incoming.settings || {}, base.settings || {});

    return { state: out, stats };
  }

  /* One line for the toast, in plain terms. */
  function summarise(stats){
    const bits = [];
    if(stats.entries)  bits.push(`${stats.entries} food ${stats.entries === 1 ? 'entry' : 'entries'}`);
    if(stats.days)     bits.push(`${stats.days} new ${stats.days === 1 ? 'day' : 'days'}`);
    if(stats.sessions) bits.push(`${stats.sessions} ${stats.sessions === 1 ? 'session' : 'sessions'}`);
    if(stats.sets)     bits.push(`${stats.sets} sets`);
    if(stats.cardio)   bits.push(`${stats.cardio} cardio`);
    if(stats.foods)    bits.push(`${stats.foods} saved ${stats.foods === 1 ? 'food' : 'foods'}`);
    if(stats.routines) bits.push(`${stats.routines} ${stats.routines === 1 ? 'routine' : 'routines'}`);
    return bits.length ? 'Added ' + bits.join(', ') : 'Nothing new — already up to date';
  }

  return { mergeState, unionById, preferBase, summarise };
})();

if(typeof module !== 'undefined' && module.exports) module.exports = Merge;
