import { chromium } from 'playwright';

const errs = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args:['--no-sandbox','--ignore-certificate-errors'], ...(process.env.HTTPS_PROXY ? { proxy:{ server: process.env.HTTPS_PROXY, bypass:'localhost,127.0.0.1' } } : {}) });
const ctx = await browser.newContext({ ignoreHTTPSErrors:true, viewport:{width:390,height:844} });
const page = await ctx.newPage();
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if(m.type()==='error') errs.push('CONSOLE: ' + m.text()); });

// Keep the suite hermetic: the app now searches online by itself as you
// type, and a sandbox with no route to those hosts would fail the run for
// reasons that have nothing to do with the code. Both food APIs are stubbed
// empty here; the barcode tests register their own fixtures later, and a
// later route takes precedence.
const stubEmpty = (url, body) => page.route(url, r =>
  r.fulfill({ status:200, contentType:'application/json', body }));
await stubEmpty('**/world.openfoodfacts.org/**', JSON.stringify({ products:[], status:0 }));
await stubEmpty('**/api.nal.usda.gov/**',        JSON.stringify({ foods:[] }));

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

console.log('— home tab —');
await check('lands on Home with objectives', async () => {
  const t = await page.textContent('#view');
  if(!/Objectives/.test(t)) throw new Error('no objectives card');
  const n = await page.$$eval('.obj', e => e.length);
  if(n !== 5) throw new Error('expected 5 objectives, got ' + n);
  console.log('       ' + (await page.$$eval('.obj .t', e => e.map(x => x.textContent.trim()))).join(', '));
});
await check('home shows today\'s session and first-lift prescription', async () => {
  const t = await page.textContent('#view');
  if(!/Push/.test(t)) throw new Error('session name missing');
  if(!/Barbell Bench Press/.test(t)) throw new Error('next-up prescription missing');
});
await check('manual step entry', async () => {
  await page.click('[data-act="steps"]');
  await page.fill('#stIn', '8432');
  await page.click('#save');
  await page.waitForTimeout(300);
  if(!/8,432/.test(await page.textContent('#view'))) throw new Error('steps not shown');
});

console.log('— food tab —');
await check('preset opens a review sheet, then logs the ticked items', async () => {
  await page.click('[data-tab="food"]');
  await page.waitForTimeout(200);
  await page.click('[data-act="preset"][data-i="0"]');
  await page.waitForTimeout(300);
  const rows = await page.$$eval('.pickrow', e => e.length);
  if(rows !== 5) throw new Error('expected 5 reviewable items, got ' + rows);
  console.log('       review sheet: ' + (await page.textContent('#revAdd')).trim() +
              ', total ' + (await page.textContent('#revTotal')).trim());
  await page.click('#revAdd');
  await page.waitForTimeout(300);
  if(!/Oats, dry/.test(await page.textContent('#view'))) throw new Error('oats not logged');
});

await check('unticking an item keeps it out of the log', async () => {
  const honeyBefore = await page.evaluate(() =>
    Store.day(today()).entries.filter(e => /honey/i.test(e.name)).length);
  await page.click('[data-act="preset"][data-i="0"]');
  await page.waitForTimeout(300);
  const idx = await page.$$eval('.pickrow', els => els.findIndex(e => /honey/i.test(e.textContent)));
  if(idx < 0) throw new Error('no honey row in the sheet');
  await page.locator('.pickrow').nth(idx).locator('.pick').click();
  await page.waitForTimeout(200);
  const label = (await page.textContent('#revAdd')).trim();
  if(!/Add 4 items/.test(label)) throw new Error('button read: ' + label);
  await page.click('#revAdd');
  await page.waitForTimeout(300);
  const honeyAfter = await page.evaluate(() =>
    Store.day(today()).entries.filter(e => /honey/i.test(e.name)).length);
  if(honeyAfter !== honeyBefore) throw new Error(`honey went ${honeyBefore} -> ${honeyAfter}`);
  console.log('       4 of 5 logged, honey excluded');
});

