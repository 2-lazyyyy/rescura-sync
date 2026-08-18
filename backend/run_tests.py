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
        print("✅ Status Check Passed")

    def test_02_health_check(self):
        print("Testing /health endpoint...")
        with TestClient(app) as client:
            response = client.get("/health")
            self.assertEqual(response.status_code, 200)
            self.assertIn("status", response.json())
        print("✅ Health Check Passed")

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
        print("✅ MLOps Feedback Loop Passed")

if __name__ == '__main__':
    unittest.main(verbosity=2)
