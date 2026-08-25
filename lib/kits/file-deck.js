// kits/file-deck.js — a changeset's files, read one at a time.
//
// The Files pane is a LIST, and a list is for scanning: thirty hairline rows,
// each one a `fileReview` card that expands in place. Reading a diff through it
// means expanding a row, scrolling past it, collapsing, expanding the next. That
// is a good way to find a file and a poor way to read one.
//
// This is the other half: the same cards, one per slide, in the house swipe deck
// (kits/swipe-deck.js). It opens as a DRILL, one level below whatever deck or
// takeover the reader was already in, so the header becomes the file's and
// leaving it returns them to the branch. One deck visible, one meaning for the
// swipe, and the nesting only in the return path. The reasoning for that shape
// over a nested pager or a level picker is in swipe-deck's drilling note.
//
//   fileDeck.open({ repo, ref, base, baseName, files, start, title, subtitle,
//                   parent, onClose }) -> the deck handle
//
//   files      [{ path, previousPath, status, additions, deletions, patch }],
//              the shape kits/branch-brief.js already assembles and the shape
//              the compare API hands back. Pass the list the reader can SEE:
//              a collapsed registry group is a group they chose not to open, so
//              its files do not belong in the deck either. That makes the pane's
//              group toggles the deck's filter, with no second control.
//   start      index to open on, so "read from here" lands on the right file
//   parent     the deck handle to drill from, when there is one. drill() takes
//              the crumb from its title and turns the dismiss button into a
//              back chevron.
//   The deck also LISTS itself, through swipe-deck's `index` labeler: the header
//   mark opens every file in the changeset, current one marked. A changeset is
//   exactly the case that wants it, since the footer draws dots only while they
//   stay countable and a thirty-file branch is well past that. What a row says
//   is the file and what happened to it, which is the pane's own reading of the
//   compare rather than a second one.
//
//   announce   default true: say what the reader is on through the subject
//              channel the FAB listens to (see the note above open()). Pass
//              false for a deck that should not retarget the sidebar.
//   back       force the chevron without a parent DECK. The branch takeover is
//              the case: it is chrome of its own rather than a swipe-deck, so
//              there is no handle to drill from, but dismissing still returns
//              the reader one level up and the glyph has to say so. An ✕ there
//              would promise to close something it does not close.
//
// Three slides mount at a time (swipe-deck renders the active one and its
// neighbours), which is why every card here can start OPEN. The Files pane
// cannot: it has to hedge with `open: files.length <= 12 && innerWidth >= 768`,
// because twelve open cards is twelve fetches at once and most of a phone
// screen. A deck is one file at a time by construction, so the hedge does not
// apply and the reader gets the content without a tap.
//
// Open on WHAT is the other half, and it is why the cards here are passed
// `read` and `bare`. This is a reading surface, so a file opens as itself: a
// doc rendered, an image shown, a `.gz` inflated, a source file diffed. And the
// deck header already names the file, so the card drops its own collapsed row
// rather than printing the path a second time, elided a second way.
//
// Requires kits/swipe-deck.js, kits/subject-channel.js and the fileReview
// Alpine component. All three ride in the pre-build, so a page that has the
// bundle has them; a page on a gh.load chain names them itself.
(() => {
  const need = () => {
    if (!window.swipeDeck) throw new Error('file-deck: load kits/swipe-deck.js first');
    if (!window.subjectChannel) throw new Error('file-deck: load kits/subject-channel.js first');
    if (!window.Alpine) throw new Error('file-deck: Alpine is not running');
    return window.swipeDeck;
  };

  // The path, split the way the collapsed row splits it: the directory is
  // context and the filename is the answer. In the header the filename is the
  // title and the directory rides the subtitle, so a `claude/`-length path does
  // not truncate the one word the reader is looking for.
  const split = (p) => {
    const i = String(p || '').lastIndexOf('/');
    return i < 0 ? { dir: '', name: p || '' } : { dir: p.slice(0, i + 1), name: p.slice(i + 1) };
  };

  // A directory, shortened from the MIDDLE so both ends survive.
  //
  // The crumb is where the reader learns which branch and which corner of it
  // they are in, and a deep path defeated it: `sources/wayback/…` truncated at
  // the right by CSS, which keeps the segment nearest the repo root and throws
  // away the one nearest the file, exactly backwards. The two segments worth
  // keeping are the FIRST, which says which part of the tree, and the LAST,
  // which is the file's own folder. Everything between them is the part a
  // reader can infer, so it becomes one ellipsis.
  //
  //   sources/wayback/url-corpora/corpora/drs.wa.gov/  ->  sources/…/drs.wa.gov
  //   lib/kits/                                        ->  lib/kits
  const crumbDir = (dir, keep = 2) => {
    const segs = String(dir || '').split('/').filter(Boolean);
    if (segs.length <= keep + 1) return segs.join('/');
    return segs[0] + '/…/' + segs.slice(-(keep - 1)).join('/');
  };

  // The same trick on one string, and then on the whole crumb.
  //
  // Eliding the directory was not enough on a phone: the crumb is
  // `<branch> · <dir>`, every branch here is a `claude/<slug>` whose slug runs
  // to twenty-five characters, and the header's own CSS truncation then cut
  // the RIGHT end, which is the dir. So the reader lost the specific half to
  // keep the general one, which is the wrong half to lose twice over.
  //
  // Budget the crumb instead and spend it from the LEFT. The last part is the
  // file's own folder and survives whole; the branch gives way first, because
  // by then the reader has swiped into it and needs a reminder rather than a
  // full statement of it.
  const mid = (s, n) => String(s).length <= n ? String(s)
    : String(s).slice(0, Math.ceil((n - 1) / 2)) + '…' + String(s).slice(-Math.floor((n - 1) / 2));

  // The budget is the VIEWPORT's, not a constant: 34 characters is what the
  // subtitle box holds at 390px beside the icon, the chevron and the counter
  // pill, so a wider phone gets a longer crumb and a narrower one a shorter.
  // Found by measuring in the browser, comparing the element's scrollWidth to
  // its clientWidth at 320, 390 and 430. Two things the divisor cannot fix and
  // does not pretend to: the chrome beside the crumb is a fixed width, so the
  // relationship is not really linear, and a floor of ten characters on the
  // branch means a very deep path can still exceed the budget. Below about
  // 360px both bite and CSS truncation takes over, which is the same graceful
  // fallback as before rather than a regression.
  const SEP = ' · ';
  const budgetFor = () => Math.max(20,
    Math.round((typeof window !== 'undefined' ? window.innerWidth || 390 : 390) / 11.5));
  const fitCrumb = (parts, budget) => {
    if (budget == null) budget = budgetFor();
    const p = parts.filter(Boolean).map(String);
    if (!p.length) return '';
    const whole = p.join(SEP);
    if (whole.length <= budget || p.length === 1) return whole;
    const tail = p[p.length - 1];
    const heads = p.slice(0, -1);
    const room = budget - tail.length - SEP.length * heads.length;
    const each = Math.max(10, Math.floor(room / heads.length));
    return [...heads.map(h => mid(h, each)), tail].join(SEP);
  };

  // What happened to a file, as a glyph and as words. `modified` gets no icon
  // of its own on purpose: it is the ordinary case and the majority of any
  // changeset, so marking it would spend the column on the rows that need it
  // least and leave the three that matter harder to pick out.
  const MARK = {
    added:    { icon: 'ph-file-plus',   word: 'new' },
    removed:  { icon: 'ph-file-minus',  word: 'deleted' },
    renamed:  { icon: 'ph-file-dashed', word: 'renamed' },
    modified: { icon: '',               word: '' },
  };

  // ── Announcing the subject ──────────────────────────────────────────────
  //
  // The FAB sidebar follows the reader from file to file, learning what is on
  // screen from the subject channel (kits/subject-channel.js): a repo, a ref
  // and a path, plus `route` for "a file an app is showing rather than the
  // renderer". That kit owns which windows are listening, saving and putting
  // back what it overwrites, and bridging the sidebar's answer back down into
  // a framed document. The deck's part is only to say which file, per slide.
  //
  // `via` is left off deliberately: the fab already knows what page it is
  // mounted on (shellRepo/shellPath/shellRef, taken before any adoption) and
  // fills it in, so the deck never has to work out what app it is inside.

  function open(o = {}) {
    const deckKit = need();
    const files = Array.isArray(o.files) ? o.files : [];
    if (!files.length) return null;
    const start = Math.max(0, Math.min(files.length - 1, o.start || 0));

    // The deck's cards read `__compareRef`, so it takes the bridge; the
    // navigate handle below is the deck's own and rides as a managed global.
    const chan = o.announce === false ? null
      : window.subjectChannel.open({ bridge: true, keep: ['__deckNavigate'] });

    // One card per slide, mounted the way the Files pane mounts them, with one
    // difference that is not cosmetic: `open: true`. See the note above.
    //
    // The options object is built HERE, in a closure, and not read off an
    // Alpine component. That is the same trap cardOpts documents in
    // alpineComponents/branch-brief.js: inside an x-data expression Alpine
    // injects every registered component name into scope, so `repo` resolves to
    // the repo DATA PROVIDER rather than to a string, and every content fetch
    // then addresses a stringified function. Here there is no x-data expression
    // to be caught by, because the mount is imperative and the options are
    // passed by reference through a global handoff.
    // Which global each built slide is holding, so `release` can let it go when
    // the deck evicts a slide the reader has left. Emptying the slide destroys
    // the card, but the options object carries the file's whole patch and would
    // sit on `window` for the life of the page.
    const keys = [];
    // The ref the slides are being read AT, which starts as the branch's and
    // moves when the sidebar's ref bar picks another (see navigate below).
    // Everything the compare told us is a fact about the branch, so the moment
    // it moves the patch, the status and the line counts stop being said.
    let ref = o.ref || '';
    const moved = () => ref !== (o.ref || '');
    const render = (i, slide) => {
      const f = files[i];
      if (!f) return;
      const el = document.createElement('div');
      // Alpine evaluates x-data as an expression in the component's scope, so
      // the options travel through a keyed global rather than being serialized
      // into the attribute: a path with a quote in it would otherwise break the
      // expression, and a patch certainly would.
      const key = keys[i] = '__fileDeck_' + (SEQ++);
      const off = moved();
      window[key] = {
        repo: o.repo || '', ref, base: o.base || '',
        baseName: o.baseName || o.base || '',
        path: f.path, prevPath: off ? '' : (f.previousPath || ''),
        status: off ? '' : f.status,
        additions: off ? null : f.additions, deletions: off ? null : f.deletions,
        patch: off ? '' : (f.patch || ''),
        open: true,
        // This is a READING surface, and the deck header already names the
        // file. So the card drops its own collapsed row (which would repeat
        // the path a second time, truncated a second way) and opens on the
        // file's own presentation rather than on a diff: a doc reads, an
        // image shows, an archive shows what is inside it. The diff is one
        // tab away for anyone who wants it.
        read: true, bare: true,
      };
      el.setAttribute('x-data', `fileReview(window.${key})`);
      slide.append(el);
      window.Alpine.initTree(el);
    };

    // The crumb's own context, minus whatever the parent already says. A host
    // that names the branch and drills from a deck TITLED the branch would
    // otherwise read "claude/some-branch · claude/some-branch · lib/kits/",
    // and asking every caller to know what its parent is called is a worse
    // rule than deduping here.
    const context = (o.subtitle && o.subtitle !== o.parent?.title) ? o.subtitle : '';

    const at = (i) => {
      const f = files[i] || {};
      const { dir, name } = split(f.path);
      return { name: name || f.path || '', dir: crumbDir(dir) };
    };

    const opts = {
      count: files.length,
      render,
      start,
      icon: 'ph-git-diff',
      title: at(start).name,
      // The breadcrumb: whatever the caller names as context, plus this file's
      // own directory. drill() prefixes the parent deck's title onto it.
      subtitle: [context, at(start).dir].filter(Boolean).join(' · '),
      // The contents, which is the pane's list read back at deck scale. Off the
      // branch's own ref the status and the counts stop being true (see the
      // note by `moved`), so a row falls back to naming the folder, exactly as
      // the crumb does.
      index: (i) => {
        const f = files[i] || {};
        const { dir, name } = split(f.path);
        if (moved()) return { title: name || f.path || '', subtitle: crumbDir(dir) };
        const m = MARK[f.status] || MARK.modified;
        const counts = [
          f.additions ? '+' + f.additions : '',
          f.deletions ? '\u2212' + f.deletions : '',
        ].filter(Boolean).join(' ');
        return {
          icon: m.icon,
          title: name || f.path || '',
          subtitle: [crumbDir(dir), m.word, counts].filter(Boolean).join(' · '),
        };
      },
      // A slide is one file's dossier and can be long; let it scroll on its own
      // and keep the deck's own max-width, which the cards were designed for.
      innerClass: 'w-full min-w-0 mx-auto max-w-3xl',
      // One header action, and it is a door rather than a duplicate. The
      // sidebar already holds every version control this file could want (the
      // ref bar, the path picker, the github menu), and building a second
      // branch dropdown into this header would be the third copy of FAB turf
      // in the app. What the header owes is DISCOVERABILITY: on a phone the
      // deck is the whole screen and the launcher sits on top of it, but on a
      // desktop the deck is a centred panel and the fab reads as belonging to
      // the page behind it, so nothing says the two are connected.
      actions: (o.announce === false ? [] : [{
        icon: 'ph-sidebar-simple', title: 'Open the sidebar for this file',
        onClick: () => chan.openDrawer(),
      }]).concat(o.actions || []),
      release: (i) => { if (keys[i]) { delete window[keys[i]]; keys[i] = null; } },
      onClose: () => { if (chan) chan.release(); if (o.onClose) o.onClose(); },
    };

    const handle = o.parent ? deckKit.drill(o.parent, opts)
                            : deckKit.open({ ...opts, back: !!o.back });

    // The crumb's head is normally the parent deck's title, which names the
    // branch. Once the reader has moved the deck off that branch the parent's
    // title is no longer what they are reading, so the ref they ARE reading
    // takes the slot: the crumb's whole job is to say where you are.
    const crumbAt = (i) => fitCrumb(moved()
      // The caller's context gives way too where it was naming the ref, since
      // the crumb would otherwise carry both refs and say neither is the one.
      ? [ref, context === (o.ref || '') ? '' : context, at(i).dir]
      : [o.parent ? o.parent.title : null, context, at(i).dir]);

    // The base rides along with the file. It is what makes the sidebar's
    // compare bar appear: the deck is not asking for a comparison, it is
    // saying that one is already in force and handing over the choice.
    const say = (i) => {
      const f = files[i];
      if (!f || !chan) return;
      chan.announce({ repo: o.repo || '', ref, path: f.path, route: 'deck',
                      base: o.base || '', baseName: o.baseName || o.base || '' });
    };

    // ── Re-address, rather than be navigated away from ──────────────────────
    //
    // The sidebar's ref bar renders a file at another ref by going TO the
    // renderer: outside a toss it navigates to toss-render, inside one it
    // re-addresses through `__tossNavigate`. Neither is right over a deck. The
    // reader is thirty files into a changeset, and answering "show me this at
    // main" by leaving for a single-file renderer throws away the list, the
    // position in it, and the way back.
    //
    // A deck can do better because it already owns the slide: change the ref,
    // rebuild the two or three slides that are mounted, and the reader is
    // still exactly where they were. So the deck publishes a handle and the
    // fab tries it before it navigates, the same shape as `__tossNavigate` and
    // for the same reason. Borrowed and returned with the subject, since a
    // deck inside a toss must not leave the shell's own handle overwritten.
    //
    // It answers false rather than swallowing what it cannot do: a file that
    // is not in this changeset, or another repo entirely, is a real navigation
    // and the fab should make it.
    const navigate = (spec) => {
      if (!spec || (spec.repo && o.repo && spec.repo !== o.repo)) return false;
      let i = handle.deck.active();
      if (spec.path && spec.path !== files[i]?.path) {
        const j = files.findIndex(f => f.path === spec.path);
        if (j < 0) return false;                 // not in this changeset
        i = j;
      }
      const next = spec.ref || ref;
      if (next !== ref) {
        ref = next;
        // Every mounted slide is holding the old ref, and eviction is what
        // hands a card's own references back, so drop before building rather
        // than building over the top of a live tree.
        for (let k = 0; k < files.length; k++) handle.deck.drop(k);
        for (let k = i - 1; k <= i + 1; k++) handle.deck.build(k);
        handle.setSubtitle(crumbAt(i));
      }
      if (i !== handle.deck.active()) handle.deck.go(i);
      else say(i);                               // no scroll, so no onSlide
      return true;
    };
    if (chan) chan.set('__deckNavigate', navigate);

    // The header follows the reader. This is the whole reason the deck knows
    // about files at all rather than being handed inert slides: the title has
    // to name the file you are looking at, not the one you opened on.
    handle.deck.onSlide((i) => {
      handle.setTitle(at(i).name);
      handle.setSubtitle(crumbAt(i));
      say(i);
    });
    // And once now, because drill() built the opening crumb by its own generic
    // rule (parent title, then whatever the child named) and that rule has no
    // budget. onSlide does not fire on open, so without this the first slide
    // is the one slide wearing the unfitted crumb.
    handle.setSubtitle(crumbAt(start));
    say(start);
    return handle;
  }

  let SEQ = 0;

  window.fileDeck = { open, split, crumbDir, fitCrumb };
})();
