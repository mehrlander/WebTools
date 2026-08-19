#!/usr/bin/env python3
"""Report the authored natural-language text living inside code files.

Prose in a `.js` or `.html` file has no carrier and no registry row, so nothing
counts it, nothing renders it, and nothing notices when it goes stale. This
script counts it, in three classes that want three different answers:

    commentary   a comment block: rationale addressed to whoever edits the file.
                 Legitimate in principle. The question is only ever SIZE, since
                 past a few hundred words a comment is a design document that
                 happens to live in a source file.

    text-table   an object literal whose values are prose, keyed by something:
                 `{ "Salaries": "DRS staff pay. The open checkbook never ..." }`.
                 This is CONTENT, not code. It wants a CSV or JSON carrier with
                 a declared authorship, so a non-editor can read and revise it.

    inline       reader-facing sentences hardcoded in markup or a template
                 literal rather than read from a data file.

None of the three is an error and the script never says it is. A comment is
supposed to exist; a two-row gloss table is not worth a CSV. What the run makes
visible is the shape of the estate's undeclared prose: which files carry a
document, which content has no carrier, and how much text ships to the browser
on every load.

Advisory, in the idiom of scripts/unclaimed-code-survey.py and the internal
class of scripts/link-survey.py: heuristic, WILL surface false positives, and
exits 0 unless --check is given a budget to hold.

Portable: python3 stdlib only, argv-driven, runs from any repo root.

Scope it. Unscoped it walks every tracked .js and .html, which will include
vendored shelves and generated payloads whose prose is nobody's to move. Pass
the prefixes you maintain.

Usage:
    python3 text-survey.py [ROOT] [prefix ...] [options]

    --blocks         list every comment block, largest first
    --tables         list every text table
    --inline         list reader-facing prose found in markup and templates
    --csv            emit rows as CSV instead of the summary table
    --min N          floor for the listings (default 40 words)
    --check N        exit 1 if any single comment block exceeds N words
    --weight         add the gzipped transfer cost of the commentary

Reads .js, .mjs, .html, and .py. Python is in scope because a build script is
where a page's reader-facing strings go to hide: a `blurb` list in a builder
reaches a reader exactly as a `blurb` list in a view module does, and the two
should not be countable by different means.
"""
import gzip
import os
import re
import subprocess
import sys

WORD = re.compile(r"[A-Za-z][A-Za-z'’\-]+")
HTML_COMMENT = re.compile(r"<!--(.*?)-->", re.S)
SCRIPT = re.compile(r"<script\b[^>]*>(.*?)</script>", re.S | re.I)
STYLE = re.compile(r"<style\b[^>]*>.*?</style>", re.S | re.I)
EXTS = (".js", ".mjs", ".html", ".py")
SKIP_DIRS = {".git", "node_modules", "dist", ".venv", "__pycache__", ".preview", "thumbs"}

# A '/' opens a regex literal only where a value cannot precede it.
PREV_OPERAND = re.compile(r"[\w$)\]]$")
KEYWORD_BEFORE_REGEX = re.compile(
    r"\b(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$"
)


# ---------------------------------------------------------------- the lexer
#
# Comments cannot be found with a regex in this estate and the failure is not
# theoretical. `surfaces/*.surface` inside a line comment opens a block comment
# that a regex closes 168 KB later, at the next unrelated `*/`, reporting one
# 16,659-word comment where there are 194 real ones. Anything that counts
# comments has to respect strings, template literals, and regex literals, so
# this walks the source once instead.

def js_comments(src, base_line=1):
    """Yield (line, kind, body) for each comment in a JavaScript source."""
    out, i, n, line = [], 0, len(src), base_line
    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
            i += 1
        elif c == "/" and i + 1 < n and src[i + 1] == "/":
            j = src.find("\n", i)
            j = n if j < 0 else j
            out.append((line, "line", src[i + 2:j]))
            i = j
        elif c == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i + 2)
            j = n - 2 if j < 0 else j
            body = src[i + 2:j]
            out.append((line, "block", body))
            line += body.count("\n")
            i = j + 2
        elif c == "/" and not (
            PREV_OPERAND.search(src[:i].rstrip())
            and not KEYWORD_BEFORE_REGEX.search(src[:i].rstrip())
        ):
            i = _skip_regex(src, i, n)
        elif c in "\"'":
            j, i = i, _skip_quoted(src, i, n, c)
            line += src.count("\n", j, i)
        elif c == "`":
            j, i = i, _skip_template(src, i, n)
            line += src.count("\n", j, i)
        else:
            i += 1
    return out


