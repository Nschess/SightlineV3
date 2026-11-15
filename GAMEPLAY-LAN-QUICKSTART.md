# Gameplay/LAN Zombies 4.0 — Experimental Testing

This is an experimental source build for private gameplay evaluation. It is not a release package and has not passed live LAN, browser visual, APK, Android-device, or human acceptance.

## Start the Windows LAN host

Extract the ZIP to a new folder, open Command Prompt, then run:

```bat
cd /d "%USERPROFILE%\Documents\SightlineV3-Gameplay-LAN-Zombies-4.0-EXPERIMENTAL-DEV"
START-HOST.bat
```

Keep the host window open. On a phone or second PC connected to the same private Wi-Fi, open the `Friends join:` address printed by the host. Do not port-forward the development HTTP/WS host.

## Evaluate the cadence change

Start an Outbreak match at 16, 32, and 64 requested bots. The existing Outbreak cap means 64 requested creates 56 survivor AI bots plus eight reserved horde slots. Observe zombie target acquisition and movement, including when a nearby survivor is behind cover. Also check Infection and ordinary movement to confirm their behavior is unchanged.

This package changes only the LAN host's Outbreak perception refresh timing to match Offline's 240–350 ms scan window. The host remains authoritative and the five-candidate visibility limit is unchanged.

## Verify files and run regressions

From the extracted project root:

```bat
node tools\verify-gameplay-lan-package.cjs .
node tools\run-package-regressions.cjs
node tests\phase2-android-asset-parity.mjs
node tests\phase6-source-manifest.cjs
```

`START-HOST.bat` launches the experimental candidate. The source report and benchmark JSON files in `acceptance\` record the isolated simulation evidence. They do not prove live Wi-Fi smoothness, browser frame rate, or Android hardware performance.
