// Shoot the GUESS MARKER on a local row: a pasted PowerShell script stages under
// a name nobody supplied, so its extension draws dimmed and dotted while the
// name a file or a MIME type stated draws plain. The second paste is the
// control, arriving as text/html and therefore named from a declaration.
//
//   npm run shot -- app/index.html --query "view=stage" \
//     --script tools/render/scenarios/stage-sniffed-name.mjs --width 390
export default async (page) => {
  await page.waitForSelector('[x-data*="stager"]', { timeout: 15000 });
  await page.evaluate(async () => {
    const ps = `[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Path
)
Get-ChildItem -Path $Path | Where-Object { $_.Length -gt 1kb }`;
    // Straight through the intake, which is where the flag is set: one paste
    // with no name (the sniff runs, the marker goes on) and one carrying the
    // name a clipboard MIME type would have given it (no marker).
    window.StageIntake.take({ text: ps, size: ps.length });
    const html = '<h1>A pasted page</h1>';
    window.StageIntake.take({ text: html, size: html.length, name: '2026-08-24-paste.html' });
  });
  await page.waitForTimeout(600);
};
