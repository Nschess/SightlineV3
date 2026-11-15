@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
echo [1/6] Full deterministic Node regressions...
node tools\run-package-regressions.cjs
if errorlevel 1 exit /b 1
echo [2/6] Android/offline/phone-host source parity...
node tests\phase2-android-asset-parity.mjs
if errorlevel 1 exit /b 1
echo [3/6] Authoritative combat checks...
node tests\authoritative-combat.mjs
if errorlevel 1 exit /b 1
echo [4/6] Navigation audit for all configured maps...
node tests\map-bot-navigation-audit.cjs >nul
if errorlevel 1 exit /b 1
echo [5/6] Preserved Android 5.1 APK archive and source asset hashes...
node tools\verify-existing-apk.cjs
if errorlevel 1 exit /b 1
echo [6/6] Source package SHA-256 manifest...
node tools\verify-release-source-manifest.cjs .
if errorlevel 1 exit /b 1
echo PASS: Release Readiness 7.0 source checks complete.
endlocal
exit /b 0
