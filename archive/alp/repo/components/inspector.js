// components/inspector.js - Alp Inspector Component
import { alp } from '../core.js';
const { modal } = alp.fills;

alp.define('inspector', _ => modal(`
  <div class="flex-1 overflow-hidden relative">
    <div name="jse" class="absolute inset-0"></div>
  </div>
  <div class="flex bg-base-300 text-xs flex-shrink-0 p-2 items-center gap-2">
    <select class="select select-xs w-auto min-w-0" @change="goStore($event.target.value)">
      <template x-for="s in stores"><option :value="s" :selected="s === store" x-text="s"></option></template>
    </select>
    <div class="flex-1 overflow-x-auto min-w-0">
      <div class="flex gap-0.5 whitespace-nowrap">
        <template x-for="r in records" :key="r.fullPath">
          <button class="btn btn-xs" @click="goRecord(r)" :class="selected===r.fullPath?'btn-primary':'btn'">
            <span x-text="r.key"></span>
          </button>
        </template>
      </div>
    </div>
    <button class="btn btn-xs btn-error btn-outline" @click="clear()">Clear</button>
  </div>
`), {
  store: 'AlpDB/alp',
  catalog: {},
  stores: [],
  records: [],
  selected: '',
  jse: null,
  _settingContent: false,
  async refresh() {
    this.catalog = await alp.load();
    this.stores = Object.keys(this.catalog);
    const target = this.catalog[this.store] ? this.store : (this.stores[0] || 'AlpDB/alp');
    if (target !== this.store || !this.records.length) {
      await this.goStore(target);
    } else {
      // Refresh records list and reload current record if it exists
      this.records = this.catalog[this.store] || [];
      if (this.selected && this.records.some(r => r.fullPath === this.selected)) {
        const r = this.records.find(r => r.fullPath === this.selected);
        await this.goRecord(r);
      } else if (this.records.length) {
        await this.goRecord(this.records[0]);
      }
    }
  },
  async goStore(s) {
    this.store = s;
    this.records = this.catalog[this.store] || [];
    this.records.length ? await this.goRecord(this.records[0]) : this.jse?.set({ json: {} });
  },
  async open() {
    this.find('dialog').showModal();
    await Alpine.nextTick();
    this.jse ||= await alp.kit.jse({
      target: this.find('[name="jse"]'),
      props: { mode: 'tree', content: { json: {} }, onChange: c => this.handleChange(c) }
    });
    await this.refresh();
  },
  async handleChange({ json }) {
    if (this.selected && !this._settingContent) {
      await alp.saveRecord(this.selected, json);
    }
  },
  async goRecord(r) {
    this.selected = r.fullPath;
    const data = await alp.loadRecord(r.fullPath);
    if (this.jse) {
      this._settingContent = true;
      await this.jse.set({ json: data || {} });
      this._settingContent = false;
    }
  },
  async clear() {
    await alp.deleteRecord(this.selected);
    await this.refresh();
  },
  onPing(occasion, payload) {
    if (occasion === 'save-record' || occasion === 'delete-record') {
      this.refresh();
    }
  }
});

// Auto-mount
const el = (t, a) => Object.assign(document.createElement(t), a);
const wrap = el('div', { className: 'fixed bottom-4 right-4 z-50' });
wrap.innerHTML = `
  <button class="text-primary" onclick="this.nextElementSibling.data.open()">
    <i class="ph ph-gear-six text-4xl"></i>
  </button>
  <alp-inspector></alp-inspector>
`;
document.body.appendChild(wrap);
