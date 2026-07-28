// Shoot the inbox resolution: a staged pair, a destination repo picked with no
// directory, and that repo's manifest declaring an inbox. The armed button is
// the point, since a redirect the reader cannot see is a surprise.
//
//   npm run shot -- pages/show-repo/show-repo.html --script tools/render/scripts/inbox-demo.mjs
  await page.evaluate(async () => {
    window.TOKEN = 'stub-token-for-the-shot';
    // srcGh() builds from the store instance's own constructor, so the stub has
    // to sit on that prototype rather than on window.GH.
    const proto = window.Alpine.store('browser').gh.constructor.prototype;
    const realGet = proto.get;
    proto.get = async function (p) {
      if (p === '.web-tools.json' && this.repo === 'mehrlander/home') {
        return { text: '{"icon":"ph-house","estate":true,"inbox":"inbox/web-tools"}' };
      }
      return realGet.call(this, p);
    };
    const app = window.__shell;
    app.hasToken = () => true;
    const s = window.Alpine.store('browser');
    s.stage = [{ repo: 'mehrlander/web-tools', ref: '', path: 'docs/CONVENTIONS.md' },
               { repo: 'mehrlander/web-tools', ref: '', path: 'docs/SURFACING.md' }];
    app.goStage();
  });
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    const el = [...document.querySelectorAll('[x-data*="stager"]')][0]
      || [...document.querySelectorAll('[x-data]')].find(e => window.Alpine.$data(e)?.destSpec !== undefined);
    const d = window.Alpine.$data(el);
    d.destSpec = 'mehrlander/home';
    await d.send();   // first tap: arms, and resolves the receiver's inbox
  });
  await page.waitForTimeout(500);
};