def _skip_regex(src, i, n):
    j, in_class = i + 1, False
    while j < n:
        ch = src[j]
        if ch == "\\":
            j += 2
            continue
        if ch == "\n":
            break
        if ch == "[":
            in_class = True
        elif ch == "]":
            in_class = False
        elif ch == "/" and not in_class:
            return j + 1
        j += 1
    return j


def _skip_quoted(src, i, n, q):
    j = i + 1
    while j < n:
        if src[j] == "\\":
            j += 2
            continue
        if src[j] == q or src[j] == "\n":
            break
        j += 1
    return j + 1


def _skip_template(src, i, n):
    j, depth = i + 1, 0
    while j < n:
        if src[j] == "\\":
            j += 2
            continue
        if src[j] == "$" and j + 1 < n and src[j + 1] == "{":
            depth += 1
            j += 2
            continue
        if depth and src[j] == "}":
            depth -= 1
        elif src[j] == "`" and not depth:
            break
        j += 1
    return j + 1


def coalesce(comments):
    """Merge a run of consecutive `//` lines into the one block a human wrote.

    Counting them separately turns a 400-word essay into thirty short comments
    and hides exactly the thing worth seeing.
    """
    out = []
    for line, kind, body in comments:
        prev = out[-1] if out else None
        if prev and kind == "line" and prev[1] == "line" and line == prev[0] + prev[2].count("\n") + 1:
            out[-1] = (prev[0], "line", prev[2] + "\n" + body)
        else:
            out.append((line, kind, body))
    return out


# ---------------------------------------------------------------- is it prose

def prosey(s):
    """Reject base64 payloads, minified runs, and ascii rules."""
    s = s.strip()
    if len(s) < 3:
        return False
    if len(s) > 60 and (s.count(" ") + s.count("\n")) / len(s) < 0.08:
        return False
    toks = s.split()
    return bool(toks) and sum(len(t) for t in toks) / len(toks) <= 14


NOT_PROSE_VALUE = re.compile(
    r"^[.#\[]|^https?://|^\.{0,2}/|"
    r"^(flex|grid|btn|text-|bg-|border|absolute|relative|w-|h-|p[xytblr]?-|m[xytblr]?-)"
)


def value_words(v):
    """Word count of a literal's value, or 0 if it is markup, a class list, or a path."""
    v = re.sub(r"\s+", " ", v).strip()
    if NOT_PROSE_VALUE.search(v) or not prosey(v):
        return 0
    if v.count("<") > 1:  # a template, not a sentence
        return 0
    n = len(WORD.findall(v))
    return n if n >= 5 else 0


# ---------------------------------------------------------------- the classes

ENTRY = re.compile(
    r"""(?P<k>"[^"\n]{1,80}"|'[^'\n]{1,80}'|[A-Za-z_$][\w$]*)\s*:\s*"""
    r"""(?P<q>["'])(?P<v>(?:\\.|(?!(?P=q))[^\\\n]){12,}?)(?P=q)"""
)
MIN_TABLE_ROWS = 3
TAG = re.compile(r"<[^>]+>")
# A generated payload's text HAS a carrier: whatever its builder read. Counting
# it as content-without-a-carrier inverts the finding, so it is detected and
# reported separately rather than dropped.
GENERATED = re.compile(
    r"generated[ _-]?(by|from)\b|do not edit by hand|@generated|autogenerated", re.I
)


def is_generated(src):
    return bool(GENERATED.search(src[:800]))


# The repo's own content registry, where it has one, is the authority on what a
# file is. Reading it here means the survey reports against the declaration
# rather than beside it, and a file the registry gets wrong shows up as a misfit
# instead of being silently averaged in.

