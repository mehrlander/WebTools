#!/usr/bin/env python3
"""Report the observable SHAPE of every code file, as data.

Sibling to unclaimed-code-survey.py, which asks whether a file is accounted for
in prose. This one asks what a file *is*, mechanically, so a layer rule can be
derived from measurement instead of asserted and then discovered to be false.

The distinction matters because this repo has already written down one layer
rule that read well and was refuted by its own shelf within a day. A rule about
where code lives is only worth writing if the properties it claims to sort on
are properties something can check. So this script emits the properties, one
row per file, and takes no position on which of them should decide anything.

Properties, and why each is here:

  attaches      what the file hangs off: GH.prototype, a window namespace, an
                Alpine.data registration, a node export, or nothing. The
                strongest structural commitment a browser file makes.
  boot          loaded unconditionally by the boot chain (gh-boot.js or a
                bundle) rather than on demand by a page. This is the axis
                nobody has named, and it is the one with a runtime cost.
  hub_dep       runtime dependency on the hub's own loader (window.gh,
                gh.load, gh.get, __loadedScripts). The strongest available
                test of "this file cannot travel to another repo."
  dom           none | handed | places. "handed" takes a host element and
                returns a handle; "places" attaches itself to document.body or
                installs delegated document listeners, deciding where it lives.
                The kit shelf's stated line runs between the last two.
  alpine        references Alpine at all.
  reads         other lib namespaces it reads off window, so the shelf's
                internal coupling is visible rather than assumed.

Node-side files get invocation instead: how the file is actually started
(an npm script, a shebang run by argv, an import from another node file, or
nothing found).

Deliberately NOT here: any notion of "portable capability", "domain", or
"estate". Those are judgments about meaning, they cannot be measured, and the
attempt to sort on them is what produced the retracted rule.

Reads files as BYTES and decodes with errors='replace'. Two files in this repo
carry a literal NUL as a string delimiter, which makes grep classify them as
binary and skip them silently; a survey that inherits that blind spot would
under-report the shelf it exists to describe.

Advisory and read-only. Always exits 0.

Usage:
    python3 code-shape-survey.py [--json] [--root DIR] [prefix ...]

    --json  emit the full per-file table as JSON on stdout (the structured
            stage; the text report is a rendering of the same data)
"""
import json
import os
import re
import subprocess
import sys

CODE_EXT = (".js", ".mjs", ".cjs", ".py", ".sh")
SKIP_DIRS = {".git", "node_modules", "dist", ".venv", "__pycache__", ".preview"}
TEST_HINTS = ("/test/", "/tests/", ".test.", "_test.", "test_")

# Browser code reached by the loader. Everything else is node-side.
BROWSER_PREFIX = "lib/"


def tracked_files(root):
    try:
        out = subprocess.run(
            ["git", "-C", root, "ls-files"],
            capture_output=True, text=True, check=True,
        ).stdout
        return [p for p in out.splitlines() if p]
    except Exception:
        found = []
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for name in filenames:
                rel = os.path.relpath(os.path.join(dirpath, name), root)
                found.append(rel.replace(os.sep, "/"))
        return found


def read(root, rel):
    """Bytes in, text out. Never let a NUL make a file invisible."""
    try:
        with open(os.path.join(root, rel), "rb") as fh:
            return fh.read().decode("utf-8", errors="replace")
    except OSError:
        return ""


RE_BLOCK_COMMENT = re.compile(r"/\*[\s\S]*?\*/")
RE_LINE_COMMENT = re.compile(r"(?m)^\s*//.*$")


def code_only(src):
    """Strip comments before pattern-matching.

    Not cosmetic. Measured against the comments left in, every kit on the shelf
    'used Alpine', because each one's header says it does not. A survey whose
    numbers come from prose about the code rather than the code is exactly the
    failure that produced the rule this repo had to retract, so the stripping
    happens once here and every property below is measured on the result.

    Line comments are stripped only when they START the line, so a URL
    containing '//' survives. Trailing comments are left in, which is a known
    and deliberate under-strip: removing them safely needs a tokenizer, and
    the residue is a few words rather than a file header.
    """
    return RE_LINE_COMMENT.sub("", RE_BLOCK_COMMENT.sub("", src))


def is_test(rel):
    return any(h in "/" + rel for h in TEST_HINTS)


# ---------------------------------------------------------------- browser side

