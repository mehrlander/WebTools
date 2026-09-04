// Courier errand wsl-drs-cafr-index. Collects every document link on the DRS
// financial-report index. Why it must run here, and what the result decides:
// sites/wsldocs.sos.wa.gov/README.md.

const rows = [];
for (const a of document.querySelectorAll('a[href]')) {
  const href = a.href;
  if (!/\.(pdf|aspx|doc|docx)(\?|#|$)/i.test(href)) continue;
  if (/cafr_home\.aspx/i.test(href)) continue;
  const label = (a.textContent || '').trim().replace(/\s+/g, ' ');
  const year = (label.match(/\b(19|20)\d{2}\b/) || href.match(/\b(19|20)\d{2}\b/) || [''])[0];
  rows.push({ year, label, href, host: new URL(href).hostname });
}
rows.sort((a, b) => (a.year || '').localeCompare(b.year || '') || a.label.localeCompare(b.label));

const hosts = {};
for (const r of rows) hosts[r.host] = (hosts[r.host] || 0) + 1;

const out = [
  '# DRS financial reports, from the State Library index',
  '',
  '- Collected: ' + new Date().toISOString(),
  '- Page: ' + location.href,
  '- Title: ' + (document.title || '').trim(),
  '- Document links: ' + rows.length,
  '- Hosts: ' + (Object.entries(hosts).map(([h, n]) => h + ' (' + n + ')').join(', ') || 'none'),
  '',
  '| Year | Label | URL |',
  '| --- | --- | --- |',
  ...rows.map(r => '| ' + (r.year || '') + ' | ' + r.label.replace(/\|/g, '\\|') + ' | ' + r.href + ' |'),
];

if (!rows.length) {
  out.push('', '**No document links matched.** Frames on the page: ' + window.frames.length
    + '; anchors seen: ' + document.querySelectorAll('a[href]').length
    + '. If anchors is 0 the page builds its links after load; if frames is above 0 they are in a child document.');
}

return out.join('\n');
