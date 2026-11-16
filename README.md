# Sightline V3 — development source

Branch status and recovery limitations are recorded in [RESUME-WORK.md](RESUME-WORK.md).
This integration uses the exact recovered HUD51 runtime plus the separately preserved
mobile camera/ADS changes. HUD rendering, controls and gameplay remain based on HUD51.
The new comparison APK has not inherited the original binary's device acceptance.

Exact original packaged HUD51 runtime assets are now preserved as recovery evidence
under [recovery/hud51-runtime](recovery/hud51-runtime/README.md), separate from active gameplay.

This is the consolidated main-game development candidate, including the PC/LAN host, Android Offline and LAN client, Lobby v10, the existing movement optimizations, and the opt-in Android frame diagnostic. Adventure Mode is developed separately and is not included. This is not a production release: Android gameplay, current performance and live multiplayer require acceptance on the target runtime.

## Project layout

- `AndroidProject/app/src/main/assets/www/`: Offline game and Android WebView assets.
- `AndroidProject/app/src/main/assets/phone-host/`: PC/LAN host, client and shared assets. These trees have intentional differences; do not blindly overwrite either.
- `AndroidProject/`: Android Studio project, Gradle wrapper, native WebView host and diagnostic build type.
- `SIGHTLINE.bat`, `START-HOST.bat` and `tools/`: Windows development launchers, servers and verification tools.
- `tests/`: focused source and simulation checks; `AGENTS.md` records the release and evidence rules.

## Run on Windows

Install Node.js, then from this directory run `SIGHTLINE.bat offline` for the Offline server, or `SIGHTLINE.bat host` for the LAN host. The commands print their local addresses and run until stopped. LAN hosting requires appropriate network permissions and a trusted network. Runtime and visual acceptance are separate from source checks.

## Build Android debug

Open `AndroidProject` in Android Studio with JDK 17, SDK platform 36, build tools 35.0.0 and network access to the pinned Gradle 8.13 and AGP 8.13.2 dependencies. From `AndroidProject`, run `gradlew.bat :app:assembleDebug` for the normal debug build, or `gradlew.bat :app:assembleDiagnostic` for the side-by-side `com.sightline.v3.diagnostic` build. The diagnostic app has separate private storage and a different launcher label. Debug signing is not a production signing identity; an existing installation can only be updated by a build signed with its matching certificate.

The optional Android phone-host native runtime requires separately provisioned, verified Node native dependencies; see `AndroidProject/PHONE-HOST-RUNTIME-SETUP.md`. Do not add signing keys or SDK locations to the repository.

## Integrity and development

Run `powershell -NoProfile -File tools/package-candidate.ps1 -VerifyOnly` on Windows to verify this snapshot's full inventory. After intentional source changes, refresh the inventory with `tools/update-package-content-manifest.ps1` before private debug packaging. Production release remains blocked until the separate mandatory acceptance gate passes. Use feature branches and pull requests; keep `main` stable. Historical reports in this tree are context, not evidence that this snapshot passed device or release acceptance. Historical owner-specific paths have been redacted; older machine-specific browser tests may need explicit environment configuration.
