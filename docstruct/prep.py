"""Page preparation: getting the pixels right before anyone reads them.

Only one step lives here so far, and it earns its place. On a 45-page sample of
scanned budget documents, 3 pages arrived misoriented. Left alone they produce
confident nonsense: the recognizer reads upside-down glyphs as whatever they
resemble and reports a number next to the result. That is the worst failure mode
a pipeline can have, because nothing downstream looks wrong.

**Why this does not simply trust the detector.** Tesseract's OSD reports both a
rotation and its own confidence in it. On the same sample it called 180 degrees
at confidence 0.88 on a page that was already upright, and applying the
rotation dropped mean word confidence from 81.7 to 25.8. A threshold on the
detector's confidence would have to sit above 0.88 and below 4.66, which is the
confidence it gave a page that genuinely was upside down. Tuning that threshold
is fitting noise.

So `deskew_rotate` does not tune it. When OSD proposes a non-zero rotation it
recognizes the page both ways and keeps whichever reads better, deciding by an
independent measurement rather than by the detector's opinion of itself. The
cost is one extra recognition pass on the small fraction of pages OSD flags.
This is the same principle the harness applies to competing extractions,
one stage earlier than expected.
"""
from __future__ import annotations

import io
from dataclasses import dataclass

import recognize


@dataclass
class Orientation:
    """The orientation decision for one page, with the evidence behind it."""

    applied: int          # degrees actually rotated, clockwise
    proposed: int         # what OSD suggested
    osd_confidence: float
    measure: str = ""     # which test decided: line_axis | mean_conf | none
    before: float | None = None
    after: float | None = None
    verdict: str = "upright"   # upright | corrected | osd_overruled | undecided

    def as_dict(self) -> dict:
        d = {
            "applied": self.applied,
            "proposed": self.proposed,
            "osd_confidence": round(self.osd_confidence, 2),
            "verdict": self.verdict,
        }
        if self.measure:
            d["measure"] = self.measure
        if self.before is not None:
            d["before"] = round(self.before, 2)
        if self.after is not None:
            d["after"] = round(self.after, 2)
        return d


def rotate_bytes(image: bytes, degrees: int) -> bytes:
    """Rotate encoded image bytes clockwise, returning PNG bytes.

    PNG rather than the source format: this output is an intermediate that
    feeds a recognizer, and re-encoding a JPEG would add generational loss to a
    page we have already decided to modify.
    """
    from PIL import Image

    if degrees % 360 == 0:
        return image
    with Image.open(io.BytesIO(image)) as im:
        # PIL rotates counter-clockwise; OSD reports clockwise.
        out = im.rotate(-degrees, expand=True)
        buf = io.BytesIO()
        out.save(buf, format="PNG")
        return buf.getvalue()


def deskew_rotate(image: bytes, psm: int = 6, margin: float = 2.0) -> tuple[bytes, Orientation]:
    """Return (possibly rotated image bytes, the decision and its evidence).

    Which test decides depends on what the proposed rotation would change:

    - **A quarter turn (90 or 270) transposes the geometry**, so it is judged by
      `line_axis`: do the recognizer's own text lines run along x or along y.
      This is the discriminating test, and mean confidence is not. Tesseract
      orients each text line for itself, so it reads a sideways page's words
      about as well either way (measured 91.3 against 93.0 on one page) while
      still reporting boxes in the sideways frame. Judging that page by
      confidence keeps the transposed geometry and loses every column.
    - **A half turn (180) preserves the axis** and genuinely garbles the text,
      so mean word confidence separates the cases cleanly (measured 34.9
      against 94.1 on a page that was upside down).

    `margin` applies to the mean-confidence test only, guarding against churning
    a page on measurement noise. Neither test is a threshold on OSD's own
    confidence, which is the thing that does not work.
    """
    osd = recognize.orientation(image)
    proposed = osd["rotate"] % 360
    if proposed == 0:
        return image, Orientation(0, 0, osd["confidence"], verdict="upright")

    rotated = rotate_bytes(image, proposed)
    before_ext = recognize.tesseract(image, psm=psm)
    after_ext = recognize.tesseract(rotated, psm=psm)

    if proposed in (90, 270):
        measure = "line_axis"
        before = recognize.line_axis(before_ext.words)
        after = recognize.line_axis(after_ext.words)
        better = before is not None and after is not None and after > before
    else:
        measure = "mean_conf"
        before = before_ext.mean_conf
        after = after_ext.mean_conf
        better = before is not None and after is not None and after > before + margin

    # A page that yields no measurement either way tells us nothing; leave it
    # alone and say so rather than rotating on a coin flip.
    if before is None and after is None:
        return image, Orientation(0, proposed, osd["confidence"], measure, verdict="undecided")
    if before is None:
        better = after is not None
    if better:
        return rotated, Orientation(
            proposed, proposed, osd["confidence"], measure, before, after, "corrected"
        )
    return image, Orientation(
        0, proposed, osd["confidence"], measure, before, after, "osd_overruled"
    )
