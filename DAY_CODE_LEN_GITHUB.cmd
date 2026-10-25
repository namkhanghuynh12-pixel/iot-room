@echo off
chcp 65001 >nul
set "PATH=%PATH%;C:\Program Files\Git\cmd"
cd /d "C:\Users\ADMIN\Documents\ChatGPT\IOT\iot-room"
echo ============================================================
echo   ĐANG TẢI MÃ NGUỒN LÊN GITHUB: namkhanghuynh12-pixel/iot-room
echo ============================================================
echo.
git push -u origin main
echo.
echo ============================================================
echo   Hoàn tất! Nếu có cửa sổ đăng nhập hiện lên, hãy bấm Sign In.
echo ============================================================
pause
