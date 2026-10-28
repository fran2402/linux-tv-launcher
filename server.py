#!/usr/bin/env python3
"""linux-tv-launcher backend.

Serves the UI in ./web: a painting (or photo) home screen with a big clock, the weather, what's
playing, and your apps. Keeps your apps (and their icons) in ~/.config/linux-tv-launcher, and
launches them. Python standard library only.

    python3 server.py        # listens on 127.0.0.1:8765 (port is in config.json)
"""

import base64
import hashlib
import itertools
import json
import os
import random
import re
import shlex
import shutil
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "linux-tv-launcher"
STATE = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state")) / "linux-tv-launcher"
STATE.mkdir(parents=True, exist_ok=True)
APPS_FILE = CONFIG_DIR / "apps.json"
UPLOAD_DIR = CONFIG_DIR / "icons"   # icons you picked in the app editor
ICON_DIR = STATE / "icons"          # icons the launcher found by itself


def load_config():
    """~/.config/linux-tv-launcher/config.json, else config.json next to this file. Everything in it is optional."""
    for path in (CONFIG_DIR / "config.json", ROOT / "config.json"):
        if path.exists():
            return json.loads(path.read_text())
    return {}


CFG = load_config()
PORT = int(CFG.get("port", 8765))
UA = {"User-Agent": "linux-tv-launcher/1.0 (+https://github.com/fran2402/linux-tv-launcher)"}
BROWSER_UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0"}
DEVNULL = subprocess.DEVNULL

lock = threading.RLock()
cache = {}


def log(*parts):
    print(time.strftime("%H:%M:%S"), *parts, flush=True)


def read_json(path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(path)


# ---------------------------------------------------------------- helpers

def host_of(url):
    return (urllib.parse.urlparse(url).hostname or "").lower()


def fetch(url, body=None, timeout=15, headers=None, limit=None):
    data = json.dumps(body).encode() if body is not None else None
    hdrs = {**UA, **(headers or {})}
    if data is not None:
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if limit is None:
            return resp.read()
        out = resp.read(limit + 1)
        if len(out) > limit:
            raise ValueError(f"response from {host_of(url)} is too large")
        return out


def fetch_json(url, body=None, headers=None):
    return json.loads(fetch(url, body, headers=headers))


# ---------------------------------------------------------------- weather

weather_cache = {}
WEATHER_TTL = 900


def weather_place():
    """Where to get the weather for: config "weather_location" (a place name, or {lat, lon, name}),
    otherwise worked out once from your internet connection."""
    loc = CFG.get("weather_location") or ""
    if isinstance(loc, dict) and "lat" in loc and "lon" in loc:
        return float(loc["lat"]), float(loc["lon"]), loc.get("name", "")
    with lock:
        hit = cache.get("weather_place")
    if hit and hit.get("query") == loc:
        return hit["lat"], hit["lon"], hit["name"]
    if isinstance(loc, str) and loc.strip():
        d = fetch_json("https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode(
            {"name": loc.strip(), "count": 1, "language": CFG.get("language", "en-GB").split("-")[0]}))
        r = (d.get("results") or [None])[0]
        if not r:
            raise ValueError(f"couldn't find {loc!r} for the weather")
        place = {"lat": r["latitude"], "lon": r["longitude"], "name": r.get("name", loc)}
    else:
        d = fetch_json("https://ipapi.co/json/")
        place = {"lat": d["latitude"], "lon": d["longitude"], "name": d.get("city", "")}
    with lock:
        cache["weather_place"] = {**place, "query": loc}
    return place["lat"], place["lon"], place["name"]


COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def weather():
    """Now, the next hours (with the sunset or sunrise among them), today's details and tomorrow."""
    hit = weather_cache.get("now")
    if hit and time.time() - hit[0] < WEATHER_TTL:
        return hit[1]
    lat, lon, name = weather_place()
    f = CFG.get("weather_units") == "fahrenheit"
    d = fetch_json("https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode({
        "latitude": lat, "longitude": lon, "timezone": "auto", "forecast_days": 2,
        "temperature_unit": "fahrenheit" if f else "celsius", "wind_speed_unit": "mph" if f else "kmh",
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day",
        "hourly": "temperature_2m,weather_code,precipitation_probability,is_day",
        "daily": "temperature_2m_max,temperature_2m_min,sunrise,sunset,weather_code,precipitation_probability_max"}))
    cur, day, hr = d.get("current") or {}, d.get("daily") or {}, d.get("hourly") or {}
    pick = lambda arr, k=0, default=None: (arr or [])[k] if len(arr or []) > k else default
    now_t = str(cur.get("time") or "")
    # the next six hours; the sunset (or sunrise) slots in among them
    hours = []
    times = hr.get("time") or []
    start = next((k for k, t in enumerate(times) if t > now_t), len(times))
    events = []
    for k in (0, 1):
        for ev in ("sunrise", "sunset"):
            t = str(pick(day.get(ev), k, "") or "")
            if t and t > now_t:
                events.append((t, ev))
    for k in range(start, min(start + 8, len(times))):
        hours.append({"at": times[k], "time": times[k][11:13], "temp": round(pick(hr.get("temperature_2m"), k, 0)),
                      "code": pick(hr.get("weather_code"), k, 0), "day": bool(pick(hr.get("is_day"), k, 1)),
                      "rain": pick(hr.get("precipitation_probability"), k)})
    if hours:
        ev = next(((t, e) for t, e in sorted(events) if t < hours[-1]["at"]), None)
        if ev:
            pos = next((n for n, h in enumerate(hours) if h["at"] > ev[0]), len(hours))
            hours.insert(pos, {"at": ev[0], "time": ev[0][11:16], "event": ev[1]})
    hours = hours[:6]
    wd = cur.get("wind_direction_10m")
    out = {"temp": round(cur.get("temperature_2m", 0)), "code": cur.get("weather_code", 0), "day": bool(cur.get("is_day", 1)),
           "hi": round(pick(day.get("temperature_2m_max"), 0, 0)), "lo": round(pick(day.get("temperature_2m_min"), 0, 0)),
           "place": name, "unit": "°F" if f else "°",
           "feels": round(cur.get("apparent_temperature", cur.get("temperature_2m", 0))),
           "humidity": cur.get("relative_humidity_2m"),
           "wind": round(cur.get("wind_speed_10m") or 0), "wind_unit": "mph" if f else "km/h",
           "wind_dir": COMPASS[round(wd / 45) % 8] if isinstance(wd, (int, float)) else "",
           "rain": pick(day.get("precipitation_probability_max"), 0),
           # local times, "HH:MM"
           "sunrise": str(pick(day.get("sunrise"), 0, ""))[11:16], "sunset": str(pick(day.get("sunset"), 0, ""))[11:16],
           "hours": [{k: v for k, v in h.items() if k != "at"} for h in hours],
           "tomorrow": {"hi": round(pick(day.get("temperature_2m_max"), 1, 0)), "lo": round(pick(day.get("temperature_2m_min"), 1, 0)),
                        "code": pick(day.get("weather_code"), 1, 0), "rain": pick(day.get("precipitation_probability_max"), 1)}}
    weather_cache["now"] = (time.time(), out)
    return out


# ---------------------------------------------------------------- now playing (MPRIS)
# Whatever is playing on this computer (YouTube Music in Firefox, Spotify…), read over D-Bus with
# playerctl when it's installed, else with gdbus. Nothing playing, or neither tool: no card.
nowplaying_cache = [0, None]


