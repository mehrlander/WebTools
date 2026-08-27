// Is the reading group CENTRED? Run when the card's header changes:
//
//   npm run shot -- pages/annotate.html --width 430 \
//     --script tools/render/scenarios/annotate-header-centre.mjs
//
// NOT gated. The suite is browser-free by construction, and jsdom has no layout
// engine, so no node test can answer this; it is a scenario you run. It exists
// because the question was got wrong twice by eye and once by measuring the
// wrong quantity: a probe showed the group's left edge identical across the
// three readings and that was read as proof of centring, when it only proved
// the group did not MOVE. Stillness and centring are different claims.
//
// Two gaps have to match: the
// one to the control on its left and the one to the control on its right. And
// the right-hand neighbour has to be the one a READER can see, since a control
// holding its place with visibility:hidden occupies layout an eye cannot. That
// gap is the whole finding: layout read 7 and 7 on the Notes reading while the
// eye saw 7 and 40, because Copy was holding a place it was not filling.
export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 15000 });
  await page.click('button[data-annotate-ui][title^="Open the set"]');
  await page.waitForTimeout(200);
  const out = await page.evaluate(() => {
    const A = window.Annotate, S = A._state;
    A.add({ type: 'page' }, 'one'); A.add({ type: 'page' }, 'two');
    const seen = (n) => n && n.offsetParent !== null
      && getComputedStyle(n).visibility !== 'hidden';
    const rows = {};
    for (const r of ['notes', 'md', 'json']) {
      A.setReading(r);
      const g = S.readGroup.getBoundingClientRect();
      const head = S.aimBtn.parentElement;
      const kids = [...head.children];
      // Nearest LAID-OUT neighbour either side, and nearest VISIBLE one.
      const laidOut = kids.filter(n => n.offsetParent !== null);
      const visible = kids.filter(seen);
      const leftOf = (list) => list.filter(n => n.getBoundingClientRect().right <= g.left + 0.5).pop();
      const rightOf = (list) => list.find(n => n.getBoundingClientRect().left >= g.right - 0.5);
      const L = leftOf(laidOut), Rl = rightOf(laidOut), Rv = rightOf(visible);
      rows[r] = {
        layoutLeftGap: Math.round(g.left - L.getBoundingClientRect().right),
        layoutRightGap: Math.round(Rl.getBoundingClientRect().left - g.right),
        seenLeftGap: Math.round(g.left - L.getBoundingClientRect().right),
        seenRightGap: Math.round(Rv.getBoundingClientRect().left - g.right),
        rightNeighbour: Rl.title ? Rl.title.slice(0, 18) : Rl.tagName,
        rightSeen: Rv.title ? Rv.title.slice(0, 18) : Rv.tagName,
        groupLeft: Math.round(g.left),
      };
    }
    return rows;
  });
  for (const [k, v] of Object.entries(out)) console.log('GAP ' + k + ' ' + JSON.stringify(v));
};
