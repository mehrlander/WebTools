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
    // One component renders every estate view; `tab` reads the shell view.
    // Public (no token): the public default card only, no surfaces, no lists.
    // See docs/show-repo.md "The estate".
    // Keyed by the v2 `type` (genre), where v1 keyed by `kind` (genre and
    // transport fused). lib/surface.js does the split on read, so this table
    // shrank to genre alone and a v1 file still lands on the right icon.
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
    // The two personal lists live under lists/ in the registry: authored
    // content written through this UI, kept out of state/ (derived caches).
    const TODO_PATH = 'lists/todo.json';
    const JOTS_PATH = 'lists/jots.json';
    // Clip an item's text for a commit subject line.
    const clip = (s, n = 60) => s.length > n ? s.slice(0, n - 1) + '…' : s;

    return {
      description: 'All-repo estate: a full-width grouped grid of opted-in repo cards (membership + fields in each repo\'s own config), stacked surfaces (the private registry\'s editable ones plus each repo\'s own declared surface), a personal to-do list, and a jots pile for quick idea capture',

      template: `
        <div>
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
          <div x-show="tab==='surfaces'">
            <!-- The mode pill: Working and Saved are two modes of one thing.
                 This is the shelf (display); Working is the bench (edit), the
                 same surface before it has been saved. They share a nav stop
                 the way Activity's three sub-views do, and each keeps its own
                 ?view key so existing links still land. -->
            <div class="flex items-center gap-2 mb-4">
              <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 w-fit" role="tablist">
                <button role="tab" @click="window.__shell?.goStage()"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium text-base-content/60 hover:text-base-content transition-colors">
                  <i class="ph ph-stack text-lg"></i>Working
                  <span x-show="stagedCount" class="badge badge-ghost badge-sm" x-text="stagedCount"></span>
                </button>
                <button role="tab" aria-selected="true"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium bg-base-100 text-primary shadow-sm">
                  <i class="ph ph-cards text-lg"></i>Saved
                </button>
              </div>
              <div class="grow"></div>
              <button x-show="authed" @click="newSurface()"
                      class="btn btn-ghost gap-1.5 text-base-content/60 hover:text-primary border border-dashed border-base-300">
                <i class="ph ph-plus-circle text-base"></i> New
              </button>
            </div>

            <p x-show="!authed" class="text-base text-base-content/60">
              Set a token (Repos, top right) to see surfaces.
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
                        <h2 class="text-lg font-semibold" x-text="s.manifest.name || s.file"></h2>
                        <span class="text-base font-mono text-base-content/30" x-text="s.file"></span>
                        <div class="grow"></div>
                        <!-- Only registry surfaces edit in place (the estate holds
                             the registry token). A repo surface links to its blob;
                             edit it where it lives, in its own repo. -->
                        <!-- Open as stage: the shelf-to-bench bridge. Pulls the
                             surface's addressable items onto the working
                             surface, where they can be bundled, diffed, sent,
                             or edited and saved again. Prose items have no file
                             behind them and are reported rather than dropped
                             silently. Available on a repo's own surface too:
                             reading one onto the bench needs no write access. -->
                        <button x-show="stageableCount(s)" @click="openAsStage(s)"
                                class="self-center text-base-content/30 hover:text-primary transition-colors shrink-0"
                                :title="'Open ' + stageableCount(s) + ' item(s) on the working surface'">
                          <i class="ph ph-stack text-base leading-none"></i></button>
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
          </div>

          <!-- ── Activity pill row (mobile) ────────────────────────────────
               Open / To-do / Jots are one Activity stop in the header nav:
               the estate's live layer, a gradient of commitment from a
               captured idea (jot) through a shaped intention (to-do) to work
               in flight (open branch). This segmented pill (the shared
               internal-tab style) switches among them, each pill carrying
               its live count. Switching routes through the shell's go*
               methods, so the URL keeps stamping the specific sub-view and
               existing ?view=activity / ?view=todo / ?view=jots links keep
               resolving. Open's as-of + Refresh ride the row's right side.
               The pill is the narrow-screen form only: on lg+ the trio renders
               side by side (Open the main column, To-do and Jots a right
               rail), so the pills hide and each pane shows its own header. -->
          <div x-show="tab==='activity' || tab==='todo' || tab==='jots'"
               class="lg:hidden flex items-center gap-2 mb-4 flex-wrap">
            <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 shrink-0" role="tablist">
              <button role="tab" @click="goSub('activity')"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                      :class="tab === 'activity' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                <i class="ph ph-git-branch text-lg"></i>Branches
                <span x-show="authed && openBranches.length" class="font-mono text-sm opacity-60"
                      x-text="openBranches.length"></span></button>
              <button role="tab" @click="goSub('todo')"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                      :class="tab === 'todo' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                <i class="ph ph-list-checks text-lg"></i>To-do
                <span x-show="authed && todoOpen.length" class="font-mono text-sm opacity-60"
                      x-text="todoOpen.length"></span></button>
              <button role="tab" @click="goSub('jots')"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                      :class="tab === 'jots' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                <i class="ph ph-lightbulb text-lg"></i>Jots
                <span x-show="authed && jotItems.length" class="font-mono text-sm opacity-60"
                      x-text="jotItems.length"></span></button>
            </div>
            <div class="grow"></div>
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
               One flex container for the trio. Mobile: the panes stack and the
               pill row above picks which one is visible ('hidden' class per
               inactive pane). Desktop (lg+): the 'hidden' toggle is overridden
               by lg:block, so all three render at once, Open as the main
               column and To-do + Jots as a right rail. -->
          <div x-show="tab==='activity' || tab==='todo' || tab==='jots'"
               class="flex flex-col lg:flex-row lg:items-start lg:gap-10">
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
          <div class="lg:block flex-1 min-w-0" :class="tab==='activity' ? '' : 'hidden'">
            <!-- Desktop header: the pill row is hidden on lg+, so the column
                 names itself and carries Open's as-of + Refresh. -->
            <div class="hidden lg:flex items-center gap-2 mb-4">
              <h2 class="text-lg font-semibold">Branches</h2>
              <span x-show="authed && openBranches.length" class="text-base font-mono text-base-content/40"
                    x-text="openBranches.length"></span>
              <span x-show="authed && !activityBusy && activityGeneratedAt" class="text-base text-base-content/45"
                    x-text="'as of ' + agoOf(activityGeneratedAt)"></span>
              <!-- Same slot, mid-crawl: the count, then the repos in flight in a
                   lighter weight, so the sentence reads as one line and the part
                   that changes every few seconds is the quieter half. -->
              <span x-show="activityBusy" class="text-base text-base-content/60"
                    x-text="activityProgressLabel"></span>
              <span x-show="activityBusy && activityProgressActive" class="text-base text-base-content/40 truncate"
                    x-text="'· ' + activityProgressActive"></span>
              <div class="grow"></div>
              <button x-show="authed" @click="refreshActivity()" :disabled="activityBusy"
                      class="flex items-center gap-1.5 text-base text-base-content/60 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors">
                <i class="ph ph-arrows-clockwise" :class="activityBusy && 'animate-spin'"></i>
                <span x-text="activityBusy ? 'Refreshing' : 'Refresh'"></span>
              </button>
            </div>
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
            <div x-show="authed && openBranches.length" class="flex flex-col gap-2 max-w-3xl">
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

          <aside class="lg:w-96 lg:shrink-0 min-w-0 flex flex-col gap-10">
          <!-- ── To-do view (Activity sub-tab) ─────────────────────────────
               A general, personal checklist: not repo-scoped, not a surface
               (no kinds or curation, just text + done). Stored as one small
               JSON file in the registry (lists/todo.json) so it is durable
               and reads the same from any browser with the viewer's token. -->
          <div class="lg:block max-w-xl" :class="tab==='todo' ? '' : 'hidden'">
            <h3 class="hidden lg:flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-3">
              <i class="ph ph-list-checks"></i>To-do
              <span x-show="authed && todoOpen.length" class="font-mono" x-text="todoOpen.length"></span></h3>
            <p x-show="!authed" class="text-base text-base-content/60">
              Set a token (Repos, top right) to see your to-do list.
            </p>
            <template x-if="authed">
              <div>
                <form @submit.prevent="addTodo()" class="flex gap-2 mb-4">
                  <input x-model="todoDraft" placeholder="Add a to-do…" autocomplete="off"
                         class="input input-bordered flex-1">
                  <button type="submit" class="btn btn-primary gap-1" :disabled="!todoDraft.trim()">
                    <i class="ph ph-plus"></i>Add</button>
                </form>

                <div x-show="todoLoading" class="flex justify-center py-16">
                  <span class="loading loading-dots loading-md opacity-30"></span>
                </div>

                <div x-show="!todoLoading" class="flex flex-col gap-1">
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
                <div x-show="todoErr" class="text-base text-error font-mono mt-2" x-text="todoErr"></div>
              </div>
            </template>
          </div>

          <!-- ── Jots view (Activity sub-tab) ──────────────────────────────
               Quick-captured ideas: the capture sibling of the To-do view.
               Same registry-file mechanics (lists/jots.json), different
               lifecycle: a jot has no done state. It sits in the pile, newest
               first with its age showing, until it is promoted somewhere real
               (a chron entry, a tracker task, a to-do) or deleted. -->
          <div class="lg:block max-w-xl" :class="tab==='jots' ? '' : 'hidden'">
            <h3 class="hidden lg:flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-base-content/40 mb-3">
              <i class="ph ph-lightbulb"></i>Jots
              <span x-show="authed && jotItems.length" class="font-mono" x-text="jotItems.length"></span></h3>
            <p x-show="!authed" class="text-base text-base-content/60">
              Set a token (Repos, top right) to see your jots.
            </p>
            <template x-if="authed">
              <div>
                <form @submit.prevent="addJot()" class="flex gap-2 mb-4">
                  <input x-model="jotDraft" placeholder="Jot an idea…" autocomplete="off"
                         class="input input-bordered flex-1">
                  <button type="submit" class="btn btn-primary gap-1" :disabled="!jotDraft.trim()">
                    <i class="ph ph-plus"></i>Add</button>
                </form>

                <div x-show="jotLoading" class="flex justify-center py-16">
                  <span class="loading loading-dots loading-md opacity-30"></span>
                </div>

                <div x-show="!jotLoading" class="flex flex-col gap-1">
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
                <div x-show="jotErr" class="text-base text-error font-mono mt-2" x-text="jotErr"></div>
              </div>
            </template>
          </div>

          </aside>
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
                <span class="text-base-content/30 shrink-0">/</span>
                <span class="font-mono text-base font-semibold truncate min-w-0" x-text="detailRow ? detailRow.name : ''"></span>
                <a x-show="detailRow && detailRow.pr" :href="detailRow && detailRow.pr ? prUrl(detailRow.repo, detailRow.pr.number) : '#'"
                   target="_blank" class="font-mono text-base font-bold shrink-0 hover:text-primary transition-colors"
                   x-text="detailRow && detailRow.pr ? '#' + detailRow.pr.number : ''"></a>
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
      // Repo-declared surfaces, one entry per declared file, grouped by repo in
      // the view: [{repo, ref, path, uid, file, blob, manifest, items, raw}].
      repoSurfaces: [],
      repoSurfLoading: false,
      _acct: null,     // memoized account-repos list, one call per load pass
      // Per-item embed expand state, keyed by the surface uid + item id. Kept off
      // the item objects so the surface editor round-trips the file clean.
      embedOpen: {},

      // Activity: read from the private registry's derived cache
      // (state/activity.json, lib/repo-activity-cache.js), the same read that
      // gives the Repos cards their freshness rollups and the Open view its
      // cross-repo branch list. One file read, no per-repo fanout.
      activity: {},           // { "owner/repo": <cache entry> }
      activityGeneratedAt: '',
      activityLoading: false,
      stagingBranch: '',      // "repo branch" key being staged (a compare is in flight)

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

      init(){
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.load();
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
      },

      // The working surface's size, shown on the mode pill so the shelf says
      // whether anything is on the bench without a trip over to look.
      get stagedCount(){ return (Alpine.store('browser')?.stage || []).length; },

      // Which estate view is showing, from the shell (Repos | Surfaces | To-do | Jots | Activity).
      get tab(){
        const v = window.__shell?.view;
        return (v === 'surfaces' || v === 'activity' || v === 'todo' || v === 'jots') ? v : 'repos';
      },
      // Activity pill taps: route through the shell so the header nav, the URL
      // stamp, and history stay on the one navigation path a tab tap uses.
      goSub(key){
        const s = window.__shell;
        if (!s) return;
        if (key === 'activity') s.goActivity();
        else if (key === 'todo') s.goTodo();
        else if (key === 'jots') s.goJots();
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
          this.activity = {}; this.activityGeneratedAt = '';
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
        this.loadActivity(reg);   // independent; the cards render without it

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
        finally { this.activityLoading = false; }
      },
      async reloadActivity(){
        if (!this.hasToken()) return;
        const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
        await this.loadActivity(reg);
      },
      // Force the crawl (the Activity view's Refresh button). The shell owns the
      // crawl + throttle and fires web-tools:activity-refreshed when it commits.
      refreshActivity(){ window.__shell?.refreshActivity?.(); },
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
      // being read. The crawl probed; this judges. lib/repo-checks.js explains
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
        { key: 'open', label: 'Open', icon: 'ph-git-pull-request',
          note: 'Work in flight: an open PR, or content the survey found nowhere on the default branch.' },
        { key: 'active', label: 'Recent', icon: 'ph-pulse',
          note: 'Committed in the last 14 days. Date-only, never surveyed, so judge nothing from it yet.' },
        { key: 'stranded', label: 'Stranded', icon: 'ph-warning-circle',
          note: 'Older branches holding content that exists nowhere on the default branch.' },
        { key: 'landed', label: 'Landed', icon: 'ph-check-circle',
          note: 'Older branches whose content is on the default branch. Likely history, and the set a cleanup pass deletes.' },
        { key: 'all', label: 'All', icon: 'ph-list-bullets',
          note: 'Every branch the crawl surveyed, in every group.' },
      ],
      branchScope: 'open',
      inScope(r, scope){
        if (scope === 'all') return true;
        if (scope === 'open') return !!r.pr || r.group === 'stranded';
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
      branchKey(repo, name){ return repo + ' ' + name; },
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
      // survey's read (lib/branch-survey.js surveyBranchLive): a plain compare,
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
        this.detailReady = false;
        this.detail = { rows, i: Math.max(0, rows.findIndex(r => r.repo + '/' + r.name === key)) };
      },
      closeDetail(){ this.detail = null; this.detailReady = false; },
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
        if (i !== this.detail.i) { this.detailReady = false; this.detail = { ...this.detail, i }; }
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

      // Shelf to bench. Replaces the working set rather than appending to it:
      // "open" is what the gesture says, and a merge would leave you unable to
      // tell which items came from where. The old set is not lost if it was
      // saved, and saving is one tap on the bench.
      openAsStage(s){
        const { items, skipped } = window.Surface.toStage(s);
        if (!items.length) return;
        Alpine.store('browser').stage = items;
        const note = skipped.length ? ' (' + skipped.length + ' item(s) without a file left behind)' : '';
        Alpine.store('toast')?.('stack', 'Opened ' + items.length + ' on the working surface' + note, 'alert-success', 3000);
        window.__shell?.goStage();
      },

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

      // The stacked sections the Surfaces view renders: General (the registry
      // surfaces) first when non-empty, then one section per repo that declared
      // a surface, in repo order. Each section carries a DOM anchor so a Repos
      // card can deep-link straight to it.
      get surfaceSections(){
        const secs = [];
        if (this.surfaces.length)
          secs.push({ key: 'general', repo: null, anchor: 'surface-sec-general', surfaces: this.surfaces });
        const by = new Map();
        for (const s of this.repoSurfaces){
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
        this.jotItems.push({ id: 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                             text, created_at: new Date().toISOString() });
        await this.saveJots('Jot "' + clip(text) + '" via show-repo');
      },
      async deleteJot(it){
        if (!this.hasToken()) return;
        this.jotItems = this.jotItems.filter(x => x.id !== it.id);
        await this.saveJots('Delete jot "' + clip(it.text) + '" via show-repo');
      },
      async saveJots(message){
        try {
          const reg = new window.GH({ token: window.TOKEN, repo: this.registry(), ref: 'main' });
          if (typeof reg.save !== 'function' && window.gh?.load) await window.gh.load('gh-store.js');
          await reg.save(JOTS_PATH, { items: this.jotItems }, message);
        } catch (e) {
          Alpine.store('toast')?.('warning', 'Jot save failed: ' + (e?.message || e), 'alert-error', 6000);
        }
      },

      // Route through openPinned so the landing flip is explicit: ensureBrowser
      // alone leaves the view untouched when the card's repo is already open
      // (always true for the default repo tapped from the estate).
      async openRepo(repo){ await window.__shell?.openPinned(repo); },

      // ── Surface items ──────────────────────────────────────────────────────
      // Every question below is asked of lib/surface.js, which is the only
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
      // (lib/source-peek.js). A `github_dir` item points at a tree, so it gets
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