def _run(cmd, timeout=2):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.stdout if r.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def _gv(text, key):
    """One value out of gdbus's GVariant text: a string, the first of a string list, or a number."""
    m = re.search(r"'%s': <(?:\[)?(?:@as \[)?(?:int64 |uint64 |objectpath )?('((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"|-?\d+)" % re.escape(key), text)
    if not m:
        return None
    v = m.group(2) if m.group(2) is not None else m.group(3) if m.group(3) is not None else m.group(1)
    return v.replace("\\'", "'").replace('\\"', '"') if isinstance(v, str) else v


def mpris_players():
    out = _run(["gdbus", "call", "--session", "--dest", "org.freedesktop.DBus", "--object-path", "/org/freedesktop/DBus",
                "--method", "org.freedesktop.DBus.ListNames"])
    return re.findall(r"'(org\.mpris\.MediaPlayer2\.[^']+)'", out)


def player_source(name, url, art):
    if "music.youtube" in (url or "") or "lh3.googleusercontent" in (art or "") or "ytimg" in (art or ""):
        return "YouTube Music" if "music.youtube" in (url or "") or "googleusercontent" in (art or "") else "YouTube"
    n = name.split(".")[-1].split("_")[0] if name else ""
    return {"firefox": "Firefox", "spotify": "Spotify", "chromium": "Chromium", "vlc": "VLC", "mpv": "mpv"}.get(n.lower(), n.capitalize())


def now_playing():
    if time.time() - nowplaying_cache[0] < 1.5:
        return nowplaying_cache[1]
    found = []
    if shutil.which("playerctl"):
        fmt = "{{playerName}}\t{{status}}\t{{title}}\t{{artist}}\t{{album}}\t{{mpris:artUrl}}\t{{mpris:length}}\t{{position}}\t{{xesam:url}}"
        for line in _run(["playerctl", "-a", "metadata", "--format", fmt]).splitlines():
            p = (line.split("\t") + [""] * 9)[:9]
            found.append({"player": p[0], "status": p[1], "title": p[2], "artist": p[3], "album": p[4], "art": p[5],
                          "length": p[6], "position": p[7], "url": p[8]})
    elif shutil.which("gdbus"):
        for name in mpris_players():
            t = _run(["gdbus", "call", "--session", "--dest", name, "--object-path", "/org/mpris/MediaPlayer2",
                      "--method", "org.freedesktop.DBus.Properties.GetAll", "org.mpris.MediaPlayer2.Player"])
            if t:
                found.append({"player": name, "status": _gv(t, "PlaybackStatus"), "title": _gv(t, "xesam:title"),
                              "artist": _gv(t, "xesam:artist"), "album": _gv(t, "xesam:album"), "art": _gv(t, "mpris:artUrl"),
                              "length": _gv(t, "mpris:length"), "position": _gv(t, "Position"), "url": _gv(t, "xesam:url")})
    found = [f for f in found if f.get("title") and f.get("status") in ("Playing", "Paused")]
    for f in found:
        f["art"] = album_art(f)
    found.sort(key=lambda f: f["status"] != "Playing")
    res = None
    if found:
        f = found[0]
        secs = lambda v: int(int(v) / 1_000_000) if str(v or "").lstrip("-").isdigit() else 0
        art = f.get("art") or ""
        res = {"state": f["status"].lower(), "title": f["title"], "artist": f.get("artist") or "", "album": f.get("album") or "",
               "art": art, "length": secs(f.get("length")), "position": secs(f.get("position")),
               "player": f["player"], "source": player_source(f["player"], f.get("url"), art), "at": time.time()}
    nowplaying_cache[:] = [time.time(), res]
    return res


# The cover: the player's own when it gives one (a web address, or a file it saved, which the
# launcher serves); for YouTube, the video's thumbnail; otherwise looked up on the iTunes store.
art_cache, art_file = {}, {"path": ""}
ART_DIRS = ("/tmp/", str(Path.home() / ".cache") + "/", str(Path.home() / ".mozilla") + "/", str(Path.home() / "snap") + "/")


def album_art(f):
    art = str(f.get("art") or "")
    if art.startswith("https://"):
        return art
    if art.startswith("file://"):
        path = os.path.realpath(urllib.parse.unquote(art[7:]))
        if path.startswith(ART_DIRS) and os.path.isfile(path):
            art_file["path"] = path
            return f"/api/nowplaying/art?v={hashlib.md5(path.encode()).hexdigest()[:10]}"
    m = re.search(r"(?:v=|youtu\.be/)([\w-]{11})", str(f.get("url") or ""))
    if m:
        return f"https://i.ytimg.com/vi/{m.group(1)}/mqdefault.jpg"
    key = (str(f.get("artist") or "").lower(), str(f.get("title") or "").lower())
    if key in art_cache:
        return art_cache[key]
    art_cache[key] = ""

    def look():
        try:
            d = fetch_json("https://itunes.apple.com/search?" + urllib.parse.urlencode(
                {"term": f"{f.get('artist') or ''} {f.get('title') or ''}".strip(), "entity": "song", "limit": 1}))
            url = ((d.get("results") or [{}])[0] or {}).get("artworkUrl100") or ""
            art_cache[key] = url.replace("100x100bb", "600x600bb")
            nowplaying_cache[0] = 0
        except (urllib.error.URLError, ValueError, TimeoutError) as e:
            log("album art:", e)
    threading.Thread(target=look, daemon=True).start()
    return ""


def nowplaying_art_file():
    path = art_file["path"]
    if not path or not os.path.isfile(path) or os.path.getsize(path) > 10_000_000:
        raise KeyError("no cover")
    data = Path(path).read_bytes()
    return data, image_type(data)


def nowplaying_control(body):
    action = (body or {}).get("action")
    method = {"playpause": "PlayPause", "next": "Next", "previous": "Previous"}.get(action)
    if not method:
        raise ValueError("unknown action")
    cur = now_playing()
    if not cur:
        raise ValueError("nothing is playing")
    if shutil.which("playerctl") and not cur["player"].startswith("org.mpris."):
        _run(["playerctl", "-p", cur["player"], {"playpause": "play-pause"}.get(action, action)])
    else:
        _run(["gdbus", "call", "--session", "--dest", cur["player"], "--object-path", "/org/mpris/MediaPlayer2",
              "--method", f"org.mpris.MediaPlayer2.Player.{method}"])
    nowplaying_cache[0] = 0
    time.sleep(.25)
    return now_playing()




# ---------------------------------------------------------------- paintings for the home screen
# Realist western oil landscapes (1600–1895: Dutch Golden Age, Hudson River School, Barbizon,
# Danish Golden Age, Corot…) from museums that publish their public-domain collections for free:
#   Cleveland Museum of Art, Art Institute of Chicago, The Met, Minneapolis Institute of Art,
#   SMK (National Gallery of Denmark) and, with a free key each, the Rijksmuseum and Harvard.
#   (Not the National Gallery in Washington: its photographs show the frames.) Any painting the
#   home page finds a frame in is reported back and left out from then on.
# Only landscape subjects, only wider than tall. Each museum's list is kept in its own file and
# refreshed in the background (weekly; the National Gallery's big open-data files monthly). Each
# image is downloaded once into the state folder and served from there.
PAINTING_DIR = STATE / "paintings"


def clean_text(v):
    v = str(v or "").strip()
    return "" if v.lower() in ("null", "none", "undefined") else v

PAINTINGS_PER_HOUR = 50
PAINTING_KEEP = 120          # images kept on disk (a bit over two hours' worth)
MIN_RATIO = 1.2              # wider than tall, comfortably
YEARS = (1600, 1895)
LANDSCAPE_SEARCHES = ["landscape", "river", "mountains", "seascape", "harbor", "forest", "winter landscape", "lake", "coast",
                      "valley", "sunset", "storm at sea", "ships", "waterfall", "village", "countryside", "moonlight",
                      "beach", "bridge", "windmill", "pasture", "dunes", "canal", "view of"]
