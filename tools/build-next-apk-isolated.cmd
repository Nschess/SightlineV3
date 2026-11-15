@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "DEV_ROOT=%~dp0.."
for %%I in ("%DEV_ROOT%") do set "DEV_ROOT=%%~fI"

rem Use only explicitly supplied isolated toolchain locations; never fall back
rem to Android Studio, the user's profile SDK, or a machine-wide Java install.
if not defined SIGHTLINE_JDK17_ROOT (
  echo BLOCKED: Set SIGHTLINE_JDK17_ROOT to the approved isolated JDK 17 directory.
  exit /b 2
)
if not defined SIGHTLINE_ANDROID_SDK_ROOT (
  echo BLOCKED: Set SIGHTLINE_ANDROID_SDK_ROOT to the approved isolated Android SDK.
  exit /b 2
)
if not defined SIGHTLINE_GRADLE_USER_HOME (
  echo BLOCKED: Set SIGHTLINE_GRADLE_USER_HOME to the approved isolated Gradle cache.
  exit /b 2
)
if not defined SIGHTLINE_ANDROID_USER_HOME (
  echo BLOCKED: Set SIGHTLINE_ANDROID_USER_HOME to the approved isolated Android user home.
  exit /b 2
)

if not exist "%SIGHTLINE_JDK17_ROOT%\bin\java.exe" (
  echo BLOCKED: Isolated JDK java.exe is missing.
  exit /b 2
)
if not exist "%SIGHTLINE_ANDROID_SDK_ROOT%\platforms\android-36\android.jar" (
  echo BLOCKED: Isolated Android SDK Platform 36 is missing.
  exit /b 2
)
if not exist "%SIGHTLINE_ANDROID_USER_HOME%\debug.keystore" (
  echo BLOCKED: Preserved isolated debug.keystore is missing; refusing to create a different signer.
  exit /b 2
)
set "ANDROID_BUILD_TOOLS="
for %%V in (37 36 35) do if not defined ANDROID_BUILD_TOOLS if exist "%SIGHTLINE_ANDROID_SDK_ROOT%\build-tools\%%V.0.0\apksigner.bat" set "ANDROID_BUILD_TOOLS=%SIGHTLINE_ANDROID_SDK_ROOT%\build-tools\%%V.0.0"
if not defined ANDROID_BUILD_TOOLS (
  echo BLOCKED: Android Build Tools 35.0.0 or newer are required.
  exit /b 2
)
if not exist "%ANDROID_BUILD_TOOLS%\aapt.exe" exit /b 2
if not exist "%ANDROID_BUILD_TOOLS%\zipalign.exe" exit /b 2
if not exist "%DEV_ROOT%\AndroidProject\gradlew.bat" exit /b 2
if not exist "%DEV_ROOT%\AndroidProject\gradle\wrapper\gradle-wrapper.jar" exit /b 2
where node.exe >nul 2>&1 || (echo BLOCKED: Node.js is required for source parity verification.& exit /b 2)

set "JAVA_HOME=%SIGHTLINE_JDK17_ROOT%"
set "ANDROID_HOME=%SIGHTLINE_ANDROID_SDK_ROOT%"
set "ANDROID_SDK_ROOT=%SIGHTLINE_ANDROID_SDK_ROOT%"
set "ANDROID_USER_HOME=%SIGHTLINE_ANDROID_USER_HOME%"
set "GRADLE_USER_HOME=%SIGHTLINE_GRADLE_USER_HOME%"
set "PATH=%JAVA_HOME%\bin;%ANDROID_BUILD_TOOLS%;%PATH%"
"%JAVA_HOME%\bin\java.exe" -version 2>&1 | findstr /C:"17." >nul || (echo BLOCKED: The configured isolated Java runtime is not JDK 17.& exit /b 2)

