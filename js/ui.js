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

/* Macro block used on the Food tab and in the day summary. */
function macroBlock(tot, tgt){
  const line = (label, val, target, color, unit='g') => `
    <div class="macro">
      <div class="row between">
        <span>${label}</span>
        <span class="mono">${val}${unit} <span class="pct">/ ${target}${unit}</span></span>
      </div>
      ${bar(val, target, color)}
    </div>`;
  const left = tgt.kcal - tot.kcal;
  return `
    <div class="kcal-head">
      <span class="kcal-big mono">${tot.kcal}</span>
      <span class="muted">/ ${tgt.kcal} kcal</span>
      <span class="grow"></span>
      <span class="small ${left < 0 ? 'muted' : ''}">${left >= 0 ? left + ' left' : Math.abs(left) + ' over'}</span>
    </div>
    ${bar(tot.kcal, tgt.kcal, 'var(--accent)')}
    ${line('Protein', tot.p, tgt.protein, 'var(--prot)')}
    ${line('Carbs',   tot.c, tgt.carbs,   'var(--carb)')}
    ${line('Fat',     tot.f, tgt.fat,     'var(--fat)')}
  `;
}

/* Delegated click handling: views set data-act, app.js routes it. */
function on(root, act, handler){
  root.querySelectorAll(`[data-act="${act}"]`).forEach(el => {
    el.addEventListener('click', ev => handler(el, ev));
  });
}
