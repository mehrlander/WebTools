// The card's own reading of the set, opened by the expander: the list with
// room in it, or either serialization of the whole set. Driven on
// pages/annotate.html, which is the card at its plainest (no drawer, no toss,
// nothing else on the page competing for the corner).
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-expander.mjs
//   npm run shot -- pages/annotate.html --query "reading=md" --width 430 --script …
//
// Three knobs on the query. `notes=0` seeds none, which is the state a reader
// ARRIVES in and the one the expander first got wrong by hiding itself in it;
// `open=0` leaves the card collapsed; `reading` picks which of the three is
// photographed (notes | md | json). A fourth, `scope=note`, went with the
// scope chip: a serialization is of the set, always. What the PNG is evidence
// of: the card grew UPWARD from
// its own bottom edge, the readings strip and the set's actions arriving with
// it, and the pane showing the bytes Copy would hand over rather than a
// description of them.
export default async (page) => {
  // The aims moved behind one menu button, so reaching one is two taps rather
  // than one. Opening first, by the button's own title, keeps the scenario
  // driving the same controls a reader does instead of calling the API.
  const aim = async (title) => {
    await page.click('button[data-annotate-ui][title^="What the next note is about"]');
    await page.click(`button[data-annotate-ui][title^="${title}"]`);
  };
  await page.waitForSelector('#doc h1', { timeout: 15000 });
  const q = new URL(page.url()).searchParams;
  const reading = q.get('reading') || 'notes';
  const seed = q.get('notes') !== '0';
  const open = q.get('open') !== '0';

  const openKeyboard = () => page.evaluate(() => {
    const S = window.Annotate._state;
    const r = S.compView.getBoundingClientRect();
    const x = Math.round(r.left + 20), y = Math.round(r.bottom - 6);
    for (let i = 0; i < 2; i++) {
      S.compView.dispatchEvent(new PointerEvent('pointerup', {
        clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: true }));
    }
  });

  // The composer opens in dictation mode and a headless run has no recognizer
  // to speak to, so the keyboard is the way in and its dismiss is the way out.
  const save = async (note) => {
    await openKeyboard();
    await page.fill('textarea[data-annotate-ui]', note);
    await page.evaluate(() => document.querySelector('textarea[data-annotate-ui]').blur());
    await page.click('button[data-annotate-ui][title^="Save note"]');
    await page.waitForTimeout(150);
  };

  const noteText = async (needle) => {
    await page.evaluate((n) => {
      const walker = document.createTreeWalker(document.getElementById('doc'), NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const i = node.data.indexOf(n);
        if (i > -1) {
          const r = document.createRange();
          r.setStart(node, i);
          r.setEnd(node, i + n.length);
          const sel = getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
          node.parentElement.scrollIntoView({ block: 'center' });
          document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
          return;
        }
      }
      throw new Error('needle not found: ' + n);
    }, needle);
    await page.waitForSelector('button[data-annotate-ui][title="Note the text you selected"]');
    await page.click('button[data-annotate-ui][title="Note the text you selected"]');
  };

  if (seed) {
    await noteText('zero em dashes');
    await save('The rule every repo repeats. Worth its own line in the skill?');

    await noteText('wins wherever it conflicts');
    await save('This is the precedence sentence people quote at each other.');

    // A page note takes no gesture at all, which is the case the other targets
    // cannot serve: a complaint about the document itself.
    await aim('Note this page as a whole');
    await save('Three sections in and the scope is still not stated.');
  }

  if (!open) { await page.waitForTimeout(300); return; }

  // THE EXPANDER, which is the count in the header wearing a chevron. It is
  // offered with nothing filed too, which is the whole point of shooting
  // `notes=0`: the button has to be findable in the state a reader arrives in.
  await page.click('button[data-annotate-ui][title^="Open the set"]');
  await page.waitForTimeout(200);

  if (!seed) { await page.waitForTimeout(300); return; }

  if (reading !== 'notes') {
    const label = reading === 'json' ? 'annotate/1 JSON' : 'markdown';
    await page.click(`button[data-annotate-ui][title^="The set as ${label}"]`);
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(300);
};
