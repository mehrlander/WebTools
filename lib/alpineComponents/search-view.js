// alpineComponents/search-view.js — the central file surface.
//
// It began as a search results list and is now the place files are READ, which
// is the same move made twice. The sidebar finder and this view split one job:
// the finder is for JUMPING (few keystrokes, one destination, no controls),
// this view is for INVESTIGATING (parameters, room for many results,
// iteration). The finder's "File contents" gate routes here with the query
// carried over; the header nav's Search entry opens it empty.
//
// WHY THE FILE OPENS HERE. Every repo carried its own Files view (the
// explorer's breadcrumb walk plus the shared viewer), so reading a file meant
// first choosing a repository and then walking a tree, and a hit found here
// bounced into that per-repo surface to be read. But a file is rarely wanted
// as a position in a tree; it is wanted by name, by folder, or by what is
// inside it, none of which a tree navigator answers and all three of which
// this view already does. So the search IS the browse: a query, a repo, a ref,
// and a folder scope are four filters over one list, and the list opens its
// own file. `?view=files` stays exactly as it was for the tree walk that
// wants it.
//
// Three modes, each a mode pill, all served by lib/kits/estate-search.js (one
// implementation, one cache, shared with the finder):
//
//   Names        the repo trees, at any REF (which is what the trees API
//                gives and the code index does not, so this is the lane that
//                reaches branches) and under any folder. It is TWO READINGS
//                of one corpus, and the query box is the switch between them:
//
//                  a query   recursive and flat, every matching path
//                  no query  ONE LEVEL, folders and files, walkable
//
//                The second is the file browser. It has folders in it, which
//                a recursive match structurally cannot, and it is why an
//                empty query here is an answer rather than a miss.
//   Contents     the code-search API. Its limits are the one thing prose still
//                carries under the controls, since no layout can show what a
//                list is missing: default branches only, indexing can lag a
//                push, files over ~384 KB are not indexed, ten calls a minute.
//                Errors surface whole. A folder scope rides as `path:`.
//   Sessions     the captured-records grep (what a record quotes); hits open
//                the Sessions pane's paged reader via web-tools:open-session.
//
// Every run re-executes the search; the caches underneath make re-matching
// cheap, and "Refresh caches" (EstateSearch.reset) is the explicit way to
// force fresh fetches, which is the view-level answer to "the results seem
// cached". Deep-linkable: the shell stamps
// ?view=search&sq=&smode=&srepo=&sref=&spath=&sfile= through searchSeed, so a
// search AND the file open in it are an address like any other view state.
//
// Mounts by the crumb-bar idiom (template injected in init, then initTree);
// lazy (template x-if="searchSeen" in the shell), like Map and Tools. The
// reader is the shared viewer (viewer.js) embedded with bindStore:false, the
// same way the stage previews a staged file: this view holds cross-repo hits,
// so binding it to the browsed repo's activeFile would be the wrong subject.

