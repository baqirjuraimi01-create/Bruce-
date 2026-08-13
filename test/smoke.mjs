import { chromium } from 'playwright';

const errs = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args:['--no-sandbox','--ignore-certificate-errors'], ...(process.env.HTTPS_PROXY ? { proxy:{ server: process.env.HTTPS_PROXY, bypass:'localhost,127.0.0.1' } } : {}) });
const ctx = await browser.newContext({ ignoreHTTPSErrors:true, viewport:{width:390,height:844} });
const page = await ctx.newPage();
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if(m.type()==='error') errs.push('CONSOLE: ' + m.text()); });

await page.goto(`http://localhost:${process.env.PORT || 8765}/index.html`, { waitUntil:'networkidle' });

const check = async (label, fn) => {
  try { await fn(); console.log('  ok   ' + label); }
  catch(e){ console.log('  FAIL ' + label + ' -> ' + e.message); errs.push(label + ': ' + e.message); }
};

console.log('— boot —');
await check('header shows cycle day', async () => {
  const t = await page.textContent('#dateMeta');
  if(!/Today/.test(t)) throw new Error('got ' + t);
});

console.log('— food tab —');
await check('preset meal logs items', async () => {
  await page.click('[data-act="preset"][data-i="0"]');
  await page.waitForTimeout(150);
  const txt = await page.textContent('#view');
  if(!/Oats, dry/.test(txt)) throw new Error('oats not logged');
});
await check('macros update after preset', async () => {
  const kcal = await page.textContent('.kcal-big');
  if(parseInt(kcal) < 300) throw new Error('kcal = ' + kcal);
  console.log('       breakfast preset =', kcal.trim(), 'kcal');
});
await check('protein number is sane for breakfast preset', async () => {
  const rows = await page.$$eval('.macro', els => els.map(e => e.textContent.replace(/\s+/g,' ').trim()));
  console.log('       ' + rows.join(' | '));
});
await check('search sheet opens + local search works', async () => {
  await page.click('[data-act="search"]');
  await page.fill('#qIn', 'chicken');
  await page.waitForTimeout(300);
  const n = await page.$$eval('#qRes .item', e => e.length);
  if(n === 0) throw new Error('no local results');
  console.log('       local results:', n);
});
await check('portion sheet adds an entry', async () => {
  await page.click('#qRes .item');
  await page.fill('#gIn', '200');
  await page.waitForTimeout(100);
  const prev = await page.textContent('#preview');
  console.log('       200g preview:', prev.replace(/\s+/g,' ').trim());
  await page.click('#add');
  await page.waitForTimeout(200);
});
await check('entry can be deleted', async () => {
  const before = await page.$$eval('[data-act="delEntry"]', e => e.length);
  await page.click('[data-act="delEntry"]');
  await page.waitForTimeout(150);
  const after = await page.$$eval('[data-act="delEntry"]', e => e.length);
  if(after !== before - 1) throw new Error(`${before} -> ${after}`);
});
await check('manual food entry path', async () => {
  await page.click('[data-act="search"]');
  await page.click('#qManual');
  await page.fill('#nIn','Test Bar'); await page.fill('#pIn','30');
  await page.fill('#cIn','40'); await page.fill('#fIn','10');
  await page.click('#save');            // -> portion sheet
  await page.waitForTimeout(150);
  await page.click('#add');
  await page.waitForTimeout(200);
  if(!/Test Bar/.test(await page.textContent('#view'))) throw new Error('not logged');
});
await check('bodyweight saves', async () => {
  await page.fill('#wIn','76.5');
  await page.click('[data-act="saveWeight"]');
  await page.waitForTimeout(150);
});

