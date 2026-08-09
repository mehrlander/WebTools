// Diagnostic: is the Chats pane's failure state a pending request or a pegged
// main thread? Counts animation frames over one second after the load fails.
// A responsive page turns in ~60; a page stuck in a reactive loop turns in ~0,
// which is also why its loading dots stop moving.
export default async (page) => {
  await page.evaluate(() => localStorage.setItem('ghToken', 'local-preview'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.getByRole('tab', { name: 'Chats' }).click();
  await page.waitForTimeout(3000);

  const probe = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => { frames++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    setTimeout(() => resolve({ frames, text: document.body.innerText.slice(0, 400) }), 1400);
  })).catch((e) => ({ error: String(e) }));

  console.log('[probe] ' + JSON.stringify(probe, null, 1));
};
