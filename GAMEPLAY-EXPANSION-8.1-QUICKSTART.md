# Sightline V3 — Gameplay Expansion 8.1 (Experimental DEV)

This is an experimental source candidate for manual evaluation. It is not a release, and it does not contain a current-source APK.

## Extract and verify

From Windows Command Prompt, choose a new folder and run:

```bat
mkdir "%USERPROFILE%\Documents\SightlineV3-Expansion8.1-Experimental"
tar -xf "<path-to-SightlineV3-Gameplay-Expansion-8.1-EXPERIMENTAL-DEV-2026-11-07.zip>" -C "%USERPROFILE%\Documents\SightlineV3-Expansion8.1-Experimental"
cd /d "%USERPROFILE%\Documents\SightlineV3-Expansion8.1-Experimental"
node tools\verify-expansion8.1-dev-manifest.cjs . --strict
SIGHTLINE.bat verify-full
```

The source manifest intentionally excludes the inherited stale `PACKAGE-MANIFEST.json`, the older Android 5.1 v4 APK, and temporary `tests\.tmp` staging. The excluded source-tree files, when present in the editable candidate, remain untouched.

## Start gameplay

For Offline play, use two Command Prompt windows:

```bat
SIGHTLINE.bat offline
```

Then in the second window:

```bat
SIGHTLINE.bat open-offline
```

For a private LAN host, run:

```bat
START-HOST.bat
```

The Windows host uses development HTTP/WS. Keep it on a trusted private LAN and do not port-forward it. Live Wi-Fi acceptance has not been completed for this candidate.

## Scope and acceptance limits

The candidate adds a loopback-only static server for the actual Offline game, an Offline CMD launch path, revised Bomb Defusal objective decisions for bots, and dynamic A/B site labels in map previews. Deterministic map checks cover the shipped 19 Offline maps and 19 phone-host maps.

The full Node suite, combat, navigation, and source parity checks are runnable with `SIGHTLINE.bat verify-full`. Browser-rendered appearance, live remote LAN, a fresh APK, Android device performance, and human gameplay acceptance remain unverified or blocked. The preserved old APK is excluded and must not be treated as a build of this source.
