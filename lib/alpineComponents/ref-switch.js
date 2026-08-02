// alpineComponents/ref-switch.js — the header control that says which ref this
// page is RUNNING AT, and switches it.
//
// The fab already answers this question, and answers it more fully: its
// launcher goes warning-tinted off the default branch, and its Render tab
// surveys every branch carrying a different copy of the page. What the fab does
// not do is sit still. It is a floating disc that has to be opened before it
// says anything, and the ref a page is running at is the kind of fact that
// wants to be legible without a tap, in the chrome, beside everything else that
// says where you are. That is the whole of this component: the same fact and
// the same two verbs, promoted into a header.
//
// It is deliberately NOT a second survey. Three things only:
//
//   1. PASTE A REF. A text box, ALWAYS PRESENT, that takes a branch, tag or sha
//      and goes on Enter. This is the primary verb, so it is not behind a tap:
//      the state it serves best is the default branch, where there is nothing
//      to report and everything to do, and a control that has to be opened
//      first puts a door in front of the one thing it exists for. It is also
//      the case the fab's survey list serves worst, since a branch you know the
//      name of is quicker to paste than to find among three hundred rows.
//   2. RIDING. The same box is the readout: it holds the ref the page is
//      running at as its VALUE, and goes warning-tinted off the default branch,
//      with a house button beside it back to the live page. One slot answers
//      "what am I running" and "take me somewhere else", rather than a chip and
//      a field competing for the same corner.
//   3. NEWEST. One button that jumps to the most recently committed branch,
//      the branch you are almost always looking for during a session. It hides
//      itself once the survey says the newest branch IS the default one.
//
// The caret at the box's right opens the branch list, which is a convenience
// over the box rather than the way in.
//
// THE REF IT SWITCHES IS THE PAGE'S OWN, not the browsed repo's. On show-repo
// those are two different things and confusing them would be easy: the Files
// view's ref picker chooses which ref of mehrlander/home you are READING, while
// this chooses which ref of mehrlander/web-tools show-repo itself is RUNNING.
// So the panel names the repo and path it acts on, every time.
//
// HOW IT SWITCHES. Not with ?use= alone. ?use= re-pins the lib a page loads,
// which reaches dist/ and lib/ but never the page's own inline shell, so a
// branch that edits this header would preview as the old header. The toss is
// what swaps the shell, and pinning both halves is what makes the preview whole:
//
//   <renderer>?use=<ref>#gh=<repo>@<ref>:<path>[?<page query>]
//
// the query pinning the renderer's own lib chain (its fab, its peek), the
// fragment addressing the page at the same ref. The page's current deep link
// rides along as the trailing ?query when the host supplies one, so switching
// refs lands you on the screen you were already looking at rather than at the
// page's front door.
//
// Usage:
//   <div x-data="refSwitch({ repo: 'mehrlander/web-tools',
//                            path: 'pages/show-repo/show-repo.html',
//                            query: () => shell.deepLink() })"></div>
//
//   repo        the repo the PAGE lives in (not the one it is browsing)
//   path        the page's path within it
//   defaultRef  the guess until the survey lands; 'main'
//   query       function returning the page's current deep-link query string,
//               carried into the switch. Omit and the switch lands at the
//               page's default state
//   renderer    the toss renderer's URL; defaults to the deployed one
//
// The reads are the same two the fab makes (branchesForPath, degrading to
// branchesDated when there is no token), and they run ON DEMAND: hovering the
// opener starts the load, so by the time a pointer has traveled to the button
// the list is usually there, and a page nobody touches the control on pays
// nothing. The pure parts (URL construction, picking the newest) are on
// window.RefSwitch, where tools/test/ref-switch.test.mjs reads them.

