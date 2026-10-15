"""
Makes today's Pinterest pins (one German, one English) and updates the two RSS feeds
that Pinterest reads ("Auto-publish" in the Pinterest business account, one feed per board).

Usage:
    python make_pins.py [day_number] [--force]

Without a day number it takes today's day from get_day_number.py. Both languages get the
same day of their calendar (content_calendar.csv / content_calendar_en.csv). One pin per
language and date: if today's pin is already in the feed, nothing changes (--force replaces it).

The pin is the Instagram card (templates/card.html) in Pinterest's 2:3 format: render_card.py
fills the template, templates/pin.css stretches it to 1080 x 1620. Files:
    pinterest/pin-<date>-<lang>.jpg   the images (only the newest KEEP per language stay)
    pinterest/items-<lang>.json       what is in the feed (the source for the XML)
    pinterest/feed-<lang>.xml         the RSS feed: https://heylivo.com/automation/pinterest/feed-de.xml
"""

import datetime
import email.utils
import html
import json
import sys
from pathlib import Path

from get_day_number import today_post
from render_card import build_html, load_day_row

AUTOMATION_DIR = Path(__file__).resolve().parent
PIN_DIR = AUTOMATION_DIR / "pinterest"
PIN_CSS = AUTOMATION_DIR / "templates" / "pin.css"
BASE_URL = "https://heylivo.com/automation/pinterest/"
WIDTH, HEIGHT = 1080, 1620
KEEP = 30

FEED = {
    "de": {
        "title": "heylivo – Fristen & Erinnerungen",
        "link": "https://heylivo.com/",
        "about": "Tipps rund um Fristen: Ausweis, TÜV, Verträge, Arzt, Familie – und wie Livo dich rechtzeitig erinnert.",
        "cta": "Livo erinnert dich rechtzeitig: heylivo.com – 30 Tage kostenlos, ohne Anmeldung.",
    },
    "en": {
        "title": "heylivo – deadlines & reminders",
        "link": "https://heylivo.com/en/",
        "about": "Tips on deadlines in Germany: ID card, car inspection, contracts, doctor, family – and how Livo reminds you in time.",
        "cta": "Livo reminds you in time: heylivo.com – 30 days free, no sign-up.",
    },
}


def render_pin(day_number: int, lang: str, out_jpg: Path) -> dict:
    """Renders the pin image and returns the calendar row."""
    from playwright.sync_api import sync_playwright  # only needed here (the feed part runs without it)
    from PIL import Image

    row = load_day_row(day_number, lang)
    page_html = build_html(row, lang).replace("</style>", PIN_CSS.read_text(encoding="utf-8") + "\n</style>", 1)
    tmp_html = AUTOMATION_DIR / "templates" / f"_tmp_pin_{lang}_day{day_number}.html"
    tmp_png = out_jpg.with_suffix(".png")
    tmp_html.write_text(page_html, encoding="utf-8")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": WIDTH, "height": HEIGHT})
        page.goto(tmp_html.as_uri())
        page.wait_for_load_state("networkidle")
        page.evaluate("document.fonts.ready")
        page.screenshot(path=str(tmp_png))
        browser.close()
    tmp_html.unlink(missing_ok=True)
    Image.open(tmp_png).convert("RGB").save(out_jpg, "JPEG", quality=90)
    tmp_png.unlink(missing_ok=True)
    print(f"Pin day {day_number} {lang} [{row['Kategorie']}] -> {out_jpg}")
    return row


def pin_text(row: dict, lang: str) -> tuple[str, str]:
    """Title (max. 100 characters) and description (max. 500) of the pin."""
    title = row["Hook"].strip()
    if len(title) > 100:
        title = title[:99].rstrip() + "…"
    text = " ".join(x.strip() for x in (row["Sub"], row["Caption"], FEED[lang]["cta"]) if x.strip())
    if len(text) > 500:
        text = text[:499].rstrip() + "…"
    return title, text


def load_items(lang: str) -> list:
    path = PIN_DIR / f"items-{lang}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def add_item(lang: str, item: dict) -> list:
    """Newest first, one item per date, only the newest KEEP; images no longer in the feed are deleted."""
    items = [i for i in load_items(lang) if i["date"] != item["date"]]
    items = sorted([item] + items, key=lambda i: i["date"], reverse=True)[:KEEP]
    (PIN_DIR / f"items-{lang}.json").write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    keep = {i["file"] for i in items}
    for old in PIN_DIR.glob(f"pin-*-{lang}.jpg"):
        if old.name not in keep:
            old.unlink()
    return items


def rfc822(date_text: str) -> str:
    d = datetime.datetime.fromisoformat(date_text + "T12:00:00+00:00")
    return email.utils.format_datetime(d)


def write_feed(lang: str, items: list) -> Path:
    f = FEED[lang]
    esc = html.escape
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">',
        "<channel>",
        f"<title>{esc(f['title'])}</title>",
        f"<link>{f['link']}</link>",
        f"<description>{esc(f['about'])}</description>",
        f"<language>{lang}</language>",
        f'<atom:link href="{BASE_URL}feed-{lang}.xml" rel="self" type="application/rss+xml"/>',
        f"<lastBuildDate>{rfc822(items[0]['date']) if items else rfc822(datetime.date.today().isoformat())}</lastBuildDate>",
    ]
    for i in items:
        url = BASE_URL + i["file"]
        size = (PIN_DIR / i["file"]).stat().st_size if (PIN_DIR / i["file"]).exists() else 0
        out += [
            "<item>",
            f"<title>{esc(i['title'])}</title>",
            # a link of its own per pin (to be safe: Pinterest may skip feed items whose link it already pinned)
            f"<link>{f['link']}?pin={lang}-{i['date']}</link>",
            f'<guid isPermaLink="false">heylivo-pin-{lang}-{i["date"]}</guid>',
            f"<pubDate>{rfc822(i['date'])}</pubDate>",
            f"<description>{esc(i['text'])}</description>",
            f'<enclosure url="{url}" length="{size}" type="image/jpeg"/>',
            f'<media:content url="{url}" medium="image" type="image/jpeg" width="{WIDTH}" height="{HEIGHT}"/>',
            "</item>",
        ]
    out += ["</channel>", "</rss>", ""]
    path = PIN_DIR / f"feed-{lang}.xml"
    path.write_text("\n".join(out), encoding="utf-8")
    return path


def make(day_number: int, date_text: str, force: bool = False) -> None:
    PIN_DIR.mkdir(exist_ok=True)
    for lang in ("de", "en"):
        name = f"pin-{date_text}-{lang}.jpg"
        # A second run on the same day (schedule after a push, manual test) leaves the feed alone -
        # a changed item could make Pinterest pin it again.
        if not force and (PIN_DIR / name).exists() and any(i["date"] == date_text for i in load_items(lang)):
            print(f"Feed {lang}: pin for {date_text} already there - nothing to do")
            continue
        row = render_pin(day_number, lang, PIN_DIR / name)
        title, text = pin_text(row, lang)
        items = add_item(lang, {"date": date_text, "day": day_number, "file": name, "title": title, "text": text})
        print(f"Feed {lang}: {len(items)} pins -> {write_feed(lang, items)}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--force"]
    if len(args) > 1:
        print("Usage: python make_pins.py [day_number] [--force]")
        sys.exit(1)
    day = int(args[0]) if args and args[0].strip() else today_post()[0]
    make(day, datetime.date.today().isoformat(), "--force" in sys.argv)
