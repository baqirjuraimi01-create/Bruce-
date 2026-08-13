/* ------------------------------------------------------------------
   Bruce sync server — a single Cloudflare Worker backed by KV.

   It stores one opaque blob per sync id and knows nothing else. The
   client encrypts before sending, so this server cannot read your food
   log, your weight or anything else even though you own it: KV holds
   ciphertext and an id that is a hash, not the key that decrypts it.

   Protocol
     GET  /v1/state?id=<64 hex>   -> { version, updatedAt, blob|null }
     PUT  /v1/state               -> { id, version, blob }
                                     200 { version }        stored
                                     409 { version, blob }  someone else
                                                            wrote first
   Optimistic concurrency: a PUT must state the version it read. If the
   stored version has moved on, the write is refused and the current
   copy comes back so the client can merge and retry.

   Deploy: see server/README.md — it is all done in the Cloudflare
   dashboard, no command line needed.
------------------------------------------------------------------- */

const MAX_BLOB = 4 * 1024 * 1024;      // 4 MB of ciphertext is years of logs
const ID_RE = /^[0-9a-f]{64}$/;        // SHA-256 hex, nothing else

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors }
  });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/v1')
      return json({ ok: true, service: 'bruce-sync' });

    if (url.pathname !== '/v1/state') return json({ error: 'not_found' }, 404);
    if (!env || !env.SYNC) return json({ error: 'kv_not_bound' }, 500);

    /* ---------- read ---------- */
    if (request.method === 'GET') {
      const id = url.searchParams.get('id') || '';
      if (!ID_RE.test(id)) return json({ error: 'bad_id' }, 400);

      const stored = await env.SYNC.get(id, 'json');
      if (!stored) return json({ version: 0, updatedAt: null, blob: null });
      return json({ version: stored.version, updatedAt: stored.updatedAt, blob: stored.blob });
    }

    /* ---------- write ---------- */
    if (request.method === 'PUT') {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: 'bad_json' }, 400); }

      const { id, version, blob } = body || {};
      if (!ID_RE.test(id || '')) return json({ error: 'bad_id' }, 400);
      if (typeof blob !== 'string' || !blob) return json({ error: 'bad_blob' }, 400);
      if (blob.length > MAX_BLOB) return json({ error: 'too_large' }, 413);
      if (!Number.isInteger(version) || version < 0) return json({ error: 'bad_version' }, 400);

      const current = await env.SYNC.get(id, 'json');
      const currentVersion = current ? current.version : 0;

      // Someone else wrote since this client last read. Hand back the
      // current copy rather than clobbering it.
      if (currentVersion !== version)
        return json({ error: 'conflict', version: currentVersion, blob: current ? current.blob : null }, 409);

      const next = { version: currentVersion + 1, updatedAt: new Date().toISOString(), blob };
      await env.SYNC.put(id, JSON.stringify(next));
      return json({ version: next.version, updatedAt: next.updatedAt });
    }

    return json({ error: 'method_not_allowed' }, 405);
  }
};