# ASSIGNMENT to the prototype, not a mention of it, and it has two spellings.
#
# Direct (gh-store.js): window.GH.prototype.save = function ...
# Aliased (gh-auth, gh-fetch, gh-transfer): const proto = window.GH.prototype,
#   then proto.req = ... several lines later.
#
# Both forms have to be caught, because between them they ARE the boundary: a
# detector that sees only the direct form reports 2 extenders where there are 5,
# and the one mechanical rule in lib/ looks broken when it is not.
#
# Reading the prototype is deliberately not a match. alpineComponents/proposals.js
# tests `window.GH.prototype.saveRaw !== 'function'` to decide whether to load a
# file; that is a consumer checking for a method, not a file installing one.
# Extending the shared object every page holds is a commitment; reading it is not.
# The prototype boundary has THREE spellings, and each was found by a file the
# previous detector misfiled:
#
#   GH.prototype.get = ...                        direct
#   const p = window.GH.prototype; p.get = ...    aliased through the class
#   const p = window.gh.constructor.prototype     aliased through an INSTANCE
#
# The third is gh-boot.js, which wraps .load that way. A detector reading only
# the first two calls the repo's own boot file a kit, which is the file the rule
# most obviously has to keep. So the alias pattern ends at `.prototype` and does
# not care what precedes it, and a read (`const orig = p.load`) is excluded by
# requiring an assignment TO a member.
RE_PROTO_DIRECT = re.compile(r"GH\.prototype\.[\w$]+\s*=(?!=)")
RE_PROTO_ALIAS = re.compile(
    r"(?:const|let|var)\s+([\w$]+)\s*=\s*[\w$.]*\.prototype\b")


def extends_prototype(src):
    if RE_PROTO_DIRECT.search(src):
        return True
    for alias in set(RE_PROTO_ALIAS.findall(src)):
        if re.search(r"\b" + re.escape(alias) + r"\.[\w$]+\s*=(?!=)", src):
            return True
    return False
RE_WINDOW = re.compile(r"^\s*window\.([A-Za-z_$][\w$]*)\s*=", re.M)
RE_ALPINE_DATA = re.compile(r"Alpine\.data\(\s*['\"]([\w-]+)['\"]")
RE_ALPINE_ANY = re.compile(r"\bAlpine\b")
RE_HUB = re.compile(r"\bgh\.load\b|\bgh\.get\b|\bwindow\.gh\b|__loadedScripts")
RE_READS = re.compile(r"window\.([A-Z][\w$]*)")

# "places" evidence: attaches to the document itself rather than to a host it
# was handed. A transient node that is appended and immediately removed (the
# copy-to-clipboard textarea) is explicitly not this, so it is filtered out.
RE_BODY = re.compile(r"document\.body\.(?:append|appendChild)\s*\(")
RE_DOC_LISTEN = re.compile(r"document\.addEventListener\s*\(")
RE_DOM_ANY = re.compile(
    r"document\.(?:createElement|querySelector|getElementById)|\.innerHTML|"
    r"\.appendChild\s*\(|\.append\s*\("
)
# The transient-clipboard idiom, which every consumer of it copied verbatim.
RE_TRANSIENT = re.compile(r"position:fixed;opacity:0|\.select\(\)[\s\S]{0,80}remove\(\)")


def browser_shape(rel, raw, boot_set):
    src = code_only(raw)
    attaches = []
    if extends_prototype(src):
        attaches.append("GH.prototype")
    globals_set = sorted(set(RE_WINDOW.findall(src)))
    # __private and lowercase-utility globals are noise for this question; the
    # namespace a file PROMISES is the capitalised or camel one it registers.
    ns = [g for g in globals_set if not g.startswith("__")]
    for g in ns:
        attaches.append("window." + g)
    comps = sorted(set(RE_ALPINE_DATA.findall(src)))
    for c in comps:
        attaches.append("Alpine.data:" + c)

    # DOM posture.
    body_hits = len(RE_BODY.findall(src))
    transient = len(RE_TRANSIENT.findall(src))
    doc_listen = len(RE_DOC_LISTEN.findall(src))
    persistent_body = max(0, body_hits - transient)
    if persistent_body or doc_listen:
        dom = "places"
    elif RE_DOM_ANY.search(src):
        dom = "handed"
    else:
        dom = "none"

    reads = sorted({n for n in RE_READS.findall(src)} - set(ns))

    return {
        "attaches": attaches,
        "globals": ns,
        "components": comps,
        "boot": rel in boot_set,
        "hub_dep": bool(RE_HUB.search(src)),
        "dom": dom,
        "dom_evidence": {
            "body_appends": body_hits,
            "transient": transient,
            "document_listeners": doc_listen,
        },
        "alpine": bool(RE_ALPINE_ANY.search(src)),
        "reads": reads,
    }


def boot_loaded(root):
    """Files the boot chain names, expressed as paths relative to lib/.

    gh-boot.js declares its loads as data (the BOOT manifest's `path:` entries
    and the FAB_BOOT values), so read those; keep the literal gh.load() form
    too, for gh-api.js and for any stray literal a later edit adds. Conditional
    equipment (the FAB set) counts as boot: the question this axis answers is
    "does the chain name it", not "does every page pay it"."""
    boot = set()
    for carrier in ("lib/gh-boot.js", "lib/gh-api.js"):
        src = read(root, carrier)
        for m in re.finditer(r"gh\.load\(\s*['\"]([^'\"]+)['\"]", src):
            boot.add("lib/" + m.group(1))
        for m in re.finditer(r"path:\s*['\"]([^'\"]+\.js)['\"]", src):
            boot.add("lib/" + m.group(1))
        fab = re.search(r"const FAB_BOOT = \{(.*?)\};", src, re.S)
        if fab:
            for m in re.finditer(r"['\"]([^'\"]+\.js)['\"]", fab.group(1)):
                boot.add("lib/" + m.group(1))
    # The loader itself and the boot carriers are boot by definition.
    boot |= {"lib/gh-api.js", "lib/gh-boot.js"}
    return boot


