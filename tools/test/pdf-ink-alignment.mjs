#!/usr/bin/env node
// Does the extracted geometry line up with the pixels pdf.js actually draws?
//
//   node tools/test/pdf-ink-alignment.mjs [--keep] [--quiet]
//
// The question behind every overlay, every shrink-wrapped box, and every
// column splitter: when the kit says a word occupies x1..x2, is that where the
// ink is? Two separate errors hide in that question and they need separate
// measurements.
//
//   1. BOX vs INK. `getTextContent` reports a typographical container, not an
//      ink extent. The container includes side bearings, so the box starts
//      before the ink does, by an amount that depends on the font and on which
//      character happens to be first. Measured here by rendering the page and
//      scanning for the real ink bounds.
//
//   2. GLYPH BOUNDARIES. Splitting an item's width across its characters is an
//      estimate. Measured here against pdf-lib's own font metrics, which are
//      the same metrics the PDF was written with and therefore an exact answer,
//      not another estimate.
//
// Both are reported per font, because "does it line up" has a different answer
// for Courier than for Times, and a single averaged number would hide that.
// Assertions at the end pin only what should not regress.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'tools', '.preview', 'pdf-ink');
const keep = process.argv.includes('--keep');
const quiet = process.argv.includes('--quiet');

const SIZE = 12;
const LEFT = 72;

// One line per font. The strings are chosen to expose the failure rather than
// to flatter it: a leading "i" has a large left side bearing relative to its
// ink, and "iiiiiWWWWW" splits evenly under a uniform advance while its true
// midpoint sits nowhere near the middle.
const FONTS = [
  { name: 'Helvetica', std: StandardFonts.Helvetica },
  { name: 'Helvetica-Bold', std: StandardFonts.HelveticaBold },
  { name: 'Times-Roman', std: StandardFonts.TimesRoman },
  { name: 'Times-Italic', std: StandardFonts.TimesRomanItalic },
  { name: 'Courier', std: StandardFonts.Courier },
];

const SAMPLES = [
  { key: 'plain', text: 'Retirement Systems 457,833' },
  { key: 'bearing', text: 'iiiii' },
  { key: 'split', text: 'iiiiiWWWWW', splitAt: 5 },
];

async function buildFixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const truth = [];
  let y = 720;

  for (const f of FONTS) {
    const font = await doc.embedFont(f.std);
    for (const s of SAMPLES) {
      page.drawText(s.text, { x: LEFT, y, size: SIZE, font, color: rgb(0, 0, 0) });
      truth.push({
        font: f.name, key: s.key, text: s.text, x: LEFT, y,
        // pdf-lib's metrics come from the same font program the PDF embeds, so
        // these are the document's own answer, not a second guess at it.
        width: font.widthOfTextAtSize(s.text, SIZE),
        splitX: s.splitAt != null
          ? LEFT + font.widthOfTextAtSize(s.text.slice(0, s.splitAt), SIZE)
          : null,
        splitAt: s.splitAt ?? null,
      });
      y -= 40;
    }
    y -= 10;
  }
  return { bytes: Buffer.from(await doc.save()), truth };
}

const MIME = { '.js': 'application/javascript', '.pdf': 'application/pdf' };
function serve(files) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = req.url.split('?')[0];
      const body = files[url];
      if (!body) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(url)] ?? 'text/html' });
      res.end(body);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ---------------------------------------------------------------------- run

const { bytes, truth } = await buildFixture();
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'fonts.pdf'), bytes);

const kit = readFileSync(path.join(root, 'lib', 'kits', 'pdf.js'), 'utf8')
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js/, '/pdf.min.js')
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js/, '/pdf.worker.min.js')
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdf-lib@[\d.]+\/dist\/pdf-lib\.min\.js/, '/pdf-lib.min.js');

