// The Web Tools launcher, carried onto pages that have none of their own.
//
// WHAT IT IS. The same launcher alpineComponents/fab.js mounts: the size-14
// rounded-2xl primary-tinted square with the sidebar mark, the same drag, and
// the long-press menu. What it is NOT is the fab's DRAWER, and that is a limit
// of the destination rather than of effort. Two of the four tabs cannot mean
// anything off our origin: Render reads the GitHub API through a token held in
// localStorage on the web-tools origin, which a foreign origin does not have
// and must not be given, and Inspect lists the modules gh.load() fetched, of
// which a foreign page has none. Traffic and the annotator could travel later;
// they have not yet.
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
    .wrap { position: fixed; z-index: 2147483647;
            font: 400 14px/1.4 ui-sans-serif, -apple-system, system-ui, sans-serif;
            color: var(--wt-bc); }
    .btn { width: 3.5rem; height: 3.5rem; border-radius: 1rem;
           border: 1px solid ${mix(P, 20)}; background: ${mix(P, 10)};
           display: flex; align-items: center; justify-content: center;
           cursor: grab; touch-action: none;
           -webkit-user-select: none; user-select: none;
           transition: all .3s; }
    .btn:active { cursor: grabbing; }
    .btn.open { background: ${mix(P, 30)}; border-color: ${mix(P, 50)}; }
    .btn svg { width: 1.5rem; height: 1.5rem; color: ${mix(P, 40)}; transition: color .3s; }
    .btn.open svg { color: var(--wt-p); }
    .menu { position: absolute; bottom: 100%; right: 0; margin-bottom: .5rem;
            width: 14rem; border-radius: 1rem; border: 1px solid var(--wt-b300);
            background: var(--wt-b100); overflow: hidden;
            box-shadow: 0 25px 50px -12px #00000040; }
    .menu[hidden] { display: none; }
    .row { display: flex; align-items: center; gap: .625rem;
           padding: .5rem .75rem; width: 100%; background: none; border: 0;
           font: inherit; color: inherit; text-decoration: none;
           text-align: left; cursor: pointer; }
    .row:hover, .row:active { background: var(--wt-b200); }
    .row svg { width: 17px; height: 17px; color: var(--wt-p); flex: none; }
    .row span { font-size: .875rem; font-weight: 600; }
    .foot { padding: .375rem .75rem; border-top: 1px solid var(--wt-b300);
            font: 11px ui-monospace, monospace; color: ${mix('var(--wt-bc)', 50)}; }
  `);
  root.adoptedStyleSheets = [sheet];

  const svg = d => `<svg viewBox="0 0 256 256" fill="currentColor"><path d="${d}"/></svg>`;
  const ICON = {
    sidebar: 'M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,56H80V200H40ZM216,200H96V56H216V200Z',
    note: 'M229.66,58.34l-32-32a8,8,0,0,0-11.32,0l-96,96A8,8,0,0,0,88,128v32a8,8,0,0,0,8,8h32a8,8,0,0,0,5.66-2.34l96-96A8,8,0,0,0,229.66,58.34ZM124.69,152H104V131.31l64-64L188.69,88ZM200,76.69,179.31,56,192,43.31,212.69,64ZM224,128v80a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32h80a8,8,0,0,1,0,16H48V208H208V128a8,8,0,0,1,16,0Z',
    out: 'M224,104a8,8,0,0,1-16,0V59.32l-66.33,66.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z',
    hide: 'M53.92,34.62A8,8,0,1,0,42.08,45.38L61.32,66.55C25,88.84,9.38,123.2,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208a127.11,127.11,0,0,0,52.07-10.83l22,24.21a8,8,0,1,0,11.84-10.76Zm47.33,75.84,41.67,45.85a32,32,0,0,1-41.67-45.85ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.16,133.16,0,0,1,25,128c4.69-8.79,19.66-33.39,47.35-49.38l18,19.75a48,48,0,0,0,63.66,70l14.73,16.2A112,112,0,0,1,128,192Zm6-95.43a8,8,0,0,1,3-15.72,48.16,48.16,0,0,1,38.77,42.64,8,8,0,0,1-7.22,8.71,6.39,6.39,0,0,1-.75,0,8,8,0,0,1-8-7.26A32.09,32.09,0,0,0,134,96.57Zm113.28,34.69c-.42.94-10.55,23.37-33.36,43.8a8,8,0,1,1-10.67-11.92A132.77,132.77,0,0,0,231.05,128a133.15,133.15,0,0,0-23.12-30.77C185.67,75.19,158.78,64,128,64a118.37,118.37,0,0,0-19.36,1.57A8,8,0,1,1,106,49.79,134,134,0,0,1,128,48c34.88,0,66.57,13.26,91.66,38.35,18.83,18.83,27.3,37.62,27.65,38.41A8,8,0,0,1,247.31,131.26Z',
  };

  // A shortcut link has to be a real anchor the finger lands on. Assigning
  // location.href to a custom scheme is a navigation with no user gesture and
  // Safari drops it; the tap on an <a> carries the permission, which is the one
  // thing measured on 2026-09-05 that the whole return channel rests on.
  const capture = () => 'shortcuts://run-shortcut?name=Log-Repo&input=text&text=' +
    encodeURIComponent(JSON.stringify({
      op: 'capture', name: 'launcher', build: ref,
      title: document.title, href: location.href,
      text: String(getSelection() || '').slice(0, 2000) || undefined,
    }));

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  wrap.innerHTML = `
    <div class="menu" hidden>
      <a class="row" data-capture>${svg(ICON.note)}<span>Capture to repo</span></a>
      <a class="row" href="${app}">${svg(ICON.out)}<span>Web Tools</span></a>
      <button class="row" data-hide>${svg(ICON.hide)}<span>Hide until reload</span></button>
      <div class="foot">${ref.slice(0, 7)}</div>
    </div>
    <div class="btn" tabindex="0" role="button" aria-label="Web Tools launcher">${svg(ICON.sidebar)}</div>`;
  root.append(wrap);

  const btn = root.querySelector('.btn');
  const menu = root.querySelector('.menu');
  const cap = root.querySelector('[data-capture]');

  // The selection is read when the menu OPENS, not when the launcher mounts: a
  // page load has no selection, and the one the reader made a moment ago is the
  // whole reason to reach for capture.
  const setOpen = on => {
    if (on) cap.href = capture();
    menu.hidden = !on;
    btn.classList.toggle('open', on);
  };

  root.querySelector('[data-hide]').onclick = () => host.remove();
  menu.addEventListener('click', e => { if (e.target.closest('.row')) setOpen(false); });

  // Drag and tap share one pointer sequence: past 6px it is a drag and the tap
  // is spent, which is how the fab tells the two apart. Position is per-origin
  // and survives reloads; a launcher that lands on the reader's content and
  // cannot be moved off it is worse than none.
  const POS = 'wt-launcher-pos';
  let pos = { right: 24, bottom: 24 };
  try { Object.assign(pos, JSON.parse(localStorage.getItem(POS) || '{}')); } catch {}
  const place = () => {
    wrap.style.right = pos.right + 'px';
    wrap.style.bottom = pos.bottom + 'px';
  };
  place();

  let drag = null;
  btn.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom, moved: false };
    btn.setPointerCapture(e.pointerId);
  });
  btn.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = drag.x - e.clientX, dy = drag.y - e.clientY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    pos.right = Math.max(4, Math.min(innerWidth - 60, drag.right + dx));
    pos.bottom = Math.max(4, Math.min(innerHeight - 60, drag.bottom + dy));
    place();
  });
  btn.addEventListener('pointerup', () => {
    if (!drag) return;
    if (drag.moved) { try { localStorage.setItem(POS, JSON.stringify(pos)); } catch {} }
    else setOpen(menu.hidden);
    drag = null;
  });

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
