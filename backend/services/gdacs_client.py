import os
import json
import asyncio
import time
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Optional
import httpx
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from services.myanmar_live_service import fetch_live_myanmar_disasters

GDACS_RSS_URL = "https://www.gdacs.org/xml/rss.xml"
GDACS_GEOJSON_URL = "https://www.gdacs.org/xml/gdacs.geojson"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, "cache")
CACHE_FILE = os.path.join(CACHE_DIR, "gdacs_cache.json")

# Live real-time operations only - historical mock list removed
MYANMAR_OPERATIONAL_DISASTERS: List[Dict[str, Any]] = []
INITIAL_FALLBACK_DISASTERS: List[Dict[str, Any]] = []


def parse_gdacs_pubdate(pub_date_str: str) -> str:
    """
    Parses various GDACS date string formats into a standardized string (YYYY-MM-DD HH:MM:SS UTC).
    """
    if not pub_date_str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    try:
        dt = parsedate_to_datetime(pub_date_str)
        if dt:
            return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    except Exception:
        pass

    try:
        clean_str = pub_date_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_str)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    except Exception:
        pass

    return pub_date_str


def format_gdacs_title(raw_title: str, country_str: str = "") -> str:
    """
    Cleans up GDACS disaster titles.
    """
    if not raw_title:
        return "Active Disaster Alert"

    clean = raw_title.strip()

    if "(" in clean and ")" in clean:
        prefix = clean.split("(")[0].strip()
        if "," in clean and len(clean) > 40:
            clean = prefix

    if "." in clean:
        clean = clean.split(".")[0].strip()

    if "," in clean and clean.count(",") >= 3:
        if " in " in clean:
            parts = clean.split(" in ")
            event_name = parts[0].strip()
            first_countries = [c.strip() for c in parts[1].split(",") if c.strip()][:3]
            clean = f"{event_name} in {', '.join(first_countries)} (+more regions)"
        else:
            first_countries = [c.strip() for c in clean.split(",") if c.strip()][:3]
            clean = f"{', '.join(first_countries)} (+more regions)"

    if country_str and "," not in country_str and len(country_str) < 40:
        if country_str.lower() not in clean.lower():
            clean = f"{clean} ({country_str.strip()})"

    return clean


_gdacs_cache: List[Dict[str, Any]] = []
_last_fetch_time: float = 0.0
_is_fetching_background: bool = False


def _load_disk_cache() -> Optional[List[Dict[str, Any]]]:
    """Loads cached GDACS disaster data from disk if available."""
    try:
        if os.path.exists(CACHE_FILE):
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list) and len(data) > 0:
                    return data
    except Exception as e:
        print(f"Notice loading disk cache: {e}")
    return None


def _save_disk_cache(data: List[Dict[str, Any]]):
    """Saves cached GDACS disaster data to disk."""
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Notice saving disk cache: {e}")


