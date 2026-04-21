// components/bill-table-nested.js - Bill Table using nested alp-tb component
alp.define('bill-table-nested', _ => `
  <div class="flex flex-col h-full bg-base-100 p-2 gap-2 text-sm">
    <!-- Filters Row -->
    <div class="flex items-center gap-4 text-xs flex-wrap">
      <span class="font-semibold">Show:</span>
      <label class="flex items-center gap-1 cursor-pointer">
        <input type="checkbox" class="checkbox checkbox-xs" x-model="kindFilters.Bills" @change="applyFilters()">
        <span>Bills</span>
      </label>
      <label class="flex items-center gap-1 cursor-pointer">
        <input type="checkbox" class="checkbox checkbox-xs" x-model="kindFilters['Session Laws']" @change="applyFilters()">
        <span>Session Laws</span>
      </label>
      <label class="flex items-center gap-1 ml-auto">
        Size &gt;
        <input type="number" class="input input-xs w-16" placeholder="KB" x-model.number="sizeFilter" @input="applyFilters()">
      </label>
    </div>

    <!-- Nested TB Component -->
    <alp-tb x-ref="tb" class="flex-1"></alp-tb>

    <!-- Footer Controls -->
    <div class="flex justify-between items-center text-xs">
      <div class="flex items-center gap-2">
        <button class="btn btn-xs btn-error" @click="clearAll()">Clear All</button>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-xs btn-success" @click="loadSummaries()" :disabled="loadingSummaries" x-text="summariesText">Summaries</button>
      </div>
    </div>
  </div>
`, {
  // State
  tbRef: null,
  loaded: new Set(),

  kindFilters: { Bills: true, 'Session Laws': true },
  sizeFilter: null,

  loadingSummaries: false,
  summariesText: 'Summaries',

  // Biennium options (from leg kit)
  get bienniums() { return alp.kit.leg.bienniums; },
  get types() { return alp.kit.leg.types; },

  // Handle all lifecycle events
  async onPing(occasion) {
    if (occasion === 'mount') {
      // Wait for Alpine to process the nested component
      await this.$nextTick();

      // Get reference to the nested tb component
      const tbEl = this.$refs.tb;
      if (tbEl && tbEl._x_dataStack) {
        this.tbRef = tbEl._x_dataStack[0];

        // Configure the tb component with bill-specific columns
        this.tbRef.configure({
          columns: [
            { title: 'Doc Id', field: 'docId' },
            { title: 'Bill Id', field: 'billId' },
            { title: 'Bill No', field: 'billNo' },
            { title: 'Name', field: 'name' },
            { title: 'File Name', field: 'fileName' },
            { title: 'Date', field: 'date', sorter: 'datetime', sorterParams: { format: 'yyyy-MM-dd' } },
            { title: 'Size', field: 'size' },
            { title: 'Compressed', field: 'compressedSize' },
            { title: 'Chamber', field: 'chamber' },
            { title: 'Biennium', field: 'biennium' },
            { title: 'Kind', field: 'kind' },
            { title: 'Total $', field: 'totalDollarAmount', formatter: 'money', formatterParams: { thousand: ',', precision: 0 } },
            { title: 'Description', field: 'description' }
          ],
          zipMapper: d => {
            const urlHtm = d.urlXml.replace(/xml/gi, 'htm');
            const basePath = `${d.biennium}/${d.kind}/${d.chamber}/${d.name}`;
            return [
              { path: `${basePath}.xml`, url: d.urlXml },
              { path: `${basePath}.htm`, url: urlHtm }
            ];
          }
        });
      }

      // Load persisted data
      const saved = await this.load();
      if (saved?.tableData && this.tbRef) {
        this.tbRef.setData(saved.tableData);
        this.loaded = new Set(saved.loaded || []);
      }
    }
  },

  // Filter logic - applies to the nested tb's table
  applyFilters() {
    if (!this.tbRef?.table) return;
    this.tbRef.table.setFilter(row => {
      // Size filter
      if (this.sizeFilter && row.size <= this.sizeFilter) return false;
      // Kind filter
      if (!this.kindFilters[row.kind]) return false;
      return true;
    });
  },

  // Fetch bills for a biennium (uses leg kit)
  async fetchBiennium(biennium) {
    if (this.loaded.has(biennium)) {
      console.log('Already loaded:', biennium);
      return;
    }
    console.log('Loading all kinds for:', biennium);

    const data = await alp.kit.leg(biennium);
    // Add placeholder description for UI
    data.forEach(item => {
      if (item.description === null) item.description = 'Click "Summaries" to load';
      if (item._children) {
        item._children.forEach(child => {
          if (child.description === null) child.description = 'Click "Summaries" to load';
        });
      }
    });
    console.log('Loaded:', data.length, 'rows');

    if (this.tbRef?.table) {
      this.tbRef.table.addData(data);
    }

    this.loaded.add(biennium);
    await this.persist();
  },

  // Add data directly (for external use)
  async addData(data, source = 'external') {
    if (this.tbRef?.table) {
      this.tbRef.table.addData(data);
    }
    this.loaded.add(source);
    await this.persist();
  },

  // Persist current state
  async persist() {
    await this.save({
      tableData: this.getData(),
      loaded: [...this.loaded]
    });
  },

  // Clear all data
  async clearAll() {
    if (this.tbRef) {
      this.tbRef.setData([]);
    }
    this.loaded.clear();
    this.sizeFilter = null;
    await this.del();
  },

  // Load summaries for visible rows
  async loadSummaries() {
    console.log('Loading summaries - button clicked');
    if (!this.tbRef?.table) return;

    const rows = this.tbRef.table.getRows('visible');
    console.log('Processing', rows.length, 'visible rows');

    this.loadingSummaries = true;

    try {
      for (let i = 0; i < rows.length; i++) {
        const d = rows[i].getData();
        if (d.description === 'Click "Summaries" to load') {
          this.summariesText = `Loading ${i + 1}/${rows.length}`;
          rows[i].update({ description: 'Loading...' });

          try {
            const { description, totalDollarAmount, xml } = await alp.kit.leg.fetchBillSummary(d.urlXml);
            const compressedSize = Math.round(await alp.kit.gzip.sizeOf(xml) / 1024);

            rows[i].update({
              description: description || 'No description',
              totalDollarAmount,
              compressedSize
            });
            console.log('Loaded', d.name, '- $', totalDollarAmount, '- Compressed:', compressedSize, 'KB');
          } catch (e) {
            console.error('Failed to load', d.name, e);
            rows[i].update({ description: 'Error loading' });
          }
        }
      }
      await this.persist();
    } finally {
      this.loadingSummaries = false;
      this.summariesText = 'Summaries';
    }
    console.log('Done loading summaries');
  },

  // Get all data (for external use)
  getData() {
    return this.tbRef?.getData() || [];
  },

  // Get visible data (for external use)
  getVisibleData() {
    return this.tbRef?.getVisibleData() || [];
  }
});
