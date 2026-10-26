"""
Prints today's post: "<day number> <language>", e.g. "12 en".

The day number runs through the content calendar (1 .. number of rows) and then starts
again at 1, so the plan never needs extending. Days 1 (German image) and 2 (English Reel) were
posted by hand on 2026-10-14, the schedule continued with day 3 that afternoon.

German and English alternate every day. In the next pass through the calendar the
languages swap, so over two passes every post appears once in each language.

Special posts with a fixed date (specials.csv, day numbers from 101 - e.g. the Kfz countdown
to 30.11.) replace the calendar post on their date; the calendar simply goes on the next day.
"""

import csv
import datetime
from pathlib import Path

START_DATE = datetime.date(2026, 10, 12)
CALENDAR_PATH = Path(__file__).resolve().parent / "content_calendar.csv"
SPECIALS_PATH = Path(__file__).resolve().parent / "specials.csv"


def cycle_length() -> int:
    with open(CALENDAR_PATH, newline="", encoding="utf-8-sig") as f:
        return sum(1 for _ in csv.DictReader(f))


def cycle_post(date: datetime.date) -> tuple[int, str]:
    elapsed_days = (date - START_DATE).days
    length = cycle_length()
    day_number = (elapsed_days % length) + 1
    pass_number = elapsed_days // length
    lang = "de" if (elapsed_days + pass_number) % 2 == 0 else "en"
    return day_number, lang


def special_on(date: datetime.date) -> tuple[int, str] | None:
    if not SPECIALS_PATH.exists():
        return None
    with open(SPECIALS_PATH, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row["Datum"] == date.isoformat():
                return int(row["Tag"]), row["Sprache"]
    return None


def today_post() -> tuple[int, str]:
    today = datetime.date.today()
    return special_on(today) or cycle_post(today)


# Pinterest pins both languages every day: a special post replaces only its own language
def pins_today() -> dict[str, int]:
    today = datetime.date.today()
    day_number, _ = cycle_post(today)
    days = {"de": day_number, "en": day_number}
    special = special_on(today)
    if special:
        days[special[1]] = special[0]
    return days


if __name__ == "__main__":
    day, language = today_post()
    print(f"{day} {language}")
