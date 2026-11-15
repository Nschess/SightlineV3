# Sightline V3 — Gameplay Expansion 8.2 (Experimental DEV)

This is an experimental development package, not an approved release. It contains the actual Offline and phone-host game assets plus the current test and acceptance evidence. LAN FFA scoring remains unverified; see `docs/EXPANSION-8.2-ACCEPTANCE-REPORT.md`.

## Extract

Open Command Prompt and extract into a new folder:

```bat
mkdir "%USERPROFILE%\Documents\SightlineV3-Expansion8.2-Experimental"
tar -xf "<path-to-SightlineV3-Gameplay-Expansion-8.2-EXPERIMENTAL-DEV-2026-11-07.zip>" -C "%USERPROFILE%\Documents\SightlineV3-Expansion8.2-Experimental"
cd /d "%USERPROFILE%\Documents\SightlineV3-Expansion8.2-Experimental"
node tools\verify-expansion8.2-dev-manifest.cjs
```

## Run Offline

Use two Command Prompt windows. In the first:

```bat
cd /d "%USERPROFILE%\Documents\SightlineV3-Expansion8.2-Experimental"
SIGHTLINE.bat offline
```

In the second:

```bat
cd /d "%USERPROFILE%\Documents\SightlineV3-Expansion8.2-Experimental"
SIGHTLINE.bat open-offline
```

The Offline server binds to `127.0.0.1:8090`. Keep the first window open while playing; press Ctrl+C there to stop it.

## Run LAN

In a separate Command Prompt window:

```bat
cd /d "%USERPROFILE%\Documents\SightlineV3-Expansion8.2-Experimental"
START-HOST.bat
```

The development host listens on port 8080. On a trusted private LAN, other players open `http://<host-private-ip>:8080`. Do not port-forward the development host. Keep its CMD window open and press Ctrl+C to stop it. Offline and LAN each use their own port and may run at the same time.

## Verify source

```bat
cd /d "%USERPROFILE%\Documents\SightlineV3-Expansion8.2-Experimental"
SIGHTLINE.bat verify-full
```

This does not build an APK or certify physical Android performance, private-Wi-Fi behavior, or release readiness.
