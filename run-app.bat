@echo off
chcp 65001
echo.
echo ========================================
echo    Starter Ukeshandel Dev Server
echo    MED AI-KATEGORISERING
echo ========================================
echo.

REM Stopp prosesser som kjører på port 5000 (backend)
echo Sjekker om port 5000 er i bruk...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do (
    echo Stopper prosess med PID %%a på port 5000...
    taskkill /F /PID %%a >nul 2>&1
)

REM Stopp prosesser som kjører på port 5173 (frontend)
echo Sjekker om port 5173 er i bruk...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    echo Stopper prosess med PID %%a på port 5173...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo Backend: http://localhost:5000
echo Frontend: http://localhost:5173
echo.
echo ========================================
echo.

REM Start backend i nytt terminal-vindu (MED AI)
start "Ukeshandel Backend (AI ON)" cmd /k "set SKIP_AI=false && cd /d %~dp0backend && npm run dev"

REM Vent litt slik at backend får starte først
timeout /t 3 /nobreak > nul

REM Start frontend i nytt terminal-vindu
start "Ukeshandel Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Begge servere starter nå...
echo Trykk en tast for å lukke dette vinduet
pause > nul
