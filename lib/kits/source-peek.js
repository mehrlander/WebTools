// source-peek.js — the hover card behind an exact-file GitHub jump-over.
//
// show-repo is a wrapper over GitHub, and every view keeps a one-tap route to
// the GitHub presentation of what it shows. Those routes had grown four
// different meanings under one glyph, and the reader could not tell them apart:
// a REPO or BRANCH surface (or a menu of them), the MANIFEST behind a whole
// view, and an EXACT FILE. This module serves the last of those alone. A peek
// is what makes the fourth meaning self-evident: an icon that can show you the
// file is pointing at a file, and one that cannot is pointing at something
// broader.
//
// So the narrow convention: A GITHUB ICON THAT NAMES AN EXACT FILE CARRIES A
// PEEK; one that opens a repo, a branch, or a menu does not. Adding it is one
// attribute at the call site, which is what keeps it from becoming a control:
//
//   <a :href="blobUrl" :data-peek="'owner/repo@ref:path'" target="_blank">
//
// A delegated listener on document does the rest, so a row Alpine renders later
// needs no wiring, and nothing at the call site knows a card exists.
//
// WIDENED 2026-08-28: the subject is "a named text", of which a repo file is
// one case. The stage's flavors bar carries a peek on each pill, keyed by the
// pasted file's own name and fed through seed(), because the question there is
// the same one ("which of these do I want") and a second hover card in the same
// app would have been a second answer to it. Nothing here changed to allow it:
// a key that is not an address never reaches read()'s fetch, since the cache
// hit comes first, and frame() already falls back to showing the key as the
// path with an empty origin line, which is exactly the head a local file wants.
// The GitHub convention above still holds for GitHub icons.
//
// POINTER AND KEYBOARD, NOT TOUCH. The card opens on hover where the pointer
// can hover, and on focus, so a keyboard reader tabbing the row gets it. On a
// touch screen it never opens and the icon keeps its single meaning: a tap
// jumps to GitHub. That is deliberate rather than unfinished — a press-and-hold
// was tried and taken back out elsewhere in this shell (see the design notes on
// the repo menu), and an icon whose tap does one clear thing needs no gesture.
//
// FETCHES ONCE, AND ONLY WHEN ASKED. Nothing loads at render; the first peek of
// an address fetches it, and everything after reads the cache. A view that
// already holds the bytes (the Map's two manifests, the config dialog's
// .web-tools.json) hands them over with seed(), so the common case is a peek
// that never touches the network.
//
// Attaches to window.SourcePeek, loaded via gh.load('kits/source-peek.js').
// Depends on window.RepoAddress for the address grammar and window.GH for the
// read; the render half is pure and unit-tested (tools/test/source-peek.test.mjs).

