// Reading a page's own input params, fragment first, query as fallback.
//
// Every page in this repo that takes input by URL wants the same precedence,
// for two reasons that pull in opposite directions:
//
//   The fragment is the DEFAULT and the private form. It never reaches a
//   server, so it carries unbounded payloads (GitHub Pages' edge 414s a URL
//   past roughly 8KB, which is what drove the payload to '#' in PR #165) and
//   leaks nothing to logs on the way.
//
//   The query is the FALLBACK, for contexts that eat the '#': a toss-render
//   frame (whose params shim answers ?query lookups, which is how a routed
//   toss delivers ?src= to the page it mounts), an email or chat client that
//   strips the fragment, a deep link pasted through a rewriter.
//
// So: put payloads in the fragment, put short addresses wherever is
// convenient, and read both here rather than picking one per page. This is
// the general form of the rule StageLink.read already applies to stage links
// and toss-render applies to its own params (toss-render keeps a private
// two-line copy on purpose: its critical render path loads no lib).
//
// Values come back URLSearchParams-decoded, so a base64 payload must use the
// URL-safe alphabet ('-' and '_'); a literal '+' would decode to a space.
// Every encoder in this repo emits base64url, and the decoders normalize it
// back, so this is a constraint on new callers rather than a live bug.
//
// withKey() is the write half, for a page that addresses its own view back
// into the fragment. It is the same contract read backwards, which is why it
// lives here rather than beside its one caller.
//
// Pure: no DOM beyond the location it is handed, no network. Attaches to
// window.UrlParams.
(() => {
  const parse = (s, strip) => {
    try { return new URLSearchParams(String(s || '').replace(strip, '')); }
    catch { return new URLSearchParams(); }
  };

  // The location to read when a caller passes nothing. Guarded so the module
  // loads in a non-browser realm (the tests import it against a stub).
  const here = () => (typeof location !== 'undefined' ? location : {});

  // One key, fragment first. Absent and empty are both misses, so a stray
  // '?src=' in a URL cannot mask a real '#src='.
  const get = (key, loc) => {
    const l = loc || here();
    const h = parse(l.hash, /^#/).get(key);
    if (h) return h;
    return parse(l.search, /^\?/).get(key) || null;
  };

  // The first key that has a value, as [key, value]. Lets a page declare its
  // input modes in precedence order (payload before address, say) and take
  // whichever arrived, in one read.
  const first = (keys, loc) => {
    for (const k of keys || []) {
      const v = get(k, loc);
      if (v) return [k, v];
    }
    return [null, null];
  };

  // Which half holds the value get() would take: 'hash', 'search', or null,
  // under the same rule (fragment first, absent and empty both misses). For a
  // caller whose several keys must ride together from one source, or whose
  // fragment payload must be parsed raw rather than URLSearchParams-decoded
  // (the stage spec encodes '&' inside paths, which get() would decode into a
  // live delimiter): pick the source here, read it with your own parser.
  const source = (key, loc) => {
    const l = loc || here();
    if (parse(l.hash, /^#/).get(key)) return 'hash';
    if (parse(l.search, /^\?/).get(key)) return 'search';
    return null;
  };

  // Set one key in a param string, leaving every other segment byte for byte.
  // The write half of get(): a page that addresses its own view in the
  // fragment (data-view's `#item=`) has to edit one key of a string it does
  // not own the rest of.
  //
  // Deliberately string surgery on the '&' segments rather than a
  // URLSearchParams round-trip. A fragment here routinely carries a '#gz='
  // payload beside the view key, and re-serializing re-encodes the payload:
  // correct in principle, a rewrite of tens of kilobytes in practice, and
  // wrong outright for a segment that is not 'k=v' shaped.
  //
  // A null, undefined, or empty value removes the key. A leading '#' or '?'
  // is preserved when the input has one, and dropped when the result is
  // empty, so an assignment never leaves a bare marker behind. Pass '#' for
  // an empty fragment to get one back on the result.
  const withKey = (params, key, value) => {
    const s = String(params ?? '');
    const mark = /^[#?]/.test(s) ? s[0] : '';
    const body = mark ? s.slice(1) : s;
    const seg = value == null || value === '' ? null : key + '=' + encodeURIComponent(value);
    const parts = body ? body.split('&') : [];
    const at = parts.findIndex(p => p.split('=')[0] === key);
    if (at >= 0) {
      if (seg) parts[at] = seg; else parts.splice(at, 1);
    } else if (seg) parts.push(seg);
    const out = parts.join('&');
    return out ? mark + out : '';
  };

  window.UrlParams = { get, first, source, withKey };
})();
