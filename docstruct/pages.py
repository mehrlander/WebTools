"""Getting pixels and any inherited text out of a scanned document.

This is the input layer. Everything downstream works on a `Page`, and a `Page`
comes from one of three shapes of source: a directory of one-page PDFs, a
multi-page PDF, or a directory of images.

Two things here are worth more than they look.

**Lossless extraction.** A scanned PDF page is usually a thin wrapper around a
single JPEG. `Document.extract_image()` hands back that embedded stream byte for
byte with no re-encode, so the pixels a recognizer sees are the pixels the
scanner produced. Rasterizing the page instead (`get_pixmap`, `pdftoppm`) throws
that away: it decodes the JPEG, composites it at some DPI of your choosing, and
re-encodes, which is both slower and lossy. `Page.image_bytes()` takes the
lossless path when the page is a single-image wrapper and falls back to
rasterizing only when it is not.

**The inherited text layer is method zero.** Many scanned PDFs already carry an
invisible text layer from whoever digitized them, word-positioned and sometimes
tagged with the original engine's own doubts. It is free, it is independent of
anything we run, and it is often bad. `Page.inherited_words()` returns it in the
same shape as a recognizer's output so the two can be compared cell by cell
rather than as blobs of text.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover - bootstrap.sh installs it
    fitz = None

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}


@dataclass
class Word:
    """One recognized or inherited word, with its box in image pixel space.

    `conf` is whatever the producing method reports, on a 0-100 scale, or None
    when it reports nothing. It is deliberately not defaulted to 100: a method
    that does not grade itself should not look confident.
    """

    text: str
    left: int
    top: int
    width: int
    height: int
    conf: float | None = None
    flags: tuple[str, ...] = ()
    # (block, paragraph, line) as reported by the producing method, when it
    # reports one. Used to test which axis text lines run along, which is how
    # a sideways page is detected. None for methods that do not group words.
    line_id: tuple[int, int, int] | None = None

    @property
    def right(self) -> int:
        return self.left + self.width

    @property
    def bottom(self) -> int:
        return self.top + self.height

    @property
    def cy(self) -> int:
        return self.top + self.height // 2

    def as_dict(self) -> dict:
        d = {
            "text": self.text,
            "box": [self.left, self.top, self.width, self.height],
        }
        if self.conf is not None:
            d["conf"] = round(self.conf, 1)
        if self.flags:
            d["flags"] = list(self.flags)
        return d


@dataclass
class Page:
    """One page of a document, identified by (doc_id, page_id)."""

    doc_id: str
    page_id: str
    path: Path
    index: int = 0  # page number within path, for multi-page PDFs
    _cache: dict = field(default_factory=dict, repr=False)

    @property
    def key(self) -> str:
        return f"{self.doc_id}/{self.page_id}"

    # ---- pixels ---------------------------------------------------------

    def image_bytes(self, dpi: int = 300) -> tuple[bytes, str, tuple[int, int]]:
        """Return (bytes, extension, (width, height)) for this page's pixels.

        Takes the lossless path when the page is a single embedded image.
        Falls back to rasterizing at `dpi` when it is not (a born-digital page,
        or a scan composited from several image blocks).
        """
        if "img" in self._cache:
            return self._cache["img"]
        if self.path.suffix.lower() in IMAGE_SUFFIXES:
            data = self.path.read_bytes()
            out = (data, self.path.suffix.lower().lstrip("."), _image_size(data))
            self._cache["img"] = out
            return out

        doc = self._doc()
        page = doc[self.index]
        images = page.get_images(full=True)
        if len(images) == 1:
            extracted = doc.extract_image(images[0][0])
            out = (
                extracted["image"],
                extracted["ext"],
                (extracted["width"], extracted["height"]),
            )
        else:
            pix = page.get_pixmap(dpi=dpi)
            out = (pix.tobytes("png"), "png", (pix.width, pix.height))
        self._cache["img"] = out
        return out

    def lossless(self) -> bool:
        """True when image_bytes() returned the embedded stream untouched."""
        if self.path.suffix.lower() in IMAGE_SUFFIXES:
            return True
        doc = self._doc()
        return len(doc[self.index].get_images(full=True)) == 1

    def write_image(self, dest_dir: Path) -> Path:
        data, ext, _ = self.image_bytes()
        dest = Path(dest_dir) / f"{self.doc_id}-{self.page_id}.{ext}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return dest

    # ---- the inherited text layer (method zero) -------------------------

    def inherited_words(self) -> list[Word]:
        """Words already embedded in the PDF, scaled to image pixel space.

        Returns [] for an image source or a PDF with no text layer. Words the
        original engine tagged as doubtful carry a "suspect" flag; the tag is
        marked-content in the content stream, so it is read separately and
        matched back by position.
        """
        if self.path.suffix.lower() in IMAGE_SUFFIXES:
            return []
        doc = self._doc()
        page = doc[self.index]
        _, _, (px_w, px_h) = self.image_bytes()
        rect = page.rect
        if not rect.width or not rect.height:
            return []
        sx, sy = px_w / rect.width, px_h / rect.height

        # Flip the suspect boxes from PDF bottom-up space into the top-down
        # space get_text() reports, then match by center containment: the two
        # boxes describe the same glyphs but are not built the same way, so
        # strict containment misses and center-in-box is the honest test.
        page_h = rect.height
        suspect_boxes = [
            (bx0, page_h - by1, bx1, page_h - by0)
            for bx0, by0, bx1, by1 in _suspect_regions(page)
        ]
        words = []
        for x0, y0, x1, y1, text, *_ in page.get_text("words"):
            left, top = int(x0 * sx), int(y0 * sy)
            w, h = int((x1 - x0) * sx), int((y1 - y0) * sy)
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            flags = ()
            if any(bx0 <= mx <= bx1 and by0 <= my <= by1
                   for bx0, by0, bx1, by1 in suspect_boxes):
                flags = ("suspect",)
            # No confidence: the inherited layer reports none, and the suspect
            # tag is a flag rather than a score.
            words.append(Word(text, left, top, w, h, conf=None, flags=flags))
        return words

    # ---- internals ------------------------------------------------------

    def _doc(self):
        if "doc" not in self._cache:
            if fitz is None:
                raise RuntimeError("PyMuPDF not installed; run docstruct/bootstrap.sh")
            self._cache["doc"] = fitz.open(self.path)
        return self._cache["doc"]

    def close(self) -> None:
        doc = self._cache.pop("doc", None)
        if doc is not None:
            doc.close()
        self._cache.clear()


_SUSPECT_RE = re.compile(
    rb"/Suspect\s*<<\s*/BBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]", re.S
)


def _suspect_regions(page) -> list[tuple[float, float, float, float]]:
    """Bounding boxes of /Suspect-marked content, in PDF point space.

    The tag lives in the content stream as marked content and PyMuPDF does not
    expose it, so this reads it directly. The producing engine helpfully wrote
    an explicit `/BBox` into the property dictionary, so no matrix arithmetic is
    needed: `/Suspect <</BBox [602.88 252.48 626.40 263.04]>>BDC`. A parse
    failure returns [], which costs a flag, never a word.

    Note the y axis: PDF space puts the origin at the bottom left, so these
    boxes are flipped relative to image space by the caller.
    """
    try:
        raw = page.read_contents()
    except Exception:
        return []
    return [
        (float(m.group(1)), float(m.group(2)), float(m.group(3)), float(m.group(4)))
        for m in _SUSPECT_RE.finditer(raw)
    ]


def _image_size(data: bytes) -> tuple[int, int]:
    from PIL import Image

    with Image.open(io.BytesIO(data)) as im:
        return im.size


# ---- sources ------------------------------------------------------------


def load_pages(source: str | Path, doc_id: str | None = None) -> list[Page]:
    """Enumerate pages from a directory of page files or a single PDF.

    A directory is treated as one document whose pages are its files, sorted by
    name. Nested directories are treated as one document each, which is the
    shape a per-page-split corpus takes.
    """
    source = Path(source)
    if source.is_file():
        return _pages_of_file(source, doc_id or source.stem)

    subdirs = sorted(p for p in source.iterdir() if p.is_dir())
    if subdirs:
        pages: list[Page] = []
        for sub in subdirs:
            pages.extend(load_pages(sub))
        # Loose files alongside subdirectories are documents in their own right.
        for f in sorted(source.iterdir()):
            if f.is_file() and f.suffix.lower() in {".pdf"} | IMAGE_SUFFIXES:
                pages.extend(_pages_of_file(f, f.stem))
        return pages

    pages = []
    for f in sorted(source.iterdir()):
        if f.suffix.lower() in {".pdf"} | IMAGE_SUFFIXES:
            pages.extend(_pages_of_file(f, doc_id or source.name, page_id=f.stem))
    return pages


def _pages_of_file(path: Path, doc_id: str, page_id: str | None = None) -> list[Page]:
    if path.suffix.lower() in IMAGE_SUFFIXES:
        return [Page(doc_id, page_id or path.stem, path)]
    if fitz is None:
        raise RuntimeError("PyMuPDF not installed; run docstruct/bootstrap.sh")
    with fitz.open(path) as doc:
        count = doc.page_count
    if count == 1:
        return [Page(doc_id, page_id or path.stem, path, 0)]
    return [Page(doc_id, f"p-{i + 1:04d}", path, i) for i in range(count)]
