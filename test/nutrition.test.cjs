/* Unit tests for food search matching. Run: npm run test:unit */

global.round = (n, dp = 0) => { const m = Math.pow(10, dp); return Math.round(n * m) / m; };

const N = require('../js/nutrition.js');

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

/* A product where the words the user remembers are split across the
   name and the brand — the case plain substring matching cannot do. */
const ROKEBY = { name:'Protein Drink', brand:'Rokeby Farms', serving:250, source:'Open Food Facts' };
const OTHER  = { name:'Protein Bar', brand:'Grenade', serving:60, source:'Open Food Facts' };
const OATS   = { name:'Oats, dry/raw', brand:'', serving:100, source:'Built-in' };
const SAVED  = { name:'Rokeby Protein Milk', brand:'', serving:250, source:'Saved by you' };
const POOL   = [ROKEBY, OTHER, OATS, SAVED];

const names = fs => fs.map(f => f.name);

console.log('— tokenizing —');
eq('splits on whitespace',      N.tokenize('rokeby protein'), ['rokeby','protein']);
eq('lowercases',                N.tokenize('Rokeby PROTEIN'), ['rokeby','protein']);
eq('strips punctuation',        N.tokenize('rokeby-farms, protein!'), ['rokeby','farms','protein']);
eq('keeps digits and percent',  N.tokenize('milk 2% 250ml'), ['milk','2%','250ml']);
eq('collapses extra spaces',    N.tokenize('  rokeby   protein  '), ['rokeby','protein']);
eq('empty query is no tokens',  N.tokenize('   '), []);

console.log('\n— word order does not matter —');
{
  const forwards = N.rank(POOL, N.tokenize('rokeby protein'));
  const reversed = N.rank(POOL, N.tokenize('protein rokeby'));
  ok('"rokeby protein" finds the split-name product', names(forwards).includes('Protein Drink'),
     names(forwards).join(', '));
  ok('"protein rokeby" finds it too', names(reversed).includes('Protein Drink'),
     names(reversed).join(', '));
  eq('both orders return the same set', names(forwards).sort(), names(reversed).sort());
}

console.log('\n— brand words count —');
{
  const r = N.rank(POOL, N.tokenize('rokeby farms protein'));
  ok('all three words match across name and brand', names(r).includes('Protein Drink'), names(r).join(', '));
}

console.log('\n— every word must be found, in strict mode —');
{
  const r = N.rank(POOL, N.tokenize('rokeby chocolate'));
  eq('a word that appears nowhere excludes the product', names(r), []);
  const loose = N.rank(POOL, N.tokenize('rokeby chocolate'), { partial:true });
  ok('...but partial mode still surfaces it', names(loose).length > 0, names(loose).join(', '));
}

console.log('\n— ranking —');
{
  const r = N.rank(POOL, N.tokenize('protein'), { partial:true });
  ok('a name starting with the word ranks above one that merely contains it',
     names(r).indexOf('Protein Drink') < names(r).indexOf('Rokeby Protein Milk'),
     names(r).join(' > '));
}
{
  const saved  = N.score(SAVED,  N.tokenize('rokeby'));
  const remote = N.score({ name:'Rokeby Protein Milk', brand:'', serving:250, source:'Open Food Facts' },
                         N.tokenize('rokeby'));
  ok('your own saved food outranks the identical remote one', saved > remote,
     `saved ${saved} vs remote ${remote}`);
}
{
  const full    = N.score(ROKEBY, N.tokenize('rokeby protein'));
  const partial = N.score(ROKEBY, N.tokenize('rokeby protein banana'));
  ok('matching every word scores above matching two of three', full > partial,
     `${full} vs ${partial}`);
  ok('a full match clears the strict threshold', full >= 100, 'scored ' + full);
  ok('a partial match does not', partial < 100, 'scored ' + partial);
}

console.log('\n— nothing matches, nothing is invented —');
eq('unrelated query returns nothing', names(N.rank(POOL, N.tokenize('lawnmower'))), []);
eq('empty query returns nothing',     names(N.rank(POOL, N.tokenize(''), { partial:true })), []);
eq('empty query scores zero',         N.score(ROKEBY, []), 0);

console.log('\n— case and spacing are ignored —');
{
  const a = names(N.rank(POOL, N.tokenize('ROKEBY   Protein')));
  const b = names(N.rank(POOL, N.tokenize('rokeby protein')));
  eq('same results regardless of case and spacing', a, b);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
