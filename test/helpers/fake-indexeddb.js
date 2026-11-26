// test/helpers/fake-indexeddb.js — an in-memory indexedDB for the tests of the resource store (public/js/resources.js,
// public/js/resource-db.js, public/resource-worker.js; docs/rules/render.md 「리소스 저장소는 IndexedDB」).
//
// Enough of the API for what those files call: open (with upgradeneeded / versionchange), deleteDatabase, transactions
// over named stores with get / put / delete / getAll / getAllKeys, requests that succeed on a later task, a transaction
// that commits once it has no request left (a request on a finished one throws TransactionInactiveError, as a browser's
// does when code awaits something else in the middle), and a write transaction that is all or nothing. Values are
// stored as structured clones, so a typed-array view stores its whole buffer, as in a browser. `quota` (bytes of the
// stored ArrayBuffers) makes a write that passes it abort with QuotaExceededError.
//
// `oldCacheStorage()` is the Cache Storage of the versions before (named caches of Request → Response with X-SP-Hash),
// with Chrome's refusal of `keys()` on a cache that holds more than `maxKeys` entries.

const later = (fn) => setTimeout(fn, 0);
const sizeOf = (v) => (v instanceof ArrayBuffer ? v.byteLength : v && typeof v === 'object' ? Object.values(v).reduce((n, x) => n + sizeOf(x), 0) : 0);

/** @param {{ quota?: number }} [opts] */
export function fakeIndexedDB({ quota = Infinity } = {}) {
  const dbs = new Map(); // name → { version, stores: Map<string, Map>, open: Set<db> }

  function connect(name, data) {
    const db = {
      name, closed: false, onversionchange: null, onclose: null,
      get version() { return data.version; },
      objectStoreNames: { contains: (n) => data.stores.has(n) },
      createObjectStore(n) { data.stores.set(n, new Map()); return {}; },
      close() { db.closed = true; data.open.delete(db); },
      transaction(names, mode = 'readonly') {
        if (db.closed) throw new DOMException('The database connection is closing.', 'InvalidStateError');
        for (const n of [].concat(names)) if (!data.stores.has(n)) throw new DOMException(`No objectStore named ${n}.`, 'NotFoundError');
        const tx = { mode, error: null, oncomplete: null, onabort: null, onerror: null };
        let pending = 0, done = false;
        const undo = [];
        const abort = (err) => {
          if (done) return;
          done = true;
          for (const [m, k, had, v] of undo.reverse()) { if (had) m.set(k, v); else m.delete(k); }
          tx.error = err;
          later(() => tx.onabort?.({ target: tx }));
        };
        const settle = () => later(() => { if (!done && pending === 0) { done = true; tx.oncomplete?.({ target: tx }); } });
        const request = (fn) => {
          if (done) throw new DOMException('The transaction has finished.', 'TransactionInactiveError');
          const req = { result: undefined, error: null, onsuccess: null, onerror: null };
          pending++;
          later(() => {
            if (done) return;
            try { req.result = fn(); } catch (err) { req.error = err; pending--; req.onerror?.({ target: req }); abort(err); return; }
            req.onsuccess?.({ target: req });
            pending--;
            settle();
          });
          return req;
        };
        const write = (m, k, v) => {
          undo.push([m, k, m.has(k), m.get(k)]);
          if (v === undefined) m.delete(k); else m.set(k, v);
          let used = 0;
          for (const s of data.stores.values()) for (const x of s.values()) used += sizeOf(x);
          if (used > quota) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        };
        tx.objectStore = (n) => {
          const m = data.stores.get(n);
          const writable = () => { if (mode !== 'readwrite') throw new DOMException('The transaction is read-only.', 'ReadOnlyError'); };
          const sorted = () => [...m.keys()].sort();
          return {
            get: (k) => request(() => structuredClone(m.get(k))),
            put: (v, k) => { writable(); const c = structuredClone(v); return request(() => { write(m, k, c); return k; }); },
            delete: (k) => { writable(); return request(() => { if (m.has(k)) write(m, k, undefined); }); },
            getAll: () => request(() => sorted().map((k) => structuredClone(m.get(k)))),
            getAllKeys: () => request(() => sorted()),
          };
        };
        settle(); // a transaction given no request commits
        return tx;
      },
    };
    data.open.add(db);
    return db;
  }

  const indexedDB = {
    opened: 0,
    open(name, version = 1) {
      const req = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      later(() => {
        if (!dbs.has(name)) dbs.set(name, { version: 0, stores: new Map(), open: new Set() });
        const data = dbs.get(name);
        if (version < data.version) { req.error = new DOMException('The requested version is less than the existing one.', 'VersionError'); req.onerror?.({ target: req }); return; }
        const old = data.version;
        if (version > old) for (const other of [...data.open]) other.onversionchange?.({ target: other });
        req.result = connect(name, data);
        indexedDB.opened++;
        if (version > old) { data.version = version; req.onupgradeneeded?.({ target: req, oldVersion: old, newVersion: version }); }
        req.onsuccess?.({ target: req });
      });
      return req;
    },
    deleteDatabase(name) {
      const req = { result: undefined, error: null, onsuccess: null, onerror: null, onblocked: null };
      later(() => {
        const data = dbs.get(name);
        if (data) for (const other of [...data.open]) other.onversionchange?.({ target: other });
        dbs.delete(name);
        req.onsuccess?.({ target: req });
      });
      return req;
    },
  };

  /** The live Map of one store (created empty if the database is not there yet): tests seed and assert on it. */
  const storeOf = (store, name = 'sp-res') => {
    if (!dbs.has(name)) dbs.set(name, { version: 0, stores: new Map(), open: new Set() });
    const data = dbs.get(name);
    if (!data.stores.has(store)) data.stores.set(store, new Map());
    return data.stores.get(store);
  };
  /** Store a file as the page would (bytes and hash together). */
  const seed = (p, body, h, t = 'application/octet-stream') => {
    storeOf('files').set(p, { h, t, b: new TextEncoder().encode(body).buffer });
    storeOf('hashes').set(p, h);
  };
  /** path → { h, body } of every stored file, and whether the two stores agree. */
  const files = () => {
    const out = new Map();
    for (const [p, v] of storeOf('files')) out.set(p, { h: v.h, body: new TextDecoder().decode(v.b) });
    const hashes = storeOf('hashes');
    const agree = hashes.size === out.size && [...hashes].every(([p, h]) => out.get(p)?.h === h);
    if (!agree) throw new Error(`the files and hashes stores disagree: ${JSON.stringify([...hashes])} vs ${JSON.stringify([...out.keys()])}`);
    return out;
  };
  return { indexedDB, storeOf, seed, files, has: (name = 'sp-res') => dbs.has(name) };
}