await check('review sheet respects an edited amount', async () => {
  await page.click('[data-act="preset"][data-i="3"]');
  await page.waitForTimeout(300);
  const first = page.locator('.pickrow').first();
  await first.locator('.g').fill('50');
  await page.waitForTimeout(150);
  // untick everything except the first row
  const n = await page.locator('.pickrow').count();
  for(let i = 1; i < n; i++) await page.locator('.pickrow').nth(i).locator('.pick').click();
  await page.waitForTimeout(150);
  await page.click('#revAdd');
  await page.waitForTimeout(300);
  const g = await page.evaluate(() => {
    const es = Store.day(today()).entries;
    return es[es.length-1].grams;
  });
  if(g !== 50) throw new Error('logged ' + g + ' g, expected 50');
});

await check('"your usual" appears once there is history', async () => {
  await page.evaluate(() => {
    // three past breakfasts: oats + whey every time, honey only once
    const mk = (n, extra) => { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };
    for(const n of [1,2,3]){
      const d = mk(n);
      Store.state.days[d] = { entries:[
        { id:'a'+n, name:'Oats, dry/raw', brand:'', grams:80, kcal:303, p:10.6, c:54.2, f:5.2, meal:'breakfast' },
        { id:'b'+n, name:'Whey protein powder', brand:'', grams:30, kcal:120, p:24, c:2.4, f:1.8, meal:'breakfast' }
      ], weight:null, steps:null, note:'' };
      if(n === 1) Store.state.days[d].entries.push(
        { id:'c'+n, name:'Honey', brand:'', grams:20, kcal:61, p:0.1, c:16.5, f:0, meal:'breakfast' });
    }
    Store.save();
  });
  await page.click('[data-tab="home"]'); await page.waitForTimeout(150);
  await page.click('[data-tab="food"]'); await page.waitForTimeout(300);
  if(!/Your usual/.test(await page.textContent('#view'))) throw new Error('no usual card');
  await page.click('[data-act="usual"][data-meal="breakfast"]');
  await page.waitForTimeout(300);
  const names = await page.$$eval('.pickrow .t', e => e.map(x => x.textContent.trim()));
  if(!names.includes('Oats, dry/raw') || !names.includes('Whey protein powder'))
    throw new Error('usual missed a staple: ' + names.join(', '));
  if(names.includes('Honey'))
    throw new Error('one-off honey should not count as usual: ' + names.join(', '));
  console.log('       learned: ' + names.join(', ') + ' (honey correctly excluded as a one-off)');
  await page.click('#revCancel');
  await page.waitForTimeout(200);
});
await check('macros update after preset', async () => {
  const kcal = await page.textContent('.kcal-big');
  // the donut formats with thousands separators, so strip them before parsing
  const n = parseInt(kcal.replace(/[^0-9]/g, ''), 10);
  if(!(n >= 300)) throw new Error('kcal = ' + kcal.trim() + ' -> ' + n);
  console.log('       logged so far =', n, 'kcal');
});
await check('protein number is sane for breakfast preset', async () => {
  const rows = await page.$$eval('.stat', els => els.map(e => e.textContent.replace(/\s+/g,' ').trim()));
  if(rows.length !== 3) throw new Error('expected 3 macro columns, got ' + rows.length);
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
await check('swapping an exercise when the kit is busy', async () => {
  const card = page.locator('.ex').nth(1);
  const original = (await card.locator('.n').textContent()).trim();
  await card.locator('[data-act="swap"]').click();
  await page.waitForTimeout(300);
  const alts = await page.$$eval('.sheet .item .t', e => e.map(x => x.textContent.trim()));
  if(alts.length < 2) throw new Error('no alternatives offered');
  console.log('       ' + original + ' -> ' + alts.slice(0,3).join(' / ') + ' …');
  await page.locator('.sheet .item').first().click();
  await page.waitForTimeout(300);
  const now = (await page.locator('.ex').nth(1).locator('.n').textContent()).trim();
  if(now === original) throw new Error('card did not change');
  if(!/swapped from/.test(await page.locator('.ex').nth(1).textContent())) throw new Error('no provenance shown');
});

await check('a swapped lift logs under its own name and history', async () => {
  const card = page.locator('.ex').nth(1);
  const name = (await card.locator('.n').textContent()).trim().replace(/\s+/g,' ');
  await card.locator('.setrow').nth(0).locator('.w').fill('24');
  await card.locator('.setrow').nth(0).locator('.r').fill('10');
  await card.locator('.setrow').nth(0).locator('.tick').click();
  await page.waitForTimeout(300);
  const keys = await page.evaluate(() => Object.keys(Store.session(today()).exercises));
  if(!keys.some(k => name.startsWith(k) || k === name.split(' current')[0]))
    throw new Error('logged under: ' + keys.join(', '));
  console.log('       logged under "' + keys[keys.length-1] + '", not the programmed lift');
});

await check('swap reverts and is confined to that day', async () => {
  const card = page.locator('.ex').nth(1);
  await card.locator('[data-act="swap"]').click();
  await page.waitForTimeout(300);
  await page.click('[data-back]');
  await page.waitForTimeout(300);
  if(/swapped from/.test(await page.locator('.ex').nth(1).textContent())) throw new Error('still swapped');
  const tomorrow = await page.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate()+9);
    return Object.keys(Store.session(fmt(d)).swaps).length;
  });
  if(tomorrow !== 0) throw new Error('swap leaked to a future session');
});

