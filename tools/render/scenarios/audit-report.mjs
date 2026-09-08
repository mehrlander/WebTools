// THE PAGE FILES ITS OWN REPORT, AND ONLY WHEN ARMED.
//
//   npm run shot -- pages/audit-render.html --width 430 --touch \
//     --script tools/render/scenarios/audit-report.mjs
//
// kits/page-report commits the page's own account of a failure to a private
// repo through the viewer's token, which is far more than a screenshot can
// carry. The properties worth gating are the ones that keep it from becoming
// a page nobody can hand to anyone: off by default, silent when clean, loud on
// screen while it is on, and self-expiring.
//
// The write itself is stubbed. A driver that actually committed would put a
// file in the private repo on every run of the suite, which is the behaviour
// this kit exists to make impossible.

export default async function (page) {
  await page.waitForSelector('[x-ref="doc"] span', { timeout: 20000 });
  await page.waitForTimeout(2200);

  // Stub the commit, and count what it was asked to write.
  await page.evaluate(() => {
    window.__sent = [];
    window.PageReport.send = async function (extra) {
      const doc = this.collect(extra);
      window.__sent.push(doc);
      const a = this.arm_;
      if (a) { a.left -= 1; a.left > 0 ? localStorage.setItem('pageReport:arm', JSON.stringify(a)) : this.disarm(); }
      return { ok: true, path: 'stub/' + window.__sent.length + '.json' };
    };
  });

  const read = () => page.evaluate(() => {
    const d = Alpine.$data(document.body);
    return { armed: !!window.PageReport.armed, sent: window.__sent.length,
             label: document.body.innerText.includes('● reporting'),
             off: document.body.innerText.includes('○ report off'),
             status: d.reportStatus, build: d.build };
  });

  // 1. Off by default, and saying so.
  let s = await read();
  if (s.armed) throw new Error('reporting was armed with nobody asking');
  if (!s.off) throw new Error('the off state is not on screen');
  if (!/report1/.test(s.build)) throw new Error(`the kit is not in the build token: ${s.build}`);

  // 2. Arming files one immediately, which is what proves the write path.
  await page.click('button:has-text("report off")');
  await page.waitForTimeout(600);
  s = await read();
  if (!s.armed) throw new Error('the arm did not take');
  if (s.sent !== 1) throw new Error(`arming filed ${s.sent} reports, wanted 1`);
  if (!s.label) throw new Error('armed, and the page does not say so');
  if (!/reporting to .+ · \d+ left · \d+m/.test(s.status)) throw new Error(`no nag countdown: ${s.status}`);

  // 3. The report carries what a screenshot cannot.
  const doc = await page.evaluate(() => window.__sent[0]);
  for (const k of ['at', 'url', 'page', 'environment', 'resources', 'build', 'faults', 'doc'])
    if (!(k in doc)) throw new Error(`the report omits ${k}`);
  if (!doc.environment.ua) throw new Error('no user agent in the report');
  if (typeof doc.resources?.count !== 'number') throw new Error('no resource census in the report');

  // 4. Armed and clean writes nothing: the arm is a window in which failures
  //    report themselves, not an instruction to record every load.
  const auto = await page.evaluate(async () => {
    window.__auditFaults.length = 0;
    window.__auditCrumb = null;
    return window.PageReport.auto({ faults: [], crumb: null });
  });
  if (auto.ok) throw new Error('an armed, clean page filed a report anyway');

  // 5. Disarm, and the nag goes.
  await page.click('button:has-text("reporting")');
  await page.waitForTimeout(400);
  s = await read();
  if (s.armed) throw new Error('the disarm did not take');
  if (!s.off) throw new Error('disarmed, and the page still shows the nag');

  console.log('off by default · arming files one · clean load files none · disarm clears the nag');
}
