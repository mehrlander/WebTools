================================================
FILE: README.md
================================================
# Alp

Create utilities to store and work with data in the browser.

## Core Concepts

**Data** — Data arrives from clipboard, file, API, user input. Storage is handled through IndexedDB, with automatic fallback to in-memory storage when IndexedDB is unavailable.

**Paths** — A path is an address in your data layer to an IndexedDB record. Paths can span multiple databases and stores. Components bind to a path and can watch activity on it.

**Components** — A template for UI and data. Name, HTML string, initial state, methods.

**Ping** — How you nudge components by path. `alp.ping(path, data, occasion)` notifies whatever's bound there. Receiver handles it via `onPing(occasion, data)`.

**Queues** — Proxy-based queues smooth over async timing. Call things before they're ready; calls queue and replay.

**Kits** — Adapter layer for external libraries or common functionality. Shared setup available everywhere.

---

## Versioning & Loading

Alp uses GitHub's commit SHA for cache-busting and version tracking. The framework ensures you always load the latest code without browser cache issues.

### How It Works

When you load `alp.js`, it fetches the latest commit SHA from GitHub and uses it to version all module imports:

```html
<script src="alp.js"></script>
```

The boot sequence:
1. Fetch latest commit SHA from `https://api.github.com/repos/mehrlander/Alp/commits/main`
2. Store version in `window.__alp.version` (7-char SHA or timestamp fallback)
3. Load all modules with `?v={version}` query param for cache-busting
4. Console logs current version: `📌 Alp version: 7aa350e`

### GitHub Token Authentication

To avoid GitHub API rate limits (60 requests/hour unauthenticated), pass a personal access token:

```html
<script src="alp.js?token=YOUR_GITHUB_TOKEN"></script>
```

The token is:
- Parsed from query parameters
- Stored in `window.__alp.token` and `window.__alp.isAuth`
- Used for authenticated API calls (5000 requests/hour)
- Only needs read access to public repositories

### Version Fallback

If the GitHub API is unreachable or rate-limited, versioning falls back to a timestamp:

```js
// Fallback version when SHA fetch fails
const version = Date.now().toString(36); // e.g., "lq8x9k2"
console.log('📌 Alp version: fallback (no SHA)');
```

All modules still load with cache-busting, just without the semantic GitHub SHA.

### Accessing Version Info

```js
// Get current version
window.__alp.version;  // '7aa350e' or timestamp

// Check if authenticated
window.__alp.isAuth;   // true/false

// Access token (if provided)
window.__alp.token;    // 'ghp_...' or ''
```

---

## Storage Modes

Alp automatically detects whether IndexedDB is available and falls back to in-memory storage when needed. This ensures the framework works in all environments.

### Persistent Mode (Default)

When IndexedDB is available:
- All data stored in IndexedDB via Dexie
- Data persists across page refreshes
- Multiple databases and stores supported
- Console: `✅ Alp Core loaded`

### Memory Mode (Fallback)

When IndexedDB is unavailable (Safari data URLs, certain sandboxed contexts):
- All data stored in JavaScript Map objects
- Data lost on page refresh
- Full API compatibility with Dexie interface
- Console: `✅ Alp Core loaded (memory mode)` + warning

### Detection

The framework tests IndexedDB at boot by attempting to open a test database:

```js
// From utils/memory-db.js
export const isIndexedDBAvailable = async () => {
  if (typeof indexedDB === 'undefined') return false;

  try {
    const request = indexedDB.open('__alp_indexeddb_test__', 1);
    return new Promise((resolve) => {
      request.onerror = () => resolve(false);
      request.onsuccess = () => {
        request.result.close();
        indexedDB.deleteDatabase('__alp_indexeddb_test__');
        resolve(true);
      };
    });
  } catch {
    return false;
  }
};
```

This catches:
- Safari's data URL restrictions
- Private browsing limitations
- Other runtime availability issues

### Checking Storage Mode

```js
// Check if data will persist
if (alp.persistent) {
  console.log('Data persists across refreshes');
} else {
  console.warn('Data is in-memory only');
}
```

### Memory Database Implementation

The `MemoryDb` class (from `utils/memory-db.js`) provides full Dexie API compatibility:

```js
class MemoryDb {
  version(n) { /* ... */ }
  open() { /* ... */ }
  close() { /* ... */ }

  // Tables use Map for storage
  [storeName]: MemoryTable {
    async get(key) { /* ... */ }
    async put(record) { /* ... */ }
    async delete(key) { /* ... */ }
    async toArray() { /* ... */ }
    where(field).startsWith(prefix) { /* ... */ }
  }
}
```

All database operations work identically in both modes—the only difference is persistence.

---

## Defining Components

Components are defined with a name, template function, and initial state:

```js
alp.define('counter', pathAttr => `
  <div>
    <button @click="count++">+</button>
    <span x-text="count"></span>
    <button @click="save({ count })">Save</button>
  </div>
`, {
  count: 0,
  async onPing(occasion) {
    if (occasion === 'mount' || occasion === 'path') {
      const data = await this.load();
      if (data) this.count = data.count;
    }
  }
});
```

Use in HTML:
```html
<alp-counter></alp-counter>
<alp-counter path="custom.path"></alp-counter>
```

The component name becomes `<alp-{name}>`. Default path is `alp.{name}`, override with `path` attribute.

---

## Working with Data

### Component-Scoped Operations

Inside a component, use `this.save()`, `this.load()`, `this.del()` to work with the component's current path:

```js
// Save to current path
await this.save({ count: 42 });

// Load from current path
const data = await this.load();

// Delete current path
await this.del();
```

### Global Operations

Use `alp.saveRecord()`, `alp.loadRecord()`, `alp.deleteRecord()` to work with any path:

```js
// Save to specific path
await alp.saveRecord('bills.electric-jan', { amount: 120 });

// Load from specific path
const data = await alp.loadRecord('bills.electric-jan');

// Delete specific path
await alp.deleteRecord('bills.electric-jan');

// Load all records, grouped by namespace
const catalog = await alp.load();
// Returns: { bills: [...], alp: [...], ... }
```

Records are stored with a `name` key following the convention `namespace.identifier`. The framework groups records by the first segment (namespace) when loading all data.

---

## Multi-Database Paths

Paths support multiple databases and stores using a qualified format:

```
[database/][store:]recordPath
```

### Path Formats

| Format | Example | Resolves To |
|--------|---------|-------------|
| Record only | `bills.jan` | AlpDB → alp → bills.jan |
| Store-qualified | `data:bills.jan` | AlpDB → data → bills.jan |
| Fully qualified | `Work/data:bills.jan` | Work → data → bills.jan |
| DB with default store | `Work/:bills.jan` | Work → alp → bills.jan |

### Path Terminology

- **Record Path**: Just the identifier (`bills.jan`)
- **Qualified Path**: Store + record (`data:bills.jan`)
- **Full Path**: Database + store + record (`Work/data:bills.jan`)

### Creating Databases and Stores

Databases and stores must be explicitly created before use:

```js
// Create a new database with stores
await alp.createDb('Work', ['invoices', 'expenses']);

// Add a store to an existing database
await alp.createStore('AlpDB', 'archive');

// List available databases
alp.listDbs();  // ['AlpDB', 'Work']

// List stores in a database
alp.listStores('Work');  // ['invoices', 'expenses']
```

### Working with Multi-DB Paths

```js
// Save to different store in default database
await alp.saveRecord('archive:bills.old', data);

// Save to different database
await alp.saveRecord('Work/invoices:2024.jan', data);

// Load from qualified path
const invoice = await alp.loadRecord('Work/invoices:2024.jan');

// Load all records (grouped by db/store)
const all = await alp.load();
// { 'AlpDB/alp': [...], 'AlpDB/archive': [...], 'Work/invoices': [...] }

// Filter by database or store
const workRecords = await alp.load({ db: 'Work' });
const archiveRecords = await alp.load({ store: 'archive' });
```

### Path Validation

Referencing a non-existent database or store throws a descriptive error:

```js
await alp.saveRecord('Unknown/store:record', data);
// Error: Database 'Unknown' not found. Use alp.createDb('Unknown', ['store']) to create it.

await alp.saveRecord('newStore:record', data);
// Error: Store 'newStore' not found in database 'AlpDB'. Use alp.createStore('AlpDB', 'newStore') to create it.
```

### Path Utilities

```js
// Parse a path into components
alp.parsePath('Work/data:bills.jan');
// { db: 'Work', store: 'data', record: 'bills.jan', full: 'Work/data:bills.jan', isDefaultDb: false, isDefaultStore: false }

// Build a path from components (omits defaults)
alp.buildPath('AlpDB', 'alp', 'bills.jan');  // 'bills.jan'
alp.buildPath('AlpDB', 'data', 'bills.jan'); // 'data:bills.jan'
alp.buildPath('Work', 'data', 'bills.jan');  // 'Work/data:bills.jan'

// Check if path is valid (db/store exist)
alp.isValidPath('Work/data:bills.jan');  // true/false
```

### Component Paths

Components can bind to any valid path:

```html
<!-- Default: AlpDB/alp -->
<alp-counter></alp-counter>

<!-- Different store -->
<alp-counter path="archive:counters.main"></alp-counter>

<!-- Different database -->
<alp-counter path="Work/data:counters.work"></alp-counter>
```

The ping system normalizes paths internally, so `bills.jan` and `AlpDB/alp:bills.jan` both notify the same registered components.

---

## The Ping System

All component lifecycle and communication flows through `onPing(occasion, data)`. This creates a unified event model:

```js
async onPing(occasion, data) {
  switch (occasion) {
    case 'mount':
      // Component initialized (awaited)
      this.widget = await this.createWidget();
      break;
    case 'path':
      // Path changed, reload data
      const record = await this.load();
      this.applyData(record);
      break;
    case 'save-record':
      // Another component saved to our path
      this.applyData(data);
      break;
    case 'delete-record':
      // Record at our path was deleted
      this.clear();
      break;
  }
}
```

### Common Occasions

| Occasion | When | Awaited? |
|----------|------|----------|
| `'mount'` | Component initialization | Yes |
| `'path'` | Path changed | No |
| `'save-record'` | Record saved at path | No |
| `'delete-record'` | Record deleted at path | No |
| `'data'` | Custom ping (default) | No |

Only `'mount'` is awaited because initialization must complete before the component declares ready. Everything else is fire-and-forget notification.

### External Pings

Send data to any component by path:

```js
// Default occasion is 'data'
alp.ping('my.path', { key: 'value' });

// Custom occasion
alp.ping('my.path', { key: 'value' }, 'refresh');
```

---

## Component Lifecycle

Components go through a specific initialization sequence:

1. **Connected** — Web component connects to DOM
2. **Render** — Template rendered with Alpine directives
3. **Mount** — `x-init` calls `mount($el)`, sets up component
4. **onPing('mount')** — Awaited initialization hook
5. **declareReady()** — Flushes queued calls, fires `onPing('ready')`

### Finding Components

Use `this.find(selector)` within a component or `alp.find(selector)` globally:

```js
// Inside a component
const child = this.find('alp-child');
child.doSomething();  // Queued if not ready, immediate if ready

// Await to ensure ready
const child = await this.find('alp-child');
console.log(child.path);  // Safe - component is ready

// Global find
const inspector = alp.find('alp-inspector');
inspector.refresh();
```

Both return a thenable proxy for components not yet ready. Method calls are queued and replayed once the component declares ready. This eliminates race conditions during initialization.

---

## Fills (Template Helpers)

Pre-built UI snippets using DaisyUI classes:

```js
const { btn, modal, toolbar, tip, pathInput } = alp.fills;

// Button with icon
btn(['sm', 'primary'], 'Save', 'save()', 'ph-floppy-disk')

// Modal wrapper
modal(`<div>content</div>`)

// Tooltip
tip(['bottom', 'xs'], '<button>Hover</button>', 'Tip text')

// Path input field
pathInput()
```

Modifier arrays support size (`xs/sm/md/lg/xl`), color (`primary/secondary/error`), and positioning.

---

## Kits (Utility Loaders)

Async loaders for third-party libraries:

```js
// JSON editor
const editor = await alp.kit.jse({
  target: el,
  props: { mode: 'tree', content: { json: {} } }
});

// Tabulator table
const table = await alp.kit.tb({
  target: el,
  data: [],
  columns: []
});

// Compression
const compressed = await alp.kit.brotli.compress(data);

// Text utilities
const hash = await alp.kit.text.sha256(str);
```

Kits handle CDN loading, initialization, and provide a consistent API.

---

## Boot Sequence

The framework loads in a specific sequence to handle versioning, storage initialization, and dependency management:

```
alp.js (entry point)
  └─ Parse token from query params (?token=...)
  └─ Fetch latest commit SHA from GitHub API
      ├─ Success: version = SHA.slice(0,7)  (e.g., '7aa350e')
      └─ Failure: version = Date.now().toString(36)  (fallback)
  └─ Set window.__alp = { version, token, isAuth }
  └─ Log version: '📌 Alp version: {sha|fallback}'
  └─ Import core.js?v={version}

core.js
  └─ Create proxy queues (window.alp, alp.kit, alp.fills)
  └─ Load CDN dependencies (Tailwind, DaisyUI, Dexie, Tabulator, Phosphor icons)
  └─ Import utils (fills, kit, path, db-manager, memory-db) with version
  └─ Console capture setup
  └─ Database initialization:
      ├─ Test IndexedDB availability (isIndexedDBAvailable)
      ├─ If available: new Dexie('AlpDB')
      └─ If unavailable: new MemoryDb('AlpDB') + warning
  └─ Register default database with dbManager
  └─ Import components/index.js?v={version}
  └─ Load all component modules in parallel with version
  └─ Store source code in database (for inspection)
  └─ Load Alpine.js (triggers alpine:init event)
  └─ Bind real implementations to proxy queues
  └─ Log: '✅ Alp Core loaded [(memory mode)]'
```

### Proxy Queue System

The proxy queue allows calling methods before implementations load:

```js
// Early in boot - alp is just a proxy queue
window.alp.saveRecord('data.foo', { bar: 123 });  // Queued!

// Later in boot - real implementation bound
window.alp.bind(realAlpImplementation);  // Queue replays
```

This eliminates timing issues:
- Reference `alp.kit.jse()` in component definitions
- Call `alp.saveRecord()` before core.js loads
- Use `alp.fills.btn()` before fills.js imports

