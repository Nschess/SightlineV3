# Sightline V3 — Gameplay Expansion 8.3 (Experimental DEV)

This is an experimental source package descended from Expansion 8.2. It adds clearer Bomb Defusal actor attribution, site/objective presentation, objective feedback, and Offline/LAN event synchronization. It is not a release, APK, or proof of physical-device acceptance.

## Verify the extracted package

From Command Prompt at the extracted project root:

```bat
node tools\verify-expansion8.3-dev-manifest.cjs
SIGHTLINE.bat verify-full
```

The first command checks every packaged file against the SHA-256 manifest. The second runs the Node regressions, authoritative combat checks, navigation audit, Android source/asset parity, and syntax checks.

## Run Offline

Open two Command Prompt windows. In the first:

```bat
cd /d "%USERPROFILE%\Documents\SightlineV3-Expansion8.3-Experimental"
SIGHTLINE.bat offline
```

Keep that window open. In the second:

```bat
cd /d "%USERPROFILE%\Documents\SightlineV3-Expansion8.3-Experimental"
SIGHTLINE.bat open-offline
```

The Offline page is served on `127.0.0.1:8090`.

## Run a LAN host

In a separate Command Prompt:

```bat
cd /d "%USERPROFILE%\Documents\SightlineV3-Expansion8.3-Experimental"
START-HOST.bat
```

On a trusted private Wi-Fi/LAN only, clients open `http://<host-private-ip>:8080`. Do not port-forward the development host. Stop it with Ctrl+C. LAN runtime acceptance is still required; deterministic protocol tests do not prove real network smoothness.

## Acceptance evidence

See `docs/EXPANSION-8.3-ACCEPTANCE-REPORT.md` and `acceptance/EXPANSION-8.3-FINAL/`. The Offline bot-driven plant/defuse loop was run in the actual game WebGL loop. LAN, manual human interaction, physical Android, audible playback, and a clear visible action pose remain unverified.
