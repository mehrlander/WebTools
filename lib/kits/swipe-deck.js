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
//   index (i) => {title?, subtitle?, icon?, group?} | string
//                          an optional labeler for the deck's CONTENTS. Supply
//                          it and the header MARK becomes a button opening the
//                          whole set as a list, current slide marked, tap to go.
//                          Returning nothing nameable is allowed and useful: the
//                          row then prints its number and the list is a jump
//                          rather than a table of contents. `group` is any value
//                          identifying what a slide belongs to (a section, a
//                          chapter, a run); consecutive slides sharing one are
//                          clustered in the footer's dots. See the notes above
//                          the sheet and by the dots.
//   subheader  Element | (deck) => Element | null
//                          a row under the header that the caller fills and the
//                          kit only places. For chrome belonging to the slide
//                          rather than to the deck: a workbook's sheet tabs, a
//                          legend, a view switch. Swap it per slide with
//                          `handle.setSubheader`. NOT for a control that
//                          changes `count`; see the note by the slot.
//   actions [{icon,title,onClick}]  extra header buttons, left of `link`. Each
//                          onClick is handed the core handle AND its own button,
//                          so an action can ask which slide the reader is on
//                          (`deck.active()`) and where to hang whatever it
//                          opens. The first argument is the whole reason this is
//                          not just another `link`: a deck's chrome is the only
//                          place that knows the answer, and an action that acts
//                          on "this card" needs it. The second is for a popover,
//                          which otherwise anchors to the panel and reads as
//                          having dropped out of nowhere.
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
//   immersive              hide the header and the footer while the reader is
//                          scrolling DOWN inside a slide, bring both back on
//                          the first upward scroll and on every slide change,
//                          and TOGGLE both on a tap on the document (not on a
//                          control, and not on the chrome). The tap is the only
//                          way in for a slide too short to scroll. Opt-in: a
//                          transcript wants its header as a constant anchor, a
//                          document wants the surface. See the note by the
//                          listener for why it is a capture handler.
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
    // same drop as `divide-base-200` (the mechanics reference, Key Conventions 7). Every deck
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
    // FOUR ROWS, and the second is usually empty. Each child NAMES ITS ROW
    // (`row-start-*`) rather than being auto-placed, and that is not tidiness.
    // The subheader carries `empty:hidden`, which is `display: none`, and a
    // `display: none` child is not a grid item at all: auto-placement then
    // slid every later child up a row, so the track landed in row 2 (`auto`,
    // sized to its content) and the footer in row 3 (`1fr`, taking the rest).
    //
    // It looked correct for two years because it usually IS: an auto row
    // clamps to the space available, and a slide's content is normally taller
    // than the panel, so the track filled the row anyway and the footer's `1fr`
    // collapsed to its own content. The tell only appears when a slide's
    // content contributes NO intrinsic height, which an absolutely positioned
    // child does: the track then measured 111px inside an 843px panel while
    // the footer took 667. Measured 2026-08-25 against the pdf module's
    // continuous column; the row it needs is the definite one, and every
    // `h-full` and `flex-1` chain inside a slide has silently wanted the same
    // thing all along.
    const panel = h('div', { class: 'relative grid h-full w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_1fr_auto] overflow-hidden bg-base-100 border-base-300 [border-left-width:var(--deck-border,0px)]' });

    // ✕ at the root, ‹ one level down. The glyph is the only promise the
    // header makes about where dismissing lands you, so it has to be true.
    const closeBtn = h('button', {
      class: 'btn btn-ghost btn-sm btn-circle shrink-0',
      'aria-label': o.back ? 'Back' : 'Close',
      title: o.back ? 'Back' : 'Close',
    }, h('i', { class: o.back ? 'ph ph-caret-left text-xl' : 'ph ph-x text-lg' }));
    const curEl = h('span', {}, '1');
    // POSITION IS ALREADY IN THE FOOTER, as dots or as a bar, so on a phone
    // this pill is the second place it is said and the title is the one thing
    // that cannot be said anywhere else. It costs about 64px of a 390px row
    // that also holds a close button, the contents mark, a dock toggle and the
    // caller's actions, and with it in place a filename truncated to
    // "flow-a...." while a duplicate count sat beside it. Kept from `sm` up,
    // where the row has the width and a glance at the top beats a glance at
    // the bottom.
    const pill = h('div', { class: 'hidden sm:block shrink-0 rounded-full border border-base-300 bg-base-200 px-3 py-1 font-mono text-xs tabular-nums text-base-content/60' },
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
      b.addEventListener('click', () => a.onClick(deck, b));
      return b;
    };
    // An entry is either a spec this kit draws, or an ELEMENT the caller has
    // already built. The element form exists because a slide's component can
    // own chrome the deck cannot describe as {icon, title, onClick}: the file
    // viewer's mode and open-elsewhere menus are its own, and a host framing it
    // wants them in this header rather than in a second one below. Elements
    // pass through untouched, so what a caller hands over is what appears.
    const buildActions = (list) =>
      (list || []).filter(a => a instanceof Element || (a && typeof a.onClick === 'function'))
                  .map(a => a instanceof Element ? a : actionBtn(a));
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
    // ── THE TITLE, AND A SLOT BESIDE IT ──────────────────────────────────
    //
    // The name is split from its h1 so a mark can sit next to the NAME rather
    // than next to the header. A control in the right-hand cluster reads as
    // belonging to the cluster, whatever its order there; the estate's rule
    // for a github mark is that it rides the identity it opens, which on this
    // header is the title (asked for 2026-09-08, after the cluster's own end
    // was tried and read as part of the group).
    //
    // INSIDE the h1, not around it. Half the estate reads this header as
    // `h1 + p`, so the subtitle has to stay the title's adjacent sibling; a
    // wrapper would have broken eight tests and three scenarios silently, in
    // the sense that they would have found no crumb rather than a wrong one.
    // setTitle writes the SPAN, so a mark in the slot survives a swipe, and
    // `title` reads the span for the same reason.
    const titleText = h('span', { class: 'truncate min-w-0' }, o.title || '');
    const titleSlot = h('span', { class: 'shrink-0 empty:hidden leading-none' });
    const titleEl = h('h1', { class: 'flex items-center gap-1.5 min-w-0 text-sm font-semibold sm:text-base' },
      titleText, titleSlot);
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
    // THE RIGHT-HAND CHROME IS ONE CLUSTER. Spread at the header's own gap,
    // the buttons sat at even intervals across the whole row, so each read as a
    // loose object rather than as a set, and the first of them looked stranded
    // in the space after the title. Tight inside the group, the header's gap
    // outside it: same controls, and the row now says title | controls | count
    // instead of listing six things.
    const header = h('div', { class: 'sd-header row-start-1 flex items-center gap-3 border-b border-base-300 bg-base-100/90 px-4 py-3 backdrop-blur sm:px-6' },
      closeBtn, mark,
      h('div', { class: 'min-w-0 flex-1' }, titleEl, subEl),
      h('div', { class: 'flex shrink-0 items-center gap-1' }, paneBtn, actionWrap, linkBtn, pill));

    // ── A MENU UNDER A HEADER ACTION ─────────────────────────────────────
    //
    // The kit's, not the caller's, because placing it is the one part only the
    // kit can answer: the popover hangs from the action cluster, inside the
    // header's own stacking context and above the track. A caller that built
    // its own would be guessing at both, which is what stage.js was doing until
    // this was lifted out of it (its _rMenu, unchanged in behaviour).
    //
    // Rows are { label, icon, href | onClick, active }. An href opens in a new
    // tab and closes the menu; an onClick closes it first, so a row that
    // rebuilds the header is not removing the element it is running inside.
    // The outside click is captured rather than bubbled and armed a tick late,
    // or the same tap that opened the menu closes it again.
    const menu = (btn, rows, o2 = {}) => {
      document.querySelectorAll('.sd-hdr-menu').forEach(m => m.remove());
      if (!rows || !rows.length) return;
      // The width is the caller's: a menu of view modes wants less than one of
      // file destinations, and neither is the kit's business beyond placing it.
      // Which SIDE it opens from is the kit's, and is measured below.
      const box = h('ul', { class: 'sd-hdr-menu menu absolute z-[80] '
                                 + (o2.width || 'w-52')
                                 + ' rounded-box border border-base-300 bg-base-200 p-2 shadow-xl' });
      for (const r of rows) {
        const a = h(r.href ? 'a' : 'button', { class: r.active ? 'menu-active active' : '' },
          h('i', { class: 'ph ' + (r.icon || 'ph-dot') }), h('span', {}, r.label || ''));
        if (r.href) { a.href = r.href; a.target = '_blank'; a.rel = 'noopener'; }
        a.addEventListener('click', () => { box.remove(); if (r.onClick) r.onClick(); });
        box.append(h('li', {}, a));
      }
      const host = btn.parentElement;
      if (host && getComputedStyle(host).position === 'static') host.style.position = 'relative';
      (host || btn).append(box);
      // ── WHERE IT OPENS, MEASURED ─────────────────────────────────────────
      //
      // right-0 was hardcoded, which is correct for an anchor in the header's
      // right-hand cluster and wrong for one anywhere else: a mark beside the
      // title opened its menu leftward across the whole header, away from the
      // thing it belongs to. The caller cannot declare the side either, since
      // the anchor moves with the title's length and the room depends on the
      // viewport and on whether the deck is docked.
      //
      // SO IT SLIDES RATHER THAN FLIPS. Opening from the anchor's own left
      // edge is the intent; where that runs off the right, shift it back by
      // exactly the overflow, which keeps the menu under its mark instead of
      // throwing it to the far side. Flipping to right-0 was the first fix and
      // was no better than the hardcoded one at 390: a 224px menu on a mark at
      // x=180 has 202px of room, so it flipped every time and still opened
      // 156px to the LEFT of the mark it hangs from.
      //
      // Appended before measuring because the width is a class, not a number
      // this can compute. One read, before paint.
      const anchor = (host || btn).getBoundingClientRect();
      // BELOW THE HEADER, not below the anchor. top-full hangs the box off
      // whatever it is nested in, which for a mark inside the h1 is the title
      // TEXT: the menu then started mid-header and covered the crumb under it.
      // The header is the thing a header menu belongs under, and only the kit
      // knows where that ends.
      box.style.top = (header.getBoundingClientRect().bottom + 4 - anchor.top) + 'px';
      box.style.left = '0px';
      const r = box.getBoundingClientRect();
      const over = r.right - (window.innerWidth - 8);
      if (over > 0) {
        // Never past the viewport's left edge: a menu wider than the room
        // beside its anchor is pinned rather than hung off the side, since
        // half a menu on screen is worse than one that is not aligned.
        box.style.left = Math.max(8 - anchor.left, -over) + 'px';
      }
      setTimeout(() => {
        const away = (e) => {
          if (box.contains(e.target) || btn.contains(e.target)) return;
          box.remove(); document.removeEventListener('click', away, true);
        };
        document.addEventListener('click', away, true);
      }, 0);
    };
    // Actions are handed the CORE deck, so that is where this has to live for
    // an onClick to reach it.
    deck.menu = menu;

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
      // THE PAGER AS A PICTURE OF THE SHAPE, not only of the length. Where the
      // labeler puts slides in groups, the dots cluster by group: a run of five
      // says one section owns five pages, and two lone dots say two sections
      // back to back. It costs one labeler call per slide, which the contract
      // already allows (a label is metadata the caller holds, unlike a slide),
      // and it is bounded by `useDots` at 25.
      //
      // A GAP RATHER THAN A COLOUR. The current dot is already the primary
      // colour, so a second colour on the same row would be a second thing to
      // decode, and a tint per group needs a palette the kit has no business
      // choosing. A boundary is a boundary, and space says it in any theme.
      const groups = [];
      for (let i = 0; i < total && indexOf; i++) {
        let g;
        try { const l = indexOf(i); g = l && typeof l === 'object' ? l.group : undefined; } catch { g = undefined; }
        groups.push(g);
      }
      for (let i = 0; i < total; i++) {
        const d = h('button', { class: 'h-1.5 rounded-full transition-all duration-200', 'aria-label': `Go to ${i + 1}` });
        if (i && groups[i] !== undefined && groups[i] !== groups[i - 1]) d.style.marginLeft = '0.75rem';
        d.addEventListener('click', () => deck.go(i));
        dots.push(d); center.append(d);
      }
    } else {
      barFill = h('div', { class: 'h-1.5 rounded-full bg-primary transition-all duration-200', style: 'width:0%' });
      center.append(h('div', { class: 'h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-base-content/10' }, barFill));
    }
    const footer = h('div', { class: 'row-start-4 grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-4 border-t border-base-300 bg-base-100 px-4 py-3 sm:px-6' },
      prevB, center, nextB);

    // ── THE SUBHEADER ───────────────────────────────────────────────────────
    //
    // A row under the header that the CALLER fills, and about which this kit
    // holds no opinion beyond where it sits. It exists because every consumer
    // that wanted chrome of its own was building it outside the deck: the
    // workbook viewer's sheet tabs are a div in the viewer's markup with the
    // deck underneath them, which works until the deck is opened as a takeover
    // and leaves its tabs behind on the page it came from.
    //
    // IT IS A SLOT, NOT A COMPONENT, and that is the whole design. A tab strip,
    // a filter row and a legend have nothing in common except their position,
    // so the kit supplies the position: one grid row, a bottom border to sit it
    // against the track, and `sd-subheader` as the name to measure. Anything
    // more would be the kit choosing what belongs there, which is the caller's
    // half and the half that differs every time.
    //
    // WHAT IT IS NOT FOR IS FILTERING THE DECK. `count` is fixed when a deck
    // opens, so a control here that changed the set would leave the pager, the
    // dots and the contents list describing a deck that no longer exists. A
    // filter belongs upstream, where record-deck's fromGrid already puts it:
    // it reads the grid's ACTIVE rows, so the deck receives a set someone else
    // narrowed. Put a control here that changes what a slide SHOWS, not how
    // many there are.
    const subWrap = h('div', { class: 'sd-subheader row-start-2 empty:hidden flex shrink-0 flex-wrap items-center gap-1 border-b border-base-300 bg-base-100 px-4 py-1.5 sm:px-6' });
    // A function gets the core handle, the way an action does, since chrome
    // that acts on "this card" needs to know which card that is.
    const fillSub = (v) => {
      const el = typeof v === 'function' ? v(deck) : v;
      if (el) subWrap.replaceChildren(el); else subWrap.replaceChildren();
    };
    fillSub(o.subheader);

    // The track's row is set HERE rather than in `core`, because a track is
    // also mounted inline by callers with no grid around it, where a
    // `row-start` would be a class about a context it is not in.
    deck.track.classList.add('row-start-3');
    panel.append(header, subWrap, deck.track, footer);
    overlay.append(panel);

    // ── IMMERSIVE: the chrome gets out of the way while you read ────────────
    //
    // Opt-in (`immersive: true`), because a deck of chat turns and a deck of
    // documents want different things: a transcript is read in bursts with the
    // header as a constant anchor, while a document wants the surface. The
    // stage reader asks for it; nothing else does yet.
    //
    // NOT dropping the chrome, which is the distinction that matters. The
    // header and the footer are both still there, still doing their jobs, and
    // both come back on the first upward scroll, on a tap, and whenever you
    // move to another document. What goes away is their claim on the screen
    // while you are reading downward, which is the one time nothing in them is
    // being asked for. Measured at 390x844 in the reader: 198px of 844 is
    // chrome, 23.5% of the screen, and a phone reading a Letter page at
    // fit-to-width has nothing to spare.
    //
    // A CAPTURE LISTENER, because `scroll` does not bubble. The panel cannot
    // hear a descendant scroller any other way, and it must not have to know
    // which descendant: a slide's scroller is whatever that slide mounted, and
    // the pdf column, a long file and a workbook pane are three different
    // elements. Capture reaches all of them without the deck learning any of
    // their names.
    //
    // The track itself is excluded by hand. It is the one scroller here that
    // moves sideways, and paging between documents is not reading.
    if (o.immersive) {
      const hidden0 = new WeakMap();
      let hidden = false;
      // The deck's own two bands, plus anything a SLIDE has marked as chrome.
      //
      // `data-sd-chrome` is the hook, and it exists because the deck's bands
      // are not the only ones: a slide mounts a component with a header of its
      // own (the file viewer names the file and offers its buttons), and a
      // deck that stepped aside while that stayed put would leave one band
      // behind and call it full screen. Queried at toggle time rather than
      // cached, since slides mount and are released as the reader moves.
      // Inert outside an immersive deck, so a component can mark its chrome
      // unconditionally and let the host decide.
      const chromeNow = () => [header, footer, ...panel.querySelectorAll('[data-sd-chrome]')];
      const setHidden = (v) => {
        if (v === hidden) return;
        hidden = v;
        // `hidden` rather than a transform, and it is safe only because every
        // panel child names its grid row: a `display: none` child stops being
        // a grid item, which used to slide the survivors up a row and put the
        // track in an `auto` row sized to its content. With `row-start-*` on
        // each, a hidden row simply empties and the 1fr track grows into it.
        for (const el of chromeNow()) el.classList.toggle('hidden', v);
      };
      const onScroll = (e) => {
        const el = e.target;
        if (!(el instanceof Element) || el === deck.track || !panel.contains(el)) return;
        // Vertical scrollers only. A horizontal one is a deck, a carousel or a
        // wide table, and none of those is someone reading down a page.
        if (el.scrollHeight <= el.clientHeight + 4) return;
        const y = el.scrollTop;
        // A scroller with no baseline yet is at the top, because that is where
        // every one of them starts. Seeding `y` instead spends the first
        // scroll event of a freshly arrived document establishing a baseline
        // and deciding nothing, so the first flick down did nothing at all and
        // only the second worked. Seeding 0 makes that first event a real
        // measurement.
        const was = hidden0.get(el) ?? 0;
        hidden0.set(el, y);
        // The top of a document always shows the chrome: that is where you
        // arrive, and where the title is the thing you want.
        if (y < 4) return setHidden(false);
        const d = y - was;
        if (Math.abs(d) < 8) return;
        setHidden(d > 0);
      };
      panel.addEventListener('scroll', onScroll, true);
      // A TAP TOGGLES, which is what makes immersive reachable at all for the
      // documents that want it most. Scrolling is the other way in, and a
      // document short enough not to scroll has no other: a one-page Letter
      // PDF fitted to a 390px pane is 364x471 inside 646px of pane, so there
      // is nothing to scroll and nothing to trigger on. Three of the eight DRS
      // R1 submittals are one page. It was one-way (restore only) until
      // 2026-08-25, which left exactly those three unable to go full screen.
      //
      // `click`, NOT `pointerdown`, and this is the difference between working
      // on a phone and not. Every swipe begins with a pointerdown, so on a
      // touch screen the second swipe of a read restored the chrome the first
      // one had just put away, then hid it again as the finger moved: a flicker
      // on every gesture, and to the reader simply "it does not work". A
      // gesture that scrolls does not produce a click, so a click is a tap and
      // nothing else. Missed because a mouse wheel never touches the screen
      // and so never fires the pointerdown at all; reported from a phone.
      //
      // A CONTROL IS NOT THE DOCUMENT. Toggling on any tap would fire on the
      // pdf pager's own arrows and its page-jump list, which sit over the page
      // rather than in either band, so reaching for "next page" would also
      // take the chrome away. The chrome itself is excluded for the same
      // reason one level up. Everything left is the document, and tapping the
      // document is the gesture being offered.
      const CONTROL = 'a,button,summary,details,input,select,textarea,label,[role="button"]';
      panel.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (header.contains(t) || footer.contains(t)) return;
        if (t.closest(CONTROL)) return;
        setHidden(!hidden);
      }, true);
      // A new document is a new arrival, so it gets its title back. The
      // baselines are NOT cleared with it: they are keyed per scroller, a new
      // slide brings its own, and a slide the reader returns to should be
      // measured from where they left it rather than from the top.
      deck.onSlide(() => setHidden(false));
      // A slide built WHILE the chrome is away arrives with its own chrome
      // showing, because it was not in the DOM when the toggle ran. The deck
      // builds neighbours ahead of the reader, so this is the ordinary case
      // and not an edge: swiping to the next document mid-read would otherwise
      // flash a band that nothing asked for.
      const dressSlides = new MutationObserver(() => {
        if (!hidden) return;
        for (const el of panel.querySelectorAll('[data-sd-chrome]:not(.hidden)')) el.classList.add('hidden');
      });
      dressSlides.observe(deck.track, { childList: true, subtree: true });
      // `dockWatch` is the deck's release list rather than the dock's alone,
      // despite its name: cleanup() drains it on close.
      dockWatch.push(() => dressSlides.disconnect());
    }

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
    // A DROPDOWN, not a second takeover. It filled everything under the header
    // at first, which is what a list of 47 wants if you think of it as a
    // screen; it is not one. The reader is mid-document and glancing at where
    // else they could go, so covering the document to say so takes the thing
    // they are keeping their place in. A panel hung under the mark says the
    // same list, scrolls inside itself, and leaves the page it belongs to
    // visible behind it, which is also what makes tapping away an obvious way
    // out. Height is capped rather than fitted: 47 rows and 3 both want a panel
    // that ends before the footer.
    const sheet = h('div', { class: 'sd-index absolute z-20 w-80 max-w-[calc(100%-1rem)] '
      + 'max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain scrollbar-thin '
      + 'rounded-xl border border-base-300 bg-base-100 shadow-xl' });
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
        // THE ROW PRINTS ITS INDEX ONCE. With a label the number sits in the
        // gutter and the label is the row; with nothing to say the number IS
        // the row. The rule exists because the middle reading, a gutter number
        // beside a title falling back to the same number, is what a caller got
        // for asking to list a set it cannot name, and a row reading "4  4"
        // looks like a bug rather than like a page nobody has named.
        //
        // Naming nothing is a legitimate ask, which is the other half of this.
        // A list of bare numbers is still the difference between reaching page
        // 11 in ten swipes and reaching it in one tap, so a caller with no
        // labels should be able to offer the jump without inventing captions.
        const bare = !label.title && !label.subtitle && !label.icon;
        const row = h('button', {
          class: 'flex w-full items-start gap-2.5 border-b border-base-200 px-3 py-2.5 text-left transition-colors last:border-b-0 '
            + (here ? 'bg-primary/10' : 'hover:bg-base-200/60'),
          'aria-current': here ? 'true' : '',
        },
          bare ? null : h('span', { class: 'mt-0.5 w-6 shrink-0 text-right font-mono text-xs tabular-nums '
              + (here ? 'text-primary' : 'text-base-content/40') }, String(i + 1)),
          label.icon ? h('i', { class: `ph ${label.icon} mt-0.5 shrink-0 text-base text-base-content/40` }) : null,
          h('div', { class: 'min-w-0 flex-1' },
            h('div', { class: 'truncate text-sm ' + (here ? 'font-semibold text-primary' : '')
                + (bare ? ' font-mono tabular-nums' : '') },
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
    // Tapping the page behind a dropdown closes it, which is the affordance a
    // takeover did not have and did not need.
    const awayFromIndex = (e) => {
      if (!indexOpen || sheet.contains(e.target) || mark.contains(e.target)) return;
      closeIndex();
    };
    const openIndex = () => {
      if (indexOpen || !indexOf) return;
      indexOpen = true;
      const cur = buildIndex();
      panel.append(sheet);
      // Hung off the mark, measured on every open: the header is one line at
      // every width today, but a number written down here would be a second
      // copy of a padding class nobody would think to look at, and the mark
      // moves with the ✕ beside it.
      const box = overlay.getBoundingClientRect();
      const r = mark.getBoundingClientRect();
      sheet.style.top = (r.bottom - box.top + 6) + 'px';
      sheet.style.left = Math.max(8, r.left - box.left) + 'px';
      // Open ON the reader, not at the top. In a long set the row they are
      // standing on is the one row they are certain to want.
      try { sheet.children[cur]?.scrollIntoView({ block: 'center' }); } catch {}
      paintMark();
      history.pushState({ __sdIndex: 1 }, '', location.href);
      // Next frame, so the tap that opened this does not close it again.
      requestAnimationFrame(() => document.addEventListener('pointerdown', awayFromIndex, true));
    };
    const closeIndex = (pop = true) => {
      if (!indexOpen) return;
      indexOpen = false;
      document.removeEventListener('pointerdown', awayFromIndex, true);
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
      get title(){ return titleText.textContent; },
      setSubtitle: t => { subEl.textContent = t; },
      setTitle: t => { titleText.textContent = t; },
      // A mark that belongs to the NAME rather than to the header's controls.
      // One element or nothing; `empty:hidden` collapses the slot when a deck
      // has none, so a header that never sets one is unchanged.
      setTitleMark: el => { if (el) titleSlot.replaceChildren(el); else titleSlot.replaceChildren(); },
      setIcon: c => { restIcon = c || 'ph-cards'; paintMark(); },
      // Whether this deck is holding a history entry beyond its own, which is
      // what lets dismiss() unwind a stack it did not build.
      get extraEntries(){ return indexOpen ? 1 : 0; },
      // The header's other setters name one element each; this one names the
      // whole set, since what is on offer can change in kind and not only in
      // wording as the reader moves between slides.
      setActions: list => { actionWrap.replaceChildren(...buildActions(list)); },
      menu,
      // Same argument as setActions, one row down, and here it is not an
      // optimisation but the point: a deck paging mixed content has chrome that
      // belongs to the SLIDE rather than to the deck, so a workbook's sheet
      // tabs have to arrive on slide 4 and leave again on slide 5. Pass null
      // to empty the row, which `empty:hidden` then collapses.
      setSubheader: fillSub,
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

  // ── THE DOOR ────────────────────────────────────────────────────────────
  //
  // One glyph, estate-wide, for "open this collection in the deck". It began
  // as the button on show-repo's Branch detail (alpineComponents/branch-brief.js)
  // that enters the file deck, and it is generalized here on the reading that
  // what it means has nothing to do with files: it means THIS LIST HAS A
  // READER. A branch's changed files, a table's records, and whatever pages
  // next all want the same promise made the same way, because a reader who
  // learns the glyph once should not have to re-learn it per surface.
  //
  // It lives in swipe-deck rather than in a kit of its own because the kit
  // that owns the room owns the door: every consumer already loads this file,
  // so the affordance costs no new load line, and there is exactly one place
  // the classes and the wording can drift from.
  //
  // ENTRY IS NOT THE ONLY WAY IN, and that is deliberate. A surface is free to
  // add a gesture of its own on top (a row tap, a "read from here" on a card),
  // and branch-brief already does the second. What the entry guarantees is
  // that there is always a VISIBLE way in, since a gesture nobody is told
  // about is a feature only its author can find.
  //
  //   swipeDeck.entry({ count, noun, onOpen })  -> <button>
  //
  //   count    how many things are in the collection; omitted or 0 renders the
  //            wording without a number, for a caller that has not fetched yet
  //   noun     singular, 'file' / 'record' / 'chat'. Pluralized here.
  //   onOpen   the click handler
  //   tone     'primary' (default) or 'ghost', for a surface where the deck is
  //            not the main thing on offer
  //   size     'sm' (default) or 'md', to sit in a row of full-size icon
  //            buttons rather than in a strip of its own
  //   icon     override, for the rare collection with a glyph of its own
  //
  // TONE IS THE JUDGMENT, and it is the host's rather than the kit's. On
  // show-repo's Branch detail the deck is what most readers came to do, so it
  // is the one control on the row wearing a colour. In the shared viewer's
  // header the file is the subject and the deck is one lens among several, so
  // it goes ghost and sits with the copy and mode buttons. Same glyph, same
  // wording, same promise: only the emphasis moves, which is what keeps this a
  // parameter rather than two buttons that drift.
  //
  // The three pieces hang off the function as well, since a template-driven
  // host (branch-brief is Alpine, with its own x-show and busy spinner) has to
  // build its own element and should still not restate the class list or the
  // wording: `entry.icon`, `entry.cls(tone, size)`, `entry.title(count, noun)`.
  const ENTRY_ICON = 'ph-cards-three';
  // ONE SIZE, 32px, AND NO FILL, both decided on the branch page on 2026-09-07
  // and both applied here because a door that differs per host is not a door.
  //
  // The size carried `max-sm:h-11 max-sm:w-11`, a phone bump to the 44px both
  // platforms ask for. It went because it was not paying for itself where it
  // showed: on the branch page four controls at 44 made a 60px band around a
  // 20px heading, and the reader asked three times for that band back. 32px is
  // what this button has always been on a desktop, so dropping the bump makes
  // one size rather than an exception. The trade is real and is the reader's:
  // a smaller target on the surface they hold.
  //
  // The fill was `btn-soft btn-primary`. Primary now colours the GLYPH and not
  // a ground behind it, which keeps what the tone was for, since `tone` is the
  // host's statement that this deck is what most readers came to do. Ghost
  // still earns its colour on hover instead of at rest, so the two tones stay
  // distinguishable at a glance.
  const entryCls = (tone = 'primary', size = 'sm') =>
    'btn btn-square ' + (size === 'md' ? '' : 'btn-sm ')
    + (tone === 'ghost' ? 'btn-ghost hover:text-primary' : 'btn-ghost text-primary');
  const entryTitle = (count, noun = 'item') => {
    const plural = noun.endsWith('s') ? noun : noun + 's';
    return count ? `Read ${count.toLocaleString()} ${count === 1 ? noun : plural} one at a time`
                 : `Read ${plural} one at a time`;
  };
  const entry = (o = {}) => {
    const b = h('button', {
      type: 'button', class: entryCls(o.tone, o.size),
      title: entryTitle(o.count, o.noun),
      'aria-label': entryTitle(o.count, o.noun),
    }, h('i', { class: `ph ${o.icon || ENTRY_ICON} text-lg`
                 + (o.size === 'md' ? '' : ' max-sm:text-xl') }));
    if (o.onOpen) b.addEventListener('click', o.onOpen);
    return b;
  };
  entry.icon = ENTRY_ICON;
  entry.cls = entryCls;
  entry.title = entryTitle;

  // One level down from `parent`. See the drilling note at the top.
  function drill(parent, o = {}) {
    const crumb = [parent && parent.title, o.subtitle].filter(Boolean).join(' · ');
    return open({ ...o, back: true, subtitle: crumb });
  }

  window.swipeDeck = { core, open, drill, entry, h, stack: STACK,
                       top: () => STACK[STACK.length - 1] || null };
})();