All calls queue and replay in order once the real implementation binds. The same pattern applies to `alp.kit` (nested proxy) and `alp.fills`.

---

## Debug & Internals

### Console Capture

Core.js intercepts console methods and stores the last 100 entries in `alp.consoleLogs`:

```js
alp.consoleLogs
// [{ type: 'log', time: '10:32:15 AM', args: '...' }, ...]
```

Useful for building in-app debug panels or capturing errors before devtools opened.

### Storage Persistence

Check whether data persists across page refreshes:

```js
// Check storage mode
alp.persistent  // true = IndexedDB, false = memory

// Example: warn users in memory mode
if (!alp.persistent) {
  alert('⚠️ Running in memory mode. Data will not persist.');
}
```

Useful for displaying warnings or disabling features that require persistence.

### Inspector

The framework includes an inspector component that auto-mounts a settings icon in the bottom-right corner. Click to browse all stored records, edit data with a JSON editor, and monitor saves/deletes in real-time.

### Direct Database Access

The default Dexie instance is exposed for advanced queries:

```js
// Get all records from default store
await alp.db.alp.toArray()

// Query by prefix
await alp.db.alp.where('name').startsWith('bills.').toArray()
```

For multi-database access, use the database management API:

```js
// Check what databases/stores exist
alp.listDbs();           // ['AlpDB', 'Work']
alp.listStores('Work');  // ['invoices', 'expenses']

// Check existence
alp.hasDb('Work');              // true
alp.hasStore('Work', 'invoices'); // true
```

---

## Example: Counter Component

Here's a complete example showing common patterns:

```js
alp.define('counter', pathAttr => `
  <div class="card p-4">
    <div class="flex gap-2 items-center">
      <button @click="count--" class="btn">-</button>
      <div x-text="count" class="text-xl"></div>
      <button @click="count++" class="btn">+</button>
    </div>
    <div class="mt-2">
      <button @click="save({ count })" class="btn btn-primary">Save</button>
      <button @click="load().then(d => d && (count = d.count))" class="btn">Load</button>
    </div>
    <div class="text-xs" x-text="_path"></div>
  </div>
`, {
  count: 0,

  async onPing(occasion) {
    if (occasion === 'mount' || occasion === 'path') {
      const data = await this.load();
      if (data) this.count = data.count;
    }
    if (occasion === 'save-record') {
      this.count = data.count;
    }
  }
});
```

This counter:
- Increments/decrements a count
- Saves/loads from IndexedDB at its path
- Reloads when path changes
- Updates when another component saves to its path
- Shows current path for debugging



================================================
FILE: alp-dev.js
================================================
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



================================================
FILE: alp.js
================================================
// alp.js - Minimal entry point with GitHub SHA-based versioning
(() => {
  'use strict';
  
  // Prevent multiple initialization
  if (window.__alp_init) return;
  window.__alp_init = true;
  
  // === PROXY QUEUE (immediately available) ===
  const qProxy = (opts = {}) => new Proxy(() => {}, (() => {
    let t, ready = 0, q = [];
    const { nested, onReady, props } = opts;
    const go = () => {
      if (!(ready & 3) || !t) return;
      while (q.length) {
        const [path, a] = q.shift();
        let obj = t;
        for (const k of path) obj = obj[k];
        obj(...a);
      }
    };
    if (onReady) onReady(() => { ready |= 2; go(); });
    else ready |= 2;
    return {
      get: (_, k) => k === '__q' ? 1
        : k === 'bind' ? o => (t = o, ready |= 1, go(), o)
        : props?.[k] !== undefined ? props[k]
        : nested
          ? new Proxy(() => {}, {
              apply: (_, __, a) => { if ((ready & 3) && t) return t[k](...a); q.push([[k], a]); },
              get: (_, m) => (...a) => { if ((ready & 3) && t) return t[k][m](...a); q.push([[k, m], a]); }
            })
          : (ready & 3) && t && (k in t) && typeof t[k] !== 'function'
            ? t[k]
            : (...a) => { if ((ready & 3) && t) return t[k](...a); q.push([[k], a]); },
      apply: (_, __, a) => { if ((ready & 3) && t) return t(...a); q.push([[], a]); }
    };
  })());
  
  const alpineReady = go => document.addEventListener('alpine:init', go, { once: 1 });
  const kitProxy = qProxy({ onReady: alpineReady, nested: true });
  const fillsProxy = qProxy({ onReady: alpineReady });
  window.alp = qProxy({ onReady: alpineReady, props: { kit: kitProxy, fills: fillsProxy } });
  
  // === AUTH & VERSIONING ===
  const params = new URL(document.currentScript.src).searchParams;
  const GH_TOKEN = params.get('token') || '';
  const isAuth = GH_TOKEN && !GH_TOKEN.includes('🎟');
  const getHeaders = () => isAuth ? { 'Authorization': `Bearer ${GH_TOKEN.trim()}` } : {};
  const BASE = document.currentScript?.src.replace(/[^/]+$/, '') || '';
  
  console.log(`🏔️ Alp | ${isAuth ? '🔐 authenticated' : '🔓 anonymous'}${GH_TOKEN ? ` | token: ${GH_TOKEN.slice(0, 8)}…` : ''}`);
  
  const fetchSha = async () => {
    try {
      const res = await fetch('https://api.github.com/repos/mehrlander/Alp/commits/main', { headers: getHeaders() });
      const remaining = res.headers.get('x-ratelimit-remaining');
      if (!res.ok) throw new Error(res.status);
      const sha = (await res.json()).sha?.slice(0, 7);
      console.log(`📌 ${sha} | rate: ${remaining}`);
      return sha;
    } catch (err) {
      console.warn('⚠️ SHA fetch failed:', err.message);
      return null;
    }
  };
  
  const boot = async () => {
    const sha = await fetchSha();
    const version = sha || Date.now().toString(36);
    window.__alp = { version, token: GH_TOKEN, isAuth, base: BASE };
    await import(`${BASE}core.js?v=${version}`);
  };
  
  document.readyState === 'loading'
    ? addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
})();



================================================
FILE: bill-browser.html
================================================
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WA Legislature Bill Browser</title>
  <script src="https://cdn.jsdelivr.net/gh/mehrlander/Alp@main/alp.js"></script>
</head>
<body class="bg-base-200 p-4 h-full flex flex-col overflow-hidden">
  <div x-data="billBrowser()" class="flex-1 flex flex-col min-h-0" x-init="init()">
    <!-- Header with Biennium Buttons --> 
    <div class="mb-4">
      <h1 class="text-xl font-bold mb-2">WA Legislature Bill Browser</h1>
      <p class="text-xs text-base-content/70 mb-3">Click a biennium to load bills from the WA Legislature website</p>
      <div class="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
        <template x-for="bi in bienniums" :key="bi">
          <button
            @click="loadBiennium(bi)"
            class="btn btn-xs biennium-btn"
            :class="loaded.has(bi) ? 'btn-primary' : 'btn-outline'"
            x-text="bi"
            :disabled="loading === bi">
          </button>
        </template>
      </div>
    </div>

    <!-- Bill Table Component -->
    <div class="flex-1 min-h-0 border rounded-lg overflow-hidden bg-base-100">
      <alp-bill-table path="bills.browser"></alp-bill-table>
    </div>

    <!-- Viewer Panels (optional - for displaying selected bill content) -->
    <div class="mt-4 flex gap-2 h-64" x-show="showViewers">
      <div class="flex-1 flex flex-col">
        <div class="text-xs font-semibold mb-1">XML View</div>
        <iframe name="xml-viewer" class="flex-1 border rounded bg-white"></iframe>
      </div>
      <div class="flex-1 flex flex-col">
        <div class="text-xs font-semibold mb-1">HTML View</div>
        <iframe name="htm-viewer" class="flex-1 border rounded bg-white"></iframe>
      </div>
    </div>

    <!-- Footer Controls -->
    <div class="mt-2 flex justify-between items-center text-xs">
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" class="checkbox checkbox-xs" x-model="showViewers">
        <span>Show Document Viewers</span>
      </label>
      <span class="text-base-content/50" x-text="loading ? 'Loading ' + loading + '...' : ''"></span>
    </div>
  </div>

  <script>
    function billBrowser() {
      return {
        bienniums: ['2025-26', '2023-24', '2021-22', '2019-20', '2017-18', '2015-16', '2013-14', '2011-12', '2009-10', '2007-08', '2005-06', '2003-04'],
        loaded: new Set(),
        loading: null,
        showViewers: false,
        billTable: null,

        init() {
          // Wait for component to be ready
          this.$nextTick(() => {
            const el = this.$el.querySelector('alp-bill-table');
            // Poll until component data is available
            const check = setInterval(() => {
              if (el.data) {
                this.billTable = el.data;
                this.loaded = this.billTable.loaded;

                // Add row click handler to show in viewers
                if (this.billTable.table) {
                  this.billTable.table.on('rowClick', (e, row) => {
                    const d = row.getData();
                    if (this.showViewers) {
                      this.$el.querySelector('[name="xml-viewer"]').src = d.urlXml;
                      this.$el.querySelector('[name="htm-viewer"]').src = d.urlHtm;
                    }
                  });
                }
                clearInterval(check);
              }
            }, 100);
          });
        },

        async loadBiennium(bi) {
          if (!this.billTable || this.loaded.has(bi)) return;

          this.loading = bi;
          try {
            await this.billTable.fetchBiennium(bi);
            this.loaded = new Set(this.billTable.loaded);
          } catch (e) {
            console.error('Failed to load biennium:', bi, e);
            alert('Failed to load ' + bi + ': ' + e.message);
          } finally {
            this.loading = null;
          }
        }
      };
    }
  </script>
</body>
</html>



================================================
FILE: core.js
================================================
// core.js - Alp Framework Core Module
const VERSION = window.__alp?.version || '';
const versionSuffix = VERSION ? `?v=${VERSION}` : '';

const BASE = (() => {
  try {
    const url = new URL(import.meta.url);
    url.search = '';
    return url.href.replace(/[^/]+$/, '');
  } catch { return ''; }
})();

const v = (path) => `${BASE}${path}${versionSuffix}`;

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

// === PUBLIC API ===
const core = { db, pathRegistry, consoleLogs, load, loadRecord, saveRecord, deleteRecord, safeStore, define, ping, isValidPath };

export const alp = {
  ...core, fills, kit,
  find: globalFind,
  mk: (tagEnd) => mk(tagEnd, defs[tagEnd]?.initState || {}),
  path, parsePath, buildPath,
  createDb: dbManager.createDb, createStore: dbManager.createStore,
  listDbs: dbManager.listDbs, listStores: dbManager.listStores,
  hasDb: dbManager.hasDb, hasStore: dbManager.hasStore, deleteDb: dbManager.deleteDb,
  get persistent() { return dbManager.isPersistent(); }
};

// === BIND PROXIES ===
window.alp.bind(alp);
window.alp.kit.bind(alp.kit);
window.alp.fills.bind(alp.fills);
console.log(`✅ Alp Core${alp.persistent ? '' : ' (memory)'}`);

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



================================================
FILE: db-canvas.html
================================================
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DB Canvas - Notes & Form</title>
  <script src="alp.js"></script>
</head>
<body class="bg-base-200 min-h-dvh p-4">

  <div class="max-w-4xl mx-auto space-y-4">
    <alp-notes></alp-notes>
    <alp-form></alp-form>
  </div>

  <script>
    const { pathInput, btn, toolbar } = alp.fills;

    alp.define('notes', _ => `
      <div class="bg-base-100 p-4 rounded-lg shadow">
        ${toolbar([],
          '<div class="text-sm font-semibold">Notes</div>',
          pathInput()
        )}
        <textarea
          x-model="text"
          @blur="save({ text })"
          class="textarea textarea-bordered w-full h-24"
          placeholder="Notes..."></textarea>
      </div>
    `, {
      text: '',
      async onPing(occasion, data) {
        if (occasion === 'mount' || occasion === 'path' || occasion === 'save-record') {
          const record = data ?? await this.load();
          this.text = record?.text || '';
        }
      }
    });

    alp.define('form', _ => `
      <div class="bg-base-100 p-4 rounded-lg shadow space-y-3">
        ${toolbar([],
          `<div class="flex items-center gap-2">
            ${btn(['sm', 'primary'], 'Add Row', 'addRow()', 'ph-plus')}
            ${btn(['sm', 'outline'], 'Log Data', 'logData()', 'ph-terminal')}
          </div>`,
          pathInput()
        )}
        <div name="form-table"></div>
      </div>
    `, {
      table: null,
      async onPing(occasion) {
        switch (occasion) {
          case 'mount':
          case 'path':
          case 'save-record':
          case 'delete-record':
            await this.loadTable();
            break;
        }
      },
      async loadTable() {
        const loaded = await this.load();
        const data = loaded?.rows || [];

        const fields = [...new Set(data.flatMap(Object.keys))];
        const columns = (fields.length ? fields : ['key', 'value'])
          .map(k => ({ title: k, field: k, editor: 'input' }));

        if (this.table) {
          this.table.setColumns(columns);
          this.table.setData(data);
        } else {
          this.table = await alp.kit.tb({
            target: this.find('[name="form-table"]'),
            data,
            layout: 'fitColumns',
            addRowPos: 'bottom',
            columns
          });
          ['cellEdited', 'rowAdded', 'rowDeleted'].forEach(e =>
            this.table.on(e, () => this.save({ rows: this.table.getData() }))
          );
        }
      },
      addRow() {
        this.table?.addRow({});
      },
      logData() {
        console.table(this.table.getColumnDefinitions());
        console.table(this.table.getData());
      }
    });
  </script>

</body>
</html>



