/* ------------------------------------------------------------------
   views.food.js — the Food tab: daily macros, meals, barcode scanning,
   search, portion picking, and Bruce's preset meals.
------------------------------------------------------------------- */

const FoodView = (() => {

  function render(root, date){
    const tot = Store.totalsFor(date);
    const tgt = Store.targets();
    const proteinLeft = Math.max(0, tgt.protein - tot.p);

    let html = `
      <div class="card">
        <h2>Today's intake</h2>
        ${macroBlock(tot, tgt)}
        <div class="hr"></div>
        <div class="row wrap" style="gap:8px">
          <button class="btn grow" data-act="scan">Scan barcode</button>
          <button class="btn ghost grow" data-act="search">Search food</button>
        </div>
        ${proteinLeft > 0 ? `<div class="hint">${proteinLeft} g of protein still to go${proteinHint(proteinLeft)}</div>` : ''}
      </div>

      <div class="card">
        <h2>Quick add — your meals</h2>
        <div class="chips">
          ${PRESET_MEALS.map((m,i) => `<button class="chip" data-act="preset" data-i="${i}">${esc(m.name)}</button>`).join('')}
        </div>
        <div class="hint">These are your meals with the fixes applied — tap to log the whole thing, then adjust any item.</div>
      </div>
    `;

    for(const m of MEALS){
      const entries = Store.day(date).entries.filter(e => e.meal === m.key);
      const mt = Store.totalsByMeal(date, m.key);
      html += `
        <div class="meal-title">
          <h3>${m.label}</h3>
          <span class="small muted mono">${mt.kcal} kcal · ${mt.p}g P</span>
        </div>
        <div class="card" style="padding:10px 14px">
          ${entries.length ? entries.map(entryRow).join('') : `<div class="empty">Nothing logged</div>`}
          <div class="hr" style="margin:10px 0 8px"></div>
          <div class="row" style="gap:8px">
            <button class="btn ghost sm grow" data-act="scan" data-meal="${m.key}">Scan</button>
            <button class="btn ghost sm grow" data-act="search" data-meal="${m.key}">Search</button>
            <button class="btn ghost sm grow" data-act="quick" data-meal="${m.key}">Recent</button>
          </div>
        </div>`;
    }

    html += `
      <div class="card">
        <h2>Bodyweight</h2>
        <div class="row" style="gap:8px">
          <input type="number" step="0.1" id="wIn" placeholder="kg" value="${Store.day(date).weight || ''}">
          <button class="btn" data-act="saveWeight">Save</button>
        </div>
        <div class="hint">Weigh yourself first thing, after the toilet, before food. Judge trends on the weekly average, never on one day.</div>
      </div>`;

    root.innerHTML = html;
    wire(root, date);
  }

  function proteinHint(left){
    if(left >= 45) return ' — that is roughly 150 g of chicken or two scoops of whey.';
    if(left >= 20) return ' — 200 g of Greek yogurt or one scoop of whey covers it.';
    return ' — a yogurt or a glass of milk closes the gap.';
  }

  function entryRow(e){
    return `
      <div class="item">
        <div class="grow">
          <div class="t">${esc(e.name)}</div>
          <div class="s">${round(e.grams,0)} g${e.brand ? ' · ' + esc(e.brand) : ''} · ${Math.round(e.kcal)} kcal · P${Math.round(e.p)} C${Math.round(e.c)} F${Math.round(e.f)}</div>
        </div>
        <button class="x" data-act="editEntry" data-id="${e.id}" aria-label="Edit">&#9998;</button>
        <button class="x" data-act="delEntry" data-id="${e.id}" aria-label="Delete">&#10005;</button>
      </div>`;
  }

  /* ---------------- interactions ---------------- */

  function wire(root, date){
    on(root, 'scan',   el => startScan(date, el.dataset.meal || guessMeal()));
    on(root, 'search', el => openSearch(date, el.dataset.meal || guessMeal()));
    on(root, 'quick',  el => openRecent(date, el.dataset.meal || guessMeal()));
    on(root, 'preset', el => addPreset(date, +el.dataset.i));
    on(root, 'delEntry', el => { Store.removeEntry(date, el.dataset.id); App.refresh(); });
    on(root, 'editEntry', el => editEntry(date, el.dataset.id));
    on(root, 'saveWeight', () => {
      const v = parseFloat(document.getElementById('wIn').value);
      if(!v) return toast('Enter a weight');
      Store.setWeight(date, v);
      toast('Weight saved');
      App.refresh();
    });
  }

  // Pick a sensible meal from the clock so the quick buttons do the right thing.
  function guessMeal(){
    const h = new Date().getHours();
    if(h < 11) return 'breakfast';
    if(h < 16) return 'lunch';
    if(h < 21) return 'dinner';
    return 'snack';
  }

  /* ---------------- barcode ---------------- */

  function startScan(date, meal){
    Scanner.open(async code => {
      toast('Looking up ' + code + '…');
      try{
        const food = await Nutrition.byBarcode(code);
        openPortion(date, meal, food);
      }catch(err){
        if(err.code === 'NOT_FOUND' || err.code === 'NO_DATA'){
          openManualFood(date, meal, err.barcode, err.partial);
        }else{
          toast('Lookup failed — check your connection');
          openManualFood(date, meal, code, null);
        }
      }
    });
  }

  /* ---------------- search ---------------- */

  function openSearch(date, meal){
    openSheet(`
      <h2>Add to ${esc(MEALS.find(m => m.key === meal).label)}</h2>
      <div class="row" style="gap:8px">
        <input type="search" id="qIn" placeholder="chicken breast, oats, protein bar…" autocomplete="off">
        <button class="btn" id="qGo">Go</button>
      </div>
      <div class="hint">Built-in foods appear instantly. Online results come from USDA and Open Food Facts.</div>
      <div id="qRes"></div>
      <div class="sp"></div>
      <button class="btn ghost wide" id="qManual">Enter macros manually</button>
    `, body => {
      const input = body.querySelector('#qIn');
      const res   = body.querySelector('#qRes');
      input.focus();

      const showLocal = () => paintResults(res, Nutrition.searchLocal(input.value), date, meal);
      let t = 0;
      input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(showLocal, 120); });

      const go = async () => {
        const q = input.value.trim();
        if(q.length < 2) return toast('Type at least 2 characters');
        res.innerHTML = `<div class="empty">Searching…</div>`;
        try{
          paintResults(res, await Nutrition.search(q), date, meal);
        }catch(e){
          paintResults(res, Nutrition.searchLocal(q), date, meal);
          toast('Offline — showing built-in foods only');
        }
      };
      body.querySelector('#qGo').onclick = go;
      input.addEventListener('keydown', e => { if(e.key === 'Enter') go(); });
      body.querySelector('#qManual').onclick = () => openManualFood(date, meal, '', null);
    });
  }

  function paintResults(container, foods, date, meal){
    if(!foods.length){
      container.innerHTML = `<div class="empty">No matches. Try the manual entry button.</div>`;
      return;
    }
    container.innerHTML = foods.map((f,i) => `
      <div class="item" data-i="${i}" style="cursor:pointer">
        <div class="grow">
          <div class="t">${esc(f.name)}</div>
          <div class="s">${f.brand ? esc(f.brand) + ' · ' : ''}${Math.round(f.kcal)} kcal · P${f.p} C${f.c} F${f.f} <span class="tag">${esc(f.source||'')}</span></div>
        </div>
      </div>`).join('');
    container.querySelectorAll('.item').forEach(el => {
      el.onclick = () => openPortion(date, meal, foods[+el.dataset.i]);
    });
  }

  /* ---------------- recent ---------------- */

  function openRecent(date, meal){
    const recents = Store.recentFoods(20);
    if(!recents.length) return openSearch(date, meal);
    openSheet(`
      <h2>Recent foods</h2>
      ${recents.map((e,i) => `
        <div class="item" data-i="${i}" style="cursor:pointer">
          <div class="grow">
            <div class="t">${esc(e.name)}</div>
            <div class="s">last logged at ${round(e.grams,0)} g · ${Math.round(e.kcal)} kcal</div>
          </div>
        </div>`).join('')}
    `, body => {
      body.querySelectorAll('.item').forEach(el => {
        const e = recents[+el.dataset.i];
        el.onclick = () => {
          // Re-derive a per-100g food from the stored entry so portions scale.
          const r = 100 / e.grams;
          openPortion(date, meal, {
            name:e.name, brand:e.brand, barcode:e.barcode, source:e.source,
            kcal:round(e.kcal*r,1), p:round(e.p*r,1), c:round(e.c*r,1), f:round(e.f*r,1),
            serving:round(e.grams,0), servingLabel:'last portion'
          });
        };
      });
    });
  }

  /* ---------------- portion picker ---------------- */

  function openPortion(date, meal, food){
    const start = food.serving && food.serving > 0 ? round(food.serving,0) : 100;
    openSheet(`
      <h2>${esc(food.name)}</h2>
      <div class="small muted" style="margin:-6px 0 12px">
        ${food.brand ? esc(food.brand) + ' · ' : ''}per 100 g: ${Math.round(food.kcal)} kcal · P${food.p} C${food.c} F${food.f}
        ${food.source ? `<span class="tag">${esc(food.source)}</span>` : ''}
      </div>
      <label class="f"><span>Amount in grams</span>
        <input type="number" id="gIn" inputmode="decimal" step="1" value="${start}">
      </label>
      <div class="chips" style="margin-bottom:12px">
        ${[30,50,100,150,200,250].map(g => `<button class="chip" data-g="${g}">${g} g</button>`).join('')}
        ${food.serving && food.serving !== 100 ? `<button class="chip" data-g="${round(food.serving,0)}">1 serving (${esc(food.servingLabel||'')})</button>` : ''}
      </div>
      <label class="f"><span>Meal</span>
        <select id="mIn">${MEALS.map(m => `<option value="${m.key}"${m.key===meal?' selected':''}>${m.label}</option>`).join('')}</select>
      </label>
      <div class="card" id="preview" style="margin:0 0 14px"></div>
      <div class="row" style="gap:8px">
        <button class="btn ghost" id="cancel">Cancel</button>
        <button class="btn grow" id="add">Add to log</button>
      </div>
    `, body => {
      const g = body.querySelector('#gIn');
      const preview = body.querySelector('#preview');
      const paint = () => {
        const grams = parseFloat(g.value) || 0;
        const e = Nutrition.toEntry(food, grams, meal);
        preview.innerHTML = `<div class="row between"><b class="mono">${Math.round(e.kcal)} kcal</b>
          <span class="small mono">P ${round(e.p,1)}g · C ${round(e.c,1)}g · F ${round(e.f,1)}g</span></div>`;
      };
      g.addEventListener('input', paint); paint();
      body.querySelectorAll('.chip').forEach(c => c.onclick = () => { g.value = c.dataset.g; paint(); });
      body.querySelector('#cancel').onclick = closeSheet;
      body.querySelector('#add').onclick = () => {
        const grams = parseFloat(g.value);
        if(!grams || grams <= 0) return toast('Enter an amount');
        Store.addEntry(date, Nutrition.toEntry(food, grams, body.querySelector('#mIn').value));
        if(food.barcode) Store.saveFood(food);
        closeSheet(); toast('Logged'); App.refresh();
      };
    });
  }

  /* ---------------- edit an existing entry ---------------- */

  function editEntry(date, id){
    const e = Store.day(date).entries.find(x => x.id === id);
    if(!e) return;
    openSheet(`
      <h2>${esc(e.name)}</h2>
      <label class="f"><span>Amount in grams</span>
        <input type="number" id="gIn" step="1" value="${round(e.grams,0)}"></label>
      <div class="row" style="gap:8px">
        <button class="btn danger" id="del">Delete</button>
        <button class="btn grow" id="save">Save</button>
      </div>
    `, body => {
      body.querySelector('#save').onclick = () => {
        const v = parseFloat(body.querySelector('#gIn').value);
        if(!v || v <= 0) return toast('Enter an amount');
        Store.updateEntry(date, id, v);
        closeSheet(); App.refresh();
      };
      body.querySelector('#del').onclick = () => {
        Store.removeEntry(date, id); closeSheet(); App.refresh();
      };
    });
  }

  /* ---------------- manual food (barcode miss / homemade) ---------------- */

  function openManualFood(date, meal, barcode, partial){
    openSheet(`
      <h2>${barcode ? 'Not in the database' : 'Enter macros manually'}</h2>
      ${barcode ? `<div class="hint" style="margin-top:-4px">Barcode ${esc(barcode)} has no usable nutrition data. Copy the numbers off the label — it will be saved, so the next scan of this product is instant.</div>` : ''}
      <div class="sp"></div>
      <label class="f"><span>Name</span><input type="text" id="nIn" value="${esc(partial?.name || '')}" placeholder="e.g. Protein bar, cookies &amp; cream"></label>
      <label class="f"><span>Brand (optional)</span><input type="text" id="bIn" value="${esc(partial?.brand || '')}"></label>
      <div class="small muted" style="margin-bottom:6px">Values per 100 g (that is what the label's second column shows)</div>
      <div class="grid2">
        <label class="f"><span>Calories</span><input type="number" id="kIn" inputmode="decimal" value="${partial?.kcal || ''}"></label>
        <label class="f"><span>Protein g</span><input type="number" id="pIn" inputmode="decimal" value="${partial?.p || ''}"></label>
        <label class="f"><span>Carbs g</span><input type="number" id="cIn" inputmode="decimal" value="${partial?.c || ''}"></label>
        <label class="f"><span>Fat g</span><input type="number" id="fIn" inputmode="decimal" value="${partial?.f || ''}"></label>
      </div>
      <button class="btn wide" id="save">Save food</button>
    `, body => {
      body.querySelector('#save').onclick = () => {
        const food = {
          id: 'man_' + uid(),
          barcode: barcode || '',
          name: body.querySelector('#nIn').value.trim() || 'Custom food',
          brand: body.querySelector('#bIn').value.trim(),
          kcal: parseFloat(body.querySelector('#kIn').value) || 0,
          p: parseFloat(body.querySelector('#pIn').value) || 0,
          c: parseFloat(body.querySelector('#cIn').value) || 0,
          f: parseFloat(body.querySelector('#fIn').value) || 0,
          serving: 100, servingLabel:'100 g', source:'Saved by you'
        };
        if(!food.kcal && !food.p && !food.c && !food.f) return toast('Fill in the macros first');
        // If calories were left blank, derive them from the macros.
        if(!food.kcal) food.kcal = round(food.p*4 + food.c*4 + food.f*9, 0);
        Store.saveFood(food);
        openPortion(date, meal, food);
      };
    });
  }

  /* ---------------- preset meals ---------------- */

  function addPreset(date, i){
    const preset = PRESET_MEALS[i];
    let added = 0;
    for(const it of preset.items){
      const f = localFood(it.food);
      if(!f) continue;
      Store.addEntry(date, Nutrition.toEntry(Object.assign({ source:'Built-in' }, f), it.grams, preset.meal));
      added++;
    }
    toast(added + ' items added to ' + preset.meal);
    App.refresh();
  }

  return { render };
})();
