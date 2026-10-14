"""
Renders the heylivo Instagram card (1080 x 1350 PNG) for one day of the content calendar.

Usage:
    python render_card.py <day_number> <output_path.png>

Fills automation/templates/card.html with that day's row from content_calendar.csv
(Kategorie, Hook, Sub, Push) and screenshots it with Playwright - the same approach as
the Smart Menu Solutions automation. Local preview without Python: __preview-cards.html.
"""

import csv
import html
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

AUTOMATION_DIR = Path(__file__).resolve().parent
TEMPLATE_PATH = AUTOMATION_DIR / "templates" / "card.html"
CALENDAR_PATH = AUTOMATION_DIR / "content_calendar.csv"
LOGO_PATH = AUTOMATION_DIR / "assets" / "logo.png"


def load_day_row(day_number: int) -> dict:
    with open(CALENDAR_PATH, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if int(row["Tag"]) == day_number:
                return row
    raise ValueError(f"Day {day_number} not found in {CALENDAR_PATH}")


# Same steps as hookSize() in the local preview, so both look alike
def hook_font_size(hook: str) -> int:
    length = len(hook)
    if length <= 24:
        return 104
    if length <= 36:
        return 94
    if length <= 48:
        return 82
    if length <= 60:
        return 72
    return 64


def build_html(row: dict) -> str:
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    replacements = {
        "__LOGO_PATH__": LOGO_PATH.as_uri(),
        "__CATEGORY__": html.escape(row["Kategorie"]),
        "__HOOK__": html.escape(row["Hook"]),
        "__SUB__": html.escape(row["Sub"]),
        "__PUSH__": html.escape(row["Push"]),
        "__HOOK_SIZE__": str(hook_font_size(row["Hook"])),
    }
    for placeholder, value in replacements.items():
        template = template.replace(placeholder, value)
    return template


def render(day_number: int, output_path: Path) -> None:
    row = load_day_row(day_number)
    tmp_html = AUTOMATION_DIR / "templates" / f"_tmp_card_day{day_number}.html"
    tmp_html.write_text(build_html(row), encoding="utf-8")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1080, "height": 1350})
        page.goto(tmp_html.as_uri())
        page.wait_for_load_state("networkidle")
        page.evaluate("document.fonts.ready")
        page.screenshot(path=str(output_path))
        browser.close()

    tmp_html.unlink(missing_ok=True)
    print(f"Day {day_number} [{row['Kategorie']}] -> {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python render_card.py <day_number> <output_path.png>")
        sys.exit(1)

    out_arg = Path(sys.argv[2])
    out_arg.parent.mkdir(parents=True, exist_ok=True)
    render(int(sys.argv[1]), out_arg)
