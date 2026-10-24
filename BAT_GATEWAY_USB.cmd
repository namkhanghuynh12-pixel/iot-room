@echo off
cd /d "%~dp0"
set "TASK_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%TASK_NODE%" ("%TASK_NODE%" launcher.mjs gateway %*) else (node launcher.mjs gateway %*)
if errorlevel 1 pause
