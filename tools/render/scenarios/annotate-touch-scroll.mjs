// Can the reader still scroll? Real touch events through CDP, because
// page.mouse does not produce them and touch is the only path where
// `touch-action` and `overscroll-behavior` apply at all. jsdom has neither
// layout nor touch, so this is the only place any of it is checked.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/annotate-touch-scroll.mjs --touch
//
// The state that was frozen is Region STAGED. `touch-action:none` is why the
// drag works and why the page cannot move, and both are wanted only while the
// reader is DRAWING; once a rectangle is staged the drag is over and the
// reader is reading the answer. Measured 2026-08-30: every other state scrolled
// and Region held the document at 0, which got worse when this mode began
// opening the card on the DOM reading and turned a gesture you pass through
// into one you sit in.
//
// Expected: every line but `region-armed` scrolls, `region-armed` holds at 0
// AND stages a rectangle, the offer stays tappable, and a drag started on the
// box re-arms and redraws.

export default async (page) => {
  const cdp = await page.context().newCDPSession(page);
  const drag = async (x, y, dy, dx = 0) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
        { x: x + Math.round(dx * i / 6), y: y + Math.round(dy * i / 6) }] });
      await new Promise(r => setTimeout(r, 16));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // Momentum has to settle, or the next touch lands mid-scroll and the
    // browser refuses to let a listener cancel it (a warning, not a defect).
    await page.waitForTimeout(500);
  };
  const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
  const reset = (fn) => page.evaluate(fn);

  await page.waitForSelector('#doc h1', { timeout: 20000 });

  await reset(() => window.scrollTo(0, 0));
  await drag(215, 300, -220);
  console.log('page, idle          scrollY=' + await scrollY());

  await reset(() => { window.scrollTo(0, 0); window.Annotate.startPick(); });
  await page.waitForTimeout(250);
  await drag(215, 240, -220);
  console.log('page, element armed scrollY=' + await scrollY());

  // The drawn pane, made to overflow.
  await reset(() => {
    const S = window.Annotate._state;
    S.aimEl = document.querySelector('#doc'); S.aimKind = 'el';
    window.Annotate.setReading('dom');
    S.domBody.scrollTop = 0;
  });
  await page.waitForTimeout(250);
  const mid = await page.evaluate(() => {
    const b = window.Annotate._state.domBody, r = b.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
             over: b.scrollHeight > b.clientHeight };
  });
  await drag(mid.x, mid.y, -180);
  console.log('dom pane (overflows=' + mid.over + ')  scrollTop='
    + await page.evaluate(() => window.Annotate._state.domBody.scrollTop));

  // Region ARMED: the drag draws and the page is meant to hold still.
  await reset(() => { window.Annotate.notePage(); window.scrollTo(0, 0); window.Annotate.startRegion(); });
  await page.waitForTimeout(250);
  await drag(120, 240, 130, 180);
  console.log('page, region armed  scrollY=' + await scrollY()
    + '  staged=' + await page.evaluate(() => !!window.Annotate._state.aimRect));

  // Region STAGED: the drag is over, so the page must move again.
  await reset(() => window.scrollTo(0, 0));
  await drag(215, 200, -220);
  console.log('page, region staged scrollY=' + await scrollY());
  console.log('offer reachable     ' + await page.evaluate(() => {
    const b = document.querySelector('[data-annotate-ui][title="Note this region"]');
    if (!b) return 'no offer';
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit ? hit.title === 'Note this region' : false;
  }));

  // And a drag STARTED ON THE BOX re-arms, so the common retry costs no trip
  // to the chip.
  const boxAt = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-annotate-ui]')]
      .find(n => /solid rgb\(250, 204, 21\)/.test(n.style.border || '') && n.style.display !== 'none');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), was: Math.round(r.height) };
  });
  if (boxAt) {
    await drag(boxAt.x, boxAt.y, 90, 70);
    console.log('redraw from box     was=' + boxAt.was + ' now=' + await page.evaluate(() => {
      const b = [...document.querySelectorAll('[data-annotate-ui]')]
        .find(n => /rgb\(250, 204, 21\)/.test(n.style.border || '') && n.style.display !== 'none');
      return b ? Math.round(b.getBoundingClientRect().height) : null;
    }));
  }
};
