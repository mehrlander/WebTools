// The structure drawn while a section aim is armed.
//
//   npm run shot -- pages/annotate.html --script tools/render/scenarios/section-structure.mjs
//   npm run shot -- pages/annotate.html --width 390 --script tools/render/scenarios/section-structure.mjs
//
// The aim resolves only inside a declared render, so a tap anywhere else does
// nothing at all: correct, and silent. These marks are what make the silence
// legible. The boundary says where the aim reaches; a rule per section, indented
// by RANK rather than by DOM depth, says where the sections are and which
// contains which, so the outer one is the longest and leftmost and a second tap
// in the same spot grows the outline to exactly it.
//
// Measured at two widths on 2026-08-31: nine rules over nine sections at two
// indents both times, and the boundary drawn at 900 and dropped at 390, where
// the render sits flush against the viewport and a boundary would have run off
// the left edge as a three-sided box.
//
// jsdom has no layout, so the checks in tools/test/annotate-section.test.mjs
// stub their rects and assert the SHAPE of the overlay. Where the marks land is
// this scenario's question.

export default async (page) => {
  await page.waitForSelector('#doc h1', { timeout: 20000 });
  await page.evaluate(() => window.Annotate.startPick({ aim: 'section' }));
  await page.waitForTimeout(400);
  console.log('MARKS ' + JSON.stringify(await page.evaluate(() => {
    const box = document.querySelector('[data-src-doc]');
    const secs = box.__srcDoc.sections;
    const marks = [...document.querySelectorAll('[data-annotate-ui]')]
      .filter(e => e.style.position === 'absolute' && e.style.zIndex && e.style.width);
    const rules = marks.filter(e => e.style.width === '2px');
    return {
      sections: secs.length,
      depths: [...new Set(secs.map(s => s.depth))].sort(),
      rules: rules.length,
      lefts: [...new Set(rules.map(r => parseInt(r.style.left)))].sort((a, b) => a - b),
      boundary: marks.some(e => /dashed/.test(e.style.border || e.style.cssText)),
    };
  })));
  // Drag the card clear so the pixels show the page, not the panel.
  await page.evaluate(() => {
    const p = window.Annotate._state.panel;
    p.style.left = 'auto'; p.style.right = '12px'; p.style.bottom = '12px';
  });
  await page.waitForTimeout(250);
};
