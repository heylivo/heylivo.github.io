"""
Renders a heylivo Ratgeber-Reel (1080 x 1920 MP4, about 20 seconds) for one row of
ratgeber/ratgeber.csv: a question, three facts and a closing slide with a Livo reminder and the link.

Usage:
    python render_ratgeber.py <Datum JJJJ-MM-TT> <output.mp4>

Fills templates/ratgeber.html, takes one screenshot per slide (window.showSlide(n)) and lets
ffmpeg cross-fade the five slides over a 25-second music excerpt (music.long_track_for).
Local preview without Playwright: templates/ratgeber.html?slide=n in a browser, then compose().
"""

import csv
import datetime
import html
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from music import long_track_for
from render_card import AUTOMATION_DIR, CARD_CTA, LOGO_PATH, hook_font_size

TEMPLATE_PATH = AUTOMATION_DIR / "templates" / "ratgeber.html"
CSV_PATH = AUTOMATION_DIR / "ratgeber" / "ratgeber.csv"
FIELDS = ["Datum", "Sprache", "Kategorie", "Hook", "Sub", "T1", "F1", "T2", "F2", "T3", "F3",
          "Push", "Link", "Caption", "Hashtags", "Gepostet"]
FPS = 30
# Seconds per slide (question, 3 facts, closing slide) and the length of each cross-fade
DURATIONS = [3.5, 4.5, 4.5, 4.5, 4.5]
FADE = 0.5
LABELS = {
    "de": {"cta_title": "Damit du’s nicht vergisst:", "more": "Alle Infos:", "home": "Kostenlos testen:"},
    "en": {"cta_title": "So you don’t forget:", "more": "All the details:", "home": "Try it free:"},
}
# Topics without their own guide page link to the home page - then the closing slide says "try it free"
HOME_LINKS = {"heylivo.com", "heylivo.com/en"}


def load_rows() -> list[dict]:
    with open(CSV_PATH, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def load_row(date: str) -> dict:
    for row in load_rows():
        if row["Datum"] == date:
            return row
    raise ValueError(f"No Ratgeber row for {date} in {CSV_PATH}")


def track_number(row: dict) -> int:
    # the three tracks take turns from day to day, like in the other Reels
    return datetime.date.fromisoformat(row["Datum"]).toordinal()


def build_html(row: dict) -> str:
    lang = row["Sprache"]
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    replacements = {
        "__LANG__": lang,
        "__LOGO_PATH__": LOGO_PATH.as_uri(),
        "__HOOK_SIZE__": str(hook_font_size(row["Hook"]) + 14),
        "__CTA_TITLE__": LABELS[lang]["cta_title"],
        "__MORE__": LABELS[lang]["home" if row["Link"] in HOME_LINKS else "more"],
        "__CTA__": CARD_CTA[lang],
    }
    for key in ["Kategorie", "Hook", "Sub", "T1", "F1", "T2", "F2", "T3", "F3", "Push", "Link"]:
        # "10 €" and "19. Januar" never break between the number and the unit or month
        text = re.sub(r"(\d) (€|%)", "\\1&nbsp;\\2", html.escape(row[key]))
        text = re.sub(r"(\d\.) (Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)",
                      "\\1&nbsp;\\2", text)
        # words with a hyphen stay together; the template shrinks the text if such a word is too wide
        text = re.sub(r"(\w+(?:-\w+)+)", '<span class="nw">\\1</span>', text)
        replacements["__CATEGORY__" if key == "Kategorie" else f"__{key.upper()}__"] = text
    for placeholder, value in replacements.items():
        template = template.replace(placeholder, value)
    return template


def compose(slides: list[Path], music: Path, output_path: Path) -> None:
    """Cross-fades the slide images into an H.264 MP4 with the music faded in and out."""
    total = sum(DURATIONS) - FADE * (len(DURATIONS) - 1)
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    for slide, seconds in zip(slides, DURATIONS):
        cmd += ["-loop", "1", "-framerate", str(FPS), "-t", str(seconds), "-i", str(slide)]
    cmd += ["-i", str(music)]
    chain, previous, offset = [], "0:v", 0.0
    for k in range(1, len(slides)):
        offset += DURATIONS[k - 1] - FADE
        chain.append(f"[{previous}][{k}:v]xfade=transition=fade:duration={FADE}:offset={offset:.2f}[v{k}]")
        previous = f"v{k}"
    chain.append(f"[{previous}]format=yuv420p[v]")  # yuv420p - other pixel formats don't play everywhere
    output_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(cmd + [
        "-filter_complex", ";".join(chain),
        "-map", "[v]", "-map", f"{len(slides)}:a",
        "-af", f"afade=t=in:d=0.5,afade=t=out:st={total - 1.5:.2f}:d=1.5",
        "-t", f"{total:.2f}", "-r", str(FPS),
        "-c:v", "libx264", "-profile:v", "high", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        str(output_path),
    ], check=True)


def render(row: dict, output_path: Path) -> None:
    # Playwright only here: post_ratgeber.py imports this module in a workflow step without it
    from playwright.sync_api import sync_playwright

    tmp_html = AUTOMATION_DIR / "templates" / f"_tmp_ratgeber_{row['Datum']}.html"
    tmp_html.write_text(build_html(row), encoding="utf-8")
    shots = Path(tempfile.mkdtemp(prefix="heylivo_ratgeber_"))
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1080, "height": 1920})
            page.goto(tmp_html.as_uri())
            page.wait_for_load_state("networkidle")
            page.evaluate("window.fontsLoaded")  # the template loads the font itself, see there
            slides = []
            for i in range(len(DURATIONS)):
                page.evaluate(f"window.showSlide({i})")
                slides.append(shots / f"s{i}.png")
                page.screenshot(path=str(slides[-1]))
            browser.close()
        music, _ = long_track_for(track_number(row))
        compose(slides, music, output_path)
    finally:
        shutil.rmtree(shots, ignore_errors=True)
        tmp_html.unlink(missing_ok=True)
    print(f"Ratgeber {row['Datum']} {row['Sprache']} [{row['Kategorie']}] -> {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python render_ratgeber.py <Datum JJJJ-MM-TT> <output.mp4>")
        sys.exit(1)
    render(load_row(sys.argv[1]), Path(sys.argv[2]))
