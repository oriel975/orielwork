@echo off
rem Double-click to start SportEdge and open it in the browser.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org and run this file again.
  start "" https://nodejs.org
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
echo SportEdge is running. Keep this window open. Close it to stop the app.
node server\index.js
pause
