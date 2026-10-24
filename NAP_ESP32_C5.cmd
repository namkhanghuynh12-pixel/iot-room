@echo off
cd /d "%~dp0"
echo Dong gateway USB va Serial Monitor truoc khi nap.
set "TASK_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%TASK_NODE%" ("%TASK_NODE%" build-firmware.mjs --upload --port COM16) else (node build-firmware.mjs --upload --port COM16)
pause
