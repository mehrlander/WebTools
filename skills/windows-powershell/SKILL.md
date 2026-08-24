---
name: windows-powershell
description: Windows PowerShell 5.1 (Desktop Edition) code generation with strict version constraints. Use when writing PowerShell for Windows environments, especially government/enterprise where 7.x is unavailable. Enforces 5.1-compatible syntax, prevents use of ternary operators, null coalescing, pipeline chains, and -Parallel. Covers performance patterns, defensive coding (TLS 1.2, left-hand null), and pipeline-first design.
---

# PowerShell 5.1 Grounding

Generate code strictly compatible with Windows PowerShell 5.1 / .NET Framework 4.5+. Actively suppress syntax introduced in PowerShell Core 6.0+.

## Hard Constraints

These cause immediate parse/runtime failure in 5.1:

| Prohibited | Use Instead |
|------------|-------------|
| `$x ? $a : $b` | `if ($x) { $a } else { $b }` |
| `$x ?? 'default'` | `if ($null -eq $x) { 'default' } else { $x }` |
| `$x ??= 'val'` | `if ($null -eq $x) { $x = 'val' }` |
| `cmd1 && cmd2` | `cmd1; if ($?) { cmd2 }` |
| `cmd1 \|\| cmd2` | `cmd1; if (-not $?) { cmd2 }` |
| `ForEach-Object -Parallel` | `foreach` loop, or runspace pool if concurrency needed |
| `ConvertFrom-Json -AsHashtable` | Cast or transform after: `$ht = @{}; $obj.PSObject.Properties \| ForEach-Object { $ht[$_.Name] = $_.Value }` |

## Performance Patterns

### Collection Building

The `+=` operator on arrays is O(n²): each addition allocates a new array and copies all elements.

```powershell
# BAD - exponential slowdown
$results = @()
foreach ($item in $data) { $results += $item }

# GOOD - pipeline capture (preferred)
$results = foreach ($item in $data) { $item }

# GOOD - List<T> for conditional additions
$results = [System.Collections.Generic.List[object]]::new()
foreach ($item in $data) {
    if ($item.Valid) { $results.Add($item) }
}
```

### Object Creation

```powershell
# BAD - slow
$obj = New-Object PSObject -Property @{ Name = 'x'; Value = 1 }

# GOOD - type accelerator
$obj = [PSCustomObject]@{ Name = 'x'; Value = 1 }
```

## Closures and Scriptblocks

### `GetNewClosure()` Captures References, Not Values

`GetNewClosure()` snapshots variable *references* at call time. If the variable is reassigned later, or hasn't been defined yet, the closure sees the wrong value. Two rules:

- Variables must be defined **before** the closure block that references them.
- For deferred actions passed through hashtables or across scope boundaries, bake the value in at creation time:

```powershell
# BAD - $path may change before this runs
$action = { Start-Process $path }.GetNewClosure()

# GOOD - value frozen at creation
$action = [scriptblock]::Create("Start-Process '$path'")
```

### `[scriptblock]::Create()` Quoting for Paths with Spaces

When building scriptblocks dynamically with paths that may contain spaces, the quoting stacks:

```powershell
[scriptblock]::Create("Start-Process powershell_ise.exe '""$path""'")
```

Outer single quotes are for PowerShell; inner doubled double-quotes handle OS-level argument parsing. Never use `-ArgumentList` with `powershell_ise.exe`: it triggers ISE's own switch parser and fails.

## Interop Boundaries

Most sharp edges in PowerShell come from crossing abstraction boundaries: PS/COM, PS/Win32, PS/WPF, PS/.NET compilation. Knowing which boundary you're at tells you what class of problem to expect.

### `Add-Type` Is Permanent per Session

`Add-Type` compiles a type into the AppDomain permanently. Two consequences:

- Defining the same type name twice throws. Guard before calling `Add-Type`:

```powershell
if (-not ([System.Management.Automation.PSTypeName]'MyNamespace.MyType').Type) {
    Add-Type -TypeDefinition $csharpCode
}
```

- `Import-Module -Force` reloads PS functions but **not** compiled types. Testing changes to a C# block requires a fresh session.

### P/Invoke Delegate Types

PowerShell cannot marshal generic `Func<>` or `Action<>` types for P/Invoke callbacks. Always define a named delegate in the C# block:

```csharp
public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
```

### COM Read vs. Write Performance

Reading a COM property is a synchronous round-trip: the COM server must respond before execution continues. Writing often returns immediately. For anything user-facing (double-click handlers, UI refresh), avoid COM reads on the hot path. Replace conditional reads with unconditional writes where possible.

