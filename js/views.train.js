/* ------------------------------------------------------------------
   views.train.js — the Train tab. Shows today's session from the 9-day
   rotation, logs weight x reps per set, shows what you did last time
   for that exercise, and runs a rest timer.
------------------------------------------------------------------- */

const TrainView = (() => {

  let timerId = 0, timerLeft = 0;
  let sub = null;          // 'session' | 'cardio'; null = pick from the day

  function render(root, date){
    const day = Store.dayPlanFor(date);
    const cycleNo = Store.cycleNumberFor(date);
    const sess = Store.session(date);

    // If the rotation shifted since this session was created, follow the rotation.
    if(sess.dayKey !== day.key && Object.keys(sess.exercises).length === 0) sess.dayKey = day.key;

    // Cardio days open on cardio, lifting days on the session.
    const view = sub || (day.type === 'cardio' ? 'cardio' : 'session');
    const cardioCount = Store.cardioFor(date).length;

    let html = `
      <h1 class="page-h">${esc(day.name)}<small>Cycle ${cycleNo} · day ${Store.cycleIndexFor(date)+1} of ${PROGRAM.length}</small></h1>
      ${seg([
        { key:'session', label:'Session', count:(day.exercises||[]).length || undefined },
        { key:'cardio',  label:'Cardio',  count:cardioCount || undefined }
      ], view, 'sub')}

      <div class="card">
        <div class="cardhead">
          <div class="grow"><h2>${esc(day.focus || 'Session')}</h2></div>
          <button class="iconbtn" data-act="shift" aria-label="Adjust rotation">⇄</button>
        </div>
        <div class="chips">
          <span class="chip flat">${esc(day.type === 'lift' ? 'Lifting' : day.type === 'cardio' ? 'Cardio' : 'Rest')}</span>
          ${(day.exercises||[]).length ? `<span class="chip flat">${day.exercises.length} exercises</span>` : ''}
          ${(day.exercises||[]).some(e => e.tag === 'core') ? `<span class="chip flat">Core block</span>` : ''}
          ${(day.exercises||[]).some(e => e.tag === 'stab') ? `<span class="chip flat">Stability</span>` : ''}
          ${day.cardio ? `<span class="chip flat">${esc(day.cardio.minutes)} min ${day.cardio.mode}</span>` : ''}
        </div>
        ${day.note ? `<div class="hint">${esc(day.note)}</div>` : ''}
        ${day.cardio ? cardioCard(day) : ''}
      </div>`;

    if(view === 'cardio'){
      root.innerHTML = html + CardioPanel.render(date);
      wire(root, date);
      CardioPanel.wire(root, date);
      return;
    }

    if(day.type === 'rest' && !day.exercises){
      html += `<div class="card"><h2>Rest</h2><div class="small">${esc(day.note || 'Nothing scheduled.')}</div></div>`;
      root.innerHTML = html + volumeCard(date);
      wire(root, date);
      return;
    }

    html += `<div class="card">${cardHead('Session')}`;
    (day.exercises || []).forEach((ex, i) => {
      const swapped = sess.swaps[ex.name];
      const eff = swapped ? Object.assign({}, ex, { name:swapped }) : ex;
      html += exerciseCard(ex, eff, date, sess);
    });
    html += `
      ${day.finisher ? `<div class="hint">Finish: ${esc(day.finisher)}</div>` : ''}
      <div class="hr"></div>
      <label class="f"><span>Session notes</span><textarea id="sessNote" placeholder="How did it feel? Anything to change next time?">${esc(sess.note||'')}</textarea></label>
      <button class="btn wide" data-act="finish">${sess.done ? 'Session complete ✓ — update' : 'Finish session'}</button>
    </div>`;

    root.innerHTML = html + volumeCard(date);
    wire(root, date);
  }

  function cardioCard(day){
    return `<div class="hint" style="border-top:1px solid var(--line);margin-top:10px;padding-top:10px">
      <b>${day.cardio.mode === 'run' ? 'Run' : 'Walk'}: ${esc(day.cardio.minutes)} min.</b> ${esc(day.cardio.effort)}
      <br>Log it under Cardio above.</div>`;
  }

  function exerciseCard(ex, eff, date, sess){
    const swapped = eff.name !== ex.name;
    const saved = sess.exercises[eff.name] || Array.from({ length:ex.sets }, () => ({ w:'', r:'', done:false }));
    const allDone = saved.length && saved.every(s => s.done);

    // What to do today, worked out from what was logged last time.
    const nt = Progression.nextTarget(eff, date);
    const last = nt.last;
    const wPlace = nt.res.weight ? nt.res.weight : 'kg';
    const rPlace = nt.res.reps != null ? nt.res.reps : (nt.res.target != null ? nt.res.target : 'reps');

    return `
      <div class="ex${allDone ? ' done' : ''}" data-ex="${esc(eff.name)}" data-orig="${esc(ex.name)}">
        <div class="ex-h">
          <div class="grow">
            <div class="n">${esc(eff.name)} ${ex.tag ? `<span class="tag ${ex.tag}">${ex.tag === 'core' ? 'core' : 'stability'}</span>` : ''}</div>
            <div class="p">${ex.sets} × ${esc(ex.reps)}${ex.rest ? ` · ${ex.rest}s rest` : ''}</div>
            ${swapped ? `<div class="p" style="color:var(--fg-2)">swapped from ${esc(ex.name)}</div>` : ''}
          </div>
          <button class="iconbtn" data-act="swap" aria-label="Swap exercise">⇄</button>
          <button class="iconbtn" data-act="rest" data-sec="${ex.rest||90}" aria-label="Rest timer">◷</button>
        </div>
        <div class="target ${nt.tone}">${esc(nt.text)}</div>
        ${last ? `<div class="hint" style="margin-top:6px">Last time (${prettyDate(last.date)}): ${last.sets.map(s => `${s.w ? s.w + 'kg × ' : ''}${s.r||'-'}`).join(', ')}</div>` : ''}
        ${saved.map((s, si) => `
          <div class="setrow" data-si="${si}">
            <div class="idx">${si+1}</div>
            <input type="number" inputmode="decimal" class="w" placeholder="${esc(wPlace)}" value="${esc(s.w)}">
            <input type="number" inputmode="numeric" class="r" placeholder="${esc(rPlace)}" value="${esc(s.r)}">
            <input type="number" inputmode="decimal" class="rpe" placeholder="RPE" value="${esc(s.rpe||'')}">
            <button class="tick${s.done ? ' on' : ''}" data-act="tick">✓</button>
          </div>`).join('')}
        <div class="row" style="gap:8px;margin-top:8px">
          <button class="btn ghost sm" data-act="addSet">+ set</button>
          ${saved.length > 1 ? `<button class="btn ghost sm" data-act="delSet">− set</button>` : ''}
        </div>
        ${ex.note ? `<div class="hint">${esc(ex.note)}</div>` : ''}
      </div>`;
  }

  function volumeCard(date){
    const v = Store.sessionVolume(date);
    if(!v) return '';
    return `<div class="card">${cardHead('Volume today')}
      <div class="kcal-big mono">${v.toLocaleString()}<sup>kg lifted</sup></div>
      <div class="hint">Weight × reps across completed sets. Useful as a week-to-week trend, not as a target in itself.</div></div>`;
  }

  /* ---------------- interactions ---------------- */

  function wire(root, date){
    const sess = Store.session(date);

    root.querySelectorAll('.ex').forEach(card => {
      const name = card.dataset.ex;

      const collect = () => {
        const sets = [...card.querySelectorAll('.setrow')].map(r => ({
          w: r.querySelector('.w').value,
          r: r.querySelector('.r').value,
          rpe: r.querySelector('.rpe').value,
          done: r.querySelector('.tick').classList.contains('on')
        }));
        Store.setLog(date, name, sets);
        return sets;
      };

      card.querySelectorAll('input').forEach(inp => inp.addEventListener('change', collect));

      card.querySelectorAll('[data-act="tick"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const row = btn.closest('.setrow');
          btn.classList.toggle('on');
          // Ticking an empty set with a previous set filled in copies it forward —
          // most sets repeat the same weight, so this saves a lot of typing.
          if(btn.classList.contains('on')){
            const w = row.querySelector('.w'), r = row.querySelector('.r');
            const prev = row.previousElementSibling;
            if(prev && prev.classList.contains('setrow')){
              if(!w.value) w.value = prev.querySelector('.w').value;
              if(!r.value) r.value = prev.querySelector('.r').value;
            }
            const rest = +card.querySelector('[data-act="rest"]')?.dataset.sec || 90;
            if(Store.state.settings.restTimer) startTimer(rest);
          }
          collect();
          card.classList.toggle('done', [...card.querySelectorAll('.tick')].every(t => t.classList.contains('on')));
        });
      });

      card.querySelector('[data-act="addSet"]').addEventListener('click', () => {
        const sets = collect(); sets.push({ w:'', r:'', rpe:'', done:false });
        Store.setLog(date, name, sets); App.refresh();
      });
      card.querySelector('[data-act="delSet"]')?.addEventListener('click', () => {
        const sets = collect(); sets.pop();
        Store.setLog(date, name, sets); App.refresh();
      });
      card.querySelector('[data-act="rest"]')?.addEventListener('click', e => {
        startTimer(+e.currentTarget.dataset.sec || 90);
      });
      card.querySelector('[data-act="swap"]')?.addEventListener('click', () => {
        openSwap(date, card.dataset.orig, card.dataset.ex);
      });
    });

    root.querySelector('#sessNote')?.addEventListener('change', e => {
      sess.note = e.target.value; Store.save();
    });
    on(root, 'finish', () => {
      sess.done = true; Store.save();
      toast('Session logged. ' + Store.sessionVolume(date).toLocaleString() + ' kg total volume.');
      App.refresh();
    });
    on(root, 'shift', () => openShift(date));
    on(root, 'sub', el => { sub = el.dataset.key; App.refresh(); });
  }

  /* Equipment busy? Swap to something that trains the same pattern.
     Today only — tomorrow's session goes back to the programmed lift. */
  function openSwap(date, original, current){
    const alts = altsFor(original);
    const row = name => {
      const last = Store.lastPerformance(name, addDays(date, 1));
      const on = name === current;
      return `<div class="item" data-name="${esc(name)}" style="cursor:pointer">
        <div class="grow">
          <div class="t">${esc(name)}${on ? ' <span class="tag">current</span>' : ''}</div>
          <div class="s">${last
            ? 'last: ' + last.sets.map(s => `${s.w ? s.w + 'kg × ' : ''}${s.r || '-'}`).join(', ')
            : 'no history yet — first session sets your baseline'}</div>
        </div>
      </div>`;
    };

    openSheet(`
      <h2>Swap ${esc(original)}</h2>
      <div class="hint" style="margin-top:-6px">Same movement, different kit. This applies to today only, and each exercise keeps its own weight history — so a dumbbell version starts from its own numbers, not the barbell's.</div>
      <div class="sp"></div>
      ${current !== original ? `<button class="btn ghost wide" data-back style="margin-bottom:14px">Back to ${esc(original)}</button>` : ''}
      ${alts.length ? alts.map(row).join('') : `<div class="empty">No alternatives listed for this one.</div>`}
      <div class="hr"></div>
      <label class="f"><span>Or something else entirely</span>
        <input type="text" id="altOther" placeholder="e.g. Hammer Strength Incline Press"></label>
      <button class="btn wide" id="altGo">Use that</button>
    `, body => {
      const pick = name => {
        Store.setSwap(date, original, name === original ? null : name);
        closeSheet();
        toast(name === original ? 'Back to ' + original : 'Swapped to ' + name);
        App.refresh();
      };
      body.querySelectorAll('.item').forEach(el => el.onclick = () => pick(el.dataset.name));
      body.querySelector('[data-back]')?.addEventListener('click', () => pick(original));
      body.querySelector('#altGo').onclick = () => {
        const v = body.querySelector('#altOther').value.trim();
        if(!v) return toast('Type an exercise name');
        pick(v);
      };
    });
  }

  /* Let him re-anchor the rotation when life gets in the way. */
  function openShift(date){
    openSheet(`
      <h2>Adjust the rotation</h2>
      <div class="hint" style="margin-top:-4px">Missed a day, or the rotation drifted out of sync with real life? Nudge it here — everything recalculates from the cycle start date.</div>
      <div class="sp"></div>
      <div class="row" style="gap:8px">
        <button class="btn ghost grow" data-s="-1">← Back a day</button>
        <button class="btn ghost grow" data-s="1">Forward a day →</button>
      </div>
      <div class="sp"></div>
      <label class="f"><span>Make today day 1 (Push)</span>
        <button class="btn wide" id="reset">Restart the cycle from today</button></label>
      <div class="sp"></div>
      <div class="small muted">Cycle currently started ${esc(Store.state.settings.cycleStart)}.</div>
    `, body => {
      body.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
        Store.shiftCycle(+b.dataset.s); closeSheet(); App.refresh();
      });
      body.querySelector('#reset').onclick = () => {
        Store.state.settings.cycleStart = date; Store.save(); closeSheet(); App.refresh();
      };
    });
  }

  /* ---------------- rest timer ---------------- */

  function startTimer(sec){
    stopTimer();
    timerLeft = sec;
    let el = document.querySelector('.timerbar');
    if(!el){
      el = document.createElement('div');
      el.className = 'timerbar';
      el.innerHTML = `<button class="timer"></button>`;
      document.body.appendChild(el);
      el.querySelector('.timer').onclick = stopTimer;
    }
    const paint = () => {
      const b = el.querySelector('.timer');
      if(!b) return;
      const m = Math.floor(timerLeft/60), s = timerLeft%60;
      b.textContent = `Rest ${m}:${pad(s)} — tap to stop`;
    };
    paint();
    timerId = setInterval(() => {
      timerLeft--;
      if(timerLeft <= 0){
        stopTimer();
        try{ navigator.vibrate && navigator.vibrate([120,80,120]); }catch(e){}
        toast('Rest done — next set');
        return;
      }
      paint();
    }, 1000);
  }
  function stopTimer(){
    clearInterval(timerId); timerId = 0;
    document.querySelector('.timerbar')?.remove();
  }

  return { render, stopTimer };
})();
