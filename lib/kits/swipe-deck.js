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
//   swipeDeck.open({ count, render, … }) -> handle
//   swipeDeck.drill(handle, { count, render, … }) -> handle   (a level down)
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
//   actions [{icon,title,onClick}]  extra header buttons, left of `link`. Each
//                          onClick is handed the core handle, so an action can
//                          ask which slide the reader is on (`deck.active()`).
//                          That argument is the whole reason this is not just
//                          another `link`: a deck's chrome is the only place
//                          that knows the answer, and an action that acts on
//                          "this card" needs it.
//   onSlide(i)             notified on every slide change
//   keep                   how many slides either side of the reader to retain
//                          (default 2). Past that a slide is emptied and will
//                          be rendered again on return. See the note by drop().
//   release(i, slide)      called before a slide is emptied, for a caller with
//                          references of its own to let go of
//   slideClass             extra classes on each slide section
//   back                   render the dismiss button as a back chevron rather
//                          than an ✕. Set by drill(); rarely passed by hand.
//   replace                reuse the dismissed deck's history entry rather than
//                          pushing one. For swapping a deck at the same level.
//
// Opening locks background scroll and pushes a history entry, so the phone back
// button, Escape, the arrow keys and ✕ all dismiss it. That history entry is
// the reason this is a takeover and not a modal: on a phone, "back" is what a
// reader reaches for, and a modal that ignores it leaves the page instead.
//
// ── Drilling ────────────────────────────────────────────────────────────────
//
// `drill(parent, opts)` opens a deck one level down. The child covers the
// parent, the header becomes the child's, and leaving the child returns you to
// the parent at the slide you left it on.
//
// The point is what it is NOT. It is not two decks on screen with two headers
// and two gestures, which would advertise a two-dimensional space that is not
// two-dimensional: files are not aligned across branches, so "next branch"
// has no meaning while you sit on file 7. And it is not a mode you set from a
// level picker, because a mode has to be remembered while a place has a back
// button. One deck is visible, one gesture means one thing, and the nesting
// lives entirely in the return path.
//
// drill() is thin because open() already stacks. It supplies three conventions
// so every drilled deck reads the same:
//
//   - the dismiss button becomes a back chevron, since it returns rather than
//     closes;
//   - the parent's title is prefixed onto the child's subtitle, so the child's
//     header answers "where am I" on both levels. That prefix is the
//     breadcrumb, and it is read-only on purpose: it says where you are, it
//     does not offer to change it.
//   - `onClose` fires when the reader comes back up, which is where a parent
//     re-reads anything the child may have changed.
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
    //
    // `slideScroll: false` hands the vertical axis to the slide's CONTENT
    // instead. A slide normally scrolls as one piece, which is right for a
    // transcript or a file; a slide that is itself an app with a pinned head
    // and a scrolling pane has to own that axis, and a scroller inside a
    // scroller would give the reader two places to drag. The slide then also
    // drops its padding, since a full-bleed child supplies its own.
    const scrolls = o.slideScroll !== false;
    for (let i = 0; i < count; i++) {
      const inner = h('div', {
        class: (scrolls ? 'w-full min-w-0 ' : 'h-full w-full min-w-0 ')
          + (o.innerClass || 'mx-auto max-w-2xl'),
      });
      slides.push(inner);
      track.append(h('section', {
        class: 'h-full w-full shrink-0 snap-center '
          + (scrolls ? 'overflow-y-auto scrollbar-thin px-4 py-5 sm:px-8 sm:py-8 ' : 'overflow-hidden ')
          + (o.slideClass || ''),
      }, inner));
    }
    const build = i => {
      if (i < 0 || i >= count || built[i]) return;
      built[i] = true;
      render(i, slides[i]);
    };
    // …and let go of the ones the reader has left.
    //
    // Building lazily was only half the job. `built[i]` never cleared, so a
    // deck retained every slide ever visited, which is free when a slide is
    // inert DOM and is not free at all when it is a live app: stepping through
    // twelve branches of a fourteen-file changeset left twelve mounted branch
    // views and 168 mounted file cards behind, and the DOM grew from 7,100
    // nodes to 25,160, monotonically, about 1,800 per branch. It got slower
    // the longer you read, which is the worst shape a reader can meet.
    // (Measured 2026-08-13; the network was untouched, so it was never a
    // download.)
    //
    // Emptying the slide is enough for a component framework to tear its tree
    // down, since Alpine destroys on removal; `release(i, slide)` is the hook
    // for a caller holding anything of its own, such as the keyed global a
    // mount travelled through.
    const KEEP = Number.isFinite(o.keep) ? o.keep : 2;
    const drop = i => {
      if (i < 0 || i >= count || !built[i]) return;
      try { if (o.release) o.release(i, slides[i]); } catch {}
      slides[i].replaceChildren();
      built[i] = false;
    };
    const prune = a => { for (let i = 0; i < count; i++) if (Math.abs(i - a) > KEEP) drop(i); };
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
        prune(a);
        listeners.forEach(cb => cb(a));
      });
    });
    requestAnimationFrame(() => { build(0); build(1); });
    return { track, go, active, count, onSlide: cb => listeners.push(cb), build, drop,
             get builtCount(){ return built.filter(Boolean).length; } };
  }

  // Every open deck, oldest first. The last entry is the one the reader is
  // looking at, and the only one that answers a key or a Back. See the
  // stacking note inside open().
  const STACK = [];
  // WHETHER A DECK IS OPEN IS THE KIT'S FACT, and it is a different fact from
  // `data-deck-pane`, which the host owns and which records a standing reader
  // PREFERENCE. Conflating the two is what left the app squeezed: the dock's
  // reflow keyed on the preference alone, so closing the last deck kept a
  // padding-right the width of a deck that was no longer there, on every view,
  // across reloads, because the preference is in localStorage. The preference
  // is right to persist (the next file should open docked too); the reflow has
  // to end with the deck.
  const syncDeckOpen = () => {
    const root = document.documentElement;
    if (STACK.length) root.dataset.deckOpen = '';
    else delete root.dataset.deckOpen;
  };

  // The fullscreen takeover: a framed panel over the page, header / track /
  // footer pager. Dots while they stay countable, a progress bar past that.
  function open(o = {}) {
    const total = o.count || 0;
    const deck = core(total, o.render, o);
    let handle;                       // this deck's own entry in STACK

    // ── THE PANE, AND WHY THE LOCK IS CONDITIONAL ON IT ───────────────────
    // `data-deck-pane` on :root takes three values, and the HOST owns it:
    //
    //   full   the deck takes the window                (a phone, always)
    //   inset  it takes the app's content pane          (lg+, beside a sidebar)
    //   dock   it takes PART of that pane, and the list it was opened from
    //          keeps the rest
    //
    // The first two cover everything the reader could otherwise use, so the
    // deck locks page scroll under them, which is what it has always done.
    // `dock` is the one that must not: the host is deliberately keeping a
    // column of itself on screen, and a locked page there leaves a list you
    // can see, point at, and not move. That was the whole reason a docked
    // state could not just be a third width.
    //
    // THE HOOK IS THE CLAIM, the rule `__deckNavigate` already runs on: a host
    // that can dock says so by installing `window.__deckPane`, and only then
    // does the toggle render. A page with no hook gets exactly the deck it had
    // before this existed.
    //
    // What travels on it is an INTENT, 'dock' or 'pane', never an attribute
    // value. The kit knows the reader asked to sit beside the list; which value
    // expresses that, with this host's sidebar, at this width, is the host's to
    // decide, and it is the half the kit cannot be right about. The kit reads
    // the attribute back to see where it landed, so a host free to refuse (too
    // narrow, no list on this view) reports that by simply not changing it.
    const prevOverflow = document.documentElement.style.overflow;
    const paneOf = () => document.documentElement.dataset.deckPane || 'full';
    const canDock = () => typeof window.__deckPane === 'function';
    const applyLock = () => {
      document.documentElement.style.overflow = paneOf() === 'dock' ? prevOverflow : 'hidden';
    };

    // THE OVERLAY IS DELIBERATELY TRANSPARENT. It carries no background at all:
    // the panel is the takeover, and the ground around it is left showing the
    // page the reader came from. A scrim was considered and refused, since
    // black at 40% is a colour that appears nowhere else in the palette and is
    // what makes a dialog read as pasted over an app rather than part of it.
    //
    // It got here by accident and is kept on purpose. The class used to be a
    // comma-joined "gradient, colour" inside one `bg-[…]`, which Tailwind
    // resolves to `background-color` OR `background-image` by inspecting the
    // value and so resolved to neither: it compiled to nothing, silently, the
    // same drop as `divide-base-200` (daisy-alpine conventions, 7). Every deck
    // had been transparent since the day it was written. Measured 2026-08-18,
    // computed backgroundColor rgba(0,0,0,0) and backgroundImage none; painting
    // the intended base-200 was then tried, looked at, and rejected. Written
    // out rather than left as a dead class so nothing "fixes" it back.
    //
    // Still a hit target with no paint: the element takes the click that
    // dismisses (below), which is what the desktop margin is for.
    // THE FRAME IS THE HOST'S TO NARROW. `--deck-left` defaults to 0, so a page
    // with nothing to say gets the whole viewport, which is what every consumer
    // had before. An app with persistent chrome beside its content sets it to
    // that chrome's width, and the takeover then occupies the CONTENT PANE
    // rather than the window: show-repo does this at lg and up, where its
    // sidebar stops being an off-canvas drawer and starts taking layout space.
    //
    // `--deck-top` is the same idea on the other axis, for chrome ABOVE the
    // content: show-repo's header row. Between them the takeover lands in the
    // app's view pane rather than over the app.
    //
    // Variables rather than options because they are responsive and
    // conditional, and the host already knows both; a number passed at open()
    // would freeze whatever the window happened to be that moment.
    // `sd-overlay` is a HOOK, not a style: the frame is expressed in Tailwind
    // classes that changed the day the takeover moved into the view pane, and
    // anything selecting on those was selecting on a layout decision. One
    // stable name for "this is a deck" instead.
    const overlay = h('div', { class: 'sd-overlay fixed bottom-0 right-0 top-[var(--deck-top,0px)] left-[var(--deck-left,0px)] z-[70] overflow-hidden' });
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
    // IT FILLS THE FRAME, at every width, which is what the phone always did.
    // Above sm it used to be a centred rounded card with a margin: max-w-4xl,
    // my-4, rounded-3xl, a border and a shadow. That reads as a dialog pasted
    // over the app, and over show-repo it floated across the sidebar, so the
    // chrome you were still meant to be able to use was underneath a card you
    // had to dismiss. Filling the frame makes the desktop behave the way the
    // phone already did, and with `--deck-left` set it lands flush in the
    // content pane instead. Retired 2026-08-18.
    //
    // The cost, stated because it is silent: the overlay's margin used to be
    // the click-outside-to-dismiss target, and a filled frame leaves none. The
    // phone has been in that position all along, so ✕, Escape and the Back
    // button were already carrying dismissal there; they carry it everywhere
    // now. A left border, only when the frame is actually inset, keeps the
    // panel from bleeding into the chrome beside it.
    const panel = h('div', { class: 'grid h-full w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto] overflow-hidden bg-base-100 border-base-300 [border-left-width:var(--deck-border,0px)]' });

    // ✕ at the root, ‹ one level down. The glyph is the only promise the
    // header makes about where dismissing lands you, so it has to be true.
    const closeBtn = h('button', {
      class: 'btn btn-ghost btn-sm btn-circle shrink-0',
      'aria-label': o.back ? 'Back' : 'Close',
      title: o.back ? 'Back' : 'Close',
    }, h('i', { class: o.back ? 'ph ph-caret-left text-xl' : 'ph ph-x text-lg' }));
    const curEl = h('span', {}, '1');
    const pill = h('div', { class: 'shrink-0 rounded-full border border-base-300 bg-base-200 px-3 py-1 font-mono text-xs tabular-nums text-base-content/60' },
      curEl, h('span', { class: 'mx-0.5 opacity-40' }, '/'), h('span', {}, String(total)));
    // Always built, hidden when there is nothing to point at: a deck whose
    // slides are different subjects (branches across repos) gets a different
    // exit per slide, and creating the button lazily would mean rebuilding the
    // header rather than retargeting it.
    const linkIcon = h('i', { class: 'ph ph-arrow-square-out text-base' });
    const linkBtn = h('a', {
      class: 'btn btn-ghost btn-sm btn-circle shrink-0', target: '_blank', rel: 'noopener',
    }, linkIcon);
    const setLink = (l) => {
      if (l && l.href) {
        linkBtn.href = l.href;
        linkBtn.title = l.title || 'Open';
        linkBtn.setAttribute('aria-label', l.title || 'Open');
        linkIcon.className = `ph ${l.icon || 'ph-arrow-square-out'} text-base`;
        linkBtn.style.display = '';
      } else linkBtn.style.display = 'none';
    };
    setLink(o.link);
    const actionBtn = (a) => {
      const b = h('button', {
        class: 'btn btn-ghost btn-sm btn-circle shrink-0',
        title: a.title || '', 'aria-label': a.title || 'Action',
      }, h('i', { class: `ph ${a.icon || 'ph-dots-three'} text-base` }));
      b.addEventListener('click', () => a.onClick(deck));
      return b;
    };
    const buildActions = (list) =>
      (list || []).filter(a => a && typeof a.onClick === 'function').map(actionBtn);
    // A CONTAINER SO THE SET CAN BE RETARGETED, not just built. Actions used to
    // be spread into the header once at open, which is right for a deck whose
    // slides are the same kind of thing and wrong for one whose slides are not:
    // a staged set holds a CSV beside a note, and only one of them has anything
    // to offer. `display: contents` keeps the buttons flex children of the
    // header, so retargeting changes what is offered without moving the row.
    const actionWrap = h('span', { class: 'contents' }, ...buildActions(o.actions));
    // The dock toggle. Left of the caller's own actions because it operates the
    // DECK rather than the file in it, which is the same reason ✕ sits at the
    // far end: chrome that is always about the frame stays put, and chrome that
    // changes with the slide clusters by the pill. Its icon names what tapping
    // does, not the state it is in, so the row never has to be read twice.
    const paneIcon = h('i', { class: 'ph ph-square-split-horizontal text-base' });
    const paneBtn = h('button', { class: 'btn btn-ghost btn-sm btn-circle shrink-0' }, paneIcon);
    const syncPane = () => {
      if (!canDock()) { paneBtn.style.display = 'none'; return; }
      const docked = paneOf() === 'dock';
      paneBtn.style.display = '';
      paneBtn.title = docked ? 'Fill the pane' : 'Dock beside the list';
      paneBtn.setAttribute('aria-label', paneBtn.title);
      paneBtn.setAttribute('aria-pressed', String(docked));
      paneIcon.className = 'ph ' + (docked ? 'ph-arrows-out-simple' : 'ph-square-split-horizontal') + ' text-base';
    };
    paneBtn.addEventListener('click', () => {
      window.__deckPane?.(paneOf() === 'dock' ? 'pane' : 'dock');
      syncPane();
      applyLock();
    });
    syncPane();
    const subEl = h('p', { class: 'truncate text-xs text-base-content/50' }, o.subtitle || '');
    const titleEl = h('h1', { class: 'truncate text-sm font-semibold sm:text-base' }, o.title || '');
    const iconEl = h('i', { class: `ph ${o.icon || 'ph-cards'} text-xl` });
    const header = h('div', { class: 'flex items-center gap-3 border-b border-base-300 bg-base-100/90 px-4 py-3 backdrop-blur sm:px-6' },
      closeBtn,
      h('div', { class: 'grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary' },
        iconEl),
      h('div', { class: 'min-w-0 flex-1' }, titleEl, subEl),
      paneBtn, actionWrap, linkBtn, pill);

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
      center.append(h('div', { class: 'h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-base-content/10' }, barFill));
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
        + (i === cur ? 'w-7 bg-primary' : 'w-1.5 bg-base-content/20 hover:bg-base-content/30'));
      else barFill.style.width = ((cur + 1) / total * 100) + '%';
      if (o.onSlide) o.onSlide(cur);
    };
    deck.onSlide(sync);
    sync(0);

    // ── Stacking ───────────────────────────────────────────────────────────
    //
    // A deck opened from inside a deck is how drilling works: the child covers
    // the parent, the header becomes the child's, and leaving the child returns
    // you to the parent exactly where you left it. Nothing about that is
    // visible nesting; it is a navigation stack, and the nesting lives in the
    // return path.
    //
    // Two things made that impossible until 2026-08-13, both measured by
    // opening one deck inside another and driving it:
    //
    //   - EVERY deck registered its own `popstate`, and one history.back()
    //     fires all of them, so a single Back closed the whole stack. That is
    //     the return path itself, which is the entire point of drilling.
    //   - EVERY deck registered its own `keydown`, so one ArrowRight stepped
    //     the child AND the parent underneath it. Popping back then landed on a
    //     slide the reader never chose, and nothing on screen had said so.
    //
    // Both are the same mistake: a deck assuming it is the only one alive. The
    // fix is one module-level stack, and only its top answers. Each deck keeps
    // its own listeners (removing them on cleanup stays local), and both
    // handlers return early unless this deck is on top.
    //
    // The overflow lock needed nothing: each deck saves the value it found and
    // restores it, so a child saves `hidden` and restores `hidden` while the
    // parent restores the original. (`prevOverflow` is taken at the top of
    // open(), beside the pane contract that decides whether it is set at all.)
    let closed = false;
    const onTop = () => STACK[STACK.length - 1] === handle;
    const cleanup = () => {
      if (closed) return; closed = true;
      const at = STACK.indexOf(handle);
      if (at >= 0) STACK.splice(at, 1);
      syncDeckOpen();
      removeEventListener('keydown', onKey);
      removeEventListener('popstate', onPop);
      document.documentElement.style.overflow = prevOverflow;
      for (let i = 0; i < total; i++) deck.drop(i);   // let every slide go, not just the far ones
      // Leaving retraces the way in, so the parent is revealed rather than
      // suddenly present. The node is detached on the far side of the
      // animation, or at once when there was no animation to retrace.
      if (o.back && overlay.isConnected) {
        overlay.style.transition = 'transform .2s cubic-bezier(.32,.72,0,1)';
        overlay.style.transform = 'translateX(100%)';
        setTimeout(() => overlay.remove(), 240);
      } else overlay.remove();
      if (o.onClose) o.onClose();
    };
    // Leaving a deck means leaving everything stacked ON it, which is what a
    // navigation stack does: popping to a level discards the levels above.
    // Ordinarily there is nothing above (the reader dismisses what they are
    // looking at), and this is one history.back(). A caller that closes a
    // parent while a child is open gets the child closed with it, and the
    // history unwinds in one go() so no dead entries are left behind for a
    // later Back to spend itself on.
    const dismiss = () => {
      if (closed) return;
      const at = STACK.indexOf(handle);
      if (at < 0) return;
      const above = STACK.length - 1 - at;
      for (let i = STACK.length - 1; i > at; i--) STACK[i].drop();
      history.go(-(above + 1));                       // → popstate → cleanup
    };
    // One Back pops one deck. Without the guard a parent would tear itself down
    // on the same event that closed its child.
    const onPop = () => { if (onTop()) cleanup(); };
    const onKey = e => {
      if (!onTop()) return;
      if (e.key === 'Escape') dismiss();
      else if (e.key === 'ArrowRight') deck.go(deck.active() + 1);
      else if (e.key === 'ArrowLeft') deck.go(deck.active() - 1);
    };
    closeBtn.addEventListener('click', dismiss);
    // THE GROUND BESIDE THE PANEL IS A DISMISS TARGET, which is what the
    // desktop margin is otherwise for: on a phone the panel is full-bleed, so
    // there is no ground to hit and this never fires. `e.target === overlay`
    // rather than a `closest` check, so a click that began inside the panel and
    // ended outside it (a drag past the edge, a text selection released on the
    // ground) does not close a deck the reader is working in.
    overlay.addEventListener('click', (e) => { if (e.target === overlay && onTop()) dismiss(); });
    addEventListener('popstate', onPop);
    addEventListener('keydown', onKey);
    // `replace: true` reuses the entry the deck it is replacing left behind,
    // instead of adding one. A caller that swaps a deck for another at the SAME
    // level (show-repo opening a second branch while one is open) drops the
    // first with `drop()`, which touches no history, and this keeps Back
    // costing one press rather than one per swap.
    history[o.replace ? 'replaceState' : 'pushState']({ __sdDeck: 1 }, '', location.href);
    applyLock();
    document.body.append(overlay);
    // A drilled deck SLIDES IN from the right; a root deck just appears.
    //
    // This is polish that stops being polish once two levels look alike. When
    // the parent and the child wear the same chrome, a child that pops with no
    // motion reads as "the content changed" rather than "I moved down a
    // level", and the reader loses the one cue that tells them Back will now
    // do something. The direction is the platform's convention and it is the
    // same direction the back chevron points.
    if (o.back) {
      overlay.style.transform = 'translateX(100%)';
      requestAnimationFrame(() => {
        overlay.style.transition = 'transform .22s cubic-bezier(.32,.72,0,1)';
        overlay.style.transform = 'translateX(0)';
        setTimeout(() => { overlay.style.transition = ''; overlay.style.transform = ''; }, 280);
      });
    }
    // start: jump AFTER first layout, and instantly. At append time the track
    // has no width yet, so an immediate go() computes slide 0; and the track's
    // scroll-smooth would otherwise animate across every slide in between.
    if (o.start) requestAnimationFrame(() => {
      const t = deck.track;
      t.scrollTo({ left: Math.max(0, Math.min(total - 1, o.start)) * (t.clientWidth || 1), behavior: 'instant' });
    });
    handle = {
      el: overlay, close: dismiss, deck,
      get title(){ return titleEl.textContent; },
      setSubtitle: t => { subEl.textContent = t; },
      setTitle: t => { titleEl.textContent = t; },
      setIcon: c => { iconEl.className = `ph ${c || 'ph-cards'} text-xl`; },
      // The header's other setters name one element each; this one names the
      // whole set, since what is on offer can change in kind and not only in
      // wording as the reader moves between slides.
      setActions: list => { actionWrap.replaceChildren(...buildActions(list)); },
      setLink,
      get depth(){ return STACK.indexOf(handle); },
      get onTop(){ return onTop(); },
      // Tear down without touching history. Used by dismiss() to take the
      // decks above this one; a caller should use close().
      drop: cleanup,
    };
    STACK.push(handle);
    syncDeckOpen();
    return handle;
  }

  // One level down from `parent`. See the drilling note at the top.
  function drill(parent, o = {}) {
    const crumb = [parent && parent.title, o.subtitle].filter(Boolean).join(' · ');
    return open({ ...o, back: true, subtitle: crumb });
  }

  window.swipeDeck = { core, open, drill, h, stack: STACK,
                       top: () => STACK[STACK.length - 1] || null };
})();
