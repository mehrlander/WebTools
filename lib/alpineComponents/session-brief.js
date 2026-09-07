// alpineComponents/session-brief.js — one recorded session as a page.
//
// The sibling of alpineComponents/branch-brief.js, and deliberately the same
// shape, because the two answer the same kind of question about two different
// objects: what is this thing, and what is inside it. A reader who has learned
// where the deck button sits on a branch should find it in the same place on a
// session.
//
// This markup lived inside pages/session.html until 2026-08-27. Moving it here
// changes nothing about that page and adds the host it could not have: show-repo's
// Sessions pane mounts one per slide, directly, in the shell's own Alpine, so a
// session can be swiped through the way a branch already is. That is the whole
// reason for the lift; branch-brief.js took the same step on 2026-08-13 and its
// header records why an iframe was the wrong way to do it.
//
// A host passes:
//   id        the record's short id: the eight hex characters that END its
//             filename, not the whole stem, which carries the date as well
//   day       the day it started, which with `id` derives the store path
//   path      the store path outright, when the host already knows it
//   branch    a branch name; opens that branch's latest session (resolveBranch)
//   repo      the store, defaulting to the private one below
//   record    a record already in hand; nothing is fetched
//   framed    true to say the host supplies the identity chrome
//   facts     what the host already knows, so the head is right before the
//             read lands (see `factsRecord`)
//   warm      neighbours worth reading ahead: [{ id, day, path }]
//   onMeta    called with what only a finished read knows
//   pane      'outline' | 'files' | 'raw'
//   fileHref  (checkoutPath, record) => url, for the Files pane; see fileHref
//   start     open the card deck on this card, once loaded
//
// `facts` is the same contract branch-brief states and exists for the same
// reason: show-repo's sessions cache holds every number on the strip, so a
// slide can render its head immediately and only the outline waits on the JSON.
// A cold pages/session.html has no such row and shows the strip when the record
// arrives, which is the only thing it could do.
(function () {
  // The store. Overridable per mount so this is not welded to one repo, which
  // is the same courtesy pages/session.html paid before the lift.
  const STORE = 'mehrlander/web-tools-private';

  // Records already read, keyed by store path. Module scope, not component
  // state, because the deck reuses one mount per slide and a record is a
  // property of the session rather than of the visit: stepping back to a slide
  // must not refetch it.
  //
  // A TTL at all, on a store whose records are written once and never revisited?
  // For exactly one record: the LIVE session's, which is rewritten and
  // republished on every Stop. Everything else is frozen and the expiry costs a
  // conditional request nobody notices. Same minute branch-brief uses.
  const RECORDS = new Map();          // path -> { at, promise }
  const TTL_MS = 60000;

  // The store's own listing, for resolving a short id to a path. One recursive
  // tree read names every record, so a deck of twenty sessions addressed by id
  // pays for it once rather than twenty times. Keyed by repo, same expiry.
  const LISTINGS = new Map();         // repo -> { at, promise }

  // How far back a branch walk reads before giving up (see resolveBranch). A
  // ceiling on a loop that opens whole records, not a claim about the store: a
  // branch whose session is 25 records back is one nobody is holding on a phone
  // waiting to hear, and the error names the number it looked at.
  const WALK_CAP = 25;

  // WHAT A CLIPBOARD HOLDS, REDUCED TO A BRANCH NAME. The Claude app copies the
  // branch a session is on and nothing else about it, but what it copies has
  // varied: a bare name, a full ref, a GitHub tree or compare URL, a branch.html
  // address, or the name with a caption line under it. All of them reduce here,
  // so a shortcut passing a clipboard straight through does not have to know
  // which one it got.
  //
  // The same reduction lives in lib/ops/session-menu.js as `branchOf`, and that
  // copy cannot import this one: an op is a single standalone function that a
  // phone evaluates with no page around it. Two copies on purpose; change one
  // and change the other.
  //
  // ONE RULE IS DELIBERATELY NOT SHARED. The op also demands a `/` in the
  // result, because it is guessing whether a clipboard holds a branch at all
  // and needs a way to say no. Here the caller has already said it does, so a
  // slashless branch name is honoured rather than thrown away.
  function branchOf(text) {
    return String(text || '').trim().split(/\r?\n/)[0].trim()
      .replace(/^.*?(?:tree\/|compare\/|branch\.html#gh=[^@]+@|branch=)/, '')
      .replace(/^origin\//, '').replace(/^refs\/heads\//, '')
      .replace(/[?#&].*$/, '').replace(/\/$/, '');
  }

  const register = function () {
  Alpine.data('sessionBrief', function (opts) {
    const o = opts || {};

    return {
      description: 'One captured session as a page: its facts, its outline, and the deck that reads it',

      id: o.id || '',
      day: o.day || '',
      repo: o.repo || STORE,
      path: o.path || '',
      // The branch to find a session FOR, resolved once at load. Not a filter:
      // the record it lands on is the whole subject of the mount.
      branch: o.branch || '',
      framed: !!o.framed,
      facts: o.facts || null,

      record: o.record || null,
      loading: false,
      err: '',
      pane: ['raw', 'files'].includes(o.pane) ? o.pane : 'outline',
      rawBuilt: false,
      outlineBuilt: false,
      deckOpening: false,

      template: `
        <!-- WHERE THE SCROLLBAR IS, and it is two different answers.
             Framed, this is a slide and scrolls inside itself: the facts strip
             and the tab row hold their place while the pane under them moves.
             Standalone it is a page and scrolls as one, for the reason
             branch-brief states: a page that pins its own header costs a phone
             its URL-bar collapse.

             What branch-brief's argument does not settle is the CHROME, and
             this view has more of it than a branch does. Document scroll took
             the tab row, the outline's own Cards chips and its export bar away
             with the head, because all three were built to pin above or below
             a pane that is a viewport. Measured 2026-09-04 at 390x844: 429px of
             head before the outline began, and at the bottom of the scroll the
             tabs 189px above the fold; Raw laid its 243 KB out as a single
             40,528px block, 48 screens with no control on any of them; and Pick
             all revealed an export bar at y=1456, 612px BELOW the fold, with
             nothing on screen to say it was there.

             So the page keeps document scroll and the chrome goes STICKY, which
             is the house style's shape for a page another page may embed
             (daisy-alpine rule 5). The head is content and still scrolls away;
             only the row that operates the pane stays. -->
        <!-- FULL WIDTH, NO CAP. This carried mx-auto and max-w-2xl, so a desktop
             browser drew a phone's column down the middle of the screen with
             the rest empty. The house style names that pattern outright (rule
             3), and the estate's own branch list already made the same call
             once nothing stood beside it to claim the space. A row here is a
             wide thing for the same reason a branch row is: an ask, an answer,
             a clock, a turn count and a tool tally all read across. -->
        <div class="w-full flex flex-col gap-2.5 px-4 pt-3"
             :class="framed ? 'h-full min-h-0 pb-0' : 'pb-4'">

          <div x-show="err" class="alert alert-warning shrink-0" x-text="err"></div>

          <!-- The title, and the id beside it. Framed, the deck header already
               carries both, so this line goes rather than being repeated at
               half width in two places; the same rule branch-brief applies to
               a branch name.

               ONE LINE, AND THE ID KEPT OUT OF THE WRAP. sessionRender.describe
               derives the title from the session's OPENING ASK, which the
               outline then prints again as card 1's own row a couple of hundred
               pixels below: at two lines that duplication cost 74px of a 932px
               phone to say the same sentence twice. Truncated it still names
               the session, which is all a heading over its own outline has to
               do. A flex row with a shrink-0 id is what keeps the stem on the
               line rather than wrapping alone under it, which is what a margin
               on an inline span did once the title filled the row. -->
          <div x-show="!framed" class="shrink-0 flex items-baseline gap-1.5 text-base font-medium leading-snug">
            <span class="truncate" x-text="head.title"></span>
            <span class="shrink-0 font-mono text-xs font-normal opacity-45"
                  data-note="The eight hex characters that end the record's filename, and how every other surface names this session."
                  x-text="'(' + (shortId || '') + ')'"></span>
            <!-- WHICH COPY OF THIS PAGE IS RUNNING. Everything else in this
                 head describes the SESSION; this describes the code doing the
                 describing, and without it a reader has no way to tell a branch
                 preview from the deployed page except through the FAB drawer,
                 which is one tap they may not have (branch.html grew the same
                 marker on 2026-09-04, after three rounds were lost to exactly
                 that). Framed it goes with the title, since a host that draws
                 the identity carries its own. -->
            <span class="ml-1.5 font-mono text-sm font-normal opacity-45"
                  data-note="The ref this page's own code booted from. That is the page, not the session it is describing."
                  x-text="'· running ' + codeRef"></span>
          </div>

          <!-- The facts strip, drawn from whatever is known: the host's row
               while the record is in flight, the record itself once it lands.
               One implementation, two fidelities, so a slide never shows an
               empty strip and then a full one. (It read "labelled rather than
               run together" until 2026-09-07, which the block below had by then
               made false: a label is drawn only where the value does not name
               itself.) -->
          <!-- EACH FACT CARRIES ITS OWN DEFINITION, THROUGH kits/note.js. Half
               of these are exact about something the plain word is not, so the
               definitions are load-bearing rather than decorative, and they
               rode in a title with cursor-help: no touch screen shows one, no
               screenshot captures one, and the house style names that shape
               outright. The data-note attribute is the tier between a title and a
               built panel, and this is a string a reader looks at, which is
               that kit's own line for what belongs in it. The dotted underline
               is the point: an affordance visible before the pointer moves. -->
          <!-- A WORD ONLY WHERE THE VALUE DOES NOT NAME ITSELF, and it follows
               the number rather than leading it. Every fact carried a leading
               label, and at 430px that wrapped the strip to three lines with
               the repos taking one of them alone. A date reads as a date and
               31h 25m reads as a duration; 251 does not read as calls. So f.k
               stays the fact's NAME, which is what the tests and the notes key
               on, and f.unit is the word actually drawn, empty wherever the
               value speaks. The dot separator does the label's other job,
               which is saying where one fact ends and the next begins.

               ONE WRAPPING ROW, not a column of lines. Two lines at phone width
               and one at desktop, where the nine facts this used to carry
               already fit on one; a row per fact would have made the desktop
               worse in order to fix the phone. -->
          <div class="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[13px] shrink-0">
            <template x-for="(f, i) in strip" :key="f.k">
              <span class="whitespace-nowrap">
                <span :data-note="f.t"
                      :class="f.k === 'failures' && f.v ? 'text-warning'
                              : f.k === 'repos' ? 'opacity-60' : ''">
                  <!-- A REAL SPACE between the two, not a margin. The pair was
                       written joined with ml-1 doing the gap, which looks right
                       and reads "40calls" to anything taking the text: a screen
                       reader, a copy, and the test that matches a note to the
                       words it defines. -->
                  <span x-text="f.v"></span>
                  <span x-show="f.unit" class="opacity-55" x-text="f.unit"></span>
                </span>
                <!-- TRAILING, NEVER LEADING. Led, the dot rides the fact it
                     precedes, so the repos wrapping to a second line took the
                     separator down with it and line 2 opened on a bullet.
                     Trailing, a wrap leaves the dot at the end of line 1, which
                     is how a wrapped list is punctuated anywhere else. -->
                <span x-show="i < strip.length - 1" class="opacity-25 ml-2.5"
                      aria-hidden="true">&middot;</span>
              </span>
            </template>
          </div>

          <!-- The switch and the exits, branch-brief's row exactly: the tabs
               carry their own counts, the cards button is the one coloured
               control because it is what most readers came to do, and the
               links that leave sit ghost beside it. -->
          <!-- THE STICKY ROW, full-bleed against the shell's own padding so
               nothing slides past it down the margins. x-ref="chrome" is what
               trackChrome measures and publishes as the --chrome-h custom
               property; the outline's chips stick to that number.
               (No backticks in this markup: it is a JS template literal.) -->
          <div x-ref="chrome" class="flex items-center gap-2 shrink-0"
               :class="!framed && 'sticky top-0 z-20 -mx-4 px-4 py-2 bg-base-100 border-b border-base-300'">
            <div role="tablist" class="tabs tabs-box tabs-sm flex-nowrap bg-base-200 p-0.5 min-w-0
                                       overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <a role="tab" class="tab gap-1 flex-nowrap whitespace-nowrap"
                 :class="pane === 'outline' && 'tab-active'"
                 @click="pane = 'outline'; $nextTick(() => { mountOutline(); settlePane(); })">
                Outline<span class="font-mono opacity-50" x-text="cards || ''"></span></a>
              <a role="tab" class="tab gap-1 flex-nowrap whitespace-nowrap"
                 :class="pane === 'files' && 'tab-active'"
                 @click="pane = 'files'; $nextTick(() => settlePane())">
                Files<span class="font-mono opacity-50" x-text="fileRows.length || ''"></span></a>
              <a role="tab" class="tab gap-1 flex-nowrap whitespace-nowrap"
                 :class="pane === 'raw' && 'tab-active'"
                 @click="pane = 'raw'; $nextTick(() => { mountRaw(); settlePane(); })">
                Raw<span class="font-mono opacity-50" x-text="rawSize"></span></a>
            </div>
            <div class="grow"></div>
            <!-- LISTEN, which is a door rather than a control: it opens the
                 deck and starts it speaking. Ghost beside the deck's primary,
                 because the deck is what most readers came to do and rule 10
                 spends the accent once. -->
            <button @click="listen()" :disabled="deckOpening || !record"
                    class="btn btn-sm btn-square btn-ghost max-sm:h-11 max-sm:w-11"
                    aria-label="Read this session aloud"
                    title="Open the cards and read them aloud">
              <i class="ph ph-speaker-high text-lg max-sm:text-xl"></i></button>
            <!-- THE CLASSES AND THE WORDING ARE swipeDeck.entry()'s, held to it
                 by tools/test/deck-entry-parity.test.mjs rather than by a call:
                 the kit loads on demand and is not on the page when this
                 template first renders, so a host that waited for it would show
                 no button at all on the first paint. Same copy, same gate, as
                 branch-brief's file-deck button. -->
            <button @click="openDeck()" :disabled="deckOpening || !record"
                    class="btn btn-sm btn-square btn-soft btn-primary max-sm:h-11 max-sm:w-11"
                    :title="cards ? 'Read ' + plural(cards, 'card') + ' one at a time'
                                  : 'Read cards one at a time'">
              <span x-show="deckOpening || (loading && !record)" class="loading loading-spinner loading-xs"></span>
              <i x-show="!deckOpening && !(loading && !record)"
                 class="ph ph-cards-three text-lg max-sm:text-xl"></i></button>
            <!-- The estate's standard way to link a session: the logomark in
                 brand colour, no label, exactly as the Sessions rows and the
                 deck header draw it. Drawn from kits/claude-mark.js rather than
                 pasted, and called plainly rather than defensively: gh-boot
                 carries the kit as standing equipment, which is what
                 tools/test/claude-mark.test.mjs asserts one test below the one
                 that runs every call site's arguments. A guard here would only
                 hide the case that test exists to catch. -->
            <a x-show="agentUrl" :href="agentUrl" target="_blank"
               title="Open this session in Claude Code"
               class="btn btn-sm btn-square btn-ghost max-sm:h-11 max-sm:w-11"
               x-html="window.claudeMark.svg({ cls: 'w-4 h-4 max-sm:w-5 max-sm:h-5 shrink-0' })"></a>
            <a x-show="recordUrl" :href="recordUrl" target="_blank" rel="noopener"
               title="The stored record on GitHub"
               class="btn btn-sm btn-square btn-ghost max-sm:h-11 max-sm:w-11">
              <i class="ph ph-github-logo text-lg max-sm:text-xl"></i></a>
          </div>

          <div x-show="loading && !record" class="flex justify-center py-10 shrink-0">
            <span class="loading loading-dots loading-md opacity-30"></span>
          </div>

          <div x-ref="outline" x-show="pane === 'outline'" class="flex flex-col"
               :class="framed && 'min-h-0 grow'"></div>

          <!-- FILES: what the session opened, which the strip counts and had no
               route to. Alpine-rendered rather than imperative, unlike its two
               neighbours: this is a list of plain rows with no state of its own,
               so the reason those mount by hand (a kit that owns its selection)
               does not apply.

               Sorted by weight, not alphabetically: the question a reader brings
               here is what the session WORKED ON, and an edit says more than a
               read. The weighting is the sessions cache's own (fileWeight), so
               this list and the row's hover card cannot order the same files two
               ways. -->
          <div x-show="pane === 'files'" x-cloak class="pb-3"
               :class="framed && 'min-h-0 grow overflow-y-auto'">
            <div x-show="!fileRows.length" class="text-sm opacity-60 py-3" x-text="filesNote"></div>
            <template x-for="f in fileRows" :key="f.path">
              <div class="flex items-baseline gap-2 py-1 border-b border-base-200 last:border-0">
                <!-- The folder is muted and the filename is not, so a column of
                     long paths reads by its right-hand end, which is the half
                     that identifies. Same split the branch row's file card uses. -->
                <!-- ALWAYS an anchor, with the href bound to null when there
                     is none. An <a> without href renders as plain text and is
                     not clickable, which is exactly the unresolvable case; the
                     alternative, a conditional element, is a Vue idiom
                     (<component :is>) that Alpine does not implement and that
                     would have shipped as an unknown tag rendering its children
                     and never linking anything. -->
                <a :href="f.href || null"
                   :target="f.href ? '_blank' : null" :rel="f.href ? 'noopener' : null"
                   class="font-mono text-sm min-w-0 truncate"
                   :class="f.href ? 'hover:text-primary transition-colors' : 'cursor-default'"
                   :title="f.path">
                  <span class="opacity-45" x-text="f.dir"></span><span x-text="f.name"></span>
                </a>
                <div class="grow"></div>
                <!-- One badge per KIND, not a single total. "Opened 9 times" is
                     the number the strip already carries; which four tools did
                     the opening is what this pane can say and it cannot. -->
                <template x-for="k in f.kinds" :key="k.label">
                  <span class="shrink-0 font-mono text-xs tabular-nums"
                        :class="k.label === 'edit' || k.label === 'write' ? 'text-warning' : 'opacity-45'"
                        :title="k.n + ' ' + k.label + (k.n === 1 ? '' : 's')">
                    <span x-text="k.label.slice(0, 1)"></span><span x-text="k.n"></span></span>
                </template>
              </div>
            </template>
          </div>

          <div x-ref="raw" x-show="pane === 'raw'" x-cloak class="flex flex-col pb-3"
               :class="framed && 'min-h-0 grow'"></div>
        </div>
      `,

      init() {
        this.$el.innerHTML = this.template;
        this.$nextTick(() => {
          if (!this.$el.isConnected) return;
          Alpine.initTree(this.$el);
          this.trackChrome();
        });
        this.load();
      },
      destroy() { this.chromeObs?.disconnect(); this.chromeObs = null; },

      // ── The sticky chrome, and its one published number ───────────────────
      // The tab row's height, written onto this mount as `--chrome-h` so the
      // outline's own chips can stick underneath it. MEASURED rather than
      // written down twice: the row is 44px of touch-sized buttons on a phone
      // and 32px above `sm`, and it grows a line whenever the tabs wrap or the
      // reader has scaled their text up, so a constant in the kit would be
      // wrong on some screen nobody tested. Framed there is no sticky row and
      // no number to publish.
      chromeObs: null,
      trackChrome() {
        if (this.framed || this.chromeObs) return;
        const row = this.$refs.chrome;
        if (!row || !window.ResizeObserver) return;
        const set = () => this.$el.style.setProperty('--chrome-h', row.offsetHeight + 'px');
        this.chromeObs = new ResizeObserver(set);
        this.chromeObs.observe(row);
        set();
      },

      // SWITCHING PANES IS WHERE DOCUMENT SCROLL HAS TO BE CORRECTED, which is
      // the cost the house style names for sticky chrome. The three panes
      // differ by two orders of magnitude in height (an outline of 7 cards
      // against 40,000px of raw JSON), so a reader deep inside Raw who taps
      // Outline lands past the end of a list that no longer reaches there.
      // Only when the chrome has ALREADY left the top: at the top of the page
      // there is nothing to correct and pulling the head off screen would be
      // the jolt this exists to avoid.
      settlePane() {
        if (this.framed) return;
        const top = this.$refs.chrome?.getBoundingClientRect().top;
        if (typeof top === 'number' && top < 0) window.scrollBy({ top, behavior: 'instant' });
      },

      // ── What is known before the record lands ─────────────────────────────
      // The host's row, shaped as a record. One strip implementation reads
      // this or the real thing, so the head cannot say two different numbers
      // on either side of a fetch. Provisional by contract: every field here is
      // overwritten by the record.
      get factsRecord() {
        const f = this.facts;
        if (!f) return null;
        return {
          short: f.id || this.id, day: f.day || this.day,
          started: f.started || '', ended: f.ended || '',
          repos: f.repos || [], opening_ask: f.ask || '',
          exchanges: f.exchanges || 0, calls_total: f.calls || 0,
          failures: f.failures || 0, files_total: f.filesTotal || 0,
          tokens: f.tokens || null, schema: f.schema || 0,
          agent_session: f.agent || '',
          _title: f.title || '',
        };
      },
      get rec() { return this.record || this.factsRecord || {}; },
      get shortId() { return this.rec.short || this.id || ''; },
      get agentUrl() { return this.rec.agent_session || ''; },

      // The name. `describe` owns it once the record is here; before that the
      // host's own label is the best answer there is, and the id is the last
      // resort, which is also what the deck header shows.
      get head() {
        if (this.record && window.sessionRender) return window.sessionRender.describe(this.record);
        return { title: this.facts?.title || this.facts?.name || this.shortId, subtitle: '' };
      },

      // ── WHERE THE CLOSING REPLY WENT ──────────────────────────────────────
      // A clamped, expandable block sat here and drew the session's last reply
      // above the tab row, on the argument that a reader scanning sessions is
      // after what one CONCLUDED. Removed 2026-09-06 for 124px of a 932px phone,
      // which was a quarter of everything above the first card.
      //
      // The argument had already been answered twice over. The estate's
      // Sessions view draws a proper reply card for exactly that scanning case
      // (alpineComponents/estate.js, `replyTurns` and `replyLabel`), rendered
      // through the deck's own turn renderer and carrying the fidelity label
      // this block copied. And the reply is a turn inside the record's last
      // card, so the outline's own last row already previews it and the panel
      // on that row opens it whole. What went is prominence, not text.
      //
      // The cache still carries `reply` and `replyCut` and they are still read:
      // that card is their consumer, so nothing upstream is orphaned by this.

      // ── Which copy of this page is running ────────────────────────────
      // window.gh.ref is what the LOADER booted from: `main` on the deployed
      // page, the SHA inside a toss or under a ?use= pin. Not the address
      // bar's ask, which a page whose boot block ignores ?use= would report
      // falsely.
      //
      // THE SAME THREE LINES LIVE IN alpineComponents/branch-brief.js, and the
      // fab reasons identically at loaderRef. Three copies of a two-line read,
      // on purpose: a kit for it would be heavier than the thing, and each is
      // held to the same source by the gate in tools/test/branch-brief-groups.
      // Change one and change the others.
      get codeRef() {
        const r = (typeof window !== 'undefined' && window.gh && window.gh.ref) || 'main';
        return /^[0-9a-f]{7,40}$/i.test(r) ? r.slice(0, 7) : r;
      },

      // The strip: what the record IS, as facts. Each carries its own
      // definition, because two of these are exact about something the plain
      // word is not: `calls` counts tool calls and not turns, and `repos` names
      // CHECKOUTS rather than the repositories a session touched through the
      // API. Source: sessions/README.md in the store.
      //
      // FIVE, DOWN FROM NINE (2026-09-06), and four of the cuts are one
      // argument each rather than a trim to taste. `asks` and `files` are
      // printed again 44px below as the Outline and Files tab counts, which are
      // the same numbers within one (a card folds a leading meta note into the
      // first ask). `schema` is the record FORMAT's version, which decides what
      // the reader can expect this view to show and is otherwise a fact about
      // the recorder rather than about the session. `out tokens` is a scale
      // reading with nothing to do: nothing on this page or in the estate reads
      // differently for a large one.
      //
      // `k` is the fact's NAME and is no longer drawn; `unit` is the word the
      // strip actually renders after the value, empty wherever the value names
      // itself. See the template, which carries why.
      get strip() {
        const r = this.rec;
        const mins = (() => {
          const a = Date.parse(r.started), b = Date.parse(r.ended);
          if (!a || !b || b < a) return '';
          const m = Math.round((b - a) / 60000);
          return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
        })();
        return [
          ['day', r.day, '', 'The day the session started'],
          ['ran', mins, '', 'Wall clock from the first prompt to the last write, idle time included'],
          ['calls', r.calls_total, 'calls', 'Tool calls the session made'],
          ['failures', r.failures, 'failed', 'Tool calls that came back an error'],
          ['repos', (r.repos || []).map(x => x.name).join(', '), '', "The checkouts that were the session's working directory"],
        ].filter(([, v]) => v || v === 0).map(([k, v, unit, t]) => ({ k, v, unit, t }));
      },

      // One space before the plural, not "3 card s". The same helper
      // branch-brief carries, so the two decks' door wording assembles the
      // same way and tools/test/deck-entry-parity.test.mjs can hold both to
      // swipeDeck.entry().
      plural(n, noun) { return n + ' ' + noun + (n === 1 ? '' : 's'); },

      // ── What the session opened ───────────────────────────────────────────
      // The record's `files` is {"<checkout>/<path>": {read, edit, write, …}},
      // captured by four file tools and nothing else (sessions/README.md). The
      // strip counts them; this is the list, which the brief had no route to.
      //
      // WEIGHT ORDER, from the sessions cache's own fileWeight, which is a plain
      // sum over the kinds: every access counts one, an edit the same as a
      // read. Alphabetical would answer a question nobody asks, and using the
      // kit rather than a rule of this pane's own is what stops this list and
      // the Sessions row's hover card ordering the same files two ways.
      //
      // The limit that follows, and the reason the per-kind badges exist: a
      // file read nine times outranks one edited six, which is not what "worked
      // on" means to a reader. The badges are where that is visible, so the
      // ordering is a first cut and the row itself says what happened.
      get fileRows() {
        const files = this.record?.files || {};
        const weigh = window.RepoSessionsCache?.fileWeight
          || (k => Object.values(k || {}).reduce((n, v) => n + (+v || 0), 0));
        return Object.entries(files)
          .map(([path, kinds]) => {
            const i = path.lastIndexOf('/');
            return {
              path,
              dir: i < 0 ? '' : path.slice(0, i + 1),
              name: i < 0 ? path : path.slice(i + 1),
              weight: weigh(kinds),
              // Sorted so the heaviest kind leads, and zeroes dropped: a file
              // that was only read should not carry an "e0".
              kinds: Object.entries(kinds || {})
                .filter(([, n]) => +n > 0)
                .map(([label, n]) => ({ label, n: +n }))
                .sort((a, b) => b.n - a.n),
              href: this.fileHref(path),
            };
          })
          .sort((a, b) => (b.weight - a.weight) || a.path.localeCompare(b.path));
      },
      // Why the list is empty, which is two different answers. A record written
      // before schema 3 never captured file attention at all, and saying "no
      // files" over one of those would be a claim about the session rather than
      // about the record. Same distinction the Sessions row draws with its
      // dimmed files glyph.
      get filesNote() {
        if (!this.record) return 'Waiting for the record.';
        return (this.rec.schema || 0) < 3
          ? 'This record predates file-attention capture (schema 3); its files were never recorded.'
          : 'No files were opened by Read, Edit, Write or NotebookEdit. A file read through a shell command is not counted.';
      },
      // A GitHub link for a checkout-prefixed path, or '' for none.
      //
      // THE HOST SUPPLIES IT, because the record cannot. Its paths name a
      // checkout ("web-tools/lib/x.js") and its `repos` names that checkout's
      // branch, but nothing in the store knows the OWNER, and guessing one is
      // how a list of working links becomes a list of 404s. show-repo resolves
      // it against the estate and passes a function; a cold page has no estate
      // and the rows are plain text, which is the honest version of not knowing.
      fileHref(path) {
        if (typeof o.fileHref !== 'function') return '';
        try { return o.fileHref(path, this.record) || ''; } catch { return ''; }
      },

      get cards() {
        if (!this.record || !window.sessionRender) return 0;
        const sr = window.sessionRender;
        return sr.groups(sr.turns(this.record)).length;
      },
      get rawJson() { return this.record ? JSON.stringify(this.record, null, 2) : ''; },
      get rawSize() {
        const n = this.rawJson.length;
        return !n ? '' : n < 1024 ? n + 'B' : n < 1048576 ? Math.round(n / 1024) + 'K' : (n / 1048576).toFixed(1) + 'M';
      },
      // The record where it is stored. Absent for a mount handed its record
      // outright (#gz=), which has no file to point at; the button binds to
      // this rather than to the record, so an honest absence is a missing
      // button rather than a link that goes nowhere.
      get recordUrl() {
        return this.path ? `https://github.com/${this.repo}/blob/main/${this.path}` : '';
      },

      // ── The read ──────────────────────────────────────────────────────────
      async load() {
        this.loading = true; this.err = '';
        try {
          // The kit chain first, and ABOVE the record short-circuit. A mount
          // handed its record outright (#gz=, a deck's neighbour, the app's
          // estate view) skips the FETCH, not the renderers: `settle()` reads
          // session-render, and the picker's rows read read-aloud to reduce a
          // reply to a line of prose. Returning before `ready()` gave the one
          // reader who needs #gz= the worst copy of the page: no speaker on the
          // deck, no Listen in the head, and markdown markers down every row.
          await this.ready();
          if (this.record) { this.settle(); return; }
          // A branch names no file, so it resolves before anything guesses one.
          if (this.branch && !this.path) { await this.resolveBranch(); this.settle(); return; }
          let path = this.path || this.guessPath();
          // A GUESS is not a resolution. `pathOf` derives a path from the day
          // and the id and always returns one, so a row with a day the record
          // does not carry yields a path that 404s. Cheap to try (one blob
          // read, and it is right for every row the sessions cache built) and
          // cheap to be wrong about, since the listing below is the real answer
          // and is read once per store however many slides ask.
          if (path) {
            try { this.record = await readRecord(this.repo, path); this.path = path; }
            catch { path = ''; }
          }
          if (!this.record) {
            path = await this.resolvePath();
            if (!path) throw new Error(`No record for ${this.id} in ${this.repo}. An id is the eight hex characters after the date, like 2bf8fcae; the whole stem (2026-08-05-2bf8fcae) works too.`);
            this.record = await readRecord(this.repo, path);
            this.path = path;
          }
          this.settle();
        } catch (e) {
          this.err = 'Could not open ' + (this.id || this.branch || this.path) + ': ' + (e?.message || e);
        } finally { this.loading = false; }
      },

      // The kit chain, pulled on first use. Order matters and runs bottom-up:
      // proof backs chat-render's sandboxed frames, swipe-deck owns the track,
      // chat-render renders a turn, session-render sits on all three, and
      // session-export reads session-render (which is why the deck's Export
      // button appears only when it is already here). A host that has already
      // loaded them pays nothing: the loader dedupes by registry.
      async ready() {
        if (window.sessionRender && window.sessionExport && window.readAloud
            && window.Note && window.ClosingState) return;
        if (!window.gh?.load) return;
        for (const k of ['kits/proof.js', 'kits/swipe-deck.js', 'kits/chat-render.js',
                         'kits/session-render.js', 'kits/session-export.js', 'kits/read-aloud.js',
                         'kits/note.js', 'kits/closing-state.js']) {
          await window.gh.load(k);
        }
      },

      // ── Listening ─────────────────────────────────────────────────────────
      //
      // A DOOR, not a player. This brief used to carry its own transport, which
      // was two UIs for one job and the weaker of the two: reading aloud is
      // reading, the deck is where a session is read, and only the deck knows
      // which card the reader is on. So the button opens the deck and the deck
      // starts speaking; kits/read-aloud.js `deckAction` owns everything after.
      //
      // The card it opens on is the reader's, not the top. From the outline
      // they have already chosen a moment; from the head there is no choice yet
      // and card 0 is the honest answer.
      async listen(at) {
        await this.openDeck(Number.isInteger(at) ? at : 0, { speak: true });
      },


      // A short id is what a reader actually has: the eight hex characters
      // AFTER the date in the filename, which is what search.py --show and the
      // Sessions pane both print. It is not the filename stem, which carries
      // the date too (2026-08-05-b8fae678), and calling it one here for three
      // releases is what sent a hand-built link to the empty-record error on
      // 2026-09-05: the store's own directory listing shows stems, so a stem is
      // the natural thing to paste. The day narrows the search to one directory
      // where the host knows one; without a day, one recursive tree read names
      // every record and the match is on the suffix. Either way the listing is
      // cached per store, so a deck of sessions reads it once.
      guessPath() {
        if (!this.id || !/^\d{4}-\d{2}-\d{2}$/.test(this.day)) return '';
        return window.RepoSessionsCache?.pathOf?.({ id: this.id, day: this.day }) || '';
      },
      // BOTH FORMS RESOLVE, because both are on screen somewhere: the bare
      // short id every surface prints, and the dated stem the store's directory
      // listing shows. Matching only the first made a link built from the
      // listing fail on a record that was there, and the error said `filename
      // stem` while rejecting one.
      async resolvePath() {
        if (!this.id) return '';
        const tree = await listing(this.repo);
        const short = String(this.id).replace(/^\d{4}-\d{2}-\d{2}-/, '');
        return tree.find(p => p.endsWith(`-${short}.json`)) || '';
      },

      // ── Addressing a session by the branch it worked on ───────────────────
      //
      // The one address a phone can produce without knowing anything about this
      // store. The Claude app will copy the branch a session is on and copies
      // nothing else about it, so a branch name is the only handle that crosses
      // from there to here, and `Choose-Claude` in shortcut-tools hands it
      // straight to this page.
      //
      // WHY THIS WALKS RATHER THAN READS AN INDEX. Nothing in the store joins a
      // branch to a record: the branch lives inside each record's `repos`, and
      // the one derived file that lifts it out, state/sessions.json, is 7 MB,
      // which is the wrong thing to hand a phone to answer one question. So the
      // tree listing (one call, cached, names every record and is already read
      // for #id=) orders the candidates and each is opened newest first. The
      // wanted session is the one being looked at while the branch was copied,
      // so it is the first or second read in the case this exists for.
      //
      // The tie is the honest limit. A filename carries the day and the id, so
      // ordering is exact ACROSS days and arbitrary WITHIN one; `started` is
      // the real answer and only a fetched record has it. So the walk does not
      // stop on a match: it finishes that day and keeps the latest start, which
      // costs at most one day of reads and makes "the latest session on this
      // branch" true rather than nearly true.
      async resolveBranch() {
        const want = branchOf(this.branch);
        if (!want) return '';
        const tree = await listing(this.repo);
        const paths = [...tree].sort().reverse();
        const day = (p) => (p.match(/(\d{4}-\d{2}-\d{2})-[0-9a-f]+\.json$/) || [])[1] || '';

        let best = null, bestDay = '', read = 0;
        for (const path of paths) {
          // Past the matching day, nothing left can be later. Also the only
          // exit that is not the cap, which is why the cap is generous.
          if (best && day(path) < bestDay) break;
          if (++read > WALK_CAP) break;
          let rec;
          try { rec = await readRecord(this.repo, path); } catch { continue; }
          if (!(rec.repos || []).some(r => r && r.branch === want)) continue;
          // Paths run newest day first, so the first hit fixes the day and only
          // a later `started` inside it can displace the record.
          if (!best) { best = rec; bestDay = day(path); this.path = path; }
          else if ((rec.started || '') > (best.started || '')) { best = rec; this.path = path; }
        }
        if (!best) {
          throw new Error(`No session on ${want} in the ${read} most recent records.`
            + ' A record is published when the session it describes stops, so a live one may not be here yet.');
        }
        this.record = best;
        this.id = best.short || this.id;
        return this.path;
      },

      // Everything that follows a successful read, in one place so the deck
      // host and the page get the same sequence: tell the host what it could
      // not know, warm the neighbours, draw the pane.
      settle() {
        if (typeof o.onMeta === 'function') {
          try {
            o.onMeta({ title: this.head.title, agent: this.agentUrl, cards: this.cards,
                       path: this.path });
          } catch { /* a host that throws on meta is not this view's problem */ }
        }
        this.$nextTick(() => {
          if (this.pane === 'raw') this.mountRaw(); else this.mountOutline();
          if (Number.isInteger(o.start)) this.openDeck(o.start);
        });
        this.warm();
      },

      // Read the neighbours the host named, into the module cache, after this
      // one has settled. Nothing is rendered and nothing is awaited: the point
      // is only that the next slide's record is already in flight when the
      // reader swipes. Failures are silent, since a warm that fails costs a
      // warm and the real open will report it properly. Same contract, and the
      // same reasoning, as branch-brief's.
      warm() {
        for (const n of (o.warm || []).slice(0, 2)) {
          const p = n?.path || (n?.id && n?.day && window.RepoSessionsCache?.pathOf?.({ id: n.id, day: n.day }));
          if (p) readRecord(this.repo, p).catch(() => {});
        }
      },

      // ── The panes ─────────────────────────────────────────────────────────
      // Both mount imperatively rather than through Alpine: the outline is a
      // framework-free kit that owns its own rows and panels, and re-rendering
      // it through a reactive template would discard their state on any tick.
      mountOutline() {
        const box = this.$refs.outline;
        if (!box || !this.record || !window.sessionExport) return;
        if (this.outlineBuilt) return;
        try {
          box.replaceChildren(
            window.sessionExport.index(this.record,
              { onOpen: (i) => this.openDeck(i), flow: !this.framed }).el);
          this.outlineBuilt = true;
        } catch (e) { this.err = e?.message || String(e); }
      },
      // Built on the first visit to the pane rather than at load: the record
      // runs into the hundreds of kilobytes and a code card over it is not a
      // cost to pay for a reader who never opens the tab.
      mountRaw() {
        if (this.rawBuilt || !this.record || !window.chatRender) return;
        const box = this.$refs.raw;
        if (!box) return;
        try {
          // `fill` ONLY WHERE THIS PANE IS A VIEWPORT, which framed makes it and
          // document flow does not. Framed, the card's own clamp would be a
          // second scroll inside the first and leave the pane half empty under
          // a "Show all 983 lines" button. In flow there is no first scroll to
          // sit inside, so `fill` laid this session's 243 KB out as one
          // 40,528px block with no control on any of it (measured 2026-09-04 at
          // 390x844). Unfilled, chat-render's own clamp holds it to 20rem and
          // the reader asks for the rest.
          box.replaceChildren(window.chatRender.block({ lang: 'json', code: this.rawJson },
                                                      { fill: this.framed }));
          this.rawBuilt = true;
        } catch (e) { this.err = e?.message || String(e); }
      },

      // The card deck, optionally opening at a card: tapping an outline row is
      // the join between the two views, and landing on slide 0 after choosing
      // row 12 would throw the choice away.
      //
      // A deck already on screen becomes this one's parent, so a session opened
      // inside a deck of sessions drills rather than stacking, and Back lands
      // on the session rather than on the list. Exactly what branch-brief's
      // openFileDeck does one object over.
      async openDeck(at, o = {}) {
        if (this.deckOpening || !this.record) return;
        this.deckOpening = true;
        try {
          await this.ready();
          if (!window.sessionRender) throw new Error('the session renderer did not load');
          const parent = window.swipeDeck?.top?.() || null;
          const deck = await window.sessionRender.open(this.record, {
            ...(Number.isInteger(at) ? { start: at } : {}),
            ...(parent ? { parent } : {}),
          });
          // ONE gesture, start to speech. Safari refuses to speak until a user
          // gesture has reached the synth, and the tap that opened this deck is
          // the only one there will be; a second tap on the deck's own speaker
          // is exactly the friction the brief's button exists to remove.
          if (o.speak) deck?.speak?.();
        } catch (e) {
          this.err = e?.message || String(e);
        } finally { this.deckOpening = false; }
      },
    };
  });
  };

  // ── The two module-scope reads ────────────────────────────────────────────
  // Both are plain memos with the same expiry, kept out of the component for
  // the reason stated at the top: the deck reuses one mount per slide, and
  // what these answer is a property of the store rather than of the visit.
  function fresh(entry) { return entry && (Date.now() - entry.at) < TTL_MS; }

  // The PROMISE is memoized, not the settled record, and the difference shows
  // exactly where the deck lives: three slides mount at once and the reader's
  // two neighbours are warmed on top, so several callers ask for the same path
  // within a tick. Caching after the await lets every one of them miss and
  // fetch, which is the shape of bug that looks like nothing until the store is
  // private and every read is a rate-limited call.
  function readRecord(repo, path) {
    const hit = RECORDS.get(path);
    if (fresh(hit)) return hit.promise;
    const promise = (async () => {
      const g = new window.GH({ token: window.TOKEN, repo, ref: 'main' });
      return JSON.parse((await g.get(path)).text);
    })();
    RECORDS.set(path, { at: Date.now(), promise });
    // A failed read must not stand as the answer for a minute.
    promise.catch(() => RECORDS.delete(path));
    return promise;
  }

  async function listing(repo) {
    const hit = LISTINGS.get(repo);
    if (fresh(hit)) return hit.promise;
    const promise = (async () => {
      const g = new window.GH({ token: window.TOKEN, repo, ref: 'main' });
      const tree = await g.req('git/trees/main?recursive=1');
      return (tree.tree || [])
        .filter(n => n.type === 'blob' && /^sessions\/\d{4}\/\d{2}\//.test(n.path))
        .map(n => n.path);
    })();
    LISTINGS.set(repo, { at: Date.now(), promise });
    // A failed read must not be cached as the answer for a minute.
    promise.catch(() => LISTINGS.delete(repo));
    return promise;
  }

  // Registration is defensive rather than a bare `alpine:init` listener: this
  // component can arrive at the end of a gh.load chain, which may finish after
  // Alpine has already started, and a missed event leaves the host rendering
  // "sessionBrief is not defined". Same idiom branch-brief.js uses for the same
  // race.
  if (window.Alpine?.directive) register();
  else document.addEventListener('alpine:init', register);
})();
