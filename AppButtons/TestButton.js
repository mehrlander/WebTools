{
  className: 'btn btn-secondary w-full gap-2 normal-case mt-2',
  innerHTML: '<i class="ph ph-database text-lg"></i> Inspect IndexedDB',
  action: async function() {
    console.log('Database info:');
    console.log('- Database name:', this.db.name);
    console.log('- Version:', this.db.verno);
    const count = await this.db.items.count();
    console.log('- Total items:', count);
    
    const w = window.open('', '_blank', 'width=600,height=400');
    w.document.write(`
      <html>
      <head><title>IndexedDB Inspector</title></head>
      <body style="font-family: monospace; padding: 20px;">
        <h2>Data Jar Database</h2>
        <p>Database: ${this.db.name}</p>
        <p>Version: ${this.db.verno}</p>
        <p>Total items: ${count}</p>
        <hr>
        <p>Check browser console for more details.</p>
      </body>
      </html>
    `);
    w.document.close();
  }
}
