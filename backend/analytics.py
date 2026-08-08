from typing import Dict, Any
import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import models
from ml_model import predict_rescue_needs


async def generate_mission_report(db: AsyncSession) -> Dict[str, Any]:
    """
    Fetches all DisasterEvent and ReliefPrediction records, loads them into a Pandas DataFrame,
    and calculates total active disasters, total water liters needed, total food packs needed,
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
        water = sum(p.water_liters for p in d.predictions) if d.predictions else 0.0
        food = sum(p.food_packs for p in d.predictions) if d.predictions else 0.0

        # Calculate estimated rescue time using trained RandomForest model
        ml_pred = predict_rescue_needs(severity=d.severity, affected_people=5000)
        est_rescue_time = ml_pred.get("estimated_rescue_time", 4.5)

        if not d.predictions:
            water = ml_pred.get("water_liters", 0.0)
            food = ml_pred.get("food_packs", 0.0)

        rows.append({
            "disaster_id": d.id,
            "title": d.title,
            "water_liters": water,
            "food_packs": food,
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
