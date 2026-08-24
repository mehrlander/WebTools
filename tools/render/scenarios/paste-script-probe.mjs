// What the paste intake makes of SCRIPT-shaped payloads, 2026-08-24.
//
// The sibling of paste-kinds-probe.mjs, which measures the transform-shaped
// ones. This family is the other half: text that a first-character sniff read
// as JSON or as markdown when it was neither. Reported that day, a PowerShell
// script pasted into the stage opened `[CmdletBinding()]`, was named .json on
// the strength of the bracket, and went to the tree view, which has nothing to
// show for text that will not parse.
//
// Measured BEFORE the fix: `[CmdletBinding()]` and a bare script block both
// named .json and opened as a tree; a comment-led script named .md and opened
// as rendered prose; a plain pipeline fell through to .txt. Measured after:
// .ps1 and the code view for all four, with real JSON, a CSV and a markdown
// document unchanged. The naming IS the routing, since READ_MODE keys on the
// extension alone.
//
// It ends by opening the reader on the PowerShell script, so the PNG shows the
// view the fix is about rather than a list of names.
//
//   npm run shot -- app/index.html --query "view=stage" \
//     --script tools/render/scenarios/paste-script-probe.mjs --wait 3000

const PS = `[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Path,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

Get-ChildItem -Path $Path -Recurse |
    Where-Object { $_.Length -gt 1kb } |
    Select-Object FullName, Length |
    Sort-Object Length -Descending`;

const BLOCK = `{
    param($x)
    Write-Host "got $x"
}`;

const COMMENTED = `# Build the report and drop it on disk.
function New-Report {
    param([string]$Out)
    Get-Process | Select-Object Name, CPU | Export-Csv -Path $Out -NoTypeInformation
}`;

const PIPELINE = `$rows = Import-Csv .\\in.csv
$rows | Where-Object { $_.Amount -gt 0 } | Export-Csv .\\out.csv -NoTypeInformation`;

const JSON_OBJ = '{"biennium": "2025-27", "funds": [600, 722, 874]}';
const CSV = 'code,label,jul\nAA,Salaries,186927\nBA,Social Security,9448';
const DOC = `# Cleaning up the share

Run Get-ChildItem against the archive and see what is left behind.`;

export default async function (page) {
  await page.waitForSelector('[x-data*="stager"]', { timeout: 15000 });
  await page.waitForTimeout(1200);

  const out = await page.evaluate(async (payloads) => {
    const results = [];
    for (const [kind, text] of payloads) {
      Alpine.store('browser').stage = [];
      const it = window.StageIntake.take({ text, size: text.length })[0] || {};
      const ext = String(it.name || '').split('.').pop();
      results.push({ kind, ext, mode: window.ViewRegistry.READ_MODE({ ext, content: it.text || '' }) });
    }
    // Leave the PowerShell script staged and open, which is what the PNG is of.
    Alpine.store('browser').stage = [];
    window.StageIntake.take({ text: payloads[0][1], size: payloads[0][1].length });
    const data = Alpine.$data(document.querySelector('[x-data*="stager"]'));
    await data.view(data.items[0]);
    await new Promise(r => setTimeout(r, 900));
    return results;
  }, [['powershell', PS], ['script block', BLOCK], ['commented script', COMMENTED],
      ['plain pipeline', PIPELINE], ['json object (control)', JSON_OBJ],
      ['csv (control)', CSV], ['doc naming a cmdlet', DOC]]);

  console.log('\n--- what a script-shaped paste becomes ---');
  for (const r of out) console.log(`  ${r.kind.padEnd(22)} -> .${String(r.ext).padEnd(6)} opens as: ${r.mode}`);
  console.log('');
}
