"""Finding tables in recognized words, and checking them against themselves.

Recognition hands back a bag of words with boxes. This turns that into rows,
columns and cells, and then asks the documents to confirm their own numbers.

## Why arithmetic is the control

The harness's general principle is that agreement between independent methods
beats any single method's self-reported confidence. For numeric tables there is
a control that is stronger still, and free: **the table checks itself.** Budget
tables carry totals, both along rows (`GF-S + OTHER = TOTAL`) and down columns
(a `TOTAL` row summing the rows above it).

The distinction that matters: cross-method agreement is evidence about
*characters*, and two recognizers trained on similar data share failure modes.
Arithmetic also tests the *cell assignment*, which is the failure that actually
threatens a budget table. A digit read correctly and filed under the wrong fund
is worse than a dropped one, and no amount of character confidence sees it.
A row that reconciles is a row where recognition and geometry were both right.

So `check_table` reports relations found and whether they hold, and never
repairs anything. A table that does not reconcile is a finding to surface.

## Two traps, both met on real pages

**Money-shaped tokens that are not money.** Bill numbers in row labels
(`5653)`, `(ESSB 5025)`) match any reasonable currency pattern, and prose below
a table contributes years and counts. Clustering numeric tokens page-wide turned
3 real money columns into 8 candidates. The fix is not a better token pattern,
it is geometry: keep only column positions that recur down many rows.

**Page furniture is recognized, not skipped.** Leader dots come back as
`....scccvcescsuctsevencescecsae` and rule banners as `KIKI KKK REE`. These
rarely align into a money column, so column-frequency anchoring already rejects
them, but `is_furniture` drops them earlier so row grouping is not misled.
"""
from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field

from pages import Word

# A money-shaped token: optional currency and sign, digit groups, optional
# parenthesised negative. Deliberately permissive, because rejecting non-money
# is geometry's job, not this pattern's.
MONEY = re.compile(r"^\(?-?\$?\d[\d,]*\)?$")
TOTAL_LABEL = re.compile(r"\btotal\b|\bsubtotal\b|\bsum\b", re.I)


def parse_money(text: str) -> int | None:
    """Parse a money token to an int, treating parentheses as negative."""
    if not MONEY.match(text):
        return None
    negative = text.startswith("(") or text.startswith("-")
    digits = text.strip("()$-").replace(",", "").replace("$", "")
    if not digits.isdigit():
        return None
    value = int(digits)
    return -value if negative else value


DECORATION = set(".*-_=~+|:•· ")


def is_furniture(word: Word) -> bool:
    """True for a token that is page decoration rather than content.

    Leader dots and rule banners are recognized rather than skipped, and the
    recognizer supplies letters when it does so, so filtering on punctuation
    alone is not enough. Two signals carry the work: a token made mostly of
    decoration characters, and a long token the recognizer had no confidence in.

    **Money is never furniture, whatever it looks like.** An earlier version
    flagged any token whose most common character made up 60% of it, which
    quietly dropped `500` and would have dropped `1,000,000`. That is the exact
    class of failure this harness exists to prevent: a value gone missing with
    nothing in the output to say so. The repeated-character test now applies
    only to decoration characters, and money short-circuits ahead of it.

    Banner junk (`KIKI KKK REE`) is deliberately not caught here. It carries
    real letters and no reliable signal at token level, and it does not align
    into a money column, so column-frequency anchoring rejects it downstream.
    Guessing at it here would risk dropping content.
    """
    text = word.text
    if not text:
        return True
    if MONEY.match(text):
        return False
    decoration = sum(1 for c in text if c in DECORATION)
    if len(text) >= 3 and decoration / len(text) >= 0.6:
        return True
    if word.conf is not None and word.conf < 40 and len(text) >= 8:
        return True
    return False


def group_lines(words: list[Word], tolerance: float | None = None) -> list[list[Word]]:
    """Group words into visual lines by vertical center.

    `tolerance` defaults to 60% of the median word height, which adapts to the
    page's own scale instead of hard-coding pixels for one DPI.
    """
    if not words:
        return []
    if tolerance is None:
        heights = [w.height for w in words if w.height > 0]
        tolerance = (statistics.median(heights) * 0.6) if heights else 10
    lines: list[list[Word]] = []
    for word in sorted(words, key=lambda w: w.cy):
        if lines and word.cy - lines[-1][-1].cy <= tolerance:
            lines[-1].append(word)
        else:
            lines.append([word])
    for line in lines:
        line.sort(key=lambda w: w.left)
    return lines


