// The Text tab, for a pixel check.
//
//   npm run shot -- pages/shorter.html --script tools/render/scenarios/fab-text-match.mjs
//
// STATE=match    the read plus both match lanes            (the default)
// STATE=select   the read scoped to a selection on the page
//
// THE READ IS REAL: the figures come from walking this page's own DOM, which
// the sandbox renders for real. THE TWO REGISTRY-AND-TREE READS ARE SEEDED,
// because there is no GitHub here and no token. The seeds carry the shape each
// carrier really has, pages.json's nested groups included, so the rows exercise
// the real lookup rather than being written into the component's state. Same
// split as tools/render/scenarios/fab-traffic.mjs, and for the same reason.

const REG = {
  'docs/docs.json': { documents: [
    { path: 'docs/loader.md', status: 'living',
      subject: 'the contract a file must honor to be loadable, and the boot timing invariants' },
    { path: 'docs/text-tools.md', status: 'living',
      subject: "the FAB's text surface, and what the measurements rule out" },
    { path: 'CLAUDE.md', status: 'living',
      subject: 'the repo instructions, injected into every session' },
  ] },
  'docs/tests.json': { tests: [
    { path: 'tools/test/fab-text.test.mjs', kind: 'behavior',
      protects: "The drawer's fifth tab reports only what it can stand behind." },
  ] },
  'docs/harness.json': { tools: [] },
  'docs/portable.json': { items: [] },
  'pages/pages.json': [
    { label: '', items: [{ href: 'shorter.html', title: 'Shorter', note: 'line up a shorter draft beside the original' }] },
  ],
};

const TREE = ['lib/kits/annotate.js', 'pages/shorter.html', 'docs/loader.md'];
const STATE = process.env.STATE || 'match';

export default async (page) => {
  await page.waitForFunction(() => window.Alpine && document.querySelector('[x-data^="fab"]'),
    null, { timeout: 20000 });

  // A paragraph naming files, so the page has something to look up. Written
  // into the page rather than into the component, so the walk has to find it
  // the way it would find any prose.
  await page.evaluate(() => {
    const p = document.createElement('article');
    p.style.cssText = 'padding:1rem;max-width:38rem';
    p.innerHTML = '<p>The loader contract is stated once, in docs/loader.md, and the surface ' +
      'this tab belongs to is described in docs/text-tools.md. The rules come from CLAUDE.md. ' +
      'The walk reuses the indexing idea from <code>lib/kits/annotate.js</code>, and the checks ' +
      'live in tools/test/fab-text.test.mjs. An older note pointed at docs/gone-away.md, ' +
      'and the styles load from https://cdn.jsdelivr.net/npm/daisyui@5/themes.css.</p>';
    document.body.prepend(p);
  });

  if (STATE === 'select') {
    await page.evaluate(() => {
      const p = document.querySelector('article p');
      const r = document.createRange();
      r.setStart(p.firstChild, 0);
      r.setEnd(p.firstChild, Math.min(180, p.firstChild.length));
      const s = window.getSelection();
      s.removeAllRanges(); s.addRange(r);
    });
  }

  await page.click('[aria-label="Web-tools panel"]');
  await page.waitForTimeout(900);

  await page.evaluate(([reg, tree]) => {
    const el = document.querySelector('[x-data^="fab"]');
    const d = window.Alpine.$data(el);
    // The sandbox serves this page from loopback, so the fab places it in no
    // repo and Match correctly refuses. Name the repo the way a github.io load
    // would, so the shot exercises the lookup rather than the guard.
    d.repo = 'mehrlander/web-tools';
    d._regCache = {};
    window.GH = function () {
      this.get = async (p) => {
        if (reg[p]) return { text: JSON.stringify(reg[p]) };
        throw new Error('no registry at ' + p);
      };
    };
    window.EstateSearch = { tree: async () => ({ paths: tree, truncated: false }) };
    d.setTab('text');
    return d.textMatchRun();
  }, [REG, TREE]);

  await page.waitForTimeout(700);
};
