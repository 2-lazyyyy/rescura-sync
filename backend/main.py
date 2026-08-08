import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any, cast
from pydantic import BaseModel, Field
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from sqlalchemy.orm import selectinload

import models
from database import Base, engine, get_db, AsyncSessionLocal
from services.gis_analyzer import get_evacuation_routes
from services.ai_predictor import ReliefPredictor
from services.gdacs_client import fetch_active_disasters
from services.supabase_client import fetch_recent_sos_alerts, aggregate_sos_demographics
from data_pipeline import ingest_mock_historical_data
from ml_model import ingest_rescue_data, train_rescue_model, predict_rescue_needs
from analytics import generate_mission_report
from routing import find_nearest_depot
from spatial_engine import analyze_disaster_impact

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Initialize global ReliefPredictor instance
predictor = ReliefPredictor()

# Global asynchronous event queue for streaming real-time emergency events via SSE
sse_event_queue: asyncio.Queue = asyncio.Queue()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager that creates database tables on startup,
    trains the AI model using historical CSV data, and spawns the background GDACS polling task.
    """
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        print(f"Warning: Could not create database tables automatically ({str(e)})")

    csv_path = os.path.join(BASE_DIR, "historical_disasters.csv")
    try:
        if os.path.exists(csv_path):
            predictor.train_models(csv_path)
        else:
            print(f"Warning: Training CSV file not found at {csv_path}")
    except Exception as e:
        print(f"Warning during initial model training: {e}")

    # Launch asynchronous background GDACS disaster polling task
    poller_task = asyncio.create_task(poll_gdacs_loop())

    yield

    # Cancel background task on application shutdown
    poller_task.cancel()



app = FastAPI(title="Rescura Sync API", lifespan=lifespan)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Rescura Sync API is running"}


@app.get("/health", tags=["health"])
async def health_check(db: AsyncSession = Depends(get_db)):
    """Health check endpoint that tests the database connection."""
    try:
        result = await db.execute(text("SELECT 1"))
        if result.scalar() == 1:
            return {
                "status": "healthy",
                "database": "connected"
            }
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected response from database"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database connection failed: {str(e)}"
        )


@app.post("/api/ingest-history", tags=["pipeline"])
async def ingest_history(db: AsyncSession = Depends(get_db)):
    """
    Data ingestion pipeline endpoint using Pandas to generate, clean, and insert 100 historical disaster records.
    """
    rows_processed = await ingest_mock_historical_data(db)
    return {
        "status": "success",
        "message": "Historical disaster data ingested and cleaned successfully.",
        "rows_processed": rows_processed
    }


@app.post("/api/ingest-rescues", tags=["pipeline"])
async def ingest_rescues(db: AsyncSession = Depends(get_db)):
    """
    Generates 200 mock historical rescue operation records using Pandas and inserts them into the database.
    """
    rows_processed = await ingest_rescue_data(db)
    return {
        "status": "success",
        "message": "Historical rescue operations ingested successfully.",
        "rows_processed": rows_processed
    }


@app.post("/api/train-rescue-ai", tags=["ml"])
async def train_rescue_ai(db: AsyncSession = Depends(get_db)):
    """
    Trains the Multi-Target RandomForest ML model on historical rescue operations and saves joblib weights.
    """
    try:
        result = await train_rescue_model(db)
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"ML Training Exception: {str(e)}"
        )


@app.get("/api/live-alerts", tags=["disasters"])
async def live_alerts(db: AsyncSession = Depends(get_db)):
    """
    Fetches active high-impact global and regional disasters from GDACS.
    Inserts new disaster events into the database if they do not exist.
    """
    disasters = await fetch_active_disasters()
    saved_records = []
    new_events = []

    for d in disasters:
        lat = float(d["lat"])
        lon = float(d["lon"])
        title = d["title"]
        severity = float(d["severity"])

        stmt = select(models.DisasterEvent).where(
            models.DisasterEvent.latitude == lat,
            models.DisasterEvent.longitude == lon
        )
        result = await db.execute(stmt)
        existing = result.scalars().first()

        if not existing:
            event = models.DisasterEvent(
                title=title,
                latitude=lat,
                longitude=lon,
                severity=severity
            )
            new_events.append(event)
            saved_records.append(event)
        else:
            saved_records.append(existing)

    if new_events:
        db.add_all(new_events)
        await db.commit()

        new_preds = []
        for event in new_events:
            await db.refresh(event)
            ai_data = predict_rescue_needs(severity=event.severity, affected_people=5000, lat=event.latitude, lon=event.longitude)
            pred = models.ReliefPrediction(
                disaster_id=event.id,
                water_liters=ai_data["water_liters"],
                food_packs=ai_data["food_packs"]
            )
            new_preds.append(pred)

        if new_preds:
            db.add_all(new_preds)
            await db.commit()

    return {
        "status": "success",
        "count": len(saved_records),
        "disasters": [
            {
                "id": evt.id,
                "title": evt.title,
                "latitude": evt.latitude,
                "longitude": evt.longitude,
                "severity": evt.severity
            } for evt in saved_records
        ]
    }


@app.get("/api/sos-alerts", tags=["sos"])
async def sos_alerts():
    """
    Fetches recent mobile SOS emergency alerts from Supabase.
    """
    alerts = await fetch_recent_sos_alerts()
    metrics = aggregate_sos_demographics(alerts)
    return {
        "status": "success",
        "count": len(alerts),
        "alerts": alerts,
        "metrics": metrics
    }


@app.get("/api/predict-relief", tags=["relief"])
async def predict_relief(
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    severity: Optional[float] = None,
    population: int = 50000,
    vulnerability: float = 0.20,
    radius_km: int = 6,
    db: AsyncSession = Depends(get_db)
):
    """
    Predicts required relief supplies and estimated rescue times using trained RandomForest ML model,
    and calculates optimal evacuation routes via OSMnx.
    """
    disaster_event = None
    if lat is None or lon is None or severity is None:
        active_disasters = await fetch_active_disasters()
        if active_disasters:
            disaster_event = active_disasters[0]
            lat = lat if lat is not None else disaster_event["lat"]
            lon = lon if lon is not None else disaster_event["lon"]
            severity = severity if severity is not None else disaster_event["severity"]
        else:
            lat = lat if lat is not None else 17.3333
            lon = lon if lon is not None else 96.4833
            severity = severity if severity is not None else 7.5

    # Find or create DisasterEvent record in database
    stmt = select(models.DisasterEvent).where(
        models.DisasterEvent.latitude == lat,
        models.DisasterEvent.longitude == lon
    )
    result = await db.execute(stmt)
    event_rec = result.scalars().first()

    if not event_rec:
        title = disaster_event["title"] if disaster_event else f"Emergency Zone ({lat}, {lon})"
        event_rec = models.DisasterEvent(
            title=title,
            latitude=lat,
            longitude=lon,
            severity=severity
        )
        db.add(event_rec)
        await db.commit()
        await db.refresh(event_rec)

    # Fetch live SOS alerts from mobile reports to refine demographic input
    raw_sos_alerts = await fetch_recent_sos_alerts()
    sos_metrics = aggregate_sos_demographics(raw_sos_alerts)
    effective_population = max(population, sos_metrics.get("total_affected_people", 0) * 10)

    # Find nearest supply depot first
    nearest_depot_data = await find_nearest_depot(target_lat=lat, target_lon=lon, db=db)
    nearest_depot_info = nearest_depot_data.get("nearest_depot", {})
    distance_km = nearest_depot_info.get("distance_km", 10.0)

    # Calculate dispatch travel time assuming emergency supply convoy speed of ~45 km/h
    dispatch_travel_hours = round(distance_km / 45.0, 1)

    gis_data = await get_evacuation_routes(lat=lat, lon=lon, radius_km=radius_km)
    
    # Use upgraded RandomForest Multi-Target ML model predictions
    ai_data = predict_rescue_needs(severity=severity, affected_people=effective_population)

    # Total rescue time = dispatch travel time + on-site operation time
    on_site_time = ai_data.get("estimated_rescue_time", 4.5)
    total_rescue_time = round(on_site_time + dispatch_travel_hours, 1)

    ai_data["estimated_rescue_time"] = total_rescue_time
    ai_data["dispatch_travel_hours"] = dispatch_travel_hours
    ai_data["on_site_operation_hours"] = on_site_time
    ai_data["nearest_depot"] = nearest_depot_info

    # Save ReliefPrediction into the database linked to event_rec.id
    water_liters = ai_data.get("water_liters", 0.0)
    food_packs = ai_data.get("food_packs", 0.0)

    prediction_rec = models.ReliefPrediction(
        disaster_id=event_rec.id,
        water_liters=water_liters,
        food_packs=food_packs
    )
    db.add(prediction_rec)
    await db.commit()
    await db.refresh(prediction_rec)

    response = {
        "status": "success",
        "disaster_event_id": event_rec.id,
        "prediction_id": prediction_rec.id,
        "nearest_depot": nearest_depot_info,
        "gis_analysis": gis_data,
        "ai_prediction": ai_data,
        "sos_summary": sos_metrics
    }

    if disaster_event:
        response["live_event"] = disaster_event

    return response


@app.get("/api/dashboard-data", tags=["dashboard"])
async def dashboard_data(db: AsyncSession = Depends(get_db)):
    """
    Queries the database using a LEFT OUTER JOIN to fetch all DisasterEvent records
    immediately along with any existing ReliefPrediction records.
    """
    stmt = (
        select(models.DisasterEvent)
        .outerjoin(models.ReliefPrediction)
        .options(selectinload(models.DisasterEvent.predictions))
        .order_by(models.DisasterEvent.id.desc())
    )
    result = await db.execute(stmt)
    events = result.scalars().unique().all()

    # If database has no disaster records yet, auto-populate from GDACS feed
    if not events:
        disasters = await fetch_active_disasters()
        for d in disasters:
            evt = models.DisasterEvent(
                title=d["title"],
                latitude=d["lat"],
                longitude=d["lon"],
                severity=d["severity"]
            )
            db.add(evt)
        await db.commit()

        result = await db.execute(stmt)
        events = result.scalars().unique().all()

    payload = []
    for evt in events:
        predictions_list = [
            {
                "id": pred.id,
                "water_liters": pred.water_liters,
                "food_packs": pred.food_packs,
                "created_at": pred.created_at.isoformat() if pred.created_at else None
            } for pred in evt.predictions
        ]

        latest_pred = predictions_list[0] if predictions_list else None

        # Predict rescue time using ML model factoring in latitude and longitude distance to nearest depot
        ml_pred = predict_rescue_needs(severity=evt.severity, affected_people=5000, lat=evt.latitude, lon=evt.longitude)
        est_rescue_time = ml_pred.get("estimated_rescue_time", 4.5)

        payload.append({
            "id": evt.id,
            "title": evt.title,
            "latitude": evt.latitude,
            "longitude": evt.longitude,
            "severity": evt.severity,
            "created_at": evt.created_at.isoformat() if evt.created_at else None,
            "predictions": predictions_list,
            "latest_prediction": latest_pred,
            "estimated_rescue_time": est_rescue_time
        })

    return {
        "status": "success",
        "count": len(payload),
        "dashboard_data": payload
    }


@app.get("/api/depots", tags=["depots"])
async def get_all_depots(db: AsyncSession = Depends(get_db)):
    """
    Returns all registered RescueDepot records from the database.
    If none exist, seeds default depots (Yangon, Mandalay, Naypyidaw) and returns them.
    """
    stmt = select(models.RescueDepot)
    result = await db.execute(stmt)
    depots = result.scalars().all()

    if not depots:
        seed_result = await seed_depots(db)
        return seed_result

    return {
        "status": "success",
        "count": len(depots),
        "depots": [
            {
                "id": d.id,
                "name": d.name,
                "latitude": d.latitude,
                "longitude": d.longitude,
                "water_inventory": d.water_inventory,
                "food_inventory": d.food_inventory
            } for d in depots
        ]
    }


@app.post("/api/seed-depots", tags=["depots"])
async def seed_depots(db: AsyncSession = Depends(get_db)):
    """
    Seeds the database with 3 mock Rescue Depots in Myanmar (Yangon Central, Mandalay Hub, Naypyidaw Reserve).
    """
    stmt = select(models.RescueDepot)
    result = await db.execute(stmt)
    existing = result.scalars().all()

    if existing:
        return {
            "status": "success",
            "message": "Rescue depots already exist in database.",
            "count": len(existing),
            "depots": [
                {
                    "id": d.id,
                    "name": d.name,
                    "latitude": d.latitude,
                    "longitude": d.longitude,
                    "water_inventory": d.water_inventory,
                    "food_inventory": d.food_inventory
                } for d in existing
            ]
        }

    mock_depots = [
        models.RescueDepot(
            name="Yangon Central Depot",
            latitude=16.8661,
            longitude=96.1561,
            water_inventory=150000.0,
            food_inventory=80000.0
        ),
        models.RescueDepot(
            name="Mandalay Hub",
            latitude=21.9588,
            longitude=96.0891,
            water_inventory=120000.0,
            food_inventory=60000.0
        ),
        models.RescueDepot(
            name="Naypyidaw Reserve",
            latitude=19.7633,
            longitude=96.0785,
            water_inventory=200000.0,
            food_inventory=100000.0
        )
    ]

    db.add_all(mock_depots)
    await db.commit()

    result = await db.execute(stmt)
    seeded = result.scalars().all()

    return {
        "status": "success",
        "message": "Rescue depots seeded successfully.",
        "count": len(seeded),
        "depots": [
            {
                "id": d.id,
                "name": d.name,
                "latitude": d.latitude,
                "longitude": d.longitude,
                "water_inventory": d.water_inventory,
                "food_inventory": d.food_inventory
            } for d in seeded
        ]
    }


@app.get("/api/mission-analytics", tags=["analytics"])
async def mission_analytics(db: AsyncSession = Depends(get_db)):
    """
    Returns aggregated mission analytics using Pandas: total active disasters, sum of water needed,
    sum of food needed, and average estimated rescue time.
    """
    report = await generate_mission_report(db)
    return report


@app.get("/api/nearest-depot", tags=["routing"])
async def nearest_depot(lat: float, lon: float, db: AsyncSession = Depends(get_db)):
    """
    Finds and returns the nearest RescueDepot to a given coordinate using Haversine distance.
    """
    result = await find_nearest_depot(target_lat=lat, target_lon=lon, db=db)
    return result


async def build_emergency_payload(disaster_event: Any, db: AsyncSession) -> Dict[str, Any]:
    """
    Merges 50km radius spatial demographic impact analysis with assigned nearest depot routing.
    Safely handles both SQLAlchemy DisasterEvent ORM instances and dictionary payloads.
    """
    if isinstance(disaster_event, dict):
        evt_id = disaster_event.get("id", 1)
        title = str(disaster_event.get("title", "Emergency Disaster Epicenter"))
        lat = float(disaster_event.get("latitude") or disaster_event.get("lat") or 0.0)
        lon = float(disaster_event.get("longitude") or disaster_event.get("lon") or 0.0)
        severity = float(disaster_event.get("severity", 5.0))
    else:
        evt_id = getattr(disaster_event, "id", 1)
        title = str(getattr(disaster_event, "title", "Emergency Disaster Epicenter"))
        lat = cast(float, getattr(disaster_event, "latitude", 0.0))
        lon = cast(float, getattr(disaster_event, "longitude", 0.0))
        severity = cast(float, getattr(disaster_event, "severity", 5.0))

    spatial = analyze_disaster_impact(lat, lon, severity)
    depot_res = await find_nearest_depot(target_lat=lat, target_lon=lon, db=db)
    nearest_depot_info = depot_res.get("nearest_depot", {})

    return {
        "id": evt_id,
        "title": title,
        "latitude": lat,
        "longitude": lon,
        "severity": severity,
        "affected_population": spatial.get("affected_population", 0),
        "total_water_liters": spatial.get("total_water_liters", 0.0),
        "total_food_packs": spatial.get("total_food_packs", 0.0),
        "nearest_depot": nearest_depot_info
    }


def is_within_asean(lat: float, lon: float) -> bool:
    """
    Checks if geographic coordinates fall within Myanmar & ASEAN region.
    """
    return -11.0 <= lat <= 28.5 and 90.0 <= lon <= 141.0


async def poll_gdacs_loop():
    """
    Background task that continuously polls the GDACS RSS/XML feed for real disasters,
    filters for Myanmar & ASEAN coordinates, computes spatial demographic impact and nearest depot routing,
    saves non-duplicate records to the database, and broadcasts payloads to the SSE stream queue.
    """
    print("[GDACS Background Poller] Polling task initialized and running...")
    while True:
        try:
            async with AsyncSessionLocal() as db:
                disasters = await fetch_active_disasters()
                for d in disasters:
                    try:
                        lat = float(d["lat"])
                        lon = float(d["lon"])
                        title = str(d["title"])
                        severity = float(d["severity"])

                        # Check bounding box filter for Myanmar (9.0..29.0, 92.0..102.0) and ASEAN
                        if is_within_asean(lat, lon):
                            stmt = select(models.DisasterEvent).where(
                                models.DisasterEvent.latitude == lat,
                                models.DisasterEvent.longitude == lon
                            )
                            res = await db.execute(stmt)
                            existing = res.scalars().first()

                            if not existing:
                                event = models.DisasterEvent(
                                    title=title,
                                    latitude=lat,
                                    longitude=lon,
                                    severity=severity
                                )
                                db.add(event)
                                await db.commit()
                                await db.refresh(event)

                                payload = await build_emergency_payload(event, db)

                                pred = models.ReliefPrediction(
                                    disaster_id=event.id,
                                    water_liters=payload.get("total_water_liters", 0.0),
                                    food_packs=payload.get("total_food_packs", 0.0)
                                )
                                db.add(pred)
                                await db.commit()

                                await sse_event_queue.put(payload)
                                print(f"[GDACS Background Poller] Queued new live emergency payload: {title}")
                    except Exception as item_err:
                        print(f"[GDACS Background Poller] Notice for item: {item_err}")
        except Exception as poll_err:
            print(f"[GDACS Background Poller] Polling cycle notice: {poll_err}")

        # Sleep for 60 seconds before next polling cycle
        await asyncio.sleep(60)


@app.get("/api/stream-disasters", tags=["stream"])
async def stream_disasters(db: AsyncSession = Depends(get_db)):
    """
    Server-Sent Events (SSE) stream endpoint pushing high-priority live emergency disaster events
    within Myanmar & ASEAN regions with spatial demographic impact calculations.
    """
    async def event_generator():
        while True:
            try:
                payload = None
                try:
                    payload = sse_event_queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass

                if not payload:
                    stmt = select(models.DisasterEvent).order_by(models.DisasterEvent.id.desc()).limit(20)
                    res = await db.execute(stmt)
                    events = res.scalars().all()
                    asean_events = [e for e in events if is_within_asean(float(e.latitude), float(e.longitude))]
                    if asean_events:
                        top_evt = asean_events[0]
                        payload = await build_emergency_payload(top_evt, db)

                if payload:
                    json_str = json.dumps(payload)
                    yield f"data: {json_str}\n\n"
            except Exception as e:
                print(f"Notice: SSE generator stream tick: {e}")

            await asyncio.sleep(8)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


class TestEmergencyRequest(BaseModel):
    latitude: float = Field(..., description="Latitude coordinate of test emergency")
    longitude: float = Field(..., description="Longitude coordinate of test emergency")
    severity: float = Field(..., ge=1.0, le=10.0, description="Severity score from 1.0 to 10.0")
    event_type: str = Field(default="Earthquake", description="Type of disaster event")


@app.post("/api/test-emergency", tags=["simulation"])
async def create_test_emergency(
    req: TestEmergencyRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Simulates a high-priority disaster event, computes 50km spatial demographic impact and nearest depot routing,
    saves the event and predictions to the database, and returns the full emergency JSON payload.
    """
    title = f"Simulated {req.event_type} Emergency ({req.latitude:.4f}, {req.longitude:.4f})"

    # Save disaster event record to database
    disaster_evt = models.DisasterEvent(
        title=title,
        latitude=req.latitude,
        longitude=req.longitude,
        severity=req.severity
    )
    db.add(disaster_evt)
    await db.commit()
    await db.refresh(disaster_evt)

    # Calculate 50km radius spatial demographic impact and Sphere standard supplies
    spatial = analyze_disaster_impact(req.latitude, req.longitude, req.severity)

    # Locate nearest supply depot
    depot_res = await find_nearest_depot(target_lat=req.latitude, target_lon=req.longitude, db=db)
    nearest_depot_info = depot_res.get("nearest_depot", {})

    # Persist relief prediction record to database
    pred = models.ReliefPrediction(
        disaster_id=disaster_evt.id,
        water_liters=spatial.get("total_water_liters", 0.0),
        food_packs=spatial.get("total_food_packs", 0.0)
    )
    db.add(pred)
    await db.commit()

    payload = {
        "status": "success",
        "id": disaster_evt.id,
        "title": title,
        "latitude": req.latitude,
        "longitude": req.longitude,
        "severity": req.severity,
        "event_type": req.event_type,
        "affected_population": spatial.get("affected_population", 0),
        "total_water_liters": spatial.get("total_water_liters", 0.0),
        "total_food_packs": spatial.get("total_food_packs", 0.0),
        "nearest_depot": nearest_depot_info
    }

    # Broadcast test payload into SSE queue for immediate live popup trigger
    await sse_event_queue.put(payload)

    return payload


