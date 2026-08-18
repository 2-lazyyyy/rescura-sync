import math
import os
from typing import Dict, Any
import pandas as pd
import numpy as np
from ml_model import predict_rescue_needs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEMOGRAPHICS_CSV_PATH = os.path.join(BASE_DIR, "myanmar_demographics.csv")


def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
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


def analyze_disaster_impact(disaster_lat: float, disaster_lon: float, severity: float, event_type: str = "Flood") -> Dict[str, Any]:
    """
    Analyzes disaster impact within a 50km radius using Myanmar demographic data.
    Uses ML Pipeline to predict vulnerability ratio, then applies UN Sphere Standard.
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
    
    total_regional_population = int(affected_df['population'].sum())

    affected_cities = []
    for idx, row in affected_df.head(10).iterrows(): 
        affected_cities.append({
            "city": str(row['city']),
            "latitude": float(row['latitude']),
            "longitude": float(row['longitude']),
            "population": int(row['population']),
            "distance_km": float(round(distances[idx], 2))
        })

    if total_regional_population == 0 and len(distances) > 0:
        min_idx = int(np.argmin(distances))
        nearest_row = df.iloc[min_idx]
        nearest_dist = float(distances[min_idx])
        decay = max(0.04, 1.0 / (1.0 + (nearest_dist / 60.0)))
        estimated_rural_pop = max(1500, int(nearest_row['population'] * 0.08 * decay * (severity / 5.0)))
        total_regional_population = estimated_rural_pop
        affected_cities.append({
            "city": f"{nearest_row['city']} Regional Sector",
            "latitude": float(nearest_row['latitude']),
            "longitude": float(nearest_row['longitude']),
            "population": int(estimated_rural_pop),
            "distance_km": round(nearest_dist, 2)
        })

    # ML Pipeline Integration
    ml_prediction = predict_rescue_needs(
        severity=severity,
        total_population=total_regional_population,
        lat=disaster_lat,
        lon=disaster_lon,
        event_type=event_type
    )

    total_water_liters = ml_prediction["water_liters"]
    total_food_packs = ml_prediction["food_packs"]
    vulnerable_population = ml_prediction["vulnerable_population"]
    estimated_rescue_time = ml_prediction["estimated_rescue_time"]
    ml_vulnerability_ratio = ml_prediction["ml_vulnerability_ratio"]

    # Financial Cost Engine
    COST_PER_WATER_LITER = 0.50
    COST_PER_FOOD_PACK = 3.50
    total_estimated_budget_usd = round(
        (total_water_liters * COST_PER_WATER_LITER) + (total_food_packs * COST_PER_FOOD_PACK), 2
    )

    return {
        "disaster_location": {
            "latitude": disaster_lat,
            "longitude": disaster_lon,
            "severity": severity,
            "event_type": event_type
        },
        "affected_cities": affected_cities,
        "total_regional_population": total_regional_population,
        "vulnerable_population": vulnerable_population,
        "ml_vulnerability_ratio": ml_vulnerability_ratio,
        "total_water_liters": total_water_liters,
        "total_food_packs": total_food_packs,
        "estimated_rescue_time_hours": estimated_rescue_time,
        "total_estimated_budget_usd": total_estimated_budget_usd,
        "nearest_depot": ml_prediction["nearest_depot_name"],
        "dispatch_travel_hours": ml_prediction["dispatch_travel_hours"]
    }
