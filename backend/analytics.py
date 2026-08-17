import time
from typing import Dict, Any
import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import models
from ml_model import predict_rescue_needs
from spatial_engine import analyze_disaster_impact

_report_cache: Dict[str, Any] = {}
_report_cache_time: float = 0.0


async def generate_mission_report(db: AsyncSession) -> Dict[str, Any]:
    """
    Fetches all DisasterEvent records and their latest ReliefPrediction,
    calculating accurate total active disasters, total water liters needed, total food packs needed,
    and mean average estimated rescue time. Uses high-performance in-memory caching.
    """
    global _report_cache, _report_cache_time
    now = time.time()
    if _report_cache and (now - _report_cache_time < 15.0):
        return _report_cache

    stmt = select(models.DisasterEvent).options(selectinload(models.DisasterEvent.predictions))
    result = await db.execute(stmt)
    disasters = result.scalars().all()

    if not disasters:
        empty_res = {
            "status": "success",
            "total_active_disasters": 0,
            "sum_water_liters": 0.0,
            "sum_food_packs": 0.0,
            "mean_estimated_rescue_time": 0.0
        }
        _report_cache = empty_res
        _report_cache_time = now
        return empty_res

    rows = []
    for d in disasters:
        d_lat = float(d.latitude) if d.latitude is not None else 0.0
        d_lon = float(d.longitude) if d.longitude is not None else 0.0
        d_sev = float(d.severity) if d.severity is not None else 5.0

        pred = d.predictions[-1] if d.predictions else None
        if pred:
            w_liters = round(float(pred.water_liters or (d_sev * 15000)))
            f_packs = round(float(pred.food_packs or (d_sev * 4000)))
            est_rescue_time = round(4.5 + (d_sev * 0.4), 1)
        else:
            spatial = analyze_disaster_impact(d_lat, d_lon, d_sev)
            w_liters = round(float(spatial.get("total_water_liters") or (d_sev * 15000)))
            f_packs = round(float(spatial.get("total_food_packs") or (d_sev * 4000)))
            est_rescue_time = round(4.5 + (d_sev * 0.4), 1)

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

    res = {
        "status": "success",
        "total_active_disasters": total_disasters,
        "sum_water_liters": round(sum_water, 2),
        "sum_food_packs": round(sum_food, 2),
        "mean_estimated_rescue_time": round(mean_rescue_time, 2)
    }
    _report_cache = res
    _report_cache_time = now
    return res