def content_registry(root):
    p = os.path.join(root, "data", "design", "content.csv")
    if not os.path.exists(p):
        return []
    import csv as _csv
    with open(p, encoding="utf-8-sig", newline="") as fh:
        return list(_csv.DictReader(fh))


def declared_mode(reg, rel):
    """The creation_mode of the most specific row covering this path."""
    best = ""
    best_len = -1
    for r in reg:
        loc = r.get("locator", "")
        if rel == loc:
            return r.get("creation_mode", "")
        if loc.endswith("/") and rel.startswith(loc) and len(loc) > best_len:
            best, best_len = r.get("creation_mode", ""), len(loc)
    return best


# ---------------------------------------------------------------- python
#
# The same three classes in a different syntax. A module or function docstring
# is Python's file-header comment, and a dict of prose values is Python's text
# table, which is where a builder's reader-facing strings actually live: a
# `blurb` list in a build script renders in front of a reader exactly like one
# in a view module, and until this ran they had to be counted by hand.

TRIPLES = ('"""', "'''")
PY_STRING = re.compile(
    r"""(?P<q>\"\"\"|'''|"|')(?P<v>(?:\\.|(?!(?P=q))[\s\S])*?)(?P=q)"""
)
PY_ENTRY = re.compile(
    r"""(?P<k>"[^"\n]{1,80}"|'[^'\n]{1,80}')\s*:\s*"""
    r"""(?P<q>["'])(?P<v>(?:\\.|(?!(?P=q))[^\\\n]){12,}?)(?P=q)"""
)
# A message raised, asserted, or printed is addressed to whoever ran the build.
# It is code, not content, and counting it as content roughly doubles the number.
PY_GUARD = re.compile(
    r"\b(raise|assert|sys\.exit|SystemExit|die|fail|warn|print)\s*\(?\s*[A-Za-z_]*\(?$"
)


def py_spans(src):
    """(start, end, kind) for every string literal and `#` comment.

    A walk, not a substitution: a `#` inside a string and a quote inside a
    comment both have to land on the right side of the line.
    """
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if c == "#":
            j = src.find("\n", i)
            out.append((i, n if j < 0 else j, "comment"))
            i = n if j < 0 else j
        elif c in "\"'":
            m = PY_STRING.match(src, i)
            if m:
                out.append((m.start(), m.end(), "string"))
                i = m.end()
            else:
                i += 1
        else:
            i += 1
    return out


def py_comment_blocks(src):
    """Coalesced `#` runs, plus every docstring long enough to be prose."""
    found, run, start = [], [], None
    for a, z, kind in py_spans(src):
        if kind != "comment":
            continue
        line = src.count("\n", 0, a) + 1
        own_line = not src[src.rfind("\n", 0, a) + 1:a].strip()
        if own_line and run and line == start + len(run):
            run.append(src[a + 1:z])
            continue
        if run:
            found.append((start, "\n".join(run)))
            run, start = [], None
        if own_line:
            run, start = [src[a + 1:z]], line
        else:
            found.append((line, src[a + 1:z]))
    if run:
        found.append((start, "\n".join(run)))
    for a, z, kind in py_spans(src):
        if kind == "string" and src[a:a + 3] in TRIPLES:
            body = src[a + 3:z - 3]
            if len(WORD.findall(body)) >= 12:
                found.append((src.count("\n", 0, a) + 1, body))
    return [
        (line, body, len(WORD.findall(body)))
        for line, body in found
        if prosey(body) and len(WORD.findall(body)) >= 3
    ]


def py_text_tables(src):
    """Dict literals whose values are prose."""
    out = []
    for start, blob in _containers(src):
        if not (60 < len(blob) < 200000) or blob[0] != "{":
            continue
        ents = [
            (m.group("k").strip("\"'"), value_words(m.group("v")))
            for m in PY_ENTRY.finditer(blob)
        ]
        ents = [(k, n) for k, n in ents if n]
        if len(ents) >= MIN_TABLE_ROWS:
            out.append((
                src.count("\n", 0, start) + 1, len(ents),
                sum(n for _, n in ents),
                ", ".join(k for k, _ in ents[:5])[:120],
            ))
    return out