# ------------------------------------------------------------------ node side

def node_shape(rel, raw, npm_scripts, node_imports):
    src = code_only(raw)
    if rel in npm_scripts:
        invocation = "npm:" + npm_scripts[rel]
    elif rel in node_imports:
        invocation = "imported"
    elif raw.startswith("#!"):
        invocation = "argv"
    else:
        invocation = "none found"
    return {
        "invocation": invocation,
        "emits": bool(re.search(r"writeFileSync|open\([^)]*['\"][wa]", src)),
        "shebang": raw.startswith("#!"),
    }


def npm_script_map(root):
    """path -> npm script name, for files a package.json script invokes."""
    out = {}
    try:
        with open(os.path.join(root, "package.json"), "rb") as fh:
            pkg = json.loads(fh.read().decode("utf-8", errors="replace"))
    except Exception:
        return out
    for name, cmd in (pkg.get("scripts") or {}).items():
        for m in re.finditer(r"[\w./-]+\.(?:mjs|js|cjs|py|sh)", cmd):
            out.setdefault(m.group(0), name)
    return out


def node_import_set(root, files):
    """Files that another node file imports, so a helper is not read as dead."""
    imported = set()
    for rel in files:
        if not rel.endswith((".mjs", ".js", ".cjs")):
            continue
        src = read(root, rel)
        for m in re.finditer(r"from\s+['\"](\.[^'\"]+)['\"]", src):
            target = os.path.normpath(os.path.join(os.path.dirname(rel), m.group(1)))
            imported.add(target.replace(os.sep, "/"))
    return imported


# --------------------------------------------------------------------- report

def main(argv):
    as_json = "--json" in argv
    argv = [a for a in argv if a != "--json"]
    root = "."
    if "--root" in argv:
        i = argv.index("--root")
        root = argv[i + 1]
        del argv[i:i + 2]
    prefixes = [a for a in argv[1:] if not a.startswith("-")] or ["lib", "scripts", "tools"]

    files = [
        f for f in tracked_files(root)
        if f.endswith(CODE_EXT) and any(f == p or f.startswith(p + "/") for p in prefixes)
    ]
    boot_set = boot_loaded(root)
    npm_scripts = npm_script_map(root)
    node_imports = node_import_set(root, tracked_files(root))

    rows = []
    for rel in sorted(files):
        src = read(root, rel)
        row = {
            "path": rel,
            "layer": os.path.dirname(rel) or ".",
            "lines": src.count("\n") + 1 if src else 0,
            "test": is_test(rel),
            "side": "browser" if rel.startswith(BROWSER_PREFIX) else "node",
            "nul": "\x00" in src or "�" in src,
        }
        if row["side"] == "browser":
            row.update(browser_shape(rel, src, boot_set))
        else:
            row.update(node_shape(rel, src, npm_scripts, node_imports))
        rows.append(row)

    if as_json:
        json.dump({"rows": rows}, sys.stdout, indent=1)
        print()
        return 0

    browser = [r for r in rows if r["side"] == "browser" and not r["test"]]
    print("Code shape survey (advisory; mechanical properties only)\n")
    print(f"Browser code under lib/ ({len(browser)} files)\n")
    hdr = f"{'file':<38} {'attaches':<26} {'boot':<5} {'hub':<4} {'dom':<7} alpine"
    print(hdr)
    print("-" * len(hdr))
    for r in browser:
        att = ", ".join(r["attaches"]) or "-"
        if len(att) > 25:
            att = att[:24] + "…"
        print(f"{r['path'][4:]:<38} {att:<26} "
              f"{'yes' if r['boot'] else '-':<5} {'yes' if r['hub_dep'] else '-':<4} "
              f"{r['dom']:<7} {'yes' if r['alpine'] else '-'}")

    print("\nCross-tabs (each candidate axis, and how it actually cuts):\n")
    folders = sorted({r["layer"] for r in browser})
    for axis, key in (("boot-loaded", lambda r: r["boot"]),
                      ("hub runtime dep", lambda r: r["hub_dep"]),
                      ("places itself in the DOM", lambda r: r["dom"] == "places"),
                      ("Alpine", lambda r: r["alpine"])):
        print(f"  {axis}:")
        for f in folders:
            grp = [r for r in browser if r["layer"] == f]
            n = sum(1 for r in grp if key(r))
            print(f"    {f:<24} {n:>3} of {len(grp):>3}")
        print()

    nul = [r for r in rows if r["nul"]]
    if nul:
        print("Files carrying a NUL byte (invisible to grep, and to any survey "
              "that reads text):")
        for r in nul:
            print("   ", r["path"])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
