// Courier errand wsl-drs-cafr-index. Runs ON the DRS CAFR index page at
// wsldocs.sos.wa.gov, fetched and executed by bookmarklets/courier.js.
//
// Same-origin by construction, which is the whole reason this shape exists: the
// browser has already loaded the page as an ordinary navigation and cleared
// Cloudflare, so reading its DOM makes no cross-origin request and there is
// nothing for CORS to refuse. A sandboxed session reaching the other way gets a
// 403 from the interstitial.
//
// Contract (courier/README.md): the body returns a string, or a promise of one.
// It reads and returns; it does not navigate, submit, or write.

const rows = [];
for (const a of document.querySelectorAll('a[href]')) {
  const href = a.href;
  if (!/\.(pdf|aspx|doc|docx)(\?|#|$)/i.test(href)) continue;
  if (/cafr_home\.aspx/i.test(href)) continue;                 // the index itself
  const label = (a.textContent || '').trim().replace(/\s+/g, ' ');
  // The year is what the caller is addressing by, so pull it where the page
  // states one, from the link text first and the URL second.
  const year = (label.match(/\b(19|20)\d{2}\b/) || href.match(/\b(19|20)\d{2}\b/) || [''])[0];
  rows.push({ year, label, href, host: new URL(href).hostname });
}
rows.sort((a, b) => (a.year || '').localeCompare(b.year || '') || a.label.localeCompare(b.label));

// Which hosts the documents actually sit on decides whether the session can
// fetch them itself, so it is counted rather than left to be eyeballed.
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

// A page that yields nothing is a finding, not a failure: it says the links are
// built after load, or live in a frame, and it says so where the caller reads it.
if (!rows.length) {
  out.push('', '**No document links matched.** Frames on the page: ' + window.frames.length
    + '; anchors seen: ' + document.querySelectorAll('a[href]').length
    + '. If anchors is 0 the page builds its links after load; if frames is above 0 they are in a child document.');
}

return out.join('\n');