const { server, port } = await serve({
  '/': `<!doctype html><meta charset="utf-8"><title>ink</title><script>${kit}</script>`,
  '/pdf.min.js': readFileSync(path.join(root, 'node_modules/pdfjs-dist/build/pdf.min.js')),
  '/pdf.worker.min.js': readFileSync(path.join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.js')),
  '/pdf-lib.min.js': readFileSync(path.join(root, 'node_modules/pdf-lib/dist/pdf-lib.min.js')),
  '/fonts.pdf': bytes,
});

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/`);

const measured = await page.evaluate(async ({ scale }) => {
  // Load twice, once per advance strategy, so the two are measured on
  // identical input rather than compared across runs.
  const canvasDoc = await window.pdf.open('/fonts.pdf', { measure: 'canvas' });
  const uniformDoc = await window.pdf.open('/fonts.pdf', { measure: 'uniform' });

  // Render the page to a canvas and find, for each horizontal band, where the
  // non-white pixels actually start and stop.
  const pg = canvasDoc.pages[0];
  const vp = pg.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: ctx, viewport: vp }).promise;
  const img = ctx.getImageData(0, 0, c.width, c.height).data;

  // Columns holding ink within a vertical band, in canvas pixels.
  const inkColumns = (yTop, yBottom, xFrom, xTo) => {
    const y0 = Math.max(0, Math.floor(yTop)), y1 = Math.min(c.height - 1, Math.ceil(yBottom));
    const x0 = Math.max(0, Math.floor(xFrom)), x1 = Math.min(c.width - 1, Math.ceil(xTo));
    const cols = [];
    for (let x = x0; x <= x1; x++) {
      let dark = false;
      for (let y = y0; y <= y1 && !dark; y++) {
        const i = (y * c.width + x) * 4;
        // Anti-aliasing means edge pixels are grey; anything clearly off-white
        // counts as ink, or the measured extent shrinks by a pixel each side.
        if (img[i] < 200 || img[i + 1] < 200 || img[i + 2] < 200) dark = true;
      }
      if (dark) cols.push(x);
    }
    return cols;
  };

  const toViewport = (x, y) => vp.convertToViewportPoint(x, y);

  return canvasDoc.items.map((it, idx) => {
    const u = uniformDoc.items[idx];
    // The item box, projected into canvas pixels. y flips, so y2 maps above y1.
    const [px1, pyTop] = toViewport(it.x1, it.y2);
    const [px2, pyBottom] = toViewport(it.x2, it.y1 - it.fontSize * 0.3);
    const pad = 6 * scale;
    const cols = inkColumns(pyTop - pad, pyBottom + pad, px1 - pad, px2 + pad);

    return {
      str: it.str, base: it.base,
      fontName: it.fontName, fontFamily: it.fontFamily,
      x1: it.x1, x2: it.x2, width: it.w,
      inkPx: cols.length ? { first: cols[0], last: cols.at(-1) } : null,
      boxPx: { x1: px1, x2: px2 },
      scale,
      glyphCanvas: it.glyphs.map(g => g.x1),
      glyphUniform: u.glyphs.map(g => g.x1),
    };
  });
}, { scale: 3 });

// ------------------------------------------------------------------- report

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ok' : 'FAIL'}  ${name}${detail && !pass ? `\n        ${detail}` : ''}`);
};

const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
// Text was written at a known x, so the projection is a pure scale from that
// origin: dividing back out converts a canvas pixel to a PDF point.
const toPoints = (px, m) => px / m.scale;

const rows = [];
for (const m of measured) {
  // Match on baseline, not text: all five fonts draw the same three strings,
  // so matching by text silently gives every row Helvetica's metrics.
  const t = truth.find(t => t.text === m.str && Math.abs(t.y - m.base) < 1);
  if (!t || !m.inkPx) continue;
  const inkX1 = toPoints(m.inkPx.first, m);
  const inkX2 = toPoints(m.inkPx.last + 1, m);
  const row = {
    font: t.font, key: t.key, text: m.str,
    widthErr: round(m.width - t.width, 3),
    leadingBearing: round(inkX1 - m.x1, 2),
    trailingBearing: round(m.x2 - inkX2, 2),
  };
  if (t.splitX != null) {
    row.trueSplit = round(t.splitX - m.x1, 2);
    row.canvasSplit = round(m.glyphCanvas[t.splitAt] - m.x1, 2);
    row.uniformSplit = round(m.glyphUniform[t.splitAt] - m.x1, 2);
    row.canvasErr = round(m.glyphCanvas[t.splitAt] - t.splitX, 2);
    row.uniformErr = round(m.glyphUniform[t.splitAt] - t.splitX, 2);
  }
  rows.push(row);
}