# words that make a title a landscape (for collections searched without a subject: the National Gallery)
LANDSCAPE_WORDS = re.compile(r"landscape|view|river|sea|coast|shore|harbo|mountain|lake|forest|wood|winter|valley|bay|storm|"
                             r"sunset|sunrise|moonlight|ship|boat|bridge|mill|village|beach|cliff|falls|meadow|pasture|road|"
                             r"canal|marine|dune|field|farm|hill|garden|park|meadow|rocks|island|morning|evening|twilight|"
                             r"cattle|cows|sheep|ruins|waterfall|stream|brook|pond|haven|skating|frozen|snow|clouds|sky", re.I)
NOT_LANDSCAPE = re.compile(r"portrait|still life|interior|madonna|virgin|saint|christ|nude|self-portrait|head of|bust", re.I)
# painted from life but not realist: left out
NOT_REALIST = ("monet", "renoir", "pissarro", "sisley", "cézanne", "cezanne", "van gogh", "gauguin", "seurat", "signac",
               "cassatt", "morisot", "degas", "toulouse", "matisse", "derain", "vlaminck", "guillaumin", "bonnard",
               "vuillard", "verkade", "sérusier", "serusier", "maurice denis", "redon", "munch", "klimt", "kandinsky",
               "picasso", "braque", "caillebotte", "bazille", "hassam", "twachtman", "theodore robinson", "cross, henri")
NOT_WESTERN = re.compile(r"china|chinese|japan|korea|india|persia|iran|tibet|nepal", re.I)
MUSEUM_NAMES = {"cma": "Cleveland Museum of Art", "aic": "Art Institute of Chicago", "met": "The Metropolitan Museum of Art",
                "mia": "Minneapolis Institute of Art", "smk": "SMK – National Gallery of Denmark", "rijks": "Rijksmuseum",
                "harvard": "Harvard Art Museums"}


def year_of(text):
    m = re.search(r"\b(1[0-9]{3})\b", str(text or ""))
    return int(m.group(1)) if m else None


def keep_painting(it):
    """The rules every museum's paintings pass: realist, western, 1600–1895, a landscape, wide."""
    if not it or not it.get("src") or not it.get("w") or not it.get("h"):
        return False
    if it["w"] / it["h"] < MIN_RATIO:
        return False
    y = year_of(it.get("date"))
    if y and not YEARS[0] <= y <= YEARS[1]:
        return False
    who = (it.get("artist") or "").lower()
    if any(n in who for n in NOT_REALIST) or NOT_WESTERN.search(it.get("culture") or "") or NOT_WESTERN.search(it.get("about") or ""):
        return False
    if NOT_LANDSCAPE.search(it.get("title") or ""):
        return False
    return "oil" in (it.get("technique") or "").lower()


def museum_cma():
    out = []
    for q in CFG.get("oil_searches") or LANDSCAPE_SEARCHES:
        try:
            d = fetch_json("https://openaccess-api.clevelandart.org/api/artworks/?" + urllib.parse.urlencode({
                "q": q, "type": "Painting", "cc0": 1, "has_image": 1, "limit": 100, "created_after": YEARS[0], "created_before": YEARS[1],
                "fields": "id,title,creation_date,creators,technique,culture,images"}))
        except (urllib.error.URLError, ValueError, TimeoutError) as e:
            log("paintings (cma):", q, e)
            continue
        for a in d.get("data") or []:
            imgs = a.get("images") or {}
            img = imgs.get("print") or imgs.get("web") or {}
            creator = clean_text(((a.get("creators") or [{}])[0] or {}).get("description"))
            cult = a.get("culture")
            try:
                w, h = int(img.get("width") or 0), int(img.get("height") or 0)
            except (TypeError, ValueError):
                continue
            out.append({"id": f"cma-{a['id']}", "title": clean_text(a.get("title")), "artist": creator.split(" (")[0].strip(),
                        "about": creator.split(" (", 1)[1].rstrip(")").strip() if " (" in creator else "",
                        "date": clean_text(a.get("creation_date")), "technique": clean_text(a.get("technique")),
                        "culture": clean_text(cult[0] if isinstance(cult, list) and cult else cult), "w": w, "h": h, "src": img.get("url")})
    return out


def museum_aic():
    out = []
    hdr = {"AIC-User-Agent": "linux-tv-launcher"}
    for q in CFG.get("oil_searches") or LANDSCAPE_SEARCHES:
        try:
            d = fetch_json("https://api.artic.edu/api/v1/artworks/search?" + urllib.parse.urlencode({
                "q": q, "limit": 100, "fields": "id,title,artist_display,date_display,date_start,medium_display,image_id,thumbnail,"
                                                  "artwork_type_title,is_public_domain,place_of_origin"}), headers=hdr)
        except (urllib.error.URLError, ValueError, TimeoutError) as e:
            log("paintings (aic):", q, e)
            continue
        iiif = ((d.get("config") or {}).get("iiif_url") or "https://www.artic.edu/iiif/2").rstrip("/")
        for a in d.get("data") or []:
            if not a.get("is_public_domain") or a.get("artwork_type_title") != "Painting" or not a.get("image_id"):
                continue
            th = a.get("thumbnail") or {}
            who = clean_text(a.get("artist_display")).split("\n")
            out.append({"id": f"aic-{a['id']}", "title": clean_text(a.get("title")), "artist": who[0].strip(),
                        "about": who[1].strip() if len(who) > 1 else "", "date": clean_text(a.get("date_display")) or str(a.get("date_start") or ""),
                        "technique": clean_text(a.get("medium_display")), "culture": clean_text(a.get("place_of_origin")),
                        "w": th.get("width") or 0, "h": th.get("height") or 0,
                        "src": f"{iiif}/{a['image_id']}/full/1686,/0/default.jpg"})
    return out


def museum_met():
    """The Met's search gives ids; each object is one more request, so only the first few dozen per
    search are looked at. The painting's size in cm tells its shape without loading the image."""
    out, seen = [], set()
    base = "https://collectionapi.metmuseum.org/public/collection/v1/"
    for q in CFG.get("oil_searches") or LANDSCAPE_SEARCHES:
        try:
            ids = (fetch_json(base + "search?" + urllib.parse.urlencode({
                "hasImages": "true", "medium": "Paintings", "dateBegin": YEARS[0], "dateEnd": YEARS[1], "q": q})) or {}).get("objectIDs") or []
        except (urllib.error.URLError, ValueError, TimeoutError) as e:
            log("paintings (met):", q, e)
            continue
        for oid in ids[:40]:
            if oid in seen:
                continue
            seen.add(oid)
            time.sleep(.05)   # the Met asks for at most 80 requests a second
            try:
                o = fetch_json(base + f"objects/{oid}")
            except (urllib.error.URLError, ValueError, TimeoutError):
                continue
            if not o.get("isPublicDomain") or not o.get("primaryImage"):
                continue
            m = re.search(r"\(([\d.]+)\s*[x×]\s*([\d.]+)\s*cm\)", o.get("dimensions") or "")
            if not m:
                continue
            hgt, wid = float(m.group(1)), float(m.group(2))
            years = "–".join(x for x in (clean_text(o.get("artistBeginDate")), clean_text(o.get("artistEndDate"))) if x)
            out.append({"id": f"met-{oid}", "title": clean_text(o.get("title")), "artist": clean_text(o.get("artistDisplayName")),
                        "about": ", ".join(x for x in (clean_text(o.get("artistNationality")), years) if x),
                        "date": clean_text(o.get("objectDate")), "technique": clean_text(o.get("medium")),
                        "culture": clean_text(o.get("culture")), "w": round(wid * 10), "h": round(hgt * 10),
                        "src": o["primaryImage"], "src_small": o.get("primaryImageSmall")})
    return out


