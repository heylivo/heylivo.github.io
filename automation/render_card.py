"""
Renders the heylivo Instagram card (1080 x 1350 PNG) for one day of the content calendar.

Usage:
    python render_card.py <day_number> <output_path.png> [de|en]

Fills automation/templates/card.html with that day's row (Kategorie, Hook, Sub, Push) from
content_calendar.csv (German) or content_calendar_en.csv (English) and screenshots it with
Playwright - the same approach as the Smart Menu Solutions automation.
Local preview without Python: __preview-cards.html?day=N&lang=de|en.
"""

import csv
import html
import sys
from pathlib import Path

AUTOMATION_DIR = Path(__file__).resolve().parent
TEMPLATE_PATH = AUTOMATION_DIR / "templates" / "card.html"
LOGO_PATH = AUTOMATION_DIR / "assets" / "logo.png"
CALENDARS = {"de": "content_calendar.csv", "en": "content_calendar_en.csv"}
CARD_CTA = {"de": "30 Tage kostenlos", "en": "30 days free"}


# The calendar first, then the special posts with a fixed date (specials.csv, day numbers from 101)
def load_day_row(day_number: int, lang: str) -> dict:
    sources = ((AUTOMATION_DIR / CALENDARS[lang], None), (AUTOMATION_DIR / "specials.csv", lang))
    for path, special_lang in sources:
        if not path.exists():
            continue
        with open(path, newline="", encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                if int(row["Tag"]) == day_number and special_lang in (None, row.get("Sprache")):
                    return row
    raise ValueError(f"Day {day_number} ({lang}) not found in {CALENDARS[lang]} or specials.csv")


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


def build_html(row: dict, lang: str) -> str:
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    replacements = {
        "__LANG__": lang,
        "__LOGO_PATH__": LOGO_PATH.as_uri(),
        "__CATEGORY__": html.escape(row["Kategorie"]),
        "__HOOK__": html.escape(row["Hook"]),
        "__SUB__": html.escape(row["Sub"]),
        "__PUSH__": html.escape(row["Push"]),
        "__CTA__": CARD_CTA[lang],
        "__HOOK_SIZE__": str(hook_font_size(row["Hook"])),
    }
    for placeholder, value in replacements.items():
        template = template.replace(placeholder, value)
    return template


# Playwright only here: post_instagram.py imports load_day_row, and the promo/Aktion
# workflows install nothing but requests
def render(day_number: int, output_path: Path, lang: str) -> None:
    from playwright.sync_api import sync_playwright

    row = load_day_row(day_number, lang)
    tmp_html = AUTOMATION_DIR / "templates" / f"_tmp_card_day{day_number}.html"
    tmp_html.write_text(build_html(row, lang), encoding="utf-8")

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1080, "height": 1350})
        page.goto(tmp_html.as_uri())
        page.wait_for_load_state("networkidle")
        page.evaluate("document.fonts.ready")
        page.screenshot(path=str(output_path))
        browser.close()

    tmp_html.unlink(missing_ok=True)
    print(f"Day {day_number} {lang} [{row['Kategorie']}] -> {output_path}")


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        print("Usage: python render_card.py <day_number> <output_path.png> [de|en]")
        sys.exit(1)

    out_arg = Path(sys.argv[2])
    out_arg.parent.mkdir(parents=True, exist_ok=True)
    render(int(sys.argv[1]), out_arg, sys.argv[3] if len(sys.argv) == 4 else "de")
