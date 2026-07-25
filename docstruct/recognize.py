"""Text recognition, as one method among several.

Every recognizer here returns the same thing: a list of `Word` with boxes in
image pixel space, plus a `Method` record saying exactly what produced them. The
uniformity is the point. Downstream code compares extractions of the same
region, so a method that reports its output in its own shape is a method that
cannot be compared.

Tesseract is the only recognizer wired up so far, and on a clean corpus it may
be the only one worth paying for. Adding another means writing one function that
returns `(Method, list[Word])`; nothing else changes.

**`OMP_THREAD_LIMIT=1` is not optional.** Tesseract links OpenMP and defaults to
one thread per core, so running N copies under a process pool puts N x cores
threads on cores cores. Measured on a 45-page sample on 4 cores: over 600
seconds without it against 18 seconds with it, on identical inputs. Every
subprocess call here sets it, and callers should parallelize with processes.
"""
from __future__ import annotations

import csv
import io
import os
import shutil
import statistics
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from pages import Word


@dataclass(frozen=True)
class Method:
    """What produced an extraction, in enough detail to reproduce it.

    `settings` is free-form per engine but must be complete: two extractions
    that differ only in page-segmentation mode are different methods, and a
    record that cannot tell them apart cannot explain a disagreement.
    """

    name: str
    version: str = ""
    settings: tuple[tuple[str, str], ...] = ()

    @property
    def key(self) -> str:
        bits = "".join(f",{k}={v}" for k, v in self.settings)
        return f"{self.name}{bits}"

    def as_dict(self) -> dict:
        return {"name": self.name, "version": self.version, "settings": dict(self.settings)}


@dataclass
class Extraction:
    """One method's reading of one page."""

    method: Method
    words: list[Word] = field(default_factory=list)
    notes: dict = field(default_factory=dict)

    @property
    def mean_conf(self) -> float | None:
        vals = [w.conf for w in self.words if w.conf is not None]
        return round(statistics.mean(vals), 1) if vals else None

    def as_dict(self) -> dict:
        d = {
            "method": self.method.as_dict(),
            "words": [w.as_dict() for w in self.words],
            "word_count": len(self.words),
        }
        if self.mean_conf is not None:
            d["mean_conf"] = self.mean_conf
        if self.notes:
            d["notes"] = self.notes
        return d


def _env() -> dict:
    env = dict(os.environ)
    env["OMP_THREAD_LIMIT"] = "1"
    return env


_VERSION_CACHE: dict[str, str] = {}


def tesseract_version() -> str:
    if "v" not in _VERSION_CACHE:
        if not shutil.which("tesseract"):
            raise RuntimeError("tesseract not found; run docstruct/bootstrap.sh")
        out = subprocess.run(
            ["tesseract", "--version"], capture_output=True, text=True, env=_env()
        ).stdout
        _VERSION_CACHE["v"] = out.splitlines()[0].replace("tesseract ", "").strip()
    return _VERSION_CACHE["v"]


def tesseract(
    image: bytes | Path,
    psm: int = 6,
    lang: str = "eng",
    min_conf: float = 0.0,
) -> Extraction:
    """Recognize one page image with tesseract, returning word boxes.

    `psm` is the page-segmentation mode and it matters more than it looks: 6
    assumes one uniform block of text, 3 runs full automatic segmentation. On a
    multi-column or tabular page the choice changes the reading order and can
    change which words appear at all, so it is recorded as part of the method.
    """
    method = Method(
        "tesseract",
        tesseract_version(),
        (("psm", str(psm)), ("lang", lang)),
    )
    with _as_file(image) as path:
        # `-c tessedit_create_tsv=1`, never the `tsv` config-file name. Naming
        # the config file has two effects that are easy to miss and expensive to
        # keep: it makes `--psm` a silent no-op, and it degrades recognition on
        # dense pages. Measured on one line-printer row against the page image:
        #
        #   truth        745  87,083  86,712  -371
        #   `tsv` config  74  87,08   85,71   -37     (0 of 4 correct)
        #   `-c` form    745  87,083  85,712  -371    (3 of 4 correct)
        #
        # The config-file form drops the last character of a token, silently and
        # only sometimes: 14.5% of shared tokens on a dense 1979 page, 0% on
        # clean typeset pages from the 1990s. It is exactly the failure this
        # harness is built to catch, and it was in the harness itself.
        proc = subprocess.run(
            ["tesseract", str(path), "stdout",
             "-c", "tessedit_create_tsv=1", "--psm", str(psm), "-l", lang],
            capture_output=True,
            env=_env(),
        )
    if proc.returncode != 0:
        return Extraction(method, [], {"error": proc.stderr.decode("utf-8", "replace")[:400]})

    words = []
    reader = csv.DictReader(
        io.StringIO(proc.stdout.decode("utf-8", "replace")),
        delimiter="\t",
        quoting=csv.QUOTE_NONE,
    )
    for row in reader:
        text = (row.get("text") or "").strip()
        if not text:
            continue
        try:
            conf = float(row["conf"])
        except (KeyError, TypeError, ValueError):
            continue
        # Tesseract emits -1 for structural rows (block, para, line) that carry
        # no word of their own.
        if conf < 0 or conf < min_conf:
            continue
        words.append(
            Word(
                text,
                int(row["left"]),
                int(row["top"]),
                int(row["width"]),
                int(row["height"]),
                conf=conf,
                line_id=(
                    int(row.get("block_num", 0) or 0),
                    int(row.get("par_num", 0) or 0),
                    int(row.get("line_num", 0) or 0),
                ),
            )
        )
    return Extraction(method, words)