SMK_WORDS = {"dansk": "Danish", "hollandsk": "Dutch", "nederlandsk": "Dutch", "flamsk": "Flemish", "fransk": "French", "tysk": "German",
             "italiensk": "Italian", "engelsk": "English", "britisk": "British", "svensk": "Swedish", "norsk": "Norwegian",
             "belgisk": "Belgian", "schweizisk": "Swiss", "østrigsk": "Austrian", "spansk": "Spanish"}
SMK_MEDIA = {"olie på lærred": "Oil on canvas", "olie på træ": "Oil on panel", "olie på pap": "Oil on cardboard",
             "olie på papir": "Oil on paper", "olie på kobber": "Oil on copper"}


def museum_smk():
    out = []
    for q in CFG.get("smk_searches") or ["landskab", "kyst", "havn", "skov", "vinter", "sø", "bjerg", "hav", "aften", "måneskin", "udsigt", "mølle"]:
        try:
            d = fetch_json("https://api.smk.dk/api/v1/art/search/?" + urllib.parse.urlencode({
                "keys": q, "offset": 0, "rows": 100, "lang": "en", "filters": "[has_image:true],[public_domain:true]"}))
        except (urllib.error.URLError, ValueError, TimeoutError) as e:
            log("paintings (smk):", q, e)
            continue
        for a in d.get("items") or []:
            if not any((n.get("name") or "").lower() == "maleri" for n in a.get("object_names") or []):
                continue
            tech = clean_text((a.get("techniques") or [""])[0])
            titles = a.get("titles") or [{}]
            title = next((t.get("title") for t in titles if (t.get("language") or "").lower() in ("engelsk", "english", "en")), titles[0].get("title"))
            p = (a.get("production") or [{}])[0]
            name = clean_text(p.get("creator"))
            if ", " in name:
                last, first = name.split(", ", 1)
                name = f"{first} {last}"
            life = "–".join(x[:4] for x in (p.get("creator_date_of_birth") or "", p.get("creator_date_of_death") or "") if x)
            nat = SMK_WORDS.get((p.get("creator_nationality") or "").lower(), clean_text(p.get("creator_nationality")))
            per = (a.get("production_date") or [{}])[0]
            src = a.get("image_iiif_id")
            src = f"{src}/full/!2400,2400/0/default.jpg" if src else a.get("image_native") or a.get("image_thumbnail")
            out.append({"id": f"smk-{a.get('object_number')}", "title": clean_text(title), "artist": name,
                        "about": ", ".join(x for x in (nat, life) if x), "date": clean_text(per.get("period")) or (per.get("start") or "")[:4],
                        "technique": SMK_MEDIA.get(tech.lower(), tech.replace("Olie", "Oil")), "culture": nat,
                        "w": a.get("image_width") or 0, "h": a.get("image_height") or 0, "src": src})
    return out


def museum_mia():
    """Minneapolis Institute of Art: its search (Elasticsearch, no key) and its IIIF image server."""
    out = []
    for q in CFG.get("oil_searches") or LANDSCAPE_SEARCHES:
        try:
            d = fetch_json("https://search.artsmia.org/" + urllib.parse.quote(
                f'{q} classification:Paintings public_access:1 rights_type:"Public Domain"') + "?size=100")
        except (urllib.error.URLError, ValueError, TimeoutError) as e:
            log("paintings (mia):", q, e)
            continue
        for h in ((d.get("hits") or {}).get("hits") or []):
            a = h.get("_source") or {}
            oid = a.get("id") or h.get("_id")
            if not oid or a.get("image") != "valid" or a.get("restricted"):
                continue
            out.append({"id": f"mia-{oid}", "title": clean_text(a.get("title")), "artist": clean_text(a.get("artist")).split(";")[0].strip(),
                        "about": clean_text(a.get("life_date")), "date": clean_text(a.get("dated")), "technique": clean_text(a.get("medium")),
                        "culture": clean_text(a.get("nationality")), "w": int(a.get("image_width") or 0), "h": int(a.get("image_height") or 0),
                        "src": f"https://1.api.artsmia.org/full/{oid}.jpg",
                        "src_small": f"https://1.api.artsmia.org/{oid}.jpg"})
    return out


def museum_harvard():
    key = (CFG.get("harvard_key") or "").strip()
    if not key:
        return []
    out = []
    for q in CFG.get("oil_searches") or LANDSCAPE_SEARCHES:
        try:
            d = fetch_json("https://api.harvardartmuseums.org/object?" + urllib.parse.urlencode({
                "apikey": key, "classification": "Paintings", "q": q, "hasimage": 1, "size": 100,
                "fields": "id,title,dated,medium,culture,people,images,imagepermissionlevel"}))
        except (urllib.error.URLError, ValueError, TimeoutError) as e:
            log("paintings (harvard):", q, e)
            continue
        for a in d.get("records") or []:
            img = (a.get("images") or [{}])[0] or {}
            if a.get("imagepermissionlevel") != 0 or not img.get("baseimageurl"):
                continue
            who = (a.get("people") or [{}])[0] or {}
            out.append({"id": f"harvard-{a['id']}", "title": clean_text(a.get("title")), "artist": clean_text(who.get("name")),
                        "about": ", ".join(x for x in (clean_text(who.get("culture")), clean_text(who.get("displaydate"))) if x),
                        "date": clean_text(a.get("dated")), "technique": clean_text(a.get("medium")), "culture": clean_text(a.get("culture")),
                        "w": img.get("width") or 0, "h": img.get("height") or 0, "src": img["baseimageurl"] + "?width=2400"})
    return out


def museum_rijks():
    key = (CFG.get("rijksmuseum_key") or "").strip()
    if not key:
        return []
    out = []
    for q in CFG.get("rijks_searches") or ["landschap", "rivier", "zee", "winter", "duinen", "kust", "stad", "maan", "molen", "bos"]:
        try:
            d = fetch_json("https://www.rijksmuseum.nl/api/en/collection?" + urllib.parse.urlencode({
                "key": key, "q": q, "type": "painting", "imgonly": "true", "ps": 100, "culture": "en"}))
        except (urllib.error.URLError, ValueError, TimeoutError) as e:
            log("paintings (rijks):", q, e)
            continue
        for a in d.get("artObjects") or []:
            img = a.get("webImage") or {}
            if not a.get("permitDownload") or not img.get("url"):
                continue
            long = clean_text(a.get("longTitle"))
            out.append({"id": f"rijks-{a.get('objectNumber')}", "title": clean_text(a.get("title")), "artist": clean_text(a.get("principalOrFirstMaker")),
                        "about": "", "date": long.rsplit(", ", 1)[-1] if ", " in long else "", "technique": "Oil on canvas",
                        "culture": "", "w": img.get("width") or 0, "h": img.get("height") or 0, "src": img["url"]})
    return out


MUSEUMS = {"cma": (museum_cma, 7), "aic": (museum_aic, 7), "met": (museum_met, 7), "mia": (museum_mia, 7), "smk": (museum_smk, 7),
           "rijks": (museum_rijks, 7), "harvard": (museum_harvard, 7)}
REJECTED_FILE = STATE / "paintings-rejected.json"


def rejected_paintings():
    try:
        return set(json.loads(REJECTED_FILE.read_text()))
    except (OSError, ValueError):
        return set()


