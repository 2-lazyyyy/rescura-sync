import unittest
from fastapi.testclient import TestClient
import sys
import os
import logging

# Suppress verbose logging for clean test output
logging.getLogger("httpx").setLevel(logging.WARNING)

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app

client = TestClient(app)

class TestRescuraSyncAPI(unittest.TestCase):

    def test_01_api_status(self):
        print("Testing /api/status endpoint...")
        with TestClient(app) as client:
            response = client.get("/api/status")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["status"], "online")
        print("[PASS] Status Check Passed")

    def test_02_health_check(self):
        print("Testing /health endpoint...")
        with TestClient(app) as client:
            response = client.get("/health")
            self.assertEqual(response.status_code, 200)
            self.assertIn("status", response.json())
        print("[PASS] Health Check Passed")

    def test_03_mission_feedback_mlops(self):
        print("Testing /api/mission-feedback (MLOps Continuous Learning)...")
        payload = {
            "event_title": "Test Automated Flood Rescue",
            "severity": 8.5,
            "latitude": 17.5,
            "longitude": 96.2,
            "event_type": "Flood",
            "terrain": "Delta_Coastal",
            "actual_rescue_time_hours": 18.5
        }
        with TestClient(app) as client:
            response = client.post("/api/mission-feedback", json=payload)
            self.assertEqual(response.status_code, 200)
            self.assertIn("status", response.json())
            self.assertEqual(response.json()["status"], "success")
        print("[PASS] MLOps Feedback Loop Passed")

    def test_04_inventory_hubs_and_summary(self):
        print("Testing /api/inventory/hubs endpoint...")
        with TestClient(app) as client:
            response = client.get("/api/inventory/hubs")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["status"], "success")
            self.assertGreaterEqual(len(data["hubs"]), 3)
            self.assertIn("summary", data)
            self.assertIn("total_water_liters", data["summary"])
        print("[PASS] Hub Inventory Status & Summary Passed")

    def test_05_inventory_intake_and_issue(self):
        print("Testing /api/inventory/intake and /api/inventory/issue endpoints...")
        with TestClient(app) as client:
            # 1. Intake
            intake_payload = {
                "hub_id": 1,
                "item_category": "water",
                "quantity": 10000,
                "source": "WFP Water Tanker Unit",
                "reference_code": "TEST-WB-01",
                "operator_name": "Test Officer",
                "notes": "Testing inbound intake"
            }
            res_in = client.post("/api/inventory/intake", json=intake_payload)
            self.assertEqual(res_in.status_code, 200)
            data_in = res_in.json()
            self.assertEqual(data_in["status"], "success")

            # 2. Issue
            issue_payload = {
                "hub_id": 1,
                "item_category": "water",
                "quantity": 5000,
                "destination": "Test Field Evacuation Point",
                "reference_code": "TEST-OUT-01",
                "operator_name": "Test Officer",
                "notes": "Testing outbound issue"
            }
            res_out = client.post("/api/inventory/issue", json=issue_payload)
            self.assertEqual(res_out.status_code, 200)
            data_out = res_out.json()
            self.assertEqual(data_out["status"], "success")
        print("[PASS] Inventory Intake and Issue Passed")

    def test_06_inventory_adjust_and_transactions(self):
        print("Testing /api/inventory/adjust and /api/inventory/transactions endpoints...")
        with TestClient(app) as client:
            # 1. Adjust
            adj_payload = {
                "hub_id": 1,
                "item_category": "medical",
                "new_quantity": 3500,
                "reason": "Test physical recount count",
                "reference_code": "TEST-AUD-01",
                "operator_name": "Test Inspector"
            }
            res_adj = client.post("/api/inventory/adjust", json=adj_payload)
            self.assertEqual(res_adj.status_code, 200)
            self.assertEqual(res_adj.json()["status"], "success")

            # 2. Transactions
            res_tx = client.get("/api/inventory/transactions?hub_id=1")
            self.assertEqual(res_tx.status_code, 200)
            tx_data = res_tx.json()
            self.assertEqual(tx_data["status"], "success")
            self.assertGreaterEqual(len(tx_data["transactions"]), 1)
        print("[PASS] Inventory Adjust & Transaction Ledger Passed")

    def test_07_inventory_analytics_trends(self):
        print("Testing /api/inventory/analytics/trends endpoint...")
        with TestClient(app) as client:
            res = client.get("/api/inventory/analytics/trends")
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["status"], "success")
            self.assertIn("trajectories", data)
            self.assertIn("velocity", data)
        print("[PASS] Inventory Analytics Trends Passed")

    def test_08_disaster_dispatch_and_stock_deduction(self):
        print("Testing /api/disaster/dispatch endpoint and Hub stock deduction...")
        with TestClient(app) as client:
            # 1. Fetch initial hub stock
            hub_res1 = client.get("/api/inventory/hubs")
            self.assertEqual(hub_res1.status_code, 200)
            initial_water = hub_res1.json()["hubs"][0]["water"]["current"]
            initial_food = hub_res1.json()["hubs"][0]["food"]["current"]

            # 2. Dispatch supplies to disaster
            disp_payload = {
                "disaster_identifier": "bagofloodzone_17.33_96.48",
                "disaster_title": "Bago Division Flash Flood Emergency",
                "latitude": 17.33,
                "longitude": 96.48,
                "severity": 8.0,
                "hub_id": 1,
                "water_liters": 25000,
                "food_packs": 4000,
                "medical_kits": 150,
                "notes": "Emergency relief convoy Alpha-1"
            }
            disp_res = client.post("/api/disaster/dispatch", json=disp_payload)
            self.assertEqual(disp_res.status_code, 200)
            disp_data = disp_res.json()
            self.assertEqual(disp_data["status"], "success")
            self.assertEqual(disp_data["mission_status"], "Dispatched")

            # 3. Verify stock deducted from Hub 1
            hub_res2 = client.get("/api/inventory/hubs")
            self.assertEqual(hub_res2.status_code, 200)
            updated_water = hub_res2.json()["hubs"][0]["water"]["current"]
            updated_food = hub_res2.json()["hubs"][0]["food"]["current"]
            self.assertEqual(updated_water, initial_water - 25000)
            self.assertEqual(updated_food, initial_food - 4000)
        print("[PASS] Disaster Dispatch and Stock Deduction Passed")

    def test_09_disaster_overlay_persistence(self):
        print("Testing /api/dashboard-data mission overlay & /api/disaster/missions...")
        with TestClient(app) as client:
            # 1. Check dashboard-data includes mission metadata
            dash_res = client.get("/api/dashboard-data")
            self.assertEqual(dash_res.status_code, 200)
            dash_data = dash_res.json()
            self.assertIn("dashboard_data", dash_data)
            self.assertGreater(len(dash_data["dashboard_data"]), 0)
            first_event = dash_data["dashboard_data"][0]
            self.assertIn("disaster_identifier", first_event)
            self.assertIn("mission", first_event)

            # 2. Check disaster missions endpoint
            missions_res = client.get("/api/disaster/missions")
            self.assertEqual(missions_res.status_code, 200)
            missions_data = missions_res.json()
            self.assertEqual(missions_data["status"], "success")
            self.assertGreaterEqual(missions_data["count"], 1)
        print("[PASS] Disaster Overlay Persistence & Missions API Passed")

    def test_10_disaster_resolve(self):
        print("Testing /api/disaster/resolve endpoint...")
        with TestClient(app) as client:
            resolve_payload = {
                "disaster_identifier": "bagofloodzone_17.33_96.48",
                "notes": "Flood waters receded and relief targets fulfilled."
            }
            res_resolve = client.post("/api/disaster/resolve", json=resolve_payload)
            self.assertEqual(res_resolve.status_code, 200)
            self.assertEqual(res_resolve.json()["mission_status"], "Resolved")
        print("[PASS] Disaster Resolution Passed")

    @classmethod
    def tearDownClass(cls):
        # Clean up all test records and restore hub stock so tests never leave residues
        import sqlite3
        try:
            db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rescura_sync.db")
            conn = sqlite3.connect(db_path)
            c = conn.cursor()
            c.execute("DELETE FROM inventory_transactions WHERE notes LIKE '%Testing%' OR notes LIKE '%Alpha-1%' OR notes LIKE '%Test physical%' OR source_or_destination LIKE '%Test%'")
            c.execute("DELETE FROM disaster_missions WHERE disaster_identifier LIKE '%bagofloodzone%'")
            # Restore Hub 1 balances
            c.execute("UPDATE rescue_depots SET water_inventory = 1006000.0, food_inventory = 140000.0, medical_kits = 3350 WHERE id = 1")
            conn.commit()
            conn.close()
        except Exception as e:
            print("Cleanup error:", e)

if __name__ == '__main__':
    unittest.main(verbosity=2)
