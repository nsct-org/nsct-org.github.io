#!/usr/bin/env python3
"""Turn the channel's video list into videos.js for the website.

Used two ways:
- build_site.py on the owner's computer passes the full list from the YouTube login (nsct_mcp.list_videos).
- The GitHub Action (.github/workflows/update-videos.yml) runs this file every 3 hours with a public API key
  (secret YT_API_KEY), so new uploads and view counts appear without anyone running anything.

    python tools/videos.py      # in the repo root, needs YT_API_KEY in the environment
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

CHANNEL = "UCBhQ84tXMB9-YaUmZKiK6jA"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "videos.js")


def category(title):
    if title.startswith("#"):
        return "poll"  # hashtag-titled Shorts are opinion polls
    for key, cat in (("14 ตุลา 2516 Remade", "oct14r"), ("เจาะลึกพรรคประชาชน", "ppdeep"), ("เจาะลึกพรรคเพื่อไทย", "ptdeep"),
                     ("นายกรัฐมนตรีไทยทุกคน", "pm"), ("การชุมนุมใหญ่", "rally"),
                     ("อภิปรายไม่ไว้วางใจ", "noconf"), ("14 ตุลา", "oct14"), ("6 ตุลา", "oct6"), ("การเดินทาง", "journey"),
                     ("NSCT Music", "music"), ("แนะนำช่อง", "intro"), ("แนะนำ Website", "intro"),
                     ("รัฐธรรมนูญ", "constitution"), ("รัฐประหาร", "coup"), ("กบฏ", "rebel"), ("พรรคการเมือง", "parties")):
        if key in title:
            return cat
    return None  # anything else stays off the website until it gets a category


# documentary series: long uploads are the full films
SERIES = {"constitution", "coup", "rebel", "parties", "oct14r", "ppdeep", "ptdeep", "noconf", "pm", "rally"}

# Short horizontal videos that are not Shorts (the API has no orientation field)
HORIZONTAL = {"Ac-6oH6XU9M"}  # แนะนำช่อง, landscape version

# Titles the YouTube title alone doesn't explain
TITLE_OVERRIDES = {
    "PgcdAzuKLK4": "โพลแสดงความเห็น: การอภิปรายไม่ไว้วางใจ",
}


def clean_title(title):
    title = re.sub(r"\s*-\s*NSCT", "", title).replace("[คลิปเต็ม]", "").replace("[Full]", "").strip()
    return re.sub(r"\s*\|.*$", "", title)


def write(videos):
    """videos: dicts with video_id, title, privacy, duration_sec, published_at, views. Returns the row count."""
    rows = []
    for v in {v["video_id"]: v for v in videos}.values():
        cat = category(v["title"])
        if v["privacy"] != "public" or not cat:
            continue
        rows.append({
            "id": v["video_id"], "cat": cat,
            "title": TITLE_OVERRIDES.get(v["video_id"]) or (f"โพลแสดงความเห็น {v['title'][:40]}" if cat == "poll" else clean_title(v["title"])),
            "full": "[คลิปเต็ม]" in v["title"] or (cat in SERIES and v["duration_sec"] > 180),
            "short": v["duration_sec"] <= 180 and "[คลิปเต็ม]" not in v["title"] and v["video_id"] not in HORIZONTAL,
            "published": v["published_at"], "views": v["views"], "sec": v["duration_sec"],
        })
    rows.sort(key=lambda r: r["published"])
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("// สร้างอัตโนมัติจาก YouTube Data API (build_site.py หรือ GitHub Action) อย่าแก้มือ\n")
        f.write("window.NSCT_VIDEOS = " + json.dumps(rows, ensure_ascii=False, indent=1) + ";\n")
    return len(rows)


def _get(key, path, **params):
    url = f"https://www.googleapis.com/youtube/v3/{path}?" + urllib.parse.urlencode(dict(params, key=key))
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def _seconds(iso):
    m = re.match(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    d, h, mi, s = (int(x or 0) for x in m.groups()) if m else (0, 0, 0, 0)
    return ((d * 24 + h) * 60 + mi) * 60 + s


def fetch_public(key):
    """Every public video, using only a public API key (about 10 quota units a run)."""
    ids = []
    # The uploads playlist (UU) has been seen to skip videos, so also read the long-video (UULF), Shorts (UUSH)
    # and live (UULV) playlists, and keep every id already on the site
    for prefix in ("UU", "UULF", "UUSH", "UULV"):
        token = ""
        while True:
            try:
                r = _get(key, "playlistItems", part="contentDetails", playlistId=prefix + CHANNEL[2:], maxResults=50, pageToken=token)
            except urllib.error.HTTPError as e:
                if e.code == 404:  # the channel has no videos of that kind
                    break
                raise
            ids += [i["contentDetails"]["videoId"] for i in r["items"]]
            token = r.get("nextPageToken")
            if not token:
                break
    if os.path.exists(OUT):
        ids += re.findall(r'"id": "([\w-]{11})"', open(OUT, encoding="utf-8").read())
    ids = list(dict.fromkeys(ids))
    videos = []
    for i in range(0, len(ids), 50):
        r = _get(key, "videos", part="snippet,contentDetails,statistics,status", id=",".join(ids[i:i + 50]))
        for v in r["items"]:
            videos.append({
                "video_id": v["id"], "title": v["snippet"]["title"], "published_at": v["snippet"]["publishedAt"],
                "duration_sec": _seconds(v["contentDetails"].get("duration")),
                "privacy": v.get("status", {}).get("privacyStatus", ""),
                "views": int(v.get("statistics", {}).get("viewCount", 0)),
            })
    return videos


if __name__ == "__main__":
    key = os.environ.get("YT_API_KEY")
    if not key:
        print("YT_API_KEY is not set; videos.js left as it is")
        sys.exit(0)
    videos = fetch_public(key)
    if len(videos) < 20:  # a broken response must not wipe the site
        sys.exit(f"only {len(videos)} videos came back; videos.js left as it is")
    print("videos.js:", write(videos), "videos")
