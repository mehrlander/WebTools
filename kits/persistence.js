// kits/persistence.js — idb-keyval-backed key/value persistence.
//
// Wraps https://github.com/jakearchibald/idb-keyval with a string-path API
// so pages can stash arbitrary state without managing schemas. All values
// are written through IndexedDB's structured-clone, so Uint8Array, Date,
// Map, Blob, etc. round-trip with their types intact.
//
// Loadable as a plain script (no ES modules):
//
//   <script src=".../kits/persistence.js"></script>
//   const { save, load } = window.persistence;
//   await save('compress.input', { text: 'hello', bytes: new Uint8Array([1,2,3]) });
//   const v = await load('compress.input');
//
// Path syntax: "<db>.<store>.<key>" with sensible defaults
//   "page.foo"            → db="page",  store="default", key="foo"
//   "page.bucket.foo"     → db="page",  store="bucket",  key="foo"
//   "page.bucket.foo.bar" → db="page",  store="bucket",  key="foo.bar"
//   "single"              → throws (require at least a namespace + key)
//
// Single-segment paths are rejected on purpose — every page should pick
// its own namespace so devtools shows separate IndexedDB databases and
// data from different pages doesn't collide in a shared store.

(() => {
  let mod;
  const loadIdb = async () =>
    mod ??= await import('https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm');

  // Cache createStore() handles by "<db>|<store>" so repeated save/load
  // calls on the same path don't spin up new transactions per call.
  const stores = new Map();

  const parsePath = (path) => {
    if (typeof path !== 'string' || !path.trim()) {
      throw new Error('persistence: path must be a non-empty string');
    }
    const parts = path.split('.').map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) {
      throw new Error(`persistence: path "${path}" needs at least <namespace>.<key>`);
    }
    if (parts.length === 2) {
      return { db: parts[0], store: 'default', key: parts[1] };
    }
    return { db: parts[0], store: parts[1], key: parts.slice(2).join('.') };
  };

  const storeFor = async (db, store) => {
    const id = `${db}|${store}`;
    let s = stores.get(id);
    if (!s) {
      const { createStore } = await loadIdb();
      s = createStore(db, store);
      stores.set(id, s);
    }
    return s;
  };

  const save = async (path, data) => {
    const { db, store, key } = parsePath(path);
    const { set } = await loadIdb();
    await set(key, data, await storeFor(db, store));
  };

  const load = async (path) => {
    const { db, store, key } = parsePath(path);
    const { get } = await loadIdb();
    return get(key, await storeFor(db, store));
  };

  const remove = async (path) => {
    const { db, store, key } = parsePath(path);
    const { del } = await loadIdb();
    await del(key, await storeFor(db, store));
  };

  // List all keys in the store implied by `path`. The key segment of the
  // path is ignored — only db + store matter for listing.
  const list = async (path) => {
    const { db, store } = parsePath(path);
    const { keys } = await loadIdb();
    return keys(await storeFor(db, store));
  };

  // Read all entries in the store implied by `path` as an array of
  // [key, value] tuples.
  const entries = async (path) => {
    const { db, store } = parsePath(path);
    const { entries } = await loadIdb();
    return entries(await storeFor(db, store));
  };

  // Drop every key in the store implied by `path`.
  const clearStore = async (path) => {
    const { db, store } = parsePath(path);
    const { clear } = await loadIdb();
    await clear(await storeFor(db, store));
  };

  window.persistence = { save, load, remove, list, entries, clearStore, parsePath };
})();
