// alpineComponents/file-review.js — the per-file review dossier: one file at a
// ref, its diff against a base, and its outbound links, in a collapsible card.
// This is the caption row ([new]/[main]/[diff]) materialized as UI: the same
// three views, rendered instead of linked. pages/review.html mounts one per
// changed file; a future show-repo fold can mount it under the viewer or a
// review view the same way.
//
// Requires kits/cm6-merge.js (loaded by the host page; CM6 modules themselves
// lazy-load on the first diff render, so a card never opened costs nothing).
// Content is fetched via window.GH + gh-auth's token fallback, one contents
// call per side, only on first expand.
//
// Usage:
//   <div x-data="fileReview({ repo, ref, base, baseName, path, prevPath,
//                             status, additions, deletions, patch, open })"></div>
//
//   - repo/ref/path: the file's home ('owner/repo', branch/tag/sha, path)
//   - base:      ref to diff against (in a changeset, the merge-base sha, so
//                the diff shows the branch's own changes even after base moved)
//   - baseName:  display/link name for the base (e.g. 'main'); defaults to base
//   - prevPath:  pre-rename path on the base side (GitHub compare's
//                previous_filename), fetched for renamed files
//   - status/additions/deletions/patch: pass through from the compare API when
//                the host ran one; all optional (status is derived from the
//                two fetches when absent)
//   - open:      start expanded (single-file mode)
//
// Tabs: Diff (CM6 split/unified, word-level highlights, unchanged stretches
// folded), Patch (the API's unified patch text, when provided), New / Base
// (raw content). The split/unified choice persists in
// localStorage.reviewDiffView and defaults to unified on narrow screens.

