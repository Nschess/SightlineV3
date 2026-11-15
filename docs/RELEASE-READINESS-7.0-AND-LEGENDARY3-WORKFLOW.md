# Sightline V3 Release Readiness 7.0 workflow

This candidate is an isolated descendant of Android 5.1 / Gameplay Quality 6.0. The verified v4 APK is preserved at `artifacts/baseline/SightlineV3-Android-5.1-debug-v4.apk` and must never be replaced. The package ID and debug signer are pinned to the evidence recorded in `acceptance/apk-baseline/APK-RESTORATION-5.1-REPORT.md`.

## Host test (CMD)

```cmd
cd /d "<extracted SightlineV3-Release-Readiness-7.0-DEV folder>"
VERIFY.bat
START-HOST.bat
```

The phone-host runs in HTTP/WS development mode by default. Keep the host window open. Do not expose port 8080 to the public Internet. Live multi-peer reconnection testing remains unverified in this environment because isolated localhost TCP access is denied; the included deterministic protocol and lifecycle regressions are not a substitute for that acceptance.

## Import Claude Legendary 3.0

Do not overlay a Claude ZIP onto the protected source. Place the reviewed drop in a new directory, preserving package-relative paths under `AndroidProject/app/src/main/assets/www/` and `AndroidProject/app/src/main/assets/phone-host/`. Each runtime file must be supplied in both paths with identical bytes. Put a separate JSON manifest outside the drop:

```json
{
  "schemaVersion": 1,
  "owner": "Claude",
  "candidate": "Legendary Guns 3.0",
  "files": [
    { "path": "AndroidProject/app/src/main/assets/www/weapon-skins.js", "sha256": "<64 lowercase hex>" },
    { "path": "AndroidProject/app/src/main/assets/phone-host/weapon-skins.js", "sha256": "<same 64 lowercase hex>" }
  ]
}
```

Run the intake/staging command from an authorized workspace. It validates every drop file against the manifest, rejects paths outside packaged game assets, requires Offline/phone-host parity, checks current project instructions, refuses an existing output path, and stages a new child copy without writing to its source:

```cmd
node tools\prepare-legendary3-integration.cjs "<protected 7.0 DEV root>" "<drop root>" "<manifest.json>" "<new child DEV path>"
```

The intake script is a guarded staging tool, not visual approval. Before accepting the child, review its `acceptance/legendary3-integration-delta.json`, inspect the source diff manually, and verify that only Claude-authorized Legendary modules, their mirrored copies, and refreshed integrity lists changed. Reject incomplete first-person hand prototypes and confirm they are not newly registered. Then run:

```cmd
cd /d "<new child DEV path>"
VERIFY.bat
node tests\phase2-android-asset-parity.mjs
```

Visual, audio, offline/LAN kill-event, and physical-device acceptance must be performed separately; automated source checks cannot mark those gates PASS.

## Android APK build after review

The current v4 APK is old-baseline evidence, not an APK of the 7.0 host diagnostic change or a future Legendary drop. Use only an approved isolated toolchain. Set these four variables in that isolated CMD session; do not fall back to Android Studio, personal SDK/JDK locations, or machine-wide caches:

```cmd
set "SIGHTLINE_JDK17_ROOT=<isolated JDK 17 root>"
set "SIGHTLINE_ANDROID_SDK_ROOT=<isolated Android SDK root>"
set "SIGHTLINE_GRADLE_USER_HOME=<isolated Gradle cache>"
set "SIGHTLINE_ANDROID_USER_HOME=<isolated Android user home containing the preserved debug.keystore>"
tools\build-next-apk-isolated.cmd
```

The script requires SDK Platform 36 and Build Tools 35+, runs Node regressions and Android parity, builds with the checked-in Gradle 8.13 wrapper in offline mode, checks package ID/version, verifies the preserved v4 signer and ZIP alignment, and compares every packaged asset hash with the current source. It intentionally refuses `versionCode <= 4`; bump the reviewed next candidate to 5 before an update build. It does not accept new licenses, contact SDK repositories, sign a release APK, install to a device, or publish an artifact. If tool paths or offline dependencies are missing, preserve the blocker instead of redirecting to personal-machine installs.