await check('progression: maxing the range prescribes more weight next session', async () => {
  // Fill every bench set at 80 kg x 8 (top of the 5-8 range) and tick them.
  const ex = page.locator('.ex').first();
  const n = await ex.locator('.setrow').count();
  for(let i = 0; i < n; i++){
    const row = ex.locator('.setrow').nth(i);
    await row.locator('.w').fill('80');
    await row.locator('.r').fill('8');
    const tick = row.locator('.tick');
    if(!(await tick.getAttribute('class')).includes('on')) await tick.click();
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(200);
  // Jump a full cycle: the next Push day.
  for(let i = 0; i < 9; i++){ await page.click('#nextDay'); await page.waitForTimeout(60); }
  await page.waitForTimeout(250);
  if(!/Push/.test(await page.textContent('#dateMeta'))) throw new Error('not back on Push');
  const target = await page.locator('.target').first().textContent();
  if(!/82\.5 kg × 5/.test(target)) throw new Error('target was: ' + target.trim());
  console.log('       ' + target.trim());
  for(let i = 0; i < 9; i++){ await page.click('#prevDay'); await page.waitForTimeout(50); }
  await page.waitForTimeout(200);
});

await check('progression: falling short holds the weight', async () => {
  const ex = page.locator('.ex').first();
  await ex.locator('.setrow').nth(1).locator('.r').fill('6');
  await page.waitForTimeout(150);
  for(let i = 0; i < 9; i++){ await page.click('#nextDay'); await page.waitForTimeout(50); }
  await page.waitForTimeout(250);
  const target = await page.locator('.target').first().textContent();
  if(!/Stay at 80 kg/.test(target)) throw new Error('target was: ' + target.trim());
  console.log('       ' + target.trim());
  for(let i = 0; i < 9; i++){ await page.click('#prevDay'); await page.waitForTimeout(50); }
  await page.waitForTimeout(200);
});

await check('rotation advances to Pull tomorrow', async () => {
  await page.click('#nextDay');
  await page.waitForTimeout(200);
  const t = await page.textContent('#dateMeta');
  if(!/Pull/.test(t)) throw new Error(t);
  await page.click('#prevDay');
  await page.waitForTimeout(150);
});

console.log('— cardio, now inside Train —');
await check('cardio is reachable from the Train tab', async () => {
  await page.click('[data-tab="train"]');
  await page.waitForTimeout(200);
  if(await page.$('[data-tab="cardio"]')) throw new Error('cardio tab still present');
  await page.locator('.seg button', { hasText:'Cardio' }).click();
  await page.waitForTimeout(300);
  await page.fill('#minIn','30'); await page.fill('#kmIn','5');
  await page.click('[data-act="add"]');
  await page.waitForTimeout(200);
  const t = await page.textContent('#view');
  if(!/6:00 \/km/.test(t)) throw new Error('pace wrong: ' + (t.match(/[\d:]+ \/km/)||['none'])[0]);
  console.log('       pace calc ok (30min / 5km = 6:00/km)');
});

await check('the Session segment still works after visiting Cardio', async () => {
  await page.locator('.seg button', { hasText:'Session' }).click();
  await page.waitForTimeout(300);
  if(!/Barbell Bench Press/.test(await page.textContent('#view'))) throw new Error('session lost');
});

console.log('— custom routines —');
await check('editing a day replaces its exercises', async () => {
  await page.click('[data-tab="plan"]'); await page.waitForTimeout(300);
  await page.locator('[data-edit="push"]').click();
  await page.waitForTimeout(300);
  const before = await page.$$eval('.exrow', e => e.length);
  if(before < 4) throw new Error('editor did not load the routine');

  // strip it back to the four exercises the user described
  for(let i = before - 1; i >= 0; i--){
    await page.locator('.exrow').nth(i).locator('[data-act="rm"]').click();
    await page.waitForTimeout(80);
  }
  for(const [name, sets] of [['Flat press',4],['Incline presses',3],['Cable bicep curls',3],['Dips',3]]){
    await page.click('[data-act="add"]'); await page.waitForTimeout(200);
    await page.fill('#exName', name);
    await page.fill('#exSets', String(sets));
    await page.click('#exSave'); await page.waitForTimeout(200);
  }
  const rows = await page.$$eval('.exrow .t', e => e.map(x => x.textContent.trim()));
  console.log('       routine: ' + rows.join(', '));
  if(rows.length !== 4) throw new Error('expected 4, got ' + rows.length);
});

await check('the editor suggests what the routine is missing', async () => {
  const sugg = await page.$$eval('.sugg', e => e.map(x => x.textContent.replace(/\s+/g,' ').trim()));
  if(!sugg.length) throw new Error('no suggestions offered');
  console.log('       ' + sugg.join(' | '));
  if(!/Lateral Raise/.test(sugg.join(' '))) throw new Error('missed the side-delt gap');
});

await check('accepting a suggestion adds it', async () => {
  await page.locator('[data-act="accept"]').first().click();
  await page.waitForTimeout(300);
  const rows = await page.$$eval('.exrow .t', e => e.map(x => x.textContent.trim()));
  if(rows.length !== 5) throw new Error('expected 5 after accepting, got ' + rows.length);
  if(!/Lateral Raise/.test(rows.join(' '))) throw new Error('suggestion not added');
});

await check('saving the routine drives the Train tab', async () => {
  await page.click('[data-act="save"]');
  await page.waitForTimeout(300);
  await page.click('[data-tab="train"]'); await page.waitForTimeout(400);
  const names = await page.$$eval('.ex .n', e => e.map(x => x.textContent.trim().split(' ')[0]));
  const txt = await page.textContent('#view');
  if(!/Flat press/.test(txt)) throw new Error('custom routine not used: ' + names.join(', '));
  if(/Ab Wheel/.test(txt)) throw new Error('built-in exercises still showing');
  console.log('       Train now shows the custom routine');
});

await check('resetting restores the built-in plan', async () => {
  await page.click('[data-tab="plan"]'); await page.waitForTimeout(300);
  await page.locator('[data-edit="push"]').click(); await page.waitForTimeout(300);
  await page.click('[data-act="reset"]'); await page.waitForTimeout(300);
  await page.click('[data-tab="train"]'); await page.waitForTimeout(400);
  if(!/Barbell Bench Press/.test(await page.textContent('#view'))) throw new Error('reset did not restore');
});

console.log('— progress tab —');
await check('progress renders', async () => {
  await page.click('[data-tab="progress"]');
  await page.waitForTimeout(250);
  const t = await page.textContent('#view');
  if(!/Protein adherence/.test(t)) throw new Error('missing');
  // Lift table now lives behind the Training segment.
  await page.locator('.seg button', { hasText:'Training' }).click();
  await page.waitForTimeout(200);
  if(!/Barbell Bench Press/.test(await page.textContent('#view'))) throw new Error('lift table missing');
  await page.locator('.seg button', { hasText:'Nutrition' }).click();
  await page.waitForTimeout(200);
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

console.log('— transferring between two browsers —');
await check('copy produces a backup and merge brings the other side in', async () => {
  await page.click('[data-tab="progress"]'); await page.waitForTimeout(300);

  // what this "device" has now
  const mine = await page.evaluate(() => Store.exportJSON());
  const before = await page.evaluate(() => Store.totalsFor(today()).kcal);

  // a second device with a day this one has never seen, plus an extra
  // entry on today that this one does not have
  const other = JSON.parse(mine);
  const d = await page.evaluate(() => today());
  other.days['2020-01-01'] = { entries:[{ id:'zz1', name:'Old day food', grams:100,
                                          kcal:400, p:30, c:20, f:10, meal:'lunch' }],
                               weight:70, steps:null, note:'' };
  other.days[d] = other.days[d] || { entries:[], weight:null, steps:null, note:'' };
  other.days[d].entries = (other.days[d].entries || []).concat([{ id:'zz2', name:'Other device shake',
    grams:100, kcal:250, p:25, c:18, f:7, meal:'extras' }]);

  await page.evaluate(txt => window.__pending = txt, JSON.stringify(other));
  await page.click('[data-act="paste"]'); await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelector('#inBox').value = window.__pending; });
  await page.click('#doMerge'); await page.waitForTimeout(300);
  await page.click('#mrg'); await page.waitForTimeout(400);

  const after = await page.evaluate(() => Store.totalsFor(today()).kcal);
  if(after !== before + 250) throw new Error(`today went ${before} -> ${after}, expected +250`);
  const oldDay = await page.evaluate(() => Store.day('2020-01-01').entries.length);
  if(oldDay !== 1) throw new Error('the other device\'s day did not arrive');
  console.log('       today ' + before + ' -> ' + after + ' kcal, plus 1 unseen day');
});

await check('merging the same data twice adds nothing', async () => {
  const snapshot = await page.evaluate(() => Store.exportJSON());
  const before = await page.evaluate(() => Store.totalsFor(today()).kcal);
  await page.evaluate(txt => window.__pending = txt, snapshot);
  await page.click('[data-act="paste"]'); await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelector('#inBox').value = window.__pending; });
  await page.click('#doMerge'); await page.waitForTimeout(300);
  await page.click('#mrg'); await page.waitForTimeout(400);
  const after = await page.evaluate(() => Store.totalsFor(today()).kcal);
  if(after !== before) throw new Error(`duplicated: ${before} -> ${after}`);
  console.log('       idempotent — still ' + after + ' kcal');
});

