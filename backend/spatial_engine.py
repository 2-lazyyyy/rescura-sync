import os
from typing import Dict, Any, List
from sqlalchemy import select, func, cast
from sqlalchemy.ext.asyncio import AsyncSession
from models import Demographics
from geoalchemy2.functions import ST_DWithin, ST_Distance, ST_SetSRID, ST_Point, ST_GeographyFromText
from geoalchemy2.types import Geography


async def analyze_disaster_impact(db: AsyncSession, disaster_lat: float, disaster_lon: float, severity: float) -> Dict[str, Any]:
    """
    Analyzes disaster impact within a 50km radius using Myanmar demographic data in PostGIS.
    Calculates affected population and required Sphere Project humanitarian supplies (water and food).
    """
    
    # 50km = 50000 meters. PostGIS Geography calculations are in meters.
    radius_meters = 50000.0
    
    disaster_point = func.ST_SetSRID(func.ST_MakePoint(disaster_lon, disaster_lat), 4326)
    
    # Cast geom to geography for distance in meters
    stmt = select(
        Demographics,
        func.ST_Distance(
            cast(Demographics.geom, Geography), 
            cast(disaster_point, Geography)
        ).label('distance_meters')
    ).where(
        func.ST_DWithin(
            cast(Demographics.geom, Geography), 
            cast(disaster_point, Geography), 
            radius_meters
        )
    )

    result = await db.execute(stmt, execution_options={"compiled_cache": None})
    rows = result.all()

    affected_cities = []
    total_affected_population = 0

    for row in rows:
        demo_obj = row.Demographics
        dist_m = row.distance_meters
        
        pop = demo_obj.total_population
        total_affected_population += pop
        
        affected_cities.append({
            "city": demo_obj.township_name,
            "latitude": demo_obj.latitude,
            "longitude": demo_obj.longitude,
            "population": pop,
            "distance_km": round(dist_m / 1000.0, 2)
        })

    # Sphere Standards: 20 Liters of water per person, 3 Food packs per person
    base_water_liters = total_affected_population * 20.0
    base_food_packs = total_affected_population * 3.0

    # Scaling multiplier based on disaster severity (severity scale 1-10; 5.0 = baseline 1.0x multiplier)
    severity_multiplier = max(1.0, float(severity) / 5.0)

    total_water_liters = round(base_water_liters * severity_multiplier, 1)
    total_food_packs = round(base_food_packs * severity_multiplier, 1)

    COST_PER_WATER_LITER = 0.50
    COST_PER_FOOD_PACK = 3.50
    total_estimated_budget_usd = round(
        (total_water_liters * COST_PER_WATER_LITER) + (total_food_packs * COST_PER_FOOD_PACK), 2
    )

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
        "total_food_packs": total_food_packs,
        "total_estimated_budget_usd": total_estimated_budget_usd
    }
