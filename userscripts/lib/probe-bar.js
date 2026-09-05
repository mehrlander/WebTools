// probe-bar: one function, inert until called. Injects a bar at the top of the
// page reporting how the code arrived (userscript or bookmarklet), which commit
// it loaded from, and a Log button that hands a JSON row to the Log-Repo
// shortcut. The stubs in ../probe-require.user.js and
// ../../bookmarklets/probe-bar.js call it; nothing runs on load.
window.wtProbeBar = ({ route, ref }) => {
  const row = {
    op: 'probe', name: 'probe-bar', build: ref, route,
    href: location.href, title: document.title, ua: navigator.userAgent.slice(0, 60)
  };
  const link = 'shortcuts://run-shortcut?name=Log-Repo&input=text&text=' + encodeURIComponent(JSON.stringify(row));
  const old = document.getElementById('wt-probe-bar'); if (old) old.remove();
  const bar = document.createElement('div');
  bar.id = 'wt-probe-bar';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;gap:12px;align-items:center;padding:10px 14px;background:#111;color:#eee;font:15px -apple-system,system-ui,sans-serif';
  bar.innerHTML = `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b>${route}</b> @ ${ref.slice(0, 7)} · ${row.title}</span>`;
  const a = document.createElement('a');
  a.href = link; a.textContent = 'Log';
  a.style.cssText = 'padding:6px 14px;border-radius:8px;background:#4ade80;color:#111;text-decoration:none;font-weight:600';
  bar.appendChild(a);
  document.body.prepend(bar);
};