def reject_painting(body):
    """The home page found a frame in this one: never show it again."""
    pid = str((body or {}).get("id") or "")
    if not re.fullmatch(r"[a-z]+-[\w.-]{1,80}", pid):
        raise ValueError("bad painting id")
    ids = rejected_paintings() | {pid}
    REJECTED_FILE.write_text(json.dumps(sorted(ids)))
    log("paintings: left out", pid, "(" + str((body or {}).get("reason") or "frame") + ")")
    return len(ids)
museum_busy = set()


def museum_refresh(key):
    fn, _ = MUSEUMS[key]
    try:
        raw = fn()
        seen, items = set(), []
        for it in raw:
            if it["id"] not in seen and keep_painting(it):
                seen.add(it["id"])
                items.append({**it, "museum": MUSEUM_NAMES[key]})
        if items or not raw:
            (STATE / f"paintings-{key}.json").write_text(json.dumps({"at": time.time(), "items": items}))
        log(f"paintings: {len(items)} from {MUSEUM_NAMES[key]}")
    except Exception as e:  # noqa: BLE001
        log(f"paintings: {MUSEUM_NAMES[key]} failed:", e)
    finally:
        museum_busy.discard(key)


def painting_lists():
    """{museum: [paintings]} from the saved files; stale or missing museums refresh in the background
    (Cleveland right away when there's nothing at all yet, so the first start has something)."""
    lists = {}
    for key, (_, days) in MUSEUMS.items():
        if key not in (CFG.get("museums") or MUSEUMS):
            continue
        path = STATE / f"paintings-{key}.json"
        saved = {}
        try:
            saved = json.loads(path.read_text())
        except (OSError, ValueError):
            pass
        if saved.get("items"):
            gone = rejected_paintings()
            lists[key] = [x for x in saved["items"] if x["id"] not in gone]
        if time.time() - saved.get("at", 0) > days * 86400 and key not in museum_busy:
            museum_busy.add(key)
            threading.Thread(target=museum_refresh, args=(key,), daemon=True).start()
    if not lists and "cma" in museum_busy:
        # first start: wait for Cleveland (quick) rather than show nothing
        for _ in range(60):
            time.sleep(1)
            try:
                items = json.loads((STATE / "paintings-cma.json").read_text()).get("items")
            except (OSError, ValueError):
                items = None
            if items:
                lists["cma"] = items
                break
    return lists


def painting_list():
    return [it for items in painting_lists().values() for it in items]


painting_prefetched = set()


