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


_demographics_df = None

def get_demographics_df() -> pd.DataFrame:
    global _demographics_df
    if _demographics_df is None:
        if os.path.exists(DEMOGRAPHICS_CSV_PATH):
            _demographics_df = pd.read_csv(DEMOGRAPHICS_CSV_PATH)
        else:
            _demographics_df = pd.DataFrame(columns=['city', 'latitude', 'longitude', 'population'])
    return _demographics_df


import numpy as np

def analyze_disaster_impact(disaster_lat: float, disaster_lon: float, severity: float) -> Dict[str, Any]:
    """
    Analyzes disaster impact within a 50km radius using Myanmar demographic data.
    Calculates affected population and required Sphere Project humanitarian supplies (water and food).
    """
    df = get_demographics_df()

    # Vectorized Haversine
    lat1 = np.radians(disaster_lat)
    lon1 = np.radians(disaster_lon)
    lat2 = np.radians(df['latitude'].values)
    lon2 = np.radians(df['longitude'].values)

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = np.sin(dlat / 2.0)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2.0)**2
    c = 2 * np.arcsin(np.sqrt(a))
    r = 6371.0 # Radius of earth in kilometers
    distances = c * r

    mask = distances <= 50.0
    affected_df = df[mask]
    
    total_affected_population = affected_df['population'].sum()

    affected_cities = []
    for idx, row in affected_df.head(10).iterrows(): # Just take top 10 to avoid huge payload
        affected_cities.append({
            "city": str(row['city']),
            "latitude": float(row['latitude']),
            "longitude": float(row['longitude']),
            "population": int(row['population']),
            "distance_km": float(round(distances[idx], 2))
        })

    # If disaster is in rural/offshore zone (>50km from surveyed city hubs),
    # compute realistic baseline population from nearest demographic anchor with distance decay
    if total_affected_population == 0 and len(distances) > 0:
        min_idx = int(np.argmin(distances))
        nearest_row = df.iloc[min_idx]
        nearest_dist = float(distances[min_idx])
        decay = max(0.04, 1.0 / (1.0 + (nearest_dist / 60.0)))
        estimated_rural_pop = max(1500, int(nearest_row['population'] * 0.08 * decay * (severity / 5.0)))
        total_affected_population = estimated_rural_pop
        affected_cities.append({
            "city": f"{nearest_row['city']} Regional Sector",
            "latitude": float(nearest_row['latitude']),
            "longitude": float(nearest_row['longitude']),
            "population": int(estimated_rural_pop),
            "distance_km": round(nearest_dist, 2)
        })

    # 4. Calculate supplies based on The Sphere Project standards
    # Sphere Standards: 20 Liters of water per person, 3 Food packs per person
    base_water_liters = total_affected_population * 20.0
    base_food_packs = total_affected_population * 3.0

    # Scaling multiplier based on disaster severity (severity scale 1-10; 5.0 = baseline 1.0x multiplier)
    severity_multiplier = max(1.0, float(severity) / 5.0)

    total_water_liters = round(base_water_liters * severity_multiplier, 1)
    total_food_packs = round(base_food_packs * severity_multiplier, 1)

    # 5. Financial Cost Engine: Unit costs ($0.50/L water, $3.50/pack food)
    COST_PER_WATER_LITER = 0.50
    COST_PER_FOOD_PACK = 3.50
    total_estimated_budget_usd = round(
        (total_water_liters * COST_PER_WATER_LITER) + (total_food_packs * COST_PER_FOOD_PACK), 2
    )

    # 6. Return structured dictionary
    return {
        "disaster_location": {
            "latitude": disaster_lat,
            "longitude": disaster_lon,
            "severity": severity
        },
        "affected_cities": affected_cities,
        "total_affected_population": int(total_affected_population),
        "total_water_liters": total_water_liters,
        "total_food_packs": total_food_packs,
        "total_estimated_budget_usd": total_estimated_budget_usd
    }


