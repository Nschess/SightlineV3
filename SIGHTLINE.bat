@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "ROOT=%~dp0"
if /I "%~1"=="host" goto host
if /I "%~1"=="offline" goto offline
if /I "%~1"=="lan-client" goto lan_client
if /I "%~1"=="host-release" goto host_release
if /I "%~1"=="verify" goto verify
if /I "%~1"=="status" goto status
if /I "%~1"=="build-info" goto build_info
if /I "%~1"=="manifest" goto manifest
if /I "%~1"=="release-check" goto releasecheck
if /I "%~1"=="wip-zip" goto wipzip
if /I "%~1"=="apk" goto apk
if /I "%~1"=="open" goto open
if /I "%~1"=="open-offline" goto open_offline
if /I "%~1"=="device" goto device
if /I "%~1"=="protocol" goto protocol
if /I "%~1"=="verify-full" goto verify_full
if /I "%~1"=="help" goto help
:help
echo Sightline V3 packaged CMD workflow
echo   START-HOST.bat       Start Windows LAN host (stable 20 ms profile)
echo   SIGHTLINE.bat open   Open this candidate's LAN browser client at localhost:8080
echo   SIGHTLINE.bat build-info Compare the running LAN page with this candidate's hashes
echo   SIGHTLINE.bat manifest Refresh complete source inventory before WIP/debug packaging
echo   SIGHTLINE.bat release-check Fail-closed Windows production evidence gate
echo   SIGHTLINE.bat offline Start the separate Offline compatibility target on port 8090
echo   SIGHTLINE.bat lan-client Start loopback client with automatic private-LAN host discovery
echo   SIGHTLINE.bat open-offline Open the Offline game page (after starting it)
echo   SIGHTLINE.bat wip-zip ^<path^> Create a complete WIP-UNVERIFIED source/test ZIP after integrity checks
echo   SIGHTLINE.bat host   Start Windows LAN host (stable 20 ms profile)
echo   SIGHTLINE.bat host-release  Start HTTPS/WSS host with approved external TLS inputs
echo   SIGHTLINE.bat verify Run local regression and Android-asset checks
echo   SIGHTLINE.bat verify-full Run all Node regressions, combat, navigation, and Android parity
echo   SIGHTLINE.bat protocol Run isolated two-client LAN protocol smoke
echo   SIGHTLINE.bat status Show available tools
echo   SIGHTLINE.bat apk    Build a debug APK from DEV/MASTER source when tools are installed
exit /b 0
:offline
where node >nul 2>nul
if errorlevel 1 (echo Node.js is required to serve the Offline game.& exit /b 1)
if not exist "%ROOT%tools\offline-static-server.cjs" (echo Offline static server is missing.& exit /b 1)
if not exist "%ROOT%AndroidProject\app\src\main\assets\www\index.html" (echo Offline game assets are missing.& exit /b 1)
where netstat >nul 2>nul
if errorlevel 1 (echo Windows netstat is required to confirm port 8090 is free.& exit /b 1)
call :check_port 8090 "Offline compatibility server"
if errorlevel 1 exit /b 2
pushd "%ROOT%"
node --check tools\offline-static-server.cjs
if errorlevel 1 (popd& exit /b 1)
echo Starting the Offline-only game server on 127.0.0.1:8090.
node tools\offline-static-server.cjs
set "RC=!errorlevel!"
popd
exit /b !RC!
:lan_client
where node >nul 2>nul
if errorlevel 1 (echo Node.js is required for the local LAN discovery client.& exit /b 1)
if not exist "%ROOT%tools\offline-static-server.cjs" (echo Offline client server is missing.& exit /b 1)
if not exist "%ROOT%tools\lan-discovery.cjs" (echo LAN discovery module is missing.& exit /b 1)
if not exist "%ROOT%AndroidProject\app\src\main\assets\www\index.html" (echo Offline game assets are missing.& exit /b 1)
where netstat >nul 2>nul
if errorlevel 1 (echo Windows netstat is required to confirm port 8090 is free.& exit /b 1)
call :check_port 8090 "Sightline LAN client/discovery bridge"
if errorlevel 1 exit /b 2
pushd "%ROOT%"
node --check tools\lan-discovery.cjs
if errorlevel 1 (popd& exit /b 1)
node --check tools\offline-static-server.cjs
if errorlevel 1 (popd& exit /b 1)
echo Local game page: http://127.0.0.1:8090/
echo Available Games discovery uses private IPv4 UDP probes only. No host is started on this PC.
echo Open the URL above in a browser. Press Ctrl+C here to stop the client bridge.
node tools\offline-static-server.cjs --lan-client
set "RC=!errorlevel!"
popd
exit /b !RC!
:status
for %%T in (node python py java adb) do (where %%T >nul 2>nul && (echo %%T: available) || (echo %%T: missing))
if defined ANDROID_HOME (echo ANDROID_HOME: %ANDROID_HOME%) else (echo ANDROID_HOME: not set)
if defined ANDROID_SDK_ROOT (echo ANDROID_SDK_ROOT: %ANDROID_SDK_ROOT%) else (echo ANDROID_SDK_ROOT: not set)
exit /b 0
:build_info
where node >nul 2>nul
if errorlevel 1 (echo Node.js is required to inspect build fingerprints.& exit /b 1)
node --check "%ROOT%tools\show-build-info.cjs"
if errorlevel 1 exit /b 1
node "%ROOT%tools\show-build-info.cjs"
exit /b %errorlevel%
:manifest
where powershell.exe >nul 2>nul
if errorlevel 1 (echo Windows PowerShell is required to refresh the source manifest.& exit /b 1)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%tools\update-package-content-manifest.ps1"
exit /b !errorlevel!
:releasecheck
where powershell.exe >nul 2>nul
if errorlevel 1 (echo Windows PowerShell is required for the production release gate.& exit /b 2)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%tools\require-release-acceptance.ps1" -Mode WindowsRelease
exit /b !errorlevel!
:wipzip
if "%~2"=="" (echo Usage: SIGHTLINE.bat wip-zip "C:\path\SightlineV3-WIP-UNVERIFIED.zip"& exit /b 2)
where powershell.exe >nul 2>nul
if errorlevel 1 (echo Windows PowerShell is required to create a WIP checkpoint.& exit /b 1)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%tools\package-candidate.ps1" -OutputPath "%~2"
exit /b !errorlevel!
:host
where node >nul 2>nul
if errorlevel 1 (echo Node.js is required for host gameplay.& exit /b 1)
set "SERVER=%ROOT%AndroidProject\app\src\main\assets\phone-host"
if not exist "%SERVER%\server.js" (echo Packaged phone-host server is missing.& exit /b 1)
where netstat >nul 2>nul
if errorlevel 1 (echo Windows netstat is required to confirm port 8080 is free.& exit /b 1)
call :check_port 8080 "Sightline LAN host"
if errorlevel 1 exit /b 2
pushd "%SERVER%"
node --check server.js
if errorlevel 1 (popd& exit /b 1)
echo Hosting on your trusted Private LAN only. Do NOT port-forward 8080.
echo LAN discovery uses private IPv4 query/reply on UDP 49192; no public discovery service is used.
echo If Windows prompts for network access, allow Node only on Private networks. Do not enable Public-network access.
echo LAN tick: 20 ms (50 Hz). Large bot rosters use a budgeted shared AI cadence; 64 bots target about 9 decisions per second each.
echo Host: http://localhost:8080
echo Ctrl+C stops the host.
node server.js --transport dev --port 8080 --max 10 --rounds 5 --time 100 --bots 0 --tick-ms 20 --discover-lan
set "RC=!errorlevel!"
popd
exit /b !RC!
:host_release
where node >nul 2>nul
if errorlevel 1 (echo Node.js is required for the secure release host.& exit /b 1)
set "SERVER=%ROOT%AndroidProject\app\src\main\assets\phone-host"
if not exist "%SERVER%\server.js" (echo Packaged phone-host server is missing.& exit /b 1)
if not defined SIGHTLINE_TLS_HOST (echo SIGHTLINE_TLS_HOST must name the approved DNS host.& exit /b 1)
if not defined SIGHTLINE_TLS_BIND (echo SIGHTLINE_TLS_BIND must be the host's private LAN IPv4 address.& exit /b 1)
if not defined SIGHTLINE_TLS_CERT_FILE (echo SIGHTLINE_TLS_CERT_FILE must point to the approved certificate chain.& exit /b 1)
if not defined SIGHTLINE_TLS_KEY_FILE (echo SIGHTLINE_TLS_KEY_FILE must point to the protected private key.& exit /b 1)
if not exist "%SIGHTLINE_TLS_CERT_FILE%" (echo Approved TLS certificate file is unavailable.& exit /b 1)
if not exist "%SIGHTLINE_TLS_KEY_FILE%" (echo Protected TLS private-key file is unavailable.& exit /b 1)
where netstat >nul 2>nul
if errorlevel 1 (echo Windows netstat is required to confirm port 8080 is free.& exit /b 1)
call :check_port 8080 "Sightline HTTPS/WSS host"
if errorlevel 1 exit /b 2
pushd "%SERVER%"
node --check server.js
if errorlevel 1 (popd& exit /b 1)
echo Starting secure HTTPS/WSS release host. Certificate, hostname, key match and private bind are validated before listening.
node server.js --transport release --bind "%SIGHTLINE_TLS_BIND%" --port 8080 --max 10 --rounds 5 --time 100 --bots 0 --tick-ms 20
set "RC=!errorlevel!"
popd
exit /b !RC!
:open
start "" "http://localhost:8080/"
exit /b %errorlevel%
:open_offline
start "" "http://127.0.0.1:8090/"
exit /b %errorlevel%
:verify
if /I "%~2"=="protocol" goto protocol
where node >nul 2>nul
if errorlevel 1 (echo Node.js is required for verification.& exit /b 1)
node "%ROOT%tests\run-game-regressions.cjs"
set "RC=!errorlevel!"
if not "!RC!"=="0" goto verify_done
node --test "%ROOT%tests\outbreak-server-roster.test.cjs" "%ROOT%tests\mp-bot-snapshot-smoothing.test.cjs" "%ROOT%tests\mp-remote-pose-reuse.test.cjs" "%ROOT%tests\mp-bot-fx-throttle.test.cjs" "%ROOT%tests\mp-bot-scan-allocation.test.cjs" "%ROOT%tests\capture-lan-host-status.test.cjs"
set "RC=!errorlevel!"
if not "!RC!"=="0" goto verify_done
node "%ROOT%tests\phase2-android-asset-parity.mjs"
set "RC=!errorlevel!"
:verify_done
if "!RC!"=="0" (echo Static and deterministic packaged checks passed.& exit /b 0)
echo Packaged verification failed with exit code !RC!.
exit /b !RC!
:verify_full
where node >nul 2>nul
if errorlevel 1 (echo Node.js is required for full verification.& exit /b 1)
node "%ROOT%tools\run-expansion8.1-full-verify.cjs"
exit /b %errorlevel%
:protocol
where node >nul 2>nul
if errorlevel 1 (echo Node.js is required for protocol verification.& exit /b 1)
node "%ROOT%tests\p7-feature-parity-lan-protocol.mjs" "%ROOT%AndroidProject\app\src\main\assets\phone-host" "%ROOT%phone_lan_protocol_results.json"
exit /b %errorlevel%
:apk
if not exist "%ROOT%AndroidProject\build-debug.bat" (echo Android build sources are not included in this package.& exit /b 1)
call "%ROOT%AndroidProject\build-debug.bat"
exit /b %errorlevel%
:device
where adb >nul 2>nul
if errorlevel 1 (echo Android SDK Platform Tools (adb) are not installed.& exit /b 1)
adb devices -l
exit /b %errorlevel%
:check_port
set "CHECK_PORT=%~1"
set "CHECK_ROLE=%~2"
set "CHECK_FOUND="
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /C:":%CHECK_PORT% " ^| findstr /I "LISTENING"') do (
  set "CHECK_FOUND=1"
  echo Listener on TCP port %CHECK_PORT% ^(%CHECK_ROLE%^):
  echo Owning process PID %%P
  tasklist /FI "PID eq %%P" /FO TABLE /NH
)
if defined CHECK_FOUND (
  echo ERROR: TCP port %CHECK_PORT% is occupied; this candidate was not started.
  echo No process was stopped. Close or restart only the host you own, then retry.
  exit /b 2
)
exit /b 0
