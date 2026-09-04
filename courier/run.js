// The courier's body. bookmarklets/courier.js is a pointer at this file and
// nothing else, so everything here is revisable without reinstalling anything:
// the routing, the panel, the confirm gate, the delivery routes.
//
// WHAT THAT COSTS, SAID WHERE IT IS TRUE. When the mechanism lived in the
// bookmark, the confirm gate was beyond the repo's reach: no change here could
// remove the step that shows you a script before it runs. Now it can. The trust
// anchor moved from "this bookmark's own code" to "whatever mehrlander/web-tools
// main serves at courier/run.js", which is a repo you control, and that is the
// whole of the guarantee. It is a smaller guarantee honestly stated rather than
// a larger one quietly lost.
//
// What it buys, beyond never reinstalling: this file is readable. A bookmarklet
// is one line by construction, so the mechanism was a 3KB blob nobody could
// review. Out here it is source.
//
// No token is anywhere near it, unchanged from the first cut. The errand list
// and scripts are public, the result leaves by clipboard or by a prefilled
// GitHub form you submit while signed in. A bookmarklet's code runs inside the
// visited page's JavaScript context, where a hostile page could shim `fetch` and
// read an Authorization header straight off it, so there is nothing to read.

(async () => {
  const HOST = location.hostname;
  const RAW = 'https://raw.githubusercontent.com/mehrlander/web-tools/main/';
  const get = async (path) => {
    const r = await fetch(RAW + path, { cache: 'no-store' });
    if (!r.ok) throw new Error(path + ' -> HTTP ' + r.status);
    return r;
  };

  let list;
  try { list = await (await get('courier/errands.json')).json(); }
  catch (e) { return alert('Courier: no errand list (' + e.message + ')'); }

  // Routing is by exact hostname, no normalisation, so www.example.com and
  // example.com are different errands. A host with nothing open says which
  // hosts do have something, because "nothing happened" is the failure mode
  // that reads as a broken bookmark.
  const open = (list.errands || []).filter(e => e.host === HOST && e.status === 'open');
  if (!open.length) {
    const elsewhere = (list.errands || []).filter(e => e.status === 'open').map(e => '• ' + e.host);
    return alert('Courier: nothing open for ' + HOST + '.\n\nOpen elsewhere:\n'
      + (elsewhere.join('\n') || 'nothing at all.'));
  }
  const errand = open[0];

  let src;
  try { src = await (await get(errand.script)).text(); }
  catch (e) { return alert('Courier: no script (' + e.message + ')'); }

  // The panel lives in a shadow root so the host page's stylesheet cannot reach
  // it, and under a custom element name keyed to the clock so a second run on
  // the same page does not collide with the first.
  const tag = 'courier-' + Date.now();
  customElements.define(tag, class extends HTMLElement {
    constructor() { super().attachShadow({ mode: 'open' }); }
  });
  const host = document.createElement(tag);
  document.documentElement.appendChild(host);
  const root = host.shadowRoot;
  root.innerHTML = `<style>
    :host{position:fixed;inset:0;z-index:2147483647;font:14px/1.45 -apple-system,system-ui,sans-serif}
    .scrim{position:absolute;inset:0;background:rgba(15,23,42,.55)}
    .panel{position:absolute;inset:4% 3%;background:#fff;color:#0f172a;border-radius:14px;
      padding:14px;display:flex;flex-direction:column;gap:10px;overflow:hidden}
    h3{margin:0;font-size:16px}
    p{margin:0;color:#475569;font-size:13px}
    pre,textarea{flex:1;min-height:0;overflow:auto;background:#f1f5f9;border:1px solid #cbd5e1;
      border-radius:8px;padding:8px;font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap;
      word-break:break-word;color:#0f172a}
    textarea{resize:none}
    .row{display:flex;gap:8px;flex-wrap:wrap}
    button{flex:1 1 auto;min-width:90px;padding:11px;border:0;border-radius:99px;
      font:600 15px system-ui;color:#fff;background:#0f172a}
    button.quiet{background:#e2e8f0;color:#0f172a}
    button.go{background:#15803d}
  </style>
  <div class=scrim></div>
  <div class=panel><h3></h3><p></p><pre></pre><div class=row></div></div>`;

  const $ = (sel) => root.querySelector(sel);
  const close = () => host.remove();
  $('.scrim').onclick = close;
  const button = (label, cls, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.onclick = fn;
    $('.row').appendChild(b);
    return b;
  };

  // Show the bytes, not a description of them: the Proposals rule, applied to
  // code rather than to a diff. The script is on screen in full before the
  // button that runs it exists.
  $('h3').textContent = errand.title;
  $('p').textContent = errand.note || '';
  $('pre').textContent = src;
  button('Cancel', 'quiet', close);
  button('Run this script', 0, async () => {
    $('.row').innerHTML = '';
    $('h3').textContent = errand.title + ' — ran';

    let out;
    try { out = await new Function('ctx', src)({ errand }); }
    catch (e) { out = 'ERROR: ' + (e && e.stack || e); }
    if (typeof out !== 'string') out = JSON.stringify(out, null, 1);

    const box = document.createElement('textarea');
    box.value = out;
    $('pre').replaceWith(box);
    $('p').textContent = out.length + ' characters. Commit opens a prefilled GitHub form for '
      + errand.result.repo + ' at ' + errand.result.path + '; you tap Commit changes there.';

    button('Copy', 'quiet', () => {
      box.select();
      navigator.clipboard.writeText(out).then(
        () => alert('Copied'),
        () => alert('Select and copy it by hand'));
    });
    // GitHub's new-file form takes the content prefilled, on your signed-in
    // session, so nothing here needs a token. The cap is where the prefill
    // stops being reliable, not where the form stops accepting.
    button('Commit', 'go', () => {
      const url = 'https://github.com/' + errand.result.repo + '/new/' + errand.result.branch
        + '?filename=' + encodeURIComponent(errand.result.path)
        + '&value=' + encodeURIComponent(out);
      if (url.length > 7500) {
        return alert('Too long for the GitHub form (' + url.length + ' chars). Use Copy instead.');
      }
      open(url, '_blank');
    });
    button('Close', 'quiet', close);
  });
})();
