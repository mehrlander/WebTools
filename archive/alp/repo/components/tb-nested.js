// components/tb-nested.js - Simplest possible nested alp-tb example
alp.define('tb-nested', _ => `
  <div class="flex flex-col h-full bg-base-100 p-4 gap-3 text-sm">
    <div class="text-lg font-semibold">Nested Table Example</div>
    <alp-tb class="flex-1 border rounded"></alp-tb>
  </div>
`, {
  onPing(occasion) {
    if (occasion === 'mount') {
      // find() returns proxy queue if component not ready - calls are queued and replayed when ready()
      this.find('alp-tb').configure({
        columns: [
          { title: 'ID', field: 'id' },
          { title: 'Name', field: 'name' },
          { title: 'Value', field: 'value' }
        ],
        data: [
          { id: 1, name: 'Alpha', value: 100 },
          { id: 2, name: 'Beta', value: 200 },
          { id: 3, name: 'Gamma', value: 300 }
        ]
      });
    }
  }
});
