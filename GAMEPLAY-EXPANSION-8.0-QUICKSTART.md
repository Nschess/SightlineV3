# Sightline V3 — Gameplay Expansion 8.0 (Experimental DEV)

This package adds Offline and LAN Free-for-All and Bomb Defusal integration. It is an **experimental source candidate**, not a release APK.

## Run on Windows

Extract the ZIP to a new folder, open Command Prompt in that folder, and run:

```bat
START-HOST.bat
```

The host is development HTTP/WS for trusted private LAN use. Do not port-forward it. Keep the CMD window open. The host should print page fingerprint `9e0a605032bff0b0c9a13f2c85d4ff06f9a2d6a7865e24d0ce869b3a69229478` and host-manifest fingerprint `68b6fb63aa54ea81b165edb0fbe2d646650616e0ccb89c9160ae8e49b31de99a`.

Check that the correct build is running from another CMD window:

```bat
curl.exe -s http://127.0.0.1:8080/status
```

The JSON `bundle` and `server` values should match the fingerprints above. If they do not, stop that host and start `START-HOST.bat` from the extracted Expansion 8.0 folder.

Start offline play with `SIGHTLINE.bat`.

## Verify the extracted source

From the extracted project root:

```bat
node tools\verify-expansion-8-dev-manifest.cjs .
node tools\run-package-regressions.cjs
node tests\phase2-android-asset-parity.mjs
node --test tests\gameplay-mode-rules.test.cjs
node tests\authoritative-combat.mjs
node tests\map-bot-navigation-audit.cjs
```

## Android status

No new APK is included. The preserved `artifacts\baseline\SightlineV3-Android-5.1-debug-v4.apk` is an older build and is not evidence for this source. Android asset parity passes statically; current-source APK build and device testing remain unverified.

## Modes and limits

- Offline FFA counts the selected bots in addition to the player.
- Offline Infection's bot setting remains a companion roster; Bomb Defusal has separate attacker and defender bot counts.
- LAN FFA and Bomb Defusal use the existing Protocol V2 authoritative host.
- Live LAN smoothness, browser visuals, Android rendering, and physical-device behavior have not been accepted in this environment.
