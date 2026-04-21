// components/jse.js - Lean JSON Editor wrapper
alp.define('jse', _ => `
  <div class="flex flex-col h-full bg-base-100 overflow-hidden">
    <div class="flex-1 min-h-0">
      <div name="jse" class="w-full h-full"></div>
    </div>
    <div class="flex-none bg-base-300 text-xs p-2 flex items-center gap-2 border-t border-base-200">
      <template x-if="stores.length > 1">
        <select class="select select-xs w-auto min-w-0" @change="goStore($event.target.value)" x-model="store">
          <template x-for="s in stores" :key="s">
            <option :value="s" x-text="s"></option>
          </template>
        </select>
      </template>
      <div class="flex-1 overflow-x-auto min-w-0">
        <div class="flex gap-0.5 whitespace-nowrap">
          <template x-for="r in pageRecords" :key="r.fullPath">
            <button class="btn btn-xs" @click="goRecord(r)" :class="selected === r.fullPath ? 'btn-primary' : 'btn-ghost'">
              <span x-text="r.key"></span>
            </button>
          </template>
        </div>
      </div>
      <template x-if="totalPages > 1">
        <div class="flex gap-1 items-center">
          <button class="btn btn-xs btn-ghost" @click="page = Math.max(0, page - 1)" :disabled="page <= 0">
            <i class="ph ph-caret-left"></i>
          </button>
          <span x-text="(page + 1) + '/' + totalPages"></span>
          <button class="btn btn-xs btn-ghost" @click="page = Math.min(totalPages - 1, page + 1)" :disabled="page >= totalPages - 1">
            <i class="ph ph-caret-right"></i>
          </button>
        </div>
      </template>
      <button class="btn btn-xs btn-error btn-outline" @click="delRecord()"><i class="ph ph-trash"></i></button>
      <button class="btn btn-xs btn-success btn-outline" @click="addRecord()"><i class="ph ph-plus"></i></button>
    </div>
  </div>
`, {
  jse: null,
  catalog: {},
  stores: [],
  records: [],
  store: '',
  selected: '',
  page: 0,
  pageSize: 20,
  get totalPages() { return Math.ceil(this.records.length / this.pageSize) || 1; },
  get pageRecords() {
    const start = this.page * this.pageSize;
    return this.records.slice(start, start + this.pageSize);
  },
  async onPing(occasion) {
    if (occasion === 'mount') {
      this.jse = await alp.kit.jse({
        target: this.find('[name="jse"]'),
        props: { content: { json: {} }, onChange: c => this.handleChange(c) }
      });
      await this.refresh();
    }
  },
  async refresh() {
    this.catalog = await alp.load();
    this.stores = Object.keys(this.catalog);
    const target = this.catalog[this.store] ? this.store : (this.stores[0] || 'AlpDB/alp');
    if (target !== this.store || !this.records.length) await this.goStore(target);
  },
  async goStore(s) {
    this.store = s;
    this.records = this.catalog[s] || [];
    this.page = 0;
    this.records.length ? await this.goRecord(this.records[0]) : this.jse?.set({ json: {} });
  },
  async goRecord(r) {
    this.selected = r.fullPath;
    const data = await alp.loadRecord(r.fullPath);
    await this.jse?.set({ json: data || {} });
  },
  async handleChange({ json }) {
    if (!this.selected) return;
    clearTimeout(this._save);
    this._save = setTimeout(() => alp.saveRecord(this.selected, json), 300);
  },
  async addRecord() {
    const name = prompt('Record path (e.g., namespace.key or store:namespace.key):');
    if (!name) return;
    await alp.saveRecord(name, {});
    await this.refresh();
    const r = this.records.find(x => x.fullPath === name || x.key === name);
    if (r) await this.goRecord(r);
  },
  async delRecord() {
    if (!this.selected || !confirm(`Delete "${this.selected}"?`)) return;
    await alp.deleteRecord(this.selected);
    await this.refresh();
  }
});
