// The reader tells the FAB sidebar which staged file is on screen, 2026-08-19.
//
// The drawer floats over the reader still aimed at whatever it was aimed at
// before, which for the Stage view is the app shell: a reader six files into a
// set they assembled had a Render tab naming show-repo and rooting its path
// picker there. The reader now announces on the subject channel
// (lib/kits/subject-channel.js), so the drawer names the file being READ.
//
// Stages a repo file and a pasted one, opens the reader on the repo file, and
// ends with the drawer open over it through the header's own door. The pasted
// item is the second half of the claim and is reported rather than shot: a
// local subject has no address, so the drawer folds the ref bar and the path
// picker away and names what is being read instead.
//
//   npm run shot -- app/index.html --query "view=stage" \
//     --script tools/render/scenarios/stage-reader-subject.mjs --wait 4000
//
// The repo item's CONTENT may not load in a sandbox without a token, and that
// is fine: the announcement is made from the staged address, not from a fetch,
// so the drawer is right either way and the slide says so honestly.

const REF = { repo: 'mehrlander/web-tools', ref: 'main', path: 'lib/kits/subject-channel.js' };

const drawerSays = () => {
  const el = [...document.querySelectorAll('[x-data]')]
    .find(e => (e.getAttribute('x-data') || '').startsWith('fab'));
  const d = el && window.Alpine.$data(el);
  if (!d) return null;
  return { repo: d.repo, ref: d.ref, path: d.path, route: d.subjectRoute,
           local: d.subjectLocal, label: d.subjectLabel,
           base: d.subjectBase, viaToss: d.viaToss };
};

export default async function (page) {
  await page.waitForSelector('[x-data*="stager"]', { timeout: 15000 });
  await page.waitForTimeout(1500);

  const before = await page.evaluate(drawerSays);

  const onRef = await page.evaluate(async (ref) => {
    const say = () => {
      const el = [...document.querySelectorAll('[x-data]')]
        .find(e => (e.getAttribute('x-data') || '').startsWith('fab'));
      const d = el && window.Alpine.$data(el);
      return d && { repo: d.repo, ref: d.ref, path: d.path, route: d.subjectRoute,
                    local: d.subjectLocal, label: d.subjectLabel,
                    base: d.subjectBase, viaToss: d.viaToss };
    };
    Alpine.store('browser').stage = [ref];
    window.StageIntake.take({ text: '# A pasted note\n\nStaged beside a repo file.\n',
                              name: 'note.md', size: 46 });
    const data = Alpine.$data(document.querySelector('[x-data*="stager"]'));
    await data.view(data.items[0]);
    await new Promise(r => setTimeout(r, 900));
    return { subject: window.__tossSubject, drawer: say(),
             handle: typeof window.__deckNavigate };
  }, REF);

  const onLocal = await page.evaluate(async () => {
    const say = () => {
      const el = [...document.querySelectorAll('[x-data]')]
        .find(e => (e.getAttribute('x-data') || '').startsWith('fab'));
      const d = el && window.Alpine.$data(el);
      return d && { repo: d.repo, path: d.path, local: d.subjectLocal, label: d.subjectLabel };
    };
    const data = Alpine.$data(document.querySelector('[x-data*="stager"]'));
    data.readerStep(1);
    await new Promise(r => setTimeout(r, 700));
    return { subject: window.__tossSubject, drawer: say() };
  });

  // Back to the repo file and in through the header's own door, which is the
  // control the shot is for: nothing else on a desktop says the floating
  // sidebar is now aimed at the file in the panel in front of it.
  await page.evaluate(async () => {
    const data = Alpine.$data(document.querySelector('[x-data*="stager"]'));
    data.readerStep(-1);
    await new Promise(r => setTimeout(r, 500));
  });
  await page.waitForTimeout(300);
  const door = await page.$('button[title="Open the sidebar for this file"]');
  if (door) await door.click();
  await page.waitForTimeout(1600);

  const open = await page.evaluate(drawerSays);
  await page.waitForTimeout(400);

  console.log('\n--- what the sidebar is aimed at ---');
  console.log('  before anything is read (the app shell):');
  console.log('    ' + JSON.stringify(before));
  console.log('  reading a staged repo file:');
  console.log('    announced: ' + JSON.stringify(onRef.subject));
  console.log('    drawer:    ' + JSON.stringify(onRef.drawer));
  console.log('    __deckNavigate: ' + onRef.handle + '  (the ref bar re-addresses in place)');
  console.log('  stepping onto the pasted one:');
  console.log('    announced: ' + JSON.stringify(onLocal.subject));
  console.log('    drawer:    ' + JSON.stringify(onLocal.drawer));
  console.log('  with the drawer open through the header door:');
  console.log('    ' + JSON.stringify(open));
  console.log('');
}
