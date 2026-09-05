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
// opened here.
//
// ON OUR OWN PAGES THERE IS NO WINDOW AND NO PANEL. The pointer passes `home`
// true on mehrlander.github.io and opens nothing, so a tap there navigates the
// tab to the open errand. Reading about the errand was never the point; being
// on its page is. This is also why `home` is a separate argument rather than
// `w === null`: a blocked popup on somebody else's page arrives the same way,
// and stealing the tab you were reading is the one thing a bookmarklet must
// not do. Blocked, the plain fallback panel below runs instead.
//
// THE ERRAND SCRIPT STILL RUNS IN THE HOST PAGE. Only the interface moved. The
// script's whole purpose is to read the DOM the browser already loaded and
// cleared Cloudflare for; running it inside the popup would hand it a blank
// document. A window opened with an empty URL inherits the opener's origin, so
// this file can script it and `window.opener` survives.
//
// THE STYLING IS PLAIN CSS, WHICH IS THE ONE PLACE THE HOUSE STACK DOES NOT
// REACH. One markup string mounts into a blank popup document and into a shadow
// root on somebody else's page, and Tailwind from a CDN reaches the first and
// not the second. The composition rules still apply and are what the form below
// is answering: labels and structure instead of prose, one size for content,
// one accent that means "the selected target".
//
// WHAT THE TRUST MODEL IS. No token anywhere: the errand list and the scripts
// are public, and a result leaves by clipboard or by a prefilled GitHub form
// you submit while signed in. A bookmarklet's code runs inside the visited
// page's JavaScript context, where a hostile page could shim `fetch` and read
// an Authorization header off it, so there is nothing to read. The confirm gate
// lives here rather than in the bookmark, which makes it revisable by a commit
// to this repo; that is a smaller guarantee than the first cut had, stated
// rather than quietly lost.
//
// REPO AND REF ARE CONSTANTS, NOT SETTINGS. A courier you could aim at another
// repo is a courier somebody else can aim, and the whole trust story here is
// that the code and the errand list come from one public place you can read.
// The header names that place so it is checkable rather than assumed.