def line_axis(words: list[Word]) -> float | None:
    """How strongly text lines run horizontally, from 0 (vertical) to 1.

    Words grouped into a line by the recognizer should spread along the reading
    direction and stay put across it. On an upright page a line spreads in x; on
    a page rotated a quarter turn it spreads in y. Returns the share of lines
    whose x spread exceeds their y spread, or None when there is nothing to
    measure.

    This exists because mean confidence cannot tell the two apart. Tesseract
    reads a sideways page's *text* about as well as an upright one (measured:
    91.3 against 93.0 on the same page), since it orients each text line for
    itself. What it does not do is rewrite the word boxes, so a quarter-turn
    page yields transposed geometry: correct words, unusable columns.
    """
    lines: dict[tuple[int, int, int], list[Word]] = {}
    for w in words:
        if w.line_id is not None:
            lines.setdefault(w.line_id, []).append(w)
    multi = [ws for ws in lines.values() if len(ws) >= 3]
    if not multi:
        return None
    horizontal = 0
    for ws in multi:
        x_spread = max(w.left for w in ws) - min(w.left for w in ws)
        y_spread = max(w.top for w in ws) - min(w.top for w in ws)
        if x_spread > y_spread:
            horizontal += 1
    return horizontal / len(multi)


def orientation(image: bytes | Path) -> dict:
    """Tesseract's OSD reading: degrees to rotate, and how sure it claims to be.

    Returns {"rotate": int, "confidence": float, "script": str}. `rotate` is
    clockwise degrees to apply to make the page upright.

    Treat `confidence` as a claim, not a finding. Measured on one sample it
    reported 180 at confidence 0.88 on a correctly-oriented page, and applying
    that rotation cut mean word confidence from 81.7 to 25.8. `prep.deskew_rotate`
    is the caller that decides, by measuring instead of believing.
    """
    with _as_file(image) as path:
        proc = subprocess.run(
            ["tesseract", str(path), "stdout", "--psm", "0"],
            capture_output=True,
            env=_env(),
        )
    out = proc.stdout.decode("utf-8", "replace")
    result = {"rotate": 0, "confidence": 0.0, "script": ""}
    for line in out.splitlines():
        key, _, value = line.partition(":")
        value = value.strip()
        try:
            if key == "Rotate":
                result["rotate"] = int(value)
            elif key == "Orientation confidence":
                result["confidence"] = float(value)
            elif key == "Script":
                result["script"] = value
        except ValueError:
            continue
    return result


class _as_file:
    """Context manager giving a filesystem path for bytes or an existing path."""

    def __init__(self, image: bytes | Path):
        self.image = image
        self.tmp = None

    def __enter__(self) -> Path:
        if isinstance(self.image, (str, Path)):
            return Path(self.image)
        self.tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        self.tmp.write(self.image)
        self.tmp.close()
        return Path(self.tmp.name)

    def __exit__(self, *exc) -> None:
        if self.tmp is not None:
            Path(self.tmp.name).unlink(missing_ok=True)
