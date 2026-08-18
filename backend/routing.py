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


def get_region_from_coords(lat: float, lon: float, title: str = "") -> str:
    t = (title or "").lower()
    if any(k in t for k in ["myanmar", "burma", "yangon", "mandalay", "naypyidaw", "bago", "sagaing", "shan", "kachin", "rakhine", "inle", "hpakant", "sittwe", "kalay", "myitkyina", "taungoo"]):
        return "Asia"
    if 35.0 <= lat <= 72.0 and -25.0 <= lon <= 45.0:
        return "Europe"
    if -170.0 <= lon <= -30.0:
        return "Americas"
    if -35.0 <= lat <= 37.0 and -20.0 <= lon <= 52.0:
        return "Africa"
    if -50.0 <= lat <= 0.0 and 110.0 <= lon <= 180.0:
        return "Oceania"
    return "Asia"


def is_waterway_accessible(lat: float, lon: float, title: str = "") -> bool:
    """
    Determines if a destination is genuinely accessible by navigable waterways or delta boats from depots.
    Highland, mountainous, and landlocked plateau regions (e.g. Pyin Oo Lwin, Taunggyi, Chin/Kachin hills)
    have no navigable river connection from lowland depots and must return False.
    """
    t = (title or "").lower()
    
    # 1. Highland, Mountain, Plateau, Mining & Landslide indicators -> No water transit possible
    inland_highland_keywords = [
        "pyin oo lwin", "pyinoolwin", "maymyo", "taunggyi", "kalaw", "mogok", "hpakant", 
        "putao", "lashio", "kyaukme", "hsipaw", "loikaw", "hakha", "tedim", "mindat", 
        "falam", "matupi", "kanpetlet", "pindaya", "namhsan", "kutkai", "muse", 
        "kengtung", "tachileik", "highland", "mountain", "hill", "plateau", "landslide", 
        "mudflow", "ridge", "cliff", "elevation", "slope", "quarry", "mine", "mining"
    ]
    if any(k in t for k in inland_highland_keywords):
        return False
        
    # 2. Known Water / Riverine / Delta / Coastal zones
    waterway_keywords = [
        "delta", "river", "ayeyarwady", "irrawaddy", "chindwin", "sittoung", "thanlwin", 
        "coast", "coastal", "island", "sea", "bay", "gulf", "port", "barge", "harbor", 
        "bogale", "labutta", "pyapon", "pathein", "myaungmya", "sittwe", "kyaukpyu", 
        "myeik", "dawei", "mawlamyine", "twante", "hinthada", "pyay", 
        "pakokku", "chauk", "magway", "minbu", "flood", "cyclone", "tsunami", "storm surge"
    ]
    if any(k in t for k in waterway_keywords):
        return True
        
    # 3. Coordinate-based bounding for Delta & Coastal zones in Lower Myanmar
    if 15.0 <= lat <= 18.0 and 94.0 <= lon <= 97.0: # Ayeyarwady Delta & Yangon basin
        return True
    if 18.0 <= lat <= 21.5 and 92.0 <= lon <= 94.5: # Coastal Rakhine
        return True
    if 9.5 <= lat <= 15.0 and 97.5 <= lon <= 99.0:  # Coastal Tanintharyi
        return True

    # 4. Shan Plateau / Eastern Highlands (Lon > 96.35 and Lat > 20.0) -> Mountainous
    if lon >= 96.35 and lat >= 20.0:
        return False

    # 5. Western Chin & Sagaing Mountain Ranges (Lon < 94.5 and Lat > 21.0) -> Mountainous
    if lon <= 94.5 and lat >= 21.0:
        return False

    return False


