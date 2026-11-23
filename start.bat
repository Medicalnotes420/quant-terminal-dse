@echo off
rem Double-click this on Windows to start Quant Terminal.
rem It also starts the Stockapp pattern service (the Patterns button reads from it).
start "Pattern service" /min cmd /c "cd /d "%~dp0..\Stockapp" && python -m uvicorn chartapp.api:app --host 127.0.0.1 --port 8000"
cd /d "%~dp0"
node server.js --open
pause
