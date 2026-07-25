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
import tables  # noqa: E402

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


class Money(unittest.TestCase):
    def test_plain_and_grouped(self):
        self.assertEqual(tables.parse_money("1,411,000"), 1411000)
        self.assertEqual(tables.parse_money("0"), 0)

    def test_parentheses_are_negative(self):
        self.assertEqual(tables.parse_money("(630)"), -630)

    def test_currency_and_sign(self):
        self.assertEqual(tables.parse_money("$1,350"), 1350)
        self.assertEqual(tables.parse_money("-5"), -5)

    def test_rejects_non_money(self):
        for text in ["TOTAL", "1993-95", "12.5", "", "abc"]:
            self.assertIsNone(tables.parse_money(text), text)

    def test_bill_numbers_still_parse_which_is_why_geometry_decides(self):
        # `5653)` is money-shaped. Rejecting it is the column layer's job, not
        # the pattern's, and this test pins that expectation.
        self.assertEqual(tables.parse_money("5653)"), 5653)


class Furniture(unittest.TestCase):
    def test_leader_dots(self):
        self.assertTrue(tables.is_furniture(Word("..........", 0, 0, 90, 4)))

    def test_rule_banner(self):
        self.assertTrue(tables.is_furniture(Word("*********", 0, 0, 90, 4)))

    def test_long_low_confidence_smear(self):
        self.assertTrue(tables.is_furniture(
            Word("scccvcescsuctsevencescecsae", 0, 0, 300, 10, conf=12.0)))

    def test_keeps_real_words(self):
        for text in ["Corrections,", "University", "1,411,000", "GF-S"]:
            self.assertFalse(tables.is_furniture(Word(text, 0, 0, 50, 12, conf=95.0)), text)

    def test_keeps_short_repeats(self):
        # "33" and "000" are repetitive but real; the rule only fires at length 3+
        # and "000" is a genuine risk, so pin the current behaviour explicitly.
        self.assertFalse(tables.is_furniture(Word("33", 0, 0, 20, 12, conf=96.0)))


class TableStructure(unittest.TestCase):
    """A synthetic fund table: labels left, three right-aligned money columns."""

    @staticmethod
    def build(rows):
        words = []
        for r, (label, a, b, c) in enumerate(rows):
            y = 100 + r * 40
            words.append(Word(label, 100, y, 300, 20, conf=95.0))
            for text, right in ((a, 1000), (b, 1400), (c, 1800)):
                words.append(Word(text, right - 20 * len(text), y, 20 * len(text), 20, conf=95.0))
        return words

    ROWS = [
        ("ALPHA", "1,350", "0", "1,350"),
        ("BRAVO", "1,500", "200", "1,700"),
        ("CHARLIE", "500", "0", "500"),
        ("DELTA", "0", "450", "450"),
    ]

    def test_finds_columns_and_rows(self):
        t = tables.find_table(self.build(self.ROWS))
        self.assertIsNotNone(t)
        self.assertEqual(len(t.columns), 3)
        self.assertEqual(len(t.rows), 4)
        self.assertEqual(t.rows[0].label, "ALPHA")

    def test_discovers_the_sum_relation(self):
        t = tables.find_table(self.build(self.ROWS))
        rels = tables.discover_relations(t)
        self.assertTrue(rels)
        self.assertEqual((rels[0].a, rels[0].b, rels[0].target, rels[0].op), (0, 1, 2, "+"))
        self.assertEqual(t.reconciled, 1.0)

    def test_discovers_a_difference_relation(self):
        # HOUSE / SENATE / DIFF, where the third column is a difference. A
        # hard-coded "last column is the total" rule reports this as broken.
        rows = [("A", "536", "531", "-5"), ("B", "495", "495", "0"),
                ("C", "434", "436", "2"), ("D", "1,013", "1,218", "205")]
        t = tables.find_table(self.build(rows))
        rels = tables.discover_relations(t)
        self.assertTrue(rels)
        self.assertEqual(rels[0].failed, 0)
        self.assertEqual(t.reconciled, 1.0)

    # Eight rows, because support is a share: one bad row in four is 75%, under
    # the 0.8 default, so the relation is not established at all. That is the
    # method's real limit on short tables, pinned by the next test.
    EIGHT = [("ALPHA", "1,350", "0", "1,350"), ("BRAVO", "1,500", "200", "1,700"),
             ("CHARLIE", "500", "0", "500"), ("DELTA", "0", "450", "450"),
             ("ECHO", "1,150", "50", "1,200"), ("FOXTROT", "300", "700", "1,000"),
             ("GOLF", "25", "75", "100"), ("HOTEL", "8", "2", "10")]

    def test_one_bad_cell_is_reported_not_repaired(self):
        rows = list(self.EIGHT)
        rows[1] = ("BRAVO", "1,500", "200", "1,200")   # should be 1,700
        t = tables.find_table(self.build(rows))
        self.assertLess(t.reconciled, 1.0)
        failed = [c for c in t.checks if not c.holds]
        self.assertEqual(len(failed), 1)
        self.assertIn("BRAVO", failed[0].where)
        # the wrong value is still reported as read, never corrected
        self.assertEqual(t.rows[1].cells[2].text, "1,200")

    def test_a_short_table_cannot_establish_a_relation_it_breaks(self):
        rows = list(self.ROWS)
        rows[1] = ("BRAVO", "1,500", "200", "1,200")
        t = tables.find_table(self.build(rows))
        # 3 of 4 rows is 75%, under the default support, so nothing is asserted.
        # Silence here means "not established", never "checked and fine".
        self.assertIsNone(t.reconciled)

    def test_collapses_restatements_of_one_identity(self):
        t = tables.find_table(self.build(self.ROWS))
        self.assertEqual(len(tables.discover_relations(t)), 1)

    def test_no_table_in_prose(self):
        words = [Word(w, 100 + 60 * i, 100, 55, 18, conf=95.0)
                 for i, w in enumerate("the legislature provides funding for programs".split())]
        self.assertIsNone(tables.find_table(words))

    def test_column_total_row_is_checked(self):
        rows = list(self.ROWS) + [("TOTAL BIENNIUM", "3,350", "650", "4,000")]
        t = tables.find_table(self.build(rows))
        totals = [c for c in t.checks if c.kind == "column_total"]
        self.assertTrue(totals)
        self.assertTrue(all(c.holds for c in totals))


class GroupLines(unittest.TestCase):
    def test_splits_on_vertical_gaps(self):
        words = [Word("a", 0, 0, 10, 20), Word("b", 30, 2, 10, 20),
                 Word("c", 0, 200, 10, 20)]
        self.assertEqual([len(g) for g in tables.group_lines(words)], [2, 1])

    def test_orders_within_a_line_by_x(self):
        words = [Word("b", 50, 0, 10, 20), Word("a", 0, 0, 10, 20)]
        self.assertEqual([w.text for w in tables.group_lines(words)[0]], ["a", "b"])

    def test_empty_input(self):
        self.assertEqual(tables.group_lines([]), [])


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
