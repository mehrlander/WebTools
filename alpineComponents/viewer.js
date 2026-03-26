document.addEventListener('alpine:init', function() {
    Alpine.data('viewer', function() {
        return {
            file: '',
            content: '',
            mode: '',
            viewLoading: false,
            commits: [],
            commitsFor: '',

            init() {
                this.$root.__viewer = this;
                this.$watch(
                    () => Alpine.store('browser').activeFile,
                    (f) => { if (f) this.show(f.path, f.content); }
                );
            },

            get repo() {
                return Alpine.store('browser').repo;
            },
            get ext() {
                return this.file ? this.file.split('.').pop().toLowerCase() : '';
            },
            get fileContext() {
                return { name: this.file, ext: this.ext, content: this.content };
            },
            get availableModes() {
                return window.ViewRegistry ? window.ViewRegistry.getModes(this.fileContext) : [];
            },
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
                    { l: 'Raw', i: 'ph-file-text', u: 'https://raw.githubusercontent.com/' + r + '/main/' + this.file },
                    { l: 'CDN', i: 'ph-cloud-arrow-down', u: 'https://cdn.jsdelivr.net/gh/' + r + '/' + this.file }
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
        }
    })
})