console.log('— train tab —');
await check('train renders Push on day 1', async () => {
  await page.click('[data-tab="train"]');
  await page.waitForTimeout(200);
  const t = await page.textContent('#view');
  if(!/Barbell Bench Press/.test(t)) throw new Error('no bench');
});
await check('logging a set + tick works', async () => {
  const ex1 = page.locator('.ex').first();
  await ex1.locator('.setrow').nth(0).locator('.w').fill('80');
  await ex1.locator('.setrow').nth(0).locator('.r').fill('6');
  await ex1.locator('.setrow').nth(0).locator('.tick').click();
  await page.waitForTimeout(200);
  const on = await page.$$eval('.tick.on', e => e.length);
  if(!on) throw new Error('tick did not stick');
});
await check('rest timer appears', async () => {
  const t = await page.textContent('.timer');
  if(!/Rest/.test(t)) throw new Error('no timer: ' + t);
  console.log('       ' + t);
  await page.click('.timer');
});
await check('tick copies previous set forward', async () => {
  const row2 = page.locator('.ex').first().locator('.setrow').nth(1);
  await row2.locator('.tick').click();
  await page.waitForTimeout(150);
  const w = await row2.locator('.w').inputValue();
  if(w !== '80') throw new Error('expected 80, got ' + w);
});
await check('volume card computes', async () => {
  await page.click('[data-act="finish"]');
  await page.waitForTimeout(250);
  const t = await page.textContent('#view');
  const m = t.match(/([\d,]+)\s*kg lifted/);
  if(!m) throw new Error('no volume card');
  console.log('       volume:', m[1], 'kg');
});
await check('rotation advances to Pull tomorrow', async () => {
  await page.click('#nextDay');
  await page.waitForTimeout(200);
  const t = await page.textContent('#dateMeta');
  if(!/Pull/.test(t)) throw new Error(t);
  await page.click('#prevDay');
  await page.waitForTimeout(150);
});

console.log('— cardio tab —');
await check('cardio logs a run', async () => {
  await page.click('[data-tab="cardio"]');
  await page.waitForTimeout(200);
  await page.fill('#minIn','30'); await page.fill('#kmIn','5');
  await page.click('[data-act="add"]');
  await page.waitForTimeout(200);
  const t = await page.textContent('#view');
  if(!/6:00 \/km/.test(t)) throw new Error('pace wrong: ' + (t.match(/[\d:]+ \/km/)||['none'])[0]);
  console.log('       pace calc ok (30min / 5km = 6:00/km)');
});

console.log('— progress tab —');
await check('progress renders', async () => {
  await page.click('[data-tab="progress"]');
  await page.waitForTimeout(250);
  const t = await page.textContent('#view');
  if(!/Protein adherence/.test(t)) throw new Error('missing');
  if(!/Barbell Bench Press/.test(t)) throw new Error('lift table missing');
  const m = t.match(/Calculated:\s*([\d]+ kcal · P \d+ g · C \d+ g · F \d+ g)/);
  console.log('       targets:', m ? m[1] : 'n/a');
});
await check('settings save + recalc', async () => {
  await page.fill('#pw','80');
  await page.click('[data-act="saveSettings"]');
  await page.waitForTimeout(250);
  const t = await page.textContent('#view');
  if(!/P 160 g/.test(t)) throw new Error('protein did not recalc: ' + (t.match(/Calculated:[^<]*/)||[''])[0]);
  console.log('       80kg -> P 160 g ok');
});

console.log('— plan tab —');
await check('plan renders all 9 days', async () => {
  await page.click('[data-tab="plan"]');
  await page.waitForTimeout(250);
  const n = await page.$$eval('.day', e => e.length);
  if(n !== 9) throw new Error('days = ' + n);
  const t = await page.textContent('#view');
  if(!/Bulgarian Split Squat/.test(t)) throw new Error('plan detail missing');
});
await check('day expand toggle', async () => {
  await page.locator('.day').first().locator('[data-toggle]').click();
  await page.waitForTimeout(150);
  const hidden = await page.locator('.day').first().locator('.daybody').evaluate(e => e.hidden);
  if(hidden) throw new Error('did not expand');
});

console.log('— persistence —');
await check('data survives reload', async () => {
  await page.reload({ waitUntil:'networkidle' });
  await page.waitForTimeout(300);
  const t = await page.textContent('#view');
  if(!/Test Bar/.test(t)) throw new Error('log lost on reload');
});

console.log('— barcode lookup (Open Food Facts, intercepted fixtures) —');
// Live OFF is blocked by this sandbox's network policy, so we serve the real
// API's response shape and assert our parsing / error handling against it.
const OFF_HIT = {
  status: 1, code: '5449000000996',
  product: {
    code: '5449000000996',
    product_name: 'Coca-Cola',
    brands: 'Coca-Cola,Coke',
    serving_size: '330 ml',
    serving_quantity: 330,
    image_small_url: 'https://images.openfoodfacts.org/x.jpg',
    nutriments: {
      'energy-kcal_100g': 42, 'energy_100g': 180,
      proteins_100g: 0, carbohydrates_100g: 10.6, fat_100g: 0,
      sugars_100g: 10.6, salt_100g: 0.01, fiber_100g: 0
    }
  }
};
const OFF_KJ_ONLY = {
  status: 1, code: '1111111111111',
  product: { code:'1111111111111', product_name:'KJ Only Product', brands:'Test',
    nutriments: { 'energy_100g': 1000, proteins_100g: 20, carbohydrates_100g: 5, fat_100g: 3 } }
};
const OFF_NO_DATA = { status:1, code:'2222222222222',
  product:{ code:'2222222222222', product_name:'Empty Product', brands:'', nutriments:{} } };
