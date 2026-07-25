#!/usr/bin/env python3
"""Tests for the parts of docstruct where a bug is silent.

Run: python3 docstruct/test_docstruct.py  (or npm run test:docstruct)

The coordinate transforms are the priority. A recognizer that misreads a digit
is loud, since confidence drops and arithmetic stops reconciling. A box rotated
into the wrong frame is quiet: every word is correct and every column is wrong,
which is the exact failure this harness exists to prevent.

Tests needing tesseract skip when it is absent, so this runs before bootstrap.
"""
from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pages import Word, _SUSPECT_RE  # noqa: E402
from record import rotate_words  # noqa: E402
from recognize import line_axis  # noqa: E402
from run import read_sample  # noqa: E402

HAS_TESSERACT = shutil.which("tesseract") is not None


class RotateWords(unittest.TestCase):
    """A word box must land where the pixel it describes lands."""

    # A 100x40 word at (10, 5) on a 200x100 page.
    W = Word("x", 10, 5, 100, 40)
    SIZE = (200, 100)

    def test_zero_is_identity(self):
        self.assertEqual(rotate_words([self.W], 0, self.SIZE), [self.W])

    def test_180_reflects_both_axes(self):
        out = rotate_words([self.W], 180, self.SIZE)[0]
        # right edge 110 -> 200-110 = 90; bottom edge 45 -> 100-45 = 55
        self.assertEqual((out.left, out.top, out.width, out.height), (90, 55, 100, 40))

    def test_90_transposes_and_swaps_extent(self):
        out = rotate_words([self.W], 90, self.SIZE)[0]
        # clockwise: new_left = H - bottom = 100-45 = 55; new_top = old left = 10
        self.assertEqual((out.left, out.top, out.width, out.height), (55, 10, 40, 100))

    def test_270_transposes_the_other_way(self):
        out = rotate_words([self.W], 270, self.SIZE)[0]
        # new_left = old top = 5; new_top = W - right = 200-110 = 90
        self.assertEqual((out.left, out.top, out.width, out.height), (5, 90, 40, 100))

    def test_four_quarter_turns_return_to_start(self):
        words, size = [self.W], self.SIZE
        for _ in range(4):
            words = rotate_words(words, 90, size)
            size = (size[1], size[0])
        self.assertEqual(words[0], self.W)
        self.assertEqual(size, self.SIZE)

    def test_180_twice_returns_to_start(self):
        once = rotate_words([self.W], 180, self.SIZE)
        self.assertEqual(rotate_words(once, 180, self.SIZE), [self.W])

    def test_rejects_non_right_angles(self):
        with self.assertRaises(ValueError):
            rotate_words([self.W], 45, self.SIZE)

    def test_preserves_payload(self):
        w = Word("total", 1, 2, 3, 4, conf=91.5, flags=("suspect",), line_id=(1, 2, 3))
        out = rotate_words([w], 90, self.SIZE)[0]
        self.assertEqual((out.text, out.conf, out.flags, out.line_id),
                         ("total", 91.5, ("suspect",), (1, 2, 3)))


class LineAxis(unittest.TestCase):
    """The test that catches a quarter-turn page, which confidence cannot."""

    @staticmethod
    def _line(words):
        return [Word(t, x, y, 20, 10, line_id=(0, 0, 1)) for t, x, y in words]

    def test_horizontal_line_scores_one(self):
        words = self._line([("a", 0, 100), ("b", 40, 101), ("c", 80, 100)])
        self.assertEqual(line_axis(words), 1.0)

    def test_vertical_line_scores_zero(self):
        words = self._line([("a", 100, 0), ("b", 101, 40), ("c", 100, 80)])
        self.assertEqual(line_axis(words), 0.0)

    def test_ignores_lines_too_short_to_have_a_direction(self):
        words = [Word("a", 0, 0, 5, 5, line_id=(0, 0, 1)),
                 Word("b", 9, 0, 5, 5, line_id=(0, 0, 1))]
        self.assertIsNone(line_axis(words))

    def test_none_when_method_reports_no_lines(self):
        self.assertIsNone(line_axis([Word("a", 0, 0, 5, 5)]))

    def test_mixed_page_scores_between(self):
        words = self._line([("a", 0, 10), ("b", 40, 10), ("c", 80, 10)])
        words += [Word(t, x, y, 20, 10, line_id=(0, 0, 2))
                  for t, x, y in [("d", 10, 0), ("e", 10, 40), ("f", 10, 80)]]
        self.assertEqual(line_axis(words), 0.5)


