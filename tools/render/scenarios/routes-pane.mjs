// Render Activity's Routes pane against real data. The pane's own loader needs
// a token and the live API, neither of which the headless harness has, so the
// load is bypassed and its three outputs are supplied instead: the manifest
// (read from the served working tree, the same bytes at this ref), the
// per-carrier last-commit dates (read from this checkout's git log, which is
// what the API call answers), and a set of open PRs.
//
// The dates are DERIVED here rather than frozen into this file: a committed
// blob of shas would be stale by its second run, and the whole subject of the
// pane is whether a reading is current.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function touchesFromGit() {
  const m = JSON.parse(readFileSync(path.join(repoRoot, 'docs/app-routes.json'), 'utf8'));
  const paths = [...new Set([...m.routes.flatMap(r => r.files || []), m.shell])];
  const out = {};
  for (const p of paths) {
    if (!existsSync(path.join(repoRoot, p))) continue;
    const line = execFileSync('git', ['log', '-1', '--format=%H%x00%cI%x00%s', '--', p],
                              { cwd: repoRoot, encoding: 'utf8' }).trim();
    if (!line) continue;
    const [sha, date, subject] = line.split('\0');
    out[p] = { sha, shortSha: sha.slice(0, 7), date, subject, author: 'mehrlander',
               url: 'https://github.com/mehrlander/web-tools/commit/' + sha };
  }
  return out;
}

// Three shapes the pane has to tell apart: a PR on a narrow carrier (open on
// that route), a PR on a wide one (near several), and a PR touching nothing any
// route declares (on no row at all).
const PRS = [
  { repo: 'mehrlander/web-tools', name: 'claude/activity-recent-routes', pr: 416,
    title: 'Activity: a Routes pane over the app’s own destinations', draft: true,
    url: 'https://github.com/mehrlander/web-tools/pull/416', session: '',
    files: ['lib/alpineComponents/estate.js', 'lib/kits/route-activity.js',
            'docs/app-routes.json', 'app/index.html'] },
  { repo: 'mehrlander/web-tools', name: 'claude/map-registries-area', pr: 415,
    title: 'Give the registries an identity', draft: false,
    url: 'https://github.com/mehrlander/web-tools/pull/415', session: '',
    files: ['lib/alpineComponents/map.js', 'docs/properties.json'] },
  { repo: 'mehrlander/web-tools', name: 'claude/stage-diff-lens', pr: 412,
    title: 'Stage: a diff lens over the bench', draft: true,
    url: 'https://github.com/mehrlander/web-tools/pull/412', session: '',
    files: ['lib/alpineComponents/stage.js', 'lib/kits/text-diff.js'] },
  { repo: 'mehrlander/web-tools', name: 'claude/snags-intake', pr: 410,
    title: 'SNAGS: state the intake shape in the header', draft: true,
    url: 'https://github.com/mehrlander/web-tools/pull/410', session: '',
    files: ['docs/SNAGS.md'] },
];

export default async (page) => {
  const touches = touchesFromGit();
  await page.evaluate(() => {
    window.TOKEN = 'FAKE';
    window.__shell.estateSeen = true;
    window.__shell.view = 'routes';
  });
  await page.waitForTimeout(600);
  await page.evaluate(async ({ touches, prs }) => {
    const d = window.Alpine.$data(document.querySelector('[x-data="estate()"]'));
    d.authed = true; d.loading = false;
    d.routeManifest = await (await fetch('/docs/app-routes.json')).json();
    d.routeTouches = touches;
    d.routeBranchFiles = prs;
    d.routesTried = true;            // keep the x-effect from launching a real load
    d.routesLoadedAt = new Date().toISOString();
    d.routeOpenRow = 'map';          // one row expanded, to show what a row stands on
  }, { touches, prs: PRS });
  await page.waitForTimeout(500);
};