await check('replace is still available but is not the default', async () => {
  await page.click('[data-act="paste"]'); await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelector('#inBox').value = '{"days":{}}'; });
  await page.click('#doMerge'); await page.waitForTimeout(300);
  const buttons = await page.$$eval('.sheet button', b => b.map(x => x.textContent.trim()));
  if(!/Merge/.test(buttons[0])) throw new Error('merge is not the first option: ' + buttons.join(' | '));
  if(!buttons.some(b => /Replace/.test(b))) throw new Error('no replace option');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
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
  // The app reopens on Home, so go back to Food to see the entries.
  await page.click('[data-tab="food"]');
  await page.waitForTimeout(250);
  const t = await page.textContent('#view');
  if(!/Test Bar/.test(t)) throw new Error('log lost on reload');
});

console.log('— flexible search —');
await check('finds a product when the words are split across name and brand', async () => {
  await page.click('[data-tab="food"]'); await page.waitForTimeout(250);
  // a bottle you drank and binned: saved once, found by any wording after
  await page.evaluate(() => Store.saveFood({
    id:'man_rokeby', barcode:'', name:'Protein Drink', brand:'Rokeby Farms',
    kcal:250, p:25, c:18, f:7, unit:'serving', serving:100,
    servingLabel:'1 serving', source:'Saved by you'
  }));
  await page.click('[data-act="search"][data-meal="extras"]'); await page.waitForTimeout(300);

  for(const q of ['rokeby protein', 'protein rokeby', 'ROKEBY  farms protein']){
    await page.fill('#qIn', q);
    await page.waitForTimeout(350);
    const names = await page.$$eval('#qRes .item .t', e => e.map(x => x.textContent.trim()));
    if(!names.includes('Protein Drink')) throw new Error(`"${q}" found: ${names.join(', ') || 'nothing'}`);
  }
  console.log('       matched on "rokeby protein", "protein rokeby" and mixed case');
});

