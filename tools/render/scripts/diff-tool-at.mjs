// Types "@" into slot A's address field and asserts the browse panel opened,
// then leaves it open for the shot. The reported bug was that typing @ did
// nothing, so this drives the real keystroke rather than calling the method.
export default async function (page) {
  await page.waitForFunction(() => window.Alpine && document.body._x_dataStack, null, { timeout: 15000 });
  await page.evaluate(() => {
    const app = Alpine.$data(document.body);
    app.slots.A.src = 'gh';
    app.recentRepos = ['mehrlander/web-tools'];
    app.tab = 'sources';
  });
  await page.waitForTimeout(400);

  const input = await page.$('section input[placeholder*="or @ to browse"]');
  if (!input) throw new Error('the GitHub address field was not found');
  await input.click();
  await input.type('@');
  await page.waitForTimeout(900);

  const state = await page.evaluate(() => {
    const app = Alpine.$data(document.body);
    const host = document.getElementById('grab-A');
    return {
      pickerReady: app.pickerReady,
      fieldValue: app.slots.A.value,
      panelOpen: !!host?.__pathPicker?.open,
      panelVisible: !!host?.querySelector('section'),
      rootsOffered: host?.__pathPicker?.tree?.map(n => n.name) || [],
    };
  });
  console.log('AT_TRIGGER ' + JSON.stringify(state));
  if (!state.panelOpen) throw new Error('typing @ did not open the browse panel');
  if (state.fieldValue !== '') throw new Error('the @ was left in the field: ' + JSON.stringify(state.fieldValue));

  // The negative case, which is the risky half of the rule: '@' is legitimate
  // INSIDE an address, so typing a ref must not reopen the panel on every
  // keystroke. Close it, type a full address, and it must stay closed.
  await page.evaluate(() => { document.getElementById('grab-A').__pathPicker.open = false; });
  await input.type('mehrlander/web-tools@main:README.md');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    open: !!document.getElementById('grab-A').__pathPicker.open,
    value: Alpine.$data(document.body).slots.A.value,
  }));
  console.log('AT_NEGATIVE ' + JSON.stringify(after));
  if (after.open) throw new Error('an @ inside an address reopened the panel');
  if (after.value !== 'mehrlander/web-tools@main:README.md') {
    throw new Error('the address was mangled: ' + JSON.stringify(after.value));
  }

  // Leave the panel open for the shot.
  await page.evaluate(() => {
    const app = Alpine.$data(document.body);
    app.slots.A.value = '';
    document.getElementById('grab-A').__pathPicker.toggle();
  });
  await page.waitForTimeout(600);
}
