// The courier's body. bookmarklets/courier.js is a pointer at this file, so
// everything here is revisable without reinstalling anything.
//
// THE INTERFACE IS A POPUP, NOT AN OVERLAY ON THE PAGE. A panel injected into
// somebody else's document loses fights it should not be in: a host stylesheet,
// a focus trap, `overflow:hidden` on `html`, `position:fixed` behaving oddly
// inside a transformed ancestor. Shadow DOM answers the styling half and none
// of the rest. A separate window answers all of it, and this repo already runs
// that pattern in bookmarklets/popup-launcher.js and popups/.
//
// The window is opened by the POINTER, synchronously, before its first await.
// That is not a style choice: a popup is permitted only while the user-gesture
// token is live, and the first await spends it. By the time this file has been
// fetched the gesture is gone, so `w` arrives as an argument and cannot be
// opened here. If it was blocked anyway, `w` is null and the fallback panel
// below runs instead, which is deliberately plain.
//
// THE ERRAND SCRIPT STILL RUNS IN THE HOST PAGE. Only the interface moved. The
// script's whole purpose is to read the DOM the browser already loaded and
// cleared Cloudflare for; running it inside the popup would hand it a blank
// document. A window opened with an empty URL inherits the opener's origin, so
// this file can script it and `window.opener` survives.
//
// WHAT THE TRUST MODEL IS. No token anywhere: the errand list and the scripts
// are public, and a result leaves by clipboard or by a prefilled GitHub form
// you submit while signed in. A bookmarklet's code runs inside the visited
// page's JavaScript context, where a hostile page could shim `fetch` and read
// an Authorization header off it, so there is nothing to read. The confirm gate
// lives here rather than in the bookmark, which makes it revisable by a commit
// to this repo; that is a smaller guarantee than the first cut had, stated
// rather than quietly lost.

