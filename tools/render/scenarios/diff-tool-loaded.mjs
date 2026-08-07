// Drive pages/diff-tool.html into its loaded state for a screenshot: two
// versions of the same text in A and B, then the Diff tab. The page opens empty
// by design, so a shot of the default state shows the form, not the layout that
// matters.
export default async function (page) {
  const A = [
    "import { api } from './client';",
    '',
    'export async function fetchUser(id) {',
    "  const res = await api.get('/users/' + id);",
    '  if (res.status !== 200) {',
    "    throw new Error('Request failed');",
    '  }',
    '  const data = res.body;',
    '  const profile = data.profile || {};',
    '  return {',
    '    id: data.id,',
    '    name: data.name,',
    '    email: data.email,',
    '  };',
    '}',
    '',
    'export function clearCache() {',
    '  cache.clear();',
    '}',
  ].join('\n');

  const B = [
    "import { api } from './client';",
    "import { logger } from './logger';",
    '',
    'export async function fetchUser(id, opts = {}) {',
    '  const res = await api.get(`/users/${id}`, opts);',
    '  if (!res.ok) {',
    "    logger.warn('fetchUser failed', { id, status: res.status });",
    "    throw new ApiError('Request failed', res.status);",
    '  }',
    '  const data = await res.json();',
    '  const profile = data.profile || {};',
    '  return {',
    '    id: data.id,',
    '    name: data.fullName,',
    '    email: data.email,',
    '    avatar: data.avatarUrl,',
    '  };',
    '}',
    '',
    'export function clearCache() {',
    '  cache.clear();',
    '}',
  ].join('\n');

  await page.waitForFunction(() => window.Alpine && document.body._x_dataStack, null, { timeout: 15000 });
  await page.evaluate(({ A, B }) => {
    const app = Alpine.$data(document.body);
    app.slots.A.name = 'fetchUser.js@main';
    app.slots.B.name = 'fetchUser.js@refactor';
    app.slots.A.content = A;
    app.slots.B.content = B;
    app.onEdit();
    app.tab = 'diff';
  }, { A, B });
  await page.waitForTimeout(500);
}