async def _fetch_from_remote_gdacs() -> List[Dict[str, Any]]:
    """Internal helper to fetch fresh disaster feed from GDACS with fast timeouts."""
    disasters: List[Dict[str, Any]] = []

    # 1. Primary: Try GDACS RSS Feed (fast, lightweight ~950KB) with 4s timeout
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.get(GDACS_RSS_URL)
            if response.status_code == 200:
                root = ET.fromstring(response.content)
                items = root.findall(".//item")

                for item in items:
                    title_elem = item.findtext("title") or "Active Disaster Event"
                    event_type = item.findtext("{http://www.gdacs.org}eventtype") or "General Emergency"
                    country = item.findtext("{http://www.gdacs.org}country") or ""
                    
                    point_str = item.findtext("{http://www.georss.org/georss}point")
                    if not point_str:
                        continue
                    
                    try:
                        parts = point_str.strip().split()
                        lat, lon = float(parts[0]), float(parts[1])
                    except (ValueError, IndexError):
                        continue

                    alert_score = item.findtext("{http://www.gdacs.org}alertscore") or "5.0"
                    try:
                        raw_score = float(alert_score)
                        severity = min(max(round(raw_score * 3.0, 1) if raw_score <= 3.0 else round(raw_score, 1), 1.0), 10.0)
                    except ValueError:
                        severity = 7.0

                    clean_title = format_gdacs_title(title_elem, country)
                    pub_date = item.findtext("pubDate") or item.findtext("pubdate") or ""
                    formatted_date = parse_gdacs_pubdate(pub_date)

                    disasters.append({
                        "title": clean_title,
                        "disaster_type": event_type,
                        "lat": float(lat),
                        "lon": float(lon),
                        "severity": severity,
                        "country": country,
                        "created_at": formatted_date
                    })
    except Exception as e:
        print(f"Notice: Live GDACS RSS feed notice ({str(e)}). Checking GeoJSON fallback.")

    # 2. Secondary: Try GDACS GeoJSON if RSS returned no records
    if not disasters:
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(GDACS_GEOJSON_URL)
                if res.status_code == 200:
                    data = res.json()
                    for feature in data.get("features", []):
                        props = feature.get("properties", {})
                        geom = feature.get("geometry", {})
                        coords = geom.get("coordinates", [])

                        pt_lat: Optional[float] = None
                        pt_lon: Optional[float] = None
                        if geom.get("type") == "Point" and isinstance(coords, list) and len(coords) >= 2:
                            pt_lon, pt_lat = float(coords[0]), float(coords[1])
                        elif props.get("latitude") and props.get("longitude"):
                            pt_lat, pt_lon = float(props["latitude"]), float(props["longitude"])

                        if pt_lat is None or pt_lon is None:
                            continue

                        raw_title = props.get("name") or props.get("eventname") or props.get("title") or "Disaster Alert"
                        country = props.get("country", "")
                        clean_title = format_gdacs_title(raw_title, country)
                        
                        from_date = props.get("fromdate") or props.get("pubdate") or props.get("datemodified") or ""
                        formatted_date = parse_gdacs_pubdate(from_date)

                        event_type = props.get("eventtype") or props.get("type") or "General Emergency"
                        raw_alert_score = props.get("alertscore") or 5.0
                        try:
                            raw_score = float(raw_alert_score)
                            severity = min(max(round(raw_score * 3.0, 1) if raw_score <= 3.0 else round(raw_score, 1), 1.0), 10.0)
                        except (ValueError, TypeError):
                            severity = 7.0

                        disasters.append({
                            "title": clean_title,
                            "disaster_type": event_type,
                            "lat": float(pt_lat),
                            "lon": float(pt_lon),
                            "severity": severity,
                            "country": country,
                            "created_at": formatted_date
                        })
        except Exception as e:
            print(f"Notice: GDACS GeoJSON fallback notice: {e}")

    # 3. Fetch real-time live Myanmar events from USGS Seismological Catalog & Open-Meteo GloFAS
    live_myanmar_events: List[Dict[str, Any]] = []
    try:
        live_myanmar_events = await fetch_live_myanmar_disasters()
    except Exception as e:
        print(f"Notice: Live Myanmar event fetch error: {e}")

    # Prioritize 100% live real-time Myanmar events
    gdacs_myanmar_events = [
        d for d in disasters
        if (9.0 <= d["lat"] <= 29.0 and 92.0 <= d["lon"] <= 102.0) or d.get("country", "").lower() in ["myanmar", "burma"]
    ]

    # Combine live Myanmar sources with deduplication by lat/lon
    seen_myanmar_coords = {f"{round(float(d['lat']), 2)}_{round(float(d['lon']), 2)}" for d in live_myanmar_events}
    for gm in gdacs_myanmar_events:
        key = f"{round(float(gm['lat']), 2)}_{round(float(gm['lon']), 2)}"
        if key not in seen_myanmar_coords:
            live_myanmar_events.append(gm)
            seen_myanmar_coords.add(key)

    # Fallback to curated operational disasters only if no live events are available at all
    if not live_myanmar_events:
        live_myanmar_events = list(MYANMAR_OPERATIONAL_DISASTERS)

    se_asia_events = [
        d for d in disasters
        if (0.0 <= d["lat"] <= 30.0 and 85.0 <= d["lon"] <= 115.0) and d not in gdacs_myanmar_events
    ]
    other_events = [d for d in disasters if d not in gdacs_myanmar_events and d not in se_asia_events]

    sorted_results = live_myanmar_events + se_asia_events + other_events
    return sorted_results


async def _refresh_gdacs_background():
    """Asynchronous background worker to refresh GDACS without blocking user requests."""
    global _gdacs_cache, _last_fetch_time, _is_fetching_background
    if _is_fetching_background:
        return
    _is_fetching_background = True
    try:
        fresh = await _fetch_from_remote_gdacs()
        if fresh:
            _gdacs_cache = fresh
            _last_fetch_time = time.time()
            _save_disk_cache(fresh)
            print(f"[GDACS Cache] Background refreshed with {len(fresh)} active events.")
    except Exception as e:
        print(f"[GDACS Cache] Background refresh error: {e}")
    finally:
        _is_fetching_background = False


async def fetch_active_disasters() -> List[Dict[str, Any]]:
    """
    Fetches active global & regional disaster alerts with sub-millisecond Stale-While-Revalidate caching.
    Always returns immediate results (memory/disk cache or instant fallback), refreshing in background if stale.
    """
    global _gdacs_cache, _last_fetch_time
    now = time.time()

    # 1. Warm memory cache from disk if empty
    if not _gdacs_cache:
        disk_data = _load_disk_cache()
        if disk_data:
            _gdacs_cache = disk_data
            _last_fetch_time = now - 60
        else:
            try:
                fresh = await _fetch_from_remote_gdacs()
                if fresh:
                    _gdacs_cache = fresh
                    _last_fetch_time = now
                    _save_disk_cache(fresh)
            except Exception as e:
                print(f"[GDACS Cache] Initial fetch note: {e}")
                _gdacs_cache = list(INITIAL_FALLBACK_DISASTERS)
                _last_fetch_time = 0.0

    # 2. Check if cache is stale (>300 seconds); trigger non-blocking background refresh
    if now - _last_fetch_time >= 300:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_refresh_gdacs_background())
        except RuntimeError:
            pass

    return _gdacs_cache

