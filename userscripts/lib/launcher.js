// The Web Tools launcher, carried onto pages that have none of their own.
//
// WHAT IT IS. The launcher alpineComponents/fab.js mounts, plus a drawer of the
// same shape, holding what a page that is not ours can honestly answer for.
// Tap opens the drawer, a held finger opens the short menu, a drag moves it:
// the fab's three gestures, in the fab's order.
//
// WHAT THE DRAWER IS NOT is the fab's. Two of that drawer's four tabs cannot
// mean anything off our origin: Render reads the GitHub API through a token
// held in localStorage on the web-tools origin, which a foreign origin does not
// have and must not be given, and Inspect lists the modules gh.load() fetched,
// of which a foreign page has none. What a foreign page DOES hold is its own
// content, so the three panes here are the three answers it can give: what this
// page is, what it links to, what it says.
//
// TWO ROUTES OUT, because one payload shape cannot carry both. Send hands the
// capture to the Log-Repo shortcut and it lands in the repo, but it rides
// inside a shortcuts:// URL, and a URL has a ceiling nobody has measured
// exactly (14,190 characters is known to work; the failure past it would be a
// truncated payload that arrives looking complete). So Send is capped well
// under that and says so, and Copy takes anything, since the clipboard has no
// such limit. The cap is on the delivery, never on the selection: a capture too
// big to send is still one you can copy.
//
// SO IT YIELDS. On a page that already carries a fab this must not mount, or
// every web-tools page grows a second launcher beside the real one, which is
// how it read on 2026-09-05 before this rule existed. The fab may not have
// mounted yet at document-end, so the decision is made twice: the synchronous
// tells below, then an observer that removes this one if the real launcher
// appears within a few seconds.
//
// WHY IT IS HAND-STYLED. The house style (skills/daisy-alpine) governs pages
// built here; this is markup injected into someone else's document, where
// Tailwind has nothing to compile against and every CDN tag is the first thing
// a Content-Security-Policy refuses. So the winter theme's tokens are written
// out below as literals and the opacity steps go through color-mix, which is
// how Tailwind 4 renders `/10` anyway. Everything sits in a SHADOW ROOT behind
// a CONSTRUCTED stylesheet: a <style> element answers to the page's style-src
// and a constructed sheet is CSSOM, which does not. Measured against
// `script-src 'self'; style-src 'self'`, where the bookmarklet route is refused
// outright and this one mounts intact.
window.wtLauncher = ({ ref, app = 'https://mehrlander.github.io/web-tools/app/' }) => {
  const ID = 'wt-launcher';
  if (document.getElementById(ID)) return;

  // A page that carries the loader will mount its own fab, and one that has
  // refused a fab has refused this too: data-no-fab is an answer to the
  // question this file is asking, not a web-tools-only setting.
  const realFab = () => document.querySelector('[aria-label="Web-tools panel"]');
  if (realFab() || window.gh || window.__fabHosted ||
      document.documentElement.hasAttribute('data-no-fab') ||
      document.body?.hasAttribute('data-no-fab')) return;

  // Under this many characters the whole shortcuts:// URL is sent; over it,
  // Send stands down and names Copy. See the two-routes note above.
  const SEND_MAX = 8000;

  // ---- What the page can answer for -------------------------------------
  //
  // Read once, when the drawer first opens, rather than at mount: the launcher
  // is on every page and the drawer on few of them, which is the same reason
  // the fab builds its own body on first open.

  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

  // Links, deduped by address. A page repeats its own navigation in a header
  // and a footer, and a list of forty links where fifteen are the same six
  // destinations is a list nobody reads. Anchors with no visible text are kept
  // and labelled by their address, since an image link is still a link; ones
  // that go nowhere a reader could follow are dropped.
  const readLinks = () => {
    const seen = new Map();
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.href;
      if (!/^https?:/.test(href) || href === location.href) continue;
      const text = clean(a.innerText) || clean(a.getAttribute('aria-label')) ||
                   clean(a.querySelector('img')?.alt) || href.replace(/^https?:\/\//, '');
      if (!seen.has(href)) seen.set(href, text.slice(0, 120));
    }
    return [...seen].map(([href, text]) => ({ href, text }));
  };

  // The page's own text. The container is asked for by name first, because a
  // page that marks up an <article> has already answered the question better
  // than any heuristic could; the fallback picks the densest block rather than
  // the biggest, so a nav column of eighty short links does not beat the prose.
  const readText = () => {
    const named = document.querySelector('article, main, [role="main"]');
    let best = named;
    if (!best) {
      let score = 0;
      for (const el of document.querySelectorAll('body *')) {
        if (/^(SCRIPT|STYLE|NAV|HEADER|FOOTER|ASIDE|SVG)$/.test(el.tagName)) continue;
        const t = el.innerText || '';
        if (t.length < 400) continue;
        const s = t.length / (1 + el.querySelectorAll('a').length * 40);
        if (s > score) { score = s; best = el; }
      }
    }
    // clean() is wrong here: innerText already marks block boundaries with
    // newlines, and collapsing those runs every paragraph and heading into one
    // line. Horizontal runs collapse, vertical ones survive as a blank line.
    return String((best || document.body).innerText || '')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 100000);
  };

  const page = {
    title: document.title || location.hostname,
    href: location.href,
    description: clean(document.querySelector('meta[name="description"]')?.content ||
                       document.querySelector('meta[property="og:description"]')?.content),
  };

  // The selection is read when the drawer OPENS, not when the launcher mounts:
  // a page load has no selection, and the one the reader made a moment ago is
  // the whole reason to reach for capture.
  const state = { tab: 'page', links: [], text: '', picked: new Set(), withText: false, sel: '' };

  // One markdown document, assembled from whatever is currently ticked. It is
  // markdown because the destination is a repo, where a capture that renders is
  // worth more than one that parses.
  const compose = () => {
    const out = [`# ${page.title}`, '', page.href];
    if (page.description) out.push('', page.description);
    if (state.sel) out.push('', '> ' + state.sel.replace(/\n+/g, '\n> '));
    if (state.withText && state.text) out.push('', '---', '', state.text);
    if (state.picked.size) {
      out.push('', '## Links', '');
      for (const { href, text } of state.links) {
        if (state.picked.has(href)) out.push(`- [${text}](${href})`);
      }
    }
    return out.join('\n');
  };

  // ---- The surface -------------------------------------------------------

  const P = 'var(--wt-p)';
  const mix = (c, pct) => `color-mix(in oklch, ${c} ${pct}%, transparent)`;
  const host = document.createElement('div');
  host.id = ID;
  const root = host.attachShadow({ mode: 'open' });

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    :host {
      all: initial;
      --wt-p: oklch(56.86% .255 257.57);
      --wt-b100: oklch(100% 0 0);
      --wt-b200: oklch(97.466% .011 259.822);
      --wt-b300: oklch(93.268% .016 262.751);
      --wt-bc: oklch(41.886% .053 255.824);
    }
    button, a { font: inherit; color: inherit; }
    .wrap { position: fixed; z-index: 2147483647;
            font: 400 14px/1.4 ui-sans-serif, -apple-system, system-ui, sans-serif;
            color: var(--wt-bc); }
    .btn { width: 3.5rem; height: 3.5rem; border-radius: 1rem;
           border: 1px solid ${mix(P, 20)}; background: ${mix(P, 10)};
           display: flex; align-items: center; justify-content: center;
           cursor: grab; touch-action: none;
           -webkit-user-select: none; user-select: none; transition: all .3s; }
    .btn:active { cursor: grabbing; }
    .btn.on { background: ${mix(P, 30)}; border-color: ${mix(P, 50)}; }
    .btn svg { width: 1.5rem; height: 1.5rem; color: ${mix(P, 40)}; transition: color .3s; }
    .btn.on svg { color: var(--wt-p); }

    .menu { position: absolute; bottom: 100%; right: 0; margin-bottom: .5rem;
            width: 14rem; border-radius: 1rem; border: 1px solid var(--wt-b300);
            background: var(--wt-b100); overflow: hidden;
            box-shadow: 0 25px 50px -12px #00000040; }
    .row { display: flex; align-items: center; gap: .625rem;
           padding: .5rem .75rem; width: 100%; background: none; border: 0;
           text-decoration: none; text-align: left; cursor: pointer; }
    .row:hover, .row:active { background: var(--wt-b200); }
    .row svg { width: 17px; height: 17px; color: var(--wt-p); flex: none; }
    .row span { font-size: .875rem; font-weight: 600; }

    /* The drawer, in the fab's shape: an absolute panel inside a fixed
       overflow-hidden layer, so the off-screen half is clipped rather than
       widening the host page's layout. */
    .layer { position: fixed; inset: 0; z-index: 2147483646;
             overflow: hidden; pointer-events: none;
             font: 400 14px/1.4 ui-sans-serif, -apple-system, system-ui, sans-serif;
             color: var(--wt-bc); }
    .panel { position: absolute; inset-block: 0; right: 0;
             width: 22rem; max-width: 92vw;
             transform: translateX(100%); transition: transform .3s ease-out;
             display: flex; flex-direction: column;
             background: var(--wt-b100); border-left: 1px solid var(--wt-b300);
             box-shadow: 0 25px 50px -12px #00000040;
             pointer-events: auto; overscroll-behavior: contain; }
    .panel.open { transform: translateX(0); }
    .head { padding: .625rem .875rem; border-bottom: 1px solid var(--wt-b300); }
    .head b { display: block; font-size: .875rem; font-weight: 600;
              overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .head small { font: 11px ui-monospace, monospace; color: ${mix('var(--wt-bc)', 60)}; }
    .tabs { display: flex; border-bottom: 1px solid var(--wt-b300); flex: none; }
    .tab { flex: 1; padding: .5rem; background: none; border: 0;
           border-bottom: 2px solid transparent; cursor: pointer;
           font-size: .8125rem; font-weight: 600; color: ${mix('var(--wt-bc)', 55)}; }
    .tab.on { color: var(--wt-p); border-bottom-color: var(--wt-p); }
    /* overscroll-contain here as well as on the panel: a scroll that reaches
       its end must not hand the rest to the document, which inside a
       sheet-presented in-app browser is the gesture that dismisses the sheet. */
    .pane { flex: 1; overflow-y: auto; overscroll-behavior: contain;
            padding: .75rem .875rem; }
    .pane[hidden] { display: none; }
    .pane p { margin: 0 0 .625rem; overflow-wrap: break-word; }
    .k { display: block; font: 11px ui-monospace, monospace;
         color: ${mix('var(--wt-bc)', 55)}; margin-bottom: .125rem; }
    .quote { border-left: 2px solid ${mix(P, 40)}; padding-left: .625rem;
             color: ${mix('var(--wt-bc)', 80)}; }
    .none { color: ${mix('var(--wt-bc)', 50)}; font-style: italic; }
    .bar { display: flex; align-items: center; gap: .5rem; padding: 0 .875rem .5rem; }
    .bar button { background: none; border: 0; cursor: pointer; padding: .25rem 0;
                  font-size: .75rem; font-weight: 600; color: var(--wt-p); }
    .bar .count { margin-left: auto; font: 11px ui-monospace, monospace;
                  color: ${mix('var(--wt-bc)', 55)}; }
    .link { display: flex; gap: .5rem; align-items: flex-start; width: 100%;
            padding: .375rem .25rem; background: none; border: 0;
            text-align: left; cursor: pointer; border-radius: .375rem; }
    .link:hover { background: var(--wt-b200); }
    .link .box { flex: none; width: 1rem; height: 1rem; margin-top: .125rem;
                 border: 1px solid ${mix('var(--wt-bc)', 35)}; border-radius: .25rem; }
    .link.on .box { background: var(--wt-p); border-color: var(--wt-p); }
    .link .box svg { width: 100%; height: 100%; color: var(--wt-b100); display: none; }
    .link.on .box svg { display: block; }
    .link i { font-style: normal; display: block; font-size: .8125rem; }
    .link u { display: block; font: 10px ui-monospace, monospace; text-decoration: none;
              color: ${mix('var(--wt-bc)', 50)};
              overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .text { font: 12px/1.5 ui-monospace, monospace; white-space: pre-wrap;
            overflow-wrap: break-word; color: ${mix('var(--wt-bc)', 85)}; }
    .foot { border-top: 1px solid var(--wt-b300);
            padding: .625rem 5.25rem .625rem .875rem;
            display: flex; gap: .5rem; align-items: center; flex: none; }
    .act { padding: .4375rem .875rem; border-radius: .5rem; cursor: pointer;
           border: 1px solid ${mix(P, 30)}; background: ${mix(P, 10)};
           color: var(--wt-p); font-size: .8125rem; font-weight: 600;
           text-decoration: none; display: inline-block; }
    .act.off { opacity: .4; pointer-events: none; }
    .size { margin-left: auto; font: 11px ui-monospace, monospace;
            color: ${mix('var(--wt-bc)', 55)}; text-align: right; }
  `);
  root.adoptedStyleSheets = [sheet];

  const svg = d => `<svg viewBox="0 0 256 256" fill="currentColor"><path d="${d}"/></svg>`;
  const ICON = {
    sidebar: 'M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,56H80V200H40ZM216,200H96V56H216V200Z',
    note: 'M229.66,58.34l-32-32a8,8,0,0,0-11.32,0l-96,96A8,8,0,0,0,88,128v32a8,8,0,0,0,8,8h32a8,8,0,0,0,5.66-2.34l96-96A8,8,0,0,0,229.66,58.34ZM124.69,152H104V131.31l64-64L188.69,88ZM200,76.69,179.31,56,192,43.31,212.69,64ZM224,128v80a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32h80a8,8,0,0,1,0,16H48V208H208V128a8,8,0,0,1,16,0Z',
    out: 'M224,104a8,8,0,0,1-16,0V59.32l-66.33,66.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z',
    hide: 'M53.92,34.62A8,8,0,1,0,42.08,45.38L61.32,66.55C25,88.84,9.38,123.2,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208a127.11,127.11,0,0,0,52.07-10.83l22,24.21a8,8,0,1,0,11.84-10.76Zm47.33,75.84,41.67,45.85a32,32,0,0,1-41.67-45.85ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.16,133.16,0,0,1,25,128c4.69-8.79,19.66-33.39,47.35-49.38l18,19.75a48,48,0,0,0,63.66,70l14.73,16.2A112,112,0,0,1,128,192Zm6-95.43a8,8,0,0,1,3-15.72,48.16,48.16,0,0,1,38.77,42.64,8,8,0,0,1-7.22,8.71,6.39,6.39,0,0,1-.75,0,8,8,0,0,1-8-7.26A32.09,32.09,0,0,0,134,96.57Zm113.28,34.69c-.42.94-10.55,23.37-33.36,43.8a8,8,0,1,1-10.67-11.92A132.77,132.77,0,0,0,231.05,128a133.15,133.15,0,0,0-23.12-30.77C185.67,75.19,158.78,64,128,64a118.37,118.37,0,0,0-19.36,1.57A8,8,0,1,1,106,49.79,134,134,0,0,1,128,48c34.88,0,66.57,13.26,91.66,38.35,18.83,18.83,27.3,37.62,27.65,38.41A8,8,0,0,1,247.31,131.26Z',
    check: 'M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z',
  };

  const layer = document.createElement('div');
  layer.className = 'layer';
  layer.innerHTML = `
    <div class="panel">
      <div class="head"><b></b><small></small></div>
      <div class="tabs">
        <button class="tab on" data-tab="page">Page</button>
        <button class="tab" data-tab="links">Links</button>
        <button class="tab" data-tab="text">Text</button>
      </div>
      <div class="pane" data-pane="page"></div>
      <div class="pane" data-pane="links" hidden>
        <div class="bar">
          <button data-all>All</button><button data-none>None</button>
          <span class="count"></span>
        </div>
        <div data-list></div>
      </div>
      <div class="pane" data-pane="text" hidden>
        <div class="bar"><button data-toggle-text></button><span class="count"></span></div>
        <div class="text"></div>
      </div>
      <div class="foot">
        <button class="act" data-copy>Copy</button>
        <a class="act" data-send>Send</a>
        <span class="size"></span>
      </div>
    </div>`;

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  wrap.innerHTML = `
    <div class="menu" hidden>
      <a class="row" data-capture>${svg(ICON.note)}<span>Capture selection</span></a>
      <a class="row" href="${app}">${svg(ICON.out)}<span>Web Tools</span></a>
      <button class="row" data-hide>${svg(ICON.hide)}<span>Hide until reload</span></button>
    </div>
    <div class="btn" tabindex="0" role="button" aria-label="Web Tools launcher">${svg(ICON.sidebar)}</div>`;

  root.append(layer, wrap);

  // ---- Behaviour ---------------------------------------------------------

  const q = s => root.querySelector(s);
  const btn = q('.btn'), menu = q('.menu'), panel = q('.panel');
  const list = q('[data-list]'), sendEl = q('[data-send]'), copyEl = q('[data-copy]');

  const esc = s => String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const shortcutUrl = md =>
    'shortcuts://run-shortcut?name=Log-Repo&input=text&text=' +
    encodeURIComponent(JSON.stringify({
      op: 'capture', name: 'launcher', build: ref,
      title: page.title, href: page.href, md,
    }));

  // The readout is the whole of the size story: what this capture weighs, and
  // whether Send can carry it. Saying "too big for Send, use Copy" is the point
  // of measuring at all, since the alternative is a URL that arrives truncated
  // and reads as complete.
  const refresh = () => {
    const md = compose();
    const url = shortcutUrl(md);
    const ok = url.length <= SEND_MAX;
    sendEl.href = ok ? url : '';
    sendEl.classList.toggle('off', !ok);
    q('.size').textContent = ok ? `${md.length} chars` : `${md.length} chars · Copy only`;
    q('[data-pane="links"] .count').textContent = `${state.picked.size}/${state.links.length}`;
    const t = q('[data-toggle-text]');
    t.textContent = state.withText ? 'Included' : 'Include';
    q('[data-pane="text"] .count').textContent = `${state.text.length} chars`;
  };

  const renderLinks = () => {
    list.innerHTML = state.links.map(({ href, text }, i) => `
      <button class="link${state.picked.has(href) ? ' on' : ''}" data-i="${i}">
        <span class="box">${svg(ICON.check)}</span>
        <span><i>${esc(text)}</i><u>${esc(href.replace(/^https?:\/\//, ''))}</u></span>
      </button>`).join('') ||
      '<p class="none">No links on this page.</p>';
  };

  const renderPage = () => {
    q('[data-pane="page"]').innerHTML = `
      <p><span class="k">TITLE</span>${esc(page.title)}</p>
      <p><span class="k">ADDRESS</span>${esc(page.href)}</p>
      ${page.description ? `<p><span class="k">DESCRIPTION</span>${esc(page.description)}</p>` : ''}
      <p><span class="k">SELECTION</span>${state.sel
        ? `<span class="quote">${esc(state.sel.slice(0, 600))}</span>`
        : '<span class="none">Nothing selected. Select text on the page, then reopen.</span>'}</p>`;
  };

  // Built on the first open rather than at mount, for the reason the fab builds
  // its own body late: the launcher is on every page, the drawer on few.
  let read = false;
  const openDrawer = () => {
    state.sel = clean(String(getSelection() || ''));
    if (!read) {
      state.links = readLinks();
      state.text = readText();
      renderLinks();
      read = true;
    }
    renderPage();
    refresh();
    panel.classList.add('open');
    btn.classList.add('on');
  };
  const closeDrawer = () => { panel.classList.remove('open'); btn.classList.remove('on'); };

  const setMenu = on => {
    if (on) {
      q('[data-capture]').href = shortcutUrl(
        `# ${page.title}\n\n${page.href}` +
        (clean(String(getSelection() || '')) ? '\n\n> ' + clean(String(getSelection())) : ''));
    }
    menu.hidden = !on;
  };

  list.addEventListener('click', e => {
    const el = e.target.closest('.link');
    if (!el) return;
    const { href } = state.links[+el.dataset.i];
    state.picked.has(href) ? state.picked.delete(href) : state.picked.add(href);
    el.classList.toggle('on', state.picked.has(href));
    refresh();
  });
  q('[data-all]').onclick = () => { state.links.forEach(l => state.picked.add(l.href)); renderLinks(); refresh(); };
  q('[data-none]').onclick = () => { state.picked.clear(); renderLinks(); refresh(); };
  q('[data-toggle-text]').onclick = () => { state.withText = !state.withText; refresh(); };
  q('[data-pane="text"] .text').textContent = '';

  root.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    state.tab = t.dataset.tab;
    root.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
    root.querySelectorAll('.pane').forEach(p => p.hidden = p.dataset.pane !== state.tab);
    // The extract is dropped in only when its pane is first looked at: it can
    // run to a hundred thousand characters, and laying that out behind a tab
    // nobody opened is work for nothing.
    if (state.tab === 'text') {
      const el = q('[data-pane="text"] .text');
      if (!el.textContent) el.textContent = state.text || 'No readable text found.';
    }
  });

  // The clipboard is the route with no ceiling, and it needs the user gesture
  // it is already inside. A refusal is reported on the button rather than
  // thrown away, since a Copy that silently did nothing is the worst outcome.
  copyEl.onclick = async () => {
    try {
      await navigator.clipboard.writeText(compose());
      copyEl.textContent = 'Copied';
    } catch { copyEl.textContent = 'Blocked'; }
    setTimeout(() => { copyEl.textContent = 'Copy'; }, 1600);
  };
  sendEl.addEventListener('click', () => setTimeout(closeDrawer, 300));

  q('[data-hide]').onclick = () => { host.remove(); };
  menu.addEventListener('click', e => { if (e.target.closest('.row')) setMenu(false); });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!menu.hidden) setMenu(false); else closeDrawer();
  });

  // ---- The launcher's three gestures, in the fab's order ------------------
  //
  // Tap opens the drawer, a held finger opens the short menu, a drag moves it.
  // Past 6px the pointer sequence is a drag and the tap is spent; a fired long
  // press spends it too, so the pointerup behind the menu cannot toggle the
  // drawer as well. Position is per-origin and survives reloads: a launcher
  // that lands on the reader's content and cannot be moved off it is worse
  // than none.
  const POS = 'wt-launcher-pos';
  let pos = { right: 24, bottom: 24 };
  try { Object.assign(pos, JSON.parse(localStorage.getItem(POS) || '{}')); } catch {}
  const place = () => { wrap.style.right = pos.right + 'px'; wrap.style.bottom = pos.bottom + 'px'; };
  place();

  let drag = null, held = 0;
  btn.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom, moved: false, spent: false };
    btn.setPointerCapture(e.pointerId);
    held = setTimeout(() => {
      if (!drag || drag.moved) return;
      drag.spent = true;
      closeDrawer();
      setMenu(true);
    }, 500);
  });
  btn.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = drag.x - e.clientX, dy = drag.y - e.clientY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    clearTimeout(held);
    pos.right = Math.max(4, Math.min(innerWidth - 60, drag.right + dx));
    pos.bottom = Math.max(4, Math.min(innerHeight - 60, drag.bottom + dy));
    place();
  });
  btn.addEventListener('pointerup', () => {
    if (!drag) return;
    clearTimeout(held);
    if (drag.moved) { try { localStorage.setItem(POS, JSON.stringify(pos)); } catch {} }
    else if (!drag.spent) {
      if (!menu.hidden) setMenu(false);
      else panel.classList.contains('open') ? closeDrawer() : openDrawer();
    }
    drag = null;
  });
  // A right-click raises the SAME menu and does only that, spending the gesture
  // the way a fired long press does.
  btn.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (drag) drag.spent = true;
    closeDrawer();
    setMenu(true);
  });

  q('.head b').textContent = page.title;
  q('.head small').textContent = location.hostname;
  document.documentElement.append(host);

  // The second half of the yield rule. A web-tools page boots its loader and
  // mounts the real fab after document-end, so the synchronous check above can
  // miss it; watching until it appears is what keeps the two from standing side
  // by side. Ten seconds is a boot that has plainly not happened.
  const watch = new MutationObserver(() => {
    if (!realFab()) return;
    host.remove();
    watch.disconnect();
  });
  watch.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => watch.disconnect(), 10000);
};
