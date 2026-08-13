// alpineComponents/branch-brief.js — the branch page's view.
//
// Renders what kits/branch-brief.js assembles: a derived layer that reloads
// from the API every visit, and an optional authored layer laid over it. The
// model does the thinking; this file is markup and three pieces of formatting.
//
// Mounted by pages/branch.html. The per-file diff cards are fileReview
// (alpineComponents/file-review.js), the same dossier pages/review.html uses,
// so a file reads identically in both places.
//
// One mount, many branches. When embedded (show-repo's branch-detail takeover)
// it takes its next subject over postMessage and reloads in place, rather than
// the embedder swapping the iframe's src and paying a document load per step.
// See `listen` for the channel and what each message carries.
// Registration is defensive rather than a bare `alpine:init` listener: this
// component arrives at the end of a gh.load chain, which can finish after
// Alpine has already started, and a missed event leaves the page rendering
// "branchBrief is not defined". Same idiom lib/alpine-bundle.js uses for the
// same race.
(function () {
  // Content registries already read, keyed repo@ref, value the parsed rows or
  // null for "this repo declares none". Module scope rather than component
  // state because the swiper reuses one mount across every branch it steps
  // through, and the answer is a property of the ref, not of the visit. A null
  // is cached as deliberately as a hit: the no-registry answer is a 404, and
  // paying for it once per branch was most of what this cache saves.
  //
  // Same expiry as the brief cache, and for the same reason: this page claims
  // its facts are read at open time, and the only version of a cache that
  // keeps that claim honest is one that describes a single reading pass. The
  // registry is not fetched by kits/content-registry.js because that kit is
  // pure by contract (the caller knows the repo and ref, so the caller
  // fetches), which is why the memo lives here beside its one caller.
  const REGISTRIES = new Map();   // 'repo@ref' -> { at, rows }
  const registryTtl = () => window.BranchBrief?.TTL_MS || 60000;

  const register = function () {
  Alpine.data('branchBrief', function (opts) {
    const o = opts || {};

    const fmtDate = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return isNaN(d) ? '' : d.toISOString().slice(0, 10);
    };
    const days = (a, b) => {
      if (!a || !b) return null;
      const n = Math.round((new Date(b) - new Date(a)) / 86400000);
      return isNaN(n) ? null : n;
    };

    return {
      description: 'One branch as a page: derived state from the API, plus an optional authored layer',

      repo: o.repo || '', branch: o.branch || '', base: o.base || '',
      brief: null, loading: true,
      // Three fields, not one string, because a failure here has three things
      // to say and they are read at different depths: what went wrong, what to
      // do about it, and what actually threw. The last one used to BE the
      // message, which is how a reader got
      // "undefined is not an object (evaluating 'window.BranchBrief.fetchBrief')"
      // presented as though GitHub had refused the branch (reported from a
      // phone, 2026-08-07).
      error: '', errorHint: '', errorRaw: '',
      // The repo's content registry (data/design/content.csv, parsed rows) at
      // the branch ref, or null where none is declared. It is what lets the
      // Files pane group by creation mode instead of listing dist/ output and
      // authored work as equals. groupState holds the reader's own open/closed
      // overrides per group; the default comes from the grouping (mechanical
      // starts collapsed).
      registry: null, groupState: {},
      inbox: null,   // the repo's declared inbox dir, from the shell cache; aims the deposit
      // Whether an embedder is supplying the identity chrome (show-repo's
      // takeover does), so this view can stop repeating it.
      framed: !!o.framed,
      // Which pane is showing. Guide when there is one, since judgment is what
      // a reader came for; Files otherwise, since a branch with no PR has
      // nothing else to lead with.
      pane: 'files',
      // The guide: which PR is on display, and its rendered body.
      guideIdx: 0, guideHtml: '', guideTargets: [], guideFor: null,

      template: `
        <div class="max-w-4xl mx-auto p-4 flex flex-col gap-4">

          <div x-show="loading" class="flex justify-center py-16">
            <span class="loading loading-spinner loading-lg text-primary"></span>
          </div>
          <!-- One child, not three. A daisyUI alert lays its children out in a
               grid column, so three siblings become three columns and the copy
               renders as three narrow stripes. -->
          <div x-show="error" class="alert alert-warning">
            <div class="flex flex-col gap-1 min-w-0">
              <div class="font-medium" x-text="error"></div>
              <div x-show="errorHint" class="text-sm opacity-80" x-text="errorHint"></div>
              <div x-show="errorRaw" class="font-mono text-xs opacity-50 break-all" x-text="errorRaw"></div>
            </div>
          </div>

          <template x-if="brief && !loading">
            <div class="flex flex-col gap-4">

              <!-- Identity, and how much of it depends on who is asking.
                   The state chip is the one thing to read first: a branch that
                   is landed or on an unrelated line cannot be in flight,
                   whatever its name or date suggests.

                   The branch name lives HERE and only here. Both this and the
                   takeover's header carried it for a day, and at phone width
                   both truncated, so one screen showed two stubs of one name.
                   The header gave it up (it has less room and more to say:
                   which repo, which PR, where you are in the list), which
                   leaves this the one place it is written, on its own line so a
                   claude/<slug> has the full width and needs neither a wrap nor
                   an ellipsis. The repo is what drops when framed, since the
                   header does carry that. -->
              <div class="flex flex-col gap-0.5 min-w-0">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="badge shrink-0" :class="stateClass" x-text="brief.state"></span>
                  <span class="font-mono text-base font-medium truncate min-w-0"
                        :title="brief.branch" x-text="brief.branch"></span>
                </div>
                <div class="text-xs opacity-55 font-mono truncate">
                  <span x-show="!framed" x-text="brief.repo + ' '"></span>vs <span x-text="brief.base"></span>
                </div>
              </div>

              <!-- The derived facts, each one free from the compare.
                   A wrapping strip rather than the daisyUI stats component:
                   that one stacks to full-width blocks below its breakpoint,
                   which on a phone turned four short numbers into most of a
                   screen of white. These are four small facts and should read
                   as one line, wrapping to two when they must.
                   (No backticks in this markup: it is a JS template literal.) -->
              <div class="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-sm
                          rounded-lg border border-base-300 bg-base-100 px-3 py-2">
                <span class="whitespace-nowrap">
                  <span class="opacity-55">ahead</span>
                  <span class="font-mono font-medium text-success" x-text="brief.ahead ?? '?'"></span>
                  <span class="opacity-55 ml-1">behind</span>
                  <span class="font-mono font-medium text-warning" x-text="brief.behind ?? '?'"></span>
                </span>
                <span class="whitespace-nowrap">
                  <span class="opacity-55">lifespan</span>
                  <span class="font-mono font-medium" x-text="lifespan"></span>
                  <span class="opacity-45 text-xs" x-text="lifespanRange"></span>
                </span>
                <span class="whitespace-nowrap font-mono text-xs tabular-nums" x-show="brief.files.length">
                  <span class="text-success" x-text="'+' + fileTotals.additions"></span>
                  <span class="text-error ml-1" x-text="'-' + fileTotals.deletions"></span>
                </span>
                <span class="whitespace-nowrap" x-show="!brief.complete">
                  <span class="opacity-45 text-xs">file list capped</span>
                </span>
              </div>

              <!-- One row carrying both the switch and the exits.
                   The three sections used to run end to end, which put the
                   changed files below a full screen of guide on a phone: the
                   thing most often wanted was the thing furthest away. They are
                   panes now, and the counts ride the labels, so the switch also
                   answers "how much is here" without opening anything.

                   The exits sit on the same row as icons rather than on a row
                   of their own with words. They are destinations you take once
                   and leave, so they earn their place at icon size and not at
                   the cost of a line. The PR link drops when framed, since the
                   frame's header carries the number and links it. -->
              <div class="flex items-center gap-2">
                <div role="tablist" class="tabs tabs-box tabs-sm bg-base-200 p-0.5 min-w-0">
                  <a role="tab" class="tab gap-1" x-show="hasGuide"
                     :class="pane === 'guide' && 'tab-active'" @click="pane = 'guide'">Guide</a>
                  <a role="tab" class="tab gap-1" :class="pane === 'files' && 'tab-active'" @click="pane = 'files'">
                    Files<span class="font-mono opacity-50" x-text="brief.files.length"></span></a>
                  <a role="tab" class="tab gap-1" :class="pane === 'commits' && 'tab-active'" @click="pane = 'commits'">
                    Commits<span class="font-mono opacity-50" x-text="brief.commitCount"></span></a>
                </div>
                <div class="grow"></div>
                <template x-for="(s, i) in brief.sessions" :key="s">
                  <a :href="s" target="_blank" class="btn btn-sm btn-square btn-ghost max-sm:h-11 max-sm:w-11"
                     :title="(brief.sessions.length > 1 ? 'Session ' + (i + 1) + ': ' : '')
                             + (brief.sessionsExact ? 'the session that authored this branch'
                                                    : 'approximate, read from the branch tip')">
                    <svg viewBox="0 0 24 24" class="w-4 h-4 max-sm:w-5 max-sm:h-5 shrink-0" style="stroke:#d97757" stroke-width="2.2"
                         stroke-linecap="round" fill="none" aria-hidden="true"><path d="M12,12 L12.0,1.6 M12,12 L17.62,3.25 M12,12 L21.46,7.68 M12,12 L22.29,13.48 M12,12 L19.86,18.81 M12,12 L14.93,21.98 M12,12 L9.07,21.98 M12,12 L4.14,18.81 M12,12 L1.71,13.48 M12,12 L2.54,7.68 M12,12 L6.38,3.25"/></svg>
                  </a>
                </template>
                <!-- The GitHub exits as ONE menu, the house idiom (the Files
                     pane's file-review header carries the same control): a
                     github mark opens labeled rows, because three bare glyphs
                     in a row were cryptic. Same rows, now with words. -->
                <details class="dropdown dropdown-end" x-ref="ghMenu">
                  <summary class="btn btn-sm btn-ghost gap-1 cursor-pointer max-sm:h-11" title="This branch on GitHub">
                    <i class="ph ph-github-logo text-lg max-sm:text-xl"></i>
                    <i class="ph ph-caret-down text-[10px] opacity-50"></i>
                  </summary>
                  <ul class="dropdown-content menu menu-sm z-20 mt-1 w-60 rounded-box border border-base-300 bg-base-100 p-1 shadow-lg">
                    <template x-for="l in ghRows" :key="l.label">
                      <li><a :href="l.url" target="_blank" rel="noopener" @click="$refs.ghMenu.open = false"
                             class="gap-2 flex-nowrap">
                        <i class="ph shrink-0" :class="l.icon"></i>
                        <span class="shrink-0" x-text="l.label"></span>
                        <span class="grow"></span>
                        <span class="font-mono text-xs opacity-40 shrink-0" x-text="l.hint"></span></a></li>
                    </template>
                  </ul>
                </details>
                <!-- Add a file: opens the stage aimed at THIS branch (dest
                     prefilled to repo@branch:inbox-or-dump). The stage owns
                     deposit: paste or drop content there, tap send, and the
                     local items commit onto the branch. A plus, because that
                     is the glyph a reader looks for. -->
                <a :href="stageDepositUrl" class="btn btn-sm btn-square btn-ghost max-sm:h-11 max-sm:w-11"
                   title="Add a file to this branch: opens the stage with the destination set">
                  <i class="ph ph-plus text-lg max-sm:text-xl"></i></a>
              </div>

              <!-- ── The guide: the PR body, rendered here ────────────────
                   The judgment layer, and the one that was missing. Everything
                   above and below this block is DERIVED, so it is current by
                   construction and says nothing about why the branch exists.
                   The PR body is where that has always been written, and this
                   page was fetching it and rendering a button.

                   Rendered through kits/guide-render.js, the same renderer the
                   FAB drawer uses, so a guide reads identically in both. Links
                   to a renderable file are re-aimed at the renderer that can
                   show it and lifted into a chip strip deduped by file. They
                   open in a new tab here rather than in place: this page is not
                   a drawer wrapped around a rendered subject, so there is
                   nowhere in place to open.

                   Arrows step through every PR the branch has had, newest
                   first, because a merge ends a PR and not the branch. -->
              <template x-if="brief.prs.length && pane === 'guide'">
                <div class="card border border-base-300 bg-base-100">
                  <div class="card-body p-4 gap-3">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-xs uppercase tracking-wide opacity-60">Guide</span>
                      <a :href="prUrl" target="_blank"
                         class="font-mono text-sm font-semibold hover:text-primary"
                         x-text="'#' + guidePr.number"></a>
                      <span class="badge badge-sm" :class="prStateClass" x-text="prStateLabel"></span>
                      <div class="grow"></div>
                      <div x-show="brief.prs.length > 1" class="join">
                        <button class="btn btn-xs join-item" @click="stepGuide(1)"
                                :disabled="guideIdx >= brief.prs.length - 1"
                                title="Older PR for this branch"><i class="ph ph-caret-left"></i></button>
                        <span class="btn btn-xs join-item no-animation pointer-events-none font-mono"
                              x-text="(guideIdx + 1) + '/' + brief.prs.length"></span>
                        <button class="btn btn-xs join-item" @click="stepGuide(-1)"
                                :disabled="guideIdx <= 0"
                                title="Newer PR for this branch"><i class="ph ph-caret-right"></i></button>
                      </div>
                    </div>
                    <div class="text-sm font-semibold leading-snug" x-text="guidePr.title"></div>

                    <!-- The file chips: the guide's own links, as a menu. -->
                    <div x-show="guideTargets.length" class="flex flex-wrap gap-1">
                      <template x-for="t in guideTargets" :key="t.addr">
                        <a :href="t.url" target="_blank" rel="noopener" :title="t.title"
                           class="btn btn-xs btn-ghost gap-1 font-mono normal-case">
                          <i class="ph" :class="t.icon"></i><span x-text="t.label"></span>
                        </a>
                      </template>
                    </div>

                    <div x-show="guideHtml" x-html="guideHtml" :class="guideBodyClass"></div>
                    <div x-show="!guideHtml && guidePr.body" class="text-sm opacity-50">Rendering…</div>
                    <div x-show="!guidePr.body" class="text-sm opacity-50 italic">
                      This PR has an empty body.</div>
                  </div>
                </div>
              </template>

              <!-- The authored layer: an envelope handed in on the link, for a
                   branch with no PR to carry the judgment. The page is complete
                   without either. -->
              <template x-if="brief.authored && pane === 'guide'">
                <div class="card border border-base-300 bg-base-100">
                  <div class="card-body p-4 gap-3">
                    <div x-show="brief.authored.intent" class="prose prose-sm max-w-none">
                      <p class="whitespace-pre-line m-0" x-text="brief.authored.intent"></p>
                    </div>
                    <div x-show="brief.authored.open.length">
                      <div class="text-xs uppercase tracking-wide opacity-60 mb-1">Open</div>
                      <ul class="list-disc list-inside text-sm flex flex-col gap-0.5">
                        <template x-for="t in brief.authored.open" :key="t"><li x-text="t"></li></template>
                      </ul>
                    </div>
                    <div x-show="brief.authored.omitted.length">
                      <div class="text-xs uppercase tracking-wide opacity-60 mb-1">Left out</div>
                      <ul class="list-disc list-inside text-sm opacity-70 flex flex-col gap-0.5">
                        <template x-for="t in brief.authored.omitted" :key="t"><li x-text="t"></li></template>
                      </ul>
                    </div>
                    <div x-show="brief.authored.notes" class="text-sm opacity-80 whitespace-pre-line"
                         x-text="brief.authored.notes"></div>
                  </div>
                </div>
              </template>

              <!-- Commits, newest first. -->
              <div x-show="brief.commits.length && pane === 'commits'" class="flex flex-col gap-1">
                <template x-for="c in brief.commits.slice(0, 12)" :key="c.sha">
                  <div class="flex items-baseline gap-2 text-sm border-b border-base-200 py-1">
                    <a :href="'https://github.com/' + brief.repo + '/commit/' + c.sha" target="_blank"
                       class="font-mono text-xs opacity-50 hover:text-primary shrink-0"
                       x-text="c.sha.slice(0, 7)"></a>
                    <span class="truncate" x-text="c.subject"></span>
                  </div>
                </template>
              </div>

              <!-- The diff, the same per-file dossier the review page renders.
                   The list is always visible and the cards start OPEN on a
                   modest branch: this page exists to read a branch, and a wall
                   of closed caret rows was two taps of collapsing before any
                   content ("too much collapsing", measured in use). Past a
                   dozen files the cards start closed, so a sweeping branch
                   costs a tap per file rather than a fetch storm up front. -->
              <!-- No heading and no totals row: the tab that got you here says
                   "Files" and carries the count, and the totals moved up into
                   the facts strip, which had room on its line. A heading plus a
                   right-aligned pair of numbers was two rows of phone screen
                   between the switch and the first file. -->
              <!-- Where the repo declares a content registry
                   (data/design/content.csv), the list groups by CREATION MODE:
                   authored work first, the machine's output last and collapsed
                   behind its count, each group carrying the registry's own
                   standing description where one row covers it. That is the
                   registry doing, every PR and by declaration, what the guide
                   body's Changed list used to do by hand: separating the files
                   someone decided from the files a generator emitted. A repo
                   with no registry gets the flat list this pane always had.
                   Collapsed groups mount nothing (x-if), so their cards fetch
                   no diffs until opened. -->
              <div x-show="brief.files.length && pane === 'files'" class="flex flex-col gap-1.5">
                <!-- One bordered list per group with hairline rows, not a stack
                     of cards with gaps between them. Thirty files at a card
                     each was a column of boxes whose borders and spacing
                     carried no information; the rows are the information. -->
                <template x-for="g in fileGroups" :key="g.mode">
                  <div class="border border-base-300 rounded-lg overflow-hidden">
                    <button x-show="g.labeled" type="button" @click="toggleGroup(g.mode)"
                            class="w-full min-h-9 flex items-center gap-2 px-2.5 py-1 bg-base-200/60 text-left hover:bg-base-200 transition-colors">
                      <i class="ph text-sm text-base-content/50" :class="groupOpen(g) ? 'ph-caret-down' : 'ph-caret-right'"></i>
                      <span class="text-xs font-semibold uppercase tracking-wide text-base-content/70" x-text="g.mode"></span>
                      <span class="font-mono text-xs text-base-content/40" x-text="g.files.length"></span>
                      <span x-show="g.note" class="min-w-0 truncate text-xs text-base-content/45" x-text="g.note"></span>
                    </button>
                    <template x-if="groupOpen(g)">
                      <div>
                        <template x-for="f in g.files" :key="f.path">
                          <div>
                            <div x-show="fileNote(f.path)" class="text-xs opacity-70 px-2 pt-1" x-text="fileNote(f.path)"></div>
                            <div x-data="fileReview(cardOpts(f))"></div>
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
      `,

      init() {
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        if (this.framed) this.listen();
        this.load();
      },

      // ── Being embedded: one page, many branches ──────────────────────────
      //
      // The swiper used to step by swapping the iframe's src, which is a whole
      // document load per step: the 2.4 MB pre-build re-parsed and re-executed,
      // Alpine booted, the DOM walked, before the first API call is even sent.
      // A branch is a different SUBJECT for this component, not a different
      // page, so the embedder now asks for the next one over postMessage and
      // this reloads itself in place. The mount survives, the library is
      // already warm, and the step costs what the data costs.
      //
      // It lives here rather than in pages/branch.html for a reason that has
      // bitten this page before: ?use= swaps the LIBRARY while github.io still
      // serves the page file from main, so anything written into the shell
      // cannot be previewed from a branch and ships dark. The shell keeps only
      // what it alone can do (resolve the address it was opened at); every
      // behaviour that a preview link has to be able to show belongs in lib/.
      //
      // Two messages in, one out. `branch-open` names the next subject and,
      // optionally, the neighbours worth warming; `branch-refresh` drops the
      // cached read and asks again, which is how an embedder overrides the
      // TTL. Going out, `branch-state` reports loading and ready, and carries
      // the PR number, because the embedder's own list knows only OPEN pull
      // requests (the activity crawl asks for those alone) and so has nothing
      // to show for a branch whose PR merged. This page asks `state=all` at
      // open time and is therefore the only party that knows.
      listen() {
        window.addEventListener('message', (e) => {
          const m = e.data;
          if (!m || m.source !== 'web-tools') return;
          if (m.type === 'branch-open') this.openBranch(m);
          else if (m.type === 'branch-refresh') {
            window.BranchBrief?.forget?.(this.repo, this.branch, this.base);
            this.forgetRegistry();
            this.load();
          }
        });
      },

      // Swap the subject. Everything derived from the old branch is cleared
      // here rather than inside load(), so a failed read leaves no half of the
      // previous branch on screen claiming to describe this one.
      openBranch(m) {
        const repo = m.repo || this.repo, branch = m.branch || '';
        if (!branch) return;
        this._warm = Array.isArray(m.warm) ? m.warm : [];
        if (repo === this.repo && branch === this.branch) { this.warmNeighbours(); return; }
        this.repo = repo;
        this.branch = branch;
        this.base = m.base || '';
        this.brief = null;
        this.registry = null; this.groupState = {};
        this.guideIdx = 0; this.guideFor = null; this.guideHtml = ''; this.guideTargets = [];
        this.pane = 'files';
        this.load();
      },

      // What the embedder is told, and when. `ready` is the signal it fades the
      // live page in on; it also lands as an attribute on the root element,
      // which is how the takeover read it before there was a channel and how
      // any other embedder still can.
      report(phase) {
        const el = document.documentElement;
        const pr = phase === 'ready' ? this.guidePr : null;
        try {
          if (phase === 'ready') el.setAttribute('data-brief-ready', '');
          else el.removeAttribute('data-brief-ready');
          if (pr) {
            el.setAttribute('data-brief-pr', String(pr.number));
            el.setAttribute('data-brief-pr-state', this.prStateLabel);
          } else {
            el.removeAttribute('data-brief-pr');
            el.removeAttribute('data-brief-pr-state');
          }
        } catch {}
        if (!this.framed) return;
        // Same-origin by construction (the takeover embeds a sibling page), so
        // the origin is named rather than starred: a cross-origin embedder
        // getting nothing is the right failure for a channel whose only
        // consumer ships in the same deployment.
        try {
          parent.postMessage({
            source: 'web-tools', type: 'branch-state', phase,
            repo: this.repo, branch: this.branch,
            pr: pr ? pr.number : 0, prState: pr ? this.prStateLabel : '',
          }, location.origin);
        } catch {}
      },

      // Read the neighbours the embedder named, into the kit's cache, after
      // this branch has settled. Nothing is rendered and nothing is awaited:
      // the point is only that the compare is already in flight, or already
      // answered, when the reader arrives. A failure is silent by design,
      // since it costs a warm and the real open will report it properly.
      //
      // This is what the takeover's own note ruled out for the src-swap era,
      // and the ruling still holds in the form it was made: N slides cannot be
      // N live pages. One live page reading two neighbours ahead is a
      // different proposition, and it is the same active-plus-neighbours rule
      // kits/swipe-deck.js already renders by.
      warmNeighbours() {
        for (const n of (this._warm || [])) {
          if (!n || !n.repo || !n.branch) continue;
          if (n.repo === this.repo && n.branch === this.branch) continue;
          try {
            const gh = new window.GH({ token: window.TOKEN, repo: n.repo, ref: n.branch });
            window.BranchBrief.readBrief(gh, { repo: n.repo, branch: n.branch, base: n.base || '' })
              .catch(() => {});
            // Both reads, not just the compare. Warming one of the two leaves
            // the other as the step's entire wait, which is the shape the
            // measurement caught.
            this.readRegistry(n.repo, n.branch).catch(() => {});
          } catch {}
        }
      },
      _warm: [],

      // What actually went wrong, in the reader's terms. The address is the
      // same in every case, so it leads; the second line is the only part that
      // differs, and it is the only part worth reading.
      //
      // 404 gets the longest hint on purpose. It is the failure a correct link
      // produces most often, because an owner-mode #gh= address reads through a
      // token stored in ONE browser: opened in a fresh browser, an in-app
      // sheet, or by anyone else, a private repo is indistinguishable from a
      // missing one and GitHub says 404 either way. That caveat is stated in
      // the surfacing conventions and nowhere the reader can see it, which is
      // the gap this line closes.
      fail(e) {
        const at = this.repo + '@' + this.branch;
        const raw = e?.message || String(e);
        const hint = {
          401: 'The stored GitHub token was rejected. Sign in again to refresh it.',
          403: 'GitHub refused the read: either an un-tokened request hit the rate limit, or the token lacks access to this repo.',
          404: 'Either the branch is gone, or this browser holds no GitHub token. A private repo reads as missing to an un-tokened browser, which is what an in-app or fresh browser usually is. Sign in, or open the link in your normal browser.',
        }[e?.status];
        this.error = 'Could not read ' + at;
        this.errorHint = hint || (/^(Failed to fetch|NetworkError|Load failed)/.test(raw)
          ? 'The request never reached GitHub. Check the connection and reload.'
          : '');
        this.errorRaw = raw;
      },

      async load() {
        this.loading = true; this.error = ''; this.errorHint = ''; this.errorRaw = '';
        this.report('loading');
        // Which load this is. A step that lands while the previous read is in
        // flight must not have the older answer arrive on top of it, and with
        // the cache in front of the fetch the two can now settle out of order
        // cheaply enough to matter.
        const pass = ++this._pass;
        try {
          // Checked, not assumed. This component is registered by the pre-build's
          // auto-boot while kits/branch-brief.js rides in its page's own gh.load
          // chain, which runs after; a page that forgets the ready gate mounts
          // this against a kit that does not exist yet. Naming that condition is
          // the difference between "reload the page" and a TypeError the reader
          // has no way to act on.
          if (!window.BranchBrief) {
            this.error = 'This page has not finished loading its code';
            this.errorHint = 'Reload the page. If it persists, the page is being served from a stale cache: reload once more with the cache bypassed.';
            this.errorRaw = 'window.BranchBrief is undefined (kits/branch-brief.js did not run before the mount)';
            return;
          }
          const gh = new window.GH({ token: window.TOKEN, repo: this.repo, ref: this.branch });
          // Both reads START here. The registry used to run after the brief
          // resolved, which put a whole round trip on the critical path for a
          // CSV that decides nothing but the grouping of one pane, and on a
          // repo declaring none it was a 404 the reader watched before seeing
          // a diff. Started together, the page costs max(compare, csv) rather
          // than their sum, and the memo makes the second branch of a repo pay
          // nothing at all.
          //
          // It is awaited BEFORE the render rather than allowed to land late,
          // and that is the part worth keeping. Letting it arrive after would
          // regroup the pane under the reader, tearing down every file card
          // that had already mounted and re-fetching whatever they had opened.
          // A pane that appears once, grouped, is worth the shorter of two
          // waits that are now running at the same time.
          const registry = this.loadRegistry(pass);
          const { compare, pull, pulls } = await window.BranchBrief.readBrief(gh, {
            repo: this.repo, branch: this.branch, base: this.base,
          });
          if (pass !== this._pass) return;      // a later branch overtook this one
          this.brief = window.BranchBrief.assemble({
            repo: this.repo, branch: this.branch, base: this.base,
            compare, pull, pulls, authored: o.authored || null,
          });
          // The repo's declared inbox, for the drop-a-file mint: the shell's
          // config cache when this renders inside show-repo, else null, which
          // BranchSurvey turns into dump/. Deliberately NOT a fetch: mount
          // reads nothing beyond the brief (branch-brief-cards holds that),
          // and dump/ is the convention's own universal default.
          this.inbox = window.__shell?.estateConfigs?.[this.repo]?.inbox || null;
          // A link that named a PR opens on that PR rather than the newest, so
          // #gh=owner/repo&pr=<n> lands where it says even after a second PR
          // has opened on the same branch.
          if (o.pr) {
            const i = this.brief.prs.findIndex(p => p.number === Number(o.pr));
            if (i >= 0) this.guideIdx = i;
          }
          if (this.hasGuide) this.pane = 'guide';
          this.renderGuide();
          await registry;                       // already running; assigns this.registry
        } catch (e) {
          if (pass === this._pass) this.fail(e);
        } finally {
          if (pass === this._pass) {
            this.loading = false;
            // The ready signal an embedder can watch (show-repo's branch-detail
            // takeover holds its instant facts card up until this appears, then
            // fades the page in). On the root element so a same-origin parent
            // can read it without knowing this component's internals, and now
            // also as a message carrying the PR number (see report).
            this.report('ready');
            // Last, and only once this branch is on screen: the neighbours the
            // embedder named. Nothing here is awaited or rendered.
            this.warmNeighbours();
          }
        }
      },
      _pass: 0,

      // The content registry, read at the BRANCH ref so a branch that declares
      // new rows reviews under them. Absent or unparsable means no
      // categorization, which is the flat list this pane always had: the
      // registry owes the repo no inventory, and this pane owes the registry
      // no error. Landing late is fine: `fileGroups` falls back to the flat
      // list until it arrives, so the pane regroups rather than appearing.
      //
      // The reader is lazy-loaded HERE, not owed to the page's own load chain
      // (the estate's sessionRender idiom). This is load-bearing for previews:
      // ?use= swaps the BUNDLE while github.io serves the PAGE FILE from main,
      // so a gh.load line added to branch.html does not exist in the deployed
      // shell until merge, and the grouping shipped dark under exactly the link
      // meant to show it (measured 2026-08-08, from a phone). The bundle's
      // inlined cache serves this load without a network trip; branch.html
      // still lists it for the plain chain.
      //
      // Cached per repo@ref for the swiper's sake: stepping through eight
      // branches of one repo asked the same question eight times, and on a repo
      // with no registry that is eight 404s.
      async loadRegistry(pass) {
        const rows = await this.readRegistry(this.repo, this.branch);
        if (pass === this._pass) this.registry = rows;
      },

      // The read itself, with nothing of the current branch in it, so a
      // neighbour can be warmed through the same path. Keyed by ref rather
      // than by repo because a branch that declares new rows must review under
      // them, which is also why warming it matters: it is the one read a
      // warmed neighbour would otherwise still owe, and it was left as the
      // whole critical path of an otherwise free step (measured at 246ms
      // against 53ms for a fully warmed one, branch-step-cost.mjs).
      readRegistry(repo, ref) {
        const key = repo + '@' + ref;
        const hit = REGISTRIES.get(key);
        if (hit && Date.now() - hit.at < registryTtl()) return hit.p;
        // The PROMISE is stored, for the same reason readBrief stores one: a
        // warm still in flight has to be JOINED, not raced. Storing the
        // resolved rows instead left the arriving reader issuing a second
        // request while the prefetch was mid-air, so the neighbour was warmed
        // and the step paid for it anyway.
        const p = (async () => {
          try {
            if (!window.ContentRegistry && window.gh?.load) await window.gh.load('kits/content-registry.js');
            const gh = new window.GH({ token: window.TOKEN, repo, ref });
            const csv = (await gh.get(window.ContentRegistry?.PATH || 'data/design/content.csv')).text;
            const parsed = window.ContentRegistry?.parse?.(csv) || [];
            return parsed.length ? parsed : null;
          } catch { return null; }      // never rejects, so the memo is always an answer
        })();
        REGISTRIES.set(key, { at: Date.now(), p });
        return p;
      },
      // Drop the memo ahead of its expiry. The refresh message is the reader
      // saying the cached observation is no longer the one they want.
      forgetRegistry() { REGISTRIES.clear(); },

      get stateClass() {
        return { live: 'badge-success', landed: 'badge-ghost', unrelated: 'badge-warning' }[this.brief?.state]
               || 'badge-ghost';
      },
      get lifespan() {
        const n = days(this.brief?.firstDate, this.brief?.lastDate);
        return n === null ? '?' : (n === 0 ? 'same day' : n + 'd');
      },
      get lifespanRange() {
        const a = fmtDate(this.brief?.firstDate), b = fmtDate(this.brief?.lastDate);
        return a && b ? (a === b ? a : a + ' to ' + b) : '';
      },
      // ── The guide ────────────────────────────────────────────────────────
      // Whether there is a judgment layer at all: a PR body, or an envelope
      // handed in on the link. A branch with neither gets no Guide tab rather
      // than a tab onto an empty pane.
      get hasGuide() {
        return !!(this.brief?.prs?.length || this.brief?.authored);
      },
      // The body's styling comes from the kit, not from here, so the drawer and
      // this page render one guide the same way.
      get guideBodyClass() { return window.GuideRender?.bodyClass('page') || 'text-sm'; },
      get guidePr() { return this.brief?.prs?.[this.guideIdx] || this.brief?.pr || null; },
      get prUrl() { return 'https://github.com/' + this.repo + '/pull/' + (this.guidePr?.number || ''); },
      get prStateLabel() {
        const p = this.guidePr;
        return !p ? '' : (p.state === 'open' && p.draft ? 'draft' : p.state);
      },
      get prStateClass() {
        return { merged: 'badge-secondary', open: 'badge-success', closed: 'badge-ghost' }[this.guidePr?.state]
               || 'badge-ghost';
      },
      // Newer is index 0, so the right arrow steps DOWN the list. `dir` is the
      // reader's direction rather than the array's, which is why it is negated.
      stepGuide(dir) {
        const n = this.brief?.prs?.length || 0;
        const next = this.guideIdx + dir;
        if (next < 0 || next >= n) return;
        this.guideIdx = next;
        this.renderGuide();
      },
      // Render the body on display, once per PR. The known refs are this
      // branch and its base, which is all a guide for this branch can name
      // with a slashed ref, and the preferred ref is the branch, so the chip
      // strip shows each file at the version the branch is about rather than
      // at main.
      async renderGuide() {
        const pr = this.guidePr;
        const key = pr ? String(pr.number) : '';
        if (this.guideFor === key) return;
        this.guideFor = key;
        this.guideHtml = ''; this.guideTargets = [];
        if (!pr || !pr.body) return;
        try {
          if (!window.GuideRender) await window.gh?.load('kits/guide-render.js');
          await window.GuideRender.needMarked();
        } catch { return; }
        if (this.guideFor !== key) return;      // a step landed while loading
        const out = window.GuideRender.render(pr.body, {
          knownRefs: [this.branch, this.base, 'main'].filter(Boolean),
          preferRef: this.branch,
        });
        this.guideTargets = out.targets;
        this.guideHtml = out.html;
      },

      get treeUrl() { return 'https://github.com/' + this.repo + '/tree/' + this.branch; },
      // The GitHub exits, as labeled menu rows (the bare-glyph row read as
      // cryptic in the field). "New file here" keeps GitHub's own editor
      // reachable for the case the stage cannot take, a binary upload.
      get ghRows() {
        const rows = [];
        if (this.brief?.pr && !this.framed) {
          rows.push({ icon: 'ph-git-pull-request', label: 'Pull request',
                      hint: '#' + this.brief.pr.number + (this.brief.pr.draft ? ' draft' : ''), url: this.prUrl });
        }
        rows.push({ icon: 'ph-git-branch', label: 'Browse tree', hint: '', url: this.treeUrl });
        rows.push({ icon: 'ph-git-diff', label: 'Compare vs ' + this.base, hint: '', url: this.compareUrl });
        rows.push({ icon: 'ph-file-plus', label: 'New file here',
                    hint: '', url: window.BranchSurvey ? window.BranchSurvey.dropFileUrl(this.repo, this.branch, this.inbox) : '#' });
        return rows;
      },

      // The add-file plus: the stage, opened already aimed at this branch
      // (dest prefills repo@branch:inbox-or-dump; StageLink reads the key).
      // The stage owns deposit intake: paste or drop content there, tap send,
      // and gh-store lands the local items on the branch. A ?use= on the
      // current address rides along so a preview keeps previewing.
      get stageDepositUrl() {
        const dir = window.BranchSurvey ? window.BranchSurvey.dropDir(this.inbox) : 'dump';
        const dest = this.repo + '@' + this.branch + ':' + dir;
        let u = 'https://mehrlander.github.io/web-tools/pages/show-repo/show-repo.html?view=stage&dest='
          + encodeURIComponent(dest);
        try {
          const use = new URLSearchParams(location.search).get('use');
          if (use) u += '&use=' + encodeURIComponent(use);
        } catch { }
        return u;
      },
      get compareUrl() {
        return 'https://github.com/' + this.repo + '/compare/' + this.base + '...' + this.branch;
      },

      // One binding for count-plus-noun. A trailing <span>s</span> renders a
      // space before the plural ("3 changed file s").
      plural(n, noun) { return n + ' ' + noun + (n === 1 ? '' : 's'); },
      get fileTotals() {
        return (this.brief?.files || []).reduce((a, f) => ({
          additions: a.additions + (f.additions || 0),
          deletions: a.deletions + (f.deletions || 0),
        }), { additions: 0, deletions: 0 });
      },
      fileNote(path) { return this.brief?.authored?.files?.[path] || ''; },
      // The Files pane's shape: registry groups where one is declared, else
      // one unlabeled group holding the flat list (`labeled` gates the header
      // row, so the no-registry render is byte-for-byte the old one).
      get fileGroups() {
        const files = this.brief?.files || [];
        if (!this.registry || !window.ContentRegistry) {
          return [{ mode: 'all', files, collapsed: false, note: '', labeled: false }];
        }
        return window.ContentRegistry.group(files, this.registry)
          .map(g => ({ ...g, labeled: true }));
      },
      groupOpen(g) { return this.groupState[g.mode] ?? !g.collapsed; },
      toggleGroup(mode) {
        const g = this.fileGroups.find(x => x.mode === mode);
        this.groupState[mode] = !(this.groupState[mode] ?? !(g?.collapsed));
      },
      // The per-card options, read from the CLOSURE rather than off `this`, and
      // that is not a style choice. This method is called from inside an
      // x-data expression (x-data="fileReview(cardOpts(f))"), the one place
      // Alpine injects every registered component name into the evaluation
      // scope as a callable. So `this.repo` there resolves to the `repo`
      // DATA PROVIDER (alpineComponents/repo.js), not to this component's own
      // repo string, and each card was handed Alpine's provider wrapper as its
      // repo. Every content fetch then addressed
      // /repos/(...i)=>n.bind(e)(...i)/contents/… and 404'd, so each card lost
      // its Diff, New, and Base tabs and fell back to Patch alone: the page's
      // whole diff layer, gone with nothing said. It bites only where the full
      // library is registered, which is exactly how pages/branch.html boots
      // (dist/web-tools.js), and never in the unit tests, which register two
      // components. review.html escaped it by building its card opts in a
      // getter, where no providers are in scope.
      cardOpts(f) {
        return { repo: o.repo || '', ref: o.branch || '', baseName: o.base || '', path: f.path,
                 prevPath: f.previousPath, status: f.status,
                 additions: f.additions, deletions: f.deletions, patch: f.patch,
                 // Cards start open on a WIDE screen with a modest changeset,
                 // where a wall of closed caret rows is two taps of collapsing
                 // before any content. On a phone the same rule was the reason
                 // the Files pane ran for screens: four open cards is most of a
                 // viewport, and the dense row list is the thing worth seeing
                 // first there. Narrow opens closed and costs a tap per file.
                 open: (this.brief?.files?.length || 0) <= 12
                       && (typeof window === 'undefined' || window.innerWidth >= 768) };
      },
    };
  });
  };
  if (window.Alpine?.directive) register();
  else document.addEventListener('alpine:init', register);
})();
