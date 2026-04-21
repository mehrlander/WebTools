// components/tb.js - Lean Tabulator wrapper
alp.define('tb', _ => `
  <div class="flex flex-col h-full bg-base-100 p-2 gap-2 text-sm">
    <div class="flex items-center gap-4 text-xs">
      <label class="flex items-center gap-1">
        <span class="font-semibold">Search:</span>
        <input type="text" class="input input-xs w-32" x-model="search" @input="applyFilter()" placeholder="Filter...">
      </label>
      <span class="flex-1"></span>
      <span x-text="rowCount + ' rows'" class="text-base-content/70"></span>
    </div>
    <div name="table" class="flex-1"></div>
    <div class="flex justify-end gap-2 text-xs">
      <button class="btn btn-xs btn-secondary" @click="downloadJson()">Download JSON</button>
      <template x-if="zipMapper">
        <button class="btn btn-xs btn-primary" @click="downloadZip()" :disabled="downloading" x-text="downloadText">Download Zip</button>
      </template>
    </div>
  </div>
`, {
  table: null,
  search: '',
  rowCount: 0,
  downloading: false,
  downloadText: 'Download Zip',
  zipMapper: null,
  columns: [],
  data: [],

  async onPing(occasion, data) {
    switch (occasion) {
      case 'mount':
        this.table = await alp.kit.tb({
          target: this.find('[name="table"]'),
          layout: 'fitData',
          height: '300px',
          columns: alp.kit.tb.buildColumns(this.columns)
        });
        this.table.on('dataFiltered', (f, rows) => this.rowCount = rows.length);
        this.table.on('dataLoaded', d => this.rowCount = d.length);
        if (this.data.length) this.table.setData(this.data);
        break;
      case 'ready':
        // Parse configuration from host attributes
        const config = {};
        if (data.columns) {
          try { config.columns = JSON.parse(data.columns); } catch {}
        }
        if (data.data) {
          try { config.data = JSON.parse(data.data); } catch {}
        }
        if (Object.keys(config).length) this.configure(config);
        break;
    }
  },

  configure({ columns, data, zipMapper }) {
    if (columns) this.columns = columns;
    if (zipMapper) this.zipMapper = zipMapper;
    if (data) this.setData(data);
    if (this.table && columns) this.table.setColumns(alp.kit.tb.buildColumns(columns));
  },

  setData(data) {
    this.data = data;
    this.table?.setData(data);
  },

  getData() { return this.table?.getData() || []; },
  getVisibleData() { return this.table?.getRows('visible').map(r => r.getData()) || []; },

  applyFilter() {
    if (!this.table) return;
    this.table.setFilter(row => {
      if (!this.search) return true;
      const s = this.search.toLowerCase();
      return Object.values(row).some(v => String(v).toLowerCase().includes(s));
    });
  },

  downloadJson() {
    alp.kit.tb.downloadJson(this.table, { filename: 'table-data', timestamp: true });
  },

  async downloadZip() {
    if (!this.zipMapper) return;
    this.downloading = true;
    this.downloadText = 'Preparing...';
    try {
      await alp.kit.tb.downloadZip(this.table, {
        filename: 'download.zip',
        fileMapper: this.zipMapper,
        onProgress: (cur, tot, d) => this.downloadText = d ? `${cur + 1}/${tot}` : 'Generating...'
      });
    } finally {
      this.downloading = false;
      this.downloadText = 'Download Zip';
    }
  }
});
