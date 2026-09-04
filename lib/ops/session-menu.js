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
//           caption and rows carry a leading glyph and mathematical sans-serif
//           bold for the lead word or the age; see bold() below. The age is
//           time since the session was LAST ACTIVE, and the list is ordered by
//           the same value; see active() below.
//           or { caption: 'ERROR …', rows: [], urls: {}, error }
//
// The caption is the menu's prompt and says which case the clipboard produced.
// Each row is a label; `urls` maps a label back to the page to open, so the
// caller does one dictionary lookup and never parses a row. A label carries no
// id unless it would otherwise repeat another row's, since an id is noise to a
// reader and the map, not the row, is what identifies the session.
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
  var ROWS = 12;        // rows offered when the branch does not fill the list
  var ASK = 56;         // characters of the ask a row carries, two phone lines

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

  // Mathematical sans-serif bold, the alphabet Choose-BackTap already sets its
  // captions in. Letters and digits only; anything else passes through, so a
  // styled word beside plain text reads as emphasis rather than as a font.
  function bold(str) {
    return String(str).replace(/[A-Za-z0-9]/g, function (ch) {
      var c = ch.charCodeAt(0), base;
      if (c >= 65 && c <= 90) base = 0x1D5D4 - 65;
      else if (c >= 97 && c <= 122) base = 0x1D5EE - 97;
      else base = 0x1D7EC - 48;
      return String.fromCodePoint(base + c);
    });
  }
  // The two kinds of row share a glyph with the header that introduces them,
  // so the header is also the legend.
  var HERE = '\uD83C\uDF3F';    // 🌿 on the copied branch
  var RECENT = '\uD83D\uDD58';  // 🕘 recent, any branch

  // Where the op is when something throws, so an error result names the step
  // rather than only the engine's message. JavaScriptCore's bare "Type error"
  // on 2026-09-03 said nothing about which of these it came from.
  var stage = 'start';

  function readIndex() {
    stage = 'open';
    var x = new XMLHttpRequest();
    x.open('GET', 'https://api.github.com/repos/' + STORE + '/contents/' + INDEX + '?ref=main', false);
    stage = 'headers';
    x.setRequestHeader('Authorization', auth(token));
    // Raw, not the contents envelope, which base64s an 877 KB body.
    x.setRequestHeader('Accept', 'application/vnd.github.raw');
    stage = 'send';
    x.send();
    stage = 'status ' + x.status;
    if (x.status !== 200) throw new Error('HTTP ' + x.status + ' reading ' + INDEX);
    stage = 'parse';
    return JSON.parse(x.responseText);
  }

  // On failure, three cheap requests that between them say whether the runner
  // can reach the API at all, whether a header breaks it, and whether it is the
  // preflight that a non-simple header forces. Each reports a status or the
  // error's name; none can throw out of here.
  function probe() {
    var url = 'https://api.github.com/repos/' + STORE + '/contents/' + INDEX + '?ref=main';
    var tries = [
      ['zen plain', 'https://api.github.com/zen', {}],
      ['zen auth', 'https://api.github.com/zen', { Authorization: auth(token) }],
      ['index auth only', url, { Authorization: auth(token) }],
    ];
    var out = {};
    tries.forEach(function (t) {
      try {
        var x = new XMLHttpRequest();
        x.open('GET', t[1], false);
        Object.keys(t[2]).forEach(function (k) { x.setRequestHeader(k, t[2][k]); });
        x.send();
        out[t[0]] = 'status ' + x.status;
      } catch (e) { out[t[0]] = (e && e.name || 'Error') + ': ' + (e && e.message || ''); }
    });
    return out;
  }

  function onBranch(r) {
    return !!branch && ((r.branches || []).indexOf(branch) >= 0
      || (r.repos || []).some(function (p) { return p && p.branch === branch; }));
  }
  // WHEN A SESSION WAS LAST DOING SOMETHING, which is what a reader asking for
  // "the latest session on this branch" means. This op ordered by `started`
  // until 2026-09-04, and the two part company constantly: over the 304 rows on
  // file that day, keying on `ended` moved 258 of them, and the session that had
  // actually run most recently sat third. A session runs for hours (the longest
  // on file spans six days), so its start time says when someone picked the
  // work up, not whether it is the live one.
  //
  // `ended` is the record's last transcript timestamp and the recorder rewrites
  // the whole record on every Stop, so a running session's own value advances
  // with it. `started` is the fallback, not a second opinion: every row in the
  // cache carries `ended`, and a row without one is older than this rule.
  function active(r) { return r.ended || r.started || ''; }
  function byActive(a, b) {
    var x = active(a), y = active(b);
    return x < y ? 1 : x > y ? -1 : 0;
  }
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
    return (here ? HERE : RECENT) + ' ' + bold(ago(active(r))) + '  ' + ask;
  }
  // The title names the branch by its slug: `claude/` says nothing a reader
  // needs and the six-character suffix is there for uniqueness, not reading.
  function short(b) { return String(b || '').replace(/^claude\//, '').replace(/-[a-z0-9]{6}$/, ''); }

  function build(idx) {
    var rows = idx.rows || [];
    var here = rows.filter(onBranch).sort(byActive);
    var seen = {};
    here.forEach(function (r) { seen[r.id] = true; });
    var rest = rows.slice().sort(byActive).filter(function (r) { return !seen[r.id]; })
                   .slice(0, Math.max(0, ROWS - here.length));

    // The header is the menu's prompt: what this list is, in the glyph its
    // rows carry, then the branch. In words where the rows alone cannot say
    // it, since a list with no marked row could mean the branch had no
    // session or that none was on the clipboard.
    var missed = !!branch && !here.length;
    var caption = !branch ? RECENT + ' ' + bold('Recent') + ' · no branch on the clipboard'
      : here.length ? HERE + ' ' + bold('This branch') + ' · ' + short(branch)
      : RECENT + ' ' + bold('Recent') + ' · none yet on ' + short(branch);
    // THE INDEX'S AGE, at two thresholds, and `missed` is the one that matters.
    // The cache is rebuilt only when someone opens the estate's Sessions or
    // State view, so a session reaches it two hops behind: its record lands on
    // the first Stop, the crawl folds it in whenever the crawl next runs. That
    // makes "none yet on x" a fact about the CACHE wearing the clothes of a
    // fact about the branch, and the reader cannot tell them apart. So the age
    // rides that case at every age, however fresh. Where a row DID match, the
    // age only warns that a newer session might be missing, which is worth six
    // hours of silence rather than a stamp on every menu.
    var age = Date.now() - Date.parse(idx.generatedAt || '');
    if (isFinite(age) && (missed || age > 6 * 3600000)) {
      caption += ' · index ' + ago(idx.generatedAt) + ' old';
    }

    var labels = [], urls = {};
    here.concat(rest).forEach(function (r, i) {
      var l = label(r, i < here.length);
      if (urls[l] !== undefined) l += ' · ' + r.id;   // only a repeat earns its id
      labels.push(l);
      urls[l] = PAGE + r.id;
    });
    return { caption: caption, rows: labels, urls: urls, branch: branch, count: rows.length };
  }

  try {
    if (!token) throw new Error('no token reached the op');
    var idx = readIndex();
    stage = 'build';
    return build(idx);
  } catch (err) {
    var name = err && err.name && err.name !== 'Error' ? err.name + ': ' : '';
    var msg = 'ERROR ' + name + (err && err.message || String(err)) + ' at ' + stage;
    return { caption: msg, rows: [], urls: {}, branch: branch, error: msg, probe: probe() };
  }
})
