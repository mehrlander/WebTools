// Probe: does a nested self-toss give the INNER toss-render a real address bar,
// and where do the FAB's page actions come from at depth 2?
//
//   npm run shot -- pages/toss-render.html \
//     --hash 'gh=mehrlander/web-tools@main:pages/toss-render.html#gh=mehrlander/web-tools@main:pages/word-select.html' \
//     --script tools/render/scenarios/nest-probe.mjs
export default async function (page) {
  await page.waitForTimeout(4000);
  const out = await page.evaluate(() => {
    const r = { outerHash: location.hash };
    const f1 = document.getElementById('frame');
    r.outerFrameSrc = f1 ? String(f1.src).slice(0, 40) : null;
    const w1 = f1 && f1.contentWindow, d1 = f1 && f1.contentDocument;
    r.innerReached = !!(w1 && d1);
    if (!d1) return r;
    r.innerTitle = d1.title;
    r.innerRealHash = w1.location.hash;
    r.innerHasParamsShim = !!w1.__tossParams || String(w1.URLSearchParams?.prototype?.get).includes('native') === false;
    const f2 = d1.getElementById('frame');
    r.innerFrameShown = !!(f2 && f2.style.display !== 'none');
    const d2 = f2 && f2.contentDocument;
    r.depth2Reached = !!d2;
    if (d2) {
      r.depth2Title = d2.title;
      r.depth2Body = (d2.body?.innerText || '').trim().slice(0, 80);
    }
    // The FAB the viewer actually touches: the outer shell's.
    const fabEl = [...document.querySelectorAll('[x-data]')].find(e => (e.getAttribute('x-data') || '').startsWith('fab'));
    if (fabEl && window.Alpine) {
      try {
        const d = window.Alpine.$data(fabEl);
        d.detect();
        r.fabSubject = { repo: d.repo, ref: d.ref, path: d.path, viaToss: d.viaToss };
        r.groups = d.groups.map(g => ({ key: g.key, shell: g.shell, actions: (g.actions || []).length }));
        r.pageActions = d.pageActions.map(a => ({ label: a.label, from: a.from, group: a.group }));
        r.subjectReached = d.subjectReached;
        r.subjectInspect = d.subjectInspect;
      } catch (e) { r.fabError = String(e); }
    }
    return r;
  });
  console.log('PROBE ' + JSON.stringify(out, null, 2));
}
