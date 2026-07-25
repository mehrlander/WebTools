// Reading a shorter toss. One rule decides what a payload is, so a caller can
// send whichever shape is natural without saying which it picked:
//
//   BARE      any text: prose, markdown, a pasted draft. Fills the left
//             column and leaves the right one to the page (paste a shorter
//             version, or let the local model draft one).
//   ENVELOPE  a JSON object carrying both sides, so a link opens straight
//             into the adjudication view instead of the input form.
//             { kind: "shorter/1", original, proposal?, title? }
//
// The discriminator is deliberately narrow, for the same reason data-payload's
// is: the thing being shortened is arbitrary text, and some of it is JSON. An
// object qualifies only when it declares `kind: "shorter/1"`, or when it has a
// string `original`. A JSON document that happens to parse is otherwise BARE,
// which is what a reader shortening a config file wants.
//
// `proposal` is optional in the envelope. With it, the page can compare on
// arrival; without it, an envelope is just a bare payload that also carries a
// title. Neither side is validated past being a string: the page word-diffs
// whatever it is given, and an empty proposal is the page's own "draft one for
// me" path, not an error here.
//
// Pure: no DOM, no network. Fetching an address is the page's job
// (pages/shorter.html); this module only says what arrived. Attaches to
// window.ShorterPayload.
(() => {
  const KIND = 'shorter/1';

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

  function isEnvelope(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    return v.kind === KIND || typeof v.original === 'string';
  }

  // text -> { kind, title, original, proposal }. `name` is an optional
  // filename from the address, used as the title when the payload carries
  // none, so an addressed toss says what it opened.
  function read(text, opts) {
    const raw = String(text ?? '');
    const name = (opts && opts.name) || '';
    const t = raw.trim();
    if (t.startsWith('{')) {
      let parsed = null;
      try { parsed = JSON.parse(t); } catch (e) { /* not json: bare text */ }
      if (isEnvelope(parsed)) {
        return {
          kind: 'envelope',
          title: str(parsed.title) || name,
          original: str(parsed.original),
          proposal: str(parsed.proposal),
        };
      }
    }
    return { kind: 'bare', title: name, original: raw, proposal: '' };
  }

  // Whether the page should open in review rather than the input form: both
  // sides present means the adjudication is the point of the link.
  const isReviewable = (p) => !!(p && p.original.trim() && p.proposal.trim());

  window.ShorterPayload = { KIND, read, isEnvelope, isReviewable, parseSpec };
})();
