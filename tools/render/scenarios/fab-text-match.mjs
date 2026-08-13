// The Text tab's Match section, for a pixel check.
//
//   npm run shot -- pages/shorter.html --script tools/render/scenarios/fab-text-match.mjs
//
// STATE=read     the Read pane with Match un-run          (the default)
// STATE=match    Match resolved
// STATE=select   the read scoped to a selection on the page
//
// THE READ IS REAL in every state: the figures come from walking this page's
// own DOM, which the sandbox renders for real. MATCH IS SEEDED, because it
// needs a tree read and three registry reads and there is no GitHub here and no
// token. The seed is the shape EstateSearch.tree and a registry read actually
// return, taken from the files in this repo, so the rows exercise the real
// resolve-and-gloss path rather than being written into the component's state.
// Same split as tools/render/scenarios/fab-traffic.mjs, and for the same reason.

const TREE = [
  'docs/CONVENTIONS.md', 'docs/SURFACING.md', 'docs/loader.md', 'docs/text-tools.md',
  'lib/kits/annotate.js', 'lib/alpineComponents/fab.js', 'pages/shorter.html',
  'tools/test/fab-text.test.mjs', 'lib/kits/url-params.js',
];

const DOCS = {
  documents: [
    { path: 'docs/loader.md', status: 'living',
      subject: 'the contract a file must honor to be loadable, and the boot timing invariants' },
    { path: 'docs/text-tools.md', status: 'living',
      subject: "the FAB's text surface: the instruments the estate already has, and what the measurements rule out" },
    { path: 'docs/CONVENTIONS.md', status: 'living',
      subject: 'the portable working conventions: the general-behavior hub' },
  ],
};

const TESTS = {
  tests: [
    { path: 'tools/test/fab-text.test.mjs', kind: 'behavior',
      protects: "The drawer's fifth tab reports only what it can stand behind." },
  ],
};

const STATE = process.env.STATE || 'read';

export default async (page) => {
  await page.waitForFunction(() => window.Alpine && document.querySelector('[x-data^="fab"]'),
    null, { timeout: 20000 });

  // A paragraph naming files, so the page under test actually has something to
  // resolve. Written into the page rather than into the component, so the walk
  // has to find it the way it would find any prose.
  await page.evaluate(() => {
    const p = document.createElement('article');
    p.style.cssText = 'padding:1rem;max-width:38rem';
    p.innerHTML = '<p>The loader contract is stated once, in docs/loader.md, and the ' +
      'surface this tab belongs to is described in docs/text-tools.md. The walk itself ' +
      'reuses the indexing idea from <code>lib/kits/annotate.js</code>, and the checks ' +
      'live in tools/test/fab-text.test.mjs. An older note pointed at docs/gone-away.md, ' +
      'which is no longer in the tree.</p>';
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

  await page.evaluate(([tree, docs, tests, state]) => {
    const el = document.querySelector('[x-data^="fab"]');
    const d = window.Alpine.$data(el);

    if (state === 'match') {
      // The sandbox serves this page from loopback, so the fab places it in no
      // repo and Match correctly refuses. Name the repo the way a github.io
      // load would, so the shot exercises the resolve rather than the guard.
      d.repo = 'mehrlander/web-tools';
      // Seed the two reads Match makes, in the shape each really returns.
      window.EstateSearch = { tree: async () => ({ paths: tree, truncated: false }) };
      const bodies = { 'docs/docs.json': docs, 'docs/tests.json': tests };
      window.GH = function () {
        this.get = async (p) => {
          if (bodies[p]) return { text: JSON.stringify(bodies[p]) };
          throw new Error('no registry at ' + p);   // harness.json is genuinely absent here
        };
      };
    }
    d.setTab('text');
    if (state === 'match') return d.textMatchRun();
  }, [TREE, DOCS, TESTS, STATE]);

  await page.waitForTimeout(700);
};
