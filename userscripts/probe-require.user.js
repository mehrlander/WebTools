// ==UserScript==
// @name        wt probe-require
// @description Does the iOS Userscripts build fetch a remote @require? A dark bar means yes, a red bar means the script ran without it, nothing means the script never ran.
// @match       https://mehrlander.github.io/*
// @match       https://github.com/*
// @require     https://cdn.jsdelivr.net/gh/mehrlander/web-tools@03b527a4796b48bb5e960cb72d42c0111f31b9dd/userscripts/lib/probe-bar.js
// @run-at      document-end
// ==/UserScript==
(window.wtProbeBar || (o => {
  const row = { op: 'probe', name: 'probe-bar', build: o.ref, route: o.route, require: 'missing', href: location.href };
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;gap:12px;align-items:center;padding:10px 14px;background:#b91c1c;color:#fff;font:15px -apple-system,system-ui,sans-serif';
  bar.innerHTML = '<span style="flex:1">userscript ran, @require missing @ ' + o.ref.slice(0, 7) + '</span>';
  const a = document.createElement('a');
  a.href = 'shortcuts://run-shortcut?name=Log-Repo&input=text&text=' + encodeURIComponent(JSON.stringify(row));
  a.textContent = 'Log';
  a.style.cssText = 'padding:6px 14px;border-radius:8px;background:#fff;color:#111;text-decoration:none;font-weight:600';
  bar.appendChild(a);
  document.body.prepend(bar);
}))({ route: 'userscript', ref: '03b527a4796b48bb5e960cb72d42c0111f31b9dd' });
