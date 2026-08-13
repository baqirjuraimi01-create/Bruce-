/* ------------------------------------------------------------------
   app.js — routing between tabs, the selected date, and boot.
------------------------------------------------------------------- */

const App = (() => {
  let tab = 'food';
  let date = today();

  const VIEWS = {
    food: FoodView, train: TrainView, cardio: CardioView,
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
    tab = t;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    TrainView.stopTimer();
    window.scrollTo(0, 0);
    refresh();
  }

  function setDate(d){ date = d; refresh(); }

  function boot(){
    document.querySelectorAll('.tab').forEach(b => b.onclick = () => go(b.dataset.tab));
    document.getElementById('prevDay').onclick = () => setDate(addDays(date, -1));
    document.getElementById('nextDay').onclick = () => setDate(addDays(date, 1));
    document.getElementById('datePicker').onchange = e => setDate(e.target.value || today());

    Scanner.wire();
    wireSheet();

    if('serviceWorker' in navigator && location.protocol.startsWith('http')){
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    refresh();
  }

  return { boot, refresh, go, get date(){ return date; } };
})();

document.addEventListener('DOMContentLoaded', App.boot);