(function () {
  // The one renderer. Hardcoded rather than derived because it is a property of
  // the estate, not of the page mounting this: a page in any repo tosses
  // through web-tools' deployed toss-render, the way fab.js does.
  const RENDERER = 'https://mehrlander.github.io/web-tools/pages/toss-render.html';

  // The switch address. Both halves carry the ref (see the note above): the
  // query pins the RENDERER's lib, the fragment addresses the PAGE.
  function rideUrl({ repo, path, ref, query, renderer }) {
    if (!repo || !path || !ref) return '';
    const q = (query || '').replace(/^\?/, '');
    return (renderer || RENDERER) + '?use=' + encodeURIComponent(ref) +
      '#gh=' + repo + '@' + ref + ':' + path + (q ? '?' + q : '');
  }

  // The live page: the canonical github.io URL for a repo/path, which is what
  // "return to main" means for a Pages-served page. Empty for a repo that is
  // not Pages-served, and the caller falls back to dropping ?use= in place.
  function liveUrl({ repo, path, query }) {
    const [owner, name] = (repo || '').split('/');
    if (!owner || !name || !path) return '';
    const q = (query || '').replace(/^\?/, '');
    return 'https://' + owner + '.github.io/' + name + '/' + path + (q ? '?' + q : '');
  }

  // The most recently committed branch that is not the default one. The rows
  // arrive newest-first from branchesDated/branchesForPath, but sorting here
  // rather than trusting that keeps the pick honest against a caller that
  // filtered or re-ordered. Null when the default branch IS the newest, which
  // is what hides the button: "jump to the newest branch" is not an offer worth
  // making when the newest branch is the one you are already on.
  //
  // An UNDATED row can never win, and that is the whole answer for the
  // token-free fallback: REST's branch list carries no commit date, so every
  // row ties, and a tie broken by array order would send "newest" to whichever
  // branch GitHub happened to list first. Undated rows are still perfectly
  // selectable by hand; they are just not evidence about which is newest.
  function newestBranch(rows, defaultRef) {
    let best = null;
    for (const r of rows || []) {
      if (!r || !r.name || !r.date || r.name === defaultRef) continue;
      if (!best || r.date.localeCompare(best.date) > 0) best = r;
    }
    return best;
  }

  window.RefSwitch = { RENDERER, rideUrl, liveUrl, newestBranch };

  document.addEventListener('alpine:init', function () {
    Alpine.data('refSwitch', function (opts) {
      const cfg = opts || {};
      return {
        description: 'Header control for the ref the PAGE is running at (not the repo it is browsing). An always-present text box takes a pasted branch, tag or sha and goes on Enter; the same box holds the current ref as its value, goes warning-tinted off the default branch, and gains a house button back to the live page. A caret opens the branch list (typing filters it), and a lightning button jumps to the most recently committed branch, hiding itself when that is the default branch. Switches by navigating to the toss renderer with the ref pinned on both halves (?use= for the renderer lib, #gh= for the page), carrying the host page\'s current deep link so the switch lands on the same screen. Branch list loads on hover or focus, once, and degrades to an undated list without a token',

        template: `
          <div class="relative flex items-center gap-0.5" @click.outside="close()" @keydown.escape="close()">
            <!-- Newest. Shown until the survey says otherwise, since before the
                 load there is no way to know whether the newest branch is the
                 default one, and an affordance that appears after a hover is
                 worse than one that quietly stops appearing. -->
            <button x-show="showNewest" type="button" @click="goNewest()" @pointerenter="load()"
                    :title="newestTitle"
                    class="hidden sm:flex shrink-0 p-1.5 rounded-lg text-base-content/45 hover:text-primary hover:bg-base-200 transition-colors">
              <i class="ph text-lg leading-none"
                 :class="loading ? 'ph-circle-notch animate-spin' : 'ph-lightning'"></i>
            </button>

            <!-- ── The phone trigger: one glyph, and the panel is the control ──
                 Below sm the three header slots collapse into this. A 10 rem
                 box was tried first and is the wrong trade: it is the widest
                 thing in the header and it is not what a thumb reaches for,
                 since pasting a branch name on a phone is rare and picking one
                 from a list is the whole interaction. So the box, the newest
                 jump and the way home all move into the panel, where there is
                 room to label them, and what stays pinned is 2 rem of glyph.

                 It still REPORTS without being opened, which is half of what
                 this component is for, and it now reports BOTH facts. The tint
                 answers "am I off the default branch"; the dot answers "and is
                 this the newest one". They are kept on separate channels on
                 purpose: they are independent questions, and folding the second
                 into the color would have amber mean two things at once and
                 imply one of them is better than the other, which being on the
                 newest branch is not. It is merely current.

                 The color is the whole tint signal; the glyph carried an
                 outline and a tinted background at first, which drew a box
                 around one glyph in a row of bare ones and said nothing the
                 color had not already said. -->
            <button type="button" @click="toggle()" @pointerenter="load()"
                    :title="openerTitle"
                    class="sm:hidden relative shrink-0 p-1.5 rounded-lg transition-colors"
                    :class="riding ? 'text-warning hover:bg-warning/10'
                                   : 'text-base-content/45 hover:text-primary hover:bg-base-200'">
              <i class="ph ph-git-branch text-lg leading-none"></i>
              <span x-show="onNewest" x-cloak
                    class="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-success"
                    :title="'This is the newest branch'"></span>
            </button>

            <!-- THE BOX ITSELF, not a button that reveals one. This is the
                 control: paste a branch, press Enter, go. It is present at the
                 default branch, where there is nothing to report but plenty to
                 do, which is the state a hidden input serves worst: the whole
                 point is jumping OFF main, and needing a tap to reach the box
                 puts a door in front of the one thing this exists for.

                 The box is also the readout, which is why it holds the current
                 ref as its VALUE rather than reporting it beside an empty
                 field. One slot answers "what am I running" and "take me
                 somewhere else", and off the default branch it goes
                 warning-tinted in place. Focus selects the whole value, so a
                 paste replaces it without clearing first. -->
            <label :title="openerTitle"
                   class="hidden sm:flex input input-sm input-bordered items-center gap-1.5 w-64 shrink-0 font-mono text-sm transition-colors"
                   :class="riding ? 'border-warning text-warning bg-warning/10' : ''">
              <i class="ph ph-git-branch shrink-0 opacity-60"></i>
              <input x-model="typed" x-ref="input" type="text" spellcheck="false"
                     autocapitalize="off" autocorrect="off"
                     placeholder="branch, tag, or sha"
                     @focus="$event.target.select(); load()"
                     @input="dirty = true; show()"
                     @keydown.enter.prevent="goTyped()"
                     @keydown.escape.prevent="revert()"
                     class="grow min-w-0">
              <button type="button" @click="toggle()" @pointerenter="load()"
                      title="Show the branch list"
                      class="shrink-0 -mr-1 px-0.5 opacity-50 hover:opacity-100 transition-opacity">
                <i class="ph text-base leading-none" :class="open ? 'ph-caret-up' : 'ph-caret-down'"></i>
              </button>
            </label>

            <!-- The way out, one tap, without opening anything. Below sm the
                 panel's own "Back to main" row is the way out instead, which
                 has been there all along. -->
            <button x-show="riding" type="button" @click="returnToLive()"
                    :title="'Return to the live page (the ' + defaultRef + ' version)'"
                    class="hidden sm:flex shrink-0 p-1.5 rounded-lg text-warning/70 hover:text-warning hover:bg-warning/15 transition-colors">
              <i class="ph ph-house-line text-lg leading-none"></i>
            </button>

            <!-- The panel hangs from the BOX's right edge, so what bounds its
                 width is the room to its left, and in a phone header that is
                 less than the panel wants: 24 rem hung off a box that ends
                 ~40 px from the right edge of a 390 px viewport starts at
                 -26 px, off screen, with no scrollbar to reveal it. Clamped on
                 open by measuring, not by a media query, because a query cannot
                 know where this mount sits and the mount moves with whatever
                 else the header is carrying. -->
            <div x-show="open" x-cloak x-transition.opacity.duration.120ms
                 :style="panelMax ? 'max-width:' + panelMax : ''"
                 class="absolute right-0 top-full z-40 mt-1 w-96 max-w-[calc(100vw-1rem)] rounded-box border border-base-300 bg-base-100 shadow-xl">
              <!-- What this acts on, named every time. The control sits in a
                   shell that browses OTHER repos, so leaving it implied is how
                   it would be read as the browsed repo's ref picker. -->
              <div class="flex items-start gap-2 px-3 pt-2.5 pb-1.5 border-b border-base-300">
                <div class="min-w-0 grow">
                  <div class="text-sm font-mono uppercase tracking-widest text-base-content/40">Run from a branch of</div>
                  <div class="truncate font-mono text-sm text-base-content/70" x-text="repo"></div>
                  <div class="truncate font-mono text-sm text-base-content/45" :title="path" x-text="path"></div>
                </div>

                <!-- ── The newest slot, phone only: one corner, three states ──
                     This replaced a full-width row that spun and then, on the
                     branch you were most likely to be standing on, removed
                     itself. A row that sometimes vanishes is worse than a
                     smaller one that always answers, so the slot is always
                     here, at a reserved width, and says which of three things
                     is true:

                       loading            a spinner
                       there is a jump    a lightning button, tap to take it
                       you are on it      nothing, because the GLYPH said so

                     The third state used to carry the word "newest" here, and
                     the word was the problem: a stray label in a corner, in a
                     panel that had just been stripped of everything else. It is
                     not dropped, it moved. The dot on the header glyph answers
                     it a few pixels away and without opening anything, which is
                     strictly better than answering it inside the thing you had
                     to open. Silence here is only correct BECAUSE the glyph
                     speaks; on its own it would be the vanishing row again.

                     A fourth case, no dated non-default branch at all, leaves
                     the slot empty too, since there is genuinely nothing to
                     report.

                     Desktop keeps its header bolt instead. It is one tap
                     without opening anything, which is the better deal where
                     there is width for it, and two lightnings on one panel
                     would be the duplication this whole pass has been removing. -->
                <div class="sm:hidden shrink-0 flex items-center justify-end h-6 min-w-[5rem]">
                  <span x-show="loading" class="loading loading-spinner loading-xs text-base-content/30"></span>

                  <!-- Amber, not primary. Primary appears nowhere else in this
                       control at rest, only as a hover accent, while amber is
                       the switch's own colour: the ridden glyph, the box, the
                       way home, the current row. A blue bolt was the one
                       foreign note in the palette. It does mean amber now
                       carries a second sense here, "there is something newer",
                       alongside "you are off the default branch", and the two
                       never appear in the same place, so the reading stays
                       local: on the glyph it is where you are, in this corner
                       it is where you could go.

                       Reads showNewest rather than restating its rule, so this
                       and the desktop bolt cannot drift. -->
                  <button x-show="!loading && loaded && showNewest"
                          type="button" @click="goNewest()" :title="newestTitle"
                          class="flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-mono text-sm text-warning hover:bg-warning/10 transition-colors">
                    <i class="ph ph-lightning text-base leading-none"></i>newest
                  </button>
                </div>
              </div>

              <!-- THE BOX, on a phone only. At sm and up it is in the header
                   where it needs no opening, and this is deliberately not a
                   second copy of it there: the two are display-exclusive, so
                   only ever one is interactive, and they share one typed value
                   so nothing can drift. No backticks in this comment, or any
                   other in here: the markup is a JS template literal and one
                   would end it mid-component.
                   Duplicated in markup rather than moved by
                   CSS because they sit in different parents, which is the same
                   reason the shell's rail renders twice. -->
              <div class="sm:hidden border-b border-base-300 px-3 py-2">
                <label class="input input-sm input-bordered flex items-center gap-1.5 w-full font-mono text-sm transition-colors"
                       :class="riding ? 'border-warning text-warning bg-warning/10' : ''">
                  <i class="ph ph-git-branch shrink-0 opacity-60"></i>
                  <input x-model="typed" type="text" spellcheck="false"
                         autocapitalize="off" autocorrect="off"
                         placeholder="branch, tag, or sha"
                         @focus="$event.target.select(); load()"
                         @input="dirty = true; load()"
                         @keydown.enter.prevent="goTyped()"
                         @keydown.escape.prevent="revert()"
                         class="grow min-w-0">
                </label>
              </div>

              <div x-show="dirty && typed.trim() && typed.trim() !== ref"
                   class="border-b border-base-300 px-3 py-2">
                <button type="button" @click="goTyped()" class="btn btn-sm btn-primary btn-block gap-1.5">
                  <span class="font-mono normal-case truncate" x-text="'Go to ' + typed.trim()"></span>
                </button>
              </div>

              <div x-show="error" class="px-3 pt-2 pb-2 text-sm text-error" x-text="error"></div>

              <!-- ── The list, and why a phone does without it ────────────────
                   Below sm the panel stops at the box, the newest jump and the
                   way home. The list is the one part of this control that is
                   genuinely duplicated elsewhere: the fab's Render tab surveys
                   every branch carrying a different copy of the page, which is
                   the same question this list answers, down to the same signal.
                   Duplication is cheap in a desktop panel with room to spare
                   and expensive in a phone panel that then owns most of the
                   screen, so it is kept where it costs nothing and dropped
                   where it does. Typing still reaches any branch, and the fab
                   is the survey.

                   The hidden/sm:block pair sits under an x-show on purpose:
                   when x-show is true it removes its inline display style and
                   lets these classes govern, and when false its inline none
                   wins over them. Both halves land the right way round. -->
              <div x-show="note" class="hidden sm:block px-3 pb-2 text-sm text-base-content/50" x-text="note"></div>

              <div x-show="loading" class="hidden sm:flex justify-center py-4">
                <span class="loading loading-spinner loading-sm text-base-content/30"></span>
              </div>

              <div x-show="!loading && loaded"
                   class="hidden sm:block max-h-72 overflow-y-auto border-t border-base-300 py-1">
                <template x-for="b in matches" :key="b.name">
                  <button type="button" @click="go(b.name)"
                          class="w-full min-h-9 flex items-center gap-2 px-3 text-left transition-colors hover:bg-base-200 active:bg-base-300">
                    <!-- A branch carrying a different copy of THIS FILE. Not the
                         same question as "will the page look different", since
                         the lib the page loads is swapped too; it answers the
                         narrower one the survey can actually answer. -->
                    <span class="shrink-0 w-1.5 h-1.5 rounded-full"
                          :class="b.status === 'differs' ? 'bg-primary' : 'bg-transparent'"
                          :title="b.status === 'differs' ? 'carries a different copy of this page' : ''"></span>
                    <!-- The row you are standing on is bold; it is warning-tinted
                         only when standing there means being off the default
                         branch, so the color keeps its one meaning. The name
                         carries its prefix dimmed rather than dropped: two
                         branches can share a tail, and a row has the width for
                         both when the emphasis says which half to read. -->
                    <span class="min-w-0 flex-1 truncate font-mono text-sm"
                          :class="b.name !== ref ? 'text-base-content/80'
                                : riding ? 'text-warning font-semibold' : 'font-semibold'"
                          :title="b.subject || b.name">
                      <span x-show="prefix(b.name)" class="opacity-40" x-text="prefix(b.name)"></span><span x-text="tail(b.name)"></span>
                    </span>
                    <span x-show="b.name === defaultRef"
                          class="shrink-0 text-sm text-base-content/35">default</span>
                    <span class="shrink-0 text-sm text-base-content/35 tabular-nums" x-text="b.ago"></span>
                  </button>
                </template>
                <p x-show="!matches.length" class="px-3 py-2 text-sm text-base-content/50">
                  No branch matches. Enter still takes a tag or a sha.
                </p>
              </div>

              <div x-show="riding" class="border-t border-base-300 px-3 py-2">
                <button type="button" @click="returnToLive()" class="btn btn-sm btn-warning btn-block gap-1.5">
                  <i class="ph ph-house-line"></i>
                  <span class="font-mono normal-case" x-text="'Back to ' + defaultRef"></span>
                </button>
              </div>
            </div>
          </div>`,

        open: false,
        // The box's value, seeded with the ref the page is running at (init) and
        // put back there by revert(). `dirty` is what separates "showing you
        // where you are" from "you are typing a destination": until the box is
        // edited its value is a readout, so it must not filter the list, and the
        // Go row must not offer to navigate to where you already are.
        typed: '',
        dirty: false,
        rows: [],
        loading: false,
        loaded: false,
        error: '',
        note: '',
        defaultRef: cfg.defaultRef || 'main',

        get repo() { return cfg.repo || (window.gh && window.gh.repo) || 'mehrlander/web-tools'; },
        get path() { return cfg.path || ''; },

        // The ref the page is actually running at. One read covers both ways a
        // page gets here: a real ?use= in the address bar, and a toss, whose
        // params shim answers `use` with the addressed ref (see toss-render's
        // addressHtml). window.gh.ref is not used, because on a page whose boot
        // block ignores ?use= it would report the ref the LOADER settled on and
        // hide the fact that the address asked for another; the fab owns that
        // distinction and says so plainly, and a header chip is the wrong place
        // to relitigate it.
        get ref() {
          try { return new URLSearchParams(location.search).get('use') || this.defaultRef; }
          catch (e) { return this.defaultRef; }
        },
        get riding() { return this.ref !== this.defaultRef; },

        // A ref split at its last slash: `claude/thing-abc` -> 'claude/' + 'thing-abc'.
        // A ref with no slash is all tail, so both callers work unchanged.
        prefix(name) { const i = (name || '').lastIndexOf('/'); return i < 0 ? '' : name.slice(0, i + 1); },
        tail(name) { const i = (name || '').lastIndexOf('/'); return i < 0 ? (name || '') : name.slice(i + 1); },

        get openerTitle() {
          return (this.riding
            ? 'Running from ' + this.ref + ', not ' + this.defaultRef + '. '
            : 'Running from ' + this.defaultRef + '. ') +
            'Paste a branch, tag, or sha and press Enter to run ' + this.path + ' from it.';
        },

        get newest() { return window.RefSwitch.newestBranch(this.rows, this.defaultRef); },
        // Hidden once the survey says there is nowhere to jump: either the
        // newest branch IS the default, or it is the one already being ridden.
        // The second case used to leave the control up and do nothing legible
        // when tapped, because go() short-circuits on the ref you are already
        // at and revert() merely closes the panel. That reads as a dead button,
        // and it fires exactly when a session is riding its own newest branch,
        // which is most of the time this control is used at all.
        get showNewest() {
          if (!this.loaded) return true;
          return !!this.newest && this.newest.name !== this.ref;
        },
        // The header glyph's dot: the branch being ridden is the newest one.
        // Only ever true while riding, since on the default branch there is no
        // branch for this to be a fact about. It is showNewest's complement
        // with a newest in hand, read through the same getter so the dot and
        // the corner bolt are guaranteed never to show at once.
        get onNewest() {
          return this.riding && this.loaded && !!this.newest && !this.showNewest;
        },
        get newestTitle() {
          const n = this.newest;
          if (!n) return 'Jump to the most recently committed branch';
          return 'Newest branch: ' + n.name + (n.ago ? ' (' + n.ago + ')' : '');
        },

        // The list, filtered by whatever has been TYPED. An untouched box holds
        // the current ref as a readout, and filtering on that would show one row
        // and hide the list you opened the panel to see. Substring rather than
        // prefix: branch names here are `claude/<slug>-<suffix>`, so the
        // memorable part is in the middle and a prefix match finds nothing you
        // remember.
        get matches() {
          const q = this.dirty ? this.typed.trim().toLowerCase() : '';
          if (!q) return this.rows;
          return this.rows.filter(b => b.name.toLowerCase().includes(q));
        },

        get pageQuery() {
          try { return (typeof cfg.query === 'function' ? cfg.query() : cfg.query) || ''; }
          catch (e) { return ''; }
        },

        // How wide the panel may be, in px, measured at the moment it opens:
        // everything from the viewport's left gutter to this control's right
        // edge, which is the edge the panel hangs from. Empty until the first
        // open, so the CSS width stands on a desktop where nothing needs
        // clamping. The floor keeps a pathologically narrow mount from
        // producing a panel too thin to read; it would overflow left, which is
        // the lesser failure of the two.
        panelMax: '',
        measurePanel() {
          const r = this.$el?.getBoundingClientRect?.();
          this.panelMax = r ? Math.max(240, Math.round(r.right - 8)) + 'px' : '';
        },
        // One door for every way the panel opens (the caret, and typing into
        // the box), so the measurement cannot be attached to one of them and
        // forgotten on the other.
        show() {
          this.open = true;
          this.measurePanel();
          this.load();
        },
        toggle() {
          if (this.open) return this.close();
          this.show();
        },
        close() { this.open = false; },

        // Escape puts the box back to the readout it started as. A half-typed
        // branch name left sitting in a header would otherwise misreport, for
        // the rest of the page's life, which ref the page is running at.
        revert() {
          this.typed = this.ref;
          this.dirty = false;
          this.close();
        },

        // One load per page life. The rows are branch tips, which do move, but
        // a header control is not a monitor: reopening the panel in the same
        // session should not re-run three GraphQL pages, and a session that
        // pushes a branch reloads to ride it anyway.
        async load() {
          if (this.loaded || this.loading) return;
          if (!window.GH) { this.error = 'window.GH not available on this page'; return; }
          this.loading = true;
          this.error = ''; this.note = '';
          let token = '';
          try { token = localStorage.getItem('ghToken') || ''; } catch (e) {}
          try {
            const gh = new window.GH({ repo: this.repo, token });
            let rows = null;
            // The path-aware survey when it is available: same one call, and it
            // returns the repo's real default branch, which is what the chip's
            // "riding" test and the newest button both key on.
            if (this.path && typeof gh.branchesForPath === 'function') {
              try {
                const r = await gh.branchesForPath(this.path);
                this.defaultRef = r.defaultBranch || this.defaultRef;
                rows = r.branches.map(b => ({
                  ...b,
                  status: b.name === this.defaultRef ? 'baseline'
                        : !('fileOid' in b) ? 'unknown'
                        : !b.fileOid ? 'missing'
                        : b.fileOid === r.defaultOid ? 'same' : 'differs'
                }));
              } catch (e) { /* degrade below */ }
            }
            if (!rows && typeof gh.branchesDated === 'function') {
              try {
                this.note = 'No per-page comparison: showing every branch.';
                rows = (await gh.branchesDated()).map(b => ({ ...b, status: 'unknown' }));
              } catch (e) { /* degrade again */ }
            }
            // Last stop, and the only one a token-free viewer reaches: REST's
            // branch list, which is public for a public repo. It carries no
            // commit date, so the rows are unordered and the newest button
            // retires (see newestBranch) — the panel still takes a pasted ref
            // and still lists what there is to pick from, which is the point.
            if (!rows) {
              this.note = 'Undated list (branch dates need a token): pick by name.';
              rows = (await gh.branches()).map(b => ({ name: b.name, date: '', ago: '', status: 'unknown' }));
            }
            this.rows = rows;
            this.loaded = true;
          } catch (e) {
            this.error = 'Branches: ' + ((e && e.message) || String(e));
          }
          this.loading = false;
        },

        // Navigation always leaves the TOP document. Inside a toss this
        // component runs in the renderer's frame, where assigning location
        // would nest a renderer inside a renderer rather than switch the ref.
        _go(url) {
          if (!url) return;
          try {
            if (window.top && window.top !== window.self) { window.top.location.href = url; return; }
          } catch (e) { /* cross-origin top: fall through */ }
          location.href = url;
        },

        go(ref) {
          const r = (ref || '').trim();
          if (!r) return;
          // Already there. Pressing Enter on an untouched box is the common way
          // to arrive here, and reloading the page for it would look like a
          // mystery navigation.
          if (r === this.ref) { this.revert(); return; }
          if (r === this.defaultRef) return this.returnToLive();
          this._go(window.RefSwitch.rideUrl({
            repo: this.repo, path: this.path, ref: r,
            query: this.pageQuery, renderer: cfg.renderer,
          }));
        },

        goTyped() { this.go(this.typed); },

        // Load-then-go, so the button works on its first tap whether or not the
        // hover preload has landed. Two ways there is nowhere to jump, and both
        // say so rather than letting the button do nothing: the newest branch
        // is the default one, or it is the one already being ridden.
        //
        // The second needs handling HERE and not only in showNewest, because of
        // the order: before the survey lands showNewest is true by design, so
        // the button is up and tappable, and the answer only arrives during
        // this await. Without the guard the tap fell through to go(), which
        // short-circuits on the ref it is already at and calls revert(), so the
        // panel shut and nothing else happened. Reported as the lightning not
        // working, and it was doing exactly what it was told.
        async goNewest() {
          await this.load();
          const n = this.newest;
          if (n && n.name !== this.ref) return this.go(n.name);
          if (!this.error) this.error = n
            ? 'Already running ' + n.name + ', the newest branch.'
            : 'No branch newer than ' + this.defaultRef + '.';
          this.open = true;
        },

        returnToLive() {
          this.close();
          const url = window.RefSwitch.liveUrl({ repo: this.repo, path: this.path, query: this.pageQuery });
          if (url) return this._go(url);
          // Not Pages-served: drop the pin in place instead.
          try {
            const u = new URL(location.href);
            u.searchParams.delete('use');
            this._go(u.toString());
          } catch (e) { location.reload(); }
        },

        init() {
          this.typed = this.ref;
          this.$el.innerHTML = this.template;
          this.$nextTick(() => Alpine.initTree(this.$el));

          // The dot exists to answer a question WITHOUT the panel being opened,
          // and it cannot answer anything before the survey lands. Desktop gets
          // that for free from the hover preload; a phone has no hover, so a dot
          // that waits for a tap would answer only after you opened the thing it
          // was meant to save you opening.
          //
          // So the survey runs itself, once, and ONLY WHILE RIDING: on the
          // default branch no dot is possible, so a page nobody is previewing
          // still pays nothing, which was the whole point of loading on demand.
          // Riding is already a deliberate act, and this is the fact the control
          // exists to report, so one survey is proportionate. On idle rather
          // than immediately, because it is a garnish and the page's own
          // loading has the better claim on the network.
          if (this.riding) {
            const kick = () => this.load();
            if (typeof requestIdleCallback === 'function') requestIdleCallback(kick, { timeout: 4000 });
            else setTimeout(kick, 1200);
          }
        },
      };
    });
  });
})();
