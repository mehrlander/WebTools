document.addEventListener('alpine:init', function() {
  Alpine.data('estate', function() {
    // The all-repo estate, a context above any repo with two views of its own,
    // switched from the sidebar (the shell owns the view state):
    //   Repos     — a card per repo that opts in. Membership and every
    //               descriptive field live in each repo's OWN .web-tools.json
    //               (estate:true, group, note, icon, order); the
    //               estate discovers members by enumerating the account's repos
    //               and reading their configs, served through the registry's
    //               config cache (state/configs.json) with a live-scan fallback.
    //               The registry holds no per-repo config. Cards lay out as a
    //               full-width grid grouped by group (like the pages index).
    //   Surfaces  — two sources, stacked. General: the registry's curated
    //               surfaces/*.surface files, editable in place through a JSON
    //               dialog (cross-repo estate content, so they stay in the
    //               registry). Per-repo: each repo that names a `surface` in its
    //               OWN .web-tools.json contributes its file below the general
    //               ones, grouped under the repo (read-only here; edit it in its
    //               repo). Archive category excluded.
    //   Activity  — one header-nav stop for the estate's live layer, three
    //               sub-tabs on a segmented pill (each still its own shell
    //               view key, so ?view= deep links stay per-sub-view):
    //     Open    : the cross-repo live branches (the activity cache).
    //     To-do   : a personal, general checklist (lists/todo.json in the
    //               registry). Not repo-scoped and not a surface (no items,
    //               kinds, or curation, just text, done, and an urgent flag
    //               that carries a rail and sorts to the top).
    //     Jots    : quick-captured ideas (lists/jots.json in the registry).
    //               The capture sibling of To-do: same file mechanics, no done
    //               state. A jot waits in the pile until it is promoted
    //               somewhere real (an entry, a task, a to-do) or deleted.
    //               The trio reads as a gradient of commitment: a jot is
    //               unshaped intent, a to-do is shaped intent, an open branch
    //               is intent in flight.
    //     Pins    : internal links kept at hand (lists/pins.json in the
    //               registry), rendered above the two lists in the Lists
    //               pane. Off the commitment gradient on purpose: a pin is
    //               not intent but memory, a pointer to something that
    //               already has a home elsewhere.
    // One component renders every estate view; `tab` reads the shell view.
    // Public (no token): the public default card only, no surfaces, no lists.
    // See docs/show-repo.md "The estate".
    // Keyed by the v2 `type` (genre), where v1 keyed by `kind` (genre and
    // transport fused). lib/kits/surface.js does the split on read, so this table
    // shrank to genre alone and a v1 file still lands on the right icon.
    // Verdict styling for the per-card adoption read (lib/kits/portable-align.js
    // grades; this only colours). 'optout' is a stated position, not a failure,
    // so it reads neutral rather than as a missing check.
    const ADOPT_VERDICT = {
      aligned:   { cls: 'badge-success' },
      partial:   { cls: 'badge-warning' },
      optout:    { cls: 'badge-neutral' },
      unaligned: { cls: 'badge-ghost' },
      hub:       { cls: 'badge-primary' },
      registry:  { cls: 'badge-primary' },
    };
    const TYPE_ICONS = {
      file: 'ph-file', directory: 'ph-folder', repo: 'ph-git-branch',
      link: 'ph-link', note: 'ph-note', story: 'ph-book-open', embed: 'ph-app-window',
    };
    // Activity's sub-views, each its own shell view key so a ?view= deep link
    // opens the pane it names. Named once because four places read the set (the
    // pill row's x-show, the two composite wrappers, and the `tab` getter), and
    // when there were three the list was written out four times and a fourth
    // pane meant finding all four.
    const ACTIVITY_TABS = ['activity', 'sessions', 'guides', 'chats', 'routes'];
    // The Routes pane reads the hub's own manifest and the hub's own history:
    // the routes are show-repo's, and show-repo lives here. Named once rather
    // than threaded through, since a fork changes the constant and nothing else.
    const ROUTES_REPO = 'mehrlander/web-tools';
    const ROUTES_MANIFEST = 'docs/app-routes.csv';
    const ROUTES_VOCAB = 'docs/vocabularies.csv';
    // The archive is a venue, not a projection of the repos, so it names its
    // own repo rather than being discovered through estate membership: no other
    // repo can supply a chat corpus, and a pane that scanned for one would be
    // pretending the source is pluggable. Overridable from the shell for a fork.
    const CHATS_REPO = 'mehrlander/chat-histories';
    // Seed for a brand-new surface: v2, since a reader now exists. Inert until
    // filled, so saving as-is is safe.
    const SURFACE_TEMPLATE = {
      manifest: { name: '', description: '', category: 'showcase',
                  schema: { name: 'surface', version: 2 } },
      items: [],
    };
    // The personal lists live under lists/ in the registry: authored
    // content written through this UI, kept out of state/ (derived caches).
    const TODO_PATH = 'lists/todo.json';
    const JOTS_PATH = 'lists/jots.json';
    const PINS_PATH = 'lists/pins.json';
    // Every list read below is a read that feeds a write: the to-do and pin
    // savers commit the whole local array, so whatever the load got is what the
    // next gesture writes back. Reading those through the browser's 60-second
    // HTTP cache turns any check-off into a lost update against anything that
    // wrote in the meantime, including this pane a moment ago. GH.FRESH is the
    // opt-out, and the fallback keeps a stubbed GH working in tests.
    const FRESH = () => (window.GH && window.GH.FRESH) || { cache: 'no-store' };
    // Clip an item's text for a commit subject line.
    const clip = (s, n = 60) => s.length > n ? s.slice(0, n - 1) + '…' : s;

    // A to-do's due date: a plain YYYY-MM-DD, read in whole LOCAL calendar
    // days, so "today" means today's date and not the next twenty-four hours.
    // `now` is a parameter rather than a call to Date inside, so the bands are
    // testable without pinning a clock.
    //
    // Why a date at all, beside the urgent flag: the flag has no expiry, so it
    // decays into noise once a busy week has flagged everything, and clearing
    // it is a chore nobody does. A date arrives on its own and stops mattering
    // on its own. The two are independent and both route to one signal, `isHot`
    // below, because the rail answers one question: does this need me now.
    const DUE = {
      days(due, now = new Date()) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(due || ''));
        if (!m) return null;
        const then = new Date(+m[1], +m[2] - 1, +m[3]);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return Math.round((then - today) / 86400000);
      },
      // Only late and today turn a row hot. `soon` colors its own chip and
      // stays put: a list that shouts three days early is a list that is being
      // ignored by the day it matters.
      state(due, now) {
        const n = DUE.days(due, now);
        if (n === null) return '';
        return n < 0 ? 'late' : n === 0 ? 'today' : n <= 3 ? 'soon' : 'later';
      },
      // Relative up to a week out, where "4d" is easier to act on than a date,
      // then the date itself, where the count of days has stopped meaning
      // anything. The past side never abbreviates to a date: how late a thing
      // is IS the fact.
      label(due, now) {
        const n = DUE.days(due, now);
        if (n === null) return '';
        if (n < 0) return -n + 'd late';
        if (n === 0) return 'today';
        if (n === 1) return 'tomorrow';
        if (n <= 6) return n + 'd';
        const [y, mo, d] = String(due).split('-').map(Number);
        return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      },
    };

    // THE AGE PILL, in place of the four Refresh buttons this view used to
    // carry (one on Repos, one on each of Activity's three panes).
    //
    // Each of those sat beside an as-of reading that was `hidden sm:inline`, so
    // a phone kept the control and dropped the fact, which is backwards: the
    // reading is what tells you whether to press. The pill is the reading, at
    // every width, and it is the control: it opens the State view, where every
    // derived thing is listed with its age, its throttle, what it costs, and
    // its own Refresh. One tap to the control instead of zero, and the estate
    // chrome loses four buttons.
    //
    // `item` is the State row the pill aims at, carried as `?view=state&item=`
    // so the link lands on the cache it came from rather than on a list of six.
    // Without it the pill answers a narrower question than it asks.
    //
    // While a crawl runs the pill says so and stays put, since the progress bar
    // and the toast already belong to the pane that shows the result. A crawl
    // started from State reports here, unchanged: the busy flags are the
    // shell's, not any one view's.
    // `fresh` names a signal that only the branches pill has: opening a file
    // card re-reads that branch live and writes the answer back, so some rows
    // are newer than the one age this pill states. Marked with a dot and named
    // on hover rather than restating the age, since "as of 1h, except four rows"
    // is not a time.
    const agePill = (item, ago, busy, busyLabel, what, fresh) => `
      <button @click="window.__shell?.goState('${item}')"
              class="flex items-center gap-1.5 text-base px-2 py-1 rounded-lg transition-colors
                     text-base-content/50 hover:text-primary hover:bg-base-200"
              :title="'${what}: open State on this row for what builds it, what it costs, and Refresh'
                      + (${fresh || 0} ? '\\n' + ${fresh || 0} + ' row(s) re-read since, from a file card opened on them'
                                       : '')">
        <i class="ph text-base" :class="${busy} ? 'ph-circle-notch animate-spin' : 'ph-stack-simple'"></i>
        <span x-text="${busy} ? '${busyLabel}' : (${ago} ? 'as of ' + agoShort(${ago}) : 'no cache')"></span>
        <span x-show="${fresh || 0}" class="w-1.5 h-1.5 rounded-full bg-success/60 shrink-0"></span>
      </button>`;

    // ── The crawl in flight: a line beside the pane's pill, a bar over its
    // list ──────────────────────────────────────────────────────────────────
    // Both read the shell's progress channel, a slot per cache key, so the two
    // crawls that report here (activity and sessions) draw one piece of markup
    // rather than one each, and the State view's rows draw the same slots. The
    // verb and the unit ride in the slot, since only the crawl knows whether it
    // is on the quick pass or the scan, or counting repos rather than session
    // records. A crawl started from State fills the slot the same way, which is
    // what makes a press over there report over here.
    //
    // Guides gets neither. Its shelf is one listing per repo assembled in
    // memory, with nothing committed and no denominator worth drawing, so its
    // pill says "Reading…" and that is the honest whole of it.
    const crawlLine = (key, busy) => `
      <span x-show="${busy}" class="hidden sm:inline text-base text-base-content/60"
            x-text="crawlLabel('${key}')"></span>`;

    // A styled div, not <progress>: a progress element with no value (or a
    // value some Alpine/daisyUI pairing drops) falls back to the INDETERMINATE
    // sweep, which is exactly the churn this replaces, and it does it at 0 of N,
    // the moment the reading matters most. An explicit width cannot fall back.
    const crawlBar = (key, busy) => `
      <div x-show="${busy}" class="mb-3">
        <div class="h-1 w-full rounded-full bg-base-300 overflow-hidden" role="progressbar"
             :aria-valuenow="crawlPct('${key}')" aria-valuemin="0" aria-valuemax="100">
          <div class="h-full bg-primary rounded-full transition-[width] duration-300"
               :style="'width:' + crawlPct('${key}') + '%'"></div>
        </div>
        <!-- Narrow screens: the pill row's slot is hidden below sm, so the bar
             carries its own caption. -->
        <div class="sm:hidden mt-1 text-sm text-base-content/50 truncate"
             x-text="crawlLabel('${key}') + (crawlActive('${key}') ? ' · ' + crawlActive('${key}') : '')"></div>
      </div>`;

    return {
      description: 'All-repo estate: a full-width grouped grid of opted-in repo cards (membership + fields in each repo\'s own config), stacked surfaces (the private registry\'s editable ones plus each repo\'s own declared surface), a personal to-do list, a jots pile for quick idea capture, and a pin list of internal links kept at hand',

      template: `
        <div :class="tab==='lists' && 'flex-1 min-h-0 flex flex-col'">
          <!-- ── Repos view ─────────────────────────────────────────────── -->
          <div x-show="tab==='repos'">
            <!-- No page title, prose, or top add bar: the header nav marks the
                 active view, and adding a repo is per-category (the + on each
                 group header, which prefills that group and lets you retype it
                 for a new category). So the grid starts at the top. -->

            <!-- Signed-out actions: a token, or the rate-safe public browser.
                 The two buttons name themselves and the subtitle above states
                 the signed-out state, so no explanatory prose. -->
            <div x-show="!authed" class="flex flex-wrap items-center gap-2 mb-6">
              <button @click="accountPanel()"
                      class="btn btn-primary gap-1"><i class="ph ph-key"></i>Add a token</button>
              <button @click="window.__shell?.goPublicBrowse()"
                      class="btn btn-ghost gap-1 border border-base-300"><i class="ph ph-cloud-arrow-down"></i>Public browse</button>
              <a href="https://github.com/settings/tokens/new?scopes=repo&description=web-tools" target="_blank"
                 rel="noopener" class="text-base text-base-content/40 hover:text-primary underline flex items-center gap-1">
                <i class="ph ph-arrow-square-out"></i>Get a token</a>
            </div>

            <!-- Add a repo to the estate (authed): sets estate:true in the
                 chosen repo's OWN .web-tools.json, so membership lives with the
                 repo, not in a registry list. -->
            <div x-show="addOpen" class="card bg-base-100 border border-base-300 shadow-sm max-w-md mb-6">
              <div class="card-body p-4 gap-2">
                <div class="text-base font-semibold flex items-center gap-1.5">
                  <i class="ph ph-plus-circle text-primary"></i>
                  <span x-text="addGroup ? ('Add a repository to ' + addGroup) : 'Add a repository'"></span>
                </div>
                <input list="estate-repo-candidates" x-model="addName" placeholder="owner/repo"
                       autocapitalize="off" autocorrect="off" spellcheck="false"
                       @keyup.enter="addRepo()"
                       class="input input-bordered font-mono text-base">
                <datalist id="estate-repo-candidates">
                  <template x-for="c in candidates" :key="c"><option :value="c"></option></template>
                </datalist>
                <div class="flex gap-1.5">
                  <!-- group is a combobox: type a new one or pick an existing
                       group (the datalist lists the estate's current groups, so
                       the group names are visible before you commit to one). -->
                  <input list="estate-group-options" x-model="addGroup" placeholder="group (optional)"
                         autocapitalize="off" autocorrect="off" spellcheck="false"
                         class="input input-bordered text-base flex-1">
                  <datalist id="estate-group-options">
                    <template x-for="g in groupOptions" :key="g"><option :value="g"></option></template>
                  </datalist>
                  <input x-model="addNote" placeholder="note (optional)"
                         class="input input-bordered text-base flex-[2]">
                </div>
                <div class="flex items-center justify-end gap-2">
                  <button @click="addOpen=false" class="btn btn-ghost">Cancel</button>
                  <button @click="addRepo()" :disabled="!addName.trim() || adding"
                          class="btn btn-primary gap-1">
                    <span x-show="adding" class="loading loading-spinner loading-md"></span>
                    <span x-text="adding ? 'Adding…' : 'Add'"></span>
                  </button>
                </div>
              </div>
            </div>

            <!-- The signed-in ACCOUNT BAR: the two app-level controls, right-
                 aligned above the grid.

                 Account is the one thing the retired header shield did that no
                 per-repo surface covers, naming the identity in play and letting
                 you replace or clear the token. It belongs to the account, so it
                 sits on the account's own view (Repos, the dashboard) rather than
                 in the chrome of every repo. Quiet: a status line you can act on,
                 not a button competing with the grid.

                 The second is the AGE of what these cards are drawn from: the
                 config cache. It used to be a Refresh button with no reading
                 beside it at all, which asked for a decision ("is this current
                 enough to re-crawl?") while withholding the only fact that
                 answers it. The pill states the age and opens State, where the
                 crawl is one tap away with its cost and throttle named. The
                 shield's estate panel held the old button, which is why
                 retiring the shield cost nothing; State is now its address. -->
            <div x-show="authed" class="flex items-center justify-end gap-3 mb-3">
              <button @click="accountPanel()" title="GitHub token"
                      class="flex items-center gap-1.5 text-base text-base-content/40 hover:text-primary transition-colors">
                <i class="ph text-base leading-none"
                   :class="window.__shell?._authState === 'expired' ? 'ph-warning text-warning' : 'ph-shield-check text-success'"></i>
                <span class="font-mono" x-text="window.__shell?._authUser || 'token'"></span>
              </button>
              ${agePill('configs', 'configsGeneratedAt', "window.__shell?.configRefreshing", 'Syncing…', 'Repo configs')}
            </div>

            <div x-show="loading" class="flex justify-center py-16">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>

            <!-- The grid: a section per group (header + count), each a full-width
                 three-wide grid of cards, like the pages index. Group order and
                 within-group order come from each repo's own order weight; a
                 -private companion renders inside its parent's card. -->
            <template x-for="sec in groupSections" :key="sec.group">
              <section class="mb-8">
                <h2 x-show="sec.group" class="text-base font-mono uppercase tracking-widest text-base-content/40 mb-3 flex items-center gap-2">
                  <i class="ph ph-folder"></i><span x-text="sec.group"></span>
                  <span class="badge badge-ghost badge-sm" x-text="sec.items.length"></span>
                  <!-- Per-category add: prefills this group, so adding a repo here
                       is one fewer field. The group stays editable in the form. -->
                  <button x-show="authed" @click="openAdd(sec.group)"
                          class="text-base-content/30 hover:text-primary transition-colors"
                          :title="'Add a repo to ' + sec.group">
                    <i class="ph ph-plus text-base leading-none"></i></button>
                </h2>
                <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <!-- One card, possibly two faces: face(e) is the entry being
                       shown — the entry itself, or its nested -private companion
                       when the visibility toggle has flipped the card. Every
                       field below reads face(e). -->
                  <template x-for="e in sec.items" :key="e.repo">
                    <div class="card bg-base-100 border border-base-300 shadow-sm hover:border-primary/40 transition-colors w-full">
                      <div class="card-body p-4 gap-1.5">
                        <div class="flex items-center gap-1.5">
                          <i class="ph text-xl text-primary shrink-0" :class="face(e).icon"></i>
                          <button @click="openRepo(face(e).repo)"
                                  class="font-mono text-base font-semibold truncate hover:text-primary transition-colors cursor-pointer text-left"
                                  x-text="face(e).repo.split('/')[1]"></button>
                          <div class="grow"></div>
                          <!-- The sidebar row's pair of triggers, on the card:
                               the github button opens the GitHub destinations,
                               the visibility marker opens the actions menu, and
                               the gear left for that menu's Config row, so
                               acting on a repo is one gesture on both surfaces
                               (task estate-cards-icon-cluster). A paired card's
                               face switch rides the menu as a contributed row:
                               the shell's own menu notes place that jump with
                               the surface that shows one of the pair and hides
                               the other, which is exactly these cards. -->
                          <button @click.stop="cardMenu(e, $event, 'github')"
                                  @mouseenter="cardMenuHover(e, $event, 'github')" @mouseleave="menuLeave()"
                                  :title="'GitHub links for ' + face(e).repo"
                                  class="text-base-content/30 hover:text-primary transition-colors shrink-0 cursor-pointer"
                                  :class="menuTint(e, 'github')">
                            <i class="ph ph-github-logo text-base leading-none"></i></button>
                          <button @click.stop="cardMenu(e, $event, 'actions')"
                                  @mouseenter="cardMenuHover(e, $event, 'actions')" @mouseleave="menuLeave()"
                                  :title="(face(e).meta ? (face(e).meta.priv ? 'Private. ' : 'Public. ') : '') + 'Actions for ' + face(e).repo"
                                  class="text-base-content/40 hover:text-primary transition-colors shrink-0 cursor-pointer"
                                  :class="menuTint(e, 'actions')">
                            <i class="ph text-base leading-none"
                               :class="!face(e).meta ? 'ph-dots-three-vertical' : (face(e).meta.priv ? 'ph-lock' : 'ph-globe')"></i></button>
                        </div>
                        <p class="text-base text-base-content/70 min-h-8" x-text="face(e).note || face(e).meta?.desc || ''"></p>

                        <!-- Pins and projects were here until 2026-07-31, as two
                             bands of static navigation sitting directly above
                             the only row that reports live state. Both are one
                             sidebar tap away and neither changes, so on a card
                             they cost the branch and warning badges the place
                             the eye lands first. A card answers "does this repo
                             need me?", and a list that reads the same every day
                             cannot help answer it. -->

                        <!-- Scope and adoption, live per card. These were a
                             separate Map tab, which meant "what is this repo
                             for, and does it carry the set" lived one view away
                             from the cards that answer everything else about a
                             repo. A card exists to say whether a repo needs you;
                             a second grid of the same repos was a copy of the
                             roster with different columns. The verdict rides
                             beside the name, the four checks sit in one chip
                             row, and the scope story expands rather than
                             pushing the live rows off the card. -->
                        <div x-show="adopt(e)" class="flex flex-col gap-1 mt-0.5">
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="badge badge-sm" :class="verdictCls(adopt(e))" x-text="adopt(e)?.verdict"></span>
                            <template x-for="c in adoptChips(e)" :key="c.label">
                              <span class="badge badge-sm" :class="c.on ? 'badge-outline' : 'badge-ghost text-base-content/35'"
                                    :title="c.title || ''">
                                <i class="ph text-xs" :class="c.on ? 'ph-check' : 'ph-x'"></i><span x-text="c.label"></span></span>
                            </template>
                            <button x-show="scopeOf(e)" @click.stop="scopeOpen = scopeOpen === face(e).repo ? '' : face(e).repo"
                                    class="badge badge-sm badge-ghost gap-1 cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
                                    :title="scopeOpen === face(e).repo ? 'Hide scope' : 'What this repo is for'">
                              <i class="ph text-base" :class="scopeOpen === face(e).repo ? 'ph-caret-up' : 'ph-book-open'"></i>scope
                            </button>
                          </div>
                          <!-- Expand to see: the scope statement is a paragraph
                               a repo wrote about itself, which is worth reading
                               once and not worth carrying on every card. -->
                          <template x-if="scopeOpen === face(e).repo">
                            <div class="text-base text-base-content/70 border-l-2 border-base-300 pl-2">
                              <p x-show="scopeText(adopt(e))" x-text="scopeText(adopt(e))"></p>
                              <a x-show="scopeFile(adopt(e))" :href="scopeFileGh(adopt(e))"
                                 :data-peek="face(e).repo + ':' + scopeFile(adopt(e))" target="_blank" rel="noopener"
                                 class="text-primary hover:underline inline-flex items-center gap-1">
                                <i class="ph ph-book-open"></i><span x-text="scopeFile(adopt(e))"></span></a>
                            </div>
                          </template>
                        </div>

                        <!-- Surface jump: this repo declares its own surface
                             (surface: in its .web-tools.json), so link straight
                             to its section on the Surfaces view. -->
                        <div x-show="face(e).hasSurface" class="flex flex-wrap items-center gap-1 mt-0.5">
                          <button @click="openRepoSurfaces(face(e).repo)"
                                  class="badge badge-sm badge-ghost gap-1 cursor-pointer
                                         hover:bg-primary/10 hover:text-primary transition-colors"
                                  title="This repo's surface">
                            <i class="ph ph-cards text-base"></i><span>surface</span>
                          </button>
                        </div>

                        <div class="flex items-center gap-2 text-base text-base-content/50">
                          <span x-show="face(e).meta?.ago" class="flex items-center gap-1">
                            <i class="ph ph-clock"></i><span x-text="'pushed ' + (face(e).meta?.ago || '')"></span>
                          </span>
                          <span x-show="face(e).err" class="text-warning flex items-center gap-1">
                            <i class="ph ph-warning"></i>unreachable
                          </span>
                        </div>

                        <!-- Branch rollup from the activity cache: a one-tap route
                             into the repo's branch review, plus stranded / open-PR
                             counts. Absent until the crawl has covered the repo. -->
                        <template x-if="cardActivity(face(e).repo)">
                          <div class="flex flex-wrap items-center gap-1 mt-0.5">
                            <button @click="openRepoBranches(face(e).repo)"
                                    class="badge badge-sm badge-ghost gap-1 font-mono cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
                                    :title="'Branch review (' + (cardActivity(face(e).repo)?.counts?.branches || 0) + ' branches)'">
                              <i class="ph ph-git-branch text-base"></i><span x-text="cardActivity(face(e).repo)?.counts?.branches || 0"></span>
                            </button>
                            <!-- The one badge in this row that means something is
                                 wrong, so it is the one that carries fill. As
                                 badge-ghost + text-warning it was the faintest
                                 element of the three, which is backwards: the
                                 counts beside it are neutral facts and this is
                                 the call to act. -->
                            <span x-show="cardActivity(face(e).repo)?.counts?.stranded"
                                  class="badge badge-sm badge-warning gap-1 font-mono"
                                  :title="cardActivity(face(e).repo)?.counts?.stranded + ' stranded branches'">
                              <i class="ph ph-warning-circle text-base"></i><span x-text="cardActivity(face(e).repo)?.counts?.stranded"></span>
                            </span>
                            <!-- Abandoned: a branch whose PR was closed
                                 unmerged. It sits beside stranded because it
                                 is the same kind of fact (something here wants
                                 a decision) and the opposite answer: stranded
                                 content wants rescuing, abandoned wants
                                 deleting. Ghost rather than filled, since it
                                 asks for a cleanup pass and not for attention
                                 now, which is what the stranded badge's fill
                                 is for; it carries the same weight as the
                                 open-PR badge beside it, which is the other
                                 ghost-plus-colored-glyph fact on this row.
                                 A tap opens the pane already on that scope. -->
                            <button x-show="cardAbandoned(face(e).repo)"
                                    @click="openAbandoned(face(e).repo)"
                                    class="badge badge-sm badge-ghost gap-1 font-mono text-error cursor-pointer hover:bg-error/10 transition-colors"
                                    :title="cardAbandoned(face(e).repo) + ' branches whose pull request was closed without merging'">
                              <i class="ph ph-x-circle text-base"></i><span x-text="cardAbandoned(face(e).repo)"></span>
                            </button>
                            <span x-show="cardActivity(face(e).repo)?.counts?.openPRs"
                                  class="badge badge-sm badge-ghost gap-1 text-primary"
                                  :title="cardActivity(face(e).repo)?.counts?.openPRs + ' open pull requests'">
                              <i class="ph ph-git-pull-request text-base"></i><span x-text="cardActivity(face(e).repo)?.counts?.openPRs"></span>
                            </span>
                            <!-- Declared checks, judged here rather than in the
                                 crawl: the cache stores each check's time-
                                 independent FACT, so this is where a clock
                                 turns "2026-07-18" into "13d since". That split
                                 is what keeps the cache from rehashing daily,
                                 and it means a card opened weeks after a crawl
                                 still reports a correct, staler answer. Only
                                 what is not passing renders. -->
                            <template x-for="c in cardChecks(face(e).repo)" :key="c.label">
                              <span class="badge badge-sm gap-1"
                                    :class="c.ok === false ? 'badge-warning' : 'badge-ghost text-base-content/40'"
                                    :title="c.label + ': ' + c.detail">
                                <i class="ph text-base"
                                   :class="c.ok === false ? 'ph-warning-circle' : 'ph-question'"></i>
                                <span x-text="c.label"></span>
                              </span>
                            </template>
                          </div>
                        </template>
                      </div>
                    </div>
                  </template>
                </div>
              </section>
            </template>

            <p x-show="authed && !loading && !groupSections.length" class="text-base text-base-content/50">
              No repos opt in yet.
            </p>

            <!-- ── Unfiled ────────────────────────────────────────────────────
                 The rest of the account, below the rule: the repos the cards
                 above filter out. Rows, not cards, so a repo you have decided
                 nothing about cannot compete with one you have. Each row carries
                 the three outcomes it actually has (adopt, set aside, retire on
                 GitHub) rather than a link and a shrug.

                 The two settled groups fold. That is the point of the section:
                 an undecided list that never empties is a second inventory, and
                 one that drains as you decide is a work surface. -->
            <template x-if="authed && !loading && unfiledRepos.length">
              <div class="mt-10 pt-6 border-t border-base-300">
                <template x-for="sec in unfiledSections" :key="sec.key">
                  <section class="mb-5">
                    <h2 class="mb-2">
                      <button @click="toggleUnfiled(sec)" :disabled="!sec.fold"
                              class="text-base font-mono uppercase tracking-widest text-base-content/40 flex items-center gap-2"
                              :class="sec.fold ? 'hover:text-primary transition-colors cursor-pointer' : 'cursor-default'">
                        <i class="ph" :class="sec.icon"></i>
                        <span x-text="sec.label"></span>
                        <span class="badge badge-ghost badge-sm" x-text="sec.items.length"></span>
                        <i x-show="sec.fold" class="ph text-base leading-none"
                           :class="unfiledShown(sec) ? 'ph-caret-down' : 'ph-caret-right'"></i>
                      </button>
                    </h2>
                    <div x-show="unfiledShown(sec)" class="flex flex-col gap-1.5">
                      <template x-for="r in sec.items" :key="r.repo">
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-base-300 bg-base-100 px-3 py-2"
                             :class="r.archived ? 'opacity-60' : ''">
                          <!-- One glyph, three states: a retired repo says so
                               where every other row says public or private,
                               because "finished" outranks "who can see it".
                               Only the retired state gets a WORD beside it. A
                               lock and a globe are conventions a reader already
                               holds, so labelling those spends width on what
                               the glyph already said; an archive box is not,
                               and read-only is the state that changes what the
                               row is for. -->
                          <i class="ph text-base leading-none shrink-0 text-base-content/40"
                             :class="r.archived ? 'ph-archive' : (r.priv ? 'ph-lock' : 'ph-globe')"
                             :title="r.archived ? 'Archived on GitHub (read-only)' : (r.priv ? 'Private' : 'Public')"></i>
                          <span x-show="r.archived" class="text-sm text-base-content/40 shrink-0">archived</span>
                          <!-- Browsing stays open for every row, archived
                               included: the point of archiving instead of
                               deleting is that it remains a reference shelf. -->
                          <button @click="openRepo(r.repo)" x-text="r.name"
                                  class="font-mono text-base font-semibold hover:text-primary transition-colors cursor-pointer shrink-0"></button>
                          <span class="text-base text-base-content/50 truncate grow min-w-0" x-text="r.desc"></span>
                          <span x-show="r.lang" class="badge badge-ghost badge-sm font-mono shrink-0" x-text="r.lang"></span>
                          <span x-show="r.ago" class="text-base text-base-content/40 flex items-center gap-1 shrink-0">
                            <i class="ph ph-clock"></i><span x-text="r.ago"></span>
                          </span>
                          <div class="flex items-center gap-1 shrink-0">
                            <!-- An archived repo is read-only, so the two write
                                 actions are withdrawn rather than offered and
                                 refused by the API. -->
                            <button x-show="!r.archived" @click="adoptUnfiled(r)"
                                    class="btn btn-ghost btn-sm gap-1" title="Add to the estate">
                              <i class="ph ph-plus-circle"></i>Adopt</button>
                            <button x-show="!r.archived && unfiledState(r) === 'open'" @click="setAside(r)"
                                    :disabled="unfiledBusy === r.repo"
                                    class="btn btn-ghost btn-sm gap-1"
                                    title="Mark it not part of the estate (conventions: optout)">
                              <span x-show="unfiledBusy === r.repo" class="loading loading-spinner loading-xs"></span>
                              <i x-show="unfiledBusy !== r.repo" class="ph ph-eye-closed"></i>Set aside</button>
                            <a :href="repoSettingsUrl(r.repo)" target="_blank" rel="noopener"
                               class="btn btn-ghost btn-sm gap-1"
                               :title="r.archived ? 'Repository settings on GitHub (unarchive lives here)' : 'Repository settings on GitHub: archive, or delete'">
                              <i class="ph ph-arrow-square-out"></i>
                              <span x-text="r.archived ? 'Settings' : 'Retire'"></span></a>
                          </div>
                        </div>
                      </template>
                    </div>
                  </section>
                </template>

                <!-- The other end of the same errand. Creating a repo is the one
                     move this view cannot make either, and it lands you back
                     here: create on GitHub, adopt on this row, it gets a card. -->
                <a :href="newRepoUrl()" target="_blank" rel="noopener"
                   class="inline-flex items-center gap-1.5 text-base text-base-content/40 hover:text-primary transition-colors">
                  <i class="ph ph-plus-square"></i>New repository on GitHub
                </a>
              </div>
            </template>
          </div>

          <!-- ── Surfaces view ──────────────────────────────────────────────
               General (registry) surfaces first, then a section per repo that
               declares one in its OWN .web-tools.json (surface: a path or a
               list of paths to .surface files in that repo). The declaring repos
               are already named in the config cache, so fetching their surface
               files is a bounded read over just those repos, not an every-repo
               fanout. The registry keeps the curated, cross-repo surfaces; a repo
               owns the surface that tells its own story. Stacked, not tabbed, so
               "general on top, repos below" reads as one scroll and a Repos card
               can deep-link its section. -->
          <div x-show="tab==='stage'">
            <!-- ── The Stage pill ─────────────────────────────────────────
                 Two sub-views, switched the way Activity switches its three
                 and Map its two: the shared segmented-pill style, at every
                 width. A staged fileset IS a surface (docs/envelopes/
                 surface.md, the stage/1 profile), so these are the two things
                 one format is for: the BENCH works a surface, the SHELF
                 displays the saved ones.

                 Each keeps its own ?view key, as Activity's three do, so a
                 pill tap deep-links: 'stage' is the bench, 'surfaces' the
                 shelf, which is what that key always meant. Switching routes
                 through the shell's go* methods, so the URL stamp, the header
                 nav, and history stay on the one navigation path.

                 The counts are the point of a pill over a plain toggle: they
                 keep a staged set visible while you are reading the shelf,
                 and the saved pile visible while you are working the bench. -->
            <div class="flex items-center gap-2 mb-4 flex-wrap">
              <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 w-fit flex-wrap" role="tablist">
                <button role="tab" @click="goSub('stage')"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                        :class="stageTab === 'bench' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                  <i class="ph ph-stack text-lg"></i>Stage
                  <span x-show="stagedCount" class="font-mono text-sm opacity-60" x-text="stagedCount"></span></button>
                <button role="tab" @click="goSub('surfaces')"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                        :class="stageTab === 'saved' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                  <i class="ph ph-cards text-lg"></i>Saved
                  <span x-show="authed && savedCount" class="font-mono text-sm opacity-60" x-text="savedCount"></span></button>
              </div>
              <div class="grow"></div>
              <!-- The bench's own row-right slot, where Activity puts as-of +
                   Refresh: where the staged set came from, and the one gesture
                   that lets go of it. Shown on the bench pill only, since it
                   describes what the bench holds. -->
              <template x-if="stageTab === 'bench' && benchOrigin">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-base text-base-content/45 truncate">
                    from <span class="font-mono" x-text="benchOriginName"></span>
                  </span>
                  <button @click="detachBench()"
                          class="flex items-center gap-1.5 text-base text-base-content/60 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
                          title="Detach: keep these items, but stop writing back to that surface">
                    <i class="ph ph-link-break"></i><span class="hidden sm:inline">Detach</span>
                  </button>
                </div>
              </template>
            </div>

            <!-- ── THE BENCH ──────────────────────────────────────────────
                 The working surface. It is not a card on the shelf and no
                 saved card becomes it: THE BENCH DOES NOT MOVE. It used to be
                 the first card on the list, opened by a pencil and mounted
                 under whichever surface was being edited, which cost three
                 things at once: the word "stage" disappeared from the UI, the
                 workspace had no fixed place, and it took its name from its
                 own contents ("README.md +2"), so nothing on screen was
                 recognizably the Stage. Now the pill names it and a saved
                 surface is LOADED onto it rather than becoming it. -->
            <section x-show="stageTab === 'bench'" class="mb-8">
              <!-- Mounted on first visit to the Stage, then kept: x-if rather
                   than a bare x-data so the stager does not boot (and rebuild
                   a seeded bundle) while the Repos grid is what is showing,
                   and x-show rather than x-if on the pane, so switching to
                   Saved and back does not reset the lens, the diff pair, or
                   the built bundle. Same lazy-mount idiom as the estate. -->
              <template x-if="stageSeen">
                <div x-data="stager()"></div>
              </template>
            </section>

            <div x-show="stageTab === 'saved'">

            <!-- ── THE SHELF ──────────────────────────────────────────────
                 No "Saved" heading: the lit pill above already says which
                 pane this is, and Map and Activity both drop the section
                 title for the same reason. Only the action stays. -->
            <div class="flex items-center gap-2 mb-4" x-show="authed">
              <div class="grow"></div>
              <button @click="newSurface()"
                      class="btn btn-ghost gap-1.5 text-base-content/60 hover:text-primary border border-dashed border-base-300">
                <i class="ph ph-plus-circle text-base"></i> New
              </button>
            </div>

            <p x-show="!authed" class="text-base text-base-content/60">
              Set a token (Repos, top right) to see saved surfaces.
            </p>
            <div x-show="authed && (surfLoading || repoSurfLoading) && !surfaceSections.length" class="flex justify-center py-16">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>
            <p x-show="authed && !surfLoading && !repoSurfLoading && !surfaceSections.length" class="text-base text-base-content/50">
              No surfaces yet.
            </p>

            <template x-for="sec in surfaceSections" :key="sec.key">
              <section class="mb-8" :id="sec.anchor">
                <!-- Section header: a plain "General" label for the registry
                     surfaces (shown only when a repo section also exists, so the
                     lone-general case stays header-free, as before), or the repo
                     name (opens the repo; the logo opens it on GitHub) for a
                     per-repo section. -->
                <div x-show="sec.repo || showGeneralHeader"
                     class="flex items-center gap-2 mb-3 text-base font-mono uppercase tracking-widest text-base-content/40">
                  <template x-if="!sec.repo">
                    <span class="flex items-center gap-2"><i class="ph ph-cards"></i>General</span>
                  </template>
                  <template x-if="sec.repo">
                    <span class="flex items-center gap-2">
                      <i class="ph ph-git-branch"></i>
                      <button @click="openRepo(sec.repo)" class="hover:text-primary transition-colors"
                              x-text="repoShort(sec.repo)"></button>
                      <a :href="'https://github.com/' + sec.repo" target="_blank"
                         class="text-base-content/30 hover:text-base-content/70 transition-colors normal-case"
                         title="Open on GitHub"><i class="ph ph-github-logo"></i></a>
                    </span>
                  </template>
                  <span class="badge badge-ghost badge-sm" x-text="sec.surfaces.length"></span>
                </div>

                <div class="flex flex-col gap-6">
                  <template x-for="s in sec.surfaces" :key="s.uid">
                    <div>
                      <div class="flex items-baseline gap-2 mb-1">
                        <h2 class="text-lg font-semibold" :class="onBench(s) && 'text-primary'"
                            x-text="s.manifest.name || s.file"></h2>
                        <span class="text-base font-mono text-base-content/30" x-text="s.file"></span>
                        <span x-show="onBench(s)" class="badge badge-primary badge-sm gap-1">
                          <i class="ph ph-stack"></i>on the stage</span>
                        <div class="grow"></div>
                        <!-- Load, not edit. The set is read onto the one bench
                             at the top of the view and the origin remembered, so
                             saving writes back to this file instead of minting a
                             stray copy beside it. Prose items have no file behind
                             them and are reported, not dropped. A repo's own
                             surface loads here too: reading one onto the bench
                             needs no write access. Naming the destination is what
                             the pencil could not do, since "edit" gave no hint
                             that the edit happens somewhere else on the page. -->
                        <button x-show="!onBench(s) && stageableCount(s)" @click="loadOntoStage(s)"
                                class="self-center text-base-content/30 hover:text-primary transition-colors shrink-0"
                                title="Load onto the stage">
                          <i class="ph ph-stack-plus text-base leading-none"></i></button>
                        <!-- Only registry surfaces edit their raw JSON in place
                             (the estate holds the registry token). A repo surface
                             links to its blob; edit it where it lives. -->
                        <button x-show="authed && !sec.repo" @click="editSurface(s)"
                                class="self-center text-base-content/30 hover:text-primary transition-colors shrink-0"
                                title="Edit this surface file">
                          <i class="ph ph-gear-six text-base leading-none"></i></button>
                        <!-- Remove one, the counterpart to appending. A saved
                             set goes away by deleting its own file; saving
                             another never destroys it. -->
                        <button x-show="authed && !sec.repo" @click="deleteSurface(s)"
                                class="self-center transition-colors shrink-0"
                                :class="surfArmed === s.uid ? 'text-error' : 'text-base-content/30 hover:text-error'"
                                :title="surfArmed === s.uid ? 'Tap again to delete' : 'Delete this surface'">
                          <i class="ph text-base leading-none" :class="surfArmed === s.uid ? 'ph-trash' : 'ph-trash-simple'"></i></button>
                        <a x-show="sec.repo" :href="s.blob" :data-peek="s.repo + '@' + s.ref + ':' + s.path" target="_blank"
                           class="self-center text-base-content/30 hover:text-base-content/70 transition-colors shrink-0"
                           title="Open this surface file on GitHub"><i class="ph ph-github-logo text-base leading-none"></i></a>
                        <span class="badge badge-ghost badge-sm font-mono" x-text="s.manifest.category || 'showcase'"></span>
                      </div>
                      <p x-show="s.manifest.description" class="text-base text-base-content/50 mb-3"
                         x-text="s.manifest.description"></p>

                      <!-- Display only. The stager mounts once, at the top of
                           the view, and never here: a card shows a surface, the
                           bench works one. A card whose items are on the bench
                           renders what the bench holds (see live()), so the two
                           never disagree. -->
                      <div class="flex flex-col gap-2">
                        <template x-for="it in s.items" :key="it.id || it.title">
                          <div class="border border-base-300 rounded-lg bg-base-100 p-3">
                        <div class="flex items-center gap-2">
                          <i class="ph text-base text-primary shrink-0" :class="kindIcon(it)"></i>
                          <template x-if="openable(it)">
                            <button @click="openItem(it)"
                                    class="text-base font-medium hover:text-primary transition-colors cursor-pointer text-left truncate"
                                    x-text="it.title || itemPath(it)"></button>
                          </template>
                          <template x-if="!openable(it) && itemExt(it)">
                            <a :href="itemExt(it)" target="_blank"
                               class="text-base font-medium hover:text-primary transition-colors truncate"
                               x-text="it.title || itemExt(it)"></a>
                          </template>
                          <template x-if="!openable(it) && !itemExt(it)">
                            <span class="text-base font-medium truncate" x-text="it.title || '(untitled)'"></span>
                          </template>
                          <span x-show="it.facet" class="badge badge-ghost badge-sm" x-text="it.facet"></span>
                          <div class="grow"></div>
                          <span class="text-base font-mono text-base-content/30 hidden sm:inline" x-text="itemPill(it)"></span>
                          <a x-show="itemGh(it)" :href="itemGh(it)" :data-peek="itemPeek(it)" target="_blank"
                             class="text-base-content/30 hover:text-base-content/70 transition-colors shrink-0"
                             title="Open on GitHub"><i class="ph ph-github-logo"></i></a>
                        </div>
                        <p x-show="it.snippet" class="text-base text-base-content/50 mt-1" x-text="it.snippet"></p>
                        <p x-show="it.commentary" class="text-base text-base-content/60 mt-1.5 whitespace-pre-line border-l-2 border-base-300 pl-2"
                           x-text="it.commentary"></p>
                        <p x-show="bodyOf(it)" class="text-base text-base-content/70 mt-1.5 whitespace-pre-line"
                           x-text="bodyOf(it)"></p>

                        <!-- Live embed (kind:embed): a renderer page rendered in
                             place via a toss-render route (#<route>=<addr>),
                             the same nested-token same-origin chain the app-view
                             and custom-landing embeds use. Collapsed by default;
                             the iframe mounts only on expand, one item at a time,
                             so the list stays scannable and several envelopes
                             don't all fetch at once. The title above opens the
                             same render full screen (itemExt). -->
                        <template x-if="isEmbed(it) && embedUrl(it)">
                          <div class="mt-2">
                            <button @click="toggleEmbed(s, it)"
                                    class="btn btn-xs btn-ghost gap-1.5 border border-base-300 text-base-content/60 hover:text-primary">
                              <i class="ph" :class="isEmbedOpen(s, it) ? 'ph-caret-up' : 'ph-caret-down'"></i>
                              <span x-text="isEmbedOpen(s, it) ? 'Collapse' : 'Expand embed'"></span>
                            </button>
                            <template x-if="isEmbedOpen(s, it)">
                              <iframe :src="embedUrl(it)" loading="lazy"
                                      class="w-full h-[70vh] mt-2 rounded-lg border border-base-300 bg-base-100"
                                      sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"></iframe>
                            </template>
                          </div>
                        </template>
                      </div>
                    </template>
                        <p x-show="!s.items.length" class="text-base text-base-content/40 italic">No items on this surface yet.</p>
                      </div>
                    </div>
                  </template>
                </div>
              </section>
            </template>
            </div><!-- /Saved pane -->
          </div>

          <!-- ── Activity pill row ─────────────────────────────────────────
               Branches / Sessions are the two readings of one fact: what the
               estate is working on, and the work that made it. A branch is
               the artifact and a session is the act, they cross-reference
               each other, and neither is complete alone. This segmented pill
               (the shared internal-tab style) switches between them, each
               carrying its live count. Switching routes through the shell's
               go* methods, so the URL keeps stamping the specific sub-view
               and existing ?view=activity links keep resolving. The as-of +
               Refresh pair rides the row's right side and belongs to whichever
               pill is lit, since each pane has its own cache and its own crawl.

               To-do and Jot used to be the third and fourth pills here and are
               now the Lists stop. They were a gradient of commitment from a
               captured idea to work in flight, which read well and was still
               wrong: a personal checklist is not the estate's activity, and
               keeping them here cost the two panes that ARE the full column.

               The pill runs at EVERY breakpoint. It used to be the
               narrow-screen form only: on lg+ the set rendered side by side,
               the main column plus a 24rem right rail. That rail held its
               width whether or not it had anything in it, which is a standing
               claim on the page's one scarce axis. One tab at full width, at
               any size, is the same trade the phone was already making. -->
          <div x-show="isActivityTab"
               class="flex items-center gap-2 mb-4 flex-wrap">
            <!-- No counts on these pills. The Branches badge read
                 openBranches.length, which is the SCOPED list, so it moved with
                 the scope chip and reported "98" for Recent while the estate
                 held 222 branches. A number in a tab is read as that tab's
                 total, and this one never was. The counts that are honest are
                 already one row down: a per-scope count on every chip, and the
                 window row's "N of M". Dropping them also gives the row back
                 the horizontal space it was wrapping for on a phone. -->
            <!-- w-fit + flex-wrap, the Map strip's treatment, now shared by
                 every segmented pill row in the app. This one carried shrink-0
                 instead, which is the opposite instruction: it held the strip
                 at its intrinsic width and, with nothing inside able to wrap,
                 a fifth pill went off the right edge of a phone rather than
                 onto a second line. Measured on a 390 px screen the moment
                 Routes shipped: "Branches Sessions Guides Chats Ro—". A tab
                 you cannot reach is not a tab. The wrap costs nothing where
                 the row fits, which is why it belongs on every such row rather
                 than on the one that happened to overflow first. -->
            <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 w-fit flex-wrap" role="tablist">
              <button role="tab" @click="goSub('activity')"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                      :class="tab === 'activity' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                <i class="ph ph-git-branch text-lg"></i>Branches</button>
              <button role="tab" @click="goSub('sessions')"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                      :class="tab === 'sessions' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                <i class="ph ph-terminal-window text-lg"></i>Sessions</button>
              <!-- The third pane, and the reason it is not the fourth mistake.
                   To-do and Jot sat here once and left because a personal
                   checklist is not the estate's activity: nothing tied them to
                   what the estate was doing, so they were here on a metaphor.
                   A guide is tied mechanically. It appears with the branch that
                   wrote it and carries that branch and its session on the card,
                   both derived, neither declared. Branch, session, guide are
                   the artifact, the act, and the account. -->
              <button role="tab" @click="goSub('guides')"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                      :class="tab === 'guides' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                <i class="ph ph-book-open-text text-lg"></i>Guides</button>
              <!-- The fourth pane, and the one that is not derived from the
                   repos at all. Branches and Sessions are two readings of git;
                   Chats is a separate VENUE, the conversation half of the work,
                   with no key joining a chat to a branch or a session and no
                   pretence of one. It earns the pill on the same test the other
                   three pass, that it reports where work actually happens, and
                   it is the only one that can say so about thinking done
                   outside a checkout. Its staleness is on the pane rather than
                   hidden, because unlike the others it advances by hand. -->
              <button role="tab" @click="goSub('chats')"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                      :class="tab === 'chats' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                <i class="ph ph-chats text-lg"></i>Chats</button>
              <!-- The fifth pane, and the first one keyed to something other
                   than git. Branches, Sessions, Guides and Chats all answer
                   "who was working, and when": the unit is a piece of work.
                   Routes answers "on what": the unit is a DESTINATION in the
                   app, and the estate had no reading of that at all, though
                   the UI layer is where most of the work lands. It sits here
                   rather than under Map because Map is the coordination layer
                   at rest and this is the app in motion, which is the whole
                   distinction this nav stop draws. -->
              <button role="tab" @click="goSub('routes')"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                      :class="tab === 'routes' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                <i class="ph ph-signpost text-lg"></i>Routes</button>
            </div>
            <div class="grow"></div>
            <!-- One AGE PILL per pane, in place of the as-of + Refresh pair
                 each used to carry. The three caches are on different
                 throttles and different costs, so the pill still belongs to
                 whichever pill is lit; what changed is that it states the age
                 at every width and routes the control to State rather than
                 firing a crawl from a button with no reading beside it.
                 Sessions and Guides said "Crawling…" / "Reading…" on that
                 button; the pill keeps both words, since they are the honest
                 names for two different amounts of work. -->
            <template x-if="tab==='sessions' && authed">
              <div class="flex items-center gap-2">
                ${crawlLine('sessions', 'sessionsBusy')}
                ${agePill('sessions', 'sessionsGeneratedAt', 'sessionsBusy', 'Crawling…', 'Sessions cache')}
              </div>
            </template>
            <template x-if="tab==='guides' && authed">
              ${agePill('guides', 'guidesLoadedAt', 'guidesBusy', 'Reading…', 'Guides shelf')}
            </template>
            <template x-if="tab==='activity' && authed">
              <div class="flex items-center gap-2">
                <!-- The crawl's progress stays here rather than moving to
                     State: it is tens of seconds against a determinate bar
                     that sits over this list, and the reader watching it is
                     watching this pane fill. The pill spins alongside. -->
                ${crawlLine('activity', 'activityBusy')}
                ${agePill('activity', 'activityGeneratedAt', 'activityBusy', 'Crawling…', 'Branch activity cache', 'freshCount')}
              </div>
            </template>
          </div>

          <!-- ── Activity composite ────────────────────────────────────────
               One container for the pair: the pill row above picks which pane
               is visible ('hidden' class per inactive pane) and the visible one
               takes the full content column. There is no breakpoint in here.
               The panes carried lg:block until 2026-08-03, which overrode the
               'hidden' toggle on lg+ and rendered every one at once; see the
               pill row's note for why that layout went. -->
          <div x-show="isActivityTab"
               class="flex flex-col">
          <!-- ── Open view (Activity sub-tab) ──────────────────────────────
               The estate's live branches in one cross-repo list: every branch
               with recent work ahead of its default, or the head of an open PR,
               freshest first. Repo chips narrow it to one repo. Each row
               highlights by PR state (ready / draft / no-PR), states its
               lifespan (first commit → latest), and carries a caption-style
               link cluster: browse the branch here, the guide PR, the Claude
               Code session that authored it, and a GitHub menu for everything
               that lives over there. Read off the activity cache, no per-visit
               fanout; Refresh re-crawls the estate through the shell. -->
          <!-- The route chips on each row need the manifest and the open PRs'
               file lists, not the per-carrier dating, so this warms the shared
               HALF of the Routes read (about six calls, against thirty for the
               whole). Failure is silent here on purpose: a missing chip strip
               costs a row nothing, while the pane it decorates is the estate's
               main list and must not carry another pane's error banner. -->
          <div class="flex-1 min-w-0" :class="tab==='activity' ? '' : 'hidden'"
               x-effect="tab === 'activity' && authed && loadRouteJoin().catch(() => {})">
            <!-- No pane header. The pill row above names this pane, carries its
                 count, and holds Open's as-of + Refresh at every width now, so
                 the lg-only header that used to do all three here would be a
                 second copy sitting one line below the first. -->
            <!-- The determinate bar: repos finished over repos total, nothing
                 smoothed in between. It is what turns a long wait from "hung"
                 into "two thirds through", and it sits above the list on both
                 layouts (the pill row hides on lg+, this column does not). -->
            ${crawlBar('activity', 'activityBusy')}
            <p x-show="!authed" class="text-base text-base-content/60">
              Open branches live in the private registry. Add a token on Repos to see them.
            </p>


            <!-- ── Scope chips ───────────────────────────────────────────────
                 The list's first axis: which of the scan's groups to show
                 (see BRANCH_SCOPES). A fixed row, unlike the repo chips below
                 it, since an empty scope is still an answer and a stable
                 position is worth more here than a tight row. Each carries its
                 count off the FULL list, so the row doubles as the estate's
                 whole branch list, and its tooltip carries the definition, so no
                 prose sits on the page. -->
            <div x-show="authed && !activityLoading"
                 class="flex items-center gap-1.5 mb-2 -mx-1 px-1 pb-0.5 overflow-x-auto">
              <template x-for="s in branchScopes" :key="s.key">
                <button @click="branchScope = s.key" :title="s.note"
                        class="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors"
                        :class="branchScope === s.key ? 'bg-primary/10 text-primary' : 'bg-base-200/60 text-base-content/60 hover:text-base-content'">
                  <i class="ph text-base" :class="s.icon"></i>
                  <span x-text="s.label"></span>
                  <span class="font-mono opacity-60" x-text="s.count"></span></button>
              </template>
            </div>

            <!-- ── The window, on Recent only ────────────────────────────────
                 Recent is the one scope that asks a question about TIME, so it
                 is the one that gets a window. Open is a state (an open PR, or
                 content found nowhere on the default branch), and an open PR
                 from three months ago is still open work, so narrowing it by
                 age would hide the rows it exists to show.

                 This filters rows the crawl already stored; it does not
                 reclassify. Every row carries its date, so narrowing is free
                 and honest, while WIDENING past the crawl's classifier line
                 cannot invent rows it never stored. That is why 14 is the top
                 of the range rather than a longer reach. -->
            <div x-show="authed && branchScope === 'active'"
                 class="flex items-center gap-1.5 mb-2 text-sm">
              <span class="text-base-content/45 shrink-0">within</span>
              <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5">
                <template x-for="d in [1/24, 1, 3, 7]" :key="d">
                  <button @click="setBranchWindow(d)"
                          class="px-2 py-0.5 rounded-md font-medium transition-colors"
                          :class="branchWindow === d ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'"
                          x-text="windowLabel(d)"></button>
                </template>
              </div>
              <span class="text-base-content/45 font-mono" x-text="windowCoverage"></span>
            </div>

            <!-- ── Repo filter chips ─────────────────────────────────────────
                 Every row already names its repo, so these buy focus rather
                 than identification: narrow a cross-repo list to the one repo
                 in question. Only repos that HAVE open rows get a chip (the
                 estate is larger than the set with work in flight, and a row
                 of zeroes says nothing), and the row hides entirely below two
                 of them, since a filter with one option is furniture. One
                 insertion serves both breakpoints: the desktop header above is
                 hidden on small screens, so on a phone this lands directly
                 under the Open / To-do / Jots pills. It scrolls sideways
                 rather than wrapping, which is what keeps a second row of
                 controls from pushing the first branch off the screen. -->
            <div x-show="authed && !activityLoading && openRepos.length > 1"
                 class="flex items-center gap-1.5 mb-3 -mx-1 px-1 pb-0.5 overflow-x-auto">
              <button @click="openRepoFilter = ''"
                      class="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors"
                      :class="!activeRepoFilter ? 'bg-primary/10 text-primary' : 'bg-base-200/60 text-base-content/60 hover:text-base-content'">
                All<span class="font-mono opacity-60" x-text="openBranches.length"></span></button>
              <template x-for="r in openRepos" :key="r.repo">
                <button @click="openRepoFilter = (activeRepoFilter === r.repo ? '' : r.repo)" :title="r.repo"
                        class="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors"
                        :class="activeRepoFilter === r.repo ? 'bg-primary/10 text-primary' : 'bg-base-200/60 text-base-content/60 hover:text-base-content'">
                  <span class="font-mono" x-text="r.short"></span>
                  <span class="font-mono opacity-60" x-text="r.count"></span></button>
              </template>
            </div>

            <div x-show="authed && activityLoading" class="flex justify-center py-16">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>

            <div x-show="authed && !activityLoading && !openBranches.length"
                 class="rounded-xl bg-base-200/40 p-4 text-base text-base-content/60 max-w-lg">
              <span x-text="'Nothing in ' + scopeMeta.label + '.'"></span>
              <span x-show="!allBranchRows.length"> The cache is cold: Refresh to crawl now (it also builds on a ~12h throttle).</span>
              <span x-show="allBranchRows.length" x-text="' ' + scopeMeta.note"></span>
            </div>

            <!-- One row per live branch. A colored left rail plus faint tint
                 carries PR state (like the console's level rail); the branch name
                 is the highlight and opens it here. The link cluster mirrors the
                 caption skill: Browse (here) / Tree / Compare / PR / Session,
                 with a per-repo Branches drill-down pinned to the right. -->
            <!-- Full width, no cap. The list carried max-w-3xl while the right
                 rail stood beside it, where a cap cost nothing because the rail
                 held the rest. With the rail gone the same cap would leave the
                 space empty instead, and a branch row is a wide thing anyway:
                 repo, branch, PR, subject, lifespan, and the link cluster all
                 read across. -->
            <div x-show="authed && openBranches.length" class="flex flex-col gap-2">
              <template x-for="row in openRows" :key="row.repo + '/' + row.name">
                <div class="rounded-lg border-l-4 pl-3 pr-3 py-2 transition-colors hover:brightness-[1.02]"
                     :class="branchAccent(row)">
                  <div class="flex items-center gap-2 min-w-0">
                    <!-- The repo, as its estate icon plus its short name, and a
                         control rather than a label: it opens the same GitHub
                         menu the sidebar's Repos rows carry, for the repo this
                         branch is in. The icon is the one the repo declares for
                         its estate card, so a row is identifiable by its mark
                         before the name is read, which is the whole point of a
                         repo owning one. Left-aligned panel: this trigger leads
                         its row. -->
                    <button @click.stop="repoChipMenu(row.repo, $event)"
                            @mouseenter="repoChipHover(row.repo, $event)" @mouseleave="repoChipLeave()"
                            :title="'Repo menu: ' + row.repo"
                            class="flex items-center gap-1.5 shrink-0 font-mono text-base text-base-content/50 hover:text-primary transition-colors">
                      <i class="ph text-base leading-none" :class="repoIcon(row.repo)"></i>
                      <span x-text="repoShort(row.repo)"></span></button>
                    <span class="text-base-content/30 shrink-0">/</span>
                    <!-- The branch name opens the branch HERE: the full-viewport
                         detail takeover below, swipeable through this list.
                         Staging the diff, its old action, moved into the GitHub
                         menu as "Stage changed files". -->
                    <button @click="openBranchDetail(row)"
                            class="font-mono text-base font-semibold truncate hover:text-primary transition-colors text-left min-w-0"
                            :title="'Open ' + row.name + ' here; swipe or arrow through the list'" x-text="row.name"></button>
                    <!-- PR reference in the GitHub #-number style, plus what
                         became of it. The number alone answered only "is there
                         an open PR", so every merged branch read "no PR" while
                         its work was on main; the word beside it is the state
                         (merged / closed / draft), dropped for a ready open PR
                         since the green rail already says that and the row has
                         better uses for the width. A head with several PRs over
                         its life shows the newest and counts the rest. -->
                    <template x-if="rowPR(row)">
                      <a :href="prUrl(row.repo, rowPR(row).number)" target="_blank"
                         :title="(rowPR(row).title || 'Pull request #' + rowPR(row).number)
                                 + ' — ' + BRANCH_STATE_NOTE[branchState(row)]
                                 + (rowPR(row).count > 1
                                     ? '\\n' + rowPR(row).count + ' pull requests have been opened for this branch; this is the newest'
                                     : '')"
                         class="flex items-baseline gap-1 shrink-0 font-mono text-base hover:text-primary transition-colors">
                        <span class="font-bold text-base-content/90"
                              x-text="'#' + rowPR(row).number"></span>
                        <span x-show="rowPR(row).count > 1" class="text-xs text-base-content/40"
                              x-text="'+' + (rowPR(row).count - 1)"></span>
                        <!-- The state as a mark, and the word only where there
                             is room for it. The mark is what a phone gets: the
                             row's whole left half is a branch name that already
                             truncates, and spending six characters of it on
                             "merged" costs more than it says once the icon and
                             the tint have said it. Nothing at all for a ready
                             open PR, which is the plain #-number's own meaning
                             and what the green rail carries. -->
                        <template x-if="branchStateMark(row)">
                          <span class="flex items-baseline gap-1" :class="branchStateMark(row).cls">
                            <i class="ph text-sm self-center" :class="branchStateMark(row).icon"></i>
                            <span class="hidden sm:inline text-xs font-medium"
                                  x-text="branchState(row)"></span>
                          </span>
                        </template>
                      </a>
                    </template>
                    <!-- No PR, and the two ways that happens are not the same
                         claim: inside the index's reach it is a fact, past it
                         the index simply cannot see, and saying "no PR" there
                         is how this pane got the merged branches wrong in the
                         first place. -->
                    <span x-show="!rowPR(row) && branchState(row) === 'nopr'"
                          title="No pull request has ever been opened for this branch"
                          class="font-mono text-base text-base-content/40 shrink-0">no&nbsp;PR</span>
                    <span x-show="!rowPR(row) && branchState(row) === 'unknown'"
                          :title="'The crawl reads the newest pull requests per repo, and this branch is older than that read reaches'
                                  + (row.prReach ? ' (back to ' + row.prReach.slice(0, 10) + ')' : '')
                                  + ', so whether it ever had one is not known here. Open the branch to check.'"
                          class="font-mono text-base text-base-content/25 shrink-0">PR&nbsp;?</span>
                    <div class="grow"></div>
                    <!-- The row's LIFESPAN, not just its last touch: how long
                         ago the branch's first commit landed, then its latest,
                         as "5d → 2h". One element, so the row gains a fact and
                         not a line; the start is dropped when it rounds to the
                         same label as the tip (a same-day branch) or is not
                         knowable (see branchStart). -->
                    <span x-show="row.date" class="flex items-center gap-1 text-base shrink-0 tabular-nums"
                          :title="branchSpanTitle(row)">
                      <template x-if="branchStart(row)">
                        <span class="flex items-center gap-1 text-base-content/35">
                          <span x-text="branchStart(row)"></span>
                          <i class="ph ph-arrow-right text-xs opacity-70"></i>
                        </span>
                      </template>
                      <span class="text-base-content/50" x-text="agoShort(row.date)"></span>
                    </span>
                  </div>
                  <p x-show="row.subject" class="text-base text-base-content/60 truncate mt-0.5"
                     :title="row.subject" x-text="row.subject"></p>
                  <!-- TWO COLUMNS, not one wrapping line, and that is what keeps
                       the arrows out of trouble. They used to be the last item
                       in a wrapping flex with ml-auto, so the moment anything
                       ahead of them overflowed (the route chips, on the one repo
                       that has them) they dropped to a line of their own and
                       sat there right-aligned against nothing. A reader loses a
                       row's shape when its rightmost fact moves.

                       The left box wraps within itself and the right box never
                       shrinks, so the arrows hold the right edge on the first
                       line at every width. The route chips then do what the
                       reader asked for without being told: they stay inline on
                       a desktop, where there is room to spare, and fall to a
                       second line on a phone, where there is not. One rule, two
                       behaviours, no breakpoint. -->
                  <div class="flex items-start gap-x-3 mt-2 text-base">
                    <div class="min-w-0 flex-1 flex items-center flex-wrap gap-x-3 sm:gap-x-4 gap-y-1.5">
                    <!-- One GitHub button instead of the old Tree + Compare
                         pair. Those two were one tap each and this menu is
                         two, which only pays because the menu holds
                         destinations that had no route at all: the PR's files
                         and checks tabs, the branch's commits, and New pull
                         request, the one action a no-PR row could not reach.
                         It also gives the row's action line back the width the
                         pair was spending. Same anchored-panel pattern as the
                         sidebar's repo menu, sharing its geometry
                         (shell.anchorMenu). What stays OUTSIDE it is anything
                         that is not GitHub navigation: the #-number, the Claude
                         session mark, the files route, and the Stage. Every row
                         left inside opens github.com. -->
                    <!-- The mark alone. The word "GitHub" beside a GitHub logo
                         said nothing the logo had not, and it cost about fifty
                         pixels on the row where pixels are scarce. The caret
                         stays, since that is what says "menu" rather than
                         "link", and the title carries the sentence. -->
                    <button @click.stop="openBranchMenu(row, $event)"
                            @mouseenter="hoverBranchMenu(row, $event)" @mouseleave="hoverLeaveBranchMenu()"
                            :title="'GitHub links for ' + row.name"
                            class="flex items-center gap-0.5 shrink-0 text-base-content/70 hover:text-primary transition-colors">
                      <i class="ph ph-github-logo text-lg"></i><i
                        class="ph ph-caret-down text-xs opacity-50"></i></button>
                    <!-- The row's three local controls, together and to the LEFT
                         of the routes chips. Order is the point: the session
                         mark used to sit AFTER the routes, which are hub-only
                         and variable width, so on the one repo that has them it
                         landed halfway across the row while every other row
                         carried it at the left. A mark a reader scans down a
                         column for cannot move with a neighbour's width. -->
                    <!-- The Claude session that authored the branch: its logomark
                         in brand color, no label. Read from the branch's own
                         Claude-Session commit trailer, so it resolves for a
                         branch with no PR at all (most of this list); the guide
                         PR footer is the fallback. Gating this on row.pr is what
                         used to leave it dark for every PR-less row.
                         No backticks in here: this markup is a JS template
                         literal, and one would end it mid-component. -->
                    <!-- The slot is RESERVED, not collapsed, and that is the
                         point of moving the mark here at all. A row whose
                         branch has no resolvable session (a branch nobody
                         authored from Claude Code) would otherwise pull the
                         files control and the Stage one glyph left, and a route
                         a reader aims at down a column cannot sit at a
                         different x on every row. One glyph of empty space on
                         the rare row buys a straight column on all of them. -->
                    <span class="w-6 shrink-0 flex justify-center">
                    <a x-show="row.session" :href="row.session" target="_blank"
                       :title="(row.sessions?.length > 1
                                 ? 'Worked across ' + row.sessions.length + ' sessions; opens the newest'
                                 : 'Open the Claude session that authored this branch')
                               + (row.sessionsExact ? '' : ' (approximate: read from the branch tip)')"
                       class="flex items-center gap-0.5 hover:opacity-75 transition-opacity">
                      <svg viewBox="0 0 24 24" class="w-6 h-6 shrink-0" style="stroke:#d97757" stroke-width="2.2" stroke-linecap="round" fill="none" aria-hidden="true"><path d="M12,12 L12.0,1.6 M12,12 L17.62,3.25 M12,12 L21.46,7.68 M12,12 L22.29,13.48 M12,12 L19.86,18.81 M12,12 L14.93,21.98 M12,12 L9.07,21.98 M12,12 L4.14,18.81 M12,12 L1.71,13.48 M12,12 L2.54,7.68 M12,12 L6.38,3.25"/></svg><span
                        x-show="row.sessions?.length > 1" x-text="row.sessions?.length"
                        class="font-mono text-xs leading-none" style="color:#d97757"></span></a>
                    </span>
                    <!-- FILES: the route the row was missing. The branch name
                         opens the detail too, but on the GUIDE where there is
                         one, so "show me what changed" cost a tap, a read and a
                         second tap. This is that destination on its own glyph,
                         the one the detail's file deck already wears, and it is
                         the same control as the scan's verdict rather than a
                         second files icon beside it: one glyph, saying as much
                         as is known about this branch's files.

                         TWO numbers, and the same two on every row: how many
                         files this branch changed, and how many of them are new.
                         Both are free, since the crawl compares every open PR
                         head against its default for the ahead/behind pair and
                         every file in that response carries a status and a line
                         count. A row with stranded content adds one more thing,
                         the missing count in amber, which opens the pane already
                         filtered to those files.

                         Two is the row's budget, so removals, renames and the
                         line totals live in the hover, which is a small table
                         rather than a sentence. Those are the numbers a reader
                         wants once, not the ones they scan a list for.

                         The landed RATIO used to ride here too, so a scanned
                         row read 28/80 landed 11 missing * while an unscanned
                         row read nothing at all: four mono elements on the busy
                         rows, none on the quiet ones, and no column a reader
                         could scan. The ratio is a verdict and this is a route,
                         so the verdict moved to where there is room to state it
                         whole (the hover, and the Files pane's own strip, which
                         names all three classes). What stays on the row is the
                         count every row can carry and the one flag worth
                         raising unasked.

                         The asterisk is the no-merge-base caveat, and it covers
                         both numbers: there the compare fell back to the
                         branch's recent history, so the counts span more than
                         the branch itself. -->
                    <span class="flex items-center gap-3 font-mono tabular-nums shrink-0">
                      <!-- Two pairs, two TRIGGERS. Each opens a card of its own
                           over its own class, which is what a title attribute
                           could never be: one string, in the browser's type, with
                           no links in it. Hovering opens on a fine pointer and
                           tapping opens everywhere, so the card is the row's
                           destination on a phone too; the branch name still opens
                           the detail, and the card carries a second route to it.

                           New files are GREEN, and green now means exactly this
                           everywhere on the row. It used to tint the whole
                           control when the scan found nothing missing, a signal
                           the absent missing count and the Landed chip were
                           already carrying twice over; spending it here is what
                           lets a file-plus glyph read as a different thing from a
                           files glyph at eighteen pixels. The row's palette is
                           one idea: neutral changed, green added, amber
                           stranded. -->
                      <button @click.stop="openRowCard(row, 'changed', $event)"
                              @mouseenter="hoverRowCard(row, 'changed', $event)"
                              @mouseleave="hoverLeaveRowCard()"
                              :title="'The files this branch changed against ' + row.def"
                              class="flex items-center gap-1 text-base-content/60 hover:text-primary transition-colors">
                        <i class="ph ph-files text-lg opacity-60"></i>
                        <span x-show="fileParts(row)?.lead" x-text="fileParts(row)?.lead"
                              class="hover:underline underline-offset-2"></span>
                      </button>
                      <template x-if="fileParts(row)?.added">
                        <button @click.stop="openRowCard(row, 'added', $event)"
                                @mouseenter="hoverRowCard(row, 'added', $event)"
                                @mouseleave="hoverLeaveRowCard()"
                                :title="'The files this branch adds that ' + row.def + ' does not have'"
                                class="flex items-center gap-1 -ml-1 text-success hover:text-primary transition-colors">
                          <i class="ph ph-file-plus text-lg opacity-70"></i><span
                            x-text="fileParts(row).added"
                            class="hover:underline underline-offset-2"></span>
                        </button>
                      </template>
                      <button x-show="row.nMissing" @click.stop="openRowCard(row, 'missing', $event)"
                              @mouseenter="hoverRowCard(row, 'missing', $event)"
                              @mouseleave="hoverLeaveRowCard()"
                              :title="verdictTitle(row, 'missing')"
                              class="text-warning hover:underline underline-offset-2"
                              x-text="row.nMissing + ' missing'"></button>
                      <!-- Words, not an asterisk. It was one amber character
                           whose whole meaning sat in a title, and what it says
                           is that every number beside it measures something
                           WIDER than the branch: the one caveat on this row a
                           reader cannot afford to miss, and the one a phone
                           could never reach. -->
                      <span x-show="row.noBase" class="text-warning"
                            title="No shared ancestor with the default branch, so the compare fell back to this branch's recent history and any count here spans more than the branch itself">no merge base</span>
                    </span>
                    <!-- STAGE, and it is out of the GitHub menu on purpose.
                         Staging this branch's changed files sends them to THIS
                         app's Stage, so a menu whose every other row opens
                         github.com had no business holding it. It was the row's
                         original name-tap action before the name became the
                         detail's trigger, so a control of its own is where it
                         belonged anyway: one tap, beside the files it acts on.
                         The spinner rides in the button that was pressed rather
                         than in a separate label at the head of the line. -->
                    <button @click.stop="stageBranchDiff(row.repo, row.name, row.def)"
                            :disabled="isStaging(row.repo, row.name)"
                            :title="'Stage the files this branch changed against ' + row.def + ', on the Stage'"
                            class="flex items-center text-base-content/60 hover:text-primary transition-colors disabled:opacity-50">
                      <i class="ph text-lg" :class="isStaging(row.repo, row.name)
                                                      ? 'ph-circle-notch animate-spin' : 'ph-stack'"></i></button>
                    <!-- WHAT THIS BRANCH IS WORKING ON, as routes. The
                         reciprocal of the Routes pane's per-branch list, off
                         the same data and the same rule, so the two readings
                         cannot disagree: a hit on a narrow carrier is ON the
                         route, a hit only on a widely shared file is NEAR it
                         and reads ghosted, and the shell never counts.
                         Absent, not empty, for every repo but the hub: routes
                         are one page in one repo and a row from another has no
                         answer here rather than a null one. A tap opens the
                         route, which is the join made useful rather than
                         merely shown. -->
                    <template x-if="branchRoutes(row)">
                      <span class="flex items-center gap-1 flex-wrap min-w-0">
                        <i class="ph ph-signpost text-base text-base-content/40 shrink-0"></i>
                        <template x-for="rt in branchRoutes(row).on" :key="rt.key">
                          <button @click.stop="openRoute(rt)"
                                  :title="rt.label + ' — ' + rt.hits.join(', ')"
                                  class="shrink-0 rounded-full px-2 py-0.5 text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                  x-text="rt.label"></button>
                        </template>
                        <template x-for="rt in branchRoutes(row).near" :key="rt.key">
                          <button @click.stop="openRoute(rt)"
                                  :title="rt.label + ' — touches only ' + rt.hits.join(', ') + ', which several routes share'"
                                  class="shrink-0 rounded-full px-2 py-0.5 text-sm bg-base-200/70 text-base-content/45 hover:text-base-content transition-colors"
                                  x-text="rt.label"></button>
                        </template>
                      </span>
                    </template>
                    </span>
                    <!-- Ahead / behind the default, in COMMITS. A muted ahead of
                         0 flags a branch with nothing to stage (its content
                         already in the default); a dash is unknown (not yet
                         scanned, or the compare failed).
                         Each side is its own trigger now. They carried the word
                         "commits" only in a title attribute, which never appears
                         on a phone, so the pair read as two bare numbers a
                         reader could reasonably take for lines or files. The
                         cards say what they are and list them. -->
                    </div>
                    <span x-show="row.ahead !== null || row.behind !== null"
                          class="shrink-0 flex items-center gap-2.5 font-mono font-medium tabular-nums">
                      <button @click.stop="openRowCard(row, 'ahead', $event)"
                              @mouseenter="hoverRowCard(row, 'ahead', $event)"
                              @mouseleave="hoverLeaveRowCard()"
                              :title="'Commits this branch has that ' + row.def + ' does not'"
                              class="flex items-center gap-0.5 hover:text-primary transition-colors"
                              :class="row.ahead ? 'text-success' : 'text-base-content/70'">
                        <i class="ph ph-arrow-up text-lg"></i><span x-text="row.ahead ?? '–'"></span></button>
                      <button @click.stop="openRowCard(row, 'behind', $event)"
                              @mouseenter="hoverRowCard(row, 'behind', $event)"
                              @mouseleave="hoverLeaveRowCard()"
                              :title="'Commits ' + row.def + ' has that this branch does not'"
                              class="flex items-center gap-0.5 text-base-content/75 hover:text-primary transition-colors">
                        <i class="ph ph-arrow-down text-lg"></i><span x-text="row.behind ?? '–'"></span></button>
                    </span>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- ── Sessions view (Activity sub-tab) ──────────────────────────
               Every recorded Claude Code session, newest first, read off the
               registry's sessions cache. A session is the ACT and a branch is
               the artifact, so this pane answers what Branches cannot: what a
               stretch of work was about, how long it ran, what it fought, and
               which files it actually opened.

               Records are captured by the Stop hook while a session runs and
               published to the private registry; the cache folds each into a
               ~350-byte row so this list costs one file read, and the full
               record is fetched only when a row is opened. Source and limits:
               web-tools-private/sessions/README.md. -->
          <div class="flex-1 min-w-0" :class="tab==='sessions' ? '' : 'hidden'">
            <!-- The sessions crawl is lighter than the branch scan but not
                 instant: a tree read, then up to 120 record blobs six at a
                 time, which is the same tens of seconds on a cold pass. It had
                 a spinner and a word; it draws the same bar as Branches now. -->
            ${crawlBar('sessions', 'sessionsBusy')}
            <p x-show="!authed" class="text-base text-base-content/60">
              Session records live in the private registry. Add a token on Repos to see them.
            </p>

            <!-- ── Lens ─────────────────────────────────────────────────────
                 The list answers what happened. The other three answer what
                 SHAPE this is, which no list of rows can: a session holds
                 several branches, a branch holds one session, and that fan is
                 the whole reason the list nests this way round. They read the
                 same two caches the list does, so a lens costs one render and
                 no fetch. -->
            <div x-show="authed" class="flex items-center gap-2 mb-3 flex-wrap">
              <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 w-fit flex-wrap" role="tablist">
                <template x-for="l in [
                    { key: 'list',   label: 'List',   icon: 'ph-list-bullets', note: 'Sessions, with the branches each left behind nested under it' },
                    { key: 'stars',  label: 'Stars',  icon: 'ph-asterisk', note: 'One hub per session, one satellite per repo-branch' },
                    { key: 'repos',  label: 'Repos',  icon: 'ph-graph', note: 'Which repos get worked together, edge weight in sessions' },
                    { key: 'counts', label: 'Counts', icon: 'ph-chart-bar-horizontal', note: 'Branches per session, and sessions per branch' },
                  ]" :key="l.key">
                  <button role="tab" @click="sessionLens = l.key" :title="l.note"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                          :class="sessionLens === l.key ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                    <i class="ph text-lg" :class="l.icon"></i><span x-text="l.label"></span></button>
                </template>
              </div>
              <!-- What the join reached. A tree that cannot place every branch
                   should say so where it is read, not in a doc. -->
              <span class="text-base text-base-content/45" :title="sessionJoinNote" x-text="sessionJoinLabel"></span>
            </div>

            <!-- ── Scope chips ───────────────────────────────────────────────
                 A fixed row, like the branch scopes: an empty scope is still an
                 answer. Each count is off the FULL list, so the row doubles as
                 the whole list, and the tooltip carries the definition. -->
            <div x-show="authed && sessionLens === 'list' && !sessionsLoading"
                 class="flex items-center gap-1.5 mb-2 -mx-1 px-1 pb-0.5 overflow-x-auto">
              <template x-for="s in sessionScopes" :key="s.key">
                <button @click="sessionScope = s.key" :title="s.note"
                        class="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors"
                        :class="sessionScope === s.key ? 'bg-primary/10 text-primary' : 'bg-base-200/60 text-base-content/60 hover:text-base-content'">
                  <i class="ph text-base" :class="s.icon"></i>
                  <span x-text="s.label"></span>
                  <span class="font-mono opacity-60" x-text="s.count"></span></button>
              </template>
            </div>

            <!-- Repo chips, same contract as the Open view's: only repos that
                 actually appear get one, and the row hides below two of them,
                 since a filter with one option is furniture. A session lists a
                 repo when that checkout was its working directory, which is
                 narrower than "worked in" (an absolute-path Read never moves
                 the cwd); the tooltip says so rather than the page carrying a
                 paragraph about it. -->
            <div x-show="authed && sessionLens === 'list' && !sessionsLoading && sessionRepos.length > 1"
                 class="flex items-center gap-1.5 mb-3 -mx-1 px-1 pb-0.5 overflow-x-auto">
              <button @click="sessionRepoFilter = ''"
                      class="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors"
                      :class="!activeSessionRepo ? 'bg-primary/10 text-primary' : 'bg-base-200/60 text-base-content/60 hover:text-base-content'">
                All<span class="font-mono opacity-60" x-text="scopedSessions.length"></span></button>
              <template x-for="r in sessionRepos" :key="r.repo">
                <button @click="sessionRepoFilter = (activeSessionRepo === r.repo ? '' : r.repo)"
                        :title="r.repo + ' was the working directory in ' + r.count + ' of these sessions'"
                        class="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors"
                        :class="activeSessionRepo === r.repo ? 'bg-primary/10 text-primary' : 'bg-base-200/60 text-base-content/60 hover:text-base-content'">
                  <span class="font-mono" x-text="r.repo"></span>
                  <span class="font-mono opacity-60" x-text="r.count"></span></button>
              </template>
            </div>

            <div x-show="authed && sessionsLoading" class="flex justify-center py-16">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>

            <div x-show="authed && sessionLens === 'list' && !sessionsLoading && !sessionNodes.length"
                 class="rounded-xl bg-base-200/40 p-4 text-base text-base-content/60 max-w-lg">
              <span x-text="'Nothing in ' + sessionScopeMeta.label + '.'"></span>
              <span x-show="!allSessionRows.length"> The cache is cold: Refresh to crawl the store now (it also builds on a ~3h throttle).</span>
            </div>

            <!-- One row per session. Left rail by outcome: amber where the
                 session hit tool failures, muted otherwise. Deliberately not
                 green-for-clean, since a session with no failures is the normal
                 case and a page of green rails says nothing. -->
            <div x-show="authed && sessionLens === 'list' && sessionNodes.length" class="flex flex-col gap-2">
              <template x-for="n in sessionNodes" :key="n.key">
                <div class="rounded-lg border-l-4 pl-3 pr-3 py-2 transition-colors hover:brightness-[1.02]"
                     :class="n.row && n.row.failures ? 'border-warning bg-warning/5'
                             : (n.kind === 'stub' ? 'border-base-200 bg-base-100' : 'border-base-300 bg-base-100')">

                <!-- A STUB: a session named by a branch's Claude-Session commit
                     trailer, with no record in the store. It is the reason this
                     list reaches past the recorder's window at all, so it gets
                     a row of its own rather than being dropped, and says out
                     loud that there is nothing to read. -->
                <template x-if="n.kind === 'stub'">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-mono text-base text-base-content/50 shrink-0 tabular-nums" x-text="n.day"></span>
                    <a :href="n.url" target="_blank" rel="noopener"
                       title="Open this session in Claude Code. No record was published for it, so there is no conversation to read here."
                       class="font-mono text-base text-base-content/45 hover:text-primary transition-colors shrink-0"
                       x-text="n.id"></a>
                    <span class="font-mono text-xs text-base-content/30 shrink-0"
                          title="Named by a branch's Claude-Session commit trailer; no record in the sessions store">no&nbsp;record</span>
                  </div>
                </template>

                <!-- A RECORD. Everything below is the row this pane always drew,
                     taking its row from this scope, so the nesting cost the
                     row itself nothing. -->
                <template x-if="n.kind === 'record'">
                <div x-data="{ row: n.row }">
                  <div class="flex items-center gap-2 min-w-0">
                    <!-- Day and short id: the record's own filename, which is
                         how search.py --show addresses it, so what is on screen
                         is what you type at a terminal. -->
                    <span class="font-mono text-base text-base-content/50 shrink-0 tabular-nums"
                          x-text="row.day"></span>
                    <button @click="openSession(row)"
                            class="font-mono text-base font-semibold hover:text-primary transition-colors text-left shrink-0"
                            :title="'Read this session as a conversation'" x-text="row.id"></button>
                    <!-- The branches this session was sitting on. Each opens
                         THAT BRANCH, at 🌿 branch.html, which is the estate's
                         canonical single-branch address and reads its state
                         from the API on every load.
                         It used to switch panes and filter the Branches list by
                         REPO, which is a strange answer to "show me this
                         branch": it leaves the reader in a different pane with
                         the branch still to find, and it loses the session they
                         were reading. A session's branch is also frequently
                         merged and so absent from that list entirely, which the
                         old filter could not express at all. -->
                    <div class="grow"></div>
                    <span class="flex items-center gap-1 text-base shrink-0 tabular-nums text-base-content/50"
                          :title="row.started + ' → ' + row.ended + ' (as of the last recorded turn)'">
                      <span x-text="durLabel(row.mins)"></span>
                    </span>
                  </div>
                  <!-- The ask, and the row's largest target. It was a plain <p>
                       while the two smallest things on the line (an 8-character
                       id, a truncated branch name) carried the actions, so the
                       one element that says what the session WAS did nothing
                       when tapped. It opens the conversation, same as the id.
                       A spinner rides here while the record is being fetched. -->
                  <button x-show="row.ask" @click="openSession(row)"
                          class="block w-full text-left text-base text-base-content/60 truncate mt-0.5 hover:text-primary transition-colors"
                          :title="row.ask">
                    <i x-show="sessionDetailLoading && openSessionId === row.id"
                       class="ph ph-circle-notch animate-spin mr-1"></i><span x-text="row.ask"></span>
                  </button>
                  <div x-show="sessionDetailErr && openSessionId === row.id"
                       class="text-base text-error font-mono mt-1" x-text="sessionDetailErr"></div>
                  <div class="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-2 text-base">
                    <!-- The counts that say how big a session was, each one a
                         different axis: what the user said, what the session
                         did, and what it broke. -->
                    <button @click.stop="openSessionCard(row, 'turns', $event)"
                            @mouseenter="hoverSessionCard(row, 'turns', $event)"
                            @mouseleave="hoverLeaveRowCard()"
                            class="flex items-center gap-1 text-base-content/60 font-mono tabular-nums hover:text-primary transition-colors"
                            :title="row.exchanges + ' user turns, ' + row.messages + ' assistant messages'">
                      <i class="ph ph-chats-circle text-lg opacity-60"></i><span x-text="row.exchanges"></span></button>
                    <button @click.stop="openSessionCard(row, 'tools', $event)"
                            @mouseenter="hoverSessionCard(row, 'tools', $event)"
                            @mouseleave="hoverLeaveRowCard()"
                            class="flex items-center gap-1 text-base-content/60 font-mono tabular-nums hover:text-primary transition-colors"
                            :title="topToolsLabel(row)">
                      <i class="ph ph-wrench text-lg opacity-60"></i><span x-text="row.calls"></span></button>
                    <button x-show="row.failures" @click.stop="openSessionCard(row, 'tools', $event)"
                            @mouseenter="hoverSessionCard(row, 'tools', $event)"
                            @mouseleave="hoverLeaveRowCard()"
                            class="flex items-center gap-1 text-warning font-mono tabular-nums hover:underline underline-offset-2"
                            :title="row.failures + ' tool calls failed in this session'">
                      <i class="ph ph-warning-circle text-lg"></i><span x-text="row.failures"></span></button>
                    <!-- File attention: how many distinct files this session
                         opened, with the busiest few in the tooltip. Absent on
                         a pre-schema-3 record rather than shown as zero, since
                         "not captured" and "opened nothing" are different
                         answers and only one of them is about the session. -->
                    <button x-show="row.filesTotal" @click.stop="openSessionCard(row, 'files', $event)"
                            @mouseenter="hoverSessionCard(row, 'files', $event)"
                            @mouseleave="hoverLeaveRowCard()"
                            class="flex items-center gap-1 text-base-content/60 font-mono tabular-nums hover:text-primary transition-colors"
                            :title="filesLabel(row)">
                      <i class="ph ph-files text-lg opacity-60"></i><span x-text="row.filesTotal"></span></button>
                    <span x-show="!row.filesTotal && row.schema < 3"
                          class="flex items-center gap-1 text-base-content/30 font-mono tabular-nums"
                          title="This record predates file-attention capture (schema 3); its files were never recorded.">
                      <i class="ph ph-files text-lg"></i><span>&mdash;</span></span>
                    <!-- The guide this session wrote, where it wrote one. Read
                         from the record's own file attention rather than
                         through the branch: a branch says only that its head
                         CONTAINS the file, and it stops saying even that when
                         the PR merges, which is precisely when a guide starts
                         mattering. The record names the path and never stops.
                         Absent rather than dimmed when the session simply wrote
                         no guide, since that is the ordinary case and a page of
                         grey books would say nothing; the dimmed twin is for
                         the records that COULD not say, not for the ones with
                         nothing to report. -->
                    <template x-for="g in (row.guides || []).slice(0, 3)" :key="g[0]">
                      <a :href="guideRenderFor(row, g[0])" target="_blank" rel="noopener"
                         :title="'Guide written in this session: ' + g[0]"
                         class="flex items-center gap-1 text-primary/80 hover:text-primary transition-colors">
                        <i class="ph ph-book-open-text text-lg"></i></a>
                    </template>
                    <!-- The Claude session itself, when the record could name
                         it, and a dimmed twin saying so when it could not.
                         Vanishing was the wrong absence: it read as the view
                         forgetting to render a link rather than as the record
                         having no id, and a reader cannot tell those apart from
                         a gap. Same treatment as the files icon above, for the
                         same reason, and the two titles separate the two
                         causes: the field did not exist yet, or it existed and
                         nothing filled it. -->
                    <a x-show="row.agent" :href="row.agent" target="_blank"
                       title="Open this session in Claude Code"
                       class="flex items-center gap-0.5 hover:opacity-75 transition-opacity">
                      <svg viewBox="0 0 24 24" class="w-6 h-6 shrink-0" style="stroke:#d97757" stroke-width="2.2" stroke-linecap="round" fill="none" aria-hidden="true"><path d="M12,12 L12.0,1.6 M12,12 L17.62,3.25 M12,12 L21.46,7.68 M12,12 L22.29,13.48 M12,12 L19.86,18.81 M12,12 L14.93,21.98 M12,12 L9.07,21.98 M12,12 L4.14,18.81 M12,12 L1.71,13.48 M12,12 L2.54,7.68 M12,12 L6.38,3.25"/></svg></a>
                    <span x-show="!row.agent" class="flex items-center gap-1 text-base-content/30 font-mono"
                          :title="row.schema < 3
                                    ? 'This record predates harness-session capture (schema 3); its Claude session was never named.'
                                    : 'This record names no Claude session. Before 2026-08-07 the id could only be recovered from commit trailers, so a session that did not commit has none.'">
                      <svg viewBox="0 0 24 24" class="w-6 h-6 shrink-0" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none" aria-hidden="true"><path d="M12,12 L12.0,1.6 M12,12 L17.62,3.25 M12,12 L21.46,7.68 M12,12 L22.29,13.48 M12,12 L19.86,18.81 M12,12 L14.93,21.98 M12,12 L9.07,21.98 M12,12 L4.14,18.81 M12,12 L1.71,13.48 M12,12 L2.54,7.68 M12,12 L6.38,3.25"/></svg><span>&mdash;</span></span>
                    <button x-show="row.tokens" @click.stop="openSessionCard(row, 'tokens', $event)"
                            @mouseenter="hoverSessionCard(row, 'tokens', $event)"
                            @mouseleave="hoverLeaveRowCard()"
                            class="ml-auto flex items-center gap-2.5 font-mono tabular-nums text-base-content/45 hover:text-primary transition-colors"
                            :title="tokenLabel(row)">
                      <span x-text="tokenShort(row)"></span>
                    </button>
                  </div>

                </div>
                </template>

                <!-- ── The branches this session left behind ─────────────────
                     Indented behind a hairline, because the nesting IS the
                     claim: a branch is not a peer of the act that made it.
                     Every fact here is already in the branch cache, so the
                     rows cost nothing beyond the join: state and PR number,
                     the lifespan (first commit → tip), the ahead/behind pair,
                     and the scan's verdict where it ran. -->
                <div x-show="n.children.length" class="mt-2 pl-2.5 border-l-2 border-base-300/60 flex flex-col gap-2">
                  <template x-for="b in n.children" :key="b.repo + '/' + b.name">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2 min-w-0 text-base">
                        <span class="font-mono text-base-content/40 shrink-0" x-text="repoShort(b.repo)"></span>
                        <a :href="branchPageFor(b.repo, b.name)" target="_blank" rel="noopener"
                           :title="'Open ' + b.name"
                           class="font-mono truncate min-w-0 hover:text-primary transition-colors" x-text="b.name"></a>
                        <!-- The one branch in 390 that carries two sessions
                             appears under both. That is the whole cost of
                             drawing a many-to-many as a tree, and it is marked
                             rather than hidden. -->
                        <span x-show="(b.sessions || []).length > 1"
                              :title="'Worked across ' + b.sessions.length + ' sessions; it appears under each'"
                              class="font-mono text-xs text-warning shrink-0" x-text="b.sessions.length + '\u00d7'"></span>
                        <div class="grow"></div>
                        <template x-if="rowPR(b)">
                          <a :href="prUrl(b.repo, rowPR(b).number)" target="_blank" rel="noopener"
                             :title="rowPR(b).title + ' — ' + BRANCH_STATE_NOTE[branchState(b)]"
                             class="font-mono shrink-0 hover:underline underline-offset-2"
                             :class="branchStateMark(b) ? branchStateMark(b).cls : 'text-base-content/60'"
                             x-text="'#' + rowPR(b).number"></a>
                        </template>
                        <span x-show="!rowPR(b) && branchState(b) === 'nopr'"
                              title="No pull request has ever been opened for this branch"
                              class="font-mono text-base-content/30 shrink-0">no&nbsp;PR</span>
                        <template x-if="branchStateMark(b)">
                          <span class="shrink-0 flex items-center" :class="branchStateMark(b).cls"
                                :title="BRANCH_STATE_NOTE[branchState(b)]">
                            <i class="ph text-sm" :class="branchStateMark(b).icon"></i></span>
                        </template>
                      </div>
                      <p x-show="b.subject" class="text-base text-base-content/45 truncate"
                         :title="b.subject" x-text="b.subject"></p>
                      <div class="flex items-center gap-x-3.5 gap-y-1 flex-wrap text-base text-base-content/40">
                        <!-- Lifespan, not just the last touch: how long ago the
                             first commit landed, then the tip. -->
                        <span x-show="b.date" class="flex items-center gap-1 tabular-nums"
                              :title="branchSpanTitle(b)">
                          <template x-if="branchStart(b)">
                            <span class="flex items-center gap-1">
                              <span x-text="branchStart(b)"></span>
                              <i class="ph ph-arrow-right text-xs opacity-70"></i>
                            </span>
                          </template>
                          <span x-text="agoShort(b.date)"></span>
                        </span>
                        <span x-show="b.ahead !== null || b.behind !== null"
                              class="flex items-center gap-1 tabular-nums"
                              :title="'Commits this branch has that ' + b.def + ' does not, and the reverse'">
                          <i class="ph ph-arrow-up text-sm"></i><span x-text="b.ahead ?? '–'"></span>
                          <i class="ph ph-arrow-down text-sm ml-0.5"></i><span x-text="b.behind ?? '–'"></span>
                        </span>
                        <span x-show="b.nUnique" class="flex items-center gap-1 tabular-nums"
                              :title="b.nUnique + ' files this branch uniquely touched, ' + b.nLanded + ' of them already on ' + b.def">
                          <i class="ph ph-files text-sm"></i><span x-text="b.nUnique"></span>
                        </span>
                        <!-- The scan's one actionable verdict: content this
                             branch touched that the default branch does not
                             hold, which is what makes a landed row worth a
                             second look rather than a claim. -->
                        <span x-show="b.nMissing" class="flex items-center gap-1 tabular-nums text-warning"
                              :title="b.nMissing + ' files this branch touched are absent from ' + b.def">
                          <i class="ph ph-warning-circle text-sm"></i><span x-text="b.nMissing"></span>
                        </span>
                      </div>
                    </div>
                  </template>
                </div>

                <p x-show="n.kind === 'record' && !n.children.length"
                   class="text-base text-base-content/30 mt-1"
                   title="Either the session committed nothing, or its branches are older than the branch crawl reaches">
                  no branch in the crawl's window</p>
                </div>
              </template>

              <!-- The branches the tree cannot hold. No commit trailer and no
                   record naming them, so nothing says which act made them.
                   Unattributed, which is not the same claim as sessionless. -->
              <div x-show="sessionOrphans.length" class="rounded-lg bg-base-200/40 p-3 mt-1">
                <div class="flex items-center gap-2 mb-1">
                  <i class="ph ph-question text-base-content/50 text-lg"></i>
                  <span class="text-base font-medium"
                        x-text="'Unattributed branches (' + sessionOrphans.length + ')'"></span>
                </div>
                <div class="flex flex-col gap-1">
                  <template x-for="b in sessionOrphans" :key="b.repo + '/' + b.name">
                    <div class="flex items-center gap-2 min-w-0 text-base">
                      <span class="font-mono text-base-content/40 shrink-0 tabular-nums" x-text="b.date.slice(0, 10)"></span>
                      <span class="font-mono text-base-content/40 shrink-0" x-text="repoShort(b.repo)"></span>
                      <a :href="branchPageFor(b.repo, b.name)" target="_blank" rel="noopener"
                         class="font-mono truncate min-w-0 hover:text-primary transition-colors" x-text="b.name"></a>
                    </div>
                  </template>
                </div>
              </div>
            </div>

            <!-- ── Stars: the relation drawn ──────────────────────────────────
                 Every session that committed, as a hub with one satellite per
                 repo-branch. Nothing joins one star to another, because no
                 repo-branch is claimed by two sessions, and that is the reading
                 the list is built on. -->
            <div x-show="authed && sessionLens === 'stars'" class="text-base-content">
              <div class="flex flex-wrap gap-1.5 mb-3">
                <template x-for="r in lensRepos" :key="r">
                  <span class="badge badge-sm border-0 text-white"
                        :style="'background:' + lensColor(r)" x-text="r"></span>
                </template>
              </div>
              <div x-html="starsSvg" @click="pickStar"></div>
              <div x-show="starPick" class="rounded-lg bg-base-200/50 p-3 mt-2 text-base">
                <div class="flex items-center gap-2">
                  <span class="font-mono font-semibold" x-text="starPick?.id"></span>
                  <span class="text-base-content/50 tabular-nums"
                        x-text="(starPick?.day || '') + ' · ' + durLabel(starPick?.mins || 0)"></span>
                </div>
                <p class="text-base-content/70 mt-0.5" x-text="starPick?.ask"></p>
                <div class="flex flex-wrap gap-1.5 mt-2">
                  <template x-for="b in (starPick?.branches || [])" :key="b.repo + '/' + b.name">
                    <span class="font-mono text-base-content/60">
                      <span class="text-base-content/40" x-text="b.repo"></span>
                      <span x-text="b.name"></span></span>
                  </template>
                </div>
              </div>
              <p x-show="!starPick" class="text-base text-base-content/40 mt-2">
                Tap a star to read the session behind it.</p>
            </div>

            <!-- ── Repos: the graph that is not disconnected ───────────────── -->
            <div x-show="authed && sessionLens === 'repos'" class="text-base-content">
              <p class="text-base text-base-content/60 mb-2">
                Collapse each session's branches to the repos they sit in and the picture inverts:
                one component, every repo reachable from every other. An edge is a session that
                touched both, its weight the number that did.</p>
              <div x-html="reposSvg"></div>
              <p class="text-base text-base-content/40 mt-1">
                Node size and the number inside it are sessions that touched the repo.</p>
            </div>

            <!-- ── Counts: the argument as arithmetic ─────────────────────── -->
            <div x-show="authed && sessionLens === 'counts'" class="flex flex-col gap-5">
              <div>
                <h3 class="text-base font-medium">Branches per session</h3>
                <p class="text-base text-base-content/50 mb-2">
                  From the session records: the repo-branches a session committed to.</p>
                <template x-for="r in lensBranchesPerSession" :key="r.k">
                  <div class="flex items-center gap-2 text-base">
                    <span class="w-6 text-right tabular-nums text-base-content/50" x-text="r.k"></span>
                    <div class="h-4 rounded-sm bg-primary/70" :style="'width:' + r.pct + '%'"></div>
                    <span class="tabular-nums text-base-content/50" x-text="r.n"></span>
                  </div>
                </template>
              </div>
              <div>
                <h3 class="text-base font-medium">Sessions per branch</h3>
                <p class="text-base text-base-content/50 mb-2">
                  From the branch crawl: sessions read off each branch's commit trailers.</p>
                <template x-for="r in lensSessionsPerBranch" :key="r.k">
                  <div class="flex items-center gap-2 text-base">
                    <span class="w-6 text-right tabular-nums text-base-content/50" x-text="r.k"></span>
                    <div class="h-4 rounded-sm bg-secondary/70" :style="'width:' + r.pct + '%'"></div>
                    <span class="tabular-nums text-base-content/50" x-text="r.n"></span>
                  </div>
                </template>
              </div>
              <div class="rounded-lg bg-base-200/50 p-3 text-base">
                <p class="font-medium mb-1">Why the list nests this way</p>
                <p class="text-base-content/70">
                  The first histogram has a long tail and the second does not. A session holds many
                  branches; a branch holds one session, with a single exception in the whole estate.
                  Nesting the many inside the one therefore duplicates nothing except that exception,
                  which appears under both of its sessions and is marked where it does.</p>
                <p class="text-base-content/70 mt-2" x-text="sessionJoinNote"></p>
                <p class="text-base-content/50 mt-2">
                  The zero row of the second histogram is not a claim that no session made those
                  branches. It is the count of branches whose commits carry no trailer.</p>
              </div>
            </div>

            <!-- ── Attention: the cross-session rollup ────────────────────────
                 Which files the estate is actually working, counted by DISTINCT
                 sessions rather than by accesses: one session editing a file
                 forty times says the session was busy, ten sessions opening it
                 says the file is load-bearing. Folded into the cache, so it
                 costs this pane nothing to show.

                 The honesty note is not decoration. The files field counts the four
                 file tools and nothing else, so a file read through a shell
                 command, or a doc injected at session start rather than opened,
                 reads as zero here. The numbers say what was OPENED BY A FILE
                 TOOL, and a reader who takes them for "what gets read" will
                 have them exactly backwards on the most-read docs. -->
            <div x-show="authed && sessionAttention.length" class="mt-6">
              <button @click="showAttention = !showAttention"
                      class="flex items-center gap-1.5 text-base text-base-content/60 hover:text-base-content mb-2">
                <i class="ph text-sm" :class="showAttention ? 'ph-caret-down' : 'ph-caret-right'"></i>
                <i class="ph ph-chart-bar text-lg opacity-60"></i>
                <span x-text="'File attention across ' + sessionRows.length + ' sessions'"></span>
              </button>
              <template x-if="showAttention">
                <div>
                  <p class="text-sm text-base-content/45 mb-2 max-w-2xl">
                    Distinct sessions that opened each file, busiest first. Counts Read, Edit,
                    Write and NotebookEdit only: a file opened through a shell command, or a doc
                    injected at session start, does not appear here at all.
                  </p>
                  <div class="flex flex-col gap-0.5">
                    <template x-for="a in sessionAttention.slice(0, 40)" :key="a.path">
                      <div class="flex items-center gap-2 text-base font-mono">
                        <span class="text-base-content/70 truncate flex-1" x-text="a.path"></span>
                        <span class="text-base-content/40 shrink-0 tabular-nums"
                              :title="a.count + ' accesses, last ' + (a.last || '').slice(0, 10)"
                              x-text="a.sessions + ' × '"></span>
                      </div>
                    </template>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- ── Guides view (Activity sub-tab) ────────────────────────────
               Every guide the estate holds, in flight first. A guide
               (pages/guides/*.html) argues a case rather than doing work, and
               it is the one thing in Activity that says WHY: a branch shows
               what changed, a session who did it, neither what it means or
               what is still undecided.

               NOTHING HERE IS DECLARED. A card's branch, PR, and session come
               off the activity cache's open-PR rows, which already carry
               "head" and "sessions" because the crawl resolves them from the
               Claude-Session: commit trailer. So a guide is linked to its
               work by derivation, and a guide with no open PR simply shows no
               link rather than being hidden: the list is every guide, and the
               link is what varies.

               The scan is bounded by PULL REQUESTS, not branches. Branches are
               not deleted here, so the estate carries 228 grouped "active"
               against 12 open PRs (2026-08-06); a directory read per branch is
               228 requests for what 12 answer, and a guide in flight lives on
               a PR branch by construction. -->
          <div class="flex-1 min-w-0" :class="tab==='guides' ? '' : 'hidden'"
               x-effect="tab === 'guides' && authed && guideRepos.length && loadGuides()">
            <div x-show="!authed" class="text-base text-base-content/50 italic py-6">
              Sign in to read the estate's guides.
            </div>
            <div x-show="authed && guidesBusy && !guideRows.length"
                 class="text-base text-base-content/50 italic py-6">Reading the shelves…</div>
            <div x-show="authed && !guidesBusy && !guideRows.length"
                 class="text-base text-base-content/50 italic py-6">
              No guides yet. A guide is a page under <span class="font-mono">pages/guides/</span>
              that argues a case: what was measured, what the options are, what it recommends.
            </div>

            <div x-show="authed && guideRows.length"
                 class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <template x-for="g in guideRows" :key="g.repo + ':' + g.path">
                <div class="rounded-lg border border-base-300 bg-base-100 flex flex-col overflow-hidden"
                     :class="g.prs.length && 'border-primary/40'">
                  <!-- The committed screenshot, at the guide's own ref. A guide
                       is a page, so the pages gallery's card is the right
                       shape; what differs is that the shot is read from the
                       branch rather than from main's pages.json, since the
                       guide worth looking at is often the one not landed. The
                       band holds its 16:10 whether or not a shot arrives, so
                       a row of cards does not jump as they resolve. -->
                  <a :href="guideRender(g)" target="_blank" rel="noopener"
                     class="block aspect-[16/10] bg-base-200 overflow-hidden shrink-0">
                    <img x-show="guideThumb(g)" :src="guideThumb(g)" :alt="g.title"
                         loading="lazy" class="w-full h-full object-cover object-top">
                    <span x-show="!guideThumb(g)"
                          class="w-full h-full flex items-center justify-center text-base-content/25">
                      <i class="ph ph-book-open-text text-4xl"></i>
                    </span>
                  </a>
                  <div class="p-4 flex flex-col gap-2 grow">
                  <div class="flex items-start gap-2">
                    <div class="min-w-0 flex-1">
                      <a :href="guideRender(g)" target="_blank" rel="noopener"
                         class="font-semibold text-base hover:text-primary block truncate"
                         :title="g.path" x-text="g.title"></a>
                      <div class="font-mono text-sm text-base-content/45 truncate" x-text="g.repo"></div>
                    </div>
                    <!-- In flight is the card's one status, and it is the sort
                         key too: a guide with an open PR is the one awaiting a
                         decision. A landed guide says nothing and needs to. -->
                    <span x-show="g.prs.length" class="badge badge-primary badge-sm shrink-0">in flight</span>
                    <span x-show="!g.prs.length && g.onMain"
                          class="badge badge-ghost badge-sm shrink-0">landed</span>
                  </div>

                  <!-- The link, where it exists. Branch, PR, session: the three
                       handles Activity's other two panes are built on, so a
                       guide row reaches both of them. -->
                  <template x-for="pr in g.prs" :key="pr.number">
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <a :href="'https://github.com/' + g.repo + '/pull/' + pr.number"
                         target="_blank" rel="noopener"
                         class="inline-flex items-center gap-1 text-base-content/70 hover:text-primary">
                        <i class="ph ph-git-pull-request"></i><span x-text="'#' + pr.number"></span>
                      </a>
                      <a :href="branchPageFor(g.repo, pr.head)" target="_blank" rel="noopener"
                         class="inline-flex items-center gap-1 font-mono text-base-content/60 hover:text-primary min-w-0">
                        <i class="ph ph-git-branch shrink-0"></i>
                        <span class="truncate" x-text="pr.head"></span>
                      </a>
                      <template x-for="(sx, i) in pr.sessions" :key="sx">
                        <a :href="sx" target="_blank" rel="noopener"
                           class="inline-flex items-center gap-1 text-base-content/60 hover:text-primary"
                           :title="'The Claude Code session that authored this'">
                          <i class="ph ph-terminal-window"></i><span x-text="'session'"></span>
                        </a>
                      </template>
                    </div>
                  </template>

                  <div class="grow"></div>
                  <div class="flex items-center gap-3 text-sm text-base-content/50">
                    <a :href="guideRender(g)" target="_blank" rel="noopener"
                       class="inline-flex items-center gap-1 hover:text-primary">
                      <i class="ph ph-frame-corners"></i>render</a>
                    <a :href="'https://github.com/' + g.repo + '/blob/' + (g.refs[g.refs.length-1] || 'main') + '/' + g.path"
                       target="_blank" rel="noopener"
                       class="inline-flex items-center gap-1 hover:text-primary">
                      <i class="ph ph-github-logo"></i>source</a>
                  </div>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- ── Chats view (Activity sub-tab) ─────────────────────────────
               The chat archive as the fourth venue, read one month at a time
               off mehrlander/chat-histories. 14,844 conversations across three
               providers, and this loads none of them until asked: the archive
               is already sharded by month, so the pane opens on the newest
               month and walks back on demand (kits/chat-archive.js).

               The banner is not decoration and not an apology. This is the one
               pane whose subject advances by hand, through an export requested
               on a website and downloaded from an email, so how far behind it
               is IS the state of the venue. It reads the frontier the archive
               generates for itself, which the repo's declared staleness check
               reads too, so the pane and the estate card cannot disagree.

               No refresh control. There is nothing here to refresh: the shards
               are immutable once committed and the frontier only moves when an
               export lands, which is a commit to that repo rather than a crawl
               this page could run. -->
          <div class="flex-1 min-w-0" :class="tab==='chats' ? '' : 'hidden'"
               x-effect="tab === 'chats' && authed && loadChats()">
            <p x-show="!authed" class="text-base text-base-content/60">
              The chat archive is private. Add a token on Repos to read it.
            </p>

            <!-- The failure state, and it carries a Retry because the loader
                 deliberately will not retry itself: an effect-driven loader
                 that relaunches on failure spins forever (see chatsTried). -->
            <div x-show="authed && chatsErr" class="rounded-xl border border-warning/40 bg-warning/5 p-4 max-w-2xl">
              <div class="flex items-start gap-2">
                <i class="ph ph-warning-circle text-lg text-warning shrink-0 mt-0.5"></i>
                <div class="min-w-0">
                  <p class="text-base">Could not read the archive.</p>
                  <p class="text-sm text-base-content/60 font-mono mt-1 break-words" x-text="chatsErr"></p>
                </div>
              </div>
              <button @click="retryChats()" :disabled="chatsBusy"
                      class="btn btn-ghost btn-sm gap-1.5 text-base mt-2">
                <i class="ph" :class="chatsBusy ? 'ph-circle-notch animate-spin' : 'ph-arrow-clockwise'"></i>
                <span x-text="chatsBusy ? 'Reading…' : 'Retry'"></span>
              </button>
            </div>

            <!-- ── The frontier banner ────────────────────────────────────────
                 Per provider: how current it is, how big it is, and the export
                 cadence the gap should be read against. A number of days means
                 nothing on its own, which is why the interval sits beside it:
                 34 days is due where exports have run every 18 to 35 days and
                 alarming where they have run weekly. The due mark fires only
                 when a provider is past its OWN longest observed gap.
                 No backticks in this block: the markup is a JS template
                 literal and one would end it mid-component. -->
            <template x-if="authed && chatBanner">
              <div class="rounded-xl border p-3 mb-4"
                   :class="chatBanner.due ? 'border-warning/40 bg-warning/5' : 'border-base-300 bg-base-200/30'">
                <div class="flex items-center flex-wrap gap-x-3 gap-y-1 text-base">
                  <i class="ph text-lg" :class="chatBanner.due ? 'ph-warning-circle text-warning' : 'ph-archive opacity-60'"></i>
                  <span>Every provider archived through
                    <span class="font-mono font-semibold" x-text="chatBanner.archivedThrough"></span></span>
                  <span class="text-base-content/50" x-text="'· ' + chatBanner.behind + ' days back'"></span>
                  <span class="ml-auto font-mono text-base-content/45 tabular-nums"
                        x-text="chatBanner.chats.toLocaleString() + ' chats'"></span>
                </div>
                <div class="mt-2 flex flex-col gap-1">
                  <template x-for="p in chatBanner.rows" :key="p.key">
                    <div class="flex items-center gap-2 text-sm">
                      <span class="w-20 shrink-0" :class="p.due ? 'text-warning font-medium' : 'text-base-content/70'"
                            x-text="p.label"></span>
                      <span class="font-mono tabular-nums text-base-content/60" x-text="p.frontier || '---'"></span>
                      <span class="font-mono tabular-nums"
                            :class="p.due ? 'text-warning' : 'text-base-content/45'"
                            x-text="p.behind == null ? '' : p.behind + 'd'"></span>
                      <span class="text-base-content/35 truncate min-w-0"
                            :title="p.snapshots.join(', ')"
                            x-text="p.cadence.longest == null
                                      ? 'one export, no cadence yet'
                                      : p.cadence.count + ' exports, longest gap ' + p.cadence.longest + 'd'"></span>
                      <span class="ml-auto font-mono text-base-content/35 tabular-nums shrink-0"
                            x-text="p.chats.toLocaleString()"></span>
                    </div>
                  </template>
                </div>
                <!-- The limit, stated where the number is read. Every consumer
                     of the frontier repeats this because the number invites
                     exactly the wrong inference. -->
                <p class="mt-2 text-sm text-base-content/45">
                  The archive can say when it last heard, never how much it is missing: a
                  windowed export filters by creation date only, so revivals and deletions
                  are invisible to one.
                </p>
              </div>
            </template>

            <!-- Provider chips, the same contract as the session scopes: counts
                 off the loaded set, so the row doubles as the census of what is
                 on screen rather than of the corpus. -->
            <div x-show="authed && chatRows.length"
                 class="flex items-center gap-1.5 mb-3 -mx-1 px-1 pb-0.5 overflow-x-auto">
              <button @click="chatProvider = ''"
                      class="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors"
                      :class="!chatProvider ? 'bg-primary/10 text-primary' : 'bg-base-200/60 text-base-content/60 hover:text-base-content'">
                All<span class="font-mono opacity-60" x-text="chatRows.length"></span></button>
              <template x-for="p in chatProviders" :key="p.key">
                <button @click="chatProvider = (chatProvider === p.key ? '' : p.key)"
                        class="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors"
                        :class="chatProvider === p.key ? 'bg-primary/10 text-primary' : 'bg-base-200/60 text-base-content/60 hover:text-base-content'">
                  <span x-text="p.label"></span>
                  <span class="font-mono opacity-60" x-text="p.count"></span></button>
              </template>
              <!-- The hand catalog is the archive's precious layer, so it gets
                   a filter of its own rather than only a per-row mark: "show me
                   what I summarized myself" is a different question from "show
                   me June". -->
              <button @click="chatHandOnly = !chatHandOnly"
                      :title="'Only chats carrying a hand-written catalog entry'"
                      class="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors"
                      :class="chatHandOnly ? 'bg-primary/10 text-primary' : 'bg-base-200/60 text-base-content/60 hover:text-base-content'">
                <i class="ph ph-hand-pointing text-base"></i>Hand
                <span class="font-mono opacity-60" x-text="chatHandCount"></span></button>
            </div>

            <div x-show="authed && chatsBusy && !chatRows.length" class="flex justify-center py-16">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>

            <!-- One row per chat. Left rail marks the hand catalog, which is the
                 only per-row distinction worth a colour here: everything else
                 about a chat is in its title and its tags. -->
            <div x-show="authed && chatRows.length" class="flex flex-col gap-2">
              <template x-for="row in visibleChatRows" :key="row.url">
                <div class="rounded-lg border-l-4 pl-3 pr-3 py-2 transition-colors hover:brightness-[1.02]"
                     :class="row.hand ? 'border-primary/50 bg-primary/5' : 'border-base-300 bg-base-100'">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-mono text-base text-base-content/50 shrink-0 tabular-nums"
                          x-text="row.date"></span>
                    <!-- The title opens the chat on the provider's own site.
                         A Gemini row has no address to open, so it renders as
                         plain text rather than as an anchor that goes nowhere;
                         the tooltip says which case it is. -->
                    <a x-show="row.open" :href="row.open" target="_blank" rel="noopener"
                       class="font-medium hover:text-primary transition-colors truncate min-w-0"
                       :title="row.title" x-text="row.title"></a>
                    <span x-show="!row.open" class="font-medium text-base-content/70 truncate min-w-0"
                          :title="row.title + ' (Gemini sessions have no per-chat address)'"
                          x-text="row.title"></span>
                    <span x-show="row.hand" class="badge badge-primary badge-sm shrink-0"
                          title="Hand-written catalog entry, the archive's precious layer">hand</span>
                  </div>
                  <p x-show="row.summary" class="text-base text-base-content/60 line-clamp-2 mt-0.5"
                     :title="row.summary" x-text="row.summary"></p>
                  <div x-show="row.tags.length" class="flex items-center flex-wrap gap-1.5 mt-1.5">
                    <template x-for="t in row.tags.slice(0, 6)" :key="t">
                      <!-- A tag filters the loaded months rather than searching
                           the corpus. Searching every chat is the search-chats
                           skill's job and needs the snapshots; this is the
                           cheap chat-to-chat link the pane can honestly make. -->
                      <button @click="chatTag = (chatTag === t ? '' : t)"
                              class="rounded px-1.5 py-0.5 text-sm font-mono transition-colors"
                              :class="chatTag === t ? 'bg-primary/15 text-primary' : 'bg-base-200/70 text-base-content/50 hover:text-base-content'"
                              x-text="t"></button>
                    </template>
                  </div>
                </div>
              </template>
            </div>

            <!-- The paging control, and the pane's whole economy in one button.
                 Each tap is two small requests for one more month. The count
                 says what is loaded against what exists, so "5 of 40 months" is
                 an honest statement that most of the archive is not on screen
                 rather than an empty list pretending to be complete. -->
            <div x-show="authed && chatMonths.length" class="mt-4 flex items-center gap-3">
              <button @click="loadMoreChats()" :disabled="chatsBusy || !chatMoreAvailable"
                      class="btn btn-ghost btn-sm gap-1.5 text-base">
                <i class="ph" :class="chatsBusy ? 'ph-circle-notch animate-spin' : 'ph-arrow-down'"></i>
                <span x-text="chatsBusy ? 'Reading…' : (chatMoreAvailable ? 'Earlier month' : 'Nothing earlier')"></span>
              </button>
              <span class="text-sm text-base-content/45"
                    x-text="chatLoadedMonths.length + ' of ' + chatMonths.length + ' months loaded'
                            + (chatFiltered ? ' · ' + visibleChatRows.length + ' of ' + chatRows.length + ' shown' : '')"></span>
              <button x-show="chatFiltered" @click="chatProvider = ''; chatTag = ''; chatHandOnly = false"
                      class="text-sm text-base-content/50 hover:text-primary">clear filters</button>
            </div>
          </div>

          <!-- ── Routes view (Activity sub-tab) ───────────────────────────
               Every destination the app can be sent to, ranked by when the
               code behind it last moved, with whatever is open against it now.

               WHAT THIS PANE IS FOR. The other four Activity panes are keyed
               to git: a branch, the session that ran it, the body that
               accounts for it. All of them answer "who was working, and
               when". None answers "on WHAT part of the app", and the app is
               where most of the work goes. This is that reading, keyed to the
               address rather than to the commit.

               THE JOIN IS FILES, AND FILES ARE COARSER THAN ROUTES. Nine
               routes render out of estate.js, so a commit there could date all
               nine; the shell holds the router and every pane's outer markup,
               so a commit there would date everything. The kit
               (lib/kits/route-activity.js) handles both by refusing the
               attribution rather than making it: the shell is excluded and
               gets its own row at the foot, and a file carrying three or more
               routes cannot be a row's REASON, only its fallback, in which
               case the row says "shared" beside the date. The exclusions are
               not a limitation the pane hides; they are what it has to show,
               because a route with no narrow carrier is a route with no code
               of its own, and that count is the header's second figure. -->
          <div class="flex-1 min-w-0" :class="tab==='routes' ? '' : 'hidden'"
               x-effect="tab === 'routes' && authed && loadRoutes()">
            <p x-show="!authed" class="text-base text-base-content/60">
              Routes are read from the hub's own history. Add a token on Repos to see them.
            </p>

            <div x-show="authed && routesBusy && !routeRows.length"
                 class="text-base text-base-content/50 italic py-6">Dating the routes…</div>

            <!-- Same shape as the Chats failure state, and for the same
                 reason: the loader will not retry itself, so the retry has to
                 be a gesture. -->
            <div x-show="authed && routesError"
                 class="rounded-xl border border-warning/40 bg-warning/5 p-4 max-w-2xl mb-4">
              <div class="flex items-start gap-2">
                <i class="ph ph-warning-circle text-lg text-warning shrink-0 mt-0.5"></i>
                <div class="min-w-0">
                  <p class="text-base">Could not read the routes.</p>
                  <p class="text-sm text-base-content/60 font-mono mt-1 break-words" x-text="routesError"></p>
                </div>
              </div>
              <button @click="loadRoutes(true)" :disabled="routesBusy"
                      class="btn btn-ghost btn-sm gap-1.5 text-base mt-2">
                <i class="ph" :class="routesBusy ? 'ph-circle-notch animate-spin' : 'ph-arrow-clockwise'"></i>
                <span x-text="routesBusy ? 'Reading…' : 'Retry'"></span>
              </button>
            </div>

            <!-- The census, in one line. Three figures, and the second is the
                 one worth the pane: how many destinations have no code that is
                 theirs alone. It is a reading of the app's shape, not a to-do,
                 which is why it states the number and stops. -->
            <div x-show="authed && routeRows.length"
                 class="flex items-center flex-wrap gap-x-3 gap-y-1 mb-3 text-base">
              <i class="ph ph-signpost text-lg text-base-content/50"></i>
              <span><span class="font-mono font-semibold" x-text="routeRows.length"></span> routes</span>
              <span class="text-base-content/50"
                    x-text="'· ' + routesWithoutCode + ' with no file of their own'"></span>
              <span x-show="routesInFlight" class="text-primary"
                    x-text="'· ' + routesInFlight + ' with work open'"></span>
              <span x-show="routeFlattened" class="text-base-content/50"
                    title="A sub-tab addressed as its own ?view= key. Each was a nav stop once and kept its key so saved links resolve, which is why it sits under another destination here."
                    x-text="'· ' + routeFlattened + ' sub-tabs with a view key'"></span>
              <!-- The ref, whenever it is not the default. Every figure and
                   date on this pane is read from one tree, so a preview that
                   did not say which tree would be reporting the branch's
                   routes against nothing in particular. -->
              <span x-show="routesRef !== 'main'"
                    class="badge badge-sm badge-ghost font-mono gap-1"
                    :title="'read at ' + routesRef">
                <i class="ph ph-git-branch"></i><span x-text="routesRef"></span></span>
              <span class="ml-auto font-mono text-sm text-base-content/40"
                    x-show="routesLoadedAt" x-text="agoShort(routesLoadedAt)"></span>
            </div>

            <!-- RANKED, THEN FOLDED INTO NAV STOPS. Two earlier shapes were
                 both wrong and in opposite directions. A section per manifest
                 group cost the pane its headline: an hour-old route sat below
                 a six-day-old one because they were in different sections. A
                 flat list fixed that and introduced its own confusion, listing
                 six FOSSIL keys at the same rank as live destinations, since
                 the router addresses Sessions, Guides, Chats, Routes, Jot and
                 Saved as their own ?view= key even though each is a sub-tab of
                 something else. (They were all nav stops once; each kept its
                 key when its pane moved under another, so saved links resolve.)
                 Grouping by the declared stop puts that level back, and taking the order
                 from the ranking rather than recomputing it is what keeps
                 freshest-first true at both levels: see the kit. A stop that
                 owns one route is not a grouping and renders as a plain row. -->
            <div x-show="authed && routeRows.length"
                 class="flex flex-col divide-y divide-base-300/50 border-y border-base-300/50 mb-4">
              <template x-for="s in routeStops" :key="s.stop">
                <div class="py-2">
                  <!-- The stop's own line, only where it owns more than one
                       route. It carries no date of its own: the freshest row is
                       directly below it and would be saying the same thing
                       twice, which is the noise a heading is supposed to save. -->
                  <div x-show="!s.solo" class="flex items-baseline gap-2 mb-1.5">
                    <span class="text-base font-semibold" x-text="s.stop"></span>
                    <span class="font-mono text-sm text-base-content/35"
                          :title="s.rows.length + ' views under one nav stop'"
                          x-text="s.rows.length"></span>
                    <!-- nowrap: inside a badge a two-word label breaks across
                         two lines and the pill's own border reads as a strike
                         through the text. Measured at 390 px. -->
                    <span x-show="s.open"
                          class="badge badge-sm badge-primary badge-outline font-mono shrink-0 whitespace-nowrap"
                          x-text="s.open + ' open'"></span>
                  </div>
                  <div :class="s.solo ? '' : 'pl-3 border-l-2 border-base-300/60 flex flex-col gap-2.5'">
                  <template x-for="r in s.rows" :key="r.key">
                    <div :class="s.solo ? '' : 'min-w-0'">
                      <!-- The row proper. The label opens the route where the
                           address can be honoured, and is plain text where it
                           cannot: an address carrying a placeholder has no
                           single destination, so offering a tap would be
                           offering a guess. -->
                      <div class="flex items-baseline gap-2 flex-wrap">
                        <button x-show="routeIsOpenable(r)" @click="openRoute(r)"
                                class="text-base font-medium hover:underline shrink-0"
                                :class="routeIsShell(r) ? 'text-base-content/60' : 'text-primary'"
                                x-text="r.label"></button>
                        <span x-show="!routeIsOpenable(r)" class="text-base font-medium shrink-0"
                              :class="routeIsShell(r) ? 'text-base-content/50' : ''"
                              x-text="r.label"></span>
                        <!-- The placeholders are trimmed off; the ellipsis says
                             so and the tooltip carries the full shape. -->
                        <code class="text-sm text-base-content/45 font-mono" :title="r.address">
                          <span x-text="routeShortAddress(r)"></span><span
                            x-show="routeAddressTruncated(r)" class="opacity-50">…</span></code>
                        <!-- The stop line already names the group for a folded
                             stop, so the row only says it when it stands alone. -->
                        <span x-show="s.solo" class="text-sm text-base-content/35"
                              x-text="routeGroupLabel(r.group)"></span>
                        <span x-show="r.branches.length"
                              class="badge badge-sm badge-primary badge-outline font-mono shrink-0 whitespace-nowrap"
                              x-text="r.branches.length + ' open'"></span>
                        <!-- A PR whose only hit is a file several routes share
                             is NEAR this route, not on it. Shown, because it
                             may well be the work; ghosted and uncounted,
                             because nothing here can tell. -->
                        <span x-show="r.nearBranches.length"
                              class="badge badge-sm badge-ghost font-mono shrink-0 whitespace-nowrap"
                              :title="'touches a file this route shares, so it may or may not be this route'"
                              x-text="r.nearBranches.length + ' near'"></span>
                        <div class="grow"></div>
                        <!-- The date, and the caveat attached to it rather
                             than filed somewhere else. "shared" means the row
                             is standing on a file several routes carry, so the
                             date is the truest available and not a claim about
                             this route in particular. -->
                        <template x-if="r.lastTouch">
                          <a :href="r.lastTouch.url" target="_blank" rel="noopener"
                             class="font-mono text-sm tabular-nums shrink-0 hover:text-primary"
                             :class="r.borrowed ? 'text-base-content/35' : 'text-base-content/60'"
                             :title="r.lastTouch.subject + ' · ' + r.lastTouch.shortSha">
                            <span x-text="agoShort(r.lastTouch.date)"></span>
                            <span x-show="r.borrowed" class="italic ml-1">shared</span>
                          </a>
                        </template>
                        <span x-show="!r.lastTouch" class="font-mono text-sm text-base-content/30 shrink-0"
                              x-text="r.hasOwnCode ? 'unread' : 'no code'"></span>
                      </div>
                      <div class="flex items-baseline gap-2 mt-0.5">
                        <p class="text-sm text-base-content/55 min-w-0" x-text="r.what"></p>
                        <button @click="toggleRouteRow(r.key)"
                                class="ml-auto shrink-0 text-sm text-base-content/40 hover:text-primary">
                          <i class="ph" :class="routeOpenRow === r.key ? 'ph-caret-up' : 'ph-caret-down'"></i>
                        </button>
                      </div>

                      <!-- Expanded: what the row is standing on. Every declared
                           file with its own date and how many routes it
                           carries, then the open PRs that touch it and which
                           file each one hit. This is where the coarseness
                           becomes legible instead of merely disclosed. -->
                      <template x-if="routeOpenRow === r.key">
                        <div class="mt-2 pl-3 border-l-2 border-base-300 flex flex-col gap-1.5">
                          <!-- The full address, where the row trimmed it. Here
                               rather than on the row because it is a shape to
                               read once, not a label to scan. -->
                          <code x-show="routeAddressTruncated(r)"
                                class="text-sm font-mono text-base-content/55 break-all"
                                x-text="r.address"></code>
                          <p x-show="r.note" class="text-sm text-base-content/50 italic" x-text="r.note"></p>
                          <p x-show="!r.files.length && !r.note" class="text-sm text-base-content/50 italic">
                            No file of its own.
                          </p>
                          <template x-for="f in r.files" :key="f.path">
                            <div class="flex items-baseline gap-2 text-sm">
                              <code class="font-mono text-base-content/70 truncate min-w-0" x-text="f.path"></code>
                              <span x-show="f.shared"
                                    class="shrink-0 text-base-content/35 font-mono"
                                    :title="'carries ' + f.routes + ' routes'"
                                    x-text="'×' + f.routes"></span>
                              <div class="grow"></div>
                              <span class="font-mono tabular-nums text-base-content/40 shrink-0"
                                    x-text="f.touch ? agoShort(f.touch.date) : '—'"></span>
                            </div>
                          </template>
                          <template x-if="r.tabs">
                            <div class="flex items-center gap-1 flex-wrap pt-1">
                              <span class="text-sm text-base-content/40">tabs:</span>
                              <template x-for="t in r.tabs" :key="t">
                                <code class="text-sm font-mono text-base-content/55 bg-base-200/60 rounded px-1.5"
                                      x-text="t"></code>
                              </template>
                            </div>
                          </template>
                          <template x-for="b in r.branches.concat(r.nearBranches)" :key="b.pr">
                            <div class="flex items-baseline gap-2 text-sm pt-1">
                              <i class="ph ph-git-pull-request text-base shrink-0"
                                 :class="r.branches.includes(b) ? 'text-primary' : 'text-base-content/30'"></i>
                              <a :href="b.url" target="_blank" rel="noopener"
                                 class="hover:underline truncate min-w-0"
                                 :class="r.branches.includes(b) ? 'text-primary' : 'text-base-content/45'"
                                 x-text="'#' + b.pr + ' ' + b.title"></a>
                              <span x-show="!r.branches.includes(b)"
                                    class="shrink-0 italic text-base-content/35">near</span>
                              <span class="shrink-0 font-mono text-base-content/35"
                                    :title="b.hits.join(', ')"
                                    x-text="b.hits.length + (b.hits.length === 1 ? ' file' : ' files')"></span>
                            </div>
                          </template>
                        </div>
                      </template>
                    </div>
                  </template>
                  </div>
                </div>
              </template>
            </div>

            <!-- The shell, on its own row, because it is every route's file
                 and therefore no route's signal. Excluding it silently would
                 leave a reader wondering why the busiest file in the app never
                 dates anything. -->
            <template x-if="authed && routeShell">
              <div class="rounded-xl border border-base-300 bg-base-200/30 p-3 text-sm">
                <div class="flex items-baseline gap-2 flex-wrap">
                  <i class="ph ph-browsers text-base text-base-content/50"></i>
                  <span class="font-medium text-base">Shell</span>
                  <code class="font-mono text-base-content/60" x-text="routeShell.path"></code>
                  <span class="text-base-content/40 font-mono"
                        x-text="'×' + routeShell.routes"></span>
                  <div class="grow"></div>
                  <template x-if="routeShell.touch">
                    <a :href="routeShell.touch.url" target="_blank" rel="noopener"
                       class="font-mono tabular-nums text-base-content/50 hover:text-primary"
                       :title="routeShell.touch.subject"
                       x-text="agoShort(routeShell.touch.date)"></a>
                  </template>
                </div>
                <p class="text-base-content/50 mt-1" x-text="routeShell.note"></p>
              </div>
            </template>
          </div>

          </div>

          <!-- ── Lists view ────────────────────────────────────────────────
               Pin over To-do over Jot, all at once. To-do and Jot were two of
               Activity's pills and they were never activity: a personal
               checklist and an idea pile are things you keep, not the estate
               moving. Combined they are one stop, and combining them is what
               makes the tab unnecessary rather than merely fewer: the reason
               to switch was to see the other one, and now both are on screen.
               Pin rides on top as a compact block rather than a third half;
               its section comment below carries its own design.

               The split is fixed halves, each scrolling INSIDE itself, so
               adding to one never pushes the other off. That needs a definite
               height, which the estate pane hands down through the shell
               (listsFill: the pane and its column go flex + overflow-hidden
               for this view only). Nothing here adds a card, a border box, or
               a second layer of padding: two sections, one hairline between
               them, and the scroll happens on the list rather than the page.

               Each half keeps its own add form and heading pinned while its
               list scrolls, since the add form is the reason you came. -->
          <div :class="tab==='lists' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'">
            <p x-show="!authed" class="text-base text-base-content/60">
              Set a token (Repos, top right) to see your lists.
            </p>

            <template x-if="authed">
              <div class="flex-1 min-h-0 flex flex-col">

                <!-- ── Pin: personal memory as internal links ───────────────
                     The keep-at-hand sibling of the sidebar's per-repo Pinned
                     block: same icon, same open rule (extension = file, else
                     the Files view at that folder), but the person's list
                     rather than a repo's, so a target is a full
                     owner/repo[@ref]:path address and the store is the
                     registry (lists/pins.json). Denser than the two lists
                     below because a pin is a title, not a sentence: a
                     multi-column grid grouped by each pin's group (falling
                     back to its repo), in the links board's idiom. shrink-0
                     with its own capped scroll, so a growing pin wall never
                     squeezes To-do and Jot out of their halves. -->
                <section class="shrink-0 flex flex-col max-h-[35%] mb-3 pb-3 border-b border-base-300/60">
                  <div class="flex items-center gap-x-2 gap-y-1.5 flex-wrap mb-2">
                    <i class="ph ph-push-pin text-lg text-base-content/50"></i>
                    <span class="text-base font-semibold">Pin</span>
                    <span x-show="pinItems.length" class="font-mono text-sm text-base-content/40"
                          x-text="pinItems.length"></span>
                    <div class="grow"></div>
                    <!-- Two-field add: the address is the pin, the title is
                         optional and defaults to the path's last segment.
                         min-w is higher than the single-input forms below:
                         two fields sharing 14rem left the address a few
                         characters wide on a phone, so this form claims a
                         full row of its own sooner (the header row wraps). -->
                    <form @submit.prevent="addPin()" class="flex gap-2 min-w-[20rem] flex-1 max-w-md">
                      <!-- Verb-led like the sibling forms ("Add a to-do…",
                           "Jot an idea…"), keeping the format hint: without
                           the verb this read as a repo filter, not capture. -->
                      <input x-model="pinDraft" placeholder="Pin a file: owner/repo:path"
                             autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off"
                             class="input input-bordered input-sm flex-1 min-w-[9rem] font-mono">
                      <!-- The other way in: the shared tap-through picker
                           (alpineComponents/path-picker, the fab's), estate
                           repos first. Picking fills the address draft, so
                           both routes converge on the same + commit and a
                           title can still be typed before it.
                           .stop is load-bearing: the picker closes on any
                           click outside its own root, and this trigger is
                           outside it (see the fab's identical note). -->
                      <button type="button" @click.stop="togglePinPicker()"
                              title="Pick a file from your repos"
                              class="btn btn-ghost btn-sm btn-square border border-base-300 shrink-0">
                        <i class="ph" :class="pinPickerOpen ? 'ph-caret-up' : 'ph-folder-simple'"></i></button>
                      <input x-model="pinTitle" placeholder="title"
                             autocomplete="off" class="input input-bordered input-sm w-24 min-w-0">
                      <button type="submit" class="btn btn-primary btn-sm gap-1 shrink-0" :disabled="!pinDraft.trim()">
                        <i class="ph ph-plus"></i></button>
                    </form>
                  </div>
                  <!-- The picker mounts lazily, as a bare panel (trigger:false)
                       anchored here so its tree drops under the add form. Lazy
                       (x-if on first toggle) for the same reason the fab
                       injects its GH: the estate mounts in harnesses that load
                       only its own file, and an always-mounted x-data would
                       demand path-picker everywhere the estate boots. The
                       x-ref sits on a WRAPPER, not the picker's own element
                       (x-ref against the closest component root; see fab). -->
                  <template x-if="pinPickerWanted">
                    <div x-ref="pinPicker" @path-pick="pinPicked($event.detail)">
                      <div x-data="pathPicker({ trigger: false, dense: true, gh: () => pinPickerGh(), roots: () => pinPickerRoots() })"></div>
                    </div>
                  </template>
                  <div x-show="pinLoading" class="flex justify-center py-4">
                    <span class="loading loading-dots loading-md opacity-30"></span>
                  </div>
                  <div x-show="!pinLoading" class="min-h-0 overflow-y-auto -mx-1 px-1">
                    <template x-for="g in pinGroups" :key="g.label">
                      <div class="mb-1.5">
                        <div class="text-sm font-medium uppercase tracking-wide text-base-content/40 px-2 mb-0.5"
                             x-text="g.label"></div>
                        <div class="grid gap-x-4 gap-y-0.5" style="grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))">
                          <template x-for="it in g.items" :key="it.id">
                            <div class="flex items-start gap-2 px-2 py-1 rounded-lg hover:bg-base-200/60 group min-w-0">
                              <i class="ph ph-push-pin text-base-content/30 mt-0.5 shrink-0"></i>
                              <div class="flex-1 min-w-0">
                                <button @click="openPin(it)" :title="it.target"
                                        class="block w-full text-left text-base truncate hover:text-primary transition-colors"
                                        x-text="it.title || it.target"></button>
                                <p x-show="it.note" class="text-sm text-base-content/45 truncate" x-text="it.note"></p>
                              </div>
                              <button type="button" @click="deletePin(it)"
                                      class="opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 text-base-content/30 hover:text-error transition-opacity shrink-0 mt-0.5"
                                      title="Unpin (the target stays where it lives)"><i class="ph ph-push-pin-slash"></i></button>
                            </div>
                          </template>
                        </div>
                      </div>
                    </template>
                    <p x-show="!pinItems.length" class="text-base text-base-content/40 italic px-2 py-2">
                      Nothing pinned. Paste an address above to keep a file at hand.
                    </p>
                  </div>
                  <div x-show="pinErr" class="text-base text-error font-mono mt-1" x-text="pinErr"></div>
                </section>

                <!-- ── To-do: shaped intentions ──────────────────────────── -->
                <section class="flex-1 min-h-0 flex flex-col">
                  <div class="flex items-center gap-x-2 gap-y-1.5 flex-wrap mb-2">
                    <i class="ph ph-list-checks text-lg text-base-content/50"></i>
                    <span class="text-base font-semibold">To-do</span>
                    <span x-show="todoOpen.length" class="font-mono text-sm text-base-content/40"
                          x-text="todoOpen.length"></span>
                    <!-- The urgent count rides beside the total rather than
                         replacing it, since "2 of 9" is the reading and a lone
                         urgent count hides how much else is waiting. Absent at
                         zero: a permanent "0 urgent" is the page-of-green-rails
                         problem the session list already avoids. -->
                    <span x-show="todoHot.length"
                          class="badge badge-error badge-sm gap-1 font-mono"
                          :title="todoHot.length + ' needing attention (flagged urgent, or due today or overdue)'">
                      <i class="ph-fill ph-warning text-xs"></i><span x-text="todoHot.length"></span></span>
                    <div class="grow"></div>
                    <!-- min-w keeps the input readable: below that the row wraps
                         and the form takes its own full-width line, which is
                         what a phone gets. No breakpoint, so there is no width
                         at which the two rules disagree. -->
                    <form @submit.prevent="addTodo()" class="flex gap-2 min-w-[14rem] flex-1 max-w-md">
                      <input x-model="todoDraft" placeholder="Add a to-do…" autocomplete="off"
                             class="input input-bordered input-sm flex-1 min-w-0">
                      <button type="submit" class="btn btn-primary btn-sm gap-1 shrink-0" :disabled="!todoDraft.trim()">
                        <i class="ph ph-plus"></i></button>
                    </form>
                  </div>

                  <div x-show="todoLoading" class="flex justify-center py-10">
                    <span class="loading loading-dots loading-md opacity-30"></span>
                  </div>

                  <!-- The scroll container. -mx-1 px-1 so a row's hover tint
                       still runs to the section's edge without the scrollbar
                       clipping it. -->
                  <div x-show="!todoLoading" class="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
                    <div class="flex flex-col gap-1">
                      <!-- An urgent row takes the colored left rail plus faint
                           tint the branch and session rows use for state, and
                           a non-urgent row takes the same border in transparent
                           so nothing shifts sideways when the flag turns on.
                           Only urgent gets a color, for the reason the session
                           list gives: a page of rails says nothing.

                           The flag button is ALWAYS visible, where delete is
                           hover-revealed. They differ because the risks differ:
                           delete is destructive and unreversible, so hiding it
                           behind hover is worth what it costs a phone, while
                           flagging is one tap either way and a control nobody
                           can reach on a phone is a control that does not
                           exist. Off is a faint outline flag, on is a filled
                           one, the same state-in-the-weight idiom the links
                           page uses for its rail pins. A button is interactive
                           content, so neither one activates the wrapping label
                           the way a tap on the row does. -->
                      <template x-for="it in todoOpen" :key="it.id">
                        <label class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg border-l-4 hover:bg-base-200/60 group"
                               :class="isHot(it) ? 'border-error bg-error/5' : 'border-transparent'">
                          <input type="checkbox" :checked="it.done" @change="toggleTodo(it)"
                                 class="checkbox checkbox-sm">
                          <span class="text-base flex-1 min-w-0" :class="isHot(it) && 'font-medium'" x-text="it.text"></span>

                          <!-- Due date. A transparent native date input lies
                               over its own chip, so one tap anywhere on the
                               chip opens the platform picker (the iOS wheel)
                               with no showPicker() call to depend on and no
                               per-row x-ref to collide inside the x-for. The
                               picker's own clear control hands back '', which
                               setDue reads as "no date". -->
                          <span class="relative shrink-0 flex items-center">
                            <span x-show="it.due" class="badge badge-sm font-mono whitespace-nowrap"
                                  :class="dueClass(it.due)" x-text="dueLabel(it.due)"></span>
                            <i x-show="!it.due" class="ph ph-calendar-blank text-base-content/20"></i>
                            <input type="date" :value="it.due || ''" @change="setDue(it, $event.target.value)"
                                   :title="it.due ? 'Due ' + it.due : 'Set a due date'"
                                   class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                          </span>

                          <button type="button" @click="toggleUrgent(it)" class="shrink-0 transition-colors"
                                  :class="it.urgent ? 'text-error' : 'text-base-content/20 hover:text-error'"
                                  :title="it.urgent ? 'Clear urgent' : 'Mark urgent'">
                            <i :class="it.urgent ? 'ph-fill ph-flag' : 'ph ph-flag'"></i></button>
                          <!-- Tailwind 4 wraps the hover variant in
                               @media (hover: hover), so a hover-revealed
                               control does not exist at all on a touch device:
                               this row's delete was unreachable on a phone. The
                               arbitrary variant restores it there and leaves the
                               pointer case alone, both verified against the
                               generated CSS (4.3.3) rather than assumed. -->
                          <button type="button" @click="deleteTodo(it)"
                                  class="opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 text-base-content/30 hover:text-error transition-opacity shrink-0"
                                  title="Delete"><i class="ph ph-trash"></i></button>
                        </label>
                      </template>
                      <p x-show="!todoOpen.length && !todoDone.length" class="text-base text-base-content/40 italic px-2 py-6 text-center">
                        Nothing on the list. Add something above.
                      </p>

                      <div x-show="todoDone.length" class="mt-3 pt-2 border-t border-base-300/60">
                        <button @click="todoShowDone = !todoShowDone"
                                class="flex items-center gap-1 text-base text-base-content/50 hover:text-base-content/80 px-2 mb-1">
                          <i class="ph text-sm" :class="todoShowDone ? 'ph-caret-down' : 'ph-caret-right'"></i>
                          <span x-text="todoDone.length + ' done'"></span>
                        </button>
                        <template x-if="todoShowDone">
                          <div class="flex flex-col gap-1">
                            <!-- No rail and no flag down here. A done item is
                                 not urgent, whatever it was on the way in, and
                                 the flag it keeps in the file is what it wears
                                 again if it is reopened. The transparent border
                                 is only so the two lists' rows align. -->
                            <template x-for="it in todoDone" :key="it.id">
                              <label class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg border-l-4 border-transparent hover:bg-base-200/60 group">
                                <input type="checkbox" :checked="it.done" @change="toggleTodo(it)"
                                       class="checkbox checkbox-sm">
                                <span class="text-base flex-1 line-through text-base-content/40" x-text="it.text"></span>
                                <button type="button" @click="deleteTodo(it)"
                                        class="opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 text-base-content/30 hover:text-error transition-opacity shrink-0"
                                        title="Delete"><i class="ph ph-trash"></i></button>
                              </label>
                            </template>
                          </div>
                        </template>
                      </div>
                    </div>
                  </div>
                  <div x-show="todoErr" class="text-base text-error font-mono mt-1" x-text="todoErr"></div>
                </section>

                <!-- ── Jot: captured ideas ───────────────────────────────────
                     Named in the singular now. A jot has no done state: it sits
                     in the pile, newest first with its age showing, until it is
                     promoted somewhere real (a chron entry, a tracker task, a
                     to-do) or deleted. The file behind it stays lists/jots.json,
                     since renaming a data file to match a label is a migration
                     that buys nothing. -->
                <section class="flex-1 min-h-0 flex flex-col border-t border-base-300/60 mt-3 pt-3">
                  <div class="flex items-center gap-x-2 gap-y-1.5 flex-wrap mb-2">
                    <i class="ph ph-lightbulb text-lg text-base-content/50"></i>
                    <span class="text-base font-semibold">Jot</span>
                    <span x-show="jotItems.length" class="font-mono text-sm text-base-content/40"
                          x-text="jotItems.length"></span>
                    <div class="grow"></div>
                    <form @submit.prevent="addJot()" class="flex gap-2 min-w-[14rem] flex-1 max-w-md">
                      <input x-model="jotDraft" placeholder="Jot an idea…" autocomplete="off"
                             class="input input-bordered input-sm flex-1 min-w-0">
                      <button type="submit" class="btn btn-primary btn-sm gap-1 shrink-0" :disabled="!jotDraft.trim()">
                        <i class="ph ph-plus"></i></button>
                    </form>
                  </div>

                  <div x-show="jotLoading" class="flex justify-center py-10">
                    <span class="loading loading-dots loading-md opacity-30"></span>
                  </div>

                  <div x-show="!jotLoading" class="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
                    <div class="flex flex-col gap-1">
                      <template x-for="it in jotPile" :key="it.id">
                        <div class="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-base-200/60 group">
                          <i class="ph ph-lightbulb text-base-content/30 mt-1 shrink-0"></i>
                          <span class="text-base flex-1" x-text="it.text"></span>
                          <span class="text-sm text-base-content/35 mt-0.5 shrink-0" :title="it.created_at"
                                x-text="agoShort(it.created_at)"></span>
                          <button type="button" @click="deleteJot(it)"
                                  class="opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 text-base-content/30 hover:text-error transition-opacity shrink-0 mt-0.5"
                                  title="Delete"><i class="ph ph-trash"></i></button>
                        </div>
                      </template>
                      <p x-show="!jotPile.length" class="text-base text-base-content/40 italic px-2 py-6 text-center">
                        Nothing in the pile. Jot an idea above.
                      </p>
                    </div>
                  </div>
                  <div x-show="jotErr" class="text-base text-error font-mono mt-1" x-text="jotErr"></div>
                </section>

              </div>
            </template>
          </div>

          <!-- ── Surface editor dialog: a JSON editor over one surface file,
               mirroring the repo config dialog. New surfaces get an editable
               filename; existing ones show it read-only. Writes the registry. -->
          <dialog x-ref="surfDlg" class="modal" onclick="if(event.target===this)this.close()">
            <div class="modal-box shadow-none border border-base-300 bg-base-100 p-4 max-w-lg overflow-x-hidden">
              <div class="flex items-center gap-1.5 text-base font-semibold mb-3">
                <i class="ph ph-cards text-primary"></i>
                <span x-text="surfIsNew ? 'New surface' : 'Edit surface'"></span>
              </div>
              <div class="flex items-center gap-1.5 mb-2">
                <span class="text-base text-base-content/50 font-mono">surfaces/</span>
                <template x-if="surfIsNew">
                  <input x-model="surfName" placeholder="name.surface"
                         autocapitalize="off" autocorrect="off" spellcheck="false"
                         class="input input-bordered font-mono text-base flex-1">
                </template>
                <template x-if="!surfIsNew">
                  <span class="font-mono text-base" x-text="surfName"></span>
                </template>
              </div>
              <textarea x-model="surfDraft" spellcheck="false" rows="14"
                class="textarea textarea-bordered w-full font-mono text-base leading-snug"
                :class="surfErr && 'textarea-error'" placeholder="{ }"></textarea>
              <div class="flex items-center justify-between gap-2 min-h-[1.25rem] mt-1">
                <span x-show="surfErr" class="text-error text-base flex items-center gap-1 min-w-0">
                  <i class="ph ph-warning shrink-0"></i><span class="truncate" x-text="surfErr"></span></span>
                <span x-show="!surfErr" class="text-success text-base flex items-center gap-1">
                  <i class="ph ph-check"></i>Valid JSON</span>
                <button @click="surfFormat()" :disabled="!!surfErr" class="btn btn-ghost shrink-0">Format</button>
              </div>
              <div class="flex items-center justify-end gap-2 mt-3">
                <button @click="$refs.surfDlg.close()" class="btn btn-ghost text-base">Cancel</button>
                <button @click="surfSave()" :disabled="!!surfErr || surfSaving || !authed || (surfIsNew && !surfName.trim())"
                        class="btn btn-primary text-base gap-1.5">
                  <span x-show="surfSaving" class="loading loading-spinner loading-md"></span>
                  <span x-text="surfSaving ? 'Saving…' : 'Save surface'"></span>
                </button>
              </div>
            </div>
          </dialog>

          <!-- ── The branch menu: GitHub destinations for one Open row ──────
               Mounted here at the template root rather than inside the row,
               so the panel is a sibling of the list instead of a child of a
               row that scrolls. Fixed, positioned from the trigger's rect
               (openBranchMenu over the shell's shared anchorMenu), and built
               to the repo menu's row spec: .wt-menu-row, flat, an out-arrow on
               anything that leaves the app. Opens on hover where the pointer
               can hover, like every other anchored menu here; entering the
               panel cancels the countdown leaving the trigger started. ──── -->
          <div x-show="branchMenuAt" x-cloak @click.outside="branchMenuAt = null"
               @mouseenter="cancelBranchClose()" @mouseleave="hoverLeaveBranchMenu()"
               class="fixed z-[55] w-56 max-h-[60vh] overflow-y-auto rounded-lg border border-base-300 bg-base-100 shadow-lg"
               :style="branchMenuStyle">
            <div class="flex flex-col p-0.5">
              <template x-for="item in branchMenuItems" :key="item.key">
                <button @click="runBranchMenu(item.key)"
                        class="wt-menu-row w-full flex items-center gap-1.5 rounded px-1.5 text-left transition-colors hover:bg-base-200 active:bg-base-300">
                  <i class="ph shrink-0 text-sm text-base-content/50" :class="item.icon"></i>
                  <span class="min-w-0 flex-1 truncate" x-text="item.label"></span>
                  <i x-show="item.external" class="ph ph-arrow-square-out shrink-0 text-xs text-base-content/30"></i>
                </button>
              </template>
            </div>
          </div>

          <!-- ── The file card ────────────────────────────────────────────
               One of the row's two file pairs, opened. Three bands: what it is
               and how many lines, the SHAPE (extensions and top folders, from
               the crawl, so it paints with no call), and the LIST (from the
               compare, fetched on open and shared with the branch takeover
               through the same memo). Each filename opens on GitHub, and the
               footer opens the branch view's Files pane, which is the same
               material with diffs under it.

               Same geometry, hover timings and dismissal as the branch menu
               above, so the two anchored panels in this view behave alike; one
               z-index higher, since opening a card puts the menu away rather
               than the other way round. -->
          <div x-show="rowCard" x-cloak @click.outside="closeRowCard()"
               @mouseenter="cancelRowCardClose()" @mouseleave="hoverLeaveRowCard()"
               class="fixed z-[56] w-96 max-w-[calc(100vw-1rem)] max-h-[60vh] overflow-y-auto
                      rounded-lg border border-base-300 bg-base-100 shadow-lg"
               :style="rowCardStyle">
            <template x-if="rowCard">
              <div class="flex flex-col">
                <div class="flex items-baseline gap-2 px-3 pt-2.5 pb-2 border-b border-base-200 sticky top-0 bg-base-100">
                  <i class="ph text-base self-center"
                     :class="rowCard.kind === 'list' ? rowCard.icon + ' text-base-content/50'
                           : rowCard.cls === 'added' ? 'ph-file-plus text-success'
                           : rowCard.cls === 'missing' ? 'ph-warning-circle text-warning'
                           : rowCard.cls === 'ahead' ? 'ph-arrow-up text-success'
                           : rowCard.cls === 'behind' ? 'ph-arrow-down text-base-content/50'
                           : 'ph-files text-base-content/50'"></i>
                  <span class="font-mono font-semibold tabular-nums"
                        x-text="rowCardSummary?.count ?? '–'"></span>
                  <span class="text-sm text-base-content/70"
                        x-text="rowCard.kind === 'list' ? rowCard.label
                                  : rowCard.kind === 'commits'
                                  ? (rowCardSummary?.count === 1 ? 'commit' : 'commits')
                                  : rowCard.cls === 'added' ? 'new'
                                  : rowCard.cls === 'missing' ? 'missing' : 'changed'"></span>
                  <span x-show="rowCard.kind === 'commits'" class="text-sm text-base-content/45"
                        x-text="(rowCard.cls === 'ahead' ? 'ahead of ' : 'behind ') + rowCard.base"></span>
                  <span class="grow"></span>
                  <span x-show="rowCardSummary?.lines" class="font-mono text-xs text-base-content/40"
                        x-text="rowCardSummary?.lines"
                        title="lines added and removed across these files"></span>
                </div>

                <!-- ── The list body ──────────────────────────
                     Label and count, biggest first, exactly as the record
                     stored them. No fetch and no loading state: what a title
                     was hiding was never remote, only small. -->
                <template x-if="rowCard.kind === 'list'">
                  <div class="flex flex-col py-1">
                    <template x-for="(r, i) in rowCard.rows" :key="i">
                      <div class="flex items-baseline gap-2 px-3 py-1">
                        <span class="min-w-0 flex-1 truncate text-xs text-base-content/85"
                              :class="r.mono ? 'font-mono' : ''" x-text="r.label" :title="r.label"></span>
                        <span class="shrink-0 font-mono tabular-nums text-xs text-base-content/50"
                              x-text="r.n.toLocaleString()"></span>
                      </div>
                    </template>
                    <p x-show="rowCard.note" class="px-3 pt-1.5 pb-1 text-[10px] text-base-content/45"
                       x-text="rowCard.note"></p>
                  </div>
                </template>

                <!-- ── The commits body ────────────────────────────────────
                     A list, not a diff: sha, subject, when, who. Every entry
                     opens its commit on GitHub.

                     Neither side costs a call. The branch's own commits are the
                     compare's, which the file cards already fetch; the default
                     branch's are the newest the crawl stores per repo, which it
                     has always fetched for its own moved-or-not gate and never
                     read for anything else. That is the whole reason both arrows
                     could become cards at once rather than one now and one when
                     someone paid for it. -->
                <template x-if="rowCard.kind === 'commits'">
                  <div class="flex flex-col py-1">
                    <div x-show="rowCardMine?.loading && rowCard.cls === 'ahead'"
                         class="flex items-center gap-2 px-3 py-3 text-xs text-base-content/50">
                      <span class="loading loading-spinner loading-xs"></span>reading the compare…</div>
                    <div x-show="rowCardCommits === null" class="px-3 py-2 text-xs text-warning">
                      This branch forked before the
                      <span x-text="mainCommits(rowCard.repo).length"></span> newest commits the crawl keeps,
                      so the list is not here. The count is right.
                    </div>
                    <template x-for="c in (rowCardCommits || [])" :key="c.sha">
                      <a :href="commitUrl(rowCard.repo, c.sha)" target="_blank" rel="noopener"
                         class="flex flex-col gap-0.5 px-3 py-1 hover:bg-base-200 transition-colors">
                        <span class="flex items-baseline gap-2">
                          <span class="min-w-0 flex-1 truncate text-xs text-base-content/85"
                                x-text="c.msg" :title="c.msg"></span>
                          <span class="shrink-0 font-mono text-[10px] text-base-content/35"
                                x-text="c.sha.slice(0, 7)"></span>
                        </span>
                        <span class="flex items-baseline gap-2 text-[10px] text-base-content/40">
                          <span x-text="agoShort(c.date)"></span>
                          <span x-show="c.author" class="truncate" x-text="c.author"></span>
                        </span>
                      </a>
                    </template>
                    <p x-show="rowCardCommitGap" class="px-3 py-1 text-[10px] text-base-content/45">
                      <span x-text="rowCardCommitGap"></span> more, past what the crawl keeps.
                    </p>
                  </div>
                </template>

                <!-- What the missing class means, said once where it is read. The other
                     two name themselves; this one is a verdict, and a card
                     listing files under a bare word nobody defined is the
                     tooltip problem again in a nicer box. -->
                <p x-show="rowCard.kind === 'files' && rowCard.cls === 'missing'"
                   class="px-3 py-2 border-b border-base-200 text-xs text-base-content/60">
                  On this branch and not on <span class="font-mono" x-text="rowCard.base"></span>,
                  at this path or as these bytes. Deleting the branch loses them.
                </p>

                <!-- The shape, and the one band that needs no network. Absent
                     rather than empty on a cache written before the digest
                     existed, since a row of nothing reads as a failure. -->
                <div x-show="rowCard.kind === 'files' && (rowCard.shape.exts.length || rowCard.shape.dirs.length)"
                     class="px-3 py-2 flex flex-col gap-1.5 border-b border-base-200 text-xs">
                  <div class="flex flex-wrap gap-x-3 gap-y-1">
                    <template x-for="pair in rowCard.shape.exts" :key="'e' + pair[0]">
                      <span class="flex items-baseline gap-1">
                        <span class="font-mono text-base-content/70" x-text="pair[0]"></span>
                        <span class="font-mono tabular-nums text-base-content/35" x-text="pair[1]"></span></span>
                    </template>
                  </div>
                  <div class="flex flex-wrap gap-x-3 gap-y-1">
                    <template x-for="pair in rowCard.shape.dirs" :key="'d' + pair[0]">
                      <span class="flex items-center gap-1">
                        <i class="ph ph-folder-simple text-sm text-base-content/25"></i>
                        <span class="text-base-content/70" x-text="pair[0]"></span>
                        <span class="font-mono tabular-nums text-base-content/35" x-text="pair[1]"></span></span>
                    </template>
                  </div>
                </div>

                <div x-show="rowCard.kind === 'files'" class="flex flex-col py-1">
                  <div x-show="rowCardMine?.loading"
                       class="flex items-center gap-2 px-3 py-3 text-xs text-base-content/50">
                    <span class="loading loading-spinner loading-xs"></span>reading the diff…</div>
                  <div x-show="rowCardMine && !rowCardMine.loading && rowCardMine.noBase"
                       class="px-3 py-2 text-xs text-warning">
                    No merge base with <span class="font-mono" x-text="rowCard.base"></span>,
                    so there is no diff to list here.</div>
                  <div x-show="rowCardMine?.error" class="px-3 py-2 text-xs text-warning"
                       x-text="rowCardMine?.error"></div>
                  <!-- A row OPENS, rather than only linking out. The compare
                       embeds the unified diff beside the file list, so the card
                       is already holding every patch it can show and expanding
                       one asks nobody for anything. That is the whole reason
                       this can encroach on the branch detail at all: the detail
                       fetches per file, and this fetched them all at once
                       without meaning to.

                       The GitHub link keeps its own small target at the row's
                       end, so opening a diff in place did not cost the route
                       out to the file. -->
                  <template x-for="f in rowCardList" :key="f.path">
                    <div class="flex flex-col">
                      <div class="flex items-baseline gap-2 px-3 py-1 hover:bg-base-200 transition-colors"
                           :class="rowCardOpen === f.path && 'bg-base-200'">
                        <button @click="toggleRowCardPatch(f.path)" :disabled="!f.patch"
                                :title="f.patch ? f.path + (f.prev ? ' (was ' + f.prev + ')' : '')
                                                : f.path + ' (no diff in this response)'"
                                class="min-w-0 flex-1 flex items-baseline gap-1 text-left truncate text-xs
                                       disabled:cursor-default">
                          <i class="ph text-xs shrink-0 self-center text-base-content/30"
                             :class="!f.patch ? 'ph-dot' : rowCardOpen === f.path ? 'ph-caret-down' : 'ph-caret-right'"></i>
                          <span class="min-w-0 truncate">
                            <span class="font-mono text-base-content/40" x-text="rowCardDir(f.path)"></span><span
                              class="font-mono text-base-content/85" x-text="rowCardName(f.path)"></span></span>
                        </button>
                        <span x-show="f.additions" class="shrink-0 font-mono text-[11px] tabular-nums text-success"
                              x-text="'+' + f.additions"></span>
                        <span x-show="f.deletions" class="shrink-0 font-mono text-[11px] tabular-nums text-error"
                              x-text="'-' + f.deletions"></span>
                        <a :href="fileBlobUrl(rowCard.repo, rowCard.name, f.path)" target="_blank" rel="noopener"
                           :title="'Open ' + f.path + ' on GitHub'"
                           class="shrink-0 self-center text-base-content/25 hover:text-primary transition-colors">
                          <i class="ph ph-arrow-square-out text-xs"></i></a>
                      </div>
                      <template x-if="rowCardOpen === f.path && f.patch">
                        <div class="border-y border-base-200 bg-base-200/40">
                          <pre class="text-[10px] leading-[1.35] font-mono m-0 px-2 py-1 overflow-x-auto
                                      whitespace-pre"><template x-for="(l, i) in patchLines(f.patch)" :key="i"><span
                            class="block px-1 rounded-sm" :class="l.cls" x-text="l.t"></span></template></pre>
                          <p x-show="patchOverflow(f.patch)" class="px-3 py-1 text-[10px] text-base-content/45">
                            <span x-text="patchOverflow(f.patch)"></span> more lines, not shown. Open the file on GitHub for the rest.
                          </p>
                        </div>
                      </template>
                    </div>
                  </template>
                </div>

                <button x-show="rowCard.kind === 'files'" @click="openRowCardBranch()"
                        class="flex items-center gap-1.5 px-3 py-2 border-t border-base-200 text-xs
                               text-base-content/60 hover:bg-base-200 hover:text-primary transition-colors sticky bottom-0 bg-base-100">
                  <i class="ph ph-cards-three text-sm"></i>Open the branch, with diffs
                </button>
                <a x-show="rowCard.kind === 'commits'" target="_blank" rel="noopener"
                   :href="branchCommitsUrl(rowCard.repo, rowCard.cls === 'ahead' ? rowCard.name : rowCard.base)"
                   class="flex items-center gap-1.5 px-3 py-2 border-t border-base-200 text-xs
                          text-base-content/60 hover:bg-base-200 hover:text-primary transition-colors sticky bottom-0 bg-base-100">
                  <i class="ph ph-git-commit text-sm shrink-0"></i><span class="shrink-0">All commits on</span>
                  <span class="min-w-0 truncate font-mono"
                        x-text="rowCard.cls === 'ahead' ? rowCard.name : rowCard.base"></span>
                  <i class="ph ph-arrow-square-out text-xs opacity-40 shrink-0"></i>
                </a>
              </div>
            </template>
          </div>

          <!-- The branch detail is no longer markup. Tapping a branch name
               opens a swipe-deck (kits/swipe-deck.js) whose slides each mount
               the branchBrief component directly, so the reader gets the
               platform's own snap gesture: compositor-threaded, with momentum,
               interruptible mid-fling, and with the neighbouring branches
               really there under the finger rather than a single surface
               translated over a blank panel.

               What that replaced, and why the subtraction is the argument:
               about 540 lines here (a bespoke overlay, a hand-rolled
               touchstart/move/end drag, a two-phase commit animation, an
               instant facts card, a frame reference, a postMessage channel)
               plus 165 in branch-brief.js that existed only to talk across an
               iframe. The iframe was the whole reason for all of it, and it
               was never needed: this shell's own bundle already registers
               branchBrief and fileReview, and every kit the branch view wants
               loads into it with zero network requests, so the frame was a
               second copy of a library already running.

               The file deck now drills from this one (branch-brief.js,
               openFileDeck), which is the same mechanism one level down: same
               chrome, same gesture, different content, and Back returns here.
               See openBranchDetail below. -->
        </div>`,

      loading: true,
      authed: false,
      entries: [],     // [{repo, icon, note, group, order, meta, err, hasLanding, child}]
      surfaces: [],    // registry surfaces: [{uid, file, manifest, items, wasV1, raw}]
      surfLoading: false,
      surfActive: 0,
      surfArmed: '',   // uid of the surface whose delete is armed (two-tap)
      adoptRows: {},   // repo -> the portable-align row, read from the config cache
      scopeOpen: '',   // repo whose scope paragraph is expanded (one at a time)
      // The bench: one working set, one stager, in one fixed place at the top
      // of the view. There is no open/closed state left to track, because the
      // bench is always there, and no local copy of which surface it holds:
      // that is store.stageOrigin, which the stager saves through. A second
      // copy here would be a second truth, and the two drifted apart on every
      // path that touched one without the other (clearing was the live case).
      // Repo-declared surfaces, one entry per declared file, grouped by repo in
      // the view: [{repo, ref, path, uid, file, blob, manifest, items, raw}].
      repoSurfaces: [],
      repoSurfLoading: false,
      _acct: null,     // memoized account-repos list, one call per load pass
      // Per-item embed expand state, keyed by the surface uid + item id. Kept off
      // the item objects so the surface editor round-trips the file clean.
      embedOpen: {},

      // Activity: read from the private registry's derived cache
      // (state/activity.json, lib/kits/repo-activity-cache.js), the same read that
      // gives the Repos cards their freshness rollups and the Open view its
      // cross-repo branch list. One file read, no per-repo fanout.
      activity: {},           // { "owner/repo": <cache entry> }
      activityGeneratedAt: '',
      activityLoading: false,
      stagingBranch: '',      // "repo branch" key being staged (a compare is in flight)

      // Sessions: the registry's derived sessions cache (state/sessions.json,
      // lib/kits/repo-sessions-cache.js), one file read like the activity cache. The
      // rows are summaries; opening one fetches that session's full record from
      // the store on demand, since a record runs to half a megabyte and 40 of
      // them do not belong in a view.
      sessionRows_: [],
      sessionsGeneratedAt: '',
      sessionsLoading: false,
      sessionAttention: [],
      showAttention: false,
      sessionScope: 'day',
      sessionRepoFilter: '',
      openSessionId: '',
      sessionDetail: null,
      sessionDetailLoading: false,
      sessionDetailErr: '',

      // Surface editor dialog state (mirrors the repo config editor).
      surfIsNew: false,
      surfName: '',
      surfDraft: '{}',
      surfSaving: false,

      // To-do state: the full item list plus a show/hide toggle for the done
      // pile (kept, not deleted, so "done" stays a record rather than a wipe).
      todoItems: [],
      todoLoading: false,
      todoDraft: '',
      todoShowDone: false,
      todoErr: '',

      // Jot state: quick-captured ideas. No done state (see the Jots view
      // comment above); the pile renders newest first via jotPile.
      jotItems: [],
      jotLoading: false,
      jotDraft: '',
      jotErr: '',

      // Pin state: internal links kept at hand (see the Pin section comment
      // in the template). pinDraft is the address, pinTitle the optional
      // caption; pinGroups derives the grouped render.
      pinItems: [],
      pinLoading: false,
      pinDraft: '',
      pinTitle: '',
      pinErr: '',
      pinPickerWanted: false,

      // The registry client and the repo+token it was built for; see regGH().
      _regGH: null,
      _regKey: '',

      init(){
        this.$el.innerHTML = this.template;
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
        this.load();
        // A `&detail=` opens at MOUNT, not after the branch list lands. The
        // list is behind the private registry and therefore behind a token, so
        // hanging the address off it made the link work only for a signed-in
        // viewer, and do nothing at all otherwise: the takeover it names reads
        // one branch, which needs no list. It opens as a list of one and
        // upgrades to the full sequence when the list arrives.
        this.$nextTick(() => this.openDetailFromUrl());
        // Auth resolves after boot; reload when it lands. Any config save (a
        // repo's own config, or the registry) can change membership or a card,
        // so reload broadly.
        this.$watch(() => window.__shell && window.__shell._authState, (s) => {
          if (s === 'auth') this.load();
        });
        // A config save routes through the shell (web-tools:config-saved): it
        // force-rebuilds the registry cache and THEN dispatches configs-refreshed.
        // The estate reloads on configs-refreshed only, so it reads the committed
        // cache. Reloading on config-saved too would race the rebuild and render
        // the pre-save group/order until the next refresh. The shell's Refresh
        // views button and the Repos-view Refresh button both route here as well.
        document.addEventListener('web-tools:configs-refreshed', () => this.load());
        // The activity crawl commits state/activity.json and fires this; re-read
        // just the activity cache (the cards themselves haven't changed).
        // The crawl hands its own document over on this event, so the common
        // case costs no read at all: the file is 370 KB and the shell is
        // holding it. A detail-less event (a background pass, an older shell)
        // still falls back to reading.
        document.addEventListener('web-tools:activity-refreshed', (e) => this.reloadActivity(e?.detail?.cache));
        // Same contract for the sessions crawl, which commits state/sessions.json.
        document.addEventListener('web-tools:sessions-refreshed', () => this.reloadSessions());
        // The guides shelf has no cache and no crawl, so the shell has nothing
        // to route through the way it does for the other three: the reader and
        // the stamp both live here. The State view asks for a re-read by
        // announcement rather than reaching into this component, and the shell
        // reads the stamp back out through estateGuidesLoadedAt().
        document.addEventListener('web-tools:refresh-guides', () => this.loadGuides(true));
        // The shell's anchored panel opened (a Repos row, or an Open row's repo
        // chip), so put this view's branch panel away: two menus up at once is
        // never intended, and the pointer has clearly moved on.
        document.addEventListener('web-tools:repo-menu-open', () => {
          this.cancelBranchClose(); this.branchMenuAt = null;
        });
        // The bench saved a working surface into the registry. Only the shelf
        // changed, so re-read that alone rather than the whole estate: an
        // append has to appear here immediately or it does not read as one.
        window.addEventListener('web-tools:surfaces-changed', () => this.reloadSurfaces());
        // The sidebar's finder resolved a #PR or @branch hit. Same contract as
        // a &detail= deep link: switch to the Open list and open the takeover,
        // tolerating a row the cache does not carry (a list of one), so a
        // fresh push the crawl has not seen still opens.
        document.addEventListener('web-tools:open-branch-detail', (e) => {
          const { repo, name } = e.detail || {};
          if (!repo || !name) return;
          window.__shell?.goActivity?.();
          const inList = this.openRows.find(r => r.repo === repo && r.name === name);
          this.openBranchDetail(inList || { repo, name });
        });
        // The finder's session-search hit. Same shape as the branch event:
        // switch to the pane, open the record's reader. A row the cache knows
        // is preferred; {id, day} alone still resolves, since pathOf derives
        // the store path from exactly those two fields.
        document.addEventListener('web-tools:open-session', (e) => {
          const { id, day } = e.detail || {};
          if (!id) return;
          window.__shell?.goSessions?.();
          const row = (this.sessionRows_ || []).find(r => r.id === id) || { id, day };
          this.openSession(row);
        });
        // Latch the bench's mount on the first visit to the Stage. A watcher
        // rather than a test inside the `tab` getter: writing reactive state
        // from a getter runs during render and re-triggers the effect that
        // read it.
        this.$watch('tab', v => { if (v === 'stage') this.stageSeen = true; });
        if (this.tab === 'stage') this.stageSeen = true;
      },

      // Which saved surface the bench holds, and its name for the header. Both
      // read the store, so there is one answer to "where did this set come
      // from" and every path that changes it changes it once.
      get benchOrigin(){ return Alpine.store('browser')?.stageOrigin?.uid || ''; },
      get benchOriginName(){
        const o = Alpine.store('browser')?.stageOrigin;
        return (o && (o.manifest?.name || o.file)) || '';
      },
      onBench(s){ return !!this.benchOrigin && this.benchOrigin === s.uid; },
      // Latches on the first visit to the Stage and never clears; see the
      // mount site for why it is a latch rather than the live tab test.
      stageSeen: false,

      // A surface the bench was loaded from shows what is ON the bench, not
      // what is in its file. Otherwise the card would quietly disagree with the
      // set you are holding, and the disagreement is invisible: both are
      // plausible lists of files.
      live(s){
        if (this.benchOrigin !== s.uid) return s;
        const items = window.Surface.fromStage(Alpine.store('browser')?.stage || []).surface.items;
        return { ...s, items };
      },

      // Load a saved surface onto the bench, remembering where it came from so
      // a save writes back to that file. One-way: there is no "close" to undo,
      // because the bench is not a mode. detachBench() is the way back.
      loadOntoStage(s){
        const { items, skipped } = window.Surface.toStage(s);
        if (!items.length) return;
        Alpine.store('browser').stage = items;
        Alpine.store('browser').stageOrigin = { uid: s.uid, file: s.file, manifest: s.manifest, context: s.context };
        // Show what was just loaded. Under the old single scroll this was a
        // scroll-to-top; with two panes the bench is a pill away, so switch.
        window.__shell?.goStage?.();
        if (skipped.length)
          Alpine.store('toast')?.('cards', skipped.length + ' item(s) without a file stayed on the surface', 'alert-info', 3500);
      },

      // Keep the items, drop the write-back. Without this, a set loaded from a
      // saved surface could only ever be saved over that surface, so "start
      // from this one and make a different one" had no gesture.
      detachBench(){ Alpine.store('browser').stageOrigin = null; },

      // Which estate view is showing, from the shell (Repos | Stage | Lists |
      // Activity | Sessions). Two collapses happen here and they are not the
      // same shape: the Stage's two sub-views both answer 'stage' because one
      // pane renders both, and 'todo'/'jots' both answer 'lists' because the
      // two panes MERGED. Activity's four keep their own keys, since the pill
      // still switches between four panes.
      get tab(){
        const v = window.__shell?.view;
        if (v === 'stage' || v === 'surfaces') return 'stage';
        if (v === 'todo' || v === 'jots') return 'lists';
        return ACTIVITY_TABS.includes(v) ? v : 'repos';
      },
      // Whether any Activity sub-pane is showing. The pill row and both
      // composite wrappers ask this, and they used to ask it by spelling the
      // set out three times, which is three places to miss when a pane is added.
      get isActivityTab(){ return ACTIVITY_TABS.includes(this.tab); },
      // Which Stage pill is lit. Derived from the shell view rather than held
      // locally, so the URL is the state: a ?view=surfaces link opens on Saved
      // and a ?view=stage link on the bench, with no second copy to sync.
      get stageTab(){ return window.__shell?.view === 'surfaces' ? 'saved' : 'bench'; },
      // The pill counts. Both are live, which is what a pill buys over a plain
      // toggle: the staged set stays visible while you read the shelf, and the
      // saved pile while you work the bench.
      get stagedCount(){ return (Alpine.store('browser')?.stage || []).length; },
      get savedCount(){ return this.surfaces.length + this.repoSurfaces.length; },
      // Pill taps (Activity's three and the Stage's two): route through the
      // shell so the header nav, the URL stamp, and history stay on the one
      // navigation path a header tab tap uses.
      goSub(key){
        const s = window.__shell;
        if (!s) return;
        if (key === 'activity') s.goActivity();
        else if (key === 'sessions') s.goSessions();
        else if (key === 'guides') s.goGuides();
        else if (key === 'chats') s.goChats();
        else if (key === 'routes') s.goRoutes();
        else if (key === 'todo') s.goTodo();
        else if (key === 'jots') s.goJots();
        else if (key === 'stage') s.goStage();
        else if (key === 'surfaces') s.goSurfaces();
      },

      registry(){ return window.__shell?.REGISTRY_REPO || 'mehrlander/web-tools-private'; },
      // ONE GH for the registry, held for the life of the component, where all
      // thirteen call sites used to mint their own per gesture.
      //
      // gh-store records the sha a successful write returns on the instance
      // (`_shas`). That record is the only copy of the new sha anything here
      // can trust, because GitHub's read path is cached in the browser for a
      // minute and a re-read may not see the write that just landed. A fresh
      // GH per save discarded it every time, so the next write started with no
      // sha and had to rediscover it through exactly the cache that could not
      // answer: one check-off poisoned the next for a minute (2026-08-13, and
      // the account is on GH.FRESH). Holding the instance means the second
      // check-off carries the first one's sha and lands on the first try.
      //
      // Keyed on repo plus token so a shell that swaps either gets a new
      // instance rather than writing with a stale identity. The key is kept
      // separately from the instance because what a GH retains of its config
      // is its own business.
      regGH(){
        const key = this.registry() + ' ' + (window.TOKEN || '');
        if (this._regKey !== key) {
          this._regKey = key;
          this._regGH = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
        }
        return this._regGH;
      },
      defaultRepo(){ return window.__shell?.DEFAULT_REPO || 'mehrlander/web-tools'; },
      hasToken(){ return !!window.__shell?.hasToken?.(); },

      // ── Membership: read each repo's own config, filter estate:true ──────────
      // The estate reads the registry's config cache (state/configs.json, a
      // periodic crawl of every account repo's .web-tools.json) for membership
      // and fields, and falls back to a live account scan when the cache holds
      // no members yet (cold start). The registry stores no per-repo config.
      async readConfigCache(reg){
        try {
          const path = window.RepoConfigCache?.CACHE_PATH || 'state/configs.json';
          const cache = JSON.parse((await reg.get(path)).text);
          // The crawl's own stamp, off the read the estate was already making.
          // Repos had no as-of at all before the age pill: its Refresh button
          // asked whether to re-crawl without ever saying how old the answer
          // was.
          this.configsGeneratedAt = cache.generatedAt || '';
          // The alignment grades ride the same entries, so the cards get them
          // out of a read the estate was making anyway.
          this.readAdoption(cache);
          const out = {};
          for (const [name, e] of Object.entries(cache.repos || {})) out[name] = e?.config || null;
          return out;
        } catch { return {}; }
      },
      async liveScanConfigs(){
        const gh = new window.GH({ token: window.TOKEN });
        let acct = [];
        try { acct = await gh.repos(); } catch { acct = []; }
        const out = {};
        await Promise.all(acct.map(async (r) => {
          const g = new window.GH({ token: window.TOKEN, repo: r.full_name, ref: r.default_branch || 'main' });
          for (const n of ['.web-tools.json', '.show-repo.json']){
            try {
              const c = JSON.parse((await g.get(n)).text);
              if (c && typeof c === 'object' && !Array.isArray(c)){ out[r.full_name] = c; break; }
            } catch {}
          }
        }));
        return out;
      },

      async load(){
        this.authed = this.hasToken();
        this._acct = null;   // fresh account list per load pass
        if (!this.authed){
          // Public: the shell's public default card only, no surfaces, no
          // lists, no activity (all of it lives in the private registry).
          this.surfaces = [];
          this.repoSurfaces = [];
          this.todoItems = [];
          this.jotItems = [];
          this.pinItems = [];
          this.activity = {}; this.activityGeneratedAt = '';
          this.sessionRows_ = []; this.sessionsGeneratedAt = ''; this.sessionAttention = [];
          // Unfiled is an account question, so signed out there is no account to
          // ask about: /user/repos needs the token that isn't there.
          this.unfiledRepos = [];
          const def = this.defaultRepo();
          this.entries = [{ repo: def, icon: 'ph-toolbox', note: '', group: '', order: 0,
                            meta: null, err: false, hasLanding: false, child: null, showChild: false }];
          this.enrichMeta();
          this.loading = false;
          return;
        }

        const reg = this.regGH();
        this.loadSurfaces(reg);   // independent; don't hold the cards for it
        this.loadTodos(reg);      // independent; don't hold the cards for it
        this.loadJots(reg);       // independent; don't hold the cards for it
        this.loadPins(reg);       // independent; don't hold the cards for it
        this.loadActivity(reg);   // independent; the cards render without it
        this.loadSessions(reg);   // independent; only the Sessions pane needs it

        let confMap = await this.readConfigCache(reg);
        let members = Object.keys(confMap).filter(n => confMap[n]?.estate === true);
        if (!members.length){
          // Cache cold or pre-migration: scan live, and force a cache rebuild so
          // later loads are cache-served.
          confMap = await this.liveScanConfigs();
          members = Object.keys(confMap).filter(n => confMap[n]?.estate === true);
          window.__shell?.refreshConfigCache?.(true);
        }

        this.entries = members.map(name => {
          const cfg = confMap[name] || {};
          return {
            repo: name,
            icon: cfg.icon || 'ph-bookmark-simple',
            note: cfg.note || '',
            group: cfg.group || '',
            order: Number.isFinite(cfg.order) ? cfg.order : 0,
            // pins and projects are deliberately absent: the card stopped
            // rendering either on 2026-07-31, and the sidebar lists read the
            // shell's repoProjects() directly rather than this entry, so
            // carrying them here would be a field nothing reads.
            hasLanding: !!cfg.landing,
            hasSurface: !!cfg.surface,
            meta: null, err: false, child: null, showChild: false,
          };
        });
        this.applyNesting();
        this.loading = false;
        this.enrichMeta();
        this.loadRepoSurfaces(confMap);   // independent; the general surfaces render without it
        this.loadUnfiled(confMap);        // independent; shares enrichMeta's one account list
      },

      // Nesting by convention: owner/foo-private rides inside owner/foo's card
      // when both are on the estate, so the private companion doesn't hold a
      // card of its own. No config field; purely the naming pairing.
      applyNesting(){
        for (const child of this.entries){
          const m = child.repo.match(/^(.*)-private$/);
          if (!m) continue;
          const parent = this.entries.find(e => e.repo === m[1]);
          if (parent && parent !== child && !parent.child){ parent.child = child; child.nested = true; }
        }
      },

      // Live GitHub metadata (description, visibility, pushed-ago) for the shown
      // cards, from one account-repos list call, matched by name. A member the
      // list doesn't cover (e.g. beyond per_page, or not owned) simply shows
      // without meta.
      // The account's repos, fetched once per load pass and shared by every
      // consumer that needs it (card meta, repo-surface ref resolution), so a
      // load is one list call, not one per consumer. Reset to null at load top.
      accountRepos(){
        if (!this._acct){
          const gh = new window.GH({ token: this.authed ? window.TOKEN : '' });
          this._acct = Promise.resolve().then(() => gh.repos()).catch(() => []);
        }
        return this._acct;
      },

      async enrichMeta(){
        const gh = new window.GH({ token: this.authed ? window.TOKEN : '' });
        const acct = await this.accountRepos();
        const byName = new Map(acct.map(r => [r.full_name, r]));
        for (const en of this.entries){
          const r = byName.get(en.repo);
          if (r){
            en.meta = {
              desc: r.description || '', priv: !!r.private,
              ago: (r.pushed_at && gh.ago) ? gh.ago(r.pushed_at) : '', ref: r.default_branch || 'main',
            };
          } else if (!en.meta){
            // Not in the list: one direct metadata read so the card still fills.
            try {
              const rr = await gh.req('/repos/' + en.repo);
              en.meta = { desc: rr.description || '', priv: !!rr.private,
                          ago: (rr.pushed_at && gh.ago) ? gh.ago(rr.pushed_at) : '', ref: rr.default_branch || 'main' };
            } catch { en.err = true; }
          }
        }
      },

      // The entry a card is currently showing: itself, or its nested companion
      // once the visibility toggle flipped it (e.showChild).
      face(e){ return e.showChild && e.child ? e.child : e; },

      // The card's menu triggers, routed through the shell so a card and a
      // sidebar row fill the same panel with the same lists. A paired card
      // contributes its face switch as a row (see the template comment); the
      // shell ignores contributed rows for the GitHub list, so passing them
      // unconditionally is safe.
      cardMenuExtra(e){
        if (!e.child) return [];
        const other = e.showChild ? e.repo : e.child.repo;
        return [{ key: 'card-face', label: 'Show ' + (other.split('/')[1] || other),
                  icon: e.showChild ? 'ph-globe' : 'ph-lock',
                  title: 'Flip this card to ' + other,
                  run: () => { e.showChild = !e.showChild; } }];
      },
      cardMenu(e, ev, kind){
        window.__shell?.toggleRepoMenu?.(this.face(e).repo, ev, kind, { extra: this.cardMenuExtra(e) });
      },
      cardMenuHover(e, ev, kind){
        window.__shell?.hoverRepoMenu?.(this.face(e).repo, ev, kind, { extra: this.cardMenuExtra(e) });
      },
      menuLeave(){ window.__shell?.hoverLeaveMenu?.(); },
      menuTint(e, kind){
        const s = window.__shell;
        return s?.repoMenuAt && s.menuRepo === this.face(e).repo && s.menuKind === kind ? 'text-primary' : '';
      },

      // ── Activity ───────────────────────────────────────────────────────────
      // Read the private registry's activity cache (state/activity.json) once.
      // Feeds both the Repos cards' freshness rollups and the Open view's
      // cross-repo branch list; no per-repo API fanout happens here.
      async loadActivity(reg){
        this.activityLoading = true;
        try {
          const A = window.RepoActivityCache;
          const path = A?.CACHE_PATH || 'state/activity.json';
          const cache = JSON.parse((await reg.get(path)).text);
          this.activity = cache.repos || {};
          this.activityGeneratedAt = cache.generatedAt || '';
        } catch { this.activity = {}; this.activityGeneratedAt = ''; }
        finally {
          this.activityLoading = false;
          // A `&detail=` resolves once the attempt to list branches is OVER,
          // not once it succeeds. On the success path the link lands in the
          // full list and can be swiped; on the failure path it still opens,
          // as a list of one, which is the whole reason openBranchDetail
          // tolerates a row it cannot find. Firing this inside the try meant a
          // deep link did nothing at exactly the moment the estate could not
          // list anything, which is silent and looks like a dead link.
          this.$nextTick(() => this.openDetailFromUrl());
        }
      },
      async reloadActivity(cache){
        if (!this.hasToken()) return;
        if (cache) return this.takeActivity(cache);
        const reg = this.regGH();
        await this.loadActivity(reg);
      },
      // The same landing the read does, from a document already in hand.
      takeActivity(cache){
        this.activity = cache.repos || {};
        this.activityGeneratedAt = cache.generatedAt || '';
        this.$nextTick(() => this.openDetailFromUrl());
      },
      // Force the crawl (the Activity view's Refresh button). The shell owns the
      // crawl + throttle and fires web-tools:activity-refreshed when it commits.
      refreshActivity(){ window.__shell?.refreshActivity?.(); },

      // ── Sessions ───────────────────────────────────────────────────────────
      // Read the registry's sessions cache (state/sessions.json) once. Same
      // contract as loadActivity: one file read, no fanout, and a cold or
      // missing cache leaves an empty list rather than an error, since the
      // pane's own empty state says how to warm it.
      async loadSessions(reg){
        this.sessionsLoading = true;
        try {
          const S = window.RepoSessionsCache;
          const path = S?.CACHE_PATH || 'state/sessions.json';
          const cache = JSON.parse((await reg.get(path)).text);
          this.sessionRows_ = cache.rows || [];
          this.sessionAttention = cache.attention || [];
          this.sessionsGeneratedAt = cache.generatedAt || '';
        } catch {
          this.sessionRows_ = []; this.sessionAttention = []; this.sessionsGeneratedAt = '';
        } finally { this.sessionsLoading = false; }
      },
      async reloadSessions(){
        if (!this.hasToken()) return;
        const reg = this.regGH();
        await this.loadSessions(reg);
      },
      refreshSessions(){ window.__shell?.refreshSessions?.(); },

      // ── Guides ───────────────────────────────────────────────────────────
      // The shelf, folded by kits/guide-index.js. State is local rather than
      // in a crawl cache: the read is a directory listing per repo plus one per
      // open PR, which is bounded and cheap enough to run on demand, and a
      // guide changing is not the estate-wide event an activity crawl exists
      // to catch. Refresh re-reads.
      guideEntries: { main: [], onPrs: [] },
      guideThumbs: {},        // "repo:path" -> data URL
      guidesBusy: false,
      guidesLoadedAt: '',
      guidesTried: false,     // attempt-once guard; see loadGuides
      configsGeneratedAt: '',   // state/configs.json's stamp, for the Repos age pill

      // ── Routes ───────────────────────────────────────────────────────────
      // The app's own destinations, dated. State is local for the same reason
      // Guides' is: the read is the hub's manifest plus one last-commit call
      // per declared carrier (about twenty, deduped by the kit), bounded and
      // cheap, and a route's code moving is not the estate-wide event the
      // activity crawl exists to catch. What it is NOT is a crawl of every
      // repo: these routes belong to one page in one repo.
      routeManifest: null,
      routeTouches: {},       // path -> { date, sha, subject, url, author }
      routeBranchFiles: [],   // [{ repo, name, pr, session, files }] from open PRs
      routesBusy: false,
      routesLoadedAt: '',
      routesTried: false,     // attempt-once guard; same fault as loadGuides
      routeJoinTried: false,  // the shared half's own guard; see loadRouteJoin
      routesError: '',
      routeGroupOpen: {},     // group key -> collapsed, for the quiet groups
      routeOpenRow: '',       // the expanded row's key; one at a time

      // Read the reactive field FIRST, unconditionally. Written as
      // `window.guideIndex?.build(this.guideEntries)` the optional chain
      // short-circuits on the first evaluation, while the kit is still loading,
      // so `guideEntries` is never read, Alpine registers no dependency, and the
      // effect never re-runs: the pane stayed display:none with the expression
      // evaluating to 3 when asked by hand. A getter behind a lazily loaded
      // dependency has to touch its reactive state before the guard.
      get guideRows(){
        const entries = this.guideEntries;
        return window.guideIndex ? window.guideIndex.build(entries) : [];
      },
      guideRender(g){ return window.guideIndex?.renderUrl(g) || ''; },
      guideThumb(g){ return this.guideThumbs[g.repo + ':' + g.path] || ''; },

      // The committed screenshot, read from the guide's OWN repo at the ref it
      // was found on, as a data URL. A plain <img src> cannot carry auth and a
      // guide in flight has no hosted URL for its thumb, so the private-safe
      // base64 read is the only form that works for both a landed page and a
      // branch one. Same technique the pages gallery uses for a private repo's
      // tile; the key differs because the shot lives with the guide rather than
      // in the registry's cache.
      async loadGuideThumbs(rows){
        const G = window.guideIndex;
        if (!G) return;
        await Promise.all(rows.map(async (g) => {
          const k = g.repo + ':' + g.path;
          if (this.guideThumbs[k]) return;
          const rel = G.thumbPath(g.path);
          if (!rel) return;
          const ref = g.refs[g.refs.length - 1] || 'main';
          try {
            const gh = new window.GH({ token: window.TOKEN, repo: g.repo, ref });
            const data = await gh.req('contents/' + rel + '?ref=' + ref);
            if (data && data.content) {
              this.guideThumbs = { ...this.guideThumbs,
                [k]: 'data:image/png;base64,' + data.content.replace(/\s/g, '') };
            }
          } catch { /* no committed shot: the card renders without one */ }
        }));
      },
      // 🌿 for a branch named by owner/repo, the absolute address. It was
      // called branchPageUrl until 2026-08-19, which is also the name of the
      // (row, branch) form 600 lines below, and a duplicate key in one object
      // literal is not an overload: the later definition simply won, so the
      // Guides pane's branch link read g.repo as a session row, found no
      // repos array, and emitted ../branch.html with no address on it at all.
      // Two arities, two names.
      branchPageFor(repo, branch){
        return 'https://mehrlander.github.io/web-tools/pages/branch.html'
             + '#gh=' + repo + '@' + branch;
      },

      // The 🥏 render for a guide a SESSION touched. The record stores a path
      // prefixed by its checkout ("web-tools/pages/guides/x.html"), so the repo
      // is resolved off the row's own `repos` the way branchPageUrl does, and
      // the guide is addressed at the branch the session was on: a guide read
      // at the moment it was written is the version that session produced, not
      // whatever main holds now. Falls back to the default branch when the row
      // names no branch, which is the merged case.
      guideRenderFor(row, path){
        const slash = String(path || '').indexOf('/');
        const name = slash < 0 ? '' : path.slice(0, slash);
        const rel = slash < 0 ? path : path.slice(slash + 1);
        const entry = (row.repos || []).find(x => x.name === name);
        const full = this.entries.find(e => e.repo.endsWith('/' + name));
        if (!full) return '';
        const at = entry && entry.branch && entry.branch !== 'main' ? '@' + entry.branch : '';
        return 'https://mehrlander.github.io/web-tools/pages/toss-render.html'
             + '#gh=' + full.repo + at + ':' + rel;
      },

      // ── Chats ────────────────────────────────────────────────────────────
      // The archive pane. State is local and the reads are on demand, like
      // Guides and unlike the three crawl caches: the shards are immutable once
      // committed, so there is nothing to keep fresh and no crawl to schedule.
      // What moves is the frontier, and it moves when an export lands in that
      // repo, which is a commit rather than anything this page could trigger.
      chatFrontier: null,
      chatLoadedMonths: [],   // months fetched, newest first
      chatRowsByMonth: {},    // "YYYY-MM" -> rows
      chatProvider: '',
      chatTag: '',
      chatHandOnly: false,
      chatsBusy: false,
      chatsErr: '',
      // Whether the opening load has been ATTEMPTED, which is not the same as
      // whether it succeeded, and the difference is the whole reason this field
      // exists rather than guarding on chatFrontier.
      //
      // x-effect drives this loader, and the loader writes reactive state the
      // effect reads (chatsBusy). That is fine while the load succeeds: the
      // effect re-runs, sees a frontier, and stops. On FAILURE there is no
      // frontier, so the guard passes again and the effect relaunches the load
      // the instant its own finally sets chatsBusy back to false. Worse, the
      // kit's failure backoff then rejects without touching the network, so the
      // retry costs nothing and the loop spins at full speed: the main thread
      // pegs, the loading dots stop animating, and the tab appears frozen with
      // no request traffic to show for it. Measured on a phone against
      // chat-histories@main before the frontier landed there, and reproduced
      // headlessly (a Playwright click on the pill times out at 30s).
      //
      // The general trap, for anything else reaching for this pattern: an
      // x-effect calling an async loader must be idempotent per ATTEMPT, not
      // per success, or a failing load becomes an infinite loop rather than an
      // error message.
      chatsTried: false,

      chatsRepo(){ return window.__shell?.CHATS_REPO || CHATS_REPO; },

      // Same lazy-read trap the guide rows hit: touch the reactive field before
      // the guard, or the optional chain short-circuits on the first evaluation
      // while the kit is still loading, Alpine registers no dependency, and the
      // pane never re-renders once it lands.
      get chatBanner(){
        const f = this.chatFrontier;
        return f && window.chatArchive ? window.chatArchive.banner(f) : null;
      },
      get chatMonths(){
        const f = this.chatFrontier;
        return f && window.chatArchive ? window.chatArchive.monthsDesc(f) : [];
      },
      get chatMoreAvailable(){ return this.chatLoadedMonths.length < this.chatMonths.length; },

      // Every loaded month's rows, newest first. Concatenated in load order,
      // which is already newest-first, rather than re-sorting the whole set on
      // every render: a month is internally sorted by the kit and months never
      // interleave.
      get chatRows(){
        const by = this.chatRowsByMonth;
        return this.chatLoadedMonths.flatMap(m => by[m] || []);
      },
      get chatProviders(){
        const counts = {};
        for (const r of this.chatRows) if (r.provider) counts[r.provider] = (counts[r.provider] || 0) + 1;
        const labels = Object.fromEntries((window.chatArchive?.PROVIDERS || []).map(p => [p.key, p.label]));
        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([key, count]) => ({ key, count, label: labels[key] || key }));
      },
      get chatHandCount(){ return this.chatRows.filter(r => r.hand).length; },
      get chatFiltered(){ return !!(this.chatProvider || this.chatTag || this.chatHandOnly); },
      get visibleChatRows(){
        return this.chatRows.filter(r =>
          (!this.chatProvider || r.provider === this.chatProvider) &&
          (!this.chatHandOnly || r.hand) &&
          (!this.chatTag || r.tags.includes(this.chatTag)));
      },

      // Open on the frontier plus the newest month. Two months would double the
      // opening cost to answer a question nobody asked yet; the Earlier month
      // button is one tap away and says how much is not loaded.
      async loadChats(){
        if (!this.authed || this.chatsBusy || this.chatsTried) return;
        // Marked before the first await, not in the finally: the effect can
        // re-run during the await on the kit load, and a flag set at the end
        // would let a second attempt start in that window.
        this.chatsTried = true;
        this.chatsBusy = true;
        this.chatsErr = '';
        try {
          if (!window.chatArchive) await window.gh.load('kits/chat-archive.js');
          const repo = this.chatsRepo(), token = window.TOKEN;
          this.chatFrontier = await window.chatArchive.loadFrontier({ repo, token });
          await this._loadChatMonth(this.chatMonths[0]);
        } catch(e){
          this.chatsErr = e?.message || String(e);
        } finally { this.chatsBusy = false; }
      },
      // The explicit retry, which is what the attempt-once guard above owes the
      // reader: a failure that cannot retry itself has to be retryable by hand.
      // It clears the kit's failure backoff too, since the reader tapping Retry
      // is a better signal than a 30-second timer.
      async retryChats(){
        this.chatsTried = false;
        this.chatsErr = '';
        window.chatArchive?.forget?.();
        await this.loadChats();
      },
      async loadMoreChats(){
        if (this.chatsBusy || !this.chatMoreAvailable) return;
        this.chatsBusy = true;
        try { await this._loadChatMonth(this.chatMonths[this.chatLoadedMonths.length]); }
        catch(e){ this.chatsErr = 'Could not read that month: ' + (e?.message || e); }
        finally { this.chatsBusy = false; }
      },
      // A month that resolves to nothing still counts as loaded, so paging can
      // walk past it. Only a month with no shard in EITHER layer throws, and
      // that is a gap in the archive rather than a failure of the read.
      async _loadChatMonth(month){
        if (!month || this.chatLoadedMonths.includes(month)) return;
        let rows = [];
        try {
          rows = await window.chatArchive.loadMonth({
            repo: this.chatsRepo(), token: window.TOKEN, month });
        } catch(e){
          if (!/no shard/.test(e?.message || '')) throw e;
        }
        this.chatRowsByMonth = { ...this.chatRowsByMonth, [month]: rows };
        this.chatLoadedMonths = [...this.chatLoadedMonths, month];
      },

      // One directory listing, absent-is-not-an-error. Most repos have no
      // guides shelf and most branches never touch one, so a 404 is the normal
      // answer and returning [] keeps it out of the caller's control flow.
      //
      // The blob sha rides along because the contents listing already returns
      // it and the fold needs it: it is what separates "this branch changed the
      // guide" from "this branch merely has the file", and reading it here
      // costs nothing where a compare per PR would cost a request each.
      async guidesAt(repo, ref){
        try {
          const gh = new window.GH({ token: window.TOKEN, repo, ref });
          const list = await gh.ls(window.guideIndex.GUIDE_DIR.replace(/\/$/, ''));
          return list.filter(e => e.type === 'file' && window.guideIndex.isGuidePath(e.path))
                     .map(e => ({ path: e.path, sha: e.sha || '' }));
        } catch { return []; }
      },

      // The repo list and the open PRs both come off the activity cache, which
      // load() fires without awaiting, so this can be reached before there is
      // anything to scan. Returning early rather than recording an empty result
      // is the whole fix: the x-effect above names activityRepoCount, so it runs
      // again the moment the cache lands. Latching zero here is what made the
      // pane come up empty and stay that way.
      get guideRepos(){ return (this.entries || []).map(e => e.repo).filter(Boolean); },

      async loadGuides(force){
        if (!this.authed || this.guidesBusy) return;
        if (!this.guideRepos.length) return;
        // Guard on the ATTEMPT, not on success. This is also driven by an
        // x-effect that reads state the loader writes, so guarding on
        // guidesLoadedAt (set only after a clean pass) means one thrown error
        // relaunches the load forever and pegs the main thread. It has never
        // fired only because guidesAt swallows every error and returns [], so
        // the loader cannot currently fail; that is luck, not a design. Same
        // fault and same fix as the Chats pane, where it did fire.
        if (this.guidesTried && !force) return;
        this.guidesTried = true;
        // The kit is loaded here, not in the boot chain, so a page that never
        // opens this pane pays nothing for it. The guide whose subject is the
        // cost of the boot chain should not quietly join it.
        if (!window.guideIndex) {
          try { await window.gh.load('kits/guide-index.js'); } catch { return; }
        }
        this.setGuidesBusy(true);
        try {
          const main = [], onPrs = [];
          await Promise.all(this.guideRepos.map(async (repo) => {
            const cached = this.activity?.[repo] || {};
            const def = cached.defaultBranch || 'main';

            // Open PRs are read LIVE rather than taken from the activity cache.
            // The cache is a crawl snapshot, so a PR opened since the last crawl
            // is invisible to it, and a guide is at its most interesting on the
            // day its PR opens: measured 2026-08-07, the cache held PRs 176
            // through 364 and the guide in flight hung off 367, so the pane
            // reported no guides while one sat on a branch. One request per
            // repo removes the whole class.
            let prs = [];
            try {
              const gh = new window.GH({ token: window.TOKEN, repo, ref: def });
              prs = await gh.pulls('open');
            } catch { prs = cached.openPRs || []; }

            // The cache is still worth reading where it HAS the PR: its
            // `sessions` come from the commit trailer, which survives a merge
            // and catches a branch worked across several sessions, while
            // pulls() lifts one session from the PR body footer.
            const byNum = new Map((cached.openPRs || []).map(p => [p.number, p]));
            prs = prs.map(p => ({ ...p, sessions: byNum.get(p.number)?.sessions || p.sessions }));

            // The default branch is read FIRST and awaited, because the PR
            // entries are compared against its blob shas. Firing both together
            // would race: a PR listing folded before main's is compared against
            // an empty baseline and every guide on it reads as in flight.
            const onDef = await this.guidesAt(repo, def);
            for (const e of onDef) main.push({ repo, path: e.path, sha: e.sha, ref: def });
            await Promise.all(prs.map(async (pr) => {
              if (!pr.head || pr.head === def) return;
              for (const e of await this.guidesAt(repo, pr.head)) {
                onPrs.push({ repo, path: e.path, sha: e.sha, pr });
              }
            }));
          }));
          this.guideEntries = { main, onPrs };
          this.guidesLoadedAt = new Date().toISOString();
          // Mirrored onto the shell because the shelf is the one derived thing
          // with no cache file to read a date off: its age exists only in this
          // component's memory. The State view reports every derived thing's
          // age side by side, and reaching into a sibling component for one of
          // them is what the shell is for.
          if (window.__shell) window.__shell.guidesLoadedAt = this.guidesLoadedAt;
          // After the rows exist, not with them: a thumb is decoration and a
          // card is useful without one, so the list paints first.
          this.loadGuideThumbs(this.guideRows);
        } finally { this.setGuidesBusy(false); }
      },
      // Mirrored onto the shell beside the stamp, and for the same reason: the
      // shelf is the one derived thing whose whole state lives in this
      // component, so the State view's row would otherwise have no way to know
      // a read was in flight.
      setGuidesBusy(v){
        this.guidesBusy = v;
        if (window.__shell) window.__shell.guidesBusy = v;
      },

      // ── Routes: the app's own destinations, dated ────────────────────────
      // Read the reactive fields FIRST and unconditionally, for the same reason
      // guideRows does: the kit is loaded lazily, so an expression that
      // short-circuits on `window.routeActivity?` registers no dependency on
      // the state the loader writes and the pane never re-renders.
      get routeRows(){
        const m = this.routeManifest, touches = this.routeTouches, branches = this.routeBranchFiles;
        if (!window.routeActivity || !m) return [];
        return window.routeActivity.rank(m, { touches, branches });
      },
      // The group survives as a per-row label rather than as a section, so the
      // one thing it must do is name itself. Kept off the row data because the
      // manifest already holds it and the kit should not copy it forward.
      routeGroupLabel(key){
        const m = this.routeManifest;
        return (m?.groups || []).find(g => g.key === key)?.label || key;
      },
      // The rows folded into their nav stops, the level the router flattens
      // away. Order is the ranking's, not a second sort: see the kit.
      get routeStops(){
        const rows = this.routeRows;
        return window.routeActivity ? window.routeActivity.stops(rows) : [];
      },
      // The address, minus the placeholders a row cannot fill. `?view=app` is
      // the useful half of ?view=app&appRepo=<owner/repo>&appPath=<path>: the
      // rest is a shape, not an address, and at phone width it wrapped to a
      // second line to say what the row's own tone now says. The full form is
      // in the expanded detail, where a reader who wants the shape can get it.
      routeShortAddress(r){
        const a = r.address || '';
        const m = /^(\?view=[a-z]+)&/.exec(a);
        return m ? m[1] : a;
      },
      routeAddressTruncated(r){ return this.routeShortAddress(r) !== (r.address || ''); },
      // The shell group is not a screen this app draws (a promoted page, a
      // tokenless read of someone else's repo), so it reads in the muted tone
      // rather than announcing itself in the same weight as a real destination.
      routeIsShell(r){ return r.group === 'shell'; },
      // How many routes are sub-tabs wearing a top-level key. Stated ONCE, as a
      // figure beside the pane's other aggregates, rather than as a sentence
      // repeated on each folded stop: the sentence was identical three times
      // and cost two lines apiece on a phone, while the indent already says a
      // stop owns its rows. What the indent cannot say is how much of the list
      // this accounts for, so that is the part worth a number.
      get routeFlattened(){
        return this.routeStops.reduce((n, s) => n + s.rows.length - 1, 0);
      },
      get routeShell(){
        const m = this.routeManifest, touches = this.routeTouches;
        if (!window.routeActivity || !m) return null;
        return window.routeActivity.shellRow(m, { touches });
      },
      // How many routes have no file of their own. The pane's one aggregate,
      // and the reason it is here rather than in the kit: it is a reading of
      // the app, and it belongs where the reading is shown.
      get routesWithoutCode(){ return this.routeRows.filter(r => !r.hasOwnCode).length; },
      // Counts the narrow join only. Counting `near` too is what made the first
      // render claim work open on eleven of twenty-four routes off three PRs.
      get routesInFlight(){ return this.routeRows.filter(r => r.branches.length).length; },

      // WHICH REF THE PANE READS, and why it is not simply main. The manifest
      // and app/index.html's VIEWS table are held in lockstep by a gate, at a
      // ref: reading the code from one ref and the manifest from another breaks
      // exactly the invariant that gate exists to protect. Pinning the manifest
      // to main did that on the first preview of the branch that ADDED it, and
      // the pane 404ed on a file that did not exist there yet.
      //
      // `?use=` is the app's standing answer to "which ref am I running" (the
      // ref switch reads the same key), and a #gh= toss injects the addressed
      // ref as `use` through toss-render's params shim, so one read covers the
      // deployed page, a ?use= preview, and a tossed branch alike.
      //
      // The commit dates ride the same ref rather than staying on main, so the
      // whole pane speaks about one tree. On main that changes nothing; on a
      // preview it means a carrier the branch just added is dated by the branch
      // instead of reading as never touched.
      get routesRef(){
        try { return new URLSearchParams(location.search).get('use') || 'main'; }
        catch { return 'main'; }
      },

      // Run `jobs` through a small pool. Bounded concurrency matters here for
      // the same reason it does in the branch scan: two dozen commit reads
      // fired at once spend the rate limit in one burst and gain nothing, since
      // the wall clock is set by the slowest, not the sum.
      async routePool(items, worker, size = 6){
        const out = new Array(items.length);
        let i = 0;
        const run = async () => {
          while (i < items.length){
            const idx = i++;
            try { out[idx] = await worker(items[idx], idx); } catch { out[idx] = null; }
          }
        };
        await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
        return out;
      },

      // The half of the read BOTH panes need: the manifest, and which files each
      // open PR touches. Split out because the Branches pane wants the join and
      // not the dating, and the dating is the expensive half (one commit call
      // per carrier, about two dozen, against six here). Shared state, so
      // visiting either pane warms the other and the two can never disagree
      // about which branch is working on what.
      async loadRouteJoin(force){
        if (!this.authed) return;
        if (this.routeJoinTried && !force) return;
        this.routeJoinTried = true;
        if (!window.routeActivity) {
          try { await window.gh.load('kits/route-activity.js'); } catch { return; }
        }
        const ref = this.routesRef;
        const gh = new window.GH({ token: window.TOKEN, repo: ROUTES_REPO, ref });
        try {
          // Assembled from two CSVs since 2026-08-16. The shell is a row keyed
          // `shell` rather than a sibling key, and the group glosses live in the
          // shared value-gloss table, which is where every closed domain's do.
          const [routesText, vocabText] = await Promise.all([
            gh.get(ROUTES_MANIFEST).then(r => r.text),
            gh.get(ROUTES_VOCAB).then(r => r.text).catch(() => ''),
          ]);
          const all = window.Csv.rows(routesText).map(r => ({
            ...r, files: window.Csv.list(r.files), tabs: window.Csv.list(r.tabs),
          }));
          const shellRow = all.find(r => r.key === 'shell');
          this.routeManifest = {
            shell: shellRow?.files[0] || '',
            shellNote: shellRow?.what || '',
            groups: window.Csv.rows(vocabText)
              .filter(v => v.registry === 'app-routes' && v.property === 'group')
              .map(v => ({ key: v.value, label: v.label, gloss: v.gloss })),
            routes: all.filter(r => r.key !== 'shell'),
          };
        } catch (e) {
          e.message = ROUTES_REPO + '@' + ref + ':' + ROUTES_MANIFEST + ' — ' + (e.message || e);
          throw e;
        }
        let prs = [];
        try { prs = await gh.pulls('open', 30); } catch { prs = []; }
        const withFiles = await this.routePool(prs, async (pr) => {
          const files = await gh.req('pulls/' + pr.number + '/files?per_page=100');
          return { repo: ROUTES_REPO, name: pr.head, pr: pr.number, title: pr.title,
                   draft: pr.draft,
                   // pulls() returns no html_url (it keeps the projection
                   // narrow), and the address is fully determined by the repo
                   // and the number, so it is built rather than fetched.
                   url: 'https://github.com/' + ROUTES_REPO + '/pull/' + pr.number,
                   session: pr.session || '',
                   files: (files || []).map(f => f.filename) };
        });
        this.routeBranchFiles = withFiles.filter(Boolean);
        return gh;
      },

      // What a BRANCH row is working on: the reciprocal of the Routes pane's
      // per-route branch list, off the same data and the same rule. Answers
      // only for the hub's own branches, because routes are one page in one
      // repo; every other repo's rows get nothing rather than a guess, which is
      // why this returns null instead of an empty result.
      branchRoutes(row){
        const m = this.routeManifest, known = this.routeBranchFiles;
        if (!window.routeActivity || !m || !row) return null;
        if (row.repo !== ROUTES_REPO) return null;
        const entry = known.find(b => b.repo === row.repo && b.name === row.name);
        if (!entry) return null;
        const r = window.routeActivity.routesTouched(m, entry.files);
        return (r.on.length || r.near.length) ? r : null;
      },

      async loadRoutes(force){
        if (!this.authed || this.routesBusy) return;
        // Attempt-once, not success-once: guarding on routesLoadedAt would make
        // one thrown error relaunch the load forever off the x-effect below.
        if (this.routesTried && !force) return;
        this.routesTried = true;
        if (!window.routeActivity) {
          try { await window.gh.load('kits/route-activity.js'); } catch { return; }
        }
        this.routesBusy = true;
        this.routesError = '';
        try {
          const ref = this.routesRef;
          // The manifest and the PR file lists, shared with the Branches pane.
          // It names the address it could not read on failure: a bare "404: Not
          // Found" sent the first diagnosis of this to auth, which the
          // rate-limit figure in the same message had already ruled out.
          const gh = await this.loadRouteJoin(true);
          const manifest = this.routeManifest;

          // One last-commit read per declared carrier. `per_page=1` on the
          // commits endpoint filtered by path is the whole question: when did
          // this file last move, and in what commit. The shell rides the same
          // list so its own row is dated by the same mechanism.
          const paths = window.routeActivity.pathsToRead(manifest);
          const commits = await this.routePool(paths, async (p) => {
            const rows = await gh.req('commits?path=' + encodeURIComponent(p)
                                      + '&sha=' + encodeURIComponent(ref) + '&per_page=1');
            const c = rows && rows[0];
            if (!c) return null;
            return { path: p, touch: {
              date: c.commit?.committer?.date || c.commit?.author?.date || '',
              sha: c.sha, shortSha: (c.sha || '').slice(0, 7),
              subject: (c.commit?.message || '').split('\n')[0],
              author: c.author?.login || c.commit?.author?.name || '',
              url: c.html_url || '',
            } };
          });
          const touches = {};
          for (const r of commits) if (r) touches[r.path] = r.touch;
          this.routeTouches = touches;
          this.routesLoadedAt = new Date().toISOString();
        } catch (e) {
          this.routesError = e?.message || String(e);
        } finally { this.routesBusy = false; }
      },

      // Open a route from its row, through the shell's own dispatcher, so it is
      // the same navigation a header tab performs: no reload, one history
      // entry, and the URL stamped by the view's own rule.
      //
      // Only a bare `?view=<key>` is offered. An address carrying a placeholder
      // (a repo, a file path, a promoted page) cannot be opened from a row that
      // does not know which one, and a link that lands nowhere is worse than no
      // link; those rows show the address as text instead. The repo-scoped
      // views open against whichever repo is current, which is what tapping
      // them in the sidebar does.
      routeIsOpenable(r){ return /^\?view=[a-z]+$/.test(r.address || ''); },
      openRoute(r){
        if (!this.routeIsOpenable(r)) return;
        window.__shell?.routeFromUrl?.({ view: r.key });
      },
      toggleRouteRow(key){ this.routeOpenRow = this.routeOpenRow === key ? '' : key; },
      get sessionsBusy(){ return !!window.__shell?.sessionsRefreshing; },

      // The scopes. Time-based rather than kind-based, because a session has no
      // state to be in: it ran, and the only question a scan asks is how
      // recently. `failed` is the exception and is the reason this pane can
      // answer something search.py answers at a terminal: which sessions fought
      // something, across the corpus, at a glance.
      SESSION_SCOPES: [
        // Day leads and is the default: with several sessions most days, the
        // question a visit usually asks is "what ran since I last looked", and
        // Week buried today's handful in dozens of rows.
        { key: 'day', label: 'Day', icon: 'ph-sun',
          note: 'Sessions that started in the last 24 hours.' },
        { key: 'week', label: 'Week', icon: 'ph-clock-counter-clockwise',
          note: 'Sessions that started in the last 7 days.' },
        { key: 'month', label: 'Month', icon: 'ph-calendar',
          note: 'Sessions that started in the last 30 days.' },
        { key: 'failed', label: 'Snagged', icon: 'ph-warning-circle',
          note: 'Sessions that hit at least one failing tool call. Recurrence across sessions is what a corpus can count and a person cannot.' },
        { key: 'all', label: 'All', icon: 'ph-list-bullets',
          note: 'Every session record the crawl has folded in.' },
      ],
      inSessionScope(r, scope){
        if (scope === 'all') return true;
        if (scope === 'failed') return !!r.failures;
        const days = scope === 'day' ? 1 : scope === 'week' ? 7 : 30;
        return Date.parse(r.started || '') >= Date.now() - days * 864e5;
      },
      get allSessionRows(){ return this.sessionRows_; },
      get sessionScopes(){
        const all = this.allSessionRows;
        return this.SESSION_SCOPES.map(s => ({ ...s, count: all.filter(r => this.inSessionScope(r, s.key)).length }));
      },
      get sessionScopeMeta(){
        return this.SESSION_SCOPES.find(s => s.key === this.sessionScope) || this.SESSION_SCOPES[0];
      },
      get scopedSessions(){
        return this.allSessionRows.filter(r => this.inSessionScope(r, this.sessionScope));
      },
      // Repo chips off the scoped list, busiest first. A record names a repo
      // when that checkout was the session's WORKING DIRECTORY, which is
      // narrower than "worked in"; the chip's tooltip carries that caveat.
      get sessionRepos(){
        const by = new Map();
        for (const r of this.scopedSessions)
          for (const x of r.repos || []) by.set(x.name, (by.get(x.name) || 0) + 1);
        return [...by.entries()]
          .map(([repo, count]) => ({ repo, count }))
          .sort((a, b) => (b.count - a.count) || a.repo.localeCompare(b.repo));
      },
      // Lapses back to All when the filtered repo has nothing in the current
      // scope, so the pane never sits empty with no chip lit to explain it.
      get activeSessionRepo(){
        const f = this.sessionRepoFilter;
        return f && this.sessionRepos.some(r => r.repo === f) ? f : '';
      },
      get sessionRows(){
        const f = this.activeSessionRepo;
        return f ? this.scopedSessions.filter(r => (r.repos || []).some(x => x.name === f))
                 : this.scopedSessions;
      },

      durLabel(mins){
        if (!mins) return '';
        return mins < 60 ? mins + 'm' : Math.floor(mins / 60) + 'h' + (mins % 60 ? (mins % 60) + 'm' : '');
      },
      topToolsLabel(row){
        const t = (row.tools || []).map(([n, c]) => n + ' ' + c).join(', ');
        return row.calls + ' tool calls' + (t ? ' · ' + t : '');
      },
      filesLabel(row){
        const f = (row.files || []).map(([p, n]) => n + '× ' + p).join('\\n');
        return row.filesTotal + ' files opened' + (f ? ':\\n' + f : '');
      },
      // Tokens as one compact reading. Cache reads dominate by two orders of
      // magnitude and say nothing about the work, so the headline is output:
      // what the session actually produced.
      tokenShort(row){
        const o = row.tokens?.output || 0;
        return o >= 1000 ? Math.round(o / 1000) + 'k' : String(o);
      },
      tokenLabel(row){
        const t = row.tokens || {};
        return 'output ' + (t.output || 0) + ' · input ' + (t.input || 0)
             + ' · cache read ' + (t.cache_read || 0) + ' · cache write ' + (t.cache_write || 0);
      },

      // Tapping a session opens its CONVERSATION, in one move: fetch the
      // record, then hand it to the deck. There is no intermediate pane.
      //
      // There used to be one, and it was the mistake. The row expanded into a
      // summary (asks, files, failures) and the deck sat behind a second button
      // inside it, so reaching the thing worth reading took two taps through a
      // surface that answered a question nobody had asked. Two detail surfaces
      // for one record is also two places to keep honest. The expansion's one
      // piece of unique content, the file list, is now the deck's closing card,
      // and its footnote is the deck's opening one.
      //
      // The record is cached per id, so re-opening a session it has already
      // read costs nothing. The renderer chain is pulled on first use and
      // deduped by the loader's registry afterwards, so a visit that never
      // opens a session pays for none of it. Order matters: proof.js backs
      // chat-render's sandboxed frames, and each file below reaches the one
      // above it.
      _records: {},
      async openSession(row){
        if (this.sessionDetailLoading) return;
        this.sessionDetailLoading = true;
        this.sessionDetailErr = '';
        this.openSessionId = row.id;
        try {
          if (!this._records[row.id]){
            const reg = this.regGH();
            const path = window.RepoSessionsCache.pathOf(row);
            this._records[row.id] = JSON.parse((await reg.get(path)).text);
          }
          this.sessionDetail = this._records[row.id];
          if (!window.sessionRender){
            await gh.load('kits/proof.js');
            await gh.load('kits/swipe-deck.js');
            await gh.load('kits/chat-render.js');
            await gh.load('kits/session-render.js');
            // Last, and the dependency runs the other way: the exporter reads
            // session-render, and session-render offers its Export button only
            // when the exporter is already on the page.
            await gh.load('kits/session-export.js');
          }
          await window.sessionRender.open(this.sessionDetail);
        } catch(e){
          this.sessionDetailErr = 'Could not open ' + row.id + ': ' + (e?.message || e);
        } finally { this.sessionDetailLoading = false; }
      },
      // The join to the Branches pane: filter that list to this session's repo
      // and switch panes. It filters by REPO rather than jumping to the branch
      // row, because the branch may have merged and left the Open list while
      // the session that made it stays here forever.
      // 🌿 for one of a session's branches. The record stores the branch per
      // checkout, so the repo comes from the row's own `repos` and is resolved
      // to its full owner/name against the estate. A shell running under ?use=
      // hands the same ref on, so a preview frames the previewed lib.
      //
      // Falls back to the plain page when the repo cannot be resolved: the
      // address form needs owner/repo, and an unresolvable row is better served
      // by the page's own address field than by a link that goes nowhere.
      branchPageUrl(row, branch){
        const repo = (row.repos || []).find(x => x.branch === branch);
        const full = repo && this.entries.find(e => e.repo.endsWith('/' + repo.name));
        const use = new URLSearchParams(location.search).get('use');
        const q = use ? '?use=' + encodeURIComponent(use) : '';
        return '../branch.html' + q + (full ? '#gh=' + full.repo + '@' + branch : '');
      },
      get activityBusy(){ return !!window.__shell?.activityRefreshing; },

      // ── Crawl progress, for whichever pane is watching ───────────────────
      // A crawl runs for tens of seconds across every estate repo, or every
      // stale session record, so the bare spinner these replaced said only
      // "something is happening". They read the shell's progress channel, a
      // slot per cache key, and answer the two questions worth answering: how
      // far along, and what is it looking at.
      //
      // The verb and the unit ride with the numbers, since only the crawl knows
      // whether it is on the quick pass or the scan true-up, or counting
      // repos rather than session records. So these take a key and decode
      // nothing; the same three feed the State view's rows.
      //
      // Items finished over items total is the WHOLE measure. No fraction is
      // estimated for the ones in flight: per-item cost varies by an order of
      // magnitude (a repo with 30 scanable branches against one with two), so
      // a smoothed bar would be a guess dressed as a reading.
      crawl(key){ return window.__shell?.crawlProgress?.[key] || null; },
      // Before the member list resolves there is no denominator, and saying so
      // beats showing "0 of 0".
      crawlLabel(key){
        const p = this.crawl(key);
        if (!p) return '';
        return p.verb + (p.total ? ` · ${p.done} of ${p.total} ${p.unit}` : '');
      },
      // Everything in flight, short-named. The pools run several at once, so
      // this is a list, not a subject: naming one would misdescribe the crawl.
      // Empty for a crawl that fans out unpooled, where naming every repo at
      // once is not a reading.
      crawlActive(key){
        return (this.crawl(key)?.active || []).map(r => r.split('/').pop().replace(/\.json$/, '')).join(', ');
      },
      // Items finished over items total. It spanned two passes for a day, while
      // the activity refresh ran quick-then-scan; one pass now, so the plain
      // reading is the honest one again.
      crawlPct(key){
        const p = this.crawl(key);
        return p?.total ? Math.round(p.done / p.total * 100) : 0;
      },

      // A card's cached activity, or null (public, uncrawled, or pre-cache).
      cardActivity(repo){ return this.activity[repo] || null; },
      // Verdicts from the cache's stored facts, judged against now. Returns only
      // what is not passing, so a current repo adds no badges at all: badging
      // green states would turn the row into furniture, and furniture stops
      // being read. The crawl probed; this judges. lib/kits/repo-checks.js explains
      // why those are two steps.
      // Abandoned branches per repo, for the card badge beside stranded.
      // Derived HERE rather than counted in the crawl, and the reason is the
      // rule about one property having one derivation: the pane's Abandoned
      // chip counts rows, so a crawl-side count over the full branch list
      // would report a larger number for the same word, and a card saying 5
      // beside a chip saying 2 makes a reader distrust both. One map, built
      // once per read, so a dozen cards do not each walk the list.
      get abandonedByRepo(){
        const by = new Map();
        for (const r of this.allBranchRows){
          if (this.branchState(r) !== 'closed') continue;
          by.set(r.repo, (by.get(r.repo) || 0) + 1);
        }
        return by;
      },
      cardAbandoned(repo){ return this.abandonedByRepo.get(repo) || 0; },

      cardChecks(repo){
        const facts = this.activity[repo]?.checks;
        if (!Array.isArray(facts) || !facts.length || !window.RepoChecks) return [];
        return window.RepoChecks.notable(window.RepoChecks.verdict(facts, new Date()));
      },

      // ── The branch list: every branch the crawl knows about ──────────────
      // Unioned by repo+name, freshest first, carrying the scan's `group`
      // ('active' | 'landed' | 'stranded') and its open PR when one matches
      // (pr.head === branch), so the row's link cluster reaches the PR and the
      // authoring session with no extra fetch.
      //
      // This is the WHOLE list, and the crawl already had it: the cache stores
      // every branch it scanned, classified, with the content counts. The view
      // used to hard-filter it down to open work here, in one line, which meant
      // no control in the view could reach the rest and the landed set was
      // invisible everywhere. The filter moved to `branchScope` below, where it
      // is a choice rather than a floor.
      get allBranchRows(){
        const out = [];
        for (const [repo, e] of Object.entries(this.activity)){
          const def = e.defaultBranch || 'main';
          const prByHead = new Map((e.openPRs || []).filter(p => p.head).map(p => [p.head, p]));
          // The any-state index beside the open one. Two maps rather than one
          // merged shape because they answer different questions and only one
          // of them is "open work": `pr` stays the OPEN PR (the scope filter,
          // the guide body, and the ahead/behind compare all mean that one),
          // and `prLast` is what became of the branch.
          const lastByHead = new Map((e.branchPRs || []).filter(p => p.head).map(p => [p.head, p]));
          const reach = e.prReach || '';
          const seen = new Set();
          for (const b of (e.scan?.branches || [])){
            if (b.name === def) continue;
            const pr = prByHead.get(b.name) || null;
            seen.add(b.name);
            // `first` (the branch's oldest unique commit) comes from whichever
            // compare the crawl ran: the PR head's when there is a PR, the
            // scan's otherwise. A recent branch is not scanned, so a row
            // that is here on its PR alone takes the PR's.
            out.push({ repo, def, name: b.name, date: b.date || '', subject: b.subject || '', pr,
                       prLast: lastByHead.get(b.name) || null, prReach: reach,
                       group: b.group || '',
                       // The scan's own evidence, carried through from the
                       // cache: of the paths this branch uniquely touched, how
                       // many hold bytes that exist on the default branch now.
                       // It is what makes a Landed row actionable rather than
                       // a claim, and the crawl already stored it.
                       // All THREE counts, since landed plus differs plus
                       // missing is the touched total and a chip showing two of
                       // them invited a subtraction that was never claimed.
                       nUnique: b.nUnique || 0, nLanded: b.nLanded || 0,
                       nMissing: b.nMissing || 0, nDiffers: b.nDiffers || 0,
                       missingPaths: b.missingPaths || [],
                       noBase: !!b.noBase,
                       // The crawled tip, lent to the branch view so it can
                       // address this branch's tree by SHA.
                       sha: b.sha || '',
                       // What the branch changed and in what way, off whichever
                       // compare the crawl already ran: the PR's, or the
                       // scan's own. Both carry a status and a line count per
                       // file, so the split costs nothing to keep.
                       stats: pr?.stats ?? b.stats ?? null, nFiles: pr?.nFiles ?? null,
                       first: pr?.firstDate || b.firstDate || '',
                       // Sessions the branch was worked across, newest first.
                       // The crawl resolves them exactly from the compare it
                       // already runs; `session` is the one the icon opens.
                       ...this.rowSessions(b, pr),
                       ahead: pr?.aheadBy ?? b.aheadBy ?? null, behind: pr?.behindBy ?? b.behindBy ?? null });
          }
          // An open PR whose branch was not in the scan (a fresh push, or one
          // beyond the scan cap) is still open work, so surface it directly.
          for (const p of (e.openPRs || [])){
            if (!p.head || p.head === def || seen.has(p.head)) continue;
            // The crawl classifies what its scan reached, so a branch missing
            // from it is one the scan never got to: a fresh push, or one past
            // the cap. With an open PR against it, `active` is the honest read.
            out.push({ repo, def, name: p.head, date: p.updatedAt || '', subject: p.title || '', pr: p,
                       prLast: lastByHead.get(p.head) || null, prReach: reach,
                       group: 'active',
                       // Same shape as a scanned row, all zero: the scan
                       // never reached this branch, and nUnique 0 is what hides
                       // the verdict chip rather than showing a measured zero.
                       nUnique: 0, nLanded: 0, nMissing: 0, nDiffers: 0,
                       missingPaths: [], noBase: false, sha: '',
                       stats: p.stats ?? null, nFiles: p.nFiles ?? null,
                       first: p.firstDate || '',
                       ...this.rowSessions(null, p),
                       ahead: p.aheadBy ?? null, behind: p.behindBy ?? null });
          }
        }
        return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      },

      // ── Scope: which `group`s the list shows ─────────────────────────────
      // The second axis, beside the repo filter. `open` is the default and the
      // old behavior: work in flight, which is not the same as recent, since a
      // branch merged by a merge commit is an ancestor of the default (nothing
      // ahead of it, nothing to stage) while its commit date still reads fresh.
      // So a bare 'active' branch does not qualify on recency alone; it needs
      // an open PR (an auto draft opens on first push, so genuinely-open work
      // almost always has one) or a STRANDED classification, the scan's
      // honest "its content is nowhere on the default branch".
      //
      // The other scopes are the scan's own three groups, plus All. Landed is
      // the one the reconcile pass is about, and until this existed it had no
      // route in the estate at all: the per-repo branch review was the only
      // place a landed branch appeared, one repo at a time.
      BRANCH_SCOPES: [
        // Recent leads and is the default. The pane's question is "what am I
        // working on", and the window control renders under Recent alone, so
        // landing anywhere else opened the pane with its one parameter hidden.
        { key: 'active', label: 'Recent', icon: 'ph-pulse',
          note: 'Committed inside the window below. Date-only, never scanned, so judge nothing from it yet.' },
        { key: 'open', label: 'Open', icon: 'ph-git-pull-request',
          note: 'Work in flight at ANY age: an open PR, or content the scan found nowhere on the default branch. The window does not narrow this, since an open PR from three months ago is still open work.' },
        { key: 'stranded', label: 'Stranded', icon: 'ph-warning-circle',
          note: 'Older branches holding content that exists nowhere on the default branch.' },
        { key: 'landed', label: 'Landed', icon: 'ph-check-circle',
          note: 'Older branches whose content is on the default branch. Likely history, and the set a cleanup pass deletes.' },
        // The one scope that reads the PR index rather than the scan's
        // groups, and the reason it earns a chip of its own: a closed-unmerged
        // branch is abandoned work someone decided against, which the content
        // scan cannot see (its verdict is landed-or-not, and abandoned work
        // is landed nowhere, so it hides among the stranded). Until the index
        // existed there was nothing to key this on; now it is one filter.
        //
        // Appended rather than slotted beside Stranded, which reads better and
        // costs more: the row scrolls sideways on a phone, so inserting a chip
        // mid-row pushes Landed and All off the screen and moves every chip a
        // reader had learned the position of.
        { key: 'abandoned', label: 'Abandoned', icon: 'ph-x-circle',
          note: 'Branches whose pull request was closed without merging: work that was decided against, still sitting in the branch list.' },
        { key: 'all', label: 'All', icon: 'ph-list-bullets',
          note: 'Every branch the crawl scanned, in every group.' },
      ],
      branchScope: 'active',
      // The reader's window, off the shell so the URL is the state (the same
      // arrangement stageTab uses) rather than a second copy to keep in sync.
      // 0 means NO window. The default lives in the shell, which owns the
      // reader's controls and the URL; without a shell (a unit test against the
      // component alone) there is no reader and so no window, rather than a
      // silent 7 that would narrow rows the test never asked to narrow.
      get branchWindow(){ return window.__shell?.branchWindow || 0; },
      setBranchWindow(d){ window.__shell?.setBranchWindow?.(d); },
      // Undated rows return -1 so they pass every window. The crawl classified
      // them active on some other basis, and "we could not date it" is not
      // evidence that it is old: excluding it would hide exactly the row a
      // reader most needs to look at.
      daysOf(r){
        const t = Date.parse(r.date || '');
        return Number.isFinite(t) ? (Date.now() - t) / 864e5 : -1;
      },
      inWindow(r){ const w = this.branchWindow; return !w || this.daysOf(r) <= w; },
      // The window unit is days throughout (daysOf is fractional, so a sub-day
      // window filters correctly); only the label speaks in hours.
      windowLabel(d){ return d < 1 ? Math.round(d * 24) + 'h' : d + 'd'; },
      // Shown beside the pill: what the window keeps, over what the crawl
      // classified as recent. The denominator is the honest one, since it is
      // the ceiling this filter can ever reach.
      get windowCoverage(){
        const all = this.allBranchRows.filter(r => r.group === 'active');
        return all.filter(r => this.inWindow(r)).length + ' of ' + all.length;
      },
      inScope(r, scope){
        if (scope === 'all') return true;
        if (scope === 'open') return !!r.pr || r.group === 'stranded';
        // PR state, not a scan group, and at any age: a branch abandoned in
        // May is exactly as abandoned as one abandoned yesterday, so the window
        // does not narrow this any more than it narrows Open.
        if (scope === 'abandoned') return this.branchState(r) === 'closed';
        // Recent alone is narrowed by the window: it is the scope that asks
        // about time, and the only one a date filter does not distort.
        if (scope === 'active') return r.group === 'active' && this.inWindow(r);
        return r.group === scope;
      },
      // The scope chips, each with its live count off the full list. A fixed
      // set, unlike the repo chips: a scope that is empty right now is still
      // worth naming (an empty Stranded is an answer), and a fixed row keeps
      // each scope in the same place from visit to visit.
      get branchScopes(){
        const all = this.allBranchRows;
        return this.BRANCH_SCOPES.map(s => ({ ...s, count: all.filter(r => this.inScope(r, s.key)).length }));
      },
      get scopeMeta(){ return this.BRANCH_SCOPES.find(s => s.key === this.branchScope) || this.BRANCH_SCOPES[0]; },

      // What the view shows: the full list narrowed to the chosen scope.
      get openBranches(){ return this.allBranchRows.filter(r => this.inScope(r, this.branchScope)); },

      // ── Repo filter ──────────────────────────────────────────────────────
      // `openBranches` is the scoped list, so the tab badge and the empty state
      // count the scope; `openRows` narrows it further to one repo.
      openRepoFilter: '',
      // The chips: repos that actually have open rows, busiest first, ties by
      // name. Derived from the list rather than from estate membership, so a
      // repo with nothing in flight never shows a zero.
      get openRepos(){
        const by = new Map();
        for (const r of this.openBranches) by.set(r.repo, (by.get(r.repo) || 0) + 1);
        return [...by.entries()]
          .map(([repo, count]) => ({ repo, count, short: this.repoShort(repo) }))
          .sort((a, b) => (b.count - a.count) || a.repo.localeCompare(b.repo));
      },
      // The filter, but only while it still names a repo with rows. A refresh
      // can land a cache where the filtered repo has nothing open left; without
      // this the view would sit on an empty list with no chip lit to explain
      // it, so the filter lapses back to All on its own.
      get activeRepoFilter(){
        const f = this.openRepoFilter;
        return f && this.openRepos.some(r => r.repo === f) ? f : '';
      },
      get openRows(){
        const f = this.activeRepoFilter;
        return f ? this.openBranches.filter(r => r.repo === f) : this.openBranches;
      },

      // ── The Sessions pane's tree: one act, the branches it left behind ───
      // Two caches, one tree, and the join runs on TWO keys because neither
      // reaches everything. A record carries the harness session URL (`agent`)
      // only since 2026-08-07, so 44 of 142 records can be reached from a
      // branch by nothing but the branch NAME, and 75 branch rows are placed by
      // that fallback alone.
      //
      // A branch nobody can place under a record still places under a STUB: its
      // Claude-Session commit trailer names a session whether or not a record
      // exists, so this list reaches every branch the trailers cover rather
      // than only the weeks the recorder has been running. What is left over is
      // genuinely unattributed, and the pane says so rather than dropping it.
      //
      // Rebuilt on every read, like openBranches beside it, rather than
      // memoized: the whole pass is one walk of ~400 branch rows against two
      // maps, and every cheap cache key available here (the caches' stamps,
      // their row counts) can repeat across two genuinely different caches. A
      // list that silently shows the previous crawl is a worse bug than any
      // amount of arithmetic this saves.
      get sessionTree(){
        const byAgent = new Map(), byBranch = new Map();
        for (const r of this.allSessionRows){
          if (r.agent) byAgent.set(r.agent, r);
          for (const x of r.repos || []){
            const k = x.name + ' ' + x.branch;
            if (x.branch && x.branch !== 'main' && !byBranch.has(k)) byBranch.set(k, r);
          }
        }

        const nodes = new Map(), orphans = [];
        const stats = { rows: 0, viaAgent: 0, viaName: 0, stub: 0, orphan: 0, placed: 0 };
        for (const r of this.allSessionRows){
          nodes.set('r:' + r.id, { kind: 'record', key: 'r:' + r.id, id: r.id,
                                   day: r.day || (r.started || '').slice(0, 10),
                                   url: r.agent || '', row: r, children: [] });
        }
        for (const b of this.allBranchRows){
          stats.rows++;
          const short = this.repoShort(b.repo);
          let key = '';
          for (const u of b.sessions || []){
            if (byAgent.has(u)){ key = 'r:' + byAgent.get(u).id; stats.viaAgent++; break; }
          }
          if (!key){
            const hit = byBranch.get(short + ' ' + b.name);
            if (hit){ key = 'r:' + hit.id; stats.viaName++; }
          }
          if (!key && (b.sessions || []).length){
            const u = b.sessions[0];
            key = 's:' + u;
            stats.stub++;
            if (!nodes.has(key)) nodes.set(key, {
              kind: 'stub', key, id: u.split('session_').pop().slice(0, 8),
              day: (b.date || '').slice(0, 10), url: u, row: null, children: [],
            });
          }
          if (!key){ orphans.push(b); stats.orphan++; continue; }
          const n = nodes.get(key);
          n.children.push(b);
          stats.placed++;
          if (n.kind === 'stub' && (b.date || '') > (n.day || '')) n.day = (b.date || '').slice(0, 10);
        }

        const byDate = (a, b) => (b.date || '').localeCompare(a.date || '');
        for (const n of nodes.values()) n.children.sort(byDate);
        orphans.sort(byDate);
        return {
          nodes: [...nodes.values()].sort((a, b) => (b.day || '').localeCompare(a.day || '')),
          orphans, stats,
        };
      },
      // The pane's own scope and repo chips, applied to nodes rather than to
      // records. A stub has no record to date, so the time scopes read its
      // newest branch instead, and Snagged excludes it: "no failures" and "no
      // record of failures" are different answers and only one is about the
      // session.
      nodeInSessionScope(n, scope){
        if (scope === 'all') return true;
        if (scope === 'failed') return !!(n.row && n.row.failures);
        const days = scope === 'day' ? 1 : scope === 'week' ? 7 : 30;
        const at = n.row ? n.row.started : n.day;
        const t = Date.parse(at || '');
        return Number.isFinite(t) && t >= Date.now() - days * 864e5;
      },
      // A node belongs to a repo when the record worked there OR when one of
      // its branches lives there. The second half is what the flat list could
      // not say: a session whose checkout was elsewhere still left the branch.
      nodeInRepo(n, repo){
        return (n.row?.repos || []).some(x => x.name === repo)
            || n.children.some(b => this.repoShort(b.repo) === repo);
      },
      get sessionNodes(){
        const f = this.activeSessionRepo;
        return this.sessionTree.nodes.filter(n =>
          this.nodeInSessionScope(n, this.sessionScope) && (!f || this.nodeInRepo(n, f)));
      },
      // The orphans, narrowed by the repo chip only: a scope is about when a
      // SESSION ran, and these have no session to have run.
      get sessionOrphans(){
        const f = this.activeSessionRepo;
        return this.sessionTree.orphans.filter(b => !f || this.repoShort(b.repo) === f);
      },
      // What the join reached, stated on the pane rather than in a doc: a tree
      // that cannot place every branch should say so where it is read.
      get sessionJoinLabel(){
        const st = this.sessionTree.stats;
        return st.placed + ' of ' + st.rows + ' branches placed';
      },
      get sessionJoinNote(){
        const st = this.sessionTree.stats;
        return st.viaAgent + ' branches reach a session record through the record\'s own session URL, '
             + st.viaName + ' through the branch name alone, '
             + st.stub + ' through a commit trailer with no record behind it, and '
             + st.orphan + ' reach no session at all. A branch nothing places is unattributed, not sessionless.';
      },

      // ── The lenses: the same relation, drawn ─────────────────────────────
      // The list answers "what happened". These three answer "what shape is
      // this", which no row can: that the relation is a FAN (a session holds
      // several branches; a branch holds one session), which is the whole
      // reason the list nests this way round rather than the other.
      //
      // Deterministic arithmetic, not a force simulation, so the same data
      // always draws the same picture and two readings a week apart are
      // comparable. Built as markup strings rather than with x-for, because an
      // Alpine <template> nested inside <svg> loses its loop scope in the HTML
      // parser and fails as "j is not defined", which is not a hint about SVG.
      sessionLens: 'list',
      starPick: null,
      LENS_PALETTE: ['#2563eb', '#16a34a', '#db2777', '#d97706', '#7c3aed', '#0891b2',
                     '#dc2626', '#65a30d', '#c026d3', '#0284c7', '#ea580c', '#4b5563'],
      get lensRepos(){
        return [...new Set(this.allSessionRows.flatMap(r => (r.repos || []).map(x => x.name)))].sort();
      },
      lensColor(repo){ return this.LENS_PALETTE[this.lensRepos.indexOf(repo) % this.LENS_PALETTE.length]; },
      // One star per session that committed anywhere: the hub is the act, each
      // satellite a repo-branch. Sorted by how many branches a session held, so
      // the field reads as a gradient from the widest session down to the many
      // that touched one.
      get lensStars(){
        return this.allSessionRows
          .map(r => ({ id: r.id, day: r.day, mins: r.mins, ask: r.ask,
                       branches: (r.repos || []).filter(x => x.branch && x.branch !== 'main')
                                                .map(x => ({ repo: x.name, name: x.branch })) }))
          .filter(s => s.branches.length)
          .sort((a, b) => b.branches.length - a.branches.length);
      },
      get starsSvg(){
        const COLS = 10, CELL = 100, R = 31, stars = this.lensStars;
        const rows = Math.ceil(stars.length / COLS) || 1;
        const cells = stars.map((s, i) => {
          const cx = (i % COLS) * CELL + CELL / 2, cy = Math.floor(i / COLS) * CELL + CELL / 2;
          const n = s.branches.length;
          const spokes = s.branches.map((b, j) => {
            const a = (j / n) * Math.PI * 2 - Math.PI / 2;
            const x = (Math.cos(a) * R).toFixed(1), y = (Math.sin(a) * R).toFixed(1);
            return '<line x1="0" y1="0" x2="' + x + '" y2="' + y + '" stroke="currentColor" stroke-width="1" opacity=".35"/>'
                 + '<circle cx="' + x + '" cy="' + y + '" r="4.5" fill="' + this.lensColor(b.repo) + '"/>';
          }).join('');
          const ring = this.starPick && this.starPick.id === s.id
            ? '<circle r="11" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".9"/>' : '';
          return '<g transform="translate(' + cx + ',' + cy + ')" data-star="' + s.id + '" style="cursor:pointer">'
               + '<circle r="' + (CELL / 2 - 2) + '" fill="transparent"/>' + spokes
               + '<circle r="6" fill="currentColor"/>' + ring + '</g>';
        }).join('');
        return '<svg viewBox="0 0 ' + (COLS * CELL) + ' ' + (rows * CELL) + '" class="w-full h-auto">' + cells + '</svg>';
      },
      pickStar(ev){
        const g = ev.target.closest('[data-star]');
        if (g) this.starPick = this.lensStars.find(s => s.id === g.dataset.star) || null;
      },
      // Collapse each session's branches to the repos they sit in and the
      // picture inverts: the star field is 130-odd disconnected components, the
      // repo graph is exactly one. An edge is a session that touched both ends,
      // its weight the number that did.
      get lensRepoGraph(){
        const touch = {}, pair = {};
        for (const r of this.allSessionRows){
          const rs = [...new Set((r.repos || []).map(x => x.name))].sort();
          for (const a of rs) touch[a] = (touch[a] || 0) + 1;
          for (let i = 0; i < rs.length; i++)
            for (let j = i + 1; j < rs.length; j++){
              const k = rs[i] + '|' + rs[j];
              pair[k] = (pair[k] || 0) + 1;
            }
        }
        const ranked = Object.keys(touch).sort((a, b) => (touch[b] - touch[a]) || a.localeCompare(b));
        const pos = {};
        ranked.forEach((name, i) => {
          const a = (i / ranked.length) * Math.PI * 2 - Math.PI / 2;
          pos[name] = { x: 310 + Math.cos(a) * 215, y: 215 + Math.sin(a) * 168 };
        });
        return {
          nodes: ranked.map(name => ({ name, n: touch[name], r: 9 + Math.sqrt(touch[name]) * 2.4, ...pos[name] })),
          edges: Object.entries(pair).map(([k, w]) => {
            const [a, b] = k.split('|');
            return { w, x1: pos[a].x, y1: pos[a].y, x2: pos[b].x, y2: pos[b].y };
          }).sort((a, b) => a.w - b.w),
        };
      },
      get reposSvg(){
        const g = this.lensRepoGraph;
        const edges = g.edges.map(e =>
          '<line x1="' + e.x1.toFixed(1) + '" y1="' + e.y1.toFixed(1) + '" x2="' + e.x2.toFixed(1) + '" y2="' + e.y2.toFixed(1)
          + '" stroke="currentColor" stroke-width="' + Math.min(9, 1 + e.w * 0.55).toFixed(1)
          + '" opacity="' + (0.08 + Math.min(0.4, e.w / 45)).toFixed(2) + '"/>').join('');
        const marks = g.nodes.map(n =>
          '<g transform="translate(' + n.x.toFixed(1) + ',' + n.y.toFixed(1) + ')">'
          + '<circle r="' + n.r.toFixed(1) + '" fill="' + this.lensColor(n.name) + '" opacity=".9"/>'
          + '<text y="4" text-anchor="middle" font-size="11" fill="#fff">' + n.n + '</text>'
          + '<text y="' + (n.r + 14).toFixed(1) + '" text-anchor="middle" font-size="12" fill="currentColor">' + n.name + '</text></g>').join('');
        return '<svg viewBox="0 0 620 440" class="w-full h-auto">' + edges + marks + '</svg>';
      },
      // The two histograms that carry the argument: branches per session has a
      // long tail, sessions per branch does not.
      tally(counts){
        const c = {};
        for (const n of counts) c[n] = (c[n] || 0) + 1;
        const rows = Object.keys(c).map(Number).sort((a, b) => a - b).map(k => ({ k, n: c[k] }));
        const max = Math.max(1, ...rows.map(r => r.n));
        // A floor of 2%, so the row that holds ONE (the branch worked across
        // two sessions) draws a mark rather than nothing at all.
        return rows.map(r => ({ ...r, pct: Math.max(2, Math.round(r.n / max * 100)) }));
      },
      get lensBranchesPerSession(){
        return this.tally(this.allSessionRows.map(r =>
          (r.repos || []).filter(x => x.branch && x.branch !== 'main').length));
      },
      get lensSessionsPerBranch(){
        return this.tally(this.allBranchRows.map(b => (b.sessions || []).length));
      },
      // A row's sessions, newest first, with `session` the one the icon opens.
      // Precedence: the branch's own (exact, from the crawl's compare), then the
      // PR's. A cache written before per-branch sessions carries only the old
      // `session` string, so that is read too rather than upgrading the file.
      rowSessions(b, pr){
        const list = (b?.sessions?.length && b.sessions)
          || (pr?.sessions?.length && pr.sessions)
          || [b?.session || pr?.session].filter(Boolean);
        return { sessions: list, session: list[0] || '',
                 sessionsExact: !!(b?.sessionsExact || pr?.sessionsExact) };
      },
      // Five states, not two. "No PR" used to mean "no OPEN PR", which on a
      // list where most rows are branches whose PR already merged said nothing
      // at all and said it confidently. What a reader needs from a branch is
      // what became of it: still open (draft or ready), merged, closed
      // unmerged (the zombie), or genuinely never proposed.
      //
      // `unknown` is the sixth and the honest one: the crawl's PR index reaches
      // back only so far (prReach), so a branch older than that has an
      // unmatched head for two indistinguishable reasons, and this refuses to
      // pick one. A cache written before the index existed carries no reach and
      // no rows, and every row on it reads unknown rather than lying either way.
      branchState(row){
        if (row.pr) return row.pr.draft ? 'draft' : 'ready';
        const p = row.prLast;
        if (p) return p.state === 'open' ? (p.draft ? 'draft' : 'ready') : (p.state || 'closed');
        return this.prIndexCovers(row) ? 'nopr' : 'unknown';
      },
      // Whether the PR index can speak for this row. It can when the read was
      // not capped (reach '' with rows present: every PR the repo has is in
      // hand), and otherwise only for a branch touched since the oldest PR the
      // read reached. An undated branch gets the benefit of the doubt, the same
      // way daysOf does: "we could not date it" is not evidence.
      prIndexCovers(row){
        if (!(this.activity[row.repo]?.branchPRs || []).length) return false;
        const reach = row.prReach || '';
        if (!reach) return true;
        return !row.date || row.date >= reach;
      },
      // What the state means in words, for the pill's tooltip and for anything
      // that needs to name it without re-deriving it.
      BRANCH_STATE_NOTE: {
        ready: 'Open pull request, ready for review',
        draft: 'Open pull request, still a draft',
        merged: 'Its pull request merged: the work shipped and the branch stayed',
        closed: 'Its pull request was closed without merging',
        nopr: 'No pull request has ever been opened for this branch',
        unknown: 'Older than the PR index reaches, so whether it had one is not known here',
      },
      branchAccent(row){
        const s = this.branchState(row);
        return s === 'ready' ? 'border-success bg-success/5'
             : s === 'draft' ? 'border-warning bg-warning/5'
             // Merged is finished work, so it is marked and then gets out of
             // the way; a closed-unmerged branch is the one that wants a second
             // look, which is the only reason a warning tint is spent here.
             //
             // VIOLET, not blue, and the reason is that three vocabularies have
             // to agree about this one state: Claude Code's own session list
             // marks a merged branch purple, GitHub has meant purple by it for
             // years, and the conventions' closing states spend 🟣 on exactly
             // this. It was `primary` until 2026-08-16, which winter renders a
             // saturated blue, so this list was the only one of the three
             // disagreeing, and it disagreed with its own detail view too
             // (branch-brief's prStateClass has always said badge-secondary).
             // Moving it also frees blue, which in a row otherwise means
             // "interactive": the route chips, every hover, the lit filter.
             : s === 'merged' ? 'border-secondary/40 bg-secondary/5'
             : s === 'closed' ? 'border-error/40 bg-error/5'
             // The last two states are both plain, and they are NOT the same
             // claim: nopr says the index looked and there is no PR, unknown
             // says the index cannot see this far back. branchState goes to
             // some trouble to keep them apart and this rendered them
             // identically, so the distinction died at the last step. A DASHED
             // rail carries it: the row is otherwise unchanged, and a broken
             // line reads as "nothing established here" without spending a
             // hue, which is right for a state that is an absence of
             // knowledge rather than an outcome. Borrowed from Claude Code's
             // own session list, where a dashed ring marks a session with no
             // branch at all; near enough, both being absences, though ours
             // is "cannot see" rather than "is not there".
             : s === 'unknown' ? 'border-base-300 border-dashed bg-base-100'
             : 'border-base-300 bg-base-100';
      },
      // The row's PR, whichever one it has: the open PR when there is one, the
      // last one the index saw otherwise. One accessor so the pill, the title,
      // and the menu cannot disagree about which PR a row is about.
      rowPR(row){ return row.pr || row.prLast || null; },
      // The mark beside the #-number, or null for a ready open PR, which needs
      // none: the number IS the open PR, and the row's green rail says the
      // rest. GitHub's own vocabulary for the glyphs, so the marks read
      // without a legend.
      BRANCH_STATE_MARK: {
        merged: { icon: 'ph-git-merge', cls: 'text-secondary/70' },
        closed: { icon: 'ph-x-circle', cls: 'text-error/70' },
        draft: { icon: 'ph-git-pull-request', cls: 'text-warning' },
      },
      branchStateMark(row){ return this.BRANCH_STATE_MARK[this.branchState(row)] || null; },
      // The row's primary action: stage the files this branch changed against
      // its default (compare def...branch), then jump to the Stage. Navigating a
      // whole branch tree is rarely the point; its diff is. One compare call per
      // click (not per visit); removed paths are skipped (no branch content to
      // stage), and the set is appended and deduped onto any working stage the
      // same way a drop or paste adds refs, so it never clobbers one. Staged at
      // ref=branch, so opening an item reads the branch's version and the Stage's
      // own Diff tab compares it back to the default.
      branchKey(repo, name){ return repo + '\0' + name; },
      async stageBranchDiff(repo, name, def){
        if (!window.__shell || !window.StageLink) return;
        const toast = window.Alpine.store('toast');
        this.stagingBranch = this.branchKey(repo, name);
        try {
          const gh = new window.GH({ token: window.TOKEN, repo });
          const paths = await this.changedPaths(gh, def, name);
          if (!paths.length){
            // No unique files versus the default: the branch's content is already
            // in main (merged), so there is nothing to stage.
            toast?.('git-merge', name + ' is already in ' + (def || 'main') + ' (nothing to stage)', 'alert-info', 3200);
            return;
          }
          const s = window.Alpine.store('browser');
          const existing = s.stage || [];
          const seen = new Set(existing.map(it => window.StageLink.fmtItem({ repo: it.repo, ref: it.ref || '', path: it.path })));
          const fresh = paths.map(p => ({ repo, ref: name, path: p }))
                             .filter(r => !seen.has(window.StageLink.fmtItem(r)));
          s.stage = [...existing, ...fresh];
          window.__shell.goStage();
          const added = fresh.length, dup = paths.length - added;
          toast?.('stack', 'Staged ' + added + ' file' + (added === 1 ? '' : 's') + ' from ' + name +
                  (dup ? ' (' + dup + ' already staged)' : ''), 'alert-success', 3000);
        } catch(e){
          toast?.('warning-circle', 'Compare failed: ' + (e?.message || e), 'alert-warning', 3800);
        } finally { this.stagingBranch = ''; }
      },
      isStaging(repo, name){ return this.stagingBranch === this.branchKey(repo, name); },
      // The paths a branch changed against its default. Mirrors the branch
      // scan's read (lib/kits/branch-status.js scanBranchLive): a plain compare,
      // falling back on a 404 (no common ancestor, e.g. after a history rewrite)
      // to a diff from the branch's fork point. Removed paths are dropped (no
      // branch content to stage).
      async changedPaths(gh, def, name){
        const pick = d => (d.files || []).filter(f => f.status !== 'removed').map(f => f.filename);
        try {
          return pick(await gh.compare(def || 'main', name));
        } catch(e){
          if (e?.status !== 404) throw e;
          const commits = await gh.req('commits?sha=' + encodeURIComponent(name) + '&per_page=50');
          const from = commits[commits.length - 1]?.parents?.[0]?.sha;
          return from ? pick(await gh.compare(from, name)) : [];
        }
      },
      treeUrl(repo, name){ return 'https://github.com/' + repo + '/tree/' + encodeURIComponent(name); },
      compareUrl(repo, def, name){ return 'https://github.com/' + repo + '/compare/' + encodeURIComponent(def) + '...' + encodeURIComponent(name); },
      commitsUrl(repo, name){ return 'https://github.com/' + repo + '/commits/' + encodeURIComponent(name); },
      prUrl(repo, n){ return 'https://github.com/' + repo + '/pull/' + n; },

      // ── The branch menu ──────────────────────────────────────────────────
      // show-repo is a wrapper over GitHub, not a wall, so every view keeps a
      // route to the GitHub presentation of what it is showing; for an Open row
      // that is a whole small set, not one link, which is what earns a menu.
      // The panel's geometry is the sidebar repo menu's (window.__shell.
      // anchorMenu), so the two anchored menus behave identically.
      branchMenuAt: null,        // { x, y } viewport coords, or null when closed
      menuBranch: null,          // the row the open menu speaks for
      BRANCH_MENU_W: 224,        // wider than the repo menu: labels carry a #number
      openBranchMenu(row, ev){
        // Two panels serve this view (this one, and the shell's for the repo
        // chip beside it), so opening either puts the other away rather than
        // leaving a hover to strand one on screen.
        window.__shell?.closeRepoMenu?.();
        this.closeRowCard();       // three panels now, and one at a time
        this.menuBranch = row;
        // Left-aligned: this trigger leads its row's action line, so a
        // right-aligned panel would open away from the button. anchorMenu takes
        // the element as readily as the event, which is what the hover path
        // hands it (a spent event has no currentTarget left to read).
        this.branchMenuAt = window.__shell?.anchorMenu?.(
          ev, this.branchMenuItems.length, { width: this.BRANCH_MENU_W, align: 'left' }) || null;
      },
      // Hover-to-open, on the shell's timings and its pointer test, so every
      // anchored menu in this app behaves the same way. Touch is unaffected:
      // there is no hover to read, and a tap already opens the menu.
      _brOpenT: null,
      _brCloseT: null,
      hoverBranchMenu(row, ev){
        const shell = window.__shell;
        if (!shell?.finePointer) return;
        const el = ev?.currentTarget;
        this.cancelBranchClose();
        if (this.branchMenuAt && this.menuBranch === row) return;
        // The delay applies to a swap too, so a pointer travelling to the open
        // panel does not re-aim it at every trigger it passes on the way.
        this._brOpenT = setTimeout(() => this.openBranchMenu(row, el), shell.HOVER_OPEN_MS);
      },
      hoverLeaveBranchMenu(){
        const shell = window.__shell;
        if (!shell?.finePointer) return;
        this.cancelBranchClose();
        this._brCloseT = setTimeout(() => { this.branchMenuAt = null; }, shell.HOVER_CLOSE_MS);
      },
      cancelBranchClose(){ clearTimeout(this._brOpenT); clearTimeout(this._brCloseT); },

      // ── The row's repo chip ──────────────────────────────────────────────
      // The whole repo in one grouped list, filling the shell's one anchored
      // panel (the sidebar's), not a third one of this view's own: same
      // geometry, same hover, so the reader learns the control once. The
      // 'repo' kind rather than 'github' because this is the only route to the
      // repo from here. The sidebar can split the same material across two
      // buttons, since its rows open repos and its list shows the siblings; a
      // row about a BRANCH, in a view with no sidebar on screen, has neither.
      // Left-aligned, since the chip leads its row.
      repoChipMenu(repo, ev){
        window.__shell?.toggleRepoMenu?.(repo, ev, 'repo', this.chipOpts(repo));
      },
      repoChipHover(repo, ev){
        this.cancelBranchClose();
        window.__shell?.hoverRepoMenu?.(repo, ev, 'repo', this.chipOpts(repo));
      },
      // The one row only this view can offer: narrow the list to this repo, or
      // widen it again. It is the repo chips' action reached from the row you
      // are already reading, which is where the question is asked ("just this
      // one") and one scroll away from where the chips are.
      //
      // It names the repo AND what is being narrowed, since the menu is read
      // after the pointer has left the row it belongs to and sits above a list
      // of rows that all name repos: "Only web-tools" left it to the reader to
      // work out only-what.
      chipOpts(repo){
        const on = this.activeRepoFilter === repo;
        return { align: 'left', extra: [{
          key: 'only',
          label: on ? 'Show all repos' : 'Show ' + this.repoShort(repo) + ' branches only',
          icon: on ? 'ph-list-bullets' : 'ph-funnel',
          run: () => { this.openRepoFilter = on ? '' : repo; },
        }] };
      },
      repoChipLeave(){ window.__shell?.hoverLeaveMenu?.(); },
      // The repo's own declared mark (its estate card icon), so a row is
      // identifiable before its name is read. Falls back to the sidebar's copy
      // of the same cache, then to a neutral glyph for a repo that declares
      // none or whose card has not loaded.
      repoIcon(repo){
        return this.entries.find(e => e.repo === repo)?.icon
          || (window.__shell?.estateRepos || []).find(r => r.repo === repo)?.icon
          || 'ph-bookmark-simple';
      },
      get branchMenuStyle(){
        return window.__shell?.menuStyle?.(this.branchMenuAt) || 'left:-9999px;top:-9999px';
      },
      get branchMenuItems(){
        const r = this.menuBranch;
        if (!r) return [];
        // Whichever PR the row is about, not only an open one: a merged PR's
        // files and checks are exactly what a reader wants after asking what
        // became of a branch, and the row's number now reaches it.
        const pr = this.rowPR(r);
        return [
          { key: 'tree', label: 'Files at branch', icon: 'ph-folder-open', external: true },
          { key: 'compare', label: 'Compare to ' + r.def, icon: 'ph-git-diff', external: true },
          { key: 'commits', label: 'Commits', icon: 'ph-git-commit', external: true },
          { key: 'dropFile', label: 'Drop a file here', icon: 'ph-tray-arrow-down', external: true },
          // With a PR, the two tabs worth a direct route (the PR itself is the
          // row's #-number). Without an OPEN one, the action the row could not
          // reach: a merged branch that kept going wants a new PR as much as a
          // never-proposed one does, so this is gated on r.pr and not on pr.
          pr && { key: 'prFiles', label: 'Files changed (#' + pr.number + ')', icon: 'ph-file-magnifying-glass', external: true },
          pr && { key: 'prChecks', label: 'Checks (#' + pr.number + ')', icon: 'ph-check-circle', external: true },
          !r.pr && { key: 'newPr', label: 'New pull request', icon: 'ph-git-pull-request', external: true },
          // The one row here that does not open github.com, and the one that
          // earns the exception: a branch name is long, hyphenated, and typed
          // into git commands and #gh= addresses, with no address bar to lift
          // it from, so it is the ADDRESS of everything the other rows open.
          // Staging left this menu on 2026-08-18 because it is not that: it
          // acts on this app's own Stage. A compare link had a row too and did
          // not earn it, since Compare opens the page the URL names and the
          // browser copies it from there.
          { key: 'copyName', label: 'Copy branch name', icon: 'ph-copy' },
        ].filter(Boolean);
      },
      runBranchMenu(key){
        const r = this.menuBranch;
        this.branchMenuAt = null;
        if (!r) return;
        const cmp = this.compareUrl(r.repo, r.def, r.name);
        const go = u => window.open(u, '_blank', 'noopener');
        if (key === 'tree') return go(this.treeUrl(r.repo, r.name));
        if (key === 'compare') return go(cmp);
        if (key === 'commits') return go(this.commitsUrl(r.repo, r.name));
        if (key === 'dropFile') return go(this.dropFileUrl(r));
        if (key === 'prFiles') return go(this.prUrl(r.repo, this.rowPR(r).number) + '/files');
        if (key === 'prChecks') return go(this.prUrl(r.repo, this.rowPR(r).number) + '/checks');
        if (key === 'newPr') return go(cmp + '?expand=1');
        if (key === 'copyName') return this.copyText(r.name, 'Branch name copied');
      },
      async copyText(text, msg){
        const toast = window.Alpine.store('toast');
        try { await navigator.clipboard.writeText(text); toast?.('check', msg, 'alert-success', 2400); }
        catch { toast?.('warning-circle', 'Could not copy', 'alert-warning', 2800); }
      },
      // ── The branch deck ──────────────────────────────────────────────────
      //
      // Tapping a branch name opens the list as a swipe-deck, one slide per
      // row, each slide mounting the branchBrief component directly in this
      // shell's Alpine. The reader gets the platform's own snap gesture, and
      // the file deck drills from this one with the same chrome one level
      // down, which is the whole point: two levels, one mechanism.
      //
      // `detail` survives as the record of WHICH list and WHERE in it, because
      // the address (&detail=owner/repo@branch) is stamped from it and a deep
      // link is resolved into it. The deck owns the position; this follows.
      detail: null,   // { rows, i }: the list as tapped (frozen so a cache refresh mid-read does not yank the sequence) and the position
      _deck: null,

      // What the branch did to its files, when something already knows, and
      // null when nothing does. Three cache generations answer, newest first:
      // the per-status breakdown, the bare count that preceded it, and the
      // scan's touched-path set, which is the same count read another way.
      // Null rather than a zeroed object where none of them does, since the
      // scan's own rule holds here too: "not measured" and "measured zero"
      // are different answers, and the glyph alone is an honest "open the
      // files" while a 0 would be a claim.
      //
      // None of it costs a call. The crawl compares every open PR head against
      // its default for the ahead/behind pair, and that response carries a
      // status and a line count for every file. GitHub caps that list at 300
      // and reports no total, so a sweeping branch reports a floor.
      //
      // A no-merge-base row keeps its numbers rather than blanking: there the
      // compare fell back to the branch's recent history, so they span more
      // than the branch, and the row's asterisk says exactly that about every
      // number on it. Blanking made the one row that most needs a route into
      // its files the one row whose glyph stood bare.
      fileStats(row){
        if (!row) return null;
        if (row.stats?.n) return row.stats;
        const n = row.nFiles ?? (row.nUnique || 0);
        // An older cache knows the total and nothing else. Reported as a total
        // with an unknown split rather than as a split that happens to be zero.
        return n ? { n, added: 0, changed: 0, removed: 0, renamed: 0,
                     additions: 0, deletions: 0, split: false } : null;
      },
      fileCount(row){ return this.fileStats(row)?.n ?? null; },
      // The two numbers the ROW shows, which are not the same as the two the
      // hover shows. `lead` rides the files glyph and `added` rides a second
      // one; removals, renames and line totals stay in the hover, since the
      // row's budget is two numbers and those are the two a reader scans for.
      // A cache that knows only a total puts it on the lead rather than
      // splitting a number it does not have: one honest number beats two where
      // one of them is a guess.
      fileParts(row){
        const f = this.fileStats(row);
        if (!f) return null;
        return f.split === false ? { lead: f.n, added: 0 }
                                 : { lead: f.changed, added: f.added };
      },
      // The files control's hover, and where everything the row has no room for
      // goes: the split it does show, the removals and renames it does not, the
      // line totals, and the scan's three-way verdict where there is one.
      // Written as lines rather than a sentence, since it is a small table and
      // a title attribute honours a newline.
      filesTitle(row){
        const f = this.fileStats(row);
        const out = [];
        if (f) {
          const num = (v) => v.toLocaleString();
          out.push(num(f.n) + (f.n === 1 ? ' file' : ' files') + ' changed against ' + (row.def || 'the default branch'));
          if (f.split !== false) {
            const parts = [];
            if (f.changed) parts.push(num(f.changed) + ' changed'
              + (f.renamed ? ' (' + num(f.renamed) + ' renamed)' : ''));
            if (f.added) parts.push(num(f.added) + ' new');
            if (f.removed) parts.push(num(f.removed) + ' removed');
            if (parts.length) out.push('  ' + parts.join(', '));
            if (f.additions || f.deletions) out.push('  +' + num(f.additions) + ' -' + num(f.deletions) + ' lines');
          }
        }
        if (row?.nUnique) out.push(this.verdictTitle(row));
        else out.push('Open the files on this branch.');
        return out.join('\n');
      },
      // The row's content verdict with all three counts, which is what makes
      // it readable: landed plus differs plus missing is the touched total, and
      // a chip showing two of the three invited the reader to subtract and get
      // a number that was never claimed. `nDiffers` has been stored since
      // 2026-08-18; a cache written before that carries the other three and the
      // arithmetic is exact, so an older row reads right rather than showing a
      // gap until the next crawl.
      verdictOf(row){
        if (!row?.nUnique) return null;
        const nLanded = row.nLanded || 0, nMissing = row.nMissing || 0;
        return { nUnique: row.nUnique, nLanded, nMissing,
                 nDiffers: row.nDiffers ?? (row.nUnique - nLanded - nMissing),
                 missingPaths: row.missingPaths || [], noBase: !!row.noBase };
      },
      // What the chip says on hover: the whole partition in a sentence, and
      // what a tap will do. It no longer pastes paths, because the paths are
      // now a surface rather than a tooltip, and a tooltip that lists twelve of
      // them under a clause about the OTHER class is how this got confusing.
      verdictTitle(row, part){
        const v = this.verdictOf(row);
        if (!v) return '';
        const def = row.def || 'the default branch';
        const parts = [v.nLanded + ' landed on ' + def, v.nDiffers + ' differ', v.nMissing + ' missing'];
        return 'Of ' + v.nUnique + (v.nUnique === 1 ? ' path' : ' paths') + ' this branch touched: '
             + parts.join(', ') + '.'
             + (v.noBase ? ' No shared ancestor, so this spans more than the branch.' : '')
             + (part === 'missing'
                 ? ' Open the ' + v.nMissing + ' files that are on neither this path nor these bytes.'
                 : '');
      },
      // ── The file card ────────────────────────────────────────────────────
      //
      // A styled panel over one of the row's two file pairs, one for new files
      // and one for changed. It replaces the `title` attribute those two carried,
      // and the reason is what a title cannot be: one string, in the browser's
      // own type, at the browser's own delay, with no links in it. What a reader
      // wants from a file count is the FILES, openable.
      //
      // It opens on what the crawl already stored, which is a SHAPE rather than a
      // list: how many of each extension and each top-level folder, complete as
      // counts and costing nothing. The file NAMES need the compare, so that is
      // fetched when the card opens and swapped in underneath. Paint, then
      // enrich, the order the Files pane already uses.
      //
      // The compare is the expensive read on this estate (most of a megabyte on
      // the hub, 88% of it one generated file's patch), so this leans on
      // BranchBrief's own 60-second memo rather than keeping a cache of its own:
      // hovering one row twice is a single call, and opening the branch detail
      // afterwards is none, since the takeover reads through the same memo. That
      // is also why the card does not store paths in the crawl cache. A path list
      // per branch across the estate is hundreds of kilobytes read on every
      // Activity load, to save a call on the rows a reader actually hovers.
      ROW_CARD_W: 384,
      rowCard: null,        // { repo, name, base, cls, count, shape, lines }
      rowCardAt: null,      // { x, y } from the shell's shared anchor geometry
      rowCardRead: null,    // { key, loading, error, noBase, files }

      rowCardKey(repo, name, base){ return repo + '@' + name + '...' + (base || ''); },
      get rowCardStyle(){
        return window.__shell?.menuStyle?.(this.rowCardAt) || 'left:-9999px;top:-9999px';
      },
      // A SNAPSHOT, not the row: allBranchRows rebuilds on every refresh, so a
      // held row would go stale under an open card. Everything the head and the
      // shape need is copied in; the list arrives from the read below.
      // The row's card, in two kinds. `files` opens over one of the three file
      // counts; `commits` opens over one of the two arrows, which said only
      // "commits ahead of / behind main" in a title attribute nobody on a phone
      // could reach. One panel, one anchor, one hover rule, two bodies.
      openRowCard(row, cls, ev){
        return cls === 'ahead' || cls === 'behind'
          ? this.openCommitCard(row, cls, ev) : this.openFileCard(row, cls, ev);
      },
      openFileCard(row, cls, ev){
        window.__shell?.closeRepoMenu?.();
        this.branchMenuAt = null;
        const f = this.fileStats(row) || {};
        // `missing` is the scan's class, not the compare's, so it comes from a
        // different place and arrives complete: the crawl already stored the
        // paths themselves, which is why this card needs no fetch to list its
        // files and only waits on the diff to show what changed inside them.
        const missing = cls === 'missing';
        const paths = missing ? (row.missingPaths || []) : null;
        this.rowCard = {
          kind: 'files',
          repo: row.repo, name: row.name, base: row.def || '', cls, paths,
          count: missing ? (row.nMissing || 0)
               : cls === 'added' ? (f.added || 0) : (f.changed || 0),
          shape: missing ? this.shapeOfPaths(paths) : (f.shape?.[cls] || { exts: [], dirs: [] }),
          split: f.split !== false,
        };
        this.rowCardOpen = '';
        this.rowCardAt = window.__shell?.anchorMenu?.(ev, 9, { width: this.ROW_CARD_W, align: 'left' }) || null;
        this.loadRowCard(row);
      },
      // The arrows, opened. Both sides are free, and that is the finding: the
      // crawl already fetches the default branch's newest commits once per repo
      // (for its own moved-or-not gate) and STORES them, so main's side was
      // sitting in the cache unread the whole time. The branch's own side is the
      // compare's `commits`, which the file cards already fetch.
      //
      // So the card opens with an answer either way and only sharpens when the
      // compare lands: `behind` reads the newest `behind_by` of main's cached
      // commits immediately, which is exact while main is linear, and switches
      // to everything newer than the compare's own `merge_base_commit` once
      // that is in hand, which is exact regardless.
      openCommitCard(row, dir, ev){
        window.__shell?.closeRepoMenu?.();
        this.branchMenuAt = null;
        this.rowCard = {
          kind: 'commits',
          repo: row.repo, name: row.name, base: row.def || '', cls: dir,
          count: (dir === 'ahead' ? row.ahead : row.behind) ?? null,
          // Empty rather than absent. x-show hides the shape band but does not
          // stop Alpine evaluating the x-for inside it, so a card with no
          // `shape` threw on every render of the other kind.
          shape: { exts: [], dirs: [] },
        };
        this.rowCardOpen = '';
        this.rowCardAt = window.__shell?.anchorMenu?.(ev, 9, { width: this.ROW_CARD_W, align: 'left' }) || null;
        this.loadRowCard(row);
      },
      // Main's commits as the crawl stored them, newest first.
      mainCommits(repo){ return this.activity?.[repo]?.recentCommits || []; },
      get rowCardCommits(){
        const c = this.rowCard;
        if (!c || c.kind !== 'commits') return [];
        const r = this.rowCardMine;
        if (c.cls === 'ahead') {
          // The compare lists exactly the commits the branch has and the default
          // does not, oldest first, so this is the whole answer reversed. Before
          // it lands there is nothing honest to show but the count.
          return (r?.commits || []).slice().reverse();
        }
        const main = this.mainCommits(c.repo);
        const base = r?.mergeBase;
        if (base) {
          const i = main.findIndex(x => x.sha === base);
          // Not in the window is not zero: the branch forked before the newest
          // commits the crawl keeps, and the card says so rather than showing an
          // empty list under a count of forty.
          return i < 0 ? null : main.slice(0, i);
        }
        return main.slice(0, c.count || 0);
      },
      // How many the card is not showing, which is the count minus what the
      // cache could reach. Zero when they agree.
      // BEHIND only. Ahead's list is the compare's own and is the whole answer,
      // so a difference there means the crawl's count was stale, not that
      // anything is missing; the summary above takes the live number instead.
      get rowCardCommitGap(){
        const c = this.rowCard, list = this.rowCardCommits;
        if (!c || c.kind !== 'commits' || c.cls !== 'behind' || list === null) return 0;
        return Math.max(0, (this.rowCardSummary?.count || 0) - list.length);
      },
      commitUrl(repo, sha){ return 'https://github.com/' + repo + '/commit/' + sha; },
      branchCommitsUrl(repo, ref){
        return 'https://github.com/' + repo + '/commits/' + encodeURIComponent(ref);
      },

      // The same digest the crawl builds, over a path list rather than a compare.
      // Through BranchStatus.fileKind, so the missing card's histogram cannot
      // disagree with the other two about what an extension is.
      shapeOfPaths(paths){
        const K = window.BranchStatus?.fileKind;
        if (!K || !paths?.length) return { exts: [], dirs: [] };
        const ext = new Map(), dir = new Map();
        for (const path of paths) {
          const k = K(path);
          ext.set(k.ext, (ext.get(k.ext) || 0) + 1);
          dir.set(k.dir, (dir.get(k.dir) || 0) + 1);
        }
        const top = (m) => [...m.entries()]
          .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, 6);
        return { exts: top(ext), dirs: top(dir) };
      },
      // ── The SESSION row's cards ──────────────────────────────────────
      // The same panel, the same anchor, the same hover rule, and a third kind
      // of body. This row is the branch row's twin and had the branch row's old
      // defect: four glyph-and-number pairs whose UNIT lived in a title, with
      // the breakdown behind each number (which tools, which files, the token
      // split, the assistant half of the turn count) having no other route at
      // all. A title never appears on a phone, so on a phone the row was four
      // bare digits.
      //
      // These cost nothing. Where the branch row's cards fetch a compare, every
      // number here is already in the session record the pane is rendering, so
      // the card is complete in its first frame and no kind of read can make it
      // better.
      SESSION_CARD: {
        turns:  { icon: 'ph-chats-circle', label: 'user turns' },
        tools:  { icon: 'ph-wrench',       label: 'tool calls' },
        files:  { icon: 'ph-files',        label: 'files opened' },
        tokens: { icon: 'ph-coins',        label: 'output tokens' },
      },
      openSessionCard(row, cls, ev){
        window.__shell?.closeRepoMenu?.();
        const spec = this.SESSION_CARD[cls];
        if (!spec) return;
        let count = 0, rows = [], note = '', lines = '';
        if (cls === 'turns') {
          count = row.exchanges || 0;
          rows = [{ label: 'user turns', n: row.exchanges || 0 },
                  { label: 'assistant messages', n: row.messages || 0 }];
        } else if (cls === 'tools') {
          count = row.calls || 0;
          rows = (row.tools || []).map(([n, c]) => ({ label: n, n: c }));
          // The failures pair opens THIS card, being a subset of these calls
          // rather than a fifth axis, so the count it stands for is stated here.
          note = [rows.length ? '' : 'This record kept no per-tool breakdown.',
                  row.failures ? row.failures + ' of these calls failed.' : ''
                 ].filter(Boolean).join(' ');
        } else if (cls === 'files') {
          count = row.filesTotal || 0;
          rows = (row.files || []).map(([path, n]) => ({ label: path, n, mono: true }));
          note = rows.length ? 'The busiest files. Opens counted, not edits.'
                             : 'This record kept no per-file breakdown.';
        } else {
          const tk = row.tokens || {};
          count = tk.output || 0;
          rows = [{ label: 'output', n: tk.output || 0 }, { label: 'input', n: tk.input || 0 },
                  { label: 'cache read', n: tk.cache_read || 0 },
                  { label: 'cache write', n: tk.cache_write || 0 }];
          // Output leads because cache reads run two orders of magnitude
          // larger and say nothing about what the session produced.
          note = 'Output leads: cache reads dwarf it and measure the harness, not the work.';
        }
        // An empty `shape`, for the same reason the commits card carries one:
        // x-show hides the shape band but does not stop its x-for evaluating,
        // so a descriptor without the key throws on every render.
        this.rowCard = { kind: 'list', key: 'session:' + row.id + ':' + cls, cls,
                         icon: spec.icon, label: spec.label, count, lines, rows, note,
                         shape: { exts: [], dirs: [] } };
        this.rowCardAt = window.__shell?.anchorMenu?.(ev, 9, { width: this.ROW_CARD_W, align: 'left' }) || null;
      },
      hoverSessionCard(row, cls, ev){
        const shell = window.__shell;
        if (!shell?.finePointer) return;          // touch has a tap, and it opens this
        const el = ev?.currentTarget;
        this.cancelRowCardClose();
        if (this.rowCard?.key === 'session:' + row.id + ':' + cls) return;
        this._fcOpenT = setTimeout(() => this.openSessionCard(row, cls, el), shell.HOVER_OPEN_MS);
      },
      closeRowCard(){ this.rowCard = null; this.rowCardAt = null; this.cancelRowCardClose(); },
      _fcOpenT: null, _fcCloseT: null,
      hoverRowCard(row, cls, ev){
        const shell = window.__shell;
        if (!shell?.finePointer) return;          // touch has a tap, and it opens this
        const el = ev?.currentTarget;
        this.cancelRowCardClose();
        if (this.rowCard && this.rowCard.name === row.name && this.rowCard.cls === cls) return;
        this._fcOpenT = setTimeout(() => this.openRowCard(row, cls, el), shell.HOVER_OPEN_MS);
      },
      hoverLeaveRowCard(){
        const shell = window.__shell;
        if (!shell?.finePointer) return;
        this.cancelRowCardClose();
        this._fcCloseT = setTimeout(() => this.closeRowCard(), shell.HOVER_CLOSE_MS);
      },
      cancelRowCardClose(){ clearTimeout(this._fcOpenT); clearTimeout(this._fcCloseT); },

      // The diff, read once per branch per reading pass and shared with the
      // takeover. A no-merge-base branch has no compare at all, which is an
      // answer rather than a failure, so it is flagged rather than thrown.
      async loadRowCard(row){
        const key = this.rowCardKey(row.repo, row.name, row.def);
        if (this.rowCardRead?.key === key && !this.rowCardRead.error) return;
        this.rowCardRead = { key, loading: true, error: '', noBase: false, files: [] };
        try {
          if (!window.BranchBrief && window.gh?.load) await window.gh.load('kits/branch-brief.js');
          if (!window.BranchBrief) throw new Error('the branch-brief kit did not load');
          const gh = new window.GH({ token: window.TOKEN, repo: row.repo, ref: row.name });
          const { compare, noBase } = await window.BranchBrief.readCompare(gh,
            { repo: row.repo, branch: row.name, base: row.def || '' });
          if (this.rowCardRead?.key !== key) return;   // the reader moved on
          const files = (compare?.files || []).map(f => ({
            path: f.filename, prev: f.previous_filename || '',
            cls: window.BranchStatus.fileClass(f),
            additions: f.additions || 0, deletions: f.deletions || 0,
            // Kept, not dropped. The compare embeds the unified diff with the
            // file list, so a card holding this response is already holding
            // every patch: opening one costs nothing and asks nobody.
            patch: f.patch || '',
          })).sort((a, b) => a.path.localeCompare(b.path));
          this.rowCardRead = {
            key, loading: false, error: '', noBase: !!noBase, files,
            // For the commits card, off the same response: the branch's own
            // commits, and the fork point that says which of main's are behind.
            commits: (compare?.commits || []).map(x => ({
              sha: x.sha, msg: (x.commit?.message || '').split('\n')[0].slice(0, 100),
              date: x.commit?.committer?.date || '', author: x.commit?.author?.name || '',
            })),
            mergeBase: compare?.merge_base_commit?.sha || '',
            // The live pair, which the head prefers over the crawl's the moment
            // it lands. Behind especially: the crawl said 0 on a branch the
            // compare puts 3 back, and a card whose head and list disagree is
            // the gap this whole branch has been closing.
            behindBy: compare?.behind_by ?? null,
          };
          this.absorbCompare(row, compare);
        } catch (e) {
          if (this.rowCardRead?.key === key)
            this.rowCardRead = { key, loading: false, error: e?.message || String(e),
                                  noBase: false, files: [] };
        }
      },
      // What a live read is worth beyond the card that asked for it.
      //
      // The card fetches a compare that is seconds old against a crawl that may
      // be hours old, so its numbers are simply better: a branch has usually
      // gained files and commits since. Writing them back is what stops the list
      // saying 62 changed while the card opened over it says 71. The reader
      // noticed the gap before this existed, which is the whole argument: two
      // readings of one branch, a tap apart, disagreeing.
      //
      // IN MEMORY ONLY, and that is the boundary. The crawl owns
      // state/activity.json, and writing the private registry from a hover would
      // put a commit-shaped cost on a gesture meant to be cheap. This lasts the
      // visit; the next crawl makes it durable.
      //
      // The VERDICT is not touched. landed / differs / missing is a function of
      // two trees, which a compare cannot supply, so refreshing the counts around
      // it and leaving it alone is the honest half-update rather than a stale
      // verdict quietly restamped as fresh.
      absorbCompare(row, compare){
        if (!compare || !window.BranchStatus) return;
        const e = this.activity?.[row.repo];
        if (!e) return;
        const patch = {
          stats: window.BranchStatus.fileStats(compare.files),
          aheadBy: compare.ahead_by ?? null,
          behindBy: compare.behind_by ?? null,
        };
        // Both carriers. Which one a row reads from depends on whether it has an
        // open PR, and that precedence is allBranchRows-s business rather than
        // this function-s; writing both means the update lands either way.
        let hit = false;
        for (const pr of (e.openPRs || [])) if (pr.head === row.name) { Object.assign(pr, patch); hit = true; }
        for (const b of (e.scan?.branches || [])) if (b.name === row.name) { Object.assign(b, patch); hit = true; }
        // Named, not just counted: the list's own "as of" stamp claims one age
        // for every row, and a row read since is fresher than the stamp says.
        // Benign as directions go, but the stamp should still say it.
        if (hit) this.freshRows = { ...this.freshRows, [row.repo + '@' + row.name]: true };
      },
      freshRows: {},
      get freshCount(){ return Object.keys(this.freshRows).length; },

      // The read belongs to THIS card only when it is the same branch, so a card
      // opened on a second row never shows the first row's files while its own
      // read is in flight.
      get rowCardMine(){
        const c = this.rowCard, r = this.rowCardRead;
        return (c && r && r.key === this.rowCardKey(c.repo, c.name, c.base)) ? r : null;
      },
      // The card's files. Two sources, because `missing` is a verdict about
      // paths and the other two are statuses in a diff: the scan's own list
      // answers immediately and takes its line counts from the diff once that
      // lands, while added and changed come from the diff or wait for it.
      get rowCardList(){
        const c = this.rowCard;
        if (!c) return [];
        const r = this.rowCardMine;
        if (c.cls !== 'missing') return r ? r.files.filter(f => f.cls === c.cls) : [];
        const by = new Map((r?.files || []).map(f => [f.path, f]));
        return (c.paths || []).map(path => by.get(path)
          || { path, prev: '', cls: 'missing', additions: 0, deletions: 0, patch: '' });
      },
      // The head, and it describes THIS CLASS rather than the branch. The crawl
      // answers first, with the count it stored; once the diff lands, both
      // numbers come off the listed files instead, so a card about new files
      // cannot show the branch's deletions in its corner. The first draft did,
      // reporting +431 -88 over a card holding two added files.
      get rowCardSummary(){
        const c = this.rowCard;
        if (!c) return null;
        // A LIST card carries its own answer. It is built from the session
        // record the pane already holds, so there is no read to wait for and
        // nothing that can sharpen later.
        if (c.kind === 'list') return { count: c.count, lines: c.lines || '' };
        const r = this.rowCardMine, list = this.rowCardList;
        if (c.kind === 'commits') {
          // AHEAD is answered exactly by the compare, so the live list wins the
          // moment it lands, the same rule the file cards follow. BEHIND is
          // answered by a capped cache, so the crawl's count stands and the gap
          // below says what the list could not reach: a shortened list must not
          // shorten the number over it.
          const done = r && !r.loading;
          const live = !done ? null
                     : c.cls === 'ahead' ? (r.commits || []).length : r.behindBy;
          return { count: live ?? c.count, lines: '' };
        }
        if (!r || r.loading || !r.files.length) return { count: c.count, lines: '' };
        const add = list.reduce((n, f) => n + f.additions, 0);
        const del = list.reduce((n, f) => n + f.deletions, 0);
        // Only the half that happened: a card of new files reporting "-0" is a
        // zero nobody asked about, sitting where a real number goes.
        return { count: list.length,
                 lines: [add ? '+' + add : '', del ? '-' + del : ''].filter(Boolean).join(' ') };
      },
      // Which file in the card is open, and its patch, split for rendering. The
      // classes match the ones the file-review card uses for the same job, so a
      // diff reads the same in both places.
      //
      // Capped, because one file in this estate carries a quarter-megabyte
      // hunk: the pre-build's own diff is three lines of a size that would
      // freeze the panel rendering them. Past the cap the card says how much it
      // is not showing and the GitHub link beside the row is the way to the
      // rest.
      PATCH_CAP: 400,
      rowCardOpen: '',
      toggleRowCardPatch(path){ this.rowCardOpen = this.rowCardOpen === path ? '' : path; },
      patchLines(patch){
        const all = String(patch || '').split('\n');
        return all.slice(0, this.PATCH_CAP).map(t => ({
          t,
          cls: t.startsWith('+') ? 'bg-success/15 text-success-content'
             : t.startsWith('-') ? 'bg-error/15 text-error-content'
             : t.startsWith('@@') ? 'bg-info/15' : '',
        }));
      },
      patchOverflow(patch){
        const n = String(patch || '').split('\n').length;
        return n > this.PATCH_CAP ? n - this.PATCH_CAP : 0;
      },
      // Split for rendering, so the folder can be muted and the filename cannot
      // be the half that a truncation eats.
      rowCardDir(path){ const i = path.lastIndexOf('/'); return i < 0 ? '' : path.slice(0, i + 1); },
      rowCardName(path){ const i = path.lastIndexOf('/'); return i < 0 ? path : path.slice(i + 1); },
      fileBlobUrl(repo, branch, path){
        return 'https://github.com/' + repo + '/blob/' + encodeURIComponent(branch) + '/'
             + String(path).split('/').map(encodeURIComponent).join('/');
      },
      // The card's own exit into the branch detail. Looks the row back up rather
      // than holding one, for the reason the snapshot exists.
      openFileCardBranch(){
        const c = this.rowCard;
        if (!c) return;
        const row = this.openRows.find(r => r.repo === c.repo && r.name === c.name);
        this.closeRowCard();
        if (row) this.openBranchFiles(row, '');
      },

      // The chip's tap. The detail takeover is already the branch's files; all
      // this adds is landing on the right pane with the right filter, so the
      // count a reader tapped and the list they arrive at are the same set.
      openBranchFiles(row, state){
        this._openFiles = { pane: 'files', fileState: state || '' };
        this.openBranchDetail(row);
      },
      _openFiles: null,

      openBranchDetail(row){
        // Opening REPLACES an open takeover rather than stacking a second one
        // on it. Two branch decks is not a level, it is the same level twice,
        // and the reader would have to Back through a deck they never asked
        // for. It happens for real: the finder's open-branch event and a
        // `&detail=` deep link can both fire while one is already open.
        //
        // The old one is DROPPED rather than closed, which is the difference
        // between a swap and a navigation. close() leaves through history, and
        // a history round trip cannot land while a newer deck sits on top of
        // it: the old deck's popstate handler defers to the top of the stack,
        // so it would never clean up and would leak, still mounted, forever.
        // drop() tears it down at once and touches no history; the deck that
        // takes its place then reuses its entry (`replace`), so Back still
        // costs one press.
        const replacing = !!this._deck;
        if (this._deck) { const old = this._deck; this._deck = null; old.drop(); }
        // Keyed lookup, not identity: the row getters rebuild their objects on
        // every access, so the tapped row may not be the array's instance.
        const rows = [...this.openRows];
        const key = row.repo + '/' + row.name;
        const i = rows.findIndex(r => r.repo + '/' + r.name === key);
        // A row that is not in the current list (a deep link to a branch the
        // filter hides, or one that has since landed) still opens, as a list of
        // one. A link that resolves to nothing would be worse than a link with
        // nowhere to swipe.
        this.detail = i >= 0 ? { rows, i } : { rows: [row], i: 0 };
        this.stampDetail();
        this.mountDeck(replacing);
      },

      async mountDeck(replace){
        const rows = this.detail?.rows || [];
        if (!rows.length) return;
        // The chain a branch view needs, pulled on first use rather than owed
        // to this shell's boot: a visit that never opens a branch pays for
        // none of it, and the pre-build's inlined cache serves every one of
        // these with no network trip (measured: zero requests).
        //
        // It is not optional. The shell registers the branchBrief COMPONENT,
        // since the pre-build auto-boots every component, but not the KIT it
        // reads, and a slide mounted without window.BranchBrief renders its own
        // "this page has not finished loading its code" and nothing else. That
        // is what the first browser run of the converted deck showed, and it is
        // the one thing the iframe used to do for free: branch.html named the
        // whole chain, and nobody had to notice it existed.
        //
        // Order matters where branch.html says it does: branch-brief reads
        // compareFields off BranchStatus. cm6-merge is fileReview's, which the
        // Files pane mounts; guide-render and content-registry lazy-load
        // themselves inside the component and are listed for the same reason
        // branch.html lists them, so the chain is readable in one place.
        try {
          for (const k of ['kits/swipe-deck.js', 'kits/branch-status.js', 'kits/guide-render.js',
                           'kits/content-registry.js', 'kits/branch-brief.js', 'kits/cm6-merge.js']) {
            await gh.load(k);
          }
        } catch (e) { console.warn('branch deck:', e?.message || e); return; }
        if (!this.detail) return;                       // closed while loading

        // Each slide is a live branch view. Three exist at a time, since the
        // deck builds the active slide and its neighbours only, so the cost is
        // the three compares the warm already pays for.
        //
        // The options travel through a keyed global rather than being written
        // into the x-data attribute, for the reason cardOpts documents one file
        // over: inside an x-data expression Alpine puts every registered
        // component name in scope, so a bare `repo` would resolve to the repo
        // DATA PROVIDER rather than to a string.
        const near = (i) => [rows[i - 1], rows[i + 1]].filter(Boolean)
          .map(r => ({ repo: r.repo, branch: r.name, base: r.def || '' }));
        // Which global each built slide is holding, so `release` can let it go.
        // Emptying the slide is enough for Alpine to destroy the view, but the
        // options object would outlive it on `window` and keep the whole row,
        // its warm list and this component's closure reachable.
        const keys = [];
        // Consumed HERE and cleared at once, so a filter is what one tap asked
        // for and not a mode the deck stays in. The closure keeps it for the
        // slide that was tapped; every other slide is an ordinary branch view.
        const openFiles = this._openFiles; this._openFiles = null;
        const render = (i, slide) => {
          const r = rows[i];
          if (!r) return;
          const key = keys[i] = '__branchSlide_' + (this._slideSeq = (this._slideSeq || 0) + 1);
          window[key] = {
            repo: r.repo, branch: r.name, base: r.def || '',
            // The crawled tip, so the slide addresses its tree by SHA rather
            // than percent-encoding a branch name with a slash in it.
            sha: r.sha || '',
            pr: r.pr ? String(r.pr.number) : '',
            framed: true, warm: near(i),
            // What this list already knows, lent to the slide so its head is
            // right before the compare is read. The slide defers that read
            // until the reader opens Files, and without these the ahead,
            // behind, lifespan and state would all sit at "?" on a branch the
            // crawl measured minutes ago. Provisional by contract: the compare
            // overwrites every one of them when it lands.
            facts: { ahead: r.ahead, behind: r.behind, firstDate: r.first || '',
                     lastDate: r.date || '', sessions: r.sessions || [] },
            // The content verdict on the same provisional contract as `facts`:
            // the crawl already measured it, so the slide's Files strip is
            // right in its first frame and its missing filter is exact before
            // any tree is read. The slide re-measures and replaces it, which is
            // what keeps a cold pages/branch.html able to show the same thing.
            scan: this.verdictOf(r),
            // Only the slide the tap named opens on a pane it did not choose.
            ...(openFiles && i === this.detail.i ? openFiles : {}),
            onMeta: (m) => this.onSlideMeta(i, m),
          };
          const el = document.createElement('div');
          el.className = 'h-full';        // the view pins a head and scrolls a pane
          el.setAttribute('x-data', `branchBrief(window.${key})`);
          slide.append(el);
          window.Alpine.initTree(el);
        };

        this._deck = window.swipeDeck.open({
          count: rows.length, start: this.detail.i, render, replace: !!replace,
          // The branch view pins its own head and scrolls its own pane, so the
          // slide hands it the vertical axis rather than wrapping it in a
          // second scroller.
          slideScroll: false,
          innerClass: 'h-full w-full min-w-0',
          release: (i) => { if (keys[i]) { delete window[keys[i]]; keys[i] = null; } },
          ...this.deckChrome(this.detail.i),
          actions: [{ icon: 'ph-link', title: 'Copy a link that opens this branch here',
                      onClick: () => this.copyDetailLink() }],
          // Fires however the reader left: ✕, Back, Escape, or a parent deck
          // cascading. Guarded so the closeDetail path below, which clears
          // first and asks the deck to close second, does not stamp twice.
          onClose: () => {
            this._deck = null;
            if (this.detail) { this.detail = null; this.stampDetail(); }
          },
        });
        this._deck.deck.onSlide((i) => this.onDeckSlide(i));
      },

      // The reader moved. Everything the shell owns about position follows from
      // here: the record the address is stamped from, and the header, which
      // names a different branch on every slide. Split out of the deck's
      // callback so it is one named thing rather than a closure, and so a test
      // can say "the reader is on slide 2" without also having to make jsdom
      // believe in scrolling.
      onDeckSlide(i){
        if (!this.detail || i === this.detail.i) return;
        this.detail = { ...this.detail, i };
        this.stampDetail();                            // the address follows the swipe
        this.dressDeck(i);
      },

      // What the header says about a row, before its brief has been read. The
      // repo, the branch and any OPEN pull request are all in the cache; a
      // merged one is not, which is what onSlideMeta fills in.
      deckChrome(i){
        const r = (this.detail?.rows || [])[i];
        if (!r) return {};
        const n = r.pr?.number || 0;
        return {
          // The last segment, the way the file deck titles a file by its
          // filename and leaves the directory to the crumb. Every branch here
          // is `claude/<slug>`, and a header at phone width has room for one
          // of the two: the slug is the half that distinguishes. The full name
          // is written once, in full, on the slide's own identity line.
          title: r.name.split('/').pop() || r.name,
          subtitle: [this.repoShort(r.repo), n ? '#' + n : ''].filter(Boolean).join(' · '),
          icon: this.repoIcon(r.repo) || 'ph-git-branch',
          link: n ? { href: this.prUrl(r.repo, n), icon: 'ph-git-pull-request',
                      title: 'Pull request #' + n } : null,
        };
      },
      dressDeck(i){
        const c = this.deckChrome(i);
        if (!this._deck || !c.title) return;
        this._deck.setTitle(c.title);
        this._deck.setSubtitle(c.subtitle);
        this._deck.setIcon(c.icon);
        this._deck.setLink(c.link);
      },
      // A slide finished reading itself. The one thing worth hearing is the PR
      // number, because the activity crawl asks GitHub for OPEN pull requests
      // only (app/index.html, `g.pulls('open', 30)`), so a branch whose PR
      // merged has none in the cache and the header would otherwise stay blank
      // on exactly the branches whose work is finished. Guarded on the slide,
      // since a neighbour can settle while the reader is elsewhere.
      onSlideMeta(i, m){
        if (!this.detail || i !== this.detail.i || !this._deck || !m?.pr) return;
        const r = this.detail.rows[i];
        if (!r || r.repo !== m.repo || r.name !== m.branch) return;
        this._deck.setSubtitle([this.repoShort(r.repo), '#' + m.pr,
                                m.prState && m.prState !== 'open' ? m.prState : '']
          .filter(Boolean).join(' · '));
        this._deck.setLink({ href: this.prUrl(r.repo, m.pr), icon: 'ph-git-pull-request',
                             title: 'Pull request #' + m.pr });
      },

      // Closing is synchronous HERE and asynchronous in the DOM: the deck
      // leaves through history, which lands a tick later, and a caller that
      // closes and immediately opens something else must not see the old
      // takeover still standing in the shell's own state.
      closeDetail(){
        const d = this._deck;
        this._deck = null;
        this.detail = null;
        this.stampDetail();
        if (d) d.close();
      },

      // ── The takeover's own address ───────────────────────────────────────
      // Being inside the swiper is a state worth linking to, and it was the one
      // state here with no address: the list had `?view=activity` and the branch
      // had its standalone page, and the thing in between, the branch open in
      // the reader you swipe through, could only be reached by tapping. The
      // shell stamps `&detail=owner/repo@branch` while it is open and drops it
      // when it closes, so Back leaves the takeover rather than the view.
      stampDetail(){
        const r = this.detailRow;
        window.__shell?.setDetail?.(r ? r.repo + '@' + r.name : '');
      },
      detailLink(){
        const r = this.detailRow;
        if (!r) return '';
        const p = new URLSearchParams(location.search);
        p.set('view', 'activity');
        p.set('detail', r.repo + '@' + r.name);
        return location.origin + location.pathname + '?' + p.toString();
      },
      async copyDetailLink(){
        const url = this.detailLink();
        if (!url) return;
        const toast = window.Alpine.store('toast');
        try { await navigator.clipboard.writeText(url); toast?.('link', 'Link to this branch copied', 'alert-success', 2400); }
        catch { toast?.('warning-circle', 'Could not copy', 'alert-warning', 2800); }
      },
      // Consume a `&detail=` on the first load that has rows to match against.
      // Runs from the same place the pane learns it has data, so it needs no
      // timer and fires once.
      openDetailFromUrl(){
        const spec = new URLSearchParams(location.search).get('detail');
        if (!spec) return;
        const m = String(spec).match(/^([^/\s]+\/[^/@\s]+)@(.+)$/);
        if (!m) { this._detailFromUrl = true; return; }
        const [, repo, name] = m;
        const inList = this.openRows.find(r => r.repo === repo && r.name === name);
        if (this._detailFromUrl) {
          // Opened already. The only reason to act again is an UPGRADE: the
          // first pass ran before the branch list existed and opened a list of
          // one, and the list has since arrived carrying this branch, so the
          // sequence can be re-seated and the swipe starts working. A takeover
          // the reader closed stays closed.
          if (!this.detail || this.detail.rows.length > 1 || !inList) return;
          if (this.detailRow?.name !== name) return;
        }
        this._detailFromUrl = true;
        this.openBranchDetail(inList || { repo, name });
      },
      get detailRow(){ return this.detail ? this.detail.rows[this.detail.i] : null; },
      // The number the header shows, for tests and for anything else asking.
      // The row's own PR is instant; a merged one arrives with the slide's meta.
      get detailPrNumber(){ return this.detailRow?.pr?.number || 0; },

      // GitHub's new-file form, opened ON this branch with the filename
      // prefilled: the drop-a-file convention. The mint (and the same-repo
      // inbox rule that keeps a cross-repo inbox spec out of the filename)
      // lives in BranchStatus.dropFileUrl, shared with the branch page.
      dropFileUrl(r){
        const cfg = window.__shell?.estateConfigs?.[r.repo] || {};
        return window.BranchStatus.dropFileUrl(r.repo, r.name, cfg.inbox);
      },

      repoShort(repo){ return (repo || '').split('/')[1] || repo; },
      // Relative time from an ISO date, reusing GH.ago (one throwaway instance).
      agoOf(iso){ try { return iso ? (this.__ago ||= new window.GH({})).ago(iso) : ''; } catch { return ''; } },
      // Compact form for the dense tables: drop " ago", collapse "just now".
      agoShort(iso){ return this.agoOf(iso).replace(' ago', '').replace('just now', 'now'); },
      // The leading half of an Open row's lifespan. The collapse rules live in
      // BranchStatus.lifespanStart, shared with the per-repo branch review so
      // the two surfaces cannot drift; this passes in the formatting.
      branchStart(row){
        return window.BranchStatus.lifespanStart(row.first, row.date, iso => this.agoShort(iso));
      },
      branchSpanTitle(row){
        return window.BranchStatus.lifespanTitle(row.first, row.date, iso => this.agoOf(iso));
      },
      // Open a repo straight into its per-repo branch-review view.
      // The abandoned badge's destination: the Branches pane, already narrowed
      // to this repo and this scope. It deliberately does NOT go where the
      // branch-count badge goes (the per-repo branch review), which has no
      // abandoned filter and so would land a reader somewhere that cannot show
      // what they just tapped.
      openAbandoned(repo){
        this.branchScope = 'abandoned';
        this.openRepoFilter = repo;
        // Through goSub, not straight to the shell: `tab` is a getter over the
        // shell's view, so the pane is switched by navigating, which is also
        // what stamps the URL and the history entry.
        this.goSub('activity');
      },
      async openRepoBranches(repo){
        if (!window.__shell) return;
        await window.__shell.ensureBrowser(repo, this.activity[repo]?.defaultBranch || '');
        window.__shell.goBranches();
      },

      // ── Repos grid layout ────────────────────────────────────────────────
      // A section per group. Group order and within-group order both come from
      // each repo's own `order` (group weight = its lowest member's order), so
      // arrangement, like everything else, is a repo property. Nested entries
      // render inside their parent, so they are excluded here.
      get groupSections(){
        const visible = this.entries.filter(e => !e.nested);
        const by = new Map();
        for (const e of visible){
          const g = e.group || '';
          if (!by.has(g)) by.set(g, []);
          by.get(g).push(e);
        }
        for (const arr of by.values()) arr.sort((a, b) => (a.order - b.order) || a.repo.localeCompare(b.repo));
        const groups = [...by.keys()].sort((ga, gb) => {
          const minA = Math.min(...by.get(ga).map(e => e.order));
          const minB = Math.min(...by.get(gb).map(e => e.order));
          return (minA - minB) || ga.localeCompare(gb);
        });
        return groups.map(g => ({ group: g, items: by.get(g) }));
      },

      // Card jumps for pins and projects (pinIsFile, pinLabel, openRepoAt,
      // openProjectFrom) went with those bands on 2026-07-31; the card no
      // longer routes to either. The shell keeps its own pinIsFile for the
      // sidebar's pin list, which is unaffected.

      // ── Add a repo to the estate: set estate:true in ITS OWN config ─────────
      // Membership is a repo property, so adding writes the target repo's
      // .web-tools.json (needs write access to that repo). Candidates come from
      // the header repo picker's already-loaded account list, minus current
      // members.
      addOpen: false,
      adding: false,
      addName: '',
      addGroup: '',
      addNote: '',
      candidates: [],
      loadCandidates(){
        const rc = document.getElementById('repo')?.__repo;
        const have = new Set(this.entries.map(e => e.repo));
        this.candidates = (rc?.repos || []).map(r => r.full_name).filter(n => !have.has(n)).sort();
      },
      // Open the add form, optionally with a group preset (the per-category +).
      // The group stays editable, so a new category is still one keystroke away.
      openAdd(group){ this.addGroup = group || ''; this.addOpen = true; this.loadCandidates(); },
      // The estate's current group names, for the group comboboxes.
      get groupOptions(){
        return [...new Set(this.entries.map(e => e.group).filter(Boolean))].sort();
      },
      // Resolve a repo's default branch from the header picker's list, else a
      // direct metadata read, else 'main'.
      async repoRef(full){
        const rc = document.getElementById('repo')?.__repo;
        const known = (rc?.repos || []).find(r => r.full_name === full);
        if (known?.default_branch) return known.default_branch;
        try { return (await new window.GH({ token: window.TOKEN }).req('/repos/' + full)).default_branch || 'main'; }
        catch { return 'main'; }
      },
      // One write path for every membership decision. Read the repo's own
      // .web-tools.json, merge the patch, save it back. Both decisions this view
      // offers (join the estate, set aside) are properties OF THE REPO, so both
      // write the repo and neither touches a registry list; sharing the path is
      // what keeps that true of the second one by construction rather than by
      // remembering.
      async patchRepoConfig(full, patch, message){
        const ref = await this.repoRef(full);
        const g = new window.GH({ token: window.TOKEN, repo: full, ref });
        let cfg = {};
        try { cfg = JSON.parse((await g.get('.web-tools.json')).text); } catch {}
        if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) cfg = {};
        Object.assign(cfg, patch);
        if (typeof g.save !== 'function' && window.gh?.load) await window.gh.load('gh-store.js');
        await g.save('.web-tools.json', cfg, message);
        return cfg;
      },
      async addRepo(){
        const full = this.addName.trim();
        if (!full || !this.hasToken()) return;
        if (!/^[^/\s]+\/[^/\s]+$/.test(full)){
          Alpine.store('toast')?.('warning', 'Enter owner/repo', 'alert-warning', 4000); return;
        }
        if (this.entries.some(e => e.repo === full)){
          Alpine.store('toast')?.('info', full + ' is already on the estate', 'alert-info', 3000);
          this.addOpen = false; this.addName = ''; return;
        }
        this.adding = true;
        try {
          const patch = { estate: true };
          if (this.addGroup.trim()) patch.group = this.addGroup.trim();
          if (this.addNote.trim()) patch.note = this.addNote.trim();
          await this.patchRepoConfig(full, patch, 'Join the web-tools estate (estate: true) via show-repo');
          Alpine.store('toast')?.('check-circle', 'Added ' + full, 'alert-success', 3000);
          this.addOpen = false; this.addName = ''; this.addGroup = ''; this.addNote = '';
          this.unfiledMoved[full] = 'adopted';   // if it came off an Unfiled row, retire the row now
          // The shell's config-saved handler force-rebuilds the cache and reloads
          // the cards; don't rebuild here too, since a second concurrent write to
          // the registry cache would collide with it.
          document.dispatchEvent(new CustomEvent('web-tools:config-saved', { detail: { repo: full } }));
        } catch(e){
          Alpine.store('toast')?.('warning', 'Add failed: ' + (e?.message || e), 'alert-error', 6000);
        } finally { this.adding = false; }
      },

      // ── Unfiled: the account repos that are NOT on the estate ──────────────
      // Every load already fetches the whole account list (accountRepos, one
      // /user/repos call) and then discards everything that did not opt in, so a
      // repo you own but have not filed was invisible here. Non-membership was
      // modelled as "not yet added" and surfaced only inside the Add form's
      // datalist, which means the decision itself had no representation: there
      // was no way to say "I looked at this one and it does not belong on the
      // dashboard."
      //
      // Three states, on two independent axes, because they answer different
      // questions and both have a real population:
      //
      //   archived (GitHub)      is this finished?        → Retired
      //   conventions:'optout'   is it on my dashboard?   → Set aside
      //   neither                undecided                → Unfiled
      //
      // A live repo can be off the dashboard, so neither subsumes the other.
      // `archived` is the cheaper of the two and the only one needing no file in
      // the repo, which is what makes it reachable for a 2018 repo that will
      // never carry a .web-tools.json. It also rides in free on the list call
      // already being made, so a repo archived on GitHub moves itself into
      // Retired on the next load with nothing stored here.
      //
      // That self-correction is the whole argument for the Retire action being a
      // link out rather than a write. Deleting needs a delete_repo-scoped token
      // and this one is repo-scoped deliberately (the view's own "Get a token"
      // link says so), so widening it for a twice-a-year action would put a
      // delete-capable credential in localStorage and into every tossed page.
      // GitHub's danger zone also offers Archive above Delete and demands the
      // name typed, which is better space in front of the decision than a dialog
      // of ours. The page names the destination; GitHub performs the act; the
      // next read tells the truth.
      unfiledRepos: [],       // account rows not on the estate, normalized at load
      unfiledConf: {},        // name -> its own config, for the optout read
      unfiledMoved: {},       // optimistic state after a write (see below)
      unfiledOpen: { aside: false, retired: false },
      unfiledBusy: '',

      async loadUnfiled(confMap){
        this.unfiledConf = confMap || {};
        // The optimism is deliberately NOT cleared here. A write lands in the
        // repo at once but reaches these rows only through the registry's config
        // cache, which rebuilds asynchronously; clearing on every load would
        // bounce a just-filed row back to Unfiled for a pass, which reads as a
        // failed write. Each entry drops itself once the cache agrees with it,
        // so the override is self-retiring rather than sticky.
        for (const [name, want] of Object.entries(this.unfiledMoved)){
          const cfg = this.unfiledConf[name];
          if (want === 'aside' && cfg?.conventions === 'optout') delete this.unfiledMoved[name];
          if (want === 'adopted' && cfg?.estate === true) delete this.unfiledMoved[name];
        }
        const acct = await this.accountRepos();
        const have = new Set(this.entries.map(e => e.repo));
        const gh = new window.GH({ token: window.TOKEN });
        this.unfiledRepos = acct.filter(r => !have.has(r.full_name)).map(r => ({
          repo: r.full_name,
          name: r.full_name.split('/')[1] || r.full_name,
          desc: r.description || '',
          priv: !!r.private,
          archived: !!r.archived,
          lang: r.language || '',
          pushedAt: r.pushed_at || '',
          ago: (r.pushed_at && gh.ago) ? gh.ago(r.pushed_at) : '',
        }));
      },

      unfiledState(r){
        const moved = this.unfiledMoved[r.repo];
        if (moved) return moved;
        if (r.archived) return 'retired';
        if (this.unfiledConf[r.repo]?.conventions === 'optout') return 'aside';
        return 'open';
      },

      // Undecided first and always open; the two settled states collapse, since
      // a list that never drains is a second inventory rather than a work
      // surface. Newest push first inside each: the age column then carries the
      // sort, so the grouping does not have to.
      get unfiledSections(){
        const buckets = { open: [], aside: [], retired: [] };
        for (const r of this.unfiledRepos) buckets[this.unfiledState(r)]?.push(r);
        for (const arr of Object.values(buckets)){
          arr.sort((a, b) => String(b.pushedAt).localeCompare(String(a.pushedAt)) || a.repo.localeCompare(b.repo));
        }
        return [
          { key: 'open',    label: 'Unfiled',   icon: 'ph-tray',       items: buckets.open,    fold: false },
          { key: 'aside',   label: 'Set aside', icon: 'ph-eye-closed', items: buckets.aside,   fold: true },
          { key: 'retired', label: 'Retired',   icon: 'ph-archive',    items: buckets.retired, fold: true },
        ].filter(s => s.items.length);
      },

      unfiledShown(sec){ return !sec.fold || !!this.unfiledOpen[sec.key]; },
      toggleUnfiled(sec){ if (sec.fold) this.unfiledOpen[sec.key] = !this.unfiledOpen[sec.key]; },

      // Adopt routes into the existing Add form rather than writing directly, so
      // group and note stay available on the one decision that wants them, and
      // membership keeps a single implementation.
      adoptUnfiled(r){
        this.addName = r.repo; this.addGroup = ''; this.addNote = '';
        this.addOpen = true;
        this.loadCandidates();
        // The form is above the rule and the row is below it, so on a long
        // account the field it just filled would be off screen. Guarded: a host
        // without a real scrollTo (jsdom, an embed) must not lose the adopt.
        try { window.scrollTo?.({ top: 0, behavior: 'smooth' }); } catch {}
      },

      // Set aside writes the one field the conventions already define
      // (`"conventions": "optout"`, landed in PR #222 and graded by
      // lib/kits/portable-align.js), which until now had a schema entry and a
      // reader but no way to set it.
      async setAside(r){
        if (!this.hasToken() || this.unfiledBusy) return;
        this.unfiledBusy = r.repo;
        try {
          await this.patchRepoConfig(r.repo, { conventions: 'optout' },
            'Set aside: not part of the estate (conventions: optout) via show-repo');
          this.unfiledMoved[r.repo] = 'aside';
          this.unfiledOpen.aside = true;   // show where the row went
          Alpine.store('toast')?.('check-circle', 'Set aside ' + r.repo, 'alert-success', 3000);
          document.dispatchEvent(new CustomEvent('web-tools:config-saved', { detail: { repo: r.repo } }));
        } catch(e){
          Alpine.store('toast')?.('warning', 'Set aside failed: ' + (e?.message || e), 'alert-error', 6000);
        } finally { this.unfiledBusy = ''; }
      },

      // The two GitHub destinations. Settings is where archive and delete both
      // live, so one address serves Retire and the un-retire of an archived row.
      repoSettingsUrl(repo){ return 'https://github.com/' + repo + '/settings'; },
      newRepoUrl(){ return 'https://github.com/new'; },

      // The account panel: the same dialog opened with no repo, so it shows the
      // token control alone. The Repos view is its only opener now that the
      // header shield is gone, in both auth states (add one, or replace/clear
      // the one in play).
      accountPanel(){
        document.getElementById('repo')?.__repo?.openDialog(null, { estate: true });
      },

      // ── Surfaces ───────────────────────────────────────────────────────────
      // Every surfaces/*.surface in the registry, archive excluded, standing
      // first. 404 (no dir yet) is a quiet no-op. `raw` keeps the whole parsed
      // file so the editor round-trips fields the view doesn't render.
      async loadSurfaces(reg){
        this.surfLoading = true;
        try {
          const files = (await reg.ls('surfaces')).filter(f => f.type === 'file' && f.name.endsWith('.surface'));
          const loaded = await Promise.all(files.map(async (f) => {
            try {
              const raw = JSON.parse((await reg.get('surfaces/' + f.name)).text);
              // Read normalizes v1 to v2 for display; `raw` stays the file as
              // written, so the editor round-trips it and a v1 file is never
              // rewritten by having been looked at.
              const s = window.Surface.read(raw);
              if (!s) return null;
              return { uid: 'reg:' + f.name, file: f.name, manifest: s.manifest, items: s.items, wasV1: s.wasV1, raw };
            } catch { return null; }
          }));
          const rank = c => ({ default: 0, standing: 1, showcase: 2 }[c] ?? 2);
          this.surfaces = loaded.filter(Boolean)
            .filter(s => (s.manifest.category || 'showcase') !== 'archive')
            .sort((a, b) => rank(a.manifest.category || 'showcase') - rank(b.manifest.category || 'showcase'));
          if (this.surfActive >= this.surfaces.length) this.surfActive = 0;
        } catch { this.surfaces = []; }
        finally { this.surfLoading = false; }
      },
      async reloadSurfaces(){
        if (!this.hasToken()) return;
        const reg = this.regGH();
        await this.loadSurfaces(reg);
      },

      // ── The bench bridge ─────────────────────────────────────────────────
      // How many of a surface's items have a file behind them, which is both
      // the gate on the button and its label. A surface of pure prose offers
      // nothing to stage and says so by not appearing to.
      stageableCount(s){ return window.Surface.toStage(s).items.length; },

      // Two-tap arm, matching the stage's Send: a delete with no undo should
      // cost a deliberate second gesture, and an inline arm says so without a
      // dialog for what is, after all, one file in a history.
      async deleteSurface(s){
        if (this.surfArmed !== s.uid) {
          this.surfArmed = s.uid;
          setTimeout(() => { if (this.surfArmed === s.uid) this.surfArmed = ''; }, 3000);
          return;
        }
        this.surfArmed = '';
        try {
          const reg = this.regGH();
          if (typeof reg.del !== 'function' && window.gh?.load) await window.gh.load('gh-store.js');
          await reg.del('surfaces/' + s.file, 'Delete surface via show-repo');
          await this.reloadSurfaces();
          Alpine.store('toast')?.('trash', 'Deleted ' + (s.manifest.name || s.file), 'alert-success', 2500);
        } catch (e) {
          Alpine.store('toast')?.('warning', 'Delete failed: ' + (e?.message || e), 'alert-error', 6000);
        }
      },

      // ── Repo-declared surfaces ───────────────────────────────────────────
      // A repo names its own surface in its .web-tools.json: `surface` is a path
      // (or a list of paths) to .surface files in that repo. The config cache
      // already carries those declarations (confMap), so this fetches only the
      // repos that declared one, on their default branch, resolved from the one
      // shared account-repos list. That declaration is the gate: it is a bounded
      // read over opt-in repos, not a scan of every estate member. A file that
      // 404s or won't parse is skipped quietly, like a missing surfaces dir.
      // (Follow-up: gate the re-fetch on the repo's pushed_at so an unchanged
      // surface isn't re-read every load; see the guide PR.)
      async loadRepoSurfaces(confMap){
        this.repoSurfLoading = true;
        try {
          const decl = Object.entries(confMap || {})
            .filter(([, c]) => c && c.surface)
            .map(([repo, c]) => ({ repo, paths: (Array.isArray(c.surface) ? c.surface : [c.surface]).filter(p => typeof p === 'string' && p.trim()) }))
            .filter(d => d.paths.length);
          if (!decl.length){ this.repoSurfaces = []; return; }
          const acct = await this.accountRepos();
          const refByName = new Map(acct.map(r => [r.full_name, r.default_branch || 'main']));
          const out = [];
          await Promise.all(decl.map(async ({ repo, paths }) => {
            const ref = refByName.get(repo) || 'main';
            const g = new window.GH({ token: window.TOKEN, repo, ref });
            for (const path of paths){
              try {
                const raw = JSON.parse((await g.get(path)).text);
                const s = window.Surface.read(raw);
                if (!s) continue;
                out.push({
                  repo, ref, path,
                  uid: repo + ':' + path,
                  file: path.split('/').pop(),
                  blob: 'https://github.com/' + repo + '/blob/' + ref + '/' + path,
                  manifest: s.manifest,
                  items: s.items,
                  wasV1: s.wasV1,
                  raw,
                });
              } catch {}
            }
          }));
          out.sort((a, b) => a.repo.localeCompare(b.repo) || a.path.localeCompare(b.path));
          this.repoSurfaces = out;
        } catch { this.repoSurfaces = []; }
        finally { this.repoSurfLoading = false; }
      },

      // The stacked sections the Stage's shelf renders: General (the registry
      // surfaces) first when non-empty, then one section per repo that declared
      // a surface, in repo order. Each section carries a DOM anchor so a Repos
      // card can deep-link straight to it. SAVED SURFACES ONLY: the bench is
      // not a section and not a card, it is the fixed block above this list.
      get surfaceSections(){
        const secs = [];
        const general = this.surfaces.map(s => this.live(s));
        if (general.length)
          secs.push({ key: 'general', repo: null, anchor: 'surface-sec-general', surfaces: general });
        const by = new Map();
        for (const s of this.repoSurfaces.map(s => this.live(s))){
          if (!by.has(s.repo)) by.set(s.repo, []);
          by.get(s.repo).push(s);
        }
        for (const [repo, arr] of by)
          secs.push({ key: 'repo:' + repo, repo, anchor: 'surface-sec-' + repo.replace('/', '-'), surfaces: arr });
        return secs;
      },
      // Label the General section only when a repo section also shows, so the
      // common (registry-only) case stays header-free, as it was before.
      get showGeneralHeader(){ return this.repoSurfaces.length > 0; },
      // A Repos card's surface chip: switch to the Surfaces view and scroll to
      // this repo's section.
      openRepoSurfaces(repo){
        window.__shell?.goSurfaces?.();
        this.$nextTick(() => {
          document.getElementById('surface-sec-' + (repo || '').replace('/', '-'))
            ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        });
      },

      editSurface(s){
        if (!s) return;
        this.surfIsNew = false;
        this.surfName = s.file;
        this.surfDraft = JSON.stringify(s.raw || { manifest: s.manifest, items: s.items }, null, 2);
        this.$refs.surfDlg?.showModal();
      },
      newSurface(){
        this.surfIsNew = true;
        this.surfName = '';
        this.surfDraft = JSON.stringify(SURFACE_TEMPLATE, null, 2);
        this.$refs.surfDlg?.showModal();
      },
      get surfErr(){
        let v;
        try { v = JSON.parse(this.surfDraft); }
        catch (e) { return String(e.message || e).replace(/^JSON\.parse:\s*/, ''); }
        if (v === null || typeof v !== 'object' || Array.isArray(v)) return 'Top-level value must be an object';
        return '';
      },
      surfFormat(){
        if (!this.surfErr) this.surfDraft = JSON.stringify(JSON.parse(this.surfDraft), null, 2);
      },
      async surfSave(){
        if (this.surfErr || !this.hasToken()) return;
        let file = this.surfName.trim();
        if (this.surfIsNew){
          if (!file) return;
          if (!file.endsWith('.surface')) file += '.surface';
          if (/[\/\s]/.test(file.replace(/\.surface$/, ''))){
            Alpine.store('toast')?.('warning', 'Surface name can\'t contain slashes or spaces', 'alert-warning', 4000); return;
          }
        }
        const toast = Alpine.store('toast');
        this.surfSaving = true;
        try {
          const reg = this.regGH();
          if (typeof reg.save !== 'function' && window.gh?.load) await window.gh.load('gh-store.js');
          const obj = JSON.parse(this.surfDraft);
          await reg.save('surfaces/' + file, obj,
            (this.surfIsNew ? 'Add surface ' : 'Edit surface ') + file + ' via show-repo');
          if (toast) toast('check-circle', (this.surfIsNew ? 'Created ' : 'Saved ') + file, 'alert-success', 4000);
          this.$refs.surfDlg?.close();
          await this.reloadSurfaces();
          const idx = this.surfaces.findIndex(s => s.file === file);
          if (idx >= 0) this.surfActive = idx;
        } catch(e){
          if (toast) toast('warning', 'Save failed: ' + (e?.message || e), 'alert-error', 6000);
        } finally { this.surfSaving = false; }
      },

      // ── To-do ────────────────────────────────────────────────────────────
      // A flat list in one registry file,
      // {items:[{id,text,done,created_at,done_at?,urgent?,due?}]}. Not a
      // surface: no kind/curation, just text, done, and the two attention
      // fields, so it gets the plainest shape rather than reusing the surfaces
      // schema. 404 (no file yet) is a quiet empty list, matching
      // loadSurfaces' no-dir case.
      //
      // The optional keys are read where present and written only when set,
      // which is what lets the file be edited by hand or by an agent session
      // without this pane needing to know: the savers write the parsed items
      // straight back, so a key nothing here understands survives the round
      // trip. `urgent` worked that way before this pane could set it.
      async loadTodos(reg){
        this.todoLoading = true;
        this.todoErr = '';
        try {
          const raw = JSON.parse((await reg.get(TODO_PATH, FRESH())).text);
          this.todoItems = Array.isArray(raw.items) ? raw.items : [];
        } catch (e) {
          this.todoItems = [];
          if (e?.status && e.status !== 404) this.todoErr = 'Load failed: ' + (e.message || e);
        } finally { this.todoLoading = false; }
      },
      async reloadTodos(){
        if (!this.hasToken()) return;
        const reg = this.regGH();
        await this.loadTodos(reg);
      },
      // Does this need me now: flagged by hand, or its date has arrived. One
      // signal from two routes, since the rail answers one question.
      isHot(it){
        const s = DUE.state(it.due);
        return !!it.urgent || s === 'late' || s === 'today';
      },
      dueLabel(due){ return DUE.label(due); },
      dueClass(due){
        const s = DUE.state(due);
        return s === 'late' || s === 'today' ? 'badge-error'
             : s === 'soon' ? 'badge-warning' : 'badge-ghost';
      },
      // Three bands: needs me now, dated but not yet, undated. Within a band,
      // soonest first, and the original index breaks every remaining tie so the
      // file's own order (the order things were added) survives. Flagging one
      // item or dating it must not quietly reshuffle the rest around it.
      get todoOpen(){
        const key = it => { const n = DUE.days(it.due); return n === null ? Infinity : n; };
        const band = it => this.isHot(it) ? 0 : (it.due ? 1 : 2);
        return this.todoItems
          .filter(it => !it.done)
          .map((it, i) => ({ it, i }))
          .sort((a, b) => band(a.it) - band(b.it) || key(a.it) - key(b.it) || a.i - b.i)
          .map(x => x.it);
      },
      get todoHot(){ return this.todoOpen.filter(it => this.isHot(it)); },
      // Newest-done-first, so a just-checked item surfaces at the top of the pile.
      get todoDone(){
        return this.todoItems.filter(it => it.done)
          .sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
      },
      async addTodo(){
        const text = this.todoDraft.trim();
        if (!text || !this.hasToken()) return;
        this.todoDraft = '';
        this.todoItems.push({ id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                               text, done: false, created_at: new Date().toISOString() });
        await this.saveTodos('Add to-do via show-repo');
      },
      async toggleTodo(it){
        if (!this.hasToken()) return;
        it.done = !it.done;
        it.done_at = it.done ? new Date().toISOString() : null;
        await this.saveTodos((it.done ? 'Check off ' : 'Reopen ') + '"' + clip(it.text) + '" via show-repo');
      },
      // Urgent is a plain boolean, deleted rather than set false when cleared,
      // so an item that was never urgent and one that stopped being urgent read
      // the same in the file. The list's shape stays the smallest thing that
      // works, which is the whole reason it is not a surface: a priority scale
      // would ask to be groomed, and this is a list you check off.
      //
      // Nothing here expires it. A flag that has to be cleared by hand decays
      // into noise if a busy week flags everything, and the list itself is
      // already asking for the other answer: three of the open items name a
      // date or a trigger in their text. A `due` field would carry those
      // without a gesture, and would stop mattering on its own. It is a
      // separate change, and this one does not stand in its way.
      async toggleUrgent(it){
        if (!this.hasToken()) return;
        if (it.urgent) delete it.urgent; else it.urgent = true;
        await this.saveTodos((it.urgent ? 'Flag "' + clip(it.text) + '" urgent'
                                       : 'Clear urgent on "' + clip(it.text) + '"') + ' via show-repo');
      },
      // Same absent-when-unset shape as urgent. Anything that is not a bare
      // YYYY-MM-DD clears the date rather than being stored: the native picker
      // hands back '' when it is cleared, and a half-typed value from a
      // keyboard-entered date field should not land in the file.
      async setDue(it, value){
        if (!this.hasToken()) return;
        const v = /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '';
        if ((it.due || '') === v) return;   // the picker fires on open in some browsers
        if (v) it.due = v; else delete it.due;
        await this.saveTodos((v ? 'Set "' + clip(it.text) + '" due ' + v
                                : 'Clear due date on "' + clip(it.text) + '"') + ' via show-repo');
      },
      async deleteTodo(it){
        if (!this.hasToken()) return;
        this.todoItems = this.todoItems.filter(x => x.id !== it.id);
        await this.saveTodos('Delete to-do "' + clip(it.text) + '" via show-repo');
      },
      // Fire-and-forget write, matching the checkbox/delete gestures' pace: a
      // toast-only failure so a slow save never blocks the next click, and a
      // failed write leaves the local list stale until the next reload.
      async saveTodos(message){
        try {
          const reg = this.regGH();
          if (typeof reg.save !== 'function' && window.gh?.load) await window.gh.load('gh-store.js');
          await reg.save(TODO_PATH, { items: this.todoItems }, message);
        } catch (e) {
          Alpine.store('toast')?.('warning', 'To-do save failed: ' + (e?.message || e), 'alert-error', 6000);
        }
      },

      // ── Jots ───────────────────────────────────────────────────────────────
      // The capture sibling of the to-do methods above: same registry-file
      // mechanics (whole-file write per gesture, fire-and-forget with a toast
      // on failure), no done state. The add message carries the jot's text, so
      // lists/jots.json's commit history reads as a capture log on its own.
      // The registry is in agent-session scope, so a session can read the file
      // and run the promotion pass (jot -> entry / task / to-do) as a drain.
      async loadJots(reg){
        this.jotLoading = true;
        this.jotErr = '';
        try {
          const raw = JSON.parse((await reg.get(JOTS_PATH, FRESH())).text);
          this.jotItems = Array.isArray(raw.items) ? raw.items : [];
        } catch (e) {
          this.jotItems = [];
          if (e?.status && e.status !== 404) this.jotErr = 'Load failed: ' + (e.message || e);
        } finally { this.jotLoading = false; }
      },
      async reloadJots(){
        if (!this.hasToken()) return;
        const reg = this.regGH();
        await this.loadJots(reg);
      },
      // Newest first: the pile is a stack, and the freshest idea sits on top.
      get jotPile(){
        return [...this.jotItems].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      },
      async addJot(){
        const text = this.jotDraft.trim();
        if (!text || !this.hasToken()) return;
        this.jotDraft = '';
        await this.mutateJots(items => [...items, {
          id: 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          text, created_at: new Date().toISOString() }],
          'Jot "' + clip(text) + '" via show-repo');
      },
      async deleteJot(it){
        if (!this.hasToken()) return;
        await this.mutateJots(items => items.filter(x => x.id !== it.id),
          'Delete jot "' + clip(it.text) + '" via show-repo');
      },
      // Every write goes through a FRESH READ of the file, then the mutation,
      // then the save. Saving this.jotItems directly was a lost update waiting
      // to happen, and it happened: the pane's copy loads when the view opens,
      // so a jot written by anything else in between (the sidebar finder, a
      // second tab) was silently overwritten by the next add here. Only a
      // missing file (404) falls back to empty; any other read failure aborts
      // the write rather than clobbering what it could not see.
      //
      // The read was not in fact fresh until 2026-08-13: it went through the
      // browser's HTTP cache, which GitHub tells to hold an API read for a
      // minute, so two jots inside one minute read the same pre-first-jot copy
      // and the second add dropped the first. The guard was written, tested,
      // and defeated by a default on fetch. It carries FRESH now.
      async mutateJots(mutate, message){
        try {
          const reg = this.regGH();
          if (typeof reg.save !== 'function' && window.gh?.load) await window.gh.load('gh-store.js');
          let items = [];
          try {
            const raw = JSON.parse((await reg.get(JOTS_PATH, FRESH())).text);
            items = Array.isArray(raw.items) ? raw.items : [];
          } catch (e) { if (e?.status && e.status !== 404) throw e; }
          items = mutate(items);
          await reg.save(JOTS_PATH, { items }, message);
          this.jotItems = items;
        } catch (e) {
          Alpine.store('toast')?.('warning', 'Jot save failed: ' + (e?.message || e), 'alert-error', 6000);
        }
      },

      // ── Pins ───────────────────────────────────────────────────────────────
      // The estate Pin list: personal memory as internal links, same
      // registry-file mechanics as the two lists above. The item is richer
      // ({id, target, title, note?, group?, created_at}) because a pin points
      // rather than says; target speaks the estate's one addressing grammar
      // (owner/repo[@ref]:path, lib/kits/repo-address.js). The name is shared with
      // the per-repo `pins` manifest field on purpose: both mean keep-at-hand,
      // that one a repo describing its own entry points, this one the person
      // across the estate. The exit asymmetry is the contract: deleting a jot
      // is the jot's exit, while unpinning removes only the pointer and the
      // target stays where it lives. note and group have no form fields yet;
      // they are honored when present (edit lists/pins.json, or let an agent
      // session enrich the file).
      async loadPins(reg){
        this.pinLoading = true;
        this.pinErr = '';
        try {
          const raw = JSON.parse((await reg.get(PINS_PATH, FRESH())).text);
          this.pinItems = Array.isArray(raw.items) ? raw.items : [];
        } catch (e) {
          this.pinItems = [];
          if (e?.status && e.status !== 404) this.pinErr = 'Load failed: ' + (e.message || e);
        } finally { this.pinLoading = false; }
      },
      async reloadPins(){
        if (!this.hasToken()) return;
        const reg = this.regGH();
        await this.loadPins(reg);
      },
      // Stored order is the sort, like the links board: groups appear in the
      // order their first pin does, items in authored order within one. An
      // ungrouped pin files under its repo's short name, so the fallback
      // grouping still says something.
      get pinGroups(){
        const groups = [], at = {};
        for (const it of this.pinItems){
          const addr = window.RepoAddress?.parse?.(it.target);
          const label = it.group || (addr ? addr.repo.split('/').pop() : 'pins');
          if (!(label in at)){ at[label] = groups.length; groups.push({ label, items: [] }); }
          groups[at[label]].items.push(it);
        }
        return groups;
      },
      async addPin(){
        const spec = this.pinDraft.trim();
        if (!spec || !this.hasToken()) return;
        const addr = window.RepoAddress?.parse?.(spec);
        // A rejected draft stays in the input: the fix is usually one
        // character, and clearing it would charge the typo twice.
        if (!addr){ this.pinErr = 'Not an address (owner/repo[@ref]:path)'; return; }
        this.pinErr = '';
        const title = this.pinTitle.trim() || addr.path.replace(/\/+$/, '').split('/').pop();
        this.pinDraft = ''; this.pinTitle = '';
        this.pinItems.push({ id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                             target: spec, title, created_at: new Date().toISOString() });
        await this.savePins('Pin "' + clip(title) + '" via show-repo');
      },
      async deletePin(it){
        if (!this.hasToken()) return;
        this.pinItems = this.pinItems.filter(x => x.id !== it.id);
        await this.savePins('Unpin "' + clip(it.title || it.target) + '" via show-repo');
      },
      async savePins(message){
        try {
          const reg = this.regGH();
          if (typeof reg.save !== 'function' && window.gh?.load) await window.gh.load('gh-store.js');
          await reg.save(PINS_PATH, { items: this.pinItems }, message);
        } catch (e) {
          Alpine.store('toast')?.('warning', 'Pin save failed: ' + (e?.message || e), 'alert-error', 6000);
        }
      },
      // ── The pin picker: the tap route into the add form ──────────────────
      // The shared path-picker (the fab's), mounted lazily on first toggle
      // (see the template note). Picking a file fills pinDraft with the
      // formatted address and closes the panel; the + commit stays the one
      // add path, so paste and pick converge and a title can ride either.
      _pinPicker(){
        const host = this.$refs && this.$refs.pinPicker;
        const el = host && host.firstElementChild;
        return (el && el.__pathPicker) || null;
      },
      get pinPickerOpen(){ const p = this._pinPicker(); return !!(p && p.open); },
      togglePinPicker(){
        if (!this.pinPickerWanted){
          this.pinPickerWanted = true;
          this.$nextTick(() => this._pinPicker()?.toggle?.());
          return;
        }
        this._pinPicker()?.toggle?.();
      },
      // The picker reads through a GH with the viewer's token; repo/ref here
      // are only the instance's defaults, since every root names its own.
      pinPickerGh(){
        if (!window.GH) return null;
        return new window.GH({ token: window.TOKEN, repo: this.defaultRepo(), ref: '' });
      },
      // Estate members first (the cards this view already loaded), then every
      // other repo the token can see: a pin usually names the estate, but is
      // not fenced to it. Owner prefix dropped where it matches the registry's,
      // as in the fab's roots. Resolved lazily at first open, which is the
      // shape path-picker is built for.
      async pinPickerRoots(){
        const owner = this.registry().split('/')[0] + '/';
        const short = n => (n.startsWith(owner) ? n.slice(owner.length) : n);
        const members = this.entries.map(e => e.repo).filter(Boolean);
        const roots = members.map(n => ({ repo: n, ref: '', label: short(n) }));
        const gh = this.pinPickerGh();
        if (gh && typeof gh.repos === 'function'){
          try {
            const list = await gh.repos('', { quiet: true });
            for (const r of (list || [])){
              const n = r.full_name;
              if (n && !members.includes(n)) roots.push({ repo: n, ref: '', label: short(n) });
            }
          } catch {}
        }
        return roots;
      },
      pinPicked(d){
        if (!d || !d.repo || !d.path) return;
        const addr = { repo: d.repo, ref: d.ref || '', path: d.path };
        this.pinDraft = window.RepoAddress?.fmt?.(addr) ||
          (addr.repo + (addr.ref ? '@' + addr.ref : '') + ':' + addr.path);
        this.pinErr = '';
        // File mode stays open for the next grab by design; a pin add is one
        // grab, so close it and hand the eye back to the filled draft.
        const p = this._pinPicker();
        if (p) p.open = false;
      },

      // Open a pin where the sidebar's per-repo Pinned block opens: in the
      // browser, a last segment with an extension as a file, otherwise the
      // Files view at that folder. The same routing a surface item gets
      // (openItem below); a pin is the personal cousin of both.
      async openPin(it){
        const addr = window.RepoAddress?.parse?.(it.target);
        if (!addr || !window.__shell) return;
        await window.__shell.ensureBrowser(addr.repo, addr.ref || '');
        const last = addr.path.replace(/\/+$/, '').split('/').pop();
        if (/\.[A-Za-z0-9]+$/.test(last)) await window.__shell.openFile(addr.path);
        else await window.__shell.openFolder(addr.path);
      },

      // ── Scope and adoption, per card ──────────────────────────────────────
      // Moved off the Map's own tab: the grading is about a repo, and the card
      // is where a repo is described. Map keeps the SET and the TRANSPORT, the
      // two things that belong to no single repo.
      //
      // Three live reads per repo (.claude/settings.json, CLAUDE.md,
      // .web-tools.json), graded by lib/kits/portable-align.js, which is pure and
      // tested. Probed once per estate load and only for cards on screen, so
      // this stays the cost it was when one tab carried it rather than
      // multiplying by however many repos the dashboard shows.
      adopt(e){ return this.adoptRows[this.face(e).repo] || null; },
      verdictCls(r){ return (ADOPT_VERDICT[r?.verdict] || { cls: 'badge-ghost' }).cls; },

      // The four checks in the order they happen to a repo: it subscribes, it
      // enables plugins, it wires the conventions into CLAUDE.md, it declares a
      // config. A failing chip is the next step, which is why they stay visible
      // rather than collapsing to a score.
      adoptChips(e){
        const r = this.adopt(e);
        if (!r || r.role) return [];
        return [
          { label: 'marketplace', on: !!r.marketplace },
          { label: 'plugins', on: !!(r.plugins || []).length,
            title: (r.plugins || []).join(', ') },
          { label: 'conventions', on: !!r.conventionsWired,
            title: r.hasClaudeMd && !r.conventionsWired ? 'CLAUDE.md present, conventions not wired in' : '' },
          { label: 'config', on: !!r.hasConfig },
        ];
      },

      // A repo's `scope` is either inline prose or a pointer to a markdown file
      // in that repo. The repo owns the story either way; this only shows it.
      scopeIsFile(s){ return typeof s === 'string' && /^[\w./-]+\.md$/.test(s.trim()); },
      scopeOf(e){ const r = this.adopt(e); return r ? (r.scope || '') : ''; },
      scopeText(r){ return (r?.scope && !this.scopeIsFile(r.scope)) ? r.scope : ''; },
      scopeFile(r){ return this.scopeIsFile(r?.scope) ? r.scope.trim() : ''; },
      scopeFileGh(r){ return 'https://github.com/' + r.repo + '/blob/HEAD/' + this.scopeFile(r); },

      // The grade is read, never probed. It rides the config cache the estate
      // already loads (lib/kits/repo-config-cache.js, state/configs.json), computed
      // by the crawl that is standing in front of each repo anyway. This card
      // used to fan out three live reads per member on every estate load, which
      // is the cost that comes with moving a Map tab onto a dashboard: a tab is
      // opened sometimes, a dashboard is the front door.
      //
      // So a grade is as fresh as the last crawl, not as fresh as this render,
      // and that is the right trade: adoption changes when someone edits a
      // settings file, on the order of weeks, and the crawl runs on its own
      // throttle. The State view's config row re-crawls when the answer matters
      // now.
      readAdoption(cache){
        const rows = {};
        for (const [repo, e] of Object.entries(cache?.repos || {}))
          if (e && e.align) rows[repo] = e.align;
        this.adoptRows = rows;
      },

      // Route through openPinned so the landing flip is explicit: ensureBrowser
      // alone leaves the view untouched when the card's repo is already open
      // (always true for the default repo tapped from the estate).
      async openRepo(repo){ await window.__shell?.openPinned(repo); },

      // ── Surface items ──────────────────────────────────────────────────────
      // Every question below is asked of lib/kits/surface.js, which is the only
      // place that knows a v1 item from a v2 one. These read v2 exclusively.
      kindIcon(it){ return TYPE_ICONS[it.type] || 'ph-shapes'; },
      bodyOf(it){ return (it.type === 'note' || it.type === 'story') ? (it.content || '') : ''; },

      // A kind:embed item renders a renderer page live through a toss-render
      // route (#<route>=<addr>): the item names the renderer (page, the route
      // key, default chat-results) and the envelope's location ({repo, ref,
      // path}); estate composes the one address and toss-render stays the
      // schema-blind router. A chat/trawl results envelope is the first use;
      // any other TOSS_ROUTES renderer embeds by naming its page, no code here.
      isEmbed(it){ return it.type === 'embed'; },
      embedPage(it){ return it.page || 'chat-results'; },
      embedUrl(it){
        const r = window.Surface.ref(it);
        if (!r || !r.path) return '';
        return '../toss-render.html#' + this.embedPage(it) + '=' + window.Surface.key(it);
      },
      embedKey(s, it){ return (s.uid || s.file) + '/' + (it.id || it.title || ''); },
      isEmbedOpen(s, it){ return !!this.embedOpen[this.embedKey(s, it)]; },
      toggleEmbed(s, it){ const k = this.embedKey(s, it); this.embedOpen[k] = !this.embedOpen[k]; },

      // An openable item is one with a file or folder behind it. An embed has a
      // repository source too, but it opens as a render, not as a file, so it
      // is excluded here and served by itemExt.
      itemRef(it){
        const r = window.Surface.ref(it);
        return (r && r.path && !this.isEmbed(it)) ? r : null;
      },
      openable(it){ return !!this.itemRef(it); },
      itemPath(it){ return this.itemRef(it)?.path || ''; },
      itemPill(it){
        const r = window.Surface.ref(it);
        if (r) return r.repo;
        const u = window.Surface.uri(it);
        if (u) { try { return new URL(u).hostname; } catch {} }
        return '';
      },
      // Serves the embed too: its jump-over points at the envelope blob it
      // renders, which is exactly the file its source names.
      itemGh(it){ return window.Surface.gh(it); },
      // The source peek for an item whose jump-over names an exact file
      // (lib/kits/source-peek.js). A `github_dir` item points at a tree, so it gets
      // none: the peek is what tells a file link apart from a broader one.
      itemPeek(it){
        const r = window.Surface.ref(it);
        if (r && r.path && !r.dir) return window.SourcePeek?.addr(r.repo, r.ref || 'main', r.path) || null;
        return null;
      },
      // An embed's title opens the same render full screen (the routed
      // toss-render URL); a link item opens its external URI, as before.
      itemExt(it){
        if (this.isEmbed(it)) return this.embedUrl(it);
        return window.Surface.uri(it);
      },
      async openItem(it){
        const r = this.itemRef(it);
        if (!r || !window.__shell) return;
        await window.__shell.ensureBrowser(r.repo, r.ref || '');
        if (r.dir) await window.__shell.openFolder(r.path);
        else await window.__shell.openFile(r.path);
      },
    };
  });
});