def py_inline(src):
    """Prose string literals that are neither docstrings nor guard messages."""
    out = []
    for a, z, kind in py_spans(src):
        if kind != "string" or src[a:a + 3] in TRIPLES:
            continue
        val = src[a + 1:z - 1]
        n = len(WORD.findall(val))
        if n < 8 or not prosey(val) or NOT_PROSE_VALUE.search(val.strip()):
            continue
        if not SENTENCE.search(val) or CODEY.search(val) or "%" in val or "{}" in val:
            continue
        if PY_GUARD.search(src[max(0, a - 80):a].rstrip().rstrip("f")):
            continue
        out.append((src.count("\n", 0, a) + 1, n, re.sub(r"\s+", " ", val)[:200]))
    return out


def comment_blocks(path, src):
    """Class 1: coalesced comment blocks."""
    if path.endswith(".py"):
        return py_comment_blocks(src)
    found = []
    if path.endswith(".html"):
        for m in HTML_COMMENT.finditer(src):
            found.append((src.count("\n", 0, m.start()) + 1, "html", m.group(1)))
        masked = HTML_COMMENT.sub(lambda m: "\n" * m.group(0).count("\n"), src)
        for s in SCRIPT.finditer(masked):
            found += coalesce(js_comments(s.group(1), masked.count("\n", 0, s.start(1)) + 1))
    else:
        found += coalesce(js_comments(src, 1))
    return [
        (line, body, len(WORD.findall(body)))
        for line, _kind, body in found
        if prosey(body) and len(WORD.findall(body)) >= 3
    ]


# A `{` opens an object literal only in expression position. Without this the
# scanner takes an IIFE body for a table and reports every `error: '...'`
# scattered through the module as one 15-row text table.
OBJECT_POSITION = re.compile(r"[=(,:\[]\s*$|\breturn\s*$")
# Keys whose values are addressed to a developer, not a reader.
GUARD_KEY = re.compile(r"^(error|err|msg|message|warn|warning|class|className|style|template|html)$", re.I)


def _containers(src):
    """Outermost balanced `{...}` and `[...]` spans.

    Both shapes carry text: a keyed object (`{Salaries: "..."}`) and an array of
    records (`rows: [{note: "..."}, {note: "..."}]`). Scanning braces alone
    misses every array, because each record inside it is its own small group and
    falls under the row floor.
    """
    depth, start, opener = 0, None, None
    for i, ch in enumerate(src):
        if ch in "{[":
            if depth == 0:
                start, opener = i, ch
            depth += 1
        elif ch in "}]" and depth:
            depth -= 1
            if depth == 0 and start is not None:
                yield start, src[start:i + 1]
                start = None


def text_tables(src):
    """Class 2: literals whose values are prose, keyed by something."""
    out = []
    for start, blob in _containers(src):
        if not (60 < len(blob) < 200000):
            continue
        if not OBJECT_POSITION.search(src[max(0, start - 40):start]):
            continue
        ents, span = [], 0
        for m in ENTRY.finditer(blob):
            key = m.group("k").strip("\"'")
            n = value_words(m.group("v"))
            if n and not GUARD_KEY.match(key):
                ents.append((key, n))
                span += len(m.group(0))
        # Either the entries are most of the literal, or there are simply a lot
        # of them: a registry carrying structure alongside its prose (an app's
        # VIEWS object, a survey's row array) is still a text table, while a
        # function body with three loose strings in it is not.
        if len(ents) >= MIN_TABLE_ROWS and (span >= 0.4 * len(blob) or len(ents) >= 8):
            out.append((
                src.count("\n", 0, start) + 1,
                len(ents),
                sum(n for _, n in ents),
                ", ".join(k for k, _ in ents[:5])[:120],
            ))
    return out


SENTENCE = re.compile(r"[a-z]{2,}\s+[a-z]{2,}\s+[a-z]{2,}")
# A template literal that emits JavaScript reads as prose to a word counter.
CODEY = re.compile(
    r"=>|\bconst\b|\blet\b|\bvar\b|\bfunction\b|\breturn\b|\btypeof\b|"
    r"\.map\(|\.join\(|\.filter\(|\.push\(|\bMath\.|\bJSON\.|\bdocument\.|\bwindow\."
)


