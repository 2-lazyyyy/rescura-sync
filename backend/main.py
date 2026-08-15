import asyncio
import json
import os
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any, cast
from pydantic import BaseModel, Field
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
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
from routing import find_nearest_depot, haversine_distance
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
                                sos_item.status = "dispatched"
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


@app.get("/api/dashboard-data", tags=["dashboard"])
async def dashboard_data(db: AsyncSession = Depends(get_db)):
    """
    Returns up-to-date live disasters prioritizing Myanmar & regional emergencies.
    """
    disasters = await fetch_active_disasters()

    depots_stmt = select(models.RescueDepot)
    depots_res = await db.execute(depots_stmt)
    all_depots = depots_res.scalars().all()

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

        ml_pred = predict_rescue_needs(severity=sev_val, affected_people=affected_pop, lat=lat_val, lon=lon_val)
        base_rescue_time = ml_pred.get("estimated_rescue_time", 4.5)

        nearest_depot_info: Optional[Dict[str, Any]] = None
        if all_depots:
            def get_depot_dist(dp: Any) -> float:
                d_lat = float(getattr(dp, "latitude", 0.0) or 0.0)
                d_lon = float(getattr(dp, "longitude", 0.0) or 0.0)
                return haversine_distance(lat_val, lon_val, d_lat, d_lon)

            closest_depot = min(all_depots, key=get_depot_dist)
            c_lat = float(getattr(closest_depot, "latitude", 0.0) or 0.0)
            c_lon = float(getattr(closest_depot, "longitude", 0.0) or 0.0)
            dist = haversine_distance(lat_val, lon_val, c_lat, c_lon)
            nearest_depot_info = {
                "id": closest_depot.id,
                "name": closest_depot.name,
                "latitude": c_lat,
                "longitude": c_lon,
                "water_inventory": float(getattr(closest_depot, "water_inventory", 0.0) or 0.0),
                "food_inventory": float(getattr(closest_depot, "food_inventory", 0.0) or 0.0),
                "distance_km": round(dist, 2)
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

    return {"status": "success", "count": len(payload), "dashboard_data": payload}


@app.get("/api/export-report/{event_id}", tags=["reports"])
async def export_action_plan_pdf(event_id: int, db: AsyncSession = Depends(get_db)):
    """
    Generates an enterprise-grade Emergency Action Plan PDF report for a given disaster event ID.
    Returns the PDF binary as a downloadable attachment.
    """
    stmt = (
        select(models.DisasterEvent)
        .options(selectinload(models.DisasterEvent.predictions))
        .where(models.DisasterEvent.id == event_id)
    )
    result = await db.execute(stmt)
    evt = result.scalars().first()

    if not evt:
        stmt_latest = select(models.DisasterEvent).order_by(models.DisasterEvent.id.desc())
        res_latest = await db.execute(stmt_latest)
        evt = res_latest.scalars().first()

    if not evt:
        raise HTTPException(status_code=404, detail="Disaster event not found.")

    lat_val = float(evt.latitude) if evt.latitude is not None else 0.0
    lon_val = float(evt.longitude) if evt.longitude is not None else 0.0
    sev_val = float(evt.severity) if evt.severity is not None else 5.0

    evt_id = int(getattr(evt, "id", 1))
    evt_title = str(getattr(evt, "title", "Emergency Disaster Zone"))

    spatial = analyze_disaster_impact(lat_val, lon_val, sev_val)
    w_val = float(spatial.get("total_water_liters") or (sev_val * 15000.0))
    f_val = float(spatial.get("total_food_packs") or (sev_val * 4000.0))
    w_liters = round(w_val)
    f_packs = round(f_val)
    affected_pop = int(spatial.get("affected_population") or 5000)
    total_budget = float(spatial.get("total_estimated_budget_usd") or round((w_liters * 0.5) + (f_packs * 3.5), 2))

    ml_pred = predict_rescue_needs(severity=sev_val, affected_people=affected_pop, lat=lat_val, lon=lon_val)
    base_rescue_time = float(ml_pred.get("estimated_rescue_time", 4.5))

    depot_res = await find_nearest_depot(target_lat=lat_val, target_lon=lon_val, db=db)
    nearest_depot_info = depot_res.get("nearest_depot", {}) if is_within_asean(lat_val, lon_val) else None

    dispatch_hours = 0.0
    depot_name = "Out of ASEAN Dispatch Zone"
    distance_km = 0.0
    if nearest_depot_info and isinstance(nearest_depot_info, dict) and "distance_km" in nearest_depot_info:
        dispatch_hours = round(float(nearest_depot_info.get("distance_km", 0.0)) / 45.0, 1)
        depot_name = str(nearest_depot_info.get("name", "Assigned Depot"))
        distance_km = float(nearest_depot_info.get("distance_km", 0.0))

    total_rescue_time = round(base_rescue_time + dispatch_hours, 1)
    evt_created = getattr(evt, "created_at", None)
    occurred_str = evt_created.strftime("%b %d, %Y, %H:%M UTC") if evt_created else "Aug 9, 2026, 17:15 UTC"

    if FPDF is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PDF generation is unavailable because 'fpdf2' package is not installed."
        )

    pdf = FPDF()
    pdf.add_page()

    # Header Bar
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
    pdf.cell(0, 10, f"Event: {evt_title}", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 6, f"Report ID: RES-EAP-{evt_id:04d}  |  Occurred: {occurred_str}", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(6)

    # Section 1: Emergency Characteristics
    pdf.set_fill_color(241, 245, 249)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(182, 8, "  1. EMERGENCY CHARACTERISTICS & DISPATCH ZONE", new_x="LMARGIN", new_y="NEXT", fill=True)
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 10)
    pdf.cell(91, 7, f"  Coordinates: {lat_val:.4f}, {lon_val:.4f}", border=1)
    pdf.cell(91, 7, f"  Severity Index: SEV {sev_val}/10", border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.cell(91, 7, f"  Affected Population: {affected_pop:,} people", border=1)
    pdf.cell(91, 7, f"  Est. Rescue Time: {total_rescue_time} hours", border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.cell(182, 7, f"  Assigned Supply Depot: {depot_name} ({distance_km} km)", border=1, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # Section 2: Financial Cost Engine & Supply Logistics
    pdf.set_fill_color(241, 245, 249)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(182, 8, "  2. FINANCIAL COST ENGINE & HUMANITARIAN ALLOCATIONS", new_x="LMARGIN", new_y="NEXT", fill=True)
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 10)
    pdf.cell(91, 7, f"  Clean Water Required: {w_liters:,} Liters ($0.50/L)", border=1)
    pdf.cell(91, 7, f"  Est. Water Budget: ${w_liters * 0.5:,.2f} USD", border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.cell(91, 7, f"  Food Packs Required: {f_packs:,} Packs ($3.50/Pack)", border=1)
    pdf.cell(91, 7, f"  Est. Food Budget: ${f_packs * 3.5:,.2f} USD", border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.set_fill_color(224, 231, 255)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(30, 58, 138)
    pdf.cell(182, 9, f"  TOTAL ESTIMATED ALLOCATION BUDGET: ${total_budget:,.2f} USD", border=1, new_x="LMARGIN", new_y="NEXT", fill=True)

    pdf.ln(6)

    # Section 3: Operational Directives
    pdf.set_fill_color(241, 245, 249)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(182, 8, "  3. OPERATIONAL DISPATCH DIRECTIVES", new_x="LMARGIN", new_y="NEXT", fill=True)
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(71, 85, 105)
    directives = [
        "1. Dispatch supply convoys along optimal GIS evacuation road nodes upon order authorization.",
        "2. Ensure water distribution meets Sphere Project minimum standard of 20 Liters per person/day.",
        "3. Monitor mobile civilian SOS signal alerts within 50km radius to prioritize high-vulnerability clusters.",
        "4. Maintain real-time telemetry sync with Rescura Sync SAC Control Center."
    ]
    for d in directives:
        pdf.cell(182, 6, f"  {d}", new_x="LMARGIN", new_y="NEXT")

    raw_output = pdf.output()
    pdf_bytes = bytes(raw_output) if not isinstance(raw_output, bytes) else raw_output
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=Rescura_Sync_Action_Plan_Event_{evt_id}.pdf"
        }
    )


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
async def nearest_depot(lat: float, lon: float, severity: float = 5.0, title: str = "", db: AsyncSession = Depends(get_db)):
    """
    Finds and returns the nearest RescueDepot to a given coordinate using Haversine distance.
    Includes multi-modal transport ETA calculations (Land, Air, Water).
    """
    result = await find_nearest_depot(target_lat=lat, target_lon=lon, db=db, severity=severity, disaster_title=title)
    return result


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


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)


