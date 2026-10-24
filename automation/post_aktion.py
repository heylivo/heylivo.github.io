"""
Posts the giveaway "25 x 1 Jahr Livo Plus" (aktion/aktion.csv) to the heylivo Instagram account:
Art = Karussell posts the images as one carousel in the feed with the caption from "Text",
Art = Story posts each image as its own story, in order (stories have no caption).

Like post_promo.py: per run the newest row whose date has come (Europe/Berlin) and that has
nothing in "Gepostet" yet. The media id(s) are written back into the CSV and the workflow
commits them, so nothing is posted twice. Older left-over rows are marked "ausgelassen <date>".
To end the giveaway early (25 codes redeemed), write "gestoppt" into "Gepostet" of the
remaining rows or delete them.

The images are served by the website (heylivo.com/automation/aktion/...); Instagram only
accepts JPEG. Reads INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN from the environment.

Usage:
    python post_aktion.py
"""

import csv
import os
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from post_instagram import BASE, publish, wait_until_ready
from post_promo import wait_for_url

AKTION_CSV = Path(__file__).resolve().parent / "aktion" / "aktion.csv"
IMAGE_BASE = "https://heylivo.com/automation/aktion/"
FIELDS = ["Datum", "Art", "Bilder", "Text", "Gepostet"]


def create_container(ig_id: str, access_token: str, data: dict) -> str:
    resp = requests.post(f"{BASE}/{ig_id}/media", data={"access_token": access_token, **data})
    if not resp.ok:
        print(f"Create container failed ({resp.status_code}): {resp.text}")
    resp.raise_for_status()
    return resp.json()["id"]


def post_carousel(ig_id: str, access_token: str, urls: list[str], caption: str) -> str:
    children = []
    for url in urls:
        child = create_container(ig_id, access_token, {"image_url": url, "is_carousel_item": "true"})
        wait_until_ready(child, access_token)
        children.append(child)
    parent = create_container(
        ig_id, access_token, {"media_type": "CAROUSEL", "children": ",".join(children), "caption": caption}
    )
    wait_until_ready(parent, access_token)
    return publish(ig_id, access_token, parent)


def post_story(ig_id: str, access_token: str, url: str) -> str:
    container = create_container(ig_id, access_token, {"media_type": "STORIES", "image_url": url})
    wait_until_ready(container, access_token)
    return publish(ig_id, access_token, container)


if __name__ == "__main__":
    today = datetime.now(ZoneInfo("Europe/Berlin")).date().isoformat()
    with open(AKTION_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    due = [r for r in rows if r["Datum"] <= today and not r["Gepostet"].strip()]
    if not due:
        print(f"Nothing due on {today}.")
        sys.exit(0)

    due.sort(key=lambda r: r["Datum"])
    row = due[-1]
    for old in due[:-1]:
        old["Gepostet"] = f"ausgelassen {today}"
    ig_user_id = os.environ["INSTAGRAM_USER_ID"]
    token = os.environ["INSTAGRAM_ACCESS_TOKEN"]
    urls = [IMAGE_BASE + name.strip() for name in row["Bilder"].split(";") if name.strip()]
    for url in urls:
        wait_for_url(url)

    media_ids = []
    try:
        if row["Art"] == "Karussell":
            media_ids.append(post_carousel(ig_user_id, token, urls, row["Text"]))
        elif row["Art"] == "Story":
            for url in urls:
                media_ids.append(post_story(ig_user_id, token, url))
        else:
            raise ValueError(f"Unknown Art {row['Art']!r} on {row['Datum']}")
    finally:
        # Also saved when a later story failed - the ones already up must not be posted again
        if media_ids:
            row["Gepostet"] = ";".join(media_ids)
        with open(AKTION_CSV, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDS, quoting=csv.QUOTE_ALL, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
    print(f"Published {row['Art']} {row['Datum']} ({row['Bilder']}): {row['Gepostet']}")
