// End-to-end reproduction of "pick a file in the fab, get a blank window":
// stand a real toss up around show-repo, then drive the fab's path picker to
// choose a file and report what the frame actually did.
//
//   npm run shot -- pages/toss-render.html \
//     --hash 'gh=mehrlander/web-tools:pages/show-repo/show-repo.html' \
//     --script tools/render/scenarios/pick-md.mjs
//
// SHELL_MODE=branch  the working tree's toss-render, which has __tossRoute (default)
// SHELL_MODE=main    __tossRoute deleted, which is what the DEPLOYED shell looks
//                    like: goTarget falls through to a top-level navigation
// PICK=owner/repo:path  what to pick (default mehrlander/web-tools:docs/show-repo.md).
//                    Naming a repo the sandbox will not serve is how the
//                    fetch-failure path gets exercised.

const SHELL = process.env.SHELL_MODE || 'branch';
const PICK = process.env.PICK || 'mehrlander/web-tools:docs/show-repo.md';

export default async (page) => {
  page.on('console', m => console.log('  [page:' + m.type() + '] ' + m.text()));
  page.on('pageerror', e => console.log('  [page:error] ' + e.message));

  await page.waitForFunction(() => window.Alpine && document.querySelector('[x-data^="fab"]'),
    null, { timeout: 20000 });
  await page.waitForTimeout(1500);

  const before = await page.evaluate((shell) => {
    const el = document.querySelector('[x-data^="fab"]');
    const d = window.Alpine.$data(el);
    if (shell === 'main') { delete window.__tossRoute; }
    return { viaToss: d.viaToss, repo: d.repo, path: d.path, ref: d.ref,
             hasRoute: typeof window.__tossRoute, hasNav: typeof window.__tossNavigate };
  }, SHELL);
  console.log('  before: ' + JSON.stringify(before));

  const t = await page.evaluate((pick) => {
    const [repo, path] = pick.split(':');
    const d = window.Alpine.$data(document.querySelector('[x-data^="fab"]'));
    d.open = true; d.activeTab = 'render';
    // Aim a real navigation at the local server instead of github.io, which the
    // sandbox cannot reach: same path, same hash, reachable origin.
    const real = d._go.bind(d);
    d._go = (url) => real(String(url).replace(/^https:\/\/mehrlander\.github\.io\/web-tools/, location.origin));
    const t = d.renderTarget(repo, '', path, true);
    d.renderPicked({ repo, path });
    return t;
  }, PICK);
  console.log('  target: ' + JSON.stringify(t));

  await page.waitForTimeout(5000);

  const after = await page.evaluate(() => {
    const f = document.querySelector('iframe');
    let inner = null;
    try {
      const doc = f && f.contentDocument;
      inner = doc ? {
        title: doc.title,
        bodyLen: (doc.body && doc.body.innerHTML || '').length,
        text: (doc.body && doc.body.innerText || '').replace(/\s+/g, ' ').slice(0, 240),
      } : null;
    } catch (e) { inner = { err: e.message }; }
    const empty = document.getElementById('empty');
    const d = window.Alpine.$data(document.querySelector('[x-data^="fab"]'));
    return { subject: { repo: d.repo, path: d.path, ref: d.ref,
                        route: d.subjectRoute, via: d.subjectVia && d.subjectVia.path,
                        take: d.takePath },
             href: location.href, frame: !!f,
             frameHidden: f ? f.classList.contains('hidden') : null,
             emptyShown: empty ? !empty.classList.contains('hidden') : null,
             emptyMsg: ((document.getElementById('empty-msg') || {}).textContent || '').trim().slice(0, 200),
             inner };
  });
  console.log('  after: ' + JSON.stringify(after, null, 2));
};
