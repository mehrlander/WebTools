// alpineComponents/idb-importer.js — modal for pulling records from any
// IndexedDB database on this origin into the data shelf collection.
//
// Usage:
//   <div x-data="idbImporter({
//     target: 'dataShelf.items',
//     getContext: () => appContext,
//     onImported: n => loadItems()
//   })"></div>
//
//   <button @click="$dispatch('open-importer')">Import…</button>
//
// The component renders its own <dialog> and listens for an `open-importer`
// window event so any button on the page can trigger it without needing a
// DOM ref into the component's scope. Steps: pick database → pick store →
// preview & import. Reads go through persistence.idb (native IndexedDB,
// read-only); writes go through persistence.collection.
//
// Intake is shelf-shape-gated: each record is run through
// dataShelf.coerceShelfRecord then validated with dataShelf.isShelfShaped.
// Only recognized records are written; the preview surfaces a split count
// and a sample of each bucket. For arbitrary IDB browsing, see idb-nav.

document.addEventListener('alpine:init', function () {
  Alpine.data('idbImporter', function (opts) {
    opts = opts || {};

    return {
      description: 'Modal that pulls records from any IndexedDB store into the data shelf collection',

      template: `
        <dialog x-ref="modal" class="modal modal-bottom sm:modal-middle backdrop-blur-md" @close="onClose()" @open-importer.window="open()">
          <div class="modal-box w-11/12 max-w-2xl flex flex-col p-0 overflow-hidden border border-base-300 bg-base-100 shadow-2xl">
            <div class="navbar bg-base-200/50 border-b border-base-300 px-4 min-h-12 shrink-0 gap-2">
              <div class="flex-none text-primary"><i class="ph-fill ph-tray-arrow-down text-2xl"></i></div>
              <div class="flex-1">
                <h3 class="font-bold text-base">Import to data shelf</h3>
                <div class="text-[10px] font-mono opacity-50">→ <span x-text="target"></span></div>
              </div>
              <button @click="close()" class="btn btn-ghost btn-sm btn-square">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <!-- step: pick database -->
            <div x-show="step === 'pick'" class="flex flex-col flex-1 min-h-0">
              <div class="px-4 py-3 text-xs uppercase font-bold opacity-50 tracking-widest">Databases on this origin</div>
              <div class="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
                <div x-show="loading" class="flex justify-center py-12">
                  <span class="loading loading-spinner loading-md text-primary"></span>
                </div>
                <template x-for="db in databases" :key="db.name">
                  <button @click="loadStores(db.name)"
                          class="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-base-300 hover:bg-base-200 hover:border-primary/50 transition-colors text-left">
                    <div class="flex items-center gap-2 min-w-0">
                      <i class="ph ph-database text-primary shrink-0"></i>
                      <span class="font-mono text-sm truncate" x-text="db.name"></span>
                      <span class="badge badge-ghost badge-xs" x-show="legacyHint(db.name)" x-text="legacyHint(db.name)"></span>
                    </div>
                    <span class="text-xs opacity-50 font-mono shrink-0" x-text="'v' + db.version"></span>
                  </button>
                </template>
                <div x-show="!loading && !databases.length" class="text-center text-sm opacity-50 italic py-8">
                  No databases found. Your browser may not support <code class="font-mono">indexedDB.databases()</code> (older Firefox).
                </div>
              </div>
            </div>

            <!-- step: pick store -->
            <div x-show="step === 'stores'" class="flex flex-col flex-1 min-h-0">
              <div class="flex items-center gap-2 px-4 py-2 border-b border-base-200">
                <button @click="step = 'pick'" class="btn btn-ghost btn-xs gap-1">
                  <i class="ph ph-arrow-left"></i> back
                </button>
                <span class="text-xs opacity-50 font-mono truncate" x-text="picked.db"></span>
              </div>
              <div class="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
                <div x-show="loading" class="flex justify-center py-12">
                  <span class="loading loading-spinner loading-md text-primary"></span>
                </div>
                <template x-for="s in stores" :key="s">
                  <button @click="preview(s)"
                          class="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-base-300 hover:bg-base-200 hover:border-primary/50 transition-colors text-left">
                    <div class="flex items-center gap-2 min-w-0">
                      <i class="ph ph-table text-secondary shrink-0"></i>
                      <span class="font-mono text-sm truncate" x-text="s"></span>
                    </div>
                    <span class="text-xs opacity-50 shrink-0">
                      <span x-text="storeCounts[s] ?? '?'"></span> records
                    </span>
                  </button>
                </template>
                <div x-show="!loading && !stores.length" class="text-center text-sm opacity-50 italic py-8">
                  No object stores in this database.
                </div>
              </div>
            </div>

            <!-- step: preview & import -->
            <div x-show="step === 'preview'" class="flex flex-col flex-1 min-h-0">
              <div class="flex items-center gap-2 px-4 py-2 border-b border-base-200">
                <button @click="step = 'stores'" class="btn btn-ghost btn-xs gap-1" :disabled="importing">
                  <i class="ph ph-arrow-left"></i> back
                </button>
                <span class="text-xs opacity-50 font-mono truncate">
                  <span x-text="picked.db"></span> / <span x-text="picked.store"></span>
                </span>
              </div>
              <div class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                <div class="text-sm">
                  Found <span class="font-bold" x-text="records.length"></span>
                  record<span x-show="records.length !== 1">s</span>:
                  <span class="font-bold text-success" x-text="recognized.length"></span> recognized,
                  <span class="font-bold" :class="unrecognized.length ? 'text-warning' : 'opacity-50'" x-text="unrecognized.length"></span> not shelf-shaped.
                </div>

                <div x-show="recognized.length">
                  <div class="text-[10px] uppercase font-bold opacity-50 tracking-widest mb-1">Recognized sample</div>
                  <pre class="bg-base-200 rounded-lg p-3 text-[11px] font-mono overflow-auto max-h-48 whitespace-pre-wrap" x-text="recognizedSample"></pre>
                </div>

                <div x-show="unrecognized.length">
                  <div class="text-[10px] uppercase font-bold opacity-50 tracking-widest mb-1">
                    Not shelf-shaped <span class="text-warning normal-case" x-show="firstReason">— <span x-text="firstReason"></span></span>
                  </div>
                  <pre class="bg-base-200 rounded-lg p-3 text-[11px] font-mono overflow-auto max-h-48 whitespace-pre-wrap" x-text="unrecognizedSample"></pre>
                  <div class="text-[11px] opacity-50 mt-1">These records will be skipped. Use idb-nav to browse arbitrary IDB content.</div>
                </div>

                <div x-show="!records.length && !loading" class="text-sm opacity-50 italic">
                  This store is empty.
                </div>

                <div x-show="result" class="alert alert-success py-2 text-sm">
                  <i class="ph ph-check-circle"></i>
                  <span x-text="result"></span>
                </div>
              </div>
              <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-base-200 bg-base-50">
                <button @click="close()" class="btn btn-ghost btn-sm">Done</button>
                <button @click="doImport()" :disabled="importing || !recognized.length"
                        class="btn btn-primary btn-sm gap-2">
                  <span x-show="!importing"><i class="ph ph-tray-arrow-down"></i> Import <span x-text="recognized.length"></span></span>
                  <span x-show="importing"><span class="loading loading-spinner loading-xs"></span> Importing…</span>
                </button>
              </div>
            </div>
          </div>
        </dialog>`,

      target: opts.target || '',
      getContext: typeof opts.getContext === 'function' ? opts.getContext : null,
      onImported: opts.onImported,

      step: 'pick',
      databases: [],
      stores: [],
      storeCounts: {},
      records: [],
      recognized: [],
      unrecognized: [],
      recognizedSample: '',
      unrecognizedSample: '',
      firstReason: '',
      picked: { db: '', store: '' },
      loading: false,
      importing: false,
      result: '',

      init() {
        this.$el.innerHTML = this.template;
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
      },

      async open() {
        this.step = 'pick';
        this.result = '';
        this.records = [];
        this.recognized = [];
        this.unrecognized = [];
        this.recognizedSample = '';
        this.unrecognizedSample = '';
        this.firstReason = '';
        this.loading = true;
        this.$refs.modal.showModal();
        try {
          const all = await persistence.idb.databases();
          // Sort: legacy hits first, then alphabetical.
          this.databases = all.sort((a, b) => {
            const al = this.legacyHint(a.name) ? 0 : 1;
            const bl = this.legacyHint(b.name) ? 0 : 1;
            return al - bl || a.name.localeCompare(b.name);
          });
        } catch (e) {
          console.error('importer: databases()', e);
        }
        this.loading = false;
      },

      close() { this.$refs.modal.close(); },
      onClose() { /* dialog close event — nothing to clean up */ },

      legacyHint(name) {
        if (name === 'DataJarDB') return 'legacy';
        if (name === 'DataShelfDB') return 'v1';
        return '';
      },

      async loadStores(dbName) {
        this.picked.db = dbName;
        this.loading = true;
        this.storeCounts = {};
        try {
          this.stores = await persistence.idb.stores(dbName);
          for (const s of this.stores) {
            this.storeCounts[s] = await persistence.idb.count(dbName, s).catch(() => '?');
          }
        } catch (e) {
          console.error('importer: stores()', e);
          this.stores = [];
        }
        this.loading = false;
        this.step = 'stores';
      },

      async preview(storeName) {
        this.picked.store = storeName;
        this.loading = true;
        this.result = '';
        this.recognized = [];
        this.unrecognized = [];
        this.recognizedSample = '';
        this.unrecognizedSample = '';
        this.firstReason = '';
        try {
          this.records = await persistence.idb.readAll(this.picked.db, storeName);
          this.classify();
        } catch (e) {
          console.error('importer: readAll()', e);
          this.records = [];
          this.unrecognizedSample = String(e?.message || e);
        }
        this.loading = false;
        this.step = 'preview';
      },

      // Split records into recognized / unrecognized buckets and build the
      // sample strings shown in the preview pane. Coercion runs first so a
      // legacy row with e.g. a comma-string `tags` field is judged on its
      // normalized shape, not its raw shape.
      classify() {
        const ds = window.dataShelf;
        if (!ds) {
          // Kit not loaded — nothing we can validate, treat all as unrecognized.
          this.recognized = [];
          this.unrecognized = this.records.slice();
          this.firstReason = 'data-shelf kit not loaded';
          this.unrecognizedSample = this.records.slice(0, 1)
            .map(r => JSON.stringify(r, null, 2)).join('\n\n');
          return;
        }
        const defaultContext = this.getContext?.() || '';
        const recognized = [];
        const unrecognized = [];
        for (const r of this.records) {
          const coerced = ds.coerceShelfRecord(r, { defaultContext });
          if (ds.isShelfShaped(coerced)) recognized.push(coerced);
          else unrecognized.push(r);
        }
        this.recognized = recognized;
        this.unrecognized = unrecognized;
        this.recognizedSample = recognized.slice(0, 1)
          .map(r => JSON.stringify(r, null, 2)).join('\n\n');
        this.unrecognizedSample = unrecognized.slice(0, 1)
          .map(r => JSON.stringify(r, null, 2)).join('\n\n');
        this.firstReason = unrecognized.length
          ? ds.describeRejection(ds.coerceShelfRecord(unrecognized[0], { defaultContext }))
          : '';
      },

      async doImport() {
        if (!this.target || !this.recognized.length) return;
        this.importing = true;
        const col = persistence.collection(this.target);
        // JSON round-trip strips Alpine's reactive Proxy wrappers (which
        // structured-clone refuses with DataCloneError on .put). Shelf
        // records are JSON-safe by schema; mirrors the d9f036a fix.
        const plain = JSON.parse(JSON.stringify(this.recognized));
        let imported = 0, skipped = 0;
        for (const r of plain) {
          try { await col.put(r); imported++; }
          catch (e) { skipped++; console.error('importer: put', e); }
        }
        this.importing = false;
        const skippedTotal = skipped + this.unrecognized.length;
        this.result = `Imported ${imported} record${imported === 1 ? '' : 's'}` +
                      (skippedTotal ? `, skipped ${skippedTotal}.` : '.');
        Alpine.store('toast')?.('check-circle', `Imported ${imported}`, 'alert-success', 2000);
        this.onImported?.(imported);
      }
    };
  });
});
