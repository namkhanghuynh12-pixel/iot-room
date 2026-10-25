@echo off
title Tram Chi Huy - Phong IoT
cd /d "%~dp0"

echo ================================================================
echo               TRAM CHI HUY - PHONG IOT DANG CHAY
echo ================================================================
echo   Dia chi Web  : http://localhost:8765
echo   Broker MQTT  : Cong 1883
echo   Co so du lieu: data/room.sqlite
echo ================================================================
echo.
echo   * Cua so nay can DUOC GIU MO de may chu hoat dong.
echo   * De tat he thong: Dong cua so nay hoac nhan Ctrl + C.
echo.

:: Cho may chu khoi dong 1.5s roi tu dong mo trinh duyet
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 1500; Start-Process http://localhost:8765"

:: Khoi dong may chu Node.js
set "TASK_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%TASK_NODE%" ("%TASK_NODE%" server.mjs) else (node server.mjs)

if errorlevel 1 pause