document.addEventListener('alpine:init', function () {
  Alpine.data('fileReview', function (opts) {
    opts = opts || {};

    const STATUS_TAG = {
      added: 'A', modified: 'M', changed: 'M', removed: 'D',
      renamed: 'R', copied: 'C', unchanged: '·'
    };
    const STATUS_CLASS = {
      added: 'text-success', modified: 'text-warning', changed: 'text-warning',
      removed: 'text-error', renamed: 'text-info', copied: 'text-info',
      unchanged: 'text-base-content/40'
    };

    return {
      description: 'Per-file review dossier: content at a ref, CM6 diff vs a base, links',

      template: `
        <div class="border border-base-300 rounded-lg bg-base-100 overflow-hidden">
          <button @click="toggle()" class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-base-200/60 cursor-pointer">
            <i class="ph shrink-0" :class="open ? 'ph-caret-down' : 'ph-caret-right'"></i>
            <span class="font-mono w-4 text-center text-sm shrink-0" :class="statusClass" x-text="statusTag"></span>
            <span class="font-mono text-sm truncate flex-1" x-text="path" :title="path"></span>
            <span class="font-mono text-[10px] opacity-60 shrink-0" x-show="additions != null">
              +<span x-text="additions || 0"></span>/-<span x-text="deletions || 0"></span>
            </span>
          </button>

          <div x-show="open" x-collapse>
            <div class="border-t border-base-200 px-3 py-2 flex flex-col gap-2">

              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <a :href="newUrl" target="_blank" class="link link-hover text-primary inline-flex items-center gap-1"
                   x-show="status !== 'removed'"><i class="ph ph-file"></i>new</a>
                <a :href="baseUrl" target="_blank" class="link link-hover text-primary inline-flex items-center gap-1"
                   x-show="status !== 'added'"><i class="ph ph-git-branch"></i><span x-text="baseName"></span></a>
                <a x-show="lastCommit" :href="lastCommitUrl" target="_blank"
                   class="link link-hover text-primary inline-flex items-center gap-1">
                  <i class="ph ph-git-commit"></i><span class="font-mono" x-text="(lastCommit||'').slice(0,7)"></span></a>
                <a :href="rawUrl" target="_blank" class="link link-hover text-primary inline-flex items-center gap-1"
                   x-show="status !== 'removed'"><i class="ph ph-file-text"></i>raw</a>
                <a x-show="tossUrl" :href="tossUrl" target="_blank"
                   class="link link-hover text-primary inline-flex items-center gap-1">
                  <i class="ph ph-disc"></i>toss</a>
                <span class="grow"></span>
                <button x-show="newText !== null" @click="$clip(newText)"
                        class="btn btn-ghost btn-xs gap-1"><i class="ph ph-copy"></i>content</button>
                <button x-show="patch" @click="$clip(patchDump)"
                        class="btn btn-ghost btn-xs gap-1"><i class="ph ph-copy"></i>patch</button>
              </div>

              <div x-show="loading" class="flex justify-center py-4">
                <span class="loading loading-spinner loading-md text-primary"></span>
              </div>
              <div x-show="error" class="alert alert-warning py-1 px-3 text-sm" x-text="error"></div>
              <div x-show="binary && !loading" class="text-sm opacity-60 italic">
                Binary or oversized content; the links above are the view.
              </div>

              <div x-show="!loading && !binary" class="flex items-center gap-2">
                <div class="tabs tabs-boxed tabs-xs bg-base-200 p-0.5">
                  <a class="tab tab-xs" :class="tab==='diff' && 'tab-active'" x-show="diffable" @click="setTab('diff')">Diff</a>
                  <a class="tab tab-xs" :class="tab==='patch' && 'tab-active'" x-show="patch" @click="setTab('patch')">Patch</a>
                  <a class="tab tab-xs" :class="tab==='new' && 'tab-active'" x-show="newText !== null" @click="setTab('new')">New</a>
                  <a class="tab tab-xs" :class="tab==='base' && 'tab-active'" x-show="baseText !== null" @click="setTab('base')">Base</a>
                </div>
                <div class="grow"></div>
                <div class="join" x-show="tab==='diff' && diffable">
                  <button class="btn btn-xs join-item" :class="view==='split' ? 'btn-active' : 'btn-ghost'"
                          @click="setView('split')"><i class="ph ph-columns"></i></button>
                  <button class="btn btn-xs join-item" :class="view==='unified' ? 'btn-active' : 'btn-ghost'"
                          @click="setView('unified')"><i class="ph ph-rows"></i></button>
                </div>
              </div>

              <div x-show="!loading && !binary && identical" class="text-sm opacity-60 italic">
                Content identical at both refs.
              </div>

              <div x-show="tab==='diff'" x-ref="cmhost"
                   class="review-cm border border-base-200 rounded max-h-[70vh] overflow-auto text-sm bg-base-100"></div>

              <pre x-show="tab==='patch'" class="border border-base-200 rounded max-h-[70vh] overflow-auto text-[11px] leading-snug font-mono p-2 m-0 whitespace-pre-wrap break-words"><template x-for="(l, i) in patchLines" :key="i"><span class="block px-1 rounded-sm" :class="l.cls" x-text="l.t"></span></template></pre>

              <pre x-show="tab==='new' || tab==='base'"
                   class="border border-base-200 rounded max-h-[70vh] overflow-auto text-[11px] leading-snug font-mono p-2 m-0 whitespace-pre-wrap break-words"
                   x-text="tab==='new' ? (newText ?? '') : (baseText ?? '')"></pre>

            </div>
          </div>
        </div>`,

      repo: opts.repo || '',
      ref: opts.ref || 'main',
      base: opts.base || 'main',
      baseName: opts.baseName || opts.base || 'main',
      path: opts.path || '',
      prevPath: opts.prevPath || '',
      status: opts.status || '',
      additions: opts.additions ?? null,
      deletions: opts.deletions ?? null,
      patch: opts.patch || '',

      open: !!opts.open,
      loaded: false,
      loading: false,
      error: '',
      binary: false,
      newText: null,
      baseText: null,
      lastCommit: '',
      tab: '',
      view: '',
      _cm: null,

      init() {
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        try { this.view = localStorage.getItem('reviewDiffView') || ''; } catch {}
        if (!this.view) this.view = (window.innerWidth < 768) ? 'unified' : 'split';
        if (this.open) this.$nextTick(() => this.load());
      },

      get statusTag() { return STATUS_TAG[this.status] || '·'; },
      get statusClass() { return STATUS_CLASS[this.status] || 'text-base-content/40'; },
      get newUrl() { return 'https://github.com/' + this.repo + '/blob/' + this.ref + '/' + this.path; },
      get baseUrl() { return 'https://github.com/' + this.repo + '/blob/' + this.baseName + '/' + (this.prevPath || this.path); },
      get rawUrl() { return 'https://raw.githubusercontent.com/' + this.repo + '/' + this.ref + '/' + this.path; },
      get lastCommitUrl() { return 'https://github.com/' + this.repo + '/commit/' + this.lastCommit; },
      get tossUrl() {
        if (!/\.html?$/i.test(this.path) || this.repo.split('/')[0] !== 'mehrlander') return '';
        return 'https://mehrlander.github.io/web-tools/pages/toss-render.html#gh=' + this.repo + '@' + this.ref + ':' + this.path;
      },
      get diffable() { return this.newText !== null && this.baseText !== null && this.newText !== this.baseText; },
      get identical() {
        return this.loaded && this.newText !== null && this.baseText !== null && this.newText === this.baseText;
      },
      get patchDump() {
        return '--- ' + (this.prevPath || this.path) + ' (' + this.baseName + ')\n'
          + '+++ ' + this.path + ' (' + this.ref + ')\n' + this.patch;
      },
      get patchLines() {
        return (this.patch || '').split('\n').map(t => ({
          t,
          cls: t.startsWith('+') ? 'bg-success/15 text-success-content'
             : t.startsWith('-') ? 'bg-error/15 text-error-content'
             : t.startsWith('@@') ? 'bg-info/15' : ''
        }));
      },

      toggle() {
        this.open = !this.open;
        if (this.open) this.load();
        else this._teardown();
      },

      _gh(ref) {
        // WITH the viewer's token: this shipped tokenless, which read private
        // repos as 404 ("Load failed" on every card of a private branch) and
        // spent the 60/hr anonymous limit on public ones. Reads only, and the
        // same gate as every other client here: no token, public repos only.
        return new window.GH({ token: window.TOKEN, repo: this.repo, ref });
      },

      async load() {
        if (this.loaded || this.loading) { if (this.loaded) this._render(); return; }
        // Say so when the address is not an address. A card handed something
        // other than 'owner/name' spends two contents calls on a URL that
        // cannot resolve, and a 404 there is indistinguishable from a file that
        // genuinely is not on that ref: the card silently drops to its Patch
        // tab. branch-brief.js shipped exactly that for a while (an Alpine
        // data-provider function where the repo should have been, see its
        // cardOpts note), and nothing on the page said a word.
        if (!/^[^/\s]+\/[^/\s]+$/.test(String(this.repo || ''))) {
          this.error = 'No repo for this card (got: ' + String(this.repo).slice(0, 40) + ')';
          return;
        }
        this.loading = true;
        this.error = '';
        const wantNew = this.status !== 'removed';
        const wantBase = this.status !== 'added';
        const grab = async (ref, path) => {
          try { return (await this._gh(ref).get(path)).text; }
          catch (e) { return (e.status === 404) ? null : Promise.reject(e); }
        };
        try {
          const [n, b] = await Promise.all([
            wantNew ? grab(this.ref, this.path) : null,
            wantBase ? grab(this.base, this.prevPath || this.path) : null,
          ]);
          this.newText = n;
          this.baseText = b;
          // Contents API base64 that decodes with NULs is binary; skip diffing.
          this.binary = [n, b].some(t => typeof t === 'string' && t.includes('\u0000'));
          if (!this.status) {
            this.status = (n !== null && b === null) ? 'added'
              : (n === null && b !== null) ? 'removed'
              : (n === b) ? 'unchanged' : 'modified';
          }
          this.loaded = true;
          this.tab = this.diffable ? 'diff' : this.patch ? 'patch'
            : this.newText !== null ? 'new' : this.baseText !== null ? 'base' : '';
          this._render();
          this._fetchLastCommit();
        } catch (e) {
          this.error = 'Load failed: ' + (e.message || e);
        }
        this.loading = false;
      },

      async _fetchLastCommit() {
        if (this.lastCommit || this.status === 'removed') return;
        try {
          const c = await this._gh(this.ref).req(
            'commits?path=' + encodeURIComponent(this.path)
            + '&sha=' + encodeURIComponent(this.ref) + '&per_page=1');
          this.lastCommit = c?.[0]?.sha || '';
        } catch { /* the link row just stays without it */ }
      },

      setTab(t) { this.tab = t; if (t === 'diff') this._render(); },
      setView(v) {
        this.view = v;
        try { localStorage.setItem('reviewDiffView', v); } catch {}
        this._render();
      },

      async _render() {
        if (this.tab !== 'diff' || !this.diffable) return;
        const host = this.$refs.cmhost;
        if (!host || !window.cm6Merge) return;
        this._teardown();
        const mine = this._renderSeq = (this._renderSeq || 0) + 1;
        const language = cm6Merge.langFor(this.path);
        try {
          const h = this.view === 'unified'
            ? await cm6Merge.unified(host, { original: this.baseText, doc: this.newText, language })
            : await cm6Merge.split(host, { a: this.baseText, b: this.newText, language });
          // A tab/view flip while CM6 modules were loading supersedes this render.
          if (mine !== this._renderSeq) { h.destroy(); return; }
          this._cm = h;
        } catch (e) {
          // CM6 modules come from esm.sh; a blocked or flaky CDN must not kill
          // the card — the Patch / New / Base tabs stay usable.
          if (mine === this._renderSeq && this.$refs.cmhost) {
            this.$refs.cmhost.innerHTML =
              '<div class="p-3 text-sm opacity-60 italic">Diff view unavailable ('
              + ((e && e.message) || e) + '). Use the Patch, New, or Base tab.</div>';
          }
        }
      },

      _teardown() {
        if (this._cm) { this._cm.destroy(); this._cm = null; }
        if (this.$refs.cmhost) this.$refs.cmhost.innerHTML = '';
      },

      destroy() { this._teardown(); }
    };
  });
});
