# Gameplay Quality 6.0 Experimental DEV — Quick Start

This is a source-verification candidate based on Android 5.1 / LAN Zombies 4.2. It contains no confirmed gameplay-runtime change. Use it to reproduce the tests and assess the inherited build in a controlled environment; it is not a release.

## CMD verification

From the extracted project root:

```bat
VERIFY-GAMEPLAY-QUALITY.bat
```

Expected deterministic results: 243/243 integrated regressions, 26 settings checks, mobile touch-source checks, 48 frame-pacing checks, 15 Offline 64-bot source-contract checks, and Android host/shared asset parity.

## Start the Windows development host

```bat
START-HOST.bat
```

Open the host URL printed by the script. Friends on the same trusted private LAN may use the printed LAN URL. Keep the host console open; press Ctrl+C to stop. Do not port-forward the development port. This candidate has not passed live Wi-Fi or remote-client smoothness acceptance.

## Evidence limits

`GAMEPLAY-QUALITY-6.0-REPORT.md` distinguishes deterministic/source checks from browser, GPU, phone, Wi-Fi, and human gameplay acceptance. A successful `VERIFY-GAMEPLAY-QUALITY.bat` run does not prove those external gates.