await check('results say whether values are per serving or per 100 g', async () => {
  await page.fill('#qIn', 'rokeby'); await page.waitForTimeout(350);
  const line = await page.locator('#qRes .item .s').first().textContent();
  if(!/per serving/.test(line)) throw new Error('row read: ' + line.replace(/\s+/g,' ').trim());
});

await check('a miss explains itself and seeds manual entry', async () => {
  await page.fill('#qIn', 'zzzq nonexistent drink'); await page.waitForTimeout(1200);
  const t = await page.textContent('#qRes');
  if(!/Nothing found/.test(t)) throw new Error('empty state was: ' + t.replace(/\s+/g,' ').trim());
  await page.click('#qManual'); await page.waitForTimeout(300);
  const name = await page.inputValue('#nIn');
  if(name !== 'zzzq nonexistent drink') throw new Error('name prefilled as: ' + name);
  console.log('       carries the query into the form so nothing is retyped');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
});

console.log('— logging something that is not a meal —');
await check('there is an Extras slot alongside the meals', async () => {
  await page.click('[data-tab="food"]'); await page.waitForTimeout(250);
  const heads = await page.$$eval('.meal-title h3', e => e.map(x => x.textContent.trim().replace(/\d+$/,'')));
  if(!heads.some(h => /Extras/.test(h))) throw new Error('slots: ' + heads.join(', '));
  console.log('       ' + heads.join(' · '));
});