def _cluster(values: list[int], gap: float) -> list[list[int]]:
    clusters: list[list[int]] = []
    for v in sorted(values):
        if clusters and v - clusters[-1][-1] <= gap:
            clusters[-1].append(v)
        else:
            clusters.append([v])
    return clusters


@dataclass
class Row:
    label: str
    cells: dict[int, Word]
    words: list[Word] = field(default_factory=list)

    def value(self, index: int) -> int | None:
        word = self.cells.get(index)
        return parse_money(word.text) if word else None


@dataclass(frozen=True)
class Relation:
    """An arithmetic identity the table appears to assert about its columns."""

    a: int
    b: int
    target: int
    op: str          # + or -
    holds: int = 0
    failed: int = 0

    def __str__(self) -> str:
        return f"c{self.a} {self.op} c{self.b} = c{self.target}"

    def as_dict(self) -> dict:
        return {"relation": str(self), "holds": self.holds, "failed": self.failed}


@dataclass
class Check:
    """One arithmetic relation the table asserts about itself."""

    kind: str          # row_sum | column_total
    where: str         # which row, or which column
    holds: bool
    detail: str = ""

    def as_dict(self) -> dict:
        return {"kind": self.kind, "where": self.where, "holds": self.holds,
                "detail": self.detail}


@dataclass
class Table:
    columns: list[int]
    rows: list[Row]
    checks: list[Check] = field(default_factory=list)

    @property
    def reconciled(self) -> float | None:
        """Share of arithmetic relations that hold, or None when none exist."""
        if not self.checks:
            return None
        return sum(1 for c in self.checks if c.holds) / len(self.checks)

    def as_dict(self) -> dict:
        return {
            "columns": self.columns,
            "row_count": len(self.rows),
            "rows": [
                {"label": r.label,
                 "cells": {str(i): r.cells[i].text for i in sorted(r.cells)}}
                for r in self.rows
            ],
            "checks": [c.as_dict() for c in self.checks],
            "reconciled": self.reconciled,
        }


def find_table(
    words: list[Word],
    min_rows: int = 3,
    min_columns: int = 2,
) -> Table | None:
    """Find the dominant numeric table among a page's words.

    Columns are anchored by right edge, because money is right-aligned and its
    left edge moves with the magnitude of the number. A candidate column is kept
    only when it is hit on a decent share of the lines that carry any money,
    which is what rejects bill numbers and stray years.
    """
    content = [w for w in words if not is_furniture(w)]
    lines = group_lines(content)
    money_lines = [ln for ln in lines if sum(1 for w in ln if MONEY.match(w.text)) >= min_columns]
    if len(money_lines) < min_rows:
        return None

    widths = [w.width for ln in money_lines for w in ln if MONEY.match(w.text)]
    gap = statistics.median(widths) * 0.8 if widths else 40

    edges = [w.right for ln in money_lines for w in ln if MONEY.match(w.text)]
    clusters = _cluster(edges, gap)
    threshold = max(2, len(money_lines) * 0.5)
    columns = sorted(
        int(statistics.median(c)) for c in clusters if len(c) >= threshold
    )
    if len(columns) < min_columns:
        return None

    rows = []
    for line in money_lines:
        cells: dict[int, Word] = {}
        for word in line:
            if not MONEY.match(word.text):
                continue
            index = min(range(len(columns)), key=lambda i: abs(columns[i] - word.right))
            if abs(columns[index] - word.right) <= gap:
                # Right-aligned columns: on a collision keep the rightmost token,
                # which is the one actually sitting in the column.
                if index not in cells or word.right > cells[index].right:
                    cells[index] = word
        if len(cells) >= min_columns:
            # The label is every non-money token on the line, in reading order.
            # An earlier version took only tokens left of the first column,
            # which lost the label on any table that opens with a numeric key:
            # on a line-printer report the section number occupies column 0 and
            # the agency name sits to its right, so every row came back
            # unlabelled.
            label = " ".join(
                w.text for w in sorted(line, key=lambda w: w.left)
                if w not in cells.values() and not MONEY.match(w.text)
            ).strip()
            rows.append(Row(label, cells, line))

    if len(rows) < min_rows:
        return None
    table = Table(columns, rows)
    table.checks = check_table(table)
    return table


