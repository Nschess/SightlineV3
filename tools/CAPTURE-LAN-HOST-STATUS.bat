@echo off
setlocal
cd /d "%~dp0.."
node tools\capture-lan-host-status.cjs %*
set "captureExit=%errorlevel%"
if "%captureExit%"=="4" echo Match is not live with bots yet. Start the match, wait for live gameplay, then run this capture again.
if "%captureExit%"=="3" echo Wrong host build. Stop the old START-HOST window with Ctrl+C, restart from this DEV folder, then run this capture again.
if "%captureExit%"=="2" echo Capture blocked. Confirm START-HOST.bat is running and retry.
exit /b %captureExit%
