/* Tests the sync server against a fake KV. Run: npm run test:worker
   No Cloudflare account and no network needed. */

import worker from '../server/worker.js';

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

/* Cloudflare KV, near enough for these tests. */
const fakeKV = () => {
  const m = new Map();
  return {
    store: m,
    async get(k, type){ const v = m.get(k); return v == null ? null : (type === 'json' ? JSON.parse(v) : v); },
    async put(k, v){ m.set(k, v); }
  };
};

const ID  = 'a'.repeat(64);
const ID2 = 'b'.repeat(64);

const get = (env, id) =>
  worker.fetch(new Request(`https://x/v1/state?id=${id}`), env);
const put = (env, body) =>
  worker.fetch(new Request('https://x/v1/state', {
    method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body)
  }), env);

console.log('— an id with nothing stored —');
{
  const env = { SYNC: fakeKV() };
  const r = await get(env, ID);
  eq('responds 200', r.status, 200);
  eq('version starts at zero', (await r.json()), { version:0, updatedAt:null, blob:null });
}

console.log('\n— first write —');
{
  const env = { SYNC: fakeKV() };
  const r = await put(env, { id:ID, version:0, blob:'ciphertext-one' });
  eq('accepted', r.status, 200);
  eq('version becomes 1', (await r.json()).version, 1);

  const got = await (await get(env, ID)).json();
  eq('reads back what was written', got.blob, 'ciphertext-one');
  eq('at version 1', got.version, 1);
  ok('and carries a timestamp', typeof got.updatedAt === 'string' && got.updatedAt.length > 10);
}

console.log('\n— two devices, one of them stale —');
{
  const env = { SYNC: fakeKV() };
  await put(env, { id:ID, version:0, blob:'from-phone' });          // phone writes
  const r = await put(env, { id:ID, version:0, blob:'from-laptop' }); // laptop still thinks v0

  eq('the stale write is refused', r.status, 409);
  const body = await r.json();
  eq('and told the real version', body.version, 1);
  eq('and handed the current copy to merge with', body.blob, 'from-phone');

  const still = await (await get(env, ID)).json();
  eq('nothing was clobbered', still.blob, 'from-phone');

  // laptop merges and retries at the version it was told
  const retry = await put(env, { id:ID, version:1, blob:'merged-both' });
  eq('the retry succeeds', retry.status, 200);
  eq('at version 2', (await retry.json()).version, 2);
}

console.log('\n— ids are isolated —');
{
  const env = { SYNC: fakeKV() };
  await put(env, { id:ID,  version:0, blob:'mine' });
  await put(env, { id:ID2, version:0, blob:'someone else' });
  eq('one id cannot see the other', (await (await get(env, ID)).json()).blob, 'mine');
  eq('and vice versa', (await (await get(env, ID2)).json()).blob, 'someone else');
}

console.log('\n— rejects malformed requests —');
{
  const env = { SYNC: fakeKV() };
  eq('short id on read',      (await get(env, 'abc')).status, 400);
  eq('non-hex id on read',    (await get(env, 'z'.repeat(64))).status, 400);
  eq('bad id on write',       (await put(env, { id:'nope', version:0, blob:'x' })).status, 400);
  eq('missing blob',          (await put(env, { id:ID, version:0 })).status, 400);
  eq('empty blob',            (await put(env, { id:ID, version:0, blob:'' })).status, 400);
  eq('negative version',      (await put(env, { id:ID, version:-1, blob:'x' })).status, 400);
  eq('non-integer version',   (await put(env, { id:ID, version:1.5, blob:'x' })).status, 400);
  eq('oversized blob',        (await put(env, { id:ID, version:0, blob:'x'.repeat(4*1024*1024 + 1) })).status, 413);

  const badJson = await worker.fetch(new Request('https://x/v1/state', { method:'PUT', body:'{{{' }), env);
  eq('unparseable body', badJson.status, 400);
  ok('nothing was stored by any of that', env.SYNC.store.size === 0, `${env.SYNC.store.size} keys`);
}

console.log('\n— routing and CORS —');
{
  const env = { SYNC: fakeKV() };
  eq('unknown path', (await worker.fetch(new Request('https://x/nope'), env)).status, 404);
  eq('health check', (await worker.fetch(new Request('https://x/'), env)).status, 200);
  eq('DELETE not allowed', (await worker.fetch(new Request('https://x/v1/state', { method:'DELETE' }), env)).status, 405);

  const pre = await worker.fetch(new Request('https://x/v1/state', { method:'OPTIONS' }), env);
  eq('preflight succeeds', pre.status, 204);
  eq('preflight allows any origin', pre.headers.get('Access-Control-Allow-Origin'), '*');

  const r = await get(env, ID);
  eq('responses carry CORS', r.headers.get('Access-Control-Allow-Origin'), '*');
  eq('and are never cached', r.headers.get('Cache-Control'), 'no-store');
}

console.log('\n— misconfiguration is reported, not crashed on —');
{
  const r = await get({}, ID);          // KV binding missing
  eq('says the binding is missing', r.status, 500);
  eq('with a usable reason', (await r.json()).error, 'kv_not_bound');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
