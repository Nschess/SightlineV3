# Sightline V3 — LAN Zombies 4.2 Experimental Test

This package is an experimental 4.1 descendant with optional LAN telemetry. It is **not** a release build and has not passed live-LAN or visual acceptance.

## Start the host (Windows CMD)

Extract the ZIP to a folder, open Command Prompt, then run:

```bat
cd /d "%USERPROFILE%\Documents\SightlineV3-Gameplay-LAN-Zombies-4.2-EXPERIMENTAL-DEV"
START-HOST.bat
```

Keep the host window open. The host prints its LAN address. Join from another device on the same trusted private Wi-Fi. This development host uses HTTP/WS; do not port-forward it.

## Collect actual client movement evidence

Open the printed host address with `/?lanDiag=1`, for example:

```text
http://localhost:8080/?lanDiag=1
```

On the second device use the host's LAN address and the same query, for example `http://192.168.1.20:8080/?lanDiag=1`. Start an Outbreak match and play for at least 60 seconds. The opt-in panel records rendered-frame intervals, client snapshot arrival gaps, host snapshot gaps, corrections, zombie steps/turns, sequence gaps, and host navigation/stuck counters. Select **Download JSON** to save the client-side record. Select **Stop capture** before downloading if you want a fixed endpoint.

For host-side samples, open a second CMD in the extracted project directory while the match is live:

```bat
tools\CAPTURE-LAN-HOST-STATUS.bat 60 1000 8080
```

This saves a source-pinned JSON capture under `acceptance\`. The client JSON measures presentation timing; the host capture measures server timing and navigation. They do not measure Android GPU FPS or Wi-Fi radio airtime.

To compare 16, 32, and 64 requested participants, record each requested count, actual `bots`/`zombies` in the host status, map, mode, and both source fingerprints. In Outbreak, the 64-request cap reserves up to eight slots for Hollowed and can therefore mean 56 survivor bots plus eight Horde slots.

## Verify the extracted package (Windows CMD)

From the project root:

```bat
node tools\verify-gameplay-lan-4.2-package.cjs .
node tools\run-package-regressions.cjs
node tests\phase2-android-asset-parity.mjs
node tests\phase6-source-manifest.cjs
```

See `acceptance\GAMEPLAY-LAN-ZOMBIES-4.2-2026-11-05.md` for evidence and limitations. Do not treat deterministic Node replay or software timings as live-network or device acceptance.

