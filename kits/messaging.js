// kits/messaging.js — string-path pub/sub.
//
// In-memory broadcast bus keyed on opaque string paths. Pages use it to
// coordinate between detached pieces (e.g. one component's selection
// changes drive another component's render) without a global Alpine
// store and without DOM events.
//
// Loadable as a plain script (no ES modules):
//
//   <script src=".../kits/messaging.js"></script>
//   const { subscribe, publish } = window.messaging;
//   const off = subscribe('compress.sel', (occasion, data) => { ... });
//   publish('compress.sel', 'change', { start: 0, end: 4 });
//   off(); // unsubscribe
//
// Path strings are matched verbatim — no parent/child propagation. The
// path syntax is shared with kits/persistence.js by convention but this
// kit doesn't parse or normalize anything.
//
// Each subscriber callback receives (occasion, data, path). `occasion`
// is a free-form short tag the publisher chose (e.g. 'change', 'ready',
// 'sel'); `data` is the payload; `path` echoes the publish path so a
// single callback can be reused across paths.

(() => {
  const subs = new Map(); // path -> Set<fn>

  const subscribe = (path, fn) => {
    if (typeof path !== 'string' || !path) {
      throw new Error('messaging: path must be a non-empty string');
    }
    if (typeof fn !== 'function') {
      throw new Error('messaging: subscribe(path, fn) requires a function');
    }
    let set = subs.get(path);
    if (!set) { set = new Set(); subs.set(path, set); }
    set.add(fn);
    return () => {
      const s = subs.get(path);
      if (!s) return;
      s.delete(fn);
      if (!s.size) subs.delete(path);
    };
  };

  const publish = (path, occasion = 'data', data = null) => {
    const set = subs.get(path);
    if (!set) return 0;
    let delivered = 0;
    for (const fn of [...set]) {
      try { fn(occasion, data, path); delivered++; }
      catch (e) { console.error(`messaging: subscriber on "${path}" threw`, e); }
    }
    return delivered;
  };

  // Inspect — number of active subscribers for a path.
  const subscriberCount = (path) => subs.get(path)?.size ?? 0;

  // Inspect — list every path that currently has at least one subscriber.
  const activePaths = () => [...subs.keys()];

  // Drop every subscriber for a path (useful in tests / hot reload).
  const clearPath = (path) => subs.delete(path);

  window.messaging = { subscribe, publish, subscriberCount, activePaths, clearPath };
})();
