/* ------------------------------------------------------------------
   nutrition.js — food data lookup.

   Barcodes  -> Open Food Facts (free, no key, ~3M products worldwide).
   Text      -> local table first (instant, works offline, and it is more
                accurate than crowd-sourced entries for raw foods),
                then USDA FoodData Central if a key is set, then OFF.

   Every source is normalised to the same shape:
     { id, name, brand, kcal, p, c, f, serving, servingLabel, barcode, source }
   where kcal/p/c/f are ALWAYS per 100 g.
------------------------------------------------------------------- */

const Nutrition = (() => {

  const OFF_PRODUCT = 'https://world.openfoodfacts.org/api/v2/product/';
  const OFF_SEARCH  = 'https://world.openfoodfacts.org/cgi/search.pl';
  const USDA_SEARCH = 'https://api.nal.usda.gov/fdc/v1/foods/search';
  const FIELDS = 'code,product_name,brands,serving_size,serving_quantity,nutriments,image_small_url,quantity';

  function num(v){ const n = parseFloat(v); return isFinite(n) ? n : 0; }

  /* ---------- Open Food Facts ---------- */

  function fromOFF(p){
    const n = p.nutriments || {};
    // OFF gives energy-kcal_100g when it has it; otherwise convert kJ.
    let kcal = num(n['energy-kcal_100g']);
    if(!kcal && n['energy_100g']) kcal = num(n['energy_100g']) / 4.184;
    const food = {
      id: 'off_' + p.code,
      barcode: p.code,
      name: (p.product_name || '').trim() || 'Unnamed product',
      brand: (p.brands || '').split(',')[0].trim(),
      kcal: round(kcal, 1),
      p: round(num(n.proteins_100g), 1),
      c: round(num(n.carbohydrates_100g), 1),
      f: round(num(n.fat_100g), 1),
      fibre: round(num(n.fiber_100g), 1),
      sugar: round(num(n.sugars_100g), 1),
      salt: round(num(n.salt_100g), 2),
      serving: num(p.serving_quantity) || 100,
      servingLabel: p.serving_size || '100 g',
      image: p.image_small_url || '',
      source: 'Open Food Facts'
    };
    return food;
  }

  // A product with no macros at all is useless — flag it so the UI can
  // send the user to manual entry instead of logging zeros.
  function isUsable(f){ return f && (f.kcal > 0 || f.p > 0 || f.c > 0 || f.f > 0); }

  async function byBarcode(code){
    code = String(code).replace(/\D/g,'');
    if(!code) throw new Error('Empty barcode');

    const cached = Store.foodByBarcode(code);
    if(cached) return Object.assign({}, cached, { cached:true });

    const url = OFF_PRODUCT + encodeURIComponent(code) + '.json?fields=' + FIELDS;
    const res = await fetchJSON(url);
    if(!res || res.status === 0 || !res.product) {
      const err = new Error('No product found for ' + code);
      err.code = 'NOT_FOUND';
      err.barcode = code;
      throw err;
    }
    const food = fromOFF(res.product);
    if(!isUsable(food)){
      const err = new Error('That product exists but has no nutrition data on file');
      err.code = 'NO_DATA';
      err.barcode = code;
      err.partial = food;
      throw err;
    }
    Store.saveFood(food);
    return food;
  }

  async function searchOFF(q){
    const url = OFF_SEARCH + '?search_terms=' + encodeURIComponent(q) +
                '&search_simple=1&action=process&json=1&page_size=20&fields=' + FIELDS;
    const res = await fetchJSON(url);
    return (res.products || []).map(fromOFF).filter(isUsable);
  }

  /* ---------- USDA FoodData Central (optional, better for raw foods) ---------- */

  function fromUSDA(item){
    const get = id => {
      const n = (item.foodNutrients || []).find(x => x.nutrientId === id || x.nutrientNumber === String(id));
      return n ? num(n.value) : 0;
    };
    return {
      id: 'usda_' + item.fdcId,
      barcode: item.gtinUpc || '',
      name: (item.description || '').toLowerCase().replace(/\b\w/g, m => m.toUpperCase()),
      brand: item.brandOwner || 'USDA',
      kcal: round(get(1008), 1),
      p:    round(get(1003), 1),
      c:    round(get(1005), 1),
      f:    round(get(1004), 1),
      serving: 100,
      servingLabel: '100 g',
      source: 'USDA'
    };
  }

  async function searchUSDA(q){
    const key = Store.state.settings.usdaKey;
    if(!key) return [];
    const url = USDA_SEARCH + '?api_key=' + encodeURIComponent(key) +
                '&query=' + encodeURIComponent(q) + '&pageSize=15&dataType=Foundation,SR%20Legacy,Branded';
    const res = await fetchJSON(url);
    return (res.foods || []).map(fromUSDA).filter(isUsable);
  }

  /* ---------- matching ----------
     Substring matching fails the common case: you remember the brand and
     roughly what the thing was, in whatever order it comes to you.
     "rokeby protein" has to find "Protein Drink" by "Rokeby Farms", and
     a plain includes() never will. So the query is split into tokens and
     each one is looked for anywhere in the name or the brand. */

  function tokenize(q){
    return String(q || '')
      .toLowerCase()
      .replace(/[^a-z0-9%\s.]/g, ' ')   // punctuation is noise in food names
      .split(/\s+/)
      .filter(t => t.length > 0);
  }

  /* 0 means no match at all. Higher is a better match. */
  function score(food, tokens){
    if(!tokens.length) return 0;
    const name  = (food.name  || '').toLowerCase();
    const brand = (food.brand || '').toLowerCase();
    const hay   = name + ' ' + brand;

    let matched = 0, inName = 0;
    for(const t of tokens){
      if(hay.includes(t)){
        matched++;
        if(name.includes(t)) inName++;
      }
    }
    if(!matched) return 0;

    // How much of what you typed was found dominates everything else.
    let s = (matched / tokens.length) * 100;
    s += inName * 6;                                  // name beats brand-only
    if(name.startsWith(tokens[0])) s += 12;           // leading match reads as "the" result
    if(food.serving && food.serving !== 100) s += 6;  // a real serving size is useful
    if(TRUSTED.has(food.source)) s += 8;              // your own and built-in entries first
    s -= Math.min(name.length / 12, 6);               // prefer the concise name of two
    return round(s, 2);
  }

  const TRUSTED = new Set(['Saved by you', 'Built-in', 'Per serving', 'Your usual']);

  /* A score of 100 means every word was found. The loose pass needs at
     least half of them — one word out of three is noise, not a match:
     "zzzq nonexistent drink" should not return every drink in the table. */
  function rank(foods, tokens, { partial = false, min } = {}){
    const floor = min != null ? min : (partial ? 50 : 100);
    return foods
      .map(f => ({ f, s: score(f, tokens) }))
      .filter(x => x.s >= floor)
      .sort((a, b) => b.s - a.s)
      .map(x => x.f);
  }

  /* ---------- local table ---------- */

  function localPool(){
    return Store.state.customFoods.concat(
      LOCAL_FOODS.map(f => Object.assign({}, f, { serving:100, servingLabel:'100 g', source:'Built-in' })),
      SERVING_FOODS.map(f => Object.assign({}, f, { unit:'serving', serving:100,
                                                    servingLabel:'1 serving', source:'Per serving' }))
    );
  }

  function searchLocal(q){
    const tokens = tokenize(q);
    if(!tokens.length) return [];
    // Strict first; if nothing matches every word, loosen rather than
    // showing an empty list.
    const strict = rank(localPool(), tokens);
    return (strict.length ? strict : rank(localPool(), tokens, { partial:true })).slice(0, 25);
  }

  /* ---------- combined search ---------- */

  async function search(q){
    const tokens = tokenize(q);
    if(!tokens.length) return [];

    const local = searchLocal(q);
    let remote = [];
    try{
      const [usda, off] = await Promise.all([
        searchUSDA(q).catch(() => []),
        searchOFF(q).catch(() => [])
      ]);
      remote = usda.concat(off);
    }catch(e){ /* offline: local results are still fine */ }

    // Remote results keep partial matches — the database's own relevance
    // is worth something — but they rank below anything matching in full.
    const ranked = rank(remote, tokens, { partial:true });

    const seen = new Set(), out = [];
    for(const f of local.concat(ranked)){
      const k = (f.name + '|' + (f.brand || '')).toLowerCase();
      if(seen.has(k)) continue;
      seen.add(k); out.push(f);
    }
    return out.slice(0, 40);
  }

  /* ---------- scaling ---------- */

  // Turn a per-100g food + a gram amount into a loggable entry.
  // `grams` is the amount in grams, except for serving-based foods where
  // it carries servings x 100 so the per-100 maths stays identical.
  function toEntry(food, grams, meal){
    const r = grams / 100;
    return {
      name: food.name,
      brand: food.brand || '',
      barcode: food.barcode || '',
      unit: food.unit || 'g',
      grams: round(grams, 1),
      kcal: round(food.kcal * r, 1),
      p:    round(food.p * r, 1),
      c:    round(food.c * r, 1),
      f:    round(food.f * r, 1),
      meal: meal,
      source: food.source || ''
    };
  }

  async function fetchJSON(url){
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try{
      const r = await fetch(url, { signal:ctrl.signal, headers:{ 'Accept':'application/json' } });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  return { byBarcode, search, searchLocal, toEntry, fromOFF, tokenize, score, rank };
})();

if(typeof module !== 'undefined' && module.exports) module.exports = Nutrition;
