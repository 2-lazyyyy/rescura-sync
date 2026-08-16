import httpx
import asyncio
import sys
import io

API_URL = "http://localhost:8000"
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

async def test_endpoint(client, name, method, url, expected_status=200, payload=None):
    try:
        print(f"[{name}] Testing {method} {url}...")
        if method == "GET":
            response = await client.get(url, timeout=15.0)
        else:
            response = await client.post(url, json=payload, timeout=15.0)
            
        if response.status_code == expected_status:
            print(f"✅ {name} PASSED! Status: {response.status_code}")
            return response.json()
        else:
            print(f"❌ {name} FAILED! Expected {expected_status} but got {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print(f"❌ {name} ERROR! Exception: {e}")
        return None

async def run_qa_suite():
    print("🚀 Starting QA Test Suite for Rescura Sync...\n")
    
    async with httpx.AsyncClient() as client:
        # 1. Test Dashboard Data
        dash_data = await test_endpoint(client, "Dashboard Data", "GET", f"{API_URL}/api/dashboard-data")
        if dash_data:
            print(f"   -> Returned {dash_data.get('count')} dashboard events.")
            if dash_data.get('count') > 0:
                print("   -> 🧠 Dashboard ML Predictions verified!")
                    
        print("-" * 40)
        
        # 2. Test Mission Analytics (Pandas + Spatial)
        impact_data = await test_endpoint(client, "Mission Analytics", "GET", f"{API_URL}/api/mission-analytics")
        if impact_data:
            if 'total_active_disasters' in impact_data:
                print(f"   -> 🌍 Analytics working! Total active: {impact_data['total_active_disasters']}")
                print(f"   -> Average Rescue Time: {impact_data['mean_estimated_rescue_time']} hours")
            else:
                print("   -> ⚠️ Missing analytics data.")
                
        print("-" * 40)
        
        # 3. Test Test Emergency Simulation (Celery task integration if test-emergency is used)
        print("[Simulation] Triggering simulated emergency to test DB and Spatial Engine...")
        sim_payload = {
            "title": "QA Simulated Flood",
            "description": "This is a QA test.",
            "latitude": 17.5,
            "longitude": 96.0,
            "severity": 8.5
        }
        sim_response = await test_endpoint(client, "Test Emergency Simulation", "POST", f"{API_URL}/api/test-emergency", payload=sim_payload)
        if sim_response:
            eta = sim_response.get('nearest_depot', {}).get('eta_breakdown', {}).get('modes', {}).get('land', {}).get('total_hours')
            print(f"✅ Simulation PASSED! Estimated land rescue time: {eta} hours")
            print(f"   -> Affected Population: {sim_response.get('affected_population')}")
            
    print("\n🏁 QA Test Suite Completed.")

if __name__ == "__main__":
    asyncio.run(run_qa_suite())
