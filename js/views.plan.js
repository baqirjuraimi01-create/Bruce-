/* ------------------------------------------------------------------
   views.plan.js — the full 9-day rotation and the nutrition guidance,
   in the app so it is readable at the gym without digging out a doc.
------------------------------------------------------------------- */

const PlanView = (() => {

  function render(root, date){
    const todayIdx = Store.cycleIndexFor(date);

    root.innerHTML = `
      <h1 class="page-h">Your Plan<small>9-day rotation · nutrition · progression</small></h1>

      <div class="rail">
        <button data-jump="sec-rotation" class="on" aria-label="Rotation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M4 6h16M4 12h16M4 18h10"/></svg></button>
        <button data-jump="sec-progress" aria-label="Progression"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/></svg></button>
        <button data-jump="sec-changes" aria-label="What changed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg></button>
        <button data-jump="sec-diet" aria-label="Diet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M3 19h18"/><path d="M8 11c0-2.5 1.5-3.5 1.5-5"/></svg></button>
      </div>

      <div class="card doc" id="sec-rotation">
        ${cardHead('The rotation')}
        <div class="small muted" style="margin-bottom:10px">Your split. Tap <b>Edit</b> on any day to set your own exercises — the app checks your weekly volume and tells you what is missing.</div>
        ${volumeCard()}
        ${PROGRAM.map((d, i) => dayCard(d, i, i === todayIdx)).join('')}
      </div>

      <div class="card doc" id="sec-progress">
        ${cardHead('How to progress')}
        <ul>${PROGRESSION.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      </div>

      <div class="card doc" id="sec-changes">
        ${cardHead('What I changed and why')}
        <h3>Legs once per nine days was the problem</h3>
        <p class="small">You asked for leg stability, but the split trained legs once every nine days — about three times a month. Arms day is short, so it now opens with slow step-ups, reverse lunges and single-leg calf raises. Legs get a heavy day and a stability day per cycle without adding a session.</p>
        <h3>Rest days do the running</h3>
        <p class="small">Four rest days and a running goal do not coexist. Run A is easy, Run B is where intervals eventually go, and the third is your long easy session. The ninth day is genuinely off.</p>
        <h3>Stability is ankles and adductors, not just abs</h3>
        <p class="small">Bulgarian split squats, tibialis raises, Copenhagen planks, banded ankle eversion and eyes-closed single-leg stance are unglamorous and they are exactly what stops the wobble — and what keeps shin splints away as mileage climbs.</p>
        <h3>Core is trained by resisting movement</h3>
        <p class="small">Anti-extension (ab wheel, long-lever plank), anti-rotation (Pallof, half-kneeling row, suitcase carry), then flexion (hanging leg raise). Crunches are the least useful thing you could do for a squat and a run.</p>
        <h3>Running will blunt your leg session at first</h3>
        <p class="small">That is normal and it passes in about four weeks. Keep squat weight where it is for the first two cycles rather than fighting it.</p>
      </div>

      <div class="card doc" id="sec-diet">
        ${cardHead('Your diet — the fixes')}
        <h3>Read this bit first: you are eating about 1,040 kcal a day</h3>
        <p class="small">Adding your foods up exactly: breakfast 543 kcal, lunch 165, dinner 330 — <b>1,038 kcal, 138 g protein, 18 g fat, 77 g carbs</b>. Your protein estimate was nearly right (138 g, not 130). The calories are the emergency. You need roughly <b>2,700</b>, and you are about to add running on top. Under-eating at this scale does not build muscle, it costs you muscle, strength, sleep and mood. Everything below is really just "how to get from 1,040 to 2,700 without it being all chicken".</p>

        <h3>1. Stop putting 62 g in one meal</h3>
        <p class="small">Move 50 g of chicken from dinner to lunch. Four feedings of 35-40 g beats 45 / 31 / 62, and it keeps you fuller across the day.</p>

        <h3>2. The missing 20 g is a pre-bed snack</h3>
        <p class="small">200 g of Greek yogurt is ~20 g protein and slow-digesting. It also plugs the 9-hour overnight gap. Cottage cheese or a casein scoop does the same job.</p>

        <h3>3. You have almost no fat in this plan</h3>
        <p class="small">Your day contains <b>18 g of fat</b>. At 25 and training hard you want <b>0.8-1 g per kg</b> — around 60-75 g. That low, for months, means worse recovery, worse sleep, flatter training and eventually hormonal problems. Fix it with two whole eggs at breakfast, a thumb of olive oil on each cooked meal, a handful of almonds, and salmon twice a week.</p>

        <h3>4. "Carbs tbc" at lunch is the running problem</h3>
        <p class="small">You cannot add running to lifting on undefined carbs — you are currently on 77 g a day, all of it before 9am. Put <b>300 g cooked rice</b> (~85 g carbs) at both lunch and dinner. Total carbs want to land around <b>4-5 g per kg</b> — roughly 300-375 g at 75 kg. Carbs are what make the run feel easy and the squat feel heavy in the right way.</p>

        <h3>5. Nothing in your plan is a vegetable</h3>
        <p class="small">Add 150 g of veg to lunch and dinner and a piece of fruit somewhere. You want 30 g+ fibre a day; oats and chicken alone get you nowhere near it, and it matters for how you actually feel.</p>

        <div class="hr"></div>
        <h3>The adjusted day (roughly 75 kg bodyweight)</h3>
        <table class="mini">
          <tr><th>Meal</th><th class="n">kcal</th><th class="n">P</th></tr>
          <tr><td><b>Breakfast</b><br><span class="muted">80 g oats, 100 g Greek yogurt, 1 scoop whey, 20 g honey, 2 whole eggs</span></td><td class="n">686</td><td class="n">57 g</td></tr>
          <tr><td><b>Lunch</b><br><span class="muted">150 g chicken, 300 g cooked rice, 150 g veg, 10 g olive oil</span></td><td class="n">793</td><td class="n">58 g</td></tr>
          <tr><td><b>Dinner</b><br><span class="muted">same as lunch</span></td><td class="n">793</td><td class="n">58 g</td></tr>
          <tr><td><b>Afternoon</b><br><span class="muted">banana + 30 g almonds</span></td><td class="n">279</td><td class="n">8 g</td></tr>
          <tr><td><b>Pre-bed</b><br><span class="muted">200 g Greek yogurt, 15 g peanut butter</span></td><td class="n">206</td><td class="n">24 g</td></tr>
          <tr><td><b>Total</b></td><td class="n"><b>2,758</b></td><td class="n"><b>205 g</b></td></tr>
        </table>
        <div class="hint">Carbs 314 g, fat 74 g — both where they should be. Protein at 205 g is more than you need; that is harmless but expensive. Drop lunch and dinner chicken to 120 g each and you land at 2,659 kcal and 186 g, still well clear of the 150 g minimum at 75 kg. Every one of these meals is a one-tap preset on the Food tab, and the numbers above come straight out of the app's own food table.</div>

        <h3>Timing</h3>
        <ul class="small">
          <li>Eat a proper meal 1.5-2 h before lifting. Training fasted on a squat day is a waste of the session.</li>
          <li>Easy runs are fine fasted. Interval days are not — have a banana first.</li>
          <li>Get 30-40 g of protein within a couple of hours after lifting. The 30-minute "window" is a myth; the day's total is what matters.</li>
        </ul>

        <h3>Supplements worth the money</h3>
        <ul class="small">
          <li><b>Creatine monohydrate, 5 g daily.</b> Any time of day. The most proven supplement there is, and it helps the stability work too.</li>
          <li><b>Vitamin D3, 1000-2000 IU</b> if you are indoors most of the day.</li>
          <li><b>Salt and fluid</b> around runs, especially in heat. Most "bad runs" are dehydration.</li>
          <li>Skip BCAAs. You eat 150 g+ of protein — they do nothing on top of that.</li>
        </ul>

        <h3>Two things to watch</h3>
        <p class="small">If bodyweight drops faster than ~0.5 kg a week, you have accidentally started cutting — running burns more than people expect. Add 300 kcal of carbs. And if you want to grow, weight has to trend <i>up</i> slowly; running and lean gaining at once needs the calories to actually be there.</p>
        <p class="small">Going from ~1,000 to ~2,700 kcal overnight will feel like a lot of food and you will probably see the scale jump 1-2 kg in the first week. That is food volume, water and glycogen, not fat. If it is uncomfortable, climb in two steps: add lunch and dinner carbs in week one, the snacks in week two.</p>
        <div class="hint">General guidance for a healthy 25-year-old, not medical advice. If something hurts beyond ordinary soreness, or you have a condition that affects diet or exercise, get it looked at properly.</div>
      </div>
    `;
    root.querySelectorAll('[data-edit]').forEach(b => {
      b.onclick = () => openEditor(b.dataset.edit);
    });
    root.querySelectorAll('[data-jump]').forEach(b => {
      b.onclick = () => {
        root.querySelectorAll('[data-jump]').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        document.getElementById(b.dataset.jump)
          ?.scrollIntoView({ behavior:'smooth', block:'start' });
      };
    });
    root.querySelectorAll('[data-toggle]').forEach(el => {
      el.onclick = () => {
        const body = el.closest('.day').querySelector('.daybody');
        body.hidden = !body.hidden;
        el.textContent = body.hidden ? 'Show' : 'Hide';
      };
    });
  }

  /* ---------------- routine editor ----------------
     Working copy lives here until Save, so backing out changes nothing. */
  let draft = null, draftKey = null;

  function openEditor(dayKey){
    draftKey = dayKey;
    draft = JSON.parse(JSON.stringify(Store.exercisesFor(dayKey)));
    paintEditor();
  }

  function paintEditor(){
    const day = PROGRAM.find(d => d.key === draftKey);

    // Volume as it would be if this draft were saved.
    const plan = Store.effectivePlan().map(d =>
      d.key === draftKey ? Object.assign({}, d, { exercises:draft }) : d);
    const perWeek = Volume.weeklySets(plan);
    const suggestions = Volume.suggestFor(draft, perWeek, day.exercises, 2);
    const mine = Volume.daySets(draft);

    const rows = draft.map((ex, i) => `
      <div class="exrow" data-i="${i}">
        <div class="grow">
          <div class="t">${esc(ex.name)}</div>
          <div class="s">${ex.sets} × ${esc(ex.reps)}${ex.rest ? ` · ${ex.rest}s` : ''}${
            musclesOf(ex.name) ? ' · ' + esc(musclesOf(ex.name)) : ''}</div>
        </div>
        <button class="x" data-act="up"   ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
        <button class="x" data-act="down" ${i === draft.length-1 ? 'disabled' : ''} aria-label="Move down">↓</button>
        <button class="x" data-act="edit" aria-label="Edit">&#9998;</button>
        <button class="x" data-act="rm"   aria-label="Remove">&#10005;</button>
      </div>`).join('');

    openSheet(`
      <h2>${esc(day.name)}</h2>
      <div class="hint" style="margin-top:-6px">Your routine for this day, every cycle. ${
        Store.isCustom(draftKey) ? 'Currently customised.' : 'Currently the built-in plan.'}</div>
      <div class="sp"></div>
      ${rows || `<div class="empty">No exercises yet — add one below.</div>`}

      <div class="row" style="gap:8px;margin-top:12px">
        <button class="btn ghost grow" data-act="add">+ Add exercise</button>
      </div>

      ${suggestions.length ? `
        <div class="hr"></div>
        <h3 style="margin:0 0 4px;font-size:14px">Suggested additions</h3>
        <div class="hint" style="margin-top:0">Based on weekly sets across your whole rotation.</div>
        ${suggestions.map((s, i) => `
          <div class="sugg" data-s="${i}">
            <div class="grow">
              <div class="t">${esc(s.exercise.name)}</div>
              <div class="s">${esc(s.label)} at ${s.have} sets/week — ${s.target} is the minimum</div>
            </div>
            <button class="btn sm" data-act="accept" data-s="${i}">Add</button>
          </div>`).join('')}
      ` : `<div class="hint" style="margin-top:14px">Volume looks covered for this day.</div>`}

      <div class="hr"></div>
      <h3 style="margin:0 0 8px;font-size:14px">This day trains</h3>
      <div class="chips">
        ${Object.keys(mine).sort((a,b) => mine[b]-mine[a]).map(m =>
          `<span class="chip flat">${esc(Volume.LABELS[m] || m)} ${round(mine[m],1)}</span>`).join('')
          || '<span class="chip flat">nothing yet</span>'}
      </div>

      <div class="hr"></div>
      <div class="row" style="gap:8px">
        <button class="btn ghost" data-act="cancel">Cancel</button>
        ${Store.isCustom(draftKey) ? `<button class="btn ghost" data-act="reset">Reset</button>` : ''}
        <button class="btn grow" data-act="save">Save routine</button>
      </div>
    `, body => {
      body.querySelectorAll('.exrow').forEach(row => {
        const i = +row.dataset.i;
        row.querySelector('[data-act="up"]').onclick   = () => { move(i, -1); };
        row.querySelector('[data-act="down"]').onclick = () => { move(i, 1); };
        row.querySelector('[data-act="rm"]').onclick   = () => { draft.splice(i, 1); paintEditor(); };
        row.querySelector('[data-act="edit"]').onclick = () => openExerciseForm(i);
      });
      body.querySelectorAll('[data-act="accept"]').forEach(b => b.onclick = () => {
        draft.push(Object.assign({}, suggestions[+b.dataset.s].exercise));
        paintEditor();
      });
      body.querySelector('[data-act="add"]').onclick    = () => openExerciseForm(-1);
      body.querySelector('[data-act="cancel"]').onclick = closeSheet;
      body.querySelector('[data-act="reset"]')?.addEventListener('click', () => {
        Store.resetRoutine(draftKey); closeSheet(); toast('Back to the built-in plan'); App.refresh();
      });
      body.querySelector('[data-act="save"]').onclick = () => {
        Store.setRoutine(draftKey, draft);
        closeSheet(); toast('Routine saved'); App.refresh();
      };
    });
  }

  function move(i, d){
    const j = i + d;
    if(j < 0 || j >= draft.length) return;
    [draft[i], draft[j]] = [draft[j], draft[i]];
    paintEditor();
  }

  function musclesOf(name){
    const p = Volume.muscleProfile(name);
    return Object.keys(p).filter(m => p[m] >= 0.5)
      .map(m => Volume.LABELS[m] || m).join(', ');
  }

  /* index -1 adds a new one */
  function openExerciseForm(index){
    const ex = index >= 0 ? draft[index] : { name:'', sets:3, reps:'8-12', rest:90 };
    const names = [...new Set(
      PROGRAM.flatMap(d => (d.exercises || []).map(e => e.name))
        .concat(Object.keys(ALTERNATIVES))
        .concat(Object.values(ALTERNATIVES).flat())
    )].sort();

    openSheet(`
      <h2>${index >= 0 ? 'Edit exercise' : 'Add exercise'}</h2>
      <label class="f"><span>Name</span>
        <input type="text" id="exName" list="exNames" value="${esc(ex.name)}" placeholder="e.g. Flat press" autocomplete="off">
        <datalist id="exNames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      </label>
      <div class="grid2">
        <label class="f"><span>Sets</span><input type="number" id="exSets" inputmode="numeric" value="${ex.sets}"></label>
        <label class="f"><span>Reps</span><input type="text" id="exReps" value="${esc(ex.reps)}" placeholder="8-12"></label>
      </div>
      <label class="f"><span>Rest (seconds)</span><input type="number" id="exRest" inputmode="numeric" value="${ex.rest || 90}"></label>
      <div class="hint" id="exMuscles" style="margin-top:-4px"></div>
      <div class="sp"></div>
      <button class="btn wide" id="exSave">${index >= 0 ? 'Update' : 'Add to routine'}</button>
    `, body => {
      const nameIn = body.querySelector('#exName');
      const paint = () => {
        const m = musclesOf(nameIn.value);
        body.querySelector('#exMuscles').textContent = m
          ? 'Counts toward: ' + m
          : nameIn.value.trim()
            ? 'Not recognised — it will still be logged, but it will not count toward any muscle target.'
            : '';
      };
      nameIn.addEventListener('input', paint); paint();

      body.querySelector('#exSave').onclick = () => {
        const name = nameIn.value.trim();
        if(!name) return toast('Give it a name');
        const next = {
          name,
          sets: Math.max(1, parseInt(body.querySelector('#exSets').value) || 3),
          reps: body.querySelector('#exReps').value.trim() || '8-12',
          rest: Math.max(0, parseInt(body.querySelector('#exRest').value) || 90)
        };
        if(index >= 0) draft[index] = Object.assign({}, draft[index], next);
        else draft.push(next);
        paintEditor();
      };
    });
  }

  /* Weekly sets per muscle across the whole rotation as it stands. */
  function volumeCard(){
    const perWeek = Volume.weeklySets(Store.effectivePlan());
    const short = Volume.deficits(perWeek);
    const keys = Object.keys(Volume.TARGETS)
      .filter(m => (perWeek[m] || 0) > 0 || short.some(d => d.muscle === m))
      .sort((a, b) => (perWeek[b]||0)/Volume.TARGETS[b] - (perWeek[a]||0)/Volume.TARGETS[a]);

    return `
      <div style="background:var(--card-2);border-radius:var(--r-inner);padding:14px;margin-bottom:14px">
        <div class="row between" style="margin-bottom:10px">
          <b style="font-size:13.5px">Weekly volume</b>
          <span class="small muted">${short.length ? short.length + ' below minimum' : 'all covered'}</span>
        </div>
        ${keys.map(m => {
          const have = perWeek[m] || 0, tgt = Volume.TARGETS[m];
          const low = have < tgt;
          return `<div style="margin-bottom:9px">
            <div class="row between" style="font-size:12px">
              <span${low ? ' style="color:var(--fg)"' : ' class="muted"'}>${esc(Volume.LABELS[m])}</span>
              <span class="mono ${low ? '' : 'muted'}">${round(have,1)} / ${tgt}</span>
            </div>
            ${bar(Math.min((have/tgt)*100, 100), 100, low ? 'var(--pink)' : 'var(--lime)')}
          </div>`;
        }).join('')}
        <div class="hint">Sets per muscle per week, counting assistance work as a fraction of a set. Pink means below the weekly minimum for growth.</div>
      </div>`;
  }

  function dayCard(d, i, isToday){
    const exercises = Store.exercisesFor(d.key);
    const custom = Store.isCustom(d.key);
    const list = exercises.map(ex =>
      `<li>${esc(ex.name)} — ${ex.sets} × ${esc(ex.reps)}${ex.tag ? ` <span class="tag ${ex.tag}">${ex.tag === 'core' ? 'core' : 'stability'}</span>` : ''}</li>`
    ).join('');
    return `
      <div class="day${isToday ? ' today' : ''}">
        <div class="dh">
          <div class="grow">
            <b>Day ${i+1} — ${esc(d.name)}</b>${custom ? '<span class="tag">yours</span>' : ''}
            <div class="small muted">${esc(d.focus || '')}</div>
          </div>
          ${d.type === 'rest' && !d.exercises ? '' : `<button class="btn ghost sm" data-edit="${esc(d.key)}">Edit</button>`}
          <button class="btn ghost sm" data-toggle>Show</button>
        </div>
        <div class="daybody" hidden>
          ${d.cardio ? `<div class="hint"><b>${d.cardio.mode === 'run' ? 'Run' : 'Walk'} ${esc(d.cardio.minutes)} min.</b> ${esc(d.cardio.effort)}</div>` : ''}
          ${list ? `<ul class="small">${list}</ul>` : ''}
          ${d.finisher ? `<div class="hint">${esc(d.finisher)}</div>` : ''}
          ${d.note ? `<div class="hint">${esc(d.note)}</div>` : ''}
        </div>
      </div>`;
  }

  return { render };
})();
