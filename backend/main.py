import asyncio
import json
import os
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any, Tuple, cast
from pydantic import BaseModel, Field
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from websocket_manager import manager
try:
    from fpdf import FPDF  # type: ignore
except ImportError:
    FPDF = None  # type: ignore
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
from routing import find_nearest_depot, haversine_distance, calculate_multimodal_eta, get_detailed_turn_by_turn_route
from spatial_engine import analyze_disaster_impact
from email.utils import parsedate_to_datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def is_within_asean(lat: float, lon: float) -> bool:
    """
    Checks if geographic coordinates fall within the ASEAN bounding box.
    Latitude: -11.0 to 29.0, Longitude: 92.0 to 142.0.
    """
    try:
        return -11.0 <= float(lat) <= 29.0 and 92.0 <= float(lon) <= 142.0
    except (ValueError, TypeError):
        return False


is_in_asean = is_within_asean


def parse_created_at(date_val: Any) -> datetime:
    """
    Parses various date types (ISO string, RFC-2822 string, datetime) into a UTC datetime object.
    """
    if not date_val:
        return datetime.now(timezone.utc)
    if isinstance(date_val, datetime):
        return date_val.astimezone(timezone.utc) if date_val.tzinfo else date_val.replace(tzinfo=timezone.utc)
    try:
        dt = parsedate_to_datetime(str(date_val))
        if dt:
            return dt.astimezone(timezone.utc)
    except Exception:
        pass
    try:
        clean_str = str(date_val).replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_str)
        return dt.astimezone(timezone.utc)
    except Exception:
        pass
    return datetime.now(timezone.utc)


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

    # Seed rescue depots into database on startup if empty
    try:
        async with AsyncSessionLocal() as db:
            depot_stmt = select(models.RescueDepot)
            depot_res = await db.execute(depot_stmt)
            if not depot_res.scalars().first():
                canonical_depots = [
                    models.RescueDepot(
                        name="Yangon Central Logistics Base",
                        latitude=16.8661,
                        longitude=96.1561,
                        water_inventory=1200000.0,
                        food_inventory=180000.0
                    ),
                    models.RescueDepot(
                        name="Naypyidaw Strategic Reserve",
                        latitude=19.7633,
                        longitude=96.0785,
                        water_inventory=1500000.0,
                        food_inventory=250000.0
                    ),
                    models.RescueDepot(
                        name="Mandalay Regional Depot",
                        latitude=21.9588,
                        longitude=96.0891,
                        water_inventory=900000.0,
                        food_inventory=140000.0
                    )
                ]
                db.add_all(canonical_depots)
                await db.commit()
                print("[Startup Seeding] Database populated with canonical Rescue Depots.")
    except Exception as depot_err:
        print(f"Startup depot seeding notice: {depot_err}")

    # Seed active disaster events into database on startup if empty
    try:
        async with AsyncSessionLocal() as db:
            stmt = select(models.DisasterEvent)
            res = await db.execute(stmt)
            if not res.scalars().first():
                disasters = await fetch_active_disasters()
                for d in disasters:
                    dt_val = parse_created_at(d.get("created_at"))
                    evt = models.DisasterEvent(
                        title=d["title"],
                        latitude=d["lat"],
                        longitude=d["lon"],
                        severity=d["severity"],
                        created_at=dt_val
                    )
                    db.add(evt)
                await db.commit()
                print(f"[Startup Seeding] Database populated with {len(disasters)} active disaster events.")
            
            # Pre-warm the dashboard data cache for instant initial response
            await dashboard_data(db)
            print(f"[Startup Cache] Pre-warmed live dashboard cache ({_dashboard_cache.get('count', 0)} events ready).")
    except Exception as seed_err:
        print(f"Startup seeding notice: {seed_err}")

    # Launch asynchronous background GDACS disaster polling task
    poller_task = asyncio.create_task(poll_gdacs_loop())

    yield

    # Clean shutdown handling on Ctrl + C / application exit
    poller_task.cancel()
    try:
        await poller_task
    except (asyncio.CancelledError, Exception):
        pass

    try:
        await engine.dispose()
    except Exception:
        pass



app = FastAPI(title="Rescura Sync API", lifespan=lifespan)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/status", tags=["health"])
def api_status():
    return {"message": "Rescura Sync API is running", "status": "online"}


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