def calculate_multimodal_eta(
    distance_km: float,
    severity: float = 5.0,
    disaster_title: str = "",
    lat: float = 0.0,
    lon: float = 0.0
) -> Dict[str, Any]:
    """
    Calculates realistic estimated travel time & response ETA across 3 geographic operational zones:
    - Zone 1: Domestic Myanmar (< 600 km) -> Land Convoy (50 km/h), Tactical Helicopter (220 km/h), River/Delta Boat (25 km/h)
    - Zone 2: Regional ASEAN (600 - 1800 km) -> Regional C-130 Airlift (500 km/h), Cross-border Land, Coastal Vessels
    - Zone 3: Global / Inter-Continental (> 1800 km or Europe/Americas/Africa/Oceania) -> Strategic Heavy Cargo Flight (800 km/h).
              Land and Water modes are marked N/A (Infeasible / Out of Tactical Range).
    """
    d_km = max(0.1, float(distance_km))
    sev = float(severity)
    title_lower = str(disaster_title).lower()
    region = get_region_from_coords(lat, lon, disaster_title) if (lat != 0.0 or lon != 0.0) else ("Asia" if d_km < 1800 else "Global")

    is_intercontinental = (region in ["Europe", "Americas", "Africa", "Oceania"]) or (d_km > 1800.0)
    is_regional_asean = (not is_intercontinental) and (d_km >= 600.0)
    has_waterway = is_waterway_accessible(lat, lon, disaster_title)
    is_water_disaster = any(k in title_lower for k in ["flood", "tsunami", "cyclone", "storm", "river", "sea", "coastal", "drowning"]) and has_waterway

    # ---------------------------------------------------------
    # ZONE 3: Inter-Continental / Global Response
    # ---------------------------------------------------------
    if is_intercontinental:
        air_speed = 800.0  # Cruise speed km/h
        air_prep = 4.0     # Diplomatic clearance, flight planning, heavy pallet staging
        air_dist = d_km * 1.05
        air_total_h = round((air_dist / air_speed) + air_prep, 2)
        air_h = int(air_total_h)
        air_m = int(round((air_total_h - air_h) * 60))

        rationale = (
            f"✈️ STRATEGIC INTERNATIONAL AIRLIFT: Global crisis in {region} ({round(d_km):,} km from Myanmar). "
            f"Ground and tactical boat deployments are out of range. UNHRD strategic heavy cargo airlift deployed at {int(air_speed)} km/h ({air_h}h {air_m}m)."
        )

        return {
            "distance_km": round(d_km, 2),
            "zone": "global",
            "region": region,
            "recommended_mode": "air",
            "recommended_icon": "✈️",
            "recommendation_rationale": rationale,
            "assigned_depot_override": "UNHRD Global Reserve Network (UN-OCHA Handoff)",
            "modes": {
                "land": {
                    "available": False,
                    "name": "Land Convoy (Truck)",
                    "icon": "🚚",
                    "total_hours": 0.0,
                    "formatted_time": "N/A",
                    "status_note": "Out of Ground Range / Cross-Continental",
                    "speed_kmh": 50.0,
                    "distance_km": round(d_km * 1.3, 1)
                },
                "air": {
                    "available": True,
                    "name": "Strategic Cargo Flight (UNHRD)",
                    "icon": "✈️",
                    "total_hours": air_total_h,
                    "formatted_time": f"{air_h}h {air_m}m",
                    "status_note": f"Strategic long-range jet cargo flight via {region} humanitarian air bridge",
                    "speed_kmh": air_speed,
                    "distance_km": round(air_dist, 1)
                },
                "water": {
                    "available": False,
                    "name": "Water Transport (Rescue Boat)",
                    "icon": "🚢",
                    "total_hours": 0.0,
                    "formatted_time": "N/A",
                    "status_note": "No Contiguous Waterway / Trans-Oceanic",
                    "speed_kmh": 25.0,
                    "distance_km": round(d_km * 1.4, 1)
                }
            }
        }

    # ---------------------------------------------------------
    # ZONE 2: Regional ASEAN Operations (600km - 1800km)
    # ---------------------------------------------------------
    if is_regional_asean:
        air_speed = 500.0
        air_prep = 1.5
        air_dist = d_km * 1.08
        air_total_h = round((air_dist / air_speed) + air_prep, 2)
        air_h = int(air_total_h)
        air_m = int(round((air_total_h - air_h) * 60))

        land_speed = 45.0
        land_prep = 2.0
        land_dist = d_km * 1.35
        land_total_h = round((land_dist / land_speed) + land_prep, 2)
        land_h = int(land_total_h)
        land_m = int(round((land_total_h - land_h) * 60))

        water_speed = 30.0
        water_prep = 1.5
        water_dist = d_km * 1.3
        water_total_h = round((water_dist / water_speed) + water_prep, 2)
        water_h = int(water_total_h)
        water_m = int(round((water_total_h - water_h) * 60))

        if is_water_disaster and has_waterway and d_km <= 500:
            rec_mode = "water"
            rec_icon = "🚢"
            rationale = f"🚢 COASTAL VESSEL RECOMMENDED: Regional maritime crisis ({round(d_km)} km). Coastal relief ship deployed ({water_h}h {water_m}m)."
        elif sev >= 6.5 or d_km >= 800:
            rec_mode = "air"
            rec_icon = "🚁"
            rationale = f"🚁 REGIONAL AIRLIFT RECOMMENDED: High severity ({sev}/10) or extended ASEAN corridor ({round(d_km)} km). Regional C-130 cargo airlift deployed ({air_h}h {air_m}m)."
        else:
            rec_mode = "land"
            rec_icon = "🚚"
            rationale = f"🚚 CROSS-BORDER LAND CONVOY: Cross-border road convoy via ASEAN highway network ({land_h}h {land_m}m)."

        return {
            "distance_km": round(d_km, 2),
            "zone": "regional",
            "region": "Asia",
            "recommended_mode": rec_mode,
            "recommended_icon": rec_icon,
            "recommendation_rationale": rationale,
            "assigned_depot_override": "AHA Centre Regional Standby Stockpile (Subang/Yangon Base)",
            "modes": {
                "land": {
                    "available": True,
                    "name": "Cross-Border Convoy",
                    "icon": "🚚",
                    "total_hours": land_total_h,
                    "formatted_time": f"{land_h}h {land_m}m",
                    "speed_kmh": land_speed,
                    "distance_km": round(land_dist, 1)
                },
                "air": {
                    "available": True,
                    "name": "Regional Tactical Airlift",
                    "icon": "🚁",
                    "total_hours": air_total_h,
                    "formatted_time": f"{air_h}h {air_m}m",
                    "speed_kmh": air_speed,
                    "distance_km": round(air_dist, 1)
                },
                "water": {
                    "available": has_waterway,
                    "name": "Coastal Relief Vessel",
                    "icon": "🚢",
                    "total_hours": water_total_h if has_waterway else 0.0,
                    "formatted_time": f"{water_h}h {water_m}m" if has_waterway else "N/A",
                    "status_note": "Coastal corridor active" if has_waterway else "Inland corridor / No maritime connection",
                    "speed_kmh": water_speed,
                    "distance_km": round(water_dist, 1)
                }
            }
        }

    # ---------------------------------------------------------
    # ZONE 1: Domestic Operations (< 600km, Myanmar Theatre)
    # ---------------------------------------------------------
    land_dist = d_km * 1.3
    land_speed = 50.0
    land_prep = 0.5
    land_travel_h = land_dist / land_speed
    land_total_h = round(land_travel_h + land_prep, 2)
    land_h = int(land_total_h)
    land_m = int(round((land_total_h - land_h) * 60))

    air_dist = d_km * 1.05
    air_speed = 220.0
    air_prep = 0.3
    air_travel_h = air_dist / air_speed
    air_total_h = round(air_travel_h + air_prep, 2)
    air_h = int(air_total_h)
    air_m = int(round((air_total_h - air_h) * 60))

    water_dist = d_km * 1.4
    water_speed = 25.0
    water_prep = 0.6
    water_travel_h = water_dist / water_speed
    water_total_h = round(water_travel_h + water_prep, 2)
    water_h = int(water_total_h)
    water_m = int(round((water_total_h - water_h) * 60))

    if is_water_disaster and has_waterway and d_km <= 80.0:
        recommended_mode = "water"
        icon = "🚢"
        rationale = f"🚢 WATER/BOAT RECOMMENDED: Water/flood disaster detected within {round(d_km, 1)}km. Delta/river rescue boat units operate best in flooded terrain."
    elif sev >= 7.0 or d_km >= 120.0:
        recommended_mode = "air"
        icon = "🚁"
        rationale = f"🚁 AIR HELICOPTER RECOMMENDED: High severity ({sev}/10) or long distance ({round(d_km, 1)}km). Tactical helicopter bypasses terrain/road blockages in {air_h}h {air_m}m."
    else:
        recommended_mode = "land"
        icon = "🚚"
        rationale = f"🚚 LAND CONVOY RECOMMENDED: Standard ground road deployment is optimal for {round(d_km, 1)}km distance ({land_h}h {land_m}m)."

    return {
        "distance_km": round(d_km, 2),
        "zone": "domestic",
        "region": "Myanmar",
        "recommended_mode": recommended_mode,
        "recommended_icon": icon,
        "recommendation_rationale": rationale,
        "assigned_depot_override": None,
        "modes": {
            "land": {
                "available": True,
                "name": "Land Convoy (Truck)",
                "icon": "🚚",
                "total_hours": land_total_h,
                "formatted_time": f"{land_h}h {land_m}m",
                "speed_kmh": land_speed,
                "distance_km": round(land_dist, 1)
            },
            "air": {
                "available": True,
                "name": "Tactical Helicopter",
                "icon": "🚁",
                "total_hours": air_total_h,
                "formatted_time": f"{air_h}h {air_m}m",
                "speed_kmh": air_speed,
                "distance_km": round(air_dist, 1)
            },
            "water": {
                "available": has_waterway,
                "name": "River / Delta Rescue Boat",
                "icon": "🚢",
                "total_hours": water_total_h if has_waterway else 0.0,
                "formatted_time": f"{water_h}h {water_m}m" if has_waterway else "N/A",
                "status_note": "Navigable waterway active" if has_waterway else "Landlocked Highland / No Navigable Waterway",
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

    closest_depot_info: Dict[str, Any] = {}
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
                "name": str(closest.name),
                "latitude": float(cast(Any, closest.lat)),
                "longitude": float(cast(Any, closest.lon)),
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
            "name": str(closest_depot.name),
            "latitude": float(cast(Any, closest_depot.latitude)),
            "longitude": float(cast(Any, closest_depot.longitude)),
            "water_inventory": closest_depot.water_inventory,
            "food_inventory": closest_depot.food_inventory,
            "distance_km": round(dist, 2)
        }

    eta_breakdown = calculate_multimodal_eta(dist, severity=severity, disaster_title=disaster_title, lat=target_lat, lon=target_lon)
    if eta_breakdown.get("assigned_depot_override"):
        closest_depot_info["name"] = eta_breakdown["assigned_depot_override"]
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
        osrm_url = f"https://router.project-osrm.org/route/v1/driving/{depot_lon},{depot_lat};{target_lon},{target_lat}?overview=full&geometries=geojson&steps=true"
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                res = await client.get(osrm_url, headers={"User-Agent": "Mozilla/5.0 RescuraSync/1.0"})
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
                                name = s.get("name") or "Expressway Corridor / National Highway"
                                step_dist = round(s.get("distance", 0) / 1000.0, 1)
                                
                                icon = "straight"
                                if "right" in step_mod: icon = "right"
                                elif "left" in step_mod: icon = "left"
                                elif step_type == "depart": icon = "depart"
                                elif step_type == "arrive": icon = "arrive"

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
                {"instruction": f"Depart {depot_name} Relief Staging Yard", "road_name": "Depot Terminal Way", "distance_km": 1.2, "icon": "depart", "type": "depart"},
                {"instruction": "Merge onto Highway AH1 / Yangon-Mandalay Expressway", "road_name": "Expressway Corridor", "distance_km": round(driving_distance_km * 0.65, 1), "icon": "straight", "type": "turn"},
                {"instruction": "Take Regional Exit toward Emergency Sector", "road_name": "Provincial Trunk Road", "distance_km": round(driving_distance_km * 0.25, 1), "icon": "right", "type": "turn"},
                {"instruction": f"Arrive at Epicenter: {disaster_title}", "road_name": "Relief Sector Zone", "distance_km": round(driving_distance_km * 0.1, 1), "icon": "arrive", "type": "arrive"}
            ]

        hours = duration_minutes // 60
        mins = duration_minutes % 60
        formatted_eta = f"{hours}h {mins}m" if hours > 0 else f"{mins}m"

        return {
            "mode": "land",
            "mode_name": "Land Heavy Convoy (Highway)",
            "vehicle_icon": "land",
            "depot_name": depot_name,
            "disaster_title": disaster_title,
            "origin": [depot_lat, depot_lon],
            "destination": [target_lat, target_lon],
            "total_distance_km": driving_distance_km,
            "total_duration_minutes": duration_minutes,
            "formatted_eta": formatted_eta,
            "coordinates": coordinates,
            "steps": steps,
            "hazard_warning": "High ground clear: highway bypasses riverine flooding bottlenecks." if severity < 7.0 else "Heavy convoy alert: regional coordination recommended in high-risk zones."
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
            {"instruction": f"Take off from {depot_name} Heliport Deck", "road_name": "Airspace Zone Alpha", "distance_km": 0.5, "icon": "depart", "type": "depart"},
            {"instruction": "Climb to 3,500 ft cruise vector direct flight path", "road_name": "Direct Air Corridor", "distance_km": round(air_distance_km * 0.8, 1), "icon": "straight", "type": "turn"},
            {"instruction": "Initiate descent over disaster epicenter coordinates", "road_name": "Descent Approach Corridor", "distance_km": round(air_distance_km * 0.2, 1), "icon": "straight", "type": "turn"},
            {"instruction": f"Hover and touchdown at Emergency LZ ({disaster_title})", "road_name": "Field Landing Zone (LZ)", "distance_km": 0.3, "icon": "arrive", "type": "arrive"}
        ]

        hours = flight_minutes // 60
        mins = flight_minutes % 60
        formatted_eta = f"{hours}h {mins}m" if hours > 0 else f"{mins}m"

        return {
            "mode": "air",
            "mode_name": "Air Transport (Helicopter / Heavy Airlift)",
            "vehicle_icon": "air",
            "depot_name": depot_name,
            "disaster_title": disaster_title,
            "origin": [depot_lat, depot_lon],
            "destination": [target_lat, target_lon],
            "total_distance_km": air_distance_km,
            "total_duration_minutes": flight_minutes,
            "formatted_eta": formatted_eta,
            "coordinates": coordinates,
            "steps": steps,
            "hazard_warning": "Recommended for critical trauma cases, severed road bridges, and remote sectors."
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
            {"instruction": f"Launch rescue barge / craft from {depot_name} Marine Pier", "road_name": "Harbor Terminal Pier", "distance_km": 1.5, "icon": "depart", "type": "depart"},
            {"instruction": "Navigate primary navigable waterway channel (Ayeyarwady/Sittaung Basin)", "road_name": "Main Navigation Channel", "distance_km": round(water_distance_km * 0.75, 1), "icon": "straight", "type": "turn"},
            {"instruction": "Enter inundated tributary canal toward disaster sector", "road_name": "Tributary Inundation Sector", "distance_km": round(water_distance_km * 0.2, 1), "icon": "right", "type": "turn"},
            {"instruction": f"Dock at Emergency Riverbank Relief Staging ({disaster_title})", "road_name": "Inundated Pier Staging", "distance_km": 0.8, "icon": "arrive", "type": "arrive"}
        ]

        hours = water_minutes // 60
        mins = water_minutes % 60
        formatted_eta = f"{hours}h {mins}m" if hours > 0 else f"{mins}m"

        return {
            "mode": "water",
            "mode_name": "Water Transport (Rescue Boat / Marine Barge)",
            "vehicle_icon": "water",
            "depot_name": depot_name,
            "disaster_title": disaster_title,
            "origin": [depot_lat, depot_lon],
            "destination": [target_lat, target_lon],
            "total_distance_km": water_distance_km,
            "total_duration_minutes": water_minutes,
            "formatted_eta": formatted_eta,
            "coordinates": coordinates,
            "steps": steps,
            "hazard_warning": "High-capacity transport for bulk water and supplies into delta inundation zones."
        }


