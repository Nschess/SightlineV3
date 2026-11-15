# Android real-device update gate — TESTS NOT YET RUN

**Target:** Samsung Galaxy A17 5G, Android 16, plus a second Android device if available. Tester must keep the device and signing secrets local. Don't share APK signing keys.

## Preparation and controls

Before shipping a release-signed v2 APK, copy existing saved settings/game preferences elsewhere if you are upgrading from a debug build. A debug-signed v1 app CANNOT be updated by a release-signed v2 app in place; never uninstall first and assume data survives. Establish the release track from a **fresh release-signed v2 install**, signed by the single long-lived keystore. Confirm the exact app ID, version and signing certificate using `aapt dump badging` and `apksigner verify --print-certs`.

## Release v2 -> v3 update, exact same certificate

1. Install release-signed v2 on Android (`adb install app-v2-release.apk`), confirm `com.sightline.v3` appears. Launch offline with Wi-Fi disconnected and start each of four modes.
2. Set and record distinct values: Fire + Aim, scoped sensitivity, aim-assist mode, edited HUD layout, selected operative/weapon skins, and last LAN IP. Exit, force stop app and reopen; verify these values persist **before** update. Record a screenshot or screen recording.
3. Build release-signed v3 with a strictly higher `versionCode` and the SAME keystore. Check v2 and v3 signer's SHA-256 fingerprints match. Verify both APKs with `apksigner`.
4. Host v3 APK at your controlled HTTPS address, then publish the valid JSON manifest. Open v2 launcher, tap **Check for Updates**, verify v3 version/notes/official URL are shown, and tap **Later**; ensure offline game still works.
5. Tap **Download & Verify** and approve the explicit Android installer request. The user must be able to refuse any unknown-source permission. Android must install v3 over v2 **without uninstalling**. Alternatively use `adb install -r app-v3-release.apk` solely for checking OS continuity (this alone does NOT test the in-app update UI).
6. Relaunch v3. Confirm the *same saved values* in Step 2, including the WebView game localStorage selections and native saved LAN IP. Confirm updated `versionCode` with `adb shell dumpsys package com.sightline.v3` or APK metadata. Play a full offline match, and verify LAN joining on trusted Wi-Fi.
7. Test failed/negative cases: no connection, 404 manifest, malformed JSON, same/older versionCode, other package, wrong checksum, cross-domain APK URL, changed signer, HTTP URL, redirect, huge APK, interrupted download, lack of unknown-source permission, background/foreground, failed installation. **Every failure must leave existing game and data untouched**.
8. Measure installer failures, launcher crashes, settings loss, download memory usage and time. Leave at least several GB free space. Retest restart/force-stop after installation.

## Debug-build migration — separate and not a public release

On the same PC (same debug key), use v1 debug -> v2 debug with `adb install -r` **without uninstalling** and verify a settings canary survives. That proves debug -> debug only. Signing certificate mismatch between debug and release makes a direct debug -> release update unsupported. If you must move testers from debug to release, offer an explicit export/import flow verified before any uninstall (the current game may not provide a comprehensive export for every saved value). Do not claim lossless migration where it has not been proven.

## Actual status

The supplied work includes **host-side Java policy tests and source/static checks only**. No Android SDK, Gradle build, signed APK, physical update installation, genuine browser restart or on-device settings-retention tests were executed in this environment. Release/installation approval remains BLOCKED until they pass.