(async (popup, home) => {
  const HOST = location.hostname;
  const REPO = 'mehrlander/web-tools';
  const REF = 'main';
  const FORM_CAP = 7500;

  // Through the GitHub API, not the raw CDN. raw.githubusercontent caches five
  // minutes at the edge and `cache: no-store` defeats only the browser's copy,
  // so an errand added a moment ago could be invisible. The API answers current.
  // The cost is the unauthenticated rate limit, 60 an hour per address, which is
  // about twenty courier runs.
  //
  // `budget` is that allowance read back off the response. Whether it arrives is
  // the server's call: a cross-origin reader sees only the headers GitHub names
  // in Access-Control-Expose-Headers, so this is a read that either works or
  // yields null, and the header shows it only when it is there. Unverified from
  // the sandbox, which reaches api.github.com through a credential-injecting
  // proxy and so cannot see what a browser would.
  let budget = null;
  const api = async (path) => {
    const url = `https://api.github.com/repos/${REPO}/contents/${path}?ref=${REF}`;
    const r = await fetch(url, { headers: { Accept: 'application/vnd.github.raw' }, cache: 'no-store' });
    const left = r.headers.get('x-ratelimit-remaining');
    if (left !== null && left !== '') budget = Number(left);
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
      .cx-panel{background:#fff;color:#0f172a;display:flex;flex-direction:column;gap:14px;
        padding:16px;box-sizing:border-box;font:14px/1.5 -apple-system,system-ui,sans-serif}
      .cx-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;
        border-bottom:1px solid #e2e8f0;padding-bottom:10px}
      .cx-head h3{margin:0;font-size:15px}
      .cx-head .cx-here{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#15803d}
      .cx-head .cx-src{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#64748b;
        text-decoration:none;border-bottom:1px dotted #94a3b8}
      .cx-head .cx-src:hover{color:#0f172a}
      .cx-head .cx-state{margin-left:auto;font-size:12px;color:#64748b}
      .cx-lab{font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.05em;
        text-transform:uppercase;color:#64748b}
      .cx-pick{display:flex;flex-direction:column;gap:6px;margin:4px 0 0}
      .cx-opt{display:flex;gap:10px;align-items:flex-start;background:#f8fafc;cursor:pointer;
        border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px}
      .cx-opt.on{border-color:#15803d;background:#f0fdf4}
      .cx-opt input{margin:3px 0 0;accent-color:#15803d;flex:none}
      .cx-opt b{display:block;font-weight:600;text-wrap:balance}
      .cx-opt .cx-note{display:block;color:#475569;margin-top:3px;text-wrap:pretty}
      .cx-opt .cx-host{display:block;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#15803d;margin-top:2px}
      .cx-meta{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 14px;margin:0}
      .cx-meta dt{font:11px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.05em;
        text-transform:uppercase;color:#64748b}
      .cx-meta dd{margin:0;word-break:break-word}
      .cx-meta dd.cx-mono{font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}
      .cx-meta a{color:inherit;text-decoration:none;border-bottom:1px solid #cbd5e1}
      .cx-meta a:hover{border-bottom-color:#15803d}
      .cx-meta .cx-dim{color:#64748b}
      .cx-body,.cx-out{flex:1;min-height:120px;overflow:auto;background:#f1f5f9;border:1px solid #cbd5e1;
        border-radius:8px;padding:11px 12px;color:#0f172a;margin:0;
        font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;
        white-space:pre-wrap;word-break:break-word}
      .cx-out{resize:none;width:100%;box-sizing:border-box}
      .cx-row{display:flex;gap:8px;flex-wrap:wrap}
      .cx-row button{flex:1 1 auto;min-width:110px;padding:11px;border:0;border-radius:99px;
        font:600 15px system-ui;color:#fff;background:#0f172a;cursor:pointer}
      .cx-row button.cx-quiet{background:#e2e8f0;color:#0f172a}
      .cx-row button.cx-go{background:#15803d}
      .cx-row button[disabled]{opacity:.45;cursor:not-allowed}
      .cx-fields{display:flex;flex-direction:column;gap:12px;margin:0}
      .cx-msg{margin:0;color:#475569;text-wrap:pretty}
    </style>
    <div class="cx-panel">
      <header class="cx-head"><h3>Courier</h3><span class="cx-here"></span>
        <a class="cx-src" target="_blank" rel="noopener"></a><span class="cx-state"></span></header>
      <div class="cx-fields"></div>
      <div class="cx-body"></div>
      <div class="cx-row"></div>
    </div>`;

  // Mounted on demand, not on entry: on our own pages the common path navigates
  // and shows nothing at all, and a panel that painted first would be a flash.
  let root, close;
  const mount = () => {
    if (root) return;
    let drop;
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
      drop = () => popup.close();
      try { popup.focus(); } catch (e) { /* some browsers refuse; harmless */ }
    } else {
      // In the page: our own pages by design, somebody else's only when the
      // popup was blocked. Shadow root so the host stylesheet cannot reach in.
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
      drop = () => el.remove();
    }
    // Escape closes, on whichever document is carrying the panel.
    const doc = (popup && popup.document) || document;
    const key = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); close(); } };
    doc.addEventListener('keydown', key);
    close = () => { doc.removeEventListener('keydown', key); drop(); };

    $('.cx-here').textContent = HOST;
    const src = $('.cx-src');
    src.textContent = REPO + '@' + REF;
    src.href = 'https://github.com/' + REPO + '/tree/' + REF + '/courier';
  };

  const $ = (sel) => root.querySelector(sel);
  const esc = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const link = (href, text) =>
    `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`;
  // The allowance rides along only as it runs out, and never displaces what the
  // panel was saying. A 403 with no warning ahead of it reads as a bug.
  const state = (t) => {
    const low = budget !== null && budget <= 10 ? budget + ' GitHub reads left this hour' : '';
    $('.cx-state').textContent = [t, low].filter(Boolean).join(' · ');
  };
  const button = (label, cls, fn) => {
    const b = (root.ownerDocument || root).createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.onclick = fn;
    $('.cx-row').appendChild(b);
    return b;
  };
  // A script's leading comment banner is documentation, not logic, so the panel
  // drops it and opens on the first line that runs.
  //
  // Only a CONTIGUOUS run of `//` lines and blanks from the very START of the
  // file, stopping at the first line that is neither. Nothing can precede the
  // first line, so no string or regular expression can be mistaken for a
  // comment, which is what makes this safe where a general comment stripper is
  // not: it cannot remove code. Comments beside code stay, since those are read
  // with the line they explain. The gate loses nothing either way, because what
  // it exists to show is what will execute, and a comment never does, and the
  // Script row links the file whole.
  const trimBanner = (t) => {
    const lines = t.split('\n');
    let i = 0;
    while (i < lines.length && /^\s*(\/\/.*)?$/.test(lines[i])) i++;
    const rest = lines.slice(i).join('\n');
    return i && rest.trim() ? rest : t;
  };

  // The errand record's own fields, shown as a form rather than described in a
  // sentence: where it runs, what it runs, where the answer goes, who is
  // waiting. Each returns HTML so a value can carry a link over the part that
  // exists: the script blob does, the result path does not until you commit it,
  // so Result links its repo and leaves the path plain.
  let shown = null;
  const FIELDS = [
    ['Page', 1, e => e.url ? link(e.url, e.url) : ''],
    ['Script', 1, e => !e.script ? '' :
      link(`https://github.com/${REPO}/blob/${REF}/${e.script}`, e.script)
      + (shown ? ` <span class="cx-dim">· ${shown.split('\n').length} lines</span>` : '')],
    ['Result', 1, e => !e.result ? '' :
      link('https://github.com/' + e.result.repo, e.result.repo) + ' · ' + esc(e.result.path)],
    ['For', 0, e => esc(e.for || '')],
    ['Opened', 1, e => esc(e.opened || '')],
  ];

  // ---- one form, two verbs -------------------------------------------------
  //
  // The picker is drawn even for a single errand. That is the point of it: the
  // shape of the thing is "one of the open errands", and a panel that hid the
  // choice when there was one left the reader guessing whether there could be
  // more. Errands here run; errands elsewhere open.
  let redraw = () => {};
  const form = (errands, verb, onPick) => {
    mount();
    state(errands.length + (errands.length === 1 ? ' errand' : ' errands')
      + (verb === 'run' ? ' on this page' : ' open elsewhere'));

    const fields = $('.cx-fields');
    fields.innerHTML =
      `<div><div class="cx-lab">${verb === 'run' ? 'Errand' : 'Where to go'}</div>
         <div class="cx-pick">` + errands.map((e, i) =>
        `<label class="cx-opt${i ? '' : ' on'}">
           <input type="radio" name="cx-e" value="${i}"${i ? '' : ' checked'}>
           <span><b>${esc(e.title)}</b>${verb === 'go' ? `<span class="cx-host">${esc(e.host)}</span>` : ''}${e.note ? `<span class="cx-note">${esc(e.note)}</span>` : ''}</span>
         </label>`).join('') + `</div></div>
       <dl class="cx-meta"></dl>`;

    const meta = $('.cx-meta');
    let current = errands[0];
    redraw = () => {
      meta.innerHTML = FIELDS
        .map(([label, mono, read]) => [label, mono, read(current)])
        .filter(([, , v]) => v)
        .map(([label, mono, v]) => `<dt>${esc(label)}</dt><dd${mono ? ' class="cx-mono"' : ''}>${v}</dd>`)
        .join('');
    };
    redraw();

    fields.querySelectorAll('.cx-opt').forEach((opt, i) => {
      opt.querySelector('input').onchange = () => {
        fields.querySelectorAll('.cx-opt').forEach((o, j) => o.classList.toggle('on', i === j));
        current = errands[i];
        redraw();
        onPick(errands[i], i);
      };
    });
    return errands[0];
  };

  const stop = (note) => {
    mount();
    state('');
    $('.cx-fields').innerHTML = `<p class="cx-msg">${esc(note)}</p>`;
    $('.cx-body').remove();
    button('Close', 'cx-quiet', () => close());
  };

  // ---- routing -------------------------------------------------------------
  let list;
  try { list = JSON.parse(await api('courier/errands.json')); }
  catch (e) { return stop('Could not read the errand list. ' + e.message); }

  // Exact hostname, no normalisation, so www.example.com and example.com are
  // different errands.
  const mine = (list.errands || []).filter(e => e.host === HOST && e.status === 'open');
  const elsewhere = (list.errands || []).filter(e => e.status === 'open' && e.url);

  if (!mine.length) {
    // One open errand and we are on our own page: go there. More than one and
    // there is nothing single to go to, so the picker is the answer after all.
    if (home && elsewhere.length === 1) { location.href = elsewhere[0].url; return; }
    if (!elsewhere.length) return stop('No errand is open on any host.');
    let pick = form(elsewhere, 'go', (e) => { pick = e; });
    $('.cx-body').remove();
    button('Close', 'cx-quiet', () => close());
    button('Open that page', 'cx-go', () => (popup || window).open(pick.url, '_blank'));
    return;
  }

  // Show the bytes, not a description of them: the Proposals rule, applied to
  // code rather than to a diff. The script is on screen in full before the
  // button that runs it exists.
  let errand = mine[0], src = null;
  const load = async (e) => {
    errand = e; src = null; shown = null;
    $('.cx-body').textContent = 'Reading ' + e.script + '…';
    redraw();
    try { src = await api(e.script); shown = trimBanner(src); $('.cx-body').textContent = shown; }
    catch (err) { $('.cx-body').textContent = 'Could not read the script. ' + err.message; }
    redraw();
  };
  form(mine, 'run', load);
  await load(errand);

  button('Cancel', 'cx-quiet', () => close());
  button('Run this script', 0, async () => {
    if (!src) return;
    $('.cx-row').innerHTML = '';
    state('running');

    // In the OPENER's context, which is where the page is.
    let out;
    try { out = await new Function('ctx', src)({ errand }); }
    catch (e) { out = 'ERROR: ' + (e && e.stack || e); }
    if (typeof out !== 'string') out = JSON.stringify(out, null, 1);

    const box = (root.ownerDocument || root).createElement('textarea');
    box.className = 'cx-out';
    box.value = out;
    $('.cx-body').replaceWith(box);
    $('.cx-pick').parentElement.remove();

    // GitHub's new-file form takes the content prefilled, on your signed-in
    // session, so nothing here needs a token. The cap is where the prefill stops
    // being reliable, not where the form stops accepting, and it is known before
    // the tap, so it is a disabled button rather than an error after one.
    const commitUrl = 'https://github.com/' + errand.result.repo + '/new/' + errand.result.branch
      + '?filename=' + encodeURIComponent(errand.result.path)
      + '&value=' + encodeURIComponent(out);
    const over = commitUrl.length > FORM_CAP;
    state(out.length.toLocaleString() + ' characters'
      + (over ? ', over the ' + FORM_CAP.toLocaleString() + ' the GitHub form takes' : ''));

    button('Copy', 'cx-quiet', () => {
      box.select();
      const nav = (popup && popup.navigator) || navigator;
      if (nav.clipboard) nav.clipboard.writeText(out).then(() => state('copied'), () => state('copy it by hand'));
      else state('copy it by hand');
    });
    const commit = button(over ? 'Too long to commit' : 'Commit', over ? 'cx-quiet' : 'cx-go', () => {
      (popup || window).open(commitUrl, '_blank');
      state('finish in the GitHub tab');
    });
    commit.disabled = over;
    button('Close', 'cx-quiet', () => close());
  });
})(typeof w !== 'undefined' ? w : null, typeof home !== 'undefined' ? home : false);
