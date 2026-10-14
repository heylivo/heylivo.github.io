"""
Prints today's post: "<day number> <language>", e.g. "12 en".

The day number runs through the content calendar (1 .. number of rows) and then starts
again at 1, so the plan never needs extending. Day 1 was posted by hand (German) on
2026-10-14, the schedule continues with day 2 the same afternoon.

German and English alternate every day. In the next pass through the calendar the
languages swap, so over two passes every post appears once in each language.
"""

import csv
import datetime
from pathlib import Path

START_DATE = datetime.date(2026, 10, 13)
CALENDAR_PATH = Path(__file__).resolve().parent / "content_calendar.csv"


def cycle_length() -> int:
    with open(CALENDAR_PATH, newline="", encoding="utf-8-sig") as f:
        return sum(1 for _ in csv.DictReader(f))


def today_post() -> tuple[int, str]:
    elapsed_days = (datetime.date.today() - START_DATE).days
    length = cycle_length()
    day_number = (elapsed_days % length) + 1
    pass_number = elapsed_days // length
    lang = "de" if (elapsed_days + pass_number) % 2 == 0 else "en"
    return day_number, lang


if __name__ == "__main__":
    day, language = today_post()
    print(f"{day} {language}")
