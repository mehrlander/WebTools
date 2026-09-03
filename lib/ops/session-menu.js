// session-menu.js — the sessions a phone can open, as a menu: which are on the
// copied branch, which are recent, and where each one's page is.
//
// An op: one function expression, no page assumed. The phone fetches this file
// and evaluates it inside a data: page that Shortcuts coerces to text (Run-Op,
// in shortcut-tools), so the whole file must be a value, and the value must be
// a function of one serialisable argument returning one serialisable result.
// Nothing here may reach window or document; lib/ops/README.md is the contract
// and tools/test/code-layers.test.mjs holds it.
//
//   input   { input: <clipboard text>, token: <GitHub token> }
//   result  { caption, rows: [label], urls: { label: url }, branch, count }
//           or { caption: 'ERROR …', rows: [], urls: {}, error }
//
// The caption is the menu's prompt and says which case the clipboard produced.
// Each row is a label; `urls` maps a label back to the page to open, so the
// caller does one dictionary lookup and never parses a row. A label ends with
// the session's id, which keeps two rows distinct when their asks are the same.
//
// SYNCHRONOUS ON PURPOSE. The coercion that runs this captures the document at
// a moment nobody has documented, and a promise resolving after that returns
// empty with no error. So the index is read with a blocking XMLHttpRequest, the
// one shape known to complete before the capture (pages/gh-recent-branches.html
// in shortcut-tools measured this first).
(function sessionMenu(input) {
  var STORE = 'mehrlander/web-tools-private';
  var INDEX = 'state/sessions.json';
  var PAGE = 'https://mehrlander.github.io/web-tools/pages/session.html#id=';
  var ROWS = 14;        // rows offered when the branch does not fill the list
  var ASK = 64;         // characters of the ask a row carries, about two phone lines

  input = input || {};
  var token = String(input.token || '');
  var branch = branchOf(input.input || input.branch || '');

  // What the Claude app puts on the clipboard has varied, so a full ref, a URL
  // carrying one, or the bare name all reduce to the name. Only the first line
  // counts: a clipboard can hold a caption whose first line is the branch.
  function branchOf(text) {
    var s = String(text || '').trim().split(/\r?\n/)[0].trim();
    s = s.replace(/^.*?(?:tree\/|compare\/|branch\.html#gh=[^@]+@|branch=)/, '')
         .replace(/^origin\//, '').replace(/^refs\/heads\//, '')
         .replace(/[?#&].*$/, '').replace(/\/$/, '');
    return /\//.test(s) && !/\s/.test(s) ? s : '';
  }

  // The stored token may or may not carry its scheme; accept either.
  function auth(t) { return /^(Bearer|token) /i.test(t) ? t : 'Bearer ' + t; }

  function readIndex() {
    var x = new XMLHttpRequest();
    x.open('GET', 'https://api.github.com/repos/' + STORE + '/contents/' + INDEX + '?ref=main', false);
    x.setRequestHeader('Authorization', auth(token));
    // Raw, not the contents envelope, which base64s an 877 KB body.
    x.setRequestHeader('Accept', 'application/vnd.github.raw');
    x.send();
    if (x.status !== 200) throw new Error('HTTP ' + x.status + ' reading ' + INDEX);
    return JSON.parse(x.responseText);
  }

  function onBranch(r) {
    return !!branch && ((r.branches || []).indexOf(branch) >= 0
      || (r.repos || []).some(function (p) { return p && p.branch === branch; }));
  }
  function byStarted(a, b) { return a.started < b.started ? 1 : a.started > b.started ? -1 : 0; }
  function ago(iso) {
    var mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!isFinite(mins)) return '';
    if (mins < 60) return mins + 'm';
    if (mins < 1440) return Math.round(mins / 60) + 'h';
    return Math.round(mins / 1440) + 'd';
  }
  // An ask is markdown and a menu row is not: fences, link brackets and URLs,
  // emphasis and heading marks go.
  function plain(md) {
    return String(md || '').replace(/```[\s\S]*?```/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`#>]+/g, '')
      .replace(/\s+/g, ' ').trim();
  }
  function label(r, here) {
    var ask = plain(r.ask);
    if (ask.length > ASK) ask = ask.slice(0, ASK - 1) + '…';
    return [here ? 'this branch' : '', ago(r.started), ask, r.id].filter(Boolean).join(' · ');
  }

  function build(idx) {
    var rows = idx.rows || [];
    var here = rows.filter(onBranch).sort(byStarted);
    var seen = {};
    here.forEach(function (r) { seen[r.id] = true; });
    var rest = rows.slice().sort(byStarted).filter(function (r) { return !seen[r.id]; })
                   .slice(0, Math.max(0, ROWS - here.length));

    // In words, because the rows alone cannot say it: a list with no marked
    // row could mean the branch had no session or that none was on the clipboard.
    var caption = !branch ? 'No branch on the clipboard, showing recent'
      : here.length ? here.length + ' on ' + branch
      : 'No session on ' + branch + ' yet, showing recent';
    if (idx.generatedAt) caption += ' · index ' + ago(idx.generatedAt);

    var labels = [], urls = {};
    here.concat(rest).forEach(function (r, i) {
      var l = label(r, i < here.length);
      labels.push(l);
      urls[l] = PAGE + r.id;
    });
    return { caption: caption, rows: labels, urls: urls, branch: branch, count: rows.length };
  }

  try {
    if (!token) throw new Error('no token reached the op');
    return build(readIndex());
  } catch (err) {
    return { caption: 'ERROR ' + err.message, rows: [], urls: {}, branch: branch, error: err.message };
  }
})
