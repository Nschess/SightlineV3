# Android Performance & Build Reliability 5.0 — Quickstart

This is an **experimental source candidate**, not an APK or release. It preserves the LAN Zombies 4.2 gameplay and opt-in telemetry. Legendary files and gameplay JavaScript are unchanged.

## Verify source package

From the extracted DEV root in Windows CMD:

```bat
node tools\verify-android-performance-5.0-package.cjs .
node tools\run-package-regressions.cjs
node tests\phase2-android-asset-parity.mjs
node tests\phase6-source-manifest.cjs
```

## Build a local debug APK when prerequisites are available

Install/select an authorized JDK 17 and Android SDK Platform 36 with Build Tools 35.0.0 or newer. Set `JAVA_HOME` and `ANDROID_SDK_ROOT` (or `ANDROID_HOME`) in that CMD session, then run:

```bat
java -version
gradlew.bat --version
build-debug.bat
```

The project uses the checked-in Gradle 8.13 wrapper. The script builds `:app:assembleDebug` only, then checks the debug signature, ZIP alignment, package identity (`com.sightline.v3`), packaged offline/phone-host pages, and APK SHA-256. Initial wrapper/plugin/dependency resolution may require network access. Do not disable TLS checks or change execution policy. The current Codex environment lacked JDK/SDK tools, so **no APK is included**.

## Windows host gameplay (independent of Android build)

```bat
START-HOST.bat
```

Keep that window open and use the printed local/private-LAN URL. For the inherited opt-in smoothness diagnostics, append `?lanDiag=1`. Do not port-forward port 8080. This host workflow does not verify Android GPU performance.

## Scope and limitations

Regression tests and static asset parity can run with Node.js. Actual Android installation, GPU/frame pacing, touch behavior, Wi-Fi play, and WebGL visuals need an authorized emulator/device/browser and remain unverified here. Keep the 4.2 parent and this experimental descendant separate.
