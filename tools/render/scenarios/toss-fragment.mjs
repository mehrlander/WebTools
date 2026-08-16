// screenshot.mjs interaction scenario: prove toss-render hands a trailing
// #frag to the rendered page as its own location.hash, in BOTH trust postures,
// and that the srcdoc path could not have.
//
//   node tools/render/screenshot.mjs pages/toss-render.html \
//     --hash "gh=mehrlander/web-tools:pages/data-view.html?src=docs/tools.json#item=probe" \
//     --script tools/render/scenarios/toss-fragment.mjs
//
// The render harness impersonates the GitHub contents API for this repo from
// the working tree, so the address-mode fetch resolves with no token and the
// page under test is the branch's copy.
//
// Four assertions, printed as ASSERT lines for the caller to read:
//   1. address mode  — the frame's own location.hash is the addressed frag,
//                      read directly (allow-same-origin).
//   2. address click — a fragment-only anchor stays on the rendered blob even
//                      though address mode stamped a GitHub Pages <base>.
//   3. payload mode  — a #gz= toss carrying a frag: the frame is opaque-origin,
//                      so the payload reports its hash out by postMessage.
//   4. control       — the same payload mounted as srcdoc sees an empty hash,
//                      which is why the blob: mount exists.
export default async function (page) {
  const results = {};

  // 1. Address mode: the initial URL already carried the frag.
  results.address = await page.evaluate(() => {
    const f = document.getElementById('frame');
    try {
      return {
        frameSrcIsBlob: /^blob:/.test(f.src || ''),
        hash: f.contentWindow.location.hash,
        docUrlKind: f.contentWindow.document.URL.split(':')[0],
      };
    } catch (e) { return { error: e.constructor.name }; }
  });

  // A raw # link used to resolve against addressHtml's <base> and navigate the
  // frame to GitHub Pages. Add one dynamically so the probe does not depend on
  // whichever subject page happens to be under test.
  results.anchor = await page.evaluate(async () => {
    const f = document.getElementById('frame');
    const d = f.contentDocument;
    const a = d.createElement('a');
    a.href = '#clicked-probe';
    a.textContent = 'fragment probe';
    d.body.appendChild(a);
    a.click();
    await new Promise(r => setTimeout(r, 50));
    return {
      frameSrcIsBlob: /^blob:/.test(f.contentWindow.location.href),
      hash: f.contentWindow.location.hash,
    };
  });

  // 2 and 3. A tiny payload that reports its own hash, mounted both ways.
  const payload = await page.evaluate(async () => {
    const html = '<!doctype html><html><body><script>' +
      'parent.postMessage({ probe: true, hash: location.hash, url: document.URL.split(":")[0] }, "*");' +
      '<\/script></body></html>';
    const catchOne = () => new Promise(r => {
      const h = (ev) => { if (ev.data && ev.data.probe) { removeEventListener('message', h); r(ev.data); } };
      addEventListener('message', h);
      setTimeout(() => r({ timeout: true }), 2500);
    });
    const mount = async (useBlob) => {
      const got = catchOne();
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms allow-modals allow-downloads');
      if (useBlob) f.src = URL.createObjectURL(new Blob([html], { type: 'text/html' })) + '#item=probe';
      else f.srcdoc = html;
      document.body.appendChild(f);
      const out = await got;
      f.remove();
      return out;
    };
    return { blob: await mount(true), srcdoc: await mount(false) };
  });

  const ok = (label, cond, detail) =>
    console.log(`ASSERT ${cond ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);

  ok('address mode: frame mounted at a blob: URL', results.address.frameSrcIsBlob === true,
     'src kind ' + (results.address.frameSrcIsBlob ? 'blob' : JSON.stringify(results.address)));
  ok('address mode: page sees the addressed fragment', results.address.hash === '#item=probe',
     'got ' + JSON.stringify(results.address.hash));
  ok('address mode: same-origin access preserved', results.address.docUrlKind === 'blob',
     'document.URL scheme ' + results.address.docUrlKind);
  ok('address mode: fragment-only link stays on the rendered blob',
     results.anchor.frameSrcIsBlob === true && results.anchor.hash === '#clicked-probe',
     'got ' + JSON.stringify(results.anchor));
  ok('payload mode: opaque page still sees its fragment', payload.blob.hash === '#item=probe',
     'got ' + JSON.stringify(payload.blob.hash));
  ok('control: srcdoc cannot receive one', payload.srcdoc.hash === '',
     'got ' + JSON.stringify(payload.srcdoc.hash));
}
