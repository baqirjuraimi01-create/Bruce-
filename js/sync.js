/* ------------------------------------------------------------------
   sync.js — keeping two devices in step.

   The sync code is the only secret. From it the client derives two
   independent things:

     id      = SHA-256("bruce.sync.id.v1|" + code)   -> names the row
     enc key = PBKDF2(code, "bruce.sync.enc.v1")     -> encrypts the data

   Because they come from different derivations, the id you hand the
   server tells it nothing about the key. The server stores ciphertext
   under a hash and can read none of it — which matters, because it is
   a free service on the public internet holding a log of what you eat.

   Conflicts are resolved with the same Merge used for manual transfer,
   so two devices that both logged something end up with both.

   Sync settings live under their own localStorage key, deliberately
   outside the synced state: turning sync off on one device must not
   turn it off everywhere.
------------------------------------------------------------------- */

const Sync = (() => {

  const CFG_KEY = 'bruce.sync.v1';
  const ID_SALT = 'bruce.sync.id.v1|';
  const ENC_SALT = 'bruce.sync.enc.v1';
  const PBKDF2_ROUNDS = 150000;

  // No I, L, O, 0 or 1 — this gets read aloud and typed on a phone.
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  let cfg = load();
  let keyCache = { code:null, key:null };
  let state = { status:'idle', message:'', at:null, version:0 };
  let listeners = [];
  let timer = 0, running = false;

  /* ---------- config ---------- */
  function load(){
    try{
      const raw = localStorage.getItem(CFG_KEY);
      return raw ? JSON.parse(raw) : { on:false, url:'', code:'', version:0, lastAt:null };
    }catch(e){ return { on:false, url:'', code:'', version:0, lastAt:null }; }
  }
  function saveCfg(){
    try{ localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }catch(e){}
  }
  function config(){ return Object.assign({}, cfg); }
  function isOn(){ return !!(cfg.on && cfg.url && cfg.code); }

  function configure({ url, code }){
    cfg.url = String(url || '').trim().replace(/\/+$/, '');
    cfg.code = normaliseCode(code);
    cfg.on = !!(cfg.url && cfg.code);
    cfg.version = 0;                  // new pairing: re-read from the server
    keyCache = { code:null, key:null };
    saveCfg();
    emit();
  }
  function turnOff(){
    cfg.on = false;
    keyCache = { code:null, key:null };
    saveCfg();
    setState('idle', '');
  }

  /* ---------- the code ---------- */
  function newCode(){
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    let out = '';
    for(let i = 0; i < bytes.length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out.replace(/(.{5})(?=.)/g, '$1-');       // ABCDE-FGHJK-…
  }
  // Typed by hand across devices, so be forgiving about case and dashes.
  function normaliseCode(c){
    return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function prettyCode(c){
    return normaliseCode(c).replace(/(.{5})(?=.)/g, '$1-');
  }

  /* ---------- crypto ---------- */
  const enc = new TextEncoder(), dec = new TextDecoder();

  function hex(buf){
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function idFor(code){
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(ID_SALT + normaliseCode(code)));
    return hex(digest);
  }
  async function keyFor(code){
    const norm = normaliseCode(code);
    if(keyCache.code === norm && keyCache.key) return keyCache.key;
    const base = await crypto.subtle.importKey('raw', enc.encode(norm), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name:'PBKDF2', salt:enc.encode(ENC_SALT), iterations:PBKDF2_ROUNDS, hash:'SHA-256' },
      base, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
    keyCache = { code:norm, key };
    return key;
  }

  function b64(bytes){
    let s = '';
    for(const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }
  function unb64(str){
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for(let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  async function encryptState(obj, code){
    const key = await keyFor(code);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    const joined = new Uint8Array(iv.length + ct.byteLength);
    joined.set(iv, 0);
    joined.set(new Uint8Array(ct), iv.length);
    return b64(joined);
  }
  async function decryptState(blob, code){
    const key = await keyFor(code);
    const raw = unb64(blob);
    const iv = raw.slice(0, 12), ct = raw.slice(12);
    const plain = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, ct);
    return JSON.parse(dec.decode(plain));
  }

  /* ---------- status ---------- */
  function onChange(fn){ listeners.push(fn); }
  function emit(){ for(const fn of listeners) { try{ fn(status()); }catch(e){} } }
  function setState(s, message){
    state.status = s; state.message = message || '';
    if(s === 'ok'){ state.at = new Date().toISOString(); }
    emit();
  }
  function status(){
    return { on:isOn(), status:state.status, message:state.message,
             at:cfg.lastAt, version:cfg.version, url:cfg.url, code:prettyCode(cfg.code) };
  }

  /* ---------- the sync itself ---------- */
  async function request(method, path, body){
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try{
      const res = await fetch(cfg.url + path, {
        method,
        signal: ctrl.signal,
        headers: body ? { 'Content-Type':'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      let data = null;
      try{ data = await res.json(); }catch(e){}
      return { status:res.status, data };
    } finally { clearTimeout(t); }
  }

  async function pushOnce(id, local){
    const blob = await encryptState(local, cfg.code);
    return request('PUT', '/v1/state', { id, version:cfg.version, blob });
  }

  /* Pull, merge, push. On a version clash, take what is there, merge
     again and retry — once. */
  async function run({ silent } = {}){
    if(!isOn() || running) return status();
    if(!crypto || !crypto.subtle){
      setState('error', 'This browser cannot encrypt — sync needs HTTPS');
      return status();
    }
    running = true;
    if(!silent) setState('syncing', 'Syncing…');

    try{
      const id = await idFor(cfg.code);

      const got = await request('GET', '/v1/state?id=' + id);
      if(got.status !== 200) throw new Error('Server said ' + got.status);

      cfg.version = got.data.version || 0;

      let merged = Store.snapshot();
      if(got.data.blob){
        let remote;
        try{ remote = await decryptState(got.data.blob, cfg.code); }
        catch(e){ throw new Error('WRONG_CODE'); }
        const res = Merge.mergeState(merged, remote);
        merged = res.state;
        Store.replaceState(merged);
      }

      let put = await pushOnce(id, merged);

      if(put.status === 409){
        // Another device wrote between our read and our write.
        cfg.version = put.data.version || 0;
        if(put.data.blob){
          const remote = await decryptState(put.data.blob, cfg.code);
          merged = Merge.mergeState(Store.snapshot(), remote).state;
          Store.replaceState(merged);
        }
        put = await pushOnce(id, merged);
      }

      if(put.status !== 200) throw new Error('Server said ' + put.status);

      cfg.version = put.data.version;
      cfg.lastAt = new Date().toISOString();
      saveCfg();
      setState('ok', '');
      if(typeof App !== 'undefined') App.refresh();
    }catch(e){
      const msg = e && e.message === 'WRONG_CODE'
        ? 'That sync code does not match the data on the server'
        : 'Could not reach the server';
      setState('error', msg);
    }finally{
      running = false;
    }
    return status();
  }

  /* ---------- automatic triggers ---------- */
  function nudge(delay = 4000){
    if(!isOn()) return;
    clearTimeout(timer);
    timer = setTimeout(() => run({ silent:true }), delay);
  }

  function start(){
    if(!isOn()) return;
    run({ silent:true });
    document.addEventListener('visibilitychange', () => {
      if(document.visibilityState === 'visible') nudge(600);
    });
    window.addEventListener('online', () => nudge(600));
    Store.onSave(() => nudge());        // a few seconds after you log something
  }

  return { config, configure, turnOff, isOn, status, onChange, run, nudge, start,
           newCode, normaliseCode, prettyCode, idFor, encryptState, decryptState };
})();

if(typeof module !== 'undefined' && module.exports) module.exports = Sync;
