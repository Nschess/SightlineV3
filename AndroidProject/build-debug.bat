@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\tools\package-candidate.ps1" -VerifyOnly
if errorlevel 1 (
  echo Android debug build blocked: refresh and verify the candidate source manifest first.
  exit /b 2
)

where java >nul 2>&1
if errorlevel 1 (
  echo JDK 17 is missing from PATH. Install/select an authorized JDK 17 and retry.
  exit /b 1
)
set "JAVA_VERSION="
for /f "tokens=3" %%V in ('java -version 2^>^&1 ^| findstr /I /C:"version"') do if not defined JAVA_VERSION set "JAVA_VERSION=%%~V"
for /f "tokens=1 delims=." %%M in ("%JAVA_VERSION%") do set "JAVA_MAJOR=%%M"
if not "%JAVA_MAJOR%"=="17" (
  echo JDK 17 is required. Detected version: %JAVA_VERSION%
  exit /b 1
)

if not defined ANDROID_SDK_ROOT set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
if not defined ANDROID_SDK_ROOT (
  echo Set ANDROID_SDK_ROOT or ANDROID_HOME to an installed Android SDK.
  exit /b 1
)
if not exist "%ANDROID_SDK_ROOT%\platforms\android-36\android.jar" (
  echo Android SDK Platform 36 is required.
  exit /b 1
)
set "ANDROID_BUILD_TOOLS="
for /d %%D in ("%ANDROID_SDK_ROOT%\build-tools\*") do (
  for /f "tokens=1 delims=." %%M in ("%%~nxD") do if %%M GEQ 35 if exist "%%~fD\apksigner.bat" if exist "%%~fD\aapt.exe" if exist "%%~fD\zipalign.exe" set "ANDROID_BUILD_TOOLS=%%~fD"
)
if not defined ANDROID_BUILD_TOOLS (
  echo Android SDK Build Tools 35.0.0 or newer with apksigner, aapt, and zipalign are required.
  exit /b 1
)
if not exist "gradlew.bat" (
  echo The checked-in Gradle wrapper script is missing.
  exit /b 1
)
if not exist "gradle\wrapper\gradle-wrapper.jar" (
  echo The checked-in Gradle wrapper JAR is missing.
  exit /b 1
)

call gradlew.bat --no-daemon :app:assembleDebug --stacktrace
if errorlevel 1 (
  echo Android debug build failed. No APK was accepted.
  exit /b 1
)
set "APK=app\build\outputs\apk\debug\app-debug.apk"
if not exist "%APK%" (
  echo Gradle reported success but the debug APK is missing: %APK%
  exit /b 1
)

call "%ANDROID_BUILD_TOOLS%\apksigner.bat" verify --verbose --print-certs "%APK%"
if errorlevel 1 (
  echo Debug APK signature verification failed.
  exit /b 1
)
"%ANDROID_BUILD_TOOLS%\zipalign.exe" -c -v 4 "%APK%"
if errorlevel 1 (
  echo Debug APK zip alignment verification failed.
  exit /b 1
)
for /f "tokens=2 delims='" %%P in ('"%ANDROID_BUILD_TOOLS%\aapt.exe" dump badging "%APK%" ^| findstr /B /C:"package:"') do set "APK_PACKAGE=%%P"
if not "%APK_PACKAGE%"=="com.sightline.v3" (
  echo Unexpected APK package identity: %APK_PACKAGE%
  exit /b 1
)
"%ANDROID_BUILD_TOOLS%\aapt.exe" list "%APK%" | findstr /X /C:"assets/phone-host/index.html" >nul
if errorlevel 1 (
  echo APK is missing the packaged phone-host page.
  exit /b 1
)
"%ANDROID_BUILD_TOOLS%\aapt.exe" list "%APK%" | findstr /X /C:"assets/www/index.html" >nul
if errorlevel 1 (
  echo APK is missing the packaged offline page.
  exit /b 1
)
echo Verified debug APK package identity, signature, ZIP alignment, and required game pages.
certutil -hashfile "%APK%" SHA256
if errorlevel 1 (
  echo Could not calculate the debug APK SHA-256.
  exit /b 1
)
echo Debug-signed local test artifact only. No release signing or distribution is performed.
endlocal
