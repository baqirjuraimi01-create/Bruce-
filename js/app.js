/* ------------------------------------------------------------------
   app.js — routing between tabs, the selected date, and boot.
------------------------------------------------------------------- */

const App = (() => {
  let tab = 'home';
  let date = today();

  const VIEWS = {
    home: HomeView, food: FoodView, train: TrainView,
    progress: ProgressView, plan: PlanView
  };

  function refresh(){
    const root = document.getElementById('view');
    const scroll = window.scrollY;
    // The Plan tab shows a floating rail; reserve a gutter so it never
    // sits on top of the cards' own controls.
    root.className = 'view' + (tab === 'plan' ? ' with-rail' : '');
    VIEWS[tab].render(root, date);
    paintHeader();
    window.scrollTo(0, scroll);
  }

  function paintHeader(){
    document.getElementById('datePicker').value = date;
    const d = Store.cycleDayFor(date);
    document.getElementById('dateMeta').textContent =
      `${prettyDate(date)} · ${d.name} · cycle ${Store.cycleNumberFor(date)}`;
  }

  function go(t){
    if(t === 'cardio') t = 'train';        // cardio now lives inside Train
    tab = t;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    TrainView.stopTimer();
    window.scrollTo(0, 0);
    refresh();
  }

  function setDate(d){ date = d; refresh(); }

  /* An iOS Shortcut (or any link) can push a step count in:
       .../index.html?steps=8432&date=2026-08-13
     The parameter is consumed and stripped so a refresh cannot double-import. */
  function importFromUrl(){
    const q = new URLSearchParams(location.search);
    if(!q.has('steps')) return null;
    const n = parseInt(q.get('steps'), 10);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : today();
    history.replaceState({}, '', location.pathname + location.hash);
    if(!isFinite(n) || n < 0) return null;
    Store.setSteps(d, n);
    return { n, d };
  }

  function boot(){
    document.querySelectorAll('.tab').forEach(b => b.onclick = () => go(b.dataset.tab));
    document.getElementById('prevDay').onclick = () => setDate(addDays(date, -1));
    document.getElementById('nextDay').onclick = () => setDate(addDays(date, 1));
    document.getElementById('datePicker').onchange = e => setDate(e.target.value || today());

    Scanner.wire();
    wireSheet();

    const imported = importFromUrl();

    if('serviceWorker' in navigator && location.protocol.startsWith('http')){
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    Sync.start();
    Sync.onChange(() => { if(tab === 'progress') refresh(); });

    refresh();
    if(imported) toast(imported.n.toLocaleString() + ' steps imported');
  }

  return { boot, refresh, go, get date(){ return date; } };
})();

document.addEventListener('DOMContentLoaded', App.boot);
