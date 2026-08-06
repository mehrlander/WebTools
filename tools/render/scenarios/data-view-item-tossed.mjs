// screenshot.mjs interaction scenario: the same `#item=` addressing, end to
// end through a toss. data-view-item.mjs drives the page directly; this one
// proves the two halves meet, since the page reads `location.hash` and inside
// a toss that hash is manufactured by the shell's blob mount rather than typed
// by a reader.
//
//   node tools/render/screenshot.mjs pages/toss-render.html \
//     --hash "gh=mehrlander/web-tools:pages/data-view.html#item=README.md" \
//     --script tools/render/scenarios/data-view-item-tossed.mjs
//
// Address mode, so the frame is same-origin and can be read into directly.
// The built-in demo envelope is the payload, which is why no ?src= is needed
// and nothing here depends on a committed fixture.
//
// The #data= route resolves onto this same showAddress call with the frag
// carried through (see showRoute in pages/toss-render.html), so covering
// address mode covers the route; the route's own frag split is held by
// tools/render/scenarios/toss-fragment.mjs.
export default async function (page) {
  // The frame boots its own gh.load chain after the shell's, so give it more
  // than the shell's settle time before reading its Alpine state.
  await page.waitForTimeout(3000);

  const inner = await page.evaluate(() => {
    const f = document.getElementById('frame');
    try {
      const w = f.contentWindow;
      const app = w.Alpine.$data(w.document.querySelector('[x-data^="app"]'));
      const v = w.document.getElementById('dv-viewer')?.__viewer;
      return { hash: w.location.hash, sel: app.sel, error: app.error, file: v?.file || '' };
    } catch (e) { return { error: e.constructor.name + ': ' + e.message }; }
  });

  const ok = (label, cond, detail) =>
    console.log(`ASSERT ${cond ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);

  ok('tossed: the frame carries the addressed fragment', inner.hash === '#item=README.md',
     'got ' + JSON.stringify(inner.hash));
  ok('tossed: data-view opened at that item', inner.sel === 2 && inner.file === 'README.md',
     JSON.stringify(inner));

  // The write half, which is where a toss is genuinely different: the frame is
  // mounted at a blob: URL under a stamped <base>, so a relative replaceState
  // throws (history-safe-toss-render-shim). addressItem uses an absolute one,
  // with a location.hash assignment behind it; this says which route ran and
  // whether the address followed either way.
  const wrote = await page.evaluate(async () => {
    const w = document.getElementById('frame').contentWindow;
    const app = w.Alpine.$data(w.document.querySelector('[x-data^="app"]'));
    const before = w.history.length;
    await app.open(1);
    return { hash: w.location.hash, sel: app.sel, entries: w.history.length - before };
  });
  await page.waitForTimeout(1200);

  ok('tossed: selecting writes the address back', wrote.hash === '#item=shape.json',
     'got ' + JSON.stringify(wrote.hash));
  ok('tossed: by replaceState, so the shell\'s back button is not captured', wrote.entries === 0,
     'history entries added: ' + wrote.entries);
}
