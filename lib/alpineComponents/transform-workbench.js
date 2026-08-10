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
// Dependencies: Alpine + PapaParse as globals (page-loaded); ClipboardJS
// optional (copy buttons inert without it); Tabulator optional (the table
// mode needs it, the app shell ships it, the standalone page loads it);
// vanilla-jsoneditor lazy-imported on first Tree view.
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
          + "<span>Header filters</span></label></div>"
          + '<div id="tf-tab-target" class="flex-1 min-h-0"></div></div>',
        after: (f) => {
          requestAnimationFrame(() => {
            const target = document.getElementById("tf-tab-target");
            if (!target || typeof Tabulator === "undefined") return;
            try {
              const h = target.clientHeight || 500;
              const tbl = new Tabulator(target, {
                data: JSON.parse(f.content),
                autoColumns: true,
                autoColumnsDefinitions: (defs) => defs.map(d => ({ ...d, headerFilter: "input" })),
                layout: "fitData",
                height: h + "px",
              });
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
            try { parsed = JSON.parse(f.content); }
            catch (e) {
              target.innerHTML = '<pre class="p-4 text-error font-mono text-xs">Invalid JSON: ' + TF_VIEW_REGISTRY.esc(e.message) + "</pre>";
              return;
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
  function tfWorker() {
    importScripts("https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js");
    const colFromRows = r => r.length ? Object.fromEntries(Object.keys(r[0]).map(k => [k, r.map(x => x[k] ?? null)])) : {};
    const refsOf = s => [...new Set([...s.matchAll(/\$([A-Za-z_]\w*)/g)].map(m => m[1]))];

    self.onmessage = e => {
      const { raw, tasks, seed } = e.data;
      const pool = { ...seed };          // tabName -> output rows, grows as dirty tabs resolve
      const out = [];
      let pending = tasks.slice(), moving = true;

      while (pending.length && moving) {
        moving = false;
        pending = pending.filter(t => {
          const deps = refsOf(t.fnSrc);
          if (!deps.every(n => n in pool)) return true;   // deps not ready, wait a pass
          try {
            const fn = new Function("rows", ...deps.map(n => "$" + n), "return (" + t.fnSrc + ")(rows)");
            const rows = fn(structuredClone(raw), ...deps.map(n => structuredClone(pool[n])));
            const col = colFromRows(rows);
            out.push({ i: t.i, obj: col, rows, csv: Papa.unparse(rows), json: JSON.stringify(col, null, 2), err: null });
            if (t.name) pool[t.name] = rows;
          } catch (err) { out.push({ i: t.i, err: err.message }); }
          moving = true;
          return false;   // resolved, drop it
        });
      }
      pending.forEach(t => out.push({ i: t.i, err: "Unresolved $ref: " + refsOf(t.fnSrc).filter(n => !(n in pool)).join(", ") }));
      self.postMessage({ results: out });
    };
  }
  const TF_WORKER_SRC = "(" + tfWorker.toString() + ")()";

  // ---- the components ----
  document.addEventListener("alpine:init", () => {
    if (typeof Alpine === "undefined" || !Alpine.data) return;

    // The output viewer, mounted by the workbench markup below.
    Alpine.data("tfViewer", function (opts) {
      opts = opts || {};
      return {
        template: '<div x-show="viewLoading" class="flex justify-center py-20">'
          + '<span class="loading loading-spinner loading-lg text-primary"></span></div>'
          + '<div x-show="!viewLoading" class="h-full"><div class="h-full" x-html="viewHtml"></div></div>',

        file: "", content: "", mode: "", viewLoading: false,
        defaultMode: opts.defaultMode || "raw",

        init() {
          this.$root.__viewer = this;
          this.$el.innerHTML = this.template;
          this.$nextTick(() => Alpine.initTree(this.$el));
        },
        get ext() { return this.file ? this.file.split(".").pop().toLowerCase() : ""; },
        get fileContext() { return { name: this.file, ext: this.ext, content: this.content }; },
        get availableModes() { return TF_VIEW_REGISTRY.getModes(this.fileContext); },
        get viewHtml() {
          if (!this.file || !this.content) return "";
          const mod = TF_VIEW_REGISTRY.modules.find(m => m.id === this.mode) || TF_VIEW_REGISTRY.modules[0];
          return mod.render(this.fileContext);
        },
        async show(file, content) {
          this.file = file;
          this.content = content;
          this.viewLoading = true;
          const modes = this.availableModes;
          const preferred = modes.find(m => m.id === this.defaultMode) || modes.find(m => m.id === "raw");
          await this.switchMode(preferred ? preferred.id : modes[0].id);
        },
        async switchMode(id) {
          this.viewLoading = true;
          const mod = await TF_VIEW_REGISTRY.prepare(id);
          this.mode = id;
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
        // batches stack into one input, with tagCol (when named) added to every
        // row holding its batch's name, so subsequent dumps stay
        // distinguishable. combine off: each fn tab runs once per batch, one
        // output per batch (tab.outs, keyed by batch name; dsView picks which
        // one the views show).
        datasets: [], combine: true, tagCol: "", dsView: "", editingDs: -1, addOpen: false,
        curV: "csv", split: 50, drag: false, hot: false, collapsed: false,
        wrapF: true, copF: false, copR: false,
        rawProfile: false, profileData: {},
        recipes: [],
        views: [
          { k: "csv", l: "Data", e: "csv", m: "text/csv" },
          { k: "profile", l: "Prof", e: "csv", m: "text/csv" },
          { k: "bundle", l: "Bndl", e: "json", m: "application/json" },
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
          return { name, fnSrc, fnGz: "", err: null, obj: null, rows: [], json: "", csv: "", jGz: "", sz: {}, dirty: false, fixed: false, outs: {} };
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
          this.rebuildBundle();
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
          this.rebuildBundle();
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
          await this.ensureSrcGz();
          this.rebuildBundle();
          if (this.ran) this.$nextTick(() => this.syncSurfaces());
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
                    const col = JSON.parse(await this.unzip(o[dk])), rows = rowsFromCol(col);
                    const json = JSON.stringify(col, null, 2), csv = Papa.unparse(rows);
                    return Object.assign(tab, { obj: col, rows, json, csv, jGz: o[dk], sz: { json: sizeOf(json), jGz: sizeOf(o[dk]), csv: sizeOf(csv) } });
                  }
                  // Separate-mode outputs: data_<fn>__<batch>. Another fn's
                  // single key can look like this shape, so exact fn names win.
                  const pre = "data_" + (name || "fn") + "__";
                  const dsKeys = Object.keys(o).filter(k => k.startsWith(pre) && typeof o[k] === "string" && !fnNames.includes(k.slice(5)));
                  if (!dsKeys.length) return null;
                  for (const key of dsKeys) {
                    const col = JSON.parse(await this.unzip(o[key])), rows = rowsFromCol(col);
                    tab.outs[key.slice(pre.length)] = { obj: col, rows, json: JSON.stringify(col, null, 2), csv: Papa.unparse(rows), jGz: o[key] };
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
                  this.dsView = this.datasets[0]?.name || this.dsOptions()[0] || "";
                  Object.assign(this, { bundle: t, bundleSz: sizeOf(t), bundleObj: o, ran: true, rawProfile: false, profileData: {} });
                  if (!this.isCombined()) this.mirrorOuts();
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
          // A first paste starts the data; a later one is understood as the
          // next dump of the same shape and appends as a new batch.
          if (this.datasets.length) this.addDataset(d || []);
          else this.ingest(d || []);
          // A paste is the intake gesture: show the rows at once, editor open.
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
        // The combined input: every batch stacked, tagCol (when named) added to
        // each row with the batch's name (the tag wins over an incoming column
        // of the same name; distinguishing dumps is its whole point).
        stacked() {
          return this.datasets.flatMap(d => this.rawFor(d));
        },
        // Rows leave here bound for a worker postMessage, and a structured
        // clone throws on Alpine's reactive proxies, so unwrap at the source:
        // the raw stored array holds the plain row objects.
        rawFor(d) {
          const rows = (typeof Alpine !== "undefined" && Alpine.raw) ? Alpine.raw(d.rows) : d.rows;
          return this.tagCol ? rows.map(r => ({ ...r, [this.tagCol]: d.name })) : rows;
        },
        dsActive() {
          if (this.datasets.some(d => d.name === this.dsView)) return this.dsView;
          return this.datasets.length ? this.datasets[0].name : (this.dsView || "");
        },
        // The batch names the output picker offers: the datasets, or (for an
        // output-only separate-mode bundle, rehydrated without source) the keys
        // the outputs themselves carry.
        dsOptions() {
          if (this.datasets.length) return this.datasets.map(d => d.name);
          const t = this.tabs.find(x => x.outs && Object.keys(x.outs).length);
          return t ? Object.keys(t.outs) : [];
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
          this.dsView = this.dsActive();
          this.tabs.forEach(tab => Object.assign(tab, this.blankTab(tab.name, tab.fnSrc), { dirty: true, fixed: tab.fixed }));
          Object.assign(this, { ran: false, srcGz: {}, bundle: "", bundleSz: "", bundleObj: {}, rawProfile: false, profileData: {} });
          if (typeof opts.onIngest === "function") try { opts.onIngest(this.raw); } catch (e) {}
          this.sendToViewer("raw_input.json", JSON.stringify(this.raw, null, 2));
        },
        // In separate mode the views show one batch's output per tab; mirror the
        // picked batch's out onto the tab's display fields.
        mirrorOuts() {
          if (this.isCombined()) return;
          const ds = this.dsActive();
          for (const t of this.tabs) {
            const o = (t.outs || {})[ds];
            if (o && !o.err) Object.assign(t, { obj: o.obj, rows: o.rows, json: o.json, csv: o.csv, jGz: o.jGz, err: null,
              sz: { json: sizeOf(o.json), jGz: sizeOf(o.jGz), csv: sizeOf(o.csv) } });
            else Object.assign(t, { obj: null, rows: [], json: "", csv: "", jGz: "", err: (o && o.err) || null, sz: {} });
          }
        },
        dsSwitched() { this.mirrorOuts(); this.syncSurfaces(); },

        // ---- run (async worker) ----
        runWorker(raw, tasks, seed) {
          return new Promise((resolve) => {
            const workerUrl = URL.createObjectURL(new Blob([TF_WORKER_SRC], { type: "application/javascript" }));
            const worker = new Worker(workerUrl);
            worker.onmessage = (e) => { worker.terminate(); URL.revokeObjectURL(workerUrl); resolve(e.data.results); };
            worker.postMessage({ raw, tasks, seed });
          });
        },
        async run() {
          if (!this.raw.length) return;
          const refsOf = s => [...new Set([...s.matchAll(/\$([A-Za-z_]\w*)/g)].map(m => m[1]))];
          const combined = this.isCombined();
          const needs = (t) => t.dirty || (combined ? !t.obj : !Object.keys(t.outs || {}).length);

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

          const tasks = this.tabs.flatMap((t, i) => needs(t) ? [{ i, name: t.name, fnSrc: t.fnSrc }] : []);
          if (!tasks.length) {
            await this.ensureSrcGz();
            this.rebuildBundle(); this.ran = true;
            return this.$nextTick(() => this.syncSurfaces());
          }
          const ranIdx = new Set(tasks.map(x => x.i));

          if (combined) {
            const seed = {};
            for (const t of this.tabs) if (!needs(t) && t.name && t.rows.length) seed[t.name] = Alpine.raw(t.rows);
            const results = await this.runWorker(Alpine.raw(this.raw), tasks, seed);
            await Promise.all(results.map(async res => {
              const t = this.tabs[res.i];
              const { i, ...data } = res;
              if (data.err) {
                Object.assign(t, this.blankTab(t.name, t.fnSrc), { err: data.err, fixed: t.fixed });
              } else {
                Object.assign(t, data, { dirty: false });
                const [jGz, fnGz] = await Promise.all([this.zip(JSON.stringify(t.obj)), this.zip(t.fnSrc)]);
                Object.assign(t, { jGz, fnGz, sz: { json: sizeOf(t.json), jGz: sizeOf(jGz), csv: sizeOf(t.csv) } });
              }
            }));
          } else {
            // Separate mode: the whole task set runs once per batch. $refs
            // resolve within a batch's own run, so a pipeline stays coherent
            // per batch; the seed for each run is the clean tabs' out for that
            // batch.
            for (const t of this.tabs) if (ranIdx.has(this.tabs.indexOf(t))) t.outs = {};
            for (const d of this.datasets) {
              const seed = {};
              for (const t of this.tabs) {
                const o = !ranIdx.has(this.tabs.indexOf(t)) && t.name && (t.outs || {})[d.name];
                if (o && o.rows && o.rows.length) seed[t.name] = Alpine.raw(o.rows);
              }
              const results = await this.runWorker(Alpine.raw(this.rawFor(d)), tasks, seed);
              await Promise.all(results.map(async res => {
                const t = this.tabs[res.i];
                const { i, ...data } = res;
                if (data.err) t.outs[d.name] = { err: data.err };
                else t.outs[d.name] = { ...data, jGz: await this.zip(JSON.stringify(data.obj)) };
              }));
            }
            await Promise.all([...ranIdx].map(async idx => {
              const t = this.tabs[idx];
              t.fnGz = await this.zip(t.fnSrc);
              t.dirty = false;
            }));
            this.mirrorOuts();
          }

          await this.ensureSrcGz();
          this.rebuildBundle();
          this.ran = true;
          this.$nextTick(() => this.syncSurfaces());
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
              if (t.jGz) obj[k ? "data_" + k : "data"] = t.jGz;
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
        cur(k) {
          if (k === "bundle") return this.bundle;
          if (k === "profile") return this.profileData?.csv ?? "";
          return this.tabs[this.active]?.[k] ?? "";
        },
        sz(k) {
          if (k === "bundle") return this.bundleSz;
          if (k === "profile") {
            const rows = this.rawProfile ? this.raw : this.tabs[this.active]?.rows;
            const n = rows?.length ? Object.keys(rows[0]).length : 0;
            return n ? n + " col" : "";
          }
          return this.tabs[this.active]?.sz?.[k] ?? "";
        },

        // Decoupled viewer dispatch (the tfViewer mounted in the markup below).
        sendToViewer(filename, payloadStr, targetMode = "table") {
          const v = document.getElementById("tf-workbench");
          if (v && v.__viewer) {
            v.__viewer.show(filename, payloadStr).then(() => {
              if (targetMode) v.__viewer.switchMode(targetMode);
            });
          }
        },
        switchTo(k) { this.curV = k; this.syncSurfaces(); },
        syncSurfaces() {
          if (this.curV === "csv") {
            const rows = this.tabs[this.active]?.rows || [];
            const name = (this.tabs[this.active]?.name || ("step_" + (this.active + 1))) + ".json";
            this.sendToViewer(name, JSON.stringify(rows, null, 2), "table");
          } else if (this.curV === "profile") {
            const src = this.rawProfile ? this.raw : this.tabs[this.active]?.rows;
            const prows = this.profile(Alpine.raw(src || []));
            this.profileData = { csv: prows.length ? Papa.unparse(prows) : "", cols: prows.length };
            this.sendToViewer("profile.json", JSON.stringify(prows, null, 2), "table");
          } else if (this.curV === "bundle") {
            this.sendToViewer("manifest.json", JSON.stringify(this.bundleObj || {}, null, 2), "tree");
          }
        },
        profile(rows) {
          if (!rows?.length) return [];
          const cols = [...new Set(rows.flatMap(Object.keys))];
          const typeOf = v => v == null ? "null" : Array.isArray(v) ? "array" : typeof v;
          return cols.map(col => {
            const vals = rows.map(r => r[col]);
            const nonNull = vals.filter(v => v != null);
            const types = [...new Set(nonNull.map(typeOf))];
            const distinct = [...new Set(nonNull.map(v => typeof v === "object" ? JSON.stringify(v) : v))]
              .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
            return {
              Column: col,
              Type: types.length === 0 ? "null" : types.join("|"),
              Nulls: vals.length - nonNull.length,
              Distinct: distinct.length,
              Values: distinct.slice(0, 10).join(", ") + (distinct.length > 10 ? ", +" + (distinct.length - 10) : ""),
            };
          });
        },

        // ---- misc ----
        clear() {
          Object.assign(this, { raw: [], datasets: [], dsView: "", editingDs: -1, addOpen: false, combine: true, tagCol: "", ran: false, bundle: "", bundleSz: "", bundleObj: {}, srcGz: {}, tabs: [this.identityTab()], active: 0, rawProfile: false, profileData: {}, loaded: "" });
          this.saveTabs();
          if (typeof opts.onIngest === "function") try { opts.onIngest([]); } catch (e) {}
          this.sendToViewer("blank.json", "[]");
        },
        flash(side) {
          const p = side === "f" ? "copF" : "copR";
          this[p] = true; setTimeout(() => this[p] = false, 1000);
        },
        dl() {
          const v = this.views.find(x => x.k === this.curV), u = URL.createObjectURL(new Blob([this.cur(this.curV)], { type: v.m }));
          Object.assign(document.createElement("a"), { href: u, download: "out." + v.e }).click();
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
      <!-- The batches: one chip per dataset (name + row count), renamable in
           place like the fn tabs; the name is the tag value and the bundle
           key. + data opens the paste target for the next dump. -->
      <template x-for="(d, i) in datasets" :key="i">
        <div class="join border border-base-300 shrink-0">
          <button class="join-item btn btn-xs h-6 min-h-0 px-2 normal-case border-none bg-base-100 font-mono"
                  @dblclick.prevent="startDsEdit(i)" title="Double-click to rename (the batch name is the tag value and the bundle key)">
            <template x-if="editingDs === i">
              <input x-model="d.name" x-init="$nextTick(() => { $el.focus(); $el.select(); })"
                     @blur="finishDsEdit()" @keydown.enter.prevent="finishDsEdit()"
                     @keydown.escape.prevent="finishDsEdit()" @click.stop
                     class="w-16 bg-transparent border-none outline-none focus:ring-0 p-0 font-mono text-[11px]">
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
        <button class="btn btn-xs btn-ghost px-1.5" @click="collapsed = !collapsed"
                :title="collapsed ? 'Show the transform editor' : 'Hide the transform editor'">
          <i class="ph-bold" :class="collapsed ? 'ph-sidebar' : 'ph-sidebar-simple'"></i>
        </button>
        <button class="btn btn-xs btn-primary px-3" :disabled="!raw.length" @click="run()"><i class="ph-bold ph-play"></i> Run</button>
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
                    <span x-show="t.dirty && t.obj && !t.err" class="text-warning text-[10px] ml-1 font-bold">*</span>
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
                <label x-show="curV === 'profile'" class="flex items-center gap-1.5 cursor-pointer text-xs opacity-60 hover:opacity-100 ml-1 self-center select-none">
                  <input type="checkbox" class="checkbox checkbox-xs" x-model="rawProfile" @change="syncSurfaces()">
                  <span>Raw</span>
                </label>
                <!-- Include source only matters to the bundle, so it lives with
                     the Bundle view rather than in the tab's toolbar. -->
                <label x-show="curV === 'bundle'" class="flex items-center gap-1.5 cursor-pointer text-xs opacity-60 hover:opacity-100 ml-1 self-center select-none">
                  <input type="checkbox" class="checkbox checkbox-xs" x-model="preserveSrc" @change="togglePreserveSrc()">
                  <span>Include source</span>
                </label>
                <!-- Separate mode: which batch's output the Data/Profile views
                     and the download show. -->
                <select x-show="!combine && dsOptions().length" x-model="dsView" @change="dsSwitched()"
                        title="Which batch's output the views show"
                        class="select select-xs select-bordered h-7 min-h-0 max-w-[9rem] font-mono ml-1">
                  <template x-for="n in dsOptions()" :key="n">
                    <option :value="n" x-text="n"></option>
                  </template>
                </select>
              </div>
              <div class="flex items-center gap-2 ml-auto">
                <div class="join border border-base-300">
                  <button class="btn btn-xs join-item px-2.5 font-normal normal-case bg-base-100 hover:bg-base-200" @click="document.getElementById('tf-workbench').__viewer.switchMode('table')"><i class="ph ph-table"></i> Table</button>
                  <button class="btn btn-xs join-item px-2.5 font-normal normal-case bg-base-100 hover:bg-base-200" @click="document.getElementById('tf-workbench').__viewer.switchMode('tree')"><i class="ph ph-tree-view"></i> Editor</button>
                  <button class="btn btn-xs join-item px-2.5 font-normal normal-case bg-base-100 hover:bg-base-200" @click="document.getElementById('tf-workbench').__viewer.switchMode('raw')"><i class="ph ph-text-t"></i> Raw</button>
                </div>
                <div class="flex gap-1">
                  <button class="btn btn-xs h-7 min-h-0 px-1.5 btn-ghost transition-colors tf-copy-btn" :data-clipboard-text="cur(curV)" @click="flash('r')" :class="copR ? 'text-success' : 'opacity-30'"><i class="ph-bold" :class="copR ? 'ph-check':'ph-copy'"></i></button>
                  <button class="btn btn-xs h-7 min-h-0 px-1.5 btn-ghost opacity-30 hover:opacity-100" @click="dl()"><i class="ph-bold ph-download"></i></button>
                </div>
              </div>
            </div>
            <div class="flex-1 min-h-[22rem] lg:min-h-0 border border-base-200 rounded overflow-hidden bg-base-100 relative">
              <div x-show="curV === 'csv' && !tabs[active]?.rows?.length" class="absolute inset-0 flex items-center justify-center text-base-content/30 italic text-xs z-10 bg-base-100" x-text="tabs[active]?.err ? 'Error in this tab' : 'This tab not yet run'"></div>
              <div x-show="curV === 'profile' && !(rawProfile ? raw.length : tabs[active]?.rows?.length)" class="absolute inset-0 flex items-center justify-center text-base-content/30 italic text-xs z-10 bg-base-100" x-text="rawProfile ? 'No raw data loaded' : (tabs[active]?.err ? 'Error in this tab' : 'This tab not yet run')"></div>
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
