import os
import asyncio
import pandas as pd
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from database import engine, Base, get_db, AsyncSessionLocal
from models import Demographics, HistoricalDisaster
from sqlalchemy.ext.asyncio import AsyncSession

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEMOGRAPHICS_CSV = os.path.join(BASE_DIR, "mimu_demographics_realistic.csv")
DISASTERS_CSV = os.path.join(BASE_DIR, "emdat_disasters_realistic.csv")

async def init_db():
    async with engine.begin() as conn:
        # Create all tables (ensure PostGIS is enabled in your database beforehand!)
        await conn.run_sync(Base.metadata.create_all)
        print("Database tables initialized.")

async def ingest_demographics(db: AsyncSession):
    if not os.path.exists(DEMOGRAPHICS_CSV):
        print(f"File not found: {DEMOGRAPHICS_CSV}")
        return
    
    df = pd.read_csv(DEMOGRAPHICS_CSV)
    print(f"Ingesting {len(df)} demographic records...")
    
    # Simple batch ingestion
    for _, row in df.iterrows():
        lat = row['latitude']
        lon = row['longitude']
        # WKT String for point
        geom_wkt = f"SRID=4326;POINT({lon} {lat})"
        
        demo = Demographics(
            pcode=str(row['pcode']),
            township_name=str(row['township_name']),
            latitude=lat,
            longitude=lon,
            geom=geom_wkt,
            total_population=int(row['total_population'])
        )
        db.add(demo)
    
    await db.commit()
    print("Demographics ingestion completed.")

async def ingest_disasters(db: AsyncSession):
    if not os.path.exists(DISASTERS_CSV):
        print(f"File not found: {DISASTERS_CSV}")
        return
    
    df = pd.read_csv(DISASTERS_CSV)
    print(f"Ingesting {len(df)} historical disaster records into HistoricalRescueOp...")
    
    for _, row in df.iterrows():
        lat = row['latitude']
        lon = row['longitude']
        geom_wkt = f"SRID=4326;POINT({lon} {lat})"
        
        from models import HistoricalRescueOp
        hd = HistoricalRescueOp(
            event_type=str(row['event_type']),
            latitude=lat,
            longitude=lon,
            geom=geom_wkt,
            severity=float(row['severity_scale']),
            affected_people=int(row['actual_affected_population']),
            water_used_liters=float(row['water_liters_distributed']),
            food_used_packs=float(row['food_packs_distributed']),
            rescue_time_hours=float(row['avg_rescue_time_hours'])
        )
        db.add(hd)
        
    await db.commit()
    print("Historical disasters ingestion completed.")

async def main():
    await init_db()
    async with AsyncSessionLocal() as db:
        # Clear existing for fresh ingestion (Optional)
        # await db.execute(text("TRUNCATE TABLE demographics, historical_disasters RESTART IDENTITY CASCADE"))
        # await db.commit()
        
        await ingest_demographics(db)
        await ingest_disasters(db)

if __name__ == "__main__":
    asyncio.run(main())