def paintings():
    """This hour's paintings: 50, drawn a fresh each hour, the museums taking turns (so no one
    collection crowds out the others). Their images are fetched in the background."""
    lists = painting_lists()
    if not lists:
        return {"paintings": [], "notice": "Loading paintings from the museums…"}
    hour = int(time.time() // 3600)
    rnd = random.Random(hour)
    piles = []
    for key in sorted(lists):
        pile = list(lists[key])
        rnd.shuffle(pile)
        piles.append(pile)
    rnd.shuffle(piles)
    order = [x for group in itertools.zip_longest(*piles) for x in group if x]
    pick = order[:CFG.get("paintings_per_hour", PAINTINGS_PER_HOUR)]
    rnd.shuffle(pick)
    if hour not in painting_prefetched:
        painting_prefetched.add(hour)

        def prefetch():
            for it in pick:
                try:
                    painting_file(it["id"])
                except Exception as e:  # noqa: BLE001
                    log("painting prefetch:", it["id"], e)
        threading.Thread(target=prefetch, daemon=True).start()
    return {"hour": hour, "paintings": [{**{k: v for k, v in it.items() if not k.startswith("src")},
                                         "url": f"/api/painting/{urllib.parse.quote(it['id'])}.jpg",
                                         "source": it.get("museum", "")} for it in pick]}


def painting_file(pid):
    pid = str(pid)
    if not re.fullmatch(r"[a-z]+-[\w.-]{1,80}", pid):
        raise KeyError("bad painting id")
    path = PAINTING_DIR / f"{pid}.jpg"
    if not path.exists():
        item = next((x for x in painting_list() if x["id"] == pid), None)
        if not item:
            raise KeyError(f"no painting {pid}")
        PAINTING_DIR.mkdir(parents=True, exist_ok=True)
        try:
            data = fetch(item["src"], timeout=90, limit=40_000_000)
        except (urllib.error.URLError, ValueError, TimeoutError):
            if not item.get("src_small"):
                raise
            data = fetch(item["src_small"], timeout=60, limit=40_000_000)
        tmp = path.with_suffix(".part")
        tmp.write_bytes(data)
        tmp.replace(path)
        # keep the folder small: only the most recently used images
        files = sorted(PAINTING_DIR.glob("*.jpg"), key=lambda f: f.stat().st_atime, reverse=True)
        for old in files[PAINTING_KEEP:]:
            old.unlink(missing_ok=True)
    os.utime(path)
    return path.read_bytes()




UNSPLASH_QUERIES = ["mountain landscape", "alpine lake", "aerial coastline", "misty forest", "starry night sky landscape",
                    "desert dunes", "fjord", "autumn valley", "glacier", "volcanic landscape", "rolling hills", "northern lights"]


def unsplash_photos(key):
    """Wallpaper-grade landscapes: a few searches (different ones each hour), only wide, very large
    photos, the most liked first. "unsplash_queries" in config.json replaces the searches."""
    queries = CFG.get("unsplash_queries") or UNSPLASH_QUERIES
    hour = int(time.time() // 3600)
    picks = [queries[(hour * 3 + k) % len(queries)] for k in range(3)]
    headers = {"Authorization": f"Client-ID {key}", "Accept-Version": "v1"}
    utm = "utm_source=linux_tv_launcher&utm_medium=referral"
    found, seen = [], set()
    for q in picks:
        d = fetch_json("https://api.unsplash.com/search/photos?" + urllib.parse.urlencode(
            {"query": q, "orientation": "landscape", "per_page": 30, "page": 1 + hour % 3, "order_by": "relevant",
             "content_filter": "high", "client_id": key}), headers=headers)
        for ph in (d or {}).get("results") or []:
            w, h = ph.get("width") or 0, ph.get("height") or 1
            if ph.get("id") in seen or w < 4000 or w / h < 1.4:
                continue
            seen.add(ph.get("id"))
            found.append(ph)
    found.sort(key=lambda ph: -(ph.get("likes") or 0))
    photos = []
    for ph in found[:40]:
        urls, user = ph.get("urls") or {}, ph.get("user") or {}
        src = urls.get("raw") or urls.get("full") or urls.get("regular")
        if not src:
            continue
        title = ph.get("description") or ph.get("alt_description") or ""
        photos.append({
            "url": src + ("&" if "?" in src else "?") + "w=3840&q=82&fm=jpg&fit=max",
            "title": title[:1].upper() + title[1:] if title and title != "null" else "",
            "place": clean_text((ph.get("location") or {}).get("name")),
            "author": clean_text(user.get("name")),
            "author_url": f"{(user.get('links') or {}).get('html', 'https://unsplash.com')}?{utm}",
            "source": "Unsplash",
        })
    log("screensaver:", len(photos), "photos from Unsplash for", ", ".join(picks))
    return photos


# ---------------------------------------------------------------- photos instead of paintings

screensaver_cache = {}


def screensaver_photos():
    """Landscape photos from Unsplash ("home_art": "photos", needs unsplash_access_key).

    Returns {"photos": [...], "notice": why there are none, if there are none}."""
    key = (CFG.get("unsplash_access_key") or "").strip()
    if not key:
        return {"photos": [], "notice": "Add unsplash_access_key to config.json for photos"}
    with lock:
        hit = screensaver_cache.get(key)
    if hit and time.time() - hit[0] < hit[2]:
        return hit[1]
    photos, notice = [], ""
    try:
        photos = unsplash_photos(key)
        if not photos:
            notice = "Unsplash returned no photos for the searches"
    except urllib.error.HTTPError as e:
        notice = f"Unsplash refused the request ({e.code}): {e.read()[:300].decode('utf-8', 'replace')}"
    except (urllib.error.URLError, ValueError, TimeoutError) as e:
        notice = f"Couldn't reach Unsplash: {e}"
    if notice:
        log("photos:", notice)
    result = {"photos": photos, "notice": notice}
    with lock:
        # Photos are kept for an hour; a failure only for a few minutes, so a fix shows up quickly.
        screensaver_cache[key] = (time.time(), result, 3600 if not notice else 300)
    return result


# ---------------------------------------------------------------- launching

current = None


def firefox_bin():
    # Resolve to a real executable, skipping "." in PATH.
    name = CFG.get("firefox", "firefox")
    return shutil.which(name, path=os.pathsep.join(
        d for d in os.environ.get("PATH", "").split(os.pathsep) if d and d != ".")) or name


def firefox_cmd(url):
    # Your everyday Firefox: if it's already open this becomes a new window in it. If it isn't
    # running yet it starts with the app id "tvapp", which the i3/Hyprland rules put full screen.
    # "firefox_profile" picks a profile folder; by default Firefox uses its own default one.
    chosen = CFG.get("firefox_profile")
    return [firefox_bin(), *(["--profile", str(Path(chosen).expanduser())] if chosen else []),
            "--class", "tvapp", "--name", "tvapp", "--new-window", url]


def launch(req):
    entry = next((a for a in load_apps() if a["id"] == req.get("id")), None)
    if not entry:
        raise ValueError("unknown app")
    if entry.get("cmd"):
        spawn(entry["cmd"])
        return " ".join(entry["cmd"])
    open_in_firefox(entry["url"])
    return f"firefox · {entry['url']}"


APP_WINDOW = STATE / "app-window"  # Hyprland address of the Firefox window the launcher last opened


def open_in_firefox(url):
    # Your own Firefox isn't the launcher's to kill when the next app opens (replace=False), and the
    # process started here often just hands the URL to the Firefox that's already running and exits.
    before = {c["address"] for c in hypr_clients() if c.get("class") in FIREFOX_CLASSES}
    spawn(firefox_cmd(url), replace=False)
    threading.Thread(target=fullscreen_new_firefox, args=(before,), daemon=True).start()


def hypr_clients():
    if not os.environ.get("HYPRLAND_INSTANCE_SIGNATURE") or not shutil.which("hyprctl"):
        return []
    try:
        return json.loads(hyprctl("clients", "-j") or "[]")
    except (ValueError, OSError, subprocess.SubprocessError):
        return []


FIREFOX_CLASSES = ("firefox", "tvapp")


def fullscreen_new_firefox(before, wait=15.0):
    """Hyprland: put the new Firefox window full screen (Firefox's own, like F11) and note its address
    so the Home key (scripts/home.sh) can close just that window. A Firefox started by the launcher is
    "tvapp" and already full screen by the window rule; one that was already running opens the window
    as "firefox", which the rule doesn't cover."""
    if not os.environ.get("HYPRLAND_INSTANCE_SIGNATURE"):
        return
    end = time.time() + wait
    while time.time() < end:
        new = [c for c in hypr_clients() if c.get("class") in FIREFOX_CLASSES and c["address"] not in before]
        if new:
            sel = f"address:{new[0]['address']}"
            hyprctl("dispatch", f'hl.dsp.window.fullscreen_state({{ internal = 2, client = 2, action = "set", window = "{sel}" }})')
            hyprctl("dispatch", f'hl.dsp.focus({{ window = "{sel}" }})')
            APP_WINDOW.write_text(new[0]["address"])
            return
        time.sleep(0.25)


def close_current():
    global current
    if current and current.poll() is None:
        current.terminate()
        try:
            current.wait(2)
        except subprocess.TimeoutExpired:
            current.kill()
            try:
                current.wait(2)
            except subprocess.TimeoutExpired:
                pass
    current = None


def profile_free(cmd, wait=6.0):
    """Firefox won't open a profile another Firefox still holds: wait for the last app's lock to go."""
    if "--profile" not in cmd:
        return
    lock_file = Path(cmd[cmd.index("--profile") + 1]) / "lock"
    end = time.time() + wait
    while time.time() < end and (lock_file.is_symlink() or lock_file.exists()):
        # The lock names the Firefox holding it ("host:+pid"); a lock left by a closed one doesn't count.
        try:
            pid = int(os.readlink(lock_file).rsplit("+", 1)[-1])
            os.kill(pid, 0)
        except (OSError, ValueError):
            return
        time.sleep(0.1)


def spawn(cmd, replace=True):
    global current
    if replace:
        close_current()
        profile_free(cmd)
    log("launch:", " ".join(cmd))
    proc = subprocess.Popen(cmd, stdin=DEVNULL, stdout=DEVNULL, stderr=DEVNULL, start_new_session=True)
    if replace:
        current = proc
    return proc



# ---------------------------------------------------------------- your apps
# Kept in ~/.config/linux-tv-launcher/apps.json and edited from the home screen (Edit apps).
# Each app opens a website in Firefox ("url") or runs a command ("cmd", a list of arguments).
# Its icon is, in order: an image you uploaded in the editor (icons/<id>.img), "icon" (an image
# address, a file path or an icon-theme name), or one found by itself (the site's own icon, or
# the program's icon from your icon theme).

DEFAULT_APPS = [
    {"id": "youtube", "name": "YouTube", "about": "Videos & subscriptions", "url": "https://www.youtube.com"},
    {"id": "youtube-music", "name": "YouTube Music", "about": "Music", "url": "https://music.youtube.com"},
]
MAX_APPS = 40
MAX_ICON_BYTES = 2_000_000
ICON_TYPES = ("image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/x-icon")
APP_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,39}")
apps_lock = threading.Lock()


def load_apps():
    apps = read_json(APPS_FILE, None)
    if not isinstance(apps, list):
        return [dict(a) for a in DEFAULT_APPS]
    try:
        return clean_apps(apps)
    except ValueError as e:
        log(f"{APPS_FILE} has a problem ({e}); using the default apps")
        return [dict(a) for a in DEFAULT_APPS]


def clean_text_field(a, key, limit, required=False):
    v = " ".join(str(a.get(key) or "").split())
    if required and not v:
        raise ValueError(f"an app needs a {key}")
    if len(v) > limit:
        raise ValueError(f"{key} is longer than {limit} characters")
    return v


def clean_app(a):
    if not isinstance(a, dict):
        raise ValueError("each app must be an object")
    ident = str(a.get("id") or "")
    if not APP_ID.fullmatch(ident):
        raise ValueError(f"bad app id {ident!r}")
    out = {"id": ident, "name": clean_text_field(a, "name", 40, required=True)}
    if about := clean_text_field(a, "about", 60):
        out["about"] = about
    url, cmd = str(a.get("url") or "").strip(), a.get("cmd")
    if isinstance(cmd, str):
        try:
            cmd = shlex.split(cmd)
        except ValueError as e:
            raise ValueError(f"{out['name']}: can't read the command ({e})") from None
    if url and cmd:
        raise ValueError(f"{out['name']}: give a website or a command, not both")
    if url:
        if not url.startswith(("https://", "http://")) or not host_of(url) or len(url) > 2000:
            raise ValueError(f"{out['name']}: the website must start with https:// or http://")
        out["url"] = url
    elif cmd:
        if not isinstance(cmd, list) or len(cmd) > 50 or not all(isinstance(c, str) and 0 < len(c) <= 1000 for c in cmd):
            raise ValueError(f"{out['name']}: bad command")
        out["cmd"] = cmd
    else:
        raise ValueError(f"{out['name']}: give it a website or a command")
    if icon := str(a.get("icon") or "").strip():
        if len(icon) > 2000:
            raise ValueError(f"{out['name']}: the icon address is too long")
        out["icon"] = icon
    return out


def clean_apps(apps):
    if not isinstance(apps, list) or len(apps) > MAX_APPS:
        raise ValueError(f"apps must be a list of at most {MAX_APPS}")
    out = [clean_app(a) for a in apps]
    if len({a["id"] for a in out}) != len(out):
        raise ValueError("two apps have the same id")
    return out


def upload_path(ident):
    return UPLOAD_DIR / f"{ident}.img"


def public_app(a):
    """What the UI gets: the app plus a version for its icon, so a changed icon is fetched again."""
    up = upload_path(a["id"])
    stamp = up.stat().st_mtime_ns if up.exists() else 0
    v = hashlib.sha1(json.dumps([a.get("icon"), a.get("url"), a.get("cmd"), stamp]).encode()).hexdigest()[:10]
    return {**a, "icon_v": v, "uploaded": bool(stamp)}


def save_apps(apps):
    apps = clean_apps(apps)
    with apps_lock:
        write_json(APPS_FILE, apps)
        keep = {a["id"] for a in apps}
        for f in UPLOAD_DIR.glob("*.img") if UPLOAD_DIR.exists() else []:
            if f.stem not in keep:
                f.unlink(missing_ok=True)
    return [public_app(a) for a in apps]


def set_app_icon(body):
    """{"id", "data": base64 image} stores an uploaded icon for that app; "data": null removes it."""
    ident = str(body.get("id") or "")
    if not any(a["id"] == ident for a in load_apps()):
        raise ValueError("save the app before giving it an icon")
    path = upload_path(ident)
    if body.get("data") is None:
        path.unlink(missing_ok=True)
    else:
        data = base64.b64decode(str(body["data"]), validate=True)
        if len(data) > MAX_ICON_BYTES:
            raise ValueError("that image is over 2 MB")
        if image_type(data) not in ICON_TYPES:
            raise ValueError("that isn't a PNG, JPEG, WebP, GIF, SVG or ICO image")
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        tmp.write_bytes(data)
        tmp.replace(path)
    return [public_app(a) for a in load_apps()]


def app_icon(ident):
    """Icon bytes for an app: your upload, else found (and cached in the state folder). None if there isn't one."""
    entry = next((a for a in load_apps() if a["id"] == ident), None)
    if not entry:
        raise KeyError("unknown app")
    up = upload_path(ident)
    if up.exists():
        return up.read_bytes()
    key = hashlib.sha1(json.dumps([entry.get("icon"), entry.get("url"), entry.get("cmd")]).encode()).hexdigest()[:10]
    return cached_image(f"app-{ident}-{key}", lambda: find_icon(entry))


# ---------------------------------------------------------------- app icons

ICON_ROOTS = [Path("/var/lib/flatpak/exports/share/icons/hicolor"),
              Path.home() / ".local/share/flatpak/exports/share/icons/hicolor",
              Path.home() / ".local/share/icons/hicolor", Path("/usr/share/icons/hicolor")]
IMAGE_MAGIC = ((b"\x89PNG", "image/png"), (b"\xff\xd8", "image/jpeg"), (b"GIF8", "image/gif"),
               (b"\x00\x00\x01\x00", "image/x-icon"))


def image_type(data):
    for magic, ctype in IMAGE_MAGIC:
        if data.startswith(magic):
            return ctype
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    head = data[:3000].lstrip().lower()
    if head.startswith(b"<svg") or (head.startswith((b"<?xml", b"<!--", b"<!doctype svg")) and b"<svg" in head):
        return "image/svg+xml"
    return None


def local_icon(name):
    """An installed app's icon from the icon theme (Flatpak exports included), biggest first."""
    best = None
    for root in ICON_ROOTS:
        for f in root.glob(f"*/apps/{name}.*"):
            if f.suffix not in (".png", ".svg"):
                continue
            size_dir = f.parent.parent.name
            size = 4096 if size_dir == "scalable" else int(re.match(r"\d+", size_dir)[0]) if re.match(r"\d+", size_dir) else 0
            if best is None or size > best[0]:
                best = (size, f)
    if best:
        return best[1]
    for ext in ("svg", "png"):
        f = Path("/usr/share/pixmaps") / f"{name}.{ext}"
        if f.exists():
            return f
    return None


class IconLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "link":
            a = dict(attrs)
            rel = (a.get("rel") or "").lower().split()
            if a.get("href") and {"icon", "apple-touch-icon", "apple-touch-icon-precomposed", "manifest"} & set(rel):
                self.links.append((rel, a["href"], (a.get("sizes") or "").lower()))


def icon_size(sizes, href, rel=()):
    if "any" in sizes or href.lower().split("?")[0].endswith(".svg"):
        return 512
    nums = [int(n) for n in re.findall(r"(\d+)x\d+", sizes)]
    if nums:
        return max(nums)
    return 180 if any(r.startswith("apple-touch-icon") for r in rel) else 16


def site_icon_candidates(url):
    """Icon URLs a site declares (link tags and web manifest), biggest first, then common fallbacks."""
    u = urllib.parse.urlparse(url)
    root = f"{u.scheme}://{u.netloc}/"
    found = []
    for page in dict.fromkeys([url, root]):
        try:
            html = fetch(page, headers=BROWSER_UA, limit=2_000_000).decode("utf-8", "replace")
        except (urllib.error.URLError, ValueError, TimeoutError) as e:
            log("icon: couldn't read", page, e)
            continue
        parser = IconLinks()
        parser.feed(html)
        for rel, href, sizes in parser.links:
            href = urllib.parse.urljoin(page, href)
            if "manifest" in rel:
                try:
                    manifest = json.loads(fetch(href, headers=BROWSER_UA, limit=300_000))
                    for ic in manifest.get("icons", []):
                        if ic.get("src"):
                            found.append((icon_size(str(ic.get("sizes", "")).lower(), ic["src"]),
                                          urllib.parse.urljoin(href, ic["src"])))
                except (urllib.error.URLError, ValueError, TimeoutError, AttributeError):
                    pass
            else:
                found.append((icon_size(sizes, href, rel), href))
        if found:
            break
    found.sort(key=lambda c: -c[0])
    return [h for _, h in found] + [root + "apple-touch-icon.png",
                                    f"https://www.google.com/s2/favicons?domain={u.hostname}&sz=128"]


def play_icon(package):
    """The app's icon from its Google Play page (the og:image), 512 px."""
    try:
        html = fetch("https://play.google.com/store/apps/details?" + urllib.parse.urlencode({"id": package, "hl": "en"}),
                     headers=BROWSER_UA, limit=3_000_000).decode("utf-8", "replace")
    except (urllib.error.URLError, ValueError, TimeoutError) as e:
        log("icon: Google Play page failed for", package, e)
        return None
    m = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', html) or re.search(r'content="([^"]+)"[^>]+property="og:image"', html)
    return sized_play_icon(m[1]) if m else None


