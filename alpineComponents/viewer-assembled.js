document.addEventListener('alpine:init', function() {
  Alpine.data('viewer', function() {
    return {
      template: `
        <div class="flex items-center justify-between mb-2" x-show="file">
          <span class="text-xs text-base-content/50 font-mono" x-text="stats"></span>
          <div class="flex items-center gap-0.5">
            <template x-for="u in fileUrls">
              <a :href="u.u" target="_blank" class="btn btn-sm btn-square btn-ghost hover:text-primary">
                <i class="ph text-lg" :class="u.i"></i>
              </a>
            </template>
            <details class="dropdown dropdown-end">
              <summary class="btn btn-sm btn-square btn-ghost hover:text-primary">
                <i class="ph text-lg" :class="modeIcon"></i>
              </summary>
              <ul class="dropdown-content z-[1] menu p-2 shadow-lg bg-base-200 rounded-box w-32 mt-1 border border-base-300">
                <template x-for="m in availableModes">
                  <li><a @click="switchMode(m.id)" :class="mode === m.id ? 'active' : ''">
                    <i class="ph" :class="m.icon"></i>
                    <span x-text="m.label"></span>
                  </a></li>
                </template>
              </ul>
            </details>
          </div>
        </div>
        <div x-show="viewLoading" class="flex justify-center py-20">
          <span class="loading loading-spinner loading-lg text-primary"></span>
        </div>
        <div x-show="!viewLoading" class="h-[calc(100vh-180px)] border border-base-300 rounded-lg bg-base-100 overflow-hidden">
          <div class="h-full" x-html="viewHtml"></div>
        </div>`,

      file: '',
      content: '',
      mode: '',
      viewLoading: false,
      commits: [],
      commitsFor: '',

      init() {
        this.$root.__viewer = this;
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.$watch(
          () => Alpine.store('browser').activeFile,
          (f) => { if (f) this.show(f.path, f.content); }
        );
      },

      get repo() { return Alpine.store('browser').repo; },
      get ext() { return this.file ? this.file.split('.').pop().toLowerCase() : ''; },
      get fileContext() { return { name: this.file, ext: this.ext, content: this.content }; },
      get availableModes() { return window.ViewRegistry ? window.ViewRegistry.getModes(this.fileContext) : []; },
      get modeIcon() {
        if (!window.ViewRegistry) return 'ph-text-t';
        const mod = window.ViewRegistry.modules.find(m => m.id === this.mode);
        return mod ? mod.icon : 'ph-text-t';
      },
      get stats() {
        if (!this.content) return '';
        return this.content.split('\n').length + ' lines · ' + (new Blob([this.content]).size / 1024).toFixed(1) + ' KB';
      },
      get viewHtml() {
        if (!this.file || !this.content || !window.ViewRegistry) return '';
        const mod = window.ViewRegistry.modules.find(m => m.id === this.mode) || window.ViewRegistry.modules[0];
        return mod.render(this.fileContext);
      },
      get fileUrls() {
        const r = this.repo;
        if (!r || !this.file) return [];
        return [
          { l: 'GitHub', i: 'ph-github-logo', u: 'https://github.com/' + r + '/blob/main/' + this.file },
          { l: 'Raw',    i: 'ph-file-text',   u: 'https://raw.githubusercontent.com/' + r + '/main/' + this.file },
          { l: 'CDN',    i: 'ph-cloud-arrow-down', u: 'https://cdn.jsdelivr.net/gh/' + r + '/' + this.file }
        ];
      },

      async show(file, content) {
        this.file = file;
        this.content = content;
        this.commits = [];
        this.commitsFor = '';
        this.viewLoading = true;
        const modes = this.availableModes;
        const preferred = modes.find(m => m.id === 'raw');
        await this.switchMode(preferred ? preferred.id : modes[0].id);
      },

      async switchMode(id) {
        this.viewLoading = true;
        const mod = await window.ViewRegistry.prepare(id);
        this.mode = id;
        this.$nextTick(() => {
          if (mod.after) mod.after(this.fileContext);
          this.viewLoading = false;
        });
      },

      openUrls() {
        const el = this.$root.querySelector('dialog.viewer-urls');
        if (el) el.showModal();
      }
    };
  });
});
