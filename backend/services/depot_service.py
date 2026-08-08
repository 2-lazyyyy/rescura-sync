import math
from typing import Dict, Any, List

# Official registered supply depots across Myanmar region
REGISTERED_DEPOTS: List[Dict[str, Any]] = [
    {
        "id": 1,
        "name": "Yangon Central Depot",
        "lat": 16.8661,
        "lon": 96.1561,
        "latitude": 16.8661,
        "longitude": 96.1561,
        "water_capacity_liters": 150000.0,
        "food_capacity_packs": 80000.0,
        "status": "Operational"
    },
    {
        "id": 2,
        "name": "Naypyidaw Reserve Depot",
        "lat": 19.7633,
        "lon": 96.0785,
        "latitude": 19.7633,
        "longitude": 96.0785,
        "water_capacity_liters": 200000.0,
        "food_capacity_packs": 100000.0,
        "status": "Operational"
    },
    {
        "id": 3,
        "name": "Mandalay Hub Depot",
        "lat": 21.9588,
        "lon": 96.0891,
        "latitude": 21.9588,
        "longitude": 96.0891,
        "water_capacity_liters": 120000.0,
        "food_capacity_packs": 60000.0,
        "status": "Operational"
    }
]


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates great-circle distance between two geographic coordinates in km.
    """
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def find_nearest_depot(target_lat: float, target_lon: float) -> Dict[str, Any]:
    """
    Finds the closest registered relief supply depot relative to the target epicenter.
    """
    nearest_depot = None
    min_dist = float("inf")

    for depot in REGISTERED_DEPOTS:
        dist = haversine_distance(target_lat, target_lon, depot["lat"], depot["lon"])
        if dist < min_dist:
            min_dist = dist
            nearest_depot = {**depot, "distance_km": round(dist, 2)}

    return nearest_depot or {
        "name": "Yangon Central Depot",
        "lat": 16.8661,
        "lon": 96.1561,
        "latitude": 16.8661,
        "longitude": 96.1561,
        "distance_km": 5.0
    }
