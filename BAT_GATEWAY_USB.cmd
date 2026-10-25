@echo off
title Gateway USB - Phong IoT
cd /d "%~dp0"

echo ================================================================
echo               GATEWAY USB SERIAL - PHONG IOT
echo ================================================================
echo   Dang tim va ket noi voi ESP32 qua cong COM...
echo   (Dong cua so nay de ngat ket noi USB)
echo ================================================================
echo.

set "TASK_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%TASK_NODE%" ("%TASK_NODE%" gateway-usb.mjs %*) else (node gateway-usb.mjs %*)

if errorlevel 1 pause