def sized_play_icon(url):
    """play-lh.googleusercontent.com URLs take their size after '='; ask for a square 512 px one."""
    if "googleusercontent.com" in url:
        url = url.split("=")[0] + "=s512"
    return url


def find_icon(entry):
    icon = entry.get("icon")
    url = entry.get("url", "")
    cmd = entry.get("cmd") or []
    if icon and icon.startswith(("http://", "https://")):
        sources = [sized_play_icon(icon)]
    elif entry.get("play"):
        sources = [u for u in [play_icon(entry["play"])] if u]
    else:
        f = None
        if icon:
            f = Path(icon).expanduser() if "/" in icon else local_icon(icon)
        elif cmd[:2] == ["flatpak", "run"]:
            app_id = next((a for a in cmd[2:] if not a.startswith("-")), None)
            f = local_icon(app_id) if app_id else None
        elif cmd:
            f = local_icon(Path(cmd[0]).name)
        elif url.startswith("about:"):
            f = local_icon(Path(firefox_bin()).name) or local_icon("firefox")
        if f and f.is_file():
            return f.read_bytes()
        sources = site_icon_candidates(url) if url.startswith(("http://", "https://")) else []
    for src in sources:
        try:
            data = fetch(src, headers=BROWSER_UA, limit=3_000_000)
        except (urllib.error.URLError, ValueError, TimeoutError):
            continue
        if image_type(data):
            return data
    return None



