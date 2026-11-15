# Android Studio v7 startup integration

Open this `AndroidProject` directory in Android Studio. It retains the existing Gradle wrapper (8.13), Android Gradle Plugin (8.13.2), SDK 36 configuration, package ID `com.sightline.v3`, and the v6 native Activity/WebView setup.

## Startup route

`MainActivity.onCreate()` now opens the bundled `assets/www/index.html` through the existing `WebViewAssetLoader`. That page contains the approved Lobby v10 and is the first game interface. Android Back still opens the existing native launcher, which retains the Offline and LAN entry points. The native launcher was not removed; it is no longer the first screen.

Offline WebView startup and the native LAN join path remain separate by design: LAN selection still passes the chosen host to `openGame(host)`, while Offline uses the bundled page. A null host remains Offline even in secure-LAN variants; configured TLS-host validation applies only to an explicit join. No Adventure Mode was added.

## Build

The project remains on the existing Windows Gradle workflow. Use JDK 17, SDK Platform 36, Build Tools 35 or newer, then run `build-debug.bat` from this directory. It runs the candidate source-integrity gate before `:app:assembleDebug`. Version metadata is `7` / `0.3.4-integration-android-7`.

## Acceptance

The v7 route, local asset selection, native Back-to-launcher path, and preserved controls have focused source regression checks in `../tests/android-studio-v7-startup.test.cjs`. These checks do not prove Android rendering or touch behavior. Physical-device acceptance remains pending.