set "VERSION_CODE="
for /f "tokens=2 delims==" %%V in ('findstr /B /C:"VERSION_CODE=" "%DEV_ROOT%\AndroidProject\app\version.properties"') do set "VERSION_CODE=%%V"
if not defined VERSION_CODE (echo FAIL: app versionCode is missing.& exit /b 1)
if %VERSION_CODE% LEQ 4 (
  echo BLOCKED: This is still versionCode %VERSION_CODE%. Keep the accepted v4 APK; increment to 5 only for the reviewed next candidate.
  exit /b 2
)

echo Running deterministic regressions and Android source parity...
pushd "%DEV_ROOT%"
node tools\run-package-regressions.cjs
if errorlevel 1 (popd & exit /b 1)
node tests\phase2-android-asset-parity.mjs
if errorlevel 1 (popd & exit /b 1)
node tools\create-apk-baseline-asset-manifest.cjs AndroidProject\app\src\main\assets acceptance\apk-baseline\current-build-assets.json -
if errorlevel 1 (popd & exit /b 1)

echo Building with the checked-in Gradle 8.13 wrapper in offline mode...
pushd "%DEV_ROOT%\AndroidProject"
call gradlew.bat --offline --no-daemon --console plain clean :app:assembleDebug
if errorlevel 1 (popd & popd & exit /b 1)
set "BUILT_APK=%DEV_ROOT%\AndroidProject\app\build\outputs\apk\debug\app-debug.apk"
set "OUT_DIR=%DEV_ROOT%\artifacts\generated"
set "OUT_APK=%OUT_DIR%\SightlineV3-Android-RR7-debug-v%VERSION_CODE%.apk"
if not exist "%BUILT_APK%" (echo FAIL: Gradle reported success but APK is missing.& popd & popd & exit /b 1)
if exist "%OUT_APK%" (echo FAIL: Refusing to overwrite existing candidate APK: %OUT_APK%& popd & popd & exit /b 1)
mkdir "%OUT_DIR%" 2>nul

"%ANDROID_BUILD_TOOLS%\aapt.exe" dump badging "%BUILT_APK%" > "%DEV_ROOT%\acceptance\apk-baseline\current-build-badging.log"
if errorlevel 1 (popd & popd & exit /b 1)
findstr /C:"package: name='com.sightline.v3'" /C:"versionCode='%VERSION_CODE%'" "%DEV_ROOT%\acceptance\apk-baseline\current-build-badging.log" >nul
if errorlevel 1 (echo FAIL: APK package or version metadata is unexpected.& popd & popd & exit /b 1)
call "%ANDROID_BUILD_TOOLS%\apksigner.bat" verify --verbose --print-certs "%BUILT_APK%" > "%DEV_ROOT%\acceptance\apk-baseline\current-build-signature.log" 2>&1
if errorlevel 1 (echo FAIL: APK signature verification failed.& popd & popd & exit /b 1)
findstr /I /C:"5d4f7045c31de17d72d70c54ba2c11949e8c4ebfbefe0f21fdcf866ac962e510" "%DEV_ROOT%\acceptance\apk-baseline\current-build-signature.log" >nul
if errorlevel 1 (echo FAIL: APK signer differs from preserved v4 debug signing identity.& popd & popd & exit /b 1)
"%ANDROID_BUILD_TOOLS%\zipalign.exe" -c -v 4 "%BUILT_APK%" > "%DEV_ROOT%\acceptance\apk-baseline\current-build-zipalign.log" 2>&1
if errorlevel 1 (echo FAIL: APK alignment verification failed.& popd & popd & exit /b 1)
node "%DEV_ROOT%\tools\verify-existing-apk.cjs" "%BUILT_APK%" "%DEV_ROOT%\acceptance\apk-baseline\current-build-assets.json" -
if errorlevel 1 (popd & popd & exit /b 1)
copy /b "%BUILT_APK%" "%OUT_APK%" >nul
if errorlevel 1 (popd & popd & exit /b 1)
certutil -hashfile "%OUT_APK%" SHA256
echo PASS: isolated debug APK verified and copied to %OUT_APK%
popd
popd
exit /b 0
