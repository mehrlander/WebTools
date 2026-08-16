// Drive show-repo's project Board pane to a seeded, token-free state so the
// TYPED read renders headlessly (the pane normally fetches board.json over the
// viewer's token, which the sandbox has neither of). Same tactic as
// sidebar-projects.mjs: fill the shell's state directly, so the shot proves the
// rendering, not the load. The seeded records are budget-drs's real board.json,
// its twelve open tasks plus a sample of Done, so the review line and the size
// and awaiting chips carry real values rather than lorem.
//
//   npm run shot -- app/index.html --script tools/render/scenarios/project-board-review.mjs
//
// DONE=1 additionally expands the collapsed Done section.

const TASKS = [
  {
    "title": "Budget-drs as a personal dashboard via show-repo; decide the repo split",
    "status": "backlog",
    "size": "L",
    "awaiting": "your call on the repo split; the estate surface repoint is not gated",
    "file": "dashboard-and-repo-split-2bosic.md",
    "href": "tasks/dashboard-and-repo-split-2bosic.md",
    "lastActivity": "2026-08-03",
    "logEntries": 8
  },
  {
    "title": "Enacted-basis budget star - the item-to-authority crosswalk and dense enacted appropriations",
    "status": "blocked",
    "size": "XL",
    "awaiting": "your ratification of the item-authority worklist (39 of 76 rows to adjudicate)",
    "file": "enacted-basis-budget-star-dws9ij.md",
    "href": "tasks/enacted-basis-budget-star-dws9ij.md",
    "lastActivity": "2026-08-03",
    "logEntries": 5
  },
  {
    "title": "Estate hygiene - prune prototyping detritus",
    "status": "backlog",
    "size": "S",
    "file": "estate-hygiene-prune-bwfgyj.md",
    "href": "tasks/estate-hygiene-prune-bwfgyj.md",
    "lastActivity": "2026-08-02",
    "logEntries": 7
  },
  {
    "title": "Evolve the tracker and session-handoff process",
    "status": "backlog",
    "size": "S",
    "file": "evolve-the-tracker-process-5na7cx.md",
    "href": "tasks/evolve-the-tracker-process-5na7cx.md",
    "lastActivity": "2026-07-22",
    "logEntries": 4
  },
  {
    "title": "Extract and reconcile over the full fiscal-note corpus (fn-data)",
    "status": "backlog",
    "size": "L",
    "file": "fetch-remaining-note-versions-iu6ydx.md",
    "href": "tasks/fetch-remaining-note-versions-iu6ydx.md",
    "lastActivity": "2026-07-10",
    "logEntries": 3
  },
  {
    "title": "iPhone legibility and presentation-idiom polish",
    "status": "blocked",
    "size": "M",
    "awaiting": "your review of phone-width screenshots on an iPhone",
    "file": "iphone-legibility-and-idiom-polish-mqdcu9.md",
    "href": "tasks/iphone-legibility-and-idiom-polish-mqdcu9.md",
    "lastActivity": "2026-08-03",
    "logEntries": 4
  },
  {
    "title": "Assess and build-in a local FY-and-vendor payments dataset - what it replaces, corroborates, extends",
    "status": "blocked",
    "size": "L",
    "awaiting": "your store-lane decision, and a historical pull the profiled extract does not cover",
    "file": "local-dataset-integration-a2zj9o.md",
    "href": "tasks/local-dataset-integration-a2zj9o.md",
    "lastActivity": "2026-08-03",
    "logEntries": 4
  },
  {
    "title": "Reduction DP content - collect ideas and the pension-policy angle",
    "status": "blocked",
    "size": "S",
    "awaiting": "an OFM ruling on candidate 1, then LT selection among the four",
    "file": "reduction-dp-content-zv96kl.md",
    "href": "tasks/reduction-dp-content-zv96kl.md",
    "lastActivity": "2026-08-03",
    "logEntries": 7
  },
  {
    "title": "Carry-by-name convention and per-script column manifests",
    "status": "backlog",
    "size": "M",
    "awaiting": "rung 2's trigger, the authored column manifest going stale in practice",
    "file": "script-column-convention-4mw8qp.md",
    "href": "tasks/script-column-convention-4mw8qp.md",
    "lastActivity": "2026-08-02",
    "logEntries": 1
  },
  {
    "title": "Transform recipe store, the write side (save a recipe from the UI)",
    "status": "backlog",
    "size": "?",
    "file": "transform-recipe-store-r7m3ka.md",
    "href": "tasks/transform-recipe-store-r7m3ka.md",
    "lastActivity": "",
    "logEntries": 0
  },
  {
    "title": "Trust-side separation - operating cost vs benefit impact in COLA-class notes",
    "status": "backlog",
    "size": "M",
    "file": "trust-side-separation-k1yy4b.md",
    "href": "tasks/trust-side-separation-k1yy4b.md",
    "lastActivity": "2026-07-18",
    "logEntries": 3
  },
  {
    "title": "Agent-run bill-to-note pull - WSL pipeline joined to the FNS recipe",
    "status": "backlog",
    "size": "M",
    "file": "wsl-bill-to-note-pull-f2827l.md",
    "href": "tasks/wsl-bill-to-note-pull-f2827l.md",
    "lastActivity": "2026-07-11",
    "logEntries": 1
  },
  {
    "title": "ACFR and CEM layers on the spend sankey",
    "status": "done",
    "file": "acfr-and-cem-layers-on-the-spend-sankey-7m7cfy.md",
    "href": "tasks/acfr-and-cem-layers-on-the-spend-sankey-7m7cfy.md",
    "lastActivity": "2026-07-20",
    "logEntries": 4
  },
  {
    "title": "ACFR evolution - attribute or cut the funding-policy lines",
    "status": "done",
    "session": "claude/budget-drs-assessment-w3vrfe",
    "file": "acfr-attribute-or-cut-funding-policy-lines-ih64w2.md",
    "href": "tasks/acfr-attribute-or-cut-funding-policy-lines-ih64w2.md",
    "lastActivity": "2026-07-25",
    "logEntries": 3
  },
  {
    "title": "App architecture hardening",
    "status": "done",
    "file": "app-architecture-hardening-zjf88j.md",
    "href": "tasks/app-architecture-hardening-zjf88j.md",
    "lastActivity": "2026-07-11",
    "logEntries": 3
  },
  {
    "title": "Chart exposure with app_ring, and census the outer rings",
    "status": "done",
    "session": "claude/data-view-search-owweqe",
    "file": "app-ring-exposure-21784c.md",
    "href": "tasks/app-ring-exposure-21784c.md",
    "lastActivity": "2026-07-28",
    "logEntries": 2
  },
  {
    "title": "Mount the appendix group and the reductions explorer entry",
    "status": "done",
    "session": "claude/budget-drs-tracker-progress-4twk3y",
    "file": "appendix-mount-reductions-explorer-vq3n8d.md",
    "href": "tasks/appendix-mount-reductions-explorer-vq3n8d.md",
    "lastActivity": "2026-07-28",
    "logEntries": 8
  },
  {
    "title": "Appendix views - embed the fn-data FN explorer in the app",
    "status": "done",
    "session": "claude/fiscal-note-explorer-integration-66sgcw",
    "file": "appendix-views-fn-explorer-dwufk1.md",
    "href": "tasks/appendix-views-fn-explorer-dwufk1.md",
    "lastActivity": "2026-07-25",
    "logEntries": 5
  }
];

export default async (page) => {
  await page.waitForFunction(() => window.__shell && window.Alpine, null, { timeout: 15000 });
  await page.evaluate(([tasks, showDone]) => {
    const s = window.__shell;
    s.syncUrl = () => {};
    s.loadProjectBoard = async () => {};      // the seed stands in for the fetch
    s.view = 'project';
    s.projectPath = 'projects/budget-drs';
    s.projectTab = 'board';
    s.projectBoardTasks = tasks;
    s.projectBoardLoading = false;
    s.projectBoardShowDone = showDone;
    s.drawer = false;
  }, [TASKS, !!process.env.DONE]);
  await page.waitForTimeout(600);
};
