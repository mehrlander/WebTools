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
      description: 'Draggable floating button that doubles as a view-mode indicator: its launcher shows the neutral sidebar mark whenever the view sits at the default branch and a warning-tinted disc only when it is rendered off it (a toss, or a ?use= lib pin, at some other ref — a toss at main is main, so it reads neutral); off the default branch the drawer adds a preview banner whose button (labeled with the default branch, "main") returns to the live deployed page. Opens a right-side drawer with two tabs. Render (the default) surveys which branches carry a different version of this page (blob-compare against the default branch), marks the ref currently rendered, and tosses it at any ref: outside a toss the action navigates to toss-render (the one renderer, no bespoke overlay), inside one it re-addresses in place via __tossNavigate. Inspect merges the page scripts (loaded via gh.load(), with per-entry status) and Alpine components (tap to outline in place) into one scroll; in a #gh= toss it scans the subject frame too, listing the tossed page first and badging the rows that belong to the shell. A header hard-refresh button reloads bypassing the browser cache, for Safari on iOS. Plus a collapsible console and a compact version chip. Singleton per viewport: toss-render stamps __fabHosted so a fab booting under it declines to mount (handing the rendered subject up via __tossSubject/__tossFrame for the shell fab to adopt), and a fab booting inside an iframe declines on its own (data-allow-framed opts back in) — the host page offers the bust-out instead',

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
                <button @click="activeTab = 'render'; loadPageBranches()"
                        class="flex items-center gap-1.5 px-2 py-1 rounded text-sm font-semibold transition-colors"
                        :class="activeTab === 'render' ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:bg-base-200'">
                  <i class="ph ph-monitor-play text-base"></i>
                  <span>Render</span>
                  <span x-show="updatedCount" class="font-mono text-[10px] text-primary font-bold" x-text="updatedCount"></span>
                </button>
                <button @click="activeTab = 'inspect'; detect()"
                        class="flex items-center gap-1.5 px-2 py-1 rounded text-sm font-semibold transition-colors"
                        :class="activeTab === 'inspect' ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:bg-base-200'">
                  <i class="ph ph-magnifying-glass text-base"></i>
                  <span>Inspect</span>
                </button>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button x-show="activeTab === 'inspect'" @click="detect()" class="btn btn-ghost btn-xs btn-square" title="Rescan page" aria-label="Rescan">
                  <i class="ph ph-arrows-clockwise"></i>
                </button>
                <button @click="hardRefresh()" class="btn btn-ghost btn-xs btn-square" title="Hard refresh: reload bypassing the browser cache" aria-label="Hard refresh">
                  <i class="ph ph-arrow-clockwise"></i>
                </button>
              </div>
            </header>

            <!-- Off-canvas escape banner: the way out of a preview (toss or
                 ?use=) of a non-default ref. The launcher color already flags
                 the mode; this is the labeled exit, shown in the drawer only
                 when off-canonical. The button returns to the live page, which
                 is the default branch's (main's) version, so it is labeled with
                 that branch name and the baseline house icon the branch list
                 uses — and so it is hidden at the default branch, where it
                 would offer a trip to where you already are. -->
            <div x-show="offRef" class="shrink-0 flex items-center gap-2 px-2.5 py-1.5 bg-warning/10 border-b border-warning/30 text-[11px]">
              <i class="ph ph-disc text-warning shrink-0"></i>
              <span class="min-w-0 truncate">Previewing <span class="font-mono font-semibold" x-text="previewRef"></span></span>
              <button @click="returnToLive()" class="ml-auto shrink-0 btn btn-warning btn-xs gap-1"
                      :title="'Return to the live page (the ' + (defaultBranch || 'main') + ' version)'">
                <i class="ph ph-house-line"></i><span class="font-mono normal-case" x-text="defaultBranch || 'main'"></span>
              </button>
            </div>

            <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div x-show="activeTab === 'render'" class="p-2 border-b border-base-300/60 shrink-0">
                <template x-if="repo">
                  <a :href="'https://github.com/' + repo" target="_blank" class="px-1 font-mono text-sm font-bold link link-hover block" x-text="repo"></a>
                </template>
                <div x-show="!repo" class="px-1 font-mono text-sm font-bold">Source unknown</div>
                <div x-show="path" class="px-1 font-mono text-[10px] text-base-content/60 truncate" x-text="path"></div>
                <div x-show="ver || verLoading || verError" class="px-1 mt-1.5 pt-1.5 border-t border-base-300/40">
                  <div class="flex items-center gap-1.5 text-[10px] font-mono">
                    <i class="ph ph-git-commit opacity-50 shrink-0"></i>
                    <span x-show="verLoading" class="opacity-50">checking version…</span>
                    <template x-if="ver && !verLoading">
                      <span class="flex items-center gap-x-1.5 min-w-0"
                            :title="(ver.ref || '') + (ver.since > 0 ? ' · +' + ver.since + ' commits on the latest merge' : '') + (ver.prTitle ? ' · ' + ver.prTitle : '')">
                        <a :href="ver.tipUrl" target="_blank" class="link link-hover font-semibold" x-text="'@' + ver.sha"></a>
                        <template x-if="ver.pr">
                          <a :href="ver.prUrl" target="_blank" class="link link-hover text-primary shrink-0" x-text="'#' + ver.pr"></a>
                        </template>
                        <span x-show="ver.ago" class="opacity-40 truncate" x-text="ver.ago"></span>
                      </span>
                    </template>
                    <button @click="loadVersion(true)" class="ml-auto opacity-40 hover:opacity-80 shrink-0" title="Refresh version" aria-label="Refresh version">
                      <i class="ph ph-arrows-clockwise"></i>
                    </button>
                  </div>
                  <div x-show="verError" class="text-[10px] text-error/70 break-all mt-0.5 pl-4" x-text="verError"></div>
                </div>

                <div x-show="repo" class="flex gap-1 mt-1.5">
                  <template x-for="link in pageLinks" :key="link.l">
                    <a :href="link.u" target="_blank" :title="link.l"
                       class="flex-1 flex items-center justify-center gap-1.5 bg-base-200 hover:bg-base-300 rounded-lg py-1.5 text-sm">
                      <i class="ph text-base" :class="link.i"></i>
                    </a>
                  </template>
                </div>

                <div x-show="pageActions.length" class="flex flex-wrap gap-1 mt-1.5">
                  <template x-for="(a, i) in pageActions" :key="i">
                    <button @click="runAction(a)" class="btn btn-xs gap-1" :title="a.label">
                      <i x-show="a.icon" class="ph text-base" :class="a.icon"></i><span x-text="a.label"></span>
                    </button>
                  </template>
                </div>
                <div x-show="actionMsg" class="text-[10px] text-success font-mono mt-0.5 px-1" x-text="actionMsg"></div>
              </div>

              <!-- Inspect: the page's loaded scripts (top) and Alpine components
                   (below), merged into one scroll. Skips the repo/version/links
                   context block the Render tab carries. In a #gh= toss the
                   subject's same-origin frame is scanned too (subjectInspect),
                   with the subject listed first and this shell's rows badged
                   "shell"; when the frame isn't readable (a #gz= payload toss),
                   the caveat line says the lists cover only the shell. -->
              <div x-show="activeTab === 'inspect'" class="min-h-0 flex-1 flex flex-col">
                <div x-show="viaToss && !subjectInspect" class="px-2.5 pt-2 flex items-center gap-1 text-[10px] text-base-content/50 shrink-0">
                  <i class="ph ph-disc shrink-0"></i>
                  <span>These describe the toss-render shell, not the tossed page.</span>
                </div>

                <div class="px-2.5 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-base-content/50 font-semibold shrink-0">Scripts</div>
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
                        <a :href="scriptUrl(s)" target="_blank"
                           class="flex-1 font-mono text-[11px] truncate link link-hover" x-text="s.path"></a>
                        <span x-show="s.side === 'shell'" class="text-[9px] font-sans font-semibold uppercase tracking-wide text-base-content/40 shrink-0">shell</span>
                        <span x-show="s.auto" class="text-[10px] text-base-content/50 shrink-0">auto</span>
                        <span x-show="s.by && s.by.size > 0" class="text-[10px] text-base-content/60 shrink-0">
                          <span class="opacity-50">by:</span> <span x-text="Array.from(s.by || []).join(', ')"></span>
                        </span>
                        <span class="font-mono text-[10px] text-base-content/40 shrink-0" x-text="fmtElapsed(s)"></span>
                      </div>
                      <div x-show="s.error" class="px-2 pb-1.5 font-mono text-[10px] text-error break-all" x-text="s.error"></div>
                    </div>
                  </template>
                </div>

                <div class="flex items-center justify-between px-2.5 pt-2 pb-0.5 border-t border-base-300/60 shrink-0">
                  <div class="text-[10px] uppercase tracking-wider text-base-content/50 font-semibold">Components</div>
                  <button @click="clearHighlight()" x-show="highlighted" class="text-[10px] font-normal link link-hover">clear</button>
                </div>
                <div x-show="groups.length > 0" class="min-h-0 flex-1 overflow-y-auto p-2 pt-1 space-y-2">
                  <template x-for="g in groups" :key="g.key">
                    <div class="bg-base-200/40 rounded-lg overflow-hidden border border-base-300/60">
                      <div class="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-base-200/80">
                        <div class="flex items-baseline gap-1.5 min-w-0">
                          <span class="font-mono text-base font-semibold truncate" x-text="g.name"></span>
                          <span class="text-[10px] font-mono text-base-content/50 shrink-0">&times;<span x-text="g.instances.length"></span></span>
                          <span x-show="subjectInspect && g.shell" class="text-[9px] font-sans font-semibold uppercase tracking-wide text-base-content/40 shrink-0">shell</span>
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
                      <div x-show="g.description" class="text-[11px] text-base-content/70 px-2.5 py-1 border-t border-base-300/40" x-text="g.description"></div>
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

              <div x-show="activeTab === 'render'" class="min-h-0 flex-1 flex flex-col">
                <div x-show="!path" class="text-sm text-base-content/50 italic px-3 py-6 text-center">
                  No page path detected on this URL.
                </div>
                <template x-if="path">
                  <div class="p-2 flex flex-col gap-2 min-h-0 flex-1">
                    <div class="min-h-0 flex-1 flex flex-col">
                      <div class="flex items-center justify-between mb-1 shrink-0">
                        <div class="text-[10px] uppercase tracking-wider opacity-50 font-semibold flex items-center gap-1">
                          Branches
                          <i x-show="branchNote" class="ph ph-key text-warning/80" :title="branchNote"></i>
                        </div>
                        <button @click="loadPageBranches(true)" class="text-[10px] link link-hover"
                                :class="pageBranchesLoading ? 'opacity-50 pointer-events-none' : ''">refresh</button>
                      </div>
                      <div x-show="pageBranchesLoading" class="flex justify-center py-3 shrink-0">
                        <span class="loading loading-dots loading-md opacity-50"></span>
                      </div>
                      <!-- Two rows per branch. Row 1 is identity and verdict;
                           row 2 is the standing against main, which is what the
                           single-line list could never say. The repo carries
                           ~290 branches, nearly all dead, so the ones that hold
                           another version of THIS page lead and the rest
                           collapse behind a count. -->
                      <div x-show="!pageBranchesLoading" class="min-h-0 flex-1 overflow-y-auto flex flex-col gap-0.5">
                        <template x-for="b in visibleBranches" :key="b.name">
                          <button @click="pickFrameRef(b.name)"
                                  class="flex flex-col gap-0.5 px-1.5 py-1 rounded text-left transition-colors"
                                  :class="[b.name === frameRef ? 'bg-primary/10 text-primary' : 'hover:bg-base-300/50',
                                           (b.status === 'same' || b.status === 'missing') ? 'opacity-50' : '']">
                            <span class="flex items-center gap-1.5 text-[11px] font-mono w-full">
                              <i class="ph text-sm shrink-0"
                                 :class="b.status === 'baseline' ? 'ph-house-line opacity-50' : 'ph-git-branch opacity-50'"></i>
                              <span class="truncate" :class="b.name === frameRef && 'font-bold'" x-text="b.name"></span>
                              <span x-show="b.name === viewingRef" class="shrink-0 text-[8px] font-sans font-bold uppercase tracking-wide px-1 rounded bg-warning/20 text-warning" title="the ref this view is currently rendered at">current</span>
                              <span class="shrink-0 text-[9px] font-sans font-semibold uppercase tracking-wide ml-auto"
                                    :class="b.status === 'differs' ? 'text-primary' : 'text-base-content/40'"
                                    x-text="b.status === 'differs' ? 'differs' :
                                            b.status === 'baseline' ? 'baseline' :
                                            b.status === 'same' ? 'same' :
                                            b.status === 'missing' ? 'no file' : ''"></span>
                              <i x-show="b.name === frameRef" class="ph ph-check text-sm shrink-0"></i>
                            </span>
                            <span class="flex items-center gap-1.5 text-[10px] pl-[18px] w-full opacity-70">
                              <!-- Divergence against the default branch, fetched
                                   only for the rows worth spending a call on. -->
                              <span x-show="b.div" class="shrink-0 font-mono flex items-center gap-1">
                                <span x-show="b.div && b.div.ahead" class="text-success" x-text="'↑' + (b.div && b.div.ahead)" title="commits on this branch not on the default branch"></span>
                                <span x-show="b.div && b.div.behind" class="text-warning" x-text="'↓' + (b.div && b.div.behind)" title="commits on the default branch not on this one"></span>
                                <span x-show="b.div && !b.div.ahead && !b.div.behind" class="opacity-50">even</span>
                                <span x-show="b.div && b.div.merged" class="text-[9px] font-sans uppercase tracking-wide opacity-60" title="every commit here is already on the default branch">merged</span>
                              </span>
                              <span x-show="b.divBusy" class="loading loading-dots loading-xs opacity-40"></span>
                              <span class="truncate opacity-70" x-text="b.subject || ''" :title="b.subject || ''"></span>
                              <span x-show="b.ago" class="ml-auto shrink-0 opacity-60 whitespace-nowrap"
                                    x-text="b.ago" :title="b.date"></span>
                            </span>
                          </button>
                        </template>
                        <button x-show="hiddenBranchCount || showAllBranches" @click="expandBranches()"
                                class="text-[10px] opacity-50 hover:opacity-90 py-1 px-1 text-left">
                          <span x-show="!showAllBranches" x-text="'+ ' + hiddenBranchCount + ' more (same or no copy of this page)'"></span>
                          <span x-show="showAllBranches">collapse the unchanged</span>
                        </button>
                        <div x-show="!pageBranches.length" class="text-[10px] opacity-50 py-1 px-1">No branches loaded.</div>
                      </div>
                    </div>

                    <div class="shrink-0">
                      <div class="flex items-center gap-1.5 mb-1">
                        <div class="text-[10px] uppercase tracking-wider opacity-50 font-semibold">Any ref</div>
                        <div class="text-[10px] opacity-50 ml-auto">selected <span class="font-mono text-base-content/80" x-text="frameRef || 'main'"></span></div>
                      </div>
                      <div class="flex gap-1">
                        <input x-model="frameRefInput" placeholder="branch / tag / sha"
                               @keyup.enter="applyFrameRef()"
                               class="input input-xs input-bordered flex-1 font-mono text-[11px]">
                        <button @click="applyFrameRef()" :disabled="!frameRefInput.trim()" class="btn btn-xs">Set</button>
                      </div>
                    </div>

                    <button @click="renderAtRef()" :disabled="!viaToss && !tossUrl" class="btn btn-primary gap-1 w-full shrink-0"
                            :title="viaToss ? 'Re-toss: re-render at the selected ref in place.'
                                            : (tossUrl ? 'Toss: go to a full render of this page at the selected ref. Leaves this page; the Live handle on the button brings you back.'
                                                       : 'Toss needs an allowlisted repo.')">
                      <i class="ph ph-disc"></i><span x-text="viaToss ? 'Re-toss at ref' : 'Toss'"></span>
                    </button>
                    <div x-show="!viaToss && !tossUrl" class="text-[10px] text-base-content/40 leading-snug shrink-0">Toss renders through toss-render, which serves owner repos only.</div>
                    <div x-show="frameError" class="text-[10px] text-error font-mono break-all shrink-0" x-text="frameError"></div>

                    <!-- Take-away menu. One trigger, four named outputs, each
                         stating what it gives you and roughly how big it is:
                         the old single button + orphan "offline" checkbox left
                         you to remember which of two zips you were about to get. -->
                    <div x-show="!viaToss" class="border-t border-base-300/60 pt-2 flex flex-col gap-1 shrink-0">
                      <div class="dropdown dropdown-top w-full">
                        <div tabindex="0" role="button" @focus="ensureBrief()" @mouseenter="ensureBrief()"
                             class="btn btn-sm w-full gap-1" :class="outBusy && 'pointer-events-none'">
                          <span x-show="!outBusy" class="flex items-center gap-1">
                            <i class="ph ph-export"></i><span>Take this page</span>
                            <i class="ph ph-caret-up opacity-50 text-xs"></i>
                          </span>
                          <span x-show="outBusy" class="loading loading-spinner loading-xs"></span>
                        </div>
                        <ul tabindex="0" class="dropdown-content z-50 menu menu-sm bg-base-100 rounded-box shadow-lg border border-base-300 w-full mb-1 p-1 flex-nowrap max-h-72 overflow-y-auto">
                          <li class="menu-title text-[10px] px-2 py-1 leading-snug">
                            <span x-text="takeSummary"></span>
                          </li>
                          <template x-for="a in takeActions" :key="a.key">
                            <li>
                              <!-- One wrapper child: daisyUI lays a menu item
                                   out as a grid, so stacking has to happen
                                   inside the button, not across its children. -->
                              <button @click="runTake(a.key); $el.closest('.dropdown')?.querySelector('[tabindex]')?.blur()"
                                      class="py-1.5">
                                <span class="flex flex-col items-start gap-0.5 w-full text-left">
                                  <span class="flex items-center gap-1.5 font-semibold text-[12px]">
                                    <i class="ph" :class="a.icon"></i><span x-text="a.label"></span>
                                  </span>
                                  <span class="text-[10px] opacity-60 leading-snug font-normal" x-text="a.desc"></span>
                                </span>
                              </button>
                            </li>
                          </template>
                        </ul>
                      </div>
                      <div x-show="outMsg" class="text-[10px] text-success font-mono break-all" x-text="outMsg"></div>
                      <div x-show="outError" class="text-[10px] text-error font-mono break-all" x-text="outError"></div>
                    </div>
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
                        class="inline-flex items-center justify-center text-[9px] font-bold leading-none rounded-full bg-error text-error-content px-1 min-w-[14px]"></span>
                  <span x-show="consoleLogs.length" class="font-mono text-[10px] opacity-50" x-text="consoleLogs.length"></span>
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
                    <div class="flex gap-1.5 items-baseline px-1.5 py-0.5 rounded border-l-2 font-mono text-[11px] text-base-content"
                         :class="entry.level === 'error' ? 'border-error bg-error/10' :
                                 entry.level === 'warn'  ? 'border-warning bg-warning/10' :
                                                           'border-base-300 bg-base-100'">
                      <span class="text-base-content/30 shrink-0 text-[10px]" x-text="fmtTime(entry.time)"></span>
                      <span class="shrink-0 w-8 text-[10px] uppercase font-bold"
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
      actionMsg: '',

      ver: null, verLoading: false, verError: '', verLoaded: false,

      frameRef: 'main', frameRefInput: '',
      pageBranches: [], pageBranchesLoading: false, pageBranchesLoaded: false,
      showAllBranches: false, _branchGh: null,
      defaultBranch: 'main', branchNote: '',
      frameError: '',

      // Toss adoption: when toss-render stamps window.__tossSubject, the fab
      // retargets repo/path/ref at the rendered subject; shell* keeps the
      // hosting page's own identity for the Components/Scripts link targets.
      // hosted: this copy declined to mount (a host shell owns the viewport).
      viaToss: false, hosted: false,
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

        // read() registry (gh-boot wraps read() to populate window.__reads) —
        // drives the Bundle affordance's "page + N data files" count.
        this.reads = window.__reads ? [...window.__reads] : [];
        this._readsListener = () => { this.reads = window.__reads ? [...window.__reads] : []; };
        window.addEventListener('reads', this._readsListener);
      },

      destroy() {
        if (this._offConsole) this._offConsole();
        if (this._consoleListener) window.removeEventListener('consolelog', this._consoleListener);
        if (this._scriptsListener) window.removeEventListener('loadedscripts', this._scriptsListener);
        if (this._readsListener) window.removeEventListener('reads', this._readsListener);
        if (this._subjectListener) window.removeEventListener('toss-subject', this._subjectListener);
      },

      // Take on (or drop) the toss subject. The subject is what the viewer is
      // actually looking at, so repo/path/ref — and everything downstream:
      // header identity, version readout, page links, the render tab — follow
      // it. Cleared subject (an inline #gz= toss, or back to the input panel)
      // restores the shell's own identity.
      adoptSubject() {
        const s = window.__tossSubject;
        if (s && s.repo) {
          this.viaToss = true;
          this.repo = s.repo;
          this.path = s.path || '';
          this.ref = s.ref || 'main';
        } else {
          if (!this.viaToss) return;
          this.viaToss = false;
          this.repo = this.shellRepo;
          this.path = this.shellPath;
          this.ref = this.shellRef;
        }
        this.frameRef = this.ref || 'main';
        this.ver = null; this.verLoaded = false; this.verError = '';
        // defaultBranch resets with the rest of the survey: it is a property of
        // the repo just dropped, and previewRef compares against it, so carrying
        // a stale 'master' into a main-defaulted repo would re-mislabel main as
        // a preview. 'main' is the guess until loadPageBranches says otherwise.
        this.pageBranches = []; this.pageBranchesLoaded = false; this.branchNote = '';
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
      async runAction(a) {
        try {
          const m = await a.run();
          if (typeof m === 'string' && m) {
            this.actionMsg = m;
            setTimeout(() => { if (this.actionMsg === m) this.actionMsg = ''; }, 1400);
          }
        } catch (e) {
          this.actionMsg = 'Failed: ' + ((e && e.message) || e);
          setTimeout(() => { this.actionMsg = ''; }, 2500);
        }
      },

      detect() {
        this.clearHighlight();
        this._elById = new Map();
        this._instanceCounter = 0;

        // One scan per document. `shell` marks this hosting page's own
        // components (vs the toss subject's); actions are only collected from
        // the shell side — a subject's action closures belong to its window
        // and would surface here with no provenance, so they stay put.
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
                if (shell && data && Array.isArray(data.actions) && data.actions.length) groups[key].actions = data.actions;
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
        this._subjectGh = null;
        let subjectGroups = [];
        if (this.viaToss && window.__tossFrame) {
          try {
            const win = window.__tossFrame.contentWindow;
            const doc = window.__tossFrame.contentDocument;
            if (win && doc && win.Alpine) {
              this._ensureHighlightStyle(doc);
              subjectGroups = scan(doc, win.Alpine, false);
              this.subjectScripts = win.__loadedScripts ? win.__loadedScripts.map(s => ({ ...s })) : [];
              this._subjectGh = { repo: win.gh?.repo || 'mehrlander/web-tools',
                                  ref: win.gh?.ref || 'main',
                                  base: win.gh?.loadBase || '' };
              this.subjectInspect = true;
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
      // an `actions` array. Rendered in the always-visible header, so a page's
      // own actions are reachable from any tab.
      get pageActions() { return this.groups.flatMap(g => g.actions || []); },
      get totalInstances() { return this.groups.reduce((s, g) => s + g.instances.length, 0); },
      get errorCount() { return this.consoleLogs.filter(e => e.level === 'error').length; },

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

      fmtTime(ts) { return new Date(ts).toTimeString().slice(0, 8); },

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
        try { const u = new URLSearchParams(location.search).get('use'); if (u) return this._offDefault(u); } catch (e) {}
        return null;
      },
      get offRef() { return !!this.previewRef; },
      get viewingRef() { return this.previewRef || this.defaultBranch || 'main'; },

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

      get updatedCount() { return this.pageBranches.filter(b => b.status === 'differs').length; },

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

      pickFrameRef(name) { this.frameRef = name; },

      // The toss action. In a toss, re-address the shell at the picked ref in
      // place (toss-render re-fetches, re-stamps the subject, this fab re-adopts).
      // Outside one, go TO the toss: navigate to toss-render at the picked ref,
      // same tab, so the fab rides along and the escape handle brings you back.
      // No bespoke overlay renderer — toss-render is the one renderer now.
      renderAtRef() {
        const ref = this.frameRef || 'main';
        if (this.viaToss) {
          if (this.repo && this.path && typeof window.__tossNavigate === 'function') {
            window.__tossNavigate(this.repo + '@' + ref + ':' + this.path);
          }
          return;
        }
        if (this.tossUrl) location.href = this.tossUrl;
      },

      applyFrameRef() {
        const v = (this.frameRefInput || '').trim();
        if (!v) return;
        this.frameRef = v;
        this.frameRefInput = '';
      },

      // What a take-away would contain, read off the runtime closure without
      // fetching anything: the menu can be honest about scope before you pick.
      // briefReady is the reactive gate: window.brief is not reactive, so the
      // menu would render its fallback copy forever without a tracked flag to
      // re-run these getters once the kit lands.
      get takePlan() {
        if (!this.briefReady || !window.brief) return null;
        try { return window.brief.plan({ path: this.path }); } catch (e) { return null; }
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

      get takeSummary() {
        const p = this.takePlan;
        if (!p) return 'Page source, its modules, and the data it reads.';
        const bits = [(p.own.length || 0) + ' own module' + (p.own.length === 1 ? '' : 's')];
        if (p.floor.length) bits.push(p.floor.length + ' boot');
        if (p.reads.length) bits.push(p.reads.length + ' data');
        if (p.vendor.length) bits.push(p.vendor.length + ' vendor');
        return bits.join(' · ');
      },

      // The four outputs, each named for what you get rather than for the
      // mechanism. Descriptions are the affordance: they say what lands.
      get takeActions() {
        const p = this.takePlan;
        const own = p ? p.own.length : 0;
        const whole = p && p.wholeLib;
        return [
          { key: 'brief', icon: 'ph-clipboard-text', label: 'Copy review brief',
            desc: whole ? 'Unavailable: this page boots the whole library (~262K tokens).'
                        : 'Markdown to paste into a chat model. Page + its ' + own + ' module' +
                          (own === 1 ? '' : 's') + '; boot chain named, not included.' },
          { key: 'stage', icon: 'ph-stack', label: 'Open on the stage',
            desc: 'Same fileset, on show-repo: pick, trim, diff, copy, download.' },
          { key: 'export', icon: 'ph-file-archive', label: 'Download zip + data',
            desc: 'Page source + the data it read()s. Code still loads from the CDN.' },
          { key: 'offline', icon: 'ph-hard-drives', label: 'Download offline bundle',
            desc: 'Also inlines the code chain, so unzip-and-open needs no network.' },
        ];
      },

      async runTake(key) {
        this.outError = ''; this.outMsg = ''; this.outBusy = true;
        try {
          if (key === 'brief') await this.copyBrief();
          else if (key === 'stage') await this.openStage();
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
        const b = await window.brief.copy({ path: this.path });
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
        const u = window.brief.stageUrl({ path: this.path, prompts: BRIEF_PROMPTS });
        if (!u) throw new Error('No page path to stage');
        window.open(u, '_blank', 'noopener');
        this.outMsg = 'Opened on the stage';
      },

      // Export this page + the data it read()s as one zip, via the export kit
      // (self-loaded on first use, like the console panel). Default is local-DATA
      // (code still loads from the CDN); the "Fully offline" toggle also bakes the
      // gh.load chain in (kits/build.js) so the zip opens with no network.
      async exportPage(offline) {
        if (!window.exporter) await this._selfLoad('kits/export.js', () => !!window.exporter);
        if (!window.exporter) throw new Error('export kit unavailable (kits/export.js failed to load)');
        const r = await window.exporter.page({ path: this.path, offline: !!offline });
        this.outMsg = 'Saved ' + r.filename +
          (r.offline ? ' (+' + r.codeFiles + ' code' + (r.reads.length ? ', +' + r.reads.length + ' data)' : ')')
                     : (r.reads.length ? ' (+' + r.reads.length + ' data)' : ' (no data read yet)'));
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
