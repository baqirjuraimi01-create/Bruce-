/* Unit tests for the eating-out estimator. Run: npm run test:unit */

global.round = (n, dp = 0) => { const m = Math.pow(10, dp); return Math.round(n * m) / m; };

const E = require('../js/eatout.js');

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if(a === b){ pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n         got  ' + a + '\n         want ' + b); }
};
const ok = (label, cond, detail) => {
  if(cond){ pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '\n         ' + detail : '')); }
};
const between = (label, v, lo, hi) =>
  ok(`${label} (${v})`, v >= lo && v <= hi, `expected ${lo}-${hi}, got ${v}`);

console.log('— a plain grilled meal —');
{
  // chicken breast, rice, veg, no sauce — the easiest meal to estimate
  const r = E.estimate({ protein:'lean', palms:1, carb:'rice', fists:1, sauce:'light', veg:true });
  between('calories', r.kcal, 400, 550);
  between('protein',  r.p,    35,  42);
  ok('range brackets the estimate', r.low < r.kcal && r.high > r.kcal);
  console.log(`         ${r.kcal} kcal (${r.low}-${r.high}), ${r.p} g protein, ±${r.spread}%`);
}

console.log('\n— the same meal, cooked the way a restaurant cooks it —');
{
  const light = E.estimate({ protein:'lean', palms:1, carb:'rice', fists:1, sauce:'light',  veg:true });
  const heavy = E.estimate({ protein:'lean', palms:1, carb:'rice', fists:1, sauce:'heavy',  veg:true });
  ok('rich sauce adds a few hundred calories', heavy.kcal - light.kcal >= 250,
     `difference was ${heavy.kcal - light.kcal}`);
  ok('and widens the range', heavy.spread > light.spread,
     `${light.spread}% vs ${heavy.spread}%`);
  console.log(`         grilled ${light.kcal} kcal vs rich ${heavy.kcal} kcal ` +
              `— ${heavy.kcal - light.kcal} kcal you cannot see on the plate`);
}

console.log('\n— a big night out —');
{
  const r = E.estimate({ protein:'fried', palms:2, carb:'fries', fists:1.5,
                         sauce:'heavy', veg:false, drink:'beer', extras:['starter','dessert'] });
  between('calories', r.kcal, 2100, 2800);
  ok('uncertainty is capped', r.spread <= 35, `spread was ${r.spread}`);
  console.log(`         ${r.kcal} kcal (${r.low}-${r.high}), ${r.p} g protein`);
}

console.log('\n— components actually add up —');
{
  const base = E.estimate({ protein:'lean', palms:1, carb:'none', fists:0, sauce:'light', veg:false });
  const withVeg = E.estimate({ protein:'lean', palms:1, carb:'none', fists:0, sauce:'light', veg:true });
  eq('adding veg adds exactly the veg', withVeg.kcal - base.kcal, E.VEG.kcal);

  const onePalm = E.estimate({ protein:'lean', palms:1, carb:'none', fists:0, sauce:'light', veg:false });
  const twoPalm = E.estimate({ protein:'lean', palms:2, carb:'none', fists:0, sauce:'light', veg:false });
  eq('a second palm adds one palm', twoPalm.kcal - onePalm.kcal, E.PROTEIN.lean.kcal);
  eq('...and its protein too', round(twoPalm.p - onePalm.p, 1), E.PROTEIN.lean.p);
}

console.log('\n— half portions are honoured —');
{
  const one  = E.estimate({ protein:'lean', palms:1,   carb:'rice', fists:1, sauce:'light', veg:false });
  const half = E.estimate({ protein:'lean', palms:1.5, carb:'rice', fists:1, sauce:'light', veg:false });
  eq('1.5 palms adds half a palm', half.kcal - one.kcal, round(E.PROTEIN.lean.kcal * 0.5, 0));
}

console.log('\n— drinks are counted —');
{
  const dry = E.estimate({ drink:'none' });
  for(const d of ['soft','beer','wine']){
    const wet = E.estimate({ drink:d });
    eq(`${d} adds ${E.DRINK[d].kcal} kcal`, wet.kcal - dry.kcal, E.DRINK[d].kcal);
  }
}

console.log('\n— defaults and bad input —');
{
  const r = E.estimate();
  ok('estimate() with no argument still works', r.kcal > 0);
  const junk = E.estimate({ protein:'unicorn', carb:'moonrock', sauce:'???' });
  ok('unknown options fall back rather than producing NaN',
     isFinite(junk.kcal) && junk.kcal > 0, 'got ' + junk.kcal);
}

console.log('\n— the label describes what was picked —');
{
  const l = E.estimate({ protein:'lean', palms:2, carb:'rice', fists:1, sauce:'heavy', drink:'beer' }).label;
  ok('mentions portions and sauce', /2 palms/.test(l) && /rich sauce/.test(l), l);
  console.log('         "' + l + '"');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
