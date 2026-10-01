import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))

from lp.billing import first_recurring_charge  # noqa: E402


class TestBilling(unittest.TestCase):
    def test_founding_owner_example(self):
        self.assertEqual(first_recurring_charge(date(2026, 9, 1), founding=True), date(2026, 11, 1))

    def test_founding_mid_month_and_year_wrap(self):
        self.assertEqual(first_recurring_charge(date(2026, 9, 30), founding=True), date(2026, 11, 1))
        self.assertEqual(first_recurring_charge(date(2026, 11, 15), founding=True), date(2027, 1, 1))
        self.assertEqual(first_recurring_charge(date(2026, 12, 3), founding=True), date(2027, 2, 1))

    def test_standard_one_month_later(self):
        self.assertEqual(first_recurring_charge(date(2026, 10, 15), founding=False), date(2026, 11, 15))
        self.assertEqual(first_recurring_charge(date(2027, 1, 31), founding=False), date(2027, 2, 28))


if __name__ == "__main__":
    unittest.main()
