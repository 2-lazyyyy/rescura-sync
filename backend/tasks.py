from celery_app import celery
import asyncio
from database import get_db, engine
from sqlalchemy.ext.asyncio import AsyncSession
from spatial_engine import analyze_disaster_impact
from ml_model import predict_rescue_needs

def _run_async(coro):
    """Helper to run async code inside a synchronous Celery task"""
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(coro)

@celery.task
def process_disaster_impact_task(disaster_lat: float, disaster_lon: float, severity: float):
    """
    Background task to process spatial impact and ML predictions for a new disaster.
    """
    async def process():
        async with engine.session() as session:
            async with AsyncSession(engine) as db:
                spatial = await analyze_disaster_impact(db, disaster_lat, disaster_lon, severity)
                affected_pop = spatial.get("affected_population", 5000)
                
                # We can also call ML model
                ml_pred = predict_rescue_needs(severity, affected_pop, disaster_lat, disaster_lon)
                
                return {
                    "spatial": spatial,
                    "ml_pred": ml_pred
                }

    return _run_async(process())
