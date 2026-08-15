import math
from typing import Dict, Any, cast
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import models


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates the great-circle distance between two points on the Earth in kilometers using the Haversine formula.
    """
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def calculate_multimodal_eta(distance_km: float, severity: float = 5.0, disaster_title: str = "") -> Dict[str, Any]:
    """
    Calculates estimated travel time & total response ETA across 3 primary transit modes:
    1. Land Convoy (Truck / Ambulance): ~50 km/h avg speed + 0.5h prep delay (1.3x road factor)
    2. Air Transport (Helicopter / Aircraft): ~220 km/h avg speed + 0.3h prep delay (1.05x flight path factor)
    3. Water Transport (Rescue Boat / Hovercraft): ~25 km/h avg speed + 0.6h prep delay (1.4x riverine factor)

    Recommends optimal transport mode based on disaster severity, terrain/disaster type, and distance.
    """
    d_km = max(0.1, float(distance_km))
    sev = float(severity)
    title_lower = str(disaster_title).lower()

    # 1. Land (Truck / Ambulance Convoy)
    land_dist = d_km * 1.3
    land_speed = 50.0
    land_prep = 0.5
    land_travel_h = land_dist / land_speed
    land_total_h = round(land_travel_h + land_prep, 2)
    land_h = int(land_total_h)
    land_m = int(round((land_total_h - land_h) * 60))

    # 2. Air (Helicopter / Aerial Unit)
    air_dist = d_km * 1.05
    air_speed = 220.0
    air_prep = 0.3
    air_travel_h = air_dist / air_speed
    air_total_h = round(air_travel_h + air_prep, 2)
    air_h = int(air_total_h)
    air_m = int(round((air_total_h - air_h) * 60))

    # 3. Water (Rescue Boat / Vessel)
    water_dist = d_km * 1.4
    water_speed = 25.0
    water_prep = 0.6
    water_travel_h = water_dist / water_speed
    water_total_h = round(water_travel_h + water_prep, 2)
    water_h = int(water_total_h)
    water_m = int(round((water_total_h - water_h) * 60))

    # Recommendation Engine
    is_water_disaster = any(k in title_lower for k in ["flood", "tsunami", "cyclone", "storm", "river", "sea", "coastal", "drowning"])
    
    if is_water_disaster and d_km <= 80.0:
        recommended_mode = "water"
        icon = "🚢"
        rationale = f"🚢 WATER/BOAT RECOMMENDED: Water/flood disaster detected within {round(d_km, 1)}km. Amphibious boat units operate best in flooded/coastal terrain."
    elif sev >= 7.0 or d_km >= 120.0:
        recommended_mode = "air"
        icon = "🚁"
        rationale = f"🚁 AIR HELICOPTER RECOMMENDED: High severity ({sev}/10) or long distance ({round(d_km, 1)}km). Direct flight bypasses ground road blockages in {air_h}h {air_m}m."
    else:
        recommended_mode = "land"
        icon = "🚚"
        rationale = f"🚚 LAND CONVOY RECOMMENDED: Standard ground road deployment is optimal for {round(d_km, 1)}km distance ({land_h}h {land_m}m)."

    return {
        "distance_km": round(d_km, 2),
        "recommended_mode": recommended_mode,
        "recommended_icon": icon,
        "recommendation_rationale": rationale,
        "modes": {
            "land": {
                "name": "Land Convoy (Truck)",
                "icon": "🚚",
                "total_hours": land_total_h,
                "formatted_time": f"{land_h}h {land_m}m",
                "speed_kmh": land_speed,
                "distance_km": round(land_dist, 1)
            },
            "air": {
                "name": "Air Transport (Helicopter)",
                "icon": "🚁",
                "total_hours": air_total_h,
                "formatted_time": f"{air_h}h {air_m}m",
                "speed_kmh": air_speed,
                "distance_km": round(air_dist, 1)
            },
            "water": {
                "name": "Water Transport (Rescue Boat)",
                "icon": "🚢",
                "total_hours": water_total_h,
                "formatted_time": f"{water_h}h {water_m}m",
                "speed_kmh": water_speed,
                "distance_km": round(water_dist, 1)
            }
        }
    }


async def find_nearest_depot(target_lat: float, target_lon: float, db: AsyncSession, severity: float = 5.0, disaster_title: str = "") -> Dict[str, Any]:
    """
    Finds and returns the closest RescueDepot to a given disaster or SOS coordinate using Haversine distance.
    Includes multi-modal transport ETA calculations (Land, Air, Water).
    """
    stmt = select(models.RescueDepot)
    result = await db.execute(stmt)
    depots = result.scalars().all()

    closest_depot_info = None
    dist = 0.0

    if not depots:
        # Fallback query on ReliefDepot table if RescueDepot has no records yet
        alt_stmt = select(models.ReliefDepot)
        alt_result = await db.execute(alt_stmt)
        alt_depots = alt_result.scalars().all()

        if alt_depots:
            closest = min(
                alt_depots,
                key=lambda d: haversine_distance(target_lat, target_lon, cast(float, d.lat), cast(float, d.lon))
            )
            dist = haversine_distance(target_lat, target_lon, cast(float, closest.lat), cast(float, closest.lon))
            closest_depot_info = {
                "id": closest.id,
                "name": closest.name,
                "latitude": closest.lat,
                "longitude": closest.lon,
                "water_inventory": closest.water_capacity_liters,
                "food_inventory": closest.food_capacity_packs,
                "distance_km": round(dist, 2)
            }
        else:
            from services.depot_service import REGISTERED_DEPOTS
            closest_static = min(
                REGISTERED_DEPOTS,
                key=lambda d: haversine_distance(target_lat, target_lon, float(d["lat"]), float(d["lon"]))
            )
            dist = haversine_distance(target_lat, target_lon, float(closest_static["lat"]), float(closest_static["lon"]))
            closest_depot_info = {
                "id": closest_static["id"],
                "name": closest_static["name"],
                "latitude": closest_static["lat"],
                "longitude": closest_static["lon"],
                "water_inventory": closest_static["water_capacity_liters"],
                "food_inventory": closest_static["food_capacity_packs"],
                "distance_km": round(dist, 2)
            }
    else:
        closest_depot = min(
            depots,
            key=lambda d: haversine_distance(target_lat, target_lon, cast(float, d.latitude), cast(float, d.longitude))
        )
        dist = haversine_distance(target_lat, target_lon, cast(float, closest_depot.latitude), cast(float, closest_depot.longitude))
        closest_depot_info = {
            "id": closest_depot.id,
            "name": closest_depot.name,
            "latitude": closest_depot.latitude,
            "longitude": closest_depot.longitude,
            "water_inventory": closest_depot.water_inventory,
            "food_inventory": closest_depot.food_inventory,
            "distance_km": round(dist, 2)
        }

    eta_breakdown = calculate_multimodal_eta(dist, severity=severity, disaster_title=disaster_title)
    closest_depot_info["eta_breakdown"] = eta_breakdown

    return {
        "status": "success",
        "nearest_depot": closest_depot_info
    }