def reader_facing(chunk):
    return (
        len(WORD.findall(chunk)) >= 12
        and SENTENCE.search(chunk)
        and not CODEY.search(chunk)
    )


def inline_prose(path, src):
    """Class 3: reader-facing sentences in markup or a template literal.

    Runs on a comment-stripped copy. Without that the template-literal pass
    reads commentary back out of the comments it is meant to be distinct from,
    and every long file-header essay reports twice.
    """
    out = []
    src = strip_comments(path, src)
    if path.endswith(".html"):
        body = SCRIPT.sub(lambda m: "\n" * m.group(0).count("\n"), src)
        body = STYLE.sub(lambda m: "\n" * m.group(0).count("\n"), body)
        body = HTML_COMMENT.sub(lambda m: "\n" * m.group(0).count("\n"), body)
        pos = 0
        for m in TAG.finditer(body):
            chunk = re.sub(r"\s+", " ", body[pos:m.start()]).strip()
            if reader_facing(chunk):
                out.append((body.count("\n", 0, pos) + 1, len(WORD.findall(chunk)), chunk[:200]))
            pos = m.end()
    for m in re.finditer(r"`([^`\\]*(?:\\.[^`\\]*)*)`", src, re.S):
        lit = re.sub(r"\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", " ", m.group(1))
        if "<" not in lit or ">" not in lit:
            continue
        for part in TAG.split(lit):
            part = re.sub(r"\s+", " ", part).strip()
            if reader_facing(part):
                out.append((src.count("\n", 0, m.start()) + 1, len(WORD.findall(part)), part[:200]))
    return out


# ---------------------------------------------------------------- the walk

def tracked_files(root):
    try:
        out = subprocess.run(
            ["git", "-C", root, "ls-files"], capture_output=True, text=True, check=True
        ).stdout
        return [f for f in out.splitlines() if f.endswith(EXTS)]
    except Exception:
        found = []
        for d, dirnames, filenames in os.walk(root):
            dirnames[:] = [x for x in dirnames if x not in SKIP_DIRS]
            for f in filenames:
                if f.endswith(EXTS):
                    found.append(os.path.relpath(os.path.join(d, f), root))
        return found


def strip_comments(path, src):
    """The source with its comments removed, for the transfer-weight figure."""
    if path.endswith(".html"):
        src = HTML_COMMENT.sub("", src)

        def scrub(m):
            body = m.group(1)
            # A second walk, for offsets rather than bodies. Keeps js_comments
            # single-purpose instead of returning two shapes.
            kept, i, n, last = [], 0, len(body), 0
            while i < n:
                c = body[i]
                if c == "/" and i + 1 < n and body[i + 1] == "/":
                    j = body.find("\n", i)
                    j = n if j < 0 else j
                    kept.append(body[last:i])
                    last = i = j
                elif c == "/" and i + 1 < n and body[i + 1] == "*":
                    j = body.find("*/", i + 2)
                    j = n - 2 if j < 0 else j
                    kept.append(body[last:i])
                    last = i = j + 2
                elif c == "/":
                    i = _skip_regex(body, i, n)
                elif c in "\"'":
                    i = _skip_quoted(body, i, n, c)
                elif c == "`":
                    i = _skip_template(body, i, n)
                else:
                    i += 1
            kept.append(body[last:])
            return m.group(0).replace(body, "".join(kept), 1)

        return SCRIPT.sub(scrub, src)
    kept, i, n, last = [], 0, len(src), 0
    while i < n:
        c = src[i]
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            j = src.find("\n", i)
            j = n if j < 0 else j
            kept.append(src[last:i])
            last = i = j
        elif c == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i + 2)
            j = n - 2 if j < 0 else j
            kept.append(src[last:i])
            last = i = j + 2
        elif c == "/":
            i = _skip_regex(src, i, n)
        elif c in "\"'":
            i = _skip_quoted(src, i, n, c)
        elif c == "`":
            i = _skip_template(src, i, n)
        else:
            i += 1
    kept.append(src[last:])
    return "".join(kept)



