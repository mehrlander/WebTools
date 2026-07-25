"""The per-page record: several readings of one page, held side by side.

The shape is the design decision. A record that stores one answer per page (or
per cell) cannot represent the two things this harness exists to surface:

- **Agreement between independent methods**, which is evidence in a way that any
  single method's self-reported confidence is not.
- **Disagreement**, which is a finding and not a failure. A figure three methods
  read three ways is where attention belongs, and a schema that has already
  picked a winner has thrown that away.

So `PageRecord.extractions` is a list, always, even when it holds one entry. The
inherited text layer is stored as just another extraction rather than as a
special field, because it is exactly that: an independent reading by an unknown
engine, useful as a second opinion and not privileged.

Prep is recorded too, not just settings. A figure read off a page that was
rotated 180 degrees first is a different claim from one read off a page that
arrived upright, and the record has to be able to say which.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from pages import Word

SCHEMA = "docstruct/page-record@1"


def rotate_words(words: list[Word], degrees: int, size: tuple[int, int]) -> list[Word]:
    """Rotate word boxes clockwise into the frame of a rotated image.

    `size` is the (width, height) of the image *before* rotation. Needed because
    correcting a page's orientation moves the pixels but not the coordinates of
    any extraction already taken in the old frame, and the whole point of these
    records is that boxes from different methods are comparable.
    """
    deg = degrees % 360
    if deg == 0:
        return words
    w, h = size
    out = []
    for word in words:
        if deg == 90:
            left, top = h - word.bottom, word.left
            width, height = word.height, word.width
        elif deg == 180:
            left, top = w - word.right, h - word.bottom
            width, height = word.width, word.height
        elif deg == 270:
            left, top = word.top, w - word.right
            width, height = word.height, word.width
        else:
            raise ValueError(f"only right-angle rotations supported, got {degrees}")
        out.append(
            Word(word.text, left, top, width, height, word.conf, word.flags, word.line_id)
        )
    return out


@dataclass
class PageRecord:
    doc_id: str
    page_id: str
    source: dict = field(default_factory=dict)
    prep: dict = field(default_factory=dict)
    extractions: list = field(default_factory=list)

    @property
    def key(self) -> str:
        return f"{self.doc_id}/{self.page_id}"

    def as_dict(self) -> dict:
        return {
            "schema": SCHEMA,
            "doc_id": self.doc_id,
            "page_id": self.page_id,
            "source": self.source,
            "prep": self.prep,
            "extractions": [e.as_dict() if hasattr(e, "as_dict") else e for e in self.extractions],
        }

    def write(self, out_dir: Path) -> Path:
        dest = Path(out_dir) / self.doc_id / f"{self.page_id}.json"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(self.as_dict(), separators=(",", ":")))
        return dest

    @staticmethod
    def path_for(out_dir: Path, doc_id: str, page_id: str) -> Path:
        return Path(out_dir) / doc_id / f"{page_id}.json"
