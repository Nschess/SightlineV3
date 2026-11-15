# Genuine Android debug build on Windows

The source is not an APK. Build it with the Android SDK and Android Gradle Plugin; do not rename a ZIP or HTML file to `.apk`.

## Prerequisites

Install Android Studio and its Android SDK Platform **36**, SDK Build Tools **35.0.0 or newer**, and Android SDK Platform Tools (ADB). Use **JDK 17** and **Gradle 8.13**. The Gradle plugin version is pinned to **8.13.2**; AndroidX WebKit is pinned to **1.15.0**. Downloads of these build dependencies require internet during the initial build, but running the app offline does not.

This source package includes the Gradle 8.13 wrapper scripts and `gradle/wrapper/gradle-wrapper.jar`. The wrapper distribution URL is pinned in `gradle/wrapper/gradle-wrapper.properties`; the first build needs internet access unless the distribution and dependencies are already cached.

## Commands (Windows Command Prompt in the extracted project root)

```bat
java -version
gradlew.bat --version
build-debug.bat
```

Install Android SDK Platform 36 and Build Tools 35.0.0 or newer, set `ANDROID_HOME` or `ANDROID_SDK_ROOT`, and use JDK 17. The checked-in Gradle 8.13 wrapper is authoritative; a separate system Gradle installation is not required when the wrapper files are intact. The first wrapper/plugin/dependency resolution may need network access. Do not replace the pinned wrapper or silently substitute another Gradle version, and do not weaken TLS or certificate validation to make dependency downloads work.

The build script checks JDK, SDK, wrapper and debug output prerequisites before building. It invokes only `:app:assembleDebug`, respects the machine's PowerShell execution policy, and does not provision release credentials or modify trust stores. If PowerShell policy prevents the helper script from running, use the direct Gradle wrapper command below only after the same JDK/SDK prerequisites are installed:

```bat
gradlew.bat --no-daemon :app:assembleDebug --stacktrace
```

The expected output after a successful build is:

`app\build\outputs\apk\debug\app-debug.apk`

The Phase 8 isolated build produced an APK at that path. A clean extraction rebuild is recorded in `PHASE8-THIRD-PERSON-ACCEPTANCE.md` and the master source README.

## Verify and install (after building)

```bat
certutil -hashfile app\build\outputs\apk\debug\app-debug.apk SHA256
adb devices
adb install -r app\build\outputs\apk\debug\app-debug.apk
adb shell monkey -p com.sightline.v3 1
adb logcat -c
adb logcat -d -s chromium WebView AndroidRuntime
```

Keep Android USB debugging enabled only for trusted development devices. The Gradle-generated **debug signing** is for local installation tests only, not a production signing identity. Do not publicly distribute an APK without security, privacy, device and gameplay testing.

## Windows LAN server

Use the **separate original Windows ZIP**: extract, install Node.js LTS, run `host.bat`. The game server uses port **8080** and prints a URL similar to `http://192.168.1.20:8080`. Connect both devices to the same trusted Wi-Fi, enter only the PC's private IPv4 address in the Android launcher, and do not forward port 8080 to the internet. The Windows source/server was not modified for this project.
