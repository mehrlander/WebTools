document.addEventListener('alpine:init', function() {
    Alpine.data('navigator', function() {
        const esc = s => new Option(String(s ?? '')).innerHTML;
        const fmt = t => t.replace(/ {4}/g, '  ');
        const stat = t => t.split('\n').length + ' lines · ' + (new Blob([t]).size / 1024).toFixed(1) + ' KB';

        return {
            path: '',
            tree: [],
            loading: false,
            pulled: [],
            pullText: '',
            open: true,

            init() {
                this.$root.__navigator = this;
            },

            get gh() {
                return Alpine.store('browser').gh;
            },
            get activeFile() {
                return Alpine.store('browser').activeFile?.path;
            },
            get parentPath() {
                return this.path.split('/').slice(0, -1).join('/');
            },
            get pullStat() {
                return this.pullText ? stat(this.pullText).split('·')[1] : '';
            },

            async load(p) {
                this.path = p;
                this.loading = true;
                try { this.tree = await this.gh.ls(p); } catch {}
                this.loading = false;
            },

            async reset() {
                this.path = '';
                this.tree = [];
                this.pulled = [];
                this.pullText = '';
                await this.load('');
            },

            async sel(p) {
                try {
                    const res = await this.gh.get(p);
                    Alpine.store('browser').activeFile = { path: p, content: fmt(res.text) };
                } catch(e) {
                    Alpine.store('browser').activeFile = { path: p, content: '// Error: ' + e.message };
                }
            },

            async pullAdd(p) {
                if (!this.pulled.includes(p)) { this.pulled.push(p); await this.refreshPull(); }
            },
            async pullRm(p) {
                this.pulled = this.pulled.filter(x => x !== p);
                await this.refreshPull();
            },
            async refreshPull() {
                this.pullText = (await Promise.all(this.pulled.map(async p => {
                    try { return '// === ' + p + ' ===\n' + fmt((await this.gh.get(p)).text); } catch { return '// ERROR: ' + p; }
                }))).join('\n\n');
            }
        }
    })
})
