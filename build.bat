@echo off
title betterSBP - build installer
cd /d "%~dp0"

rem electron-builder needs symlink rights on Windows: restart this script as Administrator if needed
net session >nul 2>nul
if %errorlevel% neq 0 (
  echo Asking for administrator rights so the build tools can unpack...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

where node >nul 2>nul || (echo Node.js is required: https://nodejs.org & pause & exit /b 1)
set CSC_IDENTITY_AUTO_DISCOVERY=false
rem remove a half-unpacked tool cache left by an earlier failed run
if exist "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"

echo Installing packages...
call npm install || (echo npm install failed & pause & exit /b 1)
echo Building the installer...
call npm run dist || (echo Build failed. Enable Developer Mode in Windows Settings and run again. & pause & exit /b 1)
echo.
echo Done. Your installer is in the "release" folder.
start "" release
pause
