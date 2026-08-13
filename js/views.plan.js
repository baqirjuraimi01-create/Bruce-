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
        <div class="small muted" style="margin-bottom:10px">Your split, kept as you wrote it. Three things changed: rest days now carry the running, Arms day picked up single-leg work so legs are trained twice per cycle, and every lifting day ends with core.</div>
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

  function dayCard(d, i, isToday){
    const list = (d.exercises || []).map(ex =>
      `<li>${esc(ex.name)} — ${ex.sets} × ${esc(ex.reps)}${ex.tag ? ` <span class="tag ${ex.tag}">${ex.tag === 'core' ? 'core' : 'stability'}</span>` : ''}</li>`
    ).join('');
    return `
      <div class="day${isToday ? ' today' : ''}">
        <div class="dh">
          <div>
            <b>Day ${i+1} — ${esc(d.name)}</b>
            <div class="small muted">${esc(d.focus || '')}</div>
          </div>
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
