---
name: excel-com
description: Drive a live Excel from Windows PowerShell over COM: build a formatted sheet, read the active workbook, walk tables and pivots. Use when writing PowerShell that touches Excel, when a script must reach the running application rather than a file on disk, or when Excel COM throws something that points at the wrong line (a Double-to-String cast on Value2, a FormatException out of a Range call). Carries the traps that cost a round trip each, the ExcelService inventory so existing functions are not rebuilt, and the route gate that asks whether a live Excel is needed at all. Not for writing .xlsx without Excel (xlsx), Power Query M (power-query), or Office Scripts (office-scripts-shape-ui).
---

# Excel over COM, from PowerShell

The operating manual for one route into a workbook. The route table, and whether
a capability already exists on another route, belong to `projects/workbooks/` in
`mehrlander/home`. Language-level PS 5.1 rules belong to `windows-powershell`,
which loads alongside this.

## 1. The route gate: does this need a live Excel?

Answer before writing anything. Sending a job down the COM route that did not
need to go there makes it Windows-only and untestable, and that is the expensive
mistake.

| The job | Route | Testable in a Linux sandbox |
| --- | --- | --- |
| Read a closed `.xlsx` (sheets, queries, connections, pivots) | zip and XML | yes |
| Write a file, no Excel present | OOXML, ClosedXML, EPPlus | yes |
| Active workbook, selection, active cell | **COM** | no |
| Format a sheet someone is looking at | **COM** | no |
| Create or refresh pivots, drive audit arrows | **COM** | no |
| Anything that must survive without Excel installed | not COM | yes |

COM only earns its cost when the running application holds the state. Reading a
workbook's contents is almost never that.

## 2. Do not rebuild `ExcelService`

`mehrlander/home` at `projects/wps/app/Modules/ExcelService/`. Two files, two
routes, one module. Check here before writing a function.

**`ExcelCom.ps1`, the live application:**

| Function | Gets you |
| --- | --- |
| `Get-ExcelApp` | the running app, or `$null` |
| `Get-Excel` | app, active workbook, path, caption, PID, as one object |
| `Get-OpenWb`, `Resolve-Wb` | a workbook by name |
| `Get-Ws` | worksheets as objects with the COM sheet attached |
| `Get-WsItems` | a sheet's tables and pivots, with fields and addresses |
| `Get-WbNames` | named ranges, with scope resolved |
| `Get-SelectedTable` | the active cell's table, with schema, distincts, and pivot consumers |
| `Get-TableUsage` | which pivots read a given table |
| `Get-CellUsage` | precedents and dependents, same-sheet and cross-sheet |
| `Compare-Wb` | two workbooks diffed |
| `Out-Excel` | a collection dumped to a sheet |
| `New-PivotFromSelection` | a pivot off the current selection |
| `Select-ExcelItem` | activate and select any COM object, parent chain resolved |
| `Save-WbCopy` | a temp copy, handling the never-saved case |

**`ExcelXml.ps1`, the closed file (no Excel needed):** `Open-Xlsx`,
`Read-ZipXml`, `Get-Wb`, `Get-WbSummary`, `Get-WsDetail`, `Get-Connections`,
`Get-Queries`, `Get-PowerQuery`, `Get-PivotDetail`, `Get-PivotData`.

If the job is on the right of section 1's table, the answer is often already in
`ExcelXml.ps1`.

## 3. Traps

Each of these throws somewhere other than where the fault is. Measured entries
were hit in this estate and are recorded with their fix; the rest are general.

| Symptom | Cause | Fix | |
| --- | --- | --- | --- |
| `Unable to cast object of type 'System.Double' to type 'System.String'` on a line that never mentions String | PowerShell caches a COM property's resolved signature per type. A header row of strings pins `Value2`'s setter to String; the next number is cast against that stale signature | write the row as one Variant array (section 4) | measured |
| `FormatException` from a `Range(...)` call that reads as correct | `Range` takes `(Cell1, Cell2)`, and its argument comma outranks `-f`, so `Range('B{0}:J{1}' -f 21, 26)` parses as `Range(('B{0}:J{1}' -f 21), 26)` and leaves `{1}` unfilled | hoist every range address to its own line before the call | measured |
| `#VALUE!` from `ABS()` or `SUM()` over cells that look empty | `''` written to a cell is a zero-length string, not a blank | write `$null`, which marshals to `VT_EMPTY` and clears the cell | measured |
| Excel appears frozen after a script errors | `ScreenUpdating = $false` never restored | set it inside `try`, restore in `finally` | measured |
| A build takes seconds and flickers | every property get and set is a synchronous round trip | bulk read and write through `Value2` arrays; never loop cells | measured |
| A cell in a merged range reads empty | a merged range holds its value in the top-left cell only | address the top-left; never reference the covered cells |  |
| Off-by-one on every index | Excel is 1-based, PowerShell is 0-based, and a Variant array bridges the two | keep the conversion in one helper |  |
| A formula is rejected on a non-English install | `.Formula` is US English, `.FormulaLocal` follows the UI | write `.Formula` and let Excel localize the display |  |
| `GetActiveObject` returns nothing while Excel is plainly open | the running instance is at a different elevation, or the ROT entry is missing | fall back to `New-Object -ComObject`, and say which one was used |  |
| `EXCEL.EXE` survives the script | a COM reference is still held | let the app stay visible and user-owned rather than creating and hiding one |  |