/** The Cache Storage of the versions before: named caches; a cache with more than `maxKeys` entries refuses keys(). */
export function oldCacheStorage(maxKeys = Infinity, origin = 'https://x.test') {
  const named = new Map();
  const urlOf = (r) => new URL(typeof r === 'string' ? r : r.url, origin).href;
  const make = () => {
    const m = new Map(); // url → { body, headers }
    const hit = (u) => { const e = m.get(u); return e && new Response(e.body, { headers: e.headers }); };
    return {
      m,
      hit,
      keys: async () => {
        if (m.size > maxKeys) throw new DOMException("Failed to execute 'keys' on 'Cache': Operation too large.", 'AbortError');
        return [...m.keys()].map((url) => ({ url }));
      },
      match: async (r) => hit(urlOf(r)),
      put: async (r, res) => { m.set(urlOf(r), { body: await res.text(), headers: Object.fromEntries(res.headers) }); },
      delete: async (r) => m.delete(urlOf(r)),
    };
  };
  return {
    named,
    open: async (n) => { if (!named.has(n)) named.set(n, make()); return named.get(n); },
    has: async (n) => named.has(n),
    delete: async (n) => named.delete(n),
    keys: async () => [...named.keys()],
    match: async (r, { cacheName } = {}) => named.get(cacheName)?.hit(urlOf(r)),
    /** put a file with its hash header into a cache */
    seed: async (n, p, body, h) => { if (!named.has(n)) named.set(n, make()); named.get(n).m.set(urlOf(p), { body, headers: { 'x-sp-hash': h } }); },
  };
}
