document.addEventListener('alpine:init', function() {
  Alpine.data('repo', function(opts) {
    opts = opts || {};
    const inline = !!opts.inline;
    const refDropdown = `
              <div class="dropdown-content z-10 p-3 shadow-lg bg-base-200 rounded-box w-80 mt-1 border border-base-300">
                <div class="text-sm font-bold mb-1.5 opacity-70">Switch ref (branch / tag / SHA)</div>
                <div class="flex gap-1.5 mb-2">
                  <input type="text" x-model="refInput" placeholder="branch-name or sha or full URL"
                    class="input input-xs input-bordered flex-1 font-mono text-sm"
                    @keyup.enter="applyRefInput(); $el.closest('details').open = false">
                  <button @click="applyRefInput(); $el.closest('details').open = false" :disabled="!refInput.trim()" class="btn btn-xs btn-primary">Go</button>
                </div>
                <div x-show="defaultRef && ref !== defaultRef" class="mb-2">
                  <button @click="setRef(defaultRef); $el.closest('details').open = false" class="btn btn-xs btn-ghost gap-1 w-full">
                    <i class="ph ph-arrow-counter-clockwise"></i>
                    Back to <span class="font-mono" x-text="defaultRef"></span>
                  </button>
                </div>
                <div class="text-sm font-bold mb-1 opacity-70">Branches</div>
                <div x-show="$store.browser.branchesLoading" class="flex justify-center py-2">
                  <span class="loading loading-dots loading-xs opacity-50"></span>
                </div>
                <div x-show="!$store.browser.branchesLoading" class="max-h-48 overflow-y-auto">
                  <template x-for="b in $store.browser.branches" :key="b.name">
                    <a @click="setRef(b.name); $el.closest('details').open = false" class="flex items-center gap-1 p-1 hover:bg-base-300 rounded cursor-pointer text-sm font-mono"
                      :class="b.name === ref ? 'bg-primary/10 text-primary font-bold' : ''">
                      <i class="ph ph-git-branch text-sm opacity-50"></i>
                      <span class="truncate" x-text="b.name"></span>
                    </a>
                  </template>
                  <div x-show="!$store.browser.branchesLoading && !$store.browser.branches.length" class="text-sm opacity-50 py-1">No branches loaded.</div>
                </div>
              </div>`;
    const repoDropdown = `
              <div class="dropdown-content z-10 py-2 shadow-lg bg-base-200 rounded-box w-80 max-h-[32rem] overflow-y-auto mt-1 border border-base-300">
                <!-- The estate (global) context, above the owner's repos. Only
                     on a host that has it (show-repo); guarded by hasEstate(). -->
                <template x-if="hasEstate()">
                  <div>
                    <a @click="showEstate(); $el.closest('details').open = false"
                       class="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-base-300 transition-colors"
                       :class="estate ? 'bg-primary/8 text-primary font-semibold' : ''">
                      <i class="ph ph-circles-four text-base shrink-0"></i>
                      <span class="text-base">Repositories</span>
                    </a>
                    <div class="border-t border-base-300 my-1"></div>
                  </div>
                </template>
                <div class="text-[12px] font-bold uppercase tracking-wider opacity-40 px-3 mb-1" x-text="owner"></div>
                <template x-for="r in repos" :key="r.name">
                  <a @click="pickFromHeader(r)" class="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-base-300 transition-colors"
                    :class="r.name === name ? 'bg-primary/8' : ''">
                    <i class="ph text-base shrink-0 mt-0.5" :class="r.private ? 'ph-lock-simple opacity-40' : 'ph-globe-simple opacity-25'"></i>
                    <div class="min-w-0 flex-1">
                      <div class="font-mono text-base truncate" :class="r.name === name ? 'text-primary font-semibold' : ''" x-text="r.name"></div>
                      <div class="flex items-center gap-2 mt-0.5 text-[12px] text-base-content/40 leading-tight">
                        <span x-show="r.language" x-text="r.language"></span>
                        <span x-show="r.stargazers_count" class="flex items-center gap-0.5"><i class="ph ph-star text-[11px]"></i><span x-text="r.stargazers_count"></span></span>
                        <span x-show="r.pushed_at" x-text="gh.ago(r.pushed_at)"></span>
                      </div>
                    </div>
                  </a>
                </template>
                <div x-show="!repos.length" class="text-sm opacity-40 px-3 py-2">No repositories loaded.</div>
              </div>`;
    // Fields a repo may self-declare, edited on the dialog (Settings form or raw
    // JSON). estate/group/note/order/quickLink are the estate placement (the
    // repo owns how it appears on the estate); icon/landing/pins/stage are the
    // rest of its web-tools config. All inert until set, so saving the template
    // as-is is harmless. Seeded for a repo that has no config yet. (Nesting is by
    // convention — owner/foo-private under owner/foo — not a field.)
    const CFG_TEMPLATE = { icon: '', estate: false, group: '', note: '', order: 0,
                           quickLink: false, landing: '', pins: [],
                           stage: { files: [], targets: [] } };
    const CFG_DOCS_URL = 'https://github.com/mehrlander/web-tools/blob/main/docs/manifest.md';
    // One dialog with two scopes. Repo scope (opened with a repo: an estate card,
    // a sidebar Repos row, the Map) has three tabs targeting dlg.repo without
    // navigating there:
    //   Info      repo facts + token + a Public-browse shortcut
    //   Settings  the config as a form (the common fields)
    //   Config    the same config as raw JSON (the whole shared file)
    // Estate scope (opened with no repo from the Repos dashboard's account
    // control) is an account panel: the token control alone, no repo tabs.
    // Settings and Config are two views of one object, synced on tab switch
    // (dlgTab). Fixed box size (w/h) with a scrolling body, so switching tabs
    // never resizes the dialog.
    //
    // The dialog is not the only way to either: the roomy Config VIEW in the
    // sidebar edits the OPEN repo's manifest, so this is the path for a repo you
    // are not in, plus the token itself.
    //
    // The token control is shared by both scopes, so it lives in one string and is
    // interpolated into each, keeping it real Alpine markup (x-html would not wire
    // its input and buttons).
    const authBlock = `
                <div>
                  <div x-show="auth" class="flex items-center justify-between gap-2 text-sm">
                    <div class="flex items-center gap-2">
                      <i class="ph ph-shield-check text-success"></i>
                      <span>Authenticated as <span class="font-mono" x-text="user"></span></span>
                    </div>
                    <button @click="clearToken()" class="text-[12px] text-base-content/40 hover:text-error underline">clear</button>
                  </div>
                  <div x-show="!auth" class="flex flex-col gap-1.5">
                    <div class="flex items-center gap-2 text-sm">
                      <i class="ph" :class="tokenExpired ? 'ph-warning text-warning' : 'ph-globe text-base-content/40'"></i>
                      <span x-text="tokenExpired ? 'Token expired, enter a new one' : 'Public access only, paste a token for auth'"></span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <input type="password" x-model="tokenInput" placeholder="ghp_..." class="input input-xs input-bordered flex-1 font-mono text-sm" @keyup.enter="saveToken()">
                      <button @click="saveToken()" :disabled="!tokenInput" class="btn btn-xs btn-primary">Save</button>
                    </div>
                    <a href="https://github.com/settings/tokens/new?scopes=repo&description=web-tools"
                       target="_blank" rel="noopener" class="link link-primary text-sm flex items-center gap-1 w-fit">
                      <i class="ph ph-arrow-square-out"></i>Get a token</a>
                  </div>
                </div>`;
    const dialogHtml = `
        <dialog id="repoModal" class="modal" onclick="if(event.target===this)this.close()">
          <!-- Fixed box height in repo scope, so switching tabs never resizes
               the dialog. The account panel has no tabs and one short control,
               so it sizes to its content instead of standing mostly empty. -->
          <div class="modal-box shadow-none border border-base-300 bg-base-100 p-0 w-[32rem] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-4rem)] flex flex-col overflow-hidden"
               :class="dlg.estate ? '' : 'h-[34rem]'">
            <!-- Header: target repo + tab switch (fixed). In estate scope the
                 title reads "Account" and the tabs are hidden, since the panel
                 is about the token, not a repo. In repo scope the repo name is
                 the one-tap GitHub link, since the dialog's old GitHub/CDN/
                 flat-tree link list was retired. -->
            <div class="flex items-center justify-between gap-2 p-4 pb-2 shrink-0">
              <div class="min-w-0">
                <div x-show="dlg.estate" class="font-mono text-base font-bold flex items-center gap-1.5">
                  <i class="ph ph-key text-primary"></i>Account
                </div>
                <a x-show="!dlg.estate" :href="'https://github.com/' + dlg.repo + '/tree/' + dlg.ref" target="_blank"
                   rel="noopener" class="font-mono text-base font-bold truncate flex items-center gap-1 hover:text-primary transition-colors">
                  <span class="truncate" x-text="dlg.repo"></span>
                  <i class="ph ph-github-logo text-sm opacity-50 shrink-0"></i>
                </a>
                <div x-show="!dlg.estate" class="text-[12px] text-base-content/40 font-mono leading-tight" x-text="dlg.ref"></div>
              </div>
              <div x-show="!dlg.estate" class="join shrink-0">
                <button @click="dlgTab('info')" class="btn btn-xs btn-square join-item tooltip tooltip-bottom"
                        :class="tab==='info' ? 'btn-primary btn-active' : 'btn-ghost'" data-tip="Info">
                  <i class="ph ph-info text-base"></i></button>
                <button @click="dlgTab('settings')" class="btn btn-xs btn-square join-item tooltip tooltip-bottom"
                        :class="tab==='settings' ? 'btn-primary btn-active' : 'btn-ghost'" data-tip="Settings">
                  <i class="ph ph-sliders-horizontal text-base"></i></button>
                <button @click="dlgTab('config')" class="btn btn-xs btn-square join-item tooltip tooltip-bottom"
                        :class="tab==='config' ? 'btn-primary btn-active' : 'btn-ghost'" data-tip="Config">
                  <i class="ph ph-code text-base"></i></button>
              </div>
            </div>

            <!-- Body: a flex column filling the fixed box, so the box size is
                 constant across tabs. Info/Settings scroll their content; the
                 Config editor's textarea flexes to fill the height. -->
            <div class="flex-1 min-h-0 px-4 pb-2 flex flex-col">

              <div x-show="dlg.loading" class="flex justify-center py-16">
                <span class="loading loading-dots loading-md opacity-30"></span>
              </div>

              <!-- INFO tab (repo scope): the repo's facts and the token control.
                   The GitHub/CDN/flat-tree link list that used to live here is
                   retired: GitHub is the header title link, and a file listing
                   belongs in Public browse, not this dialog. -->
              <div x-show="!dlg.loading && !dlg.estate && tab==='info'" class="flex-1 min-h-0 overflow-y-auto flex flex-col">
                <div x-show="dlg.repoObj?.description" class="mb-3 text-sm text-base-content/60 italic" x-text="dlg.repoObj?.description"></div>
                <div x-show="dlg.repoObj" class="flex flex-wrap gap-1.5 mb-3">
                  <span class="badge badge-sm badge-ghost font-mono" x-text="dlg.repoObj?.private ? 'private' : 'public'"></span>
                  <span class="badge badge-sm badge-ghost font-mono" x-text="(dlg.repoObj?.stargazers_count || 0) + ' stars'"></span>
                  <span class="badge badge-sm badge-ghost font-mono" x-text="(dlg.repoObj?.forks_count || 0) + ' forks'"></span>
                  <span class="badge badge-sm badge-ghost font-mono" x-text="dlg.repoObj?.default_branch"></span>
                  <span class="badge badge-sm badge-ghost font-mono" x-text="dlg.repoObj ? 'pushed ' + gh.ago(dlg.repoObj.pushed_at) : ''"></span>
                </div>
                <div class="mb-1">${authBlock}</div>
                <div class="mt-3">
                  <button @click="window.__shell?.goPublicBrowse(dlg.repo)"
                          class="btn btn-ghost btn-xs gap-1.5 border border-base-300 text-base-content/70">
                    <i class="ph ph-cloud-arrow-down"></i>Browse files (no token, via jsDelivr)</button>
                </div>
              </div>

              <!-- ESTATE scope: the account panel, reached from the Repos
                   dashboard's account control. One job now, the GitHub token:
                   "Refresh views" left with the header shield, and the Repos
                   view's own Refresh button has since followed it; that
                   refreshConfigs is the State view's config row now. -->
              <div x-show="!dlg.loading && dlg.estate" class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pt-1">
                <div class="text-sm text-base-content/50">
                  Account-level: the GitHub token this browser reads and writes with, not any one repo.
                  Open a repo's card gear to edit that repo.
                </div>
                ${authBlock}
              </div>

              <!-- Shared editor header: the config's fully-qualified path and an
                   info link to the docs, for both editing tabs. No bottom notes. -->
              <div x-show="!dlg.loading && (tab==='settings' || tab==='config')" class="flex items-center gap-2 mb-3">
                <i class="ph ph-file-code text-base text-base-content/40 shrink-0"></i>
                <span class="font-mono text-sm text-base-content/60 truncate"
                      :title="dlg.repo + '/.web-tools.json'"
                      x-text="dlg.repo + '/.web-tools.json'"></span>
                <span x-show="!dlgConnected" class="badge badge-ghost badge-xs shrink-0">new</span>
                <div class="grow"></div>
                <a href="${CFG_DOCS_URL}" target="_blank" rel="noopener"
                   class="text-base-content/40 hover:text-primary transition-colors shrink-0"
                   title="Config format &amp; fields"><i class="ph ph-info text-base leading-none"></i></a>
              </div>
              <!-- SETTINGS tab: the config as a form -->
              <div x-show="!dlg.loading && tab==='settings'" class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                <div class="flex items-center gap-5 flex-wrap">
                  <label class="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" class="checkbox checkbox-xs" x-model="dlg.obj.estate">
                    <span class="font-semibold">On dashboard</span>
                  </label>
                  <label class="flex items-center gap-2 text-sm cursor-pointer"
                         title="Adds this repo to the header quick-link row, ordered by Order.">
                    <input type="checkbox" class="checkbox checkbox-xs" x-model="dlg.obj.quickLink">
                    <span class="font-semibold">Quick-link</span>
                  </label>
                </div>
                <div class="flex gap-2">
                  <div class="flex flex-col gap-1 flex-1 min-w-0">
                    <span class="text-[13px] font-semibold text-base-content/60 flex items-center gap-1">
                      <i class="ph text-base" :class="(dlg.obj.icon||'').trim() || 'ph-bookmark-simple'"></i>Icon</span>
                    <input x-model="dlg.obj.icon" placeholder="ph-bookmark-simple"
                           autocapitalize="off" autocorrect="off" spellcheck="false"
                           class="input input-xs input-bordered font-mono text-sm">
                  </div>
                  <div class="flex flex-col gap-1 flex-1 min-w-0">
                    <span class="text-[13px] font-semibold text-base-content/60">Group</span>
                    <input x-model="dlg.obj.group" placeholder="core, data, …"
                           autocapitalize="off" autocorrect="off" spellcheck="false"
                           class="input input-xs input-bordered text-sm">
                  </div>
                  <div class="flex flex-col gap-1 w-16 shrink-0">
                    <span class="text-[13px] font-semibold text-base-content/60">Order</span>
                    <input type="number" x-model.number="dlg.obj.order" placeholder="0"
                           class="input input-xs input-bordered text-sm">
                  </div>
                </div>
                <div class="flex flex-col gap-1">
                  <span class="text-[13px] font-semibold text-base-content/60">Note</span>
                  <textarea x-model="dlg.obj.note" rows="2" placeholder="one-line description (overrides GitHub's)"
                            class="textarea textarea-bordered text-sm leading-snug"></textarea>
                </div>
                <div class="flex flex-col gap-1">
                  <span class="text-[13px] font-semibold text-base-content/60">Landing</span>
                  <input x-model="dlg.obj.landing" placeholder="pages/landing.html (optional)"
                         autocapitalize="off" autocorrect="off" spellcheck="false"
                         class="input input-xs input-bordered font-mono text-sm">
                </div>
                <div class="flex flex-col gap-1">
                  <span class="text-[13px] font-semibold text-base-content/60">Pins (one per line)</span>
                  <textarea x-model="pinsText" rows="2" spellcheck="false"
                            placeholder="pages&#10;docs/CONVENTIONS.md"
                            class="textarea textarea-bordered font-mono text-sm leading-snug"></textarea>
                </div>
              </div>

              <!-- CONFIG tab: the whole file as raw JSON, filling the height -->
              <div x-show="!dlg.loading && tab==='config'" class="flex-1 min-h-0 flex flex-col gap-1">
                <textarea x-model="dlg.draft" spellcheck="false"
                  class="textarea textarea-bordered w-full flex-1 min-h-0 resize-none font-mono text-sm leading-snug"
                  :class="dlgErr && 'textarea-error'" placeholder="{ }"></textarea>
                <div class="flex items-center justify-between gap-2 min-h-[1.25rem] shrink-0">
                  <span x-show="dlgErr" class="text-error text-sm flex items-center gap-1 min-w-0">
                    <i class="ph ph-warning shrink-0"></i><span class="truncate" x-text="dlgErr"></span></span>
                  <span x-show="!dlgErr" class="text-success text-sm flex items-center gap-1">
                    <i class="ph ph-check"></i>Valid JSON</span>
                  <button @click="dlgFormat()" :disabled="!!dlgErr" class="btn btn-ghost btn-xs shrink-0">Format</button>
                </div>
              </div>
            </div>

            <!-- Footer (fixed) -->
            <div class="flex items-center gap-2 p-4 pt-2 border-t border-base-300 shrink-0">
              <button x-show="(tab==='settings' || tab==='config') && !auth" @click="dlgTab('info')" class="text-[13px] text-primary underline mr-auto">Sign in to save</button>
              <div class="grow"></div>
              <button onclick="repoModal.close()" class="btn btn-ghost text-sm">Done</button>
              <button x-show="tab==='settings' || tab==='config'" @click="dlgSave()" :disabled="!!dlgErr || dlg.saving || !auth"
                      class="btn btn-primary text-sm gap-1.5">
                <span x-show="dlg.saving" class="loading loading-spinner loading-xs"></span>
                <span x-text="dlg.saving ? 'Saving…' : 'Save'"></span>
              </button>
            </div>
          </div>
        </dialog>`;
    return {
      description: 'Repo picker with branch/tag/SHA switching for the GitHub browser store',

      template: (inline ? `
        <!-- Headless in show-repo's header: the component is the repo/auth
             controller and hosts the token dialog (appended below), but renders
             no visible readout of its own. The open repo is shown at the top of
             show-repo's sidebar, so a header copy was redundant; callers on the
             page open the dialog via __repo.openDialog() (the Repos dashboard's
             account control, an estate card's gear, the Map). -->`
      : `
        <div class="mb-4 border-b border-base-200 pb-3">
          <div class="flex items-center justify-between">
            <div class="flex items-baseline gap-2 text-xl font-bold font-mono flex-wrap">
              <span class="text-base-content/70" x-text="owner||'Select'"></span>
              <span class="text-base-content/30">/</span>
              <details class="dropdown dropdown-bottom" data-auto-close>
                <summary class="hover:text-primary cursor-pointer flex items-center gap-1">
                  <span x-text="name||'Repository...'"></span>
                  <i class="ph ph-caret-down text-sm opacity-50" style="text-decoration:none"></i>
                </summary>
                ${repoDropdown}
              </details>
              <span class="text-base-content/30 text-base" x-show="repo">@</span>
              <details class="dropdown dropdown-bottom" x-show="repo" @toggle="if($event.target.open) $store.browser.ensureBranches()">
                <summary class="cursor-pointer flex items-center gap-1 text-base"
                  :class="offMain ? 'text-warning' : 'text-base-content/70'">
                  <i class="ph" :class="offMain ? 'ph-git-branch' : 'ph-git-commit'" style="text-decoration:none"></i>
                  <span x-text="ref||'main'"></span>
                  <i class="ph ph-caret-down text-sm opacity-50" style="text-decoration:none"></i>
                </summary>
                ${refDropdown}
              </details>
            </div>
            <button @click="openDialog()" class="tooltip tooltip-left flex items-center gap-1 btn btn-ghost" :data-tip="auth?'Authenticated: '+user:(tokenExpired?'Token expired':'Public only')">
              <i class="ph text-xl" :class="auth?'ph-shield-check text-success':(tokenExpired?'ph-warning text-warning':'ph-globe text-base-content/50')"></i>
              <span x-show="auth" class="text-sm text-base-content/50 hidden sm:inline" x-text="user"></span>
            </button>
          </div>
          <div x-show="offMain" class="mt-2 alert alert-warning py-1.5 px-3 text-sm flex items-center gap-2">
            <i class="ph ph-warning"></i>
            <span>On <span class="font-mono font-bold" x-text="ref"></span>, not <span class="font-mono" x-text="defaultRef"></span>.</span>
          </div>
        </div>`) + dialogHtml,

      repos: [],
      owner: '',
      name: '',
      repo: '',
      repoObj: null,
      auth: false,
      user: '',
      tokenInput: '',
      tokenExpired: false,
      ref: '',
      defaultRef: '',
      refInput: '',
      tab: 'info',
      // The dialog targets dlg.repo, which may differ from the open repo (opened
      // from an estate card) so it never navigates. It loads that repo's meta and
      // config into its own state; `obj` is the form's object, `draft` the raw
      // JSON, synced on toggle.
      // dlg.estate: the shield was opened at the all-repo estate level with no
      // explicit repo, so the dialog is an account panel (auth + estate actions),
      // not a repo's Links/Settings/Config. A card passes its repo and clears it.
      dlg: { repo: '', ref: 'main', repoObj: null, config: null, configName: null,
             gh: null, obj: {}, draft: '{}', loading: false, saving: false, estate: false },

      init() {
        this.$root.__repo = this;
        this.$el.innerHTML = this.template;
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
      },

      get gh() {
        return Alpine.store('browser').gh;
      },

      // ── The estate (all-repo) context, on a host that provides it (show-repo).
      // The header selector doubles as the context switcher: "Repositories" is
      // the estate, the owner's repos below it are the per-repo contexts. In the
      // estate the name reads "Repositories" and the branch selector is hidden,
      // since a branch is a repo-level notion. Other hosts have no shell, so
      // hasEstate() is false and the entry does not render.
      // The estate context is either of its two views (repo grid or surfaces);
      // both read "Repositories" in the header and hide the branch selector.
      get estate() { return !!(window.__shell?.estateCtx ?? window.__shell?.isEstate); },
      hasEstate() { return typeof window.__shell?.goEstate === 'function'; },
      showEstate() { window.__shell?.goEstate?.(); },
      // Pick from the header selector: switch the repo, and leave the estate for
      // the repo's landing (the repo-change watch handles a different repo; this
      // covers re-picking the repo already open underneath the estate).
      pickFromHeader(r) {
        this.pick(r);
        if (window.__shell?.isEstate) window.__shell.goLanding();
      },

      // ── The dialog: Links / Settings / Config for dlg.repo (which may be any
      // repo, not just the open one, so opening it from an estate card does NOT
      // navigate). openDialog loads that repo's metadata and config into dlg;
      // Settings edits it as a form, Config as raw JSON.
      async openDialog(repo, opts = {}) {
        // Account panel (the token) rather than a repo's config: asked for
        // outright with { estate: true }, which is how the Repos dashboard's
        // account control opens it, or inferred from a repo-less open while the
        // estate is the active context. Without that, a repo-less open would
        // fall through to the underlying open repo's config, the scope mismatch
        // the estate shield used to show.
        const estateScope = opts.estate === true || (!repo && this.estate);
        const target = repo || this.repo;
        this.dlg.estate = estateScope;
        this.tab = opts.tab || 'info';
        this.dlg.repo = target || '';
        try { document.getElementById('repoModal')?.showModal(); } catch {}
        if (estateScope) { this.dlg.loading = false; return; }
        if (!target) return;
        this.dlg.loading = true;
        // Metadata: reuse the open repo's, else one direct read.
        if (target === this.repo && this.repoObj) {
          this.dlg.repoObj = this.repoObj;
          this.dlg.ref = this.defaultRef || this.repoObj.default_branch || 'main';
        } else {
          this.dlg.repoObj = null; this.dlg.ref = 'main';
          try {
            const r = await this.gh.req('/repos/' + target, { quiet: true });
            this.dlg.repoObj = r; this.dlg.ref = r.default_branch || 'main';
          } catch {}
        }
        await this.dlgLoadConfig(target, this.dlg.ref);
        this.dlg.loading = false;
      },
      async dlgLoadConfig(repo, ref) {
        const g = new window.GH({ token: this.gh?.token || '', repo, ref });
        this.dlg.gh = g;
        let cfg = null, name = null;
        try {
          const p = JSON.parse((await g.get('.web-tools.json')).text);
          if (p && typeof p === 'object' && !Array.isArray(p)) { cfg = p; name = '.web-tools.json'; }
        } catch {}
        this.dlg.config = cfg; this.dlg.configName = name;
        this.dlg.obj = JSON.parse(JSON.stringify(cfg || CFG_TEMPLATE));
        this.dlg.draft = JSON.stringify(this.dlgClean(this.dlg.obj), null, 2);
      },
      get dlgConnected() { return !!this.dlg.config; },
      // Only the raw-JSON (Config) tab can be malformed; the Settings form is
      // always valid.
      get dlgErr() {
        if (this.tab !== 'config') return '';
        let v;
        try { v = JSON.parse(this.dlg.draft); }
        catch (e) { return String(e.message || e).replace(/^JSON\.parse:\s*/, ''); }
        if (v === null || typeof v !== 'object' || Array.isArray(v)) return 'Top-level value must be an object';
        return '';
      },
      // Switch tabs, syncing the two editors: entering Config renders the form's
      // object as JSON; leaving Config back to Settings re-parses the JSON.
      dlgTab(name) {
        if (name === this.tab) return;
        if (this.tab === 'config' && name === 'settings') {
          try { const v = JSON.parse(this.dlg.draft); if (v && typeof v === 'object' && !Array.isArray(v)) this.dlg.obj = v; } catch {}
        }
        if (name === 'config') this.dlg.draft = JSON.stringify(this.dlgClean(this.dlg.obj), null, 2);
        this.tab = name;
      },
      dlgFormat() { if (!this.dlgErr) this.dlg.draft = JSON.stringify(JSON.parse(this.dlg.draft), null, 2); },
      // Pins as a newline list, so the form covers the common case; stage and any
      // other structured field are edited in JSON.
      get pinsText() { return (this.dlg.obj.pins || []).join('\n'); },
      set pinsText(v) {
        const arr = v.split('\n').map(s => s.trim()).filter(Boolean);
        if (arr.length) this.dlg.obj.pins = arr; else delete this.dlg.obj.pins;
      },
      // Drop empty/default keys so saved configs stay minimal (absent === off).
      dlgClean(o) {
        const c = JSON.parse(JSON.stringify(o || {}));
        for (const k of ['icon', 'group', 'note', 'landing']) {
          if (!c[k] || !String(c[k]).trim()) delete c[k]; else c[k] = String(c[k]).trim();
        }
        if (c.estate !== true) delete c.estate;
        if (c.quickLink !== true) delete c.quickLink;
        if (!c.order) delete c.order; else c.order = Number(c.order);
        if (Array.isArray(c.pins) && !c.pins.length) delete c.pins;
        if (c.stage && typeof c.stage === 'object') {
          const noFiles = !Array.isArray(c.stage.files) || !c.stage.files.length;
          const noTargets = !Array.isArray(c.stage.targets) || !c.stage.targets.length;
          if (noFiles && noTargets) delete c.stage;
        }
        return c;
      },
      async dlgSave() {
        if (this.dlgErr || !this.auth) return;
        const toast = Alpine.store('toast');
        this.dlg.saving = true;
        try {
          const obj = this.tab === 'config' ? JSON.parse(this.dlg.draft) : this.dlgClean(this.dlg.obj);
          const g = this.dlg.gh || new window.GH({ token: this.gh?.token || '', repo: this.dlg.repo, ref: this.dlg.ref });
          // save() lives in gh-store.js, which not every host page loads.
          if (typeof g.save !== 'function' && window.gh?.load) await window.gh.load('gh-store.js');
          await g.save('.web-tools.json', obj, 'Update .web-tools.json via show-repo');
          if (toast) toast('check-circle', 'Config saved', 'alert-success', 4000);
          this.dlg.config = obj; this.dlg.configName = '.web-tools.json';
          // The shell re-reads configs, refreshes the cache, and reloads the
          // estate / quick-link row on this event.
          document.dispatchEvent(new CustomEvent('web-tools:config-saved', { detail: { repo: this.dlg.repo } }));
        } catch (e) {
          if (toast) toast('warning', 'Save failed: ' + (e?.message || e), 'alert-error', 6000);
        } finally {
          this.dlg.saving = false;
        }
      },
      get offMain() {
        return !!(this.ref && this.defaultRef && this.ref !== this.defaultRef);
      },
      // quiet: identity + repo-list failures stay non-fatal (no modal, no
      // gh-auth prompt takeover), for pages that already picked a repo
      // directly (pickByName) and only want the dropdown populated.
      async setup(gh, opts = {}) {
        const quiet = !!opts.quiet;
        const hasToken = !!gh.headers.Authorization;
        if (hasToken) {
          try {
            this.user = (await gh.req('/user', { quiet })).login;
            this.auth = true;
            this.tokenExpired = false;
          } catch(e) {
            this.auth = false;
            this.tokenExpired = String(e).includes('401');
            this.user = '';
          }
        } else {
          this.auth = false;
          this.tokenExpired = false;
          this.user = '';
        }
        try {
          this.repos = await gh.repos(undefined, { quiet });
        } catch(e) {
          this.repos = [];
          if (quiet) { console.warn('repo list unavailable:', e?.message || e); return; }
          const toast = Alpine.store('toast');
          if (toast) {
            if (e.status === 401) toast('warning', 'Token rejected — paste a new one', 'alert-error', 6000);
            else if (e.status === 403) toast('warning', 'GitHub rate-limited this IP — add a token', 'alert-error', 6000);
            else toast('warning', 'Could not load repos: ' + (e.message || e), 'alert-error', 6000);
          }
          try { document.getElementById('repoModal').showModal(); } catch {}
          return;
        }
        // Don't clobber a repo the page already picked (e.g. from URL state)
        // while this ran in the background.
        if (!this.repo && this.repos[0]) this.pick(this.repos[0]);
      },

      // Pick a repo by name without listing anyone's repos first: the
      // identity-free boot path. /repos/<name> works unauthenticated for
      // public repos; if even that fails, a minimal stub lets browsing
      // proceed and the file tree becomes the real reachability test.
      async pickByName(fullName, opts = {}) {
        let target = null;
        try {
          target = await this.gh.req('/repos/' + fullName, { quiet: true });
        } catch (e) {
          console.warn('repo metadata unavailable, using stub:', e?.message || e);
        }
        if (!target) {
          const [login, name] = fullName.split('/');
          target = { full_name: fullName, name, owner: { login },
                     default_branch: opts.ref || 'main', private: false };
        }
        await this.pick(target, opts);
        return target;
      },

      async saveToken() {
        const t = this.tokenInput.trim();
        if (!t) return;
        try { localStorage.setItem('ghToken', t); } catch {}
        this.gh.token = t;
        this.tokenInput = '';
        await this.setup(this.gh);
      },

      async clearToken() {
        try { localStorage.removeItem('ghToken'); } catch {}
        this.gh.token = '';
        await this.setup(this.gh);
      },

      async pick(r, opts = {}) {
        this.repo = r.full_name;
        this.owner = r.owner.login;
        this.name = r.name;
        this.repoObj = r;
        this.defaultRef = r.default_branch || 'main';
        this.ref = opts.ref || this.defaultRef;
        const gh = Alpine.store('browser').gh;
        gh.repo = r.full_name;
        gh.ref = this.ref;
        Alpine.store('browser').repo = r.full_name;
        Alpine.store('browser').repoObj = r;
        Alpine.store('browser').activeFile = null;
        Alpine.store('browser').ref = this.ref;
        Alpine.store('browser').defaultRef = this.defaultRef;
        Alpine.store('browser').resetBranches();
      },

      setRef(ref) {
        if (!ref || ref === this.ref) return;
        this.ref = ref;
        // The store owns the actual switch (gh instance, persistence, toast);
        // this component just mirrors it for its own template state.
        Alpine.store('browser').setRef(ref);
      },

      applyRefInput() {
        const v = this.refInput.trim();
        if (!v) return;
        if (v.startsWith('http')) {
          const gh = Alpine.store('browser').gh;
          const parsed = gh && gh.parseUrl ? gh.parseUrl(v) : null;
          if (parsed && parsed.repo === this.repo) {
            this.setRef(parsed.ref || this.defaultRef);
          } else if (parsed) {
            Alpine.store('toast')('warning',
              'URL points to ' + parsed.repo + ', current repo is ' + this.repo, 'alert-warning', 4000);
          }
        } else {
          this.setRef(v);
        }
        this.refInput = '';
      }
    };
  });
});
