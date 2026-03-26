document.addEventListener('alpine:init', function() {
    Alpine.data('viewer', function(opts) {
        opts = opts || {};
        var repo = opts.repo || '';

        return {
            file: '',
            content: '',
            mode: '',
            viewLoading: false,
            commits: [],
            commitsFor: '',

            init() {
                this.$root.__viewer = this;
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
                var mod = window.ViewRegistry.modules.find(function(m) { return m.id === this.mode; }.bind(this));
                return mod ? mod.icon : 'ph-text-t';
            },
            get stats() {
                if (!this.content) return '';
                return this.content.split('\n').length + ' lines · ' + (new Blob([this.content]).size / 1024).toFixed(1) + ' KB';
            },
            get viewHtml() {
                if (!this.file || !this.content || !window.ViewRegistry) return '';
                var mod = window.ViewRegistry.modules.find(function(m) { return m.id === this.mode; }.bind(this)) || window.ViewRegistry.modules[0];
                return mod.render(this.fileContext);
            },
            get fileUrls() {
                if (!repo || !this.file) return [];
                return [
                    { l: 'GitHub', i: 'ph-github-logo', u: 'https://github.com/' + repo + '/blob/main/' + this.file },
                    { l: 'Raw', i: 'ph-file-text', u: 'https://raw.githubusercontent.com/' + repo + '/main/' + this.file },
                    { l: 'CDN', i: 'ph-cloud-arrow-down', u: 'https://cdn.jsdelivr.net/gh/' + repo + '/' + this.file }
                ];
            },

            async show(file, content) {
                this.file = file;
                this.content = content;
                this.commits = [];
                this.commitsFor = '';
                this.viewLoading = true;
                var modes = this.availableModes;
                var preferred = modes.find(function(m) { return m.id === 'code'; });
                await this.switchMode(preferred ? preferred.id : modes[0].id);
            },

            async switchMode(id) {
                this.viewLoading = true;
                var mod = await window.ViewRegistry.prepare(id);
                this.mode = id;
                this.$nextTick(function() {
                    if (mod.after) mod.after(this.fileContext);
                    this.viewLoading = false;
                }.bind(this));
            },

            openUrls() {
                var el = this.$root.querySelector('dialog.viewer-urls');
                if (el) el.showModal();
            }
        }
    })
})
