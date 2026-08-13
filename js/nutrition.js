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

  /* ---------- local table ---------- */

  function searchLocal(q){
    const s = q.toLowerCase().trim();
    if(!s) return [];
    const pool = Store.state.customFoods.concat(
      LOCAL_FOODS.map(f => Object.assign({}, f, { serving:100, servingLabel:'100 g', source:'Built-in' })),
      SERVING_FOODS.map(f => Object.assign({}, f, { unit:'serving', serving:100,
                                                    servingLabel:'1 serving', source:'Per serving' }))
    );
    return pool
      .filter(f => (f.name + ' ' + (f.brand||'')).toLowerCase().includes(s))
      .sort((a,b) => a.name.toLowerCase().indexOf(s) - b.name.toLowerCase().indexOf(s))
      .slice(0, 25);
  }

  /* ---------- combined search ---------- */

  async function search(q){
    const local = searchLocal(q);
    let remote = [];
    try{
      const [usda, off] = await Promise.all([
        searchUSDA(q).catch(() => []),
        searchOFF(q).catch(() => [])
      ]);
      remote = usda.concat(off);
    }catch(e){ /* offline: local results are still fine */ }

    // De-duplicate by name+brand, local first (it is the trusted table).
    const seen = new Set(), out = [];
    for(const f of local.concat(remote)){
      const k = (f.name + '|' + (f.brand||'')).toLowerCase();
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

  return { byBarcode, search, searchLocal, toEntry, fromOFF };
})();
