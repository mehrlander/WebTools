document.addEventListener('alpine:init', function() {
  Alpine.data('compare', function() {
    const STATUS_ICON = {
      added: 'ph-plus-circle text-success',
      modified: 'ph-pencil-simple text-warning',
      removed: 'ph-minus-circle text-error',
      renamed: 'ph-arrow-right text-info',
      copied: 'ph-copy text-info',
      changed: 'ph-pencil-simple text-warning',
      unchanged: 'ph-minus text-base-content/40'
    };

    const STATUS_TAG = {
      added: 'A',
      modified: 'M',
      removed: 'D',
      renamed: 'R',
      copied: 'C',
      changed: 'M',
      unchanged: '·'
    };

    return {
      description: 'GitHub branch/ref compare viewer with per-file diff status',

      template: `
        <button @click="open=!open" class="flex items-center gap-1 font-semibold py-0.5 hover:text-primary mb-1 cursor-pointer">
          <i class="ph" :class="open?'ph-caret-down':'ph-caret-right'"></i>Compare
          <span x-show="data" class="text-base font-normal opacity-60 ml-1">
            <span x-text="data?.status||''"></span>
            · +<span x-text="data?.ahead_by||0"></span> / -<span x-text="data?.behind_by||0"></span>
          </span>
        </button>
        <div x-show="open" x-collapse>
          <div class="border border-base-300 rounded-lg p-3 bg-base-100 flex flex-col gap-3">

            <div class="flex flex-wrap items-end gap-2">
              <div class="flex flex-col">
                <label class="text-base font-bold opacity-70 uppercase">Base</label>
                <input x-model="base" placeholder="main" list="compare-branches"
                  @focus="$store.browser.ensureBranches()"
                  class="input input-bordered font-mono text-base w-44">
              </div>
              <div class="flex items-center pb-1.5 opacity-50">...</div>
              <div class="flex flex-col">
                <label class="text-base font-bold opacity-70 uppercase">Head</label>
                <input x-model="head" placeholder="branch / tag / sha" list="compare-branches"
                  @focus="$store.browser.ensureBranches()"
                  class="input input-bordered font-mono text-base w-56">
              </div>
              <datalist id="compare-branches">
                <template x-for="b in $store.browser.branches" :key="b.name">
                  <option :value="b.name"></option>
                </template>
              </datalist>
              <button @click="run()" :disabled="loading || !base || !head" class="btn btn-primary gap-1">
                <i class="ph ph-git-pull-request"></i>Compare
              </button>
              <button x-show="currentRef && defaultRef && currentRef !== defaultRef"
                @click="openWith(defaultRef, currentRef)"
                :disabled="loading"
                class="btn btn-ghost gap-1"
                :title="'Compare ' + currentRef + ' to ' + defaultRef">
                <i class="ph ph-git-pull-request"></i>
                <span class="font-mono" x-text="currentRef"></span>
                <i class="ph ph-arrow-right opacity-50"></i>
                <span class="font-mono" x-text="defaultRef"></span>
              </button>
              <a x-show="data" :href="ghCompareUrl" target="_blank" class="btn btn-ghost gap-1">
                <i class="ph ph-arrow-square-out"></i>on GitHub
              </a>
            </div>

            <div x-show="loading" class="flex justify-center py-6">
              <span class="loading loading-spinner loading-md text-primary"></span>
            </div>

            <div x-show="error" class="alert alert-error py-1.5 px-3 text-base" x-text="error"></div>

            <template x-if="data && !loading">
              <div class="flex flex-col gap-3">

                <div class="flex flex-wrap gap-1.5 text-base">
                  <span class="badge badge-sm" :class="statusClass" x-text="data.status"></span>
                  <span class="badge badge-sm badge-ghost font-mono">+<span x-text="data.ahead_by"></span> ahead</span>
                  <span class="badge badge-sm badge-ghost font-mono">-<span x-text="data.behind_by"></span> behind</span>
                  <span class="badge badge-sm badge-ghost font-mono"><span x-text="data.total_commits||0"></span> commits</span>
                  <span class="badge badge-sm badge-ghost font-mono"><span x-text="(data.files||[]).length"></span> files</span>
                </div>

                <div x-show="(data.commits||[]).length">
                  <div class="text-base font-bold opacity-70 mb-1">Commits</div>
                  <div class="border border-base-300 rounded bg-base-100 max-h-40 overflow-y-auto text-base font-mono">
                    <template x-for="c in (data.commits||[])" :key="c.sha">
                      <div class="px-2 py-1 border-b border-base-200 last:border-b-0 flex items-baseline gap-2">
                        <a :href="'https://github.com/'+repo+'/commit/'+c.sha" target="_blank"
                          class="text-primary shrink-0" x-text="c.sha.slice(0,7)"></a>
                        <span class="truncate" x-text="(c.commit?.message||'').split('\\n')[0]"></span>
                      </div>
                    </template>
                  </div>
                </div>

                <div x-show="(data.files||[]).length">
                  <div class="text-base font-bold opacity-70 mb-1 flex items-center justify-between">
                    <span>Files</span>
                    <span class="opacity-60 font-normal">
                      +<span x-text="totalAdditions"></span> -<span x-text="totalDeletions"></span>
                    </span>
                  </div>
                  <div class="border border-base-300 rounded bg-base-100 max-h-56 overflow-y-auto text-base">
                    <template x-for="f in (data.files||[])" :key="f.filename">
                      <div class="px-2 py-1 border-b border-base-200 last:border-b-0 flex items-center gap-2">
                        <span class="font-mono w-4 text-center" :class="statusColor(f.status)" x-text="statusTag(f.status)"></span>
                        <!-- The row's jump-over: the file's blob AT HEAD, which is
                             the version this comparison is about. The compare link
                             above covers the whole diff and the commit links cover
                             the history; a per-file route was the one thing missing.
                             A removed file has no blob at head, so it stays inert. -->
                        <a x-show="fileGh(f)" :href="fileGh(f)" :data-peek="filePeek(f)"
                           target="_blank" rel="noopener" :title="f.filename + ' at ' + head"
                           class="font-mono truncate flex-1 hover:text-primary transition-colors"
                           x-text="f.filename"></a>
                        <span x-show="!fileGh(f)" class="font-mono truncate flex-1 opacity-60" x-text="f.filename"></span>
                        <span class="font-mono opacity-60 text-base shrink-0">
                          +<span x-text="f.additions||0"></span>/-<span x-text="f.deletions||0"></span>
                        </span>
                      </div>
                    </template>
                  </div>
                </div>

                <div class="border-t border-base-200 pt-2">
                  <div class="text-base font-bold opacity-70 mb-1.5">Serialized output (for LLM)</div>
                  <div class="flex flex-wrap items-center gap-3 text-base mb-2">
                    <label class="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" x-model="opts.includeCommits" class="checkbox checkbox-sm">
                      Commits
                    </label>
                    <label class="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" x-model="opts.includeFileList" class="checkbox checkbox-sm">
                      File list
                    </label>
                    <label class="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" x-model="opts.includePatches" class="checkbox checkbox-sm">
                      Patches
                    </label>
                    <label class="flex items-center gap-1" x-show="opts.includePatches">
                      <span class="opacity-70">max bytes/patch</span>
                      <input type="number" x-model.number="opts.maxPatchBytes" min="0" step="1000"
                        class="input input-bordered w-20 font-mono">
                    </label>
                    <label class="flex items-center gap-1">
                      <span class="opacity-70">path filter</span>
                      <input type="text" x-model="opts.pathFilter" placeholder="substring"
                        class="input input-bordered w-32 font-mono">
                    </label>
                  </div>
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-base font-mono opacity-60" x-text="dumpStats"></span>
                    <button @click="$clip(serialized)" class="btn btn-ghost gap-1">
                      <i class="ph ph-copy"></i>Copy
                    </button>
                  </div>
                  <textarea readonly x-model="serialized"
                    class="textarea textarea-bordered w-full font-mono text-base h-56 leading-snug"></textarea>
                </div>
              </div>
            </template>

            <div x-show="!data && !loading && !error" class="text-base opacity-60 italic">
              Type Base and Head, then click Compare. Use the shortcut above to compare the current ref to the default branch.
            </div>

          </div>
        </div>`,

      open: false,
      base: '',
      head: '',
      data: null,
      loading: false,
      error: '',
      opts: {
        includeCommits: true,
        includeFileList: true,
        includePatches: true,
        maxPatchBytes: 8000,
        pathFilter: ''
      },

      init() {
        this.$root.__compare = this;
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        this.$watch(
          () => Alpine.store('browser').repo,
          () => { this.data = null; this.error = ''; this.base = ''; this.head = ''; }
        );
      },

      get gh() { return Alpine.store('browser').gh; },
      get repo() { return Alpine.store('browser').repo; },
      get defaultRef() { return Alpine.store('browser').defaultRef || 'main'; },
      get currentRef() { return Alpine.store('browser').ref || 'main'; },
      get ghCompareUrl() {
        if (!this.repo || !this.data) return '#';
        return 'https://github.com/' + this.repo + '/compare/' + this.base + '...' + this.head;
      },
      get statusClass() {
        const s = this.data?.status;
        if (s === 'identical') return 'badge-ghost';
        if (s === 'ahead') return 'badge-success';
        if (s === 'behind') return 'badge-warning';
        if (s === 'diverged') return 'badge-error';
        return 'badge-ghost';
      },
      get totalAdditions() {
        return (this.data?.files || []).reduce((a, f) => a + (f.additions || 0), 0);
      },
      get totalDeletions() {
        return (this.data?.files || []).reduce((a, f) => a + (f.deletions || 0), 0);
      },
      get serialized() {
        if (!this.data) return '';
        return this.buildDump();
      },
      get dumpStats() {
        const s = this.serialized;
        if (!s) return '';
        const lines = s.split('\n').length;
        const kb = (new Blob([s]).size / 1024).toFixed(1);
        return lines + ' lines · ' + kb + ' KB';
      },

      statusColor(s) { return (STATUS_ICON[s] || STATUS_ICON.modified).split(' ').slice(1).join(' '); },
      statusTag(s) { return STATUS_TAG[s] || '?'; },
      // A file row's own jump-over. `removed` is the one status with nothing to
      // point at on the head side, so it gets no link rather than a 404.
      fileGh(f) {
        if (!this.repo || !f || f.status === 'removed') return '';
        return 'https://github.com/' + this.repo + '/blob/' + this.head + '/' + f.filename;
      },
      filePeek(f) {
        if (!this.fileGh(f)) return null;
        return window.SourcePeek?.addr(this.repo, this.head, f.filename) || null;
      },

      openWith(base, head) {
        this.open = true;
        if (base) this.base = base;
        if (head) this.head = head;
        this.run();
      },

      async run() {
        if (!this.gh || !this.repo) { this.error = 'No repo selected.'; return; }
        if (!this.base || !this.head) { this.error = 'Need base and head.'; return; }
        if (this.base === this.head) { this.error = 'Base and head are the same.'; return; }
        this.loading = true;
        this.error = '';
        this.data = null;
        try {
          this.data = await this.gh.compare(this.base, this.head);
        } catch (e) {
          this.error = 'Compare failed: ' + (e.message || e);
        }
        this.loading = false;
      },

      buildDump() {
        const d = this.data;
        const lines = [];
        lines.push('# Compare ' + this.base + '...' + this.head + ' (' + this.repo + ')');
        lines.push('status: ' + d.status + ', ahead_by: ' + (d.ahead_by || 0) + ', behind_by: ' + (d.behind_by || 0) + ', total_commits: ' + (d.total_commits || 0));
        lines.push('url: https://github.com/' + this.repo + '/compare/' + this.base + '...' + this.head);
        lines.push('');

        const filter = this.opts.pathFilter.trim().toLowerCase();
        const files = (d.files || []).filter(f => !filter || f.filename.toLowerCase().includes(filter));

        if (this.opts.includeCommits && (d.commits || []).length) {
          lines.push('## Commits (' + d.commits.length + ')');
          for (const c of d.commits) {
            const subj = (c.commit?.message || '').split('\n')[0];
            const author = c.commit?.author?.name || c.author?.login || '';
            lines.push('- ' + c.sha.slice(0, 7) + ' ' + subj + (author ? '  (' + author + ')' : ''));
          }
          lines.push('');
        }

        if (this.opts.includeFileList && files.length) {
          lines.push('## Files (' + files.length + (filter ? ', filtered by "' + filter + '"' : '') + ')');
          for (const f of files) {
            lines.push('- [' + (STATUS_TAG[f.status] || '?') + '] ' + f.filename + '  +' + (f.additions || 0) + '/-' + (f.deletions || 0));
          }
          lines.push('');
        }

        if (this.opts.includePatches && files.length) {
          lines.push('## Patches');
          const cap = Math.max(0, this.opts.maxPatchBytes | 0);
          for (const f of files) {
            lines.push('### [' + (STATUS_TAG[f.status] || '?') + '] ' + f.filename + '  +' + (f.additions || 0) + '/-' + (f.deletions || 0));
            const patch = f.patch || '';
            if (!patch) {
              lines.push('(no patch — likely binary or too large)');
            } else if (cap && patch.length > cap) {
              lines.push(patch.slice(0, cap));
              lines.push('... [truncated ' + (patch.length - cap) + ' bytes]');
            } else {
              lines.push(patch);
            }
            lines.push('');
          }
        }

        return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
      }
    };
  });
});
