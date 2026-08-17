import asyncio
import os
import sys
sys.path.append(os.path.abspath("backend"))

from database import AsyncSessionLocal, init_db_schema
from main import dashboard_data
from ml_model import predict_rescue_needs

async def test():
    await init_db_schema()
    async with AsyncSessionLocal() as db:
        res = await dashboard_data(db)
        events = res.get('dashboard_data', []) if isinstance(res, dict) else []
        asean_events = []
        if isinstance(events, list):
            print(f"Total Active Events in DB: {len(events)}\n")
            
            for evt in events:
                lat, lon = float(evt['latitude']), float(evt['longitude'])
                if -11.0 <= lat <= 28.5 and 90.0 <= lon <= 141.0:
                    pred = predict_rescue_needs(severity=float(evt['severity']), affected_people=5000, lat=lat, lon=lon)
                    asean_events.append({
                        'title': evt['title'],
                        'lat': lat,
                        'lon': lon,
                        'severity': evt['severity'],
                        'depot': pred['nearest_depot_name'],
                        'dist_km': pred['distance_km'],
                        'travel_hrs': pred['dispatch_travel_hours'],
                        'total_time_hrs': pred['estimated_rescue_time']
                    })
        
        print(f"Found {len(asean_events)} events in ASEAN region:\n")
        for i, item in enumerate(asean_events, 1):
            print(f"{i}. {item['title']}")
            print(f"   - Coords: ({item['lat']:.2f}, {item['lon']:.2f})")
            print(f"   - Assigned Depot: {item['depot']}")
            print(f"   - Distance: {item['dist_km']} km")
            print(f"   - Convoy Travel Time: {item['travel_hrs']} hrs")
            print(f"   - Total Est. Rescue Time: {item['total_time_hrs']} hrs")
            print("-" * 65)

asyncio.run(test())
