"""
Posts the daily Ratgeber-Reel from ratgeber/ratgeber.csv to the heylivo Instagram account.

    python post_ratgeber.py render        renders today's Reel to output/ratgeber-<lang>-<Datum>.mp4
                                          (in GitHub Actions also "datum=" and "file=" for the next steps)
    python post_ratgeber.py post <Datum>  publishes that Reel once the website serves it, writes the media id
                                          into "Gepostet" and marks older left-over rows "ausgelassen <date>"

Like post_promo.py: per day the newest row whose date has come (Europe/Berlin) and that has nothing in
"Gepostet" yet - a backlog (e.g. a scheduled run GitHub skipped) is skipped instead of posted late.
Reads INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN from the environment.
"""

import csv
import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from music import credit_line
from post_instagram import BASE, publish, wait_until_ready
from post_promo import wait_for_url
from render_ratgeber import CSV_PATH, FIELDS, load_rows, render, track_number

OUTPUT_DIR = Path(__file__).resolve().parent / "output"
VIDEO_BASE = "https://heylivo.com/automation/output/"


def video_name(row: dict) -> str:
    # ends with the date, like the daily Reels - the clean-up step keeps the newest files by that date
    return f"ratgeber-{row['Sprache']}-{row['Datum']}.mp4"


def due_rows(rows: list[dict]) -> tuple[str, list[dict]]:
    today = datetime.now(ZoneInfo("Europe/Berlin")).date().isoformat()
    due = sorted((r for r in rows if r["Datum"] <= today and not r["Gepostet"].strip()), key=lambda r: r["Datum"])
    return today, due


def caption_for(row: dict) -> str:
    return f"{row['Caption']}\n\n{credit_line(track_number(row), row['Sprache'])}\n\n{row['Hashtags']}"


def save(rows: list[dict]) -> None:
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, quoting=csv.QUOTE_ALL, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def make_reel() -> None:
    today, due = due_rows(load_rows())
    if not due:
        print(f"Nothing due on {today}.")
        return
    row = due[-1]
    render(row, OUTPUT_DIR / video_name(row))
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
            out.write(f"datum={row['Datum']}\nfile={video_name(row)}\n")


def post_reel(date: str) -> None:
    rows = load_rows()
    row = next(r for r in rows if r["Datum"] == date)
    today, due = due_rows(rows)
    ig_user_id = os.environ["INSTAGRAM_USER_ID"]
    token = os.environ["INSTAGRAM_ACCESS_TOKEN"]
    url = VIDEO_BASE + video_name(row)
    wait_for_url(url)
    resp = requests.post(f"{BASE}/{ig_user_id}/media", data={
        "access_token": token,
        "caption": caption_for(row),
        "media_type": "REELS",
        "video_url": url,
        "share_to_feed": "true",
        "thumb_offset": "1500",  # cover = the question slide
    })
    if not resp.ok:
        print(f"Create container failed ({resp.status_code}): {resp.text}")
    resp.raise_for_status()
    container_id = resp.json()["id"]
    wait_until_ready(container_id, token, timeout=600)
    media_id = publish(ig_user_id, token, container_id)

    row["Gepostet"] = media_id
    for old in due:
        if old["Datum"] < row["Datum"]:
            old["Gepostet"] = f"ausgelassen {today}"
    save(rows)
    print(f"Published Ratgeber {row['Datum']} {row['Sprache']}: media_id={media_id}")


if __name__ == "__main__":
    if sys.argv[1:2] == ["render"]:
        make_reel()
    elif sys.argv[1:2] == ["post"] and len(sys.argv) == 3:
        post_reel(sys.argv[2])
    else:
        print("Usage: python post_ratgeber.py render | post <Datum JJJJ-MM-TT>")
        sys.exit(1)