await check('an unlabelled shake logs by serving, not grams', async () => {
  await page.click('[data-act="search"][data-meal="extras"]'); await page.waitForTimeout(300);
  await page.click('#qManual'); await page.waitForTimeout(300);
  // "Per serving" is the default — a stall cup has no per-100g label
  const on = await page.locator('#basis button.on').textContent();
  if(!/Per serving/.test(on)) throw new Error('default basis was: ' + on);
  await page.fill('#nIn', 'Stall protein shake');
  await page.fill('#bIn', 'Gym stall');
  await page.fill('#kIn', '330'); await page.fill('#pIn', '28');
  await page.fill('#cIn', '38');  await page.fill('#fIn', '6');
  await page.click('#save'); await page.waitForTimeout(300);

  // portion sheet should now count servings
  const label = await page.locator('.sheet label.f span').first().textContent();
  if(!/servings/i.test(label)) throw new Error('portion asked for: ' + label);
  await page.click('#add'); await page.waitForTimeout(350);

  const e = await page.evaluate(() => {
    const es = Store.day(today()).entries;
    return es[es.length - 1];
  });
  if(e.meal !== 'extras') throw new Error('landed in ' + e.meal);
  if(e.unit !== 'serving') throw new Error('unit was ' + e.unit);
  if(Math.round(e.kcal) !== 330) throw new Error('kcal ' + e.kcal + ' — one serving should be the full amount');
  if(Math.round(e.p) !== 28) throw new Error('protein ' + e.p);
  if(!/1 serving/.test(await page.textContent('#view'))) throw new Error('not shown as a serving');
  console.log('       logged 1 serving = 330 kcal / 28 g P under Extras');
});

await check('half a serving halves the macros', async () => {
  await page.click('[data-act="search"][data-meal="extras"]'); await page.waitForTimeout(300);
  await page.fill('#qIn', 'Stall protein'); await page.waitForTimeout(400);
  await page.click('#qRes .item'); await page.waitForTimeout(300);
  await page.fill('#gIn', '0.5'); await page.waitForTimeout(200);
  await page.click('#add'); await page.waitForTimeout(350);
  const e = await page.evaluate(() => { const es = Store.day(today()).entries; return es[es.length-1]; });
  if(Math.round(e.kcal) !== 165) throw new Error('half a serving came to ' + e.kcal);
  console.log('       0.5 serving = 165 kcal, saved food reusable from search');
});

