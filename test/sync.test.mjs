/* Tests the sync client's crypto and code handling under Node's
   WebCrypto — the same API the browser uses. Run: npm run test:sync */

import { readFileSync } from 'fs';
import vm from 'vm';

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

/* Load sync.js with just enough browser around it. */
const store = new Map();
const ctx = {
  console, crypto, TextEncoder, TextDecoder, fetch,
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  setTimeout, clearTimeout,
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  },
  document: { addEventListener(){}, visibilityState:'visible' },
  window: { addEventListener(){} },
  Store: { onSave(){}, snapshot(){ return {}; }, replaceState(){} },
  Merge: { mergeState: (a) => ({ state:a, stats:{} }) }
};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../js/sync.js', import.meta.url), 'utf8') +
  ';globalThis.S = Sync;', ctx);
const S = ctx.S;

console.log('— the sync code —');
{
  const a = S.newCode(), b = S.newCode();
  ok('formatted in readable groups', /^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/.test(a), a);
  ok('two codes differ', a !== b, `${a} / ${b}`);
  ok('avoids characters that get misread', !/[ILO01]/.test(S.normaliseCode(a)), a);

  const many = new Set();
  for(let i = 0; i < 500; i++) many.add(S.newCode());
  eq('500 codes, no collisions', many.size, 500);
}

console.log('\n— typing it in by hand —');
{
  const canonical = S.normaliseCode('ABCDE-FGHJK-MNPQR-STUVW');
  eq('dashes ignored',  S.normaliseCode('ABCDEFGHJKMNPQRSTUVW'), canonical);
  eq('lower case ok',   S.normaliseCode('abcde-fghjk-mnpqr-stuvw'), canonical);
  eq('spaces ok',       S.normaliseCode(' ABCDE FGHJK MNPQR STUVW '), canonical);
  eq('re-prettified',   S.prettyCode('abcdefghjkmnpqrstuvw'), 'ABCDE-FGHJK-MNPQR-STUVW');
}

console.log('\n— the id sent to the server —');
{
  const code = 'ABCDE-FGHJK-MNPQR-STUVW';
  const id = await S.idFor(code);
  ok('is a SHA-256 hex string', /^[0-9a-f]{64}$/.test(id), id);
  eq('stable across calls', id, await S.idFor(code));
  eq('unaffected by formatting', id, await S.idFor('abcdefghjkmnpqrstuvw'));
  ok('a different code gives a different id', id !== await S.idFor('ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ'));
  ok('the id does not contain the code', !id.includes('ABCDE'.toLowerCase()));
}

console.log('\n— encryption round trip —');
{
  const code = S.newCode();
  const data = {
    days:{ '2026-08-13':{ entries:[{ id:'a', name:'Oats', kcal:303, p:10.6 }], weight:75 } },
    profile:{ weightKg:75 }
  };
  const blob = await S.encryptState(data, code);
  ok('produces base64', /^[A-Za-z0-9+/]+=*$/.test(blob), blob.slice(0, 40));
  eq('decrypts back to the same object', await S.decryptState(blob, code), data);
}

console.log('\n— the server cannot read it —');
{
  const code = S.newCode();
  const blob = await S.encryptState({ secret:'ate a whole pizza' }, code);
  const raw = Buffer.from(blob, 'base64').toString('binary');
  ok('the plaintext is not in the blob', !raw.includes('pizza'), 'FOUND PLAINTEXT');
  ok('nor is the key material', !raw.includes(S.normaliseCode(code)));
}

console.log('\n— a wrong code cannot decrypt —');
{
  const blob = await S.encryptState({ a:1 }, 'ABCDE-FGHJK-MNPQR-STUVW');
  let threw = false;
  try{ await S.decryptState(blob, 'ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ'); }catch(e){ threw = true; }
  ok('decryption fails rather than returning junk', threw);
}

console.log('\n— tampered ciphertext is rejected —');
{
  const code = S.newCode();
  const blob = await S.encryptState({ a:1 }, code);
  const bytes = Buffer.from(blob, 'base64');
  bytes[bytes.length - 3] ^= 0xff;                       // flip a bit in the ciphertext
  let threw = false;
  try{ await S.decryptState(bytes.toString('base64'), code); }catch(e){ threw = true; }
  ok('AES-GCM catches the change', threw);
}

console.log('\n— every encryption is unique —');
{
  const code = S.newCode();
  const a = await S.encryptState({ same:'data' }, code);
  const b = await S.encryptState({ same:'data' }, code);
  ok('same input encrypts differently each time', a !== b, 'IV is being reused');
  eq('but both decrypt correctly', await S.decryptState(b, code), { same:'data' });
}

console.log('\n— configuration —');
{
  ok('off until configured', !S.isOn());
  S.configure({ url:'https://sync.example.com/', code:'abcde-fghjk-mnpqr-stuvw' });
  ok('on once it has both', S.isOn());
  eq('trailing slash trimmed', S.config().url, 'https://sync.example.com');
  eq('code stored canonically', S.config().code, 'ABCDEFGHJKMNPQRSTUVW');
  eq('shown back prettily', S.status().code, 'ABCDE-FGHJK-MNPQR-STUVW');
  S.turnOff();
  ok('off again after turning off', !S.isOn());
  ok('but the code is remembered for turning back on', !!S.config().code);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