(async (popup) => {
  const HOST = location.hostname;
  const REPO = 'mehrlander/web-tools';
  const REF = 'main';

  // Through the GitHub API, not the raw CDN. raw.githubusercontent caches five
  // minutes at the edge and `cache: no-store` defeats only the browser's copy,
  // so an errand added a moment ago could be invisible. The API answers current.
  // The cost is the unauthenticated rate limit, 60 an hour per address, which is
  // about twenty courier runs; a 403 says so rather than reading as a bug.
  const api = async (path) => {
    const url = `https://api.github.com/repos/${REPO}/contents/${path}?ref=${REF}`;
    const r = await fetch(url, { headers: { Accept: 'application/vnd.github.raw' }, cache: 'no-store' });
    if (r.status === 403) throw new Error('HTTP 403, likely GitHub\'s hourly rate limit for unauthenticated reads');
    if (!r.ok) throw new Error(path + ' -> HTTP ' + r.status);
    return r.text();
  };

  // ---- the interface, mounted into a popup or, failing that, into the page ---
  //
  // One markup string and one wiring pass serve both, so a fix reaches both.
  // Only the outermost frame differs: a popup fills its window, the fallback
  // has to place itself over a document that did not invite it.
  const SHELL = `
    <style>
      .cx-panel{background:#fff;color:#0f172a;display:flex;flex-direction:column;gap:10px;
        padding:16px;box-sizing:border-box;font:14px/1.45 -apple-system,system-ui,sans-serif}
      .cx-panel h3{margin:0;font-size:16px}
      .cx-panel p{margin:0;color:#475569;font-size:13px}
      .cx-body,.cx-out{flex:1;min-height:0;overflow:auto;background:#f1f5f9;border:1px solid #cbd5e1;
        border-radius:8px;padding:10px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;
        white-space:pre-wrap;word-break:break-word;color:#0f172a;margin:0}
      .cx-out{resize:none;width:100%;box-sizing:border-box}
      .cx-row{display:flex;gap:8px;flex-wrap:wrap}
      .cx-row button{flex:1 1 auto;min-width:110px;padding:11px;border:0;border-radius:99px;
        font:600 15px system-ui;color:#fff;background:#0f172a;cursor:pointer}
      .cx-row button.cx-quiet{background:#e2e8f0;color:#0f172a}
      .cx-row button.cx-go{background:#15803d}
    </style>
    <div class="cx-panel">
      <h3></h3><p></p><pre class="cx-body"></pre><div class="cx-row"></div>
    </div>`;

  let root, close;
  if (popup && popup.document) {
    // A named window is reused across runs, so the document is reopened rather
    // than appended to; otherwise a second run stacks on the first.
    const d = popup.document;
    d.open();
    d.write(`<!doctype html><html><head><meta charset="utf-8"><title>Courier</title>
      <style>html,body{margin:0;height:100%}body{display:flex}.cx-panel{flex:1;min-height:0}</style>
      </head><body>${SHELL}</body></html>`);
    d.close();
    root = d;
    close = () => popup.close();
    try { popup.focus(); } catch (e) { /* some browsers refuse; harmless */ }
  } else {
    // Fallback: plain, and only reached when the popup was blocked. Shadow root
    // so the host page's stylesheet cannot reach in; no scrim, no animation.
    const tag = 'courier-' + Date.now();
    customElements.define(tag, class extends HTMLElement {
      constructor() { super().attachShadow({ mode: 'open' }); }
    });
    const el = document.createElement(tag);
    document.documentElement.appendChild(el);
    el.shadowRoot.innerHTML =
      `<style>:host{position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.55)}
       .cx-panel{position:absolute;inset:5%;max-width:900px;margin:auto;border-radius:12px;
         box-shadow:0 10px 40px rgba(0,0,0,.35)}</style>` + SHELL;
    root = el.shadowRoot;
    close = () => el.remove();
  }

  const $ = (sel) => root.querySelector(sel);
  const say = (title, note) => { $('h3').textContent = title; $('p').textContent = note || ''; };
  const button = (label, cls, fn) => {
    const b = (root.ownerDocument || root).createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.onclick = fn;
    $('.cx-row').appendChild(b);
    return b;
  };
  const stop = (title, note) => { say(title, note); $('.cx-body').remove(); button('Close', 'cx-quiet', close); };

  // ---- the errand ----------------------------------------------------------
  let list;
  try { list = JSON.parse(await api('courier/errands.json')); }
  catch (e) { return stop('Courier', 'Could not read the errand list. ' + e.message); }

  // Routing is by exact hostname, no normalisation, so www.example.com and
  // example.com are different errands. A host with nothing open names the hosts
  // that do have something, because "nothing happened" is the failure mode that
  // reads as a broken bookmark.
  const open = (list.errands || []).filter(e => e.host === HOST && e.status === 'open');
  if (!open.length) {
    const elsewhere = (list.errands || []).filter(e => e.status === 'open').map(e => e.host);
    return stop('Nothing open for ' + HOST,
      elsewhere.length ? 'Open errands are waiting on: ' + elsewhere.join(', ')
                       : 'No errand is open on any host.');
  }
  const errand = open[0];

  let src;
  try { src = await api(errand.script); }
  catch (e) { return stop(errand.title, 'Could not read the script. ' + e.message); }

  // Show the bytes, not a description of them: the Proposals rule, applied to
  // code rather than to a diff. The script is on screen in full before the
  // button that runs it exists.
  say(errand.title, errand.note || '');
  $('.cx-body').textContent = src;
  button('Cancel', 'cx-quiet', close);
  button('Run this script', 0, async () => {
    $('.cx-row').innerHTML = '';
    say(errand.title + ' — ran', 'Working…');

    // In the OPENER's context, which is where the page is.
    let out;
    try { out = await new Function('ctx', src)({ errand }); }
    catch (e) { out = 'ERROR: ' + (e && e.stack || e); }
    if (typeof out !== 'string') out = JSON.stringify(out, null, 1);

    const box = (root.ownerDocument || root).createElement('textarea');
    box.className = 'cx-out';
    box.value = out;
    $('.cx-body').replaceWith(box);
    say(errand.title + ' — ran',
      out.length + ' characters. Commit opens a prefilled GitHub form for '
      + errand.result.repo + ' at ' + errand.result.path + '; you tap Commit changes there.');

    button('Copy', 'cx-quiet', () => {
      box.select();
      const done = () => say(errand.title + ' — copied', out.length + ' characters on the clipboard.');
      const nav = (popup && popup.navigator) || navigator;
      if (nav.clipboard) nav.clipboard.writeText(out).then(done, () => say(errand.title, 'Select the text and copy it by hand.'));
      else say(errand.title, 'Select the text and copy it by hand.');
    });
    // GitHub's new-file form takes the content prefilled, on your signed-in
    // session, so nothing here needs a token. The cap is where the prefill stops
    // being reliable, not where the form stops accepting.
    button('Commit', 'cx-go', () => {
      const url = 'https://github.com/' + errand.result.repo + '/new/' + errand.result.branch
        + '?filename=' + encodeURIComponent(errand.result.path)
        + '&value=' + encodeURIComponent(out);
      if (url.length > 7500) {
        return say(errand.title, 'Too long for the GitHub form (' + url.length
          + ' characters encoded). Use Copy and paste it back instead.');
      }
      (popup || window).open(url, '_blank');
    });
    button('Close', 'cx-quiet', close);
  });
})(typeof w !== 'undefined' ? w : null);
