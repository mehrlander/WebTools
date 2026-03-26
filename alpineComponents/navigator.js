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
            flatFiles: [],
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

            async load(p, silent) {
                this.path = p;
                Alpine.store('browser').path = p;
                this.loading = true;
                try { this.tree = await this.gh.ls(p); } catch {}
                this.loading = false;
                if (!silent) {
                    const label = p ? p.split('/').pop() + '/' : '/';
                    this.persist('folder-open', label);
                }
            },

            async reset() {
                this.path = '';
                this.tree = [];
                this.pulled = [];
                this.pullText = '';
                await this.load('', true);
                const repo = Alpine.store('browser').repo;
                const label = repo.split('/').pop();
                this.persist('database', label);
            },

            async sel(p, silent) {
                try {
                    const res = await this.gh.get(p);
                    Alpine.store('browser').activeFile = { path: p, content: fmt(res.text) };
                } catch(e) {
                    Alpine.store('browser').activeFile = { path: p, content: '// Error: ' + e.message };
                }
                if (!silent) {
                    this.persist('file', p.split('/').pop());
                }
            },

            persist(icon, label) {
                const store = Alpine.store('browser');
                const state = {
                    repo: store.repo,
                    path: this.path,
                    file: store.activeFile?.path || ''
                };
                if (store.save) store.save(state);
                Alpine.store('toast')(icon, label, 'alert-info', 2000);
            },

            async fetchFlatTree() {
                try {
                    const repo = Alpine.store('browser').repo;
                    const j = await fetch('https://data.jsdelivr.com/v1/packages/gh/' + repo + '@main?structure=flat').then(r => r.json());
                    this.flatFiles = (j.files || []).map(f => f.name.replace(/^\//, ''));
                } catch {}
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
