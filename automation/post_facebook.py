"""
Posts a Reel to the heylivo Facebook Page (facebook.com/heylivo) via the Reels Publishing API
(graph.facebook.com). Only the German Reels go there - the Page is German:
- the voice series from promo.csv (post_promo.py)
- the Ratgeber-Reels (post_ratgeber.py)
- the special posts with a fixed date, e.g. the Kfz countdown (post_instagram.py, Tag 101+)
The 8-second calendar Reels stay on Instagram.

Like Instagram, Facebook fetches the video from its public URL (heylivo.com/automation/...).
Links are clickable on Facebook, so "Link in der Bio" becomes the address itself. is_ai_generated
sets Facebook's "AI info" label, like on Instagram (KI = ja in promo.csv).

Reads FACEBOOK_PAGE_TOKEN from the environment: the never-expiring Page token of the Meta app
"heylivo Autopilot" (created 02.11.2026). Without it nothing happens. A failure here is only
printed - it never stops the Instagram post or the CSV update that follows it.

Manual run (GitHub workflow facebook-post.yml), e.g. a test as a draft that nobody sees:
    python post_facebook.py <public_mp4_url> <text_file> [ai] [draft]
"""

import os
import re
import sys
import time

import requests

API_VERSION = "v26.0"
PAGE_ID = "1371686046035971"  # facebook.com/heylivo
GRAPH = f"https://graph.facebook.com/{API_VERSION}"
UPLOAD = f"https://rupload.facebook.com/video-upload/{API_VERSION}"

# Instagram texts point to the link in the bio - on Facebook the address can stand in the text
LINK_FIXES = [
    (re.compile(r"Link in der Bio \((heylivo\.com[^)]*)\)"), r"\1"),  # "Alle Infos: heylivo.com/ausweis."
    (re.compile(r"Link in der Bio: "), ""),  # "👉 heylivo.com"
    (re.compile(r"heylivo: Link in der Bio"), "heylivo.com"),  # "heylivo.com – 30 Tage kostenlos testen."
    (re.compile(r"Link in der Bio"), "heylivo.com"),
]


def facebook_text(caption: str) -> str:
    for pattern, replacement in LINK_FIXES:
        caption = pattern.sub(replacement, caption)
    return caption


def is_german_video(file_name: str) -> bool:
    # serie-de03.mp4, heylivo-6-lila-stimme-de.mp4 - not serie-en03.mp4
    return re.search(r"-de\d*\.mp4$", file_name) is not None


def wait_until_published(video_id: str, token: str, timeout: int = 600) -> dict:
    status: dict = {}
    for _ in range(timeout // 10):
        resp = requests.get(f"{GRAPH}/{video_id}", params={"fields": "status", "access_token": token})
        resp.raise_for_status()
        status = resp.json().get("status", {})
        if status.get("video_status") == "error" or status.get("processing_phase", {}).get("status") == "error":
            raise RuntimeError(f"Facebook could not process the video: {status}")
        if status.get("publishing_phase", {}).get("status") == "complete":
            return status
        time.sleep(10)
    return status


def post_reel(video_url: str, caption: str, ai: bool = False, draft: bool = False) -> str | None:
    token = os.environ.get("FACEBOOK_PAGE_TOKEN", "")
    if not token:
        print("No FACEBOOK_PAGE_TOKEN - nothing posted to Facebook.")
        return None
    try:
        resp = requests.post(f"{GRAPH}/{PAGE_ID}/video_reels", data={"upload_phase": "start", "access_token": token})
        resp.raise_for_status()
        video_id = resp.json()["video_id"]
        resp = requests.post(f"{UPLOAD}/{video_id}", headers={"Authorization": f"OAuth {token}", "file_url": video_url})
        resp.raise_for_status()
        data = {
            "upload_phase": "finish",
            "video_id": video_id,
            "video_state": "DRAFT" if draft else "PUBLISHED",
            "description": facebook_text(caption),
            "access_token": token,
        }
        if ai:
            data["is_ai_generated"] = "true"
        resp = requests.post(f"{GRAPH}/{PAGE_ID}/video_reels", data=data)
        resp.raise_for_status()
        if draft:
            print(f"Facebook: draft saved, video_id={video_id} (only visible in Meta Business Suite)")
            return video_id
        status = wait_until_published(video_id, token)
        print(f"Facebook: published {video_url} video_id={video_id} status={status.get('video_status')}")
        return video_id
    except Exception as error:
        detail = getattr(getattr(error, "response", None), "text", "")
        print(f"Facebook post failed (Instagram is not affected): {error} {detail}")
        return None


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python post_facebook.py <public_mp4_url> <text_file> [ai] [draft]")
        sys.exit(1)
    with open(sys.argv[2], encoding="utf-8") as f:
        text = f.read().strip()
    flags = set(sys.argv[3:])
    if not post_reel(sys.argv[1], text, ai="ai" in flags, draft="draft" in flags):
        sys.exit(1)