## 4. The write pattern

One Variant array per row. This is the fix for the first and fifth traps at once,
and it costs one COM call per row instead of one per cell.

```powershell
function Set-Cells {
    param($Sheet, [int]$Row, [int]$Col, [object[]]$Values)
    $n   = $Values.Count
    $buf = New-Object 'object[,]' 1, $n
    for ($i = 0; $i -lt $n; $i++) { $buf[0, $i] = $Values[$i] }
    $target = $Sheet.Range(
        $Sheet.Cells.Item($Row, $Col),
        $Sheet.Cells.Item($Row, ($Col + $n - 1))
    )
    $target.Formula = $buf
}
```

Three things in there are load-bearing:

- **`.Formula`, not `.Value2`.** A leading `=` becomes a formula, numbers stay
  numbers, and text stays text. One call handles a mixed row.
- **`$null` survives as blank.** See trap three.
- **The array is `object[,]`,** which marshals as a `SAFEARRAY` of `VARIANT`, so
  no per-cell type binding happens and nothing can be pinned.

Around it:

- Name every layout row and column (`$rSrc`, `$fyFirstCol`), never a magic number.
- Build range addresses on their own line, always.
- Wrap the whole build in `try` / `finally` with `ScreenUpdating` restored.
- Take the app with `Get-ExcelApp`, falling back to `New-Object -ComObject`.

## 5. Report-sheet idiom

Provisional. Drawn from two sheets in `projects/wps/working/`, not yet a
convention. Follow it for a sibling of those; do not treat it as house style.

| Element | Treatment |
| --- | --- |
| Title | row 1, bold, 14pt, near-black |
| Section bar | full-width fill, bold, `RowHeight = 18`, label in column A |
| Editable input | blue text (`#0070C0`), so the reader can see what to type over |
| Derived cell | default black |
| Column band | light grey behind the settled or decided columns, header row included |
| Money | `#,##0;(#,##0);"-"` |
| Percent | `0.00%` |
| Gridlines | off (`ActiveWindow.DisplayGridlines = $false`) |
| Widths | label column ~38, data ~13 |

A band means one thing per sheet and the meaning must be stated at the
declaration, since grey reads as "settled" on one sheet and "the request" on
another, and nothing in the sheet says which.

## 6. Make the sheet prove itself

The sheet is built by code that was never run against Excel, so build in a cell
that fails loudly:

```
=SUMPRODUCT(ABS(<block A> + <block B> - <total block>))
```

Reads `0.00` or it does not. `SUMPRODUCT` avoids needing Ctrl+Shift+Enter, so it
survives an older Excel. Point the user at that cell by address in the reply.

This is `favoring-the-mechanical` applied to a workbook: a check that re-derives
the answer beats a claim that the answer is right. The honest limit is the same
one: it proves internal consistency, not that the inputs are correct.

## 7. You cannot run this here

No Excel in a Linux sandbox, and no substitute worth pretending with. So:

- Deliver **one self-contained script**, handed over as a file, not a snippet to
  reassemble.
- Include the check cell from section 6 and **name its address** in the reply.
- Say the code is unrun. Do not report a sheet as working.
- Expect one round trip. Read the diff adversarially before sending, since the
  traps in section 3 are exactly what survives a careful read.

A partial build is the failure mode to watch for in a screenshot: the script
threw mid-way, `finally` restored the display, and the sheet looks finished. The
tells are unformatted numbers, default column widths, and a missing trailing
section. Check the last section exists before believing a screenshot.

## Extending

Open items:

- `Set-Cells`, `Set-Bar`, and `Set-Band` are duplicated across the two scripts in
  `projects/wps/working/`. They want to be a module under `app/Modules/`, at
  which point section 4 shortens to naming it.
- Section 5 rests on two examples by one author in one session. Promote it to a
  convention or drop it once a third sheet exists.
- `ImportExcel` and `EPPlus` sit in the same route as COM in `workbooks` but need
  no running Excel, which makes them behave like section 1's right-hand column.
  Out of scope here until someone uses them.
