/* ------------------------------------------------------------------
   views.progress.js — trends that actually matter: protein adherence,
   bodyweight, lift progression, cardio, plus settings and backup.
------------------------------------------------------------------- */

const ProgressView = (() => {

  // Which sub-section the segmented control is showing.
  let sub = 'nutrition';

  function render(root, date){
    const tgt = Store.targets();
    const days = last(date, 14);
    const hitDays = days.filter(d => Store.totalsFor(d).p >= tgt.protein * 0.9).length;
    const logged = days.filter(d => Store.day(d).entries.length).length;
    const w = Store.weightSeries();
    const lifts = days.filter(d => Store.state.sessions[d] && Object.keys(Store.state.sessions[d].exercises).length).length;

    const panels = {
      nutrition: `
        <div class="card">
          ${cardHead('Protein adherence', 'protInfo')}
          <div class="donutwrap">
            ${donut(logged ? (hitDays/logged)*100 : 0, hitDays, '/ ' + (logged || 0), 'days on target')}
            <div class="grow">
              <div class="small muted">Target</div>
              <div style="font-size:19px;font-weight:500;letter-spacing:-.03em;margin-top:2px" class="mono">${tgt.protein}<span class="muted" style="font-size:11px;font-weight:400"> g protein</span></div>
              <div class="chips" style="margin-top:12px"><span class="chip flat">Last 14 days</span></div>
            </div>
          </div>
          <div class="spark">
            ${days.map(d => {
              const p = Store.totalsFor(d).p;
              const h = clamp((p / (tgt.protein*1.2)) * 100, 2, 100);
              return `<i class="${p >= tgt.protein*0.9 ? '' : 'miss'}" style="height:${h}%" title="${d}: ${p}g"></i>`;
            }).join('')}
          </div>
          <div class="hint">Bars are daily protein; solid blue means you hit at least 90% of your ${tgt.protein} g target. This one number predicts whether you keep your muscle better than any other in the app.</div>
        </div>`,

      training: `
        <div class="card">
          ${cardHead('Lift progression')}
          ${liftTable(date)}
          <div class="hint">Top set from your most recent session for each main lift. If a number has not moved in three cycles, that lift needs a change — more sets, a deload, or a different variation.</div>
        </div>

        <div class="card">
          ${cardHead('Last 14 days')}
          ${trainingSummary(date)}
        </div>`,

      body: `
        ${healthCards(date)}
        <div class="card">
          ${cardHead('Bodyweight')}
          ${w.length >= 2 ? `
            <div class="row between">
              <div><div class="kcal-big mono">${w[w.length-1].kg}<sup>kg</sup></div>
                <div class="small muted" style="margin-top:4px">latest — ${prettyDate(w[w.length-1].date)}</div></div>
              <div class="right"><div class="mono" style="font-size:18px;font-weight:500;letter-spacing:-.03em">${trend(w)}</div>
                <div class="small muted">per week (last 4)</div></div>
            </div>
            <div class="spark">${sparkWeights(w.slice(-20))}</div>
          ` : `<div class="empty">Log your weight on the Food tab a few times and the trend appears here.</div>`}
        </div>`
    };

    root.innerHTML = `
      <h1 class="page-h">Progress<small>${esc(prettyDate(date))} · cycle ${Store.cycleNumberFor(date)}</small></h1>

      ${seg([
        { key:'nutrition', label:'Nutrition', count:hitDays },
        { key:'training',  label:'Training',  count:lifts },
        { key:'body',      label:'Body',      count:w.length }
      ], sub, 'sub')}

      ${panels[sub]}

      <div class="card">
        ${cardHead('Targets')}
        ${settingsForm(tgt)}
      </div>

      ${syncCard()}

      <div class="card">
        ${cardHead('Transfer &amp; backup')}
        <div class="hint" style="margin-top:-6px">There is no account and no server, so each browser keeps its own log. On an iPhone the home-screen app and Safari are <b>separate stores</b> even at the same address — anything logged in one is invisible to the other. Copy from one, merge into the other.</div>
        <div class="sp"></div>
        <div class="row wrap" style="gap:8px">
          <button class="btn grow" data-act="copy">Copy my data</button>
          <button class="btn ghost grow" data-act="paste">Paste &amp; merge</button>
        </div>
        <div class="sp"></div>
        <div class="row wrap" style="gap:8px">
          <button class="btn ghost sm grow" data-act="export">Save as file</button>
          <button class="btn ghost sm grow" data-act="import">Load a file</button>
        </div>
        <div class="hint">Merging never deletes: entries from both sides are kept, and anything already here wins a disagreement. Importing the same backup twice changes nothing.</div>
        <div class="hr"></div>
        <button class="btn danger wide" data-act="wipe">Erase everything</button>
        <div class="hint">Erasing cannot be undone. Copy your data first if you are unsure.</div>
      </div>
    `;
    wire(root, date);
  }

  /* ---------- sync ---------- */
  function syncCard(){
    const st = Sync.status();
    if(!st.on){
      return `
        <div class="card">
          ${cardHead('Sync')}
          <div class="hint" style="margin-top:-6px">Off. Every browser keeps its own log — the home-screen app and Safari included. Turn this on and they all hold the same one.</div>
          <div class="sp"></div>
          <button class="btn wide" data-act="syncSetup">Set up sync</button>
        </div>`;
    }
    const dot = { ok:'var(--lime)', syncing:'var(--blue)', error:'#e2607a', idle:'var(--dim)' }[st.status] || 'var(--dim)';
    const when = st.at ? whenText(st.at) : 'not yet';
    return `
      <div class="card">
        ${cardHead('Sync')}
        <div class="row between">
          <div class="row" style="gap:9px">
            <span style="width:9px;height:9px;border-radius:50%;background:${dot};display:inline-block"></span>
            <div>
              <div style="font-weight:500;font-size:14px">${
                st.status === 'syncing' ? 'Syncing…' :
                st.status === 'error'   ? 'Not synced' : 'Up to date'}</div>
              <div class="tiny muted">${st.status === 'error' ? esc(st.message) : 'last synced ' + esc(when)}</div>
            </div>
          </div>
          <button class="btn ghost sm" data-act="syncNow">Sync now</button>
        </div>
        <div class="hr"></div>
        <div class="row wrap" style="gap:8px">
          <button class="btn ghost sm grow" data-act="syncCode">Show my code</button>
          <button class="btn ghost sm grow" data-act="syncOff">Turn off</button>
        </div>
        <div class="hint">Your data is encrypted on this device before it is sent. The server stores it under a hash and cannot read any of it.</div>
      </div>`;
  }

  function whenText(iso){
    const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if(secs < 60) return 'just now';
    if(secs < 3600) return Math.floor(secs/60) + ' min ago';
    if(secs < 86400) return Math.floor(secs/3600) + ' h ago';
    return prettyDate(fmt(new Date(iso)));
  }

  function openSyncSetup(){
    const st = Sync.status();
    openSheet(`
      <h2>Set up sync</h2>
      <div class="hint" style="margin-top:-6px">Do this on one device first, then repeat on the other using the <b>same</b> two values. See server/README.md in the repo for the five-minute server setup.</div>
      <div class="sp"></div>
      <label class="f"><span>Sync server address</span>
        <input type="text" id="syUrl" value="${esc(st.url || '')}" placeholder="https://bruce-sync.yourname.workers.dev" autocomplete="off"></label>
      <label class="f"><span>Sync code</span>
        <input type="text" id="syCode" value="${esc(st.code || '')}" placeholder="ABCDE-FGHJK-MNPQR-STUVW" autocomplete="off"></label>
      <button class="btn ghost wide" id="syNew">Create a new code</button>
      <div class="hint">Use <b>Create a new code</b> on the first device only. On the second, type in the code from the first — that is what pairs them. Anyone with the code can read your data, so keep it to yourself.</div>
      <div class="sp"></div>
      <button class="btn wide" id="sySave">Turn on sync</button>
    `, body => {
      body.querySelector('#syNew').onclick = () => {
        body.querySelector('#syCode').value = Sync.newCode();
        toast('New code created — you will need it on your other device');
      };
      body.querySelector('#sySave').onclick = async () => {
        const url = body.querySelector('#syUrl').value.trim();
        const code = body.querySelector('#syCode').value.trim();
        if(!/^https?:\/\//.test(url)) return toast('Enter the full server address, starting with https://');
        if(Sync.normaliseCode(code).length < 12) return toast('That code looks too short');
        Sync.configure({ url, code });
        closeSheet();
        toast('Syncing…');
        await Sync.run();
        App.refresh();
      };
    });
  }

  function openSyncCode(){
    const st = Sync.status();
    openSheet(`
      <h2>Your sync code</h2>
      <div class="hint" style="margin-top:-6px">Type this into your other device, along with the same server address, to pair them.</div>
      <div class="sp"></div>
      <div class="card" style="text-align:center;padding:22px 14px">
        <div class="mono" style="font-size:21px;font-weight:500;letter-spacing:.06em">${esc(st.code)}</div>
        <div class="tiny muted" style="margin-top:10px">${esc(st.url)}</div>
      </div>
      <button class="btn wide" id="cpCode">Copy code</button>
      <div class="hint">Anyone with this code and the address can read your log. It is the only thing protecting it — treat it like a password.</div>
    `, body => {
      body.querySelector('#cpCode').onclick = async () => {
        try{ await navigator.clipboard.writeText(st.code); toast('Copied'); }
        catch(e){ toast('Select the code above and copy it'); }
      };
    });
  }

  /* Watch recovery trends. Only rendered once there is data, so the tab
     is unchanged for anyone not feeding it. */
  function healthCards(date){
    const rhr = Store.healthSeries('rhr', date, 14).filter(x => x.v);
    const slp = Store.healthSeries('sleep', date, 14).filter(x => x.v);
    if(!rhr.length && !slp.length) return '';

    const avg = xs => round(xs.reduce((a, x) => a + x.v, 0) / xs.length, 1);
    const sparkOf = (series, color) => {
      const all = Store.healthSeries(series === 'rhr' ? 'rhr' : 'sleep', date, 14);
      const vals = all.filter(x => x.v).map(x => x.v);
      if(!vals.length) return '';
      const lo = Math.min(...vals) * 0.92, hi = Math.max(...vals) * 1.04;
      return `<div class="spark">${all.map(x => x.v
        ? `<i style="height:${clamp(((x.v - lo)/(hi - lo))*100, 6, 100)}%;background:${color}" title="${x.date}: ${x.v}"></i>`
        : `<i class="miss" style="height:6%"></i>`).join('')}</div>`;
    };

    let html = '';
    if(rhr.length >= 2){
      const recent = avg(rhr.slice(-3)), base = avg(rhr);
      const up = recent - base;
      html += `
        <div class="card">
          ${cardHead('Resting heart rate')}
          <div class="row between">
            <div><div class="kcal-big mono">${rhr[rhr.length-1].v}<sup>bpm</sup></div>
              <div class="small muted" style="margin-top:4px">14-day average ${base}</div></div>
            <div class="right"><div class="mono" style="font-size:18px;font-weight:500">${up >= 0 ? '+' : ''}${round(up,1)}</div>
              <div class="small muted">last 3 days vs average</div></div>
          </div>
          ${sparkOf('rhr', 'var(--pink)')}
          <div class="hint">${up >= 4
            ? 'Noticeably elevated. That is the classic under-recovery signal — poor sleep, illness brewing, or too much load. Make today easier than planned.'
            : up >= 2
              ? 'Slightly up on your average. Worth watching; one high day means nothing, three in a row means back off.'
              : 'Steady. Recovery looks fine — train as planned.'}</div>
        </div>`;
    }
    if(slp.length >= 2){
      const a = avg(slp);
      html += `
        <div class="card">
          ${cardHead('Sleep')}
          <div class="row between">
            <div><div class="kcal-big mono">${slp[slp.length-1].v}<sup>h last night</sup></div>
              <div class="small muted" style="margin-top:4px">14-day average ${a} h</div></div>
          </div>
          ${sparkOf('sleep', 'var(--blue)')}
          <div class="hint">${a < 7
            ? 'Averaging under 7 hours. This is the cheapest gain available to you — muscle is built in bed, and lifting hard on short sleep is how progress stalls and joints start complaining.'
            : 'Averaging ' + a + ' hours. Good — this is where the adaptation actually happens.'}</div>
        </div>`;
    }
    return html;
  }

  function last(date, n){
    const out = [];
    for(let i = n-1; i >= 0; i--) out.push(addDays(date, -i));
    return out;
  }

  function trend(w){
    const pts = w.slice(-4);
    if(pts.length < 2) return '—';
    const days = (dateOnly(pts[pts.length-1].date) - dateOnly(pts[0].date)) / 86400000;
    if(days <= 0) return '—';
    const perWeek = ((pts[pts.length-1].kg - pts[0].kg) / days) * 7;
    const s = (perWeek >= 0 ? '+' : '') + round(perWeek, 2) + ' kg';
    return s;
  }

  function sparkWeights(w){
    const vals = w.map(x => x.kg);
    const lo = Math.min(...vals) - 0.4, hi = Math.max(...vals) + 0.4;
    return w.map(x => {
      const h = clamp(((x.kg - lo) / (hi - lo)) * 100, 4, 100);
      return `<i style="height:${h}%" title="${x.date}: ${x.kg} kg"></i>`;
    }).join('');
  }

  const MAIN_LIFTS = ['Barbell Bench Press','Weighted Pull-up / Lat Pulldown','Back Squat','Romanian Deadlift','Standing Overhead Press','Bulgarian Split Squat'];

  function liftTable(date){
    const rows = MAIN_LIFTS.map(name => {
      const last = Store.lastPerformance(name, addDays(date, 1));
      if(!last) return `<tr><td>${esc(name)}</td><td class="n muted">—</td><td class="n muted">—</td></tr>`;
      const top = last.sets.reduce((a, s) =>
        (parseFloat(s.w)||0) > (parseFloat(a.w)||0) ? s : a, last.sets[0]);
      return `<tr><td>${esc(name)}</td>
        <td class="n">${top.w || '-'} kg × ${top.r || '-'}</td>
        <td class="n muted">${prettyDate(last.date)}</td></tr>`;
    }).join('');
    return `<table class="mini"><tr><th>Lift</th><th class="n">Top set</th><th class="n">When</th></tr>${rows}</table>`;
  }

  function trainingSummary(date){
    const days = last(date, 14);
    let lifts = 0, vol = 0, runs = 0, runMin = 0;
    for(const d of days){
      const s = Store.state.sessions[d];
      if(s && Object.keys(s.exercises).length){ lifts++; vol += Store.sessionVolume(d); }
      for(const c of (Store.state.cardio[d] || [])){ runs++; runMin += +c.minutes || 0; }
    }
    return `<table class="mini">
      <tr><td>Lifting sessions</td><td class="n">${lifts}</td></tr>
      <tr><td>Total volume</td><td class="n">${vol.toLocaleString()} kg</td></tr>
      <tr><td>Cardio sessions</td><td class="n">${runs}</td></tr>
      <tr><td>Cardio time</td><td class="n">${runMin} min</td></tr>
    </table>
    <div class="hint">Over 14 days the rotation should give you about 7-8 lifting sessions and 4-5 cardio sessions.</div>`;
  }

  function settingsForm(tgt){
    const p = Store.state.profile;
    return `
      <div class="grid2">
        <label class="f"><span>Bodyweight kg</span><input type="number" step="0.1" id="pw" value="${p.weightKg}"></label>
        <label class="f"><span>Height cm</span><input type="number" id="ph" value="${p.heightCm}"></label>
        <label class="f"><span>Age</span><input type="number" id="pa" value="${p.age}"></label>
        <label class="f"><span>Goal</span>
          <select id="pg">
            <option value="cut"${p.goal==='cut'?' selected':''}>Lose fat</option>
            <option value="recomp"${p.goal==='recomp'?' selected':''}>Recomp (hold weight)</option>
            <option value="gain"${p.goal==='gain'?' selected':''}>Lean gain</option>
          </select></label>
      </div>
      <label class="f"><span>Activity</span>
        <select id="pact">
          <option value="1.375"${p.activity==1.375?' selected':''}>Desk job, light training</option>
          <option value="1.55"${p.activity==1.55?' selected':''}>Moderate — 5 lifts + 3 runs per cycle</option>
          <option value="1.725"${p.activity==1.725?' selected':''}>High — on your feet all day</option>
        </select></label>
      <label class="f"><span><input type="checkbox" id="pauto"${p.autoTargets?' checked':''}> Calculate my targets automatically</span></label>
      ${p.autoTargets ? `
        <div class="small muted">Calculated: <b class="mono">${tgt.kcal} kcal</b> · P ${tgt.protein} g · C ${tgt.carbs} g · F ${tgt.fat} g</div>` : `
        <div class="grid2">
          <label class="f"><span>Calories</span><input type="number" id="tk" value="${p.targets.kcal}"></label>
          <label class="f"><span>Protein g</span><input type="number" id="tp" value="${p.targets.protein}"></label>
          <label class="f"><span>Carbs g</span><input type="number" id="tc" value="${p.targets.carbs}"></label>
          <label class="f"><span>Fat g</span><input type="number" id="tf" value="${p.targets.fat}"></label>
        </div>`}
      <div class="sp"></div>
      <label class="f"><span><input type="checkbox" id="prest"${Store.state.settings.restTimer?' checked':''}> Start the rest timer when I tick a set</span></label>
      <label class="f"><span>Daily step goal</span>
        <input type="number" id="pstep" value="${Store.state.settings.stepGoal || 10000}"></label>
      <label class="f"><span>USDA FoodData Central API key (optional — sharper data for raw foods)</span>
        <input type="text" id="pusda" value="${esc(Store.state.settings.usdaKey||'')}" placeholder="free from fdc.nal.usda.gov"></label>
      <button class="btn wide" data-act="saveSettings">Save</button>`;
  }

  /* Merge by default; replacing is offered only as a deliberate choice. */
  function applyBackup(txt){
    JSON.parse(txt);              // fail early and loudly on junk
    openSheet(`
      <h2>Restore</h2>
      <div class="hint" style="margin-top:-6px">Merging keeps everything on both sides and is almost always what you want. Replacing throws away what is on this device.</div>
      <div class="sp"></div>
      <button class="btn wide" id="mrg">Merge with what is here</button>
      <div class="sp"></div>
      <button class="btn ghost wide" id="rep">Replace everything instead</button>
    `, body => {
      body.querySelector('#mrg').onclick = () => {
        try{
          const stats = Store.mergeJSON(txt);
          closeSheet(); toast(Merge.summarise(stats), 3200); App.refresh();
        }catch(e){ toast('That does not look like a backup'); }
      };
      body.querySelector('#rep').onclick = () => {
        try{
          Store.importJSON(txt);
          closeSheet(); toast('Replaced with the backup'); App.refresh();
        }catch(e){ toast('That does not look like a backup'); }
      };
    });
  }

  function wire(root, date){
    on(root, 'sub', el => { sub = el.dataset.key; App.refresh(); });
    on(root, 'syncSetup', openSyncSetup);
    on(root, 'syncCode',  openSyncCode);
    on(root, 'syncNow',   async () => { await Sync.run(); App.refresh(); });
    on(root, 'syncOff',   () => { Sync.turnOff(); toast('Sync turned off'); App.refresh(); });
    on(root, 'protInfo', () => toast('Aim for 90%+ of your protein target on most days'));

    on(root, 'saveSettings', () => {
      const p = Store.state.profile;
      p.weightKg = parseFloat(root.querySelector('#pw').value) || p.weightKg;
      p.heightCm = parseFloat(root.querySelector('#ph').value) || p.heightCm;
      p.age      = parseInt(root.querySelector('#pa').value) || p.age;
      p.goal     = root.querySelector('#pg').value;
      p.activity = parseFloat(root.querySelector('#pact').value);
      p.autoTargets = root.querySelector('#pauto').checked;
      if(!p.autoTargets){
        p.targets = {
          kcal: parseInt(root.querySelector('#tk').value) || p.targets.kcal,
          protein: parseInt(root.querySelector('#tp').value) || p.targets.protein,
          carbs: parseInt(root.querySelector('#tc').value) || p.targets.carbs,
          fat: parseInt(root.querySelector('#tf').value) || p.targets.fat
        };
      }
      Store.state.settings.restTimer = root.querySelector('#prest').checked;
      Store.state.settings.usdaKey = root.querySelector('#pusda').value.trim();
      Store.state.settings.stepGoal = parseInt(root.querySelector('#pstep').value) || 10000;
      Store.save(); toast('Saved'); App.refresh();
    });

    on(root, 'export', () => {
      const blob = new Blob([Store.exportJSON()], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bruce-tracker-' + today() + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    on(root, 'import', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json';
      inp.onchange = async () => {
        const file = inp.files[0];
        if(!file) return;
        try{ applyBackup(await file.text()); }
        catch(e){ toast('That file could not be read'); }
      };
      inp.click();
    });

    // Downloads are unreliable inside an iOS home-screen app, and that is
    // exactly where the other half of the data usually lives — so the
    // clipboard is the path that always works.
    on(root, 'copy', async () => {
      const txt = Store.exportJSON();
      try{
        await navigator.clipboard.writeText(txt);
        toast('Copied — now open the other one and tap Paste & merge');
      }catch(e){
        openSheet(`
          <h2>Copy your data</h2>
          <div class="hint" style="margin-top:-6px">Select all of this and copy it, then paste it into the other one.</div>
          <div class="sp"></div>
          <textarea id="outBox" style="min-height:200px;font-size:11px" readonly>${esc(txt)}</textarea>
        `, body => { const t = body.querySelector('#outBox'); t.focus(); t.select(); });
      }
    });

    on(root, 'paste', () => {
      openSheet(`
        <h2>Paste &amp; merge</h2>
        <div class="hint" style="margin-top:-6px">Paste what you copied from the other one. Both sides are kept — nothing here is deleted.</div>
        <div class="sp"></div>
        <textarea id="inBox" placeholder="Paste here" style="min-height:170px;font-size:11px"></textarea>
        <button class="btn wide" id="doMerge">Merge</button>
      `, body => {
        body.querySelector('#doMerge').onclick = () => {
          const txt = body.querySelector('#inBox').value.trim();
          if(!txt) return toast('Nothing pasted');
          try{ closeSheet(); applyBackup(txt); }
          catch(e){ toast('That does not look like a backup'); }
        };
      });
    });

    on(root, 'wipe', () => {
      openSheet(`
        <h2>Erase everything?</h2>
        <div class="hint" style="margin-top:-4px">Every food log, session and weight entry on this device is deleted. This cannot be undone — export a backup first if you are unsure.</div>
        <div class="sp"></div>
        <div class="row" style="gap:8px">
          <button class="btn ghost grow" id="no">Cancel</button>
          <button class="btn danger grow" id="yes">Erase</button>
        </div>`, body => {
        body.querySelector('#no').onclick = closeSheet;
        body.querySelector('#yes').onclick = () => { Store.reset(); closeSheet(); toast('Erased'); App.refresh(); };
      });
    });
  }

  return { render };
})();
