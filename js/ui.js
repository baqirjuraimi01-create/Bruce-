/* ------------------------------------------------------------------
   ui.js — small shared UI helpers: toast, bottom sheet, escaping,
   progress bars. Views build their markup as strings and hand it here.
------------------------------------------------------------------- */

let toastTimer = 0;
function toast(msg, ms = 2200){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/* ---------- bottom sheet ---------- */
function openSheet(html, afterRender){
  const o = document.getElementById('sheet');
  const b = document.getElementById('sheetBody');
  b.innerHTML = html;
  o.hidden = false;
  document.body.style.overflow = 'hidden';
  if(afterRender) afterRender(b);
}
function closeSheet(){
  document.getElementById('sheet').hidden = true;
  document.getElementById('sheetBody').innerHTML = '';
  document.body.style.overflow = '';
}
function wireSheet(){
  document.getElementById('sheet').addEventListener('click', e => {
    if(e.target.id === 'sheet') closeSheet();
  });
  document.addEventListener('keydown', e => {
    if(e.key !== 'Escape') return;
    if(!document.getElementById('sheet').hidden) closeSheet();
    else if(!document.getElementById('scanOverlay').hidden) Scanner.close();
  });
}

/* ---------- escaping ---------- */
function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ---------- progress bar ---------- */
function bar(value, target, color){
  const pct = target > 0 ? (value/target)*100 : 0;
  const over = pct > 100;
  return `<div class="bar${over ? ' over' : ''}"><i style="width:${clamp(pct,0,100)}%;background:${color}"></i></div>`;
}

/* Card header: title on the left, optional circular action button right. */
function cardHead(title, act, glyph = '↗'){
  return `<div class="cardhead">
    <h2>${title}</h2>
    ${act ? `<button class="iconbtn" data-act="${act}" aria-label="${esc(title)}">${glyph}</button>` : ''}
  </div>`;
}

/* Count badge, as on the reference's tab row. */
function badge(n, light){ return `<span class="badge${light ? ' light' : ''}">${n}</span>`; }

/* Segmented control. items = [{key,label,count}] */
function seg(items, active, act){
  return `<div class="seg">${items.map(i => `
    <button class="${i.key === active ? 'on' : ''}" data-act="${act}" data-key="${i.key}">
      ${esc(i.label)}${i.count != null ? badge(i.count, i.key !== active) : ''}
    </button>`).join('')}</div>`;
}

/* Donut ring with a value in the middle. */
function donut(pct, big, unit, sub, color = 'var(--ink)'){
  const R = 62, C = 2 * Math.PI * R;
  const p = clamp(pct, 0, 100);
  const dash = p / 100 * C;
  return `<div class="donut">
    <svg viewBox="0 0 146 146" aria-hidden="true">
      <circle cx="73" cy="73" r="${R}" fill="none" stroke="var(--track)" stroke-width="10"/>
      ${p > 0 ? `<circle cx="73" cy="73" r="${R}" fill="none" stroke="${color}" stroke-width="10"
              stroke-linecap="round" stroke-dasharray="${dash} ${C - dash}"/>` : ''}
    </svg>
    <div class="c">
      <div class="kcal-big mono">${big}${unit ? `<sup>${esc(unit)}</sup>` : ''}</div>
      ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
    </div>
  </div>`;
}

/* Three stat columns, each with a thin coloured bar underneath. */
function statCols(cols){
  return `<div class="stats">${cols.map(c => `
    <div class="stat">
      <div class="v mono">${c.value}${c.unit ? `<span>${esc(c.unit)}</span>` : ''}</div>
      <div class="l">${esc(c.label)}</div>
      ${bar(c.pct, 100, c.color)}
    </div>`).join('')}</div>`;
}

/* Macro block: calorie donut + protein/carbs/fat columns. */
function macroBlock(tot, tgt){
  const left = tgt.kcal - tot.kcal;
  const pct = t => tgt[t] > 0 ? (tot[t === 'protein' ? 'p' : t === 'carbs' ? 'c' : 'f'] / tgt[t]) * 100 : 0;
  return `
    <div class="donutwrap">
      ${donut((tot.kcal/tgt.kcal)*100, tot.kcal.toLocaleString(), 'kcal',
              left >= 0 ? left.toLocaleString() + ' left' : Math.abs(left).toLocaleString() + ' over')}
      <div class="grow">
        <div class="small muted">Target</div>
        <div style="font-size:19px;font-weight:500;letter-spacing:-.03em;margin-top:2px" class="mono">${tgt.kcal.toLocaleString()}<span class="muted" style="font-size:11px;font-weight:400"> kcal</span></div>
        <div class="ticks" style="margin-top:14px"><i style="width:${clamp((tot.kcal/tgt.kcal)*100,0,100)}%"></i></div>
        <div class="tiny muted" style="margin-top:7px">${Math.round((tot.kcal/tgt.kcal)*100)}% of target</div>
      </div>
    </div>
    ${statCols([
      { value: tot.p, unit:'g', label:'Protein', pct: pct('protein'), color:'var(--blue)' },
      { value: tot.c, unit:'g', label:'Carbs',   pct: pct('carbs'),   color:'var(--pink)' },
      { value: tot.f, unit:'g', label:'Fat',     pct: pct('fat'),     color:'var(--lime)' }
    ])}
  `;
}

/* Delegated click handling: views set data-act, app.js routes it. */
function on(root, act, handler){
  root.querySelectorAll(`[data-act="${act}"]`).forEach(el => {
    el.addEventListener('click', ev => handler(el, ev));
  });
}
