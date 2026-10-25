@echo off
title Tat Phong IoT
cd /d "%~dp0"

echo Dang tat may chu Phong IoT...
set "TASK_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%TASK_NODE%" ("%TASK_NODE%" launcher.mjs stop) else (node launcher.mjs stop)

echo Da tat Phong IoT thanh cong!
timeout /t 3 >nul