class SuspectRegex(unittest.TestCase):
    """The /Suspect BBox form seen in the wild, and near-misses."""

    def test_reads_a_bbox(self):
        raw = b"/Suspect <</BBox [602.8802 252.4801 626.3998 263.0402 ]>>BDC"
        (m,) = list(_SUSPECT_RE.finditer(raw))
        self.assertEqual([float(m.group(i)) for i in range(1, 5)],
                         [602.8802, 252.4801, 626.3998, 263.0402])

    def test_reads_negative_and_integer_coordinates(self):
        raw = b"/Suspect<</BBox[-1 0 12 20]>>BDC"
        (m,) = list(_SUSPECT_RE.finditer(raw))
        self.assertEqual(m.group(1), b"-1")

    def test_ignores_other_marked_content(self):
        self.assertEqual(list(_SUSPECT_RE.finditer(b"/Part <</MCID 0>>BDC")), [])

    def test_finds_every_occurrence(self):
        raw = b"/Suspect <</BBox [1 2 3 4]>>BDC x EMC /Suspect <</BBox [5 6 7 8]>>BDC"
        self.assertEqual(len(list(_SUSPECT_RE.finditer(raw))), 2)


class ReadSample(unittest.TestCase):
    """Page selection versus whole-document selection."""

    def _read(self, text):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
            f.write(text)
        try:
            return read_sample(Path(f.name))
        finally:
            Path(f.name).unlink()

    def test_splits_pages_from_documents(self):
        pages, docs = self._read("lbn_1991/p-122\nlbn_1979\n")
        self.assertEqual(pages, {"lbn_1991/p-122"})
        self.assertEqual(docs, {"lbn_1979"})

    def test_strips_comments_and_blanks(self):
        pages, docs = self._read("# header\n\nlbn_1979  # why\n   \n")
        self.assertEqual((pages, docs), (set(), {"lbn_1979"}))

    def test_empty_file_selects_nothing(self):
        self.assertEqual(self._read(""), (set(), set()))


@unittest.skipUnless(HAS_TESSERACT, "tesseract not installed")
class WithTesseract(unittest.TestCase):
    """A rendered page round-trips through recognition and orientation."""

    @classmethod
    def setUpClass(cls):
        from PIL import Image, ImageDraw

        img = Image.new("RGB", (1200, 400), "white")
        draw = ImageDraw.Draw(img)
        # Large default-font text; tesseract needs real size to read reliably.
        for i, line in enumerate(["GENERAL FUND STATE 1,350", "TOTAL BIENNIUM 457,833"]):
            draw.text((40, 60 + i * 120), line, fill="black")
        cls.img = img.resize((2400, 800), Image.LANCZOS)
        cls.tmp = Path(tempfile.mkdtemp())
        cls.path = cls.tmp / "page.png"
        cls.img.save(cls.path)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_recognizes_words_with_boxes_and_confidence(self):
        import recognize

        ext = recognize.tesseract(self.path)
        self.assertTrue(ext.words, "expected some words")
        self.assertTrue(all(w.conf is not None for w in ext.words))
        self.assertTrue(all(w.width > 0 and w.height > 0 for w in ext.words))
        self.assertIn("method", ext.as_dict())

    def test_upright_text_reads_as_horizontal_lines(self):
        import recognize

        axis = line_axis(recognize.tesseract(self.path).words)
        if axis is not None:
            self.assertGreater(axis, 0.5)

    def test_upright_page_is_left_alone(self):
        import prep

        _, decision = prep.deskew_rotate(self.path.read_bytes())
        self.assertEqual(decision.applied, 0)

    def test_rotate_bytes_turns_the_image(self):
        import io

        from PIL import Image

        import prep

        out = prep.rotate_bytes(self.path.read_bytes(), 90)
        with Image.open(io.BytesIO(out)) as im:
            self.assertEqual(im.size, (self.img.height, self.img.width))


if __name__ == "__main__":
    unittest.main(verbosity=2)
