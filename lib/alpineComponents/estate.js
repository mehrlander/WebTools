document.addEventListener('alpine:init', function() {

  // Which reply card the transcript host currently holds. Deliberately outside
  // the Alpine component: see mountReplyCard.
  let replyMounted = null;

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
    //   Stage     — the bench, mounted here and owned by stage.js. It had a
    //               second sub-view, Saved, listing the registry's curated
    //               surfaces/*.surface files and loading one onto the bench;
    //               removed 2026-08-27, because a surface is not a saved
    //               stage. The format kept its reader (lib/kits/surface.js)
    //               and its contract (docs/envelopes/surface.md).
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
    // Public (no token): the public default card only, no lists.
    // See docs/show-repo.md "The estate".
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
    // Activity's sub-views, each its own shell view key so a ?view= deep link
    // opens the pane it names. Named once because four places read the set (the
    // pill row's x-show, the two composite wrappers, and the `tab` getter), and
    // when there were three the list was written out four times and a fourth
    // pane meant finding all four.
    // State joined on 2026-08-23. It was a nav stop of its own, one row up
    // beside Repos and Stage, which put the estate's own motion in two places:
    // Activity said what the estate DID, State said whether the caches that
    // know it are current, and a reader chasing "is this actually up to date"
    // had to leave the view asking the question to find the answer. They are
    // two readings of one subject, which is what this pill row is for.
    const ACTIVITY_TABS = ['activity', 'sessions', 'chats', 'routes', 'state'];
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

    // ── A jot's kind ──────────────────────────────────────────────────────
    // Open, not enumerated, and the estate has already answered this question
    // twice in opposite directions. links/board.json's `kind` is a closed set
    // of four because the RENDERER switches on it, so the code has to exhaust
    // the cases. lists/pins.json's `group` is free text because it only groups,
    // and pinGroups derives the set from the items themselves. A jot's kind is
    // the second sort: every jot renders the same way, and the only thing that
    // acts on the kind is the drain, which reads the text anyway. So nothing
    // declares the set; it grows from use and a kind nobody uses again leaves
    // with its last jot.
    //
    // The one discipline an open vocabulary does need is a normal form, or
    // `Snag`, `snag ` and `Doc Failure` become three kinds and the derived chip
    // row stops converging on anything.
    const KIND = (s) => String(s || '').trim().toLowerCase()
      .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 24);
    // The kinds offered before any jot carries one. Exactly one, because a kind
    // earns its chip by naming a DESTINATION the text cannot imply, and `snag`
    // names docs/SNAGS.md in the repo the trip belongs to. A topic ("ui",
    // "budget") is already in the text and grep finds it. Every jot in the pile
    // when this shipped was the same thing, an idea for this app, which is the
    // pile's default and so needs no name at all.
    const JOT_KIND_SEED = ['snag'];

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

    // ── One branch, stated in full ──────────────────────────────────────────
    // The body of a branch row, shared by the two places that draw one: the
    // Branches pane, where it is the list, and the Sessions pane, where it
    // nests under the session that made it. One definition, because a second
    // copy would have drifted the moment either gained a control, and because
    // what a reader wants to know about a branch does not change with where
    // the branch is being read.
    //
    // Everything here reads `row` from the surrounding scope, so a caller
    // supplies its own wrapper and binds `row` however it likes: the Branches
    // pane through its x-for, the Sessions pane through an x-data alias on
    // each nested branch.
    //
    // `nested` makes three changes and no more:
    //   the subject rides the identity row instead of taking a line, so one
    //     branch is one row at desktop width and wraps at phone width;
    //   the Claude session mark goes, since the row already sits under the
    //     session it would name;
    //   nothing else, on purpose. The GitHub menu, the files card, the Stage
    //     control, the route chips, the landed verdict and the ahead/behind
    //     pair are the same controls with the same hover cards, because a
    //     branch read here is the same branch.
    const branchRowBody = (opts = {}) => `
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
                    <!-- The deck swipes through the list this row was opened
                         FROM: the branch list in the Branches pane, and this
                         session's own branches in the Sessions tree, which is
                         what a reader who opened one of them means by "next".
                         The siblings binding exists only in the nested
                         wrapper, so
                         the typeof guard is what keeps one markup body honest
                         in two scopes. -->
                    <!-- On a phone, the SLUG; at sm and up, the whole name.
                         The same call deckChrome makes for the deck header one
                         level up, and for the same reason: every branch here is
                         claude/<slug>, the prefix is seven mono characters that
                         say nothing, and a row at 430px has room for one of the
                         two. Measured after the cluster to the right of this
                         landed: the name was showing four characters of slug,
                         and the prefix is what it was spending the rest on.
                         A hand-named branch has no prefix to drop and shows
                         whole; the full name is in the title either way. -->
                    <button @click="openBranchDetail(row, typeof siblings === 'undefined' ? null : siblings)"
                            class="font-mono text-base font-semibold truncate hover:text-primary transition-colors text-left min-w-0"
                            :title="'Open ' + row.name + ' here; swipe or arrow through the list'">
                      <span class="sm:hidden" x-text="branchShort(row.name)"></span>
                      <span class="hidden sm:inline" x-text="row.name"></span>
                    </button>
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
                          class="font-mono text-base text-base-content/20 shrink-0">PR&nbsp;?</span>
                    <div class="grow"></div>
                    <!-- The row's LIFESPAN, not just its last touch: how long
                         ago the branch's first commit landed, then its latest,
                         as "5d → 2h". One element, so the row gains a fact and
                         not a line; the start is dropped when it rounds to the
                         same label as the tip (a same-day branch) or is not
                         knowable (see branchStart). -->
                    ${opts.nested ? '' : `
                    <span x-show="row.date" class="flex items-center gap-1 text-base shrink-0 tabular-nums"
                          :title="branchSpanTitle(row)">
                      <template x-if="branchStart(row)">
                        <span class="flex items-center gap-1 text-base-content/30">
                          <span x-text="branchStart(row)"></span>
                          <i class="ph ph-arrow-right text-xs opacity-70"></i>
                        </span>
                      </template>
                      <span class="text-base-content/50" x-text="agoShort(row.date)"></span>
                    </span>
                    `}
                    <!-- ── The row's trailing cluster ─────────────────────────
                         Two controls, and the pair is the whole navigation
                         model this row answers to (2026-08-27): the NAME takes
                         you ACROSS, one branch to the next through the list you
                         tapped in from, and the CARDS button takes you IN, to
                         this branch's files one at a time.

                         The session row carries the same cluster in the same
                         place, and that is the point. The two panes used to
                         implement opposite halves of one model: a branch had
                         the peer swipe and no direct route to its files, a
                         session had the route to its turns and no peer swipe
                         and no in-app brief at all. Neither row could be read
                         by someone who had learned the other.

                         Cards is PRIMARY and the exits are not, the one rule
                         branch-brief's tab row already states: one control here
                         wears a colour, and it is the one most readers came to
                         use. ph-cards-three is the house glyph for "read
                         these one at a time" on every surface that has one,
                         which is why a second glyph beside ph-files is not
                         the second files icon the density pass rejected: that
                         one would have been a second COUNT. This is a reader.

                         The ⧉ is a gap being closed rather than a control being
                         moved. A branch row has never linked pages/branch.html,
                         so the estate's canonical single-branch address, the one
                         thing here that survives being sent to somebody, was
                         reachable from this list only by opening the takeover
                         and copying a link out of its header. -->
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
                    ${opts.nested ? `
                    <!-- NESTED: the lifespan sits on the control line rather
                         than at the end of the identity row. Inside a tile the
                         identity row is ~120px narrower, and the branch NAME is
                         what was paying for it: at phone width it compressed to
                         a letter and an ellipsis while the dates stayed whole.
                         The name is the thing being identified, so it gets the
                         width and the dates move to the line with room. -->
                    <span x-show="row.date" class="flex items-center gap-1 shrink-0 tabular-nums"
                          :title="branchSpanTitle(row)">
                      <template x-if="branchStart(row)">
                        <span class="flex items-center gap-1 text-base-content/30">
                          <span x-text="branchStart(row)"></span>
                          <i class="ph ph-arrow-right text-xs opacity-70"></i>
                        </span>
                      </template>
                      <span class="text-base-content/50" x-text="agoShort(row.date)"></span>
                    </span>
                    ` : ''}
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
${opts.nested ? '' : `
                    <span class="w-6 shrink-0 flex justify-center">
                    <a x-show="row.session" :href="row.session" target="_blank"
                       :title="(row.sessions?.length > 1
                                 ? 'Worked across ' + row.sessions.length + ' sessions; opens the newest'
                                 : 'Open the Claude session that authored this branch')
                               + (row.sessionsExact ? '' : ' (approximate: read from the branch tip)')"
                       class="flex items-center gap-0.5 hover:opacity-75 transition-opacity">
                      <span class="flex shrink-0" x-html="window.claudeMark.svg()"></span><span
                        x-show="row.sessions?.length > 1" x-text="row.sessions?.length"
                        class="font-mono text-xs leading-none"
                        :style="'color:' + window.claudeMark.CLAY"></span></a>
                    </span>
                    `}
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
                        <!-- An anchor either way. With a ref it is a real link
                             to the view running this branch's bundle; without
                             one (no tip crawled) it keeps the in-shell hop it
                             always had, which is main, and says so in the
                             title. Binding href to url-or-null drops the
                             attribute rather than emitting an empty one, and
                             the click expression short-circuits so a real href
                             navigates normally. -->
                        <template x-for="rt in branchRoutes(row).on" :key="rt.key">
                          <a :href="rt.url || null" target="_blank" rel="noopener"
                             @click.stop="rt.url || openRoute(rt)"
                             :title="rt.label + (rt.url ? ', on this branch: ' : ', on main (no tip crawled): ')
                                     + rt.hits.join(', ')"
                             class="shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-sm font-medium
                                    bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                             x-text="rt.label"></a>
                        </template>
                        <template x-for="rt in branchRoutes(row).near" :key="rt.key">
                          <a :href="rt.url || null" target="_blank" rel="noopener"
                             @click.stop="rt.url || openRoute(rt)"
                             :title="rt.label + ' — touches only ' + rt.hits.join(', ')
                                     + ', which several routes share'"
                             class="shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-sm
                                    bg-base-200/70 text-base-content/40 hover:text-base-content transition-colors"
                             x-text="rt.label"></a>
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
                    <!-- ── The row's actions, at the end of the line ──────────
                         Both used to ride the identity row, right-aligned past
                         the lifespan. They read fine there and cost the one
                         thing that row cannot spare: the NAME, which both
                         identifies the row and opens its brief.

                         Down here they sit among the other icon buttons, where
                         a reader already looks for something to press, and the
                         identity row goes back to being identity. The session
                         row moved its own three the same way in the same
                         commit, which is the whole point: one rule, both rows.
                         Measured at 430px, where the session title had been
                         truncating to show-rep… to pay for its cluster.

                         LAST on the line, after the counts, the Stage and the
                         route chips: facts first, then what acts, the same rule
                         the session row follows. Leading was tried first and
                         rendered; it works and puts the press before the facts,
                         which is not how either row is read. -->
                    <!-- ONE SPAN, so the three travel together. Loose in the
                         wrapping flex they are three items, and at 430px the line
                         broke between them: cards ended one row and the other two
                         started the next, left-aligned under the counts. A cluster
                         that splits is not a cluster. -->
                    <span class="flex items-center gap-2 shrink-0">
                      <button @click.stop="openBranchFileDeck(row)"
                              :title="'Read the files this branch changed, one at a time'"
                              class="text-primary/70 hover:text-primary transition-colors">
                        <i class="ph text-xl" :class="deckOpeningFor === row.repo + '/' + row.name
                                                        ? 'ph-circle-notch animate-spin' : 'ph-cards-three'"></i></button>
                      <a :href="branchPageFor(row.repo, row.name)" target="_blank" rel="noopener" @click.stop
                         title="Open this branch's own page. The durable address for it, readable by anyone with a token."
                         class="text-base-content/30 hover:text-primary transition-colors">
                        <i class="ph ph-arrow-square-out text-lg"></i></a>
                    </span>
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
                              class="flex items-center gap-0.5 text-base-content/70 hover:text-primary transition-colors">
                        <i class="ph ph-arrow-down text-lg"></i><span x-text="row.behind ?? '–'"></span></button>
                    </span>
                  </div>`;

    return {
      description: 'All-repo estate: a full-width grouped grid of opted-in repo cards (membership + fields in each repo\'s own config), the Stage\'s bench, a personal to-do list, a jots pile for quick idea capture, and a pin list of internal links kept at hand',

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
                  <button @click="addRepo()" :disabled="!!(!addName.trim() || adding)"
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
                              <span class="badge badge-sm" :class="c.on ? 'badge-outline' : 'badge-ghost text-base-content/30'"
                                    :title="c.title || ''">
                                <i class="ph text-xs" :class="c.on ? 'ph-check' : 'ph-x'"></i><span x-text="c.label"></span></span>
                            </template>
                            <!-- The repo's OWN skills, which the plugin's set
                                 never includes: a pulled skill lives in the
                                 plugin cache, so a committed .claude/skills/
                                 holds exactly what the hub did not ship. Read
                                 from the manifest the crawl already fetches,
                                 so the chip costs no request. A fork reads as
                                 a warning and a local skill does not, the same
                                 posture optout gets on the verdict beside it:
                                 a stated position is not a defect. -->
                            <button x-show="skillsOf(e).length" @click.stop="skillsOpen = skillsOpen === face(e).repo ? '' : face(e).repo"
                                    class="badge badge-sm gap-1 cursor-pointer transition-colors"
                                    :class="skillsForked(e).length ? 'badge-warning' : 'badge-outline hover:bg-primary/10 hover:text-primary'"
                                    :title="skillsTitle(e)">
                              <i class="ph ph-sparkle text-xs"></i><span x-text="skillsOf(e).length"></span>
                            </button>
                            <button x-show="scopeOf(e)" @click.stop="scopeOpen = scopeOpen === face(e).repo ? '' : face(e).repo"
                                    class="badge badge-sm badge-ghost gap-1 cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
                                    :title="scopeOpen === face(e).repo ? 'Hide scope' : 'What this repo is for'">
                              <i class="ph text-base" :class="scopeOpen === face(e).repo ? 'ph-caret-up' : 'ph-book-open'"></i>scope
                            </button>
                          </div>
                          <!-- Expand to see: the scope statement is a paragraph
                               a repo wrote about itself, which is worth reading
                               once and not worth carrying on every card. -->
                          <template x-if="skillsOpen === face(e).repo">
                            <div class="flex flex-wrap items-center gap-1 border-l-2 border-base-300 pl-2">
                              <template x-for="s in skillsOf(e)" :key="s.name">
                                <a :href="'https://github.com/' + face(e).repo + '/blob/main/.claude/skills/' + s.name + '/SKILL.md'"
                                   target="_blank" rel="noopener"
                                   class="badge badge-sm font-mono hover:badge-primary transition-colors"
                                   :class="s.origin === 'forked' ? 'badge-warning' : 'badge-ghost'"
                                   :title="s.origin === 'forked'
                                     ? 'A copy of a hub skill. The plugin ships this one, so the copy is drift: it fires instead of the current version and ages against it.'
                                     : 'Grown in this repo. Its subject is local, so the hub does not ship it and should not.'"
                                   x-text="s.name"></a>
                              </template>
                            </div>
                          </template>
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

            <p x-show="authed && !loading && !groupSections.length && !hiddenEntries.length" class="text-base text-base-content/50">
              No repos opt in yet.
            </p>

            <!-- ── Hidden ────────────────────────────────────────────────────
                 The estate members kept off the dashboard, folded away. Rows
                 rather than cards, and folded rather than muted, because the
                 whole request was not to see them; what the section owes is a
                 way back, which is the Show button on each row. Only the
                 count is visible until it is opened, so the section costs one
                 line whether it holds one repo or ten. -->
            <template x-if="authed && !loading && hiddenEntries.length">
              <section class="mb-5">
                <h2 class="mb-2">
                  <button @click="hiddenOpen = !hiddenOpen"
                          class="text-base font-mono uppercase tracking-widest text-base-content/40 flex items-center gap-2 hover:text-primary transition-colors cursor-pointer">
                    <i class="ph ph-eye-closed"></i>
                    <span>Hidden</span>
                    <span class="badge badge-ghost badge-sm" x-text="hiddenEntries.length"></span>
                    <i class="ph text-base leading-none"
                       :class="hiddenOpen ? 'ph-caret-down' : 'ph-caret-right'"></i>
                  </button>
                </h2>
                <div x-show="hiddenOpen" class="flex flex-col gap-1.5">
                  <template x-for="e in hiddenEntries" :key="e.repo">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-base-300 bg-base-100 px-3 py-2">
                      <i class="ph text-base leading-none shrink-0 text-base-content/40" :class="e.icon"></i>
                      <button @click="openRepo(e.repo)" x-text="e.repo.split('/')[1]"
                              class="font-mono text-base font-semibold hover:text-primary transition-colors cursor-pointer shrink-0"></button>
                      <span class="text-base text-base-content/50 truncate grow min-w-0" x-text="e.note"></span>
                      <button @click="showHidden(e.repo)" class="btn btn-ghost btn-sm gap-1 shrink-0"
                              :title="'Put ' + e.repo + ' back on the sidebar and this grid'">
                        <i class="ph ph-eye"></i>Show</button>
                    </div>
                  </template>
                </div>
              </section>
            </template>

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
                               deleting is that it stays readable. -->
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

          <!-- ── Stage view ─────────────────────────────────────────────
               The bench, and nothing else. It had a second sub-view, Saved,
               which listed the registry's .surface files and could load one
               back onto the bench. That went on 2026-08-27 with the bench's
               own Save-as-surface, because a surface is not a saved stage: the
               envelope carries several profiles and the one page that reads a
               surface today is pages/branch.html, through branch-review/1.
               docs/envelopes/surface.md holds the format.

               Mounted on first visit and then kept: x-if rather than a bare
               x-data so the stager does not boot, and rebuild a seeded bundle,
               while the Repos grid is what is showing. Same lazy-mount idiom
               as the estate. -->
          <div x-show="tab==='stage'">
            <template x-if="stageSeen">
              <div x-data="stager()"></div>
            </template>
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
              <button role="tab" @click="goSub('sessions')"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                      :class="tab === 'sessions' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                <i class="ph ph-terminal-window text-lg"></i>Sessions</button>
              <!-- Branches, a pill again since 2026-08-23, and second rather
                   than first. It was demoted to a LENS of Sessions on
                   2026-08-19 on the reading that the pane already nests each
                   session's branches, so the flat list was one tap deeper and
                   nothing was lost. What that missed is that the two panes
                   answer different questions and only one of them is about
                   sessions: the branch scopes (Open, Stranded, Landed,
                   Abandoned) are a cleanup pass over the estate's branches,
                   and a lens inside a session list is the wrong place to run
                   it. Second, not first, because the session is the act and
                   reads as the entry point; the branch is what the act left
                   behind. ?view=activity is its own address again rather than
                   an alias, which is the address it always had. -->
              <button role="tab" @click="goSub('activity')"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                      :class="tab === 'activity' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                <i class="ph ph-git-branch text-lg"></i>Branches</button>
              <!-- State: the caches behind every other pill in this row. It sits
                   here rather than one nav row up because the question it
                   answers ("is what I am looking at current, and when did the
                   estate last move") is asked OF these panes, and a reader had
                   to leave the pane asking it to find the answer. Last in the
                   row on purpose: it is the pane you consult about the others,
                   so it reads after them. -->
              <button role="tab" @click="goSub('state')"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                      :class="tab === 'state' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                <i class="ph ph-stack-simple text-lg"></i>State</button>
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
                   than git. Branches, Sessions and Chats all answer
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
            <!-- The AGE PILLS used to sit here, at the end of the pane tabs,
                 where each was a line of its own on a phone reading "as of 1d"
                 above the list it described. They ride their pane's scope chips
                 now, at the end of the row that already asks how far back to
                 look: the age of the reading and the reach of it are one
                 question, and they were being answered a wrapped line apart. -->
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
          <div class="flex-1 min-w-0" :class="tab==='sessions' ? '' : 'hidden'"
               x-effect="tab === 'sessions' && authed && loadRouteJoin().catch(() => {})">
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
                    { key: 'list',     label: 'List',     icon: 'ph-list-bullets', note: 'Sessions, with the branches each left behind nested under it' },
                    { key: 'stars',    label: 'Stars',    icon: 'ph-asterisk', note: 'One hub per session, one satellite per repo-branch' },
                    { key: 'repos',    label: 'Repos',    icon: 'ph-graph', note: 'Which repos get worked together, edge weight in sessions' },
                    { key: 'counts',   label: 'Counts',   icon: 'ph-chart-bar-horizontal', note: 'Branches per session, and sessions per branch' },
                  ]" :key="l.key">
                  <button role="tab" @click="sessionLens = l.key" :title="l.note"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                          :class="sessionLens === l.key ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                    <i class="ph text-lg" :class="l.icon"></i><span x-text="l.label"></span></button>
                </template>
              </div>
            </div>

            <!-- ── Scope chips ───────────────────────────────────────────────
                 A fixed row, like the branch scopes: an empty scope is still an
                 answer. Each count is off the FULL list, so the row doubles as
                 the whole list, and the tooltip carries the definition. -->
            <div x-show="authed" class="flex items-center gap-2 mb-2">
              <div x-show="sessionLens === 'list' && !sessionsLoading"
                   class="flex items-center gap-1.5 min-w-0 -mx-1 px-1 pb-0.5 overflow-x-auto">
                <template x-for="s in sessionScopes" :key="s.key">
                  <button @click="sessionScope = s.key" :title="s.note"
                          class="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors"
                          :class="sessionScope === s.key ? 'bg-primary/10 text-primary' : 'bg-base-200/60 text-base-content/60 hover:text-base-content'">
                    <i class="ph text-base" :class="s.icon"></i>
                    <span x-text="s.label"></span>
                    <span class="font-mono opacity-60" x-text="s.count"></span></button>
                </template>
              </div>
              <!-- The cache's age, at the end of the reach row. It is outside
                   the scrolling chip strip and outside the lens gate, so it
                   holds its place when the chips scroll and when a lens that
                   has no chips is picked. "Crawling…" still replaces the age
                   while a pass runs, which is the one thing this reading has
                   to be able to say about itself. -->
              <div class="ml-auto shrink-0 flex items-center gap-2">
                ${crawlLine('sessions', 'sessionsBusy')}
                ${agePill('sessions', 'sessionsGeneratedAt', 'sessionsBusy', 'Crawling…', 'Sessions cache')}
              </div>
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

            <!-- ── State chips ───────────────────────────────────────────────
                 The second narrowing axis, and the one that answers the
                 question a list of sessions is scanned with: which of these
                 still want something. Same contract as the repo row above,
                 including hiding below two options, since a filter with one
                 option is furniture.

                 GLYPH AND COUNT, no label. The glyph is the whole word here:
                 it is the one the reply itself ended with, so a reader who has
                 seen the chat needs no legend, and one who has not gets the
                 sentence in the tooltip. A row of eleven named chips would
                 also not fit a phone, which is the other half of it. -->
            <div x-show="authed && sessionLens === 'list' && !sessionsLoading && sessionStates.length > 1"
                 class="flex items-center gap-1.5 mb-3 -mx-1 px-1 pb-0.5 overflow-x-auto">
              <button @click="sessionStateFilter = ''"
                      title="Every session in this scope, whatever it closed in, including those that closed in no state at all"
                      class="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors"
                      :class="!activeSessionState ? 'bg-primary/10 text-primary' : 'bg-base-200/60 text-base-content/60 hover:text-base-content'">
                All<span class="font-mono opacity-60" x-text="repoScopedSessions.length"></span></button>
              <template x-for="s in sessionStates" :key="s.key">
                <button @click="sessionStateFilter = (activeSessionState === s.key ? '' : s.key)"
                        :title="s.note"
                        class="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors"
                        :class="activeSessionState === s.key ? 'bg-primary/10 text-primary' : 'bg-base-200/60 text-base-content/60 hover:text-base-content'">
                  <span class="text-base leading-none" x-text="s.mark"></span>
                  <span class="font-mono opacity-60" x-text="s.count"></span></button>
              </template>
            </div>

            <!-- The backfill, said once by the pane rather than once per row.
                 A row summarised before the state existed draws an empty slot,
                 which is indistinguishable on screen from a session that closed
                 in no state; the tooltip separates them and a reader scanning a
                 column of empties is not hovering each one. Only the rows a
                 crawl would fix are counted, so this line goes away when it is
                 no longer true rather than becoming furniture. -->
            <p x-show="authed && sessionLens === 'list' && !sessionsLoading && sessionsBehindState"
               class="text-sm text-base-content/40 mb-3 max-w-2xl"
               x-text="sessionsBehindState === 1
                 ? '1 row here predates the closing state and draws no marker either way. Refresh to read it.'
                 : sessionsBehindState + ' rows here predate the closing state and draw no marker either way. Refresh to read them.'"></p>

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
                <!-- No title on the card. The rail's legend hung here, so a
                     native tooltip fired over every line inside it, the ask
                     included, and raced the styled card that line opens: two
                     tooltips for one hover, saying different things. It moved
                     to the day, one token right of the rail it explains. -->
                <div class="rounded-lg border-l-4 pl-3 pr-3 py-2 transition-colors hover:brightness-[1.02]"
                     :class="sessionAccent(n)">

                <!-- A STUB: a session named by a branch's Claude-Session commit
                     trailer, with no record in the store. It is the reason this
                     list reaches past the recorder's window at all, so it gets
                     a row of its own rather than being dropped, and says out
                     loud that there is nothing to read. -->
                <template x-if="n.kind === 'stub'">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-mono text-base text-base-content/50 shrink-0 tabular-nums" x-text="n.day"></span>
                    <!-- The state slot, empty and reserved, so a stub's id sits
                         in the same column as a record's name rather than a
                         glyph's width to its left. There is nothing to read it
                         from: a stub is a session with no record. -->
                    <span class="shrink-0 w-5"></span>
                    <a :href="n.url" target="_blank" rel="noopener"
                       title="Open this session in Claude Code. No record was published for it, so there is no conversation to read here."
                       class="font-mono text-base font-semibold text-base-content/40 hover:text-primary transition-colors shrink-0"
                       x-text="n.id"></a>
                    <span class="font-mono text-xs text-base-content/30 shrink-0"
                          title="Named by a branch's Claude-Session commit trailer; no record in the sessions store">no&nbsp;record</span>
                  </div>
                </template>

                <!-- A RECORD. Everything below is the row this pane always drew,
                     taking its row from this scope, so the nesting cost the
                     row itself nothing. -->
                <template x-if="n.kind === 'record'">
                <!-- A GETTER, not a plain row property, which is what this
                     was and which froze the row at first paint. x-data runs once
                     and x-for reuses a keyed element, so a node rebuilt under
                     the same session id reached the node and never reached the
                     scope reading it: a crawl repainted nothing. It shows up
                     twice. The live session's own record is rewritten on every
                     Stop, so its sha moves constantly and its row was the one
                     guaranteed to be stale; and a summarizer bump heals rows in
                     place, so a new field arrived in the cache and not on the
                     screen. Probed 2026-08-28: a second summarize() of the same
                     id, with a different ask, left the first ask on screen. -->
                <div x-data="{ get row(){ return n.row } }">
                  <div class="flex items-center gap-2 min-w-0">
                    <!-- Day and short id: the record's own filename, which is
                         how search.py --show addresses it, so what is on screen
                         is what you type at a terminal. -->
                    <!-- The day, and on a phone only the part that varies. A
                         list sorted by date repeats the year on every row and
                         spends four mono characters saying it; what a reader
                         is scanning for is which day. The full date returns at
                         sm, and the whole date is in the title either way.

                         Measured at 430px, where the row's name had been
                         truncating to two characters and a third icon in the
                         cluster was about to make that worse. This is where
                         the width came from.

                         It also carries the RAIL'S legend, which used to hang
                         on the whole card and so fired over the ask as well.
                         The day is the token immediately right of the coloured
                         edge, and it is the one thing in the row already
                         asking to be hovered for a longer form. -->
                    <span class="font-mono text-base text-base-content/50 shrink-0 tabular-nums"
                          :title="[row.day, sessionOutcomeNote(n)].filter(Boolean).join(' · ')">
                      <span class="sm:hidden" x-text="(row.day || '').slice(5)"></span>
                      <span class="hidden sm:inline" x-text="row.day"></span>
                    </span>
                    <!-- The closing state, in a slot the day's fixed width
                         lines up into a column down the list. Reserved even
                         when empty: the name beside it would otherwise shift
                         left by a glyph on every row that carries none, and a
                         column that jitters is not one the eye can run down,
                         which was the only reason to draw it. See
                         SESSION_STATE for what it reads and why it is a glyph
                         rather than a fourth use of colour.

                         IT OPENS THE SEQUENCE, and that is the whole reason it
                         became a control after shipping as a span. A session
                         closes at the end of every stretch of work, not once:
                         median 12 states a record over the 183 that carry any,
                         and 180 of them CHANGE state at least once. So the
                         glyph is the last frame of a history, and tapping it
                         opens that history in the prose card the ask line
                         already opens, newest first with the earlier ones a
                         scroll up.

                         Its native title went with the change. A title attribute and a
                         styled card fire on one hover and say different
                         things, which is the exact failure the rail's legend
                         made and the day is now carrying: two tooltips, one
                         gesture. What the note said is in the card.

                         Padded past the glyph with a negative margin, so the
                         target is a finger without the column moving. Two
                         characters is the tap size this row's own comments
                         complain about, and it was the argument for leaving
                         this a span. -->
                    <button class="shrink-0 w-5 -my-1 py-1 text-center text-base leading-none
                                   hover:text-primary transition-colors"
                            :class="row.state ? '' : 'text-base-content/30 text-sm'"
                            @click.stop="openSessionCard(row, 'state', $event)"
                            @mouseenter="hoverSessionCard(row, 'state', $event)"
                            @mouseleave="hoverLeaveRowCard()">
                      <span x-show="!sessionStateSpinning(row)" x-text="sessionStateMark(row)"></span>
                      <span x-show="sessionStateSpinning(row)" x-cloak
                            class="loading loading-spinner loading-xs align-middle opacity-60"></span>
                    </button>
                    <!-- What the session is CALLED, and it leads: the title from
                         the export where it names this one, the branch-derived
                         slug otherwise. The fallback is per ROW, never per pane,
                         so a list never goes blank for the records that predate
                         the recorder's session-URL field while showing real
                         titles for the rows beside them. Which of the two is on
                         screen is in the tooltip, not in the styling: a title
                         and a slug read differently enough on their own, and a
                         second visual channel here would compete with the
                         failure rail.

                         It carried the id's weight until 2026-08-28, in second
                         place and at /70, which put the boldest thing on the
                         row on eight hex characters that distinguish sessions
                         from each other and describe none of them. A list is
                         scanned for the one about the submittal labels, so the
                         name reads first and the id follows as the address it
                         is. Both still open the session, which is what made
                         the swap free: the pair is an identifier and a label,
                         and only their order and weight moved. -->
                    <button x-show="sessionLabel(row)" @click="openSessionDetail(row)"
                            class="text-base font-semibold truncate min-w-0 text-left
                                   hover:text-primary transition-colors"
                            :title="sessionLabelNote(row)"
                            x-text="sessionLabel(row)"></button>
                    <!-- The id, which is the record's ADDRESS: day-then-id is
                         the filename in the store, so what is on screen is what
                         search.py --show takes and what the pointer block
                         copies. Demoted to the day's weight, since the two are
                         one string split around the name, and the title says
                         the filename whole so the split costs nothing.

                         It takes the bold back where a row has no name at all:
                         a session that never got a branch has nothing else to
                         be called, and an unemphasised id under a blank would
                         leave the row with no identity in the type.

                         AND IT GOES AWAY ON A PHONE, on the same argument the
                         day makes three lines up: eight fixed mono characters
                         is 85px of a 430px row spent on the token that
                         distinguishes sessions rather than the one that
                         describes them, and it was the name truncating to pay
                         for it. The address stays one tap away either way, on
                         the two controls in the trailing cluster: the arrow
                         opens session.html at this id and the clipboard writes
                         the pointer block that names it.

                         Unless there is no name, which is the row that has
                         nothing else to be: there the id stays at every width,
                         because the alternative is a row of a date and a
                         duration. -->
                    <button @click="openSessionDetail(row)"
                            class="font-mono text-base hover:text-primary transition-colors text-left shrink-0"
                            :class="sessionLabel(row) ? 'text-base-content/50 hidden sm:inline-block' : 'font-semibold'"
                            :title="sessionRecordNote(row)" x-text="row.id"></button>
                    <!-- The two things the id could not do. Tapping it opens
                         the in-app takeover, which has no address of its own,
                         so a session was the one thing in this pane you could
                         not point at: the branch rows beside it got both a
                         standalone page and a copied link months ago.
                         The arrow is that address, 💬 pages/session.html, which
                         reads the same record through the viewer's token.
                         The clipboard is the pointer: the block that says which
                         session this is to a person AND to another session,
                         which cannot open either of these links and reads the
                         store instead. -->

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
                    <!-- ── The row's trailing cluster ─────────────────────────
                         AFTER the grow, not beside the title, and that is what
                         made room for a third glyph. Left-packed, the icons ate
                         the width the title needs, and the title is now a
                         control: it opens the session's brief, so a reader who
                         cannot read it cannot aim at it. Measured at 430px,
                         where the first row's name truncated to two characters.

                         The branch row carries the same cluster in the same
                         place, which is the point. Both rows now read
                         identity, then facts, then the two routes out: the
                         NAME goes across the list, the CARDS button goes in. -->
                  </div>
                  <!-- The ask, and the row's largest target. It was a plain <p>
                       while the two smallest things on the line (an 8-character
                       id, a truncated branch name) carried the actions, so the
                       one element that says what the session WAS did nothing
                       when tapped. It opens the conversation, same as the id.
                       A spinner rides here while the record is being fetched. -->
                  <!-- The ask, and it is PROSE. It was a button opening the
                       conversation, on the reasoning that the one element
                       saying what a session WAS should do something when
                       tapped; the two things that acted were an eight-character
                       id and a truncated branch name, and neither is a target
                       on a phone. That argument was about tap size, and the
                       cards button in the cluster above pays it back with a
                       control built for the purpose. The branch row's subject
                       has always been plain for the same reason, and the two
                       rows now agree.

                       What it gains by giving up the click is the CARD, and
                       the pairing is the point: the line says how the session
                       opened, and opening it says how the session closed. Two
                       ends of one session, in the space a row already had.

                       A card rather than a title attribute, which is what this
                       shipped as first and what a native tooltip cannot do: no
                       type, no paragraphs, a second of delay, and no way onto a
                       phone at all. It is the same panel every count on this
                       row opens, so the hover-on-a-fine-pointer and tap-on-
                       touch contract comes with it.

                       Still not a BUTTON, and the distinction is the one the
                       line was made prose for: the click opens a panel in
                       place, it does not navigate. Nothing here takes the
                       reader off the row, which is what the id and the cards
                       button are for. It carried cursor-help to say so, which
                       put a question mark over every ask on the pane; the
                       hover colour says the same thing without one.

                       EVERY ask opens it, including one whose row carries no
                       reply. Gating on the reply is how this first shipped and
                       it made the affordance invisible on most of the store:
                       the field arrived with ROW_V 5 and one crawl pass reads
                       120 records, so a hover on an unhealed row did nothing at
                       all and there was no way to tell a missing feature from a
                       missing field. The card now says which. The full ask is
                       the floor either way, and the row truncates it. -->
                  <p x-show="row.ask"
                     @click.stop="openSessionCard(row, 'reply', $event)"
                     @mouseenter="hoverSessionCard(row, 'reply', $event)"
                     @mouseleave="hoverLeaveRowCard()"
                     class="text-base text-base-content/60 mt-0.5 line-clamp-2 sm:line-clamp-3
                            hover:text-base-content/80 transition-colors"
                     x-text="row.ask"></p>
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
                       class="flex items-center gap-0.5 hover:opacity-75 transition-opacity"
                       x-html="window.claudeMark.svg()"></a>
                    <span x-show="!row.agent" class="flex items-center gap-1 text-base-content/30 font-mono"
                          :title="row.schema < 3
                                    ? 'This record predates harness-session capture (schema 3); its Claude session was never named.'
                                    : 'This record names no Claude session. Before 2026-08-07 the id could only be recovered from commit trailers, so a session that did not commit has none.'">
                      <span class="flex shrink-0"
                            x-html="window.claudeMark.svg({ color: 'currentColor' })"></span><span>&mdash;</span></span>
                    <button x-show="row.tokens" @click.stop="openSessionCard(row, 'tokens', $event)"
                            @mouseenter="hoverSessionCard(row, 'tokens', $event)"
                            @mouseleave="hoverLeaveRowCard()"
                            class="flex items-center gap-2.5 font-mono tabular-nums text-base-content/40 hover:text-primary transition-colors"
                            :title="tokenLabel(row)">
                      <span x-text="tokenShort(row)"></span>
                    </button>
                    <!-- ── The row's actions, at the end of the line ──────────
                         All three used to ride the identity row, right-aligned
                         past the duration. They read fine there and cost the
                         one thing that row cannot spare: the session TITLE,
                         which both identifies the row and opens its brief, and
                         which was truncating to show-rep… at 430px to pay for
                         them.

                         Down here they sit among the other icon buttons, where
                         a reader already looks for something to press, and the
                         identity row goes back to being identity: a day, an id,
                         a name, how long it ran. The branch row moved its own
                         pair the same way in the same commit.

                         FACTS FIRST, then what acts: the counts say how big the
                         session was, the token headline closes them, and these
                         three are what you press. Cards is the primary and sits
                         where the eye lands after reading the numbers; copy is
                         last, being the one nobody reaches for twice.

                         AFTER the token headline, not before it, and the
                         difference is the only reason this line does not break.
                         Tokens carries the ml-auto, so it and these form one
                         right-aligned group: put the actions ahead of it and
                         the auto-margin pushes the tokens onto a line of their
                         own with the three glyphs stranded above. Behind it,
                         the group wraps whole, which reads as a second line of
                         the same thing rather than an orphan.

                         Leading the line was tried first and rendered: it works
                         and it puts the press before the facts, which is not
                         how the row is read. -->
                    <!-- ONE SPAN, so the three travel together. Loose in the
                         wrapping flex they are three items, and at 430px the line
                         broke between them: cards ended one row and the other two
                         started the next, left-aligned under the counts. A cluster
                         that splits is not a cluster. -->
                    <!-- THE ONE auto margin on this line, and it moved here from
                         the token headline. Two of them is what put a gap in the
                         middle of the row on a desktop: tokens pushed itself right,
                         then the cluster pushed itself right again, and the figure
                         floated between the counts and the actions with nothing
                         either side. One margin makes the tail a single
                         right-aligned group, tokens included.

                         It also resolves per FLEX LINE, so when the run overflows
                         at 430px the cluster wraps alone and still holds the right
                         rather than falling in under the counts. -->
                    <span class="flex items-center gap-2 shrink-0 ml-auto">
                      <!-- CARDS: the conversation, one exchange at a time. This
                           is the row's primary action and it is why the id could
                           stop being it. It leads the cluster and wears the
                           colour, the same rule the branch row's cluster follows
                           two hundred lines up and the same rule branch-brief and
                           session-brief follow on their tab rows: one control
                           here is what most readers came for, and it is this. -->
                      <button @click.stop="openSession(row)"
                              :title="row.exchanges ? 'Read ' + row.exchanges + ' cards one at a time'
                                                    : 'Read this session as a conversation'"
                              class="text-primary/70 hover:text-primary transition-colors shrink-0">
                        <i class="ph text-xl" :class="sessionDetailLoading && openSessionId === row.id
                                                        ? 'ph-circle-notch animate-spin' : 'ph-cards-three'"></i></button>
                      <a :href="sessionPageUrl(row)" target="_blank" rel="noopener" @click.stop
                         title="Open this session's own page. The durable address for it, readable by anyone with a token."
                         class="text-base-content/30 hover:text-primary transition-colors shrink-0">
                        <i class="ph ph-arrow-square-out text-lg"></i></a>
                      <button @click.stop="copySessionPointer(row)"
                              title="Copy a pointer to this session: id, name, opening ask, store path, page link, and the search.py command a later session can run"
                              class="text-base-content/30 hover:text-primary transition-colors shrink-0">
                        <i class="ph ph-copy text-lg"></i></button>
                    </span>
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
                <!-- ── The branches this session left behind ─────────────────
                     Each one is an inset TILE rather than a row behind a rail.
                     A rail was the obvious move and the wrong one: the session
                     card already carries a left rail for its outcome, so a
                     second stripe two pixels inside it read as a stripe pile
                     and said nothing the indent had not. A tile says the same
                     thing by being a surface: it sits in the card the way a
                     branch sits in a session, and it holds a full branch row
                     without the row needing to look like a list item.
                     Measured against four alternatives (rail, hairline rules,
                     a tree elbow, a bottom rule) on the live pane. -->
                <div x-show="n.children.length" class="mt-2.5 ml-1 flex flex-col gap-1.5">
                  <template x-for="b in n.children" :key="b.repo + '/' + b.name">
                    <!-- The branch, drawn by the same body the Branches pane
                         uses, with its row aliased to this child. Every control
                         and every hover card comes with it, so a branch read
                         here says exactly what it says over there; the two
                         cannot drift, because there is one definition. -->
                    <div x-data="{ row: b, siblings: n.children }"
                         class="rounded-lg border px-2.5 py-1.5 transition-colors hover:brightness-[1.02]"
                         :class="branchTileAccent(b)">
                      ${branchRowBody({ nested: true })}
                      <!-- The one fact this row gains from being nested: the
                           branch is claimed by more than one session, so it
                           appears under each. That is the whole cost of drawing
                           a many-to-many as a tree, and it is marked rather
                           than hidden. -->
                      <div x-show="(row.sessions || []).length > 1" class="mt-1">
                        <span :title="'Worked across ' + row.sessions.length + ' sessions; this branch appears under each'"
                              class="font-mono text-sm text-warning"
                              x-text="row.sessions.length + ' sessions'"></span>
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
              <!-- The picked star, named the way a list row names a session:
                   the state it closed in, then what it is CALLED, then the id
                   as its address. It led with the id and nothing else until
                   2026-08-28, which made the one panel in this pane that reads
                   a session out loud the only place the name did not appear. -->
              <div x-show="starPick" class="rounded-lg bg-base-200/50 p-3 mt-2 text-base">
                <!-- WRAPPING, not truncating. This panel has one line of
                     chrome and a whole card under it, so at 430px the day and
                     the duration dropping to a second line costs nothing,
                     where cutting the name to "show-repo-..." costs the one
                     thing the line is for. -->
                <div class="flex items-center flex-wrap gap-x-2 gap-y-0.5 min-w-0">
                  <span x-show="starPick?.state" class="shrink-0 text-base leading-none"
                        :title="sessionStateNote(starPick)" x-text="sessionStateMark(starPick)"></span>
                  <span x-show="starPick?.label" class="font-semibold min-w-0 break-all"
                        x-text="starPick?.label"></span>
                  <span class="font-mono shrink-0"
                        :class="starPick?.label ? 'text-base-content/50' : 'font-semibold'"
                        x-text="starPick?.id"></span>
                  <span class="text-base-content/50 tabular-nums shrink-0"
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
              <!-- The third histogram, and the one that is not about the
                   join. The two above count what a session COMMITTED; this
                   counts what it said it was leaving, which is the axis the
                   list's glyph column draws one row at a time. -->
              <div x-show="lensClosingStates.total">
                <h3 class="text-base font-medium">How sessions ended</h3>
                <p class="text-base text-base-content/50 mb-2">
                  The closing state each session's own reply ended in, read off the record.
                  Ordered as the vocabulary is, from wanting something to finished.</p>
                <template x-for="b in lensClosingStates.bars" :key="b.key">
                  <div class="flex items-center gap-2 text-base" :title="b.note">
                    <span class="w-6 text-right leading-none" x-text="b.mark"></span>
                    <div class="h-4 rounded-sm bg-accent/70" :style="'width:' + b.pct + '%'"></div>
                    <span class="tabular-nums text-base-content/50" x-text="b.n"></span>
                  </div>
                </template>
                <!-- The two absences, under a rule, because neither is a state
                     and putting either in the ordering above would say it was
                     one. They differ in the only way that matters here: a
                     refresh closes the second and can do nothing about the
                     first.

                     Their rows are shaped exactly like the bars above, symbol
                     then bar then count, so the lengths stay comparable; the
                     words go in a legend under them rather than trailing each
                     bar, where at 430px they wrapped to two lines and pushed
                     the bar off its own scale. -->
                <div class="mt-2 pt-2 border-t border-base-300 flex flex-col gap-0.5">
                  <div x-show="lensClosingStates.none.n" class="flex items-center gap-2 text-base"
                       title="No closing state: the reply did not end in the convention's shape. Every record before 2026-08 is here, and no refresh will change it.">
                    <span class="w-6 text-right text-base-content/30 leading-none">–</span>
                    <div class="h-4 rounded-sm bg-base-content/20" :style="'width:' + lensClosingStates.none.pct + '%'"></div>
                    <span class="tabular-nums text-base-content/50" x-text="lensClosingStates.none.n"></span>
                  </div>
                  <div x-show="lensClosingStates.behind.n" class="flex items-center gap-2 text-base"
                       title="Not read yet: summarised before the field existed. A Refresh crawls the store and reads these.">
                    <span class="w-6 text-right text-base-content/30 leading-none">◌</span>
                    <div class="h-4 rounded-sm bg-warning/40" :style="'width:' + lensClosingStates.behind.pct + '%'"></div>
                    <span class="tabular-nums text-base-content/50" x-text="lensClosingStates.behind.n"></span>
                  </div>
                </div>
                <p class="text-base text-base-content/40 mt-2">
                  <span class="text-base-content/30">–</span> closed in no state ·
                  <span class="text-base-content/30">◌</span> summarised before the field existed,
                  so a Refresh reads them.
                  <span x-text="lensClosingStates.read"></span> of
                  <span x-text="lensClosingStates.total"></span> name a state, taken from the newest
                  reply that carries one rather than the last.</p>
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
                  <p class="text-sm text-base-content/40 mb-2 max-w-2xl">
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

          <!-- ── Branches view (Activity sub-tab) ─────────────────────────
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
            <!-- No pane header. The pill row above names this pane and holds
                 its as-of + Refresh at every width, so the lg-only header that
                 used to do both here would be a second copy sitting one line
                 below the first. -->
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
            <div x-show="authed" class="flex items-center gap-2 mb-2">
              <div x-show="!activityLoading"
                   class="flex items-center gap-1.5 min-w-0 -mx-1 px-1 pb-0.5 overflow-x-auto">
                <template x-for="s in branchScopes" :key="s.key">
                  <button @click="branchScope = s.key" :title="s.note"
                          class="shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors"
                          :class="branchScope === s.key ? 'bg-primary/10 text-primary' : 'bg-base-200/60 text-base-content/60 hover:text-base-content'">
                    <i class="ph text-base" :class="s.icon"></i>
                    <span x-text="s.label"></span>
                    <span class="font-mono opacity-60" x-text="s.count"></span></button>
                </template>
              </div>
              <!-- The branch cache's age, at the end of its own reach row. The
                   crawl's determinate bar stays above the list, where the
                   reader watching it is watching the list fill; this is the
                   reading, and the pill spins with the bar. -->
              <div class="ml-auto shrink-0 flex items-center gap-2">
                ${crawlLine('activity', 'activityBusy')}
                ${agePill('activity', 'activityGeneratedAt', 'activityBusy', 'Crawling…', 'Branch activity cache', 'freshCount')}
              </div>
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
              <span class="text-base-content/40 shrink-0">within</span>
              <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5">
                <template x-for="d in [1/24, 1, 3, 7]" :key="d">
                  <button @click="setBranchWindow(d)"
                          class="px-2 py-0.5 rounded-md font-medium transition-colors"
                          :class="branchWindow === d ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'"
                          x-text="windowLabel(d)"></button>
                </template>
              </div>
              <span class="text-base-content/40 font-mono" x-text="windowCoverage"></span>
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
                  ${branchRowBody()}
                </div>
              </template>
            </div>
          </div>
          <!-- ── State view (Activity sub-tab) ─────────────────────────────
               The caches behind every other pill in this row: what the estate
               keeps derived, how old each piece is, and the control that
               refreshes it. In DOM order where it sits in the pill row, so
               reading the panes in the file reads them in the order the row
               offers them.

               Mounted only once its pill is chosen. Its own component
               (lib/alpineComponents/state-view.js) reads two cache files and a
               commit per state file on mount, which is not a cost to pay for
               every visit to Sessions. An x-if rather than a hidden class is
               what makes that true: a hidden pane still mounts. -->
          <div class="flex-1 min-w-0" :class="tab==='state' ? '' : 'hidden'">
            <template x-if="tab === 'state'">
              <div x-data="stateView()"></div>
            </template>
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
            <div x-show="authed && chatsErr" class="rounded-xl border border-warning/40 bg-warning/10 p-4 max-w-2xl">
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
                   :class="chatBanner.due ? 'border-warning/40 bg-warning/10' : 'border-base-300 bg-base-200/30'">
                <div class="flex items-center flex-wrap gap-x-3 gap-y-1 text-base">
                  <i class="ph text-lg" :class="chatBanner.due ? 'ph-warning-circle text-warning' : 'ph-archive opacity-60'"></i>
                  <span>Every provider archived through
                    <span class="font-mono font-semibold" x-text="chatBanner.archivedThrough"></span></span>
                  <span class="text-base-content/50" x-text="'· ' + chatBanner.behind + ' days back'"></span>
                  <span class="ml-auto font-mono text-base-content/40 tabular-nums"
                        x-text="chatBanner.chats.toLocaleString() + ' chats'"></span>
                </div>
                <div class="mt-2 flex flex-col gap-1">
                  <template x-for="p in chatBanner.rows" :key="p.key">
                    <div class="flex items-center gap-2 text-sm">
                      <span class="w-20 shrink-0" :class="p.due ? 'text-warning font-medium' : 'text-base-content/70'"
                            x-text="p.label"></span>
                      <span class="font-mono tabular-nums text-base-content/60" x-text="p.frontier || '---'"></span>
                      <span class="font-mono tabular-nums"
                            :class="p.due ? 'text-warning' : 'text-base-content/40'"
                            x-text="p.behind == null ? '' : p.behind + 'd'"></span>
                      <span class="text-base-content/30 truncate min-w-0"
                            :title="p.snapshots.join(', ')"
                            x-text="p.cadence.longest == null
                                      ? 'one export, no cadence yet'
                                      : p.cadence.count + ' exports, longest gap ' + p.cadence.longest + 'd'"></span>
                      <span class="ml-auto font-mono text-base-content/30 tabular-nums shrink-0"
                            x-text="p.chats.toLocaleString()"></span>
                    </div>
                  </template>
                </div>
                <!-- The limit, stated where the number is read. Every consumer
                     of the frontier repeats this because the number invites
                     exactly the wrong inference. -->
                <p class="mt-2 text-sm text-base-content/40">
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
                     :class="row.hand ? 'border-primary/50 bg-primary/10' : 'border-base-300 bg-base-100'">
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
                              :class="chatTag === t ? 'bg-primary/10 text-primary' : 'bg-base-200/70 text-base-content/50 hover:text-base-content'"
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
              <span class="text-sm text-base-content/40"
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
                 class="rounded-xl border border-warning/40 bg-warning/10 p-4 max-w-2xl mb-4">
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
                 the router addresses Sessions, Chats, Routes, Jot and Saved
                 as their own ?view= key even though each is a sub-tab of
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
                    <span class="font-mono text-sm text-base-content/30"
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
                        <code class="text-sm text-base-content/40 font-mono" :title="r.address">
                          <span x-text="routeShortAddress(r)"></span><span
                            x-show="routeAddressTruncated(r)" class="opacity-50">…</span></code>
                        <!-- The stop line already names the group for a folded
                             stop, so the row only says it when it stands alone. -->
                        <span x-show="s.solo" class="text-sm text-base-content/30"
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
                             :class="r.borrowed ? 'text-base-content/30' : 'text-base-content/60'"
                             :title="r.lastTouch.subject + ' · ' + r.lastTouch.shortSha">
                            <span x-text="agoShort(r.lastTouch.date)"></span>
                            <span x-show="r.borrowed" class="italic ml-1">shared</span>
                          </a>
                        </template>
                        <span x-show="!r.lastTouch" class="font-mono text-sm text-base-content/30 shrink-0"
                              x-text="r.hasOwnCode ? 'unread' : 'no code'"></span>
                      </div>
                      <div class="flex items-baseline gap-2 mt-0.5">
                        <p class="text-sm text-base-content/50 min-w-0" x-text="r.what"></p>
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
                                class="text-sm font-mono text-base-content/50 break-all"
                                x-text="r.address"></code>
                          <p x-show="r.note" class="text-sm text-base-content/50 italic" x-text="r.note"></p>
                          <p x-show="!r.files.length && !r.note" class="text-sm text-base-content/50 italic">
                            No file of its own.
                          </p>
                          <template x-for="f in r.files" :key="f.path">
                            <div class="flex items-baseline gap-2 text-sm">
                              <code class="font-mono text-base-content/70 truncate min-w-0" x-text="f.path"></code>
                              <span x-show="f.shared"
                                    class="shrink-0 text-base-content/30 font-mono"
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
                                <code class="text-sm font-mono text-base-content/50 bg-base-200/60 rounded px-1.5"
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
                                 :class="r.branches.includes(b) ? 'text-primary' : 'text-base-content/40'"
                                 x-text="'#' + b.pr + ' ' + b.title"></a>
                              <span x-show="!r.branches.includes(b)"
                                    class="shrink-0 italic text-base-content/30">near</span>
                              <span class="shrink-0 font-mono text-base-content/30"
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
                    <!-- Where this list actually lives. See listUrl /
                         listPeek: an exact file, so the glyph peeks the JSON
                         on hover and jumps to the blob on a tap. -->
                    <a :href="listUrl(PINS_PATH)" :data-peek="listPeek(PINS_PATH)" target="_blank" rel="noopener"
                       class="text-base-content/30 hover:text-primary transition-colors leading-none shrink-0"
                       :title="'Pins are stored at ' + PINS_PATH + ' in ' + registry()">
                      <i class="ph ph-github-logo text-base"></i></a>
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
                        <!-- 20rem, not the 16rem this carried until 2026-08-26.
                             The pane was capped at 548px then (see the shell's
                             w-full note), so 16rem was already splitting a
                             half-width pane into two 266px columns; at full
                             width it made four, and a column that narrow could
                             not hold a one-sentence note even across two
                             lines. 20rem still gives three columns on a wide
                             screen and two on a half one, and one on a phone,
                             which is what auto-fill is for. -->
                        <div class="grid gap-x-4 gap-y-0.5" style="grid-template-columns:repeat(auto-fill,minmax(20rem,1fr))">
                          <template x-for="it in g.items" :key="it.id">
                            <div class="flex items-start gap-2 px-2 py-1 rounded-lg hover:bg-base-200/60 group min-w-0">
                              <i class="ph ph-push-pin text-base-content/30 mt-0.5 shrink-0"></i>
                              <div class="flex-1 min-w-0">
                                <!-- Two lines, not one. Both of these read
                                     truncate until 2026-08-26, which is one
                                     line and an ellipsis: at four columns a
                                     26-character title missed its box by five
                                     pixels and a one-sentence note by ninety,
                                     so the pane cut a pin's whole reason for
                                     being pinned. The clamp keeps the density
                                     the grid is for (a bound, so a long note
                                     cannot stretch its grid row) while giving
                                     an ordinary title and gloss room to land.
                                     break-words is for the auto-derived title:
                                     addPin falls back to the path's last
                                     segment, which is one long hyphenated
                                     token with no space to wrap at. -->
                                <button @click="openPin(it)" :title="it.target"
                                        class="block w-full text-left text-base line-clamp-2 break-words hover:text-primary transition-colors"
                                        x-text="it.title || it.target"></button>
                                <p x-show="it.note" :title="it.note"
                                   class="text-sm text-base-content/40 line-clamp-2 break-words" x-text="it.note"></p>
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
                    <!-- Where this list actually lives. See listUrl /
                         listPeek: an exact file, so the glyph peeks the JSON
                         on hover and jumps to the blob on a tap. -->
                    <a :href="listUrl(TODO_PATH)" :data-peek="listPeek(TODO_PATH)" target="_blank" rel="noopener"
                       class="text-base-content/30 hover:text-primary transition-colors leading-none shrink-0"
                       :title="'To-dos are stored at ' + TODO_PATH + ' in ' + registry()">
                      <i class="ph ph-github-logo text-base"></i></a>
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
                               :class="isHot(it) ? 'border-error bg-error/10' : 'border-transparent'">
                          <input type="checkbox" :checked="!!it.done" @change="toggleTodo(it)"
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
                                <input type="checkbox" :checked="!!it.done" @change="toggleTodo(it)"
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
                    <!-- Where this list actually lives. See listUrl /
                         listPeek: an exact file, so the glyph peeks the JSON
                         on hover and jumps to the blob on a tap. -->
                    <a :href="listUrl(JOTS_PATH)" :data-peek="listPeek(JOTS_PATH)" target="_blank" rel="noopener"
                       class="text-base-content/30 hover:text-primary transition-colors leading-none shrink-0"
                       :title="'Jots are stored at ' + JOTS_PATH + ' in ' + registry()">
                      <i class="ph ph-github-logo text-base"></i></a>
                    <div class="grow"></div>
                    <form @submit.prevent="addJot()" class="flex gap-2 min-w-[14rem] flex-1 max-w-md">
                      <input x-model="jotDraft" placeholder="Jot an idea…" autocomplete="off"
                             class="input input-bordered input-sm flex-1 min-w-0">
                      <button type="submit" class="btn btn-primary btn-sm gap-1 shrink-0" :disabled="!jotDraft.trim()">
                        <i class="ph ph-plus"></i></button>
                    </form>
                  </div>

                  <!-- The kind chips, and they appear only once there is a
                       draft. Capture is the reason this pane exists and most
                       jots want no kind, so a permanent row would charge every
                       jot for a field one in five uses. Type first, tap a chip
                       or do not, then +. The set is jotKinds, derived from the
                       pile, so tapping is the ordinary route and the last chip
                       (+) is how a kind that does not exist yet gets made. -->
                  <div x-show="jotDraft.trim()" class="flex items-center gap-1.5 flex-wrap mb-2 px-1">
                    <span class="text-sm text-base-content/40">kind</span>
                    <template x-for="k in jotKinds" :key="k">
                      <button type="button" @click="jotKindDraft = (jotKindDraft === k ? '' : k); jotKindNew = false"
                              class="badge badge-sm font-mono cursor-pointer"
                              :class="jotKindDraft === k ? 'badge-primary' : 'badge-ghost'"
                              x-text="k"></button>
                    </template>
                    <button type="button" x-show="!jotKindNew" title="Name a kind that is not here yet"
                            @click="jotKindNew = true; jotKindDraft = ''; $nextTick(() => $refs.jotKindInput?.focus())"
                            class="badge badge-sm badge-ghost cursor-pointer">
                      <i class="ph ph-plus text-xs"></i></button>
                    <input x-show="jotKindNew" x-ref="jotKindInput" x-model="jotKindDraft"
                           @keydown.enter.prevent="jotKindNew = false" @blur="jotKindNew = false"
                           placeholder="new kind" autocapitalize="off" autocorrect="off"
                           spellcheck="false" autocomplete="off"
                           class="input input-bordered input-xs w-28 font-mono">
                  </div>

                  <div x-show="jotLoading" class="flex justify-center py-10">
                    <span class="loading loading-dots loading-md opacity-30"></span>
                  </div>

                  <div x-show="!jotLoading" class="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
                    <div class="flex flex-col gap-1">
                      <template x-for="it in jotPile" :key="it.id">
                        <div class="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-base-200/60 group">
                          <i class="ph ph-lightbulb text-base-content/30 mt-1 shrink-0"></i>
                          <!-- Present only when the jot carries one, the way a
                               to-do's due chip is. A pile of "no kind" badges
                               would say nothing, which is the same reason the
                               urgent count is absent at zero. -->
                          <span x-show="it.kind" class="badge badge-ghost badge-sm font-mono shrink-0 mt-0.5"
                                x-text="it.kind"></span>
                          <span class="text-base flex-1" x-text="it.text"></span>
                          <span class="text-sm text-base-content/30 mt-0.5 shrink-0" :title="it.created_at"
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
          <!-- The width is STAMPED, not classed, and it is fit-content rather
               than fixed. Two things wrong with the class it replaces. A prose
               card held a short passage in a box always 35rem wide, so the
               panel was visibly wider than the thing in it; and the number
               lived twice, as a Tailwind arbitrary value here and as
               REPLY_CARD_W in the anchor that places the panel, which is the
               drift the shell's own MENU_W comment was written about after it
               had already happened once.
               Now rowCardStyle stamps both bounds off the one constant, so
               there is nothing to keep in step and nothing that depends on an
               arbitrary class being generated at runtime. -->
          <div x-show="rowCard" x-cloak x-ref="rowCardBox" @click.outside="closeRowCard()"
               @mouseenter="cancelRowCardClose()" @mouseleave="hoverLeaveRowCard()"
               class="fixed z-[56] w-fit overflow-y-auto
                      rounded-lg border border-base-300 bg-base-100 shadow-lg"
               :style="rowCardStyle">
            <template x-if="rowCard">
              <div class="flex flex-col">
                <!-- z-10 because the transcript below is a stack of positioned
                     turns: chat-render gives every message body a
                     position:relative host, so without a z-index the turns
                     paint over this bar in DOM order. Only visible once the
                     card was long enough to scroll, which it never was before.
                     (No backticks in this comment: it lives inside a template
                     literal, and a code span here is a syntax error.) -->
                <div class="flex items-baseline gap-2 px-3 pt-2.5 pb-2 border-b border-base-200 sticky top-0 z-10 bg-base-100">
                  <i class="ph text-base self-center"
                     :class="rowCard.kind === 'list' || rowCard.kind === 'prose'
                             ? rowCard.icon + ' text-base-content/50'
                           : rowCard.cls === 'added' ? 'ph-file-plus text-success'
                           : rowCard.cls === 'missing' ? 'ph-warning-circle text-warning'
                           : rowCard.cls === 'ahead' ? 'ph-arrow-up text-success'
                           : rowCard.cls === 'behind' ? 'ph-arrow-down text-base-content/50'
                           : 'ph-files text-base-content/50'"></i>
                  <!-- The prose card counts too, now that it is a transcript
                       rather than one paragraph. It read "closing reply,
                       trimmed", which described the card when the card WAS the
                       closing reply; over a conversation that label named the
                       last turn and appeared to title the whole. The fidelity
                       claim stays where it belongs, on that turn's own header,
                       and this says what every other card here says: a number
                       and what was counted. -->
                  <span class="font-mono font-semibold tabular-nums"
                        x-text="rowCardSummary?.count ?? '–'"></span>
                  <span class="text-sm text-base-content/70"
                        x-text="rowCard.kind === 'prose'
                                  ? (rowCard.unit || ['turn', 'turns'])[rowCard.turns?.length === 1 ? 0 : 1]
                                : rowCard.kind === 'list' ? rowCard.label
                                  : rowCard.kind === 'commits'
                                  ? (rowCardSummary?.count === 1 ? 'commit' : 'commits')
                                  : rowCard.cls === 'added' ? 'new'
                                  : rowCard.cls === 'missing' ? 'missing' : 'changed'"></span>
                  <span x-show="rowCard.kind === 'commits'" class="text-sm text-base-content/40"
                        x-text="(rowCard.cls === 'ahead' ? 'ahead of ' : 'behind ') + rowCard.base"></span>
                  <span class="grow"></span>
                  <span x-show="rowCardSummary?.lines" class="font-mono text-xs text-base-content/40"
                        x-text="rowCardSummary?.lines"
                        title="lines added and removed across these files"></span>
                </div>

                <!-- ── The prose body ────────────────────────────────────
                     The session's opening ask, then what it concluded. The row
                     shows the first and truncates it; this shows both whole,
                     which is the pairing the row was making with a title
                     attribute and could not render: a native tooltip has no
                     type, no scroll, and no way onto a phone.

                     The ask is quiet and the reply is not, because the reply is
                     what the reader opened this for; the ask is context for it
                     and is already on the row above. whitespace-pre-line so a
                     reply written in paragraphs arrives as paragraphs, which is
                     most of what makes this readable rather than a wall. -->
                <template x-if="rowCard.kind === 'prose'">
                  <!-- ── The transcript ─────────────────────────────────────
                       Built by chatRender.message, which is the function the
                       swipe deck renders every turn with. Not a lookalike: the
                       same role chrome (icon, mono label, clock), the same
                       coloured left edge per role, the same markdown with
                       fenced blocks promoted to artifacts, and a user turn in
                       monospace because that is how it was typed.

                       This replaced a hand-built body that approximated the
                       deck and got it awkwardly wrong: a truncated ask on a
                       rule, prose through the guide renderer, and no times at
                       all. The lesson is the one the estate keeps relearning:
                       when a reading surface already exists, mount IT.

                       Imperative rather than templated, because the renderer
                       returns elements. x-effect re-runs it whenever the card
                       changes, which is what an Alpine binding would have done
                       for markup. -->
                  <div class="px-3 py-2.5">
                    <div x-ref="replyBody" class="flex flex-col"
                         x-effect="rowCard.kind === 'prose' && mountReplyCard(rowCard)"></div>
                    <!-- The empty case, and the two prose cards are empty for
                         different reasons, so the card carries its own line
                         and this keeps the reply card's as the default. -->
                    <p x-show="rowCard.pending" class="text-[10px] text-base-content/40 leading-snug mt-2"
                       x-text="rowCard.pendingNote || ('Nothing said on this row yet. The reply arrived with row '
                         + 'version 5 and the turns above it with 6; one crawl pass reads 120 records, so a '
                         + 'store this size heals over two. Press Refresh on this pane again.')"></p>
                  </div>
                </template>

                <!-- ── The list body ──────────────────────────
                     Label and count, biggest first, exactly as the record
                     stored them. No fetch and no loading state: what a title
                     was hiding was never remote, only small. -->
                <template x-if="rowCard.kind === 'list'">
                  <div class="flex flex-col py-1">
                    <template x-for="(r, i) in rowCard.rows" :key="i">
                      <div class="flex items-baseline gap-2 px-3 py-1">
                        <span class="min-w-0 flex-1 truncate text-xs text-base-content/80"
                              :class="r.mono ? 'font-mono' : ''" x-text="r.label" :title="r.label"></span>
                        <span class="shrink-0 font-mono tabular-nums text-xs text-base-content/50"
                              x-text="r.n.toLocaleString()"></span>
                      </div>
                    </template>
                    <p x-show="rowCard.note" class="px-3 pt-1.5 pb-1 text-[10px] text-base-content/40"
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
                          <span class="min-w-0 flex-1 truncate text-xs text-base-content/80"
                                x-text="c.msg" :title="c.msg"></span>
                          <span class="shrink-0 font-mono text-[10px] text-base-content/30"
                                x-text="c.sha.slice(0, 7)"></span>
                        </span>
                        <span class="flex items-baseline gap-2 text-[10px] text-base-content/40">
                          <span x-text="agoShort(c.date)"></span>
                          <span x-show="c.author" class="truncate" x-text="c.author"></span>
                        </span>
                      </a>
                    </template>
                    <p x-show="rowCardCommitGap" class="px-3 py-1 text-[10px] text-base-content/40">
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
                        <span class="font-mono tabular-nums text-base-content/30" x-text="pair[1]"></span></span>
                    </template>
                  </div>
                  <div class="flex flex-wrap gap-x-3 gap-y-1">
                    <template x-for="pair in rowCard.shape.dirs" :key="'d' + pair[0]">
                      <span class="flex items-center gap-1">
                        <i class="ph ph-folder-simple text-sm text-base-content/20"></i>
                        <span class="text-base-content/70" x-text="pair[0]"></span>
                        <span class="font-mono tabular-nums text-base-content/30" x-text="pair[1]"></span></span>
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
                              class="font-mono text-base-content/80" x-text="rowCardName(f.path)"></span></span>
                        </button>
                        <span x-show="f.additions" class="shrink-0 font-mono text-[11px] tabular-nums text-success"
                              x-text="'+' + f.additions"></span>
                        <span x-show="f.deletions" class="shrink-0 font-mono text-[11px] tabular-nums text-error"
                              x-text="'-' + f.deletions"></span>
                        <a :href="fileBlobUrl(rowCard.repo, rowCard.name, f.path)" target="_blank" rel="noopener"
                           :title="'Open ' + f.path + ' on GitHub'"
                           class="shrink-0 self-center text-base-content/20 hover:text-primary transition-colors">
                          <i class="ph ph-arrow-square-out text-xs"></i></a>
                      </div>
                      <template x-if="rowCardOpen === f.path && f.patch">
                        <div class="border-y border-base-200 bg-base-200/40">
                          <pre class="text-[10px] leading-[1.35] font-mono m-0 px-2 py-1 overflow-x-auto
                                      whitespace-pre"><template x-for="(l, i) in patchLines(f.patch)" :key="i"><span
                            class="block px-1 rounded-sm" :class="l.cls" x-text="l.t"></span></template></pre>
                          <p x-show="patchOverflow(f.patch)" class="px-3 py-1 text-[10px] text-base-content/40">
                            <span x-text="patchOverflow(f.patch)"></span> more lines, not shown. Open the file on GitHub for the rest.
                          </p>
                        </div>
                      </template>
                    </div>
                  </template>
                </div>

                <button x-show="rowCard.kind === 'files'" @click="openFileCardBranch()"
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
      adoptRows: {},   // repo -> the portable-align row, read from the config cache
      skillsOpen: '',  // repo whose own-skills list is expanded, like scopeOpen
      scopeOpen: '',   // repo whose scope paragraph is expanded (one at a time)
      // The bench: one working set, one stager, in one fixed place at the top
      // of the view. There is no open/closed state left to track, because the
      // bench is always there, and no local copy of which surface it holds:
      // that is store.stageOrigin, which the stager saves through. A second
      // copy here would be a second truth, and the two drifted apart on every
      // path that touched one without the other (clearing was the live case).
      _acct: null,     // memoized account-repos list, one call per load pass
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
      // The date of the titles export the rows were joined against, which is a
      // different age from `sessionsGeneratedAt`: the crawl can be minutes old
      // while the titles it carries are a week old. Both are shown, because a
      // dated snapshot behind a live view is exactly the case that reads as
      // current.
      sessionsTitlesAt: '',
      sessionsLoading: false,
      sessionAttention: [],
      showAttention: false,
      sessionScope: 'day',
      sessionRepoFilter: '',
      sessionStateFilter: '',
      openSessionId: '',
      sessionDetail: null,
      sessionDetailLoading: false,
      sessionDetailErr: '',

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

      // The three list paths, on the component because the heading rows name
      // them: their jump-over link and their tooltip both read the path, and
      // an Alpine expression is compiled with new Function, so a module-level
      // const is not in scope for it. Same shape map.js uses for the manifests
      // its tabs read.
      TODO_PATH, JOTS_PATH, PINS_PATH,

      // The pending kind for the jot being typed, and whether the free-text
      // field is open. Both reset on add: a kind is per-jot, not a mode.
      jotKindDraft: '',
      jotKindNew: false,

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
        // And the same for `&session=`, which needs no list either: the
        // brief reads ONE record and resolves its own path from the id, so a
        // link opens as a list of one and upgrades to the full sequence
        // when the sessions cache lands.
        this.$nextTick(() => this.openSessionFromUrl());
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
        // A hide toggle writes the registry's own config, which the cache will
        // agree with only after the next crawl. The shell announces the change
        // instead, and the grid re-filters from the config map it already
        // holds: one pass over an object, no reads.
        document.addEventListener('web-tools:hidden-changed', () => {
          if (!this.confMap_) return;
          this.applyMembership(this.confMap_);
          this.loadUnfiled(this.confMap_);
          this.enrichMeta();
        });
        // The activity crawl commits state/activity.json and fires this; re-read
        // just the activity cache (the cards themselves haven't changed).
        // The crawl hands its own document over on this event, so the common
        // case costs no read at all: the file is 370 KB and the shell is
        // holding it. A detail-less event (a background pass, an older shell)
        // still falls back to reading.
        document.addEventListener('web-tools:activity-refreshed', (e) => this.reloadActivity(e?.detail?.cache));
        // Same contract for the sessions crawl, which commits state/sessions.json:
        // the crawl hands its document along, and a detail-less event (an older
        // shell, or a path that has no document to give) falls back to reading.
        document.addEventListener('web-tools:sessions-refreshed',
          (e) => this.reloadSessions(e?.detail?.cache));
        // The shell's anchored panel opened (a Repos row, or an Open row's repo
        // chip), so put this view's branch panel away: two menus up at once is
        // never intended, and the pointer has clearly moved on.
        document.addEventListener('web-tools:repo-menu-open', () => {
          this.cancelBranchClose(); this.branchMenuAt = null;
        });
        // The sidebar's finder resolved a #PR or @branch hit. Same contract as
        // a &detail= deep link: switch to the Open list and open the takeover,
        // through the UNFILTERED lookup (branchRowFor) so a hit outside the
        // current scope still arrives carrying its row, and tolerating a row
        // the cache does not carry at all (a list of one), so a fresh push the
        // crawl has not seen still opens.
        document.addEventListener('web-tools:open-branch-detail', (e) => {
          const { repo, name } = e.detail || {};
          if (!repo || !name) return;
          window.__shell?.goActivity?.();
          this.openBranchDetail(this.branchRowFor(repo, name) || { repo, name });
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
      // Latches on the first visit to the Stage and never clears; see the
      // mount site for why it is a latch rather than the live tab test.
      stageSeen: false,

      // Which estate view is showing, from the shell (Repos | Stage | Lists |
      // Activity | Sessions). 'todo' and 'jots' both answer 'lists' because
      // the two panes MERGED. Activity's four keep their own keys, since the
      // pill still switches between four panes.
      get tab(){
        const v = window.__shell?.view;
        if (v === 'stage') return 'stage';
        if (v === 'todo' || v === 'jots') return 'lists';
        return ACTIVITY_TABS.includes(v) ? v : 'repos';
      },
      // Whether any Activity sub-pane is showing. The pill row and both
      // composite wrappers ask this, and they used to ask it by spelling the
      // set out three times, which is three places to miss when a pane is added.
      get isActivityTab(){ return ACTIVITY_TABS.includes(this.tab); },
      get stagedCount(){ return (Alpine.store('browser')?.stage || []).length; },
      // Pill taps (Activity's): route through the
      // shell so the header nav, the URL stamp, and history stay on the one
      // navigation path a header tab tap uses.
      //
      // A key with no arm here is a DEAD PILL, and it fails silently: the
      // button renders, `tab` recognizes the key, the pane is written, and the
      // tap does nothing at all. That is what happened to State on 2026-08-23,
      // when it moved from a nav stop of its own into this row and every list
      // that names the set was updated except this one. Adding a pill means
      // adding its arm, and the shell's `go*` is the only thing that stamps
      // the URL.
      goSub(key){
        const s = window.__shell;
        if (!s) return;
        if (key === 'activity') s.goActivity();
        else if (key === 'sessions') s.goSessions();
        else if (key === 'chats') s.goChats();
        else if (key === 'routes') s.goRoutes();
        else if (key === 'state') s.goState();
        else if (key === 'todo') s.goTodo();
        else if (key === 'jots') s.goJots();
        else if (key === 'stage') s.goStage();
      },

      registry(){ return window.__shell?.REGISTRY_REPO || 'mehrlander/web-tools-private'; },
      // ── Where a list is stored ──────────────────────────────────────────
      // Every view in this shell keeps a one-tap route to the GitHub
      // presentation of what it is showing (the jump-over convention, stated
      // at the top of app/index.html). Lists was the exception: three panes
      // writing three files in a private registry, with nothing on screen
      // naming the repo, the path, or the fact that checking a box is a
      // commit. These give each heading that route.
      //
      // Each names an EXACT FILE, so the glyph carries a peek
      // (lib/kits/source-peek.js): hovering shows the JSON, which is the
      // transparency the link only promises. Ref-less on purpose: the registry
      // is read at its default branch and this app has no ref switch for it,
      // and an omitted ref and GitHub's HEAD both mean exactly that.
      listUrl(path){
        return window.GithubLinks?.pathUrl?.(this.registry(), path)
          || ('https://github.com/' + this.registry() + '/blob/HEAD/' + path);
      },
      listPeek(path){ return window.SourcePeek?.addr?.(this.registry(), '', path) || null; },
      // The peek is seeded from the bytes each loader already read, so the
      // ordinary hover costs no request, and re-seeded by each saver, because
      // a card that kept the copy taken at mount would answer "what is in the
      // file" with a file that no longer exists after one check-off. gh-store
      // serialises with JSON.stringify(v, null, 2), so this is the text that
      // landed rather than an approximation of it.
      seedList(path, value){
        window.SourcePeek?.seed(this.listPeek(path), JSON.stringify(value, null, 2));
      },
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
        // The separator is written as an ESCAPE, not as a literal NUL byte.
        // Both produce the same one-character string at runtime, and only one
        // of them leaves this file readable by the tools that audit it: GNU grep
        // declares a file binary at the first NUL and suppresses every match
        // after it while still LISTING the file, so a `grep -rn` sweep over lib/
        // returns some of this file's hits, looks complete, and is not.
        // Measured 2026-08-19: 3 real occurrences of one token, 1 line shown.
        // It is how a 193-occurrence opacity sweep left one behind in here
        // (docs/SNAGS.md).
        const key = this.registry() + '\u0000' + (window.TOKEN || '');
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
          // Public: the shell's public default card only, no lists and no
          // activity (all of it lives in the private registry).
          this.todoItems = [];
          this.jotItems = [];
          this.pinItems = [];
          this.activity = {}; this.activityGeneratedAt = '';
          this.sessionRows_ = []; this.sessionsGeneratedAt = ''; this.sessionAttention = [];
          this.sessionsTitlesAt = '';
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

        this.confMap_ = confMap;
        this.applyMembership(confMap);
        this.loading = false;
        this.enrichMeta();
        this.loadUnfiled(confMap);        // independent; shares enrichMeta's one account list
      },

      // ── Hidden: on the estate, off the dashboard ──────────────────────────
      // Membership is a repo property and hiding is not: it says the viewer
      // would rather not look at this one, so it lives in the private
      // registry's own config (`hidden`, a list of owner/repo) and the SHELL
      // owns it, since the sidebar has to honour the same list. A hidden repo
      // keeps estate:true and every field it declared, and it comes back
      // unchanged; nothing is written to the repo itself.
      hiddenEntries: [],
      hiddenOpen: false,
      confMap_: null,       // the last config map, so a hide re-filters without a reload
      // Prefer the shell's resolved list: it carries the optimistic override a
      // just-written toggle leaves behind, so a hide takes effect on this view
      // at the same moment it takes effect on the sidebar. The cache is the
      // fallback for a render that beats the shell's first read.
      hiddenSet(confMap){
        const S = window.__shell;
        if (S?.estateHiddenReady) return new Set(S.estateHidden || []);
        const cfg = confMap?.[this.registry()];
        return new Set(Array.isArray(cfg?.hidden) ? cfg.hidden : []);
      },
      entryFor(name, cfg){
        cfg = cfg || {};
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
          meta: null, err: false, child: null, showChild: false,
        };
      },
      // The one place membership becomes cards. Separated from load() so a hide
      // re-filters the grid from the config map already in hand rather than
      // re-reading the cache and every list beside it.
      applyMembership(confMap){
        const hidden = this.hiddenSet(confMap);
        const members = Object.keys(confMap).filter(n => confMap[n]?.estate === true);
        this.entries = members.filter(n => !hidden.has(n)).map(n => this.entryFor(n, confMap[n]));
        // A hidden name the config cache does not cover still gets a row: it
        // is the only route back, and a list you cannot undo from is a trap.
        this.hiddenEntries = [...hidden].sort().map(n => this.entryFor(n, confMap[n]));
        this.applyNesting();
      },
      showHidden(repo){ window.__shell?.toggleRepoHidden?.(repo); },

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
          this.takeSessions(JSON.parse((await reg.get(path)).text));
        } catch {
          this.sessionRows_ = []; this.sessionAttention = []; this.sessionsGeneratedAt = '';
          this.sessionsTitlesAt = '';
        } finally {
          this.sessionsLoading = false;
          // The list has arrived (or failed to), so a `&session=` opened as a
          // list of one can now be re-seated in its sequence. Fired on BOTH
          // paths, for the reason the branch side states: doing it inside the
          // try meant a deep link did nothing at exactly the moment the estate
          // could not read anything, which is silent and reads as a dead link.
          this.$nextTick(() => this.openSessionFromUrl());
        }
      },
      // The same landing the read does, from a document already in hand. The
      // sibling of takeActivity, and it did not exist until 2026-08-27, which
      // is the whole of the bug below.
      takeSessions(cache){
        this.sessionRows_ = cache?.rows || [];
        this.sessionAttention = cache?.attention || [];
        this.sessionsGeneratedAt = cache?.generatedAt || '';
        this.sessionsTitlesAt = cache?.titlesAt || '';
        // Landing a list is landing a list, however it arrived: a `&session=`
        // that opened as a list of one before the cache existed re-seats itself
        // in the full sequence here, exactly as it does on the read path. The
        // guard inside it makes the ordinary refresh a no-op.
        this.$nextTick(() => this.openSessionFromUrl());
      },
      // ── Why this takes a document, and what it was doing before ───────────
      //
      // A refresh on the Branches pane and a refresh on the Sessions pane gave
      // two different answers to "how old is this", off one gesture, and the
      // reason was here. The activity crawl hands its freshly built document to
      // this component (announceActivity, 2026-08-17, to stop eleven re-reads
      // of a 370 KB file); the sessions crawl fired a bare event and this
      // method went back to the API for a file the crawl was still holding.
      //
      // Two things follow from that re-read and both are wrong on screen.
      // A crawl that finds NOTHING CHANGED does not commit, by design, so the
      // file still carries the previous pass's stamp and the pill snaps back to
      // it: press Refresh on a quiet estate and Branches says "now" while
      // Sessions says "1h". And a crawl that DID commit is read moments after
      // its own write, which the contents API is free to serve from the copy
      // before it.
      //
      // Both disappear when the document rides the event, because the built
      // document always carries `generatedAt: nowISO` whether or not the commit
      // was worth making (repo-sessions-cache.js, buildCache). The stamp then
      // says when the store was last CHECKED, which is what a reader pressing
      // Refresh is asking, and the State view is where last-BUILT is answered.
      async reloadSessions(cache){
        if (!this.hasToken()) return;
        if (cache) return this.takeSessions(cache);
        const reg = this.regGH();
        await this.loadSessions(reg);
      },
      refreshSessions(){ window.__shell?.refreshSessions?.(); },

      configsGeneratedAt: '',   // state/configs.json's stamp, for the Repos age pill

      // ── Routes ───────────────────────────────────────────────────────────
      // The app's own destinations, dated. State is local rather than in a
      // crawl cache: the read is the hub's manifest plus one last-commit call
      // per declared carrier (about twenty, deduped by the kit), bounded and
      // cheap, and a route's code moving is not the estate-wide event the
      // activity crawl exists to catch. What it is NOT is a crawl of every
      // repo: these routes belong to one page in one repo.
      routeManifest: null,
      routeTouches: {},       // path -> { date, sha, subject, url, author }
      routeBranchFiles: [],   // [{ repo, name, pr, session, files }] from open PRs
      routesBusy: false,
      routesLoadedAt: '',
      routesTried: false,     // attempt-once guard; guards the attempt, not success
      routeJoinTried: false,  // the shared half's own guard; see loadRouteJoin
      routesError: '',
      routeGroupOpen: {},     // group key -> collapsed, for the quiet groups
      routeOpenRow: '',       // the expanded row's key; one at a time

      // 🌿 for a branch named by owner/repo, the absolute address. It was
      // called branchPageUrl until 2026-08-19, which is also the name of the
      // (row, branch) form 600 lines below, and a duplicate key in one object
      // literal is not an overload: the later definition simply won, so a
      // caller passing a repo string had it read as a session row, found no
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
      // A GitHub blob URL for a path the record captured. The record stores
      // "<checkout>/<rest>" and names the checkout's branch in `repos`; the
      // estate supplies the owner. Read at the branch the session was ON, since
      // a file opened during a session is the version that session saw, not
      // whatever main holds now; the default branch is the fallback, which is
      // the merged case.
      //
      // Empty where the checkout resolves to no estate repo, and empty is the
      // right answer: the Files pane renders a row with no link rather than one
      // that 404s.
      sessionFileUrl(row, path){
        const slash = String(path || '').indexOf('/');
        if (slash < 0) return '';
        const name = path.slice(0, slash), rel = path.slice(slash + 1);
        const full = this.entries.find(e => e.repo.endsWith('/' + name));
        if (!full || !rel) return '';
        const entry = (row.repos || []).find(x => x.name === name);
        const ref = entry && entry.branch ? entry.branch : this.defOf(full.repo);
        return 'https://github.com/' + full.repo + '/blob/' + encodeURIComponent(ref) + '/'
             + rel.split('/').map(encodeURIComponent).join('/');
      },

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
      // The archive pane. State is local and the reads are on demand, unlike
      // the three crawl caches: the shards are immutable once
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

      // Same lazy-read trap the route rows hit: touch the reactive field before
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


      // ── Routes: the app's own destinations, dated ────────────────────────
      // Read the reactive fields FIRST and unconditionally: the kit is loaded
      // lazily, so an expression that
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
      // and app/index.html's VIEWS table are held to each other by a gate, at a
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
          // Parsed here, folded in the kit: which row is the shell and which
          // vocabulary rows are the groups is the fold's own shape, and it was
          // written out three times before it was.
          this.routeManifest = window.routeActivity.manifest(
            window.Csv.rows(routesText).map(r => ({
              ...r, files: window.Csv.list(r.files), tabs: window.Csv.list(r.tabs),
            })),
            window.Csv.rows(vocabText));
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
        if (!r.on.length && !r.near.length) return null;
        // The REF, carried onto the chip. Without it a chip said "this branch is
        // working on Stage" and then walked the page you are already on to
        // Stage, which is main: the branch dropped at the one moment it was the
        // point. `?use=` pins the app's bundle to a commit, so the chip now
        // opens the view running the branch's own code.
        //
        // A SHA and not the branch name, for the reason branch-brief's tipRef
        // gives: `?use=` is interpolated straight into a raw.githubusercontent
        // path, and every branch here has a slash in its name. Where the crawl
        // has no tip, the chip keeps the in-shell navigation it always had
        // rather than minting an address that may not resolve.
        const ref = row.sha || '';
        const aim = (rt) => ({ ...rt, url: ref ? window.routeActivity.viewUrl(rt, ref) : '' });
        return { on: r.on.map(aim), near: r.near.map(aim) };
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
      routeIsOpenable(r){ return !!window.routeActivity?.openable(r); },
      openRoute(r){
        if (!this.routeIsOpenable(r)) return;
        window.__shell?.routeFromUrl?.({ view: r.key });
      },
      toggleRouteRow(key){ this.routeOpenRow = this.routeOpenRow === key ? '' : key; },
      get sessionsBusy(){ return !!window.__shell?.sessionsRefreshing; },

      // The scopes. Time-based, because how recently a session ran is the axis a
      // scan opens with; `failed` is the exception and is the reason this pane
      // can answer something search.py answers at a terminal, which is which
      // sessions fought something across the corpus at a glance.
      //
      // It read "a session has no state to be in: it ran" until 2026-08-28, and
      // that premise is gone: a session closes in a state and the row now draws
      // it. But the state is a SECOND axis rather than another scope, because
      // the question it answers is "in this window, which of these still want
      // me", and a scope row is single-select. It gets its own chips below,
      // on the repo filter's contract.
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
      // Scope, then repo. Every count on the STATE row is taken off this, so a
      // chip says how many it would leave rather than how many exist somewhere
      // else: the row narrows what is already on screen, exactly as the repo
      // chips narrow the scope above them.
      get repoScopedSessions(){
        const f = this.activeSessionRepo;
        return f ? this.scopedSessions.filter(r => (r.repos || []).some(x => x.name === f))
                 : this.scopedSessions;
      },
      get sessionRows(){
        const st = this.activeSessionState;
        const rows = this.repoScopedSessions;
        return st ? rows.filter(r => r.state === st) : rows;
      },

      // ── The state axis ───────────────────────────────────────────────────
      // Chips for the closing states actually present, on the repo filter's
      // contract: only what appears gets one, and the filter LAPSES when the
      // scope no longer holds it, so the pane never sits empty with nothing
      // lit to explain why.
      //
      // ORDERED BY THE VOCABULARY, not by count. SURFACING.md's list runs from
      // the states that want something to the states that are finished, and
      // that ordering is the only thing on the row that says a glyph column is
      // a scale rather than a palette. Sorting by frequency would put 🟣 first
      // on almost every scope and bury the handful the reader came for.
      //
      // NO CHIP FOR THE ROWS WITH NO STATE. They are not a state, they are an
      // absence of one, and two different absences at that: a session that did
      // not close in the convention's shape, and a row an older summarizer
      // built. The backfill line below says how many of the second kind there
      // are, which is the only one a refresh can fix.
      SESSION_STATE_ORDER: ['ready', 'assess', 'pending', 'choice', 'needs',
                            'attention', 'clean', 'merged', 'closed', 'short', 'retired'],
      get sessionStates(){
        const by = new Map();
        for (const r of this.repoScopedSessions)
          if (r.state) by.set(r.state, (by.get(r.state) || 0) + 1);
        return this.SESSION_STATE_ORDER
          .filter(k => by.has(k))
          .map(k => ({ key: k, count: by.get(k),
                       mark: (this.SESSION_STATE[k] || [])[0] || '',
                       note: (this.SESSION_STATE[k] || [])[1] || '' }));
      },
      get activeSessionState(){
        const f = this.sessionStateFilter;
        return f && this.sessionStates.some(s => s.key === f) ? f : '';
      },
      // How many rows in this scope predate the field, so the empty slots on
      // screen are explained by the pane rather than by each row's tooltip.
      // Only the rows a REFRESH would fix: a row at the current version that
      // still has no state is a session that did not close in the shape, and
      // no crawl will change that.
      get sessionsBehindState(){
        const V = window.RepoSessionsCache?.ROW_V;
        if (!V) return 0;
        return this.repoScopedSessions.filter(r => r.v && r.v !== V).length;
      },

      // ── What a session is called ──────────────────────────────────────────
      // One precedence, stated once and shared with the terminal: the exported
      // title if the join reached this session, the branch-derived slug
      // otherwise, and nothing at all for a session that never got a branch.
      // The fold owns it (RepoSessionsCache.labelOf) so this pane, the search
      // corpus, and search.py --name cannot drift into three answers.
      sessionLabel(row){ return window.RepoSessionsCache?.labelOf?.(row) || ''; },
      // Which of the two is on screen, and how old the title is if it is one.
      // Said in the tooltip rather than in the layout: the distinction matters
      // when you are wondering why a name reads like a slug, and never before.
      sessionLabelNote(row){
        if (row && row.title)
          return 'Session title' + (this.sessionsTitlesAt ? ', as of ' + this.sessionsTitlesAt : '')
               + '. Titles come from a dated export of the Claude sidebar, not from the record.';
        return 'Derived from the branch name; this session is not in the titles export. '
             + 'A branch slug is the title lowercased, hyphenated, and cut, so it is a prefix rather than the title.';
      },

      // ── What came of a session, as the rail already reads on a branch ────
      //
      // The rail carried ONE thing until 2026-08-27: amber where the session
      // hit a failing tool call, muted otherwise. That is a fact about how the
      // run went, and it was standing on the only 4px of colour the row has
      // while the question a reader scans this list with is what came of the
      // work. The branch tiles nested under each card already answer it, in the
      // estate's own five-state palette; the card above them said nothing.
      //
      // So the rail takes the ROLLUP of its children, in the palette every
      // branch row and every branch tile already uses (branchAccent,
      // branchTileAccent, BRANCH_STATE_MARK). Nothing new to learn: a reader
      // who knows what violet means on a branch knows what it means here, and
      // the tiles inside the card are the legend, one indent down.
      //
      // LIVE WORK OUTRANKS FINISHED WORK, which is the whole precedence. A
      // session that left one PR open and three merged is a session with
      // something still in flight, and that is what a list is scanned for.
      // Merged only after that, since most sessions here are done (329 of 398
      // branch rows on the last count), and a list where the common case is
      // loudest is a list that says nothing.
      //
      // The failure signal did not go: it moved to the FILL, which is the other
      // carrier this pane already distinguishes ("a container states its branch
      // state on a RAIL, and a nested tile states it as a FILL"). Two axes, two
      // carriers, so a snagged session that shipped reads as both at once
      // rather than one of them winning. The amber count on the control line
      // and the Snagged scope chip are unchanged and are where the number is.
      SESSION_OUTCOME_NOTE: {
        ready: 'Left an open pull request, ready for review',
        draft: 'Left a draft pull request open',
        merged: 'Its work shipped: every branch it left has merged',
        closed: 'Every branch it left was closed without merging',
        none: 'Left no branch with a pull request behind it',
        stub: 'Named by a branch commit trailer; no record in the sessions store',
      },
      sessionOutcome(n){
        if (!n || n.kind === 'stub') return 'stub';
        const states = (n.children || []).map(b => this.branchState(b));
        // First match wins, and the order IS the precedence argued above.
        for (const s of ['ready', 'draft', 'merged', 'closed'])
          if (states.includes(s)) return s;
        return 'none';
      },
      sessionAccent(n){
        const s = this.sessionOutcome(n);
        const rail = s === 'ready' ? 'border-success'
                   : s === 'draft' ? 'border-warning'
                   : s === 'merged' ? 'border-secondary/50'
                   : s === 'closed' ? 'border-error/50'
                   // A stub is an absence of knowledge rather than an outcome,
                   // so it takes the DASHED treatment branchAccent gives
                   // `unknown` for exactly the same reason: a broken line reads
                   // as "nothing established here" without spending a hue.
                   : s === 'stub' ? 'border-base-300 border-dashed'
                   : 'border-base-300';
        // ONLY MULTIPLES OF TEN in the fill. Measured 2026-08-19 against this
        // app's own stylesheet: /5, /15, /25 and /45 all compute to transparent,
        // so a step the build does not generate fails by rendering the OPPOSITE
        // of the intent. See branchTileAccent's note.
        return rail + (n?.row?.failures ? ' bg-warning/10' : ' bg-base-100');
      },
      sessionOutcomeNote(n){
        const s = this.sessionOutcome(n);
        const base = this.SESSION_OUTCOME_NOTE[s] || '';
        const f = n?.row?.failures;
        return f ? base + '. ' + f + ' tool ' + (f === 1 ? 'call' : 'calls') + ' failed in this session'
                 : base;
      },

      // ── What the session SAID it left, beside what became of its branches ─
      //
      // The rail above is a rollup of GitHub: what happened to the branches.
      // This is the session's own closing state, the marker the conventions
      // end a reply with (SURFACING.md, "Closing state"), read off the record
      // by RepoSessionsCache.closingState and carried on the row as a key.
      //
      // The two disagree usefully and that is the whole reason it is here. A
      // session whose branch merged can still close 🟢 with work named for the
      // next go, and a session that opened no PR at all closes ⚪ under a rail
      // that has nothing to say. The rail answers "what shipped"; this answers
      // "does this still want me", which is the question a list of sessions is
      // actually scanned with.
      //
      // A GLYPH, not a colour, and that is deliberate on a row that already
      // spends its colour twice (the rail on outcome, the fill on failures).
      // It is a third carrier rather than a third hue, and it is the SAME
      // glyph the reply itself ended with, so the legend is the chat the
      // reader already saw rather than anything to learn here.
      SESSION_STATE: {
        ready:     ['🟢', 'Ready to continue: work was named and available on "go"'],
        assess:    ['❇️', 'Ready to assess: a question was named, ready to investigate'],
        pending:   ['🟡', 'Pending: something was waiting on another action or an answer'],
        choice:    ['🆚', 'Choice needed: the assessment was given and the decision left open'],
        needs:     ['✴️', 'Needs you: something only you can supply blocked the next step'],
        attention: ['🟠', 'Attention: a concrete problem to address before going further'],
        clean:     ['⚪', 'Clean exit: the work here was done'],
        merged:    ['🟣', 'Merged: the branch this session was working merged'],
        closed:    ['🔴', 'Closed: the branch this session was working closed unmerged'],
        short:     ['🔵', 'Short answer: answered, with no work proposed'],
        retired:   ['⚫', 'A marker retired from the vocabulary; the reply predates it'],
      },
      // The glyph, or the ABSENCE, which the row draws too and which the slot
      // could not say when it was a span. Two absences and they are different
      // claims: a session that closed no stretch of work in the convention's
      // shape, and a row the crawl has not re-read since the field landed. The
      // Counts histogram already draws them as – and ?, so the row borrows
      // that vocabulary rather than inventing a second one, and the pane's
      // backfill line names the ? in prose.
      //
      // Faint, and that is the point of drawing them at all: the column stays
      // a column of states, the empty slots stop being a live target with
      // nothing in it, and the two reasons a slot is empty stop being one.
      sessionStateMark(row){
        const m = (this.SESSION_STATE[row?.state] || [])[0];
        if (m) return m;
        // ◌ RATHER THAN ?, and the glyph is the argument: every state in the
        // vocabulary is a filled circle, so an EMPTY circle reads as one that
        // has not been filled in yet, in the same family and at a glance. A
        // question mark reads as a loading spinner that never resolves, which
        // is how it was read the first time it shipped, and it is the wrong
        // shape for the claim: nothing is in flight, the row simply has not
        // been re-read since the field landed.
        return this.sessionRowBehind(row) ? '◌' : '–';
      },
      // Unless a crawl IS running, in which case something is in flight and a
      // spinner is the true statement rather than the decorative one. It stops
      // when the pass ends, whether or not this row was one of the ones it
      // reached, because the claim is about the crawl and not the row.
      sessionStateSpinning(row){ return this.sessionsBusy && this.sessionRowBehind(row); },
      sessionRowBehind(row){
        const V = window.RepoSessionsCache?.ROW_V;
        return !!(V && row?.v && row.v !== V);
      },
      // Empty for a row whose reply carried no marker, and empty is a claim
      // worth making carefully: it means the session did not close in the
      // convention's shape, which is true of every record before 2026-08 and
      // of a row an older summarizer built. So the note says WHY there is
      // nothing rather than leaving a blank slot to be read as a state.
      // Still the note for the STARS panel, which has no card to open and so
      // keeps a title. The row dropped its title when the glyph became a
      // control: a title attribute and a styled card fire on one hover and say
      // different things, which is the failure the rail's legend already made.
      sessionStateNote(row){
        const s = this.SESSION_STATE[row?.state];
        if (s) return s[1] + '. The session’s own closing state, read from the last reply that carried one.';
        return this.sessionRowBehind(row)
          ? 'No closing state: this row was summarised before the field existed. A refresh reads it.'
          : 'No closing state: this session did not end a reply with one.';
      },
      // The id's tooltip, and it earns its place by putting back what the
      // swap took away: `<day>-<id>` is the record's filename, and with the
      // name now sitting between the two halves they no longer read as one
      // string. So the note says the path whole, which is also the argument
      // for keeping eight hex characters on a phone row at all.
      sessionRecordNote(row){
        const path = window.RepoSessionsCache?.pathOf?.(row) || '';
        return 'Open this session here; swipe or arrow through the list.'
             + (path ? ' Record: ' + path : '');
      },

      // What the reply card calls itself, which is a claim about FIDELITY and
      // not decoration. Two states now that the cap is gone: a schema-1-to-3
      // record never held the assistant's prose, so what comes back is the
      // recorder's 500-character tail of the final turn, and everything else
      // is the closing reply entire.
      replyLabel(row){
        return row?.replyCut === 'tail' ? 'final turn, tail only' : 'closing reply';
      },

      // ── The reply card, as a transcript ────────────────────────────────
      // The card renders through chatRender.message, the deck's own turn
      // renderer, so the two surfaces cannot drift in appearance the way the
      // hand-built version already had. What it is handed is three things in
      // one list: the opening ask, the scroll back the cache kept, and the
      // closing reply, each a {role, md, ts} the renderer already understands.
      //
      // `collapse: 0` turns off chat-render's 460px height clamp. The opening
      // ask and the scroll back are already bounded by the cache (ASK_CHARS,
      // TURN_HEAD), so clamping them would cut a short turn again and offer to
      // expand what is not there. The closing reply is unbounded here and
      // deliberately unclamped: it is the one thing the card is opened for, and
      // the card's own max-h scrolls.
      // ── The states card's turns ──────────────────────────────────────────
      // Every state this session closed a stretch of work in, chronological,
      // so the card opens on the newest and reads back the way the reply card
      // does. Rendered as assistant turns through the deck's own renderer: the
      // passage already opens with its glyph and bold lead, so no label is
      // added, which would name the state twice on every entry.
      //
      // It is NOT a transcript. What sits between two of these is the work,
      // and that is the reply card one control to the right; this is the
      // session's own account of where it kept arriving.
      stateTurns(row){
        return (row?.states || []).map(([, t, ts, dropped]) => ({
          role: 'assistant', md: String(t || ''), ts: ts || '', dropped: dropped || 0,
        }));
      },
      replyTurns(row){
        const out = [];
        const ask = String(row?.ask || '').trim();
        if (ask) out.push({ role: 'user', md: ask, ts: row.askAt || '' });
        for (const [k, t, ts, dropped] of row?.turns || []) {
          out.push({ role: k === 'u' ? 'user' : 'assistant', md: String(t || ''),
                     ts: ts || '', dropped: dropped || 0 });
        }
        const reply = String(row?.reply || '').trim();
        if (reply) {
          out.push({
            role: 'assistant', md: reply, ts: row.replyAt || '',
            // The one place the card says something the deck would not: which
            // fidelity this text is. A 500-character recorder tail and a whole
            // closing reply are not the same claim, and the label is what says
            // so where the prose cannot. The role is NOT in it: dense mode
            // keeps the icon beside the label and the indent under it, so a
            // "Assistant · closing reply" lead would name the role twice on
            // the one turn that already has the most to say for itself.
            label: this.replyLabel(row),
          });
        }
        return out;
      },
      // Mounts them. Guards on the card key so the effect that drives it does
      // not rebuild the same transcript on every unrelated reactive read, which
      // would throw away the reader's scroll position mid-scroll.
      //
      // The guard is a MODULE-SCOPE cell, not a field on this component, and
      // that is not a style choice. x-effect re-runs whenever any reactive
      // property it touched changes; a field on the data object is reactive, so
      // writing the guard from inside the effect re-triggers the effect that
      // wrote it, and the test suite hung. Off the object it is invisible to
      // the tracker and the guard does its job.
      async mountReplyCard(card){
        const host = this.$refs.replyBody;
        if (!host || !card) return;
        if (replyMounted === card.key) return;
        replyMounted = card.key;
        try {
          if (!window.chatRender) await window.gh?.load('kits/chat-render.js');
          await window.chatRender.ready();
        } catch { replyMounted = null; return; }
        // The card may have been closed or swapped while marked was loading.
        if (this.rowCard?.key !== card.key || !host.isConnected) return;
        host.replaceChildren();
        // Said BEFORE the first turn, because that is where the reader who
        // scrolled to the top is asking the question: is this the beginning of
        // the session, or the beginning of what fits?
        if (card.staleV) host.append(this._replyFoot(
          'this row was summarised by an older pass (version ' + card.staleV + ' of '
          + window.RepoSessionsCache.ROW_V + '), so its turns are cut shorter than they are now.'
          + ' Press Refresh on this pane.'));
        if (card.priorCut) host.append(this._replyFoot(
          card.priorNote
          || ('earlier turns not kept. The card holds the last '
              + (window.RepoSessionsCache?.TURNS_KEPT || 20)
              + '; the whole conversation is in the session.')));
        // The cut note sits under the TURN it is about, not at the foot of the
        // card. At the foot it read as a claim about the whole session, which
        // is the same confusion the header's old "closing reply, trimmed"
        // label caused: a fact about one turn, placed where it titles all of
        // them. And it says HOW MUCH, since an ellipsis alone is the
        // difference between a summary and a teaser.
        // THE RHYTHM IS THE CARD'S, the turn's insides are the renderer's.
        // A uniform gap makes eleven turns read as eleven items; an ask and
        // the reply under it are ONE exchange, and spacing them as one is
        // what lets a reader find the questions by scanning rather than by
        // reading. So a reply sits close under its ask and the next ask opens
        // a gap. `dropped` rides on the turn now: the renderer puts it on the
        // last line of the text, where it is a fact about that sentence,
        // rather than under the turn where it read as a footnote.
        let prev = '';
        for (const t of card.turns) {
          const msg = window.chatRender.message(t, { collapse: 0, dense: true });
          if (prev) msg.className += t.role === 'user' ? ' mt-3.5' : ' mt-1.5';
          prev = t.role;
          host.append(msg);
        }
        this.$nextTick(() => this.pinRowCard(true));
      },
      // The two notes that are about the CACHE rather than the conversation, in
      // the one voice: what was cut and where the whole of it lives. Built here
      // rather than templated because they sit inside a host this code owns.
      // Both are CARD notes, standing above the first turn and flush with the
      // ask text below, which since the rails came off is the card's left edge.
      // A note about one TURN is no longer one of these: `dropped` rides on the
      // turn and chat-render puts it on the last line of that turn's own text.
      //
      // /60, not /40. At /40 it read as something being hidden rather than
      // something being told, which is the wrong voice for the one line that
      // says what is missing. Multiples of ten only: /45 and /55 compute to
      // transparent against this app's stylesheet, so an off-step renders at
      // FULL strength. npm run opacity-scan is the gate.
      _replyFoot(text){
        const el = document.createElement('p');
        el.className = 'text-[10px] text-base-content/60 leading-snug mb-2';
        el.textContent = '… ' + text;
        return el;
      },

      // A session's own address, 💬 pages/session.html, which takes the short id
      // and resolves it against the store by suffix match. The pane's other
      // route into a session (tapping the id) is an in-app takeover with no
      // address, so this is the only form that survives being sent to somebody.
      sessionPageUrl(row){
        return 'https://mehrlander.github.io/web-tools/pages/session.html#id=' + (row?.id || '');
      },
      // The pointer, folded in the kit (RepoSessionsCache.pointerOf) because it
      // is a pure function of the row and belongs where pathOf and nameOf are.
      // The shell supplies the two things the kit deliberately does not decide:
      // which store this estate reads, and how a duration reads.
      copySessionPointer(row){
        const S = window.RepoSessionsCache;
        if (!S?.pointerOf) return;
        return this.copyText(
          S.pointerOf(row, { store: this.registry(), dur: this.durLabel(row.mins) }),
          'Session pointer copied');
      },
      durLabel(mins){
        if (!mins) return '';
        return mins < 60 ? mins + 'm' : Math.floor(mins / 60) + 'h' + (mins % 60 ? (mins % 60) + 'm' : '');
      },
      topToolsLabel(row){
        const t = (row.tools || []).map(([n, c]) => n + ' ' + c).join(', ');
        return row.calls + ' tool calls' + (t ? ' · ' + t : '');
      },
      // Two fixes in one line, and the second is why the first was needed.
      //
      // The SEPARATOR was '\\n', a literal backslash and an n, so the busiest
      // files ran together on one line with the escape showing between them.
      // That escaping is right INSIDE this component's template literal, where
      // two other titles use it correctly, and wrong out here in a plain
      // method: the double backslash came along when the label moved out.
      //
      // And "opened" is the exact word that is still read as "read", so the
      // label now says what the count cannot: four file tools are counted and
      // a shell read is not, which means the figure can be low for a session
      // that read a great deal. The deck's closing card and session.html's
      // strip carry the same caveat; this row showed the figure without it.
      filesLabel(row){
        const f = (row.files || []).map(([p, n]) => n + '× ' + p).join('\n');
        return row.filesTotal + ' files opened by Read, Edit, Write or NotebookEdit'
          + ' (a file read through a shell command is not counted)'
          + (f ? ':\n' + f : '');
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
      // ── The session deck: the pane's own swiper ──────────────────────────
      //
      // The exact counterpart of openBranchDetail 1,400 lines down, and written
      // against it deliberately: one slide per session, each mounting the
      // sessionBrief component directly in this shell's Alpine, swiping through
      // the list the reader tapped in from.
      //
      // What it closes is an asymmetry, not a gap in isolation. The two panes
      // implemented opposite halves of one model. A branch had the peer swipe
      // and reached its files two levels down; a session had its turns on the
      // first tap and no brief in the app at all, so the one surface that
      // answers "what happened in this session" was a separate page reachable
      // only through a new tab. Both rows now read the same way: the name goes
      // ACROSS, the cards button goes IN.
      //
      // This does NOT reinstate the row expansion that openSession's own note
      // calls a mistake. That surface sat BEFORE the conversation, so reading
      // cost two taps through something nobody asked for; this one sits BESIDE
      // it, and the cards button on the row is the direct route the expansion
      // never left in place. The note's second objection, two detail surfaces
      // to keep honest, was already spent: pages/session.html has been the
      // second one since it shipped, and it is now the same component as this,
      // so there is one definition rather than two.
      sessionDeck: null,   // { rows, i }: the list as tapped, frozen, and the position
      _sDeck: null,

      // The sequence to swipe through: the records the visible list is showing,
      // in the order it shows them. Stubs are excluded rather than rendered as
      // empty slides, since a stub is a session with no record and there is
      // nothing for a brief to read.
      get sessionDeckRows(){
        return this.sessionNodes.filter(n => n.kind === 'record' && n.row).map(n => n.row);
      },
      get sessionDeckRow(){
        return this.sessionDeck ? this.sessionDeck.rows[this.sessionDeck.i] : null;
      },

      openSessionDetail(row, siblings){
        if (!row) return;
        // Opening REPLACES an open deck rather than stacking a second one, for
        // the reason openBranchDetail states at length: two decks of the same
        // kind is not a level, it is the same level twice, and the reader would
        // have to Back through one they never asked for. drop() tears it down
        // without touching history and the replacement reuses its entry.
        const replacing = !!this._sDeck;
        if (this._sDeck) { const old = this._sDeck; this._sDeck = null; old.drop(); }
        const rows = [...(siblings && siblings.length ? siblings : this.sessionDeckRows)];
        const i = rows.findIndex(r => r.id === row.id);
        // A row the visible list does not hold (a deep link into a scope the
        // filter hides) still opens, as a list of one. A link that resolves to
        // nothing is worse than a link with nowhere to swipe.
        this.sessionDeck = i >= 0 ? { rows, i } : { rows: [row], i: 0 };
        this.stampSession();
        this.mountSessionDeck(replacing);
      },

      async mountSessionDeck(replace){
        const rows = this.sessionDeck?.rows || [];
        if (!rows.length) return;
        // The chain a session view needs, pulled on first use rather than owed
        // to this shell's boot: a visit that never opens one pays for none of
        // it, and the pre-build's inlined cache serves every one with no
        // network trip. Order runs bottom-up, each reaching the one above it.
        //
        // The COMPONENT is not in this list and does not need to be: the
        // pre-build auto-boots every alpineComponent, so sessionBrief is
        // registered before this shell runs. Its kits are not, which is the
        // same split branch-brief documents, and a slide mounted without
        // window.sessionRender renders a spinner that never resolves.
        try {
          for (const k of ['kits/swipe-deck.js', 'kits/proof.js', 'kits/chat-render.js',
                           'kits/session-render.js', 'kits/session-export.js']) {
            await gh.load(k);
          }
        } catch (e) { console.warn('session deck:', e?.message || e); return; }
        if (!this.sessionDeck) return;                   // closed while loading

        const store = this.registry();
        // Two either side, the same reading-ahead branch-brief does: the next
        // record is already in flight when the reader swipes.
        const near = (i) => [rows[i - 1], rows[i + 1]].filter(Boolean)
          .map(r => ({ id: r.id, day: r.day }));
        const keys = [];
        // Consumed HERE and cleared at once, so a `&pane=` or `&card=` is what
        // one link asked for and not a mode the deck stays in. Same seam, same
        // clearing, as the branch deck's `_openFiles`.
        const openAt = this._openCard; this._openCard = null;
        const render = (i, slide) => {
          const r = rows[i];
          if (!r) return;
          const key = keys[i] = '__sessionSlide_' + (this._sSeq = (this._sSeq || 0) + 1);
          // The options travel through a keyed global rather than being written
          // into the x-data attribute, for the reason cardOpts documents: inside
          // an x-data expression Alpine puts every registered component name in
          // scope, so a bare `repo` would resolve to the repo DATA PROVIDER
          // rather than to a string.
          window[key] = {
            id: r.id, day: r.day, repo: store, framed: true,
            // A record's file paths are checkout-prefixed and name no owner, so
            // the store cannot link them and this is the only place that can:
            // the estate knows which owner/repo each checkout is, and the row
            // knows which branch the session was on there.
            fileHref: (path) => this.sessionFileUrl(r, path),
            // Only the slide the address named opens on a pane it did not
            // choose, the same rule the branch deck applies to its own
            // `_openFiles` seam and for the same reason.
            ...(openAt && i === this.sessionDeck?.i ? openAt : {}),
            // The whole row, lent so the slide's title and facts strip are
            // right in its first frame rather than after the record lands.
            // Provisional by contract: the record overwrites every one of them.
            facts: { ...r, title: this.sessionLabel(r) },
            warm: near(i),
            onMeta: (m) => this.onSessionSlideMeta(i, m),
          };
          const el = document.createElement('div');
          el.className = 'h-full overflow-y-auto';
          el.setAttribute('x-data', `sessionBrief(window.${key})`);
          slide.append(el);
          window.Alpine.initTree(el);
        };

        this._sDeck = window.swipeDeck.open({
          count: rows.length, start: this.sessionDeck.i, render, replace: !!replace,
          slideScroll: false,
          innerClass: 'h-full w-full min-w-0',
          // Emptying the slide is enough for Alpine to destroy the view, but
          // the options object would outlive it on `window` and keep the row,
          // its warm list and this component's closure reachable.
          release: (i) => { if (keys[i]) { delete window[keys[i]]; keys[i] = null; } },
          ...this.sessionChrome(this.sessionDeck.i),
          index: (i) => {
            const c = this.sessionChrome(i);
            return { title: c.title || '', subtitle: c.subtitle || '', icon: c.icon };
          },
          actions: [{ icon: 'ph-link', title: 'Copy a link that opens this session here',
                      onClick: () => this.copySessionDeckLink() }],
          onClose: () => {
            this._sDeck = null;
            if (this.sessionDeck) { this.sessionDeck = null; this.stampSession(); }
          },
        });
        this._sDeck.deck.onSlide((i) => this.onSessionDeckSlide(i));
      },

      onSessionDeckSlide(i){
        if (!this.sessionDeck || i === this.sessionDeck.i) return;
        this.sessionDeck = { ...this.sessionDeck, i };
        this.stampSession();                             // the address follows the swipe
        const c = this.sessionChrome(i);
        this._sDeck?.setTitle?.(c.title);
        this._sDeck?.setSubtitle?.(c.subtitle);
        this._sDeck?.setLink?.(c.link || null);
      },

      // What the header says about a row before its record has been read. The
      // name, the day and the id are all on the row; the Claude session link is
      // too, for every record written since 2026-08-07, and onSessionSlideMeta
      // fills it in for the rest.
      sessionChrome(i){
        const r = (this.sessionDeck?.rows || [])[i];
        if (!r) return {};
        return {
          title: this.sessionLabel(r) || r.id,
          subtitle: [r.day, r.id].filter(Boolean).join(' · '),
          icon: 'ph-terminal-window',
          link: r.agent ? { href: r.agent, title: 'Open this session in Claude Code',
                            svg: window.claudeMark?.svg?.({ cls: 'w-6 h-6 shrink-0' }) } : null,
        };
      },
      onSessionSlideMeta(i, m){
        if (!this._sDeck || !this.sessionDeck || i !== this.sessionDeck.i || !m) return;
        // The title moves only for a session the LIST could not name. A record
        // has no title of its own, so sessionRender.describe falls back to the
        // opening ask, which is a sentence: in a header it truncates to a
        // clause and reads differently on every slide. The row's own label (the
        // exported title, or the branch-derived slug) is short and stable and
        // is what the reader just tapped, so it holds unless there is none.
        const r = (this.sessionDeck.rows || [])[i];
        if (m.title && !this.sessionLabel(r)) this._sDeck.setTitle(m.title);
        if (m.agent) this._sDeck.setLink({ href: m.agent, icon: 'ph-terminal-window',
                                           title: 'Open this session in Claude Code',
                                           svg: window.claudeMark?.svg?.({ cls: 'w-6 h-6 shrink-0' }) });
      },

      closeSessionDetail(){
        const d = this._sDeck;
        this._sDeck = null;
        this.sessionDeck = null;
        this.stampSession();
        if (d) d.close();
      },

      // ── The session swiper's address ─────────────────────────────────────
      // `&session=<id>` while it is open, dropped when it closes, so Back
      // leaves the deck rather than the view. The id alone is the whole spec:
      // it is the record's filename stem and every surface that resolves a
      // session takes it, pages/session.html's #id= included.
      stampSession(){
        window.__shell?.setSession?.(this.sessionDeckRow?.id || '');
      },
      sessionDeckLink(){
        const r = this.sessionDeckRow;
        if (!r) return '';
        const p = new URLSearchParams(location.search);
        p.set('view', 'sessions');
        p.set('session', r.id);
        return location.origin + location.pathname + '?' + p.toString();
      },
      async copySessionDeckLink(){
        const url = this.sessionDeckLink();
        if (!url) return;
        return this.copyText(url, 'Link to this session copied');
      },
      // Consume a `&session=` on the first load that has rows to match against.
      // Same two-lookup shape openDetailFromUrl uses and for the same reason:
      // the upgrade guard asks whether the VISIBLE list now holds this session,
      // since a sequence to swipe through is exactly what the visible list is,
      // and the open asks for the best row anyone has. Collapsing them would
      // re-open the deck on every stamp of its own address.
      _sessionFromUrl: false,
      _openCard: null,
      openSessionFromUrl(){
        const id = new URLSearchParams(location.search).get('session');
        if (!id) return;
        const inList = this.sessionDeckRows.find(r => r.id === id);
        if (this._sessionFromUrl) {
          if (!this.sessionDeck || this.sessionDeck.rows.length > 1 || !inList) return;
          if (this.sessionDeckRow?.id !== id) return;
        }
        this._sessionFromUrl = true;
        // The two keys pages/session.html would take, so one address opens the
        // session here or there. `&card=` is the session's answer to the branch
        // side's `&file=`: it makes ONE exchange addressable, which is what a
        // caption pointing at the moment a decision was made needs.
        const p2 = new URLSearchParams(location.search);
        const pane = p2.get('pane'), card = parseInt(p2.get('card'), 10);
        if (['outline', 'files', 'raw'].includes(pane) || Number.isInteger(card)) {
          this._openCard = { ...(['outline', 'files', 'raw'].includes(pane) ? { pane } : {}),
                             ...(Number.isInteger(card) ? { start: card } : {}) };
        }
        const row = inList || this.allSessionRows.find(r => r.id === id) || { id };
        this.openSessionDetail(row);
      },

      // The join to the Branches pane: filter that list to this session's repo
      // and switch panes. It filters by REPO rather than jumping to the branch
      // row, because the branch may have merged and left the Open list while
      // the session that made it stays here forever.
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
      // The reader's window, off the shell so the URL is the state, rather
      // than a second copy to keep in sync.
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

      // One branch row by identity, looked up past the scope, the window and
      // the repo filter. A LINK that names a branch is not a claim about what
      // the reader is currently looking at, so resolving it through `openRows`
      // answered the wrong question: the default scope is Recent inside a
      // one-day window, and an open PR from last month sits outside it. The
      // takeover then fell back to a bare {repo, name}, which carries no
      // default branch (so its compare asked for `compare/...branch` and
      // 404'd) and no sessions (so the Claude mark had nothing to render).
      // Measured on web-tools #293, whose cached PR row held the session all
      // along. A row genuinely absent from the cache still returns null, and
      // the callers keep their bare fallback for it.
      branchRowFor(repo, name){
        return this.allBranchRows.find(r => r.repo === repo && r.name === name) || null;
      },
      // The default branch a row is measured against. `def` rides every row
      // allBranchRows builds; this is for the rows nothing built.
      defOf(repo){ return this.activity?.[repo]?.defaultBranch || 'main'; },

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
        // Children group by branch NAME, newest name first, repos alphabetical
        // inside it. A session working one name across four repos is the
        // ordinary shape here, and date order alone interleaved those repos
        // with whatever else the session touched, so one name appeared three
        // times down the stack with strangers in between. Grouping is as far as
        // this goes: each repo-branch keeps its own row, because each has its
        // own PR, its own state and its own diff, and collapsing them would
        // hide exactly the differences worth seeing.
        const groupByName = (rows) => {
          const newest = new Map();
          for (const b of rows) {
            if ((b.date || '') > (newest.get(b.name) || '')) newest.set(b.name, b.date || '');
          }
          return [...rows].sort((a, b) =>
            (newest.get(b.name) || '').localeCompare(newest.get(a.name) || '')
            || a.name.localeCompare(b.name)
            || a.repo.localeCompare(b.repo));
        };
        for (const n of nodes.values()) n.children = groupByName(n.children);
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
        const st = this.activeSessionState;
        return this.sessionTree.nodes.filter(n =>
          this.nodeInSessionScope(n, this.sessionScope)
          && (!f || this.nodeInRepo(n, f))
          // A stub has no record, so it has no state to match. It drops out
          // under a state filter rather than riding along unfiltered: the
          // filter is a claim about what these rows are, and a row that cannot
          // answer it does not belong in the answer.
          && (!st || n.row?.state === st));
      },
      // The orphans, narrowed by the repo chip only: a scope is about when a
      // SESSION ran, and these have no session to have run.
      get sessionOrphans(){
        const f = this.activeSessionRepo;
        return this.sessionTree.orphans.filter(b => !f || this.repoShort(b.repo) === f);
      },
      // What the join reached. It used to be a line beside the lens tabs, and
      // the count was never the reader's question: "389 of 409 branches
      // placed" explains the machinery of a join to someone who came to see
      // what they had been working on. The Counts lens is where that number
      // means something, since the histograms it draws ARE the join, so the
      // full sentence stays there and the standing label is gone.
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
      // ── How the estate's sessions END ────────────────────────────────────
      // The third histogram, and the only one of the three that counts
      // something a session SAID rather than something it committed. Over the
      // vocabulary's own order, not by count, for the reason the chips are:
      // the order runs from wanting something to finished, so the bars read as
      // a distribution along that scale.
      //
      // Two rows the other histograms have no analogue for, and both are
      // absences rather than states, which is why they sit under a rule at the
      // bottom instead of taking a bar in the ordering: a session that did not
      // close in the convention's shape, and a row summarised before the field
      // existed. Only the second is a gap a refresh closes, and keeping them
      // apart is the whole point of drawing them at all.
      get lensClosingStates(){
        const V = window.RepoSessionsCache?.ROW_V;
        const rows = this.allSessionRows;
        const by = new Map();
        let none = 0, behind = 0;
        for (const r of rows) {
          if (r.state) by.set(r.state, (by.get(r.state) || 0) + 1);
          else if (V && r.v && r.v !== V) behind++;
          else none++;
        }
        const bars = this.SESSION_STATE_ORDER.filter(k => by.has(k))
          .map(k => ({ key: k, n: by.get(k),
                       mark: (this.SESSION_STATE[k] || [])[0] || '',
                       note: (this.SESSION_STATE[k] || [])[1] || '' }));
        const top = Math.max(1, ...bars.map(b => b.n), none, behind);
        const pct = n => Math.round((n / top) * 100);
        return {
          bars: bars.map(b => ({ ...b, pct: pct(b.n) })),
          none: { n: none, pct: pct(none) },
          behind: { n: behind, pct: pct(behind) },
          read: rows.length - none - behind,
          total: rows.length,
        };
      },
      get lensStars(){
        return this.allSessionRows
          .map(r => ({ id: r.id, day: r.day, mins: r.mins, ask: r.ask,
                       // The row's own identity pair, so the panel below the
                       // field reads the way a list row does rather than
                       // inventing a second way to name a session.
                       label: this.sessionLabel(r), state: r.state, v: r.v,
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
        return s === 'ready' ? 'border-success bg-success/10'
             : s === 'draft' ? 'border-warning bg-warning/10'
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
             : s === 'merged' ? 'border-secondary/40 bg-secondary/10'
             : s === 'closed' ? 'border-error/40 bg-error/10'
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
      // The same vocabulary as branchAccent, at tile strength: the Sessions
      // pane's nested branches are surfaces rather than rows behind a rail, so
      // the state has to arrive as a tint and a hairline instead of as a
      // 4px stripe. Same hues, same meanings, and the same DASHED treatment for
      // `unknown`, which is the one state that is an absence of knowledge
      // rather than an outcome and would otherwise be indistinguishable from
      // `nopr` here exactly as it was in the branch list before the rail
      // carried it.
      //
      // ONLY MULTIPLES OF TEN. Measured 2026-08-19 against this app's own
      // stylesheet: bg-success/10, /15, /25 and /45 all compute to transparent,
      // and text-base-content/40 to full strength, so a step the build does not
      // generate fails by rendering the OPPOSITE of the intent rather than by
      // rendering nothing. The bracket form (/[5%]) does not generate either.
      // That is why these fills are /10 while branchAccent's rail rows still
      // carry a /5 that has never drawn; raising those changes how the Branches
      // pane looks, which is a separate decision from this one.
      //
      // It also settles the level: a container states its branch state on a
      // RAIL, and a nested tile states it as a FILL. Two levels, two carriers,
      // so a tinted tile inside a railed card never reads as one surface.
      branchTileAccent(row){
        const s = this.branchState(row);
        // A FILL is for live work. Merged is finished, and a session's tiles
        // are merged four times out of five (329 of 398 branch rows), so
        // filling them violet paints the common case loudest and leaves the
        // open branch competing with it. Merged keeps the hue on its border and
        // its glyph and gives up the fill; closed keeps a fill, because a
        // branch closed unmerged is the one that wants a second look.
        return s === 'ready' ? 'border-success/40 bg-success/10'
             : s === 'draft' ? 'border-warning/40 bg-warning/10'
             : s === 'merged' ? 'border-secondary/30 bg-base-200/50'
             : s === 'closed' ? 'border-error/40 bg-error/10'
             : s === 'unknown' ? 'border-base-300 border-dashed bg-base-200/50'
             : 'border-base-300/60 bg-base-200/50';
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
      // The half of a branch name that distinguishes it. One definition, shared
      // by the row and by deckChrome's header, so a reader who learns the short
      // form in one place reads the same string in the other.
      branchShort(name){ return String(name || '').split('/').pop() || String(name || ''); },
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
      // The reply card is WIDER than the other four, and it is the only one
      // that should be. They are lists of short rows (a tool name and a count)
      // where 384 is generous; this one is a conversation rendered at the
      // deck's own scale, and prose in a 384px column broke a sentence every
      // six or seven words. Bounded by the panel's own
      // max-w-[calc(100vw-1rem)], so a phone is unaffected.
      REPLY_CARD_W: 560,
      rowCard: null,        // { repo, name, base, cls, count, shape, lines }
      rowCardAt: null,      // { x, y } from the shell's shared anchor geometry
      rowCardRead: null,    // { key, loading, error, noBase, files }

      rowCardKey(repo, name, base){ return repo + '@' + name + '...' + (base || ''); },
      // ── How tall a row card is allowed to be, stated ONCE ────────────────
      // It was a max-h-[60vh] class on the panel and a separate 60vh passed to
      // anchorMenu, and the two disagreeing is exactly the defect this pane
      // just shipped: the anchor believed a nine-row estimate, put the card at
      // 530 in an 800px viewport, and a fifth of it fell below the fold. Two
      // numbers for one height is the shape of that bug, so there is one now
      // and both readers take it from here.
      //
      // Half the viewport, and never more than 480px. The fraction keeps it a
      // CARD on a phone rather than a takeover; the pixel ceiling is what stops
      // a tall desktop monitor turning 60vh into an 840px wall of prose. What
      // does not fit scrolls, and the deck is a tap away for the whole thing.
      CARD_MAX_VH: 0.5,
      CARD_MAX_PX: 480,
      rowCardMaxH(){
        return Math.min(Math.round(window.innerHeight * this.CARD_MAX_VH), this.CARD_MAX_PX);
      },
      // Position, height and now WIDTH, all inline, all off the constants the
      // anchor is given. `min()` against the viewport keeps the phone clamp the
      // class used to carry; fit-content is what lets a two-line card be a
      // two-line card instead of an empty 35rem box.
      get rowCardStyle(){
        const at = window.__shell?.menuStyle?.(this.rowCardAt) || 'left:-9999px;top:-9999px';
        const w = this.rowCard?.kind === 'prose' ? this.REPLY_CARD_W : this.ROW_CARD_W;
        return at + ';max-height:' + this.rowCardMaxH() + 'px'
          + ';max-width:min(' + w + 'px, calc(100vw - 1rem))'
          // A floor for the list cards, whose rows are label-then-count and
          // read as a ragged pair without one. Prose has no floor: a short
          // state is meant to make a short card.
          + (this.rowCard?.kind === 'prose' ? '' : ';width:' + w + 'px');
      },
      // A SNAPSHOT, not the row: allBranchRows rebuilds on every refresh, so a
      // held row would go stale under an open card. Everything the head and the
      // shape need is copied in; the list arrives from the read below.
      // The row's card, in two kinds. `files` opens over one of the three file
      // counts; `commits` opens over one of the two arrows, which said only
      // "commits ahead of / behind main" in a title attribute nobody on a phone
      // could reach. One panel, one anchor, one hover rule, two bodies.
      // The branch row's cards answer to the same toggle, and to one identity.
      // The hover guard used to compare the branch NAME and the class, which
      // matches across repos: two repos on one branch name (the ordinary shape
      // here) had one card that would not reopen when you moved between them.
      // The key carries the repo, so both the guard and the toggle are exact.
      branchCardKey(row, cls){ return 'branch:' + row.repo + '/' + row.name + ':' + cls; },
      openRowCard(row, cls, ev){
        if (this.rowCardToggled(this.branchCardKey(row, cls))) return;
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
          kind: 'files', key: this.branchCardKey(row, cls),
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
          kind: 'commits', key: this.branchCardKey(row, dir),
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
        // The odd one: prose rather than a count, so it renders through the
        // `prose` body below and its header shows no number.
        reply:  { icon: 'ph-quotes',       label: 'closing reply' },
        // The second prose card, and the same machinery: the glyph on the row
        // is the last frame of a sequence, so opening it opens the sequence.
        state:  { icon: 'ph-flag-pennant', label: 'closing states' },
      },
      openSessionCard(row, cls, ev){
        const spec = this.SESSION_CARD[cls];
        if (!spec) return;
        if (this.rowCardToggled('session:' + row.id + ':' + cls)) return;
        window.__shell?.closeRepoMenu?.();
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
        } else if (cls === 'state') {
          const S = window.RepoSessionsCache;
          const turns = this.stateTurns(row);
          this.rowCard = {
            kind: 'prose', key: 'session:' + row.id + ':state',
            cls, icon: spec.icon, unit: ['state', 'states'],
            label: spec.label,
            turns,
            // Dropped off the FRONT, same claim and same note as the reply
            // card's: a reader who scrolled to the top is asking whether that
            // is the first state or the first one kept.
            priorCut: row.statesCut === 'cut',
            priorNote: 'earlier states not kept. The card holds the last '
                     + (S?.STATES_KEPT || 12) + '; the whole sequence is in the session.',
            staleV: row.v && S && row.v !== S.ROW_V ? row.v : 0,
            // The empty case is a claim, not a blank: this session did not
            // close a single stretch of work in the convention's shape, or the
            // row predates the field. The row's slot says the same thing by
            // being empty, and a reader who taps it is asking which.
            pending: !turns.length,
            pendingNote: row.v && S && row.v !== S.ROW_V
              ? 'This row was summarised before the states were read. Press Refresh on this pane.'
              : 'This session ended no reply with a closing state.',
            shape: { exts: [], dirs: [] },
          };
          replyMounted = null;
          this.rowCardAt = window.__shell?.anchorMenu?.(ev, 9, {
            width: this.REPLY_CARD_W, align: 'left', height: this.rowCardMaxH(),
          }) || null;
          this.$nextTick(() => this.pinRowCard(true));
          return;
        } else if (cls === 'reply') {
          const S = window.RepoSessionsCache;
          // A CARD, not a title attribute. The reply runs to 600 characters and
          // arrives with a label saying which fidelity it is; a native tooltip
          // renders none of that, waits a second to appear, and cannot be
          // reached on a phone at all. This is the same panel every count on
          // this row already opens, so the row gained a styled tooltip without
          // gaining a mechanism.
          // OPENS ON THE ASK ALONE, not only where a reply exists, and that is
          // the fix for the way this first shipped. Gated on `row.reply` the
          // line did nothing at all on a row whose cache predates the field,
          // which is most of the store until the crawl has run twice: the
          // reader hovers the one line that looks like it has more to say and
          // gets silence, with no way to tell a missing feature from a missing
          // field. Now every ask opens, the full ask is the floor (the row
          // truncates it), and the absence of a reply is stated rather than
          // performed.
          const reply = String(row.reply || '').trim();
          this.rowCard = {
            kind: 'prose', key: 'session:' + row.id + ':reply',
            cls, icon: spec.icon,
            label: reply ? this.replyLabel(row) : 'opening ask',
            // The whole card, as turns the deck's renderer understands: the
            // ask, the scroll back, the closing reply. See replyTurns.
            turns: this.replyTurns(row),
            priorCut: row.turnsCut === 'cut',
            // Whether this ROW is behind the summarizer, which is a fact the
            // card is uniquely placed to state and until now did not. A row
            // built by an older pass carries older text: shorter turns, a
            // capped reply, a different parse. On screen it is indistinguishable
            // from a current one, so a reader looking at a reply the old cap
            // cut at 600 characters reads it as the whole answer. Three
            // separate reports have come back to this. The crawl heals 120
            // records a pass, so a store this size spends real time half
            // healed and the card should say which half a row is in.
            staleV: row.v && S && row.v !== S.ROW_V ? row.v : 0,
            // Why there is no reply here, which is a fact about the CACHE ROW
            // and not about the session: `reply` arrived with ROW_V 5 and
            // `turns` with 6, and one crawl pass reads 120 records.
            pending: !reply,
            shape: { exts: [], dirs: [] },
          };
          replyMounted = null;   // a new card, so the effect must rebuild
          // Its own height, not a row count. This panel is a scrolling
          // transcript, so anchorMenu cannot infer its height the way it does
          // for a list of menu rows; rowCardMaxH is the same number the panel's
          // own max-height is set from.
          this.rowCardAt = window.__shell?.anchorMenu?.(ev, 9, {
            width: this.REPLY_CARD_W, align: 'left', height: this.rowCardMaxH(),
          }) || null;
          // Opens at the BOTTOM. The closing reply is what the header names
          // and what the card is opened for, and it now sits under a scroll
          // back of up to twenty turns. A chat opens on the last message for
          // the same reason; reading back is the deliberate move.
          this.$nextTick(() => this.pinRowCard(true));
          return;
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
        const key = 'session:' + row.id + ':' + cls;
        if (this.rowCard?.key === key) return;
        // Re-checked at FIRE time, not only here: between the two, a click may
        // have opened this very card, and a hover that then called the opener
        // would toggle it shut. The opener clears this timer too; the guard is
        // the second lock on the same door.
        this._fcOpenT = setTimeout(() => {
          if (this.rowCard?.key !== key) this.openSessionCard(row, cls, el);
        }, shell.HOVER_OPEN_MS);
      },
      // Stick to the bottom while the reader is already there, and stop the
      // moment they scroll up. The card grows after it opens, since each turn's
      // markdown lands on its own microtask, so a one-shot scroll would be
      // undone by the next render; and a card that yanked itself back down
      // while someone was reading history would be worse than never pinning.
      pinRowCard(force){
        const el = this.$refs.rowCardBox;
        if (!el) return;
        if (!force && el.scrollHeight - el.scrollTop - el.clientHeight > 4) return;
        el.scrollTop = el.scrollHeight;
      },
      closeRowCard(){ this.rowCard = null; this.rowCardAt = null; this.cancelRowCardClose(); },
      // ── Tap the trigger again and the card goes ──────────────────────────
      // It arrives on a tap, so it should leave on one. Until now the only
      // ways out were tapping somewhere neutral (click.outside) or, on a fine
      // pointer, moving away; on a phone that means a panel with no visible
      // dismiss, opened from a control still under your finger, and the
      // obvious gesture did nothing. click.outside stays and is now the second
      // way rather than the only one.
      //
      // SAFE AGAINST THE MOBILE DOUBLE-FIRE, and that is the whole reason this
      // can be a plain toggle. A tap on a touch screen also synthesises a
      // mouseenter, which would open the card and let the click close it again
      // in one gesture; the hover openers already bail on a coarse pointer
      // ("touch has a tap, and it opens this"), so on touch the click is the
      // only event and the toggle is unambiguous. On a fine pointer the hover
      // opens and the click closes, and mouseenter cannot fire again without
      // the pointer leaving first, so it stays closed until you come back.
      //
      // KEYED, so the toggle is per card rather than per panel: moving from
      // one row's tool count to another's opens the second rather than closing
      // the first, because they are different cards in the same panel.
      //
      // AND IT CANCELS THE PENDING HOVER, which is the half jsdom cannot see
      // and a browser found on the first try. A click on a fine pointer is
      // preceded by a mouseenter, so the sequence is: hover SCHEDULES an open,
      // the click opens immediately, then the stale timeout fires into a
      // toggle and shuts it again. Measured 2026-08-28 headless: tap 1 left
      // the card closed, tap 2 opened it. The hover guard ran at schedule time
      // and had nothing to compare against yet, so clearing the timer here is
      // what makes the first tap the one that works.
      rowCardToggled(key){
        clearTimeout(this._fcOpenT);
        if (!key || this.rowCard?.key !== key) return false;
        this.closeRowCard();
        return true;
      },
      _fcOpenT: null, _fcCloseT: null,
      hoverRowCard(row, cls, ev){
        const shell = window.__shell;
        if (!shell?.finePointer) return;          // touch has a tap, and it opens this
        const el = ev?.currentTarget;
        this.cancelRowCardClose();
        const key = this.branchCardKey(row, cls);
        if (this.rowCard?.key === key) return;
        this._fcOpenT = setTimeout(() => {
          if (this.rowCard?.key !== key) this.openRowCard(row, cls, el);
        }, shell.HOVER_OPEN_MS);
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
        // nothing that can sharpen later. A PROSE card is the same: it counts
        // the turns it was handed, which is what its header names.
        if (c.kind === 'list') return { count: c.count, lines: c.lines || '' };
        if (c.kind === 'prose') return { count: (c.turns || []).length, lines: '' };
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
          cls: t.startsWith('+') ? 'bg-success/10 text-success-content'
             : t.startsWith('-') ? 'bg-error/10 text-error-content'
             : t.startsWith('@@') ? 'bg-info/10' : '',
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

      // ── Straight into a branch's files, from the row ─────────────────────
      // The row's OWN cards button, and the shorter half of the two-axis model
      // the trailing cluster states: the name goes across the list, this goes
      // into the branch.
      //
      // It is a way INTO the files rather than a view of a list already open,
      // which is branch-brief's own phrasing for the same control one level
      // down, so it fetches the compare itself rather than requiring the reader
      // to have opened anything first. That fetch is free in the common case:
      // the hover card over this row's file counts reads the same compare and
      // caches it per branch per reading pass, so a reader who glanced at the
      // count before tapping pays nothing, and one who did not pays the one
      // call the card would have.
      //
      // Before this, the row's only route to its files was: tap the count, read
      // the card, tap its footer, land on the Files LIST inside the takeover,
      // then tap the cards button there. Four taps to read one diff, and the
      // footer button had been calling a method that does not exist since the
      // 2026-08-21 rename, so in practice the route was dead.
      deckOpeningFor: '',
      async openBranchFileDeck(row){
        if (this.deckOpeningFor) return;
        const toast = window.Alpine.store('toast');
        this.deckOpeningFor = row.repo + '/' + row.name;
        try {
          await this.loadRowCard(row);
          const read = this.rowCardRead;
          if (read?.error) throw new Error(read.error);
          const files = read?.files || [];
          if (!files.length) {
            return toast?.('files', 'Nothing changed against ' + (row.def || 'the default branch'),
                           'alert-info', 3000);
          }
          // The same chain branch-brief names, and for the same reasons: the
          // deck needs the track and the subject channel, and the cards inside
          // it are fileReview, which reads cm6-merge. All four ride the
          // pre-build, so this costs no network trip; naming them is what makes
          // the dependency readable in one place.
          for (const k of ['kits/swipe-deck.js', 'kits/subject-channel.js',
                           'kits/file-deck.js', 'kits/cm6-merge.js']) {
            await gh.load(k);
          }
          if (!window.fileDeck) throw new Error('the file deck kit did not load');
          const base = row.def || this.defOf(row.repo);
          // A deck already open becomes the parent, so this drills rather than
          // stacking and Back returns where the reader was. Opened from the
          // list there is none, and the branch's name has to ride the subtitle
          // because no header above it is carrying one.
          const parent = window.swipeDeck?.top?.() || null;
          window.fileDeck.open({
            repo: row.repo, ref: row.name, base, baseName: base,
            files, start: 0, subtitle: parent ? '' : row.name, parent,
          });
        } catch (e) {
          toast?.('warning-circle', 'Could not read ' + row.name + ': ' + (e?.message || e),
                  'alert-error', 5000);
        } finally { this.deckOpeningFor = ''; }
      },

      // The chip's tap. The detail takeover is already the branch's files; all
      // this adds is landing on the right pane with the right filter, so the
      // count a reader tapped and the list they arrive at are the same set.
      openBranchFiles(row, state){
        this._openFiles = { pane: 'files', fileState: state || '' };
        this.openBranchDetail(row);
      },
      _openFiles: null,

      openBranchDetail(row, siblings){
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
        const rows = [...(siblings && siblings.length ? siblings : this.openRows)];
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
            // The base is never left empty: the slide compares against it, and
            // `compare/...branch` is not a comparison. A row from the list
            // carries its repo's default branch; a row nothing built falls back
            // to the cache's, exactly as pages/branch.html resolves it.
            repo: r.repo, branch: r.name, base: r.def || this.defOf(r.repo),
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
                     lastDate: r.date || '', sessions: r.sessions || [],
                     // The crawl reads a row's sessions off the same compare
                     // this page would run, so the row knows whether they are
                     // exact and the slide should not assume they are not.
                     sessionsExact: !!r.sessionsExact },
            // The content verdict on the same provisional contract as `facts`:
            // the crawl already measured it, so the slide's Files strip is
            // right in its first frame and its missing filter is exact before
            // any tree is read. The slide re-measures and replaces it, which is
            // what keeps a cold pages/branch.html able to show the same thing.
            scan: this.verdictOf(r),
            // Only the slide the tap named opens on a pane it did not choose.
            // `detail?.i`, because a render can land after closeDetail() has
            // nulled it: close leaves through history and the deck's own
            // teardown is a tick behind. It never threw while `openFiles` was
            // set by the verdict chip alone, since the left side short-circuited
            // on every ordinary open; a deep link sets it too, which made the
            // right side reachable and turned a late render into a dead slide.
            ...(openFiles && i === this.detail?.i ? openFiles : {}),
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
          // The contents, off the same chrome every slide already sets: the
          // branch's slug, its repo and PR number, its repo mark. The set here
          // is however many branches the filter left open, which routinely
          // outruns the pager's dots, and the rows are the list the reader
          // tapped in to get here.
          index: (i) => {
            const c = this.deckChrome(i);
            return { title: c.title || '', subtitle: c.subtitle || '', icon: c.icon };
          },
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
        // `pane` belongs to the slide being left, so it is dropped here rather
        // than carried: the next slide reports its own on mount, and a pane
        // held across a step would stamp a link claiming a branch opened on a
        // pane it never chose.
        this.detail = { ...this.detail, i, pane: '' };
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
          title: this.branchShort(r.name),
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
        if (!this.detail || i !== this.detail.i || !this._deck) return;
        const r = this.detail.rows[i];
        if (!r || r.repo !== m?.repo || r.name !== m?.branch) return;
        // Which pane the slide settled on, for detailLink(). Recorded above the
        // PR gate below, because a pane report carries no PR number: only the
        // header dressing needs one, and gating both on it is what would make
        // a copied link forget the pane on every branch without a merged PR.
        this.detail.pane = m.pane || '';
        if (!m.pr) return;
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
        // The pane rides too, so a reader who opened Files and copied the link
        // gets a link that opens Files. It comes up from the slide through
        // onSlideMeta rather than being tracked here: which pane is showing is
        // the slide's fact, and a second copy of it here would be a second
        // answer to drift from.
        const pane = this.detail?.pane;
        if (pane === 'files') p.set('pane', 'files'); else p.delete('pane');
        // Never the file: the deck is a level below the address this button
        // names, and a link reopening a deck the reader had closed would be a
        // link to somewhere they left.
        p.delete('file');
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
        // TWO lookups, deliberately, because they answer different questions.
        // The upgrade guard below asks whether the VISIBLE list now holds this
        // branch, since a sequence to swipe through is exactly what the
        // visible list is; the open asks for the best row anyone has, filtered
        // or not. Collapsing them into one would re-open the takeover on every
        // stamp of its own address: an out-of-scope row would satisfy the
        // guard and then re-seat the same list of one, without end.
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
        // The same two keys pages/branch.html reads, so one address form opens
        // the branch here or there. They ride `_openFiles`, the seam the
        // verdict chip already uses to land a tap on the right pane: a deep
        // link is the same request arriving from outside.
        const p2 = new URLSearchParams(location.search);
        const pane = p2.get('pane'), file = p2.get('file');
        if (pane === 'files' || pane === 'guide' || file)
          this._openFiles = { ...(this._openFiles || {}),
                              pane: pane === 'guide' ? 'guide' : 'files',
                              ...(file ? { file } : {}) };
        this.openBranchDetail(inList || this.branchRowFor(repo, name) || { repo, name });
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
      // The abandoned badge's destination: the Branches pane, already narrowed
      // to this repo and this scope, so the count that was tapped is the list
      // that arrives.
      openAbandoned(repo){
        this.branchScope = 'abandoned';
        this.openRepoFilter = repo;
        // Through goSub, not straight to the shell: `tab` is a getter over the
        // shell's view, so the pane is switched by navigating, which is also
        // what stamps the URL and the history entry.
        this.goSub('activity');
      },
      // The branch-count badge's destination: the same pane, narrowed to the
      // repo and left on whatever scope is current, since the count it carries
      // is the repo's branches rather than one state of them.
      //
      // It used to call a shell method, goBranches(), that opened the per-repo
      // branch review. That view retired and the method went with it, so the
      // badge had been throwing on tap for however long: a dead call in an
      // event handler fails silently in the console and looks, from the
      // outside, exactly like a badge that is not clickable.
      openRepoBranches(repo){
        this.openRepoFilter = repo;
        this.goSub('activity');
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
        // Hidden members are already on the estate, so they are not candidates
        // to add; the Hidden section's Show button is their route back.
        const have = new Set([...this.entries, ...this.hiddenEntries].map(e => e.repo));
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
        // Hidden members count as filed: they opted in and were then set out of
        // sight, so listing them as undecided would offer to adopt a repo that
        // is already on the estate.
        const have = new Set([...this.entries, ...this.hiddenEntries].map(e => e.repo));
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
          const text = (await reg.get(TODO_PATH, FRESH())).text;
          window.SourcePeek?.seed(this.listPeek(TODO_PATH), text);
          const raw = JSON.parse(text);
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
          this.seedList(TODO_PATH, { items: this.todoItems });
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
          const text = (await reg.get(JOTS_PATH, FRESH())).text;
          window.SourcePeek?.seed(this.listPeek(JOTS_PATH), text);
          const raw = JSON.parse(text);
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
      // The kinds on offer: whatever the pile already uses, commonest first,
      // plus the seed. Derived rather than declared, which is what makes an
      // open vocabulary converge instead of sprawl: the chip is always the
      // cheaper route, so nobody types `snag` twice.
      get jotKinds(){
        const n = {};
        for (const it of this.jotItems) if (it.kind) n[it.kind] = (n[it.kind] || 0) + 1;
        for (const k of JOT_KIND_SEED) if (!(k in n)) n[k] = 0;
        return Object.keys(n).sort((a, b) => (n[b] - n[a]) || a.localeCompare(b));
      },
      // `kind` is written only when set and absent otherwise, the rule `urgent`
      // and `due` already follow on a to-do, so "never had a kind" and "had one
      // cleared" read identically and an untagged jot is byte-for-byte what it
      // was before this field existed. The commit subject carries it too: this
      // file's history is the capture log, so the kind belongs in the log.
      async addJot(){
        const text = this.jotDraft.trim();
        if (!text || !this.hasToken()) return;
        const kind = KIND(this.jotKindDraft);
        this.jotDraft = ''; this.jotKindDraft = ''; this.jotKindNew = false;
        await this.mutateJots(items => [...items, {
          id: 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          text, ...(kind ? { kind } : {}), created_at: new Date().toISOString() }],
          'Jot "' + clip(text) + '"' + (kind ? ' [' + kind + ']' : '') + ' via show-repo');
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
          this.seedList(JOTS_PATH, { items });
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
          const text = (await reg.get(PINS_PATH, FRESH())).text;
          window.SourcePeek?.seed(this.listPeek(PINS_PATH), text);
          const raw = JSON.parse(text);
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
          this.seedList(PINS_PATH, { items: this.pinItems });
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
      // Files view at that folder.
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

      // A repo's own committed skills, from its manifest. A bare string is
      // shorthand for { name }, matching how projects and pins already read,
      // and origin defaults to local because that is the ordinary case: a
      // fork has to be declared, which is what keeps it from hiding.
      skillsOf(e){
        const repo = this.face(e).repo;
        const raw = this.adopt(e)?.skills
          || window.__shell?.estateConfigs?.[repo]?.skills
          || [];
        if (!Array.isArray(raw)) return [];
        return raw
          .map(s => (typeof s === 'string' ? { name: s } : s))
          .filter(s => s && s.name)
          .map(s => ({ name: String(s.name), origin: s.origin === 'forked' ? 'forked' : 'local' }))
          .sort((a, b) => a.name.localeCompare(b.name));
      },
      skillsForked(e){ return this.skillsOf(e).filter(s => s.origin === 'forked'); },
      skillsTitle(e){
        const all = this.skillsOf(e), forked = this.skillsForked(e);
        if (!all.length) return '';
        const head = all.length + (all.length === 1 ? ' skill' : ' skills') +
          ' committed in this repo, which the plugin does not ship';
        const names = all.map(s => s.origin === 'forked' ? s.name + ' (forked)' : s.name).join(', ');
        return head + (forked.length ? '; ' + forked.length + ' a fork of a hub skill' : '') + '. ' + names;
      },
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

    };
  });
});
