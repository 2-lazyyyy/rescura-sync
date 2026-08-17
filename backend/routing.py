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


import httpx

async def get_detailed_turn_by_turn_route(
    depot_lat: float,
    depot_lon: float,
    target_lat: float,
    target_lon: float,
    mode: str = "land",
    depot_name: str = "Central Humanitarian Base",
    disaster_title: str = "Disaster Epicenter",
    severity: float = 5.0
) -> Dict[str, Any]:
    """
    Generates detailed, high-precision turn-by-turn route navigation data (Grab-style HUD).
    Supports Land (OSRM Highway Routing), Air (Direct Aviation Corridor), and Water (Marine/Riverine).
    """
    d_km = haversine_distance(depot_lat, depot_lon, target_lat, target_lon)
    mode = (mode or "land").lower()
    
    # 1. LAND CONVOY ROUTE (Real OSRM Driving Highway Navigation)
    if mode == "land":
        coordinates = []
        steps = []
        driving_distance_km = round(d_km * 1.28, 1)
        duration_minutes = int(round((driving_distance_km / 52.0) * 60) + 25) # 52km/h avg + 25m staging

        # Attempt to query public OSRM routing server with fast timeout
        osrm_url = f"http://router.project-osrm.org/route/v1/driving/{depot_lon},{depot_lat};{target_lon},{target_lat}?overview=full&geometries=geojson&steps=true"
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(osrm_url)
                if res.status_code == 200:
                    data = res.json()
                    if data.get("routes") and len(data["routes"]) > 0:
                        route_obj = data["routes"][0]
                        geojson_coords = route_obj.get("geometry", {}).get("coordinates", [])
                        if geojson_coords:
                            coordinates = [[c[1], c[0]] for c in geojson_coords] # Convert [lon, lat] -> [lat, lon]
                        
                        raw_dist_m = route_obj.get("distance", 0)
                        raw_dur_s = route_obj.get("duration", 0)
                        if raw_dist_m > 0:
                            driving_distance_km = round(raw_dist_m / 1000.0, 1)
                        if raw_dur_s > 0:
                            duration_minutes = int(round(raw_dur_s / 60.0) + 15) # +15m relief truck prep

                        # Extract leg steps
                        legs = route_obj.get("legs", [])
                        if legs and legs[0].get("steps"):
                            for s in legs[0]["steps"]:
                                man = s.get("maneuver", {})
                                step_type = man.get("type", "turn")
                                step_mod = man.get("modifier", "straight")
                                name = s.get("name") or "Primary Highway Corridor"
                                step_dist = round(s.get("distance", 0) / 1000.0, 1)
                                
                                icon = "⬆️"
                                if "right" in step_mod: icon = "↪️"
                                elif "left" in step_mod: icon = "↩️"
                                elif step_type == "depart": icon = "🚛"
                                elif step_type == "arrive": icon = "🏁"

                                text_inst = f"{step_type.capitalize()} on {name}"
                                if step_type == "depart": text_inst = f"Depart from {depot_name}"
                                elif step_type == "arrive": text_inst = f"Arrive at {disaster_title} target sector"

                                steps.append({
                                    "instruction": text_inst,
                                    "road_name": name,
                                    "distance_km": step_dist,
                                    "icon": icon,
                                    "type": step_type
                                })
        except Exception as e:
            print(f"Notice: OSRM live routing fetch notice: {e}")

        # High-Fidelity Highway Corridor Interpolation Fallback if OSRM is offline
        if not coordinates:
            points_count = 14
            coordinates = []
            for i in range(points_count + 1):
                t = i / float(points_count)
                # Add natural highway curvature factor
                curve_lat = math.sin(t * math.pi) * 0.05 * (1 if depot_lon < target_lon else -1)
                curve_lon = math.sin(t * math.pi * 2) * 0.03
                p_lat = round(depot_lat + (target_lat - depot_lat) * t + curve_lat, 5)
                p_lon = round(depot_lon + (target_lon - depot_lon) * t + curve_lon, 5)
                coordinates.append([p_lat, p_lon])

            steps = [
                {"instruction": f"Depart {depot_name} Relief Staging Yard", "road_name": "Depot Terminal Way", "distance_km": 1.2, "icon": "🚛", "type": "depart"},
                {"instruction": "Merge onto Highway AH1 / Yangon-Mandalay Expressway", "road_name": "Expressway Corridor", "distance_km": round(driving_distance_km * 0.65, 1), "icon": "⬆️", "type": "turn"},
                {"instruction": "Take Regional Exit toward Emergency Sector", "road_name": "Provincial Trunk Road", "distance_km": round(driving_distance_km * 0.25, 1), "icon": "↪️", "type": "turn"},
                {"instruction": f"Arrive at Epicenter: {disaster_title}", "road_name": "Relief Sector Zone", "distance_km": round(driving_distance_km * 0.1, 1), "icon": "🏁", "type": "arrive"}
            ]

        hours = duration_minutes // 60
        mins = duration_minutes % 60
        formatted_eta = f"{hours}h {mins}m" if hours > 0 else f"{mins}m"

        return {
            "mode": "land",
            "mode_name": "Land Heavy Convoy (Highway)",
            "vehicle_icon": "🚚",
            "depot_name": depot_name,
            "disaster_title": disaster_title,
            "origin": [depot_lat, depot_lon],
            "destination": [target_lat, target_lon],
            "total_distance_km": driving_distance_km,
            "total_duration_minutes": duration_minutes,
            "formatted_eta": formatted_eta,
            "coordinates": coordinates,
            "steps": steps,
            "hazard_warning": "High Ground Clear: Highway bypasses riverine flooding bottlenecks" if severity < 7.0 else "⚠️ Heavy Convoy Alert: Emergency police escort recommended in high-risk zones"
        }

    # 2. AIR HELICOPTER FLIGHT CORRIDOR
    elif mode == "air":
        air_distance_km = round(d_km * 1.05, 1)
        flight_minutes = int(round((air_distance_km / 220.0) * 60) + 18) # 220km/h + 18m pre-flight prep
        
        # Flight vector coordinates (Climb, Cruise, Descent, Landing)
        steps_count = 10
        coordinates = []
        for i in range(steps_count + 1):
            t = i / float(steps_count)
            p_lat = round(depot_lat + (target_lat - depot_lat) * t, 5)
            p_lon = round(depot_lon + (target_lon - depot_lon) * t, 5)
            coordinates.append([p_lat, p_lon])

        steps = [
            {"instruction": f"Take off from {depot_name} Heliport Deck", "road_name": "Airspace Zone Alpha", "distance_km": 0.5, "icon": "🚁", "type": "depart"},
            {"instruction": "Climb to 3,500 ft cruise vector direct flight path", "road_name": "Direct Air Corridor", "distance_km": round(air_distance_km * 0.8, 1), "icon": "⬆️", "type": "turn"},
            {"instruction": "Initiate descent over disaster epicenter coordinates", "road_name": "Descent Approach Corridor", "distance_km": round(air_distance_km * 0.2, 1), "icon": "↘️", "type": "turn"},
            {"instruction": f"Hover & Touchdown at Emergency LZ ({disaster_title})", "road_name": "Field Landing Zone (LZ)", "distance_km": 0.3, "icon": "🏁", "type": "arrive"}
        ]

        hours = flight_minutes // 60
        mins = flight_minutes % 60
        formatted_eta = f"{hours}h {mins}m" if hours > 0 else f"{mins}m"

        return {
            "mode": "air",
            "mode_name": "Air Transport (Helicopter / Heavy Airlift)",
            "vehicle_icon": "🚁",
            "depot_name": depot_name,
            "disaster_title": disaster_title,
            "origin": [depot_lat, depot_lon],
            "destination": [target_lat, target_lon],
            "total_distance_km": air_distance_km,
            "total_duration_minutes": flight_minutes,
            "formatted_eta": formatted_eta,
            "coordinates": coordinates,
            "steps": steps,
            "hazard_warning": "🚁 Recommended for critical trauma cases, severed road bridges, and remote mountainous sectors"
        }

    # 3. WATER RESCUE TRANSPORT
    else:
        water_distance_km = round(d_km * 1.38, 1)
        water_minutes = int(round((water_distance_km / 26.0) * 60) + 35) # 26km/h + 35m boat docking/loading
        
        # S-curve riverine navigation path
        steps_count = 16
        coordinates = []
        for i in range(steps_count + 1):
            t = i / float(steps_count)
            river_wiggle = math.sin(t * math.pi * 3) * 0.04
            p_lat = round(depot_lat + (target_lat - depot_lat) * t + river_wiggle, 5)
            p_lon = round(depot_lon + (target_lon - depot_lon) * t, 5)
            coordinates.append([p_lat, p_lon])

        steps = [
            {"instruction": f"Launch rescue barge / hovercraft from {depot_name} Marine Pier", "road_name": "Harbor Terminal Pier", "distance_km": 1.5, "icon": "🚢", "type": "depart"},
            {"instruction": "Navigate primary navigable waterway channel (Ayeyarwady/Sittaung Basin)", "road_name": "Main Navigation Channel", "distance_km": round(water_distance_km * 0.75, 1), "icon": "⬆️", "type": "turn"},
            {"instruction": "Enter inundated tributary canal toward disaster sector", "road_name": "Tributary Inundation Sector", "distance_km": round(water_distance_km * 0.2, 1), "icon": "↪️", "type": "turn"},
            {"instruction": f"Dock at Emergency Riverbank Relief Staging Depot ({disaster_title})", "road_name": "Inundated Pier Staging", "distance_km": 0.8, "icon": "🏁", "type": "arrive"}
        ]

        hours = water_minutes // 60
        mins = water_minutes % 60
        formatted_eta = f"{hours}h {mins}m" if hours > 0 else f"{mins}m"

        return {
            "mode": "water",
            "mode_name": "Water Transport (Rescue Boat / Marine Barge)",
            "vehicle_icon": "🚢",
            "depot_name": depot_name,
            "disaster_title": disaster_title,
            "origin": [depot_lat, depot_lon],
            "destination": [target_lat, target_lon],
            "total_distance_km": water_distance_km,
            "total_duration_minutes": water_minutes,
            "formatted_eta": formatted_eta,
            "coordinates": coordinates,
            "steps": steps,
            "hazard_warning": "🚢 High-capacity transport for bulk water (10,000L+) and supplies into delta inundation zones"
        }


