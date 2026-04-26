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
              <!--slot-->
            </div>
          </div>
          <div x-show="file" class="h-[calc(100vh-230px)] border border-base-300 rounded-lg bg-base-100 overflow-hidden relative">
            <div class="h-full" x-html="viewHtml"></div>
            <div x-show="viewLoading" class="absolute inset-0 bg-base-100/30 flex items-center justify-center z-10">
              <span class="loading loading-spinner loading-md"></span>
            </div>
          </div>
        </div>`,

      file: '',
      content: '',
      mode: '',
      viewLoading: false,
      commits: [],
      commitsFor: '',

      init() {
        this.$root.__viewer = this;
        const slot = this.$el.innerHTML;
        this.$el.innerHTML = this.template.replace('<!--slot-->', slot);
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
      }
    };
  });
});
