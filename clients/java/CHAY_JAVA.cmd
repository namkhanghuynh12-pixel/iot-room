@echo off
cd /d "%~dp0"
for /d %%J in ("..\..\tools\java\jdk-*") do set "TASK_JAVA=%%J\bin\javaw.exe"
if exist "%TASK_JAVA%" (start "" "%TASK_JAVA%" -cp . PhongIoT) else (java PhongIoT)
