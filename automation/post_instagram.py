"""
Publishes one image post to the heylivo Instagram account via the Instagram API with
Instagram Login (graph.instagram.com) - like post_instagram.py of Smart Menu Solutions,
but the caption is built here from the day's row in content_calendar.csv.

Instagram needs a publicly reachable image_url (no direct upload), so the workflow pushes
the JPEG to the repo first and passes its raw.githubusercontent.com URL.

Reads INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN from the environment.

Usage:
    python post_instagram.py <public_image_url> <day_number>
"""

import csv
import os
import sys
import time
from pathlib import Path

import requests

API_VERSION = "v21.0"
BASE = f"https://graph.instagram.com/{API_VERSION}"
CALENDAR_PATH = Path(__file__).resolve().parent / "content_calendar.csv"
CTA = "👉 30 Tage kostenlos testen – Link in der Bio: heylivo.com"


def caption_for(day_number: int) -> str:
    with open(CALENDAR_PATH, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if int(row["Tag"]) == day_number:
                return f"{row['Hook']}\n\n{row['Caption']}\n\n{CTA}\n\n{row['Hashtags']}"
    raise ValueError(f"Day {day_number} not found in {CALENDAR_PATH}")


def create_container(ig_id: str, access_token: str, image_url: str, caption: str) -> str:
    resp = requests.post(
        f"{BASE}/{ig_id}/media",
        data={"image_url": image_url, "caption": caption, "access_token": access_token},
    )
    if not resp.ok:
        print(f"Create container failed ({resp.status_code}): {resp.text}")
    resp.raise_for_status()
    return resp.json()["id"]


def wait_until_ready(container_id: str, access_token: str, timeout: int = 90) -> None:
    elapsed = 0
    while elapsed < timeout:
        resp = requests.get(
            f"{BASE}/{container_id}",
            params={"fields": "status_code", "access_token": access_token},
        )
        resp.raise_for_status()
        status = resp.json().get("status_code")
        if status == "FINISHED":
            return
        if status == "ERROR":
            raise RuntimeError(f"Container processing failed: {resp.json()}")
        time.sleep(3)
        elapsed += 3
    raise TimeoutError("Container was not ready in time")


def publish(ig_id: str, access_token: str, creation_id: str) -> str:
    resp = requests.post(
        f"{BASE}/{ig_id}/media_publish",
        data={"creation_id": creation_id, "access_token": access_token},
    )
    if not resp.ok:
        print(f"Publish failed ({resp.status_code}): {resp.text}")
    resp.raise_for_status()
    return resp.json()["id"]


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python post_instagram.py <public_image_url> <day_number>")
        sys.exit(1)

    image_url = sys.argv[1]
    caption = caption_for(int(sys.argv[2]))
    ig_user_id = os.environ["INSTAGRAM_USER_ID"]
    token = os.environ["INSTAGRAM_ACCESS_TOKEN"]

    container_id = create_container(ig_user_id, token, image_url, caption)
    wait_until_ready(container_id, token)
    media_id = publish(ig_user_id, token, container_id)
    print(f"Published. media_id={media_id}")
