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
//   link  { href, title, icon?, svg? }  an optional open-elsewhere button in
//                          the header. `icon` is a Phosphor class; `svg` is
//                          markup for a mark the Phosphor set has no glyph for
//                          and takes precedence over it. The Claude logomark
//                          is the case that earned it: where a link goes is
//                          worth saying, and an arrow only says "away".
//   index (i) => {title, subtitle?, icon?} | string
//                          an optional labeler for the deck's CONTENTS. Supply
//                          it and the header MARK becomes a button opening the
//                          whole set as a list, current slide marked, tap to go.
//                          See the note above the sheet.
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
// ── The host's dock hook ────────────────────────────────────────────────────
//
//   window.__deckPane = (intent) => { …express 'dock' or 'pane'… }
//   window.__deckPane.when = '(min-width: 1024px)'   // or a () => boolean
//
// Installing the hook is the CLAIM that this host can dock, and the pane toggle
// renders on that claim. `when` qualifies it: a media query string or a
// predicate, read on every sync rather than once, so a host whose answer depends
// on the width can say so instead of accepting an intent it will refuse. Omit it
// and the hook is unconditional, which is what the contract meant before `when`
// existed.
//
// The kit re-asks when the answer can have changed: a media-query `when` is
// watched directly, a predicate gets `resize`. Both are released with the deck.
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
    // CAN it dock, right now. The hook's existence used to be the whole answer,
    // and that was wrong in a way only a phone showed: dockability is rarely a
    // property of the HOST, it is a property of the width, or of whether this
    // view has a list to sit beside. Answered once at boot, a narrow viewport
    // got a pane toggle whose intent the host then refused, which is an inert
    // control: it reads as broken rather than absent, and the reader cannot tell
    // which.
    //
    // So the hook may carry `when`, a media query string or a predicate, and it
    // is read on every sync rather than once. A hook with no `when` is
    // unconditional, which is exactly what the contract meant before this
    // existed, so nothing that already installed one changes behaviour.
    //
    // Deliberately NOT a probe call like `__deckPane('query')`: a capability
    // question that runs the intent sink is a question with side effects, and
    // the one host implementing this contract would have answered it by
    // actually changing the pane.
    const dockAllowed = () => {
      const fn = window.__deckPane;
      if (typeof fn !== 'function') return false;
      const w = fn.when;
      if (typeof w === 'function') { try { return !!w(); } catch { return false; } }
      if (typeof w === 'string') { try { return matchMedia(w).matches; } catch { return true; } }
      return true;
    };
    const canDock = dockAllowed;
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
    // rather than the window. `--deck-top` is the same idea on the other axis,
    // for chrome ABOVE the content, a header row. Between them the takeover
    // lands in the app's view pane rather than over the app.
    //
    // WHO SETS THEM, since a contract with named implementations is easier to
    // follow than one described in the abstract. Two apps, and they differ in a
    // way worth seeing side by side:
    //
    //   show-repo (app/index.html) measures both. --deck-head comes off the real
    //   <header> and --deck-side off the real <aside>, because the header is
    //   conditional on shellMode and the sidebar's width is an lg:/xl: pair, so
    //   any number restated here would be a second copy to keep in step with a
    //   class nobody would think to look at. A hidden element measures 0, which
    //   is the right answer for free.
    //
    //   the budget-drs app (mehrlander/home, app/view/app.html) states its
    //   sidebar as 18rem, matching a w-72 that is not responsive, and measures
    //   its navbar into --drs-navh, which it already needed for its own docked
    //   layout. Same contract, and the split between stating and measuring
    //   follows which of the two can actually change.
    //
    // Both map these in at lg and up only, so a phone keeps the full-window
    // takeover, which is the right answer where there is no chrome beside the
    // content to preserve.
    //
    // A note for the next host: these resolve against the nearest VIEWPORT, so a
    // page embedded in an iframe describes its own chrome and needs no awareness
    // of whatever frames it. show-repo hosts the budget-drs app that way, as an
    // appView, and neither side needed a branch for it: measured 2026-08-22 in a
    // simulated host, the inner app's deck landed against the inner app's own
    // sidebar and navbar and never escaped the frame.
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
    const panel = h('div', { class: 'relative grid h-full w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto] overflow-hidden bg-base-100 border-base-300 [border-left-width:var(--deck-border,0px)]' });

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
        // Markup wins over a glyph, and the deck keeps neither: a retarget
        // swaps the whole button face, so a slide offering a Phosphor icon
        // after one offering a logomark leaves nothing of the logomark behind.
        if (l.svg) linkBtn.innerHTML = l.svg;
        else {
          linkIcon.className = `ph ${l.icon || 'ph-arrow-square-out'} text-base`;
          linkBtn.replaceChildren(linkIcon);
        }
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
      syncSeam();
    });
    syncPane();
    // …and re-ask when the answer can have changed. The kit used to read the
    // answer at open and on its own toggle and nowhere else, so a deck opened on
    // a phone and then rotated into a dockable width kept the answer it was born
    // with for the rest of its life. `when` as a media query gets the precise
    // signal; a predicate gets resize, which is the only general one available.
    // Both are torn down with the deck by cleanup().
    // dockWatch, not paneWatch: the two answer different questions and the deck
    // needs both. paneWatch (below) is a MutationObserver on `data-deck-pane`
    // and fires when the pane's VALUE changes. This fires when the WIDTH
    // changes, which is when the host's answer to whether it can dock at all
    // can change, and no attribute write announces that. They arrived on
    // separate branches and collided on the name alone, which git merged into
    // two `const paneWatch` declarations in one scope: a clean textual merge and
    // a file that does not parse.
    const dockWatch = [];
    {
      const w = window.__deckPane && window.__deckPane.when;
      if (typeof w === 'string') {
        try {
          const mq = matchMedia(w);
          const onMq = () => { syncPane(); applyLock(); };
          mq.addEventListener('change', onMq);
          dockWatch.push(() => mq.removeEventListener('change', onMq));
        } catch { /* an unparseable query: the deck still works, it just cannot re-ask */ }
      } else if (typeof w === 'function') {
        const onResize = () => { syncPane(); applyLock(); };
        addEventListener('resize', onResize);
        dockWatch.push(() => removeEventListener('resize', onResize));
      }
    }
    const subEl = h('p', { class: 'truncate text-xs text-base-content/50' }, o.subtitle || '');
    const titleEl = h('h1', { class: 'truncate text-sm font-semibold sm:text-base' }, o.title || '');
    const iconEl = h('i', {});
    // THE MARK IS A BUTTON WHEN THERE IS A LIST BEHIND IT, and a plain plaque
    // otherwise. The kit cannot build that list on its own: it holds a count
    // and a render callback and has never seen the caller's array, which is
    // the whole reason one deck can page documents, diffs, mounted apps and
    // PDF pages through one door. So the contents arrive the same way the
    // slides do, as a callback, and `index` is `render`'s cheap twin: render
    // is lazy because a slide costs a fetch or a mount, while a label is
    // metadata the caller already holds, so the list can be complete while
    // the deck stays three slides deep.
    //
    // Scraping the built slides was the alternative and it cannot work: only
    // the active slide and its neighbours exist, so a 47-slide deck would
    // list three rows and 44 blanks, and a slide holding a canvas or a mounted
    // component has no heading to scrape in the first place.
    const indexOf = typeof o.index === 'function' ? o.index : null;
    const MARK = 'grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary';
    const mark = indexOf
      ? h('button', { class: MARK + ' transition-colors hover:bg-primary/20',
                      'aria-haspopup': 'true' }, iconEl)
      : h('div', { class: MARK }, iconEl);
    // `sd-header` is a HOOK, not a style, the same bargain `sd-overlay` makes:
    // a caller hanging its own chrome under the header needs to measure it, and
    // measuring it by walking firstElementChild twice would be selecting on a
    // layout decision this file is free to change.
    const header = h('div', { class: 'sd-header flex items-center gap-3 border-b border-base-300 bg-base-100/90 px-4 py-3 backdrop-blur sm:px-6' },
      closeBtn, mark,
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

    // ── THE CONTENTS ────────────────────────────────────────────────────────
    //
    // A list of every slide, over the track, opened from the mark. It earns its
    // place at the size where the footer stops helping: the pager draws dots
    // only while they stay countable and a bare progress bar past that, so a
    // 47-slide deck tells the reader they are at 1/47 and nothing about what
    // the other 46 are.
    //
    // IT TAKES A HISTORY ENTRY, for the same reason the deck itself does: on a
    // phone, Back is what a reader reaches for, and a panel that ignores it
    // throws them out of the deck instead of out of the list. That is the whole
    // cost of this feature, and it is paid in three places, all of them here:
    // `onPop` closes the list before it closes the deck, `indexPops` swallows
    // the pop that closing programmatically causes (otherwise the deck would
    // read its own tidy-up as a Back press and shut), and `dismiss` counts the
    // open lists across the stack so one ✕ still unwinds to exactly the right
    // depth.
    let indexOpen = false, indexPop = 0;
    let restIcon = o.icon || 'ph-cards';
    // The glyph names what tapping DOES, never the state it is in, which is the
    // rule the pane toggle above already follows: on a row of chrome nothing
    // should have to be read twice.
    // ph-caret-up, and NOT ✕, though "close the list" is what it does: the
    // header already carries a ✕ at its left end, and two of them on one row
    // would ask the reader which one closes what. A caret puts a panel away.
    const paintMark = () => {
      iconEl.className = 'ph ' + (indexOpen ? 'ph-caret-up' : restIcon) + ' text-xl';
      if (!indexOf) return;
      mark.title = indexOpen ? 'Back to the slide' : 'Contents';
      mark.setAttribute('aria-label', mark.title);
      mark.setAttribute('aria-expanded', String(indexOpen));
    };
    paintMark();
    const sheet = h('div', { class: 'sd-index absolute inset-x-0 bottom-0 z-20 overflow-y-auto scrollbar-thin bg-base-100' });
    const buildIndex = () => {
      const cur = deck.active();
      const rows = [];
      for (let i = 0; i < total; i++) {
        let label;
        // One row failing is not the list failing, the same posture the track
        // takes on a slide that will not render.
        try { label = indexOf(i); } catch { label = null; }
        if (typeof label === 'string') label = { title: label };
        label = label || {};
        const here = i === cur;
        const row = h('button', {
          class: 'flex w-full items-start gap-3 border-b border-base-200 px-4 py-3 text-left transition-colors sm:px-6 '
            + (here ? 'bg-primary/10' : 'hover:bg-base-200/60'),
          'aria-current': here ? 'true' : '',
        },
          h('span', { class: 'mt-0.5 w-6 shrink-0 text-right font-mono text-xs tabular-nums '
              + (here ? 'text-primary' : 'text-base-content/40') }, String(i + 1)),
          label.icon ? h('i', { class: `ph ${label.icon} mt-0.5 shrink-0 text-base text-base-content/40` }) : null,
          h('div', { class: 'min-w-0 flex-1' },
            h('div', { class: 'truncate text-sm ' + (here ? 'font-semibold text-primary' : '') },
              label.title || String(i + 1)),
            label.subtitle
              ? h('div', { class: 'mt-0.5 line-clamp-2 text-xs leading-snug text-base-content/50' }, label.subtitle)
              : null));
        row.addEventListener('click', () => { closeIndex(); deck.go(i); });
        rows.push(row);
      }
      sheet.replaceChildren(...rows);
      return cur;
    };
    const openIndex = () => {
      if (indexOpen || !indexOf) return;
      indexOpen = true;
      // Measured rather than stated, and measured on every open: the header is
      // one line at every width today, and a number written down here would be
      // a second copy of a padding class nobody would think to look at.
      sheet.style.top = header.offsetHeight + 'px';
      const cur = buildIndex();
      panel.append(sheet);
      // Open ON the reader, not at the top. In a long set the row they are
      // standing on is the one row they are certain to want.
      try { sheet.children[cur]?.scrollIntoView({ block: 'center' }); } catch {}
      paintMark();
      history.pushState({ __sdIndex: 1 }, '', location.href);
    };
    const closeIndex = (pop = true) => {
      if (!indexOpen) return;
      indexOpen = false;
      sheet.remove();
      paintMark();
      if (!pop) return;
      indexPop++;
      const mine = indexPop;
      history.back();
      // And stop waiting if no popstate comes. The alternative is a flag that
      // stays armed forever and swallows the reader's NEXT Back, which would
      // read as a dead button on the one control a phone always has.
      setTimeout(() => { if (indexPop === mine) indexPop = 0; }, 500);
    };
    if (indexOf) mark.addEventListener('click', () => indexOpen ? closeIndex() : openIndex());

    // ── THE SEAM ────────────────────────────────────────────────────────────
    // Docked, the deck's left edge is a boundary between two things the reader
    // is using at once, and until now it was a boundary they could not move:
    // the width came from one CSS clamp, which is a decent guess and never
    // theirs. The handle sits ON that edge, inside the overlay, straddling it.
    //
    // TWO HOOKS, TWO CLAIMS, and the second is deliberately separate from the
    // first. `window.__deckPane` says the host can dock at all; `__deckWidth`
    // says it can also be TOLD how wide, which is a different capability and a
    // host may honestly have one without the other (a fixed sidebar can dock a
    // deck beside itself and have nowhere to put a variable width). A host with
    // only the first gets exactly the dock it had before this existed, and so
    // does a page that never loaded kits/dock-split.js, which is an optional
    // dependency the way kits/session-export.js is to session-render.
    const canSize = () => typeof window.__deckWidth === 'function' && window.dockSplit;
    let splitter = null;
    // INLINE, not utility classes, and this is the one place in the kit where
    // that is not a style preference. The seam is created after the page's
    // Tailwind build has scanned the DOM, so its utilities may not have been
    // compiled when it mounts: measured here as a handle with height 0 sitting
    // at the foot of the overlay, hit-testable nowhere, which reads as a drag
    // that does nothing rather than as a missing stylesheet. Everything the
    // kit's own injected CSS draws is fine; only the placement, which is the
    // caller's half, has to be immune.
    const seam = h('div');
    Object.assign(seam.style, { position: 'absolute', left: '0', top: '0', bottom: '0',
                                width: '6px', transform: 'translateX(-50%)', zIndex: '5' });
    const syncSeam = () => {
      const want = paneOf() === 'dock' && canSize();
      if (want && !splitter) {
        overlay.appendChild(seam);
        splitter = window.dockSplit.attach(seam, {
          axis: 'col', from: 'end',
          label: 'Resize the docked pane',
          // The overlay clips, so the number goes inside it rather than astride
          // the seam, where half of it would be cut off.
          readout: 'after',
          // The percentage is of the WINDOW, not of the overlay: the overlay is
          // the pane being sized, so measuring against it would make every drag
          // a fraction of a number the drag is changing.
          bounds: () => ({ right: window.innerWidth, left: 0, width: window.innerWidth,
                           top: 0, bottom: window.innerHeight, height: window.innerHeight }),
          value: () => window.__deckWidth(),
          onChange: pct => window.__deckWidth(pct),
          onCommit: pct => window.__deckWidth(pct, true),
        });
        // The attach reads the width before the pane's own styles have settled
        // (the host sets --deck-side on a tick of its own), so the first value
        // can be a measurement of the undocked frame. One frame later it is the
        // real one, and the handle stops opening on a number it never held.
        requestAnimationFrame(() => splitter && splitter.refresh());
      } else if (!want && splitter) {
        splitter.destroy(); splitter = null; seam.remove();
      } else if (splitter) splitter.refresh();
    };
    // THE PANE CAN CHANGE WITHOUT THE BUTTON, and the deck has to notice. The
    // toggle is only one route: the host re-derives the pane whenever its
    // sidebar opens or closes, on a restore from storage, and on any width
    // change, and every one of those is a `data-deck-pane` write the deck never
    // hears about. Syncing on the click alone left the seam absent for exactly
    // those cases and present for the one anybody would think to test.
    //
    // Watching the attribute is also the honest reading of the hook's own
    // contract, which says the host is free to refuse a dock by simply not
    // changing the value: a kit that trusts its own click and never looks again
    // cannot see that refusal either. The lock rides along for the same reason,
    // since a pane that changed underneath leaves it describing the old one.
    const paneWatch = new MutationObserver(() => { applyLock(); syncPane(); syncSeam(); });
    paneWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-deck-pane'] });

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
      closeIndex(false);      // the entry is spent by whoever is unwinding us
      const at = STACK.indexOf(handle);
      if (at >= 0) STACK.splice(at, 1);
      syncDeckOpen();
      removeEventListener('keydown', onKey);
      removeEventListener('popstate', onPop);
      document.documentElement.style.overflow = prevOverflow;
      paneWatch.disconnect();
      if (splitter) { splitter.destroy(); splitter = null; }
      for (let i = 0; i < total; i++) deck.drop(i);   // let every slide go, not just the far ones
      // Leaving retraces the way in, so the parent is revealed rather than
      // suddenly present. The node is detached on the far side of the
      // animation, or at once when there was no animation to retrace.
      if (o.back && overlay.isConnected) {
        overlay.style.transition = 'transform .2s cubic-bezier(.32,.72,0,1)';
        overlay.style.transform = 'translateX(100%)';
        setTimeout(() => overlay.remove(), 240);
      } else overlay.remove();
      dockWatch.splice(0).forEach(off => { try { off(); } catch {} });
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
      // Every open contents list on the way down owns an entry too, and one
      // history.go has to clear the lot: counted BEFORE the drops below, since
      // dropping a deck closes its list and would zero the number first.
      let extra = 0;
      for (let i = STACK.length - 1; i >= at; i--) extra += STACK[i].extraEntries || 0;
      for (let i = STACK.length - 1; i > at; i--) STACK[i].drop();
      if (indexOpen) closeIndex(false);
      history.go(-(above + extra + 1));               // → popstate → cleanup
    };
    // One Back pops one deck. Without the guard a parent would tear itself down
    // on the same event that closed its child.
    const onPop = () => {
      if (!onTop()) return;
      if (indexPop) { indexPop = 0; return; }       // our own close, already handled
      if (indexOpen) { closeIndex(false); return; } // Back leaves the list, not the deck
      cleanup();
    };
    const onKey = e => {
      if (!onTop()) return;
      // The list is in front, so it takes the key. The arrows are deliberately
      // swallowed rather than passed through: stepping a track the reader
      // cannot see would move them somewhere the list is not showing.
      if (indexOpen) { if (e.key === 'Escape') closeIndex(); return; }
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
      setIcon: c => { restIcon = c || 'ph-cards'; paintMark(); },
      // Whether this deck is holding a history entry beyond its own, which is
      // what lets dismiss() unwind a stack it did not build.
      get extraEntries(){ return indexOpen ? 1 : 0; },
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
    // After the mount, so the seam is measured against a laid-out overlay and a
    // deck that opens already docked gets its handle without a toggle first.
    syncSeam();
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
