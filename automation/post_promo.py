"""
Posts the promo videos listed in promo/promo.csv to the heylivo Instagram account as Reels:
per run the first row whose date has come (Europe/Berlin) and that has no media id yet in
"Gepostet". The media id is written back into the CSV, so the workflow commits it and
nothing is posted twice.

KI = ja sets Instagram's "AI info" label (is_ai_generated, Content Publishing API since
June 2026, all API versions). Cover_ms is the Reel cover frame in milliseconds.
The videos are served by the website (heylivo.com/automation/promo/...), like the daily Reels.

Reads INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN from the environment.

Usage:
    python post_promo.py
"""

import csv
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from post_instagram import BASE, publish, wait_until_ready

PROMO_CSV = Path(__file__).resolve().parent / "promo" / "promo.csv"
VIDEO_BASE = "https://heylivo.com/automation/promo/"
FIELDS = ["Datum", "Datei", "KI", "Cover_ms", "Text", "Gepostet"]


def wait_for_url(url: str, timeout: int = 360) -> None:
    # A video pushed shortly before is only reachable once GitHub Pages has deployed it
    for _ in range(timeout // 6):
        if requests.head(url, allow_redirects=True).status_code == 200:
            return
        time.sleep(6)
    raise TimeoutError(f"{url} is not reachable")


def create_reel(ig_id: str, access_token: str, row: dict) -> str:
    data = {
        "access_token": access_token,
        "caption": row["Text"],
        "media_type": "REELS",
        "video_url": VIDEO_BASE + row["Datei"],
        "share_to_feed": "true",
        "thumb_offset": row["Cover_ms"] or "0",
    }
    if row["KI"].strip().lower() == "ja":
        data["is_ai_generated"] = "true"
    resp = requests.post(f"{BASE}/{ig_id}/media", data=data)
    if not resp.ok:
        print(f"Create container failed ({resp.status_code}): {resp.text}")
    resp.raise_for_status()
    return resp.json()["id"]


if __name__ == "__main__":
    today = datetime.now(ZoneInfo("Europe/Berlin")).date().isoformat()
    with open(PROMO_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    due = [r for r in rows if r["Datum"] <= today and not r["Gepostet"].strip()]
    if not due:
        print(f"Nothing due on {today}.")
        sys.exit(0)

    row = due[0]
    ig_user_id = os.environ["INSTAGRAM_USER_ID"]
    token = os.environ["INSTAGRAM_ACCESS_TOKEN"]
    wait_for_url(VIDEO_BASE + row["Datei"])
    container_id = create_reel(ig_user_id, token, row)
    wait_until_ready(container_id, token, timeout=600)
    media_id = publish(ig_user_id, token, container_id)

    row["Gepostet"] = media_id
    with open(PROMO_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, quoting=csv.QUOTE_ALL, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    # Check that Instagram really set the AI label (it cannot be added through the API afterwards)
    info = requests.get(f"{BASE}/{media_id}", params={"fields": "permalink,is_ai_generated", "access_token": token})
    print(f"Published {row['Datei']}. media_id={media_id} {info.text}")
    if row["KI"].strip().lower() == "ja" and '"is_ai_generated":true' not in info.text.replace(" ", ""):
        print("WARNING: the AI label is not confirmed - add it in the Instagram app (edit the Reel).")
