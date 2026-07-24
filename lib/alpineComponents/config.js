document.addEventListener('alpine:init', function() {
  Alpine.data('config', function() {
    // Per-repo .web-tools.json editor as a full view: the roomy counterpart to
    // the header shield's cramped Settings/Config dialog. Same fields, same
    // minimal save (absent === off), same web-tools:config-saved event the shell
    // reloads the estate / sidebar on. Reads the open repo from the browser
    // store and reloads when it changes. The dialog stays for auth and for
    // configuring a repo you are not currently in (estate cards, the Map view).
    const TEMPLATE = { icon: '', estate: false, group: '', note: '', order: 0,
                       quickLink: false, landing: '', pins: [],
                       stage: { files: [], targets: [] } };
    const DOCS_URL = 'https://github.com/mehrlander/web-tools/blob/main/docs/show-repo.md#web-toolsjson-the-repo-manifest';
    // Drop empty/default keys so a saved config stays minimal, the one shape the
    // estate and the config cache read (mirrors the dialog's dlgClean).
    const clean = (o) => {
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
    };

    return {
      description: 'Per-repo .web-tools.json editor as a full view: a Settings form and a raw JSON tab over the open repo\'s config, saving through GH with the config-saved event the shell reloads on. The roomy counterpart to the header shield\'s config dialog.',

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

          <p x-show="!authed" class="text-base text-base-content/60">
            Editing needs a token: set one with the shield in the header. The config still reads below.
          </p>

          <div x-show="legacy" class="alert alert-warning py-1.5 px-3 text-sm flex items-center gap-2">
            <i class="ph ph-arrow-clockwise shrink-0"></i>
            <span>Loaded from legacy <span class="font-mono">.show-repo.json</span>. Saving migrates it to <span class="font-mono">.web-tools.json</span>.</span>
          </div>

          <!-- Tabs (the Branches-view segmented pill): the form for the common
               fields, the raw file for everything. -->
          <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 w-fit" role="tablist">
            <button role="tab" @click="switchTab('settings')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="tab==='settings' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-sliders-horizontal text-lg"></i>Settings</button>
            <button role="tab" @click="switchTab('json')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                    :class="tab==='json' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
              <i class="ph ph-brackets-curly text-lg"></i>JSON</button>
          </div>

          <div x-show="loading" class="flex justify-center py-16">
            <span class="loading loading-dots loading-md opacity-30"></span>
          </div>

          <!-- SETTINGS: the common fields as a roomy form. -->
          <div x-show="!loading && tab==='settings'" class="flex flex-col gap-4">
            <div class="flex items-center gap-6 flex-wrap">
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
            <div class="flex gap-3 flex-wrap">
              <label class="flex flex-col gap-1 flex-1 min-w-[10rem]">
                <span class="text-sm font-medium text-base-content/60 flex items-center gap-1.5">
                  <i class="ph text-base" :class="(obj.icon||'').trim() || 'ph-bookmark-simple'"></i>Icon</span>
                <input x-model="obj.icon" placeholder="ph-bookmark-simple"
                       autocapitalize="off" autocorrect="off" spellcheck="false"
                       class="input input-bordered input-sm font-mono text-base">
              </label>
              <label class="flex flex-col gap-1 flex-1 min-w-[10rem]">
                <span class="text-sm font-medium text-base-content/60">Group</span>
                <input x-model="obj.group" placeholder="core, data, …"
                       autocapitalize="off" autocorrect="off" spellcheck="false"
                       class="input input-bordered input-sm text-base">
              </label>
              <label class="flex flex-col gap-1 w-20 shrink-0">
                <span class="text-sm font-medium text-base-content/60">Order</span>
                <input type="number" x-model.number="obj.order" placeholder="0"
                       class="input input-bordered input-sm text-base">
              </label>
            </div>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-base-content/60">Note</span>
              <textarea x-model="obj.note" rows="2" placeholder="one-line description (overrides GitHub's)"
                        class="textarea textarea-bordered text-base leading-snug"></textarea>
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-base-content/60">Landing</span>
              <input x-model="obj.landing" placeholder="pages/landing.html (blank = Pages gallery, else an overview)"
                     autocapitalize="off" autocorrect="off" spellcheck="false"
                     class="input input-bordered input-sm font-mono text-base">
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-base-content/60">Pins (one per line)</span>
              <textarea x-model="pinsText" rows="3" spellcheck="false"
                        placeholder="pages&#10;docs/CONVENTIONS.md"
                        class="textarea textarea-bordered font-mono text-base leading-snug"></textarea>
            </label>
            <p class="text-sm text-base-content/40">
              Other fields (stage, pages, scope) are preserved on save; edit them in the JSON tab.
            </p>
          </div>

          <!-- JSON: the whole file. -->
          <div x-show="!loading && tab==='json'" class="flex flex-col gap-1">
            <textarea x-model="draft" spellcheck="false" rows="18"
              class="textarea textarea-bordered w-full font-mono text-base leading-snug"
              :class="err && 'textarea-error'" placeholder="{ }"></textarea>
            <div class="flex items-center justify-between gap-2 min-h-[1.25rem]">
              <span x-show="err" class="text-error text-sm flex items-center gap-1 min-w-0">
                <i class="ph ph-warning shrink-0"></i><span class="truncate" x-text="err"></span></span>
              <span x-show="!err" class="text-success text-sm flex items-center gap-1">
                <i class="ph ph-check"></i>Valid JSON</span>
              <button @click="format()" :disabled="!!err" class="btn btn-ghost btn-sm shrink-0">Format</button>
            </div>
          </div>

          <!-- Save. -->
          <div x-show="!loading" class="flex items-center gap-2 pt-1">
            <button @click="save()" :disabled="!!err || saving || !authed"
                    class="btn btn-primary gap-1.5">
              <span x-show="saving" class="loading loading-spinner loading-sm"></span>
              <span x-text="saving ? 'Saving…' : 'Save config'"></span>
            </button>
            <span x-show="!authed" class="text-sm text-base-content/50">Sign in (header shield) to save.</span>
          </div>
        </div>`,

      tab: 'settings',
      loading: true,
      saving: false,
      repo: '',
      ref: '',
      configName: null,
      connected: false,
      obj: {},
      draft: '{}',
      _key: '',

      init(){
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.load();
        // Reload when the open repo (or its ref) changes, so the view always
        // shows the current repo's config.
        this.$watch(() => Alpine.store('browser').repo + '@' + Alpine.store('browser').ref, () => this.load());
        // A save elsewhere (the header dialog) can rewrite the same file; re-read
        // when it lands, but skip the echo of our own save (repo matches, already
        // fresh) to avoid a redundant round-trip.
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
      // Only the raw tab can be malformed; the form is always valid.
      get err(){
        if (this.tab !== 'json') return '';
        let v;
        try { v = JSON.parse(this.draft); }
        catch (e) { return String(e.message || e).replace(/^JSON\.parse:\s*/, ''); }
        if (v === null || typeof v !== 'object' || Array.isArray(v)) return 'Top-level value must be an object';
        return '';
      },
      get pinsText(){ return (this.obj.pins || []).join('\n'); },
      set pinsText(v){
        const arr = v.split('\n').map(s => s.trim()).filter(Boolean);
        if (arr.length) this.obj.pins = arr; else delete this.obj.pins;
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
        this.loading = false;
      },

      switchTab(name){
        if (name === this.tab) return;
        // Entering JSON renders the form object; leaving JSON re-parses it, so the
        // two editors stay in sync (the dialog's dlgTab behavior).
        if (this.tab === 'json' && name === 'settings') {
          try { const v = JSON.parse(this.draft); if (v && typeof v === 'object' && !Array.isArray(v)) this.obj = v; } catch {}
        }
        if (name === 'json') this.draft = JSON.stringify(clean(this.obj), null, 2);
        this.tab = name;
      },
      format(){ if (!this.err) this.draft = JSON.stringify(JSON.parse(this.draft), null, 2); },

      async save(){
        if (this.err || !this.authed || !this.repo) return;
        const toast = Alpine.store('toast');
        const legacy = this.legacy;
        this.saving = true;
        try {
          const obj = this.tab === 'json' ? JSON.parse(this.draft) : clean(this.obj);
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
