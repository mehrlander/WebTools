"""Adjudicating between several readings of the same page.

This is where holding competing extractions finally pays. Every stage before it
was careful to keep methods separate and to avoid picking a winner. Here a
winner gets picked, per cell, and the thing that picks it is not a vote.

## Why arithmetic adjudicates and voting does not

The obvious composition rule is majority vote: take the reading most methods
agree on. It is the wrong rule here, for a reason the corpus makes concrete.
Methods that share a lineage share failure modes, so two tesseract passes at
different segmentation modes will often be wrong the *same way* on the same
degraded glyph. A vote counts that as confirmation. It is a confidence measure
wearing a disguise.

The table's own arithmetic is independent of every method. So the rule is:

> Where methods disagree on a cell, prefer the reading that makes the row
> reconcile. Where none does, report the disagreement and change nothing.

That converts a disagreement into evidence rather than into an average, and it
can only ever promote a reading that some method actually produced. Nothing is
synthesized: if no method read the right digits, this finds nothing, which is
the honest outcome.

## What it cannot do

A relation with one unknown can be solved, so a single bad cell in an otherwise
good row is recoverable. Two bad cells in the same relation are not, and this
does not guess. A consistent misread that preserves the relation (`6,323` and
`6,343` both read with the comma as a `5`, still differing by 20) is invisible
here exactly as it is everywhere else in the harness.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from pages import Word
import tables


@dataclass
class Candidate:
    """One method's reading of a cell that another method read differently."""

    method: str
    text: str
    conf: float | None

    def as_dict(self) -> dict:
        return {"method": self.method, "text": self.text, "conf": self.conf}


@dataclass
class Adjudication:
    """A cell where methods disagreed, and what the arithmetic made of it."""

    page: str
    row_label: str
    column: int
    relation: str
    chosen: Candidate | None            # the reading that reconciles, if any
    baseline: str                       # what the primary method read
    candidates: list[Candidate] = field(default_factory=list)

    @property
    def resolved(self) -> bool:
        return self.chosen is not None and self.chosen.text != self.baseline

    def as_dict(self) -> dict:
        return {
            "page": self.page,
            "row": self.row_label,
            "column": self.column,
            "relation": self.relation,
            "baseline": self.baseline,
            "chosen": self.chosen.as_dict() if self.chosen else None,
            "resolved": self.resolved,
            "candidates": [c.as_dict() for c in self.candidates],
        }


def words_of(record: dict, method_name: str) -> list[Word]:
    """Word list for one named method in a page record."""
    for extraction in record.get("extractions", []):
        if extraction["method"]["name"] == method_name and extraction.get("words"):
            return [
                Word(w["text"], *w["box"], conf=w.get("conf"))
                for w in extraction["words"]
            ]
    return []


def method_keys(record: dict) -> list[str]:
    """Stable labels for the extractions in a record, in recorded order.

    Two tesseract runs differ only by settings, so the name alone does not
    identify them. The label carries the settings that distinguish them, which
    is the same reason `Method.key` exists.
    """
    keys = []
    for extraction in record.get("extractions", []):
        method = extraction["method"]
        settings = method.get("settings") or {}
        psm = settings.get("psm")
        keys.append(f"{method['name']}:psm{psm}" if psm else method["name"])
    return keys


def _all_words(record: dict) -> list[tuple[str, list[Word]]]:
    out = []
    for key, extraction in zip(method_keys(record), record.get("extractions", [])):
        words = [
            Word(w["text"], *w["box"], conf=w.get("conf"))
            for w in extraction.get("words", [])
        ]
        if words:
            out.append((key, words))
    return out


def overlapping(word: Word, candidates: list[Word], min_overlap: float = 0.5) -> list[Word]:
    """Words from another method covering the same place on the page.

    Matching is by box overlap rather than by index, because methods segment
    differently: one may split a token another joins, and neither produces the
    same word list.

    Overlap is measured **against `word`, the cell being replaced**, and the
    asymmetry is deliberate. A method that merged two cells produces a box
    larger than the target and should still match it, so the candidate is
    allowed to be bigger. A method that split the cell, or that landed a stray
    glyph inside it, produces a box much smaller, and that must not match:
    measuring against the smaller box instead scored a one-character fragment
    as a perfect hit, which put readings like `inherited=3` into the evidence
    beside real proposals.
    """
    area = word.width * word.height
    if area <= 0:
        return []
    hits = []
    for other in candidates:
        ix = min(word.right, other.right) - max(word.left, other.left)
        iy = min(word.bottom, other.bottom) - max(word.top, other.top)
        if ix <= 0 or iy <= 0:
            continue
        if (ix * iy) / area >= min_overlap:
            hits.append(other)
    return hits


def adjudicate(record: dict, primary: str | None = None) -> list[Adjudication]:
    """Resolve failed row relations using the other methods' readings.

    Builds the table from the primary method, finds the rows whose relation
    breaks, and for each cell in a broken row asks what the other methods read
    there. A candidate is accepted only when substituting it makes the relation
    hold and no other candidate does, so an ambiguous cell stays unresolved.
    """
    methods = _all_words(record)
    if len(methods) < 2:
        return []
    primary_key = primary or methods[0][0]
    primary_words = dict(methods).get(primary_key)
    if not primary_words:
        return []

    table = tables.find_table(primary_words)
    if not table:
        return []
    relations = tables.discover_relations(table)
    if not relations:
        return []

    page = f"{record.get('doc_id')}/{record.get('page_id')}"
    others = [(k, w) for k, w in methods if k != primary_key]
    results: list[Adjudication] = []

    for relation in relations:
        indices = (relation.a, relation.b, relation.target)
        for row in table.rows:
            values = {i: row.value(i) for i in indices}
            if any(v is None for v in values.values()):
                continue
            expected = (values[relation.a] + values[relation.b] if relation.op == "+"
                        else values[relation.a] - values[relation.b])
            if expected == values[relation.target]:
                continue

            # One cell at a time: substitute each method's reading of it and see
            # whether the row closes. Solving for a single unknown is the whole
            # move; two bad cells are not recoverable and are not guessed at.
            for index in indices:
                cell = row.cells[index]
                candidates: list[Candidate] = []
                for key, words in others:
                    for hit in overlapping(cell, words):
                        # Only money-shaped readings are candidates for a money
                        # cell. A method that segments differently can overlap
                        # the cell with a fragment of the row label, and those
                        # were reaching the output as noise (`inherited=r`).
                        # They can never win, since a non-numeric reading cannot
                        # close a relation, so they are only ever clutter in the
                        # evidence that travels with a proposal.
                        if hit.text != cell.text and tables.parse_money(hit.text) is not None:
                            candidates.append(Candidate(key, hit.text, hit.conf))
                if not candidates:
                    continue

                winners = []
                for candidate in candidates:
                    value = tables.parse_money(candidate.text)
                    if value is None:
                        continue
                    trial = dict(values)
                    trial[index] = value
                    got = (trial[relation.a] + trial[relation.b] if relation.op == "+"
                           else trial[relation.a] - trial[relation.b])
                    if got == trial[relation.target]:
                        winners.append(candidate)

                distinct = {w.text for w in winners}
                chosen = winners[0] if len(distinct) == 1 else None
                results.append(Adjudication(
                    page, row.label[:40] or "(unlabelled)", index, str(relation),
                    chosen, cell.text, candidates,
                ))
    return results