## Defensive Patterns

### TLS 1.2 for Web Calls

5.1 defaults to SSL3/TLS1.0, rejected by modern APIs. Prime at script start:

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
```

### Left-Hand Null Comparisons

When left side is an array, `$array -eq $null` filters rather than tests. Always:

```powershell
if ($null -eq $Value) { ... }  # correct
if ($Value -eq $null) { ... }  # dangerous
```

### Comma Binds Tighter Than Arithmetic

In an array literal the comma outranks `+ - * /`, so `@('Rows', $rows - 1)` parses as `('Rows', $rows) - 1` and throws `op_Subtraction` on the `Object[]`. Parenthesize the element:

```powershell
@('Rows', ($rows - 1))   # correct
@('Rows', $rows - 1)     # throws: op_Subtraction on Object[]
```

A scalar inside the list probes clean throughout; the parens go around it, not in it. Note that a fault in a multiline literal is reported at the line it opens on, not the offending entry.

### Array Guarantor @()

Streaming commands return inconsistent types (null/scalar/array) depending on how many items they emit. Wrap when you need `.Count` or indexing:

```powershell
$items = @(Get-ChildItem $Path -Filter *.txt)
$items.Count  # always works
```

`@()` guarantees an array around the objects a command *emits*. It does not descend into a collection handed to it whole. `Get-ChildItem` streams its items one at a time, so `@()` collects them into an N-element array. A command that emits a whole array as a single object is the opposite case: `@()` wraps that one object and you get a length-1 array with the array itself nested inside. See **JSON Quirks** for that trap and how to spot it.

### JSON Quirks

In 5.1, `ConvertFrom-Json` and `Invoke-RestMethod` emit a top-level JSON array as a *single bulk object*, not as a stream of elements. Direct assignment binds that array intact and reports its true count. Wrapping the call in `@()` is the trap: `@()` collects the one emitted object and guarantees an array around it, producing a length-1 outer array with the array itself nested one layer down.

```powershell
$data = ConvertFrom-Json $raw       # clean: $data.Count is N
$data = @(ConvertFrom-Json $raw)    # trap:  $data.Count is 1, $data[0] is the N-element array
```

`Invoke-RestMethod` parses identically (confirmed on 5.1.26100, object/single/multi roots): do not `@()` either one. The array you want is already there. This is the streaming-versus-bulk distinction from **Array Guarantor @()**: the deciding question for any command is whether it enumerates its output or emits it in bulk.

**A lone object is countless.** A JSON object root (`{...}`, not an array) deserializes to a single `PSCustomObject` whose `.Count` is `$null`, so code that trusts `$data.Count` silently reads nothing. When the root may be a single object and you want a guaranteed array, capture first, then wrap the variable, never the call:

```powershell
$data = ConvertFrom-Json $raw
$arr  = @($data)   # object -> length-1 array; array stays its true length N
```

Wrapping the variable normalizes every root. Wrapping the call wraps whatever single thing the command emitted, which is the array trap above.

**Fingerprint.** A bulk-wrapped value passes visual inspection and fails iteration. It prints as N tidy rows, because the formatter flattens nesting for display. But `.Count` is 1, and a `foreach` or pipeline over it binds once to the inner array, so member access concatenates every element's value into one blob: `$b.label` returns all N labels at once. N objects collapsing to one output with values *concatenated* is the signature, distinct from a loop running once over a scalar.

**Diagnose by measurement, not by eye.** The printout lies. Confirm shape with `.Count` and `$x[0].GetType().FullName`. An `Object[]` at element zero is the wrap.

**Fix the shape, not the loop.** Dropping `@()` is the fix. Switching `foreach` to a pipeline does not help: both bind once to a wrapping layer, since the pipeline unrolls only the outer level.

### Property Existence on Deserialized Objects

Prefer `$_.name` over `$_.PSObject.Properties['name']` for conditional access. It's cleaner, returns `$null` for missing properties, and pairs with `IsNullOrWhiteSpace` to catch empty strings too:

```powershell
if (-not [string]::IsNullOrWhiteSpace($_.group)) { $_.group } else { 'Other' }
```

## Pipeline Design

From James O'Neill's principles, maximize reuse by building composable blocks:

### Return Rich Objects

Don't format inside functions. Return objects with properties; let callers format.

```powershell
# BAD - returns formatted string
function Get-ServerInfo { "Server: $Name, Status: $Status" }

