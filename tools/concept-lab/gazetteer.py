#!/usr/bin/env python3
"""Build an entity gazetteer from the tables the estate already curates.

The survey in entitylab found the estate's entity tables and found that prose
never reaches them: budget-wa's prose says OFM 280 times while OFM's own agency
table says "Office of Financial Management". This closes that gap from the
table side, and it is the cheapest available lift on NER precision because it
needs no model run: the profile JSON already carries every extracted name.

Sources are declared, not discovered, since the sniffer's shape test finds raw
data dumps alongside real registries.
"""
from __future__ import annotations
import csv, json, re, sys
from pathlib import Path
from collections import defaultdict

# (repo_root_key, path, columns to harvest, class)
SOURCES = [
    ("bwa", "sources/ofm-agency-reference/snapshots/2026-08-01/derived/agencies.csv",
     ["preferred_name"], "agency"),
    ("bwa", "sources/ofm-agency-reference/snapshots/2026-08-01/derived/agency-names.csv",
     None, "agency"),
    ("bwa", "sources/ofm-fund-reference/fund-reference-manual.csv",
     ["Account Title", "Agency Title"], "fund"),
    ("bwa", "crosswalks/bills-lbn/agency-crosswalk.csv", ["name"], "agency"),
    ("spend", "identity/crosswalk/vendors.csv", ["canonical_name", "aliases"], "vendor"),
    ("spend", "contracts/agency-summary/agency-summary.csv", ["agency_name"], "agency"),
]

# The acronym bridge. Tables carry legal names; prose carries these. This is the
# hand-authored half and it is deliberately short: the point is to show the lift
# is real, not to be complete.
ACRONYMS = {
    "OFM": "Office of Financial Management", "DRS": "Department of Retirement Systems",
    "DSHS": "Department of Social and Health Services", "HCA": "Health Care Authority",
    "DES": "Department of Enterprise Services", "DOH": "Department of Health",
    "WSDOT": "Washington State Department of Transportation",
    "L&I": "Department of Labor and Industries", "DOC": "Department of Corrections",
    "DFW": "Department of Fish and Wildlife", "DNR": "Department of Natural Resources",
    "DCYF": "Department of Children, Youth, and Families",
    "SIB": "State Investment Board", "WSIB": "Washington State Investment Board",
    "OSPI": "Office of Superintendent of Public Instruction",
    "SPI": "Superintendent of Public Instruction", "AGO": "Attorney General's Office",
    "WaTech": "Washington Technology Solutions", "ESD": "Employment Security Department",
    "DOR": "Department of Revenue", "LEAP": "Legislative Evaluation and Accountability Program",
    "OSA": "Office of the State Actuary", "SAO": "State Auditor's Office",
    "DVA": "Department of Veterans Affairs", "DSB": "Department of Services for the Blind",
    "LCB": "Liquor and Cannabis Board",
    # UTC (Utilities and Transportation Commission) is deliberately absent. In
    # this estate "UTC" is Coordinated Universal Time: 3,331 mentions in the
    # chat archive against zero for the commission. An acronym gazetteer
    # inherits the estate's polysemy, so a key earns its place on measured
    # usage, not on being a real agency somewhere.
    "PERS": "Public Employees' Retirement System", "TRS": "Teachers' Retirement System",
    "LEOFF": "Law Enforcement Officers' and Fire Fighters' Retirement System",
    "SERS": "School Employees' Retirement System", "PSERS": "Public Safety Employees' Retirement System",
    "WSP": "Washington State Patrol", "ECY": "Department of Ecology",
}

def fold(s): return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