================================================
FILE: example-dev.html
================================================
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alp Dev - Fail-Fast Testing</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      background: #f5f5f5;
    }
    .test-section {
      background: white;
      padding: 1.5rem;
      margin: 1rem 0;
      border-radius: 8px;
      border-left: 4px solid #0066cc;
    }
    .test-section.error {
      border-left-color: #cc0000;
    }
    .test-section.success {
      border-left-color: #00cc00;
    }
    h1 { color: #333; }
    h2 { color: #666; font-size: 1.2rem; margin-top: 0; }
    pre {
      background: #f9f9f9;
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
    }
    .status {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 600;
      margin-left: 0.5rem;
    }
    .status.pending { background: #ffeaa7; color: #d63031; }
    .status.pass { background: #55efc4; color: #00b894; }
    .status.fail { background: #ff7675; color: #d63031; }
  </style>
</head>
<body>
  <h1>🏔️ Alp Dev - Fail-Fast Proxy Testing</h1>

  <div class="test-section">
    <h2>About This Test</h2>
    <p>This page tests the new <strong>alp-dev.js</strong> with fail-fast error reporting.</p>
    <ul>
      <li><strong>Test 1:</strong> Calls alp methods <em>before ready</em> - should show big red error modal</li>
      <li><strong>Test 2:</strong> Uses <code>defer</code> attribute - should work correctly</li>
      <li><strong>Test 3:</strong> Listens for <code>alp:ready</code> event - should work correctly</li>
      <li><strong>Test 4:</strong> Tests nested properties like <code>alp.kit</code> and <code>alp.fills</code></li>
    </ul>
  </div>

  <div class="test-section error">
    <h2>Test 1: Call Before Ready <span class="status pending">SHOULD ERROR</span></h2>
    <p>This test intentionally calls <code>alp.saveRecord()</code> before Alp is ready.</p>
    <p><strong>Expected:</strong> Big red error modal with instructions</p>
    <div id="test1-result"></div>
  </div>

  <div class="test-section success">
    <h2>Test 2: Using defer <span class="status pending" id="test2-status">PENDING</span></h2>
    <p>This test uses the <code>defer</code> attribute to wait for Alp to load.</p>
    <p><strong>Expected:</strong> Successful save to database</p>
    <div id="test2-result"></div>
  </div>

  <div class="test-section success">
    <h2>Test 3: Using alp:ready Event <span class="status pending" id="test3-status">PENDING</span></h2>
    <p>This test listens for the <code>alp:ready</code> event before calling methods.</p>
    <p><strong>Expected:</strong> Successful save to database</p>
    <div id="test3-result"></div>
  </div>

  <div class="test-section success">
    <h2>Test 4: Nested Properties <span class="status pending" id="test4-status">PENDING</span></h2>
    <p>This test accesses nested properties like <code>alp.fills.btn()</code>.</p>
    <p><strong>Expected:</strong> Successful creation of UI elements</p>
    <div id="test4-result"></div>
  </div>

  <div class="test-section">
    <h2>Database Records</h2>
    <p>After tests complete, check the inspector to see saved records.</p>
    <div id="records-result"></div>
  </div>

  <!-- Load alp-dev.js -->
  <script type="module" src="alp-dev.js"></script>

  <!-- TEST 1: This should ERROR (called too early) -->
  <script type="module">
    console.log('🧪 TEST 1: Calling before ready (should show error modal)');
    try {
      alp.saveRecord('test-items.test1', { test: 1, timestamp: new Date().toISOString() });
      document.getElementById('test1-result').innerHTML = '<pre style="color: red;">❌ FAIL: Should have thrown an error!</pre>';
    } catch (error) {
      document.getElementById('test1-result').innerHTML = `<pre style="color: green;">✅ PASS: Error thrown as expected\n\nError: ${error.message}</pre>`;
    }
  </script>

  <!-- TEST 2: This should WORK (deferred) -->
  <script type="module" defer>
    console.log('🧪 TEST 2: Calling with defer (should work)');
    try {
      await alp.saveRecord('test-items.test2', {
        test: 2,
        timestamp: new Date().toISOString(),
        method: 'defer attribute'
      });
      document.getElementById('test2-status').textContent = 'PASS';
      document.getElementById('test2-status').className = 'status pass';
      document.getElementById('test2-result').innerHTML = '<pre style="color: green;">✅ PASS: Record saved successfully with defer</pre>';
    } catch (error) {
      document.getElementById('test2-status').textContent = 'FAIL';
      document.getElementById('test2-status').className = 'status fail';
      document.getElementById('test2-result').innerHTML = `<pre style="color: red;">❌ FAIL: ${error.message}</pre>`;
    }
  </script>

  <!-- TEST 3: This should WORK (event listener) -->
  <script type="module">
    console.log('🧪 TEST 3: Setting up alp:ready listener');
    window.addEventListener('alp:ready', async () => {
      console.log('🧪 TEST 3: alp:ready event fired, running test');
      try {
        await alp.saveRecord('test-items.test3', {
          test: 3,
          timestamp: new Date().toISOString(),
          method: 'alp:ready event'
        });
        document.getElementById('test3-status').textContent = 'PASS';
        document.getElementById('test3-status').className = 'status pass';
        document.getElementById('test3-result').innerHTML = '<pre style="color: green;">✅ PASS: Record saved successfully with event listener</pre>';
      } catch (error) {
        document.getElementById('test3-status').textContent = 'FAIL';
        document.getElementById('test3-status').className = 'status fail';
        document.getElementById('test3-result').innerHTML = `<pre style="color: red;">❌ FAIL: ${error.message}</pre>`;
      }
    });
  </script>

  <!-- TEST 4: Nested properties (deferred) -->
  <script type="module" defer>
    console.log('🧪 TEST 4: Testing nested properties (fills, kit)');
    try {
      // Test alp.fills
      const button = alp.fills.btn('primary', 'Test Button', 'alert("clicked")');

      // Test alp.kit (just check it exists and is accessible)
      const hasKit = alp.kit !== undefined;

      if (button && hasKit) {
        document.getElementById('test4-status').textContent = 'PASS';
        document.getElementById('test4-status').className = 'status pass';
        document.getElementById('test4-result').innerHTML = `
          <pre style="color: green;">✅ PASS: Nested properties work correctly

Created button:
${button}

alp.kit available: ${hasKit}
          </pre>`;
      } else {
        throw new Error('Nested properties not accessible');
      }
    } catch (error) {
      document.getElementById('test4-status').textContent = 'FAIL';
      document.getElementById('test4-status').className = 'status fail';
      document.getElementById('test4-result').innerHTML = `<pre style="color: red;">❌ FAIL: ${error.message}\n${error.stack}</pre>`;
    }
  </script>

  <!-- Show saved records after everything loads -->
  <script type="module" defer>
    window.addEventListener('alp:ready', async () => {
      // Wait a bit for all tests to save their records
      setTimeout(async () => {
        try {
          const data = await alp.load();
          const recordsDiv = document.getElementById('records-result');

          let html = '<pre style="background: #f0f0f0; padding: 1rem; border-radius: 4px;">';
          html += 'Saved Records:\n\n';

          for (const [storePath, records] of Object.entries(data)) {
            html += `\n📁 ${storePath}\n`;
            for (const record of records) {
              if (record.key.startsWith('test-items.')) {
                html += `  ├─ ${record.key}\n`;
                html += `  │  ${JSON.stringify(record.data, null, 2).split('\n').join('\n  │  ')}\n`;
              }
            }
          }

          html += '</pre>';
          recordsDiv.innerHTML = html;
        } catch (error) {
          document.getElementById('records-result').innerHTML =
            `<pre style="color: red;">Error loading records: ${error.message}</pre>`;
        }
      }, 1000);
    });
  </script>
</body>
</html>



================================================
FILE: example.html
================================================
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alp - Hello World</title>
</head>
<body class="p-8">
  <!--
    Minimal Alp example - open this file in a browser to verify it works.
    For more examples and tutorials, see FirstSamples.md
  -->

  <h1 class="text-3xl font-bold mb-4">Alp Counter</h1>
  <alp-counter></alp-counter>

  <script src="https://cdn.jsdelivr.net/gh/mehrlander/Alp@main/alp.js?token=🎟️GitHubToken"></script>
  <script>
    alp.define('counter', () => `
      <div class="card bg-base-200 p-6 max-w-xs">
        <div class="flex items-center gap-4">
          <button @click="count--" class="btn btn-circle">-</button>
          <span class="text-3xl font-bold" x-text="count"></span>
          <button @click="count++" class="btn btn-circle">+</button>
        </div>
      </div>
    `, { count: 0 });
  </script>
</body>
</html>



================================================
FILE: FirstSamples.md
================================================
# Alp Framework - First Samples

Copy-paste these examples into an HTML file to try Alp. Each builds on the previous one.

> **Note:** The `🎟️GitHubToken` placeholder in the script URLs will be automatically replaced with your GitHub token if you're viewing this through a token-aware system. If copying manually, you can either replace it with your own GitHub token to avoid API rate limits, or simply remove the `?token=...` parameter entirely—the framework will still work.

---

## Example 1: Basic Counter

The simplest Alp component. Click the buttons to change the count.

**What you'll learn:** Defining components, state management, template syntax.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alp - Basic Counter</title>
</head>
<body class="p-8">
  <h1 class="text-3xl font-bold mb-4">Basic Counter</h1>

  <alp-counter></alp-counter>

  <script src="https://cdn.jsdelivr.net/gh/mehrlander/Alp@main/alp.js?token=🎟️GitHubToken"></script>
  <script>
    alp.define('counter', () => `
      <div class="card bg-base-200 p-6 max-w-xs">
        <div class="flex items-center gap-4">
          <button @click="count--" class="btn btn-circle">-</button>
          <span class="text-3xl font-bold" x-text="count"></span>
          <button @click="count++" class="btn btn-circle">+</button>
        </div>
      </div>
    `, { count: 0 });
  </script>
</body>
</html>
```

**Key concepts:**
- `alp.define(name, template, initialState)` creates a component
- Use `<alp-{name}>` to place the component in HTML
- `x-text="count"` displays reactive state
- `@click="count++"` handles events (Alpine.js syntax)

---

## Example 2: Persistent Note

A note that saves to IndexedDB. Your text persists across page refreshes.

**What you'll learn:** Data persistence with `save()`, `load()`, `del()`, and path binding.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alp - Persistent Note</title>
</head>
<body class="p-8">
  <h1 class="text-3xl font-bold mb-4">Persistent Note</h1>

  <!-- Default path: alp.note -->
  <alp-note></alp-note>

  <!-- Custom path: notes.shopping -->
  <alp-note path="notes.shopping" class="mt-4"></alp-note>

  <script src="https://cdn.jsdelivr.net/gh/mehrlander/Alp@main/alp.js?token=🎟️GitHubToken"></script>
  <script>
    alp.define('note', () => `
      <div class="card bg-base-200 p-6 max-w-md">
        <div class="text-sm opacity-60 mb-2">
          Path: <span x-text="_path"></span>
        </div>
        <textarea
          x-model="text"
          class="textarea textarea-bordered w-full h-24"
          placeholder="Type something..."
        ></textarea>
        <div class="flex gap-2 mt-4">
          <button @click="save({ text })" class="btn btn-primary btn-sm">
            Save
          </button>
          <button @click="load().then(d => d && (text = d.text))" class="btn btn-sm">
            Load
          </button>
          <button @click="del(); text = ''" class="btn btn-error btn-sm">
            Clear
          </button>
        </div>
      </div>
    `, {
      text: '',
      async onPing(occasion) {
        // Auto-load data on mount or path change
        if (occasion === 'mount' || occasion === 'path') {
          const data = await this.load();
          if (data) this.text = data.text;
        }
      }
    });
  </script>
</body>
</html>
```

**Key concepts:**
- `save({ text })` stores data at the component's path in IndexedDB
- `load()` retrieves saved data; `del()` removes it
- `path="notes.shopping"` binds a component to a specific data path
- `_path` exposes the current path for display
- `onPing('mount')` is called when the component initializes
- Multiple instances of the same component can have different paths

---

## Example 3: Connected Components with Ping

Two components that communicate. Saving in one updates the other.

**What you'll learn:** The ping system for cross-component communication.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alp - Connected Components</title>
</head>
<body class="p-8">
  <h1 class="text-3xl font-bold mb-4">Connected Components</h1>
  <p class="mb-6 opacity-70">Edit in one place, see updates everywhere.</p>

  <div class="flex gap-6 flex-wrap">
    <!-- Both components share the same path -->
    <alp-editor path="shared.profile"></alp-editor>
    <alp-display path="shared.profile"></alp-display>
  </div>

  <div class="mt-8">
    <button
      onclick="alp.ping('shared.profile', { name: 'Guest', color: '#888888' }, 'reset')"
      class="btn btn-warning"
    >
      Reset via External Ping
    </button>
  </div>

  <script src="https://cdn.jsdelivr.net/gh/mehrlander/Alp@main/alp.js?token=🎟️GitHubToken"></script>
  <script>
    // Editor component - allows editing and saving
    alp.define('editor', () => `
      <div class="card bg-base-200 p-6 w-72">
        <h2 class="font-bold mb-4">Editor</h2>
        <input
          x-model="name"
          class="input input-bordered w-full mb-2"
          placeholder="Name"
        >
        <input
          type="color"
          x-model="color"
          class="w-full h-10 cursor-pointer"
        >
        <button @click="save({ name, color })" class="btn btn-primary w-full mt-4">
          Save
        </button>
      </div>
    `, {
      name: '',
      color: '#3b82f6',
      async onPing(occasion, data) {
        if (occasion === 'mount' || occasion === 'path') {
          const saved = await this.load();
          if (saved) {
            this.name = saved.name;
            this.color = saved.color;
          }
        }
        // When the OTHER component saves, we get notified
        if (occasion === 'save-record') {
          this.name = data.name;
          this.color = data.color;
        }
        // Handle external reset ping
        if (occasion === 'reset') {
          this.name = data.name;
          this.color = data.color;
        }
      }
    });

    // Display component - read-only view
    alp.define('display', () => `
      <div class="card bg-base-200 p-6 w-72">
        <h2 class="font-bold mb-4">Display</h2>
        <div
          class="text-2xl font-bold p-4 rounded text-white text-center"
          :style="'background:' + color"
          x-text="name || 'No name set'"
        ></div>
        <div class="text-sm opacity-60 mt-4">
          Path: <span x-text="_path"></span>
        </div>
      </div>
    `, {
      name: '',
      color: '#888888',
      async onPing(occasion, data) {
        if (occasion === 'mount' || occasion === 'path') {
          const saved = await this.load();
          if (saved) {
            this.name = saved.name;
            this.color = saved.color;
          }
        }
        if (occasion === 'save-record') {
          this.name = data.name;
          this.color = data.color;
        }
        if (occasion === 'reset') {
          this.name = data.name;
          this.color = data.color;
        }
      }
    });
  </script>
</body>
</html>
```

**Key concepts:**
- Components at the same path receive each other's updates
- `onPing('save-record', data)` fires when any component saves to the path
- `alp.ping(path, data, occasion)` sends custom events to components at a path
- This enables reactive UIs where changes propagate automatically

---

## Next Steps

- Check the [README](README.md) for full API documentation
- Explore multi-database paths: `myDatabase/myStore:record.name`
- Use `alp.kit` for JSON editors, tables, and other utilities
- Add `?token=YOUR_GITHUB_TOKEN` to avoid API rate limits during development

Happy building!



================================================
FILE: components/bill-table-nested.js
================================================
// components/bill-table-nested.js - Bill Table using nested alp-tb component
alp.define('bill-table-nested', _ => `
  <div class="flex flex-col h-full bg-base-100 p-2 gap-2 text-sm">
    <!-- Filters Row -->
    <div class="flex items-center gap-4 text-xs flex-wrap">
      <span class="font-semibold">Show:</span>
      <label class="flex items-center gap-1 cursor-pointer">
        <input type="checkbox" class="checkbox checkbox-xs" x-model="kindFilters.Bills" @change="applyFilters()">
        <span>Bills</span>
      </label>
      <label class="flex items-center gap-1 cursor-pointer">
        <input type="checkbox" class="checkbox checkbox-xs" x-model="kindFilters['Session Laws']" @change="applyFilters()">
        <span>Session Laws</span>
      </label>
      <label class="flex items-center gap-1 ml-auto">
        Size &gt;
        <input type="number" class="input input-xs w-16" placeholder="KB" x-model.number="sizeFilter" @input="applyFilters()">
      </label>
    </div>

    <!-- Nested TB Component -->
    <alp-tb x-ref="tb" class="flex-1"></alp-tb>

    <!-- Footer Controls -->
    <div class="flex justify-between items-center text-xs">
      <div class="flex items-center gap-2">
        <button class="btn btn-xs btn-error" @click="clearAll()">Clear All</button>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-xs btn-success" @click="loadSummaries()" :disabled="loadingSummaries" x-text="summariesText">Summaries</button>
      </div>
    </div>
  </div>
`, {
  // State
  tbRef: null,
  loaded: new Set(),

  kindFilters: { Bills: true, 'Session Laws': true },
  sizeFilter: null,

  loadingSummaries: false,
  summariesText: 'Summaries',

  // Biennium options (from leg kit)
  get bienniums() { return alp.kit.leg.bienniums; },
  get types() { return alp.kit.leg.types; },

  // Handle all lifecycle events
  async onPing(occasion) {
    if (occasion === 'mount') {
      // Wait for Alpine to process the nested component
      await this.$nextTick();

      // Get reference to the nested tb component
      const tbEl = this.$refs.tb;
      if (tbEl && tbEl._x_dataStack) {
        this.tbRef = tbEl._x_dataStack[0];

        // Configure the tb component with bill-specific columns
        this.tbRef.configure({
          columns: [
            { title: 'Doc Id', field: 'docId' },
            { title: 'Bill Id', field: 'billId' },
            { title: 'Bill No', field: 'billNo' },
            { title: 'Name', field: 'name' },
            { title: 'File Name', field: 'fileName' },
            { title: 'Date', field: 'date', sorter: 'datetime', sorterParams: { format: 'yyyy-MM-dd' } },
            { title: 'Size', field: 'size' },
            { title: 'Compressed', field: 'compressedSize' },
            { title: 'Chamber', field: 'chamber' },
            { title: 'Biennium', field: 'biennium' },
            { title: 'Kind', field: 'kind' },
            { title: 'Total $', field: 'totalDollarAmount', formatter: 'money', formatterParams: { thousand: ',', precision: 0 } },
            { title: 'Description', field: 'description' }
          ],
          zipMapper: d => {
            const urlHtm = d.urlXml.replace(/xml/gi, 'htm');
            const basePath = `${d.biennium}/${d.kind}/${d.chamber}/${d.name}`;
            return [
              { path: `${basePath}.xml`, url: d.urlXml },
              { path: `${basePath}.htm`, url: urlHtm }
            ];
          }
        });
      }

      // Load persisted data
      const saved = await this.load();
      if (saved?.tableData && this.tbRef) {
        this.tbRef.setData(saved.tableData);
        this.loaded = new Set(saved.loaded || []);
      }
    }
  },

  // Filter logic - applies to the nested tb's table
  applyFilters() {
    if (!this.tbRef?.table) return;
    this.tbRef.table.setFilter(row => {
      // Size filter
      if (this.sizeFilter && row.size <= this.sizeFilter) return false;
      // Kind filter
      if (!this.kindFilters[row.kind]) return false;
      return true;
    });
  },

  // Fetch bills for a biennium (uses leg kit)
  async fetchBiennium(biennium) {
    if (this.loaded.has(biennium)) {
      console.log('Already loaded:', biennium);
      return;
    }
    console.log('Loading all kinds for:', biennium);

    const data = await alp.kit.leg(biennium);
    // Add placeholder description for UI
    data.forEach(item => {
      if (item.description === null) item.description = 'Click "Summaries" to load';
      if (item._children) {
        item._children.forEach(child => {
          if (child.description === null) child.description = 'Click "Summaries" to load';
        });
      }
    });
    console.log('Loaded:', data.length, 'rows');

    if (this.tbRef?.table) {
      this.tbRef.table.addData(data);
    }

    this.loaded.add(biennium);
    await this.persist();
  },

  // Add data directly (for external use)
  async addData(data, source = 'external') {
    if (this.tbRef?.table) {
      this.tbRef.table.addData(data);
    }
    this.loaded.add(source);
    await this.persist();
  },

  // Persist current state
  async persist() {
    await this.save({
      tableData: this.getData(),
      loaded: [...this.loaded]
    });
  },

  // Clear all data
  async clearAll() {
    if (this.tbRef) {
      this.tbRef.setData([]);
    }
    this.loaded.clear();
    this.sizeFilter = null;
    await this.del();
  },

  // Load summaries for visible rows
  async loadSummaries() {
    console.log('Loading summaries - button clicked');
    if (!this.tbRef?.table) return;

    const rows = this.tbRef.table.getRows('visible');
    console.log('Processing', rows.length, 'visible rows');

    this.loadingSummaries = true;

    try {
      for (let i = 0; i < rows.length; i++) {
        const d = rows[i].getData();
        if (d.description === 'Click "Summaries" to load') {
          this.summariesText = `Loading ${i + 1}/${rows.length}`;
          rows[i].update({ description: 'Loading...' });

          try {
            const { description, totalDollarAmount, xml } = await alp.kit.leg.fetchBillSummary(d.urlXml);
            const compressedSize = Math.round(await alp.kit.gzip.sizeOf(xml) / 1024);

            rows[i].update({
              description: description || 'No description',
              totalDollarAmount,
              compressedSize
            });
            console.log('Loaded', d.name, '- $', totalDollarAmount, '- Compressed:', compressedSize, 'KB');
          } catch (e) {
            console.error('Failed to load', d.name, e);
            rows[i].update({ description: 'Error loading' });
          }
        }
      }
      await this.persist();
    } finally {
      this.loadingSummaries = false;
      this.summariesText = 'Summaries';
    }
    console.log('Done loading summaries');
  },

  // Get all data (for external use)
  getData() {
    return this.tbRef?.getData() || [];
  },

  // Get visible data (for external use)
  getVisibleData() {
    return this.tbRef?.getVisibleData() || [];
  }
});



================================================
FILE: components/bill-table.js
================================================
// components/bill-table.js - WA Legislature Bill Table Component
alp.define('bill-table', _ => `
  <div class="flex flex-col h-full bg-base-100 p-2 gap-2 text-sm">
    <!-- Filters Row -->
    <div class="flex items-center gap-4 text-xs flex-wrap">
      <span class="font-semibold">Show:</span>
      <label class="flex items-center gap-1 cursor-pointer">
        <input type="checkbox" class="checkbox checkbox-xs" x-model="kindFilters.Bills" @change="applyFilters()">
        <span>Bills</span>
      </label>
      <label class="flex items-center gap-1 cursor-pointer">
        <input type="checkbox" class="checkbox checkbox-xs" x-model="kindFilters['Session Laws']" @change="applyFilters()">
        <span>Session Laws</span>
      </label>
      <label class="flex items-center gap-1 ml-auto">
        Size &gt;
        <input type="number" class="input input-xs w-16" placeholder="KB" x-model.number="sizeFilter" @input="applyFilters()">
      </label>
    </div>

    <!-- Table Container -->
    <div name="table"></div>

    <!-- Footer Controls -->
    <div class="flex justify-between items-center text-xs">
      <div class="flex items-center gap-2">
        <span x-text="rowCount + ' rows'"></span>
        <button class="btn btn-xs btn-error" @click="clearAll()">Clear All</button>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-xs btn-secondary" @click="downloadData()">Download Data</button>
        <button class="btn btn-xs btn-primary" @click="downloadZip()" :disabled="downloading" x-text="downloadText">Download Zip</button>
        <button class="btn btn-xs btn-success" @click="loadSummaries()" :disabled="loadingSummaries" x-text="summariesText">Summaries</button>
      </div>
    </div>
  </div>
`, {
  // State
  table: null,
  loaded: new Set(),

  kindFilters: { Bills: true, 'Session Laws': true },
  sizeFilter: null,

  rowCount: 0,
  downloading: false,
  downloadText: 'Download Zip',
  loadingSummaries: false,
  summariesText: 'Summaries',

  // Biennium options (from leg kit)
  get bienniums() { return alp.kit.leg.bienniums; },
  get types() { return alp.kit.leg.types; },

  // Handle all lifecycle events
  async onPing(occasion) {
    if (occasion === 'mount') {
      this.table = await alp.kit.tb({
        target: this.find('[name="table"]'),
        layout: 'fitData',
        height: '300px',
        columns: [
          { title: 'Doc Id', field: 'docId' },
          { title: 'Bill Id', field: 'billId' },
          { title: 'Bill No', field: 'billNo' },
          { title: 'Name', field: 'name' },
          { title: 'File Name', field: 'fileName' },
          { title: 'Date', field: 'date', sorter: 'datetime', sorterParams: { format: 'yyyy-MM-dd' } },
          { title: 'Size', field: 'size' },
          { title: 'Compressed', field: 'compressedSize' },
          { title: 'Chamber', field: 'chamber' },
          { title: 'Biennium', field: 'biennium' },
          { title: 'Kind', field: 'kind' },
          { title: 'Total $', field: 'totalDollarAmount', formatter: 'money', formatterParams: { thousand: ',', precision: 0 } },
          { title: 'Description', field: 'description' }
        ]
      });

      this.table.on('dataFiltered', (filters, rows) => this.rowCount = rows.length);
      this.table.on('dataLoaded', data => this.rowCount = data.length);

      // Load persisted data
      const saved = await this.load();
      if (saved?.tableData) {
        this.table.setData(saved.tableData);
        this.loaded = new Set(saved.loaded || []);
      }
    }
  },

  // Filter logic
  applyFilters() {
    this.table.setFilter(row => {
      // Size filter
      if (this.sizeFilter && row.size <= this.sizeFilter) return false;
      // Kind filter
      if (!this.kindFilters[row.kind]) return false;
      return true;
    });
  },

  // Fetch bills for a biennium (uses leg kit)
  async fetchBiennium(biennium) {
    if (this.loaded.has(biennium)) {
      console.log('Already loaded:', biennium);
      return;
    }
    console.log('Loading all kinds for:', biennium);

    const data = await alp.kit.leg(biennium);
    // Add placeholder description for UI
    data.forEach(item => {
      if (item.description === null) item.description = 'Click "Summaries" to load';
      if (item._children) {
        item._children.forEach(child => {
          if (child.description === null) child.description = 'Click "Summaries" to load';
        });
      }
    });
    console.log('Loaded:', data.length, 'rows');
    this.table.addData(data);

    this.loaded.add(biennium);
    await this.persist();
  },

  // Add data directly (for external use)
  async addData(data, source = 'external') {
    this.table.addData(data);
    this.loaded.add(source);
    await this.persist();
  },

  // Persist current state
  async persist() {
    await this.save({
      tableData: this.table.getData(),
      loaded: [...this.loaded]
    });
  },

  // Clear all data
  async clearAll() {
    this.table.setData([]);
    this.loaded.clear();
    this.sizeFilter = null;
    await this.del();
  },

  // Download data as JSON
  downloadData() {
    alp.kit.tb.downloadJson(this.table, { filename: 'wa-legislature-data' });
  },

  // Download visible rows as ZIP
  async downloadZip() {
    const rows = this.table.getRows('visible');
    if (!rows.length) {
      alert('No files to download');
      return;
    }

    this.downloading = true;
    this.downloadText = 'Preparing...';

    try {
      await alp.kit.tb.downloadZip(this.table, {
        filename: 'wa-legislature-files.zip',
        fileMapper: d => {
          const urlHtm = d.urlXml.replace(/xml/gi, 'htm');
          const basePath = `${d.biennium}/${d.kind}/${d.chamber}/${d.name}`;
          return [
            { path: `${basePath}.xml`, url: d.urlXml },
            { path: `${basePath}.htm`, url: urlHtm }
          ];
        },
        onProgress: (current, total, data) => {
          this.downloadText = data ? `Downloading ${current + 1}/${total}` : 'Generating zip...';
        }
      });
    } finally {
      this.downloading = false;
      this.downloadText = 'Download Zip';
    }
  },

  // Load summaries for visible rows
  async loadSummaries() {
    console.log('Loading summaries - button clicked');
    const rows = this.table.getRows('visible');
    console.log('Processing', rows.length, 'visible rows');

    this.loadingSummaries = true;

    try {
      for (let i = 0; i < rows.length; i++) {
        const d = rows[i].getData();
        if (d.description === 'Click "Summaries" to load') {
          this.summariesText = `Loading ${i + 1}/${rows.length}`;
          rows[i].update({ description: 'Loading...' });

          try {
            const { description, totalDollarAmount, xml } = await alp.kit.leg.fetchBillSummary(d.urlXml);
            const compressedSize = Math.round(await alp.kit.gzip.sizeOf(xml) / 1024);

            rows[i].update({
              description: description || 'No description',
              totalDollarAmount,
              compressedSize
            });
            console.log('Loaded', d.name, '- $', totalDollarAmount, '- Compressed:', compressedSize, 'KB');
          } catch (e) {
            console.error('Failed to load', d.name, e);
            rows[i].update({ description: 'Error loading' });
          }
        }
      }
      await this.persist();
    } finally {
      this.loadingSummaries = false;
      this.summariesText = 'Summaries';
    }
    console.log('Done loading summaries');
  },

  // Get all data (for external use)
  getData() {
    return this.table?.getData() || [];
  },

  // Get visible data (for external use)
  getVisibleData() {
    return this.table?.getRows('visible').map(r => r.getData()) || [];
  }
});



================================================
FILE: components/index.js
================================================
export const components = [
  'inspector.js',
  'bill-table.js',
  'bill-table-nested.js',
  'tb.js',
  'tb-nested.js',
  'jse.js'
];



================================================
FILE: components/inspector.js
================================================
// components/inspector.js - Alp Inspector Component
import { alp } from '../core.js';
const { modal } = alp.fills;

alp.define('inspector', _ => modal(`
  <div class="flex-1 overflow-hidden relative">
    <div name="jse" class="absolute inset-0"></div>
  </div>
  <div class="flex bg-base-300 text-xs flex-shrink-0 p-2 items-center gap-2">
    <select class="select select-xs w-auto min-w-0" @change="goStore($event.target.value)">
      <template x-for="s in stores"><option :value="s" :selected="s === store" x-text="s"></option></template>
    </select>
    <div class="flex-1 overflow-x-auto min-w-0">
      <div class="flex gap-0.5 whitespace-nowrap">
        <template x-for="r in records" :key="r.fullPath">
          <button class="btn btn-xs" @click="goRecord(r)" :class="selected===r.fullPath?'btn-primary':'btn'">
            <span x-text="r.key"></span>
          </button>
        </template>
      </div>
    </div>
    <button class="btn btn-xs btn-error btn-outline" @click="clear()">Clear</button>
  </div>
`), {
  store: 'AlpDB/alp',
  catalog: {},
  stores: [],
  records: [],
  selected: '',
  jse: null,
  _settingContent: false,
  async refresh() {
    this.catalog = await alp.load();
    this.stores = Object.keys(this.catalog);
    const target = this.catalog[this.store] ? this.store : (this.stores[0] || 'AlpDB/alp');
    if (target !== this.store || !this.records.length) {
      await this.goStore(target);
    } else {
      // Refresh records list and reload current record if it exists
      this.records = this.catalog[this.store] || [];
      if (this.selected && this.records.some(r => r.fullPath === this.selected)) {
        const r = this.records.find(r => r.fullPath === this.selected);
        await this.goRecord(r);
      } else if (this.records.length) {
        await this.goRecord(this.records[0]);
      }
    }
  },
  async goStore(s) {
    this.store = s;
    this.records = this.catalog[this.store] || [];
    this.records.length ? await this.goRecord(this.records[0]) : this.jse?.set({ json: {} });
  },
  async open() {
    this.find('dialog').showModal();
    await Alpine.nextTick();
    this.jse ||= await alp.kit.jse({
      target: this.find('[name="jse"]'),
      props: { mode: 'tree', content: { json: {} }, onChange: c => this.handleChange(c) }
    });
    await this.refresh();
  },
  async handleChange({ json }) {
    if (this.selected && !this._settingContent) {
      await alp.saveRecord(this.selected, json);
    }
  },
  async goRecord(r) {
    this.selected = r.fullPath;
    const data = await alp.loadRecord(r.fullPath);
    if (this.jse) {
      this._settingContent = true;
      await this.jse.set({ json: data || {} });
      this._settingContent = false;
    }
  },
  async clear() {
    await alp.deleteRecord(this.selected);
    await this.refresh();
  },
  onPing(occasion, payload) {
    if (occasion === 'save-record' || occasion === 'delete-record') {
      this.refresh();
    }
  }
});

// Auto-mount
const el = (t, a) => Object.assign(document.createElement(t), a);
const wrap = el('div', { className: 'fixed bottom-4 right-4 z-50' });
wrap.innerHTML = `
  <button class="text-primary" onclick="this.nextElementSibling.data.open()">
    <i class="ph ph-gear-six text-4xl"></i>
  </button>
  <alp-inspector></alp-inspector>
`;
document.body.appendChild(wrap);



================================================
FILE: components/jse.js
================================================
// components/jse.js - Lean JSON Editor wrapper
alp.define('jse', _ => `
  <div class="flex flex-col h-full bg-base-100 overflow-hidden">
    <div class="flex-1 min-h-0">
      <div name="jse" class="w-full h-full"></div>
    </div>
    <div class="flex-none bg-base-300 text-xs p-2 flex items-center gap-2 border-t border-base-200">
      <template x-if="stores.length > 1">
        <select class="select select-xs w-auto min-w-0" @change="goStore($event.target.value)" x-model="store">
          <template x-for="s in stores" :key="s">
            <option :value="s" x-text="s"></option>
          </template>
        </select>
      </template>
      <div class="flex-1 overflow-x-auto min-w-0">
        <div class="flex gap-0.5 whitespace-nowrap">
          <template x-for="r in pageRecords" :key="r.fullPath">
            <button class="btn btn-xs" @click="goRecord(r)" :class="selected === r.fullPath ? 'btn-primary' : 'btn-ghost'">
              <span x-text="r.key"></span>
            </button>
          </template>
        </div>
      </div>
      <template x-if="totalPages > 1">
        <div class="flex gap-1 items-center">
          <button class="btn btn-xs btn-ghost" @click="page = Math.max(0, page - 1)" :disabled="page <= 0">
            <i class="ph ph-caret-left"></i>
          </button>
          <span x-text="(page + 1) + '/' + totalPages"></span>
          <button class="btn btn-xs btn-ghost" @click="page = Math.min(totalPages - 1, page + 1)" :disabled="page >= totalPages - 1">
            <i class="ph ph-caret-right"></i>
          </button>
        </div>
      </template>
      <button class="btn btn-xs btn-error btn-outline" @click="delRecord()"><i class="ph ph-trash"></i></button>
      <button class="btn btn-xs btn-success btn-outline" @click="addRecord()"><i class="ph ph-plus"></i></button>
    </div>
  </div>
`, {
  jse: null,
  catalog: {},
  stores: [],
  records: [],
  store: '',
  selected: '',
  page: 0,
  pageSize: 20,
  get totalPages() { return Math.ceil(this.records.length / this.pageSize) || 1; },
  get pageRecords() {
    const start = this.page * this.pageSize;
    return this.records.slice(start, start + this.pageSize);
  },
  async onPing(occasion) {
    if (occasion === 'mount') {
      this.jse = await alp.kit.jse({
        target: this.find('[name="jse"]'),
        props: { content: { json: {} }, onChange: c => this.handleChange(c) }
      });
      await this.refresh();
    }
  },
  async refresh() {
    this.catalog = await alp.load();
    this.stores = Object.keys(this.catalog);
    const target = this.catalog[this.store] ? this.store : (this.stores[0] || 'AlpDB/alp');
    if (target !== this.store || !this.records.length) await this.goStore(target);
  },
  async goStore(s) {
    this.store = s;
    this.records = this.catalog[s] || [];
    this.page = 0;
    this.records.length ? await this.goRecord(this.records[0]) : this.jse?.set({ json: {} });
  },
  async goRecord(r) {
    this.selected = r.fullPath;
    const data = await alp.loadRecord(r.fullPath);
    await this.jse?.set({ json: data || {} });
  },
  async handleChange({ json }) {
    if (!this.selected) return;
    clearTimeout(this._save);
    this._save = setTimeout(() => alp.saveRecord(this.selected, json), 300);
  },
  async addRecord() {
    const name = prompt('Record path (e.g., namespace.key or store:namespace.key):');
    if (!name) return;
    await alp.saveRecord(name, {});
    await this.refresh();
    const r = this.records.find(x => x.fullPath === name || x.key === name);
    if (r) await this.goRecord(r);
  },
  async delRecord() {
    if (!this.selected || !confirm(`Delete "${this.selected}"?`)) return;
    await alp.deleteRecord(this.selected);
    await this.refresh();
  }
});



================================================
FILE: components/tb-nested.js
================================================
// components/tb-nested.js - Simplest possible nested alp-tb example
alp.define('tb-nested', _ => `
  <div class="flex flex-col h-full bg-base-100 p-4 gap-3 text-sm">
    <div class="text-lg font-semibold">Nested Table Example</div>
    <alp-tb class="flex-1 border rounded"></alp-tb>
  </div>
`, {
  onPing(occasion) {
    if (occasion === 'mount') {
      // find() returns proxy queue if component not ready - calls are queued and replayed when ready()
      this.find('alp-tb').configure({
        columns: [
          { title: 'ID', field: 'id' },
          { title: 'Name', field: 'name' },
          { title: 'Value', field: 'value' }
        ],
        data: [
          { id: 1, name: 'Alpha', value: 100 },
          { id: 2, name: 'Beta', value: 200 },
          { id: 3, name: 'Gamma', value: 300 }
        ]
      });
    }
  }
});



================================================
FILE: components/tb.js
================================================
// components/tb.js - Lean Tabulator wrapper
alp.define('tb', _ => `
  <div class="flex flex-col h-full bg-base-100 p-2 gap-2 text-sm">
    <div class="flex items-center gap-4 text-xs">
      <label class="flex items-center gap-1">
        <span class="font-semibold">Search:</span>
        <input type="text" class="input input-xs w-32" x-model="search" @input="applyFilter()" placeholder="Filter...">
      </label>
      <span class="flex-1"></span>
      <span x-text="rowCount + ' rows'" class="text-base-content/70"></span>
    </div>
    <div name="table" class="flex-1"></div>
    <div class="flex justify-end gap-2 text-xs">
      <button class="btn btn-xs btn-secondary" @click="downloadJson()">Download JSON</button>
      <template x-if="zipMapper">
        <button class="btn btn-xs btn-primary" @click="downloadZip()" :disabled="downloading" x-text="downloadText">Download Zip</button>
      </template>
    </div>
  </div>
`, {
  table: null,
  search: '',
  rowCount: 0,
  downloading: false,
  downloadText: 'Download Zip',
  zipMapper: null,
  columns: [],
  data: [],

  async onPing(occasion, data) {
    switch (occasion) {
      case 'mount':
        this.table = await alp.kit.tb({
          target: this.find('[name="table"]'),
          layout: 'fitData',
          height: '300px',
          columns: alp.kit.tb.buildColumns(this.columns)
        });
        this.table.on('dataFiltered', (f, rows) => this.rowCount = rows.length);
        this.table.on('dataLoaded', d => this.rowCount = d.length);
        if (this.data.length) this.table.setData(this.data);
        break;
      case 'ready':
        // Parse configuration from host attributes
        const config = {};
        if (data.columns) {
          try { config.columns = JSON.parse(data.columns); } catch {}
        }
        if (data.data) {
          try { config.data = JSON.parse(data.data); } catch {}
        }
        if (Object.keys(config).length) this.configure(config);
        break;
    }
  },

  configure({ columns, data, zipMapper }) {
    if (columns) this.columns = columns;
    if (zipMapper) this.zipMapper = zipMapper;
    if (data) this.setData(data);
    if (this.table && columns) this.table.setColumns(alp.kit.tb.buildColumns(columns));
  },

  setData(data) {
    this.data = data;
    this.table?.setData(data);
  },

  getData() { return this.table?.getData() || []; },
  getVisibleData() { return this.table?.getRows('visible').map(r => r.getData()) || []; },

  applyFilter() {
    if (!this.table) return;
    this.table.setFilter(row => {
      if (!this.search) return true;
      const s = this.search.toLowerCase();
      return Object.values(row).some(v => String(v).toLowerCase().includes(s));
    });
  },

  downloadJson() {
    alp.kit.tb.downloadJson(this.table, { filename: 'table-data', timestamp: true });
  },

  async downloadZip() {
    if (!this.zipMapper) return;
    this.downloading = true;
    this.downloadText = 'Preparing...';
    try {
      await alp.kit.tb.downloadZip(this.table, {
        filename: 'download.zip',
        fileMapper: this.zipMapper,
        onProgress: (cur, tot, d) => this.downloadText = d ? `${cur + 1}/${tot}` : 'Generating...'
      });
    } finally {
      this.downloading = false;
      this.downloadText = 'Download Zip';
    }
  }
});



================================================
FILE: demos/bill-table.html
================================================
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bill Table Demo</title>
  <script src="https://cdn.jsdelivr.net/gh/mehrlander/Alp@main/alp.js"></script>
</head>
<body class="bg-base-300 p-4">
  <h1 class="text-xl font-bold mb-4">Bill Table Component Demo</h1>
  <p class="text-sm mb-4">A table for browsing WA Legislature bills with filtering and download capabilities.</p>
  <div class="overflow-hidden bg-base-100 h-96">
    <alp-bill-table path="demo.bills"></alp-bill-table>
  </div>
</body>
</html>



================================================
FILE: demos/jse.html
================================================
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JSE Demo</title>
  <script src="https://cdn.jsdelivr.net/gh/mehrlander/Alp@main/alp.js"></script>
</head>
<body class="bg-base-200 p-4">
  <h1 class="text-xl font-bold mb-4">JSE (JSON Editor) Component Demo</h1>
  <p class="text-sm mb-4">Browse and edit stored JSON records with tree, text, or table view modes.</p>
  <div class="border rounded-lg overflow-hidden bg-base-100 h-96">
    <alp-jse path="demo.jse"></alp-jse>
  </div>
</body>
</html>



================================================
FILE: demos/tb-nested.html
================================================
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TB Nested Demo</title>
  <script src="https://cdn.jsdelivr.net/gh/mehrlander/Alp@58d977b69b0d/alp.js"></script>
</head>
<body class="bg-base-300 p-4">
  <h1 class="text-xl font-bold mb-4">TB Nested Component Demo</h1>
  <p class="text-sm mb-4">Demonstrates nesting an alp-tb component inside another alp component (alp-tb-nested).</p>
  <alp-tb-nested path="demo.tb-nested"></alp-tb-nested>
</html>



================================================
FILE: demos/tb.html
================================================
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TB Demo</title>
  <script src="https://cdn.jsdelivr.net/gh/mehrlander/Alp@main/alp.js"></script>
</head>
<body class="bg-base-300 p-4">
  <h1 class="text-xl font-bold mb-4">TB (Tabulator) Component Demo</h1>
  <p class="text-sm mb-4">A generic table component with search, JSON export, and optional zip download.</p>
  <alp-tb path="demo.tb"
          columns='["name", "age", "city"]'
          data='[{"name": "Alice", "age": 30, "city": "Seattle"}, {"name": "Bob", "age": 25, "city": "Portland"}, {"name": "Carol", "age": 35, "city": "Vancouver"}]'
          ></alp-tb>
</body>
</html>



================================================
FILE: ShortcutTemplates/README.md
================================================
# Shortcut Templates

HTML templates designed to be fetched and filled by Apple Shortcuts with dynamic data.

## How It Works

1. **Fetch the template** from GitHub via raw URL
2. **Replace the placeholder** `📲Input` with your JSON data
3. **Display the result** in a WebView or save as HTML

## Templates

### json-viewer.html

Interactive JSON viewer/editor with:
- Tree and text view of JSON data
- Navigation controls (d-pad)
- Zoom slider (50-100%)
- Copy and extract functionality
- Touch-optimized for mobile

**Placeholder:** `📲Input`

**Usage in Apple Shortcuts:**

```
1. Get contents of URL
   → https://raw.githubusercontent.com/YOUR_USERNAME/Alp/main/ShortcutTemplates/json-viewer.html

2. Replace Text
   Find: 📲Input
   Replace with: [Your JSON data as text with proper formatting]

3. Show Web Page or Quick Look
   → Display the modified HTML
```

**Example replacement:**

Replace `📲Input` with:
```javascript
{json: {"name": "example", "data": [1, 2, 3]}}
```

Result:
```javascript
window.data = {json: {"name": "example", "data": [1, 2, 3]}};
```

## Template Structure

All templates use the `📲Input` placeholder which should be replaced with valid JavaScript values. The placeholder appears in a `<script>` tag where data is assigned to `window.data`.

## Creating New Templates

To create a new template:

1. Create an HTML file in this directory
2. Add `📲Input` placeholder where dynamic data should be injected
3. Ensure the placeholder is in a valid JavaScript context
4. Document the template in this README

## Notes

- Templates use CDN-hosted libraries (Tailwind, jQuery, Phosphor Icons, vanilla-jsoneditor)
- Designed for mobile WebView display
- All JavaScript is inline for portability
- No server-side processing required



================================================
FILE: ShortcutTemplates/json-viewer.html
================================================
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>JSON Viewer</title>
  <script src="https://cdn.jsdelivr.net/combine/npm/@tailwindcss/browser@4,npm/lodash,npm/@phosphor-icons/web,npm/clipboard,npm/jquery"></script>
</head>
<body class="bg-gray-100 h-dvh flex flex-col">
<main class="flex-1 min-h-0 overflow-hidden">
    <div id="wrap" class="relative h-full min-h-0 overflow-hidden bg-gray-50">
      <section id="jsoneditor1" tabindex="0" class="block w-full h-full origin-top-left bg-white"></section>

      <!-- Cross control pad -->
      <div id="pad" class="absolute right-3 bottom-1.5 z-10 pointer-events-none transition-opacity duration-300">
        <div class="flex gap-1 pointer-events-auto" id="padGrid"></div>
      </div>

      <!-- Zoom slider -->
      <div id="zoom" class="pointer-events-none absolute left-1/3 -translate-x-1/2 bottom-1.5 z-10 transition-opacity duration-300">
        <input id="scale" type="range" min="50" max="100" value="100" step="5" class="w-48 accent-gray-600 pointer-events-auto">
      </div>
    </div>
  </main>

<footer id="footer" class="relative bg-white border-t border-gray-200 h-[40vh] flex flex-col overflow-hidden transition-all duration-[350ms]">

<div id="statusRow" class="bg-gray-800 px-3 py-1 flex items-center justify-between cursor-pointer">
  <div class="flex items-center">
    <span class="text-xs text-gray-400">Selection:</span>
    <span id="pathDisplay" class="text-xs font-mono text-gray-200 ml-2"></span>
  </div>
  <div class="flex items-center">
    <span id="typeDisplay" class="text-xs font-mono text-gray-300"></span>
  </div>
</div>

  <div class="flex-1 overflow-hidden relative">
    <div id="textEditor" class="h-full origin-top-left"></div>

    <div id="actions" class="absolute bottom-10 right-3 z-30 flex flex-col gap-2 transition-opacity">
      <button id="btnExtract"
        class="w-10 h-10 grid place-items-center rounded border transition-colors bg-white/90 border-gray-300 text-gray-500 hover:bg-gray-50">
        <i class="ph ph-scissors text-xl"></i>
      </button>
      <button id="btnCopy"
        class="w-10 h-10 grid place-items-center rounded border transition-colors bg-white/90 border-gray-300 text-gray-500 hover:bg-gray-50">
        <i class="ph ph-copy text-xl"></i>
      </button>
    </div>
  </div>
</footer>
<script>
window.data = 📲Input;
</script>
<!-- ui-core.js (helpers + shared state wiring) -->
<script>
(() => {
  const ui = window.ui = window.ui || {};

  ui.clamp = (n,a,b) => Math.max(a, Math.min(b, n));
  ui.getTarget = sel => $(sel).find('[contenteditable],textarea,input').get(0) || $(sel).get(0);
  ui.focusEditor = () => ui.getTarget('#jsoneditor1')?.focus?.();

  ui.pathToStr = p =>
    !p || !p.length ? 'root'
    : p.map(k => typeof k === 'number' ? `[${k}]` : String(k)).join('.').replace(/\.\[/g,'[');

  const $path = $('#pathDisplay'), $type = $('#typeDisplay');
  addEventListener('ui:state', e => {
    const d = e.detail || {};
    $path.text(ui.pathToStr(d.path));
    $type.text(d.kind || '');
  });
})();
</script>

<!-- ui-pad.js -->
<script>
(() => {
  const ui = window.ui = window.ui || {};

  const btnBase = "w-10 h-10 grid place-items-center rounded border transition-colors bg-white/90 border-gray-300 text-gray-500 hover:bg-gray-50";
  const iconCls = "text-xl";
  const btn = (id, k, icon) =>
    `<button id="${id}" data-k="${k}" class="${btnBase}">
      <i class="ph ph-caret-${icon} ${iconCls}"></i>
     </button>`;

  $('#padGrid').html(
    `<div class="flex items-center">${btn('btnLeft','ArrowLeft','left')}</div>
     <div class="flex flex-col">
       ${btn('btnUp','ArrowUp','up')}
       <button id="btnShift" class="w-10 grid place-items-center rounded text-gray-500 hover:bg-gray-50 transition-colors pt-0.5">
         <i class="ph ph-arrow-fat-up ph-fill ${iconCls}"></i>
       </button>
       ${btn('btnDown','ArrowDown','down')}
     </div>
     <div class="flex items-center">${btn('btnRight','ArrowRight','right')}</div>`
  );

  let shiftOn = false;

  const sendKey = k => {
    ui.focusEditor();
    ui.getTarget('#jsoneditor1')?.dispatchEvent?.(new KeyboardEvent('keydown', {
      key: k, code: k, bubbles: true, shiftKey: shiftOn
    }));
  };

  $('#padGrid [data-k]').on('click', function(){ sendKey($(this).data('k')); });

  const shiftBtnState = on => $('#btnShift').toggleClass('text-blue-500', on).toggleClass('text-gray-500', !on);
  $('#btnShift').on('click', () => (shiftOn = !shiftOn, shiftBtnState(shiftOn)));
  shiftBtnState(shiftOn);

  ui.sendKey = sendKey;
})();
</script>

<!-- ui-scale.js -->
<script>
(() => {
  const ui = window.ui = window.ui || {};

  const applyScale = pct => {
    const s = ui.clamp(+pct || 100, 50, 100) / 100;
    const css = {
      transform: `scale(${s})`,
      transformOrigin: 'top left',
      width: `${100 / s}%`,
      height: `${100 / s}%`
    };
    ['#jsoneditor1', '#textEditor'].forEach(sel => $(sel).css(css));
  };

  $('#scale').on('input', e => applyScale(e.target.value));
  ui.applyScale = applyScale;
})();
</script>

<!-- ui-buttons.js -->
<script>
(() => {
  let controlsVisible = true;
  $('#statusRow').on('click', () => {
    controlsVisible = !controlsVisible;
    $('#pad, #zoom, #actions').toggleClass('opacity-0 pointer-events-none', !controlsVisible);
  });

  const $copy = $('#btnCopy'), $ex = $('#btnExtract');

  addEventListener('ui:state', e => {
    const d = e.detail || {};
    $copy.toggleClass('opacity-50 pointer-events-none', d.canCopy === false);
    $ex.toggleClass('opacity-50 pointer-events-none', d.canExtract === false);
  });

  $copy.on('click', () => dispatchEvent(new CustomEvent('ui:copy')));
  $ex.on('click', () => dispatchEvent(new CustomEvent('ui:extract')));
})();
</script>
<script type="module">
  import {
    createJSONEditor,
    createValueSelection,
    getSelectionPaths
  } from 'https://cdn.jsdelivr.net/npm/vanilla-jsoneditor/standalone.js'

  let editor, textEditor
  let currentBasePath = []
  let currentSelection = null

  const at = (root, path) => path.reduce((a, k) => a?.[String(k)], root)
  const basePathOf = sel => sel?.path || sel?.focusPath || sel?.anchorPath || []

  const kindOf = v => Array.isArray(v) ? 'Array' : (v && typeof v === 'object') ? 'Object' : 'Value'

  const uiState = v => dispatchEvent(new CustomEvent('ui:state', {
    detail: { path: currentBasePath, kind: kindOf(v), canCopy: true, canExtract: currentSelection !== null }
  }))

  const renderSelection = subtree => (textEditor?.set?.({ json: subtree }), uiState(subtree))

  const initTextEditor = () => {
    textEditor = createJSONEditor({
      target: document.getElementById('textEditor'),
      props: { mode: 'text', readOnly: true, mainMenuBar: false, content: { json: {} } }
    })
  }

  const handleSelect = sel => {
    currentBasePath = basePathOf(sel) || []
    currentSelection = sel
    renderSelection(at(editor.get().json, currentBasePath))
  }

  addEventListener('ui:extract', () => {
    if (currentSelection === null) return
    const json = editor.get().json
    const paths = getSelectionPaths(json, currentSelection) || []
    if (!paths.length) return
    editor.update({ json: paths.length === 1 ? at(json, paths[0]) : paths.map(p => at(json, p)) })
    uiState(at(editor.get().json, currentBasePath))
  })

  addEventListener('ui:copy', () => {
    const value = at(editor.get().json, currentBasePath)
    navigator.clipboard?.writeText?.(JSON.stringify(value, null, 2))
  })

  initTextEditor()

  let initialContent = { json: {} }
  try {
    const data = window.data?.json
    if (data !== undefined) initialContent = { json: data }
  } catch (e) {
    initialContent = { json: { error: String(e?.message || e) } }
  }

  editor = createJSONEditor({
    target: document.querySelector('#jsoneditor1'),
    props: { mode: 'tree', content: initialContent, onSelect: handleSelect }
  })

  const pickSeedPath = root => {
    if (Array.isArray(root) && root.length) return [0]
    if (root && typeof root === 'object') {
      const keys = Object.keys(root)
      if (keys.length) return [keys[0]]
    }
    return []
  }

  const seedPath = pickSeedPath(initialContent.json)
  const seedSel = seedPath.length ? createValueSelection(seedPath) : undefined
  const raf2 = f => requestAnimationFrame(() => requestAnimationFrame(f))

  $('#jsoneditor1').attr('tabindex', '0')
  raf2(() => {
    if (seedSel) {
      editor.scrollTo(seedPath)
      editor.select(seedSel)
      handleSelect(seedSel)
    } else handleSelect({ path: [] })
    window.ui?.applyScale?.($('#scale').val())
  })
</script>
</body>
</html>



================================================
FILE: utils/db-manager.js
================================================
// utils/db-manager.js - Multi-database management for Alp

import { DEFAULT_DB, DEFAULT_STORE } from './path.js';
import { MemoryDb } from './memory-db.js';

const databases = new Map();
const storeRegistry = new Map();
let persistentMode = true;

const createDb = async (name, storeNames = [DEFAULT_STORE]) => {
  if (databases.has(name)) throw new Error(`Database '${name}' already exists. Use getDb('${name}') to access it.`);
  if (!storeNames.length) storeNames = [DEFAULT_STORE];

  const storeSchema = {};
  for (const store of storeNames) storeSchema[store] = 'name';

  let db;
  if (persistentMode) {
    db = new Dexie(name);
    db.version(1).stores(storeSchema);
    await db.open();
  } else {
    db = new MemoryDb(name);
    db.version(1).stores(storeSchema);
    await db.open();
  }

  databases.set(name, db);
  storeRegistry.set(name, new Set(storeNames));

  const modeLabel = persistentMode ? '' : ' (memory)';
  console.log(`📦 Created database '${name}' with stores: ${storeNames.join(', ')}${modeLabel}`);
  return db;
};

const createStore = async (dbName, storeName) => {
  const db = databases.get(dbName);
  if (!db) throw new Error(`Database '${dbName}' not found. Use alp.createDb('${dbName}', ['${storeName}']) to create it.`);

  const stores = storeRegistry.get(dbName);
  if (stores.has(storeName)) throw new Error(`Store '${storeName}' already exists in database '${dbName}'.`);

  const storeSchema = {};
  for (const store of stores) storeSchema[store] = 'name';
  storeSchema[storeName] = 'name';

  let newDb;
  if (db instanceof MemoryDb) {
    const v = db.verno + 1;
    db.version(v).stores({ [storeName]: 'name' });
    newDb = db;
    stores.add(storeName);
    console.log(`📦 Added store '${storeName}' to database '${dbName}' (v${v}, memory)`);
  } else {
    db.close();
    const v = db.verno + 1;
    newDb = new Dexie(dbName);
    newDb.version(v).stores(storeSchema);
    await newDb.open();
    databases.set(dbName, newDb);
    stores.add(storeName);
    console.log(`📦 Added store '${storeName}' to database '${dbName}' (v${v})`);
  }

  return newDb;
};

const registerDb = (name, db, storeNames = [DEFAULT_STORE]) => {
  databases.set(name, db);
  storeRegistry.set(name, new Set(storeNames));
};

const getDb = (name) => {
  const db = databases.get(name);
  if (!db) throw new Error(`Database '${name}' not found. Use alp.createDb('${name}', ['storeName']) to create it.`);
  return db;
};

const getStore = (dbName, storeName) => {
  const db = getDb(dbName);
  const stores = storeRegistry.get(dbName);
  if (!stores || !stores.has(storeName)) {
    throw new Error(`Store '${storeName}' not found in database '${dbName}'. Use alp.createStore('${dbName}', '${storeName}') to create it.`);
  }
  return db[storeName];
};

const hasDb = (name) => databases.has(name);

const hasStore = (dbName, storeName) => {
  const stores = storeRegistry.get(dbName);
  return stores ? stores.has(storeName) : false;
};

const has = (dbName, storeName) => hasDb(dbName) && hasStore(dbName, storeName);

const listDbs = () => Array.from(databases.keys());

const listStores = (dbName) => {
  const stores = storeRegistry.get(dbName);
  return stores ? Array.from(stores) : [];
};

const closeDb = (name) => {
  const db = databases.get(name);
  if (db) {
    db.close();
    databases.delete(name);
    storeRegistry.delete(name);
    console.log(`📦 Closed database '${name}'`);
  }
};

const deleteDb = async (name) => {
  const db = databases.get(name);
  const isMemory = db instanceof MemoryDb;
  closeDb(name);
  if (!isMemory) await Dexie.delete(name);
  console.log(`🗑️ Deleted database '${name}'${isMemory ? ' (memory)' : ''}`);
};

const setPersistent = (persistent) => { persistentMode = persistent; };
const isPersistent = () => persistentMode;

export const dbManager = {
  createDb,
  createStore,
  registerDb,
  getDb,
  getStore,
  hasDb,
  hasStore,
  has,
  listDbs,
  listStores,
  closeDb,
  deleteDb,
  setPersistent,
  isPersistent
};



================================================
FILE: utils/fills.js
================================================
// utils/fills.js - Template fill helpers for alp components

const mc = (prefix, mods) => mods.map(m => `${prefix}-${m}`).join(' ');
const sz = mods => ['xs', 'sm', 'md', 'lg', 'xl'].find(s => mods.includes(s));
const pos = mods => ['top', 'bottom', 'left', 'right'].find(p => mods.includes(p)) || 'bottom';
const gap = mods => ['gap-0', 'gap-1', 'gap-2', 'gap-3', 'gap-4'].find(g => mods.includes(g)) || 'gap-0';

const txt = mods => [
  sz(mods) && `text-${sz(mods)}`,
  ['left', 'center', 'right'].find(a => mods.includes(a)) && `text-${['left', 'center', 'right'].find(a => mods.includes(a))}`,
  mods.includes('bold') && 'font-bold',
  mods.includes('semibold') && 'font-semibold',
  mods.includes('italic') && 'italic',
  mods.includes('mono') && 'font-mono',
  mods.includes('muted') && 'opacity-60'
].filter(Boolean).join(' ');

export const fills = {
  pathInput: () => `
    <input x-model="_path"
      @blur="path = $el.value"
      @keydown.enter.prevent="$el.blur()"
      class="input input-xs input-ghost text-xs text-right w-48"
      placeholder="path">`,

  saveIndicator: () => `<span x-show="saving" class="loading loading-spinner loading-xs"></span>`,

  toolbar: (mods, ...items) => `<div class="flex gap-2 items-center justify-between mb-2">${items.join('')}</div>`,

  btn: (mods, label, click, iconClasses = '', extraClasses = '') => `
    <button @click="${click}" class="btn ${mc('btn', mods)} ${extraClasses}">
      ${iconClasses ? `<i class="ph ${iconClasses} ${sz(mods) ? `text-${sz(mods)}` : ''}"></i>` : ''}
      ${label ? `<span>${label}</span>` : ''}
    </button>`,

  modal: (inner) => `
    <dialog class="modal">
      <div class="modal-box w-full max-w-[95%] h-[80vh] p-0 shadow-lg flex flex-col overflow-hidden rounded-lg">
        ${inner}
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>`,

  tip: (mods, trigger, content) => {
    const cls = ['tooltip-content bg-base-100 text-base-content border border-base-300 rounded-box shadow-lg p-3 text-left',
      txt(mods) || 'text-xs'].filter(Boolean).join(' ');
    return `<div class="tooltip tooltip-${pos(mods)}"><div class="${cls}">${content}</div>${trigger}</div>`;
  },

  lines: (mods, arr) => {
    const cls = ['flex flex-col', gap(mods), txt(mods)].filter(Boolean).join(' ');
    return `<div class="${cls}">${arr.map(s => `<div>${s}</div>`).join('')}</div>`;
  }
};



================================================
FILE: utils/kit.js
================================================
// utils/kit.js - Third-party library loaders and utilities
import { brotli } from './kits/brotli.js';
import { gzip } from './kits/gzip.js';
import { acorn } from './kits/acorn.js';
import { jse } from './kits/jse.js';
import { text } from './kits/text.js';
import { tb } from './kits/tb.js';
import { leg } from './kits/leg.js';
import { dexie } from './kits/dexie.js';

export const kit = { brotli, gzip, text, acorn, jse, tb, leg, dexie };



================================================
FILE: utils/memory-db.js
================================================
// utils/memory-db.js - In-memory database fallback when IndexedDB is unavailable

export const isIndexedDBAvailable = async () => {
  if (typeof indexedDB === 'undefined' || !indexedDB) return false;

  // Try to actually open a test database (catches Safari data URL restrictions)
  try {
    const testName = '__alp_indexeddb_test__';
    const request = indexedDB.open(testName, 1);

    return new Promise((resolve) => {
      request.onerror = () => {
        resolve(false);
      };

      request.onsuccess = () => {
        request.result.close();
        indexedDB.deleteDatabase(testName);
        resolve(true);
      };

      request.onblocked = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
};

class WhereClause {
  constructor(table, field) {
    this.table = table;
    this.field = field;
  }

  startsWith(prefix) {
    return {
      toArray: async () => {
        const results = [];
        for (const record of this.table._data.values()) {
          const fieldValue = record[this.field];
          if (typeof fieldValue === 'string' && fieldValue.startsWith(prefix)) {
            results.push(record);
          }
        }
        return results;
      }
    };
  }
}

class MemoryTable {
  constructor(name) {
    this.name = name;
    this._data = new Map();
  }

  async get(key) {
    return this._data.get(key);
  }

  async put(record) {
    if (!record || typeof record.name === 'undefined') {
      throw new Error('Record must have a "name" property');
    }
    this._data.set(record.name, { ...record });
    return record.name;
  }

  async delete(key) {
    this._data.delete(key);
  }

  async toArray() {
    return Array.from(this._data.values());
  }

  where(field) {
    return new WhereClause(this, field);
  }

  async clear() {
    this._data.clear();
  }

  async count() {
    return this._data.size;
  }
}

export class MemoryDb {
  constructor(name) {
    this.name = name;
    this._tables = new Map();
    this._version = 1;
    this._isOpen = false;
  }

  get verno() {
    return this._version;
  }

  version(version) {
    this._version = version;
    return {
      stores: (schema) => {
        for (const storeName of Object.keys(schema)) {
          if (!this._tables.has(storeName)) {
            const table = new MemoryTable(storeName);
            this._tables.set(storeName, table);
            this[storeName] = table;
          }
        }
        return this;
      }
    };
  }

  async open() {
    this._isOpen = true;
    return this;
  }

  close() {
    this._isOpen = false;
  }

  isOpen() {
    return this._isOpen;
  }

  static async delete(name) {
    // No-op for memory databases - they don't persist
  }
}



================================================
FILE: utils/path.js
================================================
// utils/path.js - Path parsing and building utilities for multi-db/store paths
// Format: [database/][store:]recordPath
// Examples: bills.jan | data:bills.jan | Work/data:bills.jan | Work/:bills.jan

export const DEFAULT_DB = 'AlpDB';
export const DEFAULT_STORE = 'alp';

export const path = {
  DEFAULT_DB,
  DEFAULT_STORE,
  parse: null,
  build: null,
  buildFull: null,
  display: null,
  getRecord: null,
  equals: null
};

export const parsePath = (input) => {
  if (!input || typeof input !== 'string') {
    return {
      db: DEFAULT_DB,
      store: DEFAULT_STORE,
      record: '',
      full: '',
      isDefaultDb: true,
      isDefaultStore: true
    };
  }

  const trimmed = input.trim();
  let db = DEFAULT_DB;
  let store = DEFAULT_STORE;
  let record = trimmed;

  // Check for database prefix (contains /)
  const slashIdx = trimmed.indexOf('/');
  if (slashIdx !== -1) {
    db = trimmed.slice(0, slashIdx) || DEFAULT_DB;
    record = trimmed.slice(slashIdx + 1);
  }

  // Check for store prefix (contains :)
  const colonIdx = record.indexOf(':');
  if (colonIdx !== -1) {
    store = record.slice(0, colonIdx) || DEFAULT_STORE;
    record = record.slice(colonIdx + 1);
  }

  return {
    db,
    store,
    record,
    full: buildPath(db, store, record),
    isDefaultDb: db === DEFAULT_DB,
    isDefaultStore: store === DEFAULT_STORE
  };
};

export const buildPath = (db, store, record) => {
  const useDefaultDb = !db || db === DEFAULT_DB;
  const useDefaultStore = !store || store === DEFAULT_STORE;

  if (useDefaultDb && useDefaultStore) {
    return record;
  }
  if (useDefaultDb) {
    return `${store}:${record}`;
  }
  if (useDefaultStore) {
    return `${db}/:${record}`;
  }
  return `${db}/${store}:${record}`;
};

export const buildFullPath = (db, store, record) => {
  return `${db || DEFAULT_DB}/${store || DEFAULT_STORE}:${record}`;
};

export const displayPath = (input) => {
  const { db, store, record } = parsePath(input);
  return buildPath(db, store, record);
};

export const getRecordPath = (input) => {
  return parsePath(input).record;
};

export const pathsEqual = (path1, path2) => {
  const p1 = parsePath(path1);
  const p2 = parsePath(path2);
  return p1.db === p2.db && p1.store === p2.store && p1.record === p2.record;
};

path.parse = parsePath;
path.build = buildPath;
path.buildFull = buildFullPath;
path.display = displayPath;
path.getRecord = getRecordPath;
path.equals = pathsEqual;



================================================
FILE: utils/kits/acorn.js
================================================
// utils/kits/acorn.js - JavaScript parser kit
let mod;

const acorn = async () => mod ??= await import('https://unpkg.com/acorn@8.11.3/dist/acorn.mjs');

acorn.parse = async (text, opts) => (await acorn()).parse(text, { ecmaVersion: 2022, ...opts });

acorn.isJS = async text => { try { await acorn.parse(text); return true } catch { return false } };

export { acorn };



================================================
FILE: utils/kits/brotli.js
================================================
// utils/kits/brotli.js - Brotli compression kit
let mod;
const load = async () => mod ??= await import('https://unpkg.com/brotli-wasm@3.0.0/index.web.js?module').then(m => m.default);
const re = /^BR64(?:\("([^"]*)"\))?:/;

const brotli = async (text, label) => {
  const m = await load();
  const hdr = label ? `BR64("${label}"):` : 'BR64:';
  return hdr + btoa(String.fromCharCode(...m.compress(new TextEncoder().encode(text))));
};

brotli.compress = brotli;

brotli.decompress = async str => {
  const m = await load();
  return new TextDecoder().decode(m.decompress(new Uint8Array(atob(str.replace(re, '')).split('').map(c => c.charCodeAt(0)))));
};

brotli.detect = str => {
  const m = str.match(re);
  return m ? { alg: 'brotli', label: m[1] ?? null, prefixLen: m[0].length } : null;
};

brotli.findChunks = str => {
  const chunks = [], r = /BR64(?::|\("([^"]*)"\):)([A-Za-z0-9+/=]+)/g;
  let m; while ((m = r.exec(str))) chunks.push({ alg: 'brotli', label: m[1] ?? null, start: m.index, end: m.index + m[0].length, text: m[0] });
  return chunks;
};

export { brotli };



================================================
FILE: utils/kits/dexie.js
================================================
// utils/kits/dexie.js - Dexie kit for IndexedDB operations
// Provides standalone database operations independent of core.js

// Create a database instance with a simple key-value store
const createDb = (name = 'AlpKitDB', storeName = 'records') => {
  const db = new Dexie(name);
  db.version(1).stores({ [storeName]: 'key' });
  const store = db[storeName];

  return {
    db,
    storeName,

    // Save a record
    async put(key, data) {
      await store.put({ key, data, updatedAt: Date.now() });
      return data;
    },

    // Get a record by key
    async get(key) {
      const r = await store.get(key);
      return r?.data;
    },

    // Delete a record
    async del(key) {
      await store.delete(key);
    },

    // Check if key exists
    async has(key) {
      return !!(await store.get(key));
    },

    // Get all records
    async all() {
      return store.toArray();
    },

    // Get all keys
    async keys() {
      return store.toCollection().primaryKeys();
    },

    // Get records matching a prefix (for namespaced keys like "bills.2023")
    async prefix(p) {
      return store.where('key').startsWith(p).toArray();
    },

    // Count records
    async count() {
      return store.count();
    },

    // Clear all records
    async clear() {
      await store.clear();
    },

    // Bulk put multiple records
    async bulkPut(records) {
      const items = records.map(([key, data]) => ({ key, data, updatedAt: Date.now() }));
      await store.bulkPut(items);
    },

    // Bulk get multiple records
    async bulkGet(keys) {
      const results = await store.bulkGet(keys);
      return results.map(r => r?.data);
    },

    // Bulk delete multiple records
    async bulkDel(keys) {
      await store.bulkDelete(keys);
    },

    // Group records by namespace (first segment of key)
    async grouped() {
      const records = await store.toArray();
      return records.reduce((m, { key, data }) => {
        const [ns, ...rest] = key.split('.');
        (m[ns] ||= []).push({ key, sig: rest.join('.'), data });
        return m;
      }, {});
    },

    // Iterate with callback
    async each(fn) {
      await store.each(r => fn(r.key, r.data));
    },

    // Export all data as JSON
    async export() {
      const records = await store.toArray();
      return JSON.stringify(records, null, 2);
    },

    // Import data from JSON
    async import(json) {
      const records = typeof json === 'string' ? JSON.parse(json) : json;
      await store.bulkPut(records);
    }
  };
};

// Default database instance (lazy-created)
let defaultDb;
const getDefault = () => defaultDb ||= createDb();

// Main dexie kit export
const dexie = {
  // Create a new database instance
  create: createDb,

  // Default database operations
  put: (key, data) => getDefault().put(key, data),
  get: key => getDefault().get(key),
  del: key => getDefault().del(key),
  has: key => getDefault().has(key),
  all: () => getDefault().all(),
  keys: () => getDefault().keys(),
  prefix: p => getDefault().prefix(p),
  count: () => getDefault().count(),
  clear: () => getDefault().clear(),
  bulkPut: records => getDefault().bulkPut(records),
  bulkGet: keys => getDefault().bulkGet(keys),
  bulkDel: keys => getDefault().bulkDel(keys),
  grouped: () => getDefault().grouped(),
  each: fn => getDefault().each(fn),
  export: () => getDefault().export(),
  import: json => getDefault().import(json),

  // Access default db instance
  get db() { return getDefault(); }
};

export { dexie };



================================================
FILE: utils/kits/gzip.js
================================================
// utils/kits/gzip.js - Gzip compression kit
const re = /^GZ64(?:\("([^"]*)"\))?:/;

const stream = async (compress, data) => {
  const s = new Blob([data]).stream().pipeThrough(new (compress ? CompressionStream : DecompressionStream)('gzip'));
  const chunks = []; for (const r = s.getReader();;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
  const u8 = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0; for (const c of chunks) { u8.set(c, o); o += c.length; }
  return u8;
};

const gzip = async (text, label) => {
  const hdr = label ? `GZ64("${label}"):` : 'GZ64:';
  return hdr + btoa(String.fromCharCode(...await stream(true, new TextEncoder().encode(text))));
};

gzip.compress = gzip;

gzip.decompress = async str => new TextDecoder().decode(await stream(false, new Uint8Array(atob(str.replace(re, '')).split('').map(c => c.charCodeAt(0)))));

gzip.detect = str => {
  const m = str.match(re);
  return m ? { alg: 'gzip', label: m[1] ?? null, prefixLen: m[0].length } : null;
};

gzip.findChunks = str => {
  const chunks = [], r = /GZ64(?::|\("([^"]*)"\):)([A-Za-z0-9+/=]+)/g;
  let m; while ((m = r.exec(str))) chunks.push({ alg: 'gzip', label: m[1] ?? null, start: m.index, end: m.index + m[0].length, text: m[0] });
  return chunks;
};

gzip.sizeOf = async text => (await stream(true, new TextEncoder().encode(text))).length;

export { gzip };



================================================
FILE: utils/kits/index.js
================================================
export const kits = ['brotli.js', 'gzip.js', 'acorn.js', 'jse.js', 'jszip.js', 'text.js', 'tb.js', 'leg.js'];



================================================
FILE: utils/kits/jse.js
================================================
// utils/kits/jse.js - JSON editor kit
let mod;

const jse = async opts => {
  mod ??= await import('https://unpkg.com/vanilla-jsoneditor/standalone.js');
  return mod.createJSONEditor(opts);
};

export { jse };



================================================
FILE: utils/kits/jszip.js
================================================
// utils/kits/jszip.js - ZIP file kit
let mod;

const jszip = async () => mod ??= await import('https://cdn.jsdelivr.net/npm/jszip/+esm').then(m => m.default);

export { jszip };



================================================
FILE: utils/kits/leg.js
================================================
// utils/kits/leg.js - Washington Legislature bill data fetching kit

// Lazy load Luxon for date parsing
let DateTime;
const loadDeps = async () => {
  if (!DateTime) {
    const m = await import('https://cdn.jsdelivr.net/npm/luxon/+esm');
    DateTime = m.DateTime;
  }
  return DateTime;
};

// Build URL for WA Legislature file server
const buildUrl = (chamber, format, biennium, type) => {
  const base = `https://lawfilesext.leg.wa.gov/Biennium/${biennium}/${format}/Bills/`;
  return type === 'Bills'
    ? `${base}${chamber}%20Bills/`
    : `${base}Session%20Laws/${chamber}/`;
};

// Parse directory listing HTML from legislature server
const parseDirectoryListing = async (html, chamber, biennium, type) => {
  const DateTime = await loadDeps();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const pre = doc.querySelector('pre');
  if (!pre) return [];

  const lines = pre.innerHTML.split('<br>').filter(Boolean);
  return lines.map(line => {
    // Create temp element to parse HTML entities and extract text
    const temp = document.createElement('div');
    temp.innerHTML = line;
    const text = temp.textContent;

    // Match pattern: date time size filename
    const match = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+\d{1,2}:\d{2}\s+[AP]M\s+(\S+)\s+(.+)/);
    if (!match) return null;

    const fullFileName = match[3].trim();
    const name = fullFileName.split('.')[0];
    const fileName = fullFileName.replace(/\.(xml|htm)$/i, '');

    // Extract URL from anchor tag
    const anchor = temp.querySelector('a');
    const href = anchor?.getAttribute('href') || '';
    const urlXml = new URL(href, 'https://lawfilesext.leg.wa.gov/').href;

    const billNo = name.slice(0, 4);
    return {
      docId: `${biennium}_${type}_${name}`,
      billId: `${biennium}_${billNo}`,
      billNo,
      date: DateTime.fromFormat(match[1], 'M/d/yyyy').toFormat('yyyy-MM-dd'),
      size: Math.round(parseInt(match[2].replace(/,/g, '')) / 1024) || 0,
      compressedSize: null,
      name,
      fileName,
      urlXml,
      chamber,
      biennium,
      kind: type,
      totalDollarAmount: null,
      description: null
    };
  }).filter(Boolean);
};

// Build tree structure for bills (groups by bill number with children)
const buildTree = (data) => {
  const map = new Map();
  data.sort((a, b) => new Date(b.date) - new Date(a.date));

  data.forEach(item => {
    const id = item.billNo;
    if (!map.has(id)) {
      map.set(id, { ...item, _children: [] });
    } else {
      map.get(id)._children.push(item);
    }
  });

  return [...map.values()].map(row => {
    if (row._children?.length) {
      row._children.sort((a, b) => new Date(b.date) - new Date(a.date));
    } else {
      delete row._children;
    }
    return row;
  });
};

// Fetch bills for a biennium from both chambers
const fetchBiennium = async (biennium, options = {}) => {
  const { types = ['Bills', 'Session Laws'], tree = true } = options;
  const results = [];

  for (const type of types) {
    const [houseResponse, senateResponse] = await Promise.all([
      fetch(buildUrl('House', 'Xml', biennium, type)).then(r => r.text()),
      fetch(buildUrl('Senate', 'Xml', biennium, type)).then(r => r.text())
    ]);

    let data = [
      ...await parseDirectoryListing(houseResponse, 'House', biennium, type),
      ...await parseDirectoryListing(senateResponse, 'Senate', biennium, type)
    ];

    if (type === 'Bills' && tree) {
      data = buildTree(data);
    } else {
      data.sort((a, b) => b.size - a.size);
    }

    results.push(...data);
  }

  return results;
};

// Parse bill XML for summary information
const parseBillXml = (xml) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  const dollarAmounts = [...doc.querySelectorAll('DollarAmount')].map(el =>
    parseFloat(el.textContent.replace(/[$,]/g, '')) || 0
  );
  const totalDollarAmount = dollarAmounts.length ? dollarAmounts.reduce((a, b) => a + b, 0) : null;
  const description = doc.querySelector('BriefDescription')?.textContent || null;

  return { description, totalDollarAmount, dollarAmounts };
};

// Fetch and parse bill summary from URL
const fetchBillSummary = async (urlXml) => {
  const xml = await fetch(urlXml).then(r => r.text());
  const summary = parseBillXml(xml);
  return { ...summary, xml };
};

// Main leg object
const leg = Object.assign(fetchBiennium, {
  buildUrl,
  parseDirectoryListing,
  buildTree,
  parseBillXml,
  fetchBillSummary,
  bienniums: ['2025-26', '2023-24', '2021-22', '2019-20', '2017-18', '2015-16', '2013-14', '2011-12', '2009-10', '2007-08', '2005-06', '2003-04'],
  types: ['Bills', 'Session Laws']
});

export { leg };



================================================
FILE: utils/kits/tb.js
================================================
// utils/kits/tb.js - Tabulator kit
import { jszip } from './jszip.js';
import { gzip } from './gzip.js';

const tb = ({ target, ...props }) => new Promise(r => {
  const t = new Tabulator(target, props);
  t.on('tableBuilt', () => r(t));
});

tb.buildColumns = fields => fields.map(f => typeof f === 'string' ? { field: f, title: f } : f);

// Download table data as JSON
// options: { filename, timestamp (bool or format string), space (JSON indent) }
tb.downloadJson = (table, { filename = 'data', timestamp = true, space = 2 } = {}) => {
  const data = table.getData();
  const ts = timestamp ? '-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) : '';
  const blob = new Blob([JSON.stringify(data, null, space)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}${ts}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

// Download files as ZIP with progress tracking
// options: { filename, fileMapper(rowData) => [{ path, url }], onProgress(current, total, rowData) }
tb.downloadZip = async (table, { filename = 'download.zip', fileMapper, onProgress, selector = 'visible' } = {}) => {
  const JSZip = await jszip();
  const rows = table.getRows(selector);
  if (!rows.length) return { success: false, error: 'No rows to download' };

  const zip = new JSZip();
  let completed = 0;

  for (const row of rows) {
    const data = row.getData();
    const files = fileMapper ? fileMapper(data) : [];

    onProgress?.(completed, rows.length, data);

    for (const { path, url } of files) {
      try {
        const blob = await fetch(url).then(r => r.blob());
        zip.file(path, blob);
      } catch (e) {
        console.error('Failed to fetch:', url, e);
      }
    }
    completed++;
  }

  onProgress?.(completed, rows.length, null);

  const content = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  return { success: true, count: rows.length };
};

// Get compressed size of text using gzip
tb.getCompressedSize = text => gzip.sizeOf(text);

export { tb };



================================================
FILE: utils/kits/text.js
================================================
// utils/kits/text.js - Text processing kit
import { brotli } from './brotli.js';
import { gzip } from './gzip.js';
import { acorn } from './acorn.js';

const text = {};

// Detection
text.detectCompressionType = str => brotli.detect(str) || gzip.detect(str);
text.findCompressedChunks = str => [...brotli.findChunks(str), ...gzip.findChunks(str)].sort((a, b) => a.start - b.start);

// Decompression templates for bookmarklet bootstrapping
text.templates = {
  brotliDecomp: n => `const m=await(await import('https://unpkg.com/brotli-wasm@3.0.0/index.web.js?module')).default;const b=atob(s.slice(${n}));const a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);const d=new TextDecoder().decode(m.decompress(a));`,
  gzipDecomp: n => `const d=new TextDecoder().decode(new Uint8Array(await new Response(new Blob([Uint8Array.from(atob(s.slice(${n})),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()));`,
  jsExec: () => 'eval(d)',
  htmlExec: popup => `const w=window.open('','_blank'${popup ? ",'width=800,height=600'" : ""});w.document.write(d);w.document.close()`,
};

// Analyze input without transforming
text.assess = async input => {
  const det = text.detectCompressionType(input);
  const raw = det?.alg === 'brotli' ? await brotli.decompress(input)
            : det?.alg === 'gzip' ? await gzip.decompress(input)
            : input;
  const isJavaScript = await acorn.isJS(raw);
  const br = await brotli(raw), gz = await gzip(raw);
  return {
    raw,
    isCompressed: !!det,
    compAlg: det?.alg ?? null,
    isJavaScript,
    sizes: { raw: raw.length, brotli: br.length, gzip: gz.length }
  };
};

// Wrap content in bookmarklet format
text.pack = (content, { isJavaScript = false, popup = false } = {}) => {
  const det = text.detectCompressionType(content);
  const mkResult = packingSegments => ({
    packingSegments,
    output: packingSegments.map(s => s.v).join('')
  });

  if (det) {
    const decomp = det.alg === 'brotli' ? text.templates.brotliDecomp(det.prefixLen) : text.templates.gzipDecomp(det.prefixLen);
    const exec = isJavaScript ? text.templates.jsExec() : text.templates.htmlExec(popup);
    return mkResult([
      { t: 'packing', v: `javascript:(async function(){const s='` },
      { t: 'payload', v: content },
      { t: 'packing', v: `';try{${decomp}console.log('Decompressed content:\\n',d);${exec}}catch(e){console.error(e)}})();` }
    ]);
  }

  if (isJavaScript) {
    return mkResult([
      { t: 'packing', v: 'javascript:(()=>{' },
      { t: 'payload', v: content },
      { t: 'packing', v: '})()' }
    ]);
  }

  const winOpts = popup ? ",'width=600,height=400'" : '';
  return mkResult([
    { t: 'packing', v: `javascript:(()=>{const w=window.open('','_blank'${winOpts});w.document.write(` },
    { t: 'payload', v: JSON.stringify(content) },
    { t: 'packing', v: ');w.document.close()})()' }
  ]);
};

// Full processing: takes UI state, returns everything the page needs
text.process = async (input, { compressed = true, packed = true, alg = 'brotli', popup = false, label = '' } = {}) => {
  const info = await text.assess(input);

  // Determine working content based on compression toggle
  let work;
  if (info.isCompressed) {
    work = compressed ? input : info.raw;
  } else {
    work = compressed ? (alg === 'gzip' ? await gzip(info.raw, label) : await brotli(info.raw, label)) : info.raw;
  }

  // Build result
  const base = { ...info, outAlg: alg };

  if (!packed) {
    const packingSegments = [{ t: 'payload', v: work }];
    return { ...base, packingSegments, output: work, outSize: work.length };
  }

  const parcel = text.pack(work, { isJavaScript: info.isJavaScript, popup });
  return { ...base, ...parcel, outSize: parcel.output.length };
};

export { text };


