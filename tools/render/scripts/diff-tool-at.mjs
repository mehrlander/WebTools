// The address field driving the browse panel, with real keystrokes end to end:
// "@" opens it, typing filters, the top row is pre-selected, Tab takes it, and a
// real address never triggers browse mode. The reported failures were all about
// keystrokes doing nothing, so nothing here calls a method directly.
export default async function (page) {
  await page.waitForFunction(() => window.Alpine && document.body._x_dataStack, null, { timeout: 15000 });
  await page.evaluate(() => {
    // Two stubs, both at the network edge: the sandbox has no token and cannot
    // reach api.github.com. Everything above them is the shipped path.
    window.gh.repos = async () => ([
      'mehrlander/web-tools', 'mehrlander/home', 'mehrlander/chat-histories',
      'mehrlander/web-tools-private', 'mehrlander/wa-bills', 'mehrlander/budget-drs',
    ].map(full_name => ({ full_name })));
    const realReq = window.GH.prototype.req;
    window.GH.prototype.req = async function (path, opts) {
      if (!/^git\/trees\//.test(path)) return realReq.call(this, path, opts);
      return {
        truncated: false,
        tree: [
          { type: 'tree', path: 'annotations' },
          { type: 'blob', path: 'annotations/index.md' },
          { type: 'blob', path: 'CLAUDE.md' },
          { type: 'blob', path: 'GUIDE.md' },
          { type: 'blob', path: 'README.md' },
        ],
      };
    };
    const app = Alpine.$data(document.body);
    app._repoList = null;
    app.slots.A.src = 'gh';
    app.tab = 'sources';
  });
  await page.waitForTimeout(400);

  const input = await page.$('section input[placeholder*="or @ to browse"]');
  if (!input) throw new Error('the GitHub address field was not found');
  const read = () => page.evaluate(() => {
    const p = document.getElementById('grab-A').__pathPicker;
    return {
      open: !!p.open, query: p.query, active: p.active,
      rows: p.matches().map(n => n.name),
      scope: p.scope.map(n => n.name),
      field: Alpine.$data(document.body).slots.A.value,
    };
  });

  await input.click();
  await input.type('@');
  await page.waitForTimeout(900);
  let st = await read();
  console.log('OPEN ' + JSON.stringify(st));
  if (!st.open) throw new Error('typing @ did not open the panel');
  if (st.rows.length < 6) throw new Error('expected the full listing, got ' + st.rows.length);

  // Typing filters, and the top match is pre-selected.
  await input.type('chat');
  await page.waitForTimeout(300);
  st = await read();
  console.log('FILTER ' + JSON.stringify(st));
  if (st.rows.length !== 1 || st.rows[0] !== 'mehrlander/chat-histories') {
    throw new Error('filter did not narrow to one repo: ' + JSON.stringify(st.rows));
  }
  if (st.active !== 0) throw new Error('the top match should be pre-selected');

  // Tab takes the highlighted row, which for a repo means descending.
  await page.keyboard.press('Tab');
  await page.waitForTimeout(900);
  st = await read();
  console.log('TAB_DESCEND ' + JSON.stringify({ ...st, rows: st.rows.slice(0, 4) }));
  if (st.scope[0] !== 'mehrlander/chat-histories') throw new Error('Tab did not descend into the repo');
  if (st.field !== '@') throw new Error('the field should reset to a bare @ on descend, got ' + JSON.stringify(st.field));
  if (st.query !== '') throw new Error('a new level should start unfiltered');

  // Arrow keys move the highlight.
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  st = await read();
  if (st.active !== 1) throw new Error('ArrowDown did not move the highlight');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  st = await read();
  if (st.active !== 0) throw new Error('ArrowUp did not move the highlight back');

  // Backspace at a bare @ walks up rather than closing.
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);
  st = await read();
  console.log('BACKSPACE_UP ' + JSON.stringify({ open: st.open, scope: st.scope }));
  if (st.scope.length !== 0) throw new Error('Backspace at a bare @ should walk up a level');
  if (!st.open) throw new Error('walking up should not close the panel');

  // Escape backs out and clears the field.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  st = await read();
  if (st.open) throw new Error('Escape did not close the panel');
  if (st.field !== '') throw new Error('Escape should clear the field');

  // A real address is not browse mode: its @ is in the middle, and Tab must not
  // be swallowed.
  await input.type('mehrlander/web-tools@main:README.md');
  await page.waitForTimeout(400);
  st = await read();
  console.log('REAL_ADDRESS ' + JSON.stringify({ open: st.open, field: st.field }));
  if (st.open) throw new Error('a real address must not open the panel');
  if (st.field !== 'mehrlander/web-tools@main:README.md') throw new Error('the address was mangled');

  // Leave a filtered panel on screen for the shot.
  await page.evaluate(() => { Alpine.$data(document.body).slots.A.value = ''; });
  await input.click();
  await input.type('@web');
  await page.waitForTimeout(900);
}
