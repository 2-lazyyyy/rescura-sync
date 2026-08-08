import asyncio
import os
import sys
sys.path.append(os.path.abspath("backend"))

from database import AsyncSessionLocal
from main import dashboard_data
from ml_model import predict_rescue_needs

async def test():
    async with AsyncSessionLocal() as db:
        res = await dashboard_data(db)
        events = res.get('dashboard_data', [])
        print(f"Total Active Events in DB: {len(events)}\n")
        
        asean_events = []
        for evt in events:
            lat, lon = evt['latitude'], evt['longitude']
            if -11.0 <= lat <= 28.5 and 90.0 <= lon <= 141.0:
                pred = predict_rescue_needs(severity=evt['severity'], affected_people=5000, lat=lat, lon=lon)
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
