@echo off
setlocal
cd /d "%~dp0"
echo Verifying Gameplay Quality 6.0 experimental source...
node tools\verify-gq6-manifest.cjs
if errorlevel 1 exit /b 1
node tools\run-package-regressions.cjs
if errorlevel 1 exit /b 1
node tests\settings-accuracy.mjs
if errorlevel 1 exit /b 1
node tests\phase17-mobile-dual-fire.cjs
if errorlevel 1 exit /b 1
node tests\phase16-gameplay-stabilization.cjs
if errorlevel 1 exit /b 1
node tests\p113-frame-pacing.cjs
if errorlevel 1 exit /b 1
node tests\offline-64bot-capacity.cjs
if errorlevel 1 exit /b 1
node tests\phase2-android-asset-parity.mjs
if errorlevel 1 exit /b 1
echo PASS: all packaged deterministic checks completed.
echo NOTE: this batch does not perform WebGL, Wi-Fi, Android-device, or FPS acceptance.
exit /b 0
