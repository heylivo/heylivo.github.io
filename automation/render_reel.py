"""
Renders the heylivo Reel (1080 x 1920 MP4, 8 seconds, 30 fps) for one day of the content calendar.

Usage:
    python render_reel.py <day_number> <output.mp4> [de|en]

Fills templates/reel.html like render_card.py fills card.html, then records it frame by
frame: window.setTime(t) puts every CSS animation at the frame's time, Playwright takes a
screenshot, and ffmpeg joins the frames into an H.264 MP4 with a silent AAC track (Instagram
expects an audio stream). Local preview of single frames: __preview-reel.html?day=N&t=3.
"""

import html
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

from render_card import AUTOMATION_DIR, CARD_CTA, LOGO_PATH, hook_font_size, load_day_row

TEMPLATE_PATH = AUTOMATION_DIR / "templates" / "reel.html"
FPS = 30
SECONDS = 8


# A bit bigger than on the card - the Reel has more room (same as hookSize() in the preview)
def reel_hook_size(hook: str) -> int:
    return hook_font_size(hook) + 14


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
        "__HOOK_SIZE__": str(reel_hook_size(row["Hook"])),
    }
    for placeholder, value in replacements.items():
        template = template.replace(placeholder, value)
    return template


def render(day_number: int, output_path: Path, lang: str) -> None:
    row = load_day_row(day_number, lang)
    tmp_html = AUTOMATION_DIR / "templates" / f"_tmp_reel_day{day_number}.html"
    tmp_html.write_text(build_html(row, lang), encoding="utf-8")
    frames = Path(tempfile.mkdtemp(prefix="heylivo_reel_"))
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1080, "height": 1920})
            page.goto(tmp_html.as_uri())
            page.wait_for_load_state("networkidle")
            page.evaluate("document.fonts.ready")
            for i in range(FPS * SECONDS):
                page.evaluate(f"window.setTime({i / FPS})")
                page.screenshot(path=str(frames / f"f{i:04d}.png"))
            browser.close()

        output_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error",
            "-framerate", str(FPS), "-i", str(frames / "f%04d.png"),
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-shortest", "-r", str(FPS),
            "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "23",
            "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
            str(output_path),
        ], check=True)
    finally:
        shutil.rmtree(frames, ignore_errors=True)
        tmp_html.unlink(missing_ok=True)
    print(f"Reel day {day_number} {lang} [{row['Kategorie']}] -> {output_path}")


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        print("Usage: python render_reel.py <day_number> <output.mp4> [de|en]")
        sys.exit(1)
    render(int(sys.argv[1]), Path(sys.argv[2]), sys.argv[3] if len(sys.argv) == 4 else "de")
