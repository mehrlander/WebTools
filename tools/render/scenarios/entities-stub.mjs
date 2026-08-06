// Shoot pages/entities.html against the real index without a token.
//
// The index lives in mehrlander/web-tools-private, so the page's own fetch
// 404s headlessly and renders its error card. This injects the committed
// index straight into the component instead of stubbing the transport, which
// keeps the shot honest about the views and silent about the fetch.
//
//   npm run shot -- pages/entities.html --script tools/render/scenarios/entities-stub.mjs
//
// Point INDEX at a sibling checkout of web-tools-private; skips with a clear
// message when it is absent, since a shot is not worth failing a suite over.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const INDEX = process.env.ENTITIES_INDEX
  || path.resolve(process.cwd(), '..', 'web-tools-private', 'state', 'entities.json');

export default async (page, ctx = {}) => {
  if (!existsSync(INDEX)) {
    console.error(`entities-stub: no index at ${INDEX}; shooting the error card instead`);
    return;
  }
  const idx = JSON.parse(await readFile(INDEX, 'utf8'));
  await page.evaluate(([data, view]) => {
    const el = document.querySelector('[x-data="entities"]');
    const d = window.Alpine.$data(el);
    d.idx = data;
    d.error = '';
    d.loading = false;
    if (view) d.view = view;
  }, [idx, ctx.view || null]);
  await page.waitForTimeout(400);
};
