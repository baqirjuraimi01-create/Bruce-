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

/* Concentric activity rings, Watch-style. items = up to 3 of
   {pct, color, label, value}, outermost first. Past 100% the ring keeps
   going: a second, slightly narrower lap is drawn on top, so beating a
   target reads as a win instead of clamping silently. */
function rings(items){
  const SIZE = 168, C = SIZE / 2;
  const RADII = [70, 52, 34], STROKE = 15;

  const arcs = items.slice(0, 3).map((it, i) => {
    const r = RADII[i], circ = 2 * Math.PI * r;
    const pct = Math.max(0, it.pct || 0);
    const lap1 = Math.min(pct, 100) / 100 * circ;
    const lap2 = Math.min(Math.max(pct - 100, 0), 100) / 100 * circ;
    return `
      <circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${STROKE}"/>
      ${lap1 > 0 ? `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="${it.color}"
          stroke-width="${STROKE}" stroke-linecap="round"
          stroke-dasharray="${lap1} ${circ - lap1}"/>` : ''}
      ${lap2 > 0 ? `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="${it.color}"
          stroke-width="${STROKE - 6}" stroke-linecap="round" opacity="0.85"
          stroke-dasharray="${lap2} ${circ - lap2}"/>` : ''}`;
  }).join('');

  const legend = items.slice(0, 3).map(it => `
    <div class="ringrow">
      <span class="ringdot" style="background:${it.color}"></span>
      <div class="grow">
        <div class="ringlabel">${esc(it.label)}</div>
        <div class="ringvalue mono">${it.value}</div>
      </div>
      <span class="ringpct mono">${Math.round(it.pct || 0)}%</span>
    </div>`).join('');

  return `<div class="ringswrap">
    <div class="ringsvg"><svg viewBox="0 0 ${SIZE} ${SIZE}" style="transform:rotate(-90deg)" aria-hidden="true">${arcs}</svg></div>
    <div class="grow">${legend}</div>
  </div>`;
}

/* Three stat columns, each with a thin coloured bar underneath. */
function statCols(cols){
  return `<div class="stats" style="grid-template-columns:repeat(${cols.length},1fr)">${cols.map(c => `
    <div class="stat">
      <div class="v mono">${c.value}${c.unit ? `<span>${esc(c.unit)}</span>` : ''}</div>
      <div class="l">${esc(c.label)}</div>
      ${bar(c.pct, 100, c.color)}
    </div>`).join('')}</div>`;
}

/* Macro block: calorie donut, a protein ring beside it, carbs and fat
   as thin bars below. Protein gets the second ring because it is the
   number this whole app keeps saying matters most. */
function macroBlock(tot, tgt){
  const left = tgt.kcal - tot.kcal;
  const pLeft = tgt.protein - tot.p;
  return `
    <div class="donutwrap dual" style="justify-content:space-around">
      ${donut((tot.kcal/tgt.kcal)*100, tot.kcal.toLocaleString(), 'kcal',
              left >= 0 ? left.toLocaleString() + ' left' : Math.abs(left).toLocaleString() + ' over')}
      ${donut((tot.p/tgt.protein)*100, tot.p, 'g protein',
              pLeft > 0 ? pLeft + ' g to go' : 'target hit', 'var(--blue)')}
    </div>
    ${statCols([
      { value: tot.c, unit:'g', label:'Carbs of ' + tgt.carbs + ' g', pct: tgt.carbs ? (tot.c/tgt.carbs)*100 : 0, color:'var(--pink)' },
      { value: tot.f, unit:'g', label:'Fat of ' + tgt.fat + ' g',     pct: tgt.fat   ? (tot.f/tgt.fat)*100   : 0, color:'var(--lime)' }
    ])}
  `;
}

/* Delegated click handling: views set data-act, app.js routes it. */
function on(root, act, handler){
  root.querySelectorAll(`[data-act="${act}"]`).forEach(el => {
    el.addEventListener('click', ev => handler(el, ev));
  });
}
