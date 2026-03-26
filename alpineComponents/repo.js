document.addEventListener('alpine:init', function() {
    Alpine.data('repo', function() {
        return {
            repos: [],
            owner: '',
            name: '',
            repo: '',
            repoObj: null,
            auth: false,
            user: '',

            init() {
                this.$root.__repo = this;
            },

            get gh() {
                return Alpine.store('browser').gh;
            },
            get repoUrls() {
                const r = this.repo;
                return [
                    { l: 'GitHub', i: 'ph-github-logo', u: 'https://github.com/' + r },
                    { l: 'jsDelivr CDN', i: 'ph-cloud-arrow-down', u: 'https://cdn.jsdelivr.net/gh/' + r + '/' },
                    { l: 'Flat tree JSON', i: 'ph-tree-structure', u: 'https://data.jsdelivr.com/v1/packages/gh/' + r + '@main?structure=flat' }
                ];
            },

            async setup(gh) {
                this.auth = !!gh.headers.Authorization;
                if (this.auth) {
                    try { this.user = (await gh.req('/user')).login; } catch { this.user = 'Me'; }
                }
                this.repos = await gh.repos();
                if (this.repos[0]) this.pick(this.repos[0]);
            },

            async pick(r) {
                this.repo = r.full_name;
                this.owner = r.owner.login;
                this.name = r.name;
                this.repoObj = r;
                const gh = Alpine.store('browser').gh;
                gh.repo = r.full_name;
                Alpine.store('browser').repo = r.full_name;
                Alpine.store('browser').repoObj = r;
                Alpine.store('browser').activeFile = null;
                const navEl = document.getElementById('navigator');
                while(!navEl.__navigator) await new Promise(r => setTimeout(r, 50));
                navEl.__navigator.reset();
            }
        }
    })
})
