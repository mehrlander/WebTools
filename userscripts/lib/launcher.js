// The universal launcher: the FAB's gesture and menu on any page, delivered by
// a userscript rather than by a page's own boot chain.
//
// WHY IT IS NOT THE FAB. lib/alpineComponents/fab.js is a web-tools control
// surface: ref bar, guide, inspect, traffic. On a page that is not ours every
// one of those panes is empty, and its stack (Alpine, Tailwind, daisyUI,
// Phosphor, all from a CDN) cannot load at all on a site whose
// Content-Security-Policy restricts script-src, which is most of the ones worth
// standing on. What survives the trip is the launcher's SECOND gesture, the
// long-press menu, so that is what this is: the shell and the menu, no drawer.
//
// WHY IT LOOKS HAND-BUILT. The house style (skills/daisy-alpine) governs pages
// built here; this is markup injected into someone else's document, where a
// utility framework has nothing to compile against and a stylesheet link is the
// first thing a policy blocks. Two consequences, both deliberate:
//   - Everything lives in a SHADOW ROOT, so the host page's stylesheet cannot
//     reach in and ours cannot leak out.
//   - The stylesheet is CONSTRUCTED (new CSSStyleSheet + adoptedStyleSheets)
//     rather than a <style> element, because a constructed sheet is CSSOM and a
//     <style> block is subject to the document's style-src. Same reason every
//     colour below is literal: a design token would have to come from somewhere.
window.wtLauncher = ({ ref, app = 'https://mehrlander.github.io/web-tools/app/' }) => {
  if (document.getElementById('wt-launcher')) return;

  const POS = 'wt-launcher-pos';
  const host = document.createElement('div');
  host.id = 'wt-launcher';
  const root = host.attachShadow({ mode: 'open' });

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    :host { all: initial; }
    .wrap { position: fixed; z-index: 2147483647;
            font: 15px/1.4 -apple-system, system-ui, sans-serif; }
    .btn { width: 44px; height: 44px; border-radius: 14px; border: 1px solid #60a5fa55;
           background: #1e293bee; color: #93c5fd; display: flex; align-items: center;
           justify-content: center; font-size: 20px; cursor: grab;
           touch-action: none; -webkit-user-select: none; user-select: none; }
    .btn.open { background: #1d4ed8; color: #fff; }
    .menu { position: absolute; bottom: 52px; right: 0; min-width: 200px;
            background: #0f172af8; border: 1px solid #ffffff22; border-radius: 12px;
            overflow: hidden; box-shadow: 0 8px 32px #0009; }
    .menu[hidden] { display: none; }
    .row { display: block; padding: 12px 16px; color: #e2e8f0; text-decoration: none;
           border: 0; background: none; width: 100%; text-align: left; font: inherit;
           cursor: pointer; border-bottom: 1px solid #ffffff11; }
    .row:last-child { border-bottom: 0; }
    .row:active { background: #ffffff1a; }
    .foot { padding: 8px 16px; color: #64748b; font-size: 12px;
            font-family: ui-monospace, monospace; }
  `);
  root.adoptedStyleSheets = [sheet];

  // A shortcut link has to be a real anchor the finger lands on. Assigning
  // location.href to a custom scheme is a navigation without a user gesture and
  // Safari drops it; the tap on an <a> is what carries the permission, which is
  // the one thing measured on 2026-09-05 that the whole return channel rests on.
  const shortcut = (name, payload) =>
    `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=` +
    encodeURIComponent(JSON.stringify(payload));

  const capture = () => shortcut('Log-Repo', {
    op: 'capture', name: 'launcher', build: ref,
    title: document.title, href: location.href,
    text: String(getSelection() || '').slice(0, 2000) || undefined,
  });

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  wrap.innerHTML = `
    <div class="menu" hidden>
      <a class="row" data-capture>Capture page to repo</a>
      <a class="row" href="${app}">Web Tools</a>
      <button class="row" data-hide>Hide until reload</button>
      <div class="foot">${ref.slice(0, 7)}</div>
    </div>
    <div class="btn" role="button" aria-label="Web Tools launcher">◧</div>`;
  root.append(wrap);

  const btn = root.querySelector('.btn');
  const menu = root.querySelector('.menu');
  const cap = root.querySelector('[data-capture]');

  // The selection is read when the menu OPENS, not when the launcher mounts: a
  // page load has no selection, and the one the reader made a moment ago is the
  // whole reason to reach for capture.
  const setOpen = on => { if (on) cap.href = capture(); menu.hidden = !on; btn.classList.toggle('open', on); };

  root.querySelector('[data-hide]').onclick = () => host.remove();
  menu.addEventListener('click', e => { if (e.target.closest('.row')) setOpen(false); });

  // Drag and tap share one pointer sequence: past 6px it is a drag and the tap
  // is spent, which is how the fab tells the two apart. Position is per-origin
  // and survives reloads; a launcher that lands on the reader's content and
  // cannot be moved off it is worse than none.
  let pos = { right: 16, bottom: 16 };
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
    pos.right = Math.max(4, Math.min(innerWidth - 48, drag.right + dx));
    pos.bottom = Math.max(4, Math.min(innerHeight - 48, drag.bottom + dy));
    place();
  });
  btn.addEventListener('pointerup', () => {
    if (!drag) return;
    if (drag.moved) { try { localStorage.setItem(POS, JSON.stringify(pos)); } catch {} }
    else setOpen(menu.hidden);
    drag = null;
  });

  document.documentElement.append(host);
};