(() => {
  // The excerpt, in source lines. Raised from 20 once the body scrolled rather
  // than clipped: past the fold the extra lines cost nothing but are there for
  // a reader who wants them.
  const LINES = 28;
  const OPEN_MS = 320;   // hover dwell before opening: crossing a row must not
  const CLOSE_MS = 140;  // grace on the way out, so a card can be entered
  // Above this, JSON is shown as written rather than reformatted: the whole
  // file has to be parsed and re-serialised to pretty-print it, and that is the
  // one step here that scales with file size. There is deliberately no cap on
  // PEEKING a large file. An earlier draft refused above 64 KB and the first
  // real hover proved it backwards: docs/show-repo.md is 86 KB, and a 20-line
  // excerpt is most useful precisely for a file too long to open casually. The
  // excerpt already bounds the card; the bytes are in hand either way.
  const BIG_JSON = 512 * 1024;

  // addr -> { text } | { err } | Promise, so a second hover over the same icon
  // joins the first fetch instead of starting another.
  const cache = new Map();

  // ── Pure: what a peek shows ─────────────────────────────────────────────
  // Three renditions, by extension, because the useful excerpt of a file is not
  // the same shape as the file. Markdown reads as prose, so it renders; JSON is
  // structure, so it is pretty-printed and its shape named; everything else is
  // code, and code's excerpt is its own text.
  function kindOf(path) {
    const ext = (String(path || '').match(/\.([A-Za-z0-9]+)$/) || ['', ''])[1].toLowerCase();
    if (ext === 'md' || ext === 'markdown') return 'markdown';
    if (ext === 'json') return 'json';
    return 'source';
  }

  // First `lines` lines, plus what was left behind. `total` counts the file, so
  // the footer can say how much is not on screen rather than only that some is.
  function excerpt(text, lines = LINES) {
    const all = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    while (all.length && all[all.length - 1] === '') all.pop();
    const shown = all.slice(0, lines);
    return { text: shown.join('\n'), shown: shown.length, total: all.length,
             truncated: all.length > shown.length };
  }

  // JSON's headline: what the top level IS. A peek at a manifest answers "how
  // many routes" before the reader has scrolled anything.
  function shape(text) {
    let v;
    try { v = JSON.parse(text); } catch { return 'not valid JSON'; }
    if (Array.isArray(v)) return 'array · ' + v.length + (v.length === 1 ? ' item' : ' items');
    if (v && typeof v === 'object') {
      const k = Object.keys(v);
      return 'object · ' + k.length + (k.length === 1 ? ' key' : ' keys');
    }
    return typeof v;
  }

  // Pretty-print when it parses, so a minified manifest is still legible; leave
  // it alone when it does not, since the reader is then looking at the syntax.
  function jsonText(text) {
    const s = String(text == null ? '' : text);
    if (s.length > BIG_JSON) return s;
    try { return JSON.stringify(JSON.parse(s), null, 2); }
    catch { return s; }
  }

  // YAML frontmatter, fenced rather than dropped. Skills and tracker tasks in
  // this estate lead with it, and marked renders a bare `---` block as a run of
  // prose, so the peek opened on "name: … description: …" as though it were the
  // document. Fencing keeps the metadata (it is often the most useful line in a
  // task file) while making it read as metadata.
  function fenceFrontmatter(text) {
    return String(text == null ? '' : text)
      .replace(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/, (m, y) => '```\n' + y + '\n```\n');
  }

  // The card's body, as a decision rather than as markup: which rendition, what
  // excerpt, what the footer says. Returned as data so a test can assert it
  // without a DOM.
  function body(path, text, as) {
    const kind = as || kindOf(path);
    const src = kind === 'json' ? jsonText(text)
              : kind === 'markdown' ? fenceFrontmatter(text)
              : String(text == null ? '' : text);
    const ex = excerpt(src);
    const notes = [];
    if (kind === 'json') notes.push(shape(text));
    if (ex.truncated) notes.push('first ' + ex.shown + ' of ' + ex.total + ' lines');
    else notes.push(ex.total + (ex.total === 1 ? ' line' : ' lines'));
    return { kind, text: ex.text, note: notes.join(' · '), truncated: ex.truncated };
  }

  // Escaping is window.esc from vanilla-bundle.js, first in the boot chain.
  const esc = s => window.esc(s);

  // ── The read ────────────────────────────────────────────────────────────
  // `kind` overrides the rendition the extension would pick, for a seeder that
  // made the bytes and so knows something the name cannot say. The stage's
  // conversions are the case: a markdown file it CONVERTED opens raw, because a
  // conversion is a payload to copy rather than a document to read, and a card
  // rendering what the reader is about to see as source would preview a
  // different thing. Omitted, the extension decides as it always has.
  function seed(addr, text, kind) {
    if (addr && typeof text === 'string') cache.set(addr, kind ? { text, kind } : { text });
    return text;
  }
  function cached(addr) {
    const hit = cache.get(addr);
    return hit && typeof hit.text === 'string' ? hit.text : null;
  }
  // Build the address a call site puts in data-peek. ref '' is legitimate (the
  // contents API falls through to the default branch), so it is simply omitted.
  function addrOf(repo, ref, path) {
    if (!repo || !path) return '';
    return repo + (ref ? '@' + ref : '') + ':' + path;
  }

  async function read(addr) {
    const hit = cache.get(addr);
    if (hit) return hit instanceof Promise ? hit : hit;
    const parsed = window.RepoAddress?.parse(addr);
    if (!parsed) return { err: 'not an address: ' + addr };
    const p = (async () => {
      try {
        const gh = new window.GH({ token: window.TOKEN, repo: parsed.repo, ref: parsed.ref });
        const res = await gh.get(parsed.path);
        if (typeof res.text !== 'string') throw new Error('no text (binary?)');
        return { text: res.text };
      } catch (e) {
        return { err: (e && e.message) || String(e) };
      }
    })().then(out => { cache.set(addr, out); return out; });
    cache.set(addr, p);
    return p;
  }

  // marked, lazily and once, only when a markdown peek is actually opened. The
  // same URL chat-render.js uses, so the two share one cached asset.
  let markedP = null;
  const needMarked = () => markedP ||= window.marked ? Promise.resolve() : new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js';
    s.onload = res; s.onerror = () => rej(new Error('marked failed to load'));
    document.head.appendChild(s);
  });

  // ── The card ────────────────────────────────────────────────────────────
  let card = null, target = null, openTimer = 0, closeTimer = 0, token = 0;

  // Tailwind/daisyUI utilities rather than a stylesheet of its own: the browser
  // build scans the live DOM, so classes arriving from a JS string are generated
  // the same way every component's template classes are, and the card inherits
  // the host page's theme instead of restating its colours.
  // 30rem, not the 20rem it started at. A first pass at 320 px looked cramped
  // for a measurable reason rather than a matter of taste: source lines wrapped
  // constantly, so one line of HTML spent three rows and the excerpt bought
  // about eight real lines out of twenty. Width is the cheapest fix, and a peek
  // is transient, so it can afford more of the viewport than a panel could.
  // ABOVE THE DECK, and that is what the number is for. The estate's ladder runs
  // deck overlay 70, FAB and md-doc's section menu 80, so a card at 70 lost to
  // an open deck on DOM order alone: swipe-deck appends its overlay when it
  // opens, this card is appended at install. Docked, the list the reader is
  // hovering stays on screen beside the deck, so the losing case is the ordinary
  // one. A peek is transient and is always the most recent thing the reader
  // asked for, which is the rule the number encodes rather than a preference.
  const CARD_CLS = 'fixed z-[85] w-[30rem] max-w-[92vw] rounded-lg border border-base-300 ' +
                   'bg-base-100 text-base-content shadow-lg overflow-hidden';
  // The head stacks rather than sharing a line: at this width a repo@ref beside
  // the path ate enough of it to truncate the filename, which is the one thing
  // the head exists to say.
  const HEAD_CLS = 'px-3 py-1.5 bg-base-200/60 border-b border-base-300 font-mono text-xs';
  // Inline after the filename rather than pinned to the card's right edge: the
  // mark belongs to the name it follows, which is where the Docs and Portable
  // rows put theirs. The path truncates before the mark does, since a flex item
  // with overflow:hidden takes min-width:0 and the mark does not shrink.
  const HEAD_LINK_CLS = 'shrink-0 text-base-content/40 hover:text-primary';
  // Code does NOT wrap. A wrapped line makes the footer's count a lie by a
  // factor of three, and a peek's whole claim is that you are seeing the head of
  // the file. Clipped-at-the-edge reads as code; re-flowed does not. Prose is
  // the opposite case and keeps wrapping, since that is what prose is.
  // Both scroll rather than clip: the card is already enterable, so the reader
  // who wants line 25 can reach it instead of meeting a silent cut. The old
  // max-h-64 cut the body at ~14 lines while the footer said 20.
  const BODY_CODE = 'm-0 px-3 py-2 font-mono text-xs leading-snug max-h-[24rem] ' +
                    'overflow-auto scrollbar-thin whitespace-pre';
  // TWO ELEMENTS FOR MARKDOWN, NOT ONE, AND THE REASON IS THE SCROLLBAR. This
  // was one element carrying `max-w-none`, which never took, so the rendition
  // sat at the typography plugin's 65ch measure: 462.6px inside the 480px card.
  // That element was also the scroll container, so its scrollbar sat AT THE END
  // OF THE TEXT rather than at the card's edge, leaving a 17px strip of card to
  // the right of the bar. It reads as a layout bug and was reported as one.
  //
  // Tailwind v4 emits utilities into `@layer utilities`, and the typography
  // plugin's stylesheet is UNLAYERED, so `.prose{max-width:65ch}` beat
  // `.max-w-none` on the cascade-layer rule rather than on specificity or
  // order: an unlayered declaration wins against any layered one. Nothing in
  // the class list looked wrong, which is why it survived. Identical to the
  // finding in alpineComponents/viewer.js, which fixed it there in 2026-08 and
  // did not reach the kit; the app's own prose surfaces all carry the `!`.
  //
  // The viewer keeps the plugin's measure and centres it, because its pane is
  // 1118px wide and 65ch is a real service there. A 30rem card is already
  // NARROWER than the measure, so here the card's own width IS the measure and
  // the column fills it. the house style's "don't narrow text to a reading column"
  // is the same rule read from the other end.
  const BODY_SCROLL = 'max-h-[24rem] overflow-auto scrollbar-thin';
  // overflow-auto, not just -y: a rendered fenced block inside markdown keeps
  // its own long lines, and hiding the x axis clipped them with no way back.
  // !text overrides prose-sm's own base size; typography sizes descendants in
  // em, so the whole rendition scales down with it. The card is a glance (the
  // tap carries the full read), so its content runs smaller than a document's.
  const BODY_MD = 'px-3 py-2 prose prose-sm !text-[0.8rem] leading-snug !max-w-none';
  const BODY_NOTE = 'px-3 py-2 text-sm italic';
  const CARD_ID = 'wt-source-peek';

  function ensureCard() {
    if (card) return card;
    card = document.createElement('div');
    card.id = CARD_ID;
    card.className = CARD_CLS;
    card.setAttribute('role', 'tooltip');
    card.style.display = 'none';
    // Entering the card keeps it open, so a reader can move onto it to read
    // more without it dissolving under the pointer.
    card.addEventListener('pointerenter', () => clearTimeout(closeTimer));
    card.addEventListener('pointerleave', () => hide(CLOSE_MS));
    document.body.appendChild(card);
    return card;
  }

  // Paint, measure, place, and only then reveal. Two things go wrong when a card
  // is shown before it is placed, and both were measured here rather than
  // guessed at:
  //   The card is measured before this page's Tailwind (the browser build,
  //   which generates a class only after seeing it in the DOM) has generated its
  //   width and height caps, so the first measurement reports an unconstrained
  //   block — 615 px against the 312 px it settles at — reads as too tall to fit
  //   below the trigger, and flips above it, where it stays once the real styles
  //   land. Hence the second pass on the next frame.
  //   And a fixed element with no top/left yet sits wherever the flow put it,
  //   which on a first peek was under the cursor: the pointer entered the card,
  //   the card then moved away under it, and the resulting pointerleave dismissed
  //   the peek a frame after it appeared. Hidden-while-placing is what stops the
  //   card from ever being a pointer target in a position it is about to leave.
  function paint(el, html) {
    card.style.visibility = 'hidden';
    card.innerHTML = html;
    card.style.display = '';
    place(el);
    requestAnimationFrame(() => {
      if (target !== el) return;
      place(el);
      card.style.visibility = '';
    });
  }

  function place(el) {
    const r = el.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const pad = 6;
    // Below the icon when it fits, above when it does not; clamped into the
    // viewport horizontally so a card on a right-edge icon stays readable.
    const below = r.bottom + pad + c.height <= innerHeight;
    const top = below ? r.bottom + pad : Math.max(pad, r.top - pad - c.height);
    // Left edge aligned to the trigger's, not centred on it. A 30rem card
    // centred on a 16 px glyph starts a screenful to its left and reads as
    // belonging to whatever it happens to cover; aligned, it hangs off the icon
    // that opened it.
    let left = r.left;
    left = Math.min(Math.max(pad, left), Math.max(pad, innerWidth - c.width - pad));
    card.style.top = Math.round(top) + 'px';
    card.style.left = Math.round(left) + 'px';
  }

  // The blob URL for a parsed address. Built here rather than through
  // kits/github-links.js, which owns the richer set of repo destinations: this
  // kit is standing equipment (gh-boot.js's BOOT list) and that one is a lazy
  // load, so depending on it would leave the card's mark missing on exactly the
  // pages that never opened a repo menu. Segment-wise encoding, so a
  // `claude/foo` ref keeps its slash. An address with no ref resolves to HEAD,
  // GitHub's own name for the default branch, which is the same fall-through
  // the contents API gives read(): the card and its link read one commit.
  const encSeg = s => String(s || '').split('/').map(encodeURIComponent).join('/');
  function blobUrl(parsed) {
    if (!parsed || !parsed.repo || !parsed.path) return '';
    return 'https://github.com/' + parsed.repo + '/blob/' +
           (parsed.ref ? encSeg(parsed.ref) : 'HEAD') + '/' + encSeg(parsed.path);
  }

  // The card's head names the file and where it lives, so a peek is legible on
  // its own: the reader can tell a hub doc from a same-named file in another
  // repo without following the link.
  //
  // AND IT CARRIES THE DOOR, since the card is enterable and the pointer that
  // entered it has left the 16 px trigger behind. Reading the excerpt and then
  // deciding to open the file meant travelling back to the glyph; the mark in
  // the head is where the pointer already is. It is the same destination the
  // trigger has, derived from the address the head is displaying rather than
  // read off the trigger's href, so the card cannot name one commit and open
  // another. A key that is not an address (the stage's pasted flavors, seeded
  // by name) names no repo and gets no mark rather than a guessed one.
  function frame(addr, inner) {
    const parsed = window.RepoAddress?.parse(addr) || { repo: '', ref: '', path: addr };
    const url = blobUrl(parsed);
    const link = url
      ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="' + HEAD_LINK_CLS +
        '" title="Open ' + esc(parsed.path) + ' on GitHub"><i class="ph ph-github-logo"></i></a>'
      : '';
    return '<div class="' + HEAD_CLS + '">' +
             '<div class="flex items-center gap-2">' +
               '<div class="truncate font-medium">' + esc(parsed.path) + '</div>' + link +
             '</div>' +
             '<div class="truncate text-base-content/40">' +
               esc(parsed.repo + (parsed.ref ? '@' + parsed.ref : '')) + '</div>' +
           '</div>' + inner;
  }

  async function show(el) {
    const addr = el.getAttribute('data-peek');
    if (!addr) return;
    const mine = ++token;
    ensureCard();
    target = el;
    el.setAttribute('aria-describedby', CARD_ID);
    // A cached address renders in one pass; only a cold one shows this.
    if (!cached(addr))
      paint(el, frame(addr, '<div class="' + BODY_NOTE + ' text-base-content/50">Loading…</div>'));
    const out = await read(addr);
    if (mine !== token) return;
    if (out.err) {
      paint(el, frame(addr, '<div class="' + BODY_NOTE + ' text-error">' + esc(out.err) + '</div>'));
      return;
    }
    const b = body(window.RepoAddress?.parse(addr)?.path || addr, out.text, out.kind);
    let html;
    if (b.kind === 'markdown') {
      try {
        await needMarked();
        if (mine !== token) return;
        html = '<div class="' + BODY_SCROLL + '"><div class="' + BODY_MD + '">'
             + window.marked.parse(b.text) + '</div></div>';
      } catch {
        html = '<pre class="' + BODY_CODE + '">' + esc(b.text) + '</pre>';
      }
    } else {
      html = '<pre class="' + BODY_CODE + '">' + esc(b.text) + '</pre>';
    }
    // No footer. The card used to close with the note ("first 28 of 79
    // lines"), and the measuring line read as chrome nobody asked for
    // (dropped 2026-08-07): a truncated excerpt visibly ends mid-document,
    // and the full read is one tap away. body() still returns the note for
    // callers and tests; the card just does not paint it.
    paint(el, frame(addr, html));
  }

  function hide(delay = 0) {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    token++;
    const go = () => {
      if (card) card.style.display = 'none';
      target?.removeAttribute('aria-describedby');
      target = null;
    };
    if (delay) closeTimer = setTimeout(go, delay);
    else go();
  }

  // Hover only where hovering is a real gesture. A coarse pointer reports no
  // hover, so the card never opens there and the icon stays a single tap.
  const canHover = () => {
    try { return matchMedia('(hover:hover) and (pointer:fine)').matches; }
    catch { return false; }
  };

  const peekEl = e => e.target?.closest?.('[data-peek]') || null;

  function install() {
    if (install.done) return;
    install.done = true;
    ensureCard();
    document.addEventListener('pointerover', e => {
      const el = peekEl(e);
      if (!el || el === target || !canHover()) return;
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
      openTimer = setTimeout(() => show(el), OPEN_MS);
    });
    document.addEventListener('pointerout', e => {
      const el = peekEl(e);
      if (!el) return;
      if (e.relatedTarget && card?.contains(e.relatedTarget)) return;
      hide(CLOSE_MS);
    });
    // The keyboard path: tabbing to the icon opens it at once, since a keyboard
    // reader has no way to dwell.
    //
    // Focus landing INSIDE the card is not a reader leaving the trigger, and
    // this is what makes the head's mark clickable at all: a pointerdown on an
    // anchor focuses it before the click resolves, so the unguarded branch hid
    // the card out from under the pointer and no click ever fired.
    document.addEventListener('focusin', e => {
      const el = peekEl(e);
      if (el) show(el);
      else if (target && !card?.contains(e.target)) hide();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && target) hide(); });
    // A card positioned from a rect goes wrong the moment anything moves, with
    // one exception: scrolling INSIDE the card is the reader using it, and
    // dismissing on that would make the scrollable body unreachable.
    addEventListener('scroll', e => {
      if (!target) return;
      if (e.target instanceof Node && card?.contains(e.target)) return;
      hide();
    }, true);
    addEventListener('resize', () => { if (target) hide(); });
  }

  window.SourcePeek = {
    install, seed, cached, addr: addrOf, read,
    // pure, exported for the tests and for anything that wants the rendition
    // decision without the card
    kindOf, excerpt, shape, jsonText, fenceFrontmatter, body, blobUrl, frame, LINES,
    _cache: cache,
  };

  // No self-install: the boot manifest in gh-boot.js calls install() right
  // after this load, so where the listeners land is the boot chain's call,
  // not this kit's. A page loading this file outside the boot chain calls
  // SourcePeek.install() itself.
})();
