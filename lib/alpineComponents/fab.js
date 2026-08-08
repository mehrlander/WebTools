// Review asks carried to the stage alongside a page's fileset. The stage's
// Diff lens already renders a fixed panel of general asks; these are the ones
// specific to taking a page somewhere else for a second opinion, so they ride
// the link as its &prompts= commentary rather than living in the stage.
const BRIEF_PROMPTS = [
  { label: 'Reinterpret', ask: 'This is a working page plus the modules it loads. Propose a different concept for it: a reinterpretation, not a refactor. What is this page really for, and what would a better answer to that look like?' },
  { label: 'Focus one piece', ask: 'Pick the single weakest part of this page and go deep on just that. Ignore everything else. Say what is wrong and show a concrete alternative.' },
  { label: 'Fresh eyes', ask: 'You have never seen this codebase. Read this page and tell me what confused you, in the order it confused you.' },
  { label: 'Cut it down', ask: 'What could be removed from this page without losing anything a user relies on? Be specific and name the lines.' },
];

document.addEventListener('alpine:init', function() {
  Alpine.data('fab', function() {
    return {
      description: 'Draggable floating button that doubles as a view-mode indicator: its launcher shows the neutral sidebar mark whenever the view sits at the default branch and a warning-tinted disc only when it is rendered off it (a toss, or a ?use= lib pin, at some other ref — a toss at main is main, so it reads neutral); off the default branch the drawer\'s ref bar goes warning-tinted and grows a button (labeled with the default branch, "main") that returns to the live deployed page. Opens a right-side drawer with three tabs, under a one-line READOUT strip carried on all of them (what this page load cost, how many calls browsing has added, what is left of the rate limit) which is also the way the Traffic tab is found. Render (the default) leads with a ref bar naming the ref this view is rendered at, which opens a dropdown of the branches carrying a different version of this page (blob-compare against the default branch); one tap renders there, outside a toss by navigating to toss-render (the one renderer, no bespoke overlay), inside one by re-addressing in place via __tossNavigate. Above it the repo/path block carries two controls: the PATH is a picker (alpineComponents/path-picker, trigger-less, rooted at this repo and ref) so any file in the repo can be chosen and rendered from the drawer, and the github mark is a MENU (this file, its commits, then the repo rows lib/github-links.js gives the sidebar). The ref bar sits under that block rather than above it. The body of the tab is the branch\'s GUIDE, its PR body rendered as markdown, with the links inside re-aimed at what can show them (a blob link to a page becomes a toss of that page, one to markdown or data becomes a data-view read) and lifted into a chip strip deduped by file; arrows step through every PR the branch has had, newest first, since a merge ends a PR but not the branch. With no PR the pane reports the ref\'s standing instead (the commit it is at, the PR that code came from, how long ago), which is where the version chip went. Inspect merges the page scripts (loaded via gh.load(), with per-entry status) and Alpine components (tap to outline in place) into one scroll; in a #gh= toss it scans the subject frame too, listing the tossed page first and badging the rows that belong to the shell; each script row carries what it cost, reading "inlined" for a module the pre-build served from its cache rather than a byte figure that would imply a fetch nobody made. Traffic answers the size question in three bands that do not share a unit: BOOT is what this one page load cost (Resource Timing, weight by role with a bar, then every resource, each marked network / cached / size-not-disclosed), API is what browsing has spent since (the fetch wrapper reading content-length, grouped by endpoint shape since a browser has no honest async caller context, with the rate limit remaining), and a collapsed STORAGE line reports what the origin keeps (Web Storage plus navigator.storage.estimate, which is quota-managed storage only: the HTTP cache is not counted there and shows up as the cached rows under Boot instead), opening itself only where there is mass to look at. A take menu sits under the render tab in every context the drawer appears in, toss included, with five named outputs: a rendering copy (one pasteable HTML string carrying the page plus its own code and read() data inlined, for CodePen or any bare HTML preview), a review brief, a stage link, and the two zips. Inside a toss it aims at the subject rather than the shell. A header hard-refresh button reloads bypassing the browser cache, for Safari on iOS. Plus a collapsible console and a compact version chip. Singleton per viewport: toss-render stamps __fabHosted so a fab booting under it declines to mount (handing the rendered subject up via __tossSubject/__tossFrame for the shell fab to adopt), and a fab booting inside an iframe declines on its own (data-allow-framed opts back in) — the host page offers the bust-out instead',

      template: `
        <div :style="'transform:translate(' + x + 'px,' + y + 'px)'"
             @pointerdown="onDown($event)"
             @pointermove="onMove($event)"
             @pointerup="onUp($event)"
             @pointercancel="onUp($event)"
             class="fixed bottom-6 right-6 group touch-none z-[55]">
          <!-- Launcher. Its icon + color are the always-on mode indicator: the
               neutral sidebar mark whenever the view is at the default branch,
               a warning-tinted disc only when it is rendered off it (a toss or
               a ?use= lib pin at some OTHER ref). A toss at main is main, so it
               reads neutral. The old ?use= corner pill is retired in favor of
               this. -->
          <div tabindex="0" role="button" aria-label="Web-tools panel"
               class="size-14 rounded-2xl border flex items-center justify-center cursor-grab active:cursor-grabbing outline-none transition-all duration-300"
               :class="offRef
                 ? (open ? 'bg-warning/30 border-warning/50' : 'bg-warning/10 border-warning/20 hover:bg-warning/20 hover:border-warning/40')
                 : (open ? 'bg-primary/30 border-primary/50' : 'bg-primary/10 border-primary/20 hover:bg-primary/20 hover:border-primary/40')">
            <i class="text-2xl transition-colors"
               :class="[offRef ? 'ph ph-disc' : 'ph ph-sidebar-simple',
                        offRef ? (open ? 'text-warning' : 'text-warning/70')
                               : (open ? 'text-primary' : 'text-primary/40 group-hover:text-primary/70')]"></i>
          </div>
        </div>

        <!-- Off-canvas drawer inside a viewport-clipping wrapper. When closed
             the panel is translated off-screen to the right; a FIXED off-canvas
             element is not clipped by body overflow, so on mobile it widens the
             layout viewport and the whole page zooms out (renders small). Making
             the panel an ABSOLUTE child of a fixed inset-0 overflow-hidden layer
             clips the off-screen part, so the layout stays at device width. -->
        <div class="fixed inset-0 z-50 overflow-hidden pointer-events-none">
        <div class="absolute inset-y-0 right-0 transition-transform duration-300 ease-out pointer-events-none"
             :class="open ? 'translate-x-0' : 'translate-x-full'"
             style="width: 22rem; max-width: 92vw;">
          <div class="h-full bg-base-100 border-l border-base-300 shadow-2xl flex flex-col pointer-events-auto">
            <header class="px-2 py-1.5 border-b border-base-300 flex items-center justify-between gap-2 shrink-0">
              <div class="flex items-center gap-0.5">
                <!-- The count that used to sit beside Render was removed
                     2026-08-06. It read as a work signal and was not one: it
                     counted branches whose copy of this page is not
                     byte-identical to the default branch's, a comparison with
                     no direction, so a branch cut months ago and never touched
                     counted the same as one carrying real work. On a repo with
                     357 branches it stood at 302, which is a statement about
                     branch debt (tools/branch-survey.sh answers that) wearing
                     the clothes of a notification. Dropping it is also what
                     buys the width for Traffic's label, which used to hide
                     below 400px so the refresh controls would fit. -->
                <button @click="activeTab = 'render'; loadPageBranches()"
                        class="flex items-center gap-1.5 px-2 py-1 rounded text-sm font-semibold transition-colors"
                        :class="activeTab === 'render' ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:bg-base-200'">
                  <i class="ph ph-monitor-play text-base"></i>
                  <span>Render</span>
                </button>
                <button @click="activeTab = 'inspect'; detect()"
                        class="flex items-center gap-1.5 px-2 py-1 rounded text-sm font-semibold transition-colors"
                        :class="activeTab === 'inspect' ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:bg-base-200'">
                  <i class="ph ph-magnifying-glass text-base"></i>
                  <span>Inspect</span>
                </button>
                <button @click="activeTab = 'traffic'; refreshTraffic()"
                        class="flex items-center gap-1.5 px-2 py-1 rounded text-sm font-semibold transition-colors"
                        :class="activeTab === 'traffic' ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:bg-base-200'">
                  <i class="ph ph-arrows-down-up text-base"></i>
                  <span>Traffic</span>
                </button>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button x-show="activeTab === 'inspect'" @click="detect()" class="btn btn-ghost btn-xs btn-square" title="Rescan page" aria-label="Rescan">
                  <i class="ph ph-arrows-clockwise"></i>
                </button>
                <button x-show="activeTab === 'traffic'" @click="refreshTraffic()" class="btn btn-ghost btn-xs btn-square" title="Re-read the meters" aria-label="Re-read">
                  <i class="ph ph-arrows-clockwise"></i>
                </button>
                <button @click="hardRefresh()" class="btn btn-ghost btn-xs btn-square" title="Hard refresh: reload bypassing the browser cache" aria-label="Hard refresh">
                  <i class="ph ph-arrow-clockwise"></i>
                </button>
              </div>
            </header>


            <!-- ?use= asked for, boot block ignored it. Says so plainly: the
                 silent version of this sends you hunting for branch behavior
                 in default-branch code. -->
            <div x-show="ignoredUse" class="shrink-0 flex items-start gap-2 px-2.5 py-1.5 bg-error/10 border-b border-error/30 text-[13px]">
              <i class="ph ph-warning-octagon text-error shrink-0 mt-0.5"></i>
              <span class="min-w-0">
                <span class="font-semibold">?use=<span class="font-mono" x-text="ignoredUse"></span> ignored.</span>
                This page's boot block pins the ref itself, so you are running
                <span class="font-mono font-semibold" x-text="loaderRef"></span>.
              </span>
            </div>

            <!-- THE READOUT. What this page cost and what it has spent since,
                 on every tab, because a number you have to go looking for is a
                 number nobody looks at. It is also how the Traffic tab is
                 discovered: the strip is the button. Kept to one line and to
                 the three facts in the order they go wrong (load weight, calls
                 made, quota left), with the rest a tap away. -->
            <button x-show="trafficLine" @click="activeTab = 'traffic'; refreshTraffic()"
                    class="shrink-0 w-full flex items-center gap-1.5 px-2.5 py-1 border-b text-left transition-colors"
                    :class="trafficHot ? 'bg-warning/10 border-warning/30 hover:bg-warning/20' : 'bg-base-200/40 border-base-300 hover:bg-base-200'"
                    :title="'This load: ' + trafficLoadTitle">
              <i class="ph ph-arrows-down-up text-[13px] shrink-0"
                 :class="trafficHot ? 'text-warning' : 'text-base-content/40'"></i>
              <span class="font-mono text-[12px] tabular-nums truncate"
                    :class="trafficHot ? 'text-warning' : 'text-base-content/60'"
                    x-text="trafficLine"></span>
            </button>

            <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
              <!-- WHAT you are looking at: the repo, the path, and the ref,
                   in that order. Identity first, then the facet of it that can
                   be switched, which is why the ref bar sits under this block
                   rather than above it: a picker for a thing reads as a picker
                   only once the thing has been named.
                   The version chip that used to close this block is gone. It
                   read "@sha #332 2h ago", and that PR number is the one the
                   CODE came from, sitting two lines above a guide headed by the
                   PR the BRANCH is for: two different numbers, both labelled
                   with a hash, neither saying which question it answered. What
                   it knew is not lost, it moved to where it is the answer: the
                   guide pane shows it when the branch has no PR of its own,
                   which is exactly the case the default branch is always in. -->
              <div x-show="activeTab === 'render'" class="shrink-0">
                <div class="relative p-2" @click.outside="ghMenu = false">
                  <!-- REPO AND PATH ARE ONE CONTROL, and one picker behind it.
                       They were two: a repo link to GitHub above a path that
                       opened a tree rooted in that repo. But the thing being
                       chosen is a FILE SOMEWHERE, and splitting it left the
                       repo half inert and the path half unable to leave the
                       repo it was rooted in. Tapping either line now opens the
                       same tree, whose roots are every repo the token can see
                       with this one first, so crossing repositories is a scroll
                       rather than a different control.
                       The github mark stays beside it, because it answers a
                       different question: not "show me another file" but "show
                       me this one on GitHub", plus the repo surface (its
                       commits above all) that a bare blob link never reached.
                       Its rows come from lib/github-links.js, the same list
                       show-repo\'s sidebar uses. -->
                  <div class="px-1 flex items-start gap-1.5">
                    <!-- .stop is load-bearing: path-picker closes itself on any
                         click outside its own root, and this trigger IS outside
                         it, so without stopping the click the panel opened and
                         shut inside one tap. That is exactly how it shipped and
                         read as a dead control. -->
                    <button @click.stop="togglePicker()"
                            :title="repo ? 'Choose another file to render, from any repo' : 'No source detected'"
                            class="group/id flex min-w-0 flex-1 items-start gap-1.5 text-left">
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-mono text-sm font-bold group-hover/id:text-primary transition-colors"
                              x-text="repo || 'Source unknown'"></span>
                        <span class="block truncate font-mono text-[12px] text-base-content/60"
                              x-text="path || 'no path on this URL'"></span>
                        <!-- A routed subject is a file no browser renders on its
                             own, shown through an app. The file is the subject
                             and reads as the identity above; this one line is
                             what keeps the app from vanishing entirely, since it
                             is what the take actions reach into and what a
                             console message would name. -->
                        <span x-show="subjectVia" class="block truncate text-[11px] text-base-content/40 italic">
                          shown through <span class="font-mono not-italic"
                            x-text="subjectVia && subjectVia.path.split('/').pop()"></span>
                        </span>
                      </span>
                      <i class="ph mt-0.5 shrink-0 text-xs opacity-40"
                         :class="pickerOpen ? 'ph-caret-up' : 'ph-caret-down'"></i>
                    </button>
                    <button x-show="repo" @click="toggleGhMenu()"
                            :title="'GitHub links for ' + repo + ' at ' + viewingRef"
                            aria-label="GitHub links"
                            class="mt-0.5 shrink-0 flex items-center gap-0.5 opacity-40 hover:opacity-90 transition-opacity">
                      <i class="ph ph-github-logo text-base"></i>
                      <i class="ph text-[10px]" :class="ghMenu ? 'ph-caret-up' : 'ph-caret-down'"></i>
                    </button>
                  </div>

                  <!-- The picker mounts as a bare panel (trigger:false) anchored
                       here, so its tree drops under the path row it belongs to.
                       It gets its GH from this fab rather than from Alpine's
                       browser store, which only show-repo has. -->
                  <!-- The x-ref sits on a WRAPPER, not on the picker's own
                       element: x-ref registers against the closest component
                       root, so an element carrying both x-ref and x-data
                       registers the ref with itself and the host never finds
                       it. The event bubbles to the wrapper either way. -->
                  <div class="px-1" x-ref="picker" @path-pick="renderPicked($event.detail)">
                    <div x-data="pathPicker({ trigger: false, dense: true, gh: () => pickerGh(), roots: () => pickerRoots() })"></div>
                  </div>

                  <div x-show="ghMenu" x-cloak
                       class="absolute right-2 top-full z-30 mt-0.5 w-60 max-h-[60vh] overflow-y-auto rounded-box border border-base-300 bg-base-100 shadow-xl py-1">
                    <div class="px-3 pb-1 text-[11px] font-mono uppercase tracking-wider text-base-content/40 truncate"
                         x-text="'at ' + viewingRef"></div>
                    <template x-for="r in ghRows" :key="r.key">
                      <a :href="r.url" target="_blank" rel="noopener" @click="ghMenu = false"
                         class="flex items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-base-200 transition-colors">
                        <i class="ph shrink-0 opacity-60" :class="r.icon"></i>
                        <span class="truncate" x-text="r.label"></span>
                      </a>
                    </template>
                  </div>
                </div>

              <!-- THE REF BAR: which ref this view is rendered at, and the way to
                   another one. It replaces two things that used to be separate and
                   were both worse for it.
                   It replaces the escape BANNER, which was warning-tinted, said
                   "Previewing <ref>", and did nothing when tapped. A bar naming
                   the current selection is exactly the shape of a picker, so not
                   being one read as a dead control; it is one now, and it is
                   present at the default branch too, where the banner was hidden
                   and the question "what am I looking at" went unanswered.
                   It replaces the branch LIST that filled the tab below, whose
                   rows selected a ref and then waited for a ✓ on the row to
                   confirm. Two taps is the shape of a dangerous operation, and
                   this one navigates a preview: the cost of a wrong tap is the
                   back button. One tap goes. What the list was occupying, the
                   whole body of the tab, is now the branch's guide (below).
                   The house button stays beside it, off the default branch only,
                   since at the default branch it offers a trip to where you are. -->
              <div class="relative shrink-0 border-b text-[13px] z-20"
                   :class="offRef ? 'bg-warning/10 border-warning/30' : 'bg-base-200/50 border-base-300'">
                <div class="flex items-center gap-1.5 px-2.5 py-1.5">
                  <button @click="toggleRefMenu()"
                          class="flex items-center gap-1.5 min-w-0 flex-1 text-left rounded transition-colors hover:bg-base-content/5 -mx-1 px-1 py-0.5"
                          :title="offRef ? 'Rendered at ' + viewingRef + ', not ' + (defaultBranch || 'main') + '. Tap to switch.'
                                         : 'Rendered at ' + viewingRef + '. Tap to switch.'">
                    <i class="ph shrink-0" :class="offRef ? 'ph-disc text-warning' : 'ph-house-line opacity-50'"></i>
                    <span class="min-w-0 truncate font-mono font-semibold" x-text="viewingRef"></span>
                    <i class="ph shrink-0 opacity-50 text-xs" :class="refMenu ? 'ph-caret-up' : 'ph-caret-down'"></i>
                    <span x-show="pageBranchesLoading" class="loading loading-dots loading-xs opacity-40 shrink-0"></span>
                  </button>
                  <button x-show="offRef" @click="returnToLive()" class="shrink-0 btn btn-warning btn-xs gap-1"
                          :title="'Return to the live page (the ' + (defaultBranch || 'main') + ' version)'">
                    <i class="ph ph-house-line"></i><span class="font-mono normal-case" x-text="defaultBranch || 'main'"></span>
                  </button>
                </div>

                <!-- The dropdown: the old list, one tap per row, no confirm. Same
                     two-line row (identity and verdict over standing against the
                     default branch), so nothing was lost in the move; only the
                     second tap went.
                     It OVERLAYS rather than pushing. In flow it would shove the
                     guide down by its own height on open and yank it back on
                     close, which reads as the pane having been replaced; a picker
                     should cover what is behind it and give it back untouched. -->
                <div x-show="refMenu" x-cloak
                     class="absolute inset-x-0 top-full max-h-[55vh] overflow-y-auto px-1.5 py-1 flex flex-col gap-0.5
                            bg-base-100 border-b border-base-300 shadow-xl">
                  <div class="flex items-center justify-between px-0.5 pb-1 shrink-0">
                    <div class="text-[12px] uppercase tracking-wider opacity-50 font-semibold flex items-center gap-1">
                      Branches
                      <i x-show="branchNote" class="ph ph-key text-warning/80" :title="branchNote"></i>
                    </div>
                    <button @click="loadPageBranches(true)" class="text-[12px] link link-hover"
                            :class="pageBranchesLoading ? 'opacity-50 pointer-events-none' : ''">refresh</button>
                  </div>
                  <template x-for="b in visibleBranches" :key="b.name">
                    <!-- The name is the whole target: tapping it renders there.
                         The standing row keeps its anchors (PR, session), which is
                         why the two are siblings rather than one button. -->
                    <div class="flex flex-col gap-0.5 px-1.5 py-1 rounded transition-colors"
                         :class="[b.name === viewingRef ? 'bg-warning/15' : 'hover:bg-base-300/50',
                                  (b.status === 'same' || b.status === 'missing') ? 'opacity-50' : '']">
                      <button @click="goToRef(b.name)"
                              :disabled="b.name === viewingRef"
                              :title="b.name === viewingRef ? 'This is what you are looking at.'
                                      : (!viaToss && !tossUrl) ? 'Toss renders through toss-render, which serves owner repos only.'
                                      : 'Render this page at ' + b.name"
                              class="flex items-center gap-1.5 text-[13px] font-mono w-full min-w-0 text-left"
                              :class="b.name === viewingRef ? 'cursor-default' : 'cursor-pointer'">
                        <i class="ph text-sm shrink-0"
                           :class="b.status === 'baseline' ? 'ph-house-line opacity-50' : 'ph-git-branch opacity-50'"></i>
                        <span class="truncate" :class="b.name === viewingRef && 'font-bold'" x-text="b.name"></span>
                        <span x-show="b.name === viewingRef" class="shrink-0 text-[10px] font-sans font-bold uppercase tracking-wide px-1 rounded bg-warning/20 text-warning" title="the ref this view is currently rendered at">current</span>
                        <span class="shrink-0 text-[11px] font-sans font-semibold uppercase tracking-wide ml-auto"
                              :class="b.status === 'differs' ? 'text-primary' : 'text-base-content/40'"
                              x-text="b.status === 'differs' ? 'differs' :
                                      b.status === 'baseline' ? 'baseline' :
                                      b.status === 'same' ? 'same' :
                                      b.status === 'missing' ? 'no file' : ''"></span>
                      </button>
                      <div class="flex items-center gap-1.5 text-[12px] pl-[18px] w-full opacity-70">
                        <!-- Divergence against the default branch, fetched
                             only for the rows worth spending a call on. -->
                        <span x-show="b.div" class="shrink-0 font-mono flex items-center gap-1">
                          <span x-show="b.div && b.div.ahead" class="text-success" x-text="'↑' + (b.div && b.div.ahead)" title="commits on this branch not on the default branch"></span>
                          <span x-show="b.div && b.div.behind" class="text-warning" x-text="'↓' + (b.div && b.div.behind)" title="commits on the default branch not on this one"></span>
                          <span x-show="b.div && !b.div.ahead && !b.div.behind" class="opacity-50">even</span>
                          <span x-show="b.div && b.div.merged" class="text-[11px] font-sans uppercase tracking-wide opacity-60" title="every commit here is already on the default branch">merged</span>
                        </span>
                        <span x-show="b.divBusy" class="loading loading-dots loading-xs opacity-40"></span>
                        <!-- The open PR, and the Claude Code session that
                             authored the branch (lifted from the guide PR
                             footer by gh.pulls). Same pair the estate's
                             Open view carries, same brand logomark. -->
                        <a x-show="b.pr" :href="prUrl(b.pr && b.pr.number)" target="_blank"
                           class="shrink-0 font-mono hover:text-primary transition-colors"
                           :title="'Open PR #' + (b.pr && b.pr.number) + (b.pr && b.pr.draft ? ' (draft)' : '')"
                           x-text="'#' + (b.pr && b.pr.number)"></a>
                        <a x-show="b.session" :href="b.session" target="_blank"
                           title="Open the Claude session that authored this branch"
                           class="shrink-0 flex items-center hover:opacity-75 transition-opacity">
                          <svg viewBox="0 0 24 24" class="w-3.5 h-3.5" style="stroke:#d97757" stroke-width="2.2" stroke-linecap="round" fill="none" aria-hidden="true"><path d="M12,12 L12.0,1.6 M12,12 L17.62,3.25 M12,12 L21.46,7.68 M12,12 L22.29,13.48 M12,12 L19.86,18.81 M12,12 L14.93,21.98 M12,12 L9.07,21.98 M12,12 L4.14,18.81 M12,12 L1.71,13.48 M12,12 L2.54,7.68 M12,12 L6.38,3.25"/></svg></a>
                        <span class="truncate opacity-70" x-text="b.subject || ''" :title="b.subject || ''"></span>
                        <span x-show="b.ago" class="ml-auto shrink-0 opacity-60 whitespace-nowrap"
                              x-text="b.ago" :title="b.date"></span>
                      </div>
                    </div>
                  </template>
                  <button x-show="hiddenBranchCount || showAllBranches" @click="expandBranches()"
                          class="text-[12px] opacity-50 hover:opacity-90 py-1 px-1 text-left">
                    <span x-show="!showAllBranches" x-text="'+ ' + hiddenBranchCount + ' more (same or no copy of this page)'"></span>
                    <span x-show="showAllBranches">collapse the unchanged</span>
                  </button>
                  <div x-show="!pageBranches.length && !pageBranchesLoading" class="text-[12px] opacity-50 py-1 px-1">No branches loaded.</div>
                </div>
              </div>
              </div>

              <!-- Inspect: the page's loaded scripts (top) and Alpine components
                   (below), merged into one scroll. Skips the repo/version/links
                   context block the Render tab carries. In a #gh= toss the
                   subject's same-origin frame is scanned too (subjectInspect),
                   with the subject listed first and this shell's rows badged
                   "shell"; when the frame isn't readable (a #gz= payload toss),
                   the caveat line says the lists cover only the shell. -->
              <div x-show="activeTab === 'inspect'" class="min-h-0 flex-1 flex flex-col">
                <div x-show="viaToss && !subjectInspect" class="px-2.5 pt-2 flex items-center gap-1 text-[12px] text-base-content/50 shrink-0">
                  <i class="ph ph-disc shrink-0"></i>
                  <span>These describe the toss-render shell, not the tossed page.</span>
                </div>

                <div class="px-2.5 pt-2 pb-0.5 text-[12px] uppercase tracking-wider text-base-content/50 font-semibold shrink-0">Scripts</div>
                <div x-show="inspectScripts.length === 0" class="text-sm text-base-content/50 italic px-3 py-3 text-center shrink-0">
                  No scripts tracked. gh-boot.js installs the registry; older cached gh-api.js won't populate it.
                </div>
                <div x-show="inspectScripts.length > 0" class="min-h-0 flex-1 overflow-y-auto p-2 pt-1 space-y-1">
                  <template x-for="(s, idx) in inspectScripts" :key="idx">
                    <div class="rounded bg-base-200/40 border border-base-300/60 overflow-hidden">
                      <div class="flex items-center gap-2 px-2 py-1.5">
                        <i class="ph shrink-0 text-base"
                           :class="s.status === 'ok' ? 'ph-check-circle text-success' :
                                   s.status === 'error' ? 'ph-x-circle text-error' :
                                   'ph-circle-notch animate-spin text-warning'"></i>
                        <a :href="scriptUrl(s)" target="_blank" :title="s.path"
                           class="flex-1 min-w-[7rem] font-mono text-[13px] truncate link link-hover" x-text="s.path"></a>
                        <span x-show="s.side === 'shell'" class="text-[11px] font-sans font-semibold uppercase tracking-wide text-base-content/40 shrink-0">shell</span>
                        <!-- "auto" means the requester was gh-boot.js, which is
                             exactly what the by: line then says again. Showing
                             both cost the row the width its PATH needed, and the
                             path is the one column nobody can read the row
                             without: it was truncating to "alpin…". -->
                        <span x-show="s.auto && !(s.by && s.by.size > 0)" class="text-[12px] text-base-content/50 shrink-0">auto</span>
                        <span x-show="s.by && s.by.size > 0" class="text-[12px] text-base-content/60 shrink truncate max-w-[6.5rem]"
                              :title="Array.from(s.by || []).join(', ')">
                          <span class="opacity-50">by:</span> <span x-text="Array.from(s.by || []).join(', ')"></span>
                        </span>
                        <!-- What the row cost, and the word this list could not
                             say before: under the pre-build almost every module
                             is served from an inlined cache and spends no
                             network at all. Reporting those identically to a
                             real fetch is what made a size column on this list
                             wrong; borrowing the byte only where a byte was
                             spent is what makes it right. -->
                        <span x-show="scriptSizeText(s)" class="font-mono text-[12px] shrink-0"
                              :class="scriptInlined(s) ? 'text-base-content/35 italic' : 'text-base-content/60'"
                              :title="scriptSizeTitle(s)" x-text="scriptSizeText(s)"></span>
                        <span class="font-mono text-[12px] text-base-content/40 shrink-0" x-text="fmtElapsed(s)"></span>
                      </div>
                      <div x-show="s.error" class="px-2 pb-1.5 font-mono text-[12px] text-error break-all" x-text="s.error"></div>
                    </div>
                  </template>
                </div>

                <div class="flex items-center justify-between px-2.5 pt-2 pb-0.5 border-t border-base-300/60 shrink-0">
                  <div class="text-[12px] uppercase tracking-wider text-base-content/50 font-semibold">Components</div>
                  <button @click="clearHighlight()" x-show="highlighted" class="text-[12px] font-normal link link-hover">clear</button>
                </div>
                <div x-show="groups.length > 0" class="min-h-0 flex-1 overflow-y-auto p-2 pt-1 space-y-2">
                  <template x-for="g in groups" :key="g.key">
                    <div class="bg-base-200/40 rounded-lg overflow-hidden border border-base-300/60">
                      <div class="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-base-200/80">
                        <div class="flex items-baseline gap-1.5 min-w-0">
                          <span class="font-mono text-base font-semibold truncate" x-text="g.name"></span>
                          <span class="text-[12px] font-mono text-base-content/50 shrink-0">&times;<span x-text="g.instances.length"></span></span>
                          <span x-show="subjectInspect && g.shell" class="text-[11px] font-sans font-semibold uppercase tracking-wide text-base-content/40 shrink-0">shell</span>
                        </div>
                        <div class="flex gap-0.5 shrink-0">
                          <template x-for="link in componentLinks(g)" :key="link.l">
                            <a :href="link.u" target="_blank" :title="link.l"
                               class="size-6 flex items-center justify-center bg-base-100 hover:bg-base-300 rounded">
                              <i class="ph text-sm" :class="link.i"></i>
                            </a>
                          </template>
                        </div>
                      </div>
                      <div x-show="g.description" class="text-[13px] text-base-content/70 px-2.5 py-1 border-t border-base-300/40" x-text="g.description"></div>
                      <div class="flex flex-col">
                        <template x-for="(inst, idx) in g.instances" :key="inst.id">
                          <button @click="highlight(inst.id)"
                                  class="text-left px-2.5 py-1.5 text-sm flex items-center gap-2 border-t border-base-300/40 transition-colors"
                                  :class="highlighted === inst.id ? 'bg-primary/15 text-primary' : 'hover:bg-base-300/40'">
                            <i class="ph shrink-0" :class="highlighted === inst.id ? 'ph-crosshair-simple text-sm' : 'ph-crosshair text-sm opacity-50'"></i>
                            <span class="font-mono opacity-60 shrink-0" x-text="'#' + (idx + 1)"></span>
                            <span class="truncate" x-text="inst.label"></span>
                          </button>
                        </template>
                      </div>
                    </div>
                  </template>
                </div>
                <div x-show="groups.length === 0" class="text-sm text-base-content/50 italic px-3 py-3 text-center shrink-0">
                  No Alpine components detected on this page.
                </div>
              </div>

              <!-- TRAFFIC. Three bands, three different questions that all get
                   called "size", kept apart because they do not share a unit:
                   BOOT is what one page load cost (fixed, cacheable, Resource
                   Timing), API is what browsing has spent since (grows, and a
                   rate limit bounds it), STORAGE is what the origin keeps (not
                   traffic at all, so it rides as one line rather than a band).
                   The arithmetic and every honesty rule live in lib/traffic.js;
                   this is only its rendering. -->
              <div x-show="activeTab === 'traffic'" class="min-h-0 flex-1 overflow-y-auto">
                <div x-show="trafficError" class="text-sm text-base-content/50 italic px-3 py-6 text-center" x-text="trafficError"></div>

                <!-- WHOSE traffic, in a toss. Inspect has carried this caveat
                     since it learned to scan the subject frame, and a tab whose
                     selling point is honest numbers cannot carry less: the
                     shell's weight is not the tossed page's, and reporting one
                     as the other is the exact failure the undisclosed/cached
                     split exists to prevent. Where the subject frame is
                     readable the bands describe the SUBJECT and the shell's
                     cost is named beside it; where it is not (#gz= renders
                     under an opaque origin), the numbers stay the shell's and
                     say so. -->
                <div x-show="viaToss" class="px-2.5 pt-2 flex items-start gap-1.5 text-[12px] text-base-content/50">
                  <i class="ph ph-disc shrink-0 mt-0.5"></i>
                  <span x-show="trafSubject" class="min-w-0">
                    The tossed page, measured inside its frame. The toss-render shell
                    around it cost <span class="font-mono" x-text="fmtB(trafShellWire)"></span> more.
                  </span>
                  <span x-show="!trafSubject" class="min-w-0">
                    These describe the toss-render shell, not the tossed page: its frame
                    could not be read from here.
                  </span>
                </div>

                <template x-if="trafBoot">
                  <div>
                    <div class="px-2.5 pt-2 pb-0.5 flex items-baseline justify-between gap-2">
                      <div class="text-[12px] uppercase tracking-wider text-base-content/50 font-semibold">Boot</div>
                      <div class="text-[11px] text-base-content/40">this page load</div>
                    </div>
                    <div class="px-2.5 pb-1.5">
                      <!-- When every row withheld its size, the headline says so
                           rather than totalling to a bold 0 B. Same rule as the
                           group rows, applied one level up: it fires for real
                           whenever a page's resources are all cross-origin
                           without Timing-Allow-Origin, and "0 B wire" there is
                           the most confident wrong number the tab could print. -->
                      <div class="font-mono text-[13px] tabular-nums" x-show="trafBoot.undisclosed === trafBoot.count && trafBoot.count">
                        <span class="font-semibold">No sizes disclosed</span><span class="text-base-content/50">, by any of the origins involved</span>
                        <span class="text-base-content/30"> · </span><span x-text="fmtT(trafBoot.ms)"></span>
                      </div>
                      <div class="font-mono text-[13px] tabular-nums" x-show="!(trafBoot.undisclosed === trafBoot.count && trafBoot.count)">
                        <span class="font-semibold" x-text="fmtB(trafBoot.wire)"></span><span class="text-base-content/50"> wire</span>
                        <span class="text-base-content/30"> · </span><span x-text="fmtB(trafBoot.decoded)"></span><span class="text-base-content/50"> decoded</span>
                        <span class="text-base-content/30"> · </span><span x-text="fmtT(trafBoot.ms)"></span>
                      </div>
                      <!-- The qualifier, never dropped: a total that silently
                           excluded cached and undisclosed rows would read as
                           complete when it is not. -->
                      <div class="text-[11px] text-base-content/50 mt-0.5" x-show="trafBoot.cached || trafBoot.undisclosed">
                        <span x-text="trafBoot.count"></span> resources<span x-show="trafBoot.cached">, <span x-text="trafBoot.cached"></span> from cache</span><span x-show="trafBoot.undisclosed">, <span x-text="trafBoot.undisclosed"></span> not disclosing size</span>
                      </div>
                    </div>

                    <!-- Weight by role. The bar is the answer most of the time:
                         you see which band owns the load without reading a
                         digit. -->
                    <div class="px-2.5 pb-2 space-y-1">
                      <template x-for="g in trafBootGroups" :key="g.group">
                        <div>
                          <!-- A group whose rows all withheld their size reads
                               "not disclosed", never "0 B": the whole band is
                               worthless if an unmeasurable row can pass for a
                               free one. A partial group shows what it knows and
                               says how many rows it could not count. -->
                          <div class="flex items-baseline gap-2 text-[12px]">
                            <span class="flex-1 truncate" x-text="g.label"></span>
                            <span x-show="g.undisclosed && g.undisclosed < g.count"
                                  class="text-[11px] text-base-content/40" x-text="'+' + g.undisclosed + ' n/d'"></span>
                            <span class="font-mono text-[11px] text-base-content/40 tabular-nums" x-text="g.count"></span>
                            <span class="font-mono tabular-nums shrink-0"
                                  :class="g.undisclosed === g.count ? 'text-base-content/40 text-[11px]' : ''"
                                  x-text="g.undisclosed === g.count ? 'not disclosed' : fmtB(g.wire)"></span>
                          </div>
                          <div class="h-1 rounded bg-base-300/60 overflow-hidden mt-0.5">
                            <div class="h-full rounded bg-primary/60" :style="'width:' + trafPct(g.wire) + '%'"></div>
                          </div>
                        </div>
                      </template>
                    </div>

                    <button @click="trafRowsOpen = !trafRowsOpen"
                            class="w-full px-2.5 py-1 flex items-center gap-1.5 text-[12px] text-base-content/50 hover:bg-base-200 transition-colors">
                      <i class="ph text-[13px]" :class="trafRowsOpen ? 'ph-caret-down' : 'ph-caret-right'"></i>
                      <span x-text="(trafRowsOpen ? 'Hide' : 'Show') + ' all ' + trafBoot.count + ' resources'"></span>
                    </button>
                    <div x-show="trafRowsOpen" class="px-2 pb-2 space-y-0.5">
                      <template x-for="(r, i) in trafBoot.rows" :key="i">
                        <div class="flex items-center gap-2 px-1.5 py-1 rounded bg-base-200/40 text-[12px]">
                          <span class="size-1.5 rounded-full shrink-0"
                                :class="r.state === 'network' ? 'bg-primary/70' : r.state === 'cached' ? 'bg-success/60' : 'bg-base-content/20'"
                                :title="r.state"></span>
                          <span class="flex-1 font-mono truncate" :title="r.name" x-text="r.short"></span>
                          <span class="font-mono text-[11px] tabular-nums shrink-0"
                                :class="r.state === 'network' ? '' : 'text-base-content/40'"
                                x-text="r.state === 'network' ? fmtB(r.wire) : (r.state === 'cached' ? 'cached' : 'n/d')"></span>
                        </div>
                      </template>
                    </div>
                  </div>
                </template>

                <div class="px-2.5 pt-2 pb-0.5 flex items-baseline justify-between gap-2 border-t border-base-300/60">
                  <div class="text-[12px] uppercase tracking-wider text-base-content/50 font-semibold">API</div>
                  <div class="text-[11px] text-base-content/40">since this page opened</div>
                </div>
                <!-- One list, two cuts, because they answer different halves of
                     the question and neither is a superset of the other. WHAT
                     was called (endpoint shape) and WHERE it landed (the repo in
                     the URL). The repo cut is what separates an estate crawl,
                     which touches many repos, from browsing, which touches one,
                     and no amount of endpoint grouping can show that. A toggle
                     rather than two lists: the band is already the tallest thing
                     in the drawer. -->
                <div class="px-2.5 pb-1 flex items-center gap-1" x-show="trafTotals && trafTotals.calls">
                  <template x-for="cut in [['endpoint','by endpoint'],['repo','by repo']]" :key="cut[0]">
                    <button @click="trafCut = cut[0]"
                            class="px-1.5 py-0.5 rounded text-[11px] transition-colors"
                            :class="trafCut === cut[0] ? 'bg-primary/10 text-primary font-semibold' : 'text-base-content/50 hover:bg-base-200'"
                            x-text="cut[1]"></button>
                  </template>
                </div>
                <div x-show="!trafTotals || !trafTotals.calls" class="text-[13px] text-base-content/50 italic px-3 py-3 text-center">
                  No calls yet.
                </div>
                <template x-if="trafTotals && trafTotals.calls">
                  <div>
                    <div class="px-2.5 pb-1.5">
                      <div class="font-mono text-[13px] tabular-nums">
                        <span class="font-semibold" x-text="trafTotals.calls"></span><span class="text-base-content/50" x-text="trafTotals.calls === 1 ? ' call' : ' calls'"></span>
                        <span class="text-base-content/30"> · </span><span x-text="fmtB(trafTotals.wire)"></span>
                        <span class="text-base-content/30"> · </span><span x-text="fmtT(trafTotals.ms)"></span><span class="text-base-content/50"> waiting</span>
                      </div>
                      <!-- Writes get their own line, above the caveats rather
                           than among them. A PUT to contents/ is the most
                           consequential thing this library does over a network
                           and it shares an endpoint shape with every file read,
                           so nothing else on this tab would distinguish it. -->
                      <div class="text-[12px] mt-0.5 flex items-center gap-1 text-warning font-semibold" x-show="trafTotals.writes">
                        <i class="ph ph-pencil-simple text-[13px]"></i>
                        <span x-text="trafTotals.writes + (trafTotals.writes === 1 ? ' write' : ' writes')"></span>
                        <span class="font-normal text-base-content/50">to the repository</span>
                      </div>
                      <div class="text-[11px] text-base-content/50 mt-0.5" x-show="trafTotals.unknown || trafTotals.errors || trafTrimmed">
                        <span x-show="trafTotals.unknown"><span x-text="trafTotals.unknown"></span> without a declared length</span><span x-show="trafTotals.unknown && trafTotals.errors">, </span><span x-show="trafTotals.errors" class="text-error"><span x-text="trafTotals.errors"></span> failed</span><span x-show="trafTrimmed">, <span x-text="trafTrimmed"></span> older calls dropped from the list</span>
                      </div>
                      <!-- The exact figure here, not the strip's rounded one:
                           the strip is a glance, this is where you come when
                           the glance worried you. -->
                      <div class="text-[11px] mt-0.5" x-show="trafRate !== null"
                           :class="trafRate !== null && trafRate < 500 ? 'text-warning font-semibold' : 'text-base-content/50'">
                        <span class="font-mono tabular-nums" x-text="trafRateExact"></span> of the hourly rate limit left<span x-show="trafReset" x-text="', resets in ' + trafReset"></span>
                      </div>
                    </div>
                    <!-- Grouped by endpoint shape, which says WHAT KIND of call
                         was made and deliberately does not claim who made it:
                         the endpoints are shared (contents/ by every load and
                         read, by gh-store's writes, and by the config crawl;
                         commits by the crawl, recentFiles and the sidebar), so
                         a count here does not name a subsystem. The write badge
                         is the axis that does separate something, and it
                         separates the consequential thing. Full account, and
                         what caller attribution would cost, in lib/traffic.js. -->
                    <div class="px-2 pb-2 space-y-0.5" x-show="trafCut === 'repo'">
                      <template x-for="g in trafRepos" :key="g.repo">
                        <div class="flex items-center gap-2 px-1.5 py-1 rounded bg-base-200/40 text-[12px]">
                          <span class="flex-1 truncate font-mono" :class="g.named ? '' : 'text-base-content/40 font-sans italic'" x-text="g.repo"></span>
                          <span x-show="g.writes" class="text-warning text-[11px] font-semibold" x-text="g.writes + 'w'"></span>
                          <span x-show="g.errors" class="text-error text-[11px] font-semibold" x-text="g.errors + ' err'"></span>
                          <span class="font-mono text-[11px] text-base-content/50 tabular-nums shrink-0" x-text="g.calls + '×'"></span>
                          <span class="font-mono tabular-nums shrink-0 w-14 text-right"
                                :class="g.unknown === g.calls ? 'text-base-content/40 text-[11px]' : ''"
                                x-text="g.unknown === g.calls ? 'no length' : fmtB(g.wire)"></span>
                        </div>
                      </template>
                    </div>
                    <div class="px-2 pb-2 space-y-0.5" x-show="trafCut === 'endpoint'">
                      <template x-for="g in trafGroups" :key="g.group">
                        <div class="flex items-center gap-2 px-1.5 py-1 rounded bg-base-200/40 text-[12px]">
                          <span class="flex-1 truncate" x-text="g.label"></span>
                          <span x-show="g.writes" class="text-warning text-[11px] font-semibold" x-text="g.writes + 'w'"
                                :title="g.writes + ' of these changed something'"></span>
                          <span x-show="g.errors" class="text-error text-[11px] font-semibold" x-text="g.errors + ' err'"></span>
                          <span class="font-mono text-[11px] text-base-content/50 tabular-nums shrink-0" x-text="g.calls + '×'"></span>
                          <span class="font-mono tabular-nums shrink-0 w-14 text-right"
                                :class="g.unknown === g.calls ? 'text-base-content/40 text-[11px]' : ''"
                                x-text="g.unknown === g.calls ? 'no length' : fmtB(g.wire)"></span>
                        </div>
                      </template>
                    </div>
                  </div>
                </template>

                <!-- STORAGE, and the name is the platform's rather than one of
                     ours: the Storage Standard's word, DevTools' word (Application
                     → Storage), and exactly what is being measured (Web Storage
                     plus whatever navigator.storage.estimate reports, which is
                     quota-managed: IndexedDB, Cache API, and nothing else).
                     "Quota" was the other candidate and was rejected because the
                     API band one line up already says "of the hourly rate limit
                     left"; two quotas on one screen is worse than a plain word.
                     It carried a coined heading, Resident, borrowed from OS
                     memory management, and that word spanned two things the
                     platform keeps apart. Under it sat the sentence "what a
                     reload would not have to fetch again", which describes the
                     HTTP CACHE. estimate() cannot see the HTTP cache: measured
                     2026-08-05, 300 KB of cached response moved it 0 to 0, while
                     an IndexedDB write moved it at once. The question that
                     sentence asked is answered one band up, by Boot's cached
                     rows, where it belongs.
                     One line by default, because on show-repo the honest answer
                     is a few hundred bytes and a heading over that is a promise
                     the band cannot keep. It opens itself where there is mass,
                     which is the handful of pages holding blobs in IndexedDB
                     (pdf-inspect, compression-helper, the data shelf). -->
                <div class="border-t border-base-300/60">
                  <button @click="trafStoreOpen = !trafStoreOpen"
                          class="w-full px-2.5 py-1.5 flex items-center gap-1.5 text-[12px] hover:bg-base-200 transition-colors text-left">
                    <i class="ph text-[13px] text-base-content/40" :class="trafStoreOpen ? 'ph-caret-down' : 'ph-caret-right'"></i>
                    <span class="text-base-content/50">storage</span>
                    <span class="flex-1 font-mono tabular-nums text-base-content/70 truncate" x-text="trafStoreLine"></span>
                  </button>
                  <div x-show="trafStoreOpen" class="px-2.5 pb-3 space-y-0.5 text-[12px]">
                    <template x-for="s in trafStores" :key="s.name">
                      <div class="flex items-baseline gap-2">
                        <span class="flex-1 truncate" x-text="s.name"></span>
                        <span class="font-mono text-[11px] text-base-content/50 tabular-nums" x-text="s.keys + (s.keys === 1 ? ' key' : ' keys')"></span>
                        <span class="font-mono tabular-nums shrink-0" x-text="fmtB(s.bytes)"></span>
                      </div>
                    </template>
                    <!-- Named databases beat one origin total: "12 MB somewhere"
                         is not actionable, "pdfInspect 12 MB" is. Not every
                         browser exposes the list, so the total stands alone
                         where it does not. -->
                    <template x-for="db in trafDbs" :key="db">
                      <div class="flex items-baseline gap-2">
                        <span class="flex-1 truncate font-mono" x-text="db"></span>
                        <span class="text-[11px] text-base-content/40">IndexedDB</span>
                      </div>
                    </template>
                    <div class="flex items-baseline gap-2" x-show="trafEstimate">
                      <span class="flex-1 truncate">origin storage, all stores</span>
                      <span class="font-mono tabular-nums shrink-0" x-text="fmtB(trafEstimate)"></span>
                    </div>
                    <div x-show="!trafStores.length && !trafEstimate" class="text-base-content/50 italic">
                      Nothing stored for this origin.
                    </div>
                    <div class="text-[11px] text-base-content/40 pt-1">
                      Read once when the tab opened. Quota-managed storage and Web Storage
                      only: the browser's HTTP cache is not counted here, and shows up as
                      the cached rows under Boot instead.
                    </div>
                  </div>
                </div>
              </div>

              <div x-show="activeTab === 'render'" class="min-h-0 flex-1 flex flex-col">
                <div x-show="!path" class="text-sm text-base-content/50 italic px-3 py-6 text-center">
                  No page path detected on this URL.
                </div>
                <template x-if="path">
                  <div class="p-2 flex flex-col gap-2 min-h-0 flex-1">
                    <!-- THE GUIDE: the branch's own account of itself, which is
                         its guide PR body. The list that used to fill this space
                         answered "what other refs exist", a question worth one
                         bar and a dropdown, not a whole tab. This answers "what
                         is this branch, and what should I look at", which is the
                         question you actually have while standing in a preview.
                         The body is written to be that answer (see
                         docs/SURFACING.md), so the fab is reading a document
                         that already exists rather than inventing a report.
                         The links inside it are re-aimed on the way in: a blob
                         link to a page becomes a toss of that page at this ref,
                         a blob link to markdown or data becomes a data-view
                         read. So the guide stops being a list of addresses to
                         copy and becomes the thing it describes, one tap deep. -->
                    <div class="min-h-0 flex-1 flex flex-col">
                      <div class="flex items-center justify-between mb-1 shrink-0">
                        <div class="text-[12px] uppercase tracking-wider opacity-50 font-semibold flex items-center gap-1">
                          Guide
                          <i x-show="branchNote" class="ph ph-key text-warning/80" :title="branchNote"></i>
                        </div>
                        <!-- The PR walk. A branch outlives its PR here: a merge
                             ends the PR, the next push opens another, and the
                             merged one's body is often the better account of
                             what the branch did. So the arrows step through
                             every PR the branch has had, newest first, and the
                             pair only appears when there is more than one. -->
                        <div class="flex items-center gap-1 shrink-0">
                          <template x-if="guideCount > 1">
                            <div class="flex items-center gap-0.5">
                              <button @click="stepGuide(1)" :disabled="guideIdx >= guideCount - 1"
                                      class="px-0.5 opacity-50 hover:opacity-100 disabled:opacity-20 transition-opacity"
                                      title="Older PR for this branch" aria-label="Older PR">
                                <i class="ph ph-caret-left text-sm"></i>
                              </button>
                              <span class="text-[11px] font-mono opacity-50 tabular-nums"
                                    x-text="(guideIdx + 1) + '/' + guideCount"></span>
                              <button @click="stepGuide(-1)" :disabled="guideIdx <= 0"
                                      class="px-0.5 opacity-50 hover:opacity-100 disabled:opacity-20 transition-opacity"
                                      title="Newer PR for this branch" aria-label="Newer PR">
                                <i class="ph ph-caret-right text-sm"></i>
                              </button>
                            </div>
                          </template>
                          <a x-show="guidePr" :href="prUrl(guidePr && guidePr.number)" target="_blank"
                             class="text-[12px] link link-hover font-mono"
                             x-text="'#' + (guidePr && guidePr.number) +
                                     (guidePr && guidePr.draft ? ' draft' : '') +
                                     (guidePr && guidePr.state === 'merged' ? ' merged' :
                                      guidePr && guidePr.state === 'closed' ? ' closed' : '')"></a>
                        </div>
                      </div>

                      <div x-show="pageBranchesLoading" class="flex justify-center py-3 shrink-0">
                        <span class="loading loading-dots loading-md opacity-50"></span>
                      </div>

                      <div x-show="!pageBranchesLoading" class="min-h-0 flex-1 overflow-y-auto">
                        <template x-if="guidePr">
                          <div class="flex flex-col gap-2">
                            <div class="text-[13px] font-semibold leading-snug" x-text="guidePr.title"></div>

                            <!-- What the body points at, lifted out of it. The
                                 prose still carries every link in place; this
                                 strip is the same set with the prose removed,
                                 for the reader who came to look rather than to
                                 read. Renderable targets only: a chip promising
                                 a render has to deliver one. -->
                            <div x-show="prTargets.length" class="flex flex-wrap gap-1">
                              <template x-for="t in prTargets" :key="t.url">
                                <a :href="t.url" @click.prevent="goTarget(t)" :title="t.title"
                                   class="inline-flex items-center gap-1 max-w-full px-1.5 py-0.5 rounded border border-base-300 bg-base-200/60 hover:border-primary hover:text-primary transition-colors text-[12px] font-mono">
                                  <i class="ph shrink-0 text-sm" :class="t.icon"></i>
                                  <span class="truncate" x-text="t.label"></span>
                                </a>
                              </template>
                            </div>

                            <!-- Styled from kits/guide-render.js at drawer
                                 size, not from a class list here. The rules
                                 that decide whether a body is legible (list
                                 markers, link color, code, pre) are the same
                                 ones the branch page needs, and two copies of
                                 them is how one surface quietly loses its
                                 bullets. The kit carries the reason the
                                 typography plugin is not used.
                                 (No backticks in this comment: the template is
                                 a template literal and one would close it.) -->
                            <div x-show="prBodyHtml" x-html="prBodyHtml"
                                 @click="onGuideClick($event)"
                                 :class="guideBodyClass"></div>
                            <div x-show="!prBodyHtml && guidePr.body" class="text-[12px] opacity-50">Rendering…</div>
                            <div x-show="!guidePr.body" class="text-[12px] opacity-50 italic">This PR has an empty body.</div>
                          </div>
                        </template>

                        <!-- No PR, and still not blank. Two different nothings,
                             and conflating them would misreport: the default
                             branch is not missing a guide, it is the thing
                             guides are written against. Either way the STANDING
                             INFO below is shown, which is where the version chip
                             went: what commit this ref is at, which PR that code
                             came from, and how long ago. On the default branch
                             that is the only version question anyone has, and it
                             is the branch this pane is emptiest for. -->
                        <div x-show="!guidePr" class="flex flex-col gap-2 text-[13px]">
                          <p class="opacity-60 leading-snug">
                            <template x-if="viewingRef === (defaultBranch || 'main')">
                              <span><span class="font-mono" x-text="viewingRef"></span> is the default branch, so it has
                                no guide of its own. Pick a branch above to read its guide and render this page from it.</span>
                            </template>
                            <template x-if="viewingRef !== (defaultBranch || 'main')">
                              <span>No pull request for <span class="font-mono" x-text="viewingRef"></span>, so there is
                                no guide to show. The branch page reads its state from the API instead.</span>
                            </template>
                          </p>

                          <div x-show="ver" class="flex flex-col gap-1 rounded border border-base-300/70 bg-base-200/40 px-2 py-1.5">
                            <div class="flex items-center gap-1.5 text-[12px] font-mono">
                              <i class="ph ph-git-commit opacity-50 shrink-0"></i>
                              <a :href="ver && ver.tipUrl" target="_blank" rel="noopener"
                                 class="link link-hover font-semibold" x-text="'@' + (ver && ver.sha)"></a>
                              <template x-if="ver && ver.pr">
                                <a :href="ver.prUrl" target="_blank" rel="noopener"
                                   class="link link-hover text-primary shrink-0"
                                   :title="ver.prTitle || ('pull request #' + ver.pr)"
                                   x-text="'from #' + ver.pr"></a>
                              </template>
                              <span x-show="ver && ver.ago" class="opacity-40 truncate ml-auto" x-text="ver && ver.ago"></span>
                            </div>
                            <div x-show="ver && ver.since > 0" class="text-[11px] opacity-50 pl-4"
                                 x-text="'+' + (ver && ver.since) + ' commits since that merge'"></div>
                          </div>
                          <div x-show="verLoading" class="text-[12px] opacity-50">checking version…</div>
                          <div x-show="verError" class="text-[12px] text-error/70 break-all" x-text="verError"></div>

                          <div class="flex flex-wrap gap-1">
                            <a x-show="viewingRef !== (defaultBranch || 'main')"
                               :href="branchPageUrl" target="_blank" rel="noopener"
                               class="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-base-300 hover:border-primary hover:text-primary transition-colors text-[12px]">
                              <i class="ph ph-git-branch"></i><span>Branch page</span>
                            </a>
                            <button @click="loadVersion(true)"
                                    class="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-base-300 hover:border-primary hover:text-primary transition-colors text-[12px]">
                              <i class="ph ph-arrows-clockwise"></i><span>Recheck</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div x-show="frameError" class="text-[12px] text-error font-mono break-all shrink-0" x-text="frameError"></div>

                    <!-- The take grid. These were behind a dropdown, which put
                         the page's most-used outputs two taps away and hid them
                         from anyone who did not know to look. They are laid out
                         in the open now, two to a row, still grouped by what the
                         action DOES to you: one copies to the clipboard, one
                         navigates away, two land a file. The group heading is
                         what lets each label stay a bare noun, so it earns its
                         line. Page-contributed actions fold into the same grid
                         rather than keeping a row of their own. -->
                    <!-- pb clears the launcher, which floats over the drawer at
                         bottom-right and is the only way to close it, so it cannot
                         be hidden. It used to overlap the single "Take this page"
                         button harmlessly; over a grid it would cover a real
                         action. Sized for the launcher at its default corner: drag
                         it elsewhere and this is just padding. -->
                    <div class="border-t border-base-300/60 pt-2 pb-10 flex flex-col gap-1.5 shrink-0">
                      <div class="flex items-baseline gap-1.5 px-0.5">
                        <span class="text-[12px] uppercase tracking-wider opacity-40 font-semibold shrink-0">Take</span>
                        <span class="text-[12px] font-mono opacity-70 truncate" :title="takeDetail" x-text="takeSubject"></span>
                        <span x-show="outBusy" class="loading loading-spinner loading-xs ml-auto shrink-0"></span>
                      </div>
                      <!-- A row per destination: the gutter says what happens to
                           you, the buttons say what you get. That is the same
                           division the old headings made, laid sideways so it
                           costs a gutter instead of a line, and it lets each
                           label drop back to a bare noun (HTML, LLM, Link)
                           without going cryptic. -->
                      <template x-for="g in takeGrid" :key="g.kind">
                        <div class="flex items-center gap-1.5">
                          <span class="w-10 shrink-0 text-[10px] uppercase tracking-wide opacity-40 font-semibold"
                                x-text="g.kind"></span>
                          <div class="flex-1 min-w-0 flex gap-1">
                            <template x-for="a in g.items" :key="a.key">
                              <!-- The header above states the subject once,
                                   which is what lets a label stay a bare noun.
                                   In a toss that leaves one ambiguity: the
                                   drawer carries the subject's contributed
                                   actions AND this renderer's, and both may say
                                   "Link". The subject's are congruent with the
                                   stated subject and need no mark; the
                                   renderer's are the odd ones out, so they get
                                   the mark. A word ("shell") was tried and is
                                   too wide: a Copy row with four buttons in a
                                   fixed-width drawer truncated "Link" to "L" to
                                   make room for it. The stacked-windows glyph is
                                   the surrounding renderer, costs one icon, and
                                   only ever appears in a toss, where a second
                                   same-named row is there to compare it against.
                                   The desc says it in full for anything with a
                                   pointer. -->
                              <button @click="runGridItem(a)" :title="a.desc"
                                      :class="outBusy && 'pointer-events-none opacity-60'"
                                      class="btn btn-xs btn-ghost bg-base-200 hover:bg-base-300 flex-1 min-w-0 gap-1 font-normal px-1.5">
                                <i class="ph shrink-0 text-sm opacity-60" :class="a.icon"></i>
                                <span class="truncate" x-text="a.label"></span>
                                <i x-show="viaToss && a.side === 'shell'"
                                   class="ph ph-browsers shrink-0 text-xs opacity-40"></i>
                              </button>
                            </template>
                          </div>
                        </div>
                      </template>
                    </div>
                      <div x-show="outMsg" class="text-[12px] text-success font-mono break-all" x-text="outMsg"></div>
                      <div x-show="outError" class="text-[12px] text-error font-mono break-all" x-text="outError"></div>
                    </div>
                  </template>
                </div>
              </div>

            <div class="shrink-0 border-t border-base-300 flex flex-col">
              <div @click="toggleConsole()" role="button" tabindex="0"
                   class="flex items-center justify-between gap-2 px-3 py-1.5 cursor-pointer select-none hover:bg-base-200/60 transition-colors">
                <div class="flex items-center gap-1.5 text-sm font-semibold text-base-content/70">
                  <i class="ph ph-terminal text-base"></i>
                  <span>Console</span>
                  <span x-show="errorCount" x-text="errorCount"
                        class="inline-flex items-center justify-center text-[11px] font-bold leading-none rounded-full bg-error text-error-content px-1 min-w-[14px]"></span>
                  <span x-show="consoleLogs.length" class="font-mono text-[12px] opacity-50" x-text="consoleLogs.length"></span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button x-show="consoleOpen && consoleLogs.length" @click.stop="clearConsole()" class="btn btn-ghost btn-xs btn-square" title="Clear console" aria-label="Clear console">
                    <i class="ph ph-trash"></i>
                  </button>
                  <i class="ph text-base-content/40" :class="consoleOpen ? 'ph-caret-down' : 'ph-caret-up'"></i>
                </div>
              </div>
              <div x-show="consoleOpen" class="border-t border-base-300/60 flex flex-col" style="max-height: 40vh;">
                <div x-show="consolePanelReady" class="flex-1 min-h-0 flex flex-col">
                  <div x-ref="consoleHost" class="flex-1 min-h-0 flex flex-col"></div>
                </div>
                <div x-show="!consolePanelReady" id="__fab-console-panel" class="overflow-y-auto p-1 flex flex-col gap-0.5" style="max-height: 40vh;">
                  <div x-show="consoleLogs.length === 0" class="text-sm text-base-content/50 italic px-3 py-6 text-center">No console output captured.</div>
                  <template x-for="(entry, idx) in consoleLogs" :key="idx">
                    <div class="flex gap-1.5 items-baseline px-1.5 py-0.5 rounded border-l-2 font-mono text-[13px] text-base-content"
                         :class="entry.level === 'error' ? 'border-error bg-error/10' :
                                 entry.level === 'warn'  ? 'border-warning bg-warning/10' :
                                                           'border-base-300 bg-base-100'">
                      <span class="text-base-content/30 shrink-0 text-[12px]" x-text="fmtTime(entry.time)"></span>
                      <span class="shrink-0 w-8 text-[12px] uppercase font-bold"
                            :class="entry.level === 'error' ? 'text-error' : entry.level === 'warn' ? 'text-warning' : 'text-base-content/40'"
                            x-text="entry.level"></span>
                      <span class="break-all whitespace-pre-wrap" x-text="entry.msg"></span>
                    </div>
                  </template>
                </div>
              </div>
            </div>
            </div>

          </div>
        </div>`,

      x: 0, y: 0, sx: 0, sy: 0,
      down: false, dragged: false,

      open: false,
      consoleOpen: false,
      consolePanelReady: false,
      activeTab: 'render',
      groups: [],
      consoleLogs: [],
      loadedScripts: [],
      highlighted: null,

      // Traffic. trafBoot/trafGroups are snapshots taken when the tab opens or
      // on the refresh button; the readout strip is the one live figure, driven
      // by the coalesced 'traffic' event so a crawl does not re-render the
      // drawer a hundred times a second.
      trafBoot: null, trafBootGroups: [], trafRowsOpen: false,
      trafGroups: [], trafTotals: null, trafTrimmed: 0,
      trafRate: null, trafReset: '', trafStores: [], trafEstimate: 0,
      trafDbs: [], trafStoreOpen: false,
      // Which cut of the API ledger the list is showing: what was called, or
      // where it landed.
      trafCut: 'endpoint', trafRepos: [],
      trafficError: '', trafLive: { calls: 0, wire: 0 },
      // In a toss: whether the bands describe the tossed subject (its frame was
      // readable) and what the shell around it cost, so the caveat line can say
      // which of the two the numbers belong to.
      trafSubject: false, trafShellWire: 0,
      // path -> { bytes, inlined } from gh-boot's get() wrapper, for the size
      // chip on the Scripts rows. Kept per side, like the registries.
      ghFiles: {}, subjectFiles: {},

      ver: null, verLoading: false, verError: '', verLoaded: false,

      frameRef: 'main',
      pageBranches: [], pageBranchesLoading: false, pageBranchesLoaded: false,
      showAllBranches: false, _branchGh: null,
      defaultBranch: 'main', branchNote: '',
      frameError: '',

      // The ref bar's dropdown, and the guide pane's rendered body. prBodyFor
      // records which PR the rendered html belongs to, so the render runs once
      // per PR rather than on every reactive read.
      refMenu: false, ghMenu: false, ghRowsTick: 0,
      prBodyHtml: '', prBodyFor: null, prTargets: [], prTargetsByAddr: {},
      // Every PR ever opened for the shown branch, and which one the arrows are
      // parked on. _prsFor records the branch the list belongs to, so a ref
      // switch invalidates it without a watcher.
      prHistory: [], _prsFor: '', _prsBusy: false, guideIdx: 0,

      // Toss adoption: when toss-render stamps window.__tossSubject, the fab
      // retargets repo/path/ref at the rendered subject; shell* keeps the
      // hosting page's own identity for the Components/Scripts link targets.
      // hosted: this copy declined to mount (a host shell owns the viewport).
      viaToss: false, hosted: false, subjectRoute: '', subjectVia: null,
      subjectReads: [], subjectReached: false, payloadHtml: '',
      shellRepo: '', shellPath: '', shellRef: 'main',
      // Subject-scoped Inspect: true when the toss subject's frame was
      // readable (same-origin #gh= renders), so Inspect lists the tossed
      // page's components/scripts, not only this shell's. _subjectGh carries
      // the subject window's lib coordinates for its script/component links.
      subjectInspect: false, subjectScripts: [], _subjectGh: null,

      reads: [],
      outBusy: false, outMsg: '', outError: '',
      briefReady: false, briefLoading: false,

      repo: '',
      path: '',
      ref: 'main',
      showRepoBase: 'https://mehrlander.github.io/web-tools/pages/show-repo/show-repo.html',

      init() {
        // Singleton guard: a hosting shell (toss-render, or this fab's own
        // ref overlay) stamps window.__fabHosted into the HTML it renders.
        // A fab booting under that stamp declines to mount, so exactly one
        // fab serves the viewport — the host's, which carries the context.
        if (window.__fabHosted) { this.hosted = true; return; }
        // Framed guard: a page rendered inside an iframe (a show-repo landing
        // / app-view / atlas embed, a gallery live-preview tile) doesn't get
        // its own fab either — the top window's fab owns the viewport, and the
        // host's "bust out" action opens the framed page directly when its
        // full experience is wanted. Cross-origin top access throws; treat
        // that as framed too. Opt back in with data-allow-framed on the mount.
        let framed = false;
        try { framed = window.self !== window.top; } catch (e) { framed = true; }
        if (framed && !('allowFramed' in (this.$root.dataset || {}))) { this.hosted = true; return; }
        // Clean up the one-shot cache-bust token hardRefresh() navigates with,
        // so it neither lingers in the address bar nor rides along when the URL
        // is copied. The fresh fetch already happened; this only rewrites the bar.
        try {
          const u = new URL(location.href);
          if (u.searchParams.has('_fresh')) {
            u.searchParams.delete('_fresh');
            history.replaceState(history.state, '', u.pathname + u.search + u.hash);
          }
        } catch (e) {}
        this.$el.innerHTML = this.template;
        this._elById = new Map();
        this._instanceCounter = 0;
        this._ensureHighlightStyle();
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.infer();
        this.shellRepo = this.repo; this.shellPath = this.path; this.shellRef = this.ref;
        this.frameRef = this.ref || 'main';
        this._restoreDrawer();
        // Adopt the rendered subject when hosted inside toss-render: the
        // shell stamps window.__tossSubject per render and fires the event.
        this._subjectListener = () => this.adoptSubject();
        window.addEventListener('toss-subject', this._subjectListener);
        this.adoptSubject();
        // Console counts (header badges) + fallback list. Prefer the
        // retention kit (kits/console.js); fall back to gh-api's raw
        // __consoleLogs + 'consolelog' event. The rich panel, mounted
        // below, is the primary renderer once it's available.
        if (window.consoleKit) {
          this._offConsole = console.subscribe(e => {
            if (e.clear) { this.consoleLogs = []; return; }
            this.consoleLogs.push({ level: e.level, msg: e.msg, time: e.time });
            if (this.open && this.consoleOpen && !this.consolePanelReady) this.scrollConsole();
          });
        } else {
          this.consoleLogs = window.__consoleLogs ? [...window.__consoleLogs] : [];
          this._consoleListener = e => {
            this.consoleLogs.push(e.detail);
            if (this.open && this.consoleOpen && !this.consolePanelReady) this.scrollConsole();
          };
          window.addEventListener('consolelog', this._consoleListener);
        }
        this._mountConsolePanel();

        this.loadedScripts = window.__loadedScripts ? window.__loadedScripts.map(s => ({ ...s })) : [];
        this._scriptsListener = () => {
          this.loadedScripts = window.__loadedScripts ? window.__loadedScripts.map(s => ({ ...s })) : [];
        };
        window.addEventListener('loadedscripts', this._scriptsListener);

        // Per-file bytes for those same rows (gh-boot wraps get() to fill
        // window.__ghFiles). A separate event because a cached load fires this
        // and not 'loadedscripts', and vice versa for a deduped one.
        this.ghFiles = window.__ghFiles ? { ...window.__ghFiles } : {};
        this._filesListener = () => { this.ghFiles = window.__ghFiles ? { ...window.__ghFiles } : {}; };
        window.addEventListener('ghfiles', this._filesListener);

        // read() registry (gh-boot wraps read() to populate window.__reads) —
        // drives the Bundle affordance's "page + N data files" count.
        this.reads = window.__reads ? [...window.__reads] : [];
        this._readsListener = () => { this.reads = window.__reads ? [...window.__reads] : []; };
        window.addEventListener('reads', this._readsListener);

        // Traffic: the readout strip tracks the ledger's running totals (kept
        // by gh-boot apart from the rows, so trimming an old call does not
        // deflate the figure). The boot read is taken once, lazily, since
        // Resource Timing does not change after load; a resource added later
        // (a lazy kit, an image) shows up on the next refresh.
        this._trafficTick();
        this._trafficListener = () => this._trafficTick();
        window.addEventListener('traffic', this._trafficListener);
      },

      destroy() {
        if (this._offConsole) this._offConsole();
        if (this._consoleListener) window.removeEventListener('consolelog', this._consoleListener);
        if (this._scriptsListener) window.removeEventListener('loadedscripts', this._scriptsListener);
        if (this._readsListener) window.removeEventListener('reads', this._readsListener);
        if (this._trafficListener) window.removeEventListener('traffic', this._trafficListener);
        if (this._filesListener) window.removeEventListener('ghfiles', this._filesListener);
        if (this._subjectListener) window.removeEventListener('toss-subject', this._subjectListener);
      },

      // Take on (or drop) the toss subject. The subject is what the viewer is
      // actually looking at, so repo/path/ref — and everything downstream:
      // header identity, version readout, page links, the render tab — follow
      // it. Cleared subject (an inline #gz= toss, or back to the input panel)
      // restores the shell's own identity.
      // toss-render's OWN delivery params. Everything else a fragment can carry
      // is a ROUTE key, whose value addresses the content. Mirrored from
      // docs/routes.json, which owns the table; tools/test/routes-manifest
      // fails if they drift. `u` is url's undocumented alias, read by the page.
      _TOSS_MODES: ['gh', 'gz', 'html', 'url', 'u'],

      // The same routed subject the shell now stamps, DERIVED FROM THE ADDRESS
      // when the shell did not stamp one.
      //
      // This is the deployed-shell problem in its sharpest form. toss-render is
      // served from main, so the re-stamp that makes a routed subject the file
      // rather than the app is invisible until it merges, and a viewer opening
      // a #data= toss today still gets a drawer titled pages/data-view.html. A
      // fab is lib, so ?use= reaches it, and a fab can always read the top-level
      // fragment: the address said which file was asked for before any of this
      // began. So derive it here, and let the shell's own stamp win the moment
      // it exists. This is a compatibility path, not a second implementation,
      // and it needs no route map: it only has to tell a route key from one of
      // toss-render's own, which is the short list above.
      _routedFromAddress(stamped) {
        let hash = '';
        try { hash = String(location.hash || ''); } catch (e) { return null; }
        // One key per fragment, read by slice, as toss-render reads it: a '&'
        // inside the value is part of the address, not a sibling param.
        const m = hash.replace(/^#/, '').match(/^([A-Za-z][\w-]*)=([\s\S]*)$/);
        if (!m || this._TOSS_MODES.includes(m[1])) return null;
        let raw = m[2];
        try { raw = decodeURIComponent(raw); } catch (e) {}
        // A trailing frag belongs to the renderer, and a ?query to the page.
        const a = raw.split('#')[0].trim()
          .match(/^([^/@:]+\/[^/@:]+)(?:@([^:]+))?:([^?#]+)/);
        if (!a) return null;
        // Nothing to correct if the shell already mounted the file itself,
        // which is what a route resolving to a plain page would look like.
        if (a[3] === stamped.path) return null;
        return { repo: a[1], ref: a[2] || '', path: a[3], route: m[1],
                 via: { repo: stamped.repo, ref: stamped.ref || 'main', path: stamped.path } };
      },

      adoptSubject() {
        // Reactive copy: the take menu has to re-render when a toss re-addresses.
        this.payloadHtml = window.__tossPayload || '';
        const s0 = window.__tossSubject;
        // A shell too old to know about routes stamps only the renderer. Read
        // the route off the ADDRESS instead, which this fab can always see.
        const s = (s0 && s0.repo && !s0.route && this._routedFromAddress(s0)) || s0;
        if (s && s.repo) {
          this.viaToss = true;
          this.repo = s.repo;
          this.path = s.path || '';
          this.ref = s.ref || 'main';
          // A ROUTED subject is a file the renderer could not show as a page,
          // so an app is showing it instead: `route` is the door it came
          // through and `via` is the app. Everything the drawer says about
          // WHAT you are looking at follows the file above; the take grid,
          // which reaches into the frame's dom for real, follows `via`.
          this.subjectRoute = s.route || '';
          this.subjectVia = s.via || null;
        } else {
          if (!this.viaToss) return;
          this.viaToss = false;
          this.repo = this.shellRepo;
          this.path = this.shellPath;
          this.ref = this.shellRef;
          this.subjectRoute = ''; this.subjectVia = null;
        }
        this.frameRef = this.ref || 'main';
        this.ver = null; this.verLoaded = false; this.verError = '';
        // defaultBranch resets with the rest of the survey: it is a property of
        // the repo just dropped, and previewRef compares against it, so carrying
        // a stale 'master' into a main-defaulted repo would re-mislabel main as
        // a preview. 'main' is the guess until loadPageBranches says otherwise.
        this.pageBranches = []; this.pageBranchesLoaded = false; this.branchNote = '';
        // The guide belongs to the subject that just dropped, so it resets with
        // the survey: prBodyFor back to null (not ''), which is the "nothing
        // rendered yet" state rather than "rendered a PR-less ref".
        this.prBodyHtml = ''; this.prBodyFor = null; this.prTargets = []; this.refMenu = false;
        this.defaultBranch = 'main';
        if (this.open) {
          this.loadVersion();
          if (this.activeTab === 'render') this.loadPageBranches();
        }
      },

      infer() {
        const ds = this.$root.dataset || {};
        if (ds.showRepoBase) this.showRepoBase = ds.showRepoBase;
        if (ds.ref) this.ref = ds.ref;

        if (ds.repo) {
          this.repo = ds.repo;
          this.path = ds.path || '';
          return;
        }

        const m = location.hostname.match(/^([^.]+)\.github\.io$/);
        if (!m) return;
        const owner = m[1];
        const segs = location.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
        if (!segs.length) {
          this.repo = owner + '/' + owner + '.github.io';
          this.path = '';
        } else {
          this.repo = owner + '/' + segs[0];
          this.path = segs.slice(1).join('/');
        }
      },

      onDown(e) {
        this.down = true;
        this.dragged = false;
        this.sx = e.clientX - this.x;
        this.sy = e.clientY - this.y;
        e.currentTarget.setPointerCapture(e.pointerId);
      },

      onMove(e) {
        if (!this.down) return;
        const nx = e.clientX - this.sx;
        const ny = e.clientY - this.sy;
        if (!this.dragged && Math.hypot(nx - this.x, ny - this.y) > 4) this.dragged = true;
        const size = 56, edge = 24;
        const w = window.innerWidth, h = window.innerHeight;
        this.x = Math.min(edge, Math.max(-(w - size - edge), nx));
        this.y = Math.min(edge, Math.max(-(h - size - edge), ny));
      },

      onUp(e) {
        const wasDragged = this.dragged;
        this.down = false;
        this.dragged = false;
        if (!wasDragged) this.toggle();
      },

      toggle() {
        if (this.open) { this.close(); return; }
        this.detect();
        this.open = true;
        // The take grid states its own scope ("2 own modules · 5 vendor"), so the
        // brief kit has to be in hand when the drawer opens rather than on hover
        // of a menu that no longer exists. Still lazy: nothing loads until then.
        this.ensureBrief();
        this.loadVersion();
        // Render is the default tab, so populate its branch survey on open the
        // same way clicking the tab would (a tab already open fires no click).
        if (this.activeTab === 'render') this.loadPageBranches();
      },

      // Hard refresh: emulate Cmd/Ctrl+Shift+R where the browser gives no
      // gesture for it (Safari on iOS). Two levers: clear the Cache Storage API
      // (service-worker / PWA caches) and reload through a one-shot cache-bust
      // token so the top-level HTML is re-fetched instead of served from the
      // browser's HTTP cache. location.replace keeps the token out of history;
      // init() strips it back out of the address bar on the fresh load.
      async hardRefresh() {
        this._handOffDrawer();
        try {
          if (window.caches && caches.keys) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          }
        } catch (e) {}
        try {
          const u = new URL(location.href);
          u.searchParams.set('_fresh', Date.now().toString(36));
          location.replace(u.toString());
        } catch (e) {
          location.reload();
        }
      },

      close() {
        this.open = false;
        this.clearHighlight();
      },

      // Run a page action. If its run() resolves to a string, flash it as
      // feedback (e.g. "Copied"); errors surface the same way.
      //
      // A subject-side action's closure belongs to the frame's window, and
      // calling it from a click in this drawer leaves that document unfocused.
      // Measured: that alone rejects a clipboard write with NotAllowedError,
      // "Document is not focused" — activation propagates to a same-origin
      // child frame, focus does not. So focus the frame before invoking. That
      // one line covers every action that copies, including the io.copy ones,
      // whose document.hasFocus() branch is the same fault seen from the other
      // side; no page has to know it is being run from outside.
      //
      // Navigation cannot be fixed that way, because `location.href = ...`
      // inside the frame moves the FRAME, which is the opposite of what an
      // action like show-repo's bust-out means. An action that navigates
      // returns { nav } instead of doing it, and the FAB performs it here,
      // where the address bar is.
      async runAction(a) {
        this.outError = ''; this.outMsg = '';
        const subject = a.side === 'subject';
        try {
          if (subject) { try { window.__tossFrame?.contentWindow?.focus(); } catch (err) {} }
          const m = await a.run();
          if (m && typeof m === 'object' && m.nav) { location.href = m.nav; return; }
          const msg = typeof m === 'string' ? m : (m && typeof m === 'object' ? m.msg : '');
          if (msg) {
            this.outMsg = msg;
            setTimeout(() => { if (this.outMsg === msg) this.outMsg = ''; }, 1400);
          }
        } catch (e) {
          // The throw crossed a window boundary, so it is the SUBJECT's failure,
          // not the drawer's, and the reader cannot see which window it came
          // from. Say so. (`e instanceof Error` is false across realms; reading
          // `.message` still works, which is why nothing here tests the type.)
          const msg = (e && e.message) || String(e);
          this.outError = subject ? 'In ' + (a.from || 'the subject') + ': ' + msg : msg;
          setTimeout(() => { this.outError = ''; }, 2500);
        } finally {
          // Hand focus back, so the drawer the reader is still looking at keeps
          // the keyboard.
          if (subject) { try { window.focus(); } catch (err) {} }
        }
      },

      detect() {
        this.clearHighlight();
        this._elById = new Map();
        this._instanceCounter = 0;

        // One scan per document. `shell` marks this hosting page's own
        // components (vs the toss subject's). Actions are collected from BOTH
        // sides: a subject's closures do belong to its window, but that governs
        // how they are INVOKED (see runAction), not whether they can be reached.
        // Collecting shell-side only meant the drawer named the subject in its
        // header and then offered the renderer's buttons underneath it, unmarked.
        // `shell` rides out on each group so pageActions can attribute them.
        const scan = (doc, A, shell) => {
          const groups = {};
          doc.querySelectorAll('[x-data]').forEach(el => {
            if (shell && this.$root.contains(el)) return;

            const attr = el.getAttribute('x-data') || '';
            const m = attr.trim().match(/^([a-zA-Z_$][\w$]*)/);
            if (!m) return;
            const name = m[1];
            const key = (shell ? 'shell:' : 'page:') + name;

            if (!groups[key]) groups[key] = { key, name, shell, description: '', actions: [], instances: [] };

            const id = '__fab_' + (this._instanceCounter++);
            const label = this._labelFor(el);
            groups[key].instances.push({ id, name, label });
            this._elById.set(id, el);

            // Read the page's opt-in contract off the live component data: a
            // one-line `description` (shown under the name) and an `actions`
            // array ({ label, icon, run }) the FAB surfaces as page buttons.
            if (!groups[key].description || !groups[key].actions.length) {
              try {
                const data = A.$data(el);
                if (data && typeof data.description === 'string' && !groups[key].description) groups[key].description = data.description;
                if (data && Array.isArray(data.actions) && data.actions.length) groups[key].actions = data.actions;
              } catch (err) {}
            }
          });
          return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
        };

        const shellGroups = scan(document, Alpine, true);

        // Subject-scoped Inspect: the Render tab's adoption pattern extended.
        // A #gh= toss renders its subject in a same-origin srcdoc frame
        // (toss-render stamps window.__tossFrame), so the subject's components
        // and script registry are readable; scan them so Inspect describes the
        // page the viewer is looking at, listed above this shell's own. A
        // payload toss (#gz=) renders under an opaque origin — contentDocument
        // access fails, and the caveat line stands in.
        this.subjectInspect = false;
        this.subjectScripts = [];
        this.subjectFiles = {};
        this.subjectReads = [];
        this.subjectReached = false;
        this._subjectGh = null;
        let subjectGroups = [];
        if (this.viaToss && window.__tossFrame) {
          try {
            const win = window.__tossFrame.contentWindow;
            const doc = window.__tossFrame.contentDocument;
            if (win && doc) {
              // Reaching the frame and finding Alpine in it are two questions.
              // A page can boot lib without Alpine, or carry no chain at all, and
              // its registries are still worth reading: the take menu needs them
              // even when there is no component tree to scan.
              this.subjectReached = true;
              this.subjectScripts = win.__loadedScripts ? win.__loadedScripts.map(s => ({ ...s })) : [];
              this.subjectFiles = win.__ghFiles ? { ...win.__ghFiles } : {};
              this.subjectReads = win.__reads ? win.__reads.map(r => ({ path: r.path, value: r.value })) : [];
              this._subjectGh = { repo: win.gh?.repo || 'mehrlander/web-tools',
                                  ref: win.gh?.ref || 'main',
                                  base: win.gh?.loadBase || '' };
              if (win.Alpine) {
                this._ensureHighlightStyle(doc);
                subjectGroups = scan(doc, win.Alpine, false);
                this.subjectInspect = true;
              }
            }
          } catch (e) {}
        }

        this.groups = subjectGroups.concat(shellGroups);
      },

      _labelFor(el) {
        if (el.id) return '#' + el.id;
        const marker = el.getAttribute('data-marker');
        if (marker) return '[' + marker + ']';
        const tag = el.tagName.toLowerCase();
        const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0];
        return cls ? tag + '.' + cls : tag;
      },

      highlight(id) {
        if (this.highlighted === id) { this.clearHighlight(); return; }
        this.clearHighlight();
        const el = this._elById.get(id);
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const tagged = [];
        if (rect.width > 0 && rect.height > 0) {
          el.classList.add('__fab-highlight');
          tagged.push({ el, cls: '__fab-highlight' });
        } else {
          const kids = Array.from(el.children);
          if (kids.length === 1) {
            kids[0].classList.add('__fab-highlight');
            tagged.push({ el: kids[0], cls: '__fab-highlight' });
          } else {
            kids.forEach(k => {
              k.classList.add('__fab-highlight-multi');
              tagged.push({ el: k, cls: '__fab-highlight-multi' });
            });
          }
        }

        this.highlighted = id;
        this._highlightEls = tagged;
        if (tagged.length) tagged[0].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },

      clearHighlight() {
        if (!this.highlighted) return;
        if (this._highlightEls) {
          this._highlightEls.forEach(({ el, cls }) => el.classList.remove(cls));
          this._highlightEls = null;
        }
        this.highlighted = null;
      },

      _ensureHighlightStyle(doc) {
        doc = doc || document;
        if (doc.getElementById('__fab-highlight-style')) return;
        const style = doc.createElement('style');
        style.id = '__fab-highlight-style';
        style.textContent =
          '.__fab-highlight {' +
          '  outline: 3px dashed var(--color-primary, #f59e0b) !important;' +
          '  background-color: color-mix(in srgb, var(--color-primary, #f59e0b) 18%, transparent) !important;' +
          '  box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--color-primary, #f59e0b) 65%, transparent) !important;' +
          '}' +
          '.__fab-highlight-multi {' +
          '  outline: 3px dashed var(--color-warning, #f59e0b) !important;' +
          '  background-color: color-mix(in srgb, var(--color-warning, #f59e0b) 18%, transparent) !important;' +
          '  box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--color-warning, #f59e0b) 65%, transparent) !important;' +
          '}';
        doc.head.appendChild(style);
      },

      linksFor(filePath, repo, ref) {
        const r = repo || this.repo;
        if (!r) return [];
        ref = ref || this.ref;
        const p = filePath;
        const params = new URLSearchParams({ repo: r, ref });
        if (p) params.set('file', p);
        return [
          { l: 'Source', i: 'ph-github-logo',
            u: 'https://github.com/' + r + '/blob/' + ref + (p ? '/' + p : '') },
          { l: 'show-repo', i: 'ph-tree-structure',
            u: this.showRepoBase + '?' + params.toString() },
          { l: 'github.dev', i: 'ph-pencil-simple',
            u: 'https://github.dev/' + r + '/blob/' + ref + (p ? '/' + p : '') },
          { l: 'jsDelivr', i: 'ph-cloud-arrow-down',
            u: 'https://cdn.jsdelivr.net/gh/' + r + '@' + ref + (p ? '/' + p : '/') }
        ];
      },

      get pageLinks() { return this.linksFor(this.path); },
      // Page-contributed buttons, flattened across every component that exposes
      // an `actions` array. An action may name the take group it belongs in
      // (`group: 'Copy'`), which is how toss-render files "Copy toss link" with
      // the other clipboard outputs instead of standing apart; anything that
      // does not declare one lands under "Page".
      // Carry the contributing component through, so a take row can say where an
      // action came from, and which SIDE it came from: inside a toss the drawer
      // carries the subject's actions and this renderer's at once, and the two
      // can offer the same bare label ("Link" from both). `from` names the
      // component, `side` names the window it lives in, which is also what
      // runAction needs to invoke it correctly.
      get pageActions() {
        return this.groups.flatMap(g => (g.actions || []).map(a =>
          ({ ...a, from: g.name, side: g.shell ? 'shell' : 'subject' })));
      },

      // Where a contributed action came from, in the reader's terms. Outside a
      // toss there is one page and the plain wording holds. Inside one, "this
      // page" is the ambiguous phrase the old text used, so name which is which.
      actionOrigin(a) {
        const who = a.from || 'unknown';
        if (!this.viaToss) return 'Contributed by this page (' + who + '), not by the toolbar.';
        return a.side === 'subject'
          ? 'Contributed by the page you are viewing (' + who + '), not by the toolbar.'
          : 'Contributed by this renderer (' + who + '), not by the page you are viewing.';
      },
      get totalInstances() { return this.groups.reduce((s, g) => s + g.instances.length, 0); },
      get errorCount() { return this.consoleLogs.filter(e => e.level === 'error').length; },

      // ── Capture: the diagnostic bundle, serialized ─────────────────────────
      // Everything below is already collected for display (the script and
      // read() registries, the component scan, the console buffer, the subject
      // adoption); this only writes it down, so a session can read the page's
      // real state from a paste instead of inferring a DOM from a screenshot.
      // First cut of the capture task: clipboard out, no write path yet. It
      // rides the take grid as Copy · Capture, on the drawer's default tab.
      // Design points held from the task file: no pixels, and the bundle SAYS
      // which fidelity it got, since a #gz= subject renders under an opaque
      // origin on purpose and a capture there covers the shell alone.
      captureData() {
        this.detect();
        const mode = !this.viaToss ? 'top-level'
          : this.subjectReached ? 'toss #gh= (subject frame read)'
          : 'toss (subject frame unreadable: SHELL ONLY below)';
        const elide = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + `…(${s.length} chars)` : s; };
        const logs = this.consoleLogs.slice(-300);
        const sizeOf = r => { try { return JSON.stringify(r.value ?? '').length; } catch { return -1; } };
        return {
          capture: 'fab/1',
          at: new Date().toISOString(),
          address: elide((() => { try { return location.href; } catch { return ''; } })(), 400),
          mode,
          subject: { repo: this.repo, path: this.path, ref: this.ref,
                     ...(this.subjectRoute ? { route: this.subjectRoute, via: this.subjectVia } : {}) },
          ...(this.viaToss ? { shell: { repo: this.shellRepo, path: this.shellPath, ref: this.shellRef } } : {}),
          scripts: this.inspectScripts.map(s => ({
            path: s.path, status: s.status, side: s.side || (this.viaToss ? 'shell' : 'page'),
            ...(s.auto ? { auto: true } : {}),
            ...(s.by && s.by.size ? { by: Array.from(s.by) } : {}) })),
          // The scan's `shell` flag means "the hosting document", which outside
          // a toss IS the page; translate so a top-level capture never labels
          // the page's own components as someone else's.
          components: this.groups.map(g => ({
            name: g.name, side: g.shell && this.viaToss ? 'shell' : 'page', instances: g.instances.length,
            ...(g.actions.length ? { actions: g.actions.map(a => a.label) } : {}) })),
          // read() payloads can be whole datasets; a capture reports WHAT was
          // read and how much, never the bytes.
          reads: this.reads.map(r => ({ path: r.path, bytes: sizeOf(r) })),
          ...(this.subjectReads && this.subjectReads.length
            ? { subjectReads: this.subjectReads.map(r => ({ path: r.path, bytes: sizeOf(r) })) } : {}),
          console: logs.map(l => ({ level: l.level, msg: elide(l.msg, 500), time: l.time })),
          errors: logs.filter(l => l.level === 'error').length,
          ...(this.consoleLogs.length > 300 ? { consoleDropped: this.consoleLogs.length - 300 } : {}),
        };
      },
      // Runs through the take grid's dispatch (Copy · Capture), so success and
      // failure report on the same outMsg/outError line as the other outputs.
      async copyCapture() {
        const text = JSON.stringify(this.captureData(), null, 2);
        await navigator.clipboard.writeText(text);
        this.outMsg = 'Copied a ' + Math.max(1, Math.round(text.length / 1024)) + 'K capture';
      },

      // Per-group source links. Components are lib files, so a group resolves
      // against the lib chain of the window it lives in: the subject's gh
      // coordinates for subject groups, this shell's for its own. loadBase is
      // prepended so the blob link points at the real file under lib/.
      // (pageLinks passes the page's own root-relative path, left unprefixed.)
      componentLinks(g) {
        const p = 'alpineComponents/' + g.name + '.js';
        if (g.shell === false && this._subjectGh) {
          return this.linksFor(this._subjectGh.base + p, this._subjectGh.repo, this._subjectGh.ref);
        }
        const base = (window.gh && window.gh.loadBase) || '';
        return this.linksFor(base + p, this.shellRepo, this.shellRef);
      },

      // The Inspect scripts list: the subject window's registry first (side
      // 'page'), then this shell's (side 'shell'), one flat list so the panel
      // keeps a single scroll; outside a readable toss, just the shell's.
      get inspectScripts() {
        if (!this.subjectInspect) return this.loadedScripts;
        return this.subjectScripts.map(s => ({ ...s, side: 'page' }))
          .concat(this.loadedScripts.map(s => ({ ...s, side: 'shell' })));
      },

      scriptUrl(s) {
        const path = typeof s === 'string' ? s : (s && s.path);
        if (!path || /^https?:/.test(path)) return path || '#';
        // Registry paths are the loadBase-relative names gh.load() was called
        // with (e.g. 'kits/console.js'); prepend loadBase so the blob link
        // points at the real file under lib/. Subject-side rows key on the
        // subject window's lib coordinates, shell rows on this document's.
        if (typeof s === 'object' && s.side === 'page' && this._subjectGh) {
          return 'https://github.com/' + this._subjectGh.repo + '/blob/' + this._subjectGh.ref + '/' + this._subjectGh.base + path;
        }
        if (!this.shellRepo) return '#';
        const base = (window.gh && window.gh.loadBase) || '';
        return 'https://github.com/' + this.shellRepo + '/blob/' + this.shellRef + '/' + base + path;
      },

      fmtElapsed(s) {
        if (s.status === 'pending') return '…';
        if (typeof s.endT === 'number' && typeof s.t === 'number') return (s.endT - s.t) + 'ms';
        return '';
      },

      // Join a Scripts row to what gh-boot's get() wrapper recorded for it.
      // Registry paths are the loadBase-relative names gh.load() was called
      // with; __ghFiles keys are the full paths get() received, so the join
      // prepends the loadBase of whichever window the row belongs to.
      _scriptFile(s) {
        const path = typeof s === 'string' ? s : (s && s.path);
        if (!path) return null;
        const subject = typeof s === 'object' && s.side === 'page';
        const files = subject ? this.subjectFiles : this.ghFiles;
        const base = subject
          ? ((this._subjectGh && this._subjectGh.base) || '')
          : ((window.gh && window.gh.loadBase) || '');
        return (files && (files[base + path] || files[path])) || null;
      },
      scriptInlined(s) { const f = this._scriptFile(s); return !!(f && f.inlined); },
      scriptSizeText(s) {
        const f = this._scriptFile(s);
        if (!f) return '';
        return f.inlined ? 'inlined' : this.fmtB(f.bytes);
      },
      scriptSizeTitle(s) {
        const f = this._scriptFile(s);
        if (!f) return '';
        return f.inlined
          ? 'Served from the inlined cache in the pre-build: ' + this.fmtB(f.bytes) + ' of source, no network'
          : this.fmtB(f.bytes) + ' fetched from the repo';
      },

      fmtTime(ts) { return new Date(ts).toTimeString().slice(0, 8); },

      // ── Traffic ─────────────────────────────────────────────────────────
      // lib/traffic.js carries the arithmetic and every honesty rule; these are
      // the thin delegates the template binds to. They degrade to a plain
      // number rather than throwing when the module is not present, which is
      // the case for a page that pulled fab.js alone without the boot chain.
      fmtB(n) { return window.Traffic ? window.Traffic.fmtBytes(n) : String(n == null ? '?' : n); },
      fmtT(n) { return window.Traffic ? window.Traffic.fmtMs(n) : String(Math.round(n || 0)) + 'ms'; },
      fmtN(n) { return window.Traffic ? window.Traffic.fmtCount(n) : String(n); },

      trafPct(v) {
        const max = this.trafBootGroups.reduce((m, g) => Math.max(m, g.wire || 0), 0);
        if (!max || !v) return 0;
        return Math.max(2, Math.round((v / max) * 100));
      },

      // The always-on strip. Deliberately three facts and no more: what this
      // load cost, how many calls browsing has added, and what quota is left.
      // Empty until the boot read lands, so the strip never shows a zero that
      // would read as "nothing loaded".
      get trafficLine() {
        const T = window.Traffic;
        if (!T || !this.trafBoot || !this.trafBoot.count) return '';
        return T.summary({ boot: this.trafBoot, api: { calls: this.trafLive.calls }, rate: this.trafRate });
      },

      // Tinted only for the two things worth interrupting a glance: the rate
      // limit running down, and calls that failed.
      get trafficHot() {
        return (this.trafRate !== null && this.trafRate < 500) || this.trafLive.errors > 0;
      },

      get trafRateExact() {
        return this.trafRate === null ? '' : String(this.trafRate).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      },

      get trafficLoadTitle() {
        if (!this.trafBoot) return '';
        return this.fmtB(this.trafBoot.wire) + ' over the wire, '
          + this.fmtB(this.trafBoot.decoded) + ' decoded, '
          + this.trafBoot.count + ' resources; '
          + this.trafLive.calls + ' calls since. Tap for the breakdown.';
      },

      // Pull traffic.js on demand. It rides the boot chain, so this only fires
      // for a page that mounted the fab without one; a failure downgrades the
      // tab rather than breaking the drawer.
      async _ensureTrafficLib() {
        if (window.Traffic) return true;
        if (this._trafficLibTried) return false;
        this._trafficLibTried = true;
        try { await window.gh.load('traffic.js'); } catch (e) {}
        if (!window.Traffic) return false;
        this._trafficTick();
        return true;
      },

      // Cheap, coalesced, and called on every 'traffic' event: the running
      // totals plus a boot re-read only when the resource count actually moved.
      // Resource Timing is append-only, so the count is a sufficient dirty bit.
      _trafficTick() {
        const T = window.Traffic;
        if (!T) { this._ensureTrafficLib(); return; }
        const tot = window.__trafficTotals || { calls: 0, wire: 0, errors: 0 };
        this.trafLive = { calls: tot.calls || 0, wire: tot.wire || 0, errors: tot.errors || 0 };
        const rate = window.__trafficRate;
        this.trafRate = (rate === undefined || rate === null) ? null : rate;

        // In a readable toss the strip follows the bands onto the subject, or
        // the header would quote the shell's weight while the tab underneath it
        // described the tossed page. Outside a toss this branch never runs.
        if (this.viaToss) {
          const sub = this._readSubjectTraffic();
          if (sub) {
            this.trafSubject = true;
            this.trafShellWire = T.readBoot().wire;
            this.trafBoot = sub.boot;
            this.trafBootGroups = sub.groups;
            if (sub.live) this.trafLive = { calls: sub.live.calls || 0, wire: sub.live.wire || 0, errors: sub.live.errors || 0 };
            this.trafRate = sub.rate;
            return;
          }
          this.trafSubject = false;
        }

        let n = 0;
        try { n = performance.getEntriesByType('resource').length; } catch (e) {}
        if (this._bootCount !== n || !this.trafBoot) {
          this._bootCount = n;
          this.trafBoot = T.readBoot();
          this.trafBootGroups = T.bootGroups(this.trafBoot.rows);
        }
      },

      // In a toss the viewer is looking at the subject, not at this shell, so
      // the bands must describe the subject wherever its frame can be read.
      // Same reachability rule Inspect uses: a #gh= render is a same-origin
      // srcdoc frame and readable, a #gz= payload runs under an opaque origin
      // and throws. Returns null when there is nothing honest to report, which
      // is what puts the caveat line up instead.
      _readSubjectTraffic() {
        if (!this.viaToss || !window.__tossFrame) return null;
        try {
          const win = window.__tossFrame.contentWindow;
          if (!win || !win.performance) return null;
          const T = window.Traffic;
          // No navigation entry: a srcdoc frame did not fetch a document, and
          // folding its zero in would read as a free page load.
          const boot = T.boot(win.performance.getEntriesByType('resource'), null);
          const entries = win.__traffic || [];
          return {
            boot,
            groups: T.bootGroups(boot.rows),
            api: T.apiGroups(entries),
            repos: T.repoGroups(entries),
            totals: T.apiTotals(entries),
            live: win.__trafficTotals || null,
            rate: (win.__trafficRate === undefined) ? null : win.__trafficRate,
          };
        } catch (e) { return null; }
      },

      // The full read, on tab open and on the refresh button. Everything except
      // the storage estimate is synchronous over data already in memory.
      async refreshTraffic() {
        this.trafficError = '';
        if (!await this._ensureTrafficLib()) {
          this.trafficError = 'lib/traffic.js could not be loaded, so there are no meters to read.';
          return;
        }
        const T = window.Traffic;
        const shellBoot = T.readBoot();
        const sub = this._readSubjectTraffic();
        this.trafSubject = !!sub;
        this.trafShellWire = shellBoot.wire;

        this.trafBoot = sub ? sub.boot : shellBoot;
        this.trafBootGroups = sub ? sub.groups : T.bootGroups(shellBoot.rows);
        this._bootCount = this.trafBoot.count - 1;

        if (sub) {
          this.trafGroups = sub.api;
          this.trafRepos = sub.repos;
          this.trafTotals = sub.live
            ? { ...sub.totals, calls: sub.live.calls, wire: sub.live.wire, unknown: sub.live.unknown, errors: sub.live.errors, ms: sub.live.ms }
            : sub.totals;
          this.trafTrimmed = (sub.live && sub.live.trimmed) || 0;
          this.trafRate = sub.rate;
          this._trafficResident();
          return;
        }

        const entries = window.__traffic || [];
        this.trafGroups = T.apiGroups(entries);
        this.trafRepos = T.repoGroups(entries);
        this.trafTotals = T.apiTotals(entries);
        const tot = window.__trafficTotals;
        // The ledger trims; its totals do not. Where they disagree, the totals
        // are the honest figure and the rows are a recent sample of it.
        if (tot) {
          this.trafTrimmed = tot.trimmed || 0;
          this.trafTotals = { ...this.trafTotals, calls: tot.calls, wire: tot.wire, unknown: tot.unknown, errors: tot.errors, ms: tot.ms };
        }
        this._trafficTick();
        await this._trafficResident();
      },

      // Storage is origin-scoped, so it is the same answer for the shell and
      // for a subject rendered inside it, and both paths end here. The rate
      // reset rides along because it is read from the same globals.
      async _trafficResident() {
        const T = window.Traffic;
        const reset = window.__trafficRateReset;
        if (reset && reset > Date.now()) {
          const mins = Math.round((reset - Date.now()) / 60000);
          this.trafReset = mins < 1 ? 'under a minute' : (mins < 60 ? mins + 'm' : Math.round(mins / 60) + 'h');
        } else this.trafReset = '';

        const stores = [];
        for (const [store, name] of [[window.localStorage, 'localStorage'], [window.sessionStorage, 'sessionStorage']]) {
          const row = T.storageRows(store, name);
          if (row && row.keys) stores.push(row);
        }
        this.trafStores = stores;
        try {
          const est = await navigator.storage.estimate();
          this.trafEstimate = est && est.usage ? est.usage : 0;
        } catch (e) { this.trafEstimate = 0; }
        // indexedDB.databases() is not universal, so its absence is a missing
        // detail rather than a failure: the origin total still stands.
        try {
          this.trafDbs = typeof indexedDB !== 'undefined' && indexedDB.databases
            ? (await indexedDB.databases()).map(d => d.name).filter(Boolean)
            : [];
        } catch (e) { this.trafDbs = []; }
        // Open on arrival only where there is something with mass to look at.
        // 100 KB is the line between "a token and some UI state" and "this page
        // is holding your data", which is the only case worth a scroll.
        this.trafStoreOpen = this.trafEstimate > 100 * 1024 || this.trafDbs.length > 0;
      },

      // The one-line summary the collapsed row carries. Web Storage and the
      // origin estimate are two different measurements, so they are named
      // separately rather than added into a single figure that is neither.
      get trafStoreLine() {
        const keys = this.trafStores.reduce((n, s) => n + s.keys, 0);
        const bytes = this.trafStores.reduce((n, s) => n + s.bytes, 0);
        const bits = [];
        if (keys) bits.push(this.fmtB(bytes) + ' in ' + keys + (keys === 1 ? ' key' : ' keys'));
        if (this.trafEstimate) bits.push(this.fmtB(this.trafEstimate) + ' in ' + (this.trafDbs.length ? this.trafDbs.length + ' database' + (this.trafDbs.length === 1 ? '' : 's') : 'quota storage'));
        return bits.length ? bits.join(' · ') : 'nothing stored';
      },

      toggleConsole() {
        this.consoleOpen = !this.consoleOpen;
        if (this.consoleOpen) this.scrollConsole();
      },

      // Load + mount the rich debugConsole panel into the footer. Self-loads
      // the kit and component via gh.load so pages that only pull fab.js
      // still get the upgrade; on failure we keep the inline fallback list.
      // gh.load executes its file synchronously, but the fetch underneath it
      // can hang (a stuck connection leaves the load promise unsettled). A bare
      // `await gh.load(...)` here would then dangle forever and the rich panel
      // would never mount — yet we'd never fall back either. So race each
      // self-load against a timeout and retry once: a fresh gh.load issues a
      // new fetch, which often clears a transient stall; a hard stall bails to
      // the inline fallback list instead of hanging. `isReady` short-circuits
      // once the file has registered, so a merely-slow load isn't retried.
      async _selfLoad(path, isReady, { tries = 2, timeoutMs = 8000 } = {}) {
        for (let i = 0; i < tries && !isReady(); i++) {
          try {
            // Pass `by` explicitly — an Alpine method can't reach the scoped
            // `gh` handed to fab.js at load time, so stamp the attribution here
            // (the load wrapper honors opts.by ahead of any other signal).
            await Promise.race([
              window.gh.load(path, { by: 'alpineComponents/fab.js' }),
              new Promise((_, rej) => setTimeout(() => rej(new Error('self-load timeout')), timeoutMs))
            ]);
          } catch (e) {}
        }
        return isReady();
      },

      async _mountConsolePanel() {
        if (this.consolePanelReady) return;
        try {
          if (window.gh) {
            if (!window.consoleKit) await this._selfLoad('kits/console.js', () => !!window.consoleKit);
            if (!window.__debugConsoleRegistered) await this._selfLoad('alpineComponents/console.js', () => !!window.__debugConsoleRegistered);
          }
          if (!window.__debugConsoleRegistered || !window.Alpine) return;
          await this.$nextTick();
          const host = this.$refs.consoleHost;
          if (!host || host.getAttribute('x-data')) return;
          host.setAttribute('x-data', 'debugConsole');
          window.Alpine.initTree(host);
          this.consolePanelReady = true;
        } catch (e) {}
      },

      clearConsole() {
        if (window.consoleKit) console.clear();
        else this.consoleLogs = [];
      },

      _ago(dateStr) {
        const s = (Date.now() - new Date(dateStr)) / 1000;
        const u = { y: 31536000, mo: 2592000, d: 86400, h: 3600, m: 60 };
        for (const [k, v] of Object.entries(u)) if (s >= v) return Math.floor(s / v) + k + ' ago';
        return 'just now';
      },

      // "What am I looking at?" Reads recent commits for the booted ref and
      // tells the story up to that tip: the latest PR merge that precedes it
      // (the version), plus any commits sitting on top of that merge. On main
      // those extra commits are direct pushes; on a branch they're its own
      // unmerged commits. The PR number comes from the merge commit subject
      // (Merge pull request #N) and its title from the body, so nothing needs
      // hand-stamping. Lazy: fires on first drawer open, refreshable.
      async loadVersion(force) {
        if (force) this.verLoaded = false;
        if (this.verLoaded || this.verLoading) return;
        if (!window.GH) { this.verError = 'window.GH not available on this page'; return; }
        this.verError = '';
        this.verLoading = true;
        const repo = this.repo || 'mehrlander/web-tools';
        // Prefer the ref gh-api.js actually booted from (set on a ?use= page),
        // since that's the code running; fall back to the page's own ref. In a
        // toss, __bundleRef pins the SHELL's lib chain, not the subject — the
        // adopted ref is the one the viewer is looking at, so use it directly.
        const ref = this.viaToss ? (this.ref || 'main') : (window.__bundleRef || this.ref || 'main');
        let token = '';
        try { token = localStorage.getItem('ghToken') || ''; } catch (e) {}
        try {
          const gh = new window.GH({ repo, ref, token });
          // quiet: a background version check must never hijack the page with
          // the token-entry prompt on a 401/403 — we surface verError instead.
          const list = await gh.req('commits?sha=' + encodeURIComponent(ref) + '&per_page=30', { quiet: true });
          const tip = list[0];
          let mergeIdx = -1, pr = null;
          for (let i = 0; i < list.length; i++) {
            const m = list[i].commit.message.split('\n')[0].match(/^Merge pull request #(\d+)/);
            if (m) { mergeIdx = i; pr = m[1]; break; }
          }
          const merge = mergeIdx >= 0 ? list[mergeIdx] : null;
          let prTitle = '';
          if (merge) {
            const lines = merge.commit.message.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length > 1) prTitle = lines[lines.length - 1].slice(0, 80);
          }
          const dated = merge || tip;
          this.ver = {
            ref,
            sha: tip ? tip.sha.slice(0, 7) : '',
            tipUrl: tip ? tip.html_url : '',
            pr,
            prTitle,
            prUrl: pr ? 'https://github.com/' + repo + '/pull/' + pr : '',
            since: mergeIdx >= 0 ? mergeIdx : list.length,
            ago: dated ? this._ago(dated.commit.committer.date) : ''
          };
          this.verLoaded = true;
        } catch (e) {
          this.verError = 'Version: ' + ((e && e.message) || String(e));
        }
        this.verLoading = false;
      },

      // Mode detection. previewRef is the ref this view is running off of, if
      // any: the adopted subject ref inside a toss, else a ?use= lib pin (the
      // real query param, or __bundleRef set by a blob boot). offRef is the
      // boolean the launcher and escape handle key on. viewingRef is the ref
      // the page is actually rendered at (the branch list marks it "current",
      // distinct from frameRef, the pending selection awaiting a toss).

      // The default branch is not a preview. A toss (or ?use=) AT the default
      // branch renders exactly the code the live page serves, so it gets the
      // neutral launcher and no escape banner — the banner's only offer is
      // "return to main," which is nothing when main is what you're looking at.
      // The mechanism (toss vs direct) is not the question; the ref is. Mirrors
      // explorer.js's offRef, which already keys on ref !== defaultRef.
      _offDefault(ref) {
        if (!ref) return null;
        return ref === (this.defaultBranch || 'main') ? null : ref;
      },
      get previewRef() {
        // A toss adopts a subject ref; a ?use= page carries the ref in the real
        // query param. (window.__bundleRef is NOT a signal — a normal boot sets
        // it to the default branch, so it can't distinguish off-canonical.)
        if (this.viaToss) return this._offDefault(this.ref || 'main');
        // ...but only if the page HONORED it. Not every page's boot block
        // reads ?use=; several hardcode the default branch, and on those the
        // param sits in the address bar doing nothing. Reporting a preview the
        // page is not running is worse than reporting none: you go looking for
        // branch behavior in default-branch code. window.gh.ref is what the
        // loader is actually pinned to, so it settles it.
        if (this.ignoredUse) return null;
        try { const u = new URLSearchParams(location.search).get('use'); if (u) return this._offDefault(u); } catch (e) {}
        return null;
      },

      // The ref the loader is actually pinned to, as opposed to the one the
      // address bar asks for. this.ref is the mount's declared ref (data-ref,
      // or a toss subject's), which is not the same question.
      get loaderRef() { return (window.gh && window.gh.ref) || this.ref || 'main'; },

      // ?use=<ref> is in the URL but the loader booted something else: this
      // page's boot block does not implement the preview mechanism.
      get ignoredUse() {
        if (this.viaToss) return '';
        let asked = '';
        try { asked = new URLSearchParams(location.search).get('use') || ''; } catch (e) { return ''; }
        if (!asked) return '';
        const actual = (window.gh && window.gh.ref) || '';
        return actual && actual !== asked ? asked : '';
      },
      get offRef() { return !!this.previewRef; },
      get viewingRef() { return this.previewRef || this.defaultBranch || 'main'; },

      // A selection worth acting on: one that is not already what you are looking
      // at. The toss button keys on this, so it is present exactly when it would
      // change something.
      get refPending() { return (this.frameRef || 'main') !== this.viewingRef; },

      // The canonical deployed URL for the current subject, if it has one
      // (a github.io Pages page). Empty for a repo that isn't Pages-served.
      canonicalUrl() {
        if (!this.repo || !this.path) return '';
        const [owner, name] = this.repo.split('/');
        if (!owner || !name) return '';
        return 'https://' + owner + '.github.io/' + name + '/' + this.path;
      },

      // Leave the preview for the live page. From a toss, go to the subject's
      // canonical deployed URL; from a ?use= page, drop the use param and reload.
      returnToLive() {
        this._handOffDrawer();
        if (this.viaToss) {
          const url = this.canonicalUrl();
          if (url) location.href = url;
          return;
        }
        try {
          const u = new URL(location.href);
          u.searchParams.delete('use');
          location.href = u.toString();
        } catch (e) { location.reload(); }
      },

      // The toss address for the picked ref — toss-render's #gh mode, which only
      // accepts allowlisted owners (so no toss for other repos). Inside a toss
      // the fab already IS the renderer, so re-addressing goes via __tossNavigate.
      get tossUrl() {
        if (this.viaToss) return '';
        if (!this.repo || !this.path || this.repo.split('/')[0] !== 'mehrlander') return '';
        return 'https://mehrlander.github.io/web-tools/pages/toss-render.html#gh=' +
          this.repo + '@' + (this.frameRef || 'main') + ':' + this.path;
      },


      // The interesting rows: the baseline, anything holding a different copy
      // of this page, and anything unjudged. The bulk (same bytes, or no copy
      // at all) is real but not worth the height until asked for.
      get visibleBranches() {
        if (this.showAllBranches) return this.pageBranches;
        return this.pageBranches.filter(b =>
          b.status !== 'same' && b.status !== 'missing' || b.name === this.frameRef);
      },
      get hiddenBranchCount() { return this.pageBranches.length - this.visibleBranches.length; },

      // Expanding reveals rows that were never worth a compare call; fill in
      // the newly visible ones (still capped, see loadDivergence).
      expandBranches() {
        this.showAllBranches = !this.showAllBranches;
        if (this.showAllBranches && this._branchGh) this.$nextTick(() => this.loadDivergence(this._branchGh));
      },

      // Pure classification for the branch survey: mark each branch by how its
      // copy of the page relates to the default branch's, and order the list
      // baseline → differs → unknown → same → missing, newest-first within a
      // group. "Differs" is the row the tab exists for: a branch carrying
      // another version of the page you are looking at.
      classifyRows(branches, defaultBranch, defaultOid) {
        const rows = branches.map(b => ({
          ...b,
          div: null, divBusy: false,   // filled lazily by loadDivergence()
          pr: null,                    // filled by loadBranchPulls()
          session: '',                 // authoring session, same loader
          status: b.name === defaultBranch ? 'baseline'
                : !('fileOid' in b) ? 'unknown'
                : !b.fileOid ? 'missing'
                : b.fileOid === defaultOid ? 'same' : 'differs'
        }));
        const rank = { baseline: 0, differs: 1, unknown: 2, same: 3, missing: 4 };
        return rows.sort((a, b) =>
          (rank[a.status] - rank[b.status]) || (b.date || '').localeCompare(a.date || ''));
      },

      // The render tab's survey: which branches hold a DIFFERENT version of
      // this page? One GraphQL round-trip (branchesForPath) compares the
      // page's blob id at every branch tip against the default branch; when
      // that path is unavailable (no token, old gh-fetch), degrade to a plain
      // dated list with status 'unknown' — still selectable, just unjudged.
      async loadPageBranches(force) {
        if (force) this.pageBranchesLoaded = false;
        if (this.pageBranchesLoaded || this.pageBranchesLoading) return;
        if (!window.GH) { this.frameError = 'window.GH not available on this page'; return; }
        this.frameError = '';
        this.branchNote = '';
        this.pageBranchesLoading = true;
        let token = '';
        try { token = localStorage.getItem('ghToken') || ''; } catch (e) {}
        try {
          const tmp = new window.GH({ repo: this.repo || 'mehrlander/web-tools', token });
          if (typeof tmp.branches !== 'function') {
            this.frameError = 'gh-fetch.js not loaded (branches() unavailable)';
          } else {
            let rows = null;
            if (this.path && typeof tmp.branchesForPath === 'function') {
              try {
                const r = await tmp.branchesForPath(this.path);
                this.defaultBranch = r.defaultBranch || 'main';
                rows = this.classifyRows(r.branches, this.defaultBranch, r.defaultOid);
              } catch (e) { /* degrade below */ }
            }
            if (!rows) {
              this.branchNote = 'File comparison unavailable (needs a token) — showing all branches.';
              let list;
              try {
                list = typeof tmp.branchesDated === 'function' ? await tmp.branchesDated() : null;
              } catch (e) { list = null; }
              if (!list) list = (await tmp.branches()).map(b => ({ name: b.name, date: '', ago: '' }));
              rows = this.classifyRows(list, this.defaultBranch, null);
            }
            this.pageBranches = rows;
            this.pageBranchesLoaded = true;
            this._branchGh = tmp;
            this.loadDivergence(tmp);
            this.loadBranchPulls(tmp);
          }
        } catch (e) {
          this.frameError = 'Branches: ' + ((e && e.message) || String(e));
        }
        this.pageBranchesLoading = false;
      },

      // Ahead/behind the default branch, for the rows the list actually shows.
      // One REST compare per branch, so this is deliberately NOT run over all
      // ~290 branches: it is scoped to the handful holding a different copy of
      // this page, which is the set the tab exists to surface. The rest fill in
      // if you expand the list. Failures leave the row unannotated rather than
      // erroring: divergence is a nicety, the branch is still selectable.
      async loadDivergence(gh, names) {
        const base = this.defaultBranch || 'main';
        if (typeof gh?.compare !== 'function') return;
        const want = (names
          ? this.pageBranches.filter(b => names.includes(b.name))
          : this.visibleBranches
        ).filter(b => b.status !== 'baseline' && !b.div && !b.divBusy).slice(0, 12);
        for (const row of want) {
          row.divBusy = true;
          try {
            const c = await gh.compare(base, row.name);
            row.div = {
              ahead: c.ahead_by || 0,
              behind: c.behind_by || 0,
              // "behind or identical" means every commit here is already on the
              // default branch. Squash merges defeat this, so it is a hint, not
              // the content-level verdict lib/branch-survey.js computes.
              merged: (c.ahead_by || 0) === 0,
            };
          } catch (e) { row.div = null; }
          row.divBusy = false;
        }
      },

      // Attach each branch's open PR, and with it the Claude Code session that
      // authored the branch (gh.pulls lifts the session URL out of the guide
      // PR body's footer). One REST call for the whole list, the same source
      // the estate's Open view reads, so a branch row here offers the same
      // route back to the conversation that produced it.
      async loadBranchPulls(gh) {
        if (typeof gh?.pulls !== 'function') return;
        let pulls;
        try { pulls = await gh.pulls('open', 100); } catch (e) { return; }
        const byHead = new Map((pulls || []).map(p => [p.head, p]));

        // The authoring session, from the branch's own commit trailer rather
        // than the PR body. The body only answers while a PR is open, which is
        // a rounding error against a branch estate (2 of 404 branches in
        // mehrlander/home), so gating the mark on a PR left it dark for nearly
        // every row. The estate's Open view moved off that source; this is the
        // same move for the render tab.
        //
        // The exact source is the crawl's compare (branch-survey compareFields),
        // but this list comes from branchesDated() and has no compare to read,
        // so it takes the ancestor walk: approximate, and the reason
        // `sessionExact` is false here. The PR body stays the last fallback.
        let walk = {};
        if (typeof gh?.branchSessions === 'function') {
          try { walk = await gh.branchSessions(); } catch { walk = {}; }
        }
        for (const row of this.pageBranches) {
          const p = byHead.get(row.name);
          if (p) row.pr = { number: p.number, session: p.session || '', draft: p.draft,
                            title: p.title || '', body: p.body || '' };
          row.session = walk[row.name] || p?.session || '';
          row.sessionExact = false;
        }
        // The guide pane has nothing to show until this call lands, so it is
        // driven from here rather than watched: the PR body arrives exactly
        // once per survey, with the rows.
        this.renderPrBody();
        this.loadBranchPrs();
      },

      prUrl(n) { return 'https://github.com/' + (this.repo || 'mehrlander/web-tools') + '/pull/' + n; },

      pickFrameRef(name) { this.frameRef = name; },

      // ── The ref bar, the dropdown, and the guide ────────────────────────

      toggleRefMenu() {
        this.refMenu = !this.refMenu;
        if (this.refMenu) this.loadPageBranches();
      },

      // One tap: select and render. The confirm step this replaces treated a
      // preview swap as if it were destructive; it costs a back button.
      goToRef(name) {
        if (!name || name === this.viewingRef) return;
        this.refMenu = false;
        this.frameRef = name;
        // The default branch usually means "leave the preview for the live
        // deployed page". A ROUTED subject has no such page: a markdown file at
        // main is still read through the renderer, and canonicalUrl would send
        // you to a github.io address that does not exist. Re-address instead.
        if (name === (this.defaultBranch || 'main') && !this.subjectRoute) return this.returnToLive();
        this.renderAtRef(name);
      },

      // ── The path picker: render any file, not just this one ─────────────
      // The drawer's whole subject is rendering a file at a ref. The ref half
      // has a picker; this is the other half. It reuses show-repo's tap-through
      // selector rather than growing a second tree walker, which is also why
      // path-picker gained an injectable GH: its one hidden dependency was
      // Alpine's browser store, and the fab mounts on pages that have none.

      _picker() {
        const host = this.$refs && this.$refs.picker;
        const el = host && host.firstElementChild;
        return (el && el.__pathPicker) || null;
      },
      get pickerOpen() { const p = this._picker(); return !!(p && p.open); },
      togglePicker() {
        const p = this._picker();
        if (!p) return;
        this.ghMenu = false;
        p.toggle();
      },

      // The picker reads through a GH aimed at the repo on screen. A fresh
      // instance rather than window.gh, since the loader's own ref is the code
      // this page booted, not the ref the viewer is looking at.
      pickerGh() {
        let token = '';
        try { token = localStorage.getItem('ghToken') || ''; } catch (e) {}
        if (!window.GH) return null;
        return new window.GH({ repo: this.repo || 'mehrlander/web-tools', ref: this.viewingRef, token });
      },

      // The roots: this repo at the ref on display, then every other repo the
      // token can see. This one is first and carries its ref, because it is the
      // one the drawer is about and the only one where "at this ref" means
      // anything; the rest open at their default branch, which is what a
      // cross-repo look wants. Resolved once, lazily, at first open, which is
      // the shape path-picker is built for (it loads a repo's tree on entry,
      // not up front, so a long root list costs nothing to show).
      //
      // Without a token the list degrades to this repo alone rather than
      // erroring: the picker's job here is the current repo, and the others are
      // the bonus.
      async pickerRoots() {
        const repo = this.repo;
        if (!repo) return [];
        // The owner is dropped when it matches this page's, and only then. In a
        // one-account estate every row would otherwise spend a third of a narrow
        // panel restating the same prefix; where the owner differs it is the
        // most important part of the name and stays.
        const owner = repo.split('/')[0] + '/';
        const short = n => (n.startsWith(owner) ? n.slice(owner.length) : n);
        const here = { repo, ref: this.viewingRef, label: short(repo) + ' @ ' + this.viewingRef };
        const gh = this.pickerGh();
        if (!gh || typeof gh.repos !== 'function') return [here];
        try {
          const list = await gh.repos('', { quiet: true });
          const rest = (list || [])
            .map(r => r.full_name)
            .filter(n => n && n !== repo)
            .map(n => ({ repo: n, ref: '', label: short(n) }));
          return [here, ...rest];
        } catch (e) { return [here]; }
      },

      // A picked file is a request to render it, which is the same routing the
      // guide's links get, with one deliberate difference: here EVERY file
      // resolves somewhere. openTarget stays conservative because it is
      // re-aiming links somebody else wrote, and turning a source link into a
      // viewer would be presumptuous; a file the viewer just chose in a picker
      // labelled "render" carries no such doubt, so an unrecognized extension
      // opens in the data view (which reads anything, as code when it must).
      renderPicked(detail) {
        const p = this._picker();
        if (p) p.open = false;
        if (!detail || !detail.path) return;
        const repo = detail.repo || this.repo;
        // The ref falls back to the one on display ONLY within this repo. Across
        // repos it must not: the picker's other roots carry no ref, and stamping
        // this page's branch onto mehrlander/home addresses a branch that does
        // not exist there, which 404s at the renderer with nothing saying why.
        // An empty ref is a real answer, and the address grammar has a word for
        // it: no @ref means the repo's default branch.
        const ref = detail.ref || (repo === this.repo ? this.viewingRef : '');
        const t = this.renderTarget(repo, ref, detail.path, true);
        if (!t) return;
        if (repo === this.repo) this.frameRef = ref || this.viewingRef;
        this.goTarget(t);
      },

      // Open a render target the way the ref bar opens a branch: IN PLACE. A
      // pick used to spawn a tab for anything that was not a page at this repo,
      // which made "render this file" mean two different gestures depending on
      // the extension. It is one gesture; the drawer hands itself forward and
      // reopens on the far side, the same as a ref switch.
      //
      // Inside a toss there is no navigation at all, only a re-address, and the
      // route decides which handle: a page goes through __tossNavigate (#gh=),
      // anything else through __tossRoute, which owns the route map. An older
      // deployed shell has no __tossRoute, so a missing handle falls through to
      // the top-level navigation rather than doing nothing.
      // Leave for a URL. Kept as a named method rather than inlined so a test
      // can watch it, and because the top-document guard is not obvious: a fab
      // declines to mount inside an iframe, but a page that opted back in
      // (data-allow-framed) would otherwise navigate its own frame.
      _go(url) {
        if (!url) return;
        // Setting location.href to the address already showing is a no-op, and
        // silently: no navigation, no hashchange, no reload. Picking the file
        // you are already looking at is a reasonable thing to do (you came back
        // to it), so make it mean "render this again" rather than nothing.
        if (url === location.href) { location.reload(); return; }
        try {
          if (window.top && window.top !== window.self) { window.top.location.href = url; return; }
        } catch (e) { /* cross-origin top: fall through */ }
        location.href = url;
      },

      // Where a target goes when the renderer has to be reloaded rather than
      // re-addressed in place. `t.url` is the DURABLE address, hardcoded at
      // github.io so it is worth copying and worth bookmarking; it is the wrong
      // thing to navigate to from inside a running renderer, for two reasons.
      // It drops the current ?use= pin, so a shell previewing a branch silently
      // reverts to the deployed one on the first pick. And it jumps origins,
      // which is fine in a browser and is not fine in the in-app one, where a
      // cross-origin hop out of the current page is exactly what does not come
      // back. Already on toss-render, only the fragment has to change.
      tossHref(t) {
        if (!t) return '';
        if (!/\/toss-render\.html$/.test(location.pathname)) return t.url;
        return location.origin + location.pathname + location.search +
               '#' + (t.route || 'gh') + '=' + t.addr;
      },

      goTarget(t) {
        if (!t || !t.url) return;
        // The drawer survives the trip, the same as a ref switch: you are
        // stepping through the files a guide names, and the list you are
        // stepping through should still be there on the far side.
        this._handOffDrawer();
        if (this.viaToss) {
          if (!t.route && typeof window.__tossNavigate === 'function') {
            window.__tossNavigate(t.addr); return;
          }
          if (t.route && typeof window.__tossRoute === 'function') {
            window.__tossRoute(t.route, t.addr); return;
          }
        }
        this._go(this.tossHref(t));
      },

      // ── The GitHub menu ─────────────────────────────────────────────────
      // The mark beside the path used to be one link to one blob, which is the
      // narrowest thing GitHub can be asked and left its commits, the branch,
      // and the PR list with no route at all. lib/github-links.js already names
      // that set for show-repo's sidebar, so the rows come from there and this
      // adds only the two that need a file to mean anything.

      toggleGhMenu() {
        this.ghMenu = !this.ghMenu;
        if (this.ghMenu) this._needGithubLinks();
      },

      // github-links.js is not in the auto-boot set (it is not a component), so
      // a page that never asked for it does not have it. Load on open, once;
      // ghRows falls back to the two file rows it can build itself until then.
      _needGithubLinks() {
        if (window.GithubLinks || this._ghLinksP) return this._ghLinksP;
        const load = window.gh && typeof window.gh.load === 'function'
          ? window.gh.load('github-links.js') : Promise.reject();
        return this._ghLinksP = Promise.resolve(load)
          .then(() => { this.ghRowsTick++; })
          .catch(() => { this.ghRowsTick++; });
      },

      get ghRows() {
        this.ghRowsTick;                       // re-read after a lazy load lands
        const repo = this.repo;
        if (!repo) return [];
        const ref = this.viewingRef;
        const enc = s => String(s || '').split('/').map(encodeURIComponent).join('/');
        const base = 'https://github.com/' + repo;
        const rows = window.GithubLinks
          ? window.GithubLinks.rows(repo, { ref, defaultRef: this.defaultBranch || 'main' })
          : [{ key: 'home', label: 'Repository', icon: 'ph-house', url: base },
             { key: 'commits', label: 'Commits', icon: 'ph-git-commit', url: base + '/commits/' + enc(ref) }];
        // The file rows. They belong here rather than in github-links.js because
        // that module speaks about a REPO; only this drawer knows which file the
        // viewer is standing in.
        const file = this.path ? [
          { key: 'file', label: 'This file', icon: 'ph-file-code',
            url: base + '/blob/' + enc(ref) + '/' + this.path },
          { key: 'fileCommits', label: 'Commits for this file', icon: 'ph-clock-counter-clockwise',
            url: base + '/commits/' + enc(ref) + '/' + this.path },
        ] : [];
        return [...file, ...rows];
      },

      // ── The guide, and the PRs it can walk ──────────────────────────────

      // The PR the survey found, which is the OPEN one for the ref on display.
      // It is the starting point rather than the whole story: a branch in this
      // estate routinely carries several PRs over its life, since a merge ends a
      // PR but not the branch, and the next push opens a new one.
      get currentPr() {
        const row = this.pageBranches.find(b => b.name === this.viewingRef);
        return (row && row.pr) || null;
      },

      // What the arrows walk: every PR ever opened for this branch, newest
      // first, with the open one first when the fuller list has not loaded yet.
      get branchPrs() {
        const all = this._prsFor === this.viewingRef ? this.prHistory : [];
        if (all.length) return all;
        return this.currentPr ? [this.currentPr] : [];
      },
      get guidePr() { return this.branchPrs[this.guideIdx] || this.branchPrs[0] || null; },
      get guideCount() { return this.branchPrs.length; },
      stepGuide(n) {
        const next = this.guideIdx + n;
        if (next < 0 || next >= this.guideCount) return;
        this.guideIdx = next;
        this.renderPrBody();
      },

      // Every PR whose head is this branch, open or not. One REST call, made
      // when the guide pane is shown for a branch, because the survey's single
      // open-PR list cannot answer it: a merged PR is gone from that list while
      // its body is often the better account of what the branch did.
      async loadBranchPrs() {
        const ref = this.viewingRef;
        if (this._prsFor === ref || this._prsBusy) return;
        this._prsBusy = true;
        try {
          const [owner] = (this.repo || '').split('/');
          let token = '';
          try { token = localStorage.getItem('ghToken') || ''; } catch (e) {}
          const gh = new window.GH({ repo: this.repo, token });
          const list = await gh.req('pulls?state=all&head=' + encodeURIComponent(owner + ':' + ref) +
                                    '&per_page=20', { quiet: true });
          const rows = (list || []).map(p => ({
            number: p.number, title: p.title || '', body: p.body || '',
            draft: !!p.draft, state: p.merged_at ? 'merged' : p.state,
            updatedAt: p.updated_at || '',
          })).sort((a, b) => b.number - a.number);
          this.prHistory = rows;
          this._prsFor = ref;
          this.guideIdx = 0;
          if (rows.length) this.renderPrBody();
        } catch (e) { /* the survey's open PR is still the fallback */ }
        this._prsBusy = false;
      },

      get branchPageUrl() {
        return 'https://mehrlander.github.io/web-tools/pages/branch.html#gh=' +
          (this.repo || 'mehrlander/web-tools') + '@' + this.viewingRef;
      },

      // The guide renderer lives in kits/guide-render.js, not here. It was this
      // drawer's alone until 2026-08-06; pages/branch.html renders the same
      // body under the same rules, and the estate's branch takeover renders
      // that page full-viewport, so a second copy would have been three
      // surfaces disagreeing about what a guide link means. These four are the
      // drawer's bindings to it: the kit is pure, and everything that needs to
      // know where this FAB is standing (its branch list, its viewing ref) is
      // supplied here.
      // Pages that pull fab.js alone still get the kit, by the same self-load
      // the console panel uses; the pre-build already carries it.
      _needGuideKit() {
        return window.GuideRender ? Promise.resolve(true)
             : this._selfLoad('kits/guide-render.js', () => !!window.GuideRender);
      },
      _needMarked() { return window.GuideRender.needMarked(); },
      get guideBodyClass() { return window.GuideRender?.bodyClass('drawer') || 'text-[13px]'; },

      // The branch list is the disambiguator for a slashed ref, and it is
      // already loaded here.
      get knownRefs() {
        return [this.defaultBranch || 'main', ...this.pageBranches.map(b => b.name)].filter(Boolean);
      },
      // Null-safe rather than assumed: these three are called synchronously
      // from the path picker as well as from the guide, and a page whose
      // self-load has not landed yet should get "no opinion" rather than a
      // TypeError inside a click handler.
      splitBlobRef(rest) { return window.GuideRender?.splitBlobRef(rest, this.knownRefs) || null; },
      openTarget(href) { return window.GuideRender?.openTarget(href, this.knownRefs) || null; },
      renderTarget(repo, ref, path, any) {
        return window.GuideRender?.renderTarget(repo, ref, path, any) || null;
      },

      // The guide body, rendered once per PR through the shared kit. The
      // drawer supplies only what it alone knows: the branch list that
      // disambiguates a slashed ref, and the ref on display, which breaks the
      // chip strip's dedupe tie in favor of the version being looked at.
      async renderPrBody() {
        const pr = this.guidePr;
        const key = pr ? String(pr.number) : '';
        if (this.prBodyFor === key) return;
        this.prBodyFor = key;
        this.prBodyHtml = ''; this.prTargets = [];
        if (!pr || !pr.body) return;
        try {
          if (!await this._needGuideKit()) return;
          await this._needMarked();
        } catch (e) { this.prBodyHtml = ''; return; }
        if (this.prBodyFor !== key) return;     // a switch landed while loading
        const out = window.GuideRender.render(pr.body, {
          knownRefs: this.knownRefs, preferRef: this.viewingRef,
        });
        this.prTargets = out.targets;
        this.prTargetsByAddr = out.byAddr;
        this.prBodyHtml = out.html;
      },

      // The prose is x-html, so its links carry no Alpine bindings; one
      // delegated handler on the container does the interception instead. Only
      // a link renderPrBody recognized is claimed (it stamped the address);
      // everything else keeps the browser's own behavior.
      onGuideClick(e) {
        const a = e.target && e.target.closest && e.target.closest('a[data-render-addr]');
        if (!a) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;  // let a deliberate new tab through
        const t = this.prTargetsByAddr[a.getAttribute('data-render-addr')];
        if (!t) return;
        e.preventDefault();
        this.goTarget(t);
      },

      // Drawer continuity across a toss. Tossing is a real navigation, so the
      // fab on the far side boots closed and you lose your place: you were
      // comparing refs, and the list you were comparing them in is gone. Hand
      // the open state forward through sessionStorage (same tab, cleared with
      // it) and re-open on the next boot. The far side still has to load, so
      // the drawer reappears after the page does rather than with it.
      _DRAWER_KEY: '__fabDrawer',

      _handOffDrawer() {
        if (!this.open) return;
        try {
          sessionStorage.setItem(this._DRAWER_KEY, JSON.stringify({
            tab: this.activeTab, console: this.consoleOpen, t: Date.now(),
          }));
        } catch (e) {}
      },

      // Drop any pending handoff, so a stash from an earlier action cannot
      // reopen the drawer over a render that deliberately closed it.
      _clearDrawerHandoff() {
        try { sessionStorage.removeItem(this._DRAWER_KEY); } catch (e) {}
      },

      _restoreDrawer() {
        let raw = null;
        try {
          raw = sessionStorage.getItem(this._DRAWER_KEY);
          sessionStorage.removeItem(this._DRAWER_KEY);   // one-shot, not sticky
        } catch (e) {}
        if (!raw) return;
        let s; try { s = JSON.parse(raw); } catch (e) { return; }
        // Only honor a handoff from the navigation that just happened, so a
        // stale entry (a tab restored hours later) doesn't force the drawer open.
        if (!s || typeof s.t !== 'number' || Date.now() - s.t > 15000) return;
        this.open = true;
        if (s.tab) this.activeTab = s.tab;
        this.consoleOpen = !!s.console;
      },

      // The toss action. In a toss, re-address the shell at the picked ref in
      // place (toss-render re-fetches, re-stamps the subject, this fab re-adopts).
      // Outside one, go TO the toss: navigate to toss-render at the picked ref,
      // same tab, so the fab rides along and the escape handle brings you back.
      // No bespoke overlay renderer — toss-render is the one renderer now.
      renderAtRef(refArg) {
        const ref = refArg || this.frameRef || 'main';
        if (this.viaToss) {
          if (!this.repo || !this.path) return;
          // Through renderTarget rather than straight to __tossNavigate, which
          // speaks #gh= only: the subject may be a markdown file the shell is
          // showing through the data route, and switching ITS ref has to come
          // back through that same route or the shell would try to mount a
          // .md as a page. One routing table decides, here as everywhere.
          const t = this.renderTarget(this.repo, ref, this.path, true);
          if (t) this.goTarget(t);
          return;
        }
        if (this.tossUrl) { this._handOffDrawer(); location.href = this.tossUrl; }
      },

      // Everything the take menu operates on, resolved once: which page, whose
      // module registry, whose data, and a GH pointed at the right repo and ref.
      // Outside a toss that is simply this window. Inside one the page on screen
      // lives in the frame while the globals belong to the shell around it, so
      // every take action has to be aimed rather than left to read the globals.
      // Aiming it in one place is what lets the menu be shown in both.
      get takeTarget() {
        // A #gz= payload toss is not an adopted subject (opaque origin, nothing
        // to read), but the shell holds its HTML and that HTML is already the
        // finished artifact. Nothing to fetch, inline, or count.
        if (this.payloadHtml) {
          return { gh: window.gh, scripts: null, reads: null, path: this.path,
                   reachable: true, payload: this.payloadHtml };
        }
        if (!this.viaToss) {
          return { gh: window.gh, scripts: null, reads: null, path: this.path, reachable: true };
        }
        // A #gh= toss frame is same-origin, so its registries are readable. A
        // #gz= payload is not a toss by this fab's reckoning (no __tossSubject),
        // so it never lands here.
        // Aimed at the document in the frame, which under a route is the
        // renderer app rather than the addressed file: takePath and the repo
        // both follow `via` so the inlined modules resolve where they live.
        const repo = (this.subjectVia && this.subjectVia.repo) || this.repo;
        let gh = window.gh;
        if (window.GH && repo) {
          try { gh = new window.GH({ repo, ref: this.takeRef, loadBase: 'lib/' }); } catch (e) {}
        }
        return {
          gh,
          scripts: this.subjectScripts || [],
          reads: this.subjectReads || [],
          path: this.takePath,
          reachable: this.subjectReached,
        };
      },

      // The file a take operates on, and the ref it is read at: the frame's own
      // document. Only a routed subject makes these differ from the pair the
      // drawer is titled with, and when they differ EVERY take label has to use
      // them. A row reading "CLAUDE.md at claude/thing" over an action that
      // stages data-view.html at main is worse than either answer alone, since
      // it looks like it was thought about.
      get takePath() { return (this.subjectVia && this.subjectVia.path) || this.path; },
      get takeRef() { return (this.subjectVia ? this.subjectVia.ref : this.ref) || 'main'; },

      // What a take-away would contain, read off the runtime closure without
      // fetching anything: the menu can be honest about scope before you pick.
      // briefReady is the reactive gate: window.brief is not reactive, so the
      // menu would render its fallback copy forever without a tracked flag to
      // re-run these getters once the kit lands.
      get takePlan() {
        if (!this.briefReady || !window.brief) return null;
        const t = this.takeTarget;
        try { return window.brief.plan({ path: t.path, gh: t.gh, scripts: t.scripts, reads: t.reads }); }
        catch (e) { return null; }
      },

      // Pull the kit in when the menu is about to open, so it can say what a
      // brief would contain before you commit to one. ~10K, once per page.
      async ensureBrief() {
        if (this.briefReady || this.briefLoading) return;
        this.briefLoading = true;
        try {
          if (!window.brief) await this._selfLoad('kits/brief.js', () => !!window.brief);
          this.briefReady = !!window.brief;
        } catch (e) { /* menu falls back to generic copy */ }
        this.briefLoading = false;
      },

      // What every button below operates on, stated once so no label has to
      // repeat it. "Stage" had to be asked about because the labels named the
      // verb and the form but never the subject, and the subject is the same for
      // all six: this page and what it loaded.
      get takeSubject() {
        // Named for what a take would actually contain. Under a route that is
        // the RENDERER's document, not the file it is displaying: zipping a
        // markdown read gets you data-view.html and its modules, which is a
        // strange answer but the true one, and labelling it with the markdown
        // file would be the kind of small lie that costs an hour later.
        const base = (this.takePath || '').split('/').pop() || 'this page';
        const p = this.takePlan;
        if (!p) return base;
        const bits = [];
        if (p.own.length) bits.push(p.own.length + ' module' + (p.own.length === 1 ? '' : 's'));
        if (p.reads.length) bits.push(p.reads.length + ' data');
        return bits.length ? base + ' + ' + bits.join(' + ') : base;
      },

      // The full closure, for the header's tooltip: true but too long to read at
      // a glance, and the boot and vendor rings are loop detail.
      get takeDetail() {
        const p = this.takePlan;
        if (!p) return 'Page source, its modules, and the data it reads.';
        const bits = [(p.own.length || 0) + ' own module' + (p.own.length === 1 ? '' : 's')];
        if (p.floor.length) bits.push(p.floor.length + ' boot');
        if (p.reads.length) bits.push(p.reads.length + ' data');
        if (p.vendor.length) bits.push(p.vendor.length + ' vendor');
        return bits.join(' · ');
      },

      // The four outputs. Labels are bare nouns: the group heading above them
      // already says whether the action copies, navigates, or downloads, so
      // repeating the verb in every row is noise. The sentence each label used
      // to carry becomes the row's tooltip.
      get takeGroups() {
        const p = this.takePlan;
        const own = p ? p.own.length : 0;
        const mods = own + ' module' + (own === 1 ? '' : 's');
        const whole = p && p.wholeLib;
        const files = p ? 1 + p.own.length : 0;
        const base = (this.takePath || '').split('/').pop() || 'this page';
        const data = p && p.reads.length ? ' + ' + p.reads.length + ' data' : '';
        // Name the actual files while the list is short enough to read. A count
        // is what you fall back to, not what you lead with: "url-params.js,
        // shorter-payload.js" answers the question that "2 modules" only labels.
        const names = p ? [base, ...p.own.map(m => m.path)] : [base];
        const list = names.length <= 4 ? names.join(', ')
                   : names.slice(0, 3).join(', ') + ' +' + (names.length - 3) + ' more';
        const t = this.takeTarget;
        const blind = this.viaToss && !t.reachable;
        const caveat = blind ? ' Subject frame unreadable: page source only, no modules.' : '';
        return [
          { kind: 'Copy', items: [
            { key: 'render', icon: 'ph-code', label: 'HTML',
              desc: t.payload
                ? 'The tossed payload as it is rendering here, already self-contained.'
                : (own || (p && p.reads.length)
                    ? list + data + ', all inlined into one file.' + caveat
                    : base + ' as it stands: nothing to inline.' + caveat) },
            { key: 'brief', icon: 'ph-clipboard-text', label: 'LLM',
              desc: whole ? 'Unavailable: this page boots the whole library (~262K tokens).'
                          : list + ' as readable source, boot chain named but excluded.' + caveat },
            // Capture is the one output about the VIEW rather than the subject:
            // what actually loaded and ran, both sides of a toss, for handing a
            // session the page's real state instead of a screenshot.
            { key: 'capture', icon: 'ph-stethoscope', label: 'Capture',
              desc: 'This view’s state as JSON: scripts, components, console, and reads (sizes, not payloads).' },
          ] },
          { kind: 'Open', items: [
            { key: 'stage', icon: 'ph-stack', label: files ? 'Stage (' + files + ' file' + (files === 1 ? '' : 's') + ')' : 'Stage',
              desc: list + ' at ' + this.takeRef + ', on show-repo.' + caveat },
            // Annotate is the one take that operates ON the view rather than
            // carrying it away: notes pinned to selections, copied out as
            // markdown/JSON or saved as a jot (kits/annotate.js).
            { key: 'annotate', icon: 'ph-note-pencil', label: 'Annotate',
              desc: 'Pin notes to this page: select text or pick elements, then copy the set out or save it as a jot.'
                + (blind ? ' Subject frame unreadable: notes attach to this renderer shell, not the page.' : '') },
          ] },
          { kind: 'Save', items: [
            { key: 'export', icon: 'ph-file-archive', label: 'Zip',
              desc: base + data + ' as files. Code still loads from the CDN.' },
            { key: 'offline', icon: 'ph-hard-drives', label: 'Zip + code',
              desc: list + data + ' as files, code inlined. Opens without this repo.' },
          ] },
        ];
      },

      // takeGroups plus the page's own actions, in one ordered set. Merging here
      // rather than in the template keeps the grid dumb and means a page action
      // that names a group is indistinguishable from a built-in one.
      get takeGrid() {
        const order = ['Copy', 'Open', 'Save', 'Page'];
        const bucket = new Map(this.takeGroups.map(g => [g.kind, g.items.map(i => ({ ...i, kind: 'take' }))]));
        this.pageActions.forEach((a, i) => {
          const k = a.group || 'Page';
          if (!bucket.has(k)) bucket.set(k, []);
          bucket.get(k).push({ key: 'page:' + i, icon: a.icon || 'ph-lightning', label: a.label,
                               desc: (a.desc || a.label) + ' ' + this.actionOrigin(a),
                               kind: 'page', side: a.side, from: a.from, run: a.run });
        });
        return order.filter(k => bucket.get(k)?.length)
          .concat([...bucket.keys()].filter(k => !order.includes(k) && bucket.get(k).length))
          .map(kind => ({ kind, items: bucket.get(kind) }));
      },

      runGridItem(a) { return a.kind === 'page' ? this.runAction(a) : this.runTake(a.key); },


      async runTake(key) {
        this.outError = ''; this.outMsg = ''; this.outBusy = true;
        try {
          if (key === 'render') await this.copyRenderCopy();
          else if (key === 'brief') await this.copyBrief();
          else if (key === 'capture') await this.copyCapture();
          else if (key === 'stage') await this.openStage();
          else if (key === 'annotate') await this.openAnnotate();
          else await this.exportPage(key === 'offline');
        } catch (e) {
          this.outError = (e && e.message) || String(e);
        } finally {
          this.outBusy = false;
        }
      },

      // Assemble the brief and put it on the clipboard. io.copy (inside the
      // kit) carries the iOS click-to-copy fallback, so this works on a phone.
      async copyBrief() {
        await this.ensureBrief();
        if (!window.brief) throw new Error('brief kit unavailable (kits/brief.js failed to load)');
        const t = this.takeTarget;
        const b = await window.brief.copy({ path: t.path, gh: t.gh, scripts: t.scripts, reads: t.reads });
        this.outMsg = 'Copied ' + b.tokens.toLocaleString() + ' tokens (' +
          (b.modules + 1) + ' files, ' + Math.round(b.bytes / 1024) + 'K)';
      },

      // Hand the computed closure to the stage. The FAB is the only thing that
      // knows which files a running page actually pulled in; the stage is the
      // tool that specializes in choosing among them. Open in a new tab so the
      // page you are reviewing stays put.
      async openStage() {
        await this.ensureBrief();
        if (!window.brief) throw new Error('brief kit unavailable (kits/brief.js failed to load)');
        const t = this.takeTarget;
        const u = window.brief.stageUrl({ path: t.path, gh: t.gh, scripts: t.scripts, reads: t.reads,
                                          prompts: BRIEF_PROMPTS });
        if (!u) throw new Error('No page path to stage');
        window.open(u, '_blank', 'noopener');
        this.outMsg = 'Opened on the stage';
      },

      // Turn the annotator on, aimed at what the drawer is looking at: the
      // subject frame's document when a #gh= toss is readable (same-origin, so
      // the kit running in this shell can paint highlights and mount its UI
      // there), this document otherwise. A #gz= sandbox is opaque and gets the
      // shell, which the take's caveat already says.
      async openAnnotate() {
        if (!window.Annotate) await this._selfLoad('kits/annotate.js', () => !!window.Annotate);
        let doc = document, subject = null;
        if (this.viaToss && this.subjectReached && window.__tossFrame) {
          doc = window.__tossFrame.contentWindow.document;
          subject = { title: this.takePath,
                      url: 'https://github.com/' + this.repo + '/blob/' + this.takeRef + '/' + this.takePath };
        }
        window.Annotate.enable({ doc, subject });
        this.open = false;
        this.outMsg = 'Annotator on: select text on the page';
      },

      // Export this page + the data it read()s as one zip, via the export kit
      // (self-loaded on first use, like the console panel). Default is local-DATA
      // (code still loads from the CDN); the "Fully offline" toggle also bakes the
      // gh.load chain in (kits/build.js) so the zip opens with no network.
      async exportPage(offline) {
        await this._ensureExporter();
        const t = this.takeTarget;
        const r = await window.exporter.page({ path: t.path, gh: t.gh, scripts: t.scripts,
                                               reads: t.reads, offline: !!offline });
        this.outMsg = 'Saved ' + r.filename +
          (r.offline ? ' (+' + r.codeFiles + ' code' + (r.reads.length ? ', +' + r.reads.length + ' data)' : ')')
                     : (r.reads.length ? ' (+' + r.reads.length + ' data)' : ' (no data read yet)'));
      },

      async _ensureExporter() {
        if (!window.exporter) await this._selfLoad('kits/export.js', () => !!window.exporter);
        if (!window.exporter) throw new Error('export kit unavailable (kits/export.js failed to load)');
      },

      // The paste-and-render output: one HTML string on the clipboard, with the
      // page's own code and its read() data inlined and the third-party CDN tags
      // left as they are. io.copy carries the iOS click-to-copy fallback, so this
      // works from one tap on a phone.
      async copyRenderCopy() {
        await this._ensureExporter();
        if (!window.io?.copy) await this._selfLoad('kits/io.js', () => !!window.io?.copy);
        if (!window.io?.copy) throw new Error('io kit unavailable (kits/io.js failed to load)');
        const t = this.takeTarget;
        const r = t.payload
          ? { html: t.payload, codeFiles: 0, reads: [], dropped: [], chainless: true,
              bytes: t.payload.length, cdnRefs: window.exporter.cdnRefs(t.payload) }
          : await window.exporter.renderCopy({ path: t.path, gh: t.gh, scripts: t.scripts, reads: t.reads });
        await window.io.copy(r.html);
        const size = Math.max(1, Math.round(r.bytes / 1024)) + 'K';
        // Say which of the two shapes came back. A page with no chain is not a
        // failed bundle, so it gets its own wording rather than "0 code".
        const notes = [];
        if (r.dropped.length) notes.push(r.dropped.length + ' read not serializable');
        // Say it at copy time. This is the difference between a paste that works
        // and one that half-renders on a private repo, and it is invisible in the
        // string itself.
        if (r.cdnRefs) notes.push(r.cdnRefs + ' runtime CDN ref' + (r.cdnRefs === 1 ? '' : 's') + ' left');
        this.outMsg = (r.chainless
          ? 'Copied ' + size + (t.payload ? ' (the tossed payload as-is)'
                                          : ' (self-contained page, nothing to inline)')
          : 'Copied ' + size + ' (+' + r.codeFiles + ' code' +
            (r.reads.length ? ', +' + r.reads.length + ' data)' : ')'))
          + (notes.length ? ', ' + notes.join(', ') : '');
      },

      scrollConsole() {
        this.$nextTick(() => {
          const p = document.getElementById('__fab-console-panel');
          if (p) p.scrollTop = p.scrollHeight;
        });
      }
    };
  });
});
