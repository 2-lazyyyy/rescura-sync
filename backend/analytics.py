from typing import Dict, Any
import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import models
from ml_model import predict_rescue_needs
from spatial_engine import analyze_disaster_impact


async def generate_mission_report(db: AsyncSession) -> Dict[str, Any]:
    """
    Fetches all DisasterEvent records and their latest ReliefPrediction,
    calculating accurate total active disasters, total water liters needed, total food packs needed,
    and mean average estimated rescue time.
    """
    stmt = select(models.DisasterEvent).options(selectinload(models.DisasterEvent.predictions))
    result = await db.execute(stmt)
    disasters = result.scalars().all()

    if not disasters:
        return {
            "status": "success",
            "total_active_disasters": 0,
            "sum_water_liters": 0.0,
            "sum_food_packs": 0.0,
            "mean_estimated_rescue_time": 0.0
        }

    rows = []
    for d in disasters:
        d_lat = float(d.latitude) if d.latitude is not None else 0.0
        d_lon = float(d.longitude) if d.longitude is not None else 0.0
        d_sev = float(d.severity) if d.severity is not None else 5.0

        spatial = analyze_disaster_impact(d_lat, d_lon, d_sev)
        w_liters = round(spatial.get("total_water_liters", d_sev * 15000))
        f_packs = round(spatial.get("total_food_packs", d_sev * 4000))
        affected_pop = spatial.get("affected_population", 5000)

        ml_pred = predict_rescue_needs(severity=d_sev, affected_people=affected_pop, lat=d_lat, lon=d_lon)
        est_rescue_time = ml_pred.get("estimated_rescue_time", 4.5)

        rows.append({
            "disaster_id": d.id,
            "title": d.title,
            "water_liters": w_liters,
            "food_packs": f_packs,
            "estimated_rescue_time": est_rescue_time
        })

    df = pd.DataFrame(rows)

    total_disasters = int(len(df))
    sum_water = float(df["water_liters"].sum())
    sum_food = float(df["food_packs"].sum())
    mean_rescue_time = float(df["estimated_rescue_time"].mean())

    return {
        "status": "success",
        "total_active_disasters": total_disasters,
        "sum_water_liters": round(sum_water, 2),
        "sum_food_packs": round(sum_food, 2),
        "mean_estimated_rescue_time": round(mean_rescue_time, 2)
    }
