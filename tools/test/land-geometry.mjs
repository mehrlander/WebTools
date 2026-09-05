#!/usr/bin/env node
// Where a landing puts the reader, measured in a browser.
//
//   node tools/test/land-geometry.mjs
//
// lib/kits/land.js has two halves and only one of them fits in jsdom. The
// classes and the dwell are held by tools/test/land.test.mjs; everything below
// is layout, and every one of these three claims was a defect first:
//
//   1. ONLY THE SCROLLER MOVES. scrollIntoView walks every scrollable ancestor,
//      so centring a paragraph inside a docked reader scrolled the list it was
//      opened FROM off the screen, leaving the reader looking at an answer with
//      no question beside it.
//   2. A LANDING SITS 28% DOWN, NOT CENTRED. Centred puts half a screen of the
//      previous section above the heading you asked for, which reads as having
//      landed early. Measured in mehrlander/home on a chapter heading; this is
//      the same number, held here so the kit cannot drift off it.
//   3. `ifNeeded` MOVES NOTHING when the target is already fully in view, which
//      is what keeps a tap on a visible row from jumping under the finger.
//      scrollIntoView's own 'nearest' was tried and does nothing for an element
//      whose top is in view and whose bottom is not, which is most rows.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};
const near = (a, b, slop = 12) => Math.abs(a - b) <= slop;

// A page tall enough to scroll, holding a scroller tall enough to scroll, so
// the two can be told apart. That separation IS claim 1.
const PAGE = `<!doctype html><html><body style="margin:0">
  <div style="height:1500px" id="above"></div>
  <div id="box" style="height:400px;overflow-y:auto;border:1px solid">
    <div style="height:600px"></div>
    <div id="target" style="height:40px">target</div>
    <div style="height:900px"></div>
  </div>
  <div style="height:1500px"></div>
</body></html>`;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
try {
  await page.setContent(PAGE);
  await page.addScriptTag({ content: readFileSync(path.join(root, 'lib/kits/land.js'), 'utf8') });
  await page.waitForFunction(() => !!window.Land);

  const out = await page.evaluate(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const box = document.getElementById('box');
    const t = document.getElementById('target');
    const snap = () => {
      const b = box.getBoundingClientRect(), r = t.getBoundingClientRect();
      return { pageY: Math.round(window.scrollY), boxTop: Math.round(box.scrollTop),
               // How far down the scroller the target sits, as a fraction.
               at: +(((r.top - b.top) / b.height).toFixed(3)) };
    };
    const before = snap();
    // No animation to wait out, so the assertion is about the resting place.
    window.Land.mark(t, { smooth: false, dwell: 50 });
    await wait(60);
    const landed = snap();

    // Already in view now: ifNeeded must leave it exactly where it is.
    const held = box.scrollTop;
    window.Land.mark(t, { smooth: false, ifNeeded: true, tint: false });
    await wait(40);
    const kept = box.scrollTop;

    // And without ifNeeded it re-seats to the same fraction, from anywhere.
    box.scrollTop = 0;
    window.Land.mark(t, { smooth: false, tint: false });
    await wait(40);
    const again = snap();
    return { before, landed, kept, held, again, LAND_AT: window.Land.LAND_AT };
  });

  ok('the page did not move', out.landed.pageY === 0 && out.before.pageY === 0,
     `page scrolled to ${out.landed.pageY}`);
  ok('the scroller did', out.landed.boxTop > 0, `scrollTop ${out.landed.boxTop}`);
  ok(`the target sits ${out.LAND_AT} down, not centred`,
     near(out.landed.at * 1000, out.LAND_AT * 1000, 30),
     `landed at ${out.landed.at}, wanted ${out.LAND_AT}`);
  ok('ifNeeded moves nothing when the target is already in view',
     out.kept === out.held, `${out.held} -> ${out.kept}`);
  ok('and without it the landing re-seats from anywhere',
     near(out.again.at * 1000, out.LAND_AT * 1000, 30), `re-seated at ${out.again.at}`);

  // CLAIM 4, added 2026-09-04 and the reason the kit says 'instant' rather than
  // 'auto'. 'auto' does not mean "no animation": it means "use the element's
  // computed scroll-behavior", so on a scroller carrying `scroll-smooth` the
  // reduced-motion path would animate the scroll of the reader who asked that it
  // not. Measured by landing on a smooth scroller and reading position on the
  // very next frame: an animated scroll has barely started, an instant one is
  // already there.
  const behaviour = await page.evaluate(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(r));
    // The scroll-behavior is set as a STYLE, not as Tailwind's `scroll-smooth`
    // class. This page loads no stylesheet, so the class compiles to nothing and
    // the first version of this check passed with behavior:'auto' as happily as
    // with 'instant': it was measuring two scrollers that both had no CSS
    // behavior at all. The class is what a caller writes; the computed property
    // is what the browser reads, and it is the property this claim is about.
    const mk = (css) => {
      const box = document.createElement('div');
      box.style.cssText = 'height:300px;overflow-y:auto;' + css;
      box.innerHTML = '<div style="height:900px"></div><div id="t" style="height:20px">t</div>'
                    + '<div style="height:900px"></div>';
      document.body.appendChild(box);
      return box;
    };
    const at = async (css, opts) => {
      const box = mk(css);
      window.Land.mark(box.querySelector('#t'), { ...opts, tint: false });
      await frame(); await frame();
      const early = box.scrollTop;
      await new Promise(r => setTimeout(r, 600));
      return { early, settled: box.scrollTop };
    };
    return { plain: await at('', { smooth: false }),
             smoothCss: await at('scroll-behavior:smooth', { smooth: false }),
             asked: await at('', { smooth: true }) };
  });
  ok('an instant landing is there on the next frame',
     near(behaviour.plain.early, behaviour.plain.settled, 2),
     `${behaviour.plain.early} vs ${behaviour.plain.settled}`);
  ok('and stays instant on a smooth-scrolling scroller, which is the point',
     near(behaviour.smoothCss.early, behaviour.smoothCss.settled, 2),
     `${behaviour.smoothCss.early} vs ${behaviour.smoothCss.settled} ` +
     `(with behavior:'auto' the CSS wins and the early read lags)`);
  ok('a landing that asked for smooth does animate',
     !near(behaviour.asked.early, behaviour.asked.settled, 20),
     `${behaviour.asked.early} vs ${behaviour.asked.settled}`);

  // Claim 1 again from the other end: a target in NO scroller falls through to
  // scrollIntoView, where the page is the scroller and moving it is correct.
  const paged = await page.evaluate(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    window.scrollTo(0, 0);
    const loose = document.createElement('div');
    loose.textContent = 'loose';
    document.body.appendChild(loose);
    window.Land.mark(loose, { smooth: false, tint: false });
    await wait(60);
    return Math.round(window.scrollY);
  });
  ok('a target in no scroller moves the page instead', paged > 0, `scrollY ${paged}`);
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} failure(s)` : '\nall passed');
process.exit(failures.length ? 1 : 0);
