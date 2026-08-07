document.addEventListener('alpine:init', function() {
  Alpine.data('config', function() {
    // Per-repo .web-tools.json editor as a full view: the roomy counterpart to
    // the shared repo dialog's cramped Settings/Config tabs. Same fields, same
    // minimal save (absent === off), same web-tools:config-saved event the shell
    // reloads the estate / sidebar on. Reads the open repo from the browser
    // store and reloads when it changes. The dialog stays for auth and for
    // configuring a repo you are not currently in (estate cards, the Map view).
    //
    // Two panes, form and raw JSON, kept in sync both ways (obj <-> draft): a
    // form edit re-serializes the draft, a JSON edit re-parses into the form. So
    // on NARROW screens a segmented pill switches between them, and on lg+ they
    // sit side by side with no pill. The estate's Activity view used to do the
    // same and stopped (its two side panes were short lists nobody watched);
    // this one keeps it, because the two panes here are two views of the SAME
    // object being edited and seeing the JSON move as the form does is the
    // point. draft is the authoritative save serialization.
    const TEMPLATE = { icon: '', estate: false, group: '', note: '', order: 0,
                       quickLink: false, landing: '', pins: [],
                       stage: { files: [], targets: [] } };
    const DOCS_URL = 'https://github.com/mehrlander/web-tools/blob/main/docs/show-repo.md#web-toolsjson-the-repo-manifest';
    // Drop empty/default keys so a saved config stays minimal, the one shape the
    // estate and the config cache read (mirrors the dialog's dlgClean).
    const clean = (o) => {
      const c = JSON.parse(JSON.stringify(o || {}));
      for (const k of ['icon', 'group', 'note', 'landing', 'scope']) {
        if (!c[k] || !String(c[k]).trim()) delete c[k]; else c[k] = String(c[k]).trim();
      }
      if (c.estate !== true) delete c.estate;
      if (c.quickLink !== true) delete c.quickLink;
      if (!c.order) delete c.order; else c.order = Number(c.order);
      if (Array.isArray(c.pins) && !c.pins.length) delete c.pins;
      // Projects: drop pathless junk and empty string fields, keep each entry's
      // authored shape (a bare string stays a string), drop the key when empty.
      if (Array.isArray(c.projects)) {
        c.projects = c.projects.map((e) => {
          if (typeof e === 'string') return e.trim().replace(/\/+$/, '');
          if (!e || typeof e !== 'object' || !String(e.path || '').trim()) return null;
          const p = { ...e, path: String(e.path).trim().replace(/\/+$/, '') };
          for (const k of ['label', 'landing']) {
            if (typeof p[k] !== 'string' || !p[k].trim()) delete p[k]; else p[k] = p[k].trim();
          }
          if (typeof p.tracker === 'string' && !p.tracker.trim()) delete p.tracker;
          return p;
        }).filter(Boolean);
        if (!c.projects.length) delete c.projects;
      }
      // Pages: same rules as projects one field over, and the same reason.
      if (Array.isArray(c.pages)) {
        c.pages = c.pages.map((e) => {
          if (typeof e === 'string') return e.trim();
          if (!e || typeof e !== 'object' || !String(e.path || '').trim()) return null;
          const p = { ...e, path: String(e.path).trim() };
          for (const k of ['title', 'note', 'icon', 'thumb', 'project', 'viewLabel']) {
            if (typeof p[k] === 'string' && !p[k].trim()) delete p[k];
            else if (typeof p[k] === 'string') p[k] = p[k].trim();
          }
          if (p.appView !== true) delete p.appView;
          return p;
        }).filter(Boolean);
        if (!c.pages.length) delete c.pages;
      }
      if (c.stage && typeof c.stage === 'object') {
        for (const k of ['files', 'targets']) {
          if (!Array.isArray(c.stage[k])) continue;
          c.stage[k] = c.stage[k].map(x => String(x).trim()).filter(Boolean);
          if (!c.stage[k].length) delete c.stage[k];
        }
        const noFiles = !Array.isArray(c.stage.files) || !c.stage.files.length;
        const noTargets = !Array.isArray(c.stage.targets) || !c.stage.targets.length;
        if (noFiles && noTargets) delete c.stage;
      }
      return c;
    };

    return {
      description: 'Per-repo .web-tools.json editor as a full view: a Settings form and a raw JSON pane over the open repo\'s config, kept in sync (tabbed on mobile, side by side on desktop), saving through GH with the config-saved event the shell reloads on. The roomy counterpart to the shared repo dialog\'s config tabs.',

      template: `
        <div class="flex flex-col gap-4">
          <!-- Header: the config path, a new-file badge, the file on GitHub, and
               the format docs. -->
          <div class="flex items-center gap-2">
            <i class="ph ph-file-code text-lg text-base-content/40 shrink-0"></i>
            <span class="font-mono text-base text-base-content/70 truncate"
                  :title="repo + '/.web-tools.json'" x-text="repo + '/.web-tools.json'"></span>
            <span x-show="!connected && !loading" class="badge badge-ghost badge-sm shrink-0">new</span>
            <div class="grow"></div>
            <a x-show="connected" :href="blobUrl" target="_blank" rel="noopener"
               class="text-base-content/40 hover:text-base-content/70 transition-colors shrink-0"
               :title="(configName || '.web-tools.json') + ' on GitHub'"><i class="ph ph-github-logo text-base leading-none"></i></a>
            <a :href="'${DOCS_URL}'" target="_blank" rel="noopener"
               class="text-base-content/40 hover:text-primary transition-colors shrink-0"
               title="Config format &amp; fields"><i class="ph ph-info text-base leading-none"></i></a>
          </div>

          <div x-show="legacy" class="alert alert-warning py-1.5 px-3 text-sm flex items-center gap-2">
            <i class="ph ph-arrow-clockwise shrink-0"></i>
            <span>Loaded from legacy <span class="font-mono">.show-repo.json</span>. Saving migrates it to <span class="font-mono">.web-tools.json</span>.</span>
          </div>

          <!-- Tabs: narrow screens only (the Branches-view segmented pill). On
               lg+ both panes show side by side, so the pill hides. -->
          <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 w-fit lg:hidden" role="tablist">
            <button role="tab" @click="tab='settings'"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="tab==='settings' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-sliders-horizontal text-lg"></i>Settings</button>
            <button role="tab" @click="tab='json'"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="tab==='json' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-brackets-curly text-lg"></i>JSON</button>
          </div>

          <div x-show="loading" class="flex justify-center py-16">
            <span class="loading loading-dots loading-md opacity-30"></span>
          </div>

          <div x-show="!loading" class="flex flex-col lg:flex-row lg:gap-8 lg:items-start">
            <!-- SETTINGS: four sections, General / Projects / Pages / Stage, built the same
                 way: a header line, then a bordered card. A form edit
                 re-serializes the JSON pane through a reactive $watch on the
                 fields (see init), not an input handler, so it never depends on
                 event delegation.

                 Widths are CONTAINER queries (@container here, @md:/@xl: on the
                 grids), not viewport breakpoints, because this column is half a
                 pane on desktop and the whole screen on a phone: a viewport rule
                 would put six columns in a 360px column at lg. Every control
                 carries w-full, since daisyUI's .input and .textarea default to
                 width:20rem and would otherwise stop short of their label on a
                 narrow screen (measured at 390px: label 342, field 320). -->
            <div class="@container flex-col gap-5 lg:flex lg:flex-[3] lg:min-w-0"
                 :class="tab==='settings' ? 'flex' : 'hidden'">

              <section class="flex flex-col gap-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium text-base-content/60">General</span>
                </div>
                <div class="rounded-lg border border-base-300 p-3 grid gap-3 @md:grid-cols-6">
                  <div class="flex items-center gap-6 flex-wrap @md:col-span-6">
                    <label class="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" class="checkbox checkbox-sm" x-model="obj.estate">
                      <span class="font-medium">On dashboard</span>
                      <span class="text-sm text-base-content/40">(estate)</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer"
                           title="Adds this repo to the header quick-link seed, ordered by Order.">
                      <input type="checkbox" class="checkbox checkbox-sm" x-model="obj.quickLink">
                      <span class="font-medium">Quick-link</span>
                    </label>
                  </div>
                  <label class="flex flex-col gap-1 min-w-0 @md:col-span-2">
                    <span class="text-sm font-medium text-base-content/60 flex items-center gap-1.5">
                      <i class="ph text-base" :class="(obj.icon||'').trim() || 'ph-bookmark-simple'"></i>Icon</span>
                    <input x-model="obj.icon" placeholder="ph-bookmark-simple"
                           autocapitalize="off" autocorrect="off" spellcheck="false"
                           class="input input-bordered input-sm font-mono text-base w-full">
                  </label>
                  <label class="flex flex-col gap-1 min-w-0 @md:col-span-2">
                    <span class="text-sm font-medium text-base-content/60">Group</span>
                    <input x-model="obj.group" placeholder="core, data, …"
                           autocapitalize="off" autocorrect="off" spellcheck="false"
                           class="input input-bordered input-sm text-base w-full">
                  </label>
                  <label class="flex flex-col gap-1 min-w-0 @md:col-span-2">
                    <span class="text-sm font-medium text-base-content/60">Order</span>
                    <input type="number" x-model.number="obj.order" placeholder="0"
                           class="input input-bordered input-sm text-base w-full">
                  </label>
                  <label class="flex flex-col gap-1 min-w-0 @md:col-span-6">
                    <span class="text-sm font-medium text-base-content/60">Landing</span>
                    <input x-model="obj.landing" placeholder="pages/landing.html (blank = Pages gallery, else an overview)"
                           autocapitalize="off" autocorrect="off" spellcheck="false"
                           class="input input-bordered input-sm font-mono text-base w-full">
                  </label>
                  <!-- Note and Pins take a full line at every width. They were
                       paired, which halved both for no gain: a textarea is the
                       one control here that keeps earning width. -->
                  <label class="flex flex-col gap-1 min-w-0 @md:col-span-6">
                    <span class="text-sm font-medium text-base-content/60">Note</span>
                    <textarea x-model="obj.note" rows="3" placeholder="one-line description (overrides GitHub's)"
                              class="textarea textarea-bordered text-base leading-snug w-full"></textarea>
                  </label>
                  <label class="flex flex-col gap-1 min-w-0 @md:col-span-6">
                    <span class="text-sm font-medium text-base-content/60">Pins (one per line)</span>
                    <textarea x-model="pinsText" rows="3" spellcheck="false"
                              placeholder="pages&#10;docs/CONVENTIONS.md"
                              class="textarea textarea-bordered font-mono text-base leading-snug w-full"></textarea>
                  </label>
                  <!-- Scope is prose ABOUT the repo, so it sits with Note
                       rather than in a section of its own. Either form is
                       valid: inline text, or a path to a .md the Map reads. -->
                  <label class="flex flex-col gap-1 min-w-0 @md:col-span-6">
                    <span class="text-sm font-medium text-base-content/60">Scope</span>
                    <textarea x-model="obj.scope" rows="3"
                              placeholder="what this repo holds and why — or a path like docs/SCOPE.md"
                              class="textarea textarea-bordered text-base leading-snug w-full"
                              :class="scopeIsPath && 'font-mono'"></textarea>
                  </label>
                </div>
              </section>
              <!-- Projects: the repo's workspaces. A project is DECLARED here
                   (the projects array) and DETECTED by Scan, which reads the
                   tree for the defining convention, a folder carrying
                   tracker/tasks/. The two are shown in one list because the
                   interesting states are the disagreements: a workspace running
                   a tracker that nothing declares, and a declaration whose
                   workspace no longer carries one. Scan is a button rather than
                   a load-time read: it is a full recursive tree fetch, and the
                   form is useful without it. -->
              <section class="flex flex-col gap-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium text-base-content/60">Projects</span>
                  <span class="text-sm text-base-content/40" x-text="projectCount"></span>
                  <div class="grow"></div>
                  <button @click="scanProjects()" :disabled="scanning || !repo"
                          class="btn btn-ghost btn-xs gap-1.5"
                          title="Read the tree for folders carrying tracker/tasks/">
                    <span x-show="scanning" class="loading loading-spinner loading-xs"></span>
                    <i class="ph ph-magnifying-glass" x-show="!scanning"></i>Scan</button>
                </div>
                <p x-show="scanErr" class="text-sm text-error" x-text="scanErr"></p>

                <template x-for="row in projectRows" :key="row.path">
                  <div class="rounded-lg border p-2.5 flex flex-col gap-2"
                       :class="row.declared ? 'border-base-300' : 'border-base-300 border-dashed bg-base-200/30'">
                    <div class="flex items-center gap-2">
                      <i class="ph shrink-0 text-base-content/40"
                         :class="row.declared ? 'ph-folder-simple' : 'ph-sparkle'"></i>
                      <span class="font-mono text-base truncate" :title="row.path" x-text="row.path"></span>
                      <span x-show="!row.declared" class="badge badge-ghost badge-sm shrink-0">found</span>
                      <span x-show="row.declared && row.undetected" class="badge badge-ghost badge-sm shrink-0"
                            title="The scan found no tracker/tasks/ here. Declaring a workspace without one is allowed; this only says the two disagree.">no tracker</span>
                      <div class="grow"></div>
                      <button x-show="!row.declared" @click="addProject(row.path)"
                              class="btn btn-ghost btn-xs">Declare</button>
                      <button x-show="row.declared" @click="removeProject(row.path)"
                              class="btn btn-ghost btn-xs text-base-content/40" title="Undeclare">
                        <i class="ph ph-x"></i></button>
                    </div>
                    <!-- Same container-query grid as General, one level in: the
                         three fields sit on one line once the card is wide
                         enough for them and stack when it is not. -->
                    <div x-show="row.declared" class="grid gap-2 @xl:grid-cols-3">
                      <label class="flex flex-col gap-1 min-w-0">
                        <span class="text-sm text-base-content/50">Label</span>
                        <input :value="row.label" @input="setProjField(row.path, 'label', $event.target.value)"
                               :placeholder="row.defaultLabel"
                               autocapitalize="off" autocorrect="off" spellcheck="false"
                               class="input input-bordered input-xs text-base w-full">
                      </label>
                      <label class="flex flex-col gap-1 min-w-0">
                        <span class="text-sm text-base-content/50">Landing</span>
                        <input :value="row.landing" @input="setProjField(row.path, 'landing', $event.target.value)"
                               placeholder="blank = the workspace README"
                               autocapitalize="off" autocorrect="off" spellcheck="false"
                               class="input input-bordered input-xs font-mono text-base w-full">
                      </label>
                      <!-- The No board toggle rides the Tracker LABEL line, not
                           the input line: sharing the cell left the path input
                           about 90px wide, and the label row was already there. -->
                      <label class="flex flex-col gap-1 min-w-0">
                        <span class="flex items-center gap-2">
                          <span class="text-sm text-base-content/50">Tracker</span>
                          <span class="grow"></span>
                          <span class="flex items-center gap-1.5 cursor-pointer shrink-0"
                                title="tracker: false — drop the board button for this workspace"
                                @click="setProjField(row.path, 'tracker', row.noTracker ? '' : false)">
                            <input type="checkbox" class="checkbox checkbox-xs pointer-events-none"
                                   :checked="row.noTracker">
                            <span class="text-sm text-base-content/50 whitespace-nowrap">No board</span>
                          </span>
                        </span>
                        <input :value="row.trackerText" :disabled="row.noTracker"
                               @input="setProjField(row.path, 'tracker', $event.target.value)"
                               :placeholder="row.defaultTracker"
                               autocapitalize="off" autocorrect="off" spellcheck="false"
                               class="input input-bordered input-xs font-mono text-base w-full">
                      </label>
                    </div>
                  </div>
                </template>
              </section>

              <!-- Pages: the hand-declared catalog. Path, title, and note are
                   the fields anyone edits; icon, thumb, project, and the
                   app-view label are carried through untouched (setPageField
                   spreads the entry), so this form never costs a key it does
                   not render. An entry is cross-repo when its path is
                   qualified, which is worth a badge: the file is not here. -->
              <section class="flex flex-col gap-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium text-base-content/60">Pages</span>
                  <span class="text-sm text-base-content/40"
                        x-text="pageRows.length ? pageRows.length + ' in the catalog' : 'none'"></span>
                </div>
                <template x-for="(row, i) in pageRows" :key="i + ':' + row.path">
                  <div class="rounded-lg border border-base-300 p-2.5 flex flex-col gap-2">
                    <div class="flex items-center gap-2">
                      <i class="ph shrink-0 text-base-content/40"
                         :class="(row.icon || '').trim() || 'ph-file-html'"></i>
                      <input :value="row.path" @input="setPageField(i, 'path', $event.target.value)"
                             autocapitalize="off" autocorrect="off" spellcheck="false"
                             class="input input-bordered input-xs font-mono text-base w-full min-w-0">
                      <span x-show="row.crossRepo" class="badge badge-ghost badge-sm shrink-0"
                            title="A qualified owner/repo[@ref]:path — the file lives in another repo">cross-repo</span>
                      <button @click="removePage(i)" class="btn btn-ghost btn-xs text-base-content/40 shrink-0"
                              title="Remove from the catalog"><i class="ph ph-x"></i></button>
                    </div>
                    <div class="grid gap-2 @xl:grid-cols-3">
                      <label class="flex flex-col gap-1 min-w-0">
                        <span class="text-sm text-base-content/50">Title</span>
                        <input :value="row.title" @input="setPageField(i, 'title', $event.target.value)"
                               :placeholder="row.defaultTitle"
                               class="input input-bordered input-xs text-base w-full">
                      </label>
                      <label class="flex flex-col gap-1 min-w-0 @xl:col-span-2">
                        <span class="flex items-center gap-2">
                          <span class="text-sm text-base-content/50">Note</span>
                          <span class="grow"></span>
                          <span class="flex items-center gap-1.5 cursor-pointer shrink-0"
                                title="appView: promote this page to an estate-level view in the header nav"
                                @click="setPageField(i, 'appView', !row.appView)">
                            <input type="checkbox" class="checkbox checkbox-xs pointer-events-none"
                                   :checked="row.appView">
                            <span class="text-sm text-base-content/50 whitespace-nowrap">App view</span>
                          </span>
                        </span>
                        <textarea :value="row.note" @input="setPageField(i, 'note', $event.target.value)"
                                  rows="2" placeholder="shown on the card"
                                  class="textarea textarea-bordered text-base leading-snug w-full"></textarea>
                      </label>
                    </div>
                  </div>
                </template>
                <div class="flex items-center gap-2">
                  <input x-model="newPage" @keydown.enter.prevent="addPage()"
                         placeholder="pages/thing.html, or owner/repo:pages/thing.html"
                         autocapitalize="off" autocorrect="off" spellcheck="false"
                         class="input input-bordered input-xs font-mono text-base w-full min-w-0">
                  <button @click="addPage()" :disabled="!newPage.trim()"
                          class="btn btn-ghost btn-xs shrink-0">Add</button>
                </div>
              </section>

              <!-- Stage: two path lists the repo declares for itself. Both are
                   line-per-entry text, the same shape as Pins, because both are
                   lists of bare or qualified paths with no per-entry options. -->
              <section class="flex flex-col gap-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium text-base-content/60">Stage</span>
                </div>
                <div class="rounded-lg border border-base-300 p-3 grid gap-3">
                  <label class="flex flex-col gap-1 min-w-0">
                    <span class="text-sm text-base-content/50">Files (one per line)</span>
                    <textarea x-model="stageFilesText" rows="3" spellcheck="false"
                              placeholder="docs/CONVENTIONS.md&#10;owner/repo:path/file.md"
                              class="textarea textarea-bordered font-mono text-base leading-snug w-full"></textarea>
                  </label>
                  <label class="flex flex-col gap-1 min-w-0">
                    <span class="text-sm text-base-content/50">Targets (one per line)</span>
                    <textarea x-model="stageTargetsText" rows="3" spellcheck="false"
                              placeholder="owner/repo:docs"
                              class="textarea textarea-bordered font-mono text-base leading-snug w-full"></textarea>
                  </label>
                </div>
              </section>

            </div>

            <!-- JSON: the whole file. A JSON edit re-parses into the form. -->
            <!-- The JSON pane takes the smaller share (2 of 5): it is a mirror
                 of the form, and the form is what people came to use. On desktop
                 it STICKS and fills the viewport: the form runs to two or three
                 screens once a repo declares projects and pages, and a pane that
                 scrolls away after 600px left a tall empty column beside the
                 rest and stopped mirroring exactly when there was something to
                 mirror. Sticky needs the row's lg:items-start, which is already
                 there for the same reason. -->
            <div class="flex-col gap-1 lg:flex lg:flex-[2] lg:min-w-0 lg:sticky lg:top-4 lg:self-start"
                 :class="tab==='json' ? 'flex' : 'hidden'">
              <div class="hidden lg:block text-sm font-medium uppercase tracking-wide text-base-content/40">JSON</div>
              <textarea x-model="draft" @input="$nextTick(() => jsonEdited())" spellcheck="false" rows="18"
                class="textarea textarea-bordered w-full font-mono text-base leading-snug
                       lg:h-[calc(100dvh-13rem)] lg:min-h-[24rem]"
                :class="err && 'textarea-error'" placeholder="{ }"></textarea>
              <div class="flex items-center justify-between gap-2 min-h-[1.25rem]">
                <span x-show="err" class="text-error text-sm flex items-center gap-1 min-w-0">
                  <i class="ph ph-warning shrink-0"></i><span class="truncate" x-text="err"></span></span>
                <span x-show="!err" class="text-success text-sm flex items-center gap-1">
                  <i class="ph ph-check"></i>Valid JSON</span>
                <button @click="format()" :disabled="!!err" class="btn btn-ghost btn-sm shrink-0">Format</button>
              </div>
            </div>
          </div>

          <!-- Save, stuck to the bottom of the scrolling pane. The form is
               several screens long once a repo declares projects and pages, and
               a save button at the far end of that is a scroll each time. -->
          <div x-show="!loading"
               class="flex items-center gap-2 sticky bottom-0 -mx-1 px-1 py-3
                      bg-base-100 border-t border-base-200">
            <button @click="save()" :disabled="!!err || saving || !authed"
                    class="btn btn-primary gap-1.5">
              <span x-show="saving" class="loading loading-spinner loading-sm"></span>
              <span x-text="saving ? 'Saving…' : 'Save config'"></span>
            </button>
            <span x-show="!authed" class="text-sm text-base-content/50">needs a token (Repos)</span>
          </div>
        </div>`,

      tab: 'settings',   // the narrow-screen pane; ignored on lg+ (both show)
      loading: true,
      saving: false,
      repo: '',
      ref: '',
      configName: null,
      connected: false,
      obj: {},
      draft: '{}',
      found: [],         // workspace paths the last scan detected
      scanned: false,    // a scan has run against THIS repo (so `found` is meaningful)
      scanning: false,
      scanErr: '',
      _key: '',
      _suppressForm: false,   // set while a JSON edit rewrites obj, so the form
                              // watch doesn't re-clean the raw text being typed

      init(){
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.load();
        // Form -> JSON: re-serialize the draft whenever a form field changes.
        // A reactive watch on the fields is the reliable path (x-model already
        // drives obj), so the sync never rides on event delegation. Skipped when
        // a JSON edit is the source (that path writes obj directly, and re-
        // serializing would reformat the text mid-type).
        this.$watch(() => [this.obj.estate, this.obj.quickLink, this.obj.icon,
                           this.obj.group, this.obj.order, this.obj.note, this.obj.landing,
                           this.obj.scope,
                           JSON.stringify(this.obj.pins || []),
                           JSON.stringify(this.obj.projects || []),
                           JSON.stringify(this.obj.pages || []),
                           JSON.stringify(this.obj.stage || {})].join('\x1f'),
          () => { if (!this._suppressForm) this.formEdited(); });
        // Reload when the open repo (or its ref) changes, so the view always
        // shows the current repo's config.
        this.$watch(() => Alpine.store('browser').repo + '@' + Alpine.store('browser').ref, () => this.load());
        // A save elsewhere (the header dialog) can rewrite the same file; re-read
        // when it lands, but skip the echo of our own save (already fresh).
        document.addEventListener('web-tools:config-saved', (e) => {
          if (e.detail && e.detail.repo === this.repo && e.detail.via === 'config-view') return;
          if (!e.detail || e.detail.repo === this.repo) this.load();
        });
      },

      hasToken(){ return !!window.__shell?.hasToken?.(); },
      get authed(){ return window.__shell?._authState === 'auth'; },
      get legacy(){ return this.configName === '.show-repo.json'; },
      get blobUrl(){
        return 'https://github.com/' + this.repo + '/blob/' + (this.ref || 'main') + '/' + (this.configName || '.web-tools.json');
      },
      // The draft is the authoritative save serialization, so it is always the
      // validity check (both panes can be on screen at once on desktop).
      get err(){
        let v;
        try { v = JSON.parse(this.draft); }
        catch (e) { return String(e.message || e).replace(/^JSON\.parse:\s*/, ''); }
        if (v === null || typeof v !== 'object' || Array.isArray(v)) return 'Top-level value must be an object';
        return '';
      },
      get pinsText(){ return (this.obj.pins || []).join('\n'); },
      set pinsText(v){ this.setList('pins', v); },
      // One line per path, empty lines dropped, the key removed when nothing is
      // left: Pins and both Stage lists are the same shape, so they share it.
      setList(key, v){
        const arr = String(v).split('\n').map(s => s.trim()).filter(Boolean);
        if (arr.length) this.obj[key] = arr; else delete this.obj[key];
      },
      setStageList(key, v){
        const arr = String(v).split('\n').map(s => s.trim()).filter(Boolean);
        const stage = { ...(this.obj.stage || {}) };
        if (arr.length) stage[key] = arr; else delete stage[key];
        if (Object.keys(stage).length) this.obj.stage = stage; else delete this.obj.stage;
      },
      get stageFilesText(){ return (this.obj.stage?.files || []).join('\n'); },
      set stageFilesText(v){ this.setStageList('files', v); },
      get stageTargetsText(){ return (this.obj.stage?.targets || []).join('\n'); },
      set stageTargetsText(v){ this.setStageList('targets', v); },
      // A scope that is a path renders monospaced, the one hint that the field
      // takes two forms; the registry accepts either and so does this.
      get scopeIsPath(){ return /^[\w./-]+\.md$/.test(String(this.obj.scope || '').trim()); },

      // ── Pages ────────────────────────────────────────────────────────────────
      // The catalog, by index rather than by path: two entries may legitimately
      // point at one file (a page promoted under two labels), so the position is
      // the only stable handle.
      get pageRows(){
        const list = Array.isArray(this.obj.pages) ? this.obj.pages : [];
        return list.map((e) => {
          const o = typeof e === 'string' ? { path: e } : (e && typeof e === 'object' ? e : {});
          const path = String(o.path || '');
          return {
            path,
            title: typeof o.title === 'string' ? o.title : '',
            note: typeof o.note === 'string' ? o.note : '',
            icon: typeof o.icon === 'string' ? o.icon : '',
            appView: o.appView === true,
            crossRepo: /^[\w.-]+\/[\w.-]+(@[\w./-]+)?:/.test(path),
            defaultTitle: path.split('/').pop() || 'the page',
          };
        });
      },
      // Same two rules as a project entry: keep the shape the file was authored
      // in, and let an empty value delete rather than store "".
      setPageField(i, key, value){
        const list = this.obj.pages;
        if (!Array.isArray(list) || !list[i]) return;
        const entry = typeof list[i] === 'string' ? { path: list[i] } : { ...list[i] };
        if (value === true) entry[key] = true;
        else if (value === false) delete entry[key];
        else if (typeof value === 'string' && value.trim()) entry[key] = value.trim();
        else delete entry[key];
        const keys = Object.keys(entry).filter(k => k !== 'path');
        list[i] = keys.length ? entry : entry.path;
      },
      newPage: '',
      addPage(){
        const p = this.newPage.trim();
        if (!p) return;
        if (!Array.isArray(this.obj.pages)) this.obj.pages = [];
        this.obj.pages.push(p);
        this.newPage = '';
      },
      removePage(i){
        if (!Array.isArray(this.obj.pages)) return;
        this.obj.pages.splice(i, 1);
        if (!this.obj.pages.length) delete this.obj.pages;
      },

      // ── Projects ─────────────────────────────────────────────────────────────
      // An entry is a bare path string or a { path, label, tracker, landing }
      // object, and the form KEEPS whichever shape the file already used: a
      // string stays a string until a field is set on it, at which point it has
      // to become an object. Converting on sight would rewrite every entry in a
      // manifest the moment anyone opened the form.
      get declaredProjects(){
        const list = Array.isArray(this.obj.projects) ? this.obj.projects : [];
        return list.map(e => (typeof e === 'string' ? { path: e } : (e && typeof e === 'object' ? e : null)))
                   .filter(e => e && typeof e.path === 'string' && e.path.trim())
                   .map(e => ({ ...e, path: e.path.trim().replace(/\/+$/, '') }));
      },
      // Declared first, in file order, then anything the scan found that nothing
      // declares. One list, because the disagreements are the point.
      get projectRows(){
        const rows = this.declaredProjects.map(e => ({
          path: e.path,
          declared: true,
          undetected: this.scanned && !this.found.includes(e.path),
          label: typeof e.label === 'string' ? e.label : '',
          landing: typeof e.landing === 'string' ? e.landing : '',
          trackerText: typeof e.tracker === 'string' ? e.tracker : '',
          noTracker: e.tracker === false,
          defaultLabel: e.path.split('/').pop(),
          defaultTracker: e.path + '/tracker/board.md',
        }));
        const declared = new Set(rows.map(r => r.path));
        for (const p of this.found) {
          if (!declared.has(p)) rows.push({ path: p, declared: false, undetected: false });
        }
        return rows;
      },
      // The header count, which is also the scan's only report: a scan that
      // finds nothing changes no row, so without the found half it would look
      // like it had not run. Data, not a sentence.
      get projectCount(){
        const n = this.declaredProjects.length;
        const base = n ? n + ' declared' : 'none declared';
        return this.scanned ? base + ' · ' + this.found.length + ' found' : base;
      },
      _projIndex(path){
        const list = Array.isArray(this.obj.projects) ? this.obj.projects : [];
        return list.findIndex(e => {
          const p = typeof e === 'string' ? e : (e && e.path);
          return typeof p === 'string' && p.trim().replace(/\/+$/, '') === path;
        });
      },
      // Write one field. An empty string clears the key rather than storing "",
      // which is the same minimality the repo-level clean() applies: absent is
      // the default, and the placeholder already says what the default is.
      setProjField(path, key, value){
        const i = this._projIndex(path);
        if (i < 0) return;
        const list = this.obj.projects;
        const entry = typeof list[i] === 'string' ? { path: list[i] } : { ...list[i] };
        if (value === false) entry[key] = false;
        else if (typeof value === 'string' && value.trim()) entry[key] = value.trim();
        else delete entry[key];
        // Back to a bare string once nothing but the path is left, so a row that
        // is set and then cleared does not leave a one-key object behind.
        const keys = Object.keys(entry).filter(k => k !== 'path');
        list[i] = keys.length ? entry : entry.path;
      },
      addProject(path){
        if (!Array.isArray(this.obj.projects)) this.obj.projects = [];
        if (this._projIndex(path) < 0) this.obj.projects.push(path);
      },
      removeProject(path){
        const i = this._projIndex(path);
        if (i < 0) return;
        this.obj.projects.splice(i, 1);
        if (!this.obj.projects.length) delete this.obj.projects;
      },
      // Detection, on the defining convention: a folder carrying tracker/tasks/
      // is a workspace under tracker management, and the tracker at the repo
      // root marks the repo itself rather than a project (home's
      // tools/generate-tracker-registry.py keys on exactly this, and its
      // trackers.md is the same walk). Keying on tasks/ rather than board.md
      // matters: the board is generated and can be absent from a fresh tracker.
      async scanProjects(){
        if (!this.repo || this.scanning) return;
        this.scanning = true;
        this.scanErr = '';
        try {
          const g = new window.GH({ token: this.hasToken() ? window.TOKEN : '', repo: this.repo, ref: this.ref });
          const res = await g.req('git/trees/' + encodeURIComponent(this.ref || 'HEAD') + '?recursive=1');
          const seen = new Set();
          for (const e of (res?.tree || [])) {
            const m = String(e.path || '').match(/^(.+)\/tracker\/tasks\//);
            if (m) seen.add(m[1]);
          }
          this.found = [...seen].sort();
          this.scanned = true;
          if (res?.truncated) this.scanErr = 'The tree came back truncated, so this list may be short.';
        } catch (e) {
          this.scanErr = 'Scan failed: ' + (e?.message || e);
        } finally { this.scanning = false; }
      },

      // ── The two-way sync ─────────────────────────────────────────────────────
      // A form edit re-serializes the draft from the (now-updated) obj; a JSON
      // edit re-parses into obj when it is a valid object. obj carries every
      // field (pages, scope, stage), so re-serializing after a form edit never
      // drops the ones the form doesn't show. Programmatic value changes don't
      // fire input events, so the two handlers never loop.
      formEdited(){ this.draft = JSON.stringify(clean(this.obj), null, 2); },
      jsonEdited(){
        try {
          const v = JSON.parse(this.draft);
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            // Writing obj trips the form watch; suppress it so the raw draft the
            // user is typing is not re-serialized under them.
            this._suppressForm = true;
            this.obj = v;
            this.$nextTick(() => { this._suppressForm = false; });
          }
        } catch {}
      },

      async load(){
        const s = Alpine.store('browser');
        const key = s.repo + '@' + s.ref;
        this._key = key;
        this.repo = s.repo || '';
        this.ref = s.ref || s.defaultRef || 'main';
        if (!s.repo) { this.loading = false; return; }
        this.loading = true;
        const g = new window.GH({ token: this.hasToken() ? window.TOKEN : '', repo: s.repo, ref: this.ref });
        let cfg = null, name = null;
        for (const n of ['.web-tools.json', '.show-repo.json']) {
          try {
            const p = JSON.parse((await g.get(n)).text);
            if (p && typeof p === 'object' && !Array.isArray(p)) { cfg = p; name = n; break; }
          } catch {}
        }
        if (this._key !== key) return;   // the repo changed while this was in flight
        this.configName = name;
        this.connected = !!cfg;
        this.obj = JSON.parse(JSON.stringify(cfg || TEMPLATE));
        this.draft = JSON.stringify(clean(this.obj), null, 2);
        this.tab = 'settings';
        // The scan is per repo and per ref, so a reload retires the old answer
        // rather than showing another repo's workspaces beside this one's.
        this.found = []; this.scanned = false; this.scanErr = '';
        this.loading = false;
      },

      format(){ if (!this.err) { this.draft = JSON.stringify(JSON.parse(this.draft), null, 2); this.jsonEdited(); } },

      async save(){
        if (this.err || !this.authed || !this.repo) return;
        const toast = Alpine.store('toast');
        const legacy = this.legacy;
        this.saving = true;
        try {
          const obj = JSON.parse(this.draft);   // the draft is the source of truth
          const g = new window.GH({ token: window.TOKEN || '', repo: this.repo, ref: this.ref });
          // save() lives in gh-store.js, which not every host page loads.
          if (typeof g.save !== 'function' && window.gh?.load) await window.gh.load('gh-store.js');
          await g.save('.web-tools.json', obj, legacy
            ? 'Migrate .show-repo.json to .web-tools.json via show-repo'
            : 'Update .web-tools.json via show-repo');
          if (toast) toast('check-circle', legacy ? 'Migrated to .web-tools.json' : 'Config saved', 'alert-success', 4000);
          this.configName = '.web-tools.json';
          this.connected = true;
          this.obj = JSON.parse(JSON.stringify(obj));
          this.draft = JSON.stringify(clean(this.obj), null, 2);
          // The shell rebuilds the config cache and reloads the estate / sidebar
          // on this event (the same one the header dialog fires); the via tag
          // lets this view skip re-reading its own write.
          document.dispatchEvent(new CustomEvent('web-tools:config-saved', { detail: { repo: this.repo, via: 'config-view' } }));
        } catch (e) {
          if (toast) toast('warning', 'Save failed: ' + (e?.message || e), 'alert-error', 6000);
        } finally {
          this.saving = false;
        }
      },
    };
  });
});
