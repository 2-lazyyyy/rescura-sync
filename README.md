# Rescura Sync ⚡
### Autonomous Humanitarian Logistics & Disaster Dispatch Platform

Rescura Sync is a full-stack real-time emergency response platform that coordinates disaster alerts from GDACS, estimates UN Sphere-standard humanitarian relief supplies (water, food rations, trauma kits), calculates multi-modal logistics transit durations (Land, Air, Water), and exports official Emergency Action Plans.

---

## 🚀 One-Click Quick Start (Windows)

Anyone pulling from this repository can run the entire project immediately with **zero setup**:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ZawLwinHtoo/rescura-sync.git
   cd rescura-sync
   ```

2. **Double-click `run.bat` (or `start.bat`)**:
   * ✅ Automatically checks and verifies Python 3.10+ installation.
   * ✅ Configures all database and Supabase API credentials.
   * ✅ Creates an isolated virtual environment (`backend\.venv`).
   * ✅ Installs all required dependencies (`fastapi`, `uvicorn`, `scikit-learn`, `pandas`, `fpdf2`, etc.).
   * ✅ Starts the local backend server at `http://127.0.0.1:8000`.
   * ✅ Automatically launches your default browser to the interactive dashboard.

---

## 🛠️ Tech Stack & Architecture

* **Backend**: FastAPI (Python 3.10+), SQLAlchemy 2.0 Async, SQLite/PostgreSQL, Scikit-Learn ML Model, FPDF2 Report Engine.
* **Frontend**: Pure Vanilla HTML5/CSS3/JavaScript (No complex build steps required, fully served by FastAPI at `/`).
* **External Integrations**: GDACS Real-Time Live Feeds, Supabase Cloud Database & WebSockets, OpenStreetMap GIS routing.

---

## 📄 License
Humanitarian Open License. Built for disaster relief operations and rapid humanitarian emergency response.
