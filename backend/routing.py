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


async def find_nearest_depot(target_lat: float, target_lon: float, db: AsyncSession) -> Dict[str, Any]:
    """
    Finds and returns the closest RescueDepot to a given disaster or SOS coordinate using Haversine distance.
    """
    stmt = select(models.RescueDepot)
    result = await db.execute(stmt)
    depots = result.scalars().all()

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
            return {
                "status": "success",
                "nearest_depot": {
                    "id": closest.id,
                    "name": closest.name,
                    "latitude": closest.lat,
                    "longitude": closest.lon,
                    "water_inventory": closest.water_capacity_liters,
                    "food_inventory": closest.food_capacity_packs,
                    "distance_km": round(dist, 2)
                }
            }

        from services.depot_service import REGISTERED_DEPOTS
        closest_static = min(
            REGISTERED_DEPOTS,
            key=lambda d: haversine_distance(target_lat, target_lon, float(d["lat"]), float(d["lon"]))
        )
        dist = haversine_distance(target_lat, target_lon, float(closest_static["lat"]), float(closest_static["lon"]))
        return {
            "status": "success",
            "nearest_depot": {
                "id": closest_static["id"],
                "name": closest_static["name"],
                "latitude": closest_static["lat"],
                "longitude": closest_static["lon"],
                "water_inventory": closest_static["water_capacity_liters"],
                "food_inventory": closest_static["food_capacity_packs"],
                "distance_km": round(dist, 2)
            }
        }

    closest_depot = min(
        depots,
        key=lambda d: haversine_distance(target_lat, target_lon, cast(float, d.latitude), cast(float, d.longitude))
    )
    dist = haversine_distance(target_lat, target_lon, cast(float, closest_depot.latitude), cast(float, closest_depot.longitude))

    return {
        "status": "success",
        "nearest_depot": {
            "id": closest_depot.id,
            "name": closest_depot.name,
            "latitude": closest_depot.latitude,
            "longitude": closest_depot.longitude,
            "water_inventory": closest_depot.water_inventory,
            "food_inventory": closest_depot.food_inventory,
            "distance_km": round(dist, 2)
        }
    }
