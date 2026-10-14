"""
Prints today's day number in the content calendar (1 .. number of rows).

The calendar loops: START_DATE is day 1, and after the last row it starts again at
day 1 - so it never needs extending. Day 1 was posted by hand on 2026-10-14, the
schedule continues with day 2 the same afternoon.
"""

import csv
import datetime
from pathlib import Path

START_DATE = datetime.date(2026, 10, 13)
CALENDAR_PATH = Path(__file__).resolve().parent / "content_calendar.csv"


def cycle_length() -> int:
    with open(CALENDAR_PATH, newline="", encoding="utf-8-sig") as f:
        return sum(1 for _ in csv.DictReader(f))


def today_day_number() -> int:
    elapsed_days = (datetime.date.today() - START_DATE).days
    return (elapsed_days % cycle_length()) + 1


if __name__ == "__main__":
    print(today_day_number())