def build(roots: dict) -> dict:
    gaz = defaultdict(set)          # folded -> {classes}
    surface = {}                    # folded -> a display spelling
    for key, rel, cols, cls in SOURCES:
        root = roots.get(key)
        if not root: continue
        path = Path(root) / rel
        if not path.exists():
            print(f"  missing {key}:{rel}", file=sys.stderr); continue
        with path.open(newline="", encoding="utf-8", errors="replace") as fh:
            rd = csv.DictReader(fh)
            use = cols or rd.fieldnames
            n = 0
            for row in rd:
                for c in use:
                    v = (row.get(c) or "").strip()
                    if not v: continue
                    for part in re.split(r"[|;]", v):
                        f = fold(part)
                        if len(f) >= 4 and not f.isdigit():
                            gaz[f].add(cls); surface.setdefault(f, part.strip()); n += 1
        print(f"  {key}:{Path(rel).name} -> {n} values", file=sys.stderr)
    for ac, full in ACRONYMS.items():
        gaz[fold(ac)].add("agency-acronym"); surface.setdefault(fold(ac), ac)
        gaz[fold(full)].add("agency"); surface.setdefault(fold(full), full)
    # Short acronym keys must match case, or folding turns every "doc" into the
    # Department of Corrections: measured, that single collision accounted for
    # 73 of web-tools' 89 gazetteer-confirmed ORG mentions.
    case_strict = sorted({fold(a) for a in ACRONYMS if len(a) <= 4})
    return {"entries": {k: sorted(v) for k, v in gaz.items()},
            "surface": surface, "case_strict": case_strict, "size": len(gaz)}

if __name__ == "__main__":
    roots = dict(s.split("=", 1) for s in sys.argv[1:-1])
    out = Path(sys.argv[-1])
    g = build(roots)
    out.write_text(json.dumps(g, indent=1), encoding="utf-8")
    print(f"gazetteer: {g['size']} folded keys -> {out}", file=sys.stderr)


# ------------------------------------------------------------------- confirm
#
# Applying the gazetteer is its own step with its own rules, because folding is
# lossy in exactly the direction that matters here. `fold` strips every
# non-alphanumeric character so that "L&I" and "L & I" meet, and that same
# strip turns "`Agriculture &" into "agriculture", which a real OFM agency row
# then vouches for. A confirmation step is a trust claim, so it has to refuse a
# name the prose never actually contained.

MARKUP = re.compile(r"[`|~>#*\[\]{}\\•]")
ARTICLE = re.compile(r"^(?:the|a|an) ")

# The model's span boundary is wrong often enough to matter: 34 of 775
# confirmed names carried a trailing possessive ("Verizon Wireless'"), a
# dangling conjunction ("TRS &"), or an unbalanced paren ("Department of
# Social and Health Services (Economic Services Administration"). Masking
# cannot help, since nothing structural is leaking; the recognizer simply
# stopped in the wrong place.
TRAIL = re.compile(r"(?:['’]s?|[,;:&/+\-\u2013\u2014])\s*$")


def trim_span(name: str) -> str:
    """Trim a wrong span boundary back to the name, or return it unchanged.

    Conservative on purpose: it drops trailing punctuation and refuses a name
    whose brackets do not balance, but it never reaches inside the string. An
    unbalanced name returns empty, which `confirm` reads as no match, because
    a truncated organisation is not a name the prose contained.
    """
    n = name.strip()
    for _ in range(3):                       # "Verizon Wireless's," needs two
        trimmed = TRAIL.sub("", n).strip()
        if trimmed == n:
            break
        n = trimmed
    if n.count("(") != n.count(")") or n.count("[") != n.count("]"):
        return ""
    return n
AGENCYISH = {"agency", "agency-acronym", "vendor"}


def confirm(name: str, gaz: dict, want=AGENCYISH):
    """Return the gazetteer classes vouching for `name`, or None.

    Three gates, each one earned by a measured failure:
      markup     the name carries structural markdown, so it is a masking
                 artifact rather than a name. 24 of 582 confirmations before
                 this gate, including "| Governor's Office".
      case       a short acronym key must match case, or every "doc" becomes
                 the Department of Corrections.
      type       the table's class must be one the caller wants, so a fund
                 cannot confirm an organization.
    """
    if MARKUP.search(name):
        return None
    name = trim_span(name)
    if not name:
        return None
    # Statutory prose names agencies with a leading article and in lower case
    # ("the department of health"), which the tables never carry. Trying the
    # de-articled fold as a fallback turned 8 of 9 sampled statutory forms from
    # unconfirmable to confirmed, and it cannot create a false match that the
    # plain fold would not also create.
    f = fold(name)
    classes = gaz["entries"].get(f)
    if not classes:
        f2 = ARTICLE.sub("", f)
        if f2 != f:
            classes = gaz["entries"].get(f2)
            if classes:
                f = f2
    if not classes:
        return None
    if f in set(gaz.get("case_strict", ())) and not name.isupper():
        return None
    return classes if (want is None or set(classes) & want) else None
