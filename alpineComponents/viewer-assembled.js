document.addEventListener('alpine:init', function() {
  Alpine.data('viewer', function() {
    return {
      template: `
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <div class="flex-1 min-w-0 pr-2">
              <div class="text-sm font-medium font-mono truncate" x-show="file" x-text="file"></div>
              <div x-show="!file" class="h-[calc(100vh-190px)] border border-dashed border-base-300 rounded-lg flex items-center justify-center text-base-content/15">
                <i class="ph ph-code text-6xl"></i>
              </div>
              <div class="text-xs text-base-content/50" x-text="stats"></div>
            </div>
            <div class="flex items-center gap-0.5" x-show="file">
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
              <button @click="$clip(content)" class="btn btn-sm btn-square btn-ghost hover:text-primary"><i class="ph ph-copy text-lg"></i></button>
              <button @click="openUrls()" class="btn btn-sm btn-square btn-ghost hover:text-primary"><i class="ph ph-link text-lg"></i></button>
            </div>
          </div>
          <div x-show="file" class="h-[calc(100vh-230px)] border border-base-300 rounded-lg bg-base-100 overflow-hidden relative">
            <div class="h-full" x-html="viewHtml"></div>
            <div x-show="viewLoading" class="absolute inset-0 bg-base-100/30 flex items-center justify-center z-10">
              <span class="loading loading-spinner loading-md"></span>
            </div>
          </div>
          <dialog class="modal viewer-urls" onclick="if(event.target===this)this.close()">
            <div class="modal-box shadow-none border border-base-300 bg-base-100 p-4 max-w-lg">
              <div class="mb-3 px-1 font-mono text-sm font-bold truncate" x-text="file.split('/').pop()"></div>
              <div class="flex flex-col gap-1.5">
                <template x-for="url in fileUrls">
                  <div class="flex items-center bg-base-200 rounded-lg overflow-hidden">
                    <a :href="url.u" target="_blank" class="flex-1 flex items-center gap-2.5 px-3 py-2 min-w-0 hover:bg-base-300">
                      <i class="ph shrink-0 text-sm" :class="url.i"></i>
                      <div class="flex flex-col min-w-0">
                        <span class="text-xs font-semibold leading-tight" x-text="url.l"></span>
                        <span class="text-[10px] font-mono opacity-50 truncate leading-tight mt-0.5" x-text="url.u.replace('https://','')"></span>
                      </div>
                    </a>
                    <button class="px-3 py-2 border-l border-base-300 hover:bg-base-300" @click="$clip(url.u)">
                      <i class="ph ph-copy text-sm opacity-40"></i>
                    </button>
                  </div>
                </template>
              </div>
              <div class="modal-action mt-3"><button class="btn btn-ghost btn-sm text-xs" onclick="this.closest('dialog').close()">Done</button></div>
            </div>
          </dialog>
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
