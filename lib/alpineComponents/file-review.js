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
        <div class="bg-base-100 border-b border-base-200 last:border-b-0">
          <!-- The collapsed row. A changed-file list is read by SCANNING, so
               everything here is chosen for what it gives a scanning eye per
               pixel of height, and everything that costs a fetch waits.

               The path splits: the directory dims and the filename does not,
               because a list of thirty rows in one uniform mono weight is a
               wall, and the filename is what the eye is looking for. A long
               directory elides from the LEFT, where the repeated part lives
               (in dirPart, not in CSS; see the note there).

               The bar is five blocks of add/remove proportion, which answers
               "how big is this change" without reading the numbers, and the
               numbers stay for when the answer matters exactly.

               One action icon, not a cluster: it routes by file type through
               kits/guide-render.js, the same table that decides where a guide's
               links point, so a page opens rendered and a doc opens read. The
               other four links (base, raw, commit, the copies) stay behind the
               expand, where there is room to label them. -->
          <div class="flex items-center gap-1.5 px-2 py-1 hover:bg-base-200/50">
            <button @click="toggle()" class="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer">
              <i class="ph text-xs opacity-40 shrink-0" :class="open ? 'ph-caret-down' : 'ph-caret-right'"></i>
              <span class="font-mono text-xs w-3 text-center shrink-0 font-semibold"
                    :class="statusClass" :title="status" x-text="statusTag"></span>
              <span class="font-mono text-sm min-w-0 flex items-baseline" :title="path">
                <span x-show="dirPart" class="opacity-40 truncate shrink" x-text="dirPart"></span>
                <span class="shrink-0" x-text="namePart"></span>
              </span>
            </button>
            <span class="shrink-0 flex items-center gap-1.5" x-show="additions != null">
              <span class="font-mono text-[10px] tabular-nums">
                <span class="text-success" x-text="'+' + (additions || 0)"></span>
                <span class="text-error ml-0.5" x-text="'-' + (deletions || 0)"></span>
              </span>
              <span class="hidden sm:flex gap-px" :title="(additions||0) + ' added, ' + (deletions||0) + ' removed'">
                <template x-for="c in sizeBar" :key="c.i">
                  <span class="w-1.5 h-1.5 rounded-[1px]" :class="c.cls"></span>
                </template>
              </span>
            </span>
            <a x-show="quickView" :href="quickView && quickView.url" :title="quickView && quickView.title"
               target="_blank" rel="noopener"
               class="shrink-0 w-5 text-center text-base-content/25 hover:text-primary transition-colors">
              <i class="ph" :class="quickView && quickView.icon"></i></a>
          </div>

          <div x-show="open" x-collapse>
            <div class="border-t border-base-200 bg-base-200/20 px-3 py-2 flex flex-col gap-2">

              <!-- The exits, behind one github mark.
                   Five labelled links (new, main, the commit sha, raw, toss)
                   ran the width of a phone and read as the loudest thing in an
                   expanded row, which put GitHub ahead of the diff the row is
                   about. They are destinations you take once, so they collapse
                   into the menu idiom this app already uses for exactly this
                   (the FAB's github mark, the sidebar's repo rows): one mark,
                   the rows behind it, opened on tap. The copy actions stay in
                   the open, since they act HERE rather than sending you away. -->
              <div class="flex items-center gap-2 text-sm">
                <details class="dropdown" x-ref="ghMenu">
                  <summary class="btn btn-ghost btn-xs gap-1 cursor-pointer">
                    <i class="ph ph-github-logo text-base"></i>
                    <i class="ph ph-caret-down text-[10px] opacity-50"></i>
                  </summary>
                  <ul class="dropdown-content menu menu-sm z-20 mt-1 w-56 rounded-box border border-base-300 bg-base-100 p-1 shadow-lg">
                    <template x-for="l in ghLinks" :key="l.label">
                      <li><a :href="l.url" target="_blank" rel="noopener" @click="$refs.ghMenu.open = false"
                             class="gap-2 flex-nowrap">
                        <i class="ph shrink-0" :class="l.icon"></i>
                        <span class="shrink-0" x-text="l.label"></span>
                        <span class="grow"></span>
                        <!-- shrink-0, not truncate: only short values reach
                             here now (see ghLinks), and a shrinkable box beside
                             a grow spacer collapses to an ellipsis even when
                             the text is four characters. -->
                        <span class="font-mono text-xs opacity-40 shrink-0" x-text="l.hint"></span></a></li>
                    </template>
                  </ul>
                </details>
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
                <div role="tablist" class="tabs tabs-box tabs-xs bg-base-200 p-0.5">
                  <!-- Offered before the content is in hand, since until the
                       fetch runs there is no way to know whether a file is
                       diffable, and hiding the tab that triggers the fetch
                       would leave the card with no way to reach it. -->
                  <a role="tab" class="tab" :class="tab==='diff' && 'tab-active'" x-show="diffable || !loaded" @click="setTab('diff')">Diff</a>
                  <a role="tab" class="tab" :class="tab==='patch' && 'tab-active'" x-show="patch" @click="setTab('patch')">Patch</a>
                  <a role="tab" class="tab" :class="tab==='new' && 'tab-active'" x-show="newText !== null || !loaded" @click="setTab('new')">New</a>
                  <a role="tab" class="tab" :class="tab==='base' && 'tab-active'" x-show="baseText !== null || !loaded" @click="setTab('base')">Base</a>
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
        // A card that starts open takes the same deal as one opened by tap: the
        // patch it was handed is shown, and the fetch waits for a tab that
        // needs the bytes. The branch page opens every card on a modest branch,
        // so this is the difference between mounting a twelve-file branch for
        // free and spending twenty-four contents calls before anyone has looked
        // at anything.
        if (this.open) {
          if (this.patch) this.tab = 'patch';
          else this.$nextTick(() => this.load());
        }
      },

      // The path, split so the row reads: the directory dims, the filename does
      // not, and a long directory is elided from the LEFT, where the repeated
      // part lives.
      //
      // Elided here rather than by CSS. The obvious trick is `direction: rtl`
      // on the directory span, which makes `text-overflow: ellipsis` eat the
      // left end; it also hands the string to the bidi algorithm, which moves
      // punctuation at the edges. Measured 2026-08-06: `.claude/skills/caption/`
      // rendered as `/claude/skills/caption.`, a path that does not exist,
      // shown as though it did. A wrong path is worse than a long one.
      get dirPart() {
        const i = this.path.lastIndexOf('/');
        if (i < 0) return '';
        const dir = this.path.slice(0, i + 1);
        return dir.length > 30 ? '…' + dir.slice(-29) : dir;
      },
      get namePart() { return this.path.slice(this.path.lastIndexOf('/') + 1); },

      // Five blocks of add/remove proportion, GitHub's idiom: the shape of a
      // change is legible before the numbers are read. Additions round up so a
      // one-line change is never an empty bar, which would read as "no change"
      // on the row it is describing.
      get sizeBar() {
        const a = this.additions || 0, d = this.deletions || 0, t = a + d;
        // Each side keeps a block when it has any lines at all, which is why
        // the majority side is capped at four rather than rounded: +200/-1
        // rounds the deletion away entirely, and a bar with no red on a row
        // whose numbers say -1 contradicts the numbers beside it.
        const green = t ? Math.min(d ? 4 : 5, Math.max(a ? 1 : 0, Math.round(a / t * 5))) : 0;
        const red = t ? Math.min(5 - green, Math.max(d ? 1 : 0, Math.round(d / t * 5))) : 0;
        return Array.from({ length: 5 }, (_, i) => ({
          i,
          cls: i < green ? 'bg-success' : i < green + red ? 'bg-error' : 'bg-base-300',
        }));
      },

      // The one collapsed-row action, routed by file type through the guide
      // renderer's table: a page opens rendered, a doc or data file opens read,
      // anything else opens its source. One table decides where a file opens,
      // here and in a guide's links, so the two cannot come to disagree.
      get quickView() {
        const t = window.GuideRender?.renderTarget(this.repo, this.ref, this.path);
        if (t) return t;
        if (this.status === 'removed') return null;
        return { url: this.newUrl, icon: 'ph-file-code', title: 'Open ' + this.path + ' on GitHub' };
      },

      // The menu's rows, in the order a reader wants them: this version, the
      // one it is diffed against, the commit that made it, the bytes, and the
      // rendered page where there is one. Each is a pure getter, so the menu
      // costs nothing until it is opened, and the commit row simply stays away
      // until its own lookup lands.
      get ghLinks() {
        // The hint is for values that fit: a base name, a short sha. The head
        // ref is not one of them (a claude/<slug> truncated into a menu column
        // reads "clau…", which tells nobody anything), and it is named in full
        // two rows above, so the row carries no hint at all.
        const out = [];
        if (this.status !== 'removed') {
          out.push({ label: 'This version', hint: '', url: this.newUrl, icon: 'ph-file' });
        }
        if (this.status !== 'added') {
          out.push({ label: 'Base version', hint: this.baseName, url: this.baseUrl, icon: 'ph-git-branch' });
        }
        if (this.lastCommit) {
          out.push({ label: 'Last commit', hint: this.lastCommit.slice(0, 7), url: this.lastCommitUrl, icon: 'ph-git-commit' });
        }
        if (this.status !== 'removed') {
          out.push({ label: 'Raw', hint: '', url: this.rawUrl, icon: 'ph-file-text' });
        }
        if (this.tossUrl) out.push({ label: 'Render', hint: 'toss', url: this.tossUrl, icon: 'ph-disc' });
        return out;
      },

      get statusTag() { return STATUS_TAG[this.status] || '·'; },
      get statusClass() { return STATUS_CLASS[this.status] || 'text-base-content/40'; },
      get sizeBarTitle() { return (this.additions || 0) + ' added, ' + (this.deletions || 0) + ' removed'; },
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

      // Opening costs nothing when the host already handed over a patch.
      //
      // The compare API returns the patch text WITH the file list, so a card
      // mounted from a compare is holding the unified diff before anyone taps
      // it. `toggle()` used to call `load()` regardless, which put a spinner
      // and two contents calls in front of content already in memory: thirty
      // cards opened meant sixty calls to show what thirty already had. Content
      // is fetched when a tab that genuinely needs it is chosen, which is what
      // setTab does below.
      toggle() {
        this.open = !this.open;
        if (!this.open) { this._teardown(); return; }
        if (this.loaded || this.loading) { this._render(); return; }
        if (this.patch) { this.tab = 'patch'; return; }
        this.load();
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
          // A tab the reader chose survives the fetch it triggered. Without
          // this, tapping New loaded the file and then snapped the card to
          // Diff, so the one control that says what you want to see was the
          // one thing the load ignored.
          if (!this._picked || !this._tabUsable(this.tab)) {
            this.tab = this.diffable ? 'diff' : this.patch ? 'patch'
              : this.newText !== null ? 'new' : this.baseText !== null ? 'base' : '';
          }
          this._render();
          this._fetchLastCommit();
        } catch (e) {
          this.error = 'Load failed: ' + (e.message || e);
        }
        this.loading = false;
      },

      // Whether a tab can actually show something, once the content is known.
      _tabUsable(t) {
        return t === 'patch' ? !!this.patch
             : t === 'diff' ? this.diffable
             : t === 'new' ? this.newText !== null
             : t === 'base' ? this.baseText !== null : false;
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

      // Diff, New and Base are the three that need the file's bytes, so they
      // are where the fetch happens; Patch never does.
      setTab(t) {
        this.tab = t;
        this._picked = true;
        if (t !== 'patch' && !this.loaded && !this.loading) { this.load(); return; }
        if (t === 'diff') this._render();
      },
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
