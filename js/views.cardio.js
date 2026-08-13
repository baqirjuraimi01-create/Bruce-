/* ------------------------------------------------------------------
   views.cardio.js — running and walking log, plus a weekly load check
   so mileage climbs at a sane rate.
------------------------------------------------------------------- */

const CardioView = (() => {

  function render(root, date){
    const day = Store.cycleDayFor(date);
    const items = Store.cardioFor(date);
    const wk = weekTotals(date);

    root.innerHTML = `
      ${day.cardio ? `
        <div class="card">
          <h2>Scheduled today</h2>
          <div style="font-size:16px;font-weight:600">${day.cardio.mode === 'run' ? 'Run' : 'Walk'} — ${esc(day.cardio.minutes)} min</div>
          <div class="hint">${esc(day.cardio.effort)}</div>
        </div>` : `
        <div class="card">
          <h2>Scheduled today</h2>
          <div class="small muted">No run scheduled — today is ${esc(day.name)}. A 10-20 min easy walk after lifting is still a good idea.</div>
        </div>`}

      <div class="card">
        <h2>Log a session</h2>
        <div class="chips" style="margin-bottom:10px">
          <button class="chip on" data-mode="run">Run</button>
          <button class="chip" data-mode="walk">Walk</button>
        </div>
        <div class="grid2">
          <label class="f"><span>Minutes</span><input type="number" id="minIn" inputmode="numeric" placeholder="30"></label>
          <label class="f"><span>Distance km (optional)</span><input type="number" id="kmIn" inputmode="decimal" step="0.01" placeholder="5.0"></label>
        </div>
        <label class="f"><span>How did it feel?</span><input type="text" id="noteIn" placeholder="easy / legs heavy / calves tight"></label>
        <button class="btn wide" data-act="add">Add session</button>
      </div>

      <div class="card">
        <h2>Today</h2>
        ${items.length ? items.map(row).join('') : `<div class="empty">Nothing logged</div>`}
      </div>

      <div class="card">
        <h2>Last 7 days</h2>
        <div class="row between"><span>Total time</span><b class="mono">${wk.min} min</b></div>
        <div class="row between"><span>Total distance</span><b class="mono">${round(wk.km,1)} km</b></div>
        <div class="row between"><span>Sessions</span><b class="mono">${wk.n}</b></div>
        <div class="hr"></div>
        <div class="row between"><span class="small muted">Previous 7 days</span><span class="small mono muted">${wk.prevMin} min</span></div>
        <div class="hint">${loadAdvice(wk)}</div>
      </div>
    `;
    wire(root, date);
  }

  function row(c){
    return `<div class="item">
      <div class="grow">
        <div class="t">${c.mode === 'run' ? 'Run' : 'Walk'} — ${c.minutes} min${c.km ? ' · ' + round(c.km,2) + ' km' : ''}</div>
        <div class="s">${c.km && c.minutes ? pace(c) + ' /km' : ''}${c.note ? (c.km ? ' · ' : '') + esc(c.note) : ''}</div>
      </div>
      <button class="x" data-act="del" data-id="${c.id}">&#10005;</button>
    </div>`;
  }

  function pace(c){
    const secPerKm = (c.minutes * 60) / c.km;
    return Math.floor(secPerKm/60) + ':' + pad(Math.round(secPerKm%60));
  }

  function weekTotals(date){
    const sum = (from, to) => {
      let min = 0, km = 0, n = 0;
      for(let i = from; i < to; i++){
        for(const c of (Store.state.cardio[addDays(date, -i)] || [])){
          min += +c.minutes || 0; km += +c.km || 0; n++;
        }
      }
      return { min, km, n };
    };
    const cur = sum(0, 7), prev = sum(7, 14);
    return { min:cur.min, km:cur.km, n:cur.n, prevMin:prev.min };
  }

  function loadAdvice(wk){
    if(wk.prevMin === 0 && wk.min === 0) return 'Log a couple of sessions and this will start telling you whether your mileage is climbing too fast.';
    if(wk.prevMin === 0) return 'First week logged. Next week, aim for a similar amount rather than a jump.';
    const change = ((wk.min - wk.prevMin) / wk.prevMin) * 100;
    if(change > 30) return `You are up ${Math.round(change)}% on last week. That is the zone where shins and Achilles start complaining — hold this volume for a week before adding more.`;
    if(change > 10) return `Up ${Math.round(change)}% on last week. Slightly ahead of the 10% guideline, but fine if nothing hurts.`;
    if(change >= 0) return `Up ${Math.round(change)}% on last week. That is a sustainable rate — keep going.`;
    return `Down ${Math.abs(Math.round(change))}% on last week. Fine if it was deliberate or you were sore; worth a look if it was not.`;
  }

  function wire(root, date){
    let mode = 'run';
    root.querySelectorAll('[data-mode]').forEach(c => c.onclick = () => {
      root.querySelectorAll('[data-mode]').forEach(x => x.classList.remove('on'));
      c.classList.add('on'); mode = c.dataset.mode;
    });
    on(root, 'add', () => {
      const minutes = parseFloat(root.querySelector('#minIn').value);
      if(!minutes) return toast('How many minutes?');
      Store.addCardio(date, {
        mode,
        minutes,
        km: parseFloat(root.querySelector('#kmIn').value) || 0,
        note: root.querySelector('#noteIn').value.trim()
      });
      toast('Logged'); App.refresh();
    });
    on(root, 'del', el => { Store.removeCardio(date, el.dataset.id); App.refresh(); });
  }

  return { render };
})();
