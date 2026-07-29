@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [Perspective Paste] Node.js was not found.
  echo Install Node.js 20 or newer, then run this file again.
  pause
  exit /b 1
)

echo [Perspective Paste] Starting http://127.0.0.1:4173/
echo Keep this window open while using the web app. Press Ctrl+C to stop.
node scripts\serve_web.mjs --open

if errorlevel 1 (
  echo.
  echo The local server stopped with an error.
  pause
)