def cached_image(name, finder):
    """Image bytes from finder(), cached on disk; a miss is remembered for a day."""
    path = ICON_DIR / f"{name}.img"
    miss = path.with_suffix(".none")
    if path.exists():
        return path.read_bytes()
    if miss.exists() and time.time() - miss.stat().st_mtime < 86400:
        return None
    ICON_DIR.mkdir(exist_ok=True)
    data = finder()
    if data:
        path.write_bytes(data)
        miss.unlink(missing_ok=True)
    else:
        log("icon: none found for", name)
        miss.touch()
    return data



# ---------------------------------------------------------------- HTTP

def home():
    return {
        "apps": [public_app(a) for a in load_apps()],
        "home_art": CFG.get("home_art", "paintings"),
        "painting_seconds": CFG.get("painting_seconds", 72),
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_image(self, data, ctype, max_age=None):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        # Uploaded SVGs are served from the UI's own origin: never let one run as a page.
        self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
        self.send_header("X-Content-Type-Options", "nosniff")
        if max_age:
            self.send_header("Cache-Control", f"max-age={max_age}")
        self.end_headers()
        self.wfile.write(data)

    def host_ok(self):
        # Refuse requests addressed to other names (DNS rebinding).
        return self.headers.get("Host", "") in (f"127.0.0.1:{PORT}", f"localhost:{PORT}")

    def read_body(self, limit=1_000_000):
        n = int(self.headers.get("Content-Length") or 0)
        if n > limit:
            raise ValueError("request too large")
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        if not self.host_ok():
            return self.send_json({"error": "bad host"}, 403)
        u = urllib.parse.urlparse(self.path)
        try:
            if u.path == "/api/ping":
                return self.send_json({"ok": True})
            if u.path == "/api/home":
                return self.send_json(home())
            if u.path == "/api/weather":
                return self.send_json(weather())
            if u.path == "/api/nowplaying":
                return self.send_json({"playing": now_playing()})
            if u.path == "/api/nowplaying/art":
                data, ctype = nowplaying_art_file()
                return self.send_image(data, ctype, 3600)
            if u.path == "/api/screensaver":
                return self.send_json(screensaver_photos())
            if u.path == "/api/paintings":
                return self.send_json(paintings())
            if u.path.startswith("/api/painting/"):
                data = painting_file(urllib.parse.unquote(u.path.rsplit("/", 1)[1]).removesuffix(".jpg"))
                return self.send_image(data, "image/jpeg", 31536000)
            if u.path.startswith("/api/icon/app/"):
                data = app_icon(urllib.parse.unquote(u.path.rsplit("/", 1)[1]))
                if not data:
                    return self.send_json({"error": "no icon"}, 404)
                return self.send_image(data, image_type(data))
        except (ValueError, KeyError) as e:
            return self.send_json({"error": str(e)}, 400)
        except Exception as e:  # noqa: BLE001
            log("GET", u.path, "failed:", e)
            return self.send_json({"error": str(e)}, 502)
        if u.path.startswith("/api/"):
            return self.send_json({"error": "not found"}, 404)
        return super().do_GET()

    def do_POST(self):
        # The custom header forces a CORS preflight, which this server never approves,
        # so web pages open in the browser can't launch, add or change apps.
        if not self.host_ok() or self.headers.get("X-TV-Launcher") != "1":
            return self.send_json({"error": "forbidden"}, 403)
        path = urllib.parse.urlparse(self.path).path
        try:
            if path == "/api/launch":
                return self.send_json({"ok": True, "message": launch(self.read_body())})
            if path == "/api/apps":
                return self.send_json({"apps": save_apps(self.read_body().get("apps"))})
            if path == "/api/apps/icon":
                return self.send_json({"apps": set_app_icon(self.read_body(limit=4 * MAX_ICON_BYTES))})
            if path == "/api/painting/reject":
                return self.send_json({"ok": True, "rejected": reject_painting(self.read_body())})
            if path == "/api/nowplaying":
                return self.send_json({"playing": nowplaying_control(self.read_body())})
        except (ValueError, KeyError, TypeError) as e:
            return self.send_json({"error": str(e)}, 400)
        except OSError as e:
            return self.send_json({"error": f"couldn't start it: {e}"}, 500)
        return self.send_json({"error": "not found"}, 404)


# ---------------------------------------------------------------- back to the launcher (Hyprland)

def hyprctl(*args):
    return subprocess.run(["hyprctl", *args], capture_output=True, text=True, timeout=5).stdout


def restore_launcher():
    """Only one window per workspace can be full screen, so an app opening takes it from the launcher.
    Once the app's last window has closed, give it back."""
    clients = json.loads(hyprctl("clients", "-j") or "[]")
    ui = next((c for c in clients if c.get("class") == "tvlauncher"), None)
    if not ui:
        return
    others = [c for c in clients if c is not ui and c.get("workspace", {}).get("id") == ui.get("workspace", {}).get("id")]
    if others:
        return
    sel = f"address:{ui['address']}"
    hyprctl("dispatch", f'hl.dsp.focus({{ window = "{sel}" }})')
    if ui.get("fullscreen") != 2:
        hyprctl("dispatch", f'hl.dsp.window.fullscreen({{ mode = "fullscreen", action = "set", window = "{sel}" }})')
        log("launcher back to full screen")


def hyprland_watcher():
    sig = os.environ.get("HYPRLAND_INSTANCE_SIGNATURE")
    if not sig or not shutil.which("hyprctl"):
        return  # i3 and others keep the launcher full screen on their own
    path = Path(os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")) / "hypr" / sig / ".socket2.sock"
    while True:
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
                sock.connect(str(path))
                buf = b""
                while chunk := sock.recv(4096):
                    buf += chunk
                    *lines, buf = buf.split(b"\n")
                    if any(line.startswith(b"closewindow>>") for line in lines):
                        time.sleep(0.3)  # let Hyprland finish closing it
                        restore_launcher()
        except (OSError, ValueError, subprocess.SubprocessError) as e:
            log("hyprland events:", e)
        time.sleep(5)


def main():
    os.chdir(Path.home())  # so launched apps never resolve names against this folder
    threading.Thread(target=hyprland_watcher, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    log(f"linux-tv-launcher on http://127.0.0.1:{PORT}  (apps in {APPS_FILE}, state in {STATE})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
