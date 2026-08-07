// alpineComponents/branch-brief.js — the branch page's view.
//
// Renders what kits/branch-brief.js assembles: a derived layer that reloads
// from the API every visit, and an optional authored layer laid over it. The
// model does the thinking; this file is markup and three pieces of formatting.
//
// Mounted by pages/branch.html. The per-file diff cards are fileReview
// (alpineComponents/file-review.js), the same dossier pages/review.html uses,
// so a file reads identically in both places.
// Registration is defensive rather than a bare `alpine:init` listener: this
// component arrives at the end of a gh.load chain, which can finish after
// Alpine has already started, and a missed event leaves the page rendering
// "branchBrief is not defined". Same idiom lib/alpine-bundle.js uses for the
// same race.
(function () {
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
      brief: null, loading: true, error: '',
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
          <div x-show="error" class="alert alert-warning" x-text="error"></div>

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
                <a x-show="brief.pr && !framed" :href="prUrl" target="_blank"
                   class="btn btn-sm btn-square" :class="brief.pr && brief.pr.draft ? 'btn-outline' : 'btn-primary'"
                   :title="brief.pr ? ('PR #' + brief.pr.number + (brief.pr.draft ? ' (draft)' : '')) : ''">
                  <i class="ph ph-git-pull-request"></i></a>
                <template x-for="(s, i) in brief.sessions" :key="s">
                  <a :href="s" target="_blank" class="btn btn-sm btn-square btn-ghost"
                     :title="(brief.sessions.length > 1 ? 'Session ' + (i + 1) + ': ' : '')
                             + (brief.sessionsExact ? 'the session that authored this branch'
                                                    : 'approximate, read from the branch tip')">
                    <svg viewBox="0 0 24 24" class="w-4 h-4 shrink-0" style="stroke:#d97757" stroke-width="2.2"
                         stroke-linecap="round" fill="none" aria-hidden="true"><path d="M12,12 L12.0,1.6 M12,12 L17.62,3.25 M12,12 L21.46,7.68 M12,12 L22.29,13.48 M12,12 L19.86,18.81 M12,12 L14.93,21.98 M12,12 L9.07,21.98 M12,12 L4.14,18.81 M12,12 L1.71,13.48 M12,12 L2.54,7.68 M12,12 L6.38,3.25"/></svg>
                  </a>
                </template>
                <a :href="treeUrl" target="_blank" class="btn btn-sm btn-square btn-ghost" title="Browse the tree on GitHub">
                  <i class="ph ph-git-branch"></i></a>
                <a :href="compareUrl" target="_blank" class="btn btn-sm btn-square btn-ghost" title="Compare on GitHub">
                  <i class="ph ph-git-diff"></i></a>
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
              <div x-show="brief.files.length && pane === 'files'" class="flex flex-col gap-1.5">
                <!-- One bordered list with hairline rows, not a stack of cards
                     with gaps between them. Thirty files at a card each was a
                     column of boxes whose borders and spacing carried no
                     information; the rows are the information. -->
                <div class="border border-base-300 rounded-lg overflow-hidden">
                  <template x-for="f in brief.files" :key="f.path">
                    <div>
                      <div x-show="fileNote(f.path)" class="text-xs opacity-70 px-2 pt-1" x-text="fileNote(f.path)"></div>
                      <div x-data="fileReview(cardOpts(f))"></div>
                    </div>
                  </template>
                </div>
              </div>

            </div>
          </template>
        </div>
      `,

      init() {
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.load();
      },

      async load() {
        this.loading = true; this.error = '';
        try {
          const gh = new window.GH({ token: window.TOKEN, repo: this.repo, ref: this.branch });
          const { compare, pull, pulls } = await window.BranchBrief.fetchBrief(gh, {
            repo: this.repo, branch: this.branch, base: this.base,
          });
          this.brief = window.BranchBrief.assemble({
            repo: this.repo, branch: this.branch, base: this.base,
            compare, pull, pulls, authored: o.authored || null,
          });
          // A link that named a PR opens on that PR rather than the newest, so
          // #gh=owner/repo&pr=<n> lands where it says even after a second PR
          // has opened on the same branch.
          if (o.pr) {
            const i = this.brief.prs.findIndex(p => p.number === Number(o.pr));
            if (i >= 0) this.guideIdx = i;
          }
          if (this.hasGuide) this.pane = 'guide';
          this.renderGuide();
        } catch (e) {
          this.error = 'Could not read ' + this.repo + '@' + this.branch + ': ' + (e?.message || e);
        } finally {
          this.loading = false;
          // The ready signal an embedder can watch (show-repo's branch-detail
          // takeover holds its instant facts card up until this appears, then
          // fades the page in). On the root element so a same-origin parent
          // can read it without knowing this component's internals.
          try { document.documentElement.setAttribute('data-brief-ready', ''); } catch {}
        }
      },

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
