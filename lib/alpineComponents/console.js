// alpineComponents/console.js — debugConsole: a rich console renderer.
//
// Consumer of kits/console.js: subscribes to console.history + new entries
// and renders them. Plain text rows by default; on expand, an object entry
// mounts a vanilla-jsoneditor tree (Tree/Text toggle) and a console.table
// entry mounts a Tabulator grid. Both heavy deps load lazily — only when a
// user actually expands an entry — since this panel is injected into the
// FAB on arbitrary pages.
//
// When kits/console.js isn't loaded (older boot, mid-chain failure) it falls
// back to the raw window.__consoleLogs array + the 'consolelog' event that
// gh-api.js fires — text-only, since no structured args are available there.
//
// Light DOM, no shadow root: the DaisyUI/Tailwind classes and the editor
// CSS need the host document's global stylesheet to reach this markup.
//
// Registers whether or not Alpine has started yet, so it works both when a
// page gh.loads it before alpine-bundle.js (the usual order) and when the
// FAB self-loads it after Alpine is already running.

(function () {
  const register = function () {
    if (window.__debugConsoleRegistered) return;
    window.__debugConsoleRegistered = true;

    Alpine.data('debugConsole', function () {
      return {
        description: 'Rich console renderer: text rows with expandable JSON-tree (objects) and Tabulator (console.table) views, fed by kits/console.js with a raw __consoleLogs fallback',

        template: `
          <div class="flex flex-col min-h-0 h-full bg-base-100">
            <div class="shrink-0 flex items-center gap-1 px-1.5 py-1 border-b border-base-300/60">
              <select x-model="filterLevel" class="select select-xs select-bordered font-mono text-[10px] h-6 min-h-0 px-1">
                <option value="">all</option>
                <option value="log">log</option>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
                <option value="debug">debug</option>
                <option value="table">table</option>
              </select>
              <input x-model="search" placeholder="filter…" class="input input-xs input-bordered flex-1 font-mono text-[10px] h-6 min-h-0 px-1.5">
              <button @click="copyAll()" class="btn btn-ghost btn-xs btn-square" :title="copied ? 'Copied' : 'Copy all'" aria-label="Copy">
                <i class="ph" :class="copied ? 'ph-check text-success' : 'ph-copy'"></i>
              </button>
              <button @click="clear()" class="btn btn-ghost btn-xs btn-square" title="Clear" aria-label="Clear">
                <i class="ph ph-trash"></i>
              </button>
            </div>

            <div x-show="truncated" class="shrink-0 px-2 py-0.5 text-[10px] italic text-base-content/40 border-b border-base-300/40"
                 x-text="'… ' + truncated + ' earlier entr' + (truncated === 1 ? 'y' : 'ies') + ' dropped'"></div>

            <div x-ref="scroll" class="flex-1 min-h-0 overflow-y-auto p-1 flex flex-col gap-0.5">
              <div x-show="!filtered.length" class="text-sm text-base-content/50 italic px-3 py-6 text-center">
                <span x-show="!entries.length">No console output captured.</span>
                <span x-show="entries.length">No entries match the filter.</span>
              </div>
              <template x-for="e in filtered" :key="e._id">
                <div class="rounded border-l-2 font-mono text-[11px] overflow-hidden"
                     :class="rowClass(e)">
                  <div class="flex gap-1.5 items-baseline px-1.5 py-0.5"
                       :class="canExpand(e) ? 'cursor-pointer hover:bg-base-content/5' : ''"
                       @click="canExpand(e) && toggle(e)">
                    <span class="text-base-content/30 shrink-0 text-[10px]" x-text="fmtTime(e.time)"></span>
                    <span class="shrink-0 w-8 text-[10px] uppercase font-bold"
                          :class="e.level === 'error' ? 'text-error' : e.level === 'warn' ? 'text-warning' : 'text-base-content/40'"
                          x-text="e.level"></span>
                    <i x-show="canExpand(e)" class="ph shrink-0 text-[10px] opacity-50 self-center"
                       :class="e._open ? 'ph-caret-down' : 'ph-caret-right'"></i>
                    <span class="break-all whitespace-pre-wrap flex-1" x-text="preview(e)"></span>
                  </div>
                  <div x-show="e._open" :id="bodyId(e)" class="px-1.5 pb-1.5 pt-0.5"></div>
                </div>
              </template>
            </div>
          </div>`,

        entries: [],
        filterLevel: '',
        search: '',
        copied: false,
        truncated: 0,

        init() {
          this.$el.innerHTML = this.template;
          this._seq = 0;
          this._editors = new Map();
          this._cap = (window.consoleKit && window.consoleKit.cap) || 1000;
          this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });

          if (window.consoleKit) {
            this.truncated = window.consoleKit.truncated;
            this._off = console.subscribe(e => this._onEntry(e));
          } else {
            (window.__consoleLogs || []).forEach(e => this._onEntry(e));
            this._listener = e => this._onEntry(e.detail);
            window.addEventListener('consolelog', this._listener);
          }
        },

        destroy() {
          if (this._off) this._off();
          if (this._listener) window.removeEventListener('consolelog', this._listener);
          this._editors.forEach(ed => { try { ed.destroy && ed.destroy(); } catch (e) {} });
          this._editors.clear();
        },

        _onEntry(e) {
          if (e && e.clear) { this.entries = []; this.truncated = 0; this._editors.clear(); return; }
          const item = { ...e, _id: ++this._seq, _open: false };
          this.entries.push(item);
          if (this.entries.length > this._cap) { this.entries.shift(); this.truncated++; }
          this._maybeScroll();
        },

        get filtered() {
          const lvl = this.filterLevel;
          const q = this.search.trim().toLowerCase();
          return this.entries.filter(e =>
            (!lvl || e.level === lvl) &&
            (!q || (e.msg || '').toLowerCase().includes(q)));
        },

        get errorCount() { return this.entries.filter(e => e.level === 'error').length; },

        entryKind(e) {
          if (e.kind === 'table') return 'table';
          const a = e.args;
          if (Array.isArray(a) && a.length === 1 && a[0] !== null && typeof a[0] === 'object') return 'object';
          return 'text';
        },

        canExpand(e) { return this.entryKind(e) !== 'text'; },

        rowClass(e) {
          // Keep the message body at text-base-content for legibility across
          // both light and dark themes; the left border + faint tint carry the
          // level, and the level label (below) gets the semantic color. Tinting
          // the body text itself (e.g. text-warning) washed out on light themes.
          return e.level === 'error' ? 'border-error bg-error/10'
               : e.level === 'warn' ? 'border-warning bg-warning/10'
               : e.level === 'table' ? 'border-secondary bg-secondary/5'
               : 'border-base-300 bg-base-100';
        },

        preview(e) {
          const kind = this.entryKind(e);
          if (kind === 'object') return Array.isArray(e.args[0]) ? 'Array(' + e.args[0].length + ')' : (e.msg || '{…}');
          if (kind === 'table') return 'console.table — ' + (e.msg || '').slice(0, 80);
          return e.msg || '';
        },

        bodyId(e) { return '__dbgc-body-' + e._id; },
        fmtTime(ts) { return new Date(ts).toTimeString().slice(0, 8); },

        toggle(e) {
          e._open = !e._open;
          if (e._open && !this._editors.has(e._id)) {
            this.$nextTick(() => this._mount(e));
          }
        },

        async _mount(e) {
          const host = document.getElementById(this.bodyId(e));
          if (!host || this._editors.has(e._id)) return;
          const kind = this.entryKind(e);
          try {
            if (kind === 'object') await this._mountTree(host, e);
            else if (kind === 'table') await this._mountTable(host, e);
          } catch (err) {
            host.innerHTML = '<span class="text-[10px] text-error">render failed: ' +
              ((err && err.message) || String(err)) + '</span>';
          }
        },

        async _mountTree(host, e) {
          const { createJSONEditor } = await import('https://cdn.jsdelivr.net/npm/vanilla-jsoneditor/standalone.js');
          host.innerHTML = '';
          const toggle = document.createElement('div');
          toggle.className = 'join mb-1';
          toggle.innerHTML =
            '<button data-mode="tree" class="btn btn-xs join-item btn-active">Tree</button>' +
            '<button data-mode="text" class="btn btn-xs join-item">Text</button>';
          const target = document.createElement('div');
          target.className = 'max-h-80 overflow-auto';
          host.append(toggle, target);

          const editor = createJSONEditor({
            target,
            props: { content: { json: e.args[0] }, mode: 'tree', readOnly: true, mainMenuBar: false, navigationBar: false, statusBar: false }
          });
          this._editors.set(e._id, editor);

          const btns = toggle.querySelectorAll('button[data-mode]');
          btns.forEach(b => b.addEventListener('click', () => {
            btns.forEach(x => x.classList.remove('btn-active'));
            b.classList.add('btn-active');
            editor.updateProps({ mode: b.dataset.mode });
          }));
        },

        async _mountTable(host, e) {
          const cssId = '__dbgc-tabulator-css';
          if (!document.getElementById(cssId)) {
            const l = document.createElement('link');
            l.id = cssId; l.rel = 'stylesheet';
            l.href = 'https://cdn.jsdelivr.net/npm/tabulator-tables@6/dist/css/tabulator_simple.min.css';
            document.head.appendChild(l);
          }
          const mod = await import('https://cdn.jsdelivr.net/npm/tabulator-tables@6/+esm');
          const Tabulator = mod.TabulatorFull || mod.Tabulator || mod.default;
          const { data, columns } = e.table || { data: e.args[0] };

          const rows = Array.isArray(data)
            ? data
            : Object.entries(data || {}).map(([k, v]) =>
                (v !== null && typeof v === 'object') ? { '(index)': k, ...v } : { '(index)': k, value: v });

          let cols = [];
          if (rows.length) {
            const keys = columns || [...new Set(rows.flatMap(r => Object.keys(r)))];
            cols = keys.map(k => ({ title: k, field: k }));
          }

          host.innerHTML = '';
          const target = document.createElement('div');
          target.className = 'text-xs';
          host.append(target);
          this._editors.set(e._id, new Tabulator(target, { data: rows, columns: cols, layout: 'fitDataFill', maxHeight: '300px' }));
        },

        clear() {
          if (window.consoleKit) console.clear();
          else { this.entries = []; this.truncated = 0; this._editors.clear(); }
        },

        async copyAll() {
          const text = this.filtered.map(e => '[' + this.fmtTime(e.time) + '] ' + e.level.toUpperCase() + ': ' + (e.msg || '')).join('\n');
          try {
            await navigator.clipboard.writeText(text);
            this.copied = true;
            setTimeout(() => { this.copied = false; }, 1500);
          } catch (err) {}
        },

        _maybeScroll() {
          const s = this.$refs.scroll;
          if (!s) return;
          const atBottom = s.scrollHeight - s.scrollTop - s.clientHeight < 40;
          if (atBottom) this.$nextTick(() => { s.scrollTop = s.scrollHeight; });
        }
      };
    });
  };

  if (window.Alpine && window.Alpine.data) register();
  else document.addEventListener('alpine:init', register);
})();
