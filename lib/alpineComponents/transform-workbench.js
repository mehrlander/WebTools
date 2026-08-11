// transform-workbench.js — the generic multi-tab `rows => rows` transform
// workbench, extracted from the budget-drs app's Load tab (its third
// generation; pages/table-compress*.html were the first two). One file
// carries the whole tool: the Alpine component (state + behavior), its
// markup (TransformWorkbench.panelHTML()), the worker that runs the
// transforms, and the trimmed output viewer (raw / Tabulator table / JSON
// tree). Hosts:
//
//   - pages/transform.html mounts it standalone (paste/drop intake, a
//     localStorage function cache via { persist: true }).
//   - the budget-drs app (mehrlander/home, app/view/views/transform.js)
//     wraps it with its own loading: a catalogue picker, committed recipe
//     seeding, and intake panes, passed through the opts below.
//
// The host contract, all optional:
//   transformWorkbench({
//     recipes: [{ name, label?, fnSrc, scope? }],  // scope "universal" = the identity default
//     onIngest: (rows) => {},   // fires after every ingest and clear ([] on clear)
//     persist: true,            // cache tab names + sources in localStorage
//     storageKey: "...",        // localStorage key when persist is on
//   })
//   panelHTML(dataExpr) embeds dataExpr verbatim inside x-data="transformWorkbench(...)",
//   so it must use single quotes only. The mounted component publishes itself as
//   el.__workbench on its root (querySelector(".tf-root").__workbench), the
//   element-back-pointer idiom from docs/loader.md.
//
// Dependencies: Alpine + PapaParse as globals (page-loaded; Papa parses
// pastes and builds the on-demand CSV export, and the worker itself is
// dependency-free); ClipboardJS optional (the fn-source copy button is
// inert without it; the result copy uses the async clipboard API);
// Tabulator optional (the table mode needs it, the app shell ships it, the
// standalone page loads it); vanilla-jsoneditor lazy-imported on first
// Tree view.
//
// Large batches are the sizing case: runs materialize rows only (every
// derived form is lazy: CSV and bundle gzips on demand, viewer previews
// capped, rows handed to Table/Tree by reference), and an append does not
// re-run the pipeline.
//
// Two portability invariants, both load-bearing for the budget-drs embed:
// no literal closing-script-tag sequence anywhere in this file (the app's
// render-time fold inlines scripts verbatim; the worker therefore rides as
// a stringified function, never an inline worker script block), and no
// claim on the Alpine component name `app()` (host shells own it). Plain
// script, no import/export at top level, so it loads via <script src>,
// gh.load, and the dist pre-build alike.
(() => {

  // ---- the output viewer: raw text, Tabulator table, JSON tree ----
  const TF_VIEW_REGISTRY = {
    _loaded: new Set(),
    loadAsset(url) {
      if (this._loaded.has(url)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const isCSS = url.includes(".css");
        const elx = document.createElement(isCSS ? "link" : "script");
        if (isCSS) Object.assign(elx, { rel: "stylesheet", href: url });
        else Object.assign(elx, { src: url, async: true });
        elx.onload = () => { this._loaded.add(url); resolve(); };
        elx.onerror = () => reject(new Error("Load failed: " + url));
        document.head.appendChild(elx);
      });
    },
    esc: (s) => new Option(String(s ?? "")).innerHTML,
    modules: [
      {
        id: "raw", label: "Raw", icon: "ph-text-t",
        test: () => true,
        render: (f) => '<pre class="m-0 p-4 h-full overflow-auto text-xs leading-5 font-mono whitespace-pre-wrap text-base-content">' + TF_VIEW_REGISTRY.esc(f.content) + "</pre>",
      },
      {
        id: "table", label: "Table", icon: "ph-table",
        test: (f) => f.ext === "json" && f.content.trim().startsWith("["),
        render: () => '<div class="flex flex-col h-full w-full">'
          + '<div class="flex items-center gap-4 px-3 py-1.5 border-b border-base-300 bg-base-200/50 text-xs shrink-0">'
          + '<label class="flex items-center gap-1.5 cursor-pointer">'
          + '<input type="checkbox" id="tf-tab-header-filters" class="checkbox checkbox-xs" checked>'
          + "<span>Header filters</span></label>"
          + '<span id="tf-tab-note" class="text-[10px] opacity-60"></span></div>'
          + '<div id="tf-tab-target" class="flex-1 min-h-0"></div></div>',
        // The grid is a window, not the dataset: Tabulator builds an internal
        // model per row it is handed, so past the cap that model alone can
        // exhaust memory. Copy and download carry all rows regardless.
        _cap: 20000,
        _windowed(ref) {
          const CAP = TF_VIEW_REGISTRY.modules.find(m => m.id === "table")._cap;
          const note = document.getElementById("tf-tab-note");
          if (note) note.textContent = ref.length > CAP
            ? "showing the first " + CAP.toLocaleString() + " of " + ref.length.toLocaleString() + " rows (filters see the shown window; copy and download carry all)"
            : "";
          return ref.length > CAP ? ref.slice(0, CAP) : ref;
        },
        // In-place refresh for a same-column data change (a scope or tab
        // switch over the same shape): keep the instance, swap the rows,
        // preserve filters and scroll. Returns false to request a rebuild.
        update: () => {
          const self = TF_VIEW_REGISTRY.modules.find(m => m.id === "table");
          const target = document.getElementById("tf-tab-target");
          const ref = document.getElementById("tf-workbench")?.__viewerData;
          if (!target || !target.__tbl || !Array.isArray(ref)) return false;
          const data = self._windowed(ref);
          const sig = JSON.stringify(Object.keys(data[0] || {}));
          if (sig !== target.__cols) return false;
          target.__tbl.replaceData(data);
          return true;
        },
        after: (f) => {
          requestAnimationFrame(() => {
            const self = TF_VIEW_REGISTRY.modules.find(m => m.id === "table");
            const target = document.getElementById("tf-tab-target");
            if (!target || typeof Tabulator === "undefined") return;
            try {
              const h = target.clientHeight || 500;
              const ref = document.getElementById("tf-workbench")?.__viewerData;
              const data = self._windowed(Array.isArray(ref) ? ref : JSON.parse(f.content));
              const tbl = new Tabulator(target, {
                data,
                autoColumns: true,
                autoColumnsDefinitions: (defs) => defs.map(d => ({ ...d, headerFilter: "input" })),
                layout: "fitData",
                height: h + "px",
              });
              target.__tbl = tbl;
              target.__cols = JSON.stringify(Object.keys(data[0] || {}));
              const hf = document.getElementById("tf-tab-header-filters");
              if (hf) hf.addEventListener("change", () => {
                target.querySelectorAll(".tabulator-header-filter").forEach(elx => {
                  elx.style.display = hf.checked ? "" : "none";
                });
                tbl.redraw(true);
              });
            } catch (e) {
              target.innerHTML = '<div class="p-4 text-error font-mono text-xs">Invalid JSON array for the table view</div>';
            }
          });
        },
      },
      {
        // Tree mode mounts vanilla-jsoneditor (lazy-imported) in editable tree mode.
        id: "tree", label: "Tree", icon: "ph-tree-view",
        test: (f) => f.ext === "json",
        render: () => '<div class="tf-jse-mount h-full w-full bg-base-100"></div>',
        after: (f) => {
          requestAnimationFrame(async () => {
            const target = document.querySelector(".tf-jse-mount");
            if (!target) return;
            try {
              TF_VIEW_REGISTRY._jseMod ??= await import("https://cdn.jsdelivr.net/npm/vanilla-jsoneditor/standalone.js");
            } catch (e) {
              target.innerHTML = '<pre class="p-4 text-error font-mono text-xs">Failed to load JSON editor: ' + TF_VIEW_REGISTRY.esc(e?.message || e) + "</pre>";
              return;
            }
            let parsed;
            const ref = document.getElementById("tf-workbench")?.__viewerData;
            if (ref != null) {
              // the tree is editable, so hand it a clone rather than the live rows
              try { parsed = structuredClone(ref); } catch (e) { parsed = ref; }
            } else {
              try { parsed = JSON.parse(f.content); }
              catch (e) {
                target.innerHTML = '<pre class="p-4 text-error font-mono text-xs">Invalid JSON: ' + TF_VIEW_REGISTRY.esc(e.message) + "</pre>";
                return;
              }
            }
            target.__jse = TF_VIEW_REGISTRY._jseMod.createJSONEditor({
              target, props: { content: { json: parsed }, mode: "tree" },
            });
          });
        },
      },
    ],
    getModes(file) { return this.modules.filter(m => m.test(file)); },
    async prepare(id) {
      const mod = this.modules.find(m => m.id === id);
      if (mod?.assets) await Promise.all(mod.assets.map(a => this.loadAsset(a)));
      return mod;
    },
  };

  // ---- the worker body: dependency-ordered execution of the transform tabs.
  // Written as a real function and stringified for the Blob, so its regexes
  // keep their backslashes and the file carries no closing-script-tag sequence.
  // Dependency-free by design: it returns rows only, and every derived form
  // (columnar obj, CSV, JSON text, gzip) is produced lazily on the main side,
  // so a run moves each output across the boundary once instead of four times.
  function tfWorker() {
    const refsOf = s => [...new Set([...s.matchAll(/\$([A-Za-z_]\w*)/g)].map(m => m[1]))];

    self.onmessage = e => {
      // The worker is where the bulk transiently lives: it receives the raw
      // batches once, stacks (and tags) them itself, streams each finished
      // tab back as its own message, and is terminated after the run, so
      // everything it held is reclaimed at once. It clones an input only
      // while another consumer still needs the pristine copy, and pools a
      // named output only while a later task actually references it.
      const { batches, tagCol, tasks, seed, seedAlias } = e.data;
      const stack = [];
      for (const b of batches) for (const r of b.rows) stack.push(tagCol ? { ...r, [tagCol]: b.name } : r);

      const refCount = {};
      for (const t of tasks) for (const n of refsOf(t.fnSrc)) refCount[n] = (refCount[n] || 0) + 1;
      const alias = new Set(seedAlias || []);       // names whose output IS the stack (skipped identity tabs)
      const pool = {};
      for (const n of Object.keys(seed || {})) if (refCount[n]) pool[n] = seed[n];
      for (const n of alias) if (refCount[n]) pool[n] = stack;
      const stackPooled = [...alias].some(n => refCount[n]);

      let inputReaders = tasks.length;
      let pending = tasks.slice(), moving = true;
      while (pending.length && moving) {
        moving = false;
        pending = pending.filter(t => {
          const deps = refsOf(t.fnSrc);
          if (!deps.every(n => n in pool)) return true;   // deps not ready, wait a pass
          try {
            self.postMessage({ progress: { i: t.i, name: t.name || "fn" } });
            inputReaders--;
            const input = (inputReaders > 0 || stackPooled) ? structuredClone(stack) : stack;
            const args = deps.map(n => {
              const more = --refCount[n] > 0;
              const v = (more || alias.has(n)) ? structuredClone(pool[n]) : pool[n];
              if (!more && !alias.has(n)) delete pool[n];
              return v;
            });
            const fn = new Function("rows", ...deps.map(n => "$" + n), "return (" + t.fnSrc + ")(rows)");
            const rows = fn(input, ...args);
            self.postMessage({ result: { i: t.i, rows, err: null } });
            if (t.name && refCount[t.name]) pool[t.name] = rows;
          } catch (err) { self.postMessage({ result: { i: t.i, err: err.message } }); }
          moving = true;
          return false;   // resolved, drop it
        });
      }
      pending.forEach(t => self.postMessage({ result: { i: t.i, err: "Unresolved $ref: " + refsOf(t.fnSrc).filter(n => !(n in pool)).join(", ") } }));
      self.postMessage({ done: true });
    };
  }
  const TF_WORKER_SRC = "(" + tfWorker.toString() + ")()";

  // ---- the components ----
  document.addEventListener("alpine:init", () => {
    if (typeof Alpine === "undefined" || !Alpine.data) return;

    // The output viewer, mounted by the workbench markup below. File, content,
    // and data live on the root ELEMENT, outside Alpine's reactivity: viewHtml
    // re-renders only when `mode` or the explicit `rev` counter moves, which is
    // what lets a same-shape data change update the mounted table in place
    // instead of repainting the pane.
    Alpine.data("tfViewer", function (opts) {
      opts = opts || {};
      return {
        template: '<div x-show="viewLoading" class="flex justify-center py-20">'
          + '<span class="loading loading-spinner loading-lg text-primary"></span></div>'
          + '<div x-show="!viewLoading" class="h-full"><div class="h-full" x-html="viewHtml"></div></div>',

        mode: "", viewLoading: false, rev: 0,
        defaultMode: opts.defaultMode || "raw",

        init() {
          this.$root.__viewer = this;
          this.$el.innerHTML = this.template;
          this.$nextTick(() => Alpine.initTree(this.$el));
        },
        get file() { return this.$root.__viewerFile || ""; },
        get ext() { return this.file ? this.file.split(".").pop().toLowerCase() : ""; },
        get fileContext() { return { name: this.file, ext: this.ext, content: this.$root.__viewerContent || "" }; },
        get availableModes() { return TF_VIEW_REGISTRY.getModes(this.fileContext); },
        get viewHtml() {
          this.rev;   // the explicit re-render dependency
          if (!this.file) return "";
          const mod = TF_VIEW_REGISTRY.modules.find(m => m.id === this.mode) || TF_VIEW_REGISTRY.modules[0];
          return mod.render(this.fileContext);
        },
        // `data` (optional) is the actual structured value the content string
        // previews: Table and Tree use it directly, so large datasets never
        // round-trip through a full serialization. When the viewer is already
        // showing a table and the new data has the same columns, the module's
        // update hook swaps rows in place: no spinner, no repaint, filters and
        // scroll preserved.
        async show(file, content, data, targetMode) {
          const root = this.$root;
          root.__viewerFile = file;
          root.__viewerContent = content ?? "";
          root.__viewerData = data ?? null;
          const modes = this.availableModes;
          const target = (targetMode && modes.some(m => m.id === targetMode)) ? targetMode
            : (modes.find(m => m.id === this.defaultMode) || modes.find(m => m.id === "raw") || modes[0]).id;
          if (target === "table" && this.mode === "table" && Array.isArray(data)) {
            const mod = TF_VIEW_REGISTRY.modules.find(m => m.id === "table");
            if (mod.update && mod.update(this.fileContext)) return;
          }
          await this.switchMode(target);
        },
        async switchMode(id) {
          this.viewLoading = true;
          const mod = await TF_VIEW_REGISTRY.prepare(id);
          this.mode = id;
          this.rev++;
          this.$nextTick(() => {
            if (mod.after) mod.after(this.fileContext);
            this.viewLoading = false;
          });
        },
      };
    });

    // The workbench itself.
    Alpine.data("transformWorkbench", function (opts) {
      opts = opts || {};
      const storageKey = opts.storageKey || "transform-workbench";
      const sizeOf = s => (s?.length / 1024).toFixed(1) + "k";
      const colFromRows = r => r.length ? Object.fromEntries(Object.keys(r[0]).map(k => [k, r.map(x => x[k] ?? null)])) : {};
      const rowsFromCol = c => {
        const ks = Object.keys(c), len = ks[0] ? c[ks[0]].length : 0;
        return Array.from({ length: len }, (_, i) => Object.fromEntries(ks.map(k => [k, c[k][i]])));
      };

      return {
        raw: [], active: 0, editing: -1, ran: false,
        bundle: "", bundleSz: "", bundleObj: {},
        preserveSrc: false, srcGz: {},
        loaded: "",
        // The input side is one or more named batches (datasets). combine on:
        // Run computes each fn against the whole stack (tagCol, when named,
        // adds each batch's name to its rows so dumps stay distinguishable);
        // combine off: Run computes each fn once per batch. Either way every
        // output lives in tab.outs keyed by SCOPE ("__all" for the combined
        // stack, else a batch name), and the inspection scope picker can open
        // any scope of any tab: one not computed by the last Run computes on
        // demand. The Combine switch therefore decides what Run targets and
        // what the bundle exports, never what may be looked at.
        datasets: [], combine: true, tagCol: "", scope: "__all", editingDs: -1, addOpen: false,
        curV: "csv", split: 50, drag: false, hot: false, collapsed: false,
        running: false, progress: "", progressBase: "",
        viewerKind: "rows",
        wrapF: true, copF: false, copR: false, copB: false,
        bndOpen: false,
        profileData: {},
        recipes: [],
        // The two inspection views; the bundle is not one of them (it is the
        // export artifact, operated from its own panel beside copy/download).
        views: [
          { k: "csv", l: "Data" },
          { k: "profile", l: "Profile" },
        ],
        tabs: [],

        init() {
          if (typeof ClipboardJS !== "undefined" && !window.TransformWorkbench._clip)
            window.TransformWorkbench._clip = new ClipboardJS(".tf-copy-btn");
          this.recipes = (opts.recipes || []).filter(r => r && r.fnSrc);
          this.tabs = [this.identityTab()];
          this.active = 0;
          if (opts.persist) this.restoreTabs();
          this.$root.__workbench = this;
        },

        // ---- the host entry point: rows from a picker, a fetch, anywhere ----
        // meta: { label, seed: [recipe names], collapse, append }. Loading is a
        // viewing gesture, so the editor collapses by default and identity
        // auto-runs; a paste is the intake gesture and keeps it open. append
        // adds the rows as a new batch instead of replacing the loaded data.
        async loadRows(rows, meta) {
          meta = meta || {};
          if (meta.append && this.datasets.length) this.addDataset(rows, meta.label);
          else this.ingest(rows, meta.label);
          this.loaded = meta.label || "";
          for (const nm of (meta.seed || [])) {
            if (this.tabs.some(t => t.name === nm)) continue;
            const r = this.recipes.find(x => x.name === nm);
            if (r) this.tabs.push(this.blankTab(r.name, r.fnSrc));
          }
          this.collapsed = meta.collapse !== false;
          if (this.raw.length) await this.run();
        },

        // ---- tabs ----
        blankTab(name = "", fnSrc = "rows => rows") {
          return { name, fnSrc, fnGz: "", err: null, ok: false, rows: [], dirty: false, fixed: false, outs: {} };
        },
        // The universal identity tab: the stable, always-present default. Reads
        // the host's universal-scope recipe; falls back to `rows => rows`.
        // Marked `fixed`, so remove() and clear() keep it.
        identityTab() {
          const id = this.recipes.find(r => r.scope === "universal");
          return Object.assign(this.blankTab(id ? id.name : "identity", id ? id.fnSrc : "rows => rows"), { fixed: true });
        },
        addableRecipes() { return this.recipes.filter(r => r.scope !== "universal" && !this.tabs.some(t => t.name === r.name)); },
        addRecipe(name) {
          if (!name) return;
          const existing = this.tabs.findIndex(t => t.name === name);
          if (existing >= 0) { this.active = existing; return; }
          const r = this.recipes.find(x => x.name === name);
          if (!r) return;
          this.tabs.push(this.blankTab(r.name, r.fnSrc));
          this.active = this.tabs.length - 1;
          this.saveTabs();
          if (this.ran) this.$nextTick(() => this.syncSurfaces());
        },
        add() {
          let n = this.tabs.length + 1;
          while (this.tabs.some(t => t.name === "fn" + n)) n++;
          this.tabs.push(this.blankTab("fn" + n));
          this.active = this.tabs.length - 1;
          this.saveTabs();
        },
        remove(i) {
          if (this.tabs.length < 2 || this.tabs[i].fixed) return;   // the last tab always stays
          this.tabs.splice(i, 1);
          if (i < this.active) this.active--;
          else if (this.active >= this.tabs.length) this.active = this.tabs.length - 1;
          this.saveTabs();
          this.invalidateBundle();
          if (this.ran) this.$nextTick(() => this.syncSurfaces());
        },
        setActive(i) {
          if (this.editing !== -1 || i === this.active) return;
          this.active = i;
          if (this.ran) this.$nextTick(() => this.syncSurfaces());
        },
        startEdit(i) { this.editing = i; },
        finishEdit() {
          if (this.editing === -1) return;
          this.editing = -1;
          this.saveTabs();
          this.invalidateBundle();
          if (this.ran) this.$nextTick(() => this.syncSurfaces());
        },

        // ---- the standalone function cache (opts.persist) ----
        // Only names and sources ride localStorage; data never does.
        saveTabs() {
          if (!opts.persist) return;
          try {
            localStorage.setItem(storageKey, JSON.stringify({ tabs: this.tabs.map(t => ({ name: t.name, fnSrc: t.fnSrc, fixed: !!t.fixed })) }));
          } catch (e) {}
        },
        restoreTabs() {
          try {
            const s = JSON.parse(localStorage.getItem(storageKey) || "null");
            if (s?.tabs?.length) {
              this.tabs = s.tabs.map(t => Object.assign(this.blankTab(t.name, t.fnSrc), { fixed: !!t.fixed }));
              this.active = 0;
            }
          } catch (e) {}
        },

        // ---- compression / source ----
        async zip(s) {
          const cs = new CompressionStream("gzip"), w = cs.writable.getWriter();
          w.write(new TextEncoder().encode(s)); w.close();
          const b = await new Response(cs.readable).blob();
          return new Promise(r => Object.assign(new FileReader(), { onload: e => r(e.target.result.split(",")[1]) }).readAsDataURL(b));
        },
        async unzip(b) {
          const ds = new DecompressionStream("gzip"), w = ds.writable.getWriter();
          w.write(Uint8Array.from(atob(b), c => c.charCodeAt(0))); w.close();
          return new Response(ds.readable).text();
        },
        async ensureSrcGz() {
          if (!this.preserveSrc) return;
          for (const d of this.datasets)
            if (d.rows.length && !this.srcGz[d.name]) this.srcGz[d.name] = await this.zip(JSON.stringify(colFromRows(d.rows)));
        },
        async togglePreserveSrc() {
          this.invalidateBundle();
          if (this.ran) { await this.ensureBundle(); this.$nextTick(() => this.syncSurfaces()); }
        },

        // ---- paste + drop + load ----
        handlePaste(e) { return this.processText(e.clipboardData.getData("text").trim()); },
        async handleDrop(e) {
          this.hot = false;
          const f = e.dataTransfer.files[0];
          if (f) return this.processText((await f.text()).trim());
        },
        async processText(t) {
          if (!t) return;
          try {
            if (t.startsWith("{")) {
              const o = JSON.parse(t);
              const fnKeys = Object.keys(o).filter(k => (k === "fn" || k.startsWith("fn_")) && typeof o[k] === "string");

              if (fnKeys.length) {
                const meta = o.meta && typeof o.meta === "object" ? o.meta : null;
                const fnNames = fnKeys.map(fk => fk === "fn" ? "" : fk.slice(3));
                const newTabs = (await Promise.all(fnKeys.map(async (fk, fi) => {
                  const name = fnNames[fi];
                  const fnSrc = await this.unzip(o[fk]);
                  const tab = { ...this.blankTab(name, fnSrc), fnGz: o[fk] };
                  const dk = name ? "data_" + name : "data";
                  if (typeof o[dk] === "string") {
                    tab.outs.__all = { rows: rowsFromCol(JSON.parse(await this.unzip(o[dk]))), jGz: o[dk] };
                    return tab;
                  }
                  // Separate-mode outputs: data_<fn>__<batch>. Another fn's
                  // single key can look like this shape, so exact fn names win.
                  const pre = "data_" + (name || "fn") + "__";
                  const dsKeys = Object.keys(o).filter(k => k.startsWith(pre) && typeof o[k] === "string" && !fnNames.includes(k.slice(5)));
                  if (!dsKeys.length) return null;
                  for (const key of dsKeys) {
                    const rows = rowsFromCol(JSON.parse(await this.unzip(o[key])));
                    tab.outs[key.slice(pre.length)] = { rows, jGz: o[key] };
                  }
                  return tab;
                }))).filter(Boolean);

                if (newTabs.length) {
                  this.tabs = newTabs;
                  this.active = 0;
                  // Batches ride src (legacy single) / src_<batch> keys; a
                  // bundle without them rehydrates output-only, as before.
                  this.datasets = []; this.srcGz = {};
                  if (typeof o.src === "string") {
                    this.datasets.push({ name: "d1", rows: rowsFromCol(JSON.parse(await this.unzip(o.src))) });
                    this.srcGz.d1 = o.src;
                  }
                  for (const k of Object.keys(o)) {
                    if (!k.startsWith("src_") || typeof o[k] !== "string") continue;
                    this.datasets.push({ name: k.slice(4), rows: rowsFromCol(JSON.parse(await this.unzip(o[k]))) });
                    this.srcGz[k.slice(4)] = o[k];
                  }
                  this.preserveSrc = !!this.datasets.length;
                  this.combine = meta ? !!meta.combine : true;
                  this.tagCol = (meta && meta.tagCol) || "";
                  this.raw = this.stacked();
                  this.scope = this.combine ? "__all" : (this.datasets[0]?.name || this.scopeOptions()[0] || "__all");
                  Object.assign(this, { bundle: t, bundleSz: sizeOf(t), bundleObj: o, ran: true, profileData: {} });
                  this.mirrorScope();
                  if (typeof opts.onIngest === "function") try { opts.onIngest(this.raw); } catch (e) {}
                  this.saveTabs();
                  return this.$nextTick(() => this.syncSurfaces());
                }
              }
            }
            const cleanT = t.replace(/\s/g, "");
            if (/^[A-Za-z0-9+/=]+$/.test(cleanT)) return this.load(await this.unzip(cleanT));
          } catch (e) {}
          this.load(t);
        },
        load(t) {
          let d;
          try { d = JSON.parse(t); } catch (e) { d = Papa.parse(t, { header: true, skipEmptyLines: true }).data; }
          if (d && !Array.isArray(d)) d = rowsFromCol(d);
          this.loaded = "";
          // A first paste starts the data and auto-runs. A later one is the
          // next dump of the same shape: it appends as a new batch but does
          // NOT re-run, so dumping five batches costs five appends and one
          // Run, not five full pipelines. The output pane's "Run to see
          // output" state marks the results as stale until then.
          if (this.datasets.length) { this.addDataset(d || []); return; }
          this.ingest(d || []);
          // A first paste is the intake gesture: show it at once, editor open.
          if (this.raw.length) { this.collapsed = false; this.run(); }
        },
        // ---- batches (datasets) ---------------------------------------------
        // A batch name doubles as the tag value and the bundle key, so it stays
        // in [A-Za-z0-9_] and unique.
        dsSafe(n) { return String(n || "").replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, ""); },
        dsUnique(base) {
          let n = base || "d" + (this.datasets.length + 1), i = 2;
          while (this.datasets.some(d => d.name === n)) n = (base || "d") + "_" + i++;
          return n;
        },
        isCombined() { return this.combine; },
        // The combined input as row references only: no tagging and no row
        // copies here, so the page holds one resident copy of the data. The
        // tag column (when named) is applied inside the worker, and in
        // rawFor() for the identity tabs that never visit it (the tag wins
        // over an incoming column of the same name; distinguishing dumps is
        // its whole point).
        stacked() {
          return this.datasets.flatMap(d => (typeof Alpine !== "undefined" && Alpine.raw) ? Alpine.raw(d.rows) : d.rows);
        },
        // Rows leave here bound for a worker postMessage, and a structured
        // clone throws on Alpine's reactive proxies, so unwrap at the source:
        // the raw stored array holds the plain row objects.
        rawFor(d) {
          const rows = (typeof Alpine !== "undefined" && Alpine.raw) ? Alpine.raw(d.rows) : d.rows;
          return this.tagCol ? rows.map(r => ({ ...r, [this.tagCol]: d.name })) : rows;
        },
        // ---- inspection scopes ----------------------------------------------
        // A scope names what Data and Profile speak about for the active tab:
        // "__all" is the combined stack, anything else a single batch. Options
        // come from the datasets, or (for an output-only bundle rehydrated
        // without source) from the keys the outputs themselves carry.
        scopeLabel(k) { return k === "__all" ? "Combined" : k; },
        scopeOptions() {
          if (this.datasets.length) return ["__all", ...this.datasets.map(d => d.name)];
          const t = this.tabs.find(x => x.outs && Object.keys(x.outs).length);
          return t ? Object.keys(t.outs) : [];
        },
        scopeActive() {
          const opts = this.scopeOptions();
          return opts.includes(this.scope) ? this.scope : (opts[0] || "__all");
        },
        // Change the inspection scope. A scope the last Run did not target
        // computes on demand (all tabs at once, so tab switching stays
        // instant), then mirrors into the display fields.
        async setScope(k) {
          this.scope = k;
          const idxs = this.tabs.flatMap((t, i) => (t.outs || {})[k] ? [] : [i]);
          if (idxs.length && this.raw.length && !this.running) {
            this.running = true;
            try { await this.computeScope(k, idxs); } finally { this.running = false; this.progress = ""; }
          }
          if (!this.ran && this.tabs.some(t => (t.outs || {})[k])) this.ran = true;
          this.mirrorScope();
          this.$nextTick(() => this.syncSurfaces());
        },
        // Mirror the active scope's out onto each tab's display fields.
        mirrorScope() {
          const sk = this.scopeActive();
          for (const t of this.tabs) {
            const o = (t.outs || {})[sk];
            if (o && !o.err) Object.assign(t, { rows: o.rows, ok: true, err: null });
            else Object.assign(t, { rows: [], ok: false, err: (o && o.err) || null });
          }
        },
        // Replace everything with one batch (a first paste, a host loadRows).
        ingest(rows, name) {
          this.datasets = [];
          this.addDataset(rows, name);
        },
        // Append a batch (a later paste, + data, loadRows with append).
        addDataset(rows, name) {
          const clean = (rows || []).filter(r => Object.values(r).some(v => v !== ""));
          this.datasets.push({ name: this.dsUnique(this.dsSafe(name)), rows: clean });
          this.addOpen = false;
          this.refreshInput();
        },
        removeDataset(i) {
          this.datasets.splice(i, 1);
          this.refreshInput();
        },
        startDsEdit(i) { this.editingDs = i; },
        finishDsEdit() {
          if (this.editingDs === -1) return;
          const d = this.datasets[this.editingDs];
          const keep = d.name; d.name = "";
          d.name = this.dsUnique(this.dsSafe(keep));
          this.editingDs = -1;
          // The name is a tag value and a bundle key, so outputs are stale.
          this.refreshInput();
          if (this.raw.length) this.run();
        },
        modeChanged() { this.refreshInput(); if (this.raw.length) this.run(); },
        // Any change to the input side: restack, reset every tab to unrun, show
        // the input in the viewer, tell the host.
        refreshInput() {
          this.raw = this.stacked();
          this.scope = this.isCombined() ? "__all" : (this.datasets[0]?.name || "__all");
          this.tabs.forEach(tab => Object.assign(tab, this.blankTab(tab.name, tab.fnSrc), { dirty: true, fixed: tab.fixed }));
          Object.assign(this, { ran: false, srcGz: {}, bundle: "", bundleSz: "", bundleObj: {}, profileData: {} });
          if (typeof opts.onIngest === "function") try { opts.onIngest(this.raw); } catch (e) {}
          const rows = (typeof Alpine !== "undefined" && Alpine.raw) ? Alpine.raw(this.raw) : this.raw;
          this.sendToViewer("raw_input.json", this.previewJson(rows), "table", rows);
        },
        // In separate mode the views show one batch's output per tab; mirror the
        // picked batch's out onto the tab's display fields.

        // ---- run (async worker) ----
        runWorker(payload, onResult, onProgress) {
          return new Promise((resolve) => {
            const workerUrl = URL.createObjectURL(new Blob([TF_WORKER_SRC], { type: "application/javascript" }));
            const worker = new Worker(workerUrl);
            worker.onmessage = (e) => {
              if (e.data && e.data.progress) { if (onProgress) onProgress(e.data.progress); return; }
              if (e.data && e.data.result) return onResult(e.data.result);
              if (e.data && e.data.done) { worker.terminate(); URL.revokeObjectURL(workerUrl); resolve(); }
            };
            worker.postMessage(payload);
          });
        },
        // A literal identity tab never visits the worker: its output IS the
        // input, so it displays by reference (tagged copies only when a tag
        // column asks for them) instead of round-tripping the whole dataset.
        isIdentityFn(s) { return /^rows\s*=>\s*rows;?$/.test(String(s || "").trim()); },
        async run() {
          if (!this.raw.length || this.running) return;
          this.running = true;
          try { await this.runInner(); }
          finally { this.running = false; this.progress = ""; }
        },
        async runInner() {
          const refsOf = s => [...new Set([...s.matchAll(/\$([A-Za-z_]\w*)/g)].map(m => m[1]))];
          // Run targets the mode's scopes: the combined stack, or every batch.
          const targets = this.isCombined() ? ["__all"] : this.datasets.map(d => d.name);
          const needs = (t) => t.dirty || targets.some(sk => !(t.outs || {})[sk]);

          let changed = true;
          while (changed) {
            changed = false;
            for (const t of this.tabs) {
              if (needs(t)) continue;
              if (refsOf(t.fnSrc).some(n => {
                const dep = this.tabs.find(x => x.name === n);
                return dep && needs(dep);
              })) { t.dirty = true; changed = true; }
            }
          }

          const idxs = this.tabs.flatMap((t, i) => needs(t) ? [i] : []);
          if (idxs.length) {
            // A changed fn invalidates every scope it was ever computed for,
            // lazy ones included.
            for (const i of idxs) Object.assign(this.tabs[i], { outs: {}, fnGz: "", err: null });
            let ti = 0;
            for (const sk of targets) {
              this.progressBase = targets.length > 1 ? "batch " + sk + " (" + (++ti) + "/" + targets.length + ")" : "";
              await this.computeScope(sk, idxs);
            }
            for (const i of idxs) this.tabs[i].dirty = false;
            this.progressBase = "";
            // The bundle (fn/data gzips, src capture) is stale now; it
            // rebuilds lazily from its panel, a copy, or a download.
            this.invalidateBundle();
          }
          this.scope = this.isCombined() ? "__all" : (targets[0] || "__all");
          this.mirrorScope();
          this.ran = true;
          this.$nextTick(() => this.syncSurfaces());
        },
        // Compute one scope's outputs for the given tab indexes: identity tabs
        // resolve by reference (tagged copies only under a tag column), the
        // rest go through a throwaway worker whose input is the scope's
        // batches. Used by Run for its targets and by the scope picker for
        // on-demand scopes.
        async computeScope(sk, idxs) {
          const tasks = [], skipped = [];
          for (const i of idxs) {
            const t = this.tabs[i];
            if (this.isIdentityFn(t.fnSrc)) skipped.push(i);
            else tasks.push({ i, name: t.name, fnSrc: t.fnSrc });
          }
          const inIdx = new Set(idxs);
          const d = sk === "__all" ? null : this.datasets.find(x => x.name === sk);
          for (const i of skipped) {
            const t = this.tabs[i];
            t.outs[sk] = { rows: d ? this.rawFor(d) : (this.tagCol ? this.datasets.flatMap(x => this.rawFor(x)) : this.raw) };
          }
          if (!tasks.length) return;
          const base = this.progressBase || (sk === "__all" ? "" : "batch " + sk);
          let done = 0;
          this.progress = (base ? base + ": " : "") + "0/" + tasks.length + " fns";
          const seed = {};
          this.tabs.forEach((t, i) => {
            const o = !inIdx.has(i) && t.name && (t.outs || {})[sk];
            if (o && o.rows && o.rows.length) seed[t.name] = Alpine.raw(o.rows);
          });
          const seedAlias = skipped.map(i => this.tabs[i].name).filter(Boolean);
          const batches = (d ? [d] : this.datasets).map(x => ({ name: x.name, rows: Alpine.raw(x.rows) }));
          await this.runWorker({ batches, tagCol: this.tagCol, tasks, seed, seedAlias }, (res) => {
            this.tabs[res.i].outs[sk] = res.err ? { err: res.err } : { rows: res.rows };
            this.progress = (base ? base + ": " : "") + (++done) + "/" + tasks.length + " fns";
          }, (p) => { this.progress = (base ? base + ": " : "") + p.name + " (" + (done + 1) + "/" + tasks.length + ")"; });
        },
        invalidateBundle() { Object.assign(this, { bundle: "", bundleSz: "", bundleObj: {} }); },
        // Materialize the export side on demand: per-batch src gzips, each
        // ran tab's fn and data gzips, then the bundle string.
        async ensureBundle() {
          if (this.bundle || !this.ran) return;
          await this.ensureSrcGz();
          // The bundle carries the mode's target scopes only ("__all" combined,
          // else the batches); scopes computed for inspection alone stay out.
          // The columnar form exists only here, transiently, one output at a
          // time: stringify, gzip, release.
          const targets = this.isCombined() ? ["__all"] : this.datasets.map(d => d.name);
          for (const t of this.tabs) {
            const outs = t.outs || {};
            if (!targets.some(sk => outs[sk] && outs[sk].rows)) continue;
            if (!t.fnGz) t.fnGz = await this.zip(t.fnSrc);
            for (const sk of targets) {
              const o = outs[sk];
              if (o && o.rows && !o.jGz) o.jGz = await this.zip(JSON.stringify(colFromRows(Alpine.raw(o.rows))));
            }
          }
          this.rebuildBundle();
        },
        rebuildBundle() {
          const obj = {};
          // One auto-named batch keeps the legacy bare `src` key; anything more
          // writes src_<batch>, so batch boundaries survive the round-trip.
          const soloAuto = this.datasets.length === 1 && /^d\d*$/.test(this.datasets[0].name);
          if (this.preserveSrc) {
            if (soloAuto && this.srcGz[this.datasets[0].name]) obj.src = this.srcGz[this.datasets[0].name];
            else for (const d of this.datasets) if (this.srcGz[d.name]) obj["src_" + d.name] = this.srcGz[d.name];
          }
          const used = new Set();
          for (const t of this.tabs) {
            if (!t.fnGz) continue;
            const base = t.name.trim();
            let k = base, i = 2;
            while (used.has(k)) k = (base || "fn") + "_" + i++;
            used.add(k);
            obj[k ? "fn_" + k : "fn"] = t.fnGz;
            if (this.isCombined()) {
              const o = (t.outs || {}).__all;
              if (o && o.jGz) obj[k ? "data_" + k : "data"] = o.jGz;
            } else {
              for (const d of this.datasets) {
                const o = (t.outs || {})[d.name];
                if (o && o.jGz) obj["data_" + (k || "fn") + "__" + d.name] = o.jGz;
              }
            }
          }
          // meta is the one non-gz key: plain JSON, additive, ignored by older
          // parsers, and what makes combine/tagCol/batch names round-trip.
          if (this.datasets.length > 1 || this.tagCol || !this.isCombined())
            obj.meta = { v: 2, combine: this.isCombined(), tagCol: this.tagCol, datasets: this.datasets.map(d => d.name) };
          const b = JSON.stringify(obj, null, 2);
          Object.assign(this, { bundle: b, bundleSz: sizeOf(b), bundleObj: obj });
        },

        // ---- views ----
        // The export payload is produced on demand (a click), never held in
        // state or a DOM attribute, and it follows the format on screen: the
        // Table mode copies and downloads CSV, the Raw and Editor modes JSON,
        // the Bundle view its manifest. Always the active tab's OUTPUT rows;
        // for the identity tab that is, by definition, the (tagged) input.
        async exportPayload(k) {
          if (k === "bundle") {
            await this.ensureBundle();
            return { text: this.bundle, ext: "json", mime: "application/json" };
          }
          const rows = k === "profile"
            ? (this.profileData?.rows || [])
            : Alpine.raw(this.tabs[this.active]?.rows || []);
          const mode = document.getElementById("tf-workbench")?.__viewer?.mode;
          if (mode === "raw" || mode === "tree")
            return { text: JSON.stringify(rows, null, 2), ext: "json", mime: "application/json" };
          return { text: Papa.unparse(rows), ext: "csv", mime: "text/csv" };
        },
        async writeClip(text) {
          try { await navigator.clipboard.writeText(text); }
          catch (e) {
            const ta = Object.assign(document.createElement("textarea"), { value: text });
            document.body.appendChild(ta); ta.select();
            try { document.execCommand("copy"); } catch (e2) {}
            ta.remove();
          }
        },
        async copyResult() {
          await this.writeClip((await this.exportPayload(this.curV)).text);
          this.flash("r");
        },
        async copyBundle() {
          await this.writeClip((await this.exportPayload("bundle")).text);
          this.copB = true; setTimeout(() => this.copB = false, 1000);
        },
        async dlBundle() {
          const p = await this.exportPayload("bundle");
          const u = URL.createObjectURL(new Blob([p.text], { type: p.mime }));
          Object.assign(document.createElement("a"), { href: u, download: "bundle.json" }).click();
          setTimeout(() => URL.revokeObjectURL(u), 100);
        },
        // The bundle panel's key listing: name and compressed size per entry.
        bundleRows() {
          return Object.keys(this.bundleObj || {}).map(k => ({
            k, sz: typeof this.bundleObj[k] === "string" ? sizeOf(this.bundleObj[k]) : "meta",
          }));
        },
        // Show the actual bundle in the viewer: the Editor mode gets the whole
        // structure, Raw the real JSON string (capped as a preview; Copy and
        // Download carry it all). A transient look, not a view: the next tab,
        // view, or scope click restores the normal subject.
        async viewBundle() {
          await this.ensureBundle();
          const CAP = 6000;
          const text = this.bundle.length > CAP
            ? this.bundle.slice(0, CAP) + "\n\n… " + (this.bundle.length - CAP).toLocaleString() + " more characters (Copy and Download carry the whole bundle)"
            : this.bundle;
          this.bndOpen = false;
          this.sendToViewer("bundle.json", text, "tree", Alpine.raw(this.bundleObj));
        },
        sz(k) {
          if (k === "profile") {
            const rows = this.tabs[this.active]?.rows;
            const n = rows?.length ? Object.keys(rows[0]).length : 0;
            return n ? n + " col" : "";
          }
          const n = this.tabs[this.active]?.rows?.length || 0;
          return n ? (n >= 1000 ? (n / 1000).toFixed(1) + "k rows" : n + " rows") : "";
        },

        // Decoupled viewer dispatch (the tfViewer mounted in the markup below).
        // Rows travel by reference (the viewer's Table and Tree modes use them
        // directly); the string payload is only what the Raw mode shows, so it
        // is a capped preview, never a serialization of the whole dataset.
        sendToViewer(filename, payloadStr, targetMode = "table", data = null) {
          // viewerKind gates the Table mode button: an object (the bundle
          // peek) has no tabular reading.
          this.viewerKind = (data === null || Array.isArray(data)) ? "rows" : "obj";
          const v = document.getElementById("tf-workbench");
          if (v && v.__viewer) v.__viewer.show(filename, payloadStr, data, targetMode);
        },
        previewJson(rows) {
          const CAP = 500;
          const s = JSON.stringify(rows.slice(0, CAP), null, 2);
          return rows.length > CAP
            ? s + "\n\n… " + (rows.length - CAP).toLocaleString() + " more rows (the Raw preview is capped; Table, copy, and download carry them all)"
            : s;
        },
        switchTo(k) { this.curV = k; this.syncSurfaces(); },
        syncSurfaces() {
          if (this.curV === "csv") {
            const rows = Alpine.raw(this.tabs[this.active]?.rows || []);
            const name = (this.tabs[this.active]?.name || ("step_" + (this.active + 1))) + ".json";
            this.sendToViewer(name, this.previewJson(rows), "table", rows);
          } else if (this.curV === "profile") {
            const prows = this.profile(Alpine.raw(this.tabs[this.active]?.rows || []));
            this.profileData = { rows: prows, cols: prows.length };
            this.sendToViewer("profile.json", JSON.stringify(prows, null, 2), "table", prows);
          }
        },
        profile(rows) {
          if (!rows?.length) return [];
          const colSet = new Set();
          for (const r of rows) for (const k in r) colSet.add(k);
          const typeOf = v => v == null ? "null" : Array.isArray(v) ? "array" : typeof v;
          const CAP = 1000;   // distincts collected per column; past it, report "1000+"
          return [...colSet].map(col => {
            const types = new Set(), seen = new Set();
            let nulls = 0, capped = false;
            for (const r of rows) {
              const v = r[col];
              if (v == null) { nulls++; continue; }
              types.add(typeOf(v));
              if (!capped) {
                seen.add(typeof v === "object" ? JSON.stringify(v) : v);
                if (seen.size > CAP) capped = true;
              }
            }
            const distinct = [...seen].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
            return {
              Column: col,
              Type: types.size === 0 ? "null" : [...types].join("|"),
              Nulls: nulls,
              Distinct: capped ? CAP + "+" : distinct.length,
              Values: distinct.slice(0, 10).join(", ") + (capped ? ", …" : (distinct.length > 10 ? ", +" + (distinct.length - 10) : "")),
            };
          });
        },

        // ---- misc ----
        clear() {
          Object.assign(this, { raw: [], datasets: [], scope: "__all", editingDs: -1, addOpen: false, bndOpen: false, combine: true, tagCol: "", ran: false, bundle: "", bundleSz: "", bundleObj: {}, srcGz: {}, tabs: [this.identityTab()], active: 0, profileData: {}, loaded: "" });
          this.saveTabs();
          if (typeof opts.onIngest === "function") try { opts.onIngest([]); } catch (e) {}
          this.sendToViewer("blank.json", "[]");
        },
        flash(side) {
          const p = side === "f" ? "copF" : "copR";
          this[p] = true; setTimeout(() => this[p] = false, 1000);
        },
        async dl() {
          const p = await this.exportPayload(this.curV);
          const u = URL.createObjectURL(new Blob([p.text], { type: p.mime }));
          Object.assign(document.createElement("a"), { href: u, download: "out." + p.ext }).click();
          setTimeout(() => URL.revokeObjectURL(u), 100);
        },
      };
    });
  });

  // ---- the markup (a string; hosts drop it into the DOM before Alpine walks,
  // or Alpine.initTree it after). dataExpr rides verbatim inside the x-data
  // attribute, so single quotes only.
  function panelHTML(dataExpr) {
    return `
  <style>
    /* Below lg the workbench stacks (editor over viewer) and the split-width
       inline style must not apply; heights are explicit because a mobile
       host may give the panel no height to fill. */
    @media (max-width: 1023.5px) {
      .tf-root .tf-editor-card { width: 100% !important; }
      .tf-root textarea { min-height: 9rem; }
    }
  </style>
  <div class="tf-root flex flex-col lg:h-full min-h-0 gap-2 select-none" x-data="transformWorkbench(${dataExpr || ""})"
       @mousemove.window="if(drag){const r=$el.getBoundingClientRect(); split=Math.min(80,Math.max(20,(($event.clientX-r.left)/r.width)*100))}"
       @mouseup.window="drag=false">

    <div class="flex flex-wrap items-center px-1 shrink-0 gap-x-3 gap-y-1.5">
      <span x-show="raw.length" class="text-[10px] text-success font-medium whitespace-nowrap flex items-center gap-1">
        <i class="ph-bold ph-check-circle"></i><span x-text="\`\${raw.length.toLocaleString()} rows\`"></span>
      </span>
      <!-- The batch chips double as the scope selector: click selects what
           Data and Profile speak about (computed on demand if the last Run
           did not target it), double-click renames in place (the name is the
           tag value and the bundle key). The Combined chip leads when there
           is more than one batch. + data opens the paste target. -->
      <button x-show="datasets.length > 1" @click="setScope('__all')"
              class="btn btn-xs h-6 min-h-0 px-2 normal-case font-mono shrink-0 border transition-none"
              :class="scopeActive() === '__all' ? 'btn-neutral border-neutral' : 'btn-ghost bg-base-100 border-base-300'">
        Combined <span class="opacity-40 text-[9px]" x-text="raw.length.toLocaleString()"></span>
      </button>
      <template x-for="(d, i) in datasets" :key="i">
        <div class="join border shrink-0" :class="(datasets.length === 1 || scopeActive() === d.name) ? 'border-neutral' : 'border-base-300'">
          <button class="join-item btn btn-xs h-6 min-h-0 px-2 normal-case border-none font-mono transition-none"
                  :class="(datasets.length === 1 || scopeActive() === d.name) ? 'btn-neutral' : 'btn-ghost bg-base-100'"
                  @click="setScope(datasets.length === 1 ? '__all' : d.name)"
                  @dblclick.prevent="startDsEdit(i)"
                  title="Click to inspect this batch; double-click to rename (the name is the tag value and the bundle key)">
            <template x-if="editingDs === i">
              <input x-model="d.name" x-init="$nextTick(() => { $el.focus(); $el.select(); })"
                     @blur="finishDsEdit()" @keydown.enter.prevent="finishDsEdit()"
                     @keydown.escape.prevent="finishDsEdit()" @click.stop
                     class="w-16 bg-transparent border-none outline-none focus:ring-0 p-0 font-mono text-[11px] text-inherit">
            </template>
            <template x-if="editingDs !== i">
              <span><span x-text="d.name"></span> <span class="opacity-40 text-[9px]" x-text="d.rows.length.toLocaleString()"></span></span>
            </template>
          </button>
          <button x-show="datasets.length > 1" @click.stop="removeDataset(i)"
                  class="join-item btn btn-xs h-6 min-h-0 px-1 btn-ghost border-none bg-base-100 hover:text-error">
            <i class="ph ph-x text-[10px]"></i>
          </button>
        </div>
      </template>
      <!-- An output-only bundle (rehydrated without source) has no batch
           chips; its scopes come from the outputs themselves. -->
      <template x-for="k in (datasets.length ? [] : scopeOptions())" :key="k">
        <button @click="setScope(k)"
                class="btn btn-xs h-6 min-h-0 px-2 normal-case font-mono shrink-0 border transition-none"
                :class="scopeActive() === k ? 'btn-neutral border-neutral' : 'btn-ghost bg-base-100 border-base-300'"
                x-text="scopeLabel(k)"></button>
      </template>
      <button x-show="datasets.length" @click="addOpen = !addOpen"
              class="btn btn-xs btn-ghost h-6 min-h-0 px-1.5 opacity-50 hover:opacity-100" :class="addOpen && 'text-primary opacity-100'"
              title="Paste or drop another batch of the same shape">
        <i class="ph-bold ph-plus"></i> data
      </button>
      <label x-show="datasets.length > 1 || !combine" class="flex items-center gap-1 cursor-pointer text-[10px] opacity-60 hover:opacity-100 select-none whitespace-nowrap"
             title="On: batches append into one input. Off: each fn runs once per batch, one output per batch.">
        <input type="checkbox" class="checkbox checkbox-xs" x-model="combine" @change="modeChanged()">
        <span>Combine</span>
      </label>
      <input x-show="datasets.length > 1 || tagCol" x-model="tagCol" @change="modeChanged()" placeholder="tag col"
             title="Adds this column to every input row, holding the batch's name"
             class="input input-xs input-bordered w-20 font-mono h-6" spellcheck="false">
      <div class="flex gap-2 items-center shrink-0 ml-auto">
        <!-- Live run progress, fed by the worker per function (and per batch
             in separate mode). -->
        <span x-show="running" class="text-[10px] opacity-60 font-mono truncate max-w-[16rem]" x-text="progress"></span>
        <button class="btn btn-xs btn-ghost px-1.5" @click="collapsed = !collapsed"
                :title="collapsed ? 'Show the transform editor' : 'Hide the transform editor'">
          <i class="ph-bold" :class="collapsed ? 'ph-sidebar' : 'ph-sidebar-simple'"></i>
        </button>
        <button class="btn btn-xs btn-primary px-3" :disabled="!raw.length || running" @click="run()">
          <span x-show="!running"><i class="ph-bold ph-play"></i></span>
          <span x-show="running" class="loading loading-spinner loading-xs"></span> Run
        </button>
        <button class="btn btn-xs btn-ghost" @click="clear()">Clear</button>
      </div>
    </div>

    <!-- The paste/drop target: a drop zone only while empty. Once a table is
         loaded it collapses and the row count moves up beside the controls,
         so it stops taking a full row it does not need. -->
    <div class="card bg-base-100 border border-base-300 shrink-0" x-show="!datasets.length || addOpen">
      <div class="p-1">
        <div class="border border-dashed rounded-md py-3 text-center cursor-pointer hover:bg-base-200 transition-colors"
             :class="hot ? 'border-primary bg-primary/5' : ran && !datasets.length ? 'border-warning/40 bg-warning/5' : 'border-base-300'"
             @paste.prevent="handlePaste($event)"
             @dragenter.prevent="hot = true" @dragover.prevent
             @dragleave.prevent="hot = false" @drop.prevent="handleDrop($event)"
             tabindex="0">
          <div x-show="!ran || datasets.length" class="text-base-content/40 text-xs flex items-center justify-center gap-2 pointer-events-none">
            <i class="ph-bold text-lg" :class="hot ? 'ph-file-arrow-down text-primary' : 'ph-clipboard-text'"></i>
            <span x-text="hot ? 'Drop to load' : (datasets.length ? 'Paste or drop the next batch (same shape; appends as a new dataset)' : 'Paste or drop TSV, CSV, JSON, or a bundle')"></span>
          </div>
          <div x-show="ran && !datasets.length" class="flex items-center justify-center gap-2 text-warning text-xs font-bold pointer-events-none">
            <i class="ph-bold ph-info"></i>
            <span>Bundle rehydrated without source. Paste raw data here to enable Run.</span>
          </div>
        </div>
      </div>
    </div>

    <div class="lg:flex-1 flex flex-col lg:flex-row gap-2 lg:gap-0 min-h-0" :class="drag && 'pointer-events-none'">
      <div x-show="!collapsed" class="tf-editor-card card bg-base-100 border border-base-300 flex flex-col overflow-hidden" :style="\`width: \${split}%\`">
        <div class="p-2 flex flex-col h-full">
          <div class="flex justify-between items-center mb-2 shrink-0 gap-1.5">
            <div class="flex gap-1.5 items-center flex-1 min-w-0 p-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              <template x-for="(t, i) in tabs" :key="i">
                <div class="join border border-base-300 shrink-0">
                  <button @click="setActive(i)" @dblclick.prevent="startEdit(i)"
                          class="join-item btn btn-xs h-7 min-h-0 px-3 normal-case border-none transition-none"
                          :class="active === i ? 'btn-neutral' : 'btn-ghost bg-base-100'">
                    <div class="relative inline-flex items-center justify-center min-w-[2.5rem]">
                      <span class="invisible whitespace-pre font-medium" x-text="t.name || ' '"></span>
                      <template x-if="editing === i">
                        <input x-model="t.name" x-init="$nextTick(() => { $el.focus(); $el.select(); })"
                               @blur="finishEdit()" @keydown.enter.prevent="finishEdit()"
                               @keydown.escape.prevent="finishEdit()" @click.stop
                               class="absolute inset-0 w-full h-full bg-transparent border-none outline-none focus:ring-0 text-center text-inherit font-medium p-0">
                      </template>
                      <template x-if="editing !== i">
                        <span class="absolute inset-0 flex items-center justify-center" x-text="t.name || '·'" :class="!t.name && 'opacity-50'"></span>
                      </template>
                    </div>
                    <i x-show="t.err" class="ph-bold ph-warning-circle text-error text-[10px] ml-1"></i>
                    <span x-show="t.dirty && t.ok && !t.err" class="text-warning text-[10px] ml-1 font-bold">*</span>
                  </button>
                  <button x-show="tabs.length > 1" @click.stop="remove(i)"
                          class="join-item btn btn-xs h-7 min-h-0 px-1.5 btn-ghost border-none bg-base-100 hover:text-error border-l border-base-300!">
                    <i class="ph ph-x text-[10px]"></i>
                  </button>
                </div>
              </template>
              <button @click="add()" class="btn btn-xs btn-ghost opacity-40 px-2 shrink-0 hover:opacity-100" title="Add a blank transform tab"><i class="ph-bold ph-plus"></i></button>
              <select x-show="addableRecipes().length" @change="addRecipe($event.target.value); $event.target.value = ''"
                      title="Add a committed recipe from the registry"
                      class="select select-xs select-bordered h-7 min-h-0 shrink-0 max-w-[9rem] text-[11px] opacity-60 hover:opacity-100">
                <option value="">+ recipe</option>
                <template x-for="r in addableRecipes()" :key="r.name">
                  <option :value="r.name" x-text="r.label || r.name"></option>
                </template>
              </select>
            </div>
            <div class="flex gap-1 shrink-0">
              <button class="btn btn-xs h-7 min-h-0 px-1.5 btn-ghost transition-colors" @click="wrapF = !wrapF" :class="wrapF ? 'text-primary' : 'opacity-30'"><i class="ph-bold ph-arrow-u-down-left"></i></button>
              <button class="btn btn-xs h-7 min-h-0 px-1.5 btn-ghost transition-colors tf-copy-btn" :data-clipboard-text="tabs[active]?.fnSrc || ''" @click="flash('f')" :class="copF ? 'text-success' : 'opacity-30'"><i class="ph-bold" :class="copF ? 'ph-check':'ph-copy'"></i></button>
            </div>
          </div>
          <textarea class="textarea textarea-bordered font-mono text-[11px] w-full flex-1 leading-tight resize-none focus:outline-none p-2 border-base-200"
                    :class="wrapF ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-auto'"
                    x-model="tabs[active].fnSrc" @input="tabs[active].dirty = true"
                    spellcheck="false" :wrap="wrapF ? 'soft' : 'off'"></textarea>
          <div x-show="tabs[active]?.err" class="text-error text-[10px] font-mono mt-1" x-text="tabs[active]?.err"></div>
        </div>
      </div>

      <div x-show="!collapsed" class="hidden lg:block w-1.5 hover:bg-primary/20 cursor-col-resize self-stretch transition-colors" @mousedown="drag = true"></div>

      <div class="card bg-base-100 border border-base-300 flex-1 flex flex-col overflow-hidden">
        <div class="p-2 flex flex-col h-full">
          <div x-show="!ran" class="flex-1 min-h-[8rem] lg:min-h-0 flex items-center justify-center text-base-content/20 italic text-xs">Run to see output</div>
          <div x-show="ran" class="flex flex-col h-full">
            <div class="flex flex-wrap items-center gap-y-1.5 mb-2 shrink-0">
              <div class="flex gap-1.5 items-center">
                <template x-for="v in views" :key="v.k">
                  <button class="btn btn-xs h-7 min-h-0 px-3 normal-case border border-base-300 transition-none flex gap-3"
                          :class="curV === v.k ? 'btn-neutral' : 'btn-ghost bg-base-100'" @click="switchTo(v.k)">
                    <span class="font-medium" x-text="v.l"></span>
                    <span class="text-[9px] opacity-40 font-mono tracking-tighter" x-text="sz(v.k)"></span>
                  </button>
                </template>
                <!-- The scope readout: which batch (or Combined) the batch
                     chips up top have selected; the chips are the control. -->
                <span x-show="scopeOptions().length > 1" class="text-[10px] opacity-40 font-mono self-center ml-1"
                      x-text="scopeLabel(scopeActive())"></span>
              </div>
              <div class="flex items-center gap-2 ml-auto">
                <div class="join border border-base-300">
                  <!-- Table applies to rows only; the bundle peek (an object)
                       disables it rather than erroring. -->
                  <button class="btn btn-xs join-item px-2.5 font-normal normal-case bg-base-100 hover:bg-base-200"
                          :disabled="viewerKind !== 'rows'" :class="viewerKind !== 'rows' && 'opacity-40'"
                          @click="document.getElementById('tf-workbench').__viewer.switchMode('table')"><i class="ph ph-table"></i> Table</button>
                  <button class="btn btn-xs join-item px-2.5 font-normal normal-case bg-base-100 hover:bg-base-200" @click="document.getElementById('tf-workbench').__viewer.switchMode('tree')"><i class="ph ph-tree-view"></i> Editor</button>
                  <button class="btn btn-xs join-item px-2.5 font-normal normal-case bg-base-100 hover:bg-base-200" @click="document.getElementById('tf-workbench').__viewer.switchMode('raw')"><i class="ph ph-text-t"></i> Raw</button>
                </div>
                <!-- The bundle: the export artifact, a level apart from the
                     inspection views. Opening the panel builds it. -->
                <div class="relative">
                  <button class="btn btn-xs btn-ghost border border-base-300 normal-case gap-1.5"
                          :class="bndOpen && 'btn-active'"
                          @click="bndOpen = !bndOpen; if (bndOpen) ensureBundle()">
                    <i class="ph-bold ph-package opacity-60"></i> Bundle
                    <span class="text-[9px] opacity-40 font-mono" x-text="bundleSz"></span>
                  </button>
                  <div x-show="bndOpen" @click.outside="bndOpen = false"
                       class="absolute right-0 z-30 mt-1 card bg-base-100 border border-base-300 shadow-lg w-[20rem] p-2 text-xs space-y-2">
                    <div class="flex items-center justify-between gap-2">
                      <label class="flex items-center gap-1.5 cursor-pointer opacity-70 hover:opacity-100 select-none">
                        <input type="checkbox" class="checkbox checkbox-xs" x-model="preserveSrc" @change="togglePreserveSrc()">
                        <span>Include source</span>
                      </label>
                      <span class="font-mono text-[10px] opacity-50" x-text="bundle ? bundleSz : 'building…'"></span>
                    </div>
                    <div class="max-h-[10rem] overflow-y-auto border border-base-200 rounded">
                      <template x-for="r in bundleRows()" :key="r.k">
                        <div class="flex justify-between px-2 py-0.5 font-mono text-[10px] border-b border-base-200 last:border-0">
                          <span class="truncate" x-text="r.k"></span>
                          <span class="opacity-50 shrink-0 ml-2" x-text="r.sz"></span>
                        </div>
                      </template>
                    </div>
                    <div class="flex gap-1.5 justify-end">
                      <button class="btn btn-xs btn-ghost gap-1" title="Show the bundle in the pane (Editor: the structure; Raw: the actual JSON string, capped)"
                              @click="viewBundle()"><i class="ph-bold ph-eye"></i> View</button>
                      <button class="btn btn-xs btn-ghost gap-1" @click="copyBundle()" :class="copB && 'text-success'">
                        <i class="ph-bold" :class="copB ? 'ph-check' : 'ph-copy'"></i> Copy
                      </button>
                      <button class="btn btn-xs btn-ghost gap-1" @click="dlBundle()"><i class="ph-bold ph-download"></i> Download</button>
                    </div>
                  </div>
                </div>
                <div class="flex gap-1">
                  <!-- The export text is produced at click time, never bound
                       into the attribute: with large batches that binding held
                       the whole dataset in the DOM. -->
                  <button class="btn btn-xs h-7 min-h-0 px-1.5 btn-ghost transition-colors" @click="copyResult()" :class="copR ? 'text-success' : 'opacity-30'"><i class="ph-bold" :class="copR ? 'ph-check':'ph-copy'"></i></button>
                  <button class="btn btn-xs h-7 min-h-0 px-1.5 btn-ghost opacity-30 hover:opacity-100" @click="dl()"><i class="ph-bold ph-download"></i></button>
                </div>
              </div>
            </div>
            <div class="flex-1 min-h-[22rem] lg:min-h-0 border border-base-200 rounded overflow-hidden bg-base-100 relative">
              <div x-show="curV === 'csv' && !tabs[active]?.rows?.length" class="absolute inset-0 flex items-center justify-center text-base-content/30 italic text-xs z-10 bg-base-100" x-text="tabs[active]?.err ? 'Error in this tab' : 'This tab not yet run'"></div>
              <div x-show="curV === 'profile' && !tabs[active]?.rows?.length" class="absolute inset-0 flex items-center justify-center text-base-content/30 italic text-xs z-10 bg-base-100" x-text="tabs[active]?.err ? 'Error in this tab' : 'This tab not yet run'"></div>
              <div id="tf-workbench" class="absolute inset-0 overflow-auto" x-data="tfViewer({ defaultMode: 'raw' })"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
  }

  window.TransformWorkbench = { panelHTML, version: 1, _clip: null };
})();