document.addEventListener('alpine:init', function () {
  Alpine.data('searchView', function () {
    const short = (repo) => String(repo || '').split('/')[1] || repo;
    // The explorer's tab expansion, so a file reads the same here as there.
    const fmt = (t) => String(t == null ? '' : t).replace(/ {4}/g, '  ');
    const dirOf = (p) => String(p || '').split('/').slice(0, -1).join('/');
    // A file's weight, from the tree read that already listed it. Rounded the
    // way the rest of the estate rounds bytes (drop-zone, treemap, traffic):
    // one decimal only while it still buys something.
    const fmtSize = (n) => {
      if (typeof n !== 'number' || !isFinite(n)) return '';
      if (n < 1024) return n + ' B';
      if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
      return (n / 1048576).toFixed(1) + ' MB';
    };

    return {
      description: 'The central file surface: file names (any ref, any folder), file contents (code-search API), and session records over one shared search core, with the shared viewer reading a hit in place',

      template: `
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2 max-w-3xl">
            <i class="ph ph-files text-xl text-base-content/50"></i>
            <h2 class="text-lg font-semibold">Files</h2>
            <div class="grow"></div>
            <button @click="refreshCaches()" title="Forget fetched trees and session records, so the next run reads fresh"
                    class="btn btn-ghost btn-sm gap-1.5 text-base-content/60">
              <i class="ph ph-arrows-clockwise text-base"></i>Refresh caches</button>
          </div>

          <form @submit.prevent="run()" class="flex gap-2 max-w-3xl">
            <label class="input input-bordered flex items-center gap-2 grow">
              <i class="ph ph-magnifying-glass opacity-50"></i>
              <input x-model="q" type="text" :placeholder="queryPlaceholder"
                     autocomplete="off" autocapitalize="off" spellcheck="false"
                     class="grow font-mono text-lg sm:text-base">
              <button type="button" x-show="q" @click="q = ''" class="opacity-40 hover:opacity-100 shrink-0" title="Clear">
                <i class="ph ph-x-circle"></i></button>
            </label>
            <button type="submit" class="btn btn-primary shrink-0" :disabled="!!(!canRun || busy)">
              <span x-show="!busy" x-text="q.trim() ? 'Search' : 'List'"></span>
              <i x-show="busy" class="ph ph-circle-notch animate-spin text-lg"></i>
            </button>
          </form>

          <div class="flex flex-wrap items-center gap-2">
            <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 w-fit flex-wrap" role="tablist">
              <template x-for="m in MODES" :key="m.key">
                <button role="tab" @click="setMode(m.key)"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                        :class="mode === m.key ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                  <i class="ph text-lg" :class="m.icon"></i><span x-text="m.label"></span>
                </button>
              </template>
            </div>
          </div>

          <!-- REPOS AS A RAIL, not a dropdown. The set is small, fixed, and the
               thing you switch most, which is the case a select serves worst:
               it hides every option behind a tap and reports the current one in
               a slot that reads as a form field rather than as a place you are
               standing. The stage's Recent filter already does this; same
               badges, same single-select, same "tap it again for all". -->
          <div x-show="mode !== 'sessions'" class="flex flex-wrap items-center gap-1 max-w-3xl">
            <button @click="pickRepo('')"
                    class="badge badge-sm cursor-pointer gap-1 transition-opacity"
                    :class="!repo ? 'badge-primary' : 'badge-ghost opacity-50'">All</button>
            <template x-for="r in repoOptions" :key="r.repo">
              <button @click="pickRepo(r.repo)"
                      class="badge badge-sm cursor-pointer gap-1 font-mono transition-opacity"
                      :class="repo === r.repo ? 'badge-primary' : repo ? 'badge-ghost opacity-40' : 'badge-ghost'"
                      x-text="shortName(r.repo)"></button>
            </template>
          </div>

          <!-- The two scopes that are places rather than words, so both are
               pickers rather than boxes: a ref is chosen from what the repo
               has, a folder from what the tree holds. Each still takes a pasted
               value, inside the panel, where it is the fallback rather than the
               way in. The ref control needs a repo to list, so it stands down
               under All, where each repo answers at its own default branch. -->
          <div x-show="mode === 'names' && repo" class="flex flex-wrap items-start gap-2 max-w-3xl">
            <div class="w-52 shrink-0" x-data="refPicker(pickerCfg.ref)"></div>

            <!-- The x-ref sits on the WRAPPER, not on the picker's own element:
                 x-ref registers against the closest component root, so an
                 element carrying both would register the ref with itself and
                 this host would never find it. The fab's mount says the same. -->
            <div class="w-64 shrink-0" x-ref="dirPicker" @path-pick="scopeTo($event.detail.dir)">
              <button type="button" @click="openDirPicker()"
                      class="input input-bordered input-sm flex items-center gap-1.5 w-full min-w-0 font-mono"
                      :title="scope ? 'Folder scope: ' + scope : 'Scope to a folder'">
                <i class="ph ph-folder shrink-0 opacity-60"></i>
                <span class="min-w-0 flex-1 truncate text-left" :class="!scope && 'opacity-50'"
                      x-text="scope || 'whole repo'"></span>
                <i class="ph ph-caret-down shrink-0 text-base opacity-40"></i>
              </button>
              <div x-data="pathPicker(pickerCfg.dir)"></div>
            </div>
          </div>

          <!-- The scope, as a walkable trail. A folder is reached by tapping one
               on a result row as often as by the picker, so the way back out has
               to be as cheap as either way in. -->
          <div x-show="mode !== 'sessions' && scope" class="flex items-center gap-1 flex-wrap font-mono text-sm max-w-3xl">
            <span class="text-base-content/40">under</span>
            <button @click="scopeTo('')" class="text-base-content/60 hover:text-primary">all</button>
            <template x-for="c in scopeCrumbs" :key="c.path">
              <span class="flex items-center gap-1">
                <span class="text-base-content/20">/</span>
                <button @click="scopeTo(c.path)" class="hover:text-primary"
                        :class="c.path === scope ? 'text-primary font-semibold' : 'text-base-content/60'"
                        x-text="c.name"></button>
              </span>
            </template>
            <button @click="scopeTo('')" class="ml-1 text-base-content/30 hover:text-error" title="Clear the folder scope">
              <i class="ph ph-x-circle"></i></button>
          </div>

          <!-- What a mode cannot see, and ONLY that. This slot used to carry a
               paragraph per mode explaining what each one is, above controls
               that were already saying it: the Files pill plus a repo rail plus
               a branch picker is not a thing anyone needs told in prose. What
               prose is still the only carrier for is a LIMIT, since nothing in
               the layout can show what is missing from a list. So Files says
               nothing, Contents keeps its caveats, and Sessions says what corpus
               it greps. -->
          <p x-show="caveat" class="text-sm text-base-content/50 max-w-3xl"
             :class="open && 'hidden lg:block'" x-text="caveat"></p>

          <div x-show="error" class="alert alert-warning items-start text-base max-w-3xl">
            <i class="ph ph-warning text-lg shrink-0 mt-0.5"></i>
            <span class="min-w-0 break-words" x-text="error"></span>
          </div>

          <div x-show="ran && !busy && !error" class="flex items-center gap-2 text-base text-base-content/60 max-w-3xl">
            <!-- A folder listing is not a count of hits: nothing was searched
                 for, so nothing "hit". It says what is here, in the two kinds
                 it holds. -->
            <span x-text="tally"></span>
            <span x-show="truncated" class="text-warning" title="A repo tree was too large to list in full">(partial)</span>
            <div class="grow"></div>
            <!-- Read the results one at a time. It sits on the tally row rather
                 than inside the list, because it is a promise about the SET the
                 row has just counted, and because that row is the one piece of
                 chrome that survives a file being open: below lg the list is
                 hidden while the reader is on a file, so a button living in the
                 list would vanish exactly where swiping is worth most.

                 It opens where the reader is standing (openIndex, else the top
                 of the list), so the pane's position counter and the deck
                 are two speeds on one position rather than two positions.

                 THE CLASSES AND THE WORDING ARE swipeDeck.entry()'s, and the
                 literal here is a COPY held to it by test
                 (tools/test/deck-entry-parity.test.mjs) rather than a call: the
                 kit loads on demand, so it is not on the page when this
                 template first renders, and a host that waited for it would
                 show no button at all on the first paint. Unlike the other two
                 copies this one has no uncounted state, because it only ever
                 renders over a list already in hand. -->
            <button x-show="fileHits.length" @click="openDeck()" :disabled="deckOpening"
                    class="btn btn-square btn-sm max-sm:h-11 max-sm:w-11 btn-soft btn-primary"
                    :title="'Read ' + plural(fileHits.length, 'file') + ' one at a time'">
              <span x-show="deckOpening" class="loading loading-spinner loading-xs"></span>
              <i x-show="!deckOpening" class="ph ph-cards-three text-lg max-sm:text-xl"></i></button>
            <button x-show="hits.length || ran" @click="clear()" class="btn btn-ghost btn-xs gap-1 text-base-content/50">
              <i class="ph ph-x text-sm"></i>Clear</button>
          </div>

          <!-- Results and reader, side by side where there is room. Below lg
               they are one column and the open file takes it, with a labelled
               way back to the list: a phone showing a 40-row list above a file
               is showing neither. -->
          <div class="grid gap-4 lg:items-start" :class="open && 'lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]'">
            <div class="flex flex-col min-w-0"
                 :class="open ? 'hidden lg:flex lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto' : 'max-w-3xl'">
              <template x-for="(h, i) in hits" :key="h.key">
                <div class="group flex items-stretch rounded-lg transition-colors"
                     :class="isOpen(h) ? 'bg-primary/10' : 'hover:bg-base-200'">
                  <button type="button" @click="openHit(h)"
                          class="min-w-0 flex-1 flex flex-col justify-center px-3 py-2 text-left text-base">
                    <span class="flex items-center gap-2.5 w-full">
                      <i class="ph shrink-0 text-lg" :class="[h.icon, isOpen(h) ? 'text-primary' : (h.tint || 'text-base-content/50')]"></i>
                      <span class="min-w-0 flex-1 truncate"
                            :class="[h.mono && 'font-mono', h.tail && '[direction:rtl] text-left', isOpen(h) && 'text-primary font-semibold']"
                            x-text="h.label"></span>
                      <span x-show="h.sub" class="shrink-0 max-w-[45%] truncate text-sm text-base-content/40" x-text="h.sub"></span>
                      <!-- The file's weight, off the same tree read that
                           listed it, so it costs no fetch. It is the one thing
                           the retired per-repo explorer showed that the cached
                           walk did not. Right-aligned and tabular so a column
                           of sizes reads as a column. -->
                      <span x-show="h.size" class="shrink-0 text-sm text-base-content/30 tabular-nums" x-text="h.size"></span>
                    </span>
                    <span x-show="h.note" class="w-full truncate pl-[1.9rem] text-sm text-base-content/40" x-text="h.note"></span>
                  </button>
                  <!-- Scoping down is one tap from the row that revealed the
                       folder, which is where the reader is already looking. It
                       is shown at rest rather than on hover: a phone has no
                       hover, and this is an action, not a decoration. It
                       appears only where it would go somewhere, so a row sitting
                       directly in the current scope carries none. -->
                  <button type="button" x-show="h.dir" @click.stop="scopeTo(h.dir)"
                          class="px-2 shrink-0 text-base-content/20 hover:text-primary transition-colors"
                          :title="'Scope to ' + h.dir">
                    <i class="ph ph-folder-open"></i></button>
                </div>
              </template>
              <p x-show="ran && !busy && !error && !hits.length" class="text-base text-base-content/40 italic px-2 py-6">
                Nothing matched.
              </p>
              <button x-show="canShowMore" @click="more()" :disabled="busy"
                      class="btn btn-ghost btn-sm self-start mt-1 gap-1 text-base-content/60">
                <i class="ph ph-caret-down"></i>
                <span x-text="'Show more (' + (total - hits.length) + ' left)'"></span>
              </button>
            </div>

            <!-- The reader. The shared viewer carries the file's own chrome
                 (name, size, mode switch, GitHub / Raw / CDN / toss links), so
                 this bar holds only what the viewer cannot know: where in the
                 result set this file is, and the routes out. -->
            <div x-show="open" x-cloak class="min-w-0 flex flex-col gap-2">
              <div class="flex items-center gap-1 flex-wrap text-base">
                <button @click="closeFile()" class="btn btn-ghost btn-sm gap-1 lg:hidden">
                  <i class="ph ph-arrow-left"></i>
                  <span x-text="hits.length + ' results'"></span>
                </button>
                <span class="font-mono text-sm text-base-content/50 truncate" x-text="openSub"></span>
                <div class="grow"></div>
                <template x-if="fileHits.length > 1">
                  <span class="flex items-center gap-0.5">
                    <button @click="step(-1)" :disabled="openIndex <= 0"
                            class="btn btn-ghost btn-square btn-sm opacity-60 hover:opacity-100 disabled:opacity-20" title="Previous result">
                      <i class="ph ph-caret-left text-lg"></i></button>
                    <span class="font-mono text-sm opacity-50 tabular-nums"
                          x-text="(openIndex + 1) + ' / ' + fileHits.length"></span>
                    <button @click="step(1)" :disabled="openIndex >= fileHits.length - 1"
                            class="btn btn-ghost btn-square btn-sm opacity-60 hover:opacity-100 disabled:opacity-20" title="Next result">
                      <i class="ph ph-caret-right text-lg"></i></button>
                  </span>
                </template>
                <button @click="openInFiles()" class="btn btn-ghost btn-square btn-sm opacity-60 hover:opacity-100"
                        title="Open this file in its repo's Files view, to walk the tree around it">
                  <i class="ph ph-folders text-lg"></i></button>
                <button @click="closeFile()" class="btn btn-ghost btn-square btn-sm opacity-60 hover:opacity-100 hidden lg:inline-flex" title="Close">
                  <i class="ph ph-x text-lg"></i></button>
              </div>
              <div x-show="openBusy" class="flex justify-center py-20">
                <span class="loading loading-spinner loading-lg text-primary"></span>
              </div>
              <div x-show="openNote" class="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <i class="ph ph-file-dashed text-4xl opacity-25"></i>
                <p class="text-base text-base-content/60" x-text="openNote"></p>
              </div>
              <div x-show="!openBusy && !openNote" id="search-file-viewer" x-data="viewer({ bindStore: false, defaultMode: READ_MODE })"></div>
            </div>
          </div>
        </div>`,

      // The view is Files; these say by WHAT. "Names" and "Contents" are the
      // two halves of looking for a file and read as a pair; a mode pill
      // labelled Files under a heading labelled Files said the same word twice
      // and neither time said which half you were on.
      MODES: [
        { key: 'names',    label: 'Names',     icon: 'ph-file' },
        { key: 'contents', label: 'Contents',  icon: 'ph-file-magnifying-glass' },
        { key: 'sessions', label: 'Sessions',  icon: 'ph-chat-circle-text' },
      ],
      // Which mode the reader opens a file in. Defined here until 2026-08-15,
      // when the stage's preview turned out to want the same policy; it now
      // lives on ViewRegistry, which owns it and carries the reasoning. This
      // stays as the name the template mounts with.
      READ_MODE: (f) => window.ViewRegistry.READ_MODE(f),
      CAP_STEP: 50,
      q: '',
      mode: 'names',
      repo: '',      // '' = every estate repo
      ref: '',       // names mode only; '' = default branch
      path: '',      // folder scope; '' = the whole repo
      cap: 50,       // how many hits the list holds; `more()` raises it
      busy: false,
      error: '',
      ran: false,    // a search has executed (distinguishes "no hits" from "not run")
      hits: [],
      total: 0,
      truncated: false,
      // The file being read: { repo, ref, path } or null. Held apart from the
      // hit list because it outlives it: a re-run that drops the file from the
      // results should not yank it off the screen mid-read.
      open: null,
      openBusy: false,
      openNote: '',
      // The deck over the hits: its handle, the list it was opened against, and
      // whether a tap is still resolving. The list is a SNAPSHOT rather than the
      // live getter, because a deck is a fixed set of slides and `fileHits`
      // moves under a re-run: a `count` taken at open and a `render` reading the
      // current results would disagree the moment either changed.
      deckOpening: false,
      _deck: null,
      _deckFiles: null,
      // Whether every file in the deck sits in one place. The rule the hit rows
      // already follow one level up: a location repeated on every line says
      // nothing that tells the lines apart, and spends the width that the
      // filename wanted. So a deck of one folder's files lists bare filenames,
      // and a cross-repo answer keeps the location on every row.
      _deckOnePlace: false,

      // Each mounted picker's config, built HERE and not in its own x-data, and
      // that placement is load-bearing rather than tidy.
      //
      // Alpine evaluates an `x-data` expression with every registered component
      // NAME injected into the scope, so the estate's own component names are
      // live identifiers there. One of them is `repo` (alpineComponents/repo.js).
      // So the natural spelling, `refPicker({ repo: () => repo })` or a factory
      // method reading `this.repo`, resolves `repo` to that component's factory
      // function rather than to this view's scoped repository: the panel
      // rendered "[object Object]" where the repo goes and lost the default
      // branch, with nothing in either file looking wrong and both components
      // testing green in isolation. `defaultRef`, which is nobody's component,
      // came back undefined by the same route and looked like a separate bug.
      //
      // init() runs in the ordinary component scope, where the injection is
      // gone, so `self` captured here is this view and the closures below can
      // read its fields by their real names. Any mount whose config closes over
      // host state belongs here for the same reason.
      pickerCfg: null,

      init() {
        this.$el.innerHTML = this.template;
        const self = this;
        this.pickerCfg = {
          ref: {
            repo: () => self.repo,
            ref: () => self.ref.trim(),
            defaultRef: () => self.scopeDefaultRef(),
            onPick: (r) => self.pickRef(r),
          },
          dir: {
            mode: 'dir', trigger: false,
            roots: () => self.pickerRoots(),
            gh: () => self.scopeGh(),
          },
        };
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
        // The seed: goSearch(opts) parked what the caller wanted (the finder's
        // gate, the explorer's hand-off, or a deep link's ?sq= family). Consume
        // once; run when there is something to run, since a seeded search is a
        // search someone already asked for. A seeded FILE opens after the run,
        // so a shared address lands on the file, not merely near it.
        const apply = (seed) => {
          if (!seed) return;
          this.q = seed.q || '';
          if (['names', 'contents', 'sessions'].includes(seed.mode)) this.mode = seed.mode;
          this.repo = seed.repo || '';
          this.ref = seed.ref || '';
          this.path = seed.path || '';
          this.cap = this.CAP_STEP;
          const file = seed.file ? window.RepoAddress?.parse?.(seed.file) : null;
          const done = this.canRun ? this.run() : Promise.resolve();
          if (file) done.then(() => this.showFile(file));
        };
        apply(window.__shell?.searchSeed);
        // NOTHING SEEDED IS STILL A REQUEST, and the request is "show me
        // files". A file surface whose front door is an empty box over an
        // empty list, with its own button greyed out, is a dead end that
        // reports nothing about why; the browsed repo is right there and is
        // what anyone opening this cold means. So a bare arrival scopes to it
        // and lists it, at the ref being browsed when that is off the default.
        // Only a bare arrival: a seed carrying a query meant that query, over
        // whatever scope it named, including every repo.
        if (!this.ran && !this.q && !this.repo && !this.scope) {
          const s = this.browsed();
          if (s.repo) { this.repo = s.repo; this.ref = s.ref; this.run(); }
        }
        // The component mounts once and persists behind x-show, so a LATER
        // routing (the finder's gate, with the view already open behind the
        // scenes) re-seeds through this event rather than through init.
        document.addEventListener('web-tools:search-seed', (e) => apply(e.detail));
      },

      // What the shell is browsing, in this view's own terms. The ref is
      // carried only when it is off the default, since '' here means "the
      // default branch" and is the honest thing to hold: the explorer's rule.
      browsed() {
        const s = (typeof Alpine !== 'undefined' && Alpine.store?.('browser')) || {};
        return {
          repo: s.repo || '',
          ref: s.ref && s.defaultRef && s.ref !== s.defaultRef ? s.ref : '',
        };
      },

      repos() { return window.__shell?.estateRepos || []; },
      // The select's options: the estate's repos, plus whatever is actually
      // scoped when that is not one of them. A repo can be browsed, handed over
      // by the explorer, or named in a ?srepo= link without being on the
      // estate, and a select holding a value it has no option for renders
      // blank, which reads as no scope at all while the list underneath is
      // scoped.
      get repoOptions() {
        const rows = this.repos();
        if (this.repo && !rows.some(r => r.repo === this.repo)) return [{ repo: this.repo }, ...rows];
        return rows;
      },
      shortName: short,

      // A run needs a query, EXCEPT in files mode, where a repo or a folder is
      // enough: that is the listing, and it is the browse half of this view.
      // Nothing narrows an all-repos listing of everything, so that one case
      // still asks for a query rather than reading every tree the token can see.
      get canRun() {
        if (this.q.trim()) return true;
        return this.mode === 'names' && !!(this.repo || this.scope);
      },
      // BROWSING vs SEARCHING, the one rule that decides what the list is.
      // A query is recursive and flat (which paths match); no query is one
      // level with its folders in it (what is in here). One repo, since a
      // level of "every repo at once" is not a place. The box is the switch,
      // which is why neither reading needs a control of its own.
      get browsing() {
        return this.mode === 'names' && !this.q.trim() && !!this.repo;
      },
      get queryPlaceholder() {
        if (this.mode === 'sessions') return 'Search sessions…';
        if (this.mode === 'contents') return 'Search file contents…';
        // Said as what typing DOES, since typing leaves the folder listing for
        // a recursive match and that is the surprise worth naming up front.
        if (this.browsing) return this.scope ? 'Search under ' + this.scope + '…' : 'Search this repo…';
        return this.repo || this.scope ? 'Filter these files…' : 'Search file names…';
      },
      // The folder scope, normalized once. The box is forgiving about slashes
      // because a pasted path routinely carries them; everything downstream
      // (the crumbs, the run, the address) reads this rather than the raw box.
      get scope() { return this.path.replace(/^\/+|\/+$/g, ''); },
      get scopeCrumbs() {
        const segs = this.scope.split('/').filter(Boolean);
        return segs.map((name, i) => ({ name, path: segs.slice(0, i + 1).join('/') }));
      },
      // Whether raising the cap can actually yield more. The names lane holds
      // the whole match set in memory, so it always can; the code-search API
      // pages at 100 and this view reads one page, so past that the button
      // would promise what it cannot deliver. Sessions returns everything, so
      // total never exceeds the list.
      get canShowMore() {
        if (this.busy || this.total <= this.hits.length) return false;
        return this.mode !== 'contents' || this.hits.length < 100;
      },
      // Only file hits are readable here, so the position and the arrows count
      // those; a folder row and a sessions run leave the reader alone.
      get fileHits() { return this.hits.filter(h => h.kind === 'file'); },
      get tally() {
        const n = (k, one, many) => k + ' ' + (k === 1 ? one : many);
        if (this.browsing) {
          const dirs = this.hits.filter(h => h.kind === 'dir' && h.key !== 'up').length;
          const files = this.fileHits.length;
          const shown = [dirs ? n(dirs, 'folder', 'folders') : '', files ? n(files, 'file', 'files') : '']
            .filter(Boolean).join(' · ');
          return shown || 'empty';
        }
        const shown = n(this.hits.length, 'hit', 'hits');
        return this.total > this.hits.length ? shown + ' of ' + this.total : shown;
      },
      get openIndex() {
        if (!this.open) return -1;
        return this.fileHits.findIndex(h => this.sameFile(h, this.open));
      },
      // The bar over the reader names the file and where it came from. The
      // viewer's own header carries the full path, but it is the first thing to
      // lose its width on a phone, which is exactly where the list is hidden
      // and this bar is the only label left.
      get openSub() {
        if (!this.open) return '';
        return this.open.path.split('/').pop() + ' · ' + short(this.open.repo)
             + (this.open.ref ? '@' + this.open.ref : '');
      },

      // The row palette is the estate's, not this view's: `ph-folder
      // text-warning` and `ph-file text-info`, the pair the explorer, the
      // navigator, mention and path-picker all use. The rows here were built
      // generically and came out uniformly grey, which read as a results list
      // rather than as a file tree; the manila folder is what says at a glance
      // which rows you can walk into. The `..` row keeps the muted treatment on
      // purpose: it is a way out, not a folder in the listing.
      //
      // One file hit's row, from either lane. Two things are dropped as
      // redundant, because a scoped listing otherwise repeats its own scope on
      // every line and truncates the only part that differs: the label is
      // RELATIVE to the folder scope, and the repo badge is dropped when a
      // single repo is the scope, since the control above already names it.
      // The full path stays on the hit for opening it and for the folder chip.
      fileRow(h, extra) {
        const under = this.scope;
        const rel = under && h.path.startsWith(under + '/') ? h.path.slice(under.length + 1) : h.path;
        const dir = dirOf(h.path);
        return {
          key: (extra?.key || '') + h.repo + '@' + (h.ref || '') + ':' + h.path,
          icon: extra?.icon || 'ph-file', tint: 'text-info', mono: true, tail: true,
          label: rel, note: extra?.note || '',
          sub: (this.repo ? '' : short(h.repo)) + (h.ref ? '@' + h.ref : ''),
          dir: dir && dir !== under ? dir : '',
          size: fmtSize(h.size),
          kind: 'file', repo: h.repo, ref: h.ref || '', path: h.path,
        };
      },

      // What this mode CANNOT see, and only that. The controls say what each
      // mode is; nothing in a layout can say what is missing from a list, so
      // that is the one thing left for prose. Files says nothing at all, having
      // no limit worth a line and a rail plus a branch picker above it already
      // saying what it is.
      get caveat() {
        if (this.mode === 'contents') {
          return 'Default branches only, indexing can lag a recent push, files over ~384 KB are not indexed, ten searches a minute.';
        }
        if (this.mode === 'sessions') {
          return 'Greps the captured session records: the opening ask, every stored prompt and reply, and the closing message.';
        }
        // The one state where the button is dead says why, where the reason is:
        // a greyed control with no account of itself is the defect this view's
        // front door already had once.
        if (!this.canRun) {
          return 'Every file of every repo is not a listing worth reading. Pick a repo, or type to search names across all of them.';
        }
        return '';
      },

      // ── The scope controls ───────────────────────────────────────────────
      // Known only for the repo the shell scanned. Elsewhere '' is the honest
      // answer, and the picker renders it as "default branch" rather than
      // guessing a name.
      scopeDefaultRef() {
        const s = (typeof Alpine !== 'undefined' && Alpine.store?.('browser')) || {};
        return s.repo === this.repo ? (s.defaultRef || '') : '';
      },
      // A GH pointed at the SCOPED repo, for the folder picker's tree reads.
      // Without it the picker would walk the browsed repo while the list beside
      // it was scoped to another.
      scopeGh() {
        const base = (typeof Alpine !== 'undefined' && Alpine.store?.('browser')?.gh) || null;
        if (!base || !this.repo) return base;
        const inst = new base.constructor({ token: base.token, repo: this.repo });
        inst.ref = this.ref.trim();
        return inst;
      },
      // One root, the scoped repo at the scoped ref: the folder picker answers
      // "where in THIS repo", not "which repo", which the rail above owns.
      pickerRoots() {
        return this.repo ? [{ repo: this.repo, ref: this.ref.trim(), label: short(this.repo) }] : [];
      },
      // The picker caches its roots at first open and would otherwise keep
      // showing the repo and ref you opened it on. Reset it whenever the scope
      // it was built for has moved, then open INSIDE the single root: a
      // one-row "pick a repo" level, in a control that exists to pick a folder
      // of the repo already named two controls to its left, is a tap that
      // asks a question with one answer.
      openDirPicker() {
        const pp = this.$refs.dirPicker?.querySelector('[x-data]')?.__pathPicker;
        if (!pp) return;
        const key = this.repo + '@' + this.ref.trim();
        if (pp.__scopeKey !== key) {
          pp.__scopeKey = key;
          pp._loaded = false; pp.tree = []; pp.scope = []; pp.error = '';
        }
        pp.toggle();
        if (!pp.open) return;
        Promise.resolve(pp.ensureTree()).then(() => {
          if (pp.open && !pp.scope.length && pp.tree.length === 1) pp.choose(pp.tree[0]);
        });
      },
      // Switching repos drops the ref and the folder with it: both name places
      // inside the repo you just left, and carrying them forward would scope a
      // listing to a branch and a folder the new repo very likely does not have.
      pickRepo(repo) {
        const next = repo === this.repo ? '' : repo;
        if (next === this.repo) return;
        this.repo = next; this.ref = ''; this.path = '';
        this.rerun();
      },
      pickRef(ref) {
        if ((ref || '') === this.ref) return;
        this.ref = ref || '';
        this.rerun();
      },

      sameFile(a, b) {
        return !!a && !!b && a.repo === b.repo && (a.ref || '') === (b.ref || '') && a.path === b.path;
      },
      isOpen(h) { return h.kind === 'file' && this.sameFile(h, this.open); },

      setMode(m) {
        if (this.mode === m) return;
        this.mode = m;
        this.rerun();
      },
      // A scope change is a new question, so the cap resets with it: carrying a
      // raised cap into a narrower scope would show a fuller list than the one
      // that was asked for and read as the scope not having taken.
      scopeTo(p) {
        const next = String(p || '').replace(/^\/+|\/+$/g, '');
        if (next === this.scope) return;
        this.path = next;
        this.rerun();
      },
      // Re-run only once something has been run: a control touched before the
      // first search is being set up, not re-asked.
      rerun() {
        this.cap = this.CAP_STEP;
        if (this.ran && this.canRun) this.run();
      },
      more() {
        this.cap += this.CAP_STEP;
        if (this.canRun) this.run();
      },

      async run() {
        const q = this.q.trim();
        const S = window.__shell;
        const ES = window.EstateSearch;
        if (!this.canRun || this.busy || !ES || !S?.hasToken?.()) return;
        const under = this.scope;
        this.busy = true; this.error = ''; this.hits = []; this.total = 0; this.truncated = false;
        try {
          if (this.mode === 'names' && this.browsing) {
            // ONE LEVEL, folders and all. An empty query is not a search with
            // nothing typed in it, it is the question "what is in here", and
            // that question has folders in its answer. Flattening a repo into
            // its blobs was a listing you could read and not one you could
            // walk, which is what a file browser is for; typing turns it back
            // into the recursive match below, so the box is the switch between
            // the two readings and needs no control of its own.
            const res = await ES.level({
              repo: this.repo, ref: this.ref.trim(), under, token: window.TOKEN,
            });
            this.truncated = res.truncated;
            const dirs = res.dirs.map(d => ({
              key: 'd:' + d.path, icon: 'ph-folder', tint: 'text-warning', mono: true, label: d.name,
              sub: d.n + (d.n === 1 ? ' file' : ' files'),
              kind: 'dir', path: d.path,
            }));
            const files = res.files.slice(0, this.cap).map(f =>
              this.fileRow({ repo: this.repo, ref: this.ref.trim(), path: f.path, size: f.size },
                           { key: 'n:' }));
            // The way back out, at the top of the list where a file browser
            // has always put it. The crumb trail above says the same thing and
            // is the better target on a pointer; this is the one a thumb
            // reaches without leaving the list.
            const up = under ? [{
              key: 'up', icon: 'ph-arrow-bend-left-up', mono: true, label: '..',
              kind: 'dir', path: under.split('/').slice(0, -1).join('/'),
            }] : [];
            this.hits = [...up, ...dirs, ...files];
            this.total = up.length + dirs.length + res.files.length;
          } else if (this.mode === 'names') {
            const repos = (this.repo ? [{ repo: this.repo }] : this.repos().map(r => ({ repo: r.repo })))
              .map(r => ({ ...r, ref: this.ref.trim() }));
            const res = await ES.names({ q, repos, token: window.TOKEN, cap: this.cap, under });
            this.truncated = res.truncated;
            if (res.errors.length) this.error = 'Some trees could not be read: ' + res.errors.join('; ');
            this.hits = res.hits.map(h => this.fileRow(h, { key: 'n:' }));
            this.total = res.total;
          } else if (this.mode === 'contents') {
            const owner = (S.estateRepos?.[0]?.repo || S.REGISTRY_REPO || '').split('/')[0];
            // The folder scope is the API's own `path:` qualifier, so scoping
            // narrows the search rather than the results it already paid for.
            const scope = (this.repo ? 'repo:' + this.repo : 'user:' + owner) + (under ? ' path:' + under : '');
            const res = await ES.code({ q, scope, token: window.TOKEN, perPage: Math.min(this.cap, 100) });
            this.hits = res.hits.map(h => this.fileRow(h,
              { key: 'c:', icon: 'ph-file-magnifying-glass', note: h.frag }));
            this.total = res.total;
          } else {
            const res = await ES.sessions({ q, registry: S.REGISTRY_REPO, token: window.TOKEN });
            this.hits = res.hits.map(h => ({
              key: 's:' + h.id, icon: 'ph-chat-circle-text',
              label: h.ask ? String(h.ask).replace(/\s+/g, ' ').slice(0, 100) : h.id,
              sub: h.day, note: h.frag,
              kind: 'session', id: h.id, day: h.day,
            }));
            this.total = res.total;
          }
          this.ran = true;
          this.stamp();
        } catch (e) { this.error = String(e?.message || e); this.ran = true; }
        finally { this.busy = false; }
      },

      // The address follows the search AND the open file, so this screen can be
      // shared as what is on it rather than as the query behind it.
      stamp() {
        const S = window.__shell;
        if (!S) return;
        S.searchSeed = {
          q: this.q.trim(), mode: this.mode, repo: this.repo, ref: this.ref.trim(),
          path: this.scope,
          file: this.open ? window.RepoAddress?.fmt?.(this.open) || '' : '',
        };
        S.syncUrl?.();
      },

      clear() {
        this.hits = []; this.total = 0; this.error = ''; this.ran = false; this.truncated = false;
        this.cap = this.CAP_STEP;
        this.open = null; this.openNote = '';
        const S = window.__shell;
        if (S) { S.searchSeed = null; S.syncUrl?.(); }
      },
      refreshCaches() {
        window.EstateSearch?.reset?.();
        if (this.ran && this.canRun) this.run();
      },

      openHit(h) {
        if (h.kind === 'dir') return this.scopeTo(h.path);
        if (h.kind === 'file') return this.showFile(h);
        if (h.kind === 'session') {
          document.dispatchEvent(new CustomEvent('web-tools:open-session',
            { detail: { id: h.id, day: h.day } }));
        }
      },

      // Read a file in place. `ref` '' rides through to the repo's default
      // branch (RepoAddress's rule: parse honestly, resolve late), which is
      // what a contents hit always carries. Every outcome shows something: a
      // failed fetch renders its reason where the file would be, so the
      // position counter never points at a blank pane.
      async showFile(f) {
        if (!f?.repo || !f?.path) return;
        this.open = { repo: f.repo, ref: f.ref || '', path: f.path };
        this.openNote = ''; this.openBusy = true;
        this.stamp();
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: f.repo });
          gh.ref = f.ref || '';
          const res = await gh.get(f.path);
          this.openBusy = false;
          this.$nextTick(() => document.getElementById('search-file-viewer')?.__viewer
            ?.show(f.path, fmt(res.text), { repo: f.repo, ref: f.ref || '' }));
        } catch (e) {
          this.openBusy = false;
          this.openNote = 'Could not load it: ' + (e?.message || e);
        }
      },
      step(dir) {
        const i = this.openIndex + dir;
        const next = this.fileHits[i];
        if (next) this.showFile(next);
      },
      closeFile() {
        this.open = null; this.openNote = ''; this.openBusy = false;
        this.stamp();
      },
      // ── The deck ─────────────────────────────────────────────────────────
      //
      // The results, read one at a time. The pane beside the list is for
      // INVESTIGATING one hit (controls, a stepper, room to compare it against
      // the list); the deck is for GOING THROUGH them, which is what a fifty-row
      // answer to "where does this appear" is usually for and what a phone can
      // do at all. Same split the view's own header note draws between the
      // finder and this view, one level down.
      //
      // THE DECK AND THE PANE ARE ONE POSITION, not two. It opens on the file
      // the pane has open, every slide change writes that file back to `open`,
      // and `open` is what the list highlights and what `stamp()` puts in the
      // URL. So dismissing the deck leaves the reader on the file they stopped
      // at, with the list scrolled to it, and a `?sfile=` link minted mid-deck
      // reopens on the same file. A deck holding a position of its own would
      // have made the stepper and the swipe disagree about "where am I".
      //
      // Folders and session rows are not in it: `fileHits` is the readable
      // subset, which is also what the stepper counts, so a browse listing decks
      // its files and keeps its folders in the list where they are walked.
      plural(n, noun) { return n + ' ' + noun + (n === 1 ? '' : 's'); },

      async openDeck(start) {
        if (this.deckOpening || this._deck) return;
        const files = this.fileHits;
        if (!files.length) return;
        const at = Math.max(0, Math.min(files.length - 1,
          typeof start === 'number' ? start : Math.max(0, this.openIndex)));
        this.deckOpening = true;
        try {
          if (!window.swipeDeck && window.gh?.load) await window.gh.load('kits/swipe-deck.js');
          if (!window.swipeDeck) throw new Error('the swipe deck kit did not load');
          this._deckFiles = files;
          this._deckOnePlace = new Set(files.map(f =>
            f.repo + '@' + (f.ref || '') + '/' + dirOf(f.path))).size < 2;
          // A deck already open becomes the parent, so this drills rather than
          // stacking: reached from a surface that is itself a deck, Back returns
          // there. Opened from the view there is none and it is the root.
          const parent = window.swipeDeck.top?.() || null;
          const opts = {
            count: files.length,
            start: at,
            ...this._deckChrome(at),
            // The contents list, which this set needs more than most: fifty
            // hits is far past the footer's countable dots, and the rows are
            // the same two lines the header carries, so the reader recognizes
            // them from the list they tapped in from.
            index: (i) => {
              const c = this._deckChrome(i);
              return { title: c.title, subtitle: this._deckOnePlace ? '' : c.subtitle, icon: c.icon };
            },
            render: (i, slide) => this._deckRender(i, slide),
            release: (i, slide) => { slide.replaceChildren(); },
            // The slide is a file being read: the viewer owns the vertical axis
            // and a wide code view scrolls inside its own box rather than
            // widening the track.
            slideScroll: false,
            innerClass: 'h-full w-full min-w-0',
            // A reading surface, so the chrome steps aside on the way down a
            // file and comes back on the way up or on the next file.
            immersive: true,
            onSlide: (i) => {
              const f = this._deckFiles?.[i];
              const h = this._deck;
              if (h) { const c = this._deckChrome(i); h.setTitle(c.title); h.setSubtitle(c.subtitle); h.setIcon(c.icon); h.setLink(c.link); }
              if (!f) return;
              this.open = { repo: f.repo, ref: f.ref || '', path: f.path };
              this.openNote = ''; this.openBusy = false;
              this.stamp();
            },
            onClose: () => { this._deck = null; this._deckFiles = null; },
          };
          this._deck = parent ? window.swipeDeck.drill(parent, opts) : window.swipeDeck.open(opts);
          // The starting slide fires no onSlide, so the pane is put on the same
          // file here rather than only from the second swipe onward.
          const f0 = files[at];
          if (f0) { this.open = { repo: f0.repo, ref: f0.ref || '', path: f0.path }; this.openNote = ''; this.stamp(); }
        } catch (e) {
          this.error = 'Could not open the deck: ' + (e?.message || e);
        } finally { this.deckOpening = false; }
      },

      // The header for slide i: what the file is called, where it lives, and
      // the one door out. The filename is the title and the directory rides the
      // subtitle beside the repo, the split kits/file-deck.js settled: a header
      // truncated from the right otherwise spends its width on the path and
      // drops the one word the reader is looking for.
      _deckChrome(i) {
        const f = this._deckFiles?.[i] || {};
        const path = f.path || '';
        const j = path.lastIndexOf('/');
        const where = short(f.repo) + (f.ref ? '@' + f.ref : '');
        return {
          title: j < 0 ? path : path.slice(j + 1),
          subtitle: [where, j < 0 ? '' : path.slice(0, j)].filter(Boolean).join(' · '),
          icon: f.icon || 'ph-file',
          // `HEAD` where the hit named no ref, which is every contents hit:
          // GitHub resolves it to the repo's default branch, which is exactly
          // what an unspecified ref means here (RepoAddress's rule: parse
          // honestly, resolve late). Guessing `main` would 404 on a repo that
          // calls it something else.
          link: f.repo && path ? {
            href: 'https://github.com/' + f.repo + '/blob/' + (f.ref || 'HEAD') + '/' + path,
            icon: 'ph-github-logo', title: 'Open ' + path + ' on GitHub',
          } : null,
        };
      },

      // A slide is the shared viewer, driven the way showFile() drives the
      // pane's: one contents call, then show().
      //
      // `identify: false` because THIS DECK'S HEADER IS THE FILE HEADER, set per
      // slide above; a viewer naming itself underneath would print the name
      // twice, elided two different ways, which is the call the stage reader and
      // kits/file-deck.js both made. What that drops with it is the viewer's own
      // control row: the mode switch and the Raw / CDN / toss links. Deliberate
      // and not carried up, because this is the READING pass and the pane is one
      // dismiss away holding all of it, on the same file the deck stopped at.
      _deckRender(i, slide) {
        const f = this._deckFiles?.[i];
        if (!f) return;
        const el = document.createElement('div');
        el.className = 'flex flex-col h-full w-full min-w-0 overflow-hidden p-3';
        el.setAttribute('x-data', 'viewer({ bindStore: false, fill: true, identify: false, '
          + 'defaultMode: (f) => window.ViewRegistry.READ_MODE(f) })');
        slide.append(el);
        window.Alpine.initTree(el);
        this._deckDrive(f, el, slide);
      },
      // Every outcome shows something, the same promise the pane makes: a failed
      // fetch renders its reason where the file would be, so a swipe never lands
      // on a blank slide and the counter stays truthful.
      async _deckDrive(f, el, slide) {
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: f.repo });
          gh.ref = f.ref || '';
          const res = await gh.get(f.path);
          // The reader may be two slides past this one by now, and swipe-deck
          // empties what it has left; showing into a popped tree throws.
          if (!el.isConnected) return;
          await el.__viewer?.show(f.path, fmt(res.text), { repo: f.repo, ref: f.ref || '' });
        } catch (e) {
          if (!el.isConnected) return;
          el.remove();
          const note = document.createElement('div');
          note.className = 'flex flex-col items-center justify-center gap-2 h-full text-center px-6';
          note.innerHTML = '<i class="ph ph-file-dashed text-4xl opacity-25"></i>'
            + '<p class="text-base text-base-content/60"></p>';
          note.querySelector('p').textContent = 'Could not load it: ' + (e?.message || e);
          slide.append(note);
        }
      },

      // The one route back to the per-repo tree walk, for when the question is
      // where a file SITS rather than what it says.
      openInFiles() {
        const f = this.open;
        const S = window.__shell;
        if (!f || !S) return;
        (async () => {
          await S.ensureBrowser?.(f.repo, f.ref || undefined);
          S.openFile?.(f.path);
        })();
      },
    };
  });
});