def discover_relations(table: Table, support: float = 0.8, min_rows: int = 3) -> list[Relation]:
    """Find the arithmetic the table asserts, rather than assuming it.

    A first version hard-coded "the last column is the sum of the others", which
    is true of a fund table (`GF-S + OTHER = TOTAL`) and false of a comparison
    report, where the third column of each triplet is a difference
    (`SEN-R2 - HOUSE = DIFF`). Assuming either one reports the other as broken.

    So this tests every ordered column triple under addition and subtraction and
    keeps the relations that hold on at least `support` of the rows offering all
    three values. What survives is the table's own structure, discovered from
    the numbers. A column that joins no relation (a section number swept in
    beside the money) simply produces none, which is itself informative.

    Once a relation is established, the rows that violate it are the findings:
    a single bad row against a relation the rest of the table obeys is a strong
    signal of a misread digit or a cell in the wrong column. Demonstrated on a
    real page: tesseract read `564` as `504` at 91.2% confidence, and the
    relation `TOTAL-HOUSE + DIFF = TOTAL-SENATE` was what noticed.

    **The limit worth knowing:** support is a share, so on a short table one bad
    row can keep a relation from being established at all rather than showing up
    as a violation of it (one row in four is 75%, under the default). No
    relation found means "not established," never "checked and fine," and
    `Table.reconciled` is None rather than 1.0 to keep those apart.
    """
    n = len(table.columns)
    found: list[Relation] = []
    for a in range(n):
        for b in range(n):
            if a == b:
                continue
            for c in range(n):
                if c in (a, b):
                    continue
                for op in ("+", "-"):
                    if op == "+" and b < a:
                        continue  # addition commutes; test each pair once
                    holds = failed = 0
                    for row in table.rows:
                        va, vb, vc = row.value(a), row.value(b), row.value(c)
                        if va is None or vb is None or vc is None:
                            continue
                        expected = va + vb if op == "+" else va - vb
                        if expected == vc:
                            holds += 1
                        else:
                            failed += 1
                    total = holds + failed
                    if total >= min_rows and holds / total >= support:
                        found.append(Relation(a, b, c, op, holds, failed))
    # `x + y = z`, `z - x = y` and `z - y = x` are one identity written three
    # ways. Keeping all three would triple-count the same evidence, so collapse
    # by the set of columns involved and keep the best-supported statement.
    found.sort(key=lambda r: (-r.holds, r.failed))
    kept: list[Relation] = []
    seen: set[frozenset[int]] = set()
    for rel in found:
        signature = frozenset((rel.a, rel.b, rel.target))
        if signature not in seen:
            seen.add(signature)
            kept.append(rel)
    return kept


def check_table(table: Table) -> list[Check]:
    """Ask the table to confirm its own numbers.

    Two families, both independent of any recognizer:

    - **row relations**, discovered by `discover_relations`: every row is then
      checked against the arithmetic the table itself asserts.
    - **column totals**: a row whose label says total, against the sum of the
      data rows above it.

    Reported, never repaired. A relation that fails is the finding.
    """
    checks: list[Check] = []
    n = len(table.columns)

    for rel in discover_relations(table):
        for row in table.rows:
            va, vb, vc = row.value(rel.a), row.value(rel.b), row.value(rel.target)
            if va is None or vb is None or vc is None:
                continue
            expected = va + vb if rel.op == "+" else va - vb
            checks.append(Check(
                "row_relation",
                f"{row.label[:34] or '(unlabelled)'} [{rel}]",
                expected == vc,
                f"{va:,} {rel.op} {vb:,} = {vc:,}"
                + ("" if expected == vc else f" (expected {expected:,})"),
            ))

    total_rows = [i for i, r in enumerate(table.rows) if TOTAL_LABEL.search(r.label)]
    for index in total_rows:
        # Only meaningful when the total closes a block of data rows, and only
        # against rows that are not themselves totals.
        data = [r for r in table.rows[:index] if not TOTAL_LABEL.search(r.label)]
        if len(data) < 2:
            continue
        for col in range(n):
            stated = table.rows[index].value(col)
            parts = [r.value(col) for r in data]
            if stated is None or any(p is None for p in parts):
                continue
            checks.append(Check(
                "column_total",
                f"{table.rows[index].label[:30]} col {col}",
                sum(parts) == stated,
                f"sum of {len(parts)} rows = {sum(parts):,}, stated {stated:,}",
            ))
    return checks
