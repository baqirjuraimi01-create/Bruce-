# Sync server — setup

About five minutes, all of it in a browser. No command line, no card,
and the free tier covers this many times over: two devices syncing all
day is a few hundred requests, against a daily allowance of 100,000.

The server stores an encrypted blob under a hash. It cannot read your
data — the app encrypts before sending and the key never leaves your
devices.

---

## 1. Create a Cloudflare account

[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) — email and
a password. You do **not** need a domain and you do **not** need to add a card.

## 2. Make the storage

In the dashboard sidebar: **Storage & Databases → KV → Create instance**.

Name it `bruce-sync`. Create.

## 3. Make the Worker

Sidebar: **Compute (Workers) → Workers & Pages → Create → Start with Hello
World → Deploy**.

Name it something like `bruce-sync`. Deploy the placeholder — you replace the
code next.

## 4. Paste in the code

Open the Worker → **Edit code** (or *Edit* / *Quick edit*).

Delete everything in the editor and paste the whole contents of
[`worker.js`](./worker.js) from this repo. Then **Deploy**.

## 5. Connect the storage to the Worker

Worker → **Settings → Bindings → Add → KV namespace**.

- **Variable name:** `SYNC` — exactly this, in capitals. The code looks for
  this name and nothing else.
- **KV namespace:** `bruce-sync`

Save, and **redeploy** if it asks.

## 6. Check it

Open your Worker's address in a browser:

```
https://bruce-sync.<your-subdomain>.workers.dev/
```

You should see:

```json
{"ok":true,"service":"bruce-sync"}
```

If you get an error mentioning `kv_not_bound`, step 5 did not take — check the
variable name is `SYNC`.

## 7. Turn it on in the app

**Progress → Sync → Set up sync**

- **Server address:** the workers.dev URL from step 6, no trailing slash
- **Sync code:** tap **Create a new code** — on your *first* device only

Then on your second device: same address, and **type in the same code**. That
code is what pairs them.

---

## Things worth knowing

**The code is the only protection.** Anyone holding it and the address can read
your log. It is not recoverable — losing it means the data on the server can
never be decrypted again, by anyone including you. The app keeps working
offline regardless, so this is not a disaster, but write it down somewhere.

**Changing the code starts a fresh, empty sync.** It is a new id and a new key.

**The free tier is generous but not unlimited.** 100,000 reads and 1,000 writes
per day. Automatic syncing does a handful per session, so two devices will not
come close.

**Conflicts.** Every write states the version it read; a stale write is refused
and the client merges and retries. KV is eventually consistent rather than
transactional, so two devices writing in the same second could in principle
have one write land last and win. With one person and two phones this is
vanishingly unlikely, and the merge means the losing side's data is still on
that device and goes up on its next sync.

**Cost if you exceed it:** nothing — Workers on the free plan stop serving until
the next day rather than billing you.

## Running it somewhere else

`worker.js` is a standard ES module exporting `{ fetch(request, env) }`. It
needs one thing from `env`: a KV-like object with `get(key, 'json')` and
`put(key, string)`. Deno Deploy, Bun, or a small Node server all work with a
thin adapter. `test/worker.test.mjs` runs the whole protocol against a fake KV
in memory, so you can check any port without deploying.