# Options that take a value. Without this the value is read as a path prefix,
# which silently scopes the run to a directory that does not exist and reports
# a clean zero: the most misleading possible failure for a survey.
VALUED = {"--min", "--check", "--vocab"}


def split_args(argv):
    """(root, prefixes, opts, values) from a flat argv."""
    opts, values, positional = set(), {}, []
    i = 1
    while i < len(argv):
        a = argv[i]
        if a.startswith("--"):
            if "=" in a:
                k, v = a.split("=", 1)
                opts.add(k)
                values[k] = v
            elif a in VALUED and i + 1 < len(argv):
                opts.add(a)
                values[a] = argv[i + 1]
                i += 1
            else:
                opts.add(a)
        else:
            positional.append(a)
        i += 1
    root = positional[0] if positional and os.path.isdir(positional[0]) else "."
    prefixes = positional[1:] if positional and os.path.isdir(positional[0]) else positional
    return root, prefixes, opts, values


BANDS = [("<40", 0), ("40-99", 40), ("100-249", 100), ("250-599", 250), ("600+", 600)]


def band(n):
    for name, floor in reversed(BANDS):
        if n >= floor:
            return name
    return BANDS[0][0]


def main(argv):
    root, prefixes, opts, values = split_args(argv)
    minw = int(values.get("--min", 40))
    check = int(values["--check"]) if "--check" in values else None

    files = tracked_files(root)
    reg = content_registry(root)
    if prefixes:
        files = [f for f in files if any(f.startswith(p.rstrip("/")) for p in prefixes)]

    rows, all_blocks, all_tables, all_inline = [], [], [], []
    for rel in sorted(files):
        try:
            with open(os.path.join(root, rel), encoding="utf-8", errors="replace") as fh:
                src = fh.read()
        except OSError:
            continue
        blocks = comment_blocks(rel, src)
        mode = declared_mode(reg, rel)
        # Either banner says the same thing: the text here has a carrier
        # somewhere else, or was never the estate's to write.
        gen = is_generated(src) or mode in ("supplied", "mechanical")
        tables = py_text_tables(src) if rel.endswith(".py") else text_tables(src)
        inline = py_inline(src) if rel.endswith(".py") else inline_prose(rel, src)
        cw = sum(n for _, _, n in blocks)
        cb = sum(len(b) for _, b, _ in blocks)
        if not (cw or tables or inline):
            continue
        gz_saved = 0
        if "--weight" in opts and cb:
            gz_saved = len(gzip.compress(src.encode())) - len(
                gzip.compress(strip_comments(rel, src).encode())
            )
        rows.append({
            "file": rel, "bytes": len(src), "comment_bytes": cb, "comment_words": cw,
            "blocks": len(blocks), "biggest": max((n for _, _, n in blocks), default=0),
            "tables": len(tables), "table_words": sum(t[2] for t in tables),
            "generated": int(gen), "declared_mode": mode or "-",
            "inline": len(inline), "inline_words": sum(i[1] for i in inline),
            "gz_saved": gz_saved,
        })
        all_blocks += [(rel, ln, n, re.sub(r"\s+", " ", b).strip()[:160]) for ln, b, n in blocks]
        all_tables += [(rel, gen) + t for t in tables]
        all_inline += [(rel,) + i for i in inline]

    if "--csv" in opts:
        import csv as _csv
        w = _csv.DictWriter(sys.stdout, fieldnames=list(rows[0]) if rows else ["file"])
        w.writeheader()
        for r in rows:
            w.writerow(r)
        return 0

    if "--blocks" in opts:
        print("Comment blocks of %d+ words, largest first:\n" % minw)
        for rel, ln, n, text in sorted(all_blocks, key=lambda r: -r[2]):
            if n >= minw:
                print("%6dw  %s:%d\n         %s" % (n, rel, ln, text))
        return 0
    if "--tables" in opts:
        print("Text tables (%d+ prose-valued entries in one literal):\n" % MIN_TABLE_ROWS)
        for rel, gen, ln, nrows, nwords, keys in sorted(all_tables, key=lambda r: -r[4]):
            print("%6dw %3d rows  %s:%d%s\n         keys: %s" % (
                nwords, nrows, rel, ln, "   [generated: carrier is its builder's input]" if gen else "", keys))
        return 0
    if "--inline" in opts:
        print("Reader-facing prose hardcoded in markup or a template:\n")
        for rel, ln, n, text in sorted(all_inline, key=lambda r: -r[2]):
            if n >= 12:
                print("%6dw  %s:%d\n         %s" % (n, rel, ln, text))
        return 0

    tb = sum(r["bytes"] for r in rows)
    cw = sum(r["comment_words"] for r in rows)
    cb = sum(r["comment_bytes"] for r in rows)
    print("Text survey over %d files (%s)\n" % (len(rows), ", ".join(prefixes) or "whole repo"))
    print("  commentary  %s words in %s blocks, %s of %s bytes (%d%%)" % (
        f"{cw:,}", f"{sum(r['blocks'] for r in rows):,}", f"{cb:,}", f"{tb:,}",
        (cb / tb * 100) if tb else 0))
    loose = [r for r in rows if not r["generated"]]
    built = [r for r in rows if r["generated"]]
    unrowed = [r for r in loose if r["declared_mode"] == "-"]
    print("  text-table  %s words in %s tables, no carrier behind them" % (
        f"{sum(r['table_words'] for r in loose):,}", f"{sum(r['tables'] for r in loose):,}"))
    if any(r["tables"] for r in built):
        print("              %s more in %s tables inside generated payloads, which have one" % (
            f"{sum(r['table_words'] for r in built):,}", f"{sum(r['tables'] for r in built):,}"))
    print("  inline      %s words in %s runs, no carrier behind them" % (
        f"{sum(r['inline_words'] for r in loose):,}", f"{sum(r['inline'] for r in loose):,}"))
    if any(r["inline"] for r in built):
        print("              %s more in %s runs inside supplied or generated files" % (
            f"{sum(r['inline_words'] for r in built):,}", f"{sum(r['inline'] for r in built):,}"))
    if reg:
        print("  registry    %d of %d files sit under a content.csv row; %d do not" % (
            len(rows) - len(unrowed), len(rows), len(unrowed)))
    if "--weight" in opts:
        print("  ships       %s gzipped bytes of commentary" % f"{sum(r['gz_saved'] for r in rows):,}")

    counts = {name: [0, 0] for name, _ in BANDS}
    for _rel, _ln, n, _t in all_blocks:
        counts[band(n)][0] += 1
        counts[band(n)][1] += n
    print("\n  comment blocks by size")
    for name, _ in BANDS:
        c, w = counts[name]
        print("    %-8s %5d blocks %9s words %s" % (
            name, c, f"{w:,}", "(a document, not a comment)" if name == "600+" and c else ""))

    print("\n  heaviest files")
    print("    %9s %5s %6s %6s  %s" % ("comment", "share", "blocks", "max", "file"))
    for r in sorted(rows, key=lambda r: -r["comment_bytes"])[:15]:
        print("    %8sB %4d%% %6d %6d  %s" % (
            f"{r['comment_bytes']:,}", r["comment_bytes"] / r["bytes"] * 100,
            r["blocks"], r["biggest"], r["file"]))

    tables = [r for r in loose if r["tables"]]
    if tables:
        print("\n  files holding text tables (content with no data carrier)")
        for r in sorted(tables, key=lambda r: -r["table_words"])[:10]:
            print("    %6sw %3d tables  %s" % (f"{r['table_words']:,}", r["tables"], r["file"]))

    print("\nNone of this is an error. A comment is supposed to exist and a small gloss")
    print("table is not worth a CSV. Read the size bands first: a 600-word comment block")
    print("is a design document with no registry row, and a text table is reader-facing")
    print("content whose only carrier is a source line.")

    if check is not None:
        over = [(r, l, n) for r, l, n, _ in all_blocks if n > check]
        if over:
            print("\n%d comment block(s) over the %d-word budget:" % (len(over), check))
            for rel, ln, n in sorted(over, key=lambda x: -x[2]):
                print("  %6dw  %s:%d" % (n, rel, ln))
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
