document.addEventListener('alpine:init', function () {
  Alpine.data('stateView', function () {
    // The State view: everything the estate keeps derived, in one list, with
    // its age and the thing that builds it.
    //
    // It exists because "refresh" was one icon over two unrelated verbs. Three
    // caches in the private registry are crawled, committed, and can be hours
    // stale; the search caches and the page itself are recomputed locally and
    // have no age worth reporting. Both wore the same button, in six places,
    // and the reading that tells you whether to press (the as-of) was the part
    // hidden below `sm`. So the chrome kept the control and dropped the fact.
    //
    // Named for what it shows rather than the gesture. The registry's own
    // DESIGN.md splits its contents three ways (authored, derived, captured);
    // this is the derived layer rendered honestly, plus the two local caches
    // that answer the same question and live nowhere. Calling it Freshness
    // would name it after a button the view is meant to retire.
    //
    // FOUR FILES, THREE BUTTONS. state/entities.json is derived like the other
    // three and cannot be refreshed from here: it needs spaCy over ~4,000 files
    // across seven checkouts, about half an hour, which is not a page load. It
    // gets a row anyway, saying so. A freshness surface that lists only what it
    // can fix is the same omission the chrome was already making.
    //
    // BUILT VS CHECKED, and the split is the point. `built` is the last commit
    // touching the file; `checked` is this browser's throttle stamp. A crawl
    // that ran and found nothing does not commit, so "built 3d ago, checked
    // 12m ago" reads as current rather than stale, which is exactly what a
    // lone as-of could never say. The commit date is used rather than the
    // file's own `generatedAt` because reading four generatedAt fields costs
    // 1.5 MB of JSON for four timestamps; for a file only the crawl writes,
    // the commit IS the write.
    //
    // Cost: one `ls state` plus one commit read per file, so five calls, no
    // matter how many repos the estate holds. The local rows need no network.

    // THE PROBE: has the SOURCE moved since this was built.
    //
    // An age answers "how old is this", which is not the question anyone opens
    // this view with. The question is "is there anything to fetch", and until
    // now the only proxy for it was the clock: a row went bold at twice its own
    // throttle, which is a guess dressed as a reading. Two calls answer it as a
    // fact, for the whole view, no matter how large the estate:
    //
    //   one account repo listing  → every repo's live pushed_at
    //   one commits call on the registry's sessions/ tree
    //
    // Each is compared against the row's OWN `built` date, which the view has
    // already read, so the probe needs no cache contents and reads no file. That
    // is the whole reason it is affordable: comparing against each cached
    // entry's own stamp would have meant pulling 66 KB, 371 KB and 279 KB of
    // JSON to count timestamps.
    //
    // IT REPORTS A FACT ABOUT THE SOURCE, NEVER A VERDICT ABOUT THE CACHE, and
    // the distinction is not pedantry. A push that never touched a manifest
    // still moves pushed_at, so "3 repos pushed since built" is true while "3
    // repos changed" would not be; a PR opened with no push changes what the
    // activity cache stores and moves no pushed_at at all, so the same figure is
    // an over-count in one direction and an under-count in the other. Stated as
    // what it is, the reader can weigh it. Stated as a change count, it would be
    // wrong twice.
    //
    // The entity index gets none. Its source is the content of ~4,000 files
    // across seven checkouts, so the honest probe is the rebuild itself.
    const PROBE = (r) => `
      <span x-show="probe[${r}.key]" class="flex items-center gap-1.5"
            :title="probeWhy(${r})">
        <i class="ph text-base-content/40"
           :class="probe[${r}.key]?.n ? 'ph-arrow-fat-line-up' : 'ph-equals'"></i>
        <span class="text-base-content/40">since</span>
        <span :class="probe[${r}.key]?.n ? 'text-warning font-medium' : 'text-base-content/70'"
              x-text="probe[${r}.key]?.line"></span>
      </span>`;

    // GREEN MEANS ONE VERB: bring this up to date from its source. It is on the
    // four Refresh controls and nowhere else, so Clear (which forgets) and
    // Reload (which re-fetches the page, not the estate) stay neutral and the
    // colour keeps meaning something. Ages, at the top, re-reads the timestamps
    // without running anything, so it is ghost.
    //
    // The WEIGHT tracks whether pressing matters. A row inside its throttle gets
    // the soft fill; a stale row gets the solid button, since this is the hub
    // whose whole job is saying which one to press. That makes the emphasis a
    // reading rather than decoration, which is also why nothing is tinted while
    // a crawl is running: mid-flight there is nothing to decide.
    //
    // NO OUTLINE. The card is already a bordered box, so an outlined button
    // inside it draws a second rectangle a few pixels in and the eye reads the
    // pair as one fussy frame rather than as a control. Soft carries the colour
    // without the second edge.
    // THE THREE FILE CONTROLS, on every registry row. Expand opens the JSON in
    // the app, History opens the file's change log; the github mark is the way
    // out. Tapping a path used to go straight to GitHub, which is the wrong
    // default for a page whose whole subject is data the app already has a
    // token for and a viewer for.
    //
    // They are captioned carets, not a `{}` glyph. The glyph said "JSON" to
    // someone who already knew, and said nothing to anyone else; expanding a
    // row to see its detail is the gesture people arrive with, so the control
    // should be the one they expect rather than a symbol for the payload.
    //
    // TWO CARETS, NOT A TAB BAR. History is not a second reading of the bytes,
    // it is a different subject: the file's history rather than its content. A
    // tab bar inside the panel would say they are two views of one thing, and
    // it would reintroduce exactly the chrome the panel below was stripped of.
    // Two peers in the control strip, one open at a time, sharing the slot.
    const FILE_CONTROLS = (r) => `
      <div class="flex items-center gap-0.5 justify-end">
        <button @click="togglePeek(${r})" :disabled="!authed()"
                class="btn btn-xs btn-ghost gap-1 px-1.5 disabled:opacity-40"
                :class="peek === ${r}.key ? 'text-primary' : 'text-base-content/60 hover:text-primary'"
                :title="'Read ' + ${r}.file + ' here (' + (${r}.size || 'unknown size') + ')'">
          <i class="ph text-sm transition-transform"
             :class="peekBusy === ${r}.key ? 'ph-circle-notch animate-spin'
                     : (peek === ${r}.key ? 'ph-caret-down' : 'ph-caret-right')"></i>
          <span x-text="peek === ${r}.key ? 'Collapse' : 'Expand'"></span>
        </button>
        <button @click="toggleHist(${r})" :disabled="!authed()"
                class="btn btn-xs btn-ghost gap-1 px-1.5 disabled:opacity-40"
                :class="hist === ${r}.key ? 'text-primary' : 'text-base-content/60 hover:text-primary'"
                :title="'When ' + ${r}.file + ' actually changed, and by how much'">
          <i class="ph text-sm transition-transform"
             :class="histBusy === ${r}.key ? 'ph-circle-notch animate-spin'
                     : (hist === ${r}.key ? 'ph-caret-down' : 'ph-clock-counter-clockwise')"></i>
          <span>History</span>
        </button>
        <a :href="fileGh(${r}.file)" target="_blank" rel="noopener"
           class="btn btn-xs btn-ghost px-1.5 text-base-content/40 hover:text-primary" title="Open on GitHub">
          <i class="ph ph-github-logo text-sm"></i>
        </a>
      </div>`;

    // The panel: THE BYTES, as committed. It ran through the shared multi-mode
    // viewer at first, which brought a mode switcher, a filter, a sort, a
    // search, an undo pair, a copy, a tree toggle, an open-out, and a
    // GitHub/Raw/CDN menu, all stacked above the data on a phone. That is an
    // editor's chrome, and nothing here is being edited: the crawl owns these
    // files, so every control except copy was answering a question the row does
    // not raise. The estate keeps the full multi-mode reading one tap away at
    // the github mark and at the data route (`toss-render.html#data=`), which is
    // where a reader who wants to pivot a table should go.
    //
    // Rendered verbatim rather than re-serialized: the crawls already write with
    // a 2-space indent, and the row's promise is that this is what is committed,
    // which a reformat would quietly break.
    //
    // ONE BOX, not three. It used to sit in its own bordered, tinted, padded
    // box, indented under the icon, inside the card, around a viewer that draws
    // its own frame. Now a hairline separates it and the negative margin lets it
    // use the card's full width.
    const PEEK_PANEL = (r) => `
      <template x-if="peek === ${r}.key">
        <div class="flex flex-col min-h-0 border-t border-base-300 pt-2 -mx-3 px-3">
          <div x-show="peekErr" class="text-sm text-error font-mono py-2" x-text="peekErr"></div>
          <template x-if="!peekErr">
            <div class="flex flex-col min-h-0">
              <div class="flex items-center gap-2 pb-1.5 text-sm text-base-content/40">
                <span class="font-mono" x-text="peekLines"></span>
                <div class="grow"></div>
                <button @click="copyPeek()" class="btn btn-xs btn-ghost gap-1 px-1.5"
                        :class="peekCopied && 'text-success'" title="Copy the whole file">
                  <i class="ph text-sm" :class="peekCopied ? 'ph-check' : 'ph-copy'"></i>
                  <span x-text="peekCopied ? 'Copied' : 'Copy'"></span>
                </button>
              </div>
              <pre class="h-[60vh] min-h-[16rem] overflow-auto rounded-box bg-base-200/40 p-2.5
                          font-mono text-sm leading-snug whitespace-pre"
                   x-text="peekText"></pre>
            </div>
          </template>
        </div>
      </template>`;

    // THE HISTORY PANEL: when this file actually changed, and by how much.
    //
    // It is built entirely from what the registry already commits, which is why
    // it exists at this size. The commit list is ONE call per file (the same
    // `history` the row already makes for `built`, asked for twenty rows rather
    // than one), and the magnitude of any one change is two blob reads done
    // only when that row is tapped. Nothing new is written, no schema moves,
    // and the estate gains no artifact to keep in step. The conventions' rule
    // is not to commit what a live read already answers, and the date and the
    // record set are exactly what a live read answers.
    //
    // WHAT IT CANNOT SAY, said in the panel rather than left to be inferred.
    // Three limits, and they compound:
    //
    //   A run that found nothing leaves no trace, so this is a log of CHANGES,
    //   not of runs. A quiet week and a week nobody opened the page look the
    //   same from here.
    //
    //   A row is dated when a crawl NOTICED the change, not when the change
    //   happened, so a gap bounds the interval rather than measuring it. The
    //   crawl cannot notice faster than it runs, and it runs on a per-browser
    //   throttle, so the cadence this panel reports is partly a fact about the
    //   estate and partly a fact about how often the page was open.
    //
    // Both are limits of READING rather than writing: the fix for either is to
    // have the crawl record something, which is a different decision from this
    // panel and should not be smuggled in by leaving them unsaid.
    //
    // A third limit WAS lifted that way, and it is the exception that shows the
    // rule. Duration was nowhere, because the only party that knows it is the
    // browser that ran the crawl and it reported it to a four-second toast; so
    // the crawls now append a `runs` record to the commit they were making
    // anyway (lib/kits/crawl-runs.js). The duration column reads that ring, and
    // a row from before it shipped simply has no figure rather than a zero.
    //
    // THE HEADER IS THE ANSWER MOST OF THE TIME. How often a store really
    // changes, against the throttle that governs when it is checked, is the
    // reading that says whether the throttle is set anywhere near right, and it
    // costs nothing beyond the list already fetched.
    const HIST_PANEL = (r) => `
      <template x-if="hist === ${r}.key">
        <div class="flex flex-col min-h-0 border-t border-base-300 pt-2 -mx-3 px-3">
          <div x-show="histErr" class="text-sm text-error font-mono py-2" x-text="histErr"></div>
          <template x-if="!histErr">
            <div class="flex flex-col min-h-0 gap-2">
              <div class="flex items-baseline gap-x-3 gap-y-1 flex-wrap text-sm">
                <span class="text-base-content/70" x-text="histSummary()"></span>
                <span x-show="${r}.throttle" class="text-base-content/40" x-text="'checked every ' + ${r}.throttle"></span>
                <span x-show="!${r}.throttle" class="text-base-content/40">no schedule; rebuilt by hand</span>
              </div>
              <p class="text-sm text-base-content/40 leading-snug">
                Only a crawl that found a material change commits, so these are changes, not runs,
                and each is dated when a crawl noticed it rather than when it happened.
                A duration appears where the crawl recorded one.
              </p>
              <div class="max-h-[60vh] overflow-auto -mx-1 px-1">
                <template x-for="(h, i) in histRows" :key="h.sha">
                  <div class="border-b border-base-200 last:border-0 py-1.5">
                    <!-- Wraps rather than clips: the row carries five readings
                         and a 430px phone cannot always hold them, so the
                         magnitude button drops to its own line instead of
                         sliding off the edge. -->
                    <div class="flex items-baseline gap-2 text-sm flex-wrap">
                      <span class="font-mono text-base-content/70 shrink-0"
                            :title="h.date" x-text="h.stamp"></span>
                      <span class="text-base-content/40 shrink-0" x-text="h.ago"></span>
                      <span class="text-base-content/30 font-mono shrink-0" x-text="h.gap"></span>
                      <!-- What the run cost, where the crawl recorded one. The
                           rest of the record is in the title: a duration is the
                           part worth a column, and "checked 19, read 4" is the
                           part worth a tap. -->
                      <span x-show="h.run" class="font-mono text-base-content/50 shrink-0"
                            :title="h.runWhy" x-text="h.took"></span>
                      <div class="grow"></div>
                      <!-- The magnitude is LAZY, and the button says so before
                           it is pressed: these files run 68 KB to 818 KB, so
                           diffing twenty intervals up front would read a
                           megabyte and a half to fill a column nobody asked
                           for. Adjacent intervals share a version, so the
                           second tap costs one read rather than two. -->
                      <button x-show="i < histRows.length - 1" @click="diffAt(${r}, i)"
                              class="btn btn-xs btn-ghost gap-1 px-1.5 shrink-0"
                              :class="histDiff[i]?.line ? 'text-base-content/70' : 'text-base-content/40 hover:text-primary'">
                        <i class="ph text-sm"
                           :class="histDiff[i]?.busy ? 'ph-circle-notch animate-spin'
                                   : (histDiff[i]?.line ? 'ph-rows' : 'ph-magnifying-glass')"></i>
                        <span x-text="histDiff[i]?.line || 'what changed'"></span>
                      </button>
                      <!-- The oldest row in the window has no predecessor here,
                           which is a limit of the window and not a claim that
                           nothing preceded it. -->
                      <span x-show="i === histRows.length - 1"
                            class="text-sm text-base-content/30 shrink-0">oldest in window</span>
                    </div>
                    <div x-show="histDiff[i]?.err" class="text-sm text-error font-mono pt-1" x-text="histDiff[i]?.err"></div>
                    <div x-show="histDiff[i]?.records?.length" class="flex flex-wrap gap-1 pt-1.5">
                      <template x-for="c in (histDiff[i]?.records || [])" :key="c.key">
                        <span class="badge badge-ghost badge-sm font-normal gap-1"
                              :class="c.kind === 'added' ? 'text-success' : c.kind === 'removed' ? 'text-error' : 'text-base-content/60'"
                              :title="c.kind">
                          <i class="ph text-sm"
                             :class="c.kind === 'added' ? 'ph-plus' : c.kind === 'removed' ? 'ph-minus' : 'ph-dot-outline'"></i>
                          <span x-text="c.key"></span>
                        </span>
                      </template>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </div>
      </template>`;

    const REFRESH_BTN = (stale, busy) =>
      `:class="${busy} ? 'btn-ghost text-success' : (${stale} ? 'btn-success' : 'btn-success btn-soft')"`;

    const REGISTRY = () => window.__shell?.REGISTRY_REPO || 'mehrlander/web-tools-private';
    const HUB = 'mehrlander/web-tools';
    // Commits listed per history open. One page of the commits API, so twenty
    // costs exactly what one costs; the ceiling is how much a reader will scan,
    // not what the call is worth. The summary says when the list IS the window,
    // so a store that changes hourly cannot pass its twenty most recent changes
    // off as its whole history.
    const HIST_DEPTH = 20;

    // THE GRAIN: what one record in this store is. It is the only structured
    // thing worth keeping from the sentence that used to sit under each label,
    // and it is the axis that actually differs between these files: configs and
    // activity key by repo, sessions keys by session, the entity index keys by
    // repo again but over seven checkouts rather than the estate. Everything
    // else that sentence carried was a paragraph nobody finished reading, three
    // wrapped lines tall on a phone, restating what the label and the consumer
    // chips already say.
    const GRAIN = (r) => `
      <span class="badge badge-ghost badge-sm font-normal gap-1 text-base-content/50"
            :title="'One record per ' + ${r}.grain + ', over ' + ${r}.scope">
        <i class="ph ph-rows text-sm"></i><span x-text="'per ' + ${r}.grain"></span>
      </span>`;

    // WHO CONSUMES THIS, as view keys rather than prose. Each entry names a
    // view the shell routes, so the chip navigates there and you can go look at
    // the data being used instead of reading a sentence about it. A key that
    // stops routing breaks visibly, which a sentence never did.
    //
    // The list is deliberately only the CLEAN answers. The prose it replaces
    // also named the sidebar, quick links, and things below view granularity
    // ("the Repos cards' rollups", "the Search view's session lane"). Those are
    // real, and none of them is a view, so inventing keys for them would be the
    // over-normalization that makes a registry stop meaning anything. They are
    // in docs/show-repo.md, where detail belongs.
    const VIEWS = {
      estate:   { label: 'Repos',    icon: 'ph-squares-four',     go: 'goEstate' },
      activity: { label: 'Branches', icon: 'ph-git-branch',       go: 'goActivity' },
      sessions: { label: 'Sessions', icon: 'ph-terminal-window',  go: 'goSessions' },
      guides:   { label: 'Guides',   icon: 'ph-book-open-text',   go: 'goGuides' },
      search:   { label: 'Search',   icon: 'ph-magnifying-glass', go: 'goSearch' },
    };

    // The three registry caches the app itself crawls. `refresh` names a shell
    // method rather than closing over it, since the shell is not up when this
    // module registers.
    // `records` names the top-level map whose keys ARE this store's records, so
    // the history panel can count and diff every file through one reading
    // rather than four bespoke ones. It is the machine-readable half of `grain`,
    // which says the same thing to a person: configs and activity key by repo
    // under `repos`, sessions keys by store path under `byPath`, the entity
    // index keys by short repo name under `repos`. A file whose records live
    // somewhere else would need its own accessor, and there is no such file.
    const CACHES = [
      { key: 'configs', file: 'configs.json', label: 'Repo configs', icon: 'ph-sliders-horizontal',
        grain: 'repo', scope: 'every account repo', records: 'repos',
        feeds: ['estate'],
        cost: 'one config read per account repo',
        throttleMs: 6 * 3600 * 1000, checkedKey: 'wt:configCacheCheckedAt',
        refresh: 'refreshConfigs', busy: 'configRefreshing' },
      { key: 'activity', file: 'activity.json', label: 'Branch activity', icon: 'ph-git-branch',
        grain: 'repo', scope: 'estate members', records: 'repos',
        feeds: ['activity', 'guides', 'estate'],
        cost: 'a quick pass in seconds, then a branch survey per repo that took a push',
        throttleMs: 12 * 3600 * 1000, checkedKey: 'wt:activityCacheCheckedAt',
        refresh: 'refreshActivity', busy: 'activityRefreshing' },
      { key: 'sessions', file: 'sessions.json', label: 'Sessions', icon: 'ph-terminal-window',
        grain: 'session', scope: 'every captured record', records: 'byPath',
        feeds: ['sessions', 'search'],
        cost: 'one tree read plus a blob per new record',
        throttleMs: 3 * 3600 * 1000, checkedKey: 'wt:sessionsCacheCheckedAt',
        refresh: 'refreshSessions', busy: 'sessionsRefreshing' },
    ];

    // The fourth file, and the one with no button. Its own account of who owns
    // its freshness is in the registry's DESIGN.md; this row is the short form.
    // Its consumers are PAGES rather than views, which is why they are a
    // separate field: a page opens at its own URL, a view is a stop inside this
    // shell, and collapsing the two would make the chip lie about where a tap
    // goes.
    const OFFLINE = {
      key: 'entities', file: 'entities.json', label: 'Entity index', icon: 'ph-tag',
      grain: 'repo', scope: 'seven checkouts', records: 'repos',
      feeds: [],
      pages: [{ path: 'pages/entities.html', label: 'Entities' },
              { path: 'pages/citations.html', label: 'Citations' }],
      cost: '~30 min of model time over ~4,000 files in seven checkouts',
      builder: 'tools/concept-lab/build-entity-index.py',
    };

    return {
      description: 'State view: the estate’s derived state in one list — the four caches in the private registry (configs, activity, sessions, entities) with when each was last built and last checked, plus the two local caches (search, the page itself). Each row carries its store, its builder, its throttle, what it costs, and a Refresh where one is possible; the entity index says plainly that it has none.',

      rows: [],          // the three registry caches, resolved
      offline: null,     // the entity index row, resolved
      loading: false,
      err: '',            // a read that failed
      note: '',           // a state that is not a failure (signed out)
      now: Date.now(),   // ticked so the ages move without a reload
      item: '',          // the row a link named (?item=), highlighted on arrival
      peek: '',          // which row's JSON is open; one at a time
      peekBusy: '',      // which row is fetching
      peekErr: '',
      peekText: '',      // the bytes, verbatim
      peekLines: '',
      peekCopied: false,
      probe: {},         // row key -> {n, line} : has the source moved since built
      hist: '',          // which row's history is open; one at a time, shared with peek
      histBusy: '',
      histErr: '',
      histRows: [],      // [{sha, stamp, ago, gap, gapMs}], newest first
      histDiff: {},      // interval index -> {busy, err, line, records[]}

      template: `
        <div class="w-full">
          <div class="flex items-center gap-2 mb-5">
            <i class="ph ph-stack-simple text-xl text-base-content/50"></i>
            <h2 class="text-lg font-semibold">State</h2>
            <div class="grow"></div>
            <a :href="stateGh()" target="_blank" rel="noopener"
               class="flex items-center gap-1.5 text-base text-base-content/50 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors"
               title="The registry's state/ folder on GitHub">
              <i class="ph ph-github-logo"></i><span class="hidden sm:inline">Registry</span>
            </a>
            <button @click="load()" :disabled="loading"
                    class="btn btn-ghost btn-sm gap-1.5" title="Re-read the ages (does not run any crawl)">
              <i class="ph ph-arrows-clockwise" :class="loading && 'animate-spin'"></i>
              <span class="hidden sm:inline">Ages</span>
            </button>
          </div>
          <div x-show="note" class="text-base text-base-content/50 mb-4 flex items-center gap-1.5">
            <i class="ph ph-info shrink-0"></i><span x-text="note"></span>
          </div>
          <div x-show="err" class="alert alert-error py-2 px-3 text-base mb-4" x-text="err"></div>

          <!-- ── The registry's derived caches ────────────────────────────── -->
          <h3 class="text-base font-mono uppercase tracking-widest text-base-content/40 mb-2 flex items-center gap-2">
            <span>Derived</span>
            <span class="font-sans normal-case tracking-normal text-base-content/30" x-text="registryShort() + '/state/'"></span>
          </h3>
          <div class="flex flex-col gap-2 mb-8">
            <template x-for="r in rows" :key="r.key">
              <div :id="'state-' + r.key"
                   class="rounded-box border bg-base-100 p-3 flex flex-col gap-2 transition-colors duration-500"
                   :class="item === r.key ? 'border-primary bg-primary/5' : 'border-base-300'">
                <!-- The icon rides the TITLE LINE rather than a gutter of its
                     own. Hanging it to the left indented every line under it,
                     which cost about 28px of width on every row, narrowed the
                     description into three wrapped lines on a phone, and left the
                     meta lines choosing between a matching indent and a ragged
                     edge. Flush left, the card reads as one column. -->
                <div class="flex items-start gap-2 min-w-0">
                  <div class="min-w-0 flex-1">
                    <!-- The path is a LABEL, not a link. It used to be an
                         anchor to GitHub, which is the one place a tap here
                         should not go: this is the app, the file is data, and
                         the app can render it. Expand reads it in place; the
                         github mark is the deliberate way out. -->
                    <div class="flex items-baseline gap-2 flex-wrap">
                      <i class="ph text-lg text-base-content/50 self-center" :class="r.icon"></i>
                      <span class="font-semibold" x-text="r.label"></span>
                      <span class="font-mono text-sm text-base-content/40" x-text="'state/' + r.file"></span>
                      <span x-show="r.size" class="font-mono text-sm text-base-content/30" x-text="r.size"></span>
                      ${GRAIN('r')}
                    </div>
                  </div>
                  <!-- The control sits with the row it acts on, which is the
                       whole move: one button, next to the age that says
                       whether to press it. -->
                  <!-- THE CONTROL COLUMN. Refresh acts on the crawl, Expand
                       acts on the file, and both act on this row, so they
                       stack in one place rather than putting Refresh here and
                       leaving Expand orphaned at the end of the chip line. -->
                  <button @click="run(r)" :disabled="!authed() || busy(r)"
                          class="btn btn-sm gap-1.5 shrink-0 min-w-[7rem] disabled:opacity-40 disabled:border-base-300"
                          ${REFRESH_BTN('matters(r)', 'busy(r)')}
                          :title="probeWhy(r) + ' Force the crawl now (normally every ' + r.throttle + '). Costs ' + r.cost + '.'">
                    <i class="ph ph-arrows-clockwise text-base" :class="busy(r) && 'animate-spin'"></i>
                    <span x-text="busy(r) ? 'Running…' : 'Refresh'"></span>
                  </button>
                </div>

                <!-- The two ages, side by side, because either one alone
                     misreads. Both plain text: this is the fact the chrome
                     kept hiding, so it does not go behind a tooltip here. -->
                <div class="flex items-center gap-x-4 gap-y-1 flex-wrap text-base">
                  <span class="flex items-center gap-1.5" :title="r.builtAt || 'no commit found'">
                    <i class="ph ph-git-commit text-base-content/40"></i>
                    <span class="text-base-content/40">built</span>
                    <span :class="r.stale ? 'text-warning font-medium' : 'text-base-content/70'"
                          x-text="r.builtAgo || 'unknown'"></span>
                  </span>
                  <span class="flex items-center gap-1.5" :title="'This browser\\'s throttle stamp (' + r.checkedKey + ')'">
                    <i class="ph ph-eye text-base-content/40"></i>
                    <span class="text-base-content/40">checked</span>
                    <span class="text-base-content/70" x-text="r.checkedAgo || 'not this browser'"></span>
                  </span>
                  ${PROBE('r')}
                  <span class="flex items-center gap-1.5 text-base-content/40">
                    <i class="ph ph-clock-countdown"></i>
                    <span x-text="'auto every ' + r.throttle"></span>
                  </span>
                </div>

                <!-- WHO USES IT, as chips that go there. The prose this
                     replaced could not be tapped, could not be checked, and
                     said more than anyone reads on a phone. What it said beyond
                     the view names is in docs/show-repo.md. The two file
                     controls ride the same line, right-aligned: read it here,
                     or leave for GitHub. -->
                <!-- The row's LAST LINE: who uses it on the left, the two file
                     controls pinned right. The chips wrap inside their own box
                     so the controls keep the corner rather than being pushed to
                     a line of their own by a third chip. -->
                <div class="flex items-start gap-2">
                  <div class="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                    <span class="text-sm text-base-content/30">used by</span>
                    <template x-for="v in r.feeds" :key="v">
                      <button @click="goView(v)" class="btn btn-xs btn-ghost gap-1 px-1.5 text-base-content/60 hover:text-primary"
                              :title="'Open ' + viewLabel(v)">
                        <i class="ph text-sm" :class="viewIcon(v)"></i><span x-text="viewLabel(v)"></span>
                      </button>
                    </template>
                  </div>
                  ${FILE_CONTROLS('r')}
                </div>

                ${PEEK_PANEL('r')}
                ${HIST_PANEL('r')}
              </div>
            </template>

            <!-- The row with no button. Same card, so it reads as a peer of the
                 other three rather than a footnote, and says in the open why
                 the control is missing. -->
            <template x-if="offline">
              <div :id="'state-' + offline.key"
                   class="rounded-box border border-dashed bg-base-100 p-3 flex flex-col gap-2 transition-colors duration-500"
                   :class="item === offline.key ? 'border-primary bg-primary/5' : 'border-base-300'">
                <div class="flex items-start gap-2 min-w-0">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-2 flex-wrap">
                      <i class="ph text-lg text-base-content/50 self-center" :class="offline.icon"></i>
                      <span class="font-semibold" x-text="offline.label"></span>
                      <span class="font-mono text-sm text-base-content/40" x-text="'state/' + offline.file"></span>
                      <span x-show="offline.size" class="font-mono text-sm text-base-content/30" x-text="offline.size"></span>
                      ${GRAIN('offline')}
                    </div>
                  </div>
                  <span class="text-sm text-base-content/40 italic shrink-0 pt-1.5"
                        :title="'Rebuilding costs ' + offline.cost">no refresh here</span>
                </div>
                <div class="flex items-center gap-x-4 gap-y-1 flex-wrap text-base">
                  <span class="flex items-center gap-1.5" :title="offline.builtAt || 'no commit found'">
                    <i class="ph ph-git-commit text-base-content/40"></i>
                    <span class="text-base-content/40">built</span>
                    <span :class="offline.stale ? 'text-warning font-medium' : 'text-base-content/70'"
                          x-text="offline.builtAgo || 'unknown'"></span>
                  </span>
                  <span class="flex items-center gap-1.5 text-base-content/40">
                    <i class="ph ph-terminal"></i>
                    <a :href="hubGh(offline.builder)" target="_blank" rel="noopener"
                       class="font-mono text-sm hover:text-primary transition-colors" x-text="offline.builder"></a>
                  </span>
                </div>
                <div class="flex items-start gap-2">
                  <div class="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                    <span class="text-sm text-base-content/30">used by</span>
                    <template x-for="pg in offline.pages" :key="pg.path">
                      <a :href="pageUrl(pg.path)" target="_blank" rel="noopener"
                         class="btn btn-xs btn-ghost gap-1 px-1.5 text-base-content/60 hover:text-primary"
                         :title="pg.path">
                        <i class="ph ph-arrow-square-out text-sm"></i><span x-text="pg.label"></span>
                      </a>
                    </template>
                  </div>
                  ${FILE_CONTROLS('offline')}
                </div>

                ${PEEK_PANEL('offline')}
                ${HIST_PANEL('offline')}
              </div>
            </template>
          </div>

          <!-- ── Read live, stored nowhere ────────────────────────────────── -->
          <h3 class="text-base font-mono uppercase tracking-widest text-base-content/40 mb-2"
              title="Cheap enough to redo on demand, so nothing is committed and nothing throttles">Read live</h3>
          <div id="state-guides"
               class="rounded-box border bg-base-100 p-3 flex flex-col gap-2 mb-8 transition-colors duration-500"
               :class="item === 'guides' ? 'border-primary bg-primary/5' : 'border-base-300'">
            <div class="flex items-start gap-2 min-w-0">
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2 flex-wrap">
                  <span class="font-semibold"><i class="ph ph-book-open-text text-lg text-base-content/50 align-middle mr-1.5"></i>Guides shelf</span>
                  <span class="badge badge-ghost badge-sm font-normal gap-1 text-base-content/50"
                        title="One record per guide, over the estate's open branches">
                    <i class="ph ph-rows text-sm"></i><span>per guide</span>
                  </span>
                </div>
              </div>
              <button @click="refreshGuides()" :disabled="!authed() || guidesBusy()"
                      class="btn btn-sm gap-1.5 shrink-0 min-w-[7rem] disabled:opacity-40 disabled:border-base-300"
                      ${REFRESH_BTN('false', 'guidesBusy()')}
                      title="Re-read the shelf">
                <i class="ph ph-arrows-clockwise text-base" :class="guidesBusy() && 'animate-spin'"></i>
                <span x-text="guidesBusy() ? 'Reading…' : 'Refresh'"></span>
              </button>
            </div>
            <div class="flex items-center gap-x-4 gap-y-1 flex-wrap text-base">
              <span class="flex items-center gap-1.5">
                <i class="ph ph-eye text-base-content/40"></i>
                <span class="text-base-content/40">read</span>
                <span class="text-base-content/70" x-text="guidesAgo() || 'not this session'"></span>
              </span>
              <span class="text-base-content/40">no store</span>
            </div>
            <!-- No file controls: the shelf is assembled in memory from a
                 listing per repo, so there is nothing committed to expand and
                 nothing on GitHub to open. -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-sm text-base-content/30">used by</span>
              <button @click="goView('guides')" class="btn btn-xs btn-ghost gap-1 px-1.5 text-base-content/60 hover:text-primary"
                      title="Open Guides">
                <i class="ph ph-book-open-text text-sm"></i><span>Guides</span>
              </button>
            </div>
          </div>

          <!-- ── This browser ────────────────────────────────────────────── -->
          <h3 class="text-base font-mono uppercase tracking-widest text-base-content/40 mb-2"
              title="Held in memory or by the browser, gone on reload. Not estate state, and neither control writes anything">This browser</h3>
          <div class="flex flex-col gap-2">
            <div id="state-search"
                 class="rounded-box border bg-base-100 p-3 flex flex-col gap-2 transition-colors duration-500"
                 :class="item === 'search' ? 'border-primary bg-primary/5' : 'border-base-300'">
              <div class="flex items-start gap-2 min-w-0">
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline gap-2 flex-wrap">
                    <span class="font-semibold"><i class="ph ph-magnifying-glass text-lg text-base-content/50 align-middle mr-1.5"></i>Search caches</span>
                    <span class="badge badge-ghost badge-sm font-normal gap-1 text-base-content/50"
                          title="One record per repo tree, plus one per session record read">
                      <i class="ph ph-rows text-sm"></i><span>per tree</span>
                    </span>
                  </div>
                </div>
                <button @click="clearSearch()" class="btn btn-sm btn-outline gap-1.5 shrink-0" title="Forget them, so the next search reads fresh">
                  <i class="ph ph-eraser"></i><span>Clear</span>
                </button>
              </div>
              <div class="flex items-center gap-x-4 gap-y-1 flex-wrap text-base">
                <span class="text-base-content/70 font-mono" x-text="searchLine()"></span>
                <span class="flex items-center gap-1.5">
                  <i class="ph ph-eraser text-base-content/40"></i>
                  <span class="text-base-content/40">cleared</span>
                  <span class="text-base-content/70" x-text="searchClearedAgo()"></span>
                </span>
                <div class="grow"></div>
                <button @click="goView('search')" class="btn btn-xs btn-ghost gap-1 px-1.5 text-base-content/60 hover:text-primary"
                        title="Open Search">
                  <i class="ph ph-magnifying-glass text-sm"></i><span>Search</span>
                </button>
              </div>
            </div>

            <div id="state-page"
                 class="rounded-box border bg-base-100 p-3 flex flex-col gap-2 transition-colors duration-500"
                 :class="item === 'page' ? 'border-primary bg-primary/5' : 'border-base-300'">
              <div class="flex items-start gap-2 min-w-0">
                <div class="min-w-0 flex-1">
                  <span class="font-semibold"><i class="ph ph-browser text-lg text-base-content/50 align-middle mr-1.5"></i>This page</span>
                </div>
                <button @click="hardRefresh()" class="btn btn-sm btn-outline gap-1.5 shrink-0"
                        title="Clear Cache Storage and reload bypassing the HTTP cache">
                  <i class="ph ph-arrow-clockwise"></i><span>Reload</span>
                </button>
              </div>
              <div class="flex items-center gap-x-4 gap-y-1 flex-wrap text-base">
                <span class="flex items-center gap-1.5">
                  <i class="ph ph-clock text-base-content/40"></i>
                  <span class="text-base-content/40">loaded</span>
                  <span class="text-base-content/70" x-text="loadedAgo()"></span>
                </span>
                <span class="text-base-content/40 font-mono text-sm" x-text="libRef()"></span>
              </div>
            </div>
          </div>

        </div>
      `,

      init() {
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.load();
        // The addressed row. The shell parked it on arrival and announces every
        // later aim, so a second age pill moves the highlight in a view that is
        // already up. Rows carry `id="state-<key>"`, which makes the anchor a
        // real element rather than a scroll offset computed here.
        this.aim(window.__shell?.stateItem);
        this._aim = (e) => this.aim(e.detail);
        document.addEventListener('web-tools:state-item', this._aim);
        // The ages are the content, so they cannot sit still. A minute is the
        // resolution GH.ago reports below an hour, so anything faster redraws
        // without changing a character.
        this._tick = setInterval(() => { this.now = Date.now(); }, 60_000);
        // A crawl started from a row lands asynchronously; the shell announces
        // each one, and re-reading the ages is one cheap call per file.
        this._done = () => this.load();
        for (const ev of ['configs-refreshed', 'activity-refreshed', 'sessions-refreshed'])
          document.addEventListener('web-tools:' + ev, this._done);
        // A deep link mounts this view during boot, before auth resolves, so the
        // first read finds no token. Without this the view would hold its
        // signed-out state for the life of the page.
        this._auth = (e) => { if (e.detail === 'auth') this.load(); };
        document.addEventListener('web-tools:auth-state', this._auth);
      },
      destroy() {
        clearInterval(this._tick);
        for (const ev of ['configs-refreshed', 'activity-refreshed', 'sessions-refreshed'])
          document.removeEventListener('web-tools:' + ev, this._done);
        document.removeEventListener('web-tools:state-item', this._aim);
        document.removeEventListener('web-tools:auth-state', this._auth);
        clearTimeout(this._fade);
      },

      // Aim at one row: tint it, and bring it into view when it is not already
      // there. The tint fades after a few seconds rather than latching, since
      // it answers "which one did I come here for" and stops meaning anything
      // once that is read; the `?item=` in the address is what persists, so the
      // link stays shareable and a reload lands the same way.
      aim(key) {
        this.item = key || '';
        clearTimeout(this._fade);
        if (!this.item) return;
        this.$nextTick(() => {
          document.getElementById('state-' + this.item)
            ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
        this._fade = setTimeout(() => { this.item = ''; }, 4000);
      },

      authed() { return !!window.__shell?.hasToken?.(); },

      // ── Consumers ───────────────────────────────────────────────────────
      viewLabel(v) { return VIEWS[v]?.label || v; },
      viewIcon(v) { return VIEWS[v]?.icon || 'ph-square'; },
      // Routed through the shell's own go* method rather than a URL, so the
      // chip behaves like every other in-app navigation (lazy mount, URL
      // stamp, drawer handling) instead of reloading the page.
      goView(v) { const go = VIEWS[v]?.go; if (go) window.__shell?.[go]?.(); },
      pageUrl(path) { return 'https://mehrlander.github.io/web-tools/' + path; },

      // ── The JSON peek ───────────────────────────────────────────────────
      // Read the file and hand it to the shared viewer. One row open at a time:
      // these run 68 KB to 818 KB, so mounting four is a cost with no reader.
      // The fetch is not cached, since the row's whole promise is that what you
      // are looking at is what is committed right now.
      async togglePeek(r) {
        if (this.peek === r.key) { this.peek = ''; this.peekErr = ''; this.peekText = ''; return; }
        if (!this.authed()) return;
        this.hist = '';
        this.peek = r.key; this.peekErr = ''; this.peekText = ''; this.peekCopied = false;
        this.peekBusy = r.key;
        try {
          const reg = new window.GH({ token: window.TOKEN, repo: REGISTRY(), ref: 'main' });
          const text = (await reg.get('state/' + r.file)).text;
          if (this.peek !== r.key) return;   // closed while it was in flight
          this.peekText = text;
          this.peekLines = text.split('\n').length.toLocaleString() + ' lines';
        } catch (e) {
          this.peekErr = String(e?.message || e);
        } finally { this.peekBusy = ''; }
      },
      async copyPeek() {
        try {
          await navigator.clipboard.writeText(this.peekText);
          this.peekCopied = true;
          setTimeout(() => { this.peekCopied = false; }, 1600);
        } catch {}
      },
      // ── The history ─────────────────────────────────────────────────────
      // One commits call per open, listing the commits that touched this file.
      // Every one of them is a crawl that found a material change, since that
      // is the only condition under which any of these files is written, so the
      // list needs no filtering to mean what the panel says it means.
      async toggleHist(r) {
        if (this.hist === r.key) { this.hist = ''; return; }
        if (!this.authed()) return;
        this.peek = '';
        this.hist = r.key; this.histErr = ''; this.histRows = []; this.histDiff = {};
        this.histBusy = r.key;
        try {
          const reg = new window.GH({ token: window.TOKEN, repo: REGISTRY(), ref: 'main' });
          const commits = await reg.history('state/' + r.file, HIST_DEPTH);
          if (this.hist !== r.key) return;          // closed while it was in flight
          this.histRows = commits.map((c, i) => {
            const prev = commits[i + 1];            // the older neighbour
            const gapMs = prev ? +new Date(c.date) - +new Date(prev.date) : 0;
            return { sha: c.sha, date: c.date, stamp: this.stamp(c.date), ago: this.ago(c.date),
                     gapMs, gap: gapMs ? '+' + this.humanMs(gapMs) : '' };
          });
          // THE ONE EAGER READ, and it buys two things at once. The newest
          // committed version carries the `runs` ring, whose window is the same
          // twenty, so one read fills the duration column for every row; and it
          // is the same version the first interval would fetch, so expanding
          // that interval afterwards costs one read rather than two. Failure is
          // silent by design: the durations are an extra column on a panel that
          // is complete without them, and a ring that predates this feature is
          // simply absent rather than an error.
          if (commits[0]) {
            try {
              const runs = (await this.version(commits[0].sha, r.file))?.runs;
              if (this.hist !== r.key) return;
              this.attachRuns(runs);
            } catch {}
          }
        } catch (e) {
          this.histErr = String(e?.message || e);
        } finally { this.histBusy = ''; }
      },

      // Hang each run record on the commit it produced, matched by interval
      // rather than by position: commits predate the ring, so the two lists do
      // not line up and a positional join would shift every duration by one the
      // first time it met an older commit.
      attachRuns(runs) {
        if (!Array.isArray(runs) || !runs.length) return;
        const matched = window.CrawlRuns.matchRuns(this.histRows, runs);
        this.histRows = this.histRows.map((h, i) => {
          const run = matched[i];
          if (!run) return h;
          const parts = ['checked ' + run.checked, run.read != null ? 'read ' + run.read : '',
                         run.changed != null ? run.changed + ' changed' : '',
                         run.deferred ? run.deferred + ' deferred' : '',
                         run.failed ? run.failed + ' failed' : '',
                         run.pass ? 'the ' + run.pass + ' pass' : ''].filter(Boolean);
          return { ...h, run, took: this.humanSecs(run.ms), runWhy: parts.join(' · ') };
        });
      },

      // The reading the list is for: how often this store REALLY changes, next
      // to the interval at which it is checked, and what a run of it costs. A
      // median rather than a mean on both, since one long quiet stretch (a
      // fortnight nobody opened the page) or one cold survey otherwise sets the
      // whole figure.
      histSummary() {
        const n = this.histRows.length;
        if (!n) return 'no commits found';
        const mid = (xs) => { const s = xs.filter(Boolean).sort((a, b) => a - b);
                              return s.length ? s[Math.floor(s.length / 2)] : 0; };
        const med = mid(this.histRows.map(h => h.gapMs));
        const took = mid(this.histRows.map(h => h.run?.ms));
        const span = n > 1 ? +new Date(this.histRows[0].date) - +new Date(this.histRows[n - 1].date) : 0;
        return [
          n + ' change' + (n === 1 ? '' : 's') + (n === HIST_DEPTH ? ' (the window)' : ''),
          span ? 'over ' + this.humanMs(span) : '',
          med ? 'typically ' + this.humanMs(med) + ' apart' : '',
          took ? this.humanSecs(took) + ' a run' : '',
        ].filter(Boolean).join(' · ');
      },

      // What changed across ONE interval, read from the two versions
      // themselves. Toggles closed on a second tap, and never re-reads: a
      // committed version is immutable, so the parse is cached for the life of
      // the panel and an adjacent interval costs one read rather than two.
      async diffAt(r, i) {
        const cur = this.histDiff[i];
        if (cur?.busy) return;
        if (cur) { const { [i]: _drop, ...rest } = this.histDiff; this.histDiff = rest; return; }
        this.histDiff = { ...this.histDiff, [i]: { busy: true, line: 'reading…' } };
        try {
          const [next, prev] = await Promise.all([
            this.version(this.histRows[i].sha, r.file),
            this.version(this.histRows[i + 1].sha, r.file),
          ]);
          const records = this.changedRecords(r, prev, next);
          const total = Object.keys(next?.[r.records] || {}).length;
          const pct = total ? Math.round(records.length / total * 100) : 0;
          const noun = r.grain + (total === 1 ? '' : 's');
          this.histDiff = { ...this.histDiff, [i]: {
            // A zero denominator is not "nothing changed", it is a version this
            // reading cannot count, and the two must not print the same.
            line: !total ? 'no ' + noun + ' to count'
                : records.length ? records.length + ' of ' + total + ' ' + noun + ' · ' + pct + '%'
                : 'no ' + r.grain + ' changed',
            records,
          } };
        } catch (e) {
          this.histDiff = { ...this.histDiff, [i]: { err: String(e?.message || e), line: 'failed' } };
        }
      },

      // A committed version of the file, parsed and kept. The peek panel
      // deliberately does not cache, because its promise is that you are seeing
      // what is committed NOW; a version addressed by sha cannot move, so the
      // opposite rule applies here.
      async version(sha, file) {
        this._vers ||= new Map();
        const key = sha + ':' + file;
        if (!this._vers.has(key)) {
          const gh = new window.GH({ token: window.TOKEN, repo: REGISTRY(), ref: sha });
          this._vers.set(key, JSON.parse((await gh.get('state/' + file)).text));
        }
        return this._vers.get(key);
      },

      // Which records differ between two versions, read through each store's
      // own change detector rather than a deep compare. Every one of these
      // files stores a per-record fingerprint precisely so a crawl can skip a
      // no-op commit (`hash` in the config and activity caches, the record's
      // blob `sha` in the sessions cache), which means the panel's answer and
      // the crawl's own commit gate are the same reading. The entity index
      // keeps no fingerprint, so it falls back to comparing the serialized
      // record, which is honest for a file that changes a few times a year.
      //
      // `alignHash` rides the config comparison because the config crawl treats
      // a moved alignment grade as a changed cache; leaving it out would show a
      // commit with nothing changed in it.
      changedRecords(r, prev, next) {
        const pr = prev?.[r.records] || {}, nx = next?.[r.records] || {};
        const fp = (e) => {
          if (e == null) return '\0null';
          if (e.hash != null) return String(e.hash) + (e.alignHash ? '·' + e.alignHash : '');
          if (e.sha) return String(e.sha);
          try { return JSON.stringify(e); } catch { return ''; }
        };
        const keys = [...new Set([...Object.keys(pr), ...Object.keys(nx)])].sort();
        const out = [];
        for (const k of keys) {
          const kind = !(k in pr) ? 'added' : !(k in nx) ? 'removed'
                     : fp(pr[k]) !== fp(nx[k]) ? 'changed' : '';
          if (kind) out.push({ key: this.shortKey(k), kind });
        }
        return out;
      },
      // Chips are read at a glance and the owner is the same on every row, so
      // the account prefix and the sessions store's path scaffolding are noise.
      shortKey(k) {
        return k.replace(/^mehrlander\//, '')
                .replace(/^sessions\/\d{4}\/\d{2}\//, '').replace(/\.json$/, '');
      },
      // Month, day, and time. The year is in the title, since twenty commits
      // of a file that changes hourly never span one and the five characters
      // are what push the row off a phone.
      stamp(iso) { try { return new Date(iso).toISOString().slice(5, 16).replace('T', ' '); } catch { return ''; } },

      registryShort() { return REGISTRY().split('/')[1] || REGISTRY(); },
      stateGh() { return 'https://github.com/' + REGISTRY() + '/tree/main/state'; },
      fileGh(f) { return 'https://github.com/' + REGISTRY() + '/blob/main/state/' + f; },
      hubGh(p) { return 'https://github.com/' + HUB + '/blob/main/' + p; },
      busy(r) { return !!window.__shell?.[r.busy]; },
      run(r) { window.__shell?.[r.refresh]?.(); },

      // ── Reading the ages ────────────────────────────────────────────────
      // One directory listing for the sizes, then one commit read per file for
      // the write time. Failure is per-row: an unreadable commit leaves that
      // row's age blank rather than blanking the view.
      async load() {
        const build = (c, extra) => ({ ...c, ...extra, throttle: this.humanMs(c.throttleMs) });
        // Render the shape immediately, so a slow read shows rows with pending
        // ages rather than a spinner over nothing.
        this.rows = CACHES.map(c => build(c, { checkedAgo: this.checkedAgo(c.checkedKey) }));
        this.offline = { ...OFFLINE };
        if (!this.authed()) { this.note = 'Signed out: the registry rows show no ages until a token is set.'; return; }
        this.note = '';
        this.loading = true; this.err = '';
        try {
          const reg = new window.GH({ token: window.TOKEN, repo: REGISTRY(), ref: 'main' });
          const sizes = {};
          try {
            for (const f of await reg.ls('state')) sizes[f.name] = f.size;
          } catch {}
          const all = [...CACHES, OFFLINE];
          const dates = await Promise.all(all.map(c =>
            reg.history('state/' + c.file, 1).then(h => h[0]?.date || '').catch(() => '')));
          const stamp = (c, i) => ({
            size: this.humanBytes(sizes[c.file]),
            builtAt: dates[i],
            builtAgo: dates[i] ? this.ago(dates[i]) : '',
            // Staleness is only claimed where the source declares a bar for it:
            // a crawl past twice its own throttle, or the entity index past the
            // 30 days its repo check uses. No invented thresholds.
            stale: dates[i] ? (Date.now() - +new Date(dates[i])) >
              (c.throttleMs ? c.throttleMs * 2 : 30 * 86400 * 1000) : false,
          });
          this.rows = CACHES.map((c, i) => build(c, { ...stamp(c, i), checkedAgo: this.checkedAgo(c.checkedKey) }));
          this.offline = { ...OFFLINE, ...stamp(OFFLINE, all.length - 1) };
          // Second pass, deliberately unawaited: the ages are on screen by now,
          // and the probe only ever adds a line to a row that already reads.
          this.runProbe(Object.fromEntries(CACHES.map((c, i) => [c.key, dates[i]])));
        } catch (e) {
          this.err = String(e?.message || e);
        } finally { this.loading = false; }
      },

      // ── The probe ───────────────────────────────────────────────────────
      // Two calls for the whole view, both compared against the `built` dates
      // load() has just read, so nothing here reads a cache file. It runs after
      // the ages rather than with them: the ages are the view's content and a
      // slow or failed probe must not hold them, so this is a second pass whose
      // failure leaves every row exactly as it was.
      async runProbe(built) {
        if (!this.authed()) return;
        const next = {};
        // One listing, two readings. `pushed_at` moves on a push to ANY ref,
        // which is what the activity cache tracks and is only one of the things
        // the config cache tracks, so the same figure is tight for one row and
        // loose for the other. Both are reported as the push count they are.
        try {
          const repos = await new window.GH({ token: window.TOKEN }).repos();
          for (const key of ['configs', 'activity']) {
            const since = built[key];
            if (!since) continue;
            const moved = repos.filter(r => r.pushed_at && r.pushed_at > since);
            next[key] = { n: moved.length, names: moved.map(r => r.full_name),
                          line: moved.length ? moved.length + ' pushed' : 'no push' };
          }
        } catch {}
        // The sessions store is written one commit per record, so commits under
        // sessions/ since the cache's own commit ARE the records waiting for it.
        try {
          const reg = new window.GH({ token: window.TOKEN, repo: REGISTRY(), ref: 'main' });
          const since = built.sessions;
          if (since) {
            const writes = (await reg.history('sessions', 30)).filter(c => c.date > since);
            next.sessions = { n: writes.length, records: writes.length,
                              line: writes.length ? writes.length + ' written' : 'no record' };
          }
        } catch {}
        this.probe = next;
      },

      // Why this row's button is weighted the way it is, in the tooltip, since
      // the weight is a claim and a claim with no stated basis is decoration.
      probeWhy(r) {
        const p = this.probe[r.key];
        if (!p) return r.stale ? 'Past twice its throttle, and the source was not probed.'
                               : 'The source was not probed.';
        if (r.key === 'sessions')
          return p.n ? p.n + ' session record' + (p.n === 1 ? '' : 's') + ' committed since this was built.'
                     : 'No session record has been committed since this was built.';
        const what = r.key === 'configs'
          ? ' Any push moves this, including one that never touched a manifest, so it is an upper bound on what the crawl would find.'
          : ' A PR opened without a push moves nothing here, so the crawl may still find more.';
        return (p.n ? p.n + ' repo' + (p.n === 1 ? '' : 's') + ' pushed since this was built (' +
                      p.names.slice(0, 6).map(n => this.shortKey(n)).join(', ') + (p.n > 6 ? ', …' : '') + ').'
                    : 'No repo has been pushed since this was built.') + what;
      },

      // Whether pressing Refresh would do anything, which is what the button's
      // weight has always claimed to say. The probe answers it as a fact; the
      // clock is the fallback for a row with no probe, and only there.
      matters(r) {
        const p = this.probe[r.key];
        return p ? p.n > 0 : !!r.stale;
      },

      ago(iso) { try { return iso ? (this.__ago ||= new window.GH({})).ago(iso) : ''; } catch { return ''; } },
      checkedAgo(key) {
        try {
          const t = +localStorage.getItem(key) || 0;
          return t ? this.ago(new Date(t).toISOString()) : '';
        } catch { return ''; }
      },
      // A crawl's own duration, which lives a scale below everything else here:
      // seconds to a couple of minutes, where humanMs would round the whole
      // range to "0m".
      humanSecs(ms) {
        if (!ms) return '';
        const s = ms / 1000;
        return s < 1 ? '<1s' : s < 90 ? Math.round(s) + 's'
             : Math.floor(s / 60) + 'm' + String(Math.round(s % 60)).padStart(2, '0') + 's';
      },
      // Throttles are all under a day, so the day branch serves the history
      // panel's gaps alone, where a lone rounded "1d" would hide the difference
      // between 25 hours and 47.
      humanMs(ms) {
        if (ms >= 86400e3) {
          let d = Math.floor(ms / 86400e3), h = Math.round((ms % 86400e3) / 3600e3);
          if (h === 24) { d += 1; h = 0; }
          return h ? d + 'd' + h + 'h' : d + 'd';   // unspaced: it sits in a mono column
        }
        return ms >= 3600e3 ? Math.round(ms / 3600e3) + 'h' : Math.round(ms / 60e3) + 'm';
      },
      humanBytes(n) {
        if (!n) return '';
        return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB'
          : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
      },

      // ── The live row ────────────────────────────────────────────────────
      // The shelf's stamp is session state in the estate component, mirrored
      // onto the shell as it lands, so this reads one place rather than
      // reaching across.
      guidesAgo() { const t = window.__shell?.guidesLoadedAt; return t ? this.ago(t) : ''; },
      guidesBusy() { return !!window.__shell?.guidesBusy; },
      refreshGuides() { document.dispatchEvent(new CustomEvent('web-tools:refresh-guides')); },

      // ── The browser rows ────────────────────────────────────────────────
      searchStats() { return window.EstateSearch?.stats?.() || { trees: 0, records: 0 }; },
      searchLine() {
        const s = this.searchStats();
        return s.trees + ' tree' + (s.trees === 1 ? '' : 's') + ' · ' +
               s.records + ' record' + (s.records === 1 ? '' : 's');
      },
      searchClearedAgo() {
        const t = this.searchStats().clearedAt;
        return t ? this.ago(new Date(t).toISOString()) : '';
      },
      clearSearch() { window.EstateSearch?.reset?.(); this.now = Date.now(); },

      loadedAgo() {
        const t = performance.timeOrigin || (Date.now() - performance.now());
        return this.ago(new Date(t).toISOString());
      },
      // What the library actually booted at, which is the fact a reload would
      // change. `?use=` pins a branch; without it the page ran its own copy.
      libRef() {
        const r = new URLSearchParams(location.search).get('use');
        return r ? 'lib pinned at ' + r : 'lib at main';
      },
      // The fab owns the one implementation (it is the page-level component,
      // and it works on pages that never load this view), so this asks rather
      // than keeping a second copy of the cache-bust dance.
      hardRefresh() { document.dispatchEvent(new CustomEvent('web-tools:hard-refresh')); },
    };
  });
});
