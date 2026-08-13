/* ------------------------------------------------------------------
   views.train.js — the Train tab. Shows today's session from the 9-day
   rotation, logs weight x reps per set, shows what you did last time
   for that exercise, and runs a rest timer.
------------------------------------------------------------------- */

const TrainView = (() => {

  let timerId = 0, timerLeft = 0;

  function render(root, date){
    const day = Store.cycleDayFor(date);
    const cycleNo = Store.cycleNumberFor(date);
    const sess = Store.session(date);

    // If the rotation shifted since this session was created, follow the rotation.
    if(sess.dayKey !== day.key && Object.keys(sess.exercises).length === 0) sess.dayKey = day.key;

    let html = `
      <div class="card">
        <div class="row between">
          <div>
            <div class="small muted">Cycle ${cycleNo} · day ${Store.cycleIndexFor(date)+1} of ${PROGRAM.length}</div>
            <h2 style="margin:2px 0 4px;font-size:20px;text-transform:none;color:var(--fg)">${esc(day.name)}</h2>
            <div class="small muted">${esc(day.focus || '')}</div>
          </div>
          <button class="btn ghost sm" data-act="shift">Shift</button>
        </div>
        ${day.note ? `<div class="hint">${esc(day.note)}</div>` : ''}
        ${day.cardio ? cardioCard(day) : ''}
      </div>`;

    if(day.type === 'rest' && !day.exercises){
      html += `<div class="card"><h2>Rest</h2><div class="small">${esc(day.note || 'Nothing scheduled.')}</div></div>`;
      root.innerHTML = html + volumeCard(date);
      wire(root, date);
      return;
    }

    html += `<div class="card"><h2>Session</h2>`;
    (day.exercises || []).forEach((ex, i) => { html += exerciseCard(ex, i, date, sess); });
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
      <br>Log it on the Cardio tab.</div>`;
  }

  function exerciseCard(ex, i, date, sess){
    const saved = sess.exercises[ex.name] || Array.from({ length:ex.sets }, () => ({ w:'', r:'', done:false }));
    const last = Store.lastPerformance(ex.name, date);
    const allDone = saved.length && saved.every(s => s.done);

    return `
      <div class="ex${allDone ? ' done' : ''}" data-ex="${esc(ex.name)}">
        <div class="ex-h">
          <div class="grow">
            <div class="n">${esc(ex.name)} ${ex.tag ? `<span class="tag ${ex.tag}">${ex.tag === 'core' ? 'core' : 'stability'}</span>` : ''}</div>
            <div class="p">${ex.sets} × ${esc(ex.reps)}${ex.rest ? ` · ${ex.rest}s rest` : ''}</div>
          </div>
          <button class="btn ghost sm" data-act="rest" data-sec="${ex.rest||90}">Timer</button>
        </div>
        ${last ? `<div class="hint">Last time (${prettyDate(last.date)}): ${last.sets.map(s => `${s.w||'-'}kg × ${s.r||'-'}`).join(', ')}</div>` : ''}
        ${saved.map((s, si) => `
          <div class="setrow" data-si="${si}">
            <div class="idx">${si+1}</div>
            <input type="number" inputmode="decimal" class="w" placeholder="kg" value="${esc(s.w)}">
            <input type="number" inputmode="numeric" class="r" placeholder="reps" value="${esc(s.r)}">
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
    return `<div class="card"><h2>Volume today</h2>
      <div class="kcal-big mono">${v.toLocaleString()} <span class="muted" style="font-size:14px">kg lifted</span></div>
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
