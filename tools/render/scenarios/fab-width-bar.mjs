// The Render tab's width bar, shot on the renderer where the lever is live.
//
//   npm run shot -- pages/toss-render.html --hash 'gh=mehrlander/web-tools@main:pages/index.html' \
//     --script tools/render/scenarios/fab-width-bar.mjs
//
// WIDTH picks which preset is engaged before the shot; the shell's own ?w= is
// the other way in, and both land on the same call.
//
//   WIDTH=0     actual, the bar at rest         (the default)
//   WIDTH=390   the phone preset
//   WIDTH=1280  the desktop preset
//
// Shot at --width 1280 it shows a desktop looking at a phone; shot at
// --width 430 it shows the opposite, which is the direction with no other
// witness in this sandbox.

const WIDTH = +(process.env.WIDTH || 0);

export default async (page) => {
  await page.waitForFunction(() => window.Alpine && document.querySelector('[x-data^="fab"]'),
    null, { timeout: 15000 });
  await page.evaluate((w) => {
    const d = window.Alpine.$data(document.querySelector('[x-data^="fab"]'));
    d.open = true;
    d.activeTab = 'render';
    d.setWidth(w);
  }, WIDTH);
  await page.waitForTimeout(900);
};
