document.addEventListener('alpine:init', function() {
    Alpine.data('finder', function() {
        return {
            open: false,
            query: '',
            results: [],
            selected: 0,
            allFiles: [],
            loading: false,

            init() {
                document.addEventListener('keydown', (e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                        e.preventDefault();
                        this.toggle();
                    }
                    if (e.key === 'Escape' && this.open) {
                        this.close();
                    }
                });
            },

            async toggle() {
                if (this.open) { this.close(); return; }
                this.open = true;
                this.query = '';
                this.results = [];
                this.selected = 0;
                this.$nextTick(() => {
                    const input = this.$root.querySelector('input[type=search]');
                    if (input) input.focus();
                });
                if (!this.allFiles.length) await this.loadTree();
            },

            close() {
                this.open = false;
                this.query = '';
            },

            async loadTree() {
                const repo = Alpine.store('browser').repo;
                if (!repo) return;
                this.loading = true;
                try {
                    const res = await fetch('https://data.jsdelivr.com/v1/packages/gh/' + repo + '@main?structure=flat');
                    const j = await res.json();
                    this.allFiles = (j.files || []).map(f => f.name.replace(/^\//, ''));
                } catch { this.allFiles = []; }
                this.loading = false;
                this.search();
            },

            search() {
                const q = this.query.toLowerCase().trim();
                if (!q) {
                    this.results = this.allFiles.slice(0, 50);
                    this.selected = 0;
                    return;
                }

                const scored = [];
                for (const file of this.allFiles) {
                    const lower = file.toLowerCase();
                    const name = lower.split('/').pop();

                    // exact substring match in filename = best
                    if (name.includes(q)) {
                        scored.push({ file, score: name === q ? 3 : name.startsWith(q) ? 2.5 : 2 });
                    }
                    // substring match in full path
                    else if (lower.includes(q)) {
                        scored.push({ file, score: 1.5 });
                    }
                    // fuzzy: all query chars appear in order
                    else {
                        let fi = 0;
                        for (let ci = 0; ci < lower.length && fi < q.length; ci++) {
                            if (lower[ci] === q[fi]) fi++;
                        }
                        if (fi === q.length) {
                            scored.push({ file, score: 0.5 });
                        }
                    }
                }

                scored.sort((a, b) => b.score - a.score || a.file.length - b.file.length);
                this.results = scored.slice(0, 50).map(s => s.file);
                this.selected = 0;
            },

            onKey(e) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.selected = Math.min(this.selected + 1, this.results.length - 1);
                    this.scrollToSelected();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.selected = Math.max(this.selected - 1, 0);
                    this.scrollToSelected();
                } else if (e.key === 'Enter' && this.results[this.selected]) {
                    this.pick(this.results[this.selected]);
                }
            },

            scrollToSelected() {
                this.$nextTick(() => {
                    const el = this.$root.querySelector('[data-selected="true"]');
                    if (el) el.scrollIntoView({ block: 'nearest' });
                });
            },

            async pick(filePath) {
                this.close();
                const navEl = document.getElementById('navigator');
                while (!navEl.__navigator) await new Promise(r => setTimeout(r, 50));

                const folder = filePath.split('/').slice(0, -1).join('/');
                if (folder) await navEl.__navigator.load(folder, true);
                await navEl.__navigator.sel(filePath);
            },

            highlight(file) {
                const q = this.query.toLowerCase().trim();
                if (!q) return this.esc(file);
                const lower = file.toLowerCase();
                const idx = lower.indexOf(q);
                if (idx >= 0) {
                    return this.esc(file.slice(0, idx))
                        + '<span class="text-primary font-bold">' + this.esc(file.slice(idx, idx + q.length)) + '</span>'
                        + this.esc(file.slice(idx + q.length));
                }
                return this.esc(file);
            },

            esc(s) {
                return new Option(String(s ?? '')).innerHTML;
            }
        }
    })
})
