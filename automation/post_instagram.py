"""
Publishes one image post to the heylivo Instagram account via the Instagram API with
Instagram Login (graph.instagram.com) - like post_instagram.py of Smart Menu Solutions,
but the caption is built here from the day's row in content_calendar.csv (German) or
content_calendar_en.csv (English), or from specials.csv on the date of a special post.

Instagram needs a publicly reachable image_url (no direct upload), so the workflow pushes
the JPEG to the repo first and passes its raw.githubusercontent.com URL.

Reads INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN from the environment.

Usage:
    python post_instagram.py <public_image_or_mp4_url> <day_number> [de|en]
"""

import os
import sys
import time

import requests

from music import credit_line
from render_card import load_day_row

API_VERSION = "v21.0"
BASE = f"https://graph.instagram.com/{API_VERSION}"
CTA = {
    "de": "👉 30 Tage kostenlos testen – Link in der Bio: heylivo.com",
    "en": "👉 Try it free for 30 days – link in bio: heylivo.com/en",
}


# Reels also name their background music (the CC BY licence asks for a credit, see music.py)
def caption_for(day_number: int, lang: str, reel: bool = False) -> str:
    row = load_day_row(day_number, lang)
    credit = f"\n{credit_line(day_number, lang)}" if reel else ""
    return f"{row['Hook']}\n\n{row['Caption']}\n\n{CTA[lang]}{credit}\n\n{row['Hashtags']}"


# An .mp4 becomes a Reel (also shown in the profile grid), anything else an image post.
# thumb_offset: the Reel's cover is the frame at 7.5 s, when everything is on screen.
def create_container(ig_id: str, access_token: str, media_url: str, caption: str) -> str:
    data = {"caption": caption, "access_token": access_token}
    if media_url.endswith(".mp4"):
        data.update({"media_type": "REELS", "video_url": media_url, "share_to_feed": "true", "thumb_offset": "7500"})
    else:
        data["image_url"] = media_url
    resp = requests.post(f"{BASE}/{ig_id}/media", data=data)
    if not resp.ok:
        print(f"Create container failed ({resp.status_code}): {resp.text}")
    resp.raise_for_status()
    return resp.json()["id"]


def wait_until_ready(container_id: str, access_token: str, timeout: int = 300) -> None:
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
    if len(sys.argv) not in (3, 4):
        print("Usage: python post_instagram.py <public_image_or_mp4_url> <day_number> [de|en]")
        sys.exit(1)

    media_url = sys.argv[1]
    caption = caption_for(int(sys.argv[2]), sys.argv[3] if len(sys.argv) == 4 else "de", media_url.endswith(".mp4"))
    ig_user_id = os.environ["INSTAGRAM_USER_ID"]
    token = os.environ["INSTAGRAM_ACCESS_TOKEN"]

    container_id = create_container(ig_user_id, token, media_url, caption)
    wait_until_ready(container_id, token)
    media_id = publish(ig_user_id, token, container_id)
    print(f"Published. media_id={media_id}")
