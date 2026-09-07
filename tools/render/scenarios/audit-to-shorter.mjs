// The handoff to pages/shorter.html, driven end to end: mark a unit DROP, add
// an insertion, press the adjudicate link, and read back the envelope the page
// gzipped into the fragment it opened.
//
// The link opens a new tab, so this replaces window.open rather than following
// it. What is asserted is the payload, not the destination page: the envelope
// declares shorter/1, carries the document as `original`, and its `proposal`
// is the projection, meaning shorter than the original and missing exactly the
// span that was dropped.
//
//   npm run shot -- pages/audit-render.html --width 430 \
//     --script tools/render/scenarios/audit-to-shorter.mjs

export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] span');

  const marked = await page.evaluate(() => {
    const d = Alpine.$data(document.body);
    // Every unit in the stored run already carries a verdict, KEEP included,
    // so 'unmarked' means KEEP rather than absent.
    const u = d.units.find(x => x.kind === 'sent' && (x.verdict || 'KEEP') === 'KEEP');
    if (!u) return null;
    Standoff.ops.verdict(d.so, d.a.text, { uid: u.uid, verdict: 'DROP' });
    Standoff.ops.insert(d.so, d.a.text, { after: u.uid, text: 'A placed sentence.' });
    d.view = 'standoff';
    return { uid: u.uid, text: d.a.text.slice(u.start, u.end) };
  });
  if (!marked) throw new Error('no KEEP prose unit to drop');
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    window.__opened = null;
    window.open = (url) => { window.__opened = url; return null; };
  });
  const link = await page.waitForSelector('a:has-text("adjudicate")');
  console.log('LABEL ' + (await link.textContent()).trim());
  await link.click();
  await page.waitForFunction(() => window.__opened);

  const env = await page.evaluate(async () => {
    const s = window.__opened.split('#gz=')[1];
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const ds = new DecompressionStream('gzip');
    return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text());
  });

  if (env.kind !== 'shorter/1') throw new Error(`envelope declares ${env.kind}`);
  if (env.original !== await page.evaluate(() => Alpine.$data(document.body).a.text))
    throw new Error('original is not the annotated document');
  if (env.proposal.includes(marked.text))
    throw new Error('the dropped span survived into the proposal');
  if (!env.proposal.includes('A placed sentence.'))
    throw new Error('the insertion did not land in the proposal');
  if (env.proposal.length >= env.original.length)
    throw new Error('the proposal is not shorter than the original');
  console.log(`ENVELOPE ${env.original.length} -> ${env.proposal.length} chars, title ${JSON.stringify(env.title)}`);
}
