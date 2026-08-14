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
//   back       force the chevron without a parent DECK. The branch takeover is
//              the case: it is chrome of its own rather than a swipe-deck, so
//              there is no handle to drill from, but dismissing still returns
//              the reader one level up and the glyph has to say so. An ✕ there
//              would promise to close something it does not close.
//
// Three slides mount at a time (swipe-deck renders the active one and its
// neighbours), which is why every card here can start OPEN on its diff. The
// Files pane cannot: it has to hedge with `open: files.length <= 12 &&
// innerWidth >= 768`, because twelve open cards is twelve diffs fetched at once
// and most of a phone screen. A deck is one file at a time by construction, so
// the hedge does not apply and the reader gets the diff without a tap.
//
// Requires kits/swipe-deck.js and the fileReview Alpine component. Both ride in
// the pre-build, so a page that has the bundle has these; a page on a gh.load
// chain names them itself.
(() => {
  const need = () => {
    if (!window.swipeDeck) throw new Error('file-deck: load kits/swipe-deck.js first');
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

  function open(o = {}) {
    const deckKit = need();
    const files = Array.isArray(o.files) ? o.files : [];
    if (!files.length) return null;
    const start = Math.max(0, Math.min(files.length - 1, o.start || 0));

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
    const render = (i, slide) => {
      const f = files[i];
      if (!f) return;
      const el = document.createElement('div');
      // Alpine evaluates x-data as an expression in the component's scope, so
      // the options travel through a keyed global rather than being serialized
      // into the attribute: a path with a quote in it would otherwise break the
      // expression, and a patch certainly would.
      const key = keys[i] = '__fileDeck_' + (SEQ++);
      window[key] = {
        repo: o.repo || '', ref: o.ref || '', base: o.base || '',
        baseName: o.baseName || o.base || '',
        path: f.path, prevPath: f.previousPath || '', status: f.status,
        additions: f.additions, deletions: f.deletions, patch: f.patch || '',
        open: true,
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
      return { name: name || f.path || '', dir };
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
      // A slide is one file's dossier and can be long; let it scroll on its own
      // and keep the deck's own max-width, which the cards were designed for.
      innerClass: 'w-full min-w-0 mx-auto max-w-3xl',
      release: (i) => { if (keys[i]) { delete window[keys[i]]; keys[i] = null; } },
      onClose: o.onClose,
    };

    const handle = o.parent ? deckKit.drill(o.parent, opts)
                            : deckKit.open({ ...opts, back: !!o.back });

    // The header follows the reader. This is the whole reason the deck knows
    // about files at all rather than being handed inert slides: the title has
    // to name the file you are looking at, not the one you opened on.
    handle.deck.onSlide((i) => {
      const { name, dir } = at(i);
      handle.setTitle(name);
      const crumb = [o.parent ? o.parent.title : null, context, dir].filter(Boolean).join(' · ');
      handle.setSubtitle(crumb);
    });
    return handle;
  }

  let SEQ = 0;

  window.fileDeck = { open, split };
})();