@app.websocket("/ws/dispatch")
async def websocket_dispatch(websocket: WebSocket):
    """
    WebSocket endpoint for real-time collaborative dispatching.
    Handles locking/unlocking disasters and supply dispatch broadcasts across dispatchers.
    """
    await manager.connect(websocket)
    try:
        # Initial sync: send current locked disasters state to newly connected client
        await websocket.send_json({
            "type": "INIT_LOCKS",
            "locked_disasters": manager.locked_disasters
        })

        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            disaster_id = str(data.get("disaster_id", ""))
            user_id = data.get("user_id") or data.get("dispatcher_id") or "Dispatcher_Unknown"

            if action == "lock_disaster":
                lock_info = manager.lock_disaster(disaster_id, user_id)
                await manager.broadcast({
                    "type": "DISASTER_LOCKED",
                    "disaster_id": disaster_id,
                    "locked_by": user_id,
                    "timestamp": lock_info["timestamp"]
                })

            elif action == "unlock_disaster":
                manager.unlock_disaster(disaster_id)
                await manager.broadcast({
                    "type": "DISASTER_UNLOCKED",
                    "disaster_id": disaster_id
                })

            elif action == "dispatch_supplies":
                # Mark as dispatched in database if valid ID
                try:
                    async with AsyncSessionLocal() as db:
                        if disaster_id.isdigit():
                            d_id = int(disaster_id)
                            sos_stmt = select(models.SOSAlert).where(models.SOSAlert.id == d_id)
                            res = await db.execute(sos_stmt)
                            sos_item = res.scalar_one_or_none()
                            if sos_item:
                                setattr(sos_item, "status", "dispatched")
                                await db.commit()
                except Exception as db_err:
                    print(f"Notice during dispatch database update: {db_err}")

                # Unlock disaster upon dispatch completion
                manager.unlock_disaster(disaster_id)

                await manager.broadcast({
                    "type": "DISASTER_DISPATCHED",
                    "disaster_id": disaster_id,
                    "dispatched_by": user_id
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket execution error: {e}")
        manager.disconnect(websocket)


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
            sev = float(event.severity) if event.severity is not None else 5.0
            lat = float(event.latitude) if event.latitude is not None else 0.0
            lon = float(event.longitude) if event.longitude is not None else 0.0
            ai_data = predict_rescue_needs(severity=sev, affected_people=5000, lat=lat, lon=lon)
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
                "severity": evt.severity,
                "created_at": evt.created_at.isoformat() if hasattr(evt, 'created_at') and evt.created_at else None
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

    # Synchronize demographic calculation with analyze_disaster_impact
    spatial = analyze_disaster_impact(lat, lon, severity)
    w_liters = round(spatial.get("total_water_liters", severity * 15000))
    f_packs = round(spatial.get("total_food_packs", severity * 4000))
    affected_pop = spatial.get("affected_population", 5000)

    raw_sos_alerts = await fetch_recent_sos_alerts()
    sos_metrics = aggregate_sos_demographics(raw_sos_alerts)

    if is_within_asean(lat, lon):
        nearest_depot_data = await find_nearest_depot(target_lat=lat, target_lon=lon, db=db)
        nearest_depot_info = nearest_depot_data.get("nearest_depot", {})
        distance_km = nearest_depot_info.get("distance_km", 0.0)
        dispatch_travel_hours = round(distance_km / 45.0, 1)
    else:
        nearest_depot_info = None
        dispatch_travel_hours = 0.0

    gis_data = await get_evacuation_routes(lat=lat, lon=lon, radius_km=radius_km)
    ai_data = predict_rescue_needs(severity=severity, affected_people=affected_pop, lat=lat, lon=lon)
    ai_data["water_liters"] = w_liters
    ai_data["food_packs"] = f_packs

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


_dashboard_cache: Dict[str, Any] = {}
_dashboard_cache_time: float = 0.0


@app.get("/api/dashboard-data", tags=["dashboard"])
async def dashboard_data(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """
    Returns up-to-date live disasters prioritizing Myanmar & regional emergencies with instant in-memory caching.
    """
    global _dashboard_cache, _dashboard_cache_time
    import time
    now = time.time()
    if _dashboard_cache and (now - _dashboard_cache_time < 30.0):
        return _dashboard_cache

    disasters = await fetch_active_disasters()

    depots_stmt = select(models.RescueDepot)
    depots_res = await db.execute(depots_stmt)
    all_depots = depots_res.scalars().all()
    cached_depots: List[Tuple[int, str, float, float, float, float]] = [
        (
            int(cast(Any, dp.id)),
            str(cast(Any, dp.name)),
            float(cast(Any, dp.latitude)),
            float(cast(Any, dp.longitude)),
            float(cast(Any, dp.water_inventory)),
            float(cast(Any, dp.food_inventory))
        )
        for dp in all_depots
    ]

    payload = []
    for idx, d in enumerate(disasters, 1):
        lat_val = float(d.get("lat", 0.0))
        lon_val = float(d.get("lon", 0.0))
        sev_val = float(d.get("severity", 5.0))
        title = d.get("title", "Active Emergency Event")
        created_at_str = d.get("created_at") or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        spatial = analyze_disaster_impact(lat_val, lon_val, sev_val)
        w_val = float(spatial.get("total_water_liters") or (sev_val * 15000.0))
        f_val = float(spatial.get("total_food_packs") or (sev_val * 4000.0))
        w_liters = round(w_val)
        f_packs = round(f_val)
        affected_pop = int(spatial.get("affected_population") or 5000)
        total_budget = float(spatial.get("total_estimated_budget_usd") or round((w_liters * 0.5) + (f_packs * 3.5), 2))

        base_rescue_time = round(1.5 + (sev_val * 0.75) + (affected_pop / 2500.0), 1)

        nearest_depot_info: Optional[Dict[str, Any]] = None
        if cached_depots:
            closest = min(cached_depots, key=lambda dp: haversine_distance(lat_val, lon_val, dp[2], dp[3]))
            dist = haversine_distance(lat_val, lon_val, closest[2], closest[3])
            eta_breakdown = calculate_multimodal_eta(dist, severity=sev_val, disaster_title=title, lat=lat_val, lon=lon_val)
            depot_name = eta_breakdown.get("assigned_depot_override") or closest[1]
            nearest_depot_info = {
                "id": closest[0],
                "name": depot_name,
                "latitude": closest[2],
                "longitude": closest[3],
                "water_inventory": closest[4],
                "food_inventory": closest[5],
                "distance_km": round(dist, 2),
                "eta_breakdown": eta_breakdown
            }

        dispatch_hours = round(nearest_depot_info["distance_km"] / 45.0, 1) if nearest_depot_info else 1.0
        total_rescue_time = round(base_rescue_time + dispatch_hours, 1)

        latest_pred = {
            "id": idx,
            "water_liters": w_liters,
            "food_packs": f_packs,
            "total_estimated_budget_usd": total_budget,
            "created_at": created_at_str
        }

        payload.append({
            "id": idx,
            "title": title,
            "disaster_type": d.get("disaster_type", "Flood"),
            "latitude": lat_val,
            "longitude": lon_val,
            "severity": sev_val,
            "country": d.get("country", "Myanmar"),
            "created_at": created_at_str,
            "predictions": [latest_pred],
            "latest_prediction": latest_pred,
            "estimated_rescue_time": total_rescue_time,
            "total_estimated_budget_usd": total_budget,
            "nearest_depot": nearest_depot_info
        })

    res_data = {"status": "success", "count": len(payload), "dashboard_data": payload}
    _dashboard_cache = res_data
    _dashboard_cache_time = now
    return res_data


@app.get("/api/export-report/{event_id}", tags=["reports"])
async def export_action_plan_pdf(
    event_id: str,
    title: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    severity: Optional[float] = None,
    date: Optional[str] = None,
    water_liters: Optional[int] = None,
    food_packs: Optional[int] = None,
    budget: Optional[float] = None,
    depot_name: Optional[str] = None,
    distance_km: Optional[float] = None,
    land_eta: Optional[str] = None,
    air_eta: Optional[str] = None,
    water_eta: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Generates an enterprise-grade Emergency Action Plan PDF report for any disaster event.
    Accurately reflects the exact metrics (water, food, budget, depot, and multi-modal ETAs)
    shown across the operational dashboard and event table.
    """
    import urllib.parse
    global _dashboard_cache

    def clean_pdf_text(text: str) -> str:
        if not text:
            return ""
        t = str(text)
        t = (t.replace("’", "'")
              .replace("‘", "'")
              .replace("“", '"')
              .replace("”", '"')
              .replace("–", "-")
              .replace("—", "-")
              .replace("…", "...")
              .replace("•", "*")
              .replace("·", "*")
              .replace("🚢", "")
              .replace("🚁", "")
              .replace("🚚", ""))
        try:
            return t.encode("latin-1", "replace").decode("latin-1")
        except Exception:
            return "".join([c if ord(c) < 128 else " " for c in t])

    # Unquote title if passed encoded
    if title:
        try:
            title = urllib.parse.unquote(title)
        except Exception:
            pass

    # Look up in live dashboard cache for exact matched event if available
    cached_evt = None
    if _dashboard_cache and isinstance(_dashboard_cache, dict) and "dashboard_data" in _dashboard_cache:
        if title:
            clean_q_title = str(title).strip().lower()
            for item in _dashboard_cache["dashboard_data"]:
                if str(item.get("title")).strip().lower() == clean_q_title:
                    cached_evt = item
                    break
        if not cached_evt and event_id and str(event_id) not in ("0", "1", "undefined", "null"):
            for item in _dashboard_cache["dashboard_data"]:
                if str(item.get("id")) == str(event_id):
                    cached_evt = item
                    break

    evt_db = None
    if not title:
        try:
            num_id = int(event_id)
            if num_id > 0:
                stmt = (
                    select(models.DisasterEvent)
                    .options(selectinload(models.DisasterEvent.predictions))
                    .where(models.DisasterEvent.id == num_id)
                )
                result = await db.execute(stmt)
                evt_db = result.scalars().first()
        except (ValueError, TypeError):
            pass

    # Extract or override parameters: Title and query params always take highest priority
    if title:
        evt_title = title
    elif cached_evt and cached_evt.get("title"):
        evt_title = str(cached_evt["title"])
    elif evt_db and getattr(evt_db, "title", None):
        evt_title = str(evt_db.title)
    else:
        evt_title = "Active Disaster Emergency Zone"

    if lat is not None:
        lat_val = float(lat)
    elif cached_evt and cached_evt.get("latitude") is not None:
        lat_val = float(cached_evt["latitude"])
    elif evt_db and evt_db.latitude is not None:
        lat_val = float(evt_db.latitude)
    else:
        lat_val = 19.7633

    if lon is not None:
        lon_val = float(lon)
    elif cached_evt and cached_evt.get("longitude") is not None:
        lon_val = float(cached_evt["longitude"])
    elif evt_db and evt_db.longitude is not None:
        lon_val = float(evt_db.longitude)
    else:
        lon_val = 96.0785

    if severity is not None:
        sev_val = round(float(severity), 1)
    elif cached_evt and cached_evt.get("severity") is not None:
        sev_val = round(float(cached_evt["severity"]), 1)
    elif evt_db and evt_db.severity is not None:
        sev_val = round(float(evt_db.severity), 1)
    else:
        sev_val = 7.5

    # Demographic & Spatial Analysis
    spatial = analyze_disaster_impact(lat_val, lon_val, sev_val)
    affected_pop = int(spatial.get("affected_population") or max(2500, int(sev_val * 4500)))

    # Synchronize Relief Supplies exactly with dashboard/event cards
    if water_liters is not None and water_liters > 0:
        w_liters = int(water_liters)
    elif cached_evt and cached_evt.get("latest_prediction", {}).get("water_liters"):
        w_liters = int(cached_evt["latest_prediction"]["water_liters"])
    else:
        w_liters = round(float(spatial.get("total_water_liters") or (sev_val * 15000.0)))

    if food_packs is not None and food_packs > 0:
        f_packs = int(food_packs)
    elif cached_evt and cached_evt.get("latest_prediction", {}).get("food_packs"):
        f_packs = int(cached_evt["latest_prediction"]["food_packs"])
    else:
        f_packs = round(float(spatial.get("total_food_packs") or (sev_val * 4000.0)))

    if budget is not None and budget > 0:
        total_budget = float(budget)
    elif cached_evt and cached_evt.get("total_estimated_budget_usd"):
        total_budget = float(cached_evt["total_estimated_budget_usd"])
    else:
        total_budget = float(spatial.get("total_estimated_budget_usd") or round((w_liters * 0.50) + (f_packs * 3.50), 2))

    med_kits = max(50, int(round(affected_pop * 0.05 + sev_val * 60)))
    water_cost = round(w_liters * 0.50, 2)
    food_cost = round(f_packs * 3.50, 2)

    # Depot Logistics
    if depot_name:
        depot_name_str = str(depot_name)
    elif cached_evt and cached_evt.get("nearest_depot", {}).get("name"):
        depot_name_str = str(cached_evt["nearest_depot"]["name"])
    else:
        depot_res = await find_nearest_depot(target_lat=lat_val, target_lon=lon_val, db=db)
        nearest_depot_info = depot_res.get("nearest_depot", {}) if is_within_asean(lat_val, lon_val) else None
        depot_name_str = str(nearest_depot_info.get("name", "Naypyidaw Reserve Depot")) if nearest_depot_info else "Naypyidaw Reserve Depot"

    if distance_km is not None and distance_km > 0:
        dist_km_val = round(float(distance_km), 1)
    elif cached_evt and cached_evt.get("nearest_depot", {}).get("distance_km"):
        dist_km_val = round(float(cached_evt["nearest_depot"]["distance_km"]), 1)
    else:
        dist_km_val = 45.0

    # Multi-Modal ETAs
    cached_eta = (cached_evt.get("nearest_depot", {}).get("eta_breakdown", {}).get("modes", {})) if cached_evt else {}
    multimodal = calculate_multimodal_eta(dist_km_val, severity=sev_val, disaster_title=evt_title, lat=lat_val, lon=lon_val)
    modes = multimodal.get("modes", {})

    land_eta_str = land_eta or cached_eta.get("land", {}).get("formatted_time") or modes.get("land", {}).get("formatted_time", f"{round((dist_km_val * 1.3 / 50.0) + 0.5, 1)}h")
    air_eta_str = air_eta or cached_eta.get("air", {}).get("formatted_time") or modes.get("air", {}).get("formatted_time", f"{round((dist_km_val * 1.05 / 220.0) + 0.3, 1)}h")
    water_eta_str = water_eta or cached_eta.get("water", {}).get("formatted_time") or modes.get("water", {}).get("formatted_time", f"{round((dist_km_val * 1.4 / 25.0) + 0.6, 1)}h")
    recommended_mode = multimodal.get("recommended_mode", "land").upper()

    if date:
        try:
            occurred_str = urllib.parse.unquote(date)
        except Exception:
            occurred_str = str(date)
    elif cached_evt and cached_evt.get("created_at"):
        occurred_str = str(cached_evt["created_at"])
    elif evt_db and getattr(evt_db, "created_at", None):
        occurred_str = evt_db.created_at.strftime("%b %d, %Y, %H:%M UTC")
    else:
        occurred_str = datetime.now(timezone.utc).strftime("%b %d, %Y, %H:%M UTC")

    if FPDF is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PDF generation is unavailable because 'fpdf2' package is not installed."
        )

    pdf = FPDF()
    pdf.add_page()

    # Top Header Bar
    pdf.set_fill_color(15, 23, 42)
    pdf.rect(0, 0, 210, 38, 'F')

    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(56, 189, 248)
    pdf.set_xy(14, 8)
    pdf.cell(0, 10, "RESCURA SYNC", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(148, 163, 184)
    pdf.set_xy(14, 20)
    pdf.cell(0, 6, "AUTOMATED HUMANITARIAN EMERGENCY ACTION PLAN", new_x="LMARGIN", new_y="NEXT")

    # Title & Metadata
    pdf.set_xy(14, 45)
    pdf.set_font("Helvetica", "B", 15)
    pdf.set_text_color(15, 23, 42)
    clean_title_str = clean_pdf_text(evt_title)
    if len(clean_title_str) > 65:
        clean_title_str = clean_title_str[:62] + "..."
    pdf.cell(0, 10, f"Event: {clean_title_str}", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(100, 116, 139)
    report_id_str = f"RES-EAP-{abs(hash(evt_title)) % 10000:04d}"
    pdf.cell(0, 6, f"Report ID: {report_id_str}  |  Occurred: {clean_pdf_text(occurred_str)}", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(6)

    # Section 1: Emergency Characteristics
    pdf.set_fill_color(241, 245, 249)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(182, 8, "  1. EMERGENCY CHARACTERISTICS & DISPATCH ZONE", new_x="LMARGIN", new_y="NEXT", fill=True)
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 10)
    pdf.cell(91, 7, f"  Coordinates: {lat_val:.4f}, {lon_val:.4f}", border=1)
    pdf.cell(91, 7, f"  Severity Rating: {sev_val}/10", border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.cell(91, 7, f"  Affected Population: {affected_pop:,} people", border=1)
    pdf.cell(91, 7, f"  Assigned Depot: {clean_pdf_text(depot_name_str)}", border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.cell(182, 7, f"  Depot Distance: {dist_km_val} km  |  Optimal Dispatch: {recommended_mode}", border=1, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    # Section 2: Multi-Modal Transit ETAs
    pdf.set_fill_color(241, 245, 249)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(182, 8, "  2. MULTI-MODAL LOGISTICS TRANSIT DURATION", new_x="LMARGIN", new_y="NEXT", fill=True)
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 10)
    pdf.cell(60, 7, f"  Land Truck: {clean_pdf_text(land_eta_str)}", border=1)
    pdf.cell(61, 7, f"  Air Helicopter: {clean_pdf_text(air_eta_str)}", border=1)
    pdf.cell(61, 7, f"  River Boat: {clean_pdf_text(water_eta_str)}", border=1, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    # Section 3: Financial Cost Engine & Supply Logistics (Synchronized Standards)
    pdf.set_fill_color(241, 245, 249)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(182, 8, "  3. HUMANITARIAN ALLOCATIONS & RELIEF SUPPLIES", new_x="LMARGIN", new_y="NEXT", fill=True)
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 10)
    pdf.cell(91, 7, f"  Drinking Water Required: {w_liters:,} L", border=1)
    pdf.cell(91, 7, f"  Est. Water Cost ($0.50/L): ${water_cost:,.2f} USD", border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.cell(91, 7, f"  Food Packs Required: {f_packs:,} Packs", border=1)
    pdf.cell(91, 7, f"  Est. Food Cost ($3.50/pk): ${food_cost:,.2f} USD", border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.cell(91, 7, f"  First Aid Trauma Kits: {med_kits:,} Kits", border=1)
    pdf.cell(91, 7, f"  Est. Medical Kits Cost: ${med_kits * 45:,.2f} USD", border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.set_fill_color(224, 231, 255)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(30, 58, 138)
    pdf.cell(182, 9, f"  TOTAL ESTIMATED RELIEF BUDGET: ${total_budget:,.2f} USD", border=1, new_x="LMARGIN", new_y="NEXT", fill=True)

    pdf.ln(5)

    # Section 4: Operational Directives
    pdf.set_fill_color(241, 245, 249)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(182, 8, "  4. OPERATIONAL DISPATCH DIRECTIVES", new_x="LMARGIN", new_y="NEXT", fill=True)
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(71, 85, 105)
    directives = [
        "1. Dispatch emergency supplies along optimal transit routes upon order authorization.",
        "2. Ensure water distribution strictly meets UN Sphere Core Standard 2.1 (15 Liters / person / day).",
        "3. Provide emergency food rations meeting UN World Food Programme benchmark (2,100 kcal / person / day).",
        "4. Monitor civilian alerts and maintain real-time telemetry with Rescura Sync SAC Control Center."
    ]
    for d in directives:
        pdf.cell(182, 5.5, f"  {d}", new_x="LMARGIN", new_y="NEXT")

    raw_output = pdf.output()
    pdf_bytes = bytes(raw_output) if not isinstance(raw_output, bytes) else raw_output

    safe_title = "".join([c if c.isalnum() else "_" for c in clean_title_str]).strip("_")[:30]
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="Rescura_Action_Plan_{safe_title}.pdf"'
        }
    )


@app.get("/api/depots", tags=["depots"])
async def get_all_depots(db: AsyncSession = Depends(get_db)):
    """
    Returns all registered RescueDepot records strictly synchronized with relief_depots.csv.
    """
    csv_path = os.path.join(BASE_DIR, "relief_depots.csv")
    if os.path.exists(csv_path):
        import pandas as pd
        df = pd.read_csv(csv_path)
        depots = []
        for idx, (_, row) in enumerate(df.iterrows(), 1):
            depots.append({
                "id": idx,
                "name": str(row.get("depot_name", f"Depot {idx}")),
                "latitude": float(row.get("latitude", 0.0)),
                "longitude": float(row.get("longitude", 0.0)),
                "water_inventory": float(row.get("water_capacity_liters", 1200000.0)),
                "food_inventory": float(row.get("food_capacity_packs", 180000.0)),
                "medical_kits": int(row.get("medical_kits", 3400)),
                "coverage_radius_km": float(row.get("coverage_radius_km", 250.0)),
                "primary_transit_mode": str(row.get("primary_transit_mode", "Land Convoy"))
            })
        return {"status": "success", "count": len(depots), "depots": depots}

    stmt = select(models.RescueDepot)
    result = await db.execute(stmt)
    db_depots = result.scalars().all()

    if not db_depots:
        seed_result = await seed_depots(db)
        return seed_result

    return {
        "status": "success",
        "count": len(db_depots),
        "depots": [
            {
                "id": d.id,
                "name": d.name,
                "latitude": d.latitude,
                "longitude": d.longitude,
                "water_inventory": d.water_inventory,
                "food_inventory": d.food_inventory
            } for d in db_depots
        ]
    }


@app.post("/api/seed-depots", tags=["depots"])
async def seed_depots(db: AsyncSession = Depends(get_db)):
    """
    Seeds the database with the 3 Myanmar national Rescue Depots matching relief_depots.csv.
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

    canonical_depots = [
        models.RescueDepot(
            name="Yangon Central Logistics Base",
            latitude=16.8661,
            longitude=96.1561,
            water_inventory=1200000.0,
            food_inventory=180000.0
        ),
        models.RescueDepot(
            name="Naypyidaw Strategic Reserve",
            latitude=19.7633,
            longitude=96.0785,
            water_inventory=1500000.0,
            food_inventory=250000.0
        ),
        models.RescueDepot(
            name="Mandalay Regional Depot",
            latitude=21.9588,
            longitude=96.0891,
            water_inventory=900000.0,
            food_inventory=140000.0
        )
    ]

    db.add_all(canonical_depots)
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


@app.get("/api/ml-feature-importance", tags=["analytics"])
async def ml_feature_importance():
    """
    Returns empirical feature importance weights extracted directly 
    from the trained scikit-learn RandomForestRegressor model.
    """
    from ml_model import get_model_feature_importances
    return {
        "status": "success",
        "model_type": "Multi-Target RandomForestRegressor",
        "feature_importances": get_model_feature_importances()
    }


def _classify_region(lat: float, lon: float, title: str = "") -> str:
    """Classifies global disasters into the 7 official world continents."""
    t = (title or "").lower()
    
    # 1. Antarctica
    if lat < -60.0 or any(k in t for k in ["antarctica", "antarctic", "south pole"]):
        return "Antarctica"

    # 2. North America
    north_america_keywords = [
        "united states", "usa", "canada", "mexico", "california", "florida", "texas", 
        "caribbean", "guatemala", "cuba", "haiti", "dominican", "alaska", "hawaii", 
        "puerto rico", "costa rica", "panama", "honduras", "el salvador", "nicaragua", "jamaica"
    ]
    if any(k in t for k in north_america_keywords):
        return "North America"

    # 3. South America
    south_america_keywords = [
        "brazil", "chile", "peru", "colombia", "argentina", "ecuador", "bolivia", 
        "venezuela", "paraguay", "uruguay", "guyana", "suriname", "patagonia", "amazon"
    ]
    if any(k in t for k in south_america_keywords):
        return "South America"

    # 4. Europe
    europe_keywords = [
        "italy", "greece", "spain", "france", "germany", "united kingdom", "uk", "iceland", 
        "norway", "sweden", "poland", "ukraine", "romania", "portugal", "croatia", "turkey", 
        "albania", "austria", "switzerland", "netherlands", "belgium", "finland", "ireland"
    ]
    if any(k in t for k in europe_keywords):
        return "Europe"

    # 5. Africa
    africa_keywords = [
        "congo", "drc", "kenya", "nigeria", "south africa", "ethiopia", "sudan", "somalia", 
        "madagascar", "morocco", "egypt", "mozambique", "tanzania", "chad", "niger", "mali", 
        "angola", "zambia", "zimbabwe", "uganda", "ghana", "algeria", "libya", "cameroon", "senegal"
    ]
    if any(k in t for k in africa_keywords):
        return "Africa"

    # 6. Australia/Oceania
    oceania_keywords = [
        "australia", "new zealand", "fiji", "papua new guinea", "png", "solomon islands", 
        "tonga", "vanuatu", "samoa", "new caledonia", "micronesia", "polynesia", "melanesia"
    ]
    if any(k in t for k in oceania_keywords):
        return "Australia/Oceania"

    # 7. Asia
    asia_keywords = [
        "myanmar", "burma", "china", "japan", "india", "indonesia", "philippines", "vietnam", 
        "thailand", "pakistan", "bangladesh", "nepal", "taiwan", "iran", "iraq", "afghanistan", 
        "korea", "malaysia", "cambodia", "laos", "sri lanka", "singapore"
    ]
    if any(k in t for k in asia_keywords):
        return "Asia"

    # 8. GPS Boundary Bounding Boxes
    # Americas Split
    if -170.0 <= lon <= -30.0:
        return "North America" if lat >= 7.0 else "South America"
        
    # Australia/Oceania
    if (-55.0 <= lat <= 0.0 and 110.0 <= lon <= 180.0) or (-55.0 <= lat <= 0.0 and -180.0 <= lon <= -130.0):
        return "Australia/Oceania"
        
    # Africa
    if -35.0 <= lat <= 36.0 and -20.0 <= lon <= 55.0:
        return "Africa"
        
    # Europe
    if 35.0 <= lat <= 80.0 and -30.0 <= lon <= 45.0:
        return "Europe"
        
    # Asia
    if -10.0 <= lat <= 80.0 and 45.0 <= lon <= 180.0:
        return "Asia"
        
    return "Asia"



def _classify_event_type(title: str) -> str:
    """Infers disaster event type from title string keywords."""
    t = (title or "").lower()
    if any(k in t for k in ["earthquake", "seismic", "quake", "tremor"]):
        return "Earthquake"
    if any(k in t for k in ["flood", "inundation", "river", "flash flood"]):
        return "Flood"
    if any(k in t for k in ["cyclone", "hurricane", "typhoon", "tropical storm"]):
        return "Cyclone"
    if any(k in t for k in ["drought", "dry", "arid"]):
        return "Drought"
    if any(k in t for k in ["wildfire", "fire", "blaze", "burn"]):
        return "Wildfire"
    if any(k in t for k in ["volcano", "eruption", "lava", "ash"]):
        return "Volcano"
    if any(k in t for k in ["tsunami", "wave", "tidal"]):
        return "Tsunami"
    if any(k in t for k in ["landslide", "mudslide", "debris", "avalanche"]):
        return "Landslide"
    return "Other"


_analytics_cache: Dict[str, Any] = {}
_analytics_cache_time: float = 0.0


@app.get("/api/analytics", tags=["analytics"])
async def platform_analytics(db: AsyncSession = Depends(get_db)):
    """
    Exposes aggregate platform analytics for Chart.js visualisation with instant in-memory caching:
      - Total affected population globally across all active disaster events.
      - Breakdown of active disasters by inferred event_type.
      - Total water and food supplies needed, grouped by continental region.
    """
    global _analytics_cache, _analytics_cache_time
    import time
    now = time.time()
    if _analytics_cache and (now - _analytics_cache_time < 15.0):
        return _analytics_cache

    # Pull active disasters (instant cached GDACS)
    disasters = await fetch_active_disasters()

    total_affected_population = 0
    disasters_by_type: Dict[str, int] = {}
    regional_supplies: Dict[str, Dict[str, float]] = {}

    for d in disasters:
        lat = float(d.get("lat", 0.0))
        lon = float(d.get("lon", 0.0))
        sev = float(d.get("severity", 5.0))
        title = str(d.get("title", ""))
        event_type = d.get("disaster_type") or _classify_event_type(title)

        # Spatial impact for affected population
        try:
            spatial = analyze_disaster_impact(lat, lon, sev)
            pop = int(spatial.get("affected_population") or 0)
            w_liters = float(spatial.get("total_water_liters") or 0)
            f_packs = float(spatial.get("total_food_packs") or 0)
            if w_liters <= 0 or pop <= 0:
                pop = max(pop, int(sev * 2500))
                w_liters = float(max(w_liters, sev * 18000))
                f_packs = float(max(f_packs, sev * 4500))
        except Exception:
            pop = int(sev * 2500)
            w_liters = float(sev * 18000)
            f_packs = float(sev * 4500)

        total_affected_population += pop
        disasters_by_type[event_type] = disasters_by_type.get(event_type, 0) + 1

        region = _classify_region(lat, lon, title)
        if region not in regional_supplies:
            regional_supplies[region] = {"water_liters": 0.0, "food_packs": 0.0, "disaster_count": 0}

        regional_supplies[region]["water_liters"] += w_liters
        regional_supplies[region]["food_packs"] += f_packs
        regional_supplies[region]["disaster_count"] += 1

    # Round supply values for clean display
    for region in regional_supplies:
        regional_supplies[region]["water_liters"] = round(regional_supplies[region]["water_liters"])
        regional_supplies[region]["food_packs"] = round(regional_supplies[region]["food_packs"])

    # 7-Day Occurrence Frequency & Resolution Aggregated from Live Feeds
    from datetime import datetime, timedelta
    today_dt = datetime.utcnow().date()
    daily_map: Dict[str, Dict[str, Any]] = {}
    for i in range(6, -1, -1):
        day_str = (today_dt - timedelta(days=i)).isoformat()
        daily_map[day_str] = {"date": day_str, "new_incidents": 0, "resolved_evacuations": 0}

    # Aggregate incidents by date from active stream
    for d in disasters:
        created = d.get("created_at") or d.get("pubdate") or ""
        date_match = None
        if created:
            for day_str in daily_map:
                if day_str in str(created):
                    date_match = day_str
                    break
        if date_match:
            daily_map[date_match]["new_incidents"] = int(daily_map[date_match]["new_incidents"]) + 1
            if float(d.get("severity", 5.0)) <= 6.0:
                daily_map[date_match]["resolved_evacuations"] = int(daily_map[date_match]["resolved_evacuations"]) + 1

    total_inc = len(disasters)
    day_keys = list(daily_map.keys())
    for idx, day_str in enumerate(day_keys):
        if int(daily_map[day_str]["new_incidents"]) == 0:
            weight = [0.08, 0.12, 0.10, 0.18, 0.14, 0.22, 0.16][idx % 7]
            dyn_count = max(2, int(total_inc * weight * 0.12))
            daily_map[day_str]["new_incidents"] = dyn_count
            daily_map[day_str]["resolved_evacuations"] = max(1, int(dyn_count * 0.82))

    daily_trends = list(daily_map.values())

    res_data = {
        "status": "success",
        "total_active_events": len(disasters),
        "total_active_disasters": len(disasters),
        "total_affected_population": total_affected_population,
        "disasters_by_type": disasters_by_type,
        "regional_supplies": regional_supplies,
        "regional_supply_deficits": regional_supplies,
        "daily_trends": daily_trends,
    }
    _analytics_cache = res_data
    _analytics_cache_time = now
    return res_data


@app.get("/api/prescriptive-recommendations", tags=["analytics"])
async def get_prescriptive_recommendations(db: AsyncSession = Depends(get_db)):
    """
    Dynamically generates prescriptive supply-chain rebalancing and route optimization 
    actions calculated from real-time active GDACS disasters and depot inventory levels.
    """
    disasters = await fetch_active_disasters()
    
    # Load 3 domestic depots
    depot_stmt = select(models.RescueDepot)
    depot_res = await db.execute(depot_stmt)
    depots = depot_res.scalars().all()

    depots_data: List[Dict[str, Any]] = []
    if not depots:
        # Fallback default initial capacities
        depots_data = [
            {"name": "Yangon Central Logistics Base", "lat": 16.8661, "lon": 96.1561, "water": 1200000.0, "food": 180000.0, "demand_water": 0.0, "demand_food": 0.0, "events": []},
            {"name": "Naypyidaw Strategic Reserve", "lat": 19.7633, "lon": 96.0785, "water": 1500000.0, "food": 250000.0, "demand_water": 0.0, "demand_food": 0.0, "events": []},
            {"name": "Mandalay Regional Depot", "lat": 21.9588, "lon": 96.0891, "water": 900000.0, "food": 140000.0, "demand_water": 0.0, "demand_food": 0.0, "events": []}
        ]
    else:
        depots_data = [
            {
                "id": int(cast(Any, d.id)),
                "name": str(cast(Any, d.name)),
                "lat": float(cast(Any, d.latitude) or 0.0),
                "lon": float(cast(Any, d.longitude) or 0.0),
                "water": float(cast(Any, d.water_inventory) or 1000000.0),
                "food": float(cast(Any, d.food_inventory) or 150000.0),
                "demand_water": 0.0,
                "demand_food": 0.0,
                "events": []
            } for d in depots
        ]

    # Map each disaster to closest depot and calculate demand
    severe_events: List[Dict[str, Any]] = []
    water_hazard_events: List[Dict[str, Any]] = []

    for d in disasters:
        lat = float(d.get("lat", 0.0))
        lon = float(d.get("lon", 0.0))
        sev = float(d.get("severity", 5.0))
        title = str(d.get("title", "Disaster Alert"))

        # Find nearest depot
        best_depot: Optional[Dict[str, Any]] = None
        min_dist = float("inf")
        for dp in depots_data:
            dist = haversine_distance(lat, lon, float(dp["lat"]), float(dp["lon"]))
            if dist < min_dist:
                min_dist = dist
                best_depot = dp

        # Calculate demand
        spatial = analyze_disaster_impact(lat, lon, sev)
        w_req = float(spatial.get("total_water_liters") or (sev * 15000))
        f_req = float(spatial.get("total_food_packs") or (sev * 3500))

        if best_depot:
            best_depot["demand_water"] = float(best_depot["demand_water"]) + w_req
            best_depot["demand_food"] = float(best_depot["demand_food"]) + f_req
            cast(List[Any], best_depot["events"]).append({"title": title, "sev": sev, "dist_km": round(min_dist, 1)})

        if sev >= 6.5:
            severe_events.append({"title": title, "sev": sev, "lat": lat, "lon": lon, "depot": best_depot["name"] if best_depot else "National Logistics"})

        t_lower = title.lower()
        if "flood" in t_lower or "cyclone" in t_lower or "storm" in t_lower or "delta" in t_lower:
            water_hazard_events.append({"title": title, "sev": sev, "lat": lat, "lon": lon})

    # Compute utilization
    for dp in depots_data:
        water_cap = max(float(dp["water"]), 1.0)
        dp["utilization_pct"] = round((float(dp["demand_water"]) / water_cap) * 100, 1)

    depots_data.sort(key=lambda x: float(x.get("utilization_pct", 0.0)), reverse=True)
    highest_demand_depot = depots_data[0]
    lowest_demand_depot = depots_data[-1]

    recommendations: List[Dict[str, Any]] = []

    # 1. Dynamic Inter-Depot Rebalancing
    transfer_volume = int(round(min(float(lowest_demand_depot["water"]) * 0.15, max(30000.0, float(highest_demand_depot["demand_water"]) * 0.20))))
    trucks_count = max(2, int(round(transfer_volume / 15000)))
    recommendations.append({
        "id": "rec-rebalance-1",
        "tag": "Inter-depot rebalancing",
        "priority": "High priority",
        "priority_class": "dot-critical",
        "title": f"Reallocate {transfer_volume:,} L water from {lowest_demand_depot['name']} to {highest_demand_depot['name']}",
        "description": f"{highest_demand_depot['name']} is experiencing active emergency demand with {highest_demand_depot['utilization_pct']}% operational load, while {lowest_demand_depot['name']} maintains a {lowest_demand_depot['utilization_pct']}% buffer. A {trucks_count}-convoy transfer along the national trunk highway reinforces frontline reserve resilience.",
        "action_label": "Authorize Transfer",
        "action_payload": f"Rebalance {lowest_demand_depot['name']} -> {highest_demand_depot['name']} ({transfer_volume:,}L) Authorized"
    })

    # 2. Dynamic Transport Mode Optimization
    if water_hazard_events:
        target_hazard = water_hazard_events[0]
        cost_savings = int(round(float(target_hazard["sev"]) * 3200 + 8500))
        recommendations.append({
            "id": "rec-modeshift-2",
            "tag": "Transport mode optimization",
            "priority": f"Saves ${cost_savings:,}",
            "priority_class": "dot-ok",
            "title": f"Switch {target_hazard['title']} logistics to river barge & marine fleet",
            "description": "Inundated terrain and riverine access corridors near the disaster epicenter allow heavy river barges to deliver bulk water and dry food rations at 60% lower operating cost compared to tactical airlift.",
            "action_label": "Approve Mode Shift",
            "action_payload": f"River Barge Fleet Mode Shift for {target_hazard['title']} Authorized"
        })
    else:
        recommendations.append({
            "id": "rec-modeshift-2",
            "tag": "Corridor speed optimization",
            "priority": "Time critical",
            "priority_class": "dot-ok",
            "title": "Deploy Highway 1 express convoy corridor for multi-hub staging",
            "description": "Express convoy priority routing cuts inter-regional replenishment transit times by 35% between central reserve hubs.",
            "action_label": "Approve Express Route",
            "action_payload": "Highway 1 Express Corridor Dispatch Authorized"
        })

    # 3. Dynamic Severe Disaster Pre-Positioning
    if severe_events:
        top_severe = severe_events[0]
        prestage_packs = int(round(top_severe["sev"] * 2800))
        recommendations.append({
            "id": "rec-prestage-3",
            "tag": "Advance pre-positioning",
            "priority": f"Severity {top_severe['sev']}/10",
            "priority_class": "dot-warning",
            "title": f"Pre-stage {prestage_packs:,} food rations for {top_severe['title']}",
            "description": f"AI spatial risk projection identifies high escalation probability for {top_severe['title']}. Staging emergency rations at {top_severe['depot']} mitigates last-mile stockouts.",
            "action_label": "Approve Pre-Stage",
            "action_payload": f"Pre-stage {prestage_packs:,} rations for {top_severe['title']} Authorized"
        })
    else:
        recommendations.append({
            "id": "rec-prestage-3",
            "tag": "Preventive logistics",
            "priority": "Preparedness",
            "priority_class": "dot-warning",
            "title": "Maintain 25,000 food rations ready-buffer at Naypyidaw Strategic Reserve",
            "description": "Central reserve staging maintains 4-hour nationwide response readiness across all regional corridors.",
            "action_label": "Approve Buffer",
            "action_payload": "Strategic Buffer Readiness Confirmed"
        })

    return {
        "status": "success",
        "count": len(recommendations),
        "recommendations": recommendations,
        "active_disasters_count": len(disasters),
        "depots_status": [
            {
                "name": dp["name"],
                "utilization_pct": dp["utilization_pct"],
                "demand_water_liters": round(dp["demand_water"]),
                "demand_food_packs": round(dp["demand_food"])
            } for dp in depots_data
        ]
    }


@app.get("/api/regional-vulnerability", tags=["analytics"])
async def get_regional_vulnerability():
    """
    Dynamically computes Myanmar state/regional crisis vulnerability, 
    aggregating real township populations from myanmar_demographics.csv,
    real-time GDACS emergency alerts, and road transit to domestic depots.
    """
    import pandas as pd
    disasters = await fetch_active_disasters()

    depots: List[Dict[str, Any]] = [
        {"name": "Yangon Central Logistics Base", "lat": 16.8661, "lon": 96.1561},
        {"name": "Naypyidaw Strategic Reserve", "lat": 19.7633, "lon": 96.0785},
        {"name": "Mandalay Regional Depot", "lat": 21.9588, "lon": 96.0891}
    ]

    csv_path = os.path.join(BASE_DIR, "myanmar_demographics.csv")
    if not os.path.exists(csv_path):
        csv_path = "myanmar_demographics.csv"

    df = pd.read_csv(csv_path)
    
    # Filter for Myanmar domestic regions
    myanmar_regions = [
        "Ayeyarwady Region", "Yangon Region", "Bago Region", 
        "Mandalay Region", "Sagaing Region", "Rakhine State", 
        "Shan State", "Kachin State", "Magway Region", "Mon State"
    ]
    df_mm = df[df["state_region"].isin(myanmar_regions)]

    threat_profiles = {
        "Ayeyarwady Region": "Monsoon floods / storm surge",
        "Yangon Region": "Urban flash flooding / coastal surge",
        "Bago Region": "Flash river inundation",
        "Mandalay Region": "Tectonic earthquakes & heatwaves",
        "Sagaing Region": "Sagaing faultline earthquakes",
        "Rakhine State": "Bay of Bengal cyclones / floods",
        "Shan State": "Landslides & flash runoff",
        "Kachin State": "Mountain floods & mining debris",
        "Magway Region": "Riverbank erosion & flash floods",
        "Mon State": "Coastal surge & monsoon floods"
    }

    results: List[Dict[str, Any]] = []
    for region_name, group in df_mm.groupby("state_region"):
        total_pop = int(group["population"].sum())
        mean_lat = float(group["latitude"].mean())
        mean_lon = float(group["longitude"].mean())

        default_threat = threat_profiles.get(region_name, "General Emergency")
        active_threat = default_threat
        max_sev = 0.0

        # Scan active live GDACS disasters near this region
        for d in disasters:
            d_lat = float(d.get("lat", 0.0))
            d_lon = float(d.get("lon", 0.0))
            dist = haversine_distance(mean_lat, mean_lon, d_lat, d_lon)
            if dist < 220:
                d_sev = float(d.get("severity", 5.0))
                if d_sev > max_sev:
                    max_sev = d_sev
                    active_threat = str(d.get("title", default_threat))

        # Calculate vulnerability from population scale (1-5) + hazard severity (1-5)
        pop_factor = min(5.0, max(1.5, round((total_pop / 1000000.0) * 1.1, 1)))
        hazard_factor = min(5.0, max(2.5, round((max_sev if max_sev > 0 else 5.0) * 0.5, 1)))
        vuln_score = round(min(10.0, pop_factor + hazard_factor + 1.2), 1)

        # Nearest depot & transit calculation
        best_depot = depots[0]
        min_depot_dist = float("inf")
        for dp in depots:
            dist = haversine_distance(mean_lat, mean_lon, float(dp["lat"]), float(dp["lon"]))
            if dist < min_depot_dist:
                min_depot_dist = dist
                best_depot = dp

        driving_hours = round((min_depot_dist * 1.25) / 55.0 + 0.4, 1)

        # Status badge
        if vuln_score >= 8.5:
            status = "High risk"
            status_class = "tag-critical"
            num_class = "sev-critical"
        elif vuln_score >= 7.0:
            status = "Pre-alert"
            status_class = "tag-warning"
            num_class = "sev-warning"
        else:
            status = "Active watch"
            status_class = "tag-ok"
            num_class = "sev-ok"

        # Format population display (e.g. 2.51M)
        if total_pop >= 1000000:
            pop_str = f"{round(total_pop / 1000000.0, 2)}M"
        else:
            pop_str = f"{round(total_pop / 1000.0)}k"

        results.append({
            "sector": region_name,
            "population": pop_str,
            "population_raw": total_pop,
            "primary_threat": active_threat,
            "vulnerability": vuln_score,
            "vulnerability_class": num_class,
            "nearest_depot": best_depot["name"],
            "land_eta": f"{driving_hours} hrs",
            "status": status,
            "status_class": status_class,
            "townships_count": len(group),
            "data_source": "MIMU Demographics + GDACS Feed"
        })

    # Sort by vulnerability descending
    results.sort(key=lambda x: float(x["vulnerability"]), reverse=True)

    return {"status": "success", "count": len(results), "sectors": results}


_depot_live_reserves: Dict[str, Dict[str, float]] = {
    "Yangon Central Logistics Base": {
        "curr_water": 1150000.0,
        "curr_food": 165000.0,
        "med_kits": 3400.0,
        "max_water": 1200000.0,
        "max_food": 180000.0,
        "max_med": 3400.0,
    },
    "Naypyidaw Strategic Reserve": {
        "curr_water": 1420000.0,
        "curr_food": 235000.0,
        "med_kits": 5100.0,
        "max_water": 1500000.0,
        "max_food": 250000.0,
        "max_med": 5100.0,
    },
    "Mandalay Regional Depot": {
        "curr_water": 820000.0,
        "curr_food": 125000.0,
        "med_kits": 2800.0,
        "max_water": 900000.0,
        "max_food": 140000.0,
        "max_med": 2800.0,
    }
}


class RestockRequest(BaseModel):
    depot_name: Optional[str] = Field(None, description="Name of the depot to restock, or 'all'")


@app.post("/api/depots/restock", tags=["depots"])
async def restock_depots(req: RestockRequest, db: AsyncSession = Depends(get_db)):
    """
    Triggers an emergency logistics restock convoy, replenishing warehouse reserves
    (Potable Water, Food Rations, and Trauma Medical Kits) back to 100% full operational capacity.
    """
    global _depot_live_reserves
    target_name = (req.depot_name or "").strip()
    
    restocked_names = []
    for name, data in _depot_live_reserves.items():
        if not target_name or target_name.lower() in name.lower() or target_name.lower() == "all":
            data["curr_water"] = data["max_water"]
            data["curr_food"] = data["max_food"]
            data["med_kits"] = data["max_med"]
            restocked_names.append(name)
            
    # Also sync database models if present
    try:
        stmt = select(models.RescueDepot)
        res = await db.execute(stmt)
        for dp in res.scalars().all():
            for name in restocked_names:
                if name.lower() in str(dp.name).lower():
                    setattr(dp, "water_inventory", _depot_live_reserves[name]["max_water"])
                    setattr(dp, "food_inventory", _depot_live_reserves[name]["max_food"])
        await db.commit()
    except Exception as db_err:
        print(f"Notice during restock DB commit: {db_err}")

    # Broadcast collaborative event to active dashboards
    try:
        await manager.broadcast({
            "type": "DEPOT_RESTOCKED",
            "depots": restocked_names,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    except Exception:
        pass

    return {
        "status": "success",
        "message": f"Logistics restock convoys successfully dispatched for: {', '.join(restocked_names)}",
        "restocked_depots": restocked_names
    }


@app.get("/api/depot-stock-analytics", tags=["analytics"])
async def get_depot_stock_analytics(db: AsyncSession = Depends(get_db)):
    """
    Dynamically computes warehouse reserves, live disaster demand burn rates, 
    and days of supply remaining for Myanmar's 3 national logistics depots.
    """
    global _depot_live_reserves
    disasters = await fetch_active_disasters()

    depots: List[Dict[str, Any]] = [
        {
            "name": "Yangon Central Logistics Base",
            "role": "Southern delta & maritime hub",
            "lat": 16.8661,
            "lon": 96.1561,
            "max_water": _depot_live_reserves["Yangon Central Logistics Base"]["max_water"],
            "max_food": _depot_live_reserves["Yangon Central Logistics Base"]["max_food"],
            "med_kits": int(_depot_live_reserves["Yangon Central Logistics Base"]["med_kits"]),
            "curr_water": _depot_live_reserves["Yangon Central Logistics Base"]["curr_water"],
            "curr_food": _depot_live_reserves["Yangon Central Logistics Base"]["curr_food"]
        },
        {
            "name": "Naypyidaw Strategic Reserve",
            "role": "National capital strategic stock",
            "lat": 19.7633,
            "lon": 96.0785,
            "max_water": _depot_live_reserves["Naypyidaw Strategic Reserve"]["max_water"],
            "max_food": _depot_live_reserves["Naypyidaw Strategic Reserve"]["max_food"],
            "med_kits": int(_depot_live_reserves["Naypyidaw Strategic Reserve"]["med_kits"]),
            "curr_water": _depot_live_reserves["Naypyidaw Strategic Reserve"]["curr_water"],
            "curr_food": _depot_live_reserves["Naypyidaw Strategic Reserve"]["curr_food"]
        },
        {
            "name": "Mandalay Regional Depot",
            "role": "Northern faultline corridor",
            "lat": 21.9588,
            "lon": 96.0891,
            "max_water": _depot_live_reserves["Mandalay Regional Depot"]["max_water"],
            "max_food": _depot_live_reserves["Mandalay Regional Depot"]["max_food"],
            "med_kits": int(_depot_live_reserves["Mandalay Regional Depot"]["med_kits"]),
            "curr_water": _depot_live_reserves["Mandalay Regional Depot"]["curr_water"],
            "curr_food": _depot_live_reserves["Mandalay Regional Depot"]["curr_food"]
        }
    ]

    for dp in depots:
        daily_burn_water = 0.0
        daily_burn_food = 0.0
        assigned_crises = 0

        for d in disasters:
            d_lat = float(d.get("lat", 0.0))
            d_lon = float(d.get("lon", 0.0))
            dist = haversine_distance(float(dp["lat"]), float(dp["lon"]), d_lat, d_lon)
            if dist < 350:
                d_sev = float(d.get("severity", 5.0))
                spatial = analyze_disaster_impact(d_lat, d_lon, d_sev)
                daily_burn_water += float(spatial.get("total_water_liters") or (d_sev * 12000)) * 0.12
                daily_burn_food += float(spatial.get("total_food_packs") or (d_sev * 2800)) * 0.12
                assigned_crises += 1

        daily_burn_water = max(daily_burn_water, 25000.0)
        daily_burn_food = max(daily_burn_food, 4500.0)

        curr_w = float(dp["curr_water"])
        max_w = float(dp["max_water"])
        curr_f = float(dp["curr_food"])
        max_f = float(dp["max_food"])

        water_pct = int(round((curr_w / max_w) * 100))
        food_pct = int(round((curr_f / max_f) * 100))
        med_pct = int(round((float(dp["med_kits"]) / float(_depot_live_reserves[dp["name"]]["max_med"])) * 100))

        days_remaining = int(round(min(curr_w / daily_burn_water, curr_f / daily_burn_food)))
        days_remaining = max(3, min(days_remaining, 30))

        if days_remaining <= 7:
            tag_class = "tag-critical"
        elif days_remaining <= 15:
            tag_class = "tag-warning"
        else:
            tag_class = "tag-ok"

        dp["water_pct"] = water_pct
        dp["food_pct"] = food_pct
        dp["med_pct"] = med_pct
        dp["days_remaining"] = f"{days_remaining} days"
        dp["tag_class"] = tag_class
        dp["assigned_crises"] = assigned_crises
        dp["water_display"] = f"{round(curr_w/1000)}k / {round(max_w/1000000, 1)}M L"
        dp["food_display"] = f"{round(curr_f/1000)}k / {round(max_f/1000)}k packs"

    return {"status": "success", "count": len(depots), "depots": depots}


@app.get("/api/transport-analytics", tags=["analytics"])
async def get_transport_analytics(db: AsyncSession = Depends(get_db)):
    """
    Computes dynamic multi-modal fleet analytics, active dispatch corridors,
    and transit time vs distance trade-off distributions across all live active disasters.
    """
    disasters = await fetch_active_disasters()
    if not disasters:
        stmt = select(models.DisasterEvent)
        res = await db.execute(stmt)
        disasters = [
            {
                "lat": float(cast(Any, e.latitude) or 0.0),
                "lon": float(cast(Any, e.longitude) or 0.0),
                "severity": float(cast(Any, e.severity) or 5.0),
                "title": str(cast(Any, e.title) or "Disaster Event")
            }
            for e in res.scalars().all()
        ]

    # Pre-fetch depots
    stmt_depots = select(models.RescueDepot)
    res_depots = await db.execute(stmt_depots)
    depots = res_depots.scalars().all()
    depot_list = [
        {
            "name": str(cast(Any, d.name) or "Relief Depot"),
            "lat": float(cast(Any, d.latitude) or 0.0),
            "lon": float(cast(Any, d.longitude) or 0.0)
        }
        for d in depots
    ] if depots else [
        {"name": "Yangon Central Logistics Base", "lat": 16.8661, "lon": 96.1561},
        {"name": "Naypyidaw Strategic Reserve", "lat": 19.7633, "lon": 96.0785},
        {"name": "Mandalay Regional Depot", "lat": 21.9588, "lon": 96.0891}
    ]

    total_land = 0
    total_air = 0
    total_water = 0
    total_payload_tons = 0.0
    total_transport_budget = 0.0

    corridors = []
    
    # Distance points for real dynamic trade-off curves
    distance_points = [25, 50, 100, 150, 200, 300, 400]
    distance_curves = []
    for dp in distance_points:
        eta_calc = calculate_multimodal_eta(dp, severity=6.0)
        distance_curves.append({
            "distance_km": dp,
            "land_hours": eta_calc["modes"]["land"]["total_hours"],
            "air_hours": eta_calc["modes"]["air"]["total_hours"],
            "water_hours": eta_calc["modes"]["water"]["total_hours"]
        })

    for d in disasters:
        d_lat = float(d.get("lat", 0.0))
        d_lon = float(d.get("lon", 0.0))
        d_sev = float(d.get("severity", 5.0))
        d_title = str(d.get("title", "Disaster Alert"))

        # Find nearest depot
        min_dist = float("inf")
        best_depot = depot_list[0]
        for dp in depot_list:
            dist = haversine_distance(float(dp["lat"]), float(dp["lon"]), d_lat, d_lon)
            if dist < min_dist:
                min_dist = dist
                best_depot = dp

        eta_res = calculate_multimodal_eta(min_dist, severity=d_sev, disaster_title=d_title, lat=d_lat, lon=d_lon)
        mode = eta_res.get("recommended_mode", "land")
        if mode == "air":
            total_air += 1
        elif mode == "water":
            total_water += 1
        else:
            total_land += 1

        spatial = analyze_disaster_impact(d_lat, d_lon, d_sev)
        w_liters = float(spatial.get("total_water_liters") or (d_sev * 15000))
        f_packs = float(spatial.get("total_food_packs") or (d_sev * 3500))
        payload_tons = round((w_liters * 0.001) + (f_packs * 0.0008), 1)
        total_payload_tons += payload_tons

        # Cost: Land ~$1.20/ton-km, Air ~$8.50/ton-km, Water ~$0.80/ton-km
        cost_rate = 8.50 if mode == "air" else (0.80 if mode == "water" else 1.20)
        cost_usd = round(payload_tons * min_dist * cost_rate)
        total_transport_budget += cost_usd

        mode_badge_class = "tag-critical" if mode == "air" else ("tag-ok" if mode == "water" else "tag-warning")

        corridors.append({
            "origin": best_depot["name"],
            "destination": d_title,
            "continent": _classify_region(d_lat, d_lon, d_title),
            "distance_km": round(min_dist, 1),
            "payload_tons": payload_tons,
            "recommended_mode": mode.capitalize(),
            "mode_badge_class": mode_badge_class,
            "land_eta": eta_res["modes"]["land"]["formatted_time"],
            "air_eta": eta_res["modes"]["air"]["formatted_time"],
            "water_eta": eta_res["modes"]["water"]["formatted_time"],
            "est_cost_usd": cost_usd,
            "severity": d_sev
        })

    # Sort corridors by severity & distance for top active emergency corridors
    corridors.sort(key=lambda x: (x["severity"], -x["distance_km"]), reverse=True)

    transport_modes = [
        {
            "mode": "Land heavy convoy",
            "platform": "6×6 all-terrain trucks",
            "avg_speed": "45 km/h",
            "payload": "18.0 t",
            "cost_per_ton_km": "$1.20",
            "weather_risk": "Moderate",
            "risk_class": "tag-warning",
            "active_dispatches": total_land
        },
        {
            "mode": "Air helicopter / airdrop",
            "platform": "Mil Mi-17 & Bell 412",
            "avg_speed": "220 km/h",
            "payload": "3.5 t",
            "cost_per_ton_km": "$8.50",
            "weather_risk": "High (wind / rain)",
            "risk_class": "tag-critical",
            "active_dispatches": total_air
        },
        {
            "mode": "River & delta barge",
            "platform": "Ayeyarwady flotilla",
            "avg_speed": "28 km/h",
            "payload": "25.0 t",
            "cost_per_ton_km": "$0.80",
            "weather_risk": "Low (flood proof)",
            "risk_class": "tag-ok",
            "active_dispatches": total_water
        }
    ]

    return {
        "status": "success",
        "total_active_crises": len(disasters),
        "fleet_summary": {
            "land_convoys": total_land,
            "air_airlifts": total_air,
            "water_barges": total_water,
            "total_payload_tons": round(total_payload_tons, 1),
            "total_transport_budget_usd": round(total_transport_budget)
        },
        "transport_modes": transport_modes,
        "distance_curves": distance_curves,
        "active_corridors": corridors[:20]
    }


@app.get("/api/nearest-depot", tags=["routing"])
async def nearest_depot(lat: float, lon: float, severity: float = 5.0, title: str = "", db: AsyncSession = Depends(get_db)):
    """
    Finds and returns the nearest RescueDepot to a given coordinate using Haversine distance.
    Includes multi-modal transport ETA calculations (Land, Air, Water).
    """
    result = await find_nearest_depot(target_lat=lat, target_lon=lon, db=db, severity=severity, disaster_title=title)
    return result


@app.get("/api/route-navigation", tags=["routing"])
async def route_navigation(
    target_lat: float,
    target_lon: float,
    depot_id: Optional[int] = None,
    mode: str = "land",
    severity: float = 5.0,
    title: str = "Disaster Epicenter",
    db: AsyncSession = Depends(get_db)
):
    """
    Generates detailed, high-precision turn-by-turn Grab-style route navigation data.
    Provides highway driving waypoints, aviation direct vectors, or marine navigation paths.
    """
    # 1. Identify depot
    depot_res = await find_nearest_depot(target_lat=target_lat, target_lon=target_lon, db=db, severity=severity, disaster_title=title)
    nearest_depot = depot_res.get("nearest_depot") or {}
    
    depot_lat = float(nearest_depot.get("latitude", 16.8661))
    depot_lon = float(nearest_depot.get("longitude", 96.1561))
    depot_name = str(nearest_depot.get("name", "Yangon Central Logistics Base"))

    nav_data = await get_detailed_turn_by_turn_route(
        depot_lat=depot_lat,
        depot_lon=depot_lon,
        target_lat=target_lat,
        target_lon=target_lon,
        mode=mode,
        depot_name=depot_name,
        disaster_title=title,
        severity=severity
    )
    
    nav_data["nearest_depot_info"] = nearest_depot
    return {
        "status": "success",
        "navigation": nav_data
    }


@app.get("/api/myanmar-live-feed", tags=["disasters"])
async def myanmar_live_feed():
    """
    Returns filtered, prioritized live disaster telemetry across Myanmar's 15 states/regions
    with alert levels and assigned response depots.
    """
    disasters = await fetch_active_disasters()
    myanmar_events = []
    
    for d in disasters:
        lat = float(d.get("lat", 0.0))
        lon = float(d.get("lon", 0.0))
        title = str(d.get("title", ""))
        sev = float(d.get("severity", 5.0))
        
        region = _classify_region(lat, lon, title)
        # Filter Myanmar and immediate border corridor events
        is_myanmar = (
            "myanmar" in title.lower() or 
            "burma" in title.lower() or
            (9.0 <= lat <= 28.5 and 92.0 <= lon <= 101.5) or
            ("central (" in region.lower() or "valley" in region.lower() or "delta" in region.lower() or "plateau" in region.lower() or "mountain" in region.lower() or "mon" in region.lower() or "rakhine" in region.lower())
        )
        
        if is_myanmar:
            alert_level = "Red Alert (Severe)" if sev >= 7.0 else ("Orange Warning (Elevated)" if sev >= 5.0 else "Yellow Advisory")
            myanmar_events.append({
                "title": title,
                "latitude": lat,
                "longitude": lon,
                "severity": sev,
                "event_type": _classify_event_type(title),
                "region": region,
                "alert_level": alert_level,
                "created_at": d.get("created_at")
            })
            
    # Sort by severity descending
    myanmar_events.sort(key=lambda x: x["severity"], reverse=True)
    
    return {
        "status": "success",
        "total_myanmar_events": len(myanmar_events),
        "events": myanmar_events
    }


async def build_emergency_payload(disaster_event: Any, db: AsyncSession) -> Dict[str, Any]:
    """
    Merges 50km radius spatial demographic impact analysis with assigned nearest depot routing.
    Restricts supply logistics routing and spatial calculations exclusively to events within ASEAN bounds.
    """
    if isinstance(disaster_event, dict):
        evt_id = disaster_event.get("id", 1)
        title = str(disaster_event.get("title", "Emergency Disaster Epicenter"))
        lat = float(disaster_event.get("latitude") or disaster_event.get("lat") or 0.0)
        lon = float(disaster_event.get("longitude") or disaster_event.get("lon") or 0.0)
        severity = float(disaster_event.get("severity", 5.0))
        created_at = str(disaster_event.get("created_at") or datetime.now(timezone.utc).isoformat())
    else:
        evt_id = getattr(disaster_event, "id", 1)
        title = str(getattr(disaster_event, "title", "Emergency Disaster Epicenter"))
        lat = cast(float, getattr(disaster_event, "latitude", 0.0))
        lon = cast(float, getattr(disaster_event, "longitude", 0.0))
        severity = cast(float, getattr(disaster_event, "severity", 5.0))
        created_at_val = getattr(disaster_event, "created_at", None)
        created_at = created_at_val.isoformat() if created_at_val else datetime.now(timezone.utc).isoformat()

    spatial = analyze_disaster_impact(lat, lon, severity)
    depot_res = await find_nearest_depot(target_lat=lat, target_lon=lon, db=db, severity=severity, disaster_title=title)
    nearest_depot_info = depot_res.get("nearest_depot", None)
    affected_population = spatial.get("affected_population", 0)
    total_water_liters = spatial.get("total_water_liters", 0.0)
    total_food_packs = spatial.get("total_food_packs", 0.0)

    return {
        "id": evt_id,
        "title": title,
        "latitude": lat,
        "longitude": lon,
        "severity": severity,
        "created_at": created_at,
        "affected_population": affected_population,
        "total_water_liters": total_water_liters,
        "total_food_packs": total_food_packs,
        "nearest_depot": nearest_depot_info
    }


async def poll_gdacs_loop():
    """
    Background task that continuously polls GDACS for real disasters,
    saves non-duplicate records for all global events to the database,
    and broadcasts payloads for ASEAN events into the SSE stream queue.
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

                        stmt = select(models.DisasterEvent).where(
                            models.DisasterEvent.latitude == lat,
                            models.DisasterEvent.longitude == lon
                        )
                        res = await db.execute(stmt)
                        existing = res.scalars().first()

                        if not existing:
                            dt_val = parse_created_at(d.get("created_at"))
                            event = models.DisasterEvent(
                                title=title,
                                latitude=lat,
                                longitude=lon,
                                severity=severity,
                                created_at=dt_val
                            )
                            db.add(event)
                            await db.commit()
                            await db.refresh(event)

                            payload = await build_emergency_payload(event, db)

                            if is_within_asean(lat, lon):
                                pred = models.ReliefPrediction(
                                    disaster_id=event.id,
                                    water_liters=payload.get("total_water_liters", 0.0),
                                    food_packs=payload.get("total_food_packs", 0.0)
                                )
                                db.add(pred)
                                await db.commit()

                                await sse_event_queue.put(payload)
                                print(f"[GDACS Background Poller] Queued live emergency payload for ASEAN event: {title}")
                    except Exception as item_err:
                        print(f"[GDACS Background Poller] Notice for item: {item_err}")
        except asyncio.CancelledError:
            print("[GDACS Background Poller] Polling task gracefully cancelled.")
            break
        except Exception as poll_err:
            print(f"[GDACS Background Poller] Polling cycle notice: {poll_err}")

        try:
            await asyncio.sleep(60)
        except asyncio.CancelledError:
            print("[GDACS Background Poller] Interrupted sleep for clean application exit.")
            break


@app.get("/api/stream-disasters", tags=["stream"])
async def stream_disasters():
    """
    Server-Sent Events (SSE) stream endpoint pushing high-priority live emergency disaster events
    within ASEAN regions with spatial demographic impact calculations.
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
                    async with AsyncSessionLocal() as db:
                        stmt = select(models.DisasterEvent).order_by(models.DisasterEvent.id.desc())
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


@app.get("/api/datasets", tags=["data"])
async def list_datasets():
    """Returns a list of all CSV datasets available in the backend."""
    import glob
    import os
    
    csv_files = glob.glob(os.path.join(BASE_DIR, "*.csv"))
    return {"datasets": [os.path.basename(f) for f in csv_files]}


@app.get("/api/datasets/{filename}", tags=["data"])
async def get_dataset(filename: str):
    """Returns the raw CSV content of the specified dataset."""
    import os
    from fastapi.responses import FileResponse, PlainTextResponse
    
    # Simple security check to prevent directory traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        return PlainTextResponse("Invalid filename", status_code=400)
        
    if not filename.endswith(".csv"):
        filename += ".csv"
        
    target_path = os.path.join(BASE_DIR, filename)
    if not os.path.exists(target_path):
        return PlainTextResponse(f"Dataset {filename} not found", status_code=404)
        
    return FileResponse(target_path, media_type="text/csv", filename=filename)


# Mount frontend static assets for unified single-port hosting with disabled cache for live development
@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.endswith((".html", ".js", ".css")) or request.url.path == "/" or request.url.path == "/analytics":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

frontend_dir = os.path.join(BASE_DIR, "..", "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)


