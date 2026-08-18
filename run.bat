@echo off
setlocal enabledelayedexpansion
title Rescura Sync - Automated Launcher
cd /d "%~dp0"

echo ============================================================
echo   RESCURA SYNC - AI Humanitarian Emergency Logistics Platform
echo ============================================================
echo.

:: 1. Check Python installation
echo [*] Checking Python installation...
set "PY_CMD="

python --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PY_CMD=python"
) else (
    py --version >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        set "PY_CMD=py"
    )
)

if not defined PY_CMD (
    echo.
    echo [ERROR] Python is not found on your system PATH!
    echo Please download and install Python 3.10+ from https://www.python.org/
    echo Make sure to check the box "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('!PY_CMD! --version') do echo [OK] Found %%v

:: 2. Setup Environment Variables & Database Credentials
echo.
echo [*] Checking and configuring database credentials...

if not exist "backend\.env" (
    echo [CREATE] Writing backend\.env with default database and Supabase credentials...
    (
        echo DATABASE_URL=sqlite+aiosqlite:///./rescura_sync.db
        echo SUPABASE_URL=https://jgbtudbialgitdxgkngj.supabase.co
    ) > "backend\.env"
) else (
    echo [OK] backend\.env found.
)

if not exist ".env" (
    echo [CREATE] Writing root .env configuration...
    (
        echo POSTGRES_USER=rescura
        echo POSTGRES_PASSWORD=rescura123
        echo POSTGRES_DB=rescura_db
        echo POSTGRES_PORT=5432
        echo DATABASE_URL=sqlite+aiosqlite:///./rescura_sync.db
    ) > ".env"
) else (
    echo [OK] root .env found.
)

if exist "rescura-mobile" (
    if not exist "rescura-mobile\.env" (
        echo [CREATE] Writing rescura-mobile\.env with Supabase client keys...
        (
            echo EXPO_PUBLIC_SUPABASE_URL=https://jgbtudbialgitdxgkngj.supabase.co
            echo EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnYnR1ZGJpYWxnaXRkeGdrbmdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNjgzODksImV4cCI6MjEwMTY0NDM4OX0.1Wc1P4seagQsTKcOKN9nhDDiakBIAnQo7FlHhJBUO8A
        ) > "rescura-mobile\.env"
    )
)

:: 3. Setup Python Virtual Environment
echo.
echo [*] Checking Python virtual environment...
if not exist "backend\.venv\Scripts\activate.bat" (
    echo [INIT] Creating isolated virtual environment in backend\.venv...
    !PY_CMD! -m venv "backend\.venv"
    if !ERRORLEVEL! neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created successfully.
) else (
    echo [OK] Virtual environment exists.
)

:: 4. Activate Virtual Environment & Install Dependencies
echo.
echo [*] Activating environment and verifying dependencies...
call "backend\.venv\Scripts\activate.bat"

python -m pip install --quiet --upgrade pip
echo [*] Installing required Python packages (FastAPI, Scikit-Learn, Pandas, FPDF2, etc.)...
pip install -r "backend\requirements.txt"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [WARNING] Package installation encountered issues. Retrying with basic flags...
    pip install -r "backend\requirements.txt" --no-cache-dir
)

:: 5. Launch Rescura Sync Server & Open UI in Browser
echo.
echo ============================================================
echo   [SUCCESS] Rescura Sync is ready to launch!
echo   Local Dashboard: http://127.0.0.1:8000
echo   Opening browser automatically...
echo ============================================================
echo.

start "" "http://127.0.0.1:8000"

cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

echo.
echo [INFO] Rescura Sync server has stopped.
pause
