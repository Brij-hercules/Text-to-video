@echo off
setlocal

echo [1/3] Creating virtual environment if missing...
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv
)

echo [2/3] Installing/Updating backend dependencies...
call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt

echo [3/3] Starting backend API at http://localhost:8000 ...
start "Video Backend" cmd /k "call .venv\Scripts\activate && python backend.py"

echo Starting frontend static server at http://localhost:5500 ...
python -m http.server 5500

endlocal
