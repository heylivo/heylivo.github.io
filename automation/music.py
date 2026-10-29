"""
Background music for the Reels: 9-second excerpts (assets/music) of tracks by Kevin MacLeod
(incompetech.com), licensed under Creative Commons: By Attribution 4.0
(https://creativecommons.org/licenses/by/4.0/). The licence asks for a credit, so every Reel
caption names the track (credit_line). The tracks take turns from day to day.
"""

from pathlib import Path

MUSIC_DIR = Path(__file__).resolve().parent / "assets" / "music"
TRACKS = [
    ("wallpaper.m4a", "Wallpaper"),
    ("carefree.m4a", "Carefree"),
    ("life-of-riley.m4a", "Life of Riley"),
]


# 25-second excerpts of the same tracks for the longer Ratgeber-Reels (render_ratgeber.py)
LONG_DIR = MUSIC_DIR / "long"


def long_track_for(number: int) -> tuple[Path, str]:
    file_name, title = TRACKS[number % len(TRACKS)]
    return LONG_DIR / file_name, title


def track_for(day_number: int) -> tuple[Path, str]:
    file_name, title = TRACKS[day_number % len(TRACKS)]
    return MUSIC_DIR / file_name, title


def credit_line(day_number: int, lang: str) -> str:
    _, title = track_for(day_number)
    if lang == "de":
        return f"🎵 Musik: „{title}“ von Kevin MacLeod (incompetech.com), CC BY 4.0"
    return f"🎵 Music: “{title}” by Kevin MacLeod (incompetech.com), CC BY 4.0"
