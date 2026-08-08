// swipe-deck.js — the house swipe format: a snap-scrolling track of slides,
// and the fullscreen takeover that frames it.
//
// This was chat-render.js's private deck, generalized. A transcript is not the
// only thing worth paging through one card at a time, and a second consumer
// copying the chrome would mean two formats drifting apart, each improved on
// its own. So the mechanism lives here, chat-render delegates to it, and any
// page that wants the same feel calls the same code.
//
// Framework-free and self-contained: no gh, no Alpine, no marked. A page can
// gh.load('kits/swipe-deck.js') or drop a plain <script src> from jsDelivr, in
// web-tools or in another repo. It expects Tailwind + daisyUI + Phosphor on the
// host page for styling, which every consumer already loads.
//
//   swipeDeck.core(count, render, o?)  -> { track, go, active, count, onSlide }
//   swipeDeck.open({ count, render, … }) -> { el, close }
//
// `render(i, slide)` fills slide i. It is called lazily, for the active slide
// and its neighbours only, so a hundred-slide deck costs three slides of work
// on open. Call it as often as you like; the deck tracks what is built.
//
// open() options:
//   count, render          the deck itself (required)
//   title, subtitle        header text
//   icon                   Phosphor class for the header mark (default ph-cards)
//   link  { href, title }  an optional open-elsewhere button in the header
//   onSlide(i)             notified on every slide change
//   slideClass             extra classes on each slide section
//
// Opening locks background scroll and pushes a history entry, so the phone back
// button, Escape, the arrow keys and ✕ all dismiss it. That history entry is
// the reason this is a takeover and not a modal: on a phone, "back" is what a
// reader reaches for, and a modal that ignores it leaves the page instead.
(() => {
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === '' && k !== 'class') continue;
      if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k) el.append(k);
    return el;
  };

  let styled = false;
  const ensureStyle = () => {
    if (styled) return; styled = true;
    const s = document.createElement('style');
    s.textContent = '.sd-track::-webkit-scrollbar{display:none}';
    document.head.append(s);
  };

  // The core: a horizontal snap track, one slide per item, each slide scrolling
  // inside itself when its content is long. Returns the track plus an
  // imperative handle, so different chrome (an inline nav, the takeover's
  // footer pager) can drive one track.
  function core(count, render, o = {}) {
    ensureStyle();
    // `min-w-0` is the one that actually holds the deck to the viewport. The
    // track is a GRID item inside open()'s panel (and often a flex item
    // inline), and both default to `min-width: auto`, which is a floor at the
    // content's max-content size, not at zero. So a wide <pre> in any slide
    // pushed the track past its cell: measured at 867px inside a 430px panel,
    // with every slide inheriting that width through `w-full` and the page
    // reading as a card cut off on the right. Constraining the track is what
    // makes `w-full` on a slide resolve to the visible width rather than to
    // the content's.
    const track = h('div', {
      class: 'sd-track flex h-full w-full min-w-0 min-h-0 snap-x snap-mandatory overflow-x-auto scroll-smooth overscroll-x-contain',
      style: 'scrollbar-width:none',
    });
    const slides = [];
    const built = new Array(count).fill(false);
    // A slide is exactly one track width, always. `w-full shrink-0` rather
    // than `min-w-full`, and `min-w-0` on the inner, because both halves of
    // that are load-bearing in a flex track:
    //
    // A flex item defaults to `min-width: auto`, so `min-w-full` sets a floor
    // and no ceiling: one wide child (a <pre> of command output, a long table)
    // makes that slide wider than the track. It looks like a styling slip and
    // is not one. `go()` and `active()` compute in units of
    // `track.clientWidth`, so the moment any slide is wider than that, every
    // index past it is wrong: the pager scrolls to an offset that lands
    // mid-card, and the counter reports a slide the reader is not looking at.
    //
    // `min-w-0` on the inner is what lets a wide child scroll inside its own
    // `overflow-auto` box instead of pushing the slide open. The width classes
    // are applied unconditionally and `innerClass` adds to them, since being
    // one track wide is a property of being a slide and not something a caller
    // should have to remember. Both consumers had already forgotten it.
    for (let i = 0; i < count; i++) {
      const inner = h('div', {
        class: 'w-full min-w-0 ' + (o.innerClass || 'mx-auto max-w-2xl'),
      });
      slides.push(inner);
      track.append(h('section', {
        class: 'h-full w-full shrink-0 snap-center overflow-y-auto px-4 py-5 sm:px-8 sm:py-8 '
          + (o.slideClass || ''),
      }, inner));
    }
    const build = i => {
      if (i < 0 || i >= count || built[i]) return;
      built[i] = true;
      render(i, slides[i]);
    };
    const width = () => track.clientWidth || 1;
    const active = () => Math.round(track.scrollLeft / width());
    const go = i => track.scrollTo({ left: Math.max(0, Math.min(count - 1, i)) * width(), behavior: 'smooth' });
    const listeners = [];
    let raf = 0;
    track.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const a = active();
        build(a - 1); build(a); build(a + 1);
        listeners.forEach(cb => cb(a));
      });
    });
    requestAnimationFrame(() => { build(0); build(1); });
    return { track, go, active, count, onSlide: cb => listeners.push(cb), build };
  }

  // The fullscreen takeover: a framed panel over the page, header / track /
  // footer pager. Dots while they stay countable, a progress bar past that.
  function open(o = {}) {
    const total = o.count || 0;
    const deck = core(total, o.render, o);

    const overlay = h('div', { class: 'fixed inset-0 z-[70] overflow-hidden bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--color-primary)_7%,transparent),transparent_30rem),var(--color-base-200)]' });
    // `grid-cols-[minmax(0,1fr)]` is the one that finally holds the width, and
    // it is the third link in a chain where fixing only the first two changed
    // nothing measurable. A grid's implicit column is `auto`, which sizes to
    // its content's max-content width, and `min-w-0` on the ITEM cannot shrink
    // a column that is already that wide. So the track sat at 867px inside a
    // 430px panel until the column itself was capped. `minmax(0,1fr)` is the
    // canonical spelling of "one column, never wider than the grid".
    //
    // The three together are the whole fix: the column may not exceed the
    // panel, the track may not exceed the column, and a slide is exactly one
    // track wide. Any one alone leaves the deck cut off on a phone.
    const panel = h('div', { class: 'mx-auto grid h-full w-full max-w-4xl grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto] bg-base-100 shadow-xl sm:h-[calc(100dvh-2rem)] sm:my-4 sm:rounded-3xl sm:border sm:border-base-300 sm:overflow-hidden' });

    const closeBtn = h('button', { class: 'btn btn-ghost btn-sm btn-circle shrink-0', 'aria-label': 'Close' },
      h('i', { class: 'ph ph-x text-lg' }));
    const curEl = h('span', {}, '1');
    const pill = h('div', { class: 'shrink-0 rounded-full border border-base-300 bg-base-200 px-3 py-1 font-mono text-xs tabular-nums text-base-content/65' },
      curEl, h('span', { class: 'mx-0.5 opacity-40' }, '/'), h('span', {}, String(total)));
    const linkBtn = o.link && o.link.href ? h('a', {
      class: 'btn btn-ghost btn-sm btn-circle shrink-0', href: o.link.href,
      target: '_blank', rel: 'noopener',
      title: o.link.title || 'Open', 'aria-label': o.link.title || 'Open',
    }, h('i', { class: `ph ${o.link.icon || 'ph-arrow-square-out'} text-base` })) : '';
    const subEl = h('p', { class: 'truncate text-xs text-base-content/50' }, o.subtitle || '');
    const header = h('div', { class: 'flex items-center gap-3 border-b border-base-300 bg-base-100/90 px-4 py-3 backdrop-blur sm:px-6' },
      closeBtn,
      h('div', { class: 'grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary' },
        h('i', { class: `ph ${o.icon || 'ph-cards'} text-xl` })),
      h('div', { class: 'min-w-0 flex-1' },
        h('h1', { class: 'truncate text-sm font-semibold sm:text-base' }, o.title || ''),
        subEl),
      linkBtn, pill);

    const circle = (icon, onClick) => {
      const b = h('button', { class: 'btn btn-circle btn-sm border-base-300 bg-base-100 shadow-none', 'aria-label': icon },
        h('i', { class: `ph ${icon} text-base` }));
      b.addEventListener('click', onClick);
      return b;
    };
    const prevB = circle('ph-arrow-left', () => deck.go(deck.active() - 1));
    const nextB = circle('ph-arrow-right', () => deck.go(deck.active() + 1));
    const center = h('div', { class: 'flex items-center justify-center gap-2' });
    const useDots = total <= 25;
    const dots = [];
    let barFill = null;
    if (useDots) {
      for (let i = 0; i < total; i++) {
        const d = h('button', { class: 'h-1.5 rounded-full transition-all duration-200', 'aria-label': `Go to ${i + 1}` });
        d.addEventListener('click', () => deck.go(i));
        dots.push(d); center.append(d);
      }
    } else {
      barFill = h('div', { class: 'h-1.5 rounded-full bg-primary transition-all duration-200', style: 'width:0%' });
      center.append(h('div', { class: 'h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-base-content/15' }, barFill));
    }
    const footer = h('div', { class: 'grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-4 border-t border-base-300 bg-base-100 px-4 py-3 sm:px-6' },
      prevB, center, nextB);

    panel.append(header, deck.track, footer);
    overlay.append(panel);

    const sync = cur => {
      curEl.textContent = cur + 1;
      prevB.classList.toggle('invisible', cur <= 0);
      nextB.classList.toggle('invisible', cur >= total - 1);
      if (useDots) dots.forEach((d, i) => d.className = 'h-1.5 rounded-full transition-all duration-200 '
        + (i === cur ? 'w-7 bg-primary' : 'w-1.5 bg-base-content/20 hover:bg-base-content/35'));
      else barFill.style.width = ((cur + 1) / total * 100) + '%';
      if (o.onSlide) o.onSlide(cur);
    };
    deck.onSlide(sync);
    sync(0);

    const prevOverflow = document.documentElement.style.overflow;
    let closed = false;
    const cleanup = () => {
      if (closed) return; closed = true;
      removeEventListener('keydown', onKey);
      removeEventListener('popstate', onPop);
      document.documentElement.style.overflow = prevOverflow;
      overlay.remove();
      if (o.onClose) o.onClose();
    };
    const dismiss = () => { if (!closed) history.back(); };   // back → popstate → cleanup
    const onPop = () => cleanup();
    const onKey = e => {
      if (e.key === 'Escape') dismiss();
      else if (e.key === 'ArrowRight') deck.go(deck.active() + 1);
      else if (e.key === 'ArrowLeft') deck.go(deck.active() - 1);
    };
    closeBtn.addEventListener('click', dismiss);
    addEventListener('popstate', onPop);
    addEventListener('keydown', onKey);
    history.pushState({ __sdDeck: 1 }, '', location.href);
    document.documentElement.style.overflow = 'hidden';
    document.body.append(overlay);
    // start: jump AFTER first layout, and instantly. At append time the track
    // has no width yet, so an immediate go() computes slide 0; and the track's
    // scroll-smooth would otherwise animate across every slide in between.
    if (o.start) requestAnimationFrame(() => {
      const t = deck.track;
      t.scrollTo({ left: Math.max(0, Math.min(total - 1, o.start)) * (t.clientWidth || 1), behavior: 'instant' });
    });
    return { el: overlay, close: dismiss, deck, setSubtitle: t => { subEl.textContent = t; } };
  }

  window.swipeDeck = { core, open, h };
})();
