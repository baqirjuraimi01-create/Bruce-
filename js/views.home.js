/* ------------------------------------------------------------------
   views.home.js — the landing screen. Two questions answered at a
   glance: what am I doing today, and am I actually moving toward the
   four things I said I wanted?

   Objectives are deliberately measured by proxies the app already
   records, so nothing here needs extra logging.
------------------------------------------------------------------- */

const HomeView = (() => {

  /* name -> tag, so logged sets can be attributed to core / stability.
     Built from the effective routine, so custom exercises count too. */
  function tagMap(){
    const m = {};
    for(const d of Store.effectivePlan())
      for(const ex of (d.exercises || []))
        if(ex.tag) m[ex.name] = ex.tag;
    return m;
  }

  /* Cardio minutes the rotation asks for, expressed per week. */
  const WEEKLY_CARDIO = (() => {
    let perCycle = 0;
    for(const d of PROGRAM){
      if(!d.cardio) continue;
      const m = String(d.cardio.minutes).match(/(\d+)\s*-\s*(\d+)/);
      perCycle += m ? (+m[1] + +m[2]) / 2 : parseFloat(d.cardio.minutes) || 0;
    }
    return Math.round(perCycle * 7 / PROGRAM.length);
  })();

  const MAIN_LIFTS = ['Barbell Bench Press','Weighted Pull-up / Lat Pulldown','Back Squat',
                      'Romanian Deadlift','Standing Overhead Press','Bulgarian Split Squat'];

  function render(root, date){
    const day = Store.dayPlanFor(date);
    const tgt = Store.targets();
    const tot = Store.totalsFor(date);
    const o = objectives(date);

    root.innerHTML = `
      <h1 class="page-h">${greeting()}<small>${esc(prettyDate(date))} · cycle ${Store.cycleNumberFor(date)}, day ${Store.cycleIndexFor(date)+1} of ${PROGRAM.length}</small></h1>

      <div class="card">
        <div class="cardhead">
          <div class="grow">
            <div class="small muted">Today</div>
            <h2 style="font-size:22px;font-weight:400;letter-spacing:-.03em;margin-top:3px">${esc(day.name)}</h2>
          </div>
          <button class="iconbtn dark" data-act="goTrain" aria-label="Open session">→</button>
        </div>
        <div class="small muted">${esc(day.focus || '')}</div>
        <div class="chips" style="margin-top:12px">
          ${(day.exercises||[]).length ? `<span class="chip flat">${day.exercises.length} exercises</span>` : ''}
          ${day.cardio ? `<span class="chip flat">${esc(day.cardio.minutes)} min ${day.cardio.mode}</span>` : ''}
          ${day.type === 'rest' ? `<span class="chip flat">Full rest</span>` : ''}
        </div>
        ${nextUp(date)}
      </div>

      <div class="card">
        ${cardHead("Today's rings", 'goFood')}
        ${rings([
          { pct:(tot.p/tgt.protein)*100, color:'var(--blue)', label:'Protein',
            value:`${tot.p} / ${tgt.protein} g` },
          { pct:(tot.kcal/tgt.kcal)*100, color:'var(--ink)', label:'Calories',
            value:`${tot.kcal.toLocaleString()} / ${tgt.kcal.toLocaleString()}` },
          { pct:(Store.stepsFor(date)/Store.state.settings.stepGoal)*100, color:'var(--lime)', label:'Steps',
            value:`${Store.stepsFor(date).toLocaleString()} / ${Store.state.settings.stepGoal.toLocaleString()}` }
        ])}
        ${watchLine(date)}
        <div class="hr"></div>
        <div class="row wrap" style="gap:8px">
          <button class="btn ghost sm grow" data-act="goFood">Log food</button>
          <button class="btn ghost sm grow" data-act="goCardio">Log run</button>
          <button class="btn ghost sm grow" data-act="steps">Watch data</button>
        </div>
      </div>

      <div class="card">
        ${cardHead('Objectives', 'goProgress')}
        ${o.map(objRow).join('')}
        <div class="hint">Your four goals, plus the protein number that underpins all of them — measured from what you have already logged. Cycle progress resets every ${PROGRAM.length} days.</div>
      </div>
    `;
    wire(root, date);
  }

  /* One quiet line of Watch context under the rings, only when it exists. */
  function watchLine(date){
    const h = Store.healthFor(date);
    const bits = [];
    if(h.akcal) bits.push(h.akcal + ' active kcal');
    if(h.exmin) bits.push(h.exmin + ' exercise min');
    if(h.rhr)   bits.push(h.rhr + ' bpm resting');
    if(h.sleep) bits.push(h.sleep + ' h sleep');
    return bits.length ? `<div class="tiny muted" style="margin-top:12px">Watch: ${esc(bits.join(' · '))}</div>` : '';
  }

  function greeting(){
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  /* The single most useful line on a lifting day: the first main lift's prescription. */
  function nextUp(date){
    const day = Store.dayPlanFor(date);
    if(day.type !== 'lift' || !(day.exercises||[]).length) return '';
    const first = day.exercises[0];
    const nt = Progression.nextTarget(first, date);
    return `<div class="target ${nt.tone}" style="margin-top:14px">${esc(first.name)} — ${esc(nt.text)}</div>`;
  }

  function objRow(o){
    return `
      <div class="obj">
        <div class="row between">
          <span class="t">${esc(o.label)}</span>
          <span class="v mono">${esc(o.value)}</span>
        </div>
        ${bar(Math.min(o.pct, 100), 100, o.color)}
        <div class="tiny muted" style="margin-top:6px">${esc(o.note)}</div>
      </div>`;
  }

  /* ---------- the four objectives, plus protein ---------- */
  function objectives(date){
    const start = addDays(date, -Store.cycleIndexFor(date));   // first day of this cycle
    const elapsed = Store.cycleIndexFor(date) + 1;

    /* 1. strength — main lifts whose top set went up vs the session before */
    let up = 0, tracked = 0;
    for(const name of MAIN_LIFTS){
      const h = Store.performanceHistory(name, date, 2);
      if(h.length < 2) continue;
      tracked++;
      const top = s => Math.max(...s.sets.map(x => parseFloat(x.w) || 0));
      if(top(h[0]) > top(h[1])) up++;
    }

    /* 2. running — minutes logged in the last 7 days */
    let mins = 0;
    for(let i = 0; i < 7; i++)
      for(const c of (Store.state.cardio[addDays(date, -i)] || [])) mins += +c.minutes || 0;

    /* 3 & 4. core and stability sets done vs prescribed so far this cycle */
    const TAGS = tagMap();
    const done = { core:0, stab:0 }, planned = { core:0, stab:0 };
    for(let i = 0; i < elapsed; i++){
      const d = addDays(start, i);
      for(const ex of (Store.dayPlanFor(d).exercises || []))
        if(ex.tag) planned[ex.tag] += ex.sets;
      const sess = Store.state.sessions[d];
      if(!sess) continue;
      for(const name in sess.exercises){
        const tag = TAGS[name];
        if(!tag) continue;
        done[tag] += sess.exercises[name].filter(s => s.done).length;
      }
    }

    /* 5. protein — days on target in the last 7 */
    const tp = Store.targets().protein;
    let hit = 0, logged = 0;
    for(let i = 0; i < 7; i++){
      const d = addDays(date, -i);
      if(!Store.day(d).entries.length) continue;
      logged++;
      if(Store.totalsFor(d).p >= tp * 0.9) hit++;
    }

    // Which cycle day does this tag first appear on? Used when nothing is due yet.
    const startsOn = tag => {
      const plan = Store.effectivePlan();
      const i = plan.findIndex(d => (d.exercises || []).some(e => e.tag === tag));
      return i < 0 ? null : { day:i + 1, name:plan[i].name };
    };
    const tagObj = (tag, label, color, note) => {
      if(planned[tag] === 0){
        const s = startsOn(tag);
        return { label, value:'none due yet', pct:0, color,
                 note: s ? `First ${label.toLowerCase()} work is day ${s.day} — ${s.name}.` : note };
      }
      return { label, value:`${done[tag]} / ${planned[tag]} sets`,
               pct:(done[tag]/planned[tag])*100, color, note };
    };

    return [
      { label:'Strength & muscle',
        value: tracked ? `${up} / ${tracked} lifts up` : 'no data yet',
        pct: tracked ? (up/tracked)*100 : 0, color:'var(--ink)',
        note: tracked ? 'Main lifts that beat their previous top set.' : 'Log two sessions of a main lift and this starts moving.' },

      { label:'Running',
        value: `${mins} / ${WEEKLY_CARDIO} min`,
        pct: (mins/WEEKLY_CARDIO)*100, color:'var(--blue)',
        note: `What the rotation asks for across 7 days.` },

      tagObj('core', 'Core strength', 'var(--amber)', 'Core sets completed so far this cycle.'),

      tagObj('stab', 'Leg stability', 'var(--lime)', 'Single-leg, ankle and adductor work this cycle.'),

      { label:'Protein',
        value: logged ? `${hit} / ${logged} days` : 'nothing logged',
        pct: logged ? (hit/logged)*100 : 0, color:'var(--pink)',
        note: `Days at 90%+ of ${tp} g in the last week.` }
    ];
  }

  /* ---------- interactions ---------- */
  function wire(root, date){
    on(root, 'goTrain',    () => App.go('train'));
    on(root, 'goFood',     () => App.go('food'));
    on(root, 'goCardio',   () => App.go('train'));
    on(root, 'goProgress', () => App.go('progress'));
    on(root, 'steps',      () => openSteps(date));
  }

  function openSteps(date){
    const h = Store.healthFor(date);
    openSheet(`
      <h2>Watch data</h2>
      <div class="hint" style="margin-top:-6px">Read these off your watch or Apple Health for ${esc(prettyDate(date).toLowerCase())} — or set up the Shortcut in the README and your phone fills them in by itself. Leave blank anything you do not track.</div>
      <div class="sp"></div>
      <div class="grid2">
        <label class="f"><span>Steps</span>
          <input type="number" id="stIn" inputmode="numeric" placeholder="8000" value="${Store.stepsFor(date) || ''}"></label>
        <label class="f"><span>Active energy (kcal)</span>
          <input type="number" id="akIn" inputmode="numeric" placeholder="600" value="${h.akcal || ''}"></label>
        <label class="f"><span>Exercise minutes</span>
          <input type="number" id="exIn" inputmode="numeric" placeholder="40" value="${h.exmin || ''}"></label>
        <label class="f"><span>Resting heart rate</span>
          <input type="number" id="rhIn" inputmode="numeric" placeholder="55" value="${h.rhr || ''}"></label>
      </div>
      <label class="f"><span>Sleep (hours)</span>
        <input type="number" id="slIn" inputmode="decimal" step="0.1" placeholder="7.5" value="${h.sleep || ''}"></label>
      <button class="btn wide" id="save">Save</button>
    `, body => {
      body.querySelector('#save').onclick = () => {
        Store.setSteps(date, parseFloat(body.querySelector('#stIn').value) || 0);
        Store.setHealth(date, {
          akcal: body.querySelector('#akIn').value,
          exmin: body.querySelector('#exIn').value,
          rhr:   body.querySelector('#rhIn').value,
          sleep: body.querySelector('#slIn').value
        });
        closeSheet(); toast('Saved'); App.refresh();
      };
    });
  }

  return { render };
})();
