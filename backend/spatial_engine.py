import math
import os
from typing import Dict, Any
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEMOGRAPHICS_CSV_PATH = os.path.join(BASE_DIR, "myanmar_demographics.csv")


def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates the great-circle distance between two geographic coordinates in kilometers
    using the Haversine formula.
    """
    R = 6371.0  # Earth's radius in kilometers

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def analyze_disaster_impact(disaster_lat: float, disaster_lon: float, severity: float) -> Dict[str, Any]:
    """
    Analyzes disaster impact within a 50km radius using Myanmar demographic data.
    Calculates affected population and required Sphere Project humanitarian supplies (water and food).
    """
    if not os.path.exists(DEMOGRAPHICS_CSV_PATH):
        raise FileNotFoundError(f"Demographic dataset not found at {DEMOGRAPHICS_CSV_PATH}")

    # 1. Load myanmar_demographics.csv using Pandas
    df = pd.read_csv(DEMOGRAPHICS_CSV_PATH)

    affected_cities = []
    total_affected_population = 0

    # 2. Iterate through DataFrame and calculate distance to each city
    for _, row in df.iterrows():
        city_name = str(row['city'])
        city_lat = float(row['latitude'])
        city_lon = float(row['longitude'])
        pop = int(row['population'])

        dist_km = calculate_haversine_distance(disaster_lat, disaster_lon, city_lat, city_lon)

        # 3. Filter areas within a 50km radius
        if dist_km <= 50.0:
            affected_cities.append({
                "city": city_name,
                "latitude": city_lat,
                "longitude": city_lon,
                "population": pop,
                "distance_km": round(dist_km, 2)
            })
            total_affected_population += pop

    # 4. Calculate supplies based on The Sphere Project standards
    # Sphere Standards: 20 Liters of water per person, 3 Food packs per person
    base_water_liters = total_affected_population * 20.0
    base_food_packs = total_affected_population * 3.0

    # Scaling multiplier based on disaster severity (severity scale 1-10; 5.0 = baseline 1.0x multiplier)
    severity_multiplier = max(1.0, float(severity) / 5.0)

    total_water_liters = round(base_water_liters * severity_multiplier, 1)
    total_food_packs = round(base_food_packs * severity_multiplier, 1)

    # 5. Return structured dictionary
    return {
        "disaster_location": {
            "latitude": float(disaster_lat),
            "longitude": float(disaster_lon)
        },
        "severity": float(severity),
        "severity_multiplier": round(severity_multiplier, 2),
        "impact_radius_km": 50.0,
        "affected_cities_count": len(affected_cities),
        "affected_cities": affected_cities,
        "affected_population": total_affected_population,
        "total_water_liters": total_water_liters,
        "total_food_packs": total_food_packs
    }


if __name__ == "__main__":
    # Quick standalone test execution
    print("Testing Spatial Data Analysis Engine...")
    
    # Test 1: Bago sector disaster
    bago_res = analyze_disaster_impact(17.3333, 96.4833, severity=5.0)
    print(f"\nDisaster Impact near Bago (17.33, 96.48, Severity 5.0):")
    print(f"  - Affected Population: {bago_res['affected_population']:,}")
    print(f"  - Total Water (L): {bago_res['total_water_liters']:,} L")
    print(f"  - Total Food (Packs): {bago_res['total_food_packs']:,} Packs")
    print(f"  - Cities within 50km: {[c['city'] for c in bago_res['affected_cities']]}")

    # Test 2: Yangon sector disaster
    ygn_res = analyze_disaster_impact(16.8661, 96.1561, severity=7.5)
    print(f"\nDisaster Impact near Yangon (16.86, 96.15, Severity 7.5):")
    print(f"  - Affected Population: {ygn_res['affected_population']:,}")
    print(f"  - Total Water (L): {ygn_res['total_water_liters']:,} L")
    print(f"  - Total Food (Packs): {ygn_res['total_food_packs']:,} Packs")
    print(f"  - Cities within 50km: {[c['city'] for c in ygn_res['affected_cities']]}")
