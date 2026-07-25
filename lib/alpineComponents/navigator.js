document.addEventListener('alpine:init', function() {
  Alpine.data('navigator', function() {
    const esc = s => new Option(String(s ?? '')).innerHTML;
    const fmt = t => t.replace(/ {4}/g, '  ');
    const stat = t => t.split('\n').length + ' lines · ' + (new Blob([t]).size / 1024).toFixed(1) + ' KB';

    return {
      description: 'Repo file tree browser; loads directories and selects files via the browser store',

      template: `
        <div>
          <button @click="open=!open" class="flex items-center gap-1 font-semibold py-0.5 hover:text-primary mb-1 cursor-pointer">
            <i class="ph" :class="open?'ph-caret-down':'ph-caret-right'"></i>Files
          </button>
          <div x-show="open" x-collapse>
            <div class="text-sm font-mono text-base-content/50 px-1 pb-1 truncate flex items-center gap-1">
              <i class="ph ph-folder-open"></i><span x-text="'/'+path"></span>
            </div>
            <div class="overflow-y-auto text-base bg-base-100 rounded-lg p-1 h-[33vh] border border-base-300">
              <div x-show="loading" class="flex justify-center py-8">
                <span class="loading loading-dots loading-md opacity-30"></span>
              </div>
              <div x-show="!loading">
                <div x-show="path" @click="load(parentPath)" class="p-1 hover:bg-base-200 rounded cursor-pointer opacity-50 font-mono">..</div>
                <template x-for="f in tree" :key="f.path">
                  <div @click="f.type==='dir' ? load(f.path) : sel(f.path)"
                    class="group flex items-center justify-between p-1 hover:bg-base-200 rounded cursor-pointer"
                    :class="{'bg-primary/10 text-primary font-bold': activeFile === f.path}">
                    <div class="flex items-center gap-1 min-w-0">
                      <i class="ph" :class="f.type==='dir' ? 'ph-folder text-warning' : 'ph-file text-info'"></i>
                      <span class="truncate" x-text="f.name"></span>
                    </div>
                    <button x-show="f.type!=='dir'" @click.stop="pullAdd(f.path)"
                      class="btn btn-ghost btn-xs w-6 h-6 p-0 opacity-30 hover:opacity-100 hover:text-success">
                      <i class="ph ph-plus-circle text-lg"></i>
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <div x-show="pulled.length" class="flex flex-col gap-2 p-2 bg-base-200 rounded-lg">
          <div class="flex flex-wrap gap-1.5">
            <template x-for="p in pulled" :key="p">
              <div class="badge badge-outline gap-1 pr-0.5">
                <span class="truncate max-w-[140px] font-mono text-[12px]" x-text="p"></span>
                <button @click="pullRm(p)" class="btn btn-ghost btn-xs w-4 h-4 p-0 rounded-full hover:text-error"><i class="ph ph-x"></i></button>
              </div>
            </template>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-bold opacity-70" x-text="'Combined (' + pullStat + ')'"></span>
            <button @click="$clip(pullText)" class="btn btn-xs btn-square btn-ghost"><i class="ph ph-copy text-lg"></i></button>
          </div>
          <div class="overflow-auto font-mono text-sm border border-base-300 rounded p-2 bg-base-100 h-[25vh] opacity-80" x-text="pullText"></div>
          <div class="flex flex-col gap-1.5 border-t border-base-300 pt-2">
            <div class="flex items-center gap-1">
              <input x-model="destSpec" list="nav-transfer-targets" placeholder="owner/repo:dir"
                class="input input-xs input-bordered font-mono grow min-w-0" :disabled="sending">
              <datalist id="nav-transfer-targets">
                <template x-for="t in targets" :key="t"><option :value="t"></option></template>
              </datalist>
              <button @click="sendPulled()" :disabled="sending || !destSpec.trim()"
                class="btn btn-xs gap-1" :class="sendArmed ? 'btn-error' : 'btn-primary'">
                <i class="ph" :class="sending ? 'ph-circle-notch animate-spin' : 'ph-paper-plane-tilt'"></i>
                <span x-text="sendLabel"></span>
              </button>
            </div>
            <div class="flex items-center justify-between gap-2">
              <button @click="saveStage()" :disabled="savingStage"
                class="btn btn-ghost btn-xs gap-1 opacity-70 hover:opacity-100"
                title="Write the staged list to .web-tools.json in this repo">
                <i class="ph" :class="savingStage ? 'ph-circle-notch animate-spin' : 'ph-push-pin'"></i>Save stage
              </button>
              <span class="text-[12px] font-mono opacity-60 truncate" x-text="sendStatus"></span>
            </div>
          </div>
        </div>`,

      path: '',
      tree: [],
      loading: false,
      // True once any directory listing has completed (ok or not): the
      // "tree has had its first paint" signal show-repo's Recent panel
      // defers behind, so its fetches never contend with the tree's.
      loadedOnce: false,
      pulled: [],
      pullText: '',
      open: true,
      destSpec: '',
      sending: false,
      sendArmed: false,
      sendStatus: '',
      savingStage: false,

      init() {
        this.$root.__navigator = this;
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.$watch(
          () => Alpine.store('browser').ref,
          () => { if (this.gh && Alpine.store('browser').repo) this.reloadForRef(); }
        );
        // The repo's .web-tools.json manifest (probed by the shell) can carry
        // a durable staged-files list; fold it in whenever a config lands.
        this.$watch(() => Alpine.store('browser').config, cfg => this.seedStage(cfg));
        this.seedStage(Alpine.store('browser').config);
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
        this.loadedOnce = true;
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
        this.destSpec = '';
        this.sendStatus = '';
        this.sendArmed = false;
        await this.load('', true);
        const repo = Alpine.store('browser').repo;
        const label = repo.split('/').pop();
        this.persist('database', label);
      },

      async reloadForRef() {
        this.gh.ref = Alpine.store('browser').ref;
        const currentPath = this.path;
        const active = Alpine.store('browser').activeFile?.path;
        await this.load(currentPath, true);
        if (active) await this.sel(active, true);
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
          ref: store.ref || '',
          path: this.path,
          file: store.activeFile?.path || ''
        };
        if (store.save) store.save(state);
        Alpine.store('toast')(icon, label, 'alert-info', 2000);
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
      },

      // ── Stage & transfer: the manifest-backed layer over pulled[] ──────────
      // A repo's .web-tools.json can designate stage.files (a durable staged
      // list, folded in below) and stage.targets ("owner/repo:dir" strings the
      // destination datalist offers). Sending copies the staged files to the
      // destination via gh.copyTo (gh-transfer.js, lazy-loaded on first use).

      get targets() {
        return Alpine.store('browser').config?.stage?.targets || [];
      },
      get sendLabel() {
        return this.sending ? 'Sending…' : this.sendArmed ? 'Sure?' : 'Copy';
      },

      seedStage(cfg) {
        const files = cfg?.stage?.files;
        if (!this.destSpec && cfg?.stage?.targets?.length) this.destSpec = cfg.stage.targets[0];
        // Only seed an empty stage: a working set the user built by hand wins.
        if (Array.isArray(files) && files.length && !this.pulled.length) {
          this.pulled = [...files];
          this.refreshPull();
        }
      },

      // "owner/repo", "owner/repo:dir", or "owner/repo@ref:dir".
      parseDest(spec) {
        const m = spec.trim().match(/^([\w.-]+\/[\w.-]+?)(?:@([\w./-]+))?(?::(.*))?$/);
        return m ? { repo: m[1], ref: m[2] || '', dir: (m[3] || '').trim() } : null;
      },

      // Two-tap confirm: first tap arms for 3s, second sends. Cross-repo write
      // with the viewer's token, so the extra gesture stays deliberate.
      async sendPulled() {
        if (this.sending || !this.pulled.length) return;
        const toast = Alpine.store('toast');
        const dest = this.parseDest(this.destSpec);
        if (!dest) return toast('warning', 'Destination must be owner/repo, owner/repo:dir, or owner/repo@ref:dir', 'alert-error', 5000);
        if (dest.repo === Alpine.store('browser').repo && !dest.dir && !dest.ref) {
          return toast('warning', 'That would copy the files onto themselves — add a :dir or @ref', 'alert-error', 5000);
        }
        if (!this.sendArmed) {
          this.sendArmed = true;
          setTimeout(() => { this.sendArmed = false; }, 3000);
          return;
        }
        this.sendArmed = false;
        this.sending = true;
        this.sendStatus = '';
        try {
          if (!this.gh.copyTo) await window.gh?.load('gh-transfer.js');
          if (!this.gh.copyTo) throw new Error('gh-transfer.js unavailable');
          const res = await this.gh.copyTo(dest, [...this.pulled], {
            onProgress: (done, total) => {
              this.sendStatus = done < total ? 'copying ' + (done + 1) + '/' + total + '…' : '';
            }
          });
          const ok = res.filter(r => r.status === 'ok').length;
          const bad = res.filter(r => r.status === 'error');
          this.sendStatus = ok + '/' + res.length + ' copied to ' + dest.repo + (dest.dir ? ':' + dest.dir : '');
          if (bad.length) {
            console.warn('copy failures:', bad);
            toast('warning', bad.length + ' file' + (bad.length === 1 ? '' : 's') + ' failed — see console', 'alert-error', 6000);
          } else {
            toast('paper-plane-tilt', 'Copied ' + ok + ' file' + (ok === 1 ? '' : 's') + ' to ' + dest.repo, 'alert-success', 4000);
          }
        } catch (e) {
          this.sendStatus = '';
          toast('warning', 'Copy failed: ' + (e.message || e), 'alert-error', 6000);
        }
        this.sending = false;
      },

      // Persist pulled[] as this repo's stage.files, merging into whatever
      // else .web-tools.json already declares. Explicit gesture, one commit;
      // lands on the repo's default branch (the Contents API default).
      async saveStage() {
        if (this.savingStage) return;
        const toast = Alpine.store('toast');
        this.savingStage = true;
        try {
          if (!this.gh.save) await window.gh?.load('gh-store.js');
          if (!this.gh.save) throw new Error('gh-store.js unavailable');
          let cfg = {};
          // SUNSET(2026-08-15): the '.show-repo.json' entry is the legacy-name
          // read fallback; drop it once consumer repos are migrated.
          for (const name of ['.web-tools.json', '.show-repo.json']) {
            try { cfg = JSON.parse((await this.gh.get(name)).text); break; } catch {}
          }
          cfg.stage = { ...(cfg.stage || {}), files: [...this.pulled] };
          await this.gh.save('.web-tools.json', cfg, 'Update staged files via show-repo');
          Alpine.store('browser').config = cfg;
          toast('push-pin', 'Stage saved to .web-tools.json', 'alert-success', 3000);
        } catch (e) {
          toast('warning', 'Save failed: ' + (e.message || e), 'alert-error', 6000);
        }
        this.savingStage = false;
      }
    };
  });
});
