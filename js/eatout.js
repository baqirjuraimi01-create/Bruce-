/* ------------------------------------------------------------------
   eatout.js — estimating a restaurant meal.

   You cannot weigh food in a restaurant, and you cannot see the oil.
   That second point is the whole problem: the same grilled chicken and
   rice is 700 kcal or 1,100 kcal depending on how much fat went into
   the pan, and nothing visible on the plate tells you which.

   So this does not pretend to produce a number. It builds an estimate
   from components you CAN judge — portion sizes by hand, and how the
   food was cooked — and reports a range. The midpoint gets logged.

   Portion references:
     1 palm ≈ 110 g cooked meat or fish
     1 fist ≈ 150 g cooked rice, pasta, noodles or potato

   Pure functions — unit tested in test/eatout.test.cjs.
------------------------------------------------------------------- */

const EatOut = (() => {

  /* per palm of cooked protein */
  const PROTEIN = {
    lean:   { label:'Lean — chicken breast, white fish, steak, lean mince',
              kcal:185, p:34, c:0,  f:4 },
    medium: { label:'Medium — chicken thigh, salmon, pork, lamb, mince',
              kcal:235, p:28, c:0,  f:13 },
    fried:  { label:'Fried or breaded — fried chicken, battered fish, ribs',
              kcal:330, p:24, c:8,  f:22 }
  };

  /* per fist */
  const CARB = {
    none:   { label:'None',                          kcal:0,   p:0, c:0,  f:0 },
    rice:   { label:'Rice, pasta or noodles',        kcal:200, p:4, c:44, f:1 },
    potato: { label:'Potato or mash',                kcal:180, p:4, c:33, f:4 },
    bread:  { label:'Bread, roll or wrap',           kcal:180, p:6, c:33, f:2 },
    fries:  { label:'Chips or fries',                kcal:420, p:5, c:50, f:21 }
  };

  /* whole-meal cooking fat and sauce — where restaurants hide the calories */
  const SAUCE = {
    light:  { label:'Grilled or steamed, no sauce',        kcal:40,  p:0, c:0, f:4,  extraSpread:0 },
    medium: { label:'Some oil, or a light sauce',          kcal:160, p:0, c:2, f:17, extraSpread:0.03 },
    heavy:  { label:'Creamy, curry, buttery or deep fried', kcal:330, p:2, c:6, f:34, extraSpread:0.08 }
  };

  const VEG   = { kcal:60,  p:2, c:8,  f:3 };

  const DRINK = {
    none:  { label:'Water or diet drink', kcal:0,   p:0, c:0,  f:0 },
    soft:  { label:'Soft drink or juice', kcal:140, p:0, c:35, f:0 },
    beer:  { label:'Pint of beer',        kcal:190, p:2, c:15, f:0 },
    wine:  { label:'Glass of wine',       kcal:120, p:0, c:4,  f:0 }
  };

  const EXTRA = {
    starter: { label:'Starter or shared appetiser', kcal:250, p:8, c:22, f:14 },
    dessert: { label:'Dessert',                     kcal:350, p:5, c:45, f:16 }
  };

  /* Base uncertainty. Even a dietitian eyeballing a restaurant plate is
     routinely 20-25% out, and the error is not symmetric in practice —
     people under-guess far more often than they over-guess. */
  const BASE_SPREAD = 0.22;

  function estimate(sel){
    const s = Object.assign({
      protein:'lean', palms:1, carb:'rice', fists:1,
      sauce:'medium', veg:true, drink:'none', extras:[]
    }, sel || {});

    const add = (t, src, mult = 1) => {
      t.kcal += src.kcal * mult; t.p += src.p * mult;
      t.c += src.c * mult;       t.f += src.f * mult;
      return t;
    };

    const t = { kcal:0, p:0, c:0, f:0 };
    const prot  = PROTEIN[s.protein] || PROTEIN.lean;
    const carb  = CARB[s.carb]       || CARB.none;
    const sauce = SAUCE[s.sauce]     || SAUCE.medium;

    add(t, prot, s.palms);
    add(t, carb, s.fists);
    add(t, sauce);
    if(s.veg) add(t, VEG);
    add(t, DRINK[s.drink] || DRINK.none);
    for(const e of s.extras || []) if(EXTRA[e]) add(t, EXTRA[e]);

    // Wider range when the cooking method hides more, or the portion is big.
    let spread = BASE_SPREAD + (sauce.extraSpread || 0);
    if(s.protein === 'fried') spread += 0.05;
    if(s.palms >= 2 || s.fists >= 2) spread += 0.03;
    spread = Math.min(spread, 0.35);

    const kcal = Math.round(t.kcal);
    return {
      kcal, p:round(t.p, 1), c:round(t.c, 1), f:round(t.f, 1),
      low:  Math.round(kcal * (1 - spread)),
      high: Math.round(kcal * (1 + spread)),
      spread: round(spread * 100, 0),
      label: describe(s)
    };
  }

  function describe(s){
    const bits = [];
    const palm = s.palms === 1 ? '1 palm' : s.palms + ' palms';
    bits.push(`${palm} ${s.protein === 'fried' ? 'fried' : s.protein}`);
    if(s.carb !== 'none' && s.fists > 0){
      const fist = s.fists === 1 ? '1 fist' : s.fists + ' fists';
      bits.push(`${fist} ${(CARB[s.carb] || {}).label ? CARB[s.carb].label.split(',')[0].toLowerCase() : s.carb}`);
    }
    bits.push(({ light:'no sauce', medium:'light sauce', heavy:'rich sauce' })[s.sauce] || s.sauce);
    if(s.drink && s.drink !== 'none') bits.push((DRINK[s.drink].label || '').toLowerCase());
    for(const e of s.extras || []) if(EXTRA[e]) bits.push(e);
    return 'Eating out — ' + bits.join(', ');
  }

  return { PROTEIN, CARB, SAUCE, VEG, DRINK, EXTRA, BASE_SPREAD, estimate, describe };
})();

if(typeof module !== 'undefined' && module.exports) module.exports = EatOut;
