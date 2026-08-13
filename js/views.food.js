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
      <h1 class="page-h">Today's<br>Intake<small>${esc(prettyDate(date))} · ${Store.day(date).entries.length} items logged</small></h1>

      <div class="card">
        ${cardHead('Macros', 'search')}
        ${macroBlock(tot, tgt)}
        <div class="hr"></div>
        <div class="row wrap" style="gap:8px">
          <button class="btn grow" data-act="scan">Scan barcode</button>
          <button class="btn ghost grow" data-act="search">Search food</button>
        </div>
        <div class="sp"></div>
        <button class="btn ghost wide" data-act="eatout">Eating out — estimate a meal</button>
        ${proteinLeft > 0 ? `<div class="hint">${proteinLeft} g of protein still to go${proteinHint(proteinLeft)}</div>` : ''}
      </div>

      ${usualCard(date)}

      <div class="card">
        ${cardHead('Starting meals')}
        <div class="chips">
          ${PRESET_MEALS.map((m,i) => `<button class="chip" data-act="preset" data-i="${i}">${esc(m.name)}</button>`).join('')}
        </div>
        <div class="hint">The plan's meals. Tap one to review the items, untick anything you did not have, then log.</div>
      </div>
    `;

    for(const m of MEALS){
      const entries = Store.day(date).entries.filter(e => e.meal === m.key);
      const mt = Store.totalsByMeal(date, m.key);
      html += `
        <div class="meal-title">
          <h3>${m.label}${entries.length ? badge(entries.length) : ''}</h3>
          <span class="small muted mono">${mt.kcal} kcal · ${mt.p}g P</span>
        </div>
        <div class="card" style="padding:6px 18px 16px">
          ${entries.length ? entries.map(entryRow).join('') : `<div class="empty">Nothing logged</div>`}
          <div class="row" style="gap:7px;margin-top:6px">
            <button class="btn ghost sm grow" data-act="scan" data-meal="${m.key}">Scan</button>
            <button class="btn ghost sm grow" data-act="search" data-meal="${m.key}">Search</button>
            <button class="btn ghost sm grow" data-act="quick" data-meal="${m.key}">Recent</button>
          </div>
        </div>`;
    }

    html += `
      <div class="card">
        ${cardHead('Bodyweight')}
        <div class="row" style="gap:8px">
          <input type="number" step="0.1" id="wIn" placeholder="kg" value="${Store.day(date).weight || ''}">
          <button class="btn" data-act="saveWeight">Save</button>
        </div>
        <div class="hint">Weigh yourself first thing, after the toilet, before food. Judge trends on the weekly average, never on one day.</div>
      </div>`;

    root.innerHTML = html;
    wire(root, date);
  }

  /* "Your usual X" — learned from what has actually been logged. */
  function usualCard(date){
    const found = MEALS
      .map(m => ({ meal:m, usual:Store.usualMeal(m.key, date) }))
      .filter(x => x.usual);
    if(!found.length) return '';

    return `
      <div class="card">
        ${cardHead('Your usual')}
        <div class="chips">
          ${found.map(x => `<button class="chip" data-act="usual" data-meal="${x.meal.key}">
            ${esc(x.meal.label)} ${badge(x.usual.items.length)}</button>`).join('')}
        </div>
        <div class="hint">Learned from your own log — the foods you eat most in each meal, at your usual amounts. Tap to review and log.</div>
      </div>`;
  }

  function proteinHint(left){
    if(left >= 45) return ' — that is roughly 150 g of chicken or two scoops of whey.';
    if(left >= 20) return ' — 200 g of Greek yogurt or one scoop of whey covers it.';
    return ' — a yogurt or a glass of milk closes the gap.';
  }

  /* Serving-based entries carry servings x 100 in `grams`. */
  function amountLabel(e){
    if(e.unit !== 'serving') return round(e.grams, 0) + ' g';
    const n = round(e.grams / 100, 2);
    return n + (n === 1 ? ' serving' : ' servings');
  }

  function entryRow(e){
    return `
      <div class="item">
        <div class="grow">
          <div class="t">${esc(e.name)}</div>
          <div class="s">${amountLabel(e)}${e.brand ? ' · ' + esc(e.brand) : ''} · ${Math.round(e.kcal)} kcal · P${Math.round(e.p)} C${Math.round(e.c)} F${Math.round(e.f)}</div>
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
    on(root, 'usual',  el => addUsual(date, el.dataset.meal));
    on(root, 'eatout', el => openEatOut(date, el.dataset.meal || guessMeal()));
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
    // Ranked by how often it appears in THIS meal, then by recency —
    // your breakfast list should be breakfast foods.
    const freq = Store.frequentFoods(meal, 20);
    const recents = (freq.length ? freq : Store.frequentFoods(null, 20)).map(f => f.entry);
    const counts  = (freq.length ? freq : Store.frequentFoods(null, 20)).map(f => f.count);
    if(!recents.length) return openSearch(date, meal);
    openSheet(`
      <h2>Your foods</h2>
      <div class="hint" style="margin-top:-6px">Most logged first.</div>
      <div class="sp"></div>
      ${recents.map((e,i) => `
        <div class="item" data-i="${i}" style="cursor:pointer">
          <div class="grow">
            <div class="t">${esc(e.name)}</div>
            <div class="s">${counts[i]}× · usually ${round(e.grams,0)} g · ${Math.round(e.kcal)} kcal</div>
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
    const byServing = food.unit === 'serving';
    const start = byServing ? 1 : (food.serving && food.serving > 0 ? round(food.serving,0) : 100);
    openSheet(`
      <h2>${esc(food.name)}</h2>
      <div class="small muted" style="margin:-6px 0 12px">
        ${food.brand ? esc(food.brand) + ' · ' : ''}per ${byServing ? 'serving' : '100 g'}: ${Math.round(food.kcal)} kcal · P${food.p} C${food.c} F${food.f}
        ${food.source ? `<span class="tag">${esc(food.source)}</span>` : ''}
      </div>
      <label class="f"><span>${byServing ? 'How many servings' : 'Amount in grams'}</span>
        <input type="number" id="gIn" inputmode="decimal" step="${byServing ? '0.25' : '1'}" value="${start}">
      </label>
      <div class="chips" style="margin-bottom:12px">
        ${byServing
          ? [0.5,1,1.5,2].map(n => `<button class="chip" data-g="${n}">${n} serving${n===1?'':'s'}</button>`).join('')
          : [30,50,100,150,200,250].map(g => `<button class="chip" data-g="${g}">${g} g</button>`).join('') +
            (food.serving && food.serving !== 100 ? `<button class="chip" data-g="${round(food.serving,0)}">1 serving (${esc(food.servingLabel||'')})</button>` : '')}
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
        const grams = (parseFloat(g.value) || 0) * (byServing ? 100 : 1);
        const e = Nutrition.toEntry(food, grams, meal);
        preview.innerHTML = `<div class="row between"><b class="mono">${Math.round(e.kcal)} kcal</b>
          <span class="small mono">P ${round(e.p,1)}g · C ${round(e.c,1)}g · F ${round(e.f,1)}g</span></div>`;
      };
      g.addEventListener('input', paint); paint();
      body.querySelectorAll('.chip').forEach(c => c.onclick = () => { g.value = c.dataset.g; paint(); });
      body.querySelector('#cancel').onclick = closeSheet;
      body.querySelector('#add').onclick = () => {
        const raw = parseFloat(g.value);
        if(!raw || raw <= 0) return toast('Enter an amount');
        const grams = raw * (byServing ? 100 : 1);
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
    const byServing = e.unit === 'serving';
    openSheet(`
      <h2>${esc(e.name)}</h2>
      <label class="f"><span>${byServing ? 'How many servings' : 'Amount in grams'}</span>
        <input type="number" id="gIn" step="${byServing ? '0.25' : '1'}" value="${byServing ? round(e.grams/100,2) : round(e.grams,0)}"></label>
      <div class="row" style="gap:8px">
        <button class="btn danger" id="del">Delete</button>
        <button class="btn grow" id="save">Save</button>
      </div>
    `, body => {
      body.querySelector('#save').onclick = () => {
        const v = parseFloat(body.querySelector('#gIn').value);
        if(!v || v <= 0) return toast('Enter an amount');
        Store.updateEntry(date, id, v * (byServing ? 100 : 1));
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
      <label class="f"><span>Brand or stall (optional)</span><input type="text" id="bIn" value="${esc(partial?.brand || '')}"></label>

      <div class="small muted" style="margin-bottom:6px">These numbers are…</div>
      <div class="seg" id="basis">
        <button data-basis="serving" class="on">Per serving</button>
        <button data-basis="100">Per 100 g</button>
      </div>
      <div class="hint" id="basisHint" style="margin-top:-4px"></div>
      <div class="sp"></div>

      <div class="grid2">
        <label class="f"><span>Calories</span><input type="number" id="kIn" inputmode="decimal" value="${partial?.kcal || ''}"></label>
        <label class="f"><span>Protein g</span><input type="number" id="pIn" inputmode="decimal" value="${partial?.p || ''}"></label>
        <label class="f"><span>Carbs g</span><input type="number" id="cIn" inputmode="decimal" value="${partial?.c || ''}"></label>
        <label class="f"><span>Fat g</span><input type="number" id="fIn" inputmode="decimal" value="${partial?.f || ''}"></label>
      </div>
      <button class="btn wide" id="save">Save food</button>
    `, body => {
      // A label gives you per-100 g. A cup from a stall does not — you know
      // roughly what one of them contains, and nothing else.
      let basis = 'serving';
      const hint = body.querySelector('#basisHint');
      const paintBasis = () => {
        body.querySelectorAll('[data-basis]').forEach(b =>
          b.classList.toggle('on', b.dataset.basis === basis));
        hint.textContent = basis === 'serving'
          ? 'For one cup, bottle or scoop — the usual case when there is no label.'
          : "The label's per-100 g column. Best when you will weigh it.";
      };
      body.querySelectorAll('[data-basis]').forEach(b =>
        b.onclick = () => { basis = b.dataset.basis; paintBasis(); });
      paintBasis();

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
          unit: basis === 'serving' ? 'serving' : 'g',
          serving: 100,
          servingLabel: basis === 'serving' ? '1 serving' : '100 g',
          source: 'Saved by you'
        };
        if(!food.kcal && !food.p && !food.c && !food.f) return toast('Fill in the macros first');
        // If calories were left blank, derive them from the macros.
        if(!food.kcal) food.kcal = round(food.p*4 + food.c*4 + food.f*9, 0);
        Store.saveFood(food);
        openPortion(date, meal, food);
      };
    });
  }

  /* ---------------- eating out ----------------
     No scale, no label, and the oil is invisible. So this asks only
     what can actually be judged at a table and shows a range. */
  function openEatOut(date, meal){
    let sel = { protein:'lean', palms:1, carb:'rice', fists:1,
                sauce:'medium', veg:true, drink:'none', extras:[] };

    const opts = (obj, key, current) => Object.keys(obj).map(k =>
      `<button class="chip${current === k ? ' on' : ''}" data-set="${key}" data-val="${k}">${
        esc((obj[k].label || k).split(' — ')[0])}</button>`).join('');

    const paint = body => {
      const r = EatOut.estimate(sel);
      body.querySelector('#eoOut').innerHTML = `
        <div class="row between" style="align-items:flex-end">
          <div>
            <div class="kcal-big mono">${r.kcal.toLocaleString()}<sup>kcal</sup></div>
            <div class="small muted" style="margin-top:4px">probably ${r.low.toLocaleString()}–${r.high.toLocaleString()}</div>
          </div>
          <div class="right small mono">P ${r.p} · C ${r.c} · F ${r.f}</div>
        </div>
        <div class="ticks" style="margin-top:12px"><i style="width:${clamp(r.kcal/25, 5, 100)}%"></i></div>
        <div class="tiny muted" style="margin-top:7px">±${r.spread}% — the honest margin on a plate you did not cook.</div>`;
      body.querySelectorAll('[data-set]').forEach(b => {
        const k = b.dataset.set, v = b.dataset.val;
        const on = k === 'extras' ? sel.extras.includes(v)
                 : String(sel[k]) === v;
        b.classList.toggle('on', on);
      });
    };

    openSheet(`
      <h2>Eating out</h2>
      <div class="hint" style="margin-top:-6px">Judge it by hand: <b>1 palm</b> ≈ 110 g of cooked meat or fish, <b>1 fist</b> ≈ 150 g of rice or potato. The sauce question matters more than the rest — it is where restaurant calories hide.</div>

      <div class="card" id="eoOut" style="margin:14px 0"></div>

      <div class="small muted" style="margin-bottom:6px">Protein</div>
      <div class="chips" style="margin-bottom:10px">${opts(EatOut.PROTEIN, 'protein', sel.protein)}</div>
      <div class="chips" style="margin-bottom:16px">
        ${[0.5,1,1.5,2,3].map(n => `<button class="chip" data-set="palms" data-val="${n}">${n} palm${n===1?'':'s'}</button>`).join('')}
      </div>

      <div class="small muted" style="margin-bottom:6px">Carbs</div>
      <div class="chips" style="margin-bottom:10px">${opts(EatOut.CARB, 'carb', sel.carb)}</div>
      <div class="chips" style="margin-bottom:16px">
        ${[0.5,1,1.5,2].map(n => `<button class="chip" data-set="fists" data-val="${n}">${n} fist${n===1?'':'s'}</button>`).join('')}
      </div>

      <div class="small muted" style="margin-bottom:6px">How was it cooked?</div>
      <div class="chips" style="margin-bottom:16px">${opts(EatOut.SAUCE, 'sauce', sel.sauce)}</div>

      <div class="small muted" style="margin-bottom:6px">Drink</div>
      <div class="chips" style="margin-bottom:16px">${opts(EatOut.DRINK, 'drink', sel.drink)}</div>

      <div class="small muted" style="margin-bottom:6px">Anything else</div>
      <div class="chips" style="margin-bottom:16px">
        <button class="chip" data-set="veg" data-val="true">Vegetables</button>
        ${Object.keys(EatOut.EXTRA).map(k =>
          `<button class="chip" data-set="extras" data-val="${k}">${esc(EatOut.EXTRA[k].label.split(' or ')[0])}</button>`).join('')}
      </div>

      <label class="f"><span>Meal</span>
        <select id="eoMeal">${MEALS.map(m => `<option value="${m.key}"${m.key===meal?' selected':''}>${m.label}</option>`).join('')}</select>
      </label>
      <button class="btn wide" id="eoAdd">Log the estimate</button>
      <div class="hint">Logs the midpoint. Do not agonise over it — one restaurant meal a week is noise against your weekly total, and protein is the number that actually matters.</div>
    `, body => {
      body.querySelectorAll('[data-set]').forEach(b => {
        b.onclick = () => {
          const k = b.dataset.set, v = b.dataset.val;
          if(k === 'extras'){
            sel.extras = sel.extras.includes(v) ? sel.extras.filter(x => x !== v) : sel.extras.concat(v);
          } else if(k === 'veg'){
            sel.veg = !sel.veg;
          } else if(k === 'palms' || k === 'fists'){
            sel[k] = parseFloat(v);
          } else {
            sel[k] = v;
          }
          paint(body);
        };
      });
      paint(body);

      body.querySelector('#eoAdd').onclick = () => {
        const r = EatOut.estimate(sel);
        const mealKey = body.querySelector('#eoMeal').value;
        // Stored as a 1-portion entry so editing grams later scales it sanely.
        Store.addEntry(date, {
          name: r.label, brand:'', barcode:'', unit:'serving', grams:100,
          kcal:r.kcal, p:r.p, c:r.c, f:r.f, meal:mealKey, source:'Estimate'
        });
        closeSheet();
        toast(`Logged ~${r.kcal} kcal`);
        App.refresh();
      };
    });
  }

  /* ---------------- preset + usual meals ----------------
     Both go through the same review sheet, so a meal you did not eat
     exactly as usual — no honey today — is one tap to correct before
     anything is logged. */

  function addPreset(date, i){
    const preset = PRESET_MEALS[i];
    const items = preset.items
      .map(it => {
        const f = localFood(it.food);
        return f ? Object.assign({}, f, { grams:it.grams, source:'Built-in' }) : null;
      })
      .filter(Boolean);
    openMealReview(date, preset.meal, preset.name, items, '');
  }

  function addUsual(date, mealKey){
    const usual = Store.usualMeal(mealKey, date);
    if(!usual) return toast('Not enough history for this meal yet');
    const label = MEALS.find(m => m.key === mealKey).label;
    openMealReview(date, mealKey, 'Usual ' + label.toLowerCase(), usual.items,
                   `Built from your last ${usual.mealDays} logged ${label.toLowerCase()}s.`);
  }

  /* items are per-100g foods carrying a suggested `grams`. */
  function openMealReview(date, mealKey, title, items, subtitle){
    if(!items.length) return toast('Nothing to add');

    openSheet(`
      <h2>${esc(title)}</h2>
      <div class="hint" style="margin-top:-6px">${esc(subtitle || 'Untick anything you did not have, or change the amounts.')}</div>
      <div class="sp"></div>
      ${items.map((f, i) => `
        <div class="pickrow" data-i="${i}">
          <button class="pick on" data-act="toggle" aria-label="Include ${esc(f.name)}">✓</button>
          <div class="grow">
            <div class="t">${esc(f.name)}</div>
            <div class="s">${f.brand ? esc(f.brand) + ' · ' : ''}${f.count ? f.count + ' times · ' : ''}<span class="rowmacros"></span></div>
          </div>
          <input type="number" class="g" inputmode="decimal" value="${round(f.grams, 0)}" aria-label="grams">
        </div>`).join('')}
      <div class="hr"></div>
      <div class="row between" style="margin-bottom:14px">
        <span class="small muted">Total</span>
        <b class="mono" id="revTotal"></b>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn ghost" id="revCancel">Cancel</button>
        <button class="btn grow" id="revAdd"></button>
      </div>
    `, body => {
      const rows = [...body.querySelectorAll('.pickrow')];

      const chosen = () => rows
        .filter(r => r.querySelector('.pick').classList.contains('on'))
        .map(r => ({ food: items[+r.dataset.i], grams: parseFloat(r.querySelector('.g').value) || 0 }))
        .filter(x => x.grams > 0);

      const paint = () => {
        for(const r of rows){
          const f = items[+r.dataset.i];
          const g = parseFloat(r.querySelector('.g').value) || 0;
          const e = Nutrition.toEntry(f, g, mealKey);
          r.querySelector('.rowmacros').textContent =
            `${Math.round(e.kcal)} kcal · P${round(e.p, 1)}`;
        }
        const t = chosen().reduce((a, x) => {
          const e = Nutrition.toEntry(x.food, x.grams, mealKey);
          a.kcal += e.kcal; a.p += e.p; return a;
        }, { kcal:0, p:0 });
        body.querySelector('#revTotal').textContent =
          `${Math.round(t.kcal)} kcal · ${Math.round(t.p)} g protein`;
        body.querySelector('#revAdd').textContent =
          chosen().length ? `Add ${chosen().length} item${chosen().length > 1 ? 's' : ''}` : 'Nothing selected';
        body.querySelector('#revAdd').disabled = !chosen().length;
      };

      for(const r of rows){
        r.querySelector('[data-act="toggle"]').onclick = () => {
          r.querySelector('.pick').classList.toggle('on');
          r.classList.toggle('off', !r.querySelector('.pick').classList.contains('on'));
          paint();
        };
        r.querySelector('.g').addEventListener('input', paint);
      }
      paint();

      body.querySelector('#revCancel').onclick = closeSheet;
      body.querySelector('#revAdd').onclick = () => {
        const picked = chosen();
        if(!picked.length) return;
        for(const x of picked) Store.addEntry(date, Nutrition.toEntry(x.food, x.grams, mealKey));
        closeSheet();
        toast(picked.length + ' items added');
        App.refresh();
      };
    });
  }

  return { render };
})();
