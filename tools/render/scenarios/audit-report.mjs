// THE PAGE FILES ITS OWN REPORT, WITH NOBODY TURNING IT ON.
//
//   npm run shot -- pages/audit-render.html --width 430 --touch \
//     --script tools/render/scenarios/audit-report.mjs
//
// kits/page-report commits the page's own account of a failure to a private
// repo through the viewer's token, which is far more than a screenshot can
// carry. The page opts in once in its own source; the reader taps nothing. So
// what is worth gating on the page is that reporting really is live on a plain
// load, that a clean load still writes nothing, and that a repeat of the same
// failure is dropped rather than filed again on every reload.
//
// The write itself is stubbed. A driver that actually committed would put a
// file in the private repo on every run of the suite.

export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] span', { timeout: 20000 });
  await page.waitForTimeout(2400);

  const stub = () => page.evaluate(() => {
    window.__sent = [];
    window.PageReport.send = async function (extra) {
      window.__sent.push(this.collect(extra));
      this._filed = (this._filed || 0) + 1;
      // Mirror the real send's bookkeeping, which is what the repeat gate reads.
      const all = JSON.parse(localStorage.getItem('pageReport:seen') || '{}');
      const faults = (extra.faults || []).map(f => f.line).join('|');
      const crumb = extra.crumb ? `crumb:${extra.crumb.stage || extra.crumb}` : '';
      all[[extra.reason || '', crumb, faults].join('~').slice(0, 400)] = Date.now();
      localStorage.setItem('pageReport:seen', JSON.stringify(all));
      return { ok: true, path: 'stub/' + window.__sent.length + '.json' };
    };
  });
  await stub();

  const read = () => page.evaluate(() => ({
    enabled: !!window.PageReport.enabled,
    sent: window.__sent.length,
    status: Alpine.$data(document.body).reportStatus,
    build: Alpine.$data(document.body).build,
    onScreen: document.body.innerText.includes('reporting to mehrlander/web-tools-private'),
  }));

  // 1. Live on a plain load, with no tap, and saying so quietly.
  let s = await read();
  if (!s.enabled) throw new Error('the page loaded without reporting live');
  if (!s.onScreen) throw new Error('reporting is live and the page does not say so');
  if (!/report1/.test(s.build)) throw new Error(`the kit is not in the build token: ${s.build}`);

  // 2. Clean load, nothing filed. Reporting on is not a request to record
  //    every load, which is the whole reason it can be on by default.
  const clean = await page.evaluate(async () => {
    window.__auditFaults.length = 0; window.__auditCrumb = null;
    return window.PageReport.auto({ faults: [], crumb: null });
  });
  if (clean.ok) throw new Error('a clean load filed a report anyway');

  // 3. A fault files exactly one, carrying what a screenshot cannot.
  const first = await page.evaluate(() => {
    window.PageReport.forget();
    window.__auditFaults.push({ line: 'a made-up fault', n: 1 });
    return window.__auditReport();
  });
  if (!first.ok) throw new Error(`a fault filed nothing: ${first.why}`);
  const doc = await page.evaluate(() => window.__sent.at(-1));
  for (const k of ['at', 'url', 'page', 'environment', 'resources', 'build', 'faults', 'doc'])
    if (!(k in doc)) throw new Error(`the report omits ${k}`);
  if (!doc.environment.ua) throw new Error('no user agent in the report');
  if (typeof doc.resources?.count !== 'number') throw new Error('no resource census in the report');

  // 4. The same fault again is dropped, which is what stops one persistent
  //    failure becoming one commit per reload.
  const again = await page.evaluate(() => window.__auditReport());
  if (again.ok) throw new Error('the same failure was filed twice');
  if (again.why !== 'already filed') throw new Error(`dropped for the wrong reason: ${again.why}`);

  // 5. The address turns it off for one load, for handing the page on.
  await page.goto(page.url() + (page.url().includes('?') ? '&' : '?') + 'report=off');
  await page.waitForSelector('[x-ref="doc"] span', { timeout: 20000 });
  await page.waitForTimeout(2000);
  const off = await page.evaluate(() => ({
    enabled: !!window.PageReport.enabled,
    status: Alpine.$data(document.body).reportStatus,
  }));
  if (off.enabled) throw new Error('?report=off did not turn it off');
  if (!/off for this load/.test(off.status)) throw new Error(`the off state is not said: ${off.status}`);

  console.log('live with no tap · clean load files none · a fault files one · a repeat is dropped · ?report=off holds');
}