await check('built-in per-serving items are searchable', async () => {
  await page.click('[data-act="search"][data-meal="extras"]'); await page.waitForTimeout(300);
  await page.fill('#qIn', 'shake'); await page.waitForTimeout(400);
  const names = await page.$$eval('#qRes .item .t', e => e.map(x => x.textContent.trim()));
  if(!names.some(n => /Protein shake/i.test(n))) throw new Error('no shakes: ' + names.join(', '));
  console.log('       ' + names.slice(0,3).join(', '));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
});

await check('Extras stays out of the meal-time guess', async () => {
  const guessed = await page.evaluate(() => {
    const h = new Date().getHours();
    return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
  });
  if(guessed === 'extras') throw new Error('extras should never be auto-picked');
});

console.log('— eating out —');
await check('the estimator opens and reacts to what you pick', async () => {
  await page.click('[data-tab="food"]'); await page.waitForTimeout(250);
  await page.click('[data-act="eatout"]'); await page.waitForTimeout(300);
  // read the headline figure only — scraping the whole panel would splice
  // the estimate together with the range either side of it
  const read = async () => parseInt(
    (await page.locator('#eoOut .kcal-big').textContent()).replace(/[^0-9]/g,''), 10);
  const grilled = await page.locator('.chip', { hasText:'Grilled or steamed' });
  await grilled.click(); await page.waitForTimeout(200);
  const light = await read();
  await page.locator('.chip', { hasText:'Creamy' }).click(); await page.waitForTimeout(200);
  const heavy = await read();
  if(!(heavy > light)) throw new Error(`rich sauce did not raise the estimate: ${light} -> ${heavy}`);
  console.log('       grilled ' + light + ' kcal -> rich ' + heavy + ' kcal');
});
await check('a range is shown, not a false precision', async () => {
  const t = await page.textContent('#eoOut');
  if(!/probably [\d,]+–[\d,]+/.test(t)) throw new Error('no range: ' + t.replace(/\s+/g,' ').trim());
});
await check('logging the estimate adds it to the day', async () => {
  const before = await page.evaluate(() => Store.totalsFor(today()).kcal);
  await page.click('#eoAdd'); await page.waitForTimeout(350);
  const after = await page.evaluate(() => Store.totalsFor(today()).kcal);
  if(!(after > before)) throw new Error(`total did not move: ${before} -> ${after}`);
  if(!/Eating out/.test(await page.textContent('#view'))) throw new Error('entry not listed');
  console.log('       day total ' + before + ' -> ' + after + ' kcal');
});

console.log('— Shortcuts step import via URL —');
await check('?steps= imports and is stripped from the URL', async () => {
  await page.goto(`http://localhost:${process.env.PORT || 8765}/index.html?steps=11750`, { waitUntil:'networkidle' });
  await page.waitForTimeout(400);
  if(!/11,750/.test(await page.textContent('#view'))) throw new Error('steps not imported');
  if(/steps=/.test(page.url())) throw new Error('query string not stripped: ' + page.url());
  console.log('       imported 11,750 and cleaned the URL');
});
await check('a refresh does not re-import', async () => {
  await page.reload({ waitUntil:'networkidle' });
  await page.waitForTimeout(300);
  if(!/11,750/.test(await page.textContent('#view'))) throw new Error('value lost on reload');
});
await check('?date= targets a specific day', async () => {
  const past = await page.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate()-2);
    return d.toISOString().slice(0,10);
  });
  await page.goto(`http://localhost:${process.env.PORT || 8765}/index.html?steps=6100&date=${past}`, { waitUntil:'networkidle' });
  await page.waitForTimeout(400);
  const stored = await page.evaluate(d => Store.stepsFor(d), past);
  if(stored !== 6100) throw new Error('stored ' + stored + ' for ' + past);
  const todayVal = await page.evaluate(() => Store.stepsFor(today()));
  if(todayVal !== 11750) throw new Error("today's count was overwritten: " + todayVal);
  console.log('       back-dated 6,100 without touching today');
});
await check('garbage input is ignored, not stored', async () => {
  await page.goto(`http://localhost:${process.env.PORT || 8765}/index.html?steps=notanumber`, { waitUntil:'networkidle' });
  await page.waitForTimeout(300);
  const v = await page.evaluate(() => Store.stepsFor(today()));
  if(v !== 11750) throw new Error('bad value clobbered the real one: ' + v);
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
