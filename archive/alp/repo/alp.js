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
