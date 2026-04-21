// utils/kits/tb.js - Tabulator kit
import { jszip } from './jszip.js';
import { gzip } from './gzip.js';

const tb = ({ target, ...props }) => new Promise(r => {
  const t = new Tabulator(target, props);
  t.on('tableBuilt', () => r(t));
});

tb.buildColumns = fields => fields.map(f => typeof f === 'string' ? { field: f, title: f } : f);

// Download table data as JSON
// options: { filename, timestamp (bool or format string), space (JSON indent) }
tb.downloadJson = (table, { filename = 'data', timestamp = true, space = 2 } = {}) => {
  const data = table.getData();
  const ts = timestamp ? '-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) : '';
  const blob = new Blob([JSON.stringify(data, null, space)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}${ts}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

// Download files as ZIP with progress tracking
// options: { filename, fileMapper(rowData) => [{ path, url }], onProgress(current, total, rowData) }
tb.downloadZip = async (table, { filename = 'download.zip', fileMapper, onProgress, selector = 'visible' } = {}) => {
  const JSZip = await jszip();
  const rows = table.getRows(selector);
  if (!rows.length) return { success: false, error: 'No rows to download' };

  const zip = new JSZip();
  let completed = 0;

  for (const row of rows) {
    const data = row.getData();
    const files = fileMapper ? fileMapper(data) : [];

    onProgress?.(completed, rows.length, data);

    for (const { path, url } of files) {
      try {
        const blob = await fetch(url).then(r => r.blob());
        zip.file(path, blob);
      } catch (e) {
        console.error('Failed to fetch:', url, e);
      }
    }
    completed++;
  }

  onProgress?.(completed, rows.length, null);

  const content = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  return { success: true, count: rows.length };
};

// Get compressed size of text using gzip
tb.getCompressedSize = text => gzip.sizeOf(text);

export { tb };