if (!quiet) {
  console.log('\n== Reported width vs the font\'s own metrics (points) ==\n');
  console.log('  font              sample     width error');
  for (const r of rows) {
    console.log(`  ${r.font.padEnd(17)} ${r.key.padEnd(10)} ${String(r.widthErr).padStart(10)}`);
  }

  console.log('\n== Box vs ink: how far the container extends past the ink (points) ==\n');
  console.log('  font              sample     leading  trailing');
  for (const r of rows) {
    console.log(`  ${r.font.padEnd(17)} ${r.key.padEnd(10)} ${String(r.leadingBearing).padStart(7)} ${String(r.trailingBearing).padStart(9)}`);
  }

  const splits = rows.filter(r => r.trueSplit != null);
  console.log('\n== Glyph boundary after "iiiii" in "iiiiiWWWWW", offset from item start ==\n');
  console.log('  font                true    canvas   uniform   canvas err  uniform err');
  for (const r of splits) {
    console.log(`  ${r.font.padEnd(17)} ${String(r.trueSplit).padStart(7)} ${String(r.canvasSplit).padStart(9)} ${String(r.uniformSplit).padStart(9)} ${String(r.canvasErr).padStart(12)} ${String(r.uniformErr).padStart(12)}`);
  }
  console.log('');
}

// ------------------------------------------------------------------- assert

check('no page errors', errors.length === 0, errors.join('; '));
check('every sample was found and rendered', rows.length === truth.length,
  `matched ${rows.length} of ${truth.length}`);

const worstWidth = Math.max(...rows.map(r => Math.abs(r.widthErr)));
// 0.5pt rather than 0: Times-Italic's long sample comes back 0.45pt wider than
// pdf-lib computes, on a 300pt run. Everything else agrees to under 0.005pt.
// Small enough to be a kerning-model difference between writer and reader, and
// far below any tolerance the kit uses, but it is not zero and should not grow.
check('reported item width matches the font metrics within 0.5pt', worstWidth < 0.5,
  `worst ${worstWidth}pt`);

// The container starts at or before the ink, always. A negative leading bearing
// would put ink outside the box on the left and break every containment rule
// built on it.
const negative = rows.filter(r => r.leadingBearing < -0.05);
check('ink never starts before the reported box', negative.length === 0,
  negative.map(r => `${r.font}/${r.key} ${r.leadingBearing}`).join(', '));

// The trailing side is NOT symmetric, and that asymmetry is the point of this
// measurement. An italic W leans past its own advance width, so ink exits the
// box on the right. Any overlay that shrink-wraps to the reported box will clip
// it, and any right-edge column rule will see the value end early.
const overhang = Math.max(...rows.map(r => -r.trailingBearing));
check('trailing overhang stays within 1.5pt at 12pt', overhang < 1.5,
  `worst ${round(overhang, 2)}pt`);
check('some sample does overhang, so the asymmetry is really being measured',
  overhang > 0.1, `worst ${round(overhang, 2)}pt: the fixture stopped exercising it`);

const splits = rows.filter(r => r.trueSplit != null);
const worstCanvas = Math.max(...splits.map(r => Math.abs(r.canvasErr)));
const worstUniform = Math.max(...splits.map(r => Math.abs(r.uniformErr)));
check('canvas measurement beats uniform division on every proportional font',
  splits.filter(r => r.font !== 'Courier')
        .every(r => Math.abs(r.canvasErr) < Math.abs(r.uniformErr)),
  `canvas worst ${worstCanvas}pt, uniform worst ${worstUniform}pt`);

check('canvas measurement stays within 3pt of truth on every font', worstCanvas < 3,
  `worst ${worstCanvas}pt`);

check('both strategies agree on a monospaced font',
  splits.filter(r => r.font === 'Courier')
        .every(r => Math.abs(r.canvasErr - r.uniformErr) < 0.5),
  'uniform division is exactly right for Courier; canvas must not make it worse');

await browser.close();
server.close();
if (!keep) await rm(outDir, { recursive: true, force: true });

const failed = results.filter(r => !r.pass);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
