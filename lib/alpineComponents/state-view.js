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
    // FOUR FILES, TWO BUTTONS. state/entities.json is derived like the other
    // three and cannot be refreshed from here: it needs spaCy over ~4,000 files
    // across seven checkouts, about half an hour, which is not a page load. It
    // gets a row anyway, saying so. A freshness surface that lists only what it
    // can fix is the same omission the chrome was already making.
    //
    // Two of the remaining three merged into one press. Branches and Sessions
    // stay two rows over two files, because they are two crawls over two
    // sources with two gates and two histories, and every reading below is
    // per file. They share one Refresh because THE SPLIT IS NOT THE READER'S:
    // a session ending moves both at once, its record landing in the registry
    // and its commits landing on a branch, so a press that got one and left the
    // other was asking about an internal boundary. Grouping keeps both facts,
    // where merging the files would have bought the one button by giving up the
    // per-file account this view exists for.
    //
    // CHECKED VS UPDATED, and the split is the point. `checked` is this
    // browser's stamp from the last time a crawl looked; `updated` is the last
    // commit touching the file. A crawl that ran and found nothing does not
    // commit, so "checked just now, updated 3d ago" reads as current rather
    // than stale, which is exactly what a lone as-of could never say. It is
    // also why `checked` leads: it is the reading the other one cannot stand
    // in for, and it was buried fourth on its line behind two facts nobody
    // needed. The commit date is used rather than the file's own `generatedAt`
    // because reading four generatedAt fields costs 1.5 MB of JSON for four
    // timestamps; for a file only the crawl writes, the commit IS the write.
    //
    // ARRIVING HERE REFRESHES ALL THREE, which is what makes `checked` worth
    // leading with: it is a reading about this visit rather than about whenever
    // some other pane was last opened. The shell's goState does the kicking and
    // carries the argument; what it costs is one call per crawl on a quiet
    // estate, because each crawl gates itself per unit of work.
    //
    // Cost of the view's OWN reading: one `ls state` plus one commit read per
    // file, so five calls, no matter how many repos the estate holds. The local
    // rows need no network.

    // THE PROBE IS GONE, AND SO IS THE CLOCK IT ARGUED WITH.
    //
    // This view used to run a two-call probe and print what it found beside
    // each row: "3 pushed", meaning three repos had been pushed since the
    // cache was built. It was an honest reading and it answered the right
    // question, which is not "how old is this" but "is there anything to
    // fetch". Its flaw was what it did with the answer. Knowing three repos
    // had moved, it lit a button and waited to be pressed.
    //
    // So the reading moved to where it could act. Each crawl now gates itself
    // per unit of work on the same evidence this probe was reading, and the
    // view kicks all three on arrival (goState in the shell). Finding motion
    // and fixing it are one gesture, and the reading a row leads with is what
    // that gesture found rather than what someone might want to do about it.
    //
    // Two things went with it. The staleness verdict, because a row cannot be
    // stale in a view that just refreshed it; and "auto every 30m", which named
    // an interval that never was a schedule (nothing here has ever run on a
    // timer) and is now a sixty-second debounce nobody needs to read.
    //
    // THE 24-HOUR STRIP: what the SOURCE did, not what the crawl did.
    //
    // A quiet rule from 24h ago to now, one identical tick per event. Time and
    // density are the only encoded variables: every tick is the same height and
    // the same colour, so a cluster reads as a cluster because the marks
    // overlap and their alpha compounds, never because anything was scaled. A
    // variable-height or heat-mapped version of this would be claiming a
    // magnitude per event that no event here has.
    //
    // ONLY A ROW WITH A TRUTHFUL STREAM GETS ONE. Branches draws commits and
    // Sessions draws session starts, both already dated in their own caches.
    // Repo configs draws nothing: the only timestamps it stores are the crawl's
    // own `at`, so a strip there would be a picture of when the cache was
    // written wearing the label of when the estate changed. That is the one
    // substitution this whole reading exists to refuse, and an empty rail would
    // have been the most convincing way to make it.
    //
    // The window is fixed at 24h and the rail is drawn whether or not anything
    // happened, since "nothing in the last day" is a reading and a missing rail
    // is not. `partial` marks the case where the underlying list is capped
    // (RepoActivityCache.COMMIT_CAP is 30 a repo) and its oldest event is
    // younger than the window, so the empty stretch on the left is unknown
    // rather than quiet. It is said in the tooltip rather than drawn, because
    // drawing it would need a second visual variable.
    const TICKS = (r) => `
      <!-- The rail sits mostly INSIDE the gap the row already had, rather than
           adding a band of its own: measured 2026-08-22, its own padding plus
           one flex gap cost 22px a row, which on a 175px card is not "fits
           inside the existing card". The negative margin gives back most of
           what the layout was already spending, so the rail can be 12px and
           still cost the row far less than that. -->
      <template x-if="${r}.stream && pulse[${r}.key]">
      <div class="-my-0.5 flex items-center gap-2">
        <!-- THE WINDOW, SAID RATHER THAN ASSUMED. Without it the rail is a row
             of marks over an unstated span, and a reader has no way to tell 24
             hours from a week: the one thing a timeline must never leave to
             inference is its own extent. Left, because that is where the span
             starts and where the eye enters the rail. "Now" is not labelled on
             the right, since the rail ends at the moment you are reading it and
             a second label would be furniture. -->
        <button type="button" @click="cycleWindow()"
                class="shrink-0 text-[10px] leading-none text-base-content/40 tabular-nums
                       hover:text-primary transition-colors cursor-pointer"
                :title="'Showing the last ' + ${r}.window + '. Tap for the other span.'"
                x-text="${r}.window"></button>
        <div class="relative h-3 flex-1" :title="pulseTitle(${r})"
             @pointerenter="peekAt(${r}, $event)"
             @pointermove="peekAt(${r}, $event)"
             @pointerleave="clearPeek()"
             @click="peekAt(${r}, $event)">
          <!-- The rule sits at the vertical middle and the ticks straddle it,
               so the strip reads as one object rather than as a row of marks
               with a line under them. -->
          <div class="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-base-content/20"></div>
          <!-- PRIMARY, not base-content, and it is the one place on this row
               that carries the app's accent. The rail is the only thing here
               reporting the ESTATE rather than the cache, so it should not read
               as more grey furniture beside the ages. Green is not available
               for this: it means one verb on this view (bring this up to date)
               and is on the Refresh controls and nowhere else, so tinting a
               reading with it would spend the one colour that still means
               something. Alpha stays on the mark so overlap compounds. -->
          <template x-for="(t, i) in (pulse[${r}.key]?.ticks || [])" :key="i">
            <div class="absolute top-1/2 w-px h-3 -translate-y-1/2 bg-primary/60"
                 :style="'left:' + t + '%'"></div>
          </template>
          <!-- The resolved mark, drawn full-strength so the reader can see WHICH
               tick the card is describing. Without it a dense cluster leaves the
               card pointing at any of five marks. -->
          <template x-if="peek && peek.key === ${r}.key">
            <div class="absolute top-1/2 w-0.5 h-4 -translate-y-1/2 -translate-x-px bg-primary rounded-full"
                 :style="'left:' + peek.left + '%'"></div>
          </template>
        </div>
      </div>
      </template>`;

    // THE CARD for the tick under the pointer. Anchored under the rail rather
    // than floating over it, because a floating tip on a phone lands under the
    // thumb that opened it. It is two short lines: what the event was, and
    // when. Anything more would be a second view of the cache, which is one
    // tap away in the panel below.
    const PEEK = (r) => `
      <template x-if="peek && peek.key === ${r}.key">
        <div class="mt-1 flex items-baseline gap-2 text-sm">
          <span class="font-medium text-base-content/70 truncate" x-text="peek.name"></span>
          <span class="font-mono text-xs text-base-content/40 truncate" x-show="peek.detail"
                x-text="peek.detail"></span>
          <span class="ml-auto shrink-0 tabular-nums text-base-content/50"
                :title="peek.when" x-text="peek.ago"></span>
        </div>
      </template>`;

    // THE BAR, while a crawl this row started is running.
    //
    // This view took the Refresh controls off the panes and gave them a reading
    // to press against, and then dropped the one reading the crawl itself was
    // already producing: the Branches pane has had a determinate per-repo bar
    // since the split refresh, and a Refresh pressed HERE ran the same crawl for
    // the same tens of seconds behind a spinner that said only "Running…". A
    // control moved without its progress is a control made worse, so the bar
    // moves with it. Both draw the shell's one progress channel, so neither is a
    // copy of the other, and pressing here still lights the pane's bar too.
    //
    // It reads whatever the crawl publishes and knows nothing about which crawl
    // it is watching: the verb, the unit and the names in flight all ride in the
    // channel. The Guides row has no bar because it has nothing to count (one
    // listing per repo, seconds, no denominator worth drawing); its button says
    // "Reading…" and that is the honest whole of it.
    const PROGRESS = (r) => `
      <div x-show="busy(${r})" class="flex flex-col gap-1">
        <!-- A styled div, not <progress>: an unvalued progress element falls
             back to the indeterminate sweep, which is the churn this replaces,
             and it does it at 0 of N, the moment the reading matters most. -->
        <div class="h-1 w-full rounded-full bg-base-300 overflow-hidden" role="progressbar"
             :aria-valuenow="progPct(${r})" aria-valuemin="0" aria-valuemax="100">
          <div class="h-full bg-primary rounded-full transition-[width] duration-300"
               :style="'width:' + progPct(${r}) + '%'"></div>
        </div>
        <div class="text-sm text-base-content/50 truncate">
          <span x-text="progLabel(${r})"></span>
          <span class="text-base-content/30" x-show="progActive(${r})"
                x-text="' · ' + progActive(${r})"></span>
        </div>
        <!-- THE WIRE. The bar says how far along; this says what it is doing
             right now, as the request itself. This view's whole subject is the
             refresh, so the one thing it was still hiding was the traffic the
             refresh IS: a reader could see 4 of 11 repos and still not know
             whether that is one call per repo or thirty.
             Verbatim past the host, since a prettified path is no longer the
             thing being reported; the host is dropped only because it is the
             same on every line. The METHOD leads, because a PUT here is the
             commit, the one request in the run that changes anything, and it
             read as an ordinary row without it. The count is this crawl's, not
             the page's, off the slot's own baseline. -->
        <div class="flex items-baseline gap-2 font-mono text-xs text-base-content/40">
          <span class="truncate" :title="wireFull(${r})" x-text="wireLine(${r})"></span>
          <span class="ml-auto shrink-0 tabular-nums" x-show="wireCount(${r})"
                x-text="wireCount(${r}) + ' calls'"></span>
        </div>
      </div>`;

    // GREEN MEANS ONE VERB: bring this up to date from its source. It is on the
    // four Refresh controls and nowhere else, so Clear (which forgets) and
    // Reload (which re-fetches the page, not the estate) stay neutral and the
    // colour keeps meaning something. Ages, at the top, re-reads the timestamps
    // without running anything, so it is ghost.
    //
    // ONE WEIGHT NOW. This carried two: soft inside the throttle, solid once a
    // row went stale, so the emphasis was a reading rather than decoration.
    // That reading had exactly one basis, the staleness verdict, and gating the
    // crawls on motion removed it: a row on this screen was refreshed on
    // arrival, so there is no "press this one" left to say. A button that
    // escalated on nothing would be the decoration the two weights were
    // introduced to avoid. Ghost while running, for the same reason as before:
    // mid-flight there is nothing to decide.
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
    // ONE EXPAND, TWO TABS INSIDE IT. This shipped as two carets side by side,
    // Expand and History, on the argument that the bytes and the file's past are
    // different subjects rather than two readings of one thing. Overruled
    // 2026-08-10, and the reason is worth keeping: at the control strip nobody
    // is reading an argument about subjects, they are reading two adjacent
    // disclosure triangles on one row and wondering what the second one does.
    // The distinction was real and belonged one level in, where a tab strip
    // states it in two words and the panel is already open.
    // NO CAPTION ON THE DISCLOSURE. This carried "Expand" closed and "Collapse"
    // open, then "Expand" alone; it carries neither now. A caret at the end of a
    // row is the most established control on the web, the panel it opens is
    // directly beneath it, and every other affordance on this row is already a
    // word, so the caption was the third label competing for a line that has
    // Refresh and a chip strip on it. Size carries it instead.
    //
    // THE GITHUB MARK RIDES THE FILENAME, which is the shell's own convention
    // for a jump-over that names an exact file: the mark sits beside the name it
    // opens (the estate's surface rows, the Map's item rows, the repo dialog's
    // title), tight against it and faint, rather than in a control strip at the
    // far end of the card. It sat with Expand here because the two were read as
    // one group of file controls; they are not, since Expand acts on the panel
    // and this leaves the page.
    //
    // The path itself stays a LABEL. It was an anchor once and that was the one
    // destination a tap on this row should not have, since the whole point of
    // the view is data the app can render itself. The mark beside it is the
    // deliberate, small way out, which is the same split every other call site
    // in the shell draws.
    //
    // AND IT CARRIES A PEEK, which it should have from the start and did not.
    // lib/kits/source-peek.js states the narrow rule: a GitHub icon that names
    // an EXACT FILE carries `data-peek`, one that opens a repo, a branch or a
    // menu does not, and that is what lets a reader tell the four meanings
    // apart. This is the exact-file case. One attribute, no wiring.
    const FILE_LINK = (r) => `
      <a :href="fileGh(${r}.file)" :data-peek="peekAddr(${r}.file)"
         target="_blank" rel="noopener"
         class="text-base-content/30 hover:text-primary transition-colors shrink-0 self-center"
         :title="'Open state/' + ${r}.file + ' on GitHub'">
        <!-- SIZE IS THE HOUSE SIZE, not this row's own. The mark shipped at
             text-sm, which is 2 of ~25 instances across the codebase; the norm
             is 16px, explicit or inherited, and this very view's header mark is
             16px, so one screen carried two github marks at two sizes. At 14px
             the glyph's interior detail also muddies, and it is a small target
             on a phone.
             THE NUDGE IS MEASURED, not judged. Centring the glyph box beside
             text aligns two boxes, and a box is not what the eye compares: the
             mono face puts its baseline 3px above its ink bottom, so the
             centred mark hung below the baseline of the name it sits against,
             which reads as sagging. Raising it 1px lands its mass 0.35px off
             the text's x-height centre, and that holds at both sizes. Measured
             off the rendered pixels, glyph forced opaque since a 30%-opacity
             mark defeats an ink threshold; -0.5 and -1.5 render identically to
             0 and -1, so the choice is integers only. -->
        <i class="ph ph-github-logo text-base relative -top-px"></i>
      </a>`;

    const FILE_CONTROLS = (r) => `
      <div class="flex items-center gap-0.5 justify-end">
        <button @click="toggleOpen(${r})" :disabled="!authed()"
                class="btn btn-sm btn-ghost btn-square disabled:opacity-40"
                :class="open === ${r}.key ? 'text-primary' : 'text-base-content/50 hover:text-primary'"
                :title="open === ${r}.key ? 'Collapse'
                        : 'Read state/' + ${r}.file + ' here (' + (${r}.size || 'unknown size') + '), and when it changed'">
          <i class="ph text-xl"
             :class="busyRow(${r}) ? 'ph-circle-notch animate-spin'
                     : (open === ${r}.key ? 'ph-caret-down' : 'ph-caret-right')"></i>
        </button>
      </div>`;

    // The tab strip, at the head of the open panel. Two words and no icons: the
    // words are exact and a glyph beside an exact word is decoration, which is
    // the same charge that took the `{}` off the Expand control one level up.
    // Contents is the file as committed, History is when it changed and by how
    // much. The choice STICKS across rows for the life of the panel, so a reader
    // comparing histories does not re-pick it on every row; the strip is in view
    // throughout, so nothing is ambiguous about what is on screen.
    const TABS = (r) => `
      <div role="tablist" class="tabs tabs-sm tabs-bordered self-start">
        <button role="tab" @click="showTab(${r}, 'contents')"
                class="tab" :class="tab === 'contents' && 'tab-active'">Contents</button>
        <button role="tab" @click="showTab(${r}, 'history')"
                class="tab" :class="tab === 'history' && 'tab-active'">History</button>
        <!-- THE THIRD READING, and the one the other two cannot give. Contents
             is what the crawl produced, History is when it produced it, Calls is
             what it SPENT: the last run's requests, one row each. -->
        <button role="tab" @click="showTab(${r}, 'calls')"
                class="tab" :class="tab === 'calls' && 'tab-active'">Calls</button>
      </div>`;

    // The panel: THE BYTES, as committed. It ran through the shared multi-mode
    // viewer at first, which brought a mode switcher, a filter, a sort, a
    // search, an undo pair, a copy, a tree toggle, an open-out, and a
    // GitHub/Raw/CDN menu, all stacked above the data on a phone. That is an
    // editor's chrome, and nothing here is being edited: the crawl owns these
    // files, so every control except copy was answering a question the row does
    // not raise. The estate keeps the full multi-mode reading one tap away at
    // the github mark and at the data route (`toss-render.html#data=`).
    //
    // That line said "which is where a reader who wants to pivot a table should
    // go" until 2026-08-21, and it was wrong in a way nothing could catch: the
    // data route is a VIEWER, five ways of reading bytes, with no grouping and
    // no aggregation anywhere in it. Pivoting lives in the transform workbench
    // (`pages/transform.html`, its Pivot view), which is a different page for a
    // different verb. Naming the two apart is the fix; sending a reader to a
    // page that cannot do the thing was the bug.
    //
    // Rendered verbatim rather than re-serialized: the crawls already write with
    // a 2-space indent, and the row's promise is that this is what is committed,
    // which a reformat would quietly break.
    //
    // ONE BOX, not three. It used to sit in its own bordered, tinted, padded
    // box, indented under the icon, inside the card, around a viewer that draws
    // its own frame. Now a hairline separates it and the negative margin lets it
    // use the card's full width.
    const CONTENTS_TAB = `
      <template x-if="tab === 'contents'">
        <div class="flex flex-col min-h-0">
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
    // WHAT IT CANNOT SAY, and where each limit is carried. This shipped as a
    // 40-word paragraph above the rows, stating all of it on every open, and
    // that was the wrong instrument: not over-claiming is a property of the
    // LABELS, while standing prose is insurance against a misreading the labels
    // already prevent. Four of ten visible lines on a phone, read once, noise
    // after. The rule the removal leaves behind: prose in the interface is the
    // expensive fallback for a label that cannot be made honest, and it should
    // be rare.
    //
    //   A run that found nothing leaves no trace, so this counts CHANGES, not
    //   runs. Carried by the summary's own first word, `10 changes`, which is
    //   the whole caveat in one word in the place the eye lands first.
    //
    //   A row is dated when a crawl NOTICED the change, not when it happened,
    //   so a gap bounds the interval rather than measuring it, and the cadence
    //   is partly a fact about the estate and partly about how often the page
    //   was open. This one no label can carry, so it hangs on the gap figure's
    //   own hover, where someone puzzling over a long gap will look.
    //
    // Both are limits of READING rather than writing, and the fix for either is
    // to have the crawl record something. A third limit WAS lifted that way,
    // and it is the exception that shows the rule: duration was nowhere,
    // because the only party that knows it is the browser that ran the crawl
    // and it reported it to a four-second toast, so the crawls now append a
    // `runs` record to the commit they were making anyway
    // (lib/kits/crawl-runs.js). That column needs no note either: a duration
    // shows or it does not, and a row from before the ring shipped carries no
    // figure rather than a zero.
    //
    // THE HEADER IS THE ANSWER MOST OF THE TIME. How often a store really
    // changes, and what a run of it costs, off the list already fetched. It
    // used to print the checking interval beside that, as the reading that said
    // whether the interval was set anywhere near right. There is no interval to
    // judge now: the crawls run when a view that reads them is opened and gate
    // themselves on motion, so how often the store changes IS how often the
    // crawl commits, and the two columns had become one fact.
    const HISTORY_TAB = (r) => `
      <template x-if="tab === 'history'">
        <div class="flex flex-col min-h-0">
          <div x-show="histErr" class="text-sm text-error font-mono py-2" x-text="histErr"></div>
          <template x-if="!histErr">
            <div class="flex flex-col min-h-0 gap-2">
              <div class="flex items-baseline gap-x-3 gap-y-1 flex-wrap text-sm">
                <span class="text-base-content/70" x-text="histSummary()"></span>
                <span x-show="!${r}.refresh" class="text-base-content/40">rebuilt by hand</span>
              </div>
              <div class="max-h-[55vh] overflow-auto -mx-1 px-1">
                <template x-for="(h, i) in histRows" :key="h.sha">
                  <div class="border-b border-base-200 last:border-0 py-1.5">
                    <!-- Wraps rather than clips: the row carries five readings
                         and a 430px phone cannot always hold them, so the
                         magnitude control drops to its own line instead of
                         sliding off the edge. -->
                    <div class="flex items-baseline gap-2 text-sm flex-wrap">
                      <span class="font-mono text-base-content/70 shrink-0"
                            :title="h.date" x-text="h.stamp"></span>
                      <span class="text-base-content/40 shrink-0" x-text="h.ago"></span>
                      <!-- The gap carries the one caveat the labels cannot: it
                           measures noticing, not happening. On the hover of the
                           figure it qualifies, where someone puzzling over a
                           long gap will look, rather than as standing prose
                           every reader passes on every open. -->
                      <span class="text-base-content/30 font-mono shrink-0" x-text="h.gap"
                            :title="h.gap ? 'Since the change before it. A crawl dates a change when it noticed it, not when it happened, so this bounds the interval rather than measuring it.' : ''"></span>
                      <!-- What the run cost, where the crawl recorded one. The
                           rest of the record is in the title: a duration is the
                           part worth a column, and "checked 19, read 4" is the
                           part worth a tap. -->
                      <span x-show="h.run" class="font-mono text-base-content/50 shrink-0"
                            :title="h.runWhy" x-text="h.took"></span>
                      <div class="grow"></div>
                      <!-- THE MAGNITUDE IS LAZY, so this control exists before
                           its own answer does, and it carried the words "what
                           changed" twenty times down the column to say so. A
                           caret says the same thing in the idiom the panel
                           already uses, and the reading takes its place on the
                           tap, so the column is quiet until it has something to
                           report. The reason it is not eager: these files run
                           68 KB to 818 KB, and diffing twenty intervals up
                           front would read a megabyte and a half to fill a
                           column nobody asked for. Adjacent intervals share a
                           version, so the second tap costs one read, not two. -->
                      <button x-show="i < histRows.length - 1" @click="diffAt(${r}, i)"
                              class="btn btn-xs btn-ghost gap-1 px-1.5 shrink-0"
                              :class="histDiff[i]?.line ? 'text-base-content/70' : 'text-base-content/40 hover:text-primary'"
                              :title="histDiff[i]?.line ? 'Which ' + ${r}.grain + 's moved' : 'Read both versions and name what moved'">
                        <i class="ph text-sm transition-transform"
                           :class="histDiff[i]?.busy ? 'ph-circle-notch animate-spin'
                                   : (histDiff[i]?.line ? 'ph-caret-down' : 'ph-caret-right')"></i>
                        <span x-show="histDiff[i]?.line" x-text="histDiff[i]?.line"></span>
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

    // ── Calls: the last run, as the requests it made ──────────────────────
    //
    // The bar and the wire are live and gone; this is the same traffic kept. The
    // crawl writes `state/calls.json` when a run closes, last run per key,
    // overwritten, so opening this tab reads one small file rather than asking
    // anyone to have been watching.
    //
    // THE SHAPES TABLE IS THE POINT. A list of 214 rows is a record, not a
    // reading: what makes a crawl's cost legible is that 167 of them were one
    // tree read per branch, which only shows once the repo names and the shas
    // are collapsed out of the path. The full list stays underneath, since a
    // shape can hide the one call that failed.
    const CALLS_TAB = (r) => `
      <template x-if="tab === 'calls'">
        <div class="flex flex-col min-h-0 gap-2">
          <div x-show="callsErr" class="text-sm text-error font-mono py-2" x-text="callsErr"></div>
          <div x-show="!callsErr && !callsBusy && !callsRun"
               class="text-base text-base-content/50 py-2">
            No run logged yet. The next Refresh writes one.
          </div>
          <template x-if="callsRun">
            <div class="flex flex-col min-h-0 gap-2">
              <!-- The run, in one line: when, how long, how many, how much. -->
              <div class="flex items-baseline gap-x-3 gap-y-1 flex-wrap text-base">
                <span class="text-base-content/70" x-text="callsRun.verb"></span>
                <span class="text-base-content/40" x-text="ago(callsRun.at)"></span>
                <span class="font-mono text-base-content/50" x-text="humanSecs(callsRun.ms)"></span>
                <span class="font-mono text-base-content/50" x-text="callsRun.calls + ' calls'"></span>
                <span class="font-mono text-base-content/50" x-show="callsBytes()" x-text="callsBytes()"></span>
                <!-- A run logged while the refresh still ran in two passes says
                     so; nothing writes the field now. -->
                <span x-show="callsRun.passes > 1" class="text-base-content/40"
                      x-text="callsRun.passes + ' passes'"></span>
              </div>
              <!-- A truncated list must say so where the list is, not in a note
                   somewhere else: the ledger it came from trims at 400. -->
              <div x-show="callsRun.truncated" class="text-sm text-warning">
                The ledger trimmed this run, so the rows below are its tail rather than all of it.
              </div>

              <div class="text-sm font-mono uppercase tracking-widest text-base-content/40">By shape</div>
              <div class="flex flex-col gap-0.5">
                <template x-for="g in callShapes()" :key="g.shape">
                  <div class="flex items-baseline gap-2 text-sm">
                    <span class="font-mono tabular-nums text-base-content/70 w-10 shrink-0 text-right"
                          x-text="'×' + g.n"></span>
                    <span class="font-mono text-base-content/60 truncate" x-text="g.shape"></span>
                    <span class="ml-auto shrink-0 font-mono text-base-content/30"
                          x-text="humanSecs(g.ms)"></span>
                  </div>
                </template>
              </div>

              <div class="text-sm font-mono uppercase tracking-widest text-base-content/40 pt-1">Every call</div>
              <div class="max-h-[45vh] overflow-auto -mx-1 px-1">
                <template x-for="(c, i) in (callsRun.rows || [])" :key="i">
                  <div class="flex items-baseline gap-2 text-xs font-mono border-b border-base-200 last:border-0 py-1">
                    <span class="tabular-nums text-base-content/30 w-8 shrink-0 text-right" x-text="i + 1"></span>
                    <span class="shrink-0" :class="c.m === 'GET' ? 'text-base-content/40' : 'text-warning'"
                          x-text="c.m"></span>
                    <span class="truncate text-base-content/70" :title="c.u" x-text="c.u"></span>
                    <span class="ml-auto shrink-0 tabular-nums"
                          :class="c.s >= 400 ? 'text-error' : 'text-base-content/30'"
                          x-text="c.s"></span>
                    <span class="shrink-0 tabular-nums text-base-content/30 w-12 text-right"
                          x-text="c.ms + 'ms'"></span>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </div>
      </template>`;

    // One panel, opened by one control, with the two readings as tabs.
    const PANEL = (r) => `
      <template x-if="open === ${r}.key">
        <div class="flex flex-col min-h-0 gap-2 border-t border-base-300 pt-2 -mx-3 px-3">
          <!-- WHAT THIS ROW IS, above what it has been doing. The store path,
               the grain and the consumers used to sit on the collapsed row and
               were true there and in the way: a reader scanning four rows for
               the one that is behind is not reading a consumer list. They are
               facts about the file, so they open with the file. -->
          <div class="flex items-center gap-x-3 gap-y-1 flex-wrap text-sm pb-1">
            <span class="inline-flex items-baseline gap-1.5 min-w-0">
              <span class="font-mono text-base-content/50" x-text="'state/' + ${r}.file"></span>
              ${FILE_LINK(r)}
            </span>
            ${GRAIN(r)}
            <span class="text-base-content/30">used by</span>
            <template x-for="v in ${r}.feeds" :key="v">
              <button @click="goView(v)" class="btn btn-xs btn-ghost gap-1 px-1.5 text-base-content/60 hover:text-primary"
                      :title="'Open ' + viewLabel(v)">
                <i class="ph text-sm" :class="viewIcon(v)"></i><span x-text="viewLabel(v)"></span>
              </button>
            </template>
          </div>
          ${TABS(r)}
          ${CONTENTS_TAB}
          ${HISTORY_TAB(r)}
          ${CALLS_TAB(r)}
        </div>
      </template>`;

    const REFRESH_BTN = (busy) =>
      `:class="${busy} ? 'btn-ghost text-success' : 'btn-success btn-soft'"`;

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
    // Where the crawls log their last run. One file for all three, a run per
    // key, overwritten each time: see the shell's saveCrawlCalls for why the
    // log is separate from the caches and why only the last run is kept.
    const CALLS_PATH = 'state/calls.json';

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
        checkedKey: 'wt:configCacheCheckedAt',
        refresh: 'refreshConfigs', busy: 'configRefreshing' },
      // Renamed from 'Branch activity' when the group arrived. The old label
      // was the confusion in three words: 'Activity' is the nav stop over five
      // views, Sessions among them, so a row wearing it read as THE activity
      // cache and made the Sessions row look like a half that had been
      // separated off. Under the group heading the row is Branches, which is
      // what its own `used by` chip has said all along.
      { key: 'activity', file: 'activity.json', label: 'Branches', icon: 'ph-git-branch',
        grain: 'repo', scope: 'estate members', records: 'repos', group: 'activity',
        // The event this row's strip draws, and the noun it is counted in.
        // `recentCommits` is already dated, already committed, and already the
        // thing the Activity pane reads: no new read, no new artifact.
        stream: 'commits',
        feeds: ['activity', 'guides', 'estate'],
        cost: 'a quick pass in seconds, then a branch scan per repo that took a push',
        checkedKey: 'wt:activityCacheCheckedAt',
        refresh: 'refreshActivity', busy: 'activityRefreshing' },
      { key: 'sessions', file: 'sessions.json', label: 'Sessions', icon: 'ph-terminal-window',
        grain: 'session', scope: 'every captured record', records: 'byPath', group: 'activity',
        stream: 'sessions',
        feeds: ['sessions', 'search'],
        cost: 'one tree read plus a blob per new record',
        checkedKey: 'wt:sessionsCacheCheckedAt',
        refresh: 'refreshSessions', busy: 'sessionsRefreshing' },
    ];

    // A GROUP is several caches under one press. `refresh` names the shell
    // method that runs every member, in the order the shell picks, and reports
    // once. Each member keeps its own `refresh` too: unused by this view now,
    // still what the panes' own buttons and the arrival paths call.
    //
    // Only one group exists and the shape is general anyway, because the
    // alternative was hardcoding 'the activity two' into the template and
    // teaching the next reader that grouping is a special case rather than a
    // property a cache declares.
    const GROUPS = {
      // ph-pulse is the estate nav's Activity icon. This heading and the stop
      // it names should not be two different pictures of one thing.
      activity: { key: 'activity', label: 'Activity', icon: 'ph-pulse',
                  note: 'two crawls, one press', refresh: 'refreshActivityGroup' },
    };

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


    // ONE CARD, rendered for every cache row whether it stands alone or sits in
    // a group. Lifted out of the render block when the Activity group arrived,
    // rather than copied into each branch of the group test: two copies of a
    // hundred-line card is the shape where a fix lands in one of them and
    // nobody notices for weeks.
    const CARD = `
                <div :id="'state-' + r.key"
                     class="rounded-box border bg-base-100 p-3 flex flex-col gap-2 transition-colors duration-500"
                     :class="item === r.key ? 'border-primary bg-primary/10' : 'border-base-300'">
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
                      <!-- THE NAME, AND NOTHING ELSE. The store path, the grain
                           chip and the consumer chips moved into the panel on
                           2026-08-23. Each was true and none was the question a
                           reader opens this view with: three of the four things
                           on a collapsed row described the file rather than its
                           state, and the reading that answers "is this current"
                           was competing with them for a phone's width.
                           They are one tap away, on the panel that exists to
                           hold what a row is rather than how it is doing. -->
                      <div class="flex items-baseline gap-2 flex-wrap">
                        <i class="ph text-lg text-base-content/50 self-center" :class="r.icon"></i>
                        <span class="font-semibold" x-text="r.label"></span>
                      </div>
                    </div>
                    <!-- The control sits with the row it acts on, which is the
                         whole move: one button, next to the age that says
                         whether to press it. -->
                    <!-- THE CONTROL COLUMN. Refresh acts on the crawl, Expand
                         acts on the file, and both act on this row, so they
                         stack in one place rather than putting Refresh here and
                         leaving Expand orphaned at the end of the chip line. -->
                    <!-- A GROUPED row has no button of its own: its press is on
                         the group header, because the rows under it are one
                         gesture. The row keeps its own progress bar and its own
                         wire line below, so a shared press still reads per file. -->
                    <template x-if="!r.group">
                      <button @click="run(r)" :disabled="!authed() || busy(r)"
                              class="btn btn-sm gap-1.5 shrink-0 min-w-[7rem] disabled:opacity-40 disabled:border-base-300"
                              ${REFRESH_BTN('busy(r)')}
                              :title="refreshWhy(r)">
                        <i class="ph ph-arrows-clockwise text-base" :class="busy(r) && 'animate-spin'"></i>
                        <span x-text="busy(r) ? 'Running…' : 'Refresh'"></span>
                      </button>
                    </template>
                  </div>

                  <!-- CHECKED LEADS, and it is the only reading at full
                       weight. It is the question people open this view with,
                       and it was the fourth of four things on this line. The
                       update age follows in the same breath, because the pair
                       is what neither half says alone: a crawl that ran and
                       found nothing does not commit, so "checked just now,
                       updated 3d ago" reads as current where a lone age reads
                       as neglect. The word is "updated" rather than "built":
                       these files are written only when something in them
                       actually moved, which is what a reader wants the date to
                       mean. -->
                  <div class="flex items-center gap-x-2 gap-y-1 flex-wrap text-base">
                    <!-- THE ONE MOMENT THERE IS SOMETHING LIVE TO SAY. The row
                         used to go from "1d ago" straight to "22m ago" with
                         nothing in between, so the seconds when the answer was
                         actually being fetched were the seconds the row was
                         quietest. The clause it replaces is the right place for
                         it: this is the same reading, in its other state. -->
                    <template x-if="checking(r)">
                      <span class="flex items-center gap-2 text-base-content/70">
                        <i class="ph ph-arrows-clockwise text-base-content/40 animate-spin"></i>
                        <span class="font-medium">checking…</span>
                      </span>
                    </template>
                    <template x-if="!checking(r)">
                      <span class="flex items-center gap-2">
                        <i class="ph ph-eye text-base-content/40"></i>
                        <span class="text-base-content/40">checked</span>
                        <span class="text-base-content/70 font-medium"
                              :title="'This browser\\'s stamp (' + r.checkedKey + ')'"
                              x-text="r.checkedAgo || 'not yet'"></span>
                      </span>
                    </template>
                    <span class="text-base-content/30">·</span>
                    <!-- LAST CHANGE vs UPDATED, and the two words are not
                         interchangeable. "last change" is when the SOURCE last
                         moved: the newest commit across the estate, the newest
                         session started. "updated" is when this cache file was
                         last committed, which is a fact about the crawl. A row
                         with a real event stream says the first; a row without
                         one says the second and does not pretend otherwise.
                         Substituting the cache-write time under the word
                         "change" would be the exact misreading this pass
                         exists to remove. -->
                    <span class="text-base-content/40"
                          x-text="r.stream ? 'last change' : 'updated'"></span>
                    <span class="text-base-content/70" :title="changeTitle(r)"
                          x-text="changeAgo(r)"></span>
                  </div>

                  ${TICKS('r')}
                  ${PEEK('r')}

                  <!-- Directly under the ages, which is the line it supersedes
                       while the crawl runs: the ages say whether to press, the bar
                       says how far the press has got. -->
                  ${PROGRESS('r')}

                  <!-- WHO USES IT, as chips that go there. The prose this
                       replaced could not be tapped, could not be checked, and
                       said more than anyone reads on a phone. What it said beyond
                       the view names is in docs/show-repo.md. The two file
                       controls ride the same line, right-aligned: read it here,
                       or leave for GitHub. -->
                  <!-- The row's last line is now the controls alone. The
                       consumer chips moved into the panel with the path and
                       the grain: a
                       consumer list is a fact about what the cache FEEDS, which
                       nobody is reading while scanning four rows for the one
                       that is behind. -->
                  <div class="flex items-start gap-2">
                    <div class="grow"></div>
                    ${FILE_CONTROLS('r')}
                  </div>

                  ${PANEL('r')}
                </div>
`;

    // The group's own line: name, what it is in one phrase, and the press.
    // It carries no ages, deliberately. Two files have two `built` dates and
    // two `checked` stamps, and a heading that averaged them or picked one
    // would be the first authored claim in a view built entirely from read
    // facts. The ages stay on the rows that own them.
    const GROUP_HEAD = `
      <template x-if="g.group">
        <div class="flex items-center gap-2 px-1 pt-0.5">
          <i class="ph text-lg text-base-content/50" :class="g.group.icon"></i>
          <span class="font-semibold" x-text="g.group.label"></span>
          <!-- The note, and now nothing takes turns with it. A live probe
               reading used to displace it here; the rows below carry the two
               ages that replaced that reading, and each is per file, which the
               heading never could be. Wide screens only: the note is a
               first-sight convenience, and at 390px it competes with a button
               that does the actual work. -->
          <span class="text-sm text-base-content/30 hidden sm:inline" x-text="g.group.note"></span>
          <div class="grow"></div>
          <button @click="runGroup(g)" :disabled="!authed() || groupBusy(g)"
                  class="btn btn-sm gap-1.5 shrink-0 min-w-[7rem] disabled:opacity-40 disabled:border-base-300"
                  ${REFRESH_BTN('groupBusy(g)')}
                  :title="groupWhy(g)">
            <i class="ph ph-arrows-clockwise text-base" :class="groupBusy(g) && 'animate-spin'"></i>
            <span x-text="groupBusy(g) ? 'Running…' : 'Refresh'"></span>
          </button>
        </div>
      </template>`;

    return {
      description: 'State view: the estate’s derived state in one list: the four caches in the private registry (configs, branches, sessions, entities) with when each was last built and last checked, plus the two local caches (search, the page itself). Each row carries its store, its builder, what it costs, and two ages: when this browser last checked it, and when it last actually changed. Nothing advertises a schedule, because there is none: arriving here runs all three crawls, and each gates itself per unit of work on whether its source moved. Branches and Sessions sit in one Activity group under a single Refresh, since one session ending moves both; repo configs keeps its own button, and the entity index says plainly that it has none.',

      rows: [],
      // key -> { ticks: [percent], n, newest, partial } : the 24h source strip
      pulse: {},
      _events: {},       // key -> the events themselves, so a window change re-derives          // the three registry caches, resolved
      offline: null,     // the entity index row, resolved
      loading: false,
      err: '',            // a read that failed
      note: '',           // a state that is not a failure (signed out)
      now: Date.now(),   // ticked so the ages move without a reload
      wireAt: 0,         // ticked by the traffic event, so the wire line redraws
      item: '',          // the row a link named (?item=), highlighted on arrival
      open: '',          // which row's panel is open; one at a time
      tab: 'contents',   // which reading it shows; sticky across rows
      peekBusy: '',      // which row is fetching
      peekErr: '',
      peekText: '',      // the bytes, verbatim
      peekLines: '',
      peekCopied: false,
      histBusy: '',
      histErr: '',
      histRows: [],      // [{sha, stamp, ago, gap, gapMs}], newest first
      histDiff: {},      // interval index -> {busy, err, line, records[]}
      callsBusy: false,
      callsErr: '',
      callsRun: null,    // the logged last run for the open row

      template: `
        <div class="w-full">
          <!-- NO TITLE HERE. This pane sits directly under a pill that says
               State, so a heading saying it again is the view restating its own
               name, and it cost a fifth of the screen on a phone before the
               first row. It was right while State was a nav stop with nothing
               above it naming the pane; the pill row took that job on
               2026-08-23 and the heading did not notice.
               Its two controls survive, right-aligned on the line the DERIVED
               label already occupies: neither is a title, and neither belongs
               to any one row. -->
          <div x-show="note" class="text-base text-base-content/50 mb-4 flex items-center gap-1.5">
            <i class="ph ph-info shrink-0"></i><span x-text="note"></span>
          </div>
          <div x-show="err" class="alert alert-error py-2 px-3 text-base mb-4" x-text="err"></div>

          <!-- ── The registry's derived caches ────────────────────────────── -->
          <h3 class="text-base font-mono uppercase tracking-widest text-base-content/40 mb-2 flex items-center gap-2">
            <span>Derived</span>
            <span class="font-sans normal-case tracking-normal text-base-content/30" x-text="registryShort() + '/state/'"></span>
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
          </h3>
          <div class="flex flex-col gap-2 mb-8">
            <template x-for="g in rowGroups" :key="g.key">
              <div class="flex flex-col gap-2"
                   :class="g.group && 'rounded-box border border-base-300 bg-base-200/40 p-2'">
                ${GROUP_HEAD}
                <template x-for="r in g.rows" :key="r.key">
                  ${CARD}
                </template>
              </div>
            </template>

            <!-- The row with no button. Same card, so it reads as a peer of the
                 other three rather than a footnote, and says in the open why
                 the control is missing. -->
            <template x-if="offline">
              <div :id="'state-' + offline.key"
                   class="rounded-box border border-dashed bg-base-100 p-3 flex flex-col gap-2 transition-colors duration-500"
                   :class="item === offline.key ? 'border-primary bg-primary/10' : 'border-base-300'">
                <div class="flex items-start gap-2 min-w-0">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-2 flex-wrap">
                      <i class="ph text-lg text-base-content/50 self-center" :class="offline.icon"></i>
                      <!-- Trimmed with the other three: this row is built by
                           hand rather than from CARD, so the same pass has to
                           be made twice or the one row that cannot be refreshed
                           becomes the one row still carrying its file's
                           paperwork on the collapsed card. -->
                      <span class="font-semibold" x-text="offline.label"></span>
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
                  <div class="grow"></div>
                  ${FILE_CONTROLS('offline')}
                </div>

                <template x-if="open === offline.key">
                  <div class="flex items-center gap-x-3 gap-y-1 flex-wrap text-sm border-t border-base-300 pt-2 -mx-3 px-3">
                    <span class="inline-flex items-baseline gap-1.5 min-w-0">
                      <span class="font-mono text-base-content/50" x-text="'state/' + offline.file"></span>
                      ${FILE_LINK('offline')}
                    </span>
                    ${GRAIN('offline')}
                    <span class="text-base-content/30">used by</span>
                    <template x-for="pg in offline.pages" :key="pg.path">
                      <a :href="pageUrl(pg.path)" target="_blank" rel="noopener"
                         class="btn btn-xs btn-ghost gap-1 px-1.5 text-base-content/60 hover:text-primary"
                         :title="pg.path">
                        <i class="ph ph-arrow-square-out text-sm"></i><span x-text="pg.label"></span>
                      </a>
                    </template>
                  </div>
                </template>

                ${PANEL('offline')}
              </div>
            </template>
          </div>

          <!-- ── Read live, stored nowhere ────────────────────────────────── -->
          <h3 class="text-base font-mono uppercase tracking-widest text-base-content/40 mb-2"
              title="Cheap enough to redo on demand, so nothing is committed and nothing throttles">Read live</h3>
          <div id="state-guides"
               class="rounded-box border bg-base-100 p-3 flex flex-col gap-2 mb-8 transition-colors duration-500"
               :class="item === 'guides' ? 'border-primary bg-primary/10' : 'border-base-300'">
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
                 :class="item === 'search' ? 'border-primary bg-primary/10' : 'border-base-300'">
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
                 :class="item === 'page' ? 'border-primary bg-primary/10' : 'border-base-300'">
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
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
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
        try {
          const saved = +localStorage.getItem(this.WINDOW_KEY);
          if (this.WINDOWS.includes(saved)) this.WINDOW_H = saved;
        } catch {}
        this._tick = setInterval(() => { this.now = Date.now(); }, 60_000);
        // A crawl started from a row lands asynchronously; the shell announces
        // each one, and re-reading the ages is one cheap call per file.
        // A finished crawl re-reads the ages, and the Calls tab too when it is
        // the open one: its whole subject is the run that just ended, so holding
        // the previous read there would show the wrong run at the one moment the
        // right one exists.
        this._done = () => {
          this.load();
          const r = this.rows.find(x => x.key === this.open);
          if (r && this.tab === 'calls') { this.callsRun = null; this.callsErr = ''; this.loadCalls(r); }
        };
        for (const ev of ['configs-refreshed', 'activity-refreshed', 'sessions-refreshed'])
          document.addEventListener('web-tools:' + ev, this._done);
        // A deep link mounts this view during boot, before auth resolves, so the
        // first read finds no token. Without this the view would hold its
        // signed-out state for the life of the page.
        // A crawl this view's own arrival kicked (goState in the shell) lands
        // here. The `*-refreshed` events above are the manual buttons' and fire
        // nowhere near this path, which is how the arrival crawls came to run
        // correctly and change nothing on screen.
        //
        // The cheap pass costs no network: `checked` is a localStorage stamp
        // per row. The settled pass re-reads everything once, because a crawl
        // that committed moved `updated` too, and that is a commit read a file.
        this._checked = (e) => {
          // load() re-reads the ages and calls loadPulse itself, so a settled
          // pass picks up whatever the crawl just committed.
          if (e.detail?.settled) { this.load(); return; }
          this.rows = this.rows.map(r => ({ ...r, checkedAgo: this.checkedAgo(r.checkedKey) }));
        };
        document.addEventListener('web-tools:cache-checked', this._checked);
        this._auth = (e) => { if (e.detail === 'auth') this.load(); };
        document.addEventListener('web-tools:auth-state', this._auth);
        // The wire tail. `traffic` is already coalesced to one event per 250ms
        // in gh-boot, which is what makes a live per-request readout affordable
        // on a crawl that fires hundreds; this only has to nudge Alpine, since
        // the getters read the ledger directly.
        this._wire = () => { this.wireAt = Date.now(); };
        window.addEventListener('traffic', this._wire);
      },
      destroy() {
        clearInterval(this._tick);
        for (const ev of ['configs-refreshed', 'activity-refreshed', 'sessions-refreshed'])
          document.removeEventListener('web-tools:' + ev, this._done);
        document.removeEventListener('web-tools:cache-checked', this._checked);
        document.removeEventListener('web-tools:state-item', this._aim);
        document.removeEventListener('web-tools:auth-state', this._auth);
        window.removeEventListener('traffic', this._wire);
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

      // ── Opening a row ───────────────────────────────────────────────────
      // One row open at a time: these files run 68 KB to 818 KB, so mounting
      // four is a cost with no reader. The tab persists, so a reader working
      // through the histories keeps getting histories; only the row changes.
      async toggleOpen(r) {
        if (this.open === r.key) { this.open = ''; return; }
        if (!this.authed()) return;
        this.open = r.key;
        this.peekErr = ''; this.peekText = ''; this.peekCopied = false;
        this.histErr = ''; this.histRows = []; this.histDiff = {};
        this.callsErr = ''; this.callsRun = null;
        await this.load1(r);
      },
      // Switch reading. Each tab loads on its first showing for this row and
      // then holds, so flipping back and forth costs nothing.
      async showTab(r, t) {
        if (this.tab === t) return;
        this.tab = t;
        await this.load1(r);
      },
      // Whichever reading the open tab needs, if it is not already in hand.
      async load1(r) {
        if (this.tab === 'contents') { if (!this.peekText && !this.peekErr) await this.loadContents(r); }
        else if (this.tab === 'calls') { if (!this.callsRun && !this.callsErr) await this.loadCalls(r); }
        else if (!this.histRows.length && !this.histErr) await this.loadHistory(r);
      },
      busyRow(r) { return this.peekBusy === r.key || this.histBusy === r.key || (this.callsBusy && this.open === r.key); },

      // THE BYTES, as committed. Not cached, since the tab's whole promise is
      // that what you are looking at is what is committed right now.
      async loadContents(r) {
        this.peekErr = ''; this.peekText = '';
        this.peekBusy = r.key;
        try {
          const reg = new window.GH({ token: window.TOKEN, repo: REGISTRY(), ref: 'main' });
          const text = (await reg.get('state/' + r.file)).text;
          if (this.open !== r.key) return;   // closed while it was in flight
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
      async loadHistory(r) {
        this.histErr = ''; this.histRows = []; this.histDiff = {};
        this.histBusy = r.key;
        try {
          const reg = new window.GH({ token: window.TOKEN, repo: REGISTRY(), ref: 'main' });
          const commits = await reg.history('state/' + r.file, HIST_DEPTH);
          if (this.open !== r.key) return;          // closed while it was in flight
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
              if (this.open !== r.key) return;
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
      // fortnight nobody opened the page) or one cold scan otherwise sets the
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
        // Naming the file answers the question the bare word raised: this reads
        // the two COMMITTED VERSIONS of the cache itself, at the two commits the
        // row names, and diffs their records. Nothing here reads a log.
        this.histDiff = { ...this.histDiff, [i]: { busy: true, line: 'reading ' + r.file + ' at both commits…' } };
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
            // "6 of 11 repos" left the reader to supply the verb, and the two
            // candidates (updated, of the eleven) are not the same claim. The
            // chips below split added from removed from moved; the line says
            // the superset, which is what a count of changed records is.
            line: !total ? 'no ' + noun + ' to count'
                : records.length ? records.length + ' of ' + total + ' ' + noun + ' changed · ' + pct + '%'
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
      // The peek address for that same file: `owner/repo@ref:path`, the one
      // shape source-peek parses. Same ref the link points at, or the card and
      // the jump would show different bytes.
      peekAddr(f) { return REGISTRY() + '@main:state/' + f; },
      hubGh(p) { return 'https://github.com/' + HUB + '/blob/main/' + p; },
      // ── The 24-hour source strip ────────────────────────────────────────
      // WHY THIS READS TWO CACHE FILES, when the rest of this view deliberately
      // reads none. The header above says a `generatedAt` is not worth 1.5 MB
      // of JSON, and that still holds: it was refusing to buy FOUR TIMESTAMPS
      // at that price. This buys the event history itself, which is the only
      // truthful source of what the estate did, and it is the same read the
      // Activity and Sessions panes each already make on arrival (estate.js,
      // loadActivity and loadSessions). So the cost is one the app already pays
      // wherever these facts are shown, and it adds no artifact, no second
      // commit and no new writer to keep honest.
      //
      // Deliberately NOT taken from the crawl's own result. A gated pass skips
      // before reading its cache (that is the point of the gate), so a quiet
      // visit would hand back no document at all and the strip would vanish on
      // exactly the visits where nothing changed. The strip has to be readable
      // from the committed file, independent of whether a crawl ran.
      // ── The window, and the one control on the rail ──────────────────────
      // Two spans, because two questions get asked of this rail: "what happened
      // while I was away this morning" and "has this been quiet all week". A
      // free-form range would need a picker, and a picker is more chrome than
      // the whole rail.
      //
      // THE LABEL IS THE CONTROL. It already had to be there to state the span,
      // and a rail that says 24h is exactly the thing you tap to ask for 7d, so
      // giving it the tap costs no width and no second affordance. That matters
      // most on a phone, where the row has none to spare. It cycles rather than
      // opening a menu for the same reason: with two values a menu is a worse
      // way to express a toggle.
      WINDOWS: [24, 168],
      WINDOW_KEY: 'wt:statePulseWindow',
      WINDOW_H: 24,
      // Hours to the shortest true label, and 24 stays "24h" rather than
      // becoming "1d". 168 is "7d" to a reader and 168h to nobody, so a rail
      // that says 168h has stated its span without communicating it; but a day
      // is the unit people actually say for this window, and "1d" reads as a
      // rounding of something rather than as the span itself.
      get windowLabel() {
        const h = this.WINDOW_H;
        return h >= 48 && h % 24 === 0 ? (h / 24) + 'd' : h + 'h';
      },
      cycleWindow() {
        const i = this.WINDOWS.indexOf(this.WINDOW_H);
        this.WINDOW_H = this.WINDOWS[(i + 1) % this.WINDOWS.length];
        try { localStorage.setItem(this.WINDOW_KEY, String(this.WINDOW_H)); } catch {}
        this.peek = null;
        // Re-derive from events already in hand: the window is a reading of the
        // same data, so changing it must not re-read two caches.
        this.restrip();
        this.rows = this.rows.map(r => ({ ...r, window: this.windowLabel }));
      },
      restrip() {
        const since = Date.now() - this.WINDOW_H * 3600 * 1000;
        const next = {};
        for (const [key, events] of Object.entries(this._events || {})) {
          const capped = events.length ? Math.min(...events.map(e => e.t)) : null;
          next[key] = this.strip(events, since, capped);
        }
        this.pulse = next;
      },

      // ── The tick under the pointer ───────────────────────────────────────
      // ONE OVERLAY, NEAREST EVENT, rather than a hit target per tick. A tick is
      // 1px wide, which is not a target on any device and is unreachable on a
      // touch screen; widening each one would make dense clusters overlap into a
      // pile where the topmost element wins and the mark you aimed at is the one
      // you cannot get. Resolving the nearest event to the pointer's x instead
      // is one element, behaves the same under a mouse and a thumb, and gets
      // better rather than worse as the rail gets busy.
      //
      // Tap to open on a touch screen, hover to open with a pointer, and either
      // way tapping again or moving off closes it. No hover-only affordance:
      // this rail is read on a phone more than anywhere else.
      peek: null,       // { key, left, name, detail, when, ago }
      peekAt(r, ev) {
        const p = this.pulse[r.key];
        if (!p?.marks?.length) return;
        const box = ev.currentTarget.getBoundingClientRect();
        if (!box.width) return;
        const x = ((ev.clientX ?? 0) - box.left) / box.width * 100;
        let best = p.marks[0];
        for (const m of p.marks) if (Math.abs(m.left - x) < Math.abs(best.left - x)) best = m;
        this.peek = { key: r.key, left: best.left, name: best.name, detail: best.detail,
                      when: this.stamp(new Date(best.t).toISOString()),
                      ago: this.ago(new Date(best.t).toISOString()) };
      },
      clearPeek() { this.peek = null; },
      async loadPulse() {
        if (!this.authed()) return;
        const reg = new window.GH({ token: window.TOKEN, repo: REGISTRY(), ref: 'main' });
        const since = Date.now() - this.WINDOW_H * 3600 * 1000;
        // Per row, so one unreadable cache costs its own strip and not the
        // other's. Both are unawaited by the caller for the same reason the
        // ages are: a strip is an addition to a row that already reads.
        const read = async (path) => JSON.parse((await reg.get(path)).text);
        const jobs = CACHES.filter(c => c.stream).map(async (c) => {
          try {
            const doc = await read('state/' + c.file);
            const { events, capped } = this.eventsOf(c, doc);
            this._events = { ...this._events, [c.key]: events };
            this.pulse = { ...this.pulse, [c.key]: this.strip(events, since, capped) };
          } catch { /* no strip for a cache this browser cannot read */ }
        });
        await Promise.all(jobs);
      },
      // The events themselves, per source, in the source's own terms.
      // `capped` is the oldest event the underlying list holds: when that is
      // INSIDE the window, the quiet stretch to its left is unknown rather than
      // empty, because the list ran out rather than the estate going quiet.
      eventsOf(c, doc) {
        if (c.key === 'activity') {
          // Every repo's stored commits, which is what the estate actually did.
          // Uncapped here: recentStream's own default cap is a display limit
          // for a list, and this is a count over a window.
          const all = window.RepoActivityCache?.recentStream?.(doc, Infinity) || [];
          const events = all.map(x => ({ t: Date.parse(x.date), name: this.shortKey(x.repo || ''),
                                         detail: String(x.sha || '').slice(0, 7) }))
                            .filter(e => Number.isFinite(e.t));
          return { events, capped: all.length ? Date.parse(all[all.length - 1].date) : null };
        }
        // A session's event is when it was LAST ACTIVE, which is `ended`, not
        // when it started. Getting this wrong is not a shade of meaning: the
        // recorder is a Stop hook and fires on EVERY TURN, so a live session
        // rewrites its record every few minutes and `ended` walks forward with
        // it while `started` stays pinned to hours ago. Drawing `started` put a
        // single tick at the top of a session and nothing for the hours it was
        // actually working, so a session running right now read as silence.
        //
        // Caught 2026-08-23 by the two rails disagreeing on this very screen:
        // Branches showed commits 17 minutes old, Sessions claimed nothing had
        // happened in two hours, and every one of those commits was made by a
        // session that Sessions was drawing at its start. Two rails over one
        // estate cannot contradict each other and both be right, which is the
        // check that a single rail could never have run on itself.
        //
        // `started` remains the fallback for a record with no end yet, and one
        // tick per record either way: with only a start and a last-active stamp
        // in the cache there is no per-turn history to draw, and a span would
        // encode duration, which is the second variable this rail refuses.
        const rows = doc?.rows || [];
        const events = rows.map(x => ({
          t: Date.parse(x.ended || x.started),
          name: this.shortKey(x.repo || '') || 'session',
          // A session's own extent, which the record already carries. It reads
          // as a fact about the one tick under the pointer rather than as a
          // second variable on the rail: nothing is drawn from it.
          detail: Number.isFinite(x.mins) ? this.humanMs(x.mins * 60000) : '',
        })).filter(e => Number.isFinite(e.t));
        return { events, capped: events.length ? Math.min(...events.map(e => e.t)) : null };
      },
      // Times to tick positions. Kept in the component rather than the template
      // so the template holds no arithmetic and the percentages can be tested.
      strip(events, since, capped) {
        const span = this.WINDOW_H * 3600 * 1000;
        const inWindow = events.filter(e => e.t >= since).sort((a, b) => a.t - b.t);
        const at = (t) => Math.min(100, Math.max(0, (t - since) / span * 100));
        return {
          // Position and identity travel together, so the overlay can name the
          // event nearest a pointer without a second lookup into the cache.
          marks: inWindow.map(e => ({ ...e, left: at(e.t) })),
          ticks: inWindow.map(e => at(e.t)),
          n: inWindow.length,
          newest: events.length ? new Date(Math.max(...events.map(e => e.t))).toISOString() : '',
          // The list ran out inside the window, so the left of the rail is a
          // gap in the record rather than a quiet estate.
          partial: capped != null && capped > since,
        };
      },
      pulseTitle(r) {
        const p = this.pulse[r.key];
        if (!p) return '';
        // The noun says what a tick IS, and for sessions that is a session
        // that was active rather than one that began.
        const commits = r.stream === 'commits';
        const noun = commits ? 'commit' : 'session';
        const verb = commits ? '' : ' active';
        const head = p.n ? p.n + ' ' + noun + (p.n === 1 ? '' : 's') + verb + ' in the last '
                           + this.WINDOW_H + ' hours'
                         : 'No ' + noun + verb + ' in the last ' + this.WINDOW_H + ' hours';
        // Never silent about the cap: a short rail and a quiet estate look the
        // same, and only one of them is a fact.
        return head + (p.partial
          ? '. The stored list runs out inside the window, so the rail left of the '
            + 'first tick is unknown rather than quiet.'
          : '.');
      },
      // The row's change reading: the SOURCE's newest event where there is a
      // stream, the cache's own commit where there is not.
      changeAgo(r) {
        const p = this.pulse[r.key];
        if (r.stream && p?.newest) return this.ago(p.newest);
        if (r.stream && p) return 'none in ' + this.WINDOW_H + 'h';
        return r.builtAgo || 'unknown';
      },
      changeTitle(r) {
        const p = this.pulse[r.key];
        if (r.stream && p?.newest)
          return (r.stream === 'commits'
                   ? 'The newest commit this cache holds'
                   : 'The last moment any session was active')
               + ' (' + p.newest + '), which is when the source last moved.';
        return r.builtAt ? 'When this cache file was last committed (' + r.builtAt + ').'
                         : 'no commit found';
      },

      busy(r) { return !!window.__shell?.[r.busy]; },
      // In flight from the arrival kick rather than from the button. Reading a
      // shell property is what subscribes to it: `window.__shell` is the shell's
      // own Alpine data, so the row re-renders when the flag moves.
      checking(r) { return !!window.__shell?.crawlChecking?.[r.key]; },
      run(r) { window.__shell?.[r.refresh]?.(); },

      // ── Grouping ────────────────────────────────────────────────────────
      // The flat row list folded into what the template draws: a run of
      // grouped rows under one box and one press, an ungrouped row on its own.
      // Order follows CACHES and a group takes the position of its first
      // member, so declaring a group never reorders the list.
      get rowGroups() {
        const out = [], byKey = new Map();
        for (const r of this.rows) {
          const g = r.group ? GROUPS[r.group] : null;
          const key = g ? 'group:' + g.key : r.key;
          let slot = byKey.get(key);
          if (!slot) { slot = { key, group: g, rows: [] }; byKey.set(key, slot); out.push(slot); }
          slot.rows.push(r);
        }
        return out;
      },
      runGroup(g) { window.__shell?.[g.group.refresh]?.(); },
      // Busy while ANY member runs, because the shell runs them in sequence. A
      // button that re-enabled between the two halves would offer a second
      // press mid-gesture, and that press would restart the cheap crawl while
      // the expensive one was still going.
      groupBusy(g) { return g.rows.some(r => this.busy(r)); },
      // Worth pressing if ANY member's source has moved. Or-ing is right here
      // and would not be if the press were per file: one press covers both, so
      // one row with something to fetch is reason enough, and the other row's
      // no-op crawl is the four calls it costs to be sure.
      // Both halves, each with its own cost, since that is exactly what a
      // shared button stops the rows from saying for themselves.
      groupWhy(g) {
        return 'Force both crawls now, past the gate that arriving here already ran. '
             + g.rows.map(r => r.label + ': ' + r.cost).join('. ') + '.';
      },

      // ── Reading the crawl in flight ─────────────────────────────────────
      // The shell's progress channel, this row's slot: {verb, unit, done,
      // total, active}. Null whenever nothing this view started is running,
      // including during the throttled background passes, which publish
      // nothing on purpose.
      prog(r) { return window.__shell?.crawlProgress?.[r.key] || null; },
      // Nothing is estimated between two ticks. Per-item cost varies by an
      // order of magnitude (a repo with 30 scanable branches against one with
      // two), so a smoothed bar would be a guess dressed as a reading.
      // Items finished over items total, and nothing else. It spanned two passes
      // for a day, because the activity refresh ran quick-then-scan and a bar
      // that filled and started over said the run had finished when it had not.
      // One pass now, so the plain reading is the honest one again.
      progPct(r) {
        const p = this.prog(r);
        return p?.total ? Math.round(p.done / p.total * 100) : 0;
      },
      // Before the denominator resolves there is no fraction to state, and the
      // verb alone beats "0 of 0".
      progLabel(r) {
        const p = this.prog(r);
        if (!p) return '';
        return p.verb + (p.total ? ' · ' + p.done + ' of ' + p.total + ' ' + p.unit : '');
      },
      // Everything in flight, short-named, never the newest one alone: the
      // pools run several at once and naming one would misdescribe the crawl.
      // Empty for a crawl that fans out unpooled, where "every repo" is not a
      // reading, and the line simply ends after the count.
      progActive(r) { return (this.prog(r)?.active || []).map(k => this.shortKey(k)).join(', '); },

      // ── The wire ────────────────────────────────────────────────────────
      // gh-boot wraps window.fetch into `window.__traffic`, a capped ring of
      // every request the page makes, and fires a coalesced `traffic` event as
      // they settle. That ledger is already the FAB's Traffic tab; here it is
      // read as a live tail, so the row shows the call in flight beside the
      // count of what this crawl has spent.
      //
      // Newest first, and only GitHub's API: the crawl is what this row is
      // about, and a Phosphor font or a jsDelivr module arriving mid-crawl
      // would be a true row and a misleading one.
      wireEntry() {
        // Reading the tick registers this expression's dependency on it, which
        // is the whole subscription: `window.__traffic` is a plain array on the
        // window, invisible to Alpine, so nothing here would redraw without a
        // reactive value in the same read.
        void this.wireAt;
        const t = window.__traffic;
        if (!Array.isArray(t)) return null;
        for (let i = t.length - 1; i >= 0; i--)
          if (String(t[i].url || '').includes('api.github.com')) return t[i];
        return null;
      },
      wireFull(r) { return this.busy(r) ? (this.wireEntry()?.url || '') : ''; },
      // Verbatim past the host. A status is shown only when it is a failure,
      // since 200 on every line is furniture and a 409 is the whole story.
      wireLine(r) {
        if (!this.busy(r)) return '';
        const e = this.wireEntry();
        if (!e) return '';
        const path = String(e.url).replace(/^https?:\/\/api\.github\.com\//, '');
        const bad = e.status >= 400 ? ' ' + e.status : (e.error ? ' failed' : '');
        return e.method + ' ' + path + bad;
      },
      // This crawl's calls, not the page's: the slot stamps the ledger's total
      // when it opens, and the difference is what the crawl has spent since.
      // The ledger trims its rows at 400 and keeps its totals apart from them,
      // so this stays honest on a long run.
      wireCount(r) {
        void this.wireAt;               // same subscription as wireEntry
        const p = this.prog(r);
        const now = window.__trafficTotals?.calls;
        return (p && typeof p.calls0 === 'number' && typeof now === 'number')
          ? Math.max(0, now - p.calls0) : 0;
      },

      // ── The last run's calls ────────────────────────────────────────────
      // One small file for the whole view (`state/calls.json`), a run per cache
      // key, written by the crawl as it closes. Read on the tab's first showing
      // and then held, like the other two readings; a fresh run lands the next
      // time the panel opens, which is the same contract History has.
      async loadCalls(r) {
        this.callsErr = ''; this.callsRun = null;
        this.callsBusy = true;
        try {
          const reg = new window.GH({ token: window.TOKEN, repo: REGISTRY(), ref: 'main' });
          const doc = JSON.parse((await reg.get(CALLS_PATH)).text);
          if (this.open !== r.key) return;          // closed while it was in flight
          this.callsRun = doc?.runs?.[r.key] || null;
        } catch (e) {
          // A 404 is the honest empty case (no crawl has logged a run yet), not
          // a failure, and the tab already has a line for it.
          if (e?.status !== 404) this.callsErr = String(e?.message || e);
        } finally { this.callsBusy = false; }
      },
      // The wire figure, summed over the rows that disclosed one. GitHub sends
      // no content-length on a chunked response, so this is a floor rather than
      // a total, which is why it is a lone figure and not a per-row column.
      callsBytes() {
        const n = (this.callsRun?.rows || []).reduce((a, c) => a + (c.b || 0), 0);
        return n ? this.humanBytes(n) : '';
      },
      // The endpoint SHAPE: the path with the parts that vary between calls
      // taken out, which is what turns a list into a reading. Owner and repo go
      // (the crawl walks the estate, so they vary by construction), shas and
      // numbers go, and a query keeps its keys and drops its values, since
      // `per_page=100` and `per_page=24` are the same call made twice.
      callShape(u) {
        const [path, query] = String(u).split('?');
        const seg = path.split('/').map((x, i, a) =>
          a[0] === 'repos' && (i === 1 || i === 2) ? '…'
          : /^[0-9a-f]{7,40}$/i.test(x) ? '<sha>'
          : /^\d+$/.test(x) ? '<n>' : x);
        const q = query ? '?' + query.split('&').map(kv => kv.split('=')[0]).join('&') : '';
        return seg.join('/') + q;
      },
      callShapes() {
        const by = new Map();
        for (const c of this.callsRun?.rows || []) {
          const k = c.m + ' ' + this.callShape(c.u);
          const g = by.get(k) || { shape: k, n: 0, ms: 0 };
          g.n++; g.ms += c.ms || 0;
          by.set(k, g);
        }
        return [...by.values()].sort((a, b) => b.n - a.n || b.ms - a.ms);
      },

      // ── Reading the ages ────────────────────────────────────────────────
      // One directory listing for the sizes, then one commit read per file for
      // the write time. Failure is per-row: an unreadable commit leaves that
      // row's age blank rather than blanking the view.
      async load() {
        // `window` rides the row so the rail's label and the arithmetic behind
        // it come from one number.
        const build = (c, extra) => ({ ...c, ...extra, window: this.windowLabel });
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
            // Staleness survives for the ENTITY INDEX ALONE, and only because
            // that row is the one thing here nothing refreshes: a rebuild is
            // half an hour of spaCy over seven checkouts, so its age really is
            // the reading, and 30 days is the bar its own repo check uses. The
            // crawled rows claim no staleness at all now, because arriving at
            // this view refreshes them and a row cannot be behind and on screen
            // at once.
            stale: c.refresh ? false
              : dates[i] ? (Date.now() - +new Date(dates[i])) > 30 * 86400 * 1000 : false,
          });
          this.rows = CACHES.map((c, i) => build(c, { ...stamp(c, i), checkedAgo: this.checkedAgo(c.checkedKey) }));
          this.offline = { ...OFFLINE, ...stamp(OFFLINE, all.length - 1) };
          // Second pass, unawaited: the ages are on screen by now, and a strip
          // only ever adds a rail to a row that already reads.
          this.loadPulse();
        } catch (e) {
          this.err = String(e?.message || e);
        } finally { this.loading = false; }
      },

      // The button's own sentence. It no longer argues about staleness, because
      // the row above it was refreshed on arrival and there is no staleness
      // left to argue about. What it says is what pressing does that arriving
      // did not: go past the gate and read every unit of work, moved or not.
      refreshWhy(r) {
        return 'Read every ' + r.grain + ' now, including the ones nothing shows as moved. '
             + 'Costs ' + r.cost + '. Arriving here already ran the gated pass.';
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
