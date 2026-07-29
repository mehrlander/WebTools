// Reading a shorter toss. One rule decides what a payload is, so a caller can
// send whichever shape is natural without saying which it picked:
//
//   BARE      any text: prose, markdown, a pasted draft. Fills the original
//             column and leaves the versions to the page.
//   ENVELOPE  a JSON object carrying the original and, optionally, one or more
//             shortenings of it, so a link opens straight into the
//             adjudication view instead of the input form.
//
// The discriminator is deliberately narrow, for the same reason data-payload's
// is: the thing being shortened is arbitrary text, and some of it is JSON. An
// object qualifies only when it declares a known `kind`, or when it has a
// string `original`. A JSON document that happens to parse is otherwise BARE,
// which is what a reader shortening a config file wants.
//
//   { kind: "shorter/1", original, proposal?, title? }
//   { kind: "shorter/2", original, title?, source?, proposals: [ … ] }
//
// shorter/1's single `proposal` string is the pasted-from-a-chat case and stays
// valid: it reads as a one-entry `proposals`. shorter/2 exists for the case
// that shape cannot express, several independent shortenings of one document
// adjudicated side by side.
//
// A proposal carries its wording in one of two forms:
//
//   { label, note?, text }              the whole document, rewritten
//   { label, note?, blocks: {"7": …} }  a sparse map of block index -> new text
//
// The block form is what a generated bundle should use, and it is the reason a
// bundle stays small: a version that rewrites four paragraphs of a forty
// paragraph document stores four paragraphs, not forty. Blocks are the
// original split on blank lines (splitBlocks below owns that rule, so the
// producer and the page cannot disagree about it). An omitted index means
// unchanged; "" means delete the block. Both forms are materialized to full
// text here, so everything downstream sees one shape.
//
// Pure: no DOM, no network. Fetching an address is the page's job
// (pages/shorter.html); this module only says what arrived, and lib/shorter-merge.js
// aligns the versions once it has. Attaches to window.ShorterPayload.
(() => {
  const KIND = 'shorter/2';
  const KINDS = ['shorter/1', 'shorter/2'];

  const str = (v) => (typeof v === 'string' ? v : '');

  // owner/repo[@ref]:path -> { repo, ref, path }; null when it isn't one, so
  // a caller can treat the string as a path in the hub repo instead. ':' can't
  // appear in a git ref name, which is what makes the split unambiguous.
  //
  // A missing @ref reads as '', not 'main': the empty ref falls through to the
  // repo's DEFAULT branch on the contents API, which is right for a repo whose
  // default is named something else. StageLink.parseItem agrees;
  // DataPayload.parseSpec defaults to 'main' instead, which is a latent
  // difference between the two readers rather than a live bug today, since
  // every repo in this estate defaults to main.
  function parseSpec(spec) {
    const m = String(spec || '').match(/^([\w.-]+\/[\w.-]+)(?:@([^:]+))?:(.+)$/);
    return m ? { repo: m[1], ref: m[2] || '', path: m[3] } : null;
  }

  // The block split, owned here because a bundle's block indices are only
  // meaningful against one definition of it. Separators are kept alongside the
  // text rather than thrown away, so assembling the untouched blocks returns
  // the document byte for byte.
  function splitBlocks(text) {
    const src = String(text ?? '');
    const out = [];
    const re = /\n[ \t]*\n[\s]*/g;
    let last = 0, m;
    while ((m = re.exec(src))) {
      out.push({ text: src.slice(last, m.index), sep: m[0] });
      last = m.index + m[0].length;
    }
    out.push({ text: src.slice(last), sep: '' });
    return out;
  }

  // blocks map -> full text. A deleted block takes its separator with it, or
  // the deletion would leave a widening run of blank lines behind.
  function materialize(original, blocks) {
    const parts = splitBlocks(original);
    let out = '';
    for (let i = 0; i < parts.length; i++) {
      const override = blocks && Object.prototype.hasOwnProperty.call(blocks, String(i))
        ? str(blocks[String(i)]) : null;
      const text = override === null ? parts[i].text : override;
      if (override !== null && text === '') continue;
      out += text + parts[i].sep;
    }
    return out;
  }

  // Normalize whatever the envelope carried into [{label, note, text}].
  // Labels are positional when absent, so an unlabelled bundle still gives the
  // reader something to choose between.
  function readProposals(parsed, original) {
    const raw = Array.isArray(parsed && parsed.proposals) ? parsed.proposals : null;
    if (raw) {
      return raw
        .map((p, i) => {
          if (!p || typeof p !== 'object') return null;
          const text = typeof p.text === 'string'
            ? p.text
            : (p.blocks && typeof p.blocks === 'object' ? materialize(original, p.blocks) : '');
          return { label: str(p.label) || 'Version ' + (i + 1), note: str(p.note), text };
        })
        .filter(p => p && p.text.trim());
    }
    const one = str(parsed && parsed.proposal);
    return one.trim() ? [{ label: 'Shorter', note: '', text: one }] : [];
  }

  function isEnvelope(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    return KINDS.includes(v.kind) || typeof v.original === 'string';
  }

  // text -> { kind, title, source, original, proposals, proposal }. `name` is
  // an optional filename from the address, used as the title when the payload
  // carries none, so an addressed toss says what it opened.
  //
  // `proposal` is kept on the result as the first version's text: it is what
  // the single-version callers already read, and dropping it would break them
  // for no gain.
  function read(text, opts) {
    const raw = String(text ?? '');
    const name = (opts && opts.name) || '';
    const t = raw.trim();
    if (t.startsWith('{')) {
      let parsed = null;
      try { parsed = JSON.parse(t); } catch (e) { /* not json: bare text */ }
      if (isEnvelope(parsed)) {
        const original = str(parsed.original);
        const proposals = readProposals(parsed, original);
        return {
          kind: 'envelope',
          title: str(parsed.title) || name,
          source: str(parsed.source),
          original,
          proposals,
          proposal: proposals.length ? proposals[0].text : '',
        };
      }
    }
    return { kind: 'bare', title: name, source: '', original: raw, proposals: [], proposal: '' };
  }

  // Whether the page should open in review rather than the input form: an
  // original plus at least one version means the adjudication is the point of
  // the link.
  const isReviewable = (p) => !!(p && p.original.trim() && p.proposals && p.proposals.length);

  window.ShorterPayload = { KIND, KINDS, read, isEnvelope, isReviewable, parseSpec, splitBlocks, materialize };
})();
