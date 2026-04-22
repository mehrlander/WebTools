// alp-dev.js - Single-file development version with fail-fast proxy
// Combines alp.js + core.js, removes cache-busting, adds fail-fast error reporting

(() => {
  'use strict';

  // Prevent multiple initialization
  if (window.__alp_init) return;
  window.__alp_init = true;

  // === FAIL-FAST PROXY SYSTEM ===

  function showMobileError(msg) {
    // 1. Console (for desktop devs)
    console.error(msg);

    // 2. Big modal (for mobile and desktop)
    const modal = document.createElement('div');
    modal.className = 'alp-timing-error';
    modal.innerHTML = `
      <pre style="
        position: fixed; top: 10%; left: 5%; right: 5%;
        max-height: 80%; overflow: auto;
        background: #fee; color: #c00;
        padding: 1.5rem; border: 4px solid #c00;
        font-family: monospace; font-size: 13px;
        z-index: 999999; user-select: all;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        white-space: pre-wrap; word-wrap: break-word;
      ">${msg}</pre>
      <button style="
        position: fixed; top: 5%; right: 5%;
        padding: 0.5rem 1rem; font-size: 16px;
        background: #c00; color: white; border: none;
        cursor: pointer; z-index: 9999999;
      " onclick="this.parentElement.remove()">✕ Close</button>
    `;
    document.body.appendChild(modal);

    // 3. Try to copy to clipboard (mobile-friendly)
    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg).catch(() => {});
    }
  }

  function createFailFastProxy(name = 'alp') {
    const state = {
      _ready: false,
      _implementation: null
    };

    const createErrorFunction = (fullPath, prop) => {
      return function(...args) {
        const errorMsg = `
╔════════════════════════════════╗
║   ⚠️  ALP TIMING ERROR ⚠️      ║
╚════════════════════════════════╝

You called:  ${fullPath}()
Status:      Alp is not ready yet
Timestamp:   ${new Date().toISOString()}

─────────────────────────────────
HOW TO FIX:
─────────────────────────────────

Option 1 - Listen for ready event:
┌─────────────────────────────────
│ window.addEventListener('alp:ready', () => {
│   ${fullPath}(...);
│ });
└─────────────────────────────────

Option 2 - Use defer attribute:
┌─────────────────────────────────
│ <script type="module" defer>
│   ${fullPath}(...);
│ </script>
└─────────────────────────────────

─────────────────────────────────
CALL DETAILS:
─────────────────────────────────
Arguments: ${JSON.stringify(args, null, 2)}

Stack trace:
${new Error().stack}

This message was auto-copied to clipboard.
        `.trim();

        showMobileError(errorMsg);
        throw new Error(`${fullPath} called before ready`);
      };
    };

    const handler = {
      get(target, prop) {
        if (prop === '_ready' || prop === '_implementation') {
          return target[prop];
        }

        if (target._ready && target._implementation) {
          return target._implementation[prop];
        } else {
          // Not ready - return error function
          const fullPath = `${name}.${String(prop)}`;
          return createErrorFunction(fullPath, prop);
        }
      },

      set(target, prop, value) {
        target[prop] = value;
        return true;
      }
    };

    return new Proxy(state, handler);
  }

  // === INITIALIZE PROXIES ===
  const alpineReady = (go) => document.addEventListener('alpine:init', go, { once: true });

  // Create main proxy
  const alpProxy = createFailFastProxy('alp');
  window.alp = alpProxy;

  // Create nested proxies for kit and fills
  const kitProxy = createFailFastProxy('alp.kit');
  const fillsProxy = createFailFastProxy('alp.fills');

  console.log('🏔️ Alp Dev | Loading...');

  // === BOOT FUNCTION ===
  const boot = async () => {
    try {
      // Get base path
      const BASE = (() => {
        try {
          const scriptSrc = document.currentScript?.src || '';
          if (!scriptSrc) return '';
          return scriptSrc.replace(/[^/]+$/, '');
        } catch { return ''; }
      })();

      const v = (path) => `${BASE}${path}`;

      // === CSS & JS LOADING ===
      const el = (t, a) => Object.assign(document.createElement(t), a);
      const css = href => document.head.appendChild(el('link', { rel: 'stylesheet', href }));
      const js = src => new Promise((ok, err) => document.head.appendChild(el('script', { src, onload: ok, onerror: err })));

      css('https://cdn.jsdelivr.net/combine/npm/daisyui@5/themes.css,npm/daisyui@5,npm/tabulator-tables/dist/css/tabulator_simple.min.css');
      await js('https://cdn.jsdelivr.net/combine/npm/@tailwindcss/browser@4,npm/@phosphor-icons/web,npm/dexie@4,npm/tabulator-tables');

      // === IMPORT LOCAL MODULES ===
      const { fills } = await import(v('utils/fills.js'));
      const { kit } = await import(v('utils/kit.js'));
      const { parsePath, buildPath, buildFullPath, path, DEFAULT_DB, DEFAULT_STORE } = await import(v('utils/path.js'));
      const { dbManager } = await import(v('utils/db-manager.js'));
      const { isIndexedDBAvailable, MemoryDb } = await import(v('utils/memory-db.js'));

      // === CONSOLE CAPTURE ===
      const consoleLogs = [];
      const MAX = 100;
      const orig = Object.fromEntries(['log', 'warn', 'error', 'info'].map(k => [k, console[k].bind(console)]));
      const fmt = a => {
        try { return (a && typeof a === 'object') ? JSON.stringify(a, null, 2) : String(a); }
        catch { return String(a); }
      };
      ['log', 'warn', 'error', 'info'].forEach(k => {
        console[k] = (...args) => {
          consoleLogs.push({ type: k, time: new Date().toLocaleTimeString(), args: args.map(fmt).join(' ') });
          consoleLogs.length > MAX && consoleLogs.shift();
          orig[k](...args);
        };
      });

      // === DATABASE SETUP ===
      let db;
      const indexedDBAvailable = await isIndexedDBAvailable();

      if (indexedDBAvailable) {
        db = new Dexie(DEFAULT_DB);
        db.version(1).stores({ [DEFAULT_STORE]: 'name' });
        dbManager.registerDb(DEFAULT_DB, db, [DEFAULT_STORE]);
      } else {
        dbManager.setPersistent(false);
        console.warn('⚠️ IndexedDB unavailable - using memory storage');
        db = new MemoryDb(DEFAULT_DB);
        db.version(1).stores({ [DEFAULT_STORE]: 'name' });
        await db.open();
        dbManager.registerDb(DEFAULT_DB, db, [DEFAULT_STORE]);
      }

      // === PATH REGISTRY ===
      const pathRegistry = Object.create(null);

      const canonicalPath = (p) => {
        const { db, store, record } = parsePath(p);
        return buildFullPath(db, store, record);
      };

      const reg = (p, x) => {
        const key = canonicalPath(p);
        (pathRegistry[key] ||= new Set).add(x);
        return x;
      };

      const unreg = (p, x) => {
        const key = canonicalPath(p);
        const s = pathRegistry[key];
        if (!s) return;
        s.delete(x);
        if (!s.size) delete pathRegistry[key];
      };

      const ping = (p, data, occasion = 'data') => {
        const key = canonicalPath(p);
        pathRegistry[key]?.forEach(x => x.onPing?.(occasion, data));
        if (occasion === 'save-record' || occasion === 'delete-record') {
          globalFind('alp-inspector')?.onPing?.(occasion, { path: p, data });
        }
      };

      // === COMPONENT PROXY SYSTEM ===
      const pendingProxies = new WeakMap();
      const readyPromises = new WeakMap();

      const createComponentProxy = (el) => {
        let queue = pendingProxies.get(el);
        if (!queue) {
          queue = [];
          pendingProxies.set(el, queue);
        }
        return new Proxy({}, {
          get(_, method) {
            if (method === 'then') return (resolve, reject) => getReadyPromise(el).then(resolve, reject);
            return (...args) => {
              if (el.data?._isReady) {
                const fn = el.data[method];
                return typeof fn === 'function' ? fn.apply(el.data, args) : fn;
              }
              queue.push({ method, args });
            };
          }
        });
      };

      const getReadyPromise = (el) => {
        if (!el) return Promise.resolve(null);
        if (el.tagName.startsWith('ALP-')) {
          if (el.data?._isReady) return Promise.resolve(el.data);
          let entry = readyPromises.get(el);
          if (!entry) {
            let resolve;
            const promise = new Promise(r => resolve = r);
            entry = { promise, resolve };
            readyPromises.set(el, entry);
          }
          return entry.promise;
        }
        return Promise.resolve(el);
      };

      // === DATA OPERATIONS ===
      const load = async (filter = {}) => {
        const result = {};
        const dbsToCheck = filter.db ? [filter.db] : dbManager.listDbs();
        for (const dbName of dbsToCheck) {
          const storesToCheck = filter.store ? [filter.store] : dbManager.listStores(dbName);
          for (const storeName of storesToCheck) {
            if (!dbManager.hasStore(dbName, storeName)) continue;
            const table = dbManager.getStore(dbName, storeName);
            const records = await table.toArray();
            const groupKey = `${dbName}/${storeName}`;
            result[groupKey] = records.map(({ name, data }) => {
              const [namespace, ...rest] = name.split('.');
              return { key: name, fullPath: buildPath(dbName, storeName, name), namespace, sig: rest.join('.'), data };
            });
          }
        }
        return result;
      };

      const loadRecord = async (fullPath) => {
        const { db: dbName, store, record } = parsePath(fullPath);
        if (!dbManager.has(dbName, store)) {
          throw new Error(!dbManager.hasDb(dbName)
            ? `Database '${dbName}' not found. Use alp.createDb('${dbName}', ['${store}'])`
            : `Store '${store}' not found in '${dbName}'. Use alp.createStore('${dbName}', '${store}')`);
        }
        const r = await dbManager.getStore(dbName, store).get(record);
        return r?.data;
      };

      const saveRecord = async (fullPath, data) => {
        const { db: dbName, store, record } = parsePath(fullPath);
        if (!dbManager.has(dbName, store)) {
          throw new Error(!dbManager.hasDb(dbName)
            ? `Database '${dbName}' not found. Use alp.createDb('${dbName}', ['${store}'])`
            : `Store '${store}' not found in '${dbName}'. Use alp.createStore('${dbName}', '${store}')`);
        }
        await dbManager.getStore(dbName, store).put({ name: record, data });
        console.log(`💾 ${buildPath(dbName, store, record)}:`, data);
        ping(fullPath, data, 'save-record');
      };

      const deleteRecord = async (fullPath) => {
        const { db: dbName, store, record } = parsePath(fullPath);
        if (!dbManager.has(dbName, store)) {
          throw new Error(!dbManager.hasDb(dbName)
            ? `Database '${dbName}' not found. Use alp.createDb('${dbName}', ['${store}'])`
            : `Store '${store}' not found in '${dbName}'. Use alp.createStore('${dbName}', '${store}')`);
        }
        await dbManager.getStore(dbName, store).delete(record);
        console.log(`🗑️ ${buildPath(dbName, store, record)}`);
        ping(fullPath, null, 'delete-record');
      };

      const isValidPath = (fullPath) => {
        const { db: dbName, store } = parsePath(fullPath);
        return dbManager.has(dbName, store);
      };

      const safeStore = (s, map) => map[s] ? s : (Object.keys(map)[0] || DEFAULT_STORE);

      // === ALP BASE CLASS ===
      class Alp extends HTMLElement {
        connectedCallback() {
          const render = () => { this.innerHTML = this.tpl(); Alpine.initTree(this); };
          window.Alpine ? render() : document.addEventListener('alpine:init', render, { once: 1 });
        }
        tpl() { return ''; }
        disconnectedCallback() {
          const d = this.data;
          d && unreg(d._path, d);
          this.data = null;
        }
      }

      // === COMPONENT DEFINITIONS ===
      const defs = Object.create(null);

      const mk = (tagEnd, initState = {}) => {
        const defaultPath = `alp.${tagEnd}`;
        return {
          ...initState, tagEnd, el: null, host: null, defaultPath, _path: defaultPath, _isReady: false,
          get path() { return this._path; },
          set path(p) {
            p = (p ?? '').trim() || this.defaultPath;
            if (p === this._path) { this.onPing?.('path'); return; }
            unreg(this._path, this);
            this._path = p;
            reg(this._path, this);
            this.onPing?.('path');
          },
          find(s) {
            const el = this.el?.querySelector(s);
            if (!el) return null;
            if (el.tagName.startsWith('ALP-')) return el.data?._isReady ? el.data : createComponentProxy(el);
            return el;
          },
          declareReady() {
            if (this._isReady) return;
            this._isReady = true;
            if (this.host) {
              const queue = pendingProxies.get(this.host);
              if (queue) {
                pendingProxies.delete(this.host);
                queue.forEach(({ method, args }) => {
                  const fn = this[method];
                  if (typeof fn === 'function') fn.apply(this, args);
                });
              }
              const entry = readyPromises.get(this.host);
              if (entry) { readyPromises.delete(this.host); entry.resolve(this); }
              const attrs = {};
              for (const attr of this.host.attributes) attrs[attr.name] = attr.value;
              ping(this._path, attrs, 'ready');
            }
          },
          save(d) { return saveRecord(this._path, d); },
          load() { return loadRecord(this._path); },
          del() { return deleteRecord(this._path); },
          async mount(el) {
            this.el = el;
            this.host = el.closest(`alp-${tagEnd}`);
            this.host?.classList.add('block', 'h-full');
            const p = this.host?.getAttribute('path')?.trim();
            if (p) this._path = p;
            reg(this._path, this);
            if (this.host) this.host.data = this;
            await this.onPing?.('mount');
            if (!this._isReady) this.declareReady();
          }
        };
      };

      const define = (tagEnd, tplFn, initState = {}) => {
        defs[tagEnd] = { initState, tplFn };
        class C extends Alp {
          tpl() { return `<div x-data="alp.mk('${tagEnd}')" x-init="mount($el)" class="h-full overflow-hidden">${tplFn('path')}</div>`; }
        }
        customElements.define(`alp-${tagEnd}`, C);
      };

      const globalFind = (s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        if (el.tagName.startsWith('ALP-')) return el.data?._isReady ? el.data : createComponentProxy(el);
        return el;
      };

      // === BUILD IMPLEMENTATION OBJECT ===
      const core = { db, pathRegistry, consoleLogs, load, loadRecord, saveRecord, deleteRecord, safeStore, define, ping, isValidPath };

      const alpImplementation = {
        ...core, fills, kit,
        find: globalFind,
        mk: (tagEnd) => mk(tagEnd, defs[tagEnd]?.initState || {}),
        path, parsePath, buildPath,
        createDb: dbManager.createDb, createStore: dbManager.createStore,
        listDbs: dbManager.listDbs, listStores: dbManager.listStores,
        hasDb: dbManager.hasDb, hasStore: dbManager.hasStore, deleteDb: dbManager.deleteDb,
        get persistent() { return dbManager.isPersistent(); }
      };

      // === BIND IMPLEMENTATION TO PROXIES ===
      alpProxy._ready = true;
      alpProxy._implementation = alpImplementation;

      kitProxy._ready = true;
      kitProxy._implementation = kit;

      fillsProxy._ready = true;
      fillsProxy._implementation = fills;

      // Also expose nested proxies on main alp object
      alpImplementation.kit = kitProxy;
      alpImplementation.fills = fillsProxy;

      console.log(`✅ Alp Dev Core${alpImplementation.persistent ? '' : ' (memory)'}`);

      // === SOURCE STORAGE ===
      const coreSrc = ['alp.js', 'core.js', 'utils/fills.js', 'utils/kit.js'];
      const storeSources = async (files) => {
        const ns = 'alp-src';
        const all = [...coreSrc, ...files.map(c => `components/${c}`)];
        await db[DEFAULT_STORE].where('name').startsWith(`${ns}.`).delete();
        await Promise.all(all.map(f =>
          fetch(v(f)).then(r => r.text()).then(src =>
            db[DEFAULT_STORE].put({ name: `${ns}.${f.replace(/\//g, '.')}`, data: src })
          )
        ));
      };

      // === COMPONENT & ALPINE LOADING ===
      const { components } = await import(v('components/index.js'));
      await Promise.all(components.map(c => import(v(`components/${c}`))));
      await storeSources(components);
      console.log(`✅ ${components.length} components loaded`);

      if (!window.Alpine) {
        await js('https://unpkg.com/alpinejs@3');
        console.log('🎨 Alpine loaded');
      }

      // === FIRE READY EVENT ===
      window.dispatchEvent(new CustomEvent('alp:ready', { detail: alpImplementation }));
      console.log('🎉 Alp Dev Ready!');

    } catch (error) {
      console.error('❌ Alp Dev failed to initialize:', error);
      throw error;
    }
  };

  // === START BOOT PROCESS ===
  document.readyState === 'loading'
    ? addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
})();
