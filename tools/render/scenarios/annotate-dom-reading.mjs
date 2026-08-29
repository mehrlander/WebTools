// The card's fourth reading, and the ancestor step that feeds it.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-dom-reading.mjs
//
// Taps a nested node three times in the same spot and measures the staged
// outline each time. STACK prints what is actually under the point, which is
// the row to read the taps against: two nested inlines share a box (a <strong>
// wrapping only an <a>), so equal sizes on consecutive taps are the step
// working, not stalling. Then files a note and opens the DOM chip.
//
// CHIP false means the loader did not bring kits/peek.js, not that the card is
// wrong: the chip is offered only where Peek is aboard.

const stagedBox = (page) => page.evaluate(() => {
  const b = [...document.querySelectorAll('[data-annotate-ui]')]
    .find(n => /solid rgb\(250, 204, 21\)|solid #facc15/.test(n.style.border || '')
            && n.style.display !== 'none');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return `${Math.round(r.width)}x${Math.round(r.height)}`;
});

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 20000 });
  console.log('KITS ' + JSON.stringify(await page.evaluate(() => ({
    annotate: !!window.Annotate, dictate: !!window.Dictate, peek: !!window.Peek,
  }))));

  await page.evaluate(() => window.Annotate.startPick());
  await page.waitForTimeout(250);

  // Inside a list item, which sits under a <ul> under the render box: three
  // rungs with visibly different widths.
  const at = await page.evaluate(() => {
    const li = [...document.querySelectorAll('#doc li')].find(n => n.getBoundingClientRect().height > 10);
    li.scrollIntoView({ block: 'center' });
    const r = li.getBoundingClientRect();
    return { x: Math.round(r.left + 25), y: Math.round(r.top + 8) };
  });
  console.log('POINT ' + JSON.stringify(at));

  console.log('STACK ' + JSON.stringify(await page.evaluate(({ x, y }) =>
    document.elementsFromPoint(x, y).filter(e => !e.closest('[data-annotate-ui]'))
      .slice(0, 5).map(e => window.Peek.atom(e)), at)));

  for (const n of [1, 2, 3]) {
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(220);
    console.log(`TAP${n} staged=${await stagedBox(page)}`);
  }

  // Commit the third rung as a note, so the DOM reading has a subject.
  await page.click('button[data-annotate-ui][title="Note this element"]');
  await page.waitForTimeout(300);
  console.log('DRAFT ' + JSON.stringify(await page.evaluate(() => {
    const d = window.Annotate._state && window.Annotate._state.draft;
    return d ? { type: d.target.type, selector: (d.target.selector || '').slice(0, 60) } : null;
  })));

  await page.evaluate(() => {
    window.Annotate.disable();
    window.Annotate.enable();
    const li = [...document.querySelectorAll('#doc li')].find(n => n.getBoundingClientRect().height > 10);
    window.Annotate.add({ type: 'element', selector: window.Peek.facts(li).selector,
                          excerpt: li.textContent.slice(0, 80) }, 'what is this pinned to');
  });
  await page.waitForTimeout(200);

  await page.evaluate(() => window.Annotate.expand(true));
  await page.waitForTimeout(250);
  console.log('CHIP ' + JSON.stringify(await page.evaluate(() => {
    const b = document.querySelector('[data-annotate-ui] [title*="DOM under"]');
    return b ? { present: true, display: b.style.display } : { present: false };
  })));

  await page.evaluate(() => window.Annotate.setReading('dom'));
  await page.waitForTimeout(300);
  console.log('READING ' + await page.evaluate(() => window.Annotate.reading));
  console.log('--- DOM PANE ---\n' + await page.evaluate(() => {
    const pre = [...document.querySelectorAll('[data-annotate-ui] pre, pre[data-annotate-ui]')]
      .find(n => n.textContent.trim());
    return pre ? pre.textContent.slice(0, 900) : '(no pane)';
  }));
};