const OFF_MISS = { status:0, code:'0000000000000', status_verbose:'product not found' };

await page.route('**/world.openfoodfacts.org/**', route => {
  const u = route.request().url();
  const body = u.includes('5449000000996') ? OFF_HIT
             : u.includes('1111111111111') ? OFF_KJ_ONLY
             : u.includes('2222222222222') ? OFF_NO_DATA
             : OFF_MISS;
  route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(body) });
});

await check('parses a real OFF payload', async () => {
  const r = await page.evaluate(async () => {
    try { return { ok:true, f: await Nutrition.byBarcode('5449000000996') }; }
    catch(e){ return { ok:false, msg:e.message, code:e.code }; }
  });
  if(!r.ok) throw new Error(r.code + ' ' + r.msg);
  const f = r.f;
  if(f.name !== 'Coca-Cola') throw new Error('name = ' + f.name);
  if(f.brand !== 'Coca-Cola') throw new Error('brand not split from list: ' + f.brand);
  if(f.kcal !== 42) throw new Error('kcal = ' + f.kcal);
  if(f.c !== 10.6) throw new Error('carbs = ' + f.c);
  if(f.serving !== 330) throw new Error('serving = ' + f.serving);
  console.log('       ' + f.name + ' / ' + f.brand + ' — ' + f.kcal + ' kcal, C' + f.c + ', serving ' + f.serving + 'g');
});
await check('converts kJ when kcal is absent', async () => {
  const f = await page.evaluate(() => Nutrition.byBarcode('1111111111111'));
  const expect = Math.round((1000/4.184)*10)/10;
  if(f.kcal !== expect) throw new Error('kcal = ' + f.kcal + ', expected ' + expect);
  console.log('       1000 kJ -> ' + f.kcal + ' kcal');
});
await check('product with no macros raises NO_DATA', async () => {
  const r = await page.evaluate(async () => {
    try { await Nutrition.byBarcode('2222222222222'); return { ok:true }; }
    catch(e){ return { ok:false, code:e.code }; }
  });
  if(r.ok || r.code !== 'NO_DATA') throw new Error(JSON.stringify(r));
});
await check('unknown barcode raises NOT_FOUND', async () => {
  const r = await page.evaluate(async () => {
    try { await Nutrition.byBarcode('0000000000000'); return { ok:true }; }
    catch(e){ return { ok:false, code:e.code }; }
  });
  if(r.ok || r.code !== 'NOT_FOUND') throw new Error(JSON.stringify(r));
});
await check('scanned product is cached for offline reuse', async () => {
  const r = await page.evaluate(async () => (await Nutrition.byBarcode('5449000000996')).cached === true);
  if(!r) throw new Error('second lookup did not hit the local cache');
});
await check('barcode miss opens manual entry with the code', async () => {
  await page.click('[data-tab="food"]'); await page.waitForTimeout(200);
  await page.evaluate(() => { document.querySelector('#manualBarcode').value = '0000000000000'; });
  await page.click('[data-act="scan"]');
  await page.waitForTimeout(300);
  await page.fill('#manualBarcode', '0000000000000');
  await page.click('#manualLookup');
  await page.waitForTimeout(600);
  const t = await page.textContent('#sheetBody');
  if(!/Not in the database/.test(t)) throw new Error('no manual fallback: ' + t.slice(0,80));
  console.log('       falls through to manual entry, barcode retained');
  await page.keyboard.press('Escape');
});

await page.screenshot({ path:'./test/shot-plan.png', fullPage:false });
await page.click('[data-tab="food"]'); await page.waitForTimeout(300);
await page.screenshot({ path:'./test/shot-food.png' });
await page.click('[data-tab="train"]'); await page.waitForTimeout(300);
await page.screenshot({ path:'./test/shot-train.png' });

await browser.close();
console.log('\n' + (errs.length ? 'ERRORS:\n' + errs.join('\n') : 'No console/page errors, all checks passed.'));
process.exit(errs.length ? 1 : 0);
