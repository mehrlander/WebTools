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
    const KIND_ICONS = {
      github_blob: 'ph-file', github_dir: 'ph-folder', repo: 'ph-git-branch',
      url: 'ph-link', note: 'ph-note', story: 'ph-book-open', embed: 'ph-app-window',
    };
    // Seed for a brand-new surface. Inert until filled, so saving as-is is safe.
    const SURFACE_TEMPLATE = {
      manifest: { name: '', description: '', category: 'showcase' },
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
              <button @click="document.getElementById('repo')?.__repo?.openDialog()"
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

            <!-- Sync + reload: force a re-read of every repo's .web-tools.json
                 into the registry config cache, then reload these cards. The
                 cards update on their own after an in-app config edit; this is
                 the manual path for a change made elsewhere (another session, a
                 direct commit) or just to confirm the latest. Routes through the
                 shell's refreshConfigs, which awaits the rebuild and then fires
                 configs-refreshed, the one signal the estate reloads on. -->
            <div x-show="authed" class="flex justify-end mb-3">
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
                          <!-- Status + actions. Gear edits the shown repo's
                               placement (its own config); logo opens it on
                               GitHub. With a nested companion the visibility
                               glyph is a TOGGLE. -->
                          <button x-show="e.child" @click="e.showChild = !e.showChild"
                                  class="text-base-content/40 hover:text-primary transition-colors shrink-0 cursor-pointer"
                                  :title="e.showChild ? 'back to ' + e.repo.split('/')[1] : 'show ' + e.child?.repo.split('/')[1]">
                            <i class="ph text-base leading-none" :class="face(e).meta?.priv ? 'ph-lock' : 'ph-globe'"></i>
                          </button>
                          <span x-show="!e.child && e.meta" class="shrink-0 text-base-content/40"
                                :title="e.meta?.priv ? 'private' : 'public'">
                            <i class="ph text-base leading-none"
                               :class="e.meta?.priv ? 'ph-lock' : 'ph-globe'"></i></span>
                          <button x-show="authed" @click="editEntry(face(e))"
                                  class="text-base-content/30 hover:text-primary transition-colors shrink-0"
                                  title="Placement: icon, group, note (and repo config)">
                            <i class="ph ph-gear-six text-base leading-none"></i></button>
                          <!-- Public browse this repo (no token, via jsDelivr). The
                               dialog's old CDN/flat-tree links retired here: this
                               is where a file listing actually belongs. -->
                          <button @click.stop="window.__shell?.goPublicBrowse(face(e).repo)"
                                  class="text-base-content/30 hover:text-primary transition-colors shrink-0"
                                  title="Public browse (no token, via jsDelivr)">
                            <i class="ph ph-cloud-arrow-down text-base leading-none"></i></button>
                          <a :href="'https://github.com/' + face(e).repo" target="_blank" @click.stop
                             class="text-base-content/30 hover:text-base-content/70 transition-colors shrink-0"
                             title="Open on GitHub"><i class="ph ph-github-logo text-base leading-none"></i></a>
                        </div>
                        <p class="text-base text-base-content/70 min-h-8" x-text="face(e).note || face(e).meta?.desc || ''"></p>

                        <!-- The repo's own pinned folders / files. The title
                             opens the repo; Files/Atlas are one sidebar tap
                             away, so the card carries only the repo's pins. -->
                        <div x-show="face(e).pins && face(e).pins.length"
                             class="flex flex-wrap items-center gap-1 mt-0.5">
                          <template x-for="p in (face(e).pins || [])" :key="p">
                            <button @click="openRepoAt(face(e), p)"
                                    class="badge badge-sm badge-ghost gap-1 font-mono cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
                                    :title="p">
                              <i class="ph text-base" :class="pinIsFile(p) ? 'ph-file' : 'ph-folder'"></i>
                              <span x-text="pinLabel(p)"></span>
                            </button>
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
                                    :title="'Branch review (' + (cardActivity(face(e).repo).counts?.branches || 0) + ' branches)'">
                              <i class="ph ph-git-branch text-base"></i><span x-text="cardActivity(face(e).repo).counts?.branches || 0"></span>
                            </button>
                            <span x-show="cardActivity(face(e).repo).counts?.stranded"
                                  class="badge badge-sm badge-ghost gap-1 text-warning"
                                  :title="cardActivity(face(e).repo).counts.stranded + ' stranded branches'">
                              <i class="ph ph-warning-circle text-base"></i><span x-text="cardActivity(face(e).repo).counts.stranded"></span>
                            </span>
                            <span x-show="cardActivity(face(e).repo).counts?.openPRs"
                                  class="badge badge-sm badge-ghost gap-1 text-primary"
                                  :title="cardActivity(face(e).repo).counts.openPRs + ' open pull requests'">
                              <i class="ph ph-git-pull-request text-base"></i><span x-text="cardActivity(face(e).repo).counts.openPRs"></span>
                            </span>
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
            <div class="flex items-center gap-2 mb-4" x-show="authed">
              <div class="grow"></div>
              <button @click="newSurface()"
                      class="btn btn-ghost gap-1.5 text-base-content/60 hover:text-primary border border-dashed border-base-300">
                <i class="ph ph-plus-circle text-base"></i> New
              </button>
            </div>

            <p x-show="!authed" class="text-base text-base-content/60">
              Set a token (header shield) to see surfaces.
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
                        <button x-show="authed && !sec.repo" @click="editSurface(s)"
                                class="self-center text-base-content/30 hover:text-primary transition-colors shrink-0"
                                title="Edit this surface file">
                          <i class="ph ph-gear-six text-base leading-none"></i></button>
                        <a x-show="sec.repo" :href="s.blob" target="_blank"
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
                          <a x-show="itemGh(it)" :href="itemGh(it)" target="_blank"
                             class="text-base-content/30 hover:text-base-content/70 transition-colors shrink-0"
                             title="Open on GitHub"><i class="ph ph-github-logo"></i></a>
                        </div>
                        <p x-show="it.snippet" class="text-base text-base-content/50 mt-1" x-text="it.snippet"></p>
                        <p x-show="it.commentary" class="text-base text-base-content/60 mt-1.5 whitespace-pre-line border-l-2 border-base-300 pl-2"
                           x-text="it.commentary"></p>
                        <p x-show="bodyOf(it)" class="text-base text-base-content/70 mt-1.5 whitespace-pre-line"
                           x-text="bodyOf(it)"></p>

                        <!-- Live embed (kind:embed): a renderer page rendered in
                             place via toss-render's page-sugar (#<page>=<addr>),
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
                <i class="ph ph-git-pull-request text-lg"></i>Open
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
                <span x-show="activityGeneratedAt" class="hidden sm:inline text-base text-base-content/45"
                      x-text="'as of ' + agoOf(activityGeneratedAt)"></span>
                <button @click="refreshActivity()" :disabled="activityBusy"
                        class="flex items-center gap-1.5 text-base text-base-content/60 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors">
                  <i class="ph ph-arrows-clockwise" :class="activityBusy && 'animate-spin'"></i>
                  <span x-text="activityBusy ? 'Crawling…' : 'Refresh'"></span>
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
               freshest first. Each row highlights by PR state (ready / draft /
               no-PR) and carries a caption-style link cluster: browse the branch
               here, its tree and compare on GitHub, the guide PR, and the Claude
               Code session that authored it. Read off the activity cache, no
               per-visit fanout; Refresh re-crawls the estate through the shell. -->
          <div class="lg:block flex-1 min-w-0" :class="tab==='activity' ? '' : 'hidden'">
            <!-- Desktop header: the pill row is hidden on lg+, so the column
                 names itself and carries Open's as-of + Refresh. -->
            <div class="hidden lg:flex items-center gap-2 mb-4">
              <h2 class="text-lg font-semibold">Open</h2>
              <span x-show="authed && openBranches.length" class="text-base font-mono text-base-content/40"
                    x-text="openBranches.length"></span>
              <span x-show="authed && activityGeneratedAt" class="text-base text-base-content/45"
                    x-text="'as of ' + agoOf(activityGeneratedAt)"></span>
              <div class="grow"></div>
              <button x-show="authed" @click="refreshActivity()" :disabled="activityBusy"
                      class="flex items-center gap-1.5 text-base text-base-content/60 hover:text-primary px-2 py-1 rounded-lg hover:bg-base-200 transition-colors">
                <i class="ph ph-arrows-clockwise" :class="activityBusy && 'animate-spin'"></i>
                <span x-text="activityBusy ? 'Crawling…' : 'Refresh'"></span>
              </button>
            </div>
            <p x-show="!authed" class="text-base text-base-content/60">
              Open branches live in the private registry. Add a token with the shield in the header to see them.
            </p>

            <div x-show="authed && activityLoading" class="flex justify-center py-16">
              <span class="loading loading-dots loading-md opacity-30"></span>
            </div>

            <div x-show="authed && !activityLoading && !openBranches.length"
                 class="rounded-xl bg-base-200/40 p-4 text-base text-base-content/60 max-w-lg">
              No open branches. The estate is level with its default branches, or the cache is cold: Refresh to crawl now (it also builds on a ~12h throttle).
            </div>

            <!-- One row per live branch. A colored left rail plus faint tint
                 carries PR state (like the console's level rail); the branch name
                 is the highlight and opens it here. The link cluster mirrors the
                 caption skill: Browse (here) / Tree / Compare / PR / Session,
                 with a per-repo Branches drill-down pinned to the right. -->
            <div x-show="authed && openBranches.length" class="flex flex-col gap-2 max-w-3xl">
              <template x-for="row in openBranches" :key="row.repo + '/' + row.name">
                <div class="rounded-lg border-l-4 pl-3 pr-3 py-2 transition-colors hover:brightness-[1.02]"
                     :class="branchAccent(row)">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-mono text-base text-base-content/50 shrink-0" x-text="repoShort(row.repo)"></span>
                    <span class="text-base-content/30 shrink-0">/</span>
                    <button @click="stageBranchDiff(row.repo, row.name, row.def)" :disabled="isStaging(row.repo, row.name)"
                            class="font-mono text-base font-semibold truncate hover:text-primary transition-colors text-left min-w-0"
                            :title="'Stage the files changed on ' + row.name" x-text="row.name"></button>
                    <!-- PR reference in the GitHub #-number style, colored by state
                         (the left rail carries the same green/amber/muted cue). -->
                    <a x-show="row.pr" :href="row.pr ? prUrl(row.repo, row.pr.number) : '#'" target="_blank"
                       :title="row.pr?.title + (row.pr?.draft ? ' (draft)' : ' (ready for review)')"
                       class="font-mono text-base font-bold text-base-content/90 shrink-0 hover:text-primary transition-colors"
                       x-text="'#' + (row.pr?.number)"></a>
                    <span x-show="!row.pr" class="font-mono text-base text-base-content/40 shrink-0">no&nbsp;PR</span>
                    <div class="grow"></div>
                    <span x-show="row.date" class="text-base text-base-content/50 shrink-0 tabular-nums"
                          :title="agoOf(row.date)" x-text="agoShort(row.date)"></span>
                  </div>
                  <p x-show="row.subject" class="text-base text-base-content/60 truncate mt-0.5"
                     :title="row.subject" x-text="row.subject"></p>
                  <div class="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-2 text-base">
                    <!-- No Stage button: the branch name is the stage action. A
                         spinner rides here while that compare is in flight. -->
                    <span x-show="isStaging(row.repo, row.name)" class="flex items-center gap-1.5 text-base-content/70">
                      <i class="ph ph-circle-notch animate-spin text-lg"></i>Staging…</span>
                    <a :href="treeUrl(row.repo, row.name)" target="_blank"
                       class="flex items-center gap-1.5 text-base-content/70 hover:text-primary transition-colors">
                      <i class="ph ph-git-branch text-lg"></i>Tree</a>
                    <a :href="compareUrl(row.repo, row.def, row.name)" target="_blank"
                       class="flex items-center gap-1.5 text-base-content/70 hover:text-primary transition-colors">
                      <i class="ph ph-git-diff text-lg"></i>Compare</a>
                    <!-- The Claude session that authored the branch: its logomark
                         in brand color, no label, lifted from the guide PR footer. -->
                    <a x-show="row.pr && row.pr.session" :href="row.pr?.session" target="_blank"
                       title="Open the Claude session that authored this branch"
                       class="flex items-center hover:opacity-75 transition-opacity">
                      <svg viewBox="0 0 24 24" class="w-5 h-5 shrink-0" style="stroke:#d97757" stroke-width="2.2" stroke-linecap="round" fill="none" aria-hidden="true"><path d="M12,12 L12.0,1.6 M12,12 L17.62,3.25 M12,12 L21.46,7.68 M12,12 L22.29,13.48 M12,12 L19.86,18.81 M12,12 L14.93,21.98 M12,12 L9.07,21.98 M12,12 L4.14,18.81 M12,12 L1.71,13.48 M12,12 L2.54,7.68 M12,12 L6.38,3.25"/></svg></a>
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
              Set a token (header shield) to see your to-do list.
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
              Set a token (header shield) to see your jots.
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
        </div>`,

      loading: true,
      authed: false,
      entries: [],     // [{repo, icon, note, group, order, meta, err, pins, hasLanding, child}]
      surfaces: [],    // registry surfaces: [{uid, file, manifest, items, raw}]
      surfLoading: false,
      surfActive: 0,
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
      },

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
                            meta: null, err: false, pins: [], hasLanding: false, child: null, showChild: false }];
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
            pins: Array.isArray(cfg.pins) ? cfg.pins.slice(0, 6) : [],
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

      // A card's cached activity, or null (public, uncrawled, or pre-cache).
      cardActivity(repo){ return this.activity[repo] || null; },

      // ── Open view: the estate's live branches ────────────────────────────
      // Every branch with genuinely-open work, unioned by repo+name and freshest
      // first. "Open" is not "recent": a branch merged via a merge commit is an
      // ancestor of the default, so it holds no work ahead of it and would stage
      // to nothing, yet its commit date still reads recent. So a bare recent
      // ('active') branch is NOT shown on recency alone; a row qualifies only if
      //   - it has an OPEN PR (authoritative open work; an auto draft PR opens on
      //     first push, so genuinely-open branches almost always have one), or
      //   - the content survey marks it STRANDED (its content is nowhere on the
      //     default branch, the honest "ahead of main" signal the branch review
      //     already computes).
      // This drops the flood of merged-but-undeleted branches that otherwise fill
      // the list and stage empty. Landed branches (content in main) never show.
      // Each row carries its open PR when one matches (pr.head === branch), so the
      // link cluster points at the PR and the authoring session with no extra fetch.
      get openBranches(){
        const out = [];
        for (const [repo, e] of Object.entries(this.activity)){
          const def = e.defaultBranch || 'main';
          const prByHead = new Map((e.openPRs || []).filter(p => p.head).map(p => [p.head, p]));
          const seen = new Set();
          for (const b of (e.survey?.branches || [])){
            if (b.name === def) continue;
            const pr = prByHead.get(b.name) || null;
            if (!pr && b.group !== 'stranded') continue;   // open PR, or genuinely ahead
            seen.add(b.name);
            out.push({ repo, def, name: b.name, date: b.date || '', subject: b.subject || '', pr,
                       ahead: pr?.aheadBy ?? b.aheadBy ?? null, behind: pr?.behindBy ?? b.behindBy ?? null });
          }
          // An open PR whose branch was not in the survey (a fresh push, or one
          // beyond the survey cap) is still open work, so surface it directly.
          for (const p of (e.openPRs || [])){
            if (!p.head || p.head === def || seen.has(p.head)) continue;
            out.push({ repo, def, name: p.head, date: p.updatedAt || '', subject: p.title || '', pr: p,
                       ahead: p.aheadBy ?? null, behind: p.behindBy ?? null });
          }
        }
        return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      },
      // Row state, driving the left-accent color and the pill: a ready PR, a
      // draft PR (the normal in-flight state), or a branch that is ahead of main
      // (stranded) with no PR.
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
      prUrl(repo, n){ return 'https://github.com/' + repo + '/pull/' + n; },

      repoShort(repo){ return (repo || '').split('/')[1] || repo; },
      // Relative time from an ISO date, reusing GH.ago (one throwaway instance).
      agoOf(iso){ try { return iso ? (this.__ago ||= new window.GH({})).ago(iso) : ''; } catch { return ''; } },
      // Compact form for the dense tables: drop " ago", collapse "just now".
      agoShort(iso){ return this.agoOf(iso).replace(' ago', '').replace('just now', 'now'); },
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

      // ── Card jumps: open a repo straight at a goal ─────────────────────────
      pinIsFile(p){ return /\.[^./]+$/.test((p || '').split('/').pop() || ''); },
      pinLabel(p){ const s = (p || '').replace(/\/+$/, ''); return s.split('/').pop() || s; },
      async openRepoAt(en, path){
        if (!window.__shell) return;
        await window.__shell.ensureBrowser(en.repo, en.meta?.ref || '');
        if (this.pinIsFile(path)) await window.__shell.openFile(path);
        else await window.__shell.openFolder(path.replace(/\/+$/, ''));
      },
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

      // The card gear opens the shared repo dialog (info + links / config) on
      // this card's repo, on its Config tab, WITHOUT navigating the shell to it.
      // One dialog for every repo, on the dashboard and on a repo page alike.
      editEntry(en){
        const rc = document.getElementById('repo')?.__repo;
        if (rc && en) rc.openDialog(en.repo, { tab: 'settings' });
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
              return { uid: 'reg:' + f.name, file: f.name, manifest: raw.manifest || {}, items: Array.isArray(raw.items) ? raw.items : [], raw };
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
                if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
                out.push({
                  repo, ref, path,
                  uid: repo + ':' + path,
                  file: path.split('/').pop(),
                  blob: 'https://github.com/' + repo + '/blob/' + ref + '/' + path,
                  manifest: raw.manifest || {},
                  items: Array.isArray(raw.items) ? raw.items : [],
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
      kindIcon(it){ return KIND_ICONS[it.kind] || 'ph-shapes'; },
      bodyOf(it){ return (it.kind === 'note' || it.kind === 'story') ? (it.body || '') : ''; },

      // A kind:embed item renders a renderer page live through toss-render's
      // page-sugar (#<page>=<addr>): the item names the renderer (page, the
      // sugar key, default chat-results) and the envelope's location ({repo,
      // ref, path}); estate composes the one address and toss-render stays the
      // schema-blind router. A chat/trawl results envelope is the first use;
      // any other PAGE_SUGAR renderer embeds by naming its page, no code here.
      isEmbed(it){ return it.kind === 'embed'; },
      embedPage(it){ return it.page || 'chat-results'; },
      embedUrl(it){
        if (!it.repo || !it.path) return '';
        const ref = it.ref ? '@' + it.ref : '';
        return '../toss-render.html#' + this.embedPage(it) + '=' + it.repo + ref + ':' + it.path;
      },
      embedKey(s, it){ return (s.uid || s.file) + '/' + (it.id || it.title || ''); },
      isEmbedOpen(s, it){ return !!this.embedOpen[this.embedKey(s, it)]; },
      toggleEmbed(s, it){ const k = this.embedKey(s, it); this.embedOpen[k] = !this.embedOpen[k]; },

      itemRef(it){
        if (it.kind !== 'github_blob' && it.kind !== 'github_dir') return null;
        if (it.repo && it.path) return { repo: it.repo, ref: it.ref || '', path: it.path, dir: it.kind === 'github_dir' };
        const m = (it.url || '').match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/(blob|tree)\/([^/]+)\/(.+?)(?:[?#].*)?$/);
        if (m) return { repo: m[1], ref: m[3], path: m[4], dir: m[2] === 'tree' };
        return null;
      },
      openable(it){ return !!this.itemRef(it); },
      itemPath(it){ return this.itemRef(it)?.path || ''; },
      itemPill(it){
        const r = this.itemRef(it);
        if (r) return r.repo;
        if (this.isEmbed(it)) return it.repo || '';
        if (it.url) { try { return new URL(it.url).hostname; } catch {} }
        return '';
      },
      itemGh(it){
        const r = this.itemRef(it);
        if (r) return 'https://github.com/' + r.repo + '/' + (r.dir ? 'tree' : 'blob') + '/' + (r.ref || 'main') + '/' + r.path;
        // An embed's github link points at the envelope blob it renders.
        if (this.isEmbed(it) && it.repo && it.path)
          return 'https://github.com/' + it.repo + '/blob/' + (it.ref || 'main') + '/' + it.path;
        return '';
      },
      // An embed's title opens the same render full screen (the toss-render
      // page-sugar URL); a url item opens its external link, as before.
      itemExt(it){
        if (this.isEmbed(it)) return this.embedUrl(it);
        return (it.kind === 'url' || (!this.itemRef(it) && it.url)) ? (it.url || '') : '';
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