# GOOD - returns object
function Get-ServerInfo {
    [PSCustomObject]@{ Name = $Name; Status = $Status }
}
```

### Accept Pipeline Input Properly

When both parameter and pipeline input are valid, use begin/process/end:

```powershell
function Process-Items {
    [CmdletBinding()]
    param(
        [Parameter(ValueFromPipeline)]
        [string[]]$Name
    )
    begin { $all = [System.Collections.Generic.List[string]]::new() }
    process { foreach ($n in $Name) { $all.Add($n) } }
    end { 
        foreach ($item in $all) { <# work here #> }
    }
}
```

### Prevent Array Enumeration

To pass array as single object through pipeline:

```powershell
,$array | SomeFunction           # unary comma wrapper
Write-Output $array -NoEnumerate # explicit
```

### Sensible Defaults

If a parameter has an obvious default (current computer, current directory), set it. Convert constants to parameters with defaults for flexibility.

## Practical Idioms

### HttpListener Server

```powershell
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8080/")
$listener.Start()

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $response = $context.Response
    
    $html = '<html><body>Hello</body></html>'
    $buffer = [Text.Encoding]::UTF8.GetBytes($html)
    
    $response.ContentType = 'text/html'
    $response.ContentLength64 = $buffer.Length
    $response.OutputStream.Write($buffer, 0, $buffer.Length)
    $response.Close()
}
```

## Style (User Preferences)

- **MWE-style**: minimal working examples, no defensive cruft unless specified
- **Skip validation/error handling** unless explicitly requested
- **No aliases in scripts**: use `ForEach-Object` not `%`, `Where-Object` not `?`
- **Single quotes** for literals, double quotes only when interpolating
- **No comments.** Not sparse comments, none. Reasoning goes in the commit
  message, the PR body, or a tracker task, and usage goes in the folder's README.
  Those are read; interspersed comments are not, and they become a second copy of
  the reasoning that nothing checks. Set 2026-08-24, replacing "explain *why*, not
  *what*", which licensed the habit by saying nothing about how often.

## WPF Forms Module

A custom module (always already imported) providing `New-Wpf`, `Import-Form`, and `Show-Form`. **Always use this instead of raw `XamlReader` + `FindName` + `ShowDialog`.**

> **When the task involves WPF forms, UI layout, theming, or data binding, ask the user to share the current `Forms.psm1` and `Theme.xaml` before generating code. These change often enough that any stale snapshot would mislead. Rely on what the user provides.**

### Quick Reference

**Two modes:**

| | **Inline** | **Import-Form** |
|---|---|---|
| XAML lives in | here-string | `Forms\FormName\FormName.xaml` |
| Wiring lives in | same script, after `New-Wpf` | `Forms\FormName\FormName.ps1` (the *controller*) |
| Entry point | `New-Wpf` + `Show-Form` | `Import-Form 'FormName' \| Show-Form` |
| Good for | utilities, one-off tools | reusable forms, anything with a controller |

**Wrapper object.** `New-Wpf` returns `$wrapper` with: `Element`, `Window`, `Tag` (cross-closure state; use this, not `$script:`), `FormResult`, `Components`, `FormDirectory`, plus every `x:Name`d control auto-added as a property.

**Key methods** (full signatures in the current `Forms.psm1` the user provides): `Return`, `SetTimeout`, `Defer`, `CopyToClipboard`, `On`, `SetDataContext`, `AddComponent`, `CreateVariables`.

**Theme.** `Theme.xaml` is auto-merged into every Window's resources. Use `{DynamicResource KeyName}` freely. The full list of brush keys and named styles lives in the current `Theme.xaml` the user provides.

### UI Thread Discipline

Any blocking call on the UI thread (COM reads, `Get-Process`, file I/O) freezes the form. Cache expensive lookups (like process handles) at startup. Use `SetTimeout`/`Defer` to yield to the dispatcher for non-critical post-action updates like refreshing a list.

### Single Application Constraint

Only one `System.Windows.Application` can exist per AppDomain. A helper dialog launched from inside a running WPF form must call `$window.ShowDialog()` directly, never through a wrapper that instantiates a new `Application`. If you need a child dialog, build its Window and call `ShowDialog()` on it; don't route through `Show-Form` again.

### What NOT to Do

```powershell
$btn = $wrapper.Window.FindName('btnOk')   # unnecessary, use $wrapper.btnOk
$script:count = 0                          # use $wrapper.Tag.count
[void]$wrapper.Window.ShowDialog()         # use Show-Form $wrapper
$timer.Start()                             # start inside Add_Loaded, not at script root
```
