import asyncio
import time
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import httpx

# Bounding box for Myanmar (Burma)
MYANMAR_BBOX = {
    "minlatitude": 9.5,
    "maxlatitude": 28.5,
    "minlongitude": 92.0,
    "maxlongitude": 101.5
}

# Major Myanmar River Basins & Monitoring Points for GloFAS Live Telemetry
MYANMAR_RIVER_STATIONS = [
    {"name": "Ayeyarwady River (Mandalay)", "lat": 21.975, "lon": 96.083, "region": "Mandalay", "flood_threshold": 4500.0},
    {"name": "Chindwin River (Monywa)", "lat": 22.116, "lon": 95.133, "region": "Sagaing", "flood_threshold": 3200.0},
    {"name": "Ayeyarwady River (Pyay / Bago)", "lat": 18.816, "lon": 95.216, "region": "Bago", "flood_threshold": 5000.0},
    {"name": "Sittaung River (Taungoo)", "lat": 18.933, "lon": 96.433, "region": "Bago", "flood_threshold": 2100.0},
    {"name": "Bago River Basin (Bago City)", "lat": 17.333, "lon": 96.483, "region": "Bago", "flood_threshold": 1800.0},
    {"name": "Thanlwin / Salween River (Hpa-An)", "lat": 16.883, "lon": 97.633, "region": "Kayin", "flood_threshold": 2900.0},
    {"name": "Kalay Valley / Myittha River", "lat": 23.190, "lon": 94.050, "region": "Sagaing", "flood_threshold": 1200.0},
    {"name": "Inle Lake Basin / Bilu Creek", "lat": 20.590, "lon": 96.920, "region": "Shan", "flood_threshold": 950.0}
]

USGS_EARTHQUAKE_URL = (
    f"https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson"
    f"&minlatitude={MYANMAR_BBOX['minlatitude']}"
    f"&maxlatitude={MYANMAR_BBOX['maxlatitude']}"
    f"&minlongitude={MYANMAR_BBOX['minlongitude']}"
    f"&maxlongitude={MYANMAR_BBOX['maxlongitude']}"
    f"&limit=30"
)

OPEN_METEO_FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"


async def fetch_live_myanmar_earthquakes() -> List[Dict[str, Any]]:
    """
    Fetches real-time, live earthquake events across Myanmar directly from the USGS Seismological API.
    """
    events = []
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.get(USGS_EARTHQUAKE_URL, headers={"User-Agent": "RescuraSync-LiveMonitor/2.0"})
            if res.status_code == 200:
                data = res.json()
                for feature in data.get("features", []):
                    props = feature.get("properties", {})
                    geom = feature.get("geometry", {})
                    coords = geom.get("coordinates", [])

                    if len(coords) < 2:
                        continue

                    lon = float(coords[0])
                    lat = float(coords[1])
                    mag = float(props.get("mag") or 3.5)
                    place = props.get("place") or "Myanmar Region"
                    epoch_ms = props.get("time")

                    if epoch_ms:
                        dt = datetime.fromtimestamp(epoch_ms / 1000.0, tz=timezone.utc)
                        formatted_date = dt.strftime("%Y-%m-%d %H:%M:%S UTC")
                    else:
                        formatted_date = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

                    # Map Richter magnitude (e.g. 3.5 - 7.5) to Rescura 1.0 - 10.0 severity scale
                    severity = min(max(round(mag * 1.5, 1), 1.0), 10.0)

                    clean_place = place.replace("Burma (Myanmar)", "Myanmar").replace("Burma", "Myanmar").strip()
                    title = f"M{mag:.1f} Seismic Tremor - {clean_place}"

                    events.append({
                        "title": title,
                        "disaster_type": "Earthquake",
                        "lat": lat,
                        "lon": lon,
                        "severity": severity,
                        "country": "Myanmar",
                        "created_at": formatted_date,
                        "source": "USGS Real-Time Earthquake Catalog"
                    })
    except Exception as e:
        print(f"[Myanmar Live Service] USGS fetch note: {e}")

    return events


async def fetch_live_myanmar_flood_monitoring() -> List[Dict[str, Any]]:
    """
    Queries real-time river discharge and flood conditions across major Myanmar river basins using Open-Meteo GloFAS.
    """
    events = []
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            for station in MYANMAR_RIVER_STATIONS:
                try:
                    params = {
                        "latitude": station["lat"],
                        "longitude": station["lon"],
                        "daily": "river_discharge",
                        "forecast_days": 1
                    }
                    res = await client.get(OPEN_METEO_FLOOD_URL, params=params)
                    if res.status_code == 200:
                        data = res.json()
                        daily = data.get("daily", {})
                        discharges = daily.get("river_discharge", [])
                        current_discharge = discharges[0] if discharges and discharges[0] is not None else 0.0

                        threshold = station["flood_threshold"]
                        ratio = current_discharge / threshold if threshold > 0 else 0.5

                        if ratio >= 1.2:
                            sev = min(round(7.5 + (ratio - 1.0) * 1.5, 1), 9.5)
                            status_desc = "Critical High Discharge Flood Surge"
                        elif ratio >= 0.8:
                            sev = round(5.5 + (ratio - 0.8) * 4.0, 1)
                            status_desc = "Active High Water Inundation Alert"
                        else:
                            sev = max(round(4.0 + ratio * 2.0, 1), 3.5)
                            status_desc = "River Basin Hydrological Monitor"

                        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
                        events.append({
                            "title": f"{station['name']} {status_desc} ({int(current_discharge)} m³/s)",
                            "disaster_type": "Flood",
                            "lat": station["lat"],
                            "lon": station["lon"],
                            "severity": sev,
                            "country": "Myanmar",
                            "created_at": now_str,
                            "source": "Open-Meteo GloFAS Real-Time Hydrology"
                        })
                except Exception:
                    continue
    except Exception as e:
        print(f"[Myanmar Live Service] Flood monitoring fetch note: {e}")

    return events


async def fetch_live_myanmar_disasters() -> List[Dict[str, Any]]:
    """
    Combines live real-time feeds from USGS Earthquakes and Open-Meteo River Hydrology into a single verified live list.
    """
    quakes_task = fetch_live_myanmar_earthquakes()
    floods_task = fetch_live_myanmar_flood_monitoring()

    quakes, floods = await asyncio.gather(quakes_task, floods_task, return_exceptions=True)

    results: List[Dict[str, Any]] = []

    if isinstance(quakes, list):
        results.extend(quakes)
    if isinstance(floods, list):
        results.extend(floods)

    results.sort(key=lambda x: x.get("severity", 0.0), reverse=True)
    return results
