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
    //               kinds, or curation, just text + done).
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
    // Clip an item's text for a commit subject line.
    const clip = (s, n = 60) => s.length > n ? s.slice(0, n - 1) + '…' : s;

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

                 Refresh is sync + reload: force a re-read of every repo's
                 .web-tools.json into the registry config cache, then reload these
                 cards. The cards update on their own after an in-app config edit;
                 this is the manual path for a change made elsewhere (another
                 session, a direct commit) or just to confirm the latest. Routes
                 through the shell's refreshConfigs, which awaits the rebuild and
                 then fires configs-refreshed, the one signal the estate reloads
                 on. The shield's estate panel held this same button, which is
                 why retiring the shield cost nothing. -->
            <div x-show="authed" class="flex items-center justify-end gap-3 mb-3">
              <button @click="accountPanel()" title="GitHub token"
                      class="flex items-center gap-1.5 text-base text-base-content/40 hover:text-primary transition-colors">
                <i class="ph text-base leading-none"
                   :class="window.__shell?._authState === 'expired' ? 'ph-warning text-warning' : 'ph-shield-check text-success'"></i>
                <span class="font-mono" x-text="window.__shell?._authUser || 'token'"></span>
              </button>
              <button @click="window.__shell?.refreshConfigs()"
                      :disabled="window.__shell?.configRefreshing"
                      class="btn btn-ghost btn-sm gap-1.5 border border-base-300 disabled:opacity-60 tooltip tooltip-left"
                      data-tip="Re-read every repo's config into the cache and reload the cards">
                <i class="ph ph-arrows-clockwise text-base" :class="window.__shell?.configRefreshing && 'animate-spin'"></i>
                <span x-text="window.__shell?.configRefreshing ? 'Syncing…' : 'Refresh'"></span>
              </button>
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
              <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 shrink-0" role="tablist">
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
          <div x-show="tab==='activity' || tab==='sessions' || tab==='guides'"
               class="flex items-center gap-2 mb-4 flex-wrap">
            <!-- No counts on these pills. The Branches badge read
                 openBranches.length, which is the SCOPED list, so it moved with
                 the scope chip and reported "98" for Recent while the estate
                 held 222 branches. A number in a tab is read as that tab's
                 total, and this one never was. The counts that are honest are
                 already one row down: a per-scope count on every chip, and the
                 window row's "N of M". Dropping them also gives the row back
                 the horizontal space it was wrapping for on a phone. -->
            <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 shrink-0" role="tablist">
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
            </div>
            <div class="grow"></div>
            <!-- Sessions' own as-of + Refresh. Its crawl is a tree read plus a
                 few blobs rather than a per-repo branch survey, so it carries
                 a spinner where Open needs a determinate bar. -->
            <template x-if="tab==='sessions' && authed">
              <div class="flex items-center gap-2">
                <span x-show="sessionsGeneratedAt" class="hidden sm:inline text-base text-base-content/45"
                      x-text="'as of ' + agoOf(sessionsGeneratedAt)"></span>
                <button @click="refreshSessions()" :disabled="sessionsBusy"
                  class="btn btn-ghost btn-sm gap-1.5 text-base">
                  <i class="ph ph-arrows-clockwise" :class="sessionsBusy && 'animate-spin'"></i>
                  <span x-text="sessionsBusy ? 'Crawling…' : 'Refresh'"></span>
                </button>
              </div>
            </template>
            <template x-if="tab==='guides' && authed">
              <div class="flex items-center gap-2">
                <span x-show="guidesLoadedAt && !guidesBusy" class="hidden sm:inline text-base text-base-content/45"
                      x-text="'as of ' + agoOf(guidesLoadedAt)"></span>
                <button @click="loadGuides(true)" :disabled="guidesBusy"
                        class="btn btn-ghost btn-sm gap-1.5 text-base">
                  <i class="ph ph-arrows-clockwise" :class="guidesBusy && 'animate-spin'"></i>
                  <span x-text="guidesBusy ? 'Reading…' : 'Refresh'"></span>
                </button>
              </div>
            </template>
            <template x-if="tab==='activity' && authed">
              <div class="flex items-center gap-2">
                <!-- While the crawl runs the as-of reading is the one thing the
                     reader already knows is stale, so the slot carries the
                     progress instead and returns to as-of when it lands. -->
                <span x-show="!activityBusy && activityGeneratedAt" class="hidden sm:inline text-base text-base-content/45"
                      x-text="'as of ' + agoOf(activityGeneratedAt)"></span>
                <span x-show="activityBusy" class="hidden sm:inline text-base text-base-content/60"
                      x-text="activityProgressLabel"></span>
                <button @click="refreshActivity()" :disabled="activityBusy"
                        class="flex items-center gap-1.5 text-base text-base-content/60 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors">
                  <i class="ph ph-arrows-clockwise" :class="activityBusy && 'animate-spin'"></i>
                  <!-- No label while busy: below sm the progress line under the
                       bar carries the count, and above it the span to the left
                       does, so a third copy on the button would only repeat. -->
                  <span x-show="!activityBusy">Refresh</span>
                </button>
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
          <div x-show="tab==='activity' || tab==='sessions' || tab==='guides'"
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
          <div class="flex-1 min-w-0" :class="tab==='activity' ? '' : 'hidden'">
            <!-- No pane header. The pill row above names this pane, carries its
                 count, and holds Open's as-of + Refresh at every width now, so
                 the lg-only header that used to do all three here would be a
                 second copy sitting one line below the first. -->
            <!-- The determinate bar: repos finished over repos total, nothing
                 smoothed in between. It is what turns a long wait from "hung"
                 into "two thirds through", and it sits above the list on both
                 layouts (the pill row hides on lg+, this column does not). -->
            <div x-show="activityBusy" class="mb-3">
              <!-- A styled div, not <progress>: a progress element with no value
                   (or a value some Alpine/daisyUI pairing drops) falls back to
                   the INDETERMINATE sweep, which is exactly the churn this
                   replaces, and it does it at 0 of N, the moment the reading
                   matters most. An explicit width cannot fall back. -->
              <div class="h-1 w-full rounded-full bg-base-300 overflow-hidden" role="progressbar"
                   :aria-valuenow="activityProgressPct" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full bg-primary rounded-full transition-[width] duration-300"
                     :style="'width:' + activityProgressPct + '%'"></div>
              </div>
              <!-- Narrow screens: the header slot above is hidden below sm, so
                   the bar carries its own caption. -->
              <div class="sm:hidden mt-1 text-sm text-base-content/50 truncate"
                   x-text="activityProgressLabel + (activityProgressActive ? ' · ' + activityProgressActive : '')"></div>
            </div>
            <p x-show="!authed" class="text-base text-base-content/60">
              Open branches live in the private registry. Add a token on Repos to see them.
            </p>

            <!-- ── Scope chips ───────────────────────────────────────────────
                 The list's first axis: which of the survey's groups to show
                 (see BRANCH_SCOPES). A fixed row, unlike the repo chips below
                 it, since an empty scope is still an answer and a stable
                 position is worth more here than a tight row. Each carries its
                 count off the FULL list, so the row doubles as the estate's
                 branch census, and its tooltip carries the definition, so no
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
                <template x-for="d in [1, 3, 7, 14]" :key="d">
                  <button @click="setBranchWindow(d)"
                          class="px-2 py-0.5 rounded-md font-medium transition-colors"
                          :class="branchWindow === d ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'"
                          x-text="d + 'd'"></button>
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
                    <!-- PR reference in the GitHub #-number style, colored by state
                         (the left rail carries the same green/amber/muted cue). -->
                    <a x-show="row.pr" :href="row.pr ? prUrl(row.repo, row.pr.number) : '#'" target="_blank"
                       :title="row.pr?.title + (row.pr?.draft ? ' (draft)' : ' (ready for review)')"
                       class="font-mono text-base font-bold text-base-content/90 shrink-0 hover:text-primary transition-colors"
                       x-text="'#' + (row.pr?.number)"></a>
                    <span x-show="!row.pr" class="font-mono text-base text-base-content/40 shrink-0">no&nbsp;PR</span>
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
                  <div class="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-2 text-base">
                    <!-- No Stage button: staging lives in the GitHub menu now
                         (the branch name opens the detail takeover). A spinner
                         rides here while a staging compare is in flight. -->
                    <span x-show="isStaging(row.repo, row.name)" class="flex items-center gap-1.5 text-base-content/70">
                      <i class="ph ph-circle-notch animate-spin text-lg"></i>Staging…</span>
                    <!-- One GitHub button instead of the old Tree + Compare
                         pair. Those two were one tap each and this menu is
                         two, which only pays because the menu holds
                         destinations that had no route at all: the PR's files
                         and checks tabs, the branch's commits, and New pull
                         request, the one action a no-PR row could not reach.
                         It also gives the row's action line back the width the
                         pair was spending. Same anchored-panel pattern as the
                         sidebar's repo menu, sharing its geometry
                         (shell.anchorMenu); the Claude session mark and the
                         #-number stay outside it, since neither is GitHub
                         navigation and the session mark has no other route. -->
                    <button @click.stop="openBranchMenu(row, $event)"
                            @mouseenter="hoverBranchMenu(row, $event)" @mouseleave="hoverLeaveBranchMenu()"
                            :title="'GitHub links for ' + row.name"
                            class="flex items-center gap-1.5 text-base-content/70 hover:text-primary transition-colors">
                      <i class="ph ph-github-logo text-lg"></i>GitHub
                      <i class="ph ph-caret-down text-xs opacity-50"></i></button>
                    <!-- The Claude session that authored the branch: its logomark
                         in brand color, no label. Read from the branch's own
                         Claude-Session commit trailer, so it resolves for a
                         branch with no PR at all (most of this list); the guide
                         PR footer is the fallback. Gating this on row.pr is what
                         used to leave it dark for every PR-less row.
                         No backticks in here: this markup is a JS template
                         literal, and one would end it mid-component. -->
                    <a x-show="row.session" :href="row.session" target="_blank"
                       :title="(row.sessions?.length > 1
                                 ? 'Worked across ' + row.sessions.length + ' sessions; opens the newest'
                                 : 'Open the Claude session that authored this branch')
                               + (row.sessionsExact ? '' : ' (approximate: read from the branch tip)')"
                       class="flex items-center gap-0.5 hover:opacity-75 transition-opacity">
                      <svg viewBox="0 0 24 24" class="w-6 h-6 shrink-0" style="stroke:#d97757" stroke-width="2.2" stroke-linecap="round" fill="none" aria-hidden="true"><path d="M12,12 L12.0,1.6 M12,12 L17.62,3.25 M12,12 L21.46,7.68 M12,12 L22.29,13.48 M12,12 L19.86,18.81 M12,12 L14.93,21.98 M12,12 L9.07,21.98 M12,12 L4.14,18.81 M12,12 L1.71,13.48 M12,12 L2.54,7.68 M12,12 L6.38,3.25"/></svg><span
                        x-show="row.sessions?.length > 1" x-text="row.sessions?.length"
                        class="font-mono text-xs leading-none" style="color:#d97757"></span></a>
                    <!-- The content survey's verdict, on the rows that have
                         one: of the paths this branch uniquely touched, how
                         many are present on the default branch now. A Landed
                         row shows 6/6 and is safe to delete; a Stranded row
                         shows what is still only here. Hidden on an unsurveyed
                         row rather than shown as 0/0, since "not measured" and
                         "measured zero" are different answers. The asterisk is
                         the survey's own caveat: no shared ancestor, so the
                         counts span the whole line. -->
                    <span x-show="row.nUnique" class="flex items-center gap-1 font-mono tabular-nums shrink-0"
                          :title="row.nLanded + ' of ' + row.nUnique + ' touched paths present on ' + row.def
                                  + (row.nMissing ? ':\\n' + row.missingPaths.slice(0, 12).join('\\n') : '')">
                      <i class="ph ph-files text-base opacity-50"></i>
                      <span :class="row.nMissing ? 'text-base-content/60' : 'text-success'"
                            x-text="row.nLanded + '/' + row.nUnique"></span>
                      <span x-show="row.nMissing" class="text-warning"
                            x-text="row.nMissing + ' missing'"></span>
                      <span x-show="row.noBase" class="text-warning"
                            title="No shared ancestor with the default branch: the counts span the whole line">*</span>
                    </span>
                    <!-- Ahead / behind the default, off the cached compare. A
                         muted ahead of 0 flags a branch with nothing to stage
                         (its content already in the default); a dash is unknown
                         (not yet surveyed, or the compare failed). -->
                    <span x-show="row.ahead !== null || row.behind !== null"
                          class="ml-auto flex items-center gap-2.5 font-mono font-medium tabular-nums"
                          :title="'commits ahead of / behind ' + row.def">
                      <span class="flex items-center gap-0.5" :class="row.ahead ? 'text-success' : 'text-base-content/70'">
                        <i class="ph ph-arrow-up text-lg"></i><span x-text="row.ahead ?? '–'"></span></span>
                      <span class="flex items-center gap-0.5 text-base-content/75">
                        <i class="ph ph-arrow-down text-lg"></i><span x-text="row.behind ?? '–'"></span></span>
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
            <p x-show="!authed" class="text-base text-base-content/60">
              Session records live in the private registry. Add a token on Repos to see them.
            </p>

            <!-- ── Scope chips ───────────────────────────────────────────────
                 A fixed row, like the branch scopes: an empty scope is still an
                 answer. Each count is off the FULL list, so the row doubles as
                 the census, and the tooltip carries the definition. -->
            <div x-show="authed && !sessionsLoading"
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
            <div x-show="authed && !sessionsLoading && sessionRepos.length > 1"
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

            <div x-show="authed && !sessionsLoading && !sessionRows.length"
                 class="rounded-xl bg-base-200/40 p-4 text-base text-base-content/60 max-w-lg">
              <span x-text="'Nothing in ' + sessionScopeMeta.label + '.'"></span>
              <span x-show="!allSessionRows.length"> The cache is cold: Refresh to crawl the store now (it also builds on a ~3h throttle).</span>
            </div>

            <!-- One row per session. Left rail by outcome: amber where the
                 session hit tool failures, muted otherwise. Deliberately not
                 green-for-clean, since a session with no failures is the normal
                 case and a page of green rails says nothing. -->
            <div x-show="authed && sessionRows.length" class="flex flex-col gap-2">
              <template x-for="row in sessionRows" :key="row.id">
                <div class="rounded-lg border-l-4 pl-3 pr-3 py-2 transition-colors hover:brightness-[1.02]"
                     :class="row.failures ? 'border-warning bg-warning/5' : 'border-base-300 bg-base-100'">
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
                    <template x-for="b in row.branches.slice(0, 2)" :key="b">
                      <a :href="branchPageUrl(row, b)" target="_blank" :title="'Open ' + b"
                         class="font-mono text-base text-base-content/45 hover:text-primary transition-colors truncate min-w-0"
                         x-text="b"></a>
                    </template>
                    <span x-show="row.branches.length > 2" class="font-mono text-base text-base-content/30 shrink-0"
                          x-text="'+' + (row.branches.length - 2)"></span>
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
                    <span class="flex items-center gap-1 text-base-content/60 font-mono tabular-nums"
                          :title="row.exchanges + ' user turns, ' + row.messages + ' assistant messages'">
                      <i class="ph ph-chats-circle text-lg opacity-60"></i><span x-text="row.exchanges"></span></span>
                    <span class="flex items-center gap-1 text-base-content/60 font-mono tabular-nums"
                          :title="topToolsLabel(row)">
                      <i class="ph ph-wrench text-lg opacity-60"></i><span x-text="row.calls"></span></span>
                    <span x-show="row.failures" class="flex items-center gap-1 text-warning font-mono tabular-nums"
                          :title="row.failures + ' tool calls failed in this session'">
                      <i class="ph ph-warning-circle text-lg"></i><span x-text="row.failures"></span></span>
                    <!-- File attention: how many distinct files this session
                         opened, with the busiest few in the tooltip. Absent on
                         a pre-schema-3 record rather than shown as zero, since
                         "not captured" and "opened nothing" are different
                         answers and only one of them is about the session. -->
                    <span x-show="row.filesTotal" class="flex items-center gap-1 text-base-content/60 font-mono tabular-nums"
                          :title="filesLabel(row)">
                      <i class="ph ph-files text-lg opacity-60"></i><span x-text="row.filesTotal"></span></span>
                    <span x-show="!row.filesTotal && row.schema < 3" class="text-base-content/30"
                          title="This record predates file-attention capture (schema 3); its files were never recorded.">
                      <i class="ph ph-files text-lg"></i></span>
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
                    <span x-show="!row.agent" class="flex items-center gap-0.5 text-base-content/30"
                          :title="row.schema < 3
                                    ? 'This record predates harness-session capture (schema 3); its Claude session was never named.'
                                    : 'This record names no Claude session. Before 2026-08-07 the id could only be recovered from commit trailers, so a session that did not commit has none.'">
                      <svg viewBox="0 0 24 24" class="w-6 h-6 shrink-0" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none" aria-hidden="true"><path d="M12,12 L12.0,1.6 M12,12 L17.62,3.25 M12,12 L21.46,7.68 M12,12 L22.29,13.48 M12,12 L19.86,18.81 M12,12 L14.93,21.98 M12,12 L9.07,21.98 M12,12 L4.14,18.81 M12,12 L1.71,13.48 M12,12 L2.54,7.68 M12,12 L6.38,3.25"/></svg></span>
                    <span class="ml-auto flex items-center gap-2.5 font-mono tabular-nums text-base-content/45"
                          :title="tokenLabel(row)">
                      <span x-show="row.tokens" x-text="tokenShort(row)"></span>
                    </span>
                  </div>

                </div>
              </template>
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
                      <a :href="branchPageUrl(g.repo, pr.head)" target="_blank" rel="noopener"
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
                                      class="opacity-0 group-hover:opacity-100 text-base-content/30 hover:text-error transition-opacity shrink-0 mt-0.5"
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
                      <template x-for="it in todoOpen" :key="it.id">
                        <label class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-base-200/60 group">
                          <input type="checkbox" :checked="it.done" @change="toggleTodo(it)"
                                 class="checkbox checkbox-sm">
                          <span class="text-base flex-1" x-text="it.text"></span>
                          <button type="button" @click="deleteTodo(it)"
                                  class="opacity-0 group-hover:opacity-100 text-base-content/30 hover:text-error transition-opacity shrink-0"
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
                            <template x-for="it in todoDone" :key="it.id">
                              <label class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-base-200/60 group">
                                <input type="checkbox" :checked="it.done" @change="toggleTodo(it)"
                                       class="checkbox checkbox-sm">
                                <span class="text-base flex-1 line-through text-base-content/40" x-text="it.text"></span>
                                <button type="button" @click="deleteTodo(it)"
                                        class="opacity-0 group-hover:opacity-100 text-base-content/30 hover:text-error transition-opacity shrink-0"
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
                                  class="opacity-0 group-hover:opacity-100 text-base-content/30 hover:text-error transition-opacity shrink-0 mt-0.5"
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

          <!-- ── Branch detail: a full-viewport takeover for one Open row ──
               Tap a branch name and the branch opens HERE, not on GitHub: the
               list supplies the sequence, pages/branch.html renders the member
               (embedded live at its #gh= address, so every fact is an API read
               at open time). This settles the host question in the
               branch-page-as-navigation task: the sequence lives in the shell,
               which already holds the list, and the standalone page survives
               as both the shareable single-branch form and the renderer this
               overlay embeds, so there is one branch-detail implementation.
               Navigation: a horizontal drag anywhere over the takeover, which
               moves the surface under the finger and commits past a threshold
               (dTouch*, below); arrow keys and Escape on a keyboard; chevrons
               everywhere. The drag reaches the embedded page because its
               listeners are attached inside the frame on load, the frame owning
               touches over its own body; the header and the edge strips are the
               shell-side surfaces. Stepping swaps the iframe src with a
               per-branch query, because two addresses differing only in
               fragment would be a hash-only change the iframe never navigates
               on. -->
          <div x-show="detail" x-cloak x-transition.opacity.duration.150ms
               class="fixed inset-0 z-[70]" @keydown.window="detailKeys($event)">
            <!-- Desktop gets a swiper-style PANEL over a scrim rather than the
                 whole window; the phone keeps the full-viewport takeover. One
                 markup, split by breakpoint. Scrim tap closes. -->
            <div class="absolute inset-0 bg-black/40 hidden lg:block" @click="closeDetail()"></div>
            <div class="absolute inset-0 bg-base-100 overflow-hidden flex flex-col
                        lg:inset-auto lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2
                        lg:w-[min(60rem,92vw)] lg:h-[min(88vh,64rem)] lg:rounded-2xl lg:border lg:border-base-300 lg:shadow-2xl">
              <div class="h-12 shrink-0 flex items-center gap-1.5 px-2 border-b border-base-300"
                   @touchstart.passive="dTouchStart($event)" @touchmove="dTouchMove($event)"
                   @touchend.passive="dTouchEnd($event)" @touchcancel.passive="dTouchCancel()">
                <button @click="closeDetail()" class="btn btn-square btn-ghost btn-sm" title="Close (Esc)">
                  <i class="ph ph-x text-lg"></i></button>
                <i class="ph text-base shrink-0 text-base-content/50" :class="detailRow && repoIcon(detailRow.repo)"></i>
                <span class="font-mono text-base text-base-content/50 shrink-0" x-text="detailRow ? repoShort(detailRow.repo) : ''"></span>
                <!-- No branch name here. It does not fit at phone width (a
                     claude/<slug> truncates to a stub), and the embedded page
                     shows it in full a few pixels below, so the header was
                     spending its scarcest room on a worse copy of something
                     already on screen. The header keeps what it alone can say:
                     which repo, which PR, and where you are in the list. -->
                <a x-show="detailRow && detailRow.pr" :href="detailRow && detailRow.pr ? prUrl(detailRow.repo, detailRow.pr.number) : '#'"
                   target="_blank" class="font-mono text-base font-bold shrink-0 hover:text-primary transition-colors"
                   x-text="detailRow && detailRow.pr ? '#' + detailRow.pr.number : ''"></a>
                <!-- Copy a link that reopens THIS branch here, in the swiper,
                     rather than standalone or at the list. See detailLink. -->
                <button @click="copyDetailLink()" class="btn btn-square btn-ghost btn-sm shrink-0"
                        title="Copy a link that opens this branch here">
                  <i class="ph ph-link text-lg"></i></button>
                <div class="grow"></div>
                <span class="text-base tabular-nums text-base-content/40 shrink-0"
                      x-text="detail ? (detail.i + 1) + ' / ' + detail.rows.length : ''"></span>
                <button @click="detailStep(-1)" :disabled="!detail || detail.i === 0"
                        class="btn btn-square btn-ghost btn-sm" title="Previous branch (left arrow)">
                  <i class="ph ph-caret-left text-lg"></i></button>
                <button @click="detailStep(1)" :disabled="!detail || detail.i >= detail.rows.length - 1"
                        class="btn btn-square btn-ghost btn-sm" title="Next branch (right arrow)">
                  <i class="ph ph-caret-right text-lg"></i></button>
              </div>
              <div class="relative flex-1 min-h-0 overflow-hidden">
                <!-- The moving surface: the embedded page and the instant layer
                     travel together, so a drag carries whichever of the two is
                     currently showing. The edge strips below stay put, being
                     gesture surfaces rather than content. -->
                <div data-detail-pane class="absolute inset-0"
                     @touchstart.passive="dTouchStart($event)" @touchmove="dTouchMove($event)"
                     @touchend.passive="dTouchEnd($event)" @touchcancel.passive="dTouchCancel()">
                <template x-if="detail">
                  <iframe :src="detailUrl" @load="onDetailFrame($event)"
                          class="absolute inset-0 w-full h-full border-0 bg-base-100 transition-opacity duration-200"
                          :class="detailReady ? 'opacity-100' : 'opacity-0'"
                          sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"></iframe>
                </template>
                <!-- The instant layer: everything the row already knew, shown
                     the moment the takeover opens, so arriving feels like a
                     pop rather than a load. The live page fades in over it
                     when its brief reports ready (data-brief-ready), or on a
                     short fallback for a renderer that predates the signal. -->
                <div x-show="!detailReady" x-transition.opacity.duration.200ms
                     class="absolute inset-0 overflow-y-auto bg-base-100">
                  <div x-show="detailRow" class="max-w-xl mx-auto px-6 pt-10 flex flex-col gap-3">
                    <div class="font-mono text-lg font-semibold break-all" x-text="detailRow ? detailRow.name : ''"></div>
                    <p class="text-base text-base-content/70" x-show="detailRow && detailRow.subject"
                       x-text="detailRow ? detailRow.subject : ''"></p>
                    <div class="flex items-center flex-wrap gap-2 text-sm">
                      <span class="badge badge-ghost font-mono" x-show="detailRow && detailRow.pr"
                            x-text="detailRow && detailRow.pr ? '#' + detailRow.pr.number + (detailRow.pr.draft ? ' draft' : ' ready') : ''"></span>
                      <span class="badge badge-ghost" x-show="detailRow && detailRow.group" x-text="detailRow ? detailRow.group : ''"></span>
                      <span class="badge badge-ghost tabular-nums" x-show="detailRow && detailRow.aheadBy != null"
                            x-text="detailRow ? '+' + (detailRow.aheadBy ?? 0) + ' / -' + (detailRow.behindBy ?? 0) : ''"></span>
                    </div>
                    <div class="text-sm text-base-content/50" x-show="detailRow && detailRow.date"
                         x-text="detailRow ? branchSpanTitle(detailRow) : ''"></div>
                    <div class="flex items-center gap-2 pt-3 text-base-content/40 text-sm">
                      <span class="loading loading-dots loading-xs"></span>
                    </div>
                  </div>
                </div>
                </div>
                <div class="absolute inset-y-0 left-0 w-6"
                     @touchstart.passive="dTouchStart($event)" @touchmove="dTouchMove($event)"
                     @touchend.passive="dTouchEnd($event)" @touchcancel.passive="dTouchCancel()"></div>
                <div class="absolute inset-y-0 right-0 w-6"
                     @touchstart.passive="dTouchStart($event)" @touchmove="dTouchMove($event)"
                     @touchend.passive="dTouchEnd($event)" @touchcancel.passive="dTouchCancel()"></div>
              </div>
            </div>
          </div>
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
      sessionScope: 'week',
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

      init(){
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
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
        document.addEventListener('web-tools:activity-refreshed', () => this.reloadActivity());
        // Same contract for the sessions crawl, which commits state/sessions.json.
        document.addEventListener('web-tools:sessions-refreshed', () => this.reloadSessions());
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
      // two panes MERGED. Activity's two keep their own keys, since the pill
      // still switches between two panes.
      get tab(){
        const v = window.__shell?.view;
        if (v === 'stage' || v === 'surfaces') return 'stage';
        if (v === 'todo' || v === 'jots') return 'lists';
        return (v === 'activity' || v === 'sessions' || v === 'guides') ? v : 'repos';
      },
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
        else if (key === 'todo') s.goTodo();
        else if (key === 'jots') s.goJots();
        else if (key === 'stage') s.goStage();
        else if (key === 'surfaces') s.goSurfaces();
      },

      registry(){ return window.__shell?.REGISTRY_REPO || 'mehrlander/web-tools-private'; },
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
          const def = this.defaultRepo();
          this.entries = [{ repo: def, icon: 'ph-toolbox', note: '', group: '', order: 0,
                            meta: null, err: false, hasLanding: false, child: null, showChild: false }];
          this.enrichMeta();
          this.loading = false;
          return;
        }

        const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
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
      async reloadActivity(){
        if (!this.hasToken()) return;
        const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
        await this.loadActivity(reg);
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
        const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
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
      branchPageUrl(repo, branch){
        return 'https://mehrlander.github.io/web-tools/pages/branch.html'
             + '#gh=' + repo + '@' + branch;
      },

      // One directory listing, absent-is-not-an-error. Most repos have no
      // guides shelf and most branches never touch one, so a 404 is the normal
      // answer and returning [] keeps it out of the caller's control flow.
      async guidesAt(repo, ref){
        try {
          const gh = new window.GH({ token: window.TOKEN, repo, ref });
          const list = await gh.ls(window.guideIndex.GUIDE_DIR.replace(/\/$/, ''));
          return list.filter(e => e.type === 'file' && window.guideIndex.isGuidePath(e.path))
                     .map(e => e.path);
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
        if (this.guidesLoadedAt && !force) return;
        // The kit is loaded here, not in the boot chain, so a page that never
        // opens this pane pays nothing for it. The guide whose subject is the
        // cost of the boot chain should not quietly join it.
        if (!window.guideIndex) {
          try { await window.gh.load('kits/guide-index.js'); } catch { return; }
        }
        this.guidesBusy = true;
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

            const jobs = [this.guidesAt(repo, def).then(ps => {
              for (const path of ps) main.push({ repo, path, ref: def });
            })];
            for (const pr of prs){
              if (!pr.head || pr.head === def) continue;
              jobs.push(this.guidesAt(repo, pr.head).then(ps => {
                for (const path of ps) onPrs.push({ repo, path, pr });
              }));
            }
            await Promise.all(jobs);
          }));
          this.guideEntries = { main, onPrs };
          this.guidesLoadedAt = new Date().toISOString();
          // After the rows exist, not with them: a thumb is decoration and a
          // card is useful without one, so the list paints first.
          this.loadGuideThumbs(this.guideRows);
        } finally { this.guidesBusy = false; }
      },
      get sessionsBusy(){ return !!window.__shell?.sessionsRefreshing; },

      // The scopes. Time-based rather than kind-based, because a session has no
      // state to be in: it ran, and the only question a scan asks is how
      // recently. `failed` is the exception and is the reason this pane can
      // answer something search.py answers at a terminal: which sessions fought
      // something, across the corpus, at a glance.
      SESSION_SCOPES: [
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
        const days = scope === 'week' ? 7 : 30;
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
            const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
            const path = window.RepoSessionsCache.pathOf(row);
            this._records[row.id] = JSON.parse((await reg.get(path)).text);
          }
          this.sessionDetail = this._records[row.id];
          if (!window.sessionRender){
            await gh.load('kits/proof.js');
            await gh.load('kits/swipe-deck.js');
            await gh.load('kits/chat-render.js');
            await gh.load('kits/session-render.js');
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

      // ── Crawl progress (the header while activityBusy) ───────────────────
      // The crawl runs for tens of seconds across every estate repo, so the bare
      // spinner it replaced said only "something is happening". These read the
      // shell's activityProgress and answer the two questions worth answering:
      // how far along, and what is it looking at. Repos finished over repos
      // total is the WHOLE measure. No fraction is estimated for the repos
      // in flight: per-repo cost varies by an order of magnitude (a repo with 30
      // surveyable branches against one with two), so a smoothed bar would be a
      // guess dressed as a reading.
      get activityProgress(){ return window.__shell?.activityProgress || null; },
      // Before the member list resolves there is no denominator, and saying so
      // beats showing "0 of 0".
      get activityProgressLabel(){
        const p = this.activityProgress;
        if (!p) return '';
        return p.total ? `Refreshing activity · ${p.done} of ${p.total} repos` : 'Refreshing activity';
      },
      // Every repo in flight, short-named. The pool runs two at once, so this is
      // a list, not a subject: naming one would misdescribe the crawl.
      get activityProgressActive(){
        return (this.activityProgress?.active || []).map(r => r.split('/').pop()).join(', ');
      },
      get activityProgressPct(){
        const p = this.activityProgress;
        return p?.total ? Math.round(p.done / p.total * 100) : 0;
      },

      // A card's cached activity, or null (public, uncrawled, or pre-cache).
      cardActivity(repo){ return this.activity[repo] || null; },
      // Verdicts from the cache's stored facts, judged against now. Returns only
      // what is not passing, so a current repo adds no badges at all: badging
      // green states would turn the row into furniture, and furniture stops
      // being read. The crawl probed; this judges. lib/kits/repo-checks.js explains
      // why those are two steps.
      cardChecks(repo){
        const facts = this.activity[repo]?.checks;
        if (!Array.isArray(facts) || !facts.length || !window.RepoChecks) return [];
        return window.RepoChecks.notable(window.RepoChecks.verdict(facts, new Date()));
      },

      // ── The branch list: every branch the crawl knows about ──────────────
      // Unioned by repo+name, freshest first, carrying the survey's `group`
      // ('active' | 'landed' | 'stranded') and its open PR when one matches
      // (pr.head === branch), so the row's link cluster reaches the PR and the
      // authoring session with no extra fetch.
      //
      // This is the WHOLE list, and the crawl already had it: the cache stores
      // every branch it surveyed, classified, with the content counts. The view
      // used to hard-filter it down to open work here, in one line, which meant
      // no control in the view could reach the rest and the landed set was
      // invisible everywhere. The filter moved to `branchScope` below, where it
      // is a choice rather than a floor.
      get allBranchRows(){
        const out = [];
        for (const [repo, e] of Object.entries(this.activity)){
          const def = e.defaultBranch || 'main';
          const prByHead = new Map((e.openPRs || []).filter(p => p.head).map(p => [p.head, p]));
          const seen = new Set();
          for (const b of (e.survey?.branches || [])){
            if (b.name === def) continue;
            const pr = prByHead.get(b.name) || null;
            seen.add(b.name);
            // `first` (the branch's oldest unique commit) comes from whichever
            // compare the crawl ran: the PR head's when there is a PR, the
            // survey's otherwise. A recent branch is not surveyed, so a row
            // that is here on its PR alone takes the PR's.
            out.push({ repo, def, name: b.name, date: b.date || '', subject: b.subject || '', pr,
                       group: b.group || '',
                       // The survey's own evidence, carried through from the
                       // cache: of the paths this branch uniquely touched, how
                       // many hold bytes that exist on the default branch now.
                       // It is what makes a Landed row actionable rather than
                       // a claim, and the crawl already stored it.
                       nUnique: b.nUnique || 0, nLanded: b.nLanded || 0,
                       nMissing: b.nMissing || 0, missingPaths: b.missingPaths || [],
                       noBase: !!b.noBase,
                       first: pr?.firstDate || b.firstDate || '',
                       // Sessions the branch was worked across, newest first.
                       // The crawl resolves them exactly from the compare it
                       // already runs; `session` is the one the icon opens.
                       ...this.rowSessions(b, pr),
                       ahead: pr?.aheadBy ?? b.aheadBy ?? null, behind: pr?.behindBy ?? b.behindBy ?? null });
          }
          // An open PR whose branch was not in the survey (a fresh push, or one
          // beyond the survey cap) is still open work, so surface it directly.
          for (const p of (e.openPRs || [])){
            if (!p.head || p.head === def || seen.has(p.head)) continue;
            // The crawl classifies what its survey reached, so a branch missing
            // from it is one the survey never got to: a fresh push, or one past
            // the cap. With an open PR against it, `active` is the honest read.
            out.push({ repo, def, name: p.head, date: p.updatedAt || '', subject: p.title || '', pr: p,
                       group: 'active',
                       nUnique: 0, nLanded: 0, nMissing: 0, missingPaths: [], noBase: false,
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
      // almost always has one) or a STRANDED classification, the survey's
      // honest "its content is nowhere on the default branch".
      //
      // The other scopes are the survey's own three groups, plus All. Landed is
      // the one the reconcile pass is about, and until this existed it had no
      // route in the estate at all: the per-repo branch review was the only
      // place a landed branch appeared, one repo at a time.
      BRANCH_SCOPES: [
        // Recent leads and is the default. The pane's question is "what am I
        // working on", and the window control renders under Recent alone, so
        // landing anywhere else opened the pane with its one parameter hidden.
        { key: 'active', label: 'Recent', icon: 'ph-pulse',
          note: 'Committed inside the window below. Date-only, never surveyed, so judge nothing from it yet.' },
        { key: 'open', label: 'Open', icon: 'ph-git-pull-request',
          note: 'Work in flight at ANY age: an open PR, or content the survey found nowhere on the default branch. The window does not narrow this, since an open PR from three months ago is still open work.' },
        { key: 'stranded', label: 'Stranded', icon: 'ph-warning-circle',
          note: 'Older branches holding content that exists nowhere on the default branch.' },
        { key: 'landed', label: 'Landed', icon: 'ph-check-circle',
          note: 'Older branches whose content is on the default branch. Likely history, and the set a cleanup pass deletes.' },
        { key: 'all', label: 'All', icon: 'ph-list-bullets',
          note: 'Every branch the crawl surveyed, in every group.' },
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
      // Row state, driving the left-accent color and the pill: a ready PR, a
      // draft PR (the normal in-flight state), or a branch that is ahead of main
      // (stranded) with no PR.
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
      branchState(row){ return !row.pr ? 'nopr' : (row.pr.draft ? 'draft' : 'ready'); },
      branchAccent(row){
        const s = this.branchState(row);
        return s === 'ready' ? 'border-success bg-success/5'
             : s === 'draft' ? 'border-warning bg-warning/5'
             : 'border-base-300 bg-base-100';
      },
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
      // survey's read (lib/kits/branch-survey.js surveyBranchLive): a plain compare,
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
        const pr = r.pr;
        return [
          { key: 'tree', label: 'Files at branch', icon: 'ph-folder-open', external: true },
          { key: 'compare', label: 'Compare to ' + r.def, icon: 'ph-git-diff', external: true },
          { key: 'commits', label: 'Commits', icon: 'ph-git-commit', external: true },
          { key: 'dropFile', label: 'Drop a file here', icon: 'ph-tray-arrow-down', external: true },
          // The row's old name-tap action, kept reachable after the name
          // became the detail takeover's trigger.
          { key: 'stageDiff', label: 'Stage changed files', icon: 'ph-stack' },
          // With a PR, the two tabs worth a direct route (the PR itself is the
          // row's #-number). Without one, the action the row could not reach.
          pr && { key: 'prFiles', label: 'Files changed (#' + pr.number + ')', icon: 'ph-file-magnifying-glass', external: true },
          pr && { key: 'prChecks', label: 'Checks (#' + pr.number + ')', icon: 'ph-check-circle', external: true },
          !pr && { key: 'newPr', label: 'New pull request', icon: 'ph-git-pull-request', external: true },
          // The one copy worth a row: a branch name is long, hyphenated, and
          // typed into git commands and #gh= addresses, with no address bar to
          // lift it from. A compare link had a row too and did not earn it,
          // since Compare opens the page the URL names and the browser copies
          // it from there.
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
        if (key === 'stageDiff') return this.stageBranchDiff(r.repo, r.name, r.def);
        if (key === 'prFiles') return go(this.prUrl(r.repo, r.pr.number) + '/files');
        if (key === 'prChecks') return go(this.prUrl(r.repo, r.pr.number) + '/checks');
        if (key === 'newPr') return go(cmp + '?expand=1');
        if (key === 'copyName') return this.copyText(r.name, 'Branch name copied');
      },
      async copyText(text, msg){
        const toast = window.Alpine.store('toast');
        try { await navigator.clipboard.writeText(text); toast?.('check', msg, 'alert-success', 2400); }
        catch { toast?.('warning-circle', 'Could not copy', 'alert-warning', 2800); }
      },
      // ── Branch detail state (the takeover; see the overlay markup) ───────
      detail: null,   // { rows, i }: the list as tapped (frozen so a cache refresh mid-read does not yank the sequence) and the position
      detailReady: false,  // the embedded page reported ready; until then the facts card is the content
      openBranchDetail(row){
        // Keyed lookup, not identity: the row getters rebuild their objects on
        // every access, so the tapped row may not be the array's instance.
        const rows = [...this.openRows];
        const key = row.repo + '/' + row.name;
        const i = rows.findIndex(r => r.repo + '/' + r.name === key);
        this.detailReady = false;
        // A row that is not in the current list (a deep link to a branch the
        // filter hides, or one that has since landed) still opens, as a list of
        // one. A link that resolves to nothing would be worse than a link with
        // nowhere to swipe.
        this.detail = i >= 0 ? { rows, i } : { rows: [row], i: 0 };
        this.stampDetail();
      },
      closeDetail(){ this.detail = null; this.detailReady = false; this.stampDetail(); },

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
      // Wired to the iframe's load event: attach the swipe listeners INSIDE
      // the frame (same-origin, so the whole page becomes a swipe surface,
      // fixing the strips-only reach), then watch for the brief's ready
      // signal (data-brief-ready, set by branch-brief when its load settles)
      // and fade the page in over the facts card. The timeout is the fallback
      // for a deployed renderer that predates the signal: after 2.5s of a
      // loaded-but-silent page, showing it beats holding the card forever.
      //
      // touchmove takes { passive: false } because these land on a DOCUMENT,
      // where touchstart and touchmove are passive by default: without it the
      // preventDefault in dTouchMove is dropped and the branch page scrolls
      // under a drag the shell is already animating.
      onDetailFrame(e){
        const fr = e.target;
        try {
          const doc = fr.contentDocument;
          doc.addEventListener('touchstart', (ev) => this.dTouchStart(ev), { passive: true });
          doc.addEventListener('touchmove', (ev) => this.dTouchMove(ev), { passive: false });
          doc.addEventListener('touchend', (ev) => this.dTouchEnd(ev), { passive: true });
          doc.addEventListener('touchcancel', () => this.dTouchCancel(), { passive: true });
        } catch {}
        const t0 = Date.now();
        const poll = () => {
          if (!this.detail) return;
          let ok = false;
          try { ok = fr.contentDocument.documentElement.hasAttribute('data-brief-ready'); } catch {}
          if (ok || Date.now() - t0 > 2500) this.detailReady = true;
          else setTimeout(poll, 120);
        };
        poll();
      },
      get detailRow(){ return this.detail ? this.detail.rows[this.detail.i] : null; },
      get detailUrl(){
        const r = this.detailRow;
        if (!r) return '';
        // The per-branch query is what makes stepping navigate (see markup).
        // A shell running under ?use= hands the same ref to the embedded
        // renderer, so a preview frames the previewed lib, not main's.
        const use = new URLSearchParams(location.search).get('use');
        return '../branch.html?swipe=' + encodeURIComponent(r.repo + '@' + r.name)
          + (use ? '&use=' + encodeURIComponent(use) : '')
          + '#gh=' + r.repo + '@' + r.name;
      },
      // Clamped, not wrapped: the ends are real, and a swipe past them should
      // feel like an edge, not teleport across the list.
      detailStep(d){
        if (!this.detail) return;
        const i = Math.min(this.detail.rows.length - 1, Math.max(0, this.detail.i + d));
        if (i !== this.detail.i) {
          this.detailReady = false;
          this.detail = { ...this.detail, i };
          this.stampDetail();   // the address follows the swipe
        }
      },
      detailKeys(e){
        if (!this.detail) return;
        if (e.key === 'Escape') { e.preventDefault(); this.closeDetail(); }
        else if (e.key === 'ArrowLeft') this.detailStep(-1);
        else if (e.key === 'ArrowRight') this.detailStep(1);
      },
      // ── Swiping the takeover: follow the finger ───────────────────────────
      // The same gesture the shell's dashboard pager runs (show-repo.html,
      // onSwipe*), against an embedded page instead of a local pane: lock to an
      // axis after DRAG_MIN, translate the surface 1:1 under the finger,
      // rubber-band toward an end with no neighbour, and commit past the
      // threshold by sliding out and bringing the next branch in from the
      // opposite edge. This replaced a touchend-only threshold step, which
      // moved nothing during the drag and so read as a dead surface that
      // changed views on release.
      //
      // What it cannot be is a snap track of every branch, the way the chat
      // deck pages exchanges (chat-render.js deckCore): a slide there is inert
      // DOM already in hand, while a member here is a live page that reads the
      // API on open, so N slides would mean N pages and N fanouts. One surface
      // that moves, with the row's own facts standing in until the incoming
      // page reports ready, is the affordable version of the same feel.
      _dT: null,          // { x, y, w } at touchstart
      _dLock: null,       // 'h' once the gesture is ours, 'v' once it is a scroll
      _dBusy: false,      // a commit animation owns the surface
      D_DRAG_MIN: 8,      // px before the gesture locks to an axis
      D_COMMIT_FRAC: 0.22,// fraction of the surface that commits a step…
      D_COMMIT_MAX: 90,   // …but never demand more than this many px

      _detailPane(){ return document.querySelector('[data-detail-pane]'); },
      // Never steal a horizontal scroll the embedded page owns: the branch
      // page's CM6 split diff scrolls sideways, and paging out of it mid-read
      // would be the wrong answer to that drag. Walk from the touch target,
      // using ITS document's view for the computed style, since the target
      // often lives in the frame rather than in this one.
      _dInHScroll(el){
        const view = el && el.ownerDocument && el.ownerDocument.defaultView;
        if (!view) return false;
        for (; el && el !== el.ownerDocument.body; el = el.parentElement){
          if (el.scrollWidth - el.clientWidth > 8){
            const ox = view.getComputedStyle(el).overflowX;
            if (ox === 'auto' || ox === 'scroll') return true;
          }
        }
        return false;
      },
      // transitionend and the safety timeout both call the finisher; run once.
      _dOnce(fn){ let done = false; return () => { if (done) return; done = true; fn(); }; },

      dTouchStart(e){
        const t = e.touches && e.touches[0];
        if (!t || !this.detail || this._dBusy || e.touches.length !== 1
            || this._dInHScroll(e.target)) { this._dT = null; return; }
        const pane = this._detailPane();
        this._dT = { x: t.clientX, y: t.clientY,
                     w: (pane && pane.clientWidth) || window.innerWidth };
        this._dLock = null;
        if (pane) pane.style.transition = '';
      },
      dTouchMove(e){
        const s = this._dT, t = e.touches && e.touches[0];
        if (!s || !t || e.touches.length !== 1) return;
        const dx = t.clientX - s.x, dy = t.clientY - s.y;
        if (this._dLock === null){
          if (Math.abs(dx) < this.D_DRAG_MIN && Math.abs(dy) < this.D_DRAG_MIN) return;
          this._dLock = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        }
        if (this._dLock !== 'h') return;              // vertical: let the page scroll
        // Own the horizontal axis. Inside the frame this listener is attached
        // with { passive: false } on purpose: touchmove on a DOCUMENT is
        // passive by default, so without it the call is ignored and the frame
        // scrolls under a drag we are also animating.
        if (e.cancelable) e.preventDefault();
        const pane = this._detailPane();
        if (!pane) return;
        const i = this.detail.i, n = this.detail.rows.length;
        const atEdge = (dx > 0 && i <= 0) || (dx < 0 && i >= n - 1);
        pane.style.transform = 'translateX(' + (atEdge ? dx * 0.3 : dx) + 'px)';
      },
      dTouchCancel(){
        const s = this._dT; this._dT = null;
        if (s && this._dLock === 'h') this._dSettle(this._detailPane());
      },
      dTouchEnd(e){
        const s = this._dT, t = e.changedTouches && e.changedTouches[0];
        this._dT = null;
        if (!s || !t || !this.detail || this._dLock !== 'h') return;
        const pane = this._detailPane();
        const dx = t.clientX - s.x;
        const dir = dx < 0 ? 1 : -1;
        const j = this.detail.i + dir;
        const committed = Math.abs(dx) > Math.min(this.D_COMMIT_MAX, s.w * this.D_COMMIT_FRAC)
          && j >= 0 && j < this.detail.rows.length;
        if (committed) this._dCommit(pane, dir, s.w);
        else this._dSettle(pane);
      },
      // Ease the surface back to rest, then strip the inline styles.
      _dSettle(pane){
        if (!pane) return;
        pane.style.transition = 'transform .18s ease-out';
        pane.style.transform = 'translateX(0)';
        const done = this._dOnce(() => {
          pane.style.transition = ''; pane.style.transform = '';
          pane.removeEventListener('transitionend', clr);
        });
        const clr = (ev) => { if (ev && ev.target !== pane) return; done(); };
        pane.addEventListener('transitionend', clr);
        setTimeout(done, 240);
      },
      // Slide the surface off the dragged edge, step the list, then bring the
      // next branch in from the opposite edge. What arrives is the row's facts
      // card (detailStep resets detailReady), with the live page fading in over
      // it when the frame reports ready, so the incoming half is never blank.
      // dir = +1 next, -1 previous.
      _dCommit(pane, dir, w){
        if (!pane) { this.detailStep(dir); return; }
        this._dBusy = true;
        pane.style.transition = 'transform .18s ease-out';
        pane.style.transform = 'translateX(' + (dir === 1 ? -w : w) + 'px)';
        const after = this._dOnce(() => {
          pane.removeEventListener('transitionend', onOut);
          pane.style.transition = '';                  // hold it off-screen through the step
          this.detailStep(dir);
          requestAnimationFrame(() => {
            pane.style.transform = 'translateX(' + (dir === 1 ? w : -w) + 'px)';
            requestAnimationFrame(() => {
              pane.style.transition = 'transform .2s ease-out';
              pane.style.transform = 'translateX(0)';
              const fin = this._dOnce(() => {
                pane.style.transition = ''; pane.style.transform = '';
                pane.removeEventListener('transitionend', onIn);
                this._dBusy = false;
              });
              const onIn = (ev) => { if (ev && ev.target !== pane) return; fin(); };
              pane.addEventListener('transitionend', onIn);
              setTimeout(fin, 280);
            });
          });
        });
        // The iframe's own opacity transition bubbles here too, hence the target
        // guard on both listeners.
        const onOut = (ev) => { if (ev && ev.target !== pane) return; after(); };
        pane.addEventListener('transitionend', onOut);
        setTimeout(after, 240);
      },

      // GitHub's new-file form, opened ON this branch with the filename
      // prefilled (github.com/<repo>/new/<branch>?filename=...). This is the
      // "set up a placeholder file so I can paste from my phone" flow
      // collapsed into one link: the content commits straight to the branch
      // through GitHub's editor and never rides through an agent's context,
      // and no placeholder commit is needed because the form takes the name.
      // The name defaults into the repo's declared inbox (manifest `inbox`,
      // else dump/), date-stamped; the form leaves it editable. The branch
      // rides the path with its slashes raw, the form GitHub's own UI emits
      // for slashed branches on this route.
      dropFileUrl(r){
        const cfg = window.__shell?.estateConfigs?.[r.repo] || {};
        const dir = (typeof cfg.inbox === 'string' && cfg.inbox ? cfg.inbox : 'dump').replace(/\/+$/, '');
        const d = new Date(), p = (n) => String(n).padStart(2, '0');
        const stamp = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
        return 'https://github.com/' + r.repo + '/new/' + r.name
          + '?filename=' + encodeURIComponent(dir + '/' + stamp + '-drop.md');
      },

      repoShort(repo){ return (repo || '').split('/')[1] || repo; },
      // Relative time from an ISO date, reusing GH.ago (one throwaway instance).
      agoOf(iso){ try { return iso ? (this.__ago ||= new window.GH({})).ago(iso) : ''; } catch { return ''; } },
      // Compact form for the dense tables: drop " ago", collapse "just now".
      agoShort(iso){ return this.agoOf(iso).replace(' ago', '').replace('just now', 'now'); },
      // The leading half of an Open row's lifespan. The collapse rules live in
      // BranchSurvey.lifespanStart, shared with the per-repo branch review so
      // the two surfaces cannot drift; this passes in the formatting.
      branchStart(row){
        return window.BranchSurvey.lifespanStart(row.first, row.date, iso => this.agoShort(iso));
      },
      branchSpanTitle(row){
        return window.BranchSurvey.lifespanTitle(row.first, row.date, iso => this.agoOf(iso));
      },
      // Open a repo straight into its per-repo branch-review view.
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
          const ref = await this.repoRef(full);
          const g = new window.GH({ token: window.TOKEN, repo: full, ref });
          let cfg = {};
          try { cfg = JSON.parse((await g.get('.web-tools.json')).text); } catch {}
          if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) cfg = {};
          cfg.estate = true;
          if (this.addGroup.trim()) cfg.group = this.addGroup.trim();
          if (this.addNote.trim()) cfg.note = this.addNote.trim();
          if (typeof g.save !== 'function' && window.gh?.load) await window.gh.load('gh-store.js');
          await g.save('.web-tools.json', cfg, 'Join the web-tools estate (estate: true) via show-repo');
          Alpine.store('toast')?.('check-circle', 'Added ' + full, 'alert-success', 3000);
          this.addOpen = false; this.addName = ''; this.addGroup = ''; this.addNote = '';
          // The shell's config-saved handler force-rebuilds the cache and reloads
          // the cards; don't rebuild here too, since a second concurrent write to
          // the registry cache would collide with it.
          document.dispatchEvent(new CustomEvent('web-tools:config-saved', { detail: { repo: full } }));
        } catch(e){
          Alpine.store('toast')?.('warning', 'Add failed: ' + (e?.message || e), 'alert-error', 6000);
        } finally { this.adding = false; }
      },

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
        const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
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
          const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
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
          const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
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
      // A flat list in one registry file, {items:[{id,text,done,created_at}]}.
      // Not a surface: no kind/curation, just text + done, so it gets the
      // plainest shape rather than reusing the surfaces schema. 404 (no file
      // yet) is a quiet empty list, matching loadSurfaces' no-dir case.
      async loadTodos(reg){
        this.todoLoading = true;
        this.todoErr = '';
        try {
          const raw = JSON.parse((await reg.get(TODO_PATH)).text);
          this.todoItems = Array.isArray(raw.items) ? raw.items : [];
        } catch (e) {
          this.todoItems = [];
          if (e?.status && e.status !== 404) this.todoErr = 'Load failed: ' + (e.message || e);
        } finally { this.todoLoading = false; }
      },
      async reloadTodos(){
        if (!this.hasToken()) return;
        const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
        await this.loadTodos(reg);
      },
      get todoOpen(){ return this.todoItems.filter(it => !it.done); },
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
          const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
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
          const raw = JSON.parse((await reg.get(JOTS_PATH)).text);
          this.jotItems = Array.isArray(raw.items) ? raw.items : [];
        } catch (e) {
          this.jotItems = [];
          if (e?.status && e.status !== 404) this.jotErr = 'Load failed: ' + (e.message || e);
        } finally { this.jotLoading = false; }
      },
      async reloadJots(){
        if (!this.hasToken()) return;
        const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
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
      async mutateJots(mutate, message){
        try {
          const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
          if (typeof reg.save !== 'function' && window.gh?.load) await window.gh.load('gh-store.js');
          let items = [];
          try {
            const raw = JSON.parse((await reg.get(JOTS_PATH)).text);
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
          const raw = JSON.parse((await reg.get(PINS_PATH)).text);
          this.pinItems = Array.isArray(raw.items) ? raw.items : [];
        } catch (e) {
          this.pinItems = [];
          if (e?.status && e.status !== 404) this.pinErr = 'Load failed: ' + (e.message || e);
        } finally { this.pinLoading = false; }
      },
      async reloadPins(){
        if (!this.hasToken()) return;
        const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
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
          const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
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
      // throttle. Refresh views re-crawls when the answer matters now.
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
