# HUD51 + mobile camera integration — private comparison

Integration branch: `integration/hud51-mobile-camera`, based on recovery commit `b0cd2cfb2f127ff5a86781a6ca5ae5661d1beec7`.

## Provenance and scope

| Component | Evidence and treatment |
|---|---|
| Original HUD51 runtime | Exact APK-entry bytes preserved under `recovery/hud51-runtime`; 99 shared assets reused unchanged. The two active HTML pages now use the original recovered source as their base. |
| HUD and gameplay | Original HUD DOM/CSS, text-button renderer, joystick, touch ownership, weapon/reload animation, respawn, damage feedback, Bomb Defusal and radar code retained. No unrelated migration-snapshot gameplay is substituted. |
| Mobile projection | Ported from the separately preserved camera work: default 75 horizontal degrees, range 65–95, aspect-correct vertical conversion, relative ADS magnification, true Compact 2x, perspective-scaled touch look and local weapon-framing compensation. Desktop defaults and ballistics unchanged. |
| Native Android project | Surviving Git source is reused. It is not claimed to be the original Java source recovered from DEX. Protected APK inspection corroborated minSdk 26, target/compile SDK 36, landscape, hardware acceleration and package-derived providers. |
| Comparison configuration | Reconstructed diagnostic identity `com.sightline.v3.diagnostic.visibility`, versionCode 16, distinct label; production ID remains unchanged. It installs separately from the accepted `com.sightline.v3.diagnostic` app. |
| LAN policy correction | Both source-set inspection and the protected compiled APK showed diagnostic cleartext disabled. `initWith(debug)` did not inherit debug network resources. Diagnostic now explicitly reuses the existing debug network policy and manifest permission; release policy stays false. HostPolicy, WebView asset allowlist and finite bundle pins remain enforced. |
| Host compatibility | Current integration host, original HUD51 host and recovered migration host are individually pinned. An older host serves its own page; use this branch's matching host to compare the integrated camera over LAN. |

The in-game camera uses Three.js vertical FOV. Old 72 vertical degrees gave approximately 116.45 horizontal degrees at 20:9. At a 960x432 viewport and 25 m, a centered 1.8 m target projects from 21.41 px to 45.04 px hip-fire, 59.03 px iron ADS and 90.08 px Compact 2x. These are projection calculations, not rendered/device performance measurements. No character hitboxes, world assets, simulation rates or render resolution were changed.

## Focused evidence

Fourteen source/CPU checks pass across `mobile-visibility-context-recovery.test.cjs`, `hud51-packaged-recovery.test.cjs` and `hud51-camera-native-integration.test.cjs`. Their comparison baseline is the exact recovered HUD51 runtime; offline-only functions are checked only where the original includes them. They check original HUD/gameplay preservation, camera transitions, perspective, persistence, center-ray alignment, asset allowlist and native configuration. They do not prove actual WebView execution.

`:app:assembleDiagnostic` completed successfully with its source-integrity gate enabled. APK signature, alignment, identity and all 102 packaged assets were verified. Offline's generated diagnostic HTML differs only by the existing opt-in report's average-FPS field. The protected reference APK remained unchanged. Full artifact fingerprints and executed checks are in `HUD51-CAMERA-INTEGRATION-VERIFICATION.json`.

Build tools were workspace-only: existing SDK 36/build tools 35.0.0, cached Gradle 8.13/AGP 8.13.2 and official portable Temurin JDK 17.0.21+9. JDK archive SHA-256: `98518ecf554465057ee5509462631deeee374bc368c12a411d225cd29381f84b`, verified against Adoptium's release metadata. No personal Android Studio, SDK, browser, desktop or phone was used. `tools/build-hud51-comparison.ps1` takes explicit isolated paths and keeps the private debug key outside source. The Gradle gate's optional `sightlinePowerShell` selects the provided isolated PowerShell runtime while retaining identical fail-closed checks.

## Remaining acceptance

No isolated Android/WebGL gameplay runtime was exercised. The comparison is NOT an accepted baseline or release. Required checks remain: actual startup/lobby, original HUD comfort, simultaneous touch, Deploy, ADS/scope alignment and recoil, saved FOV, stationary/forward P95/P99 and live PC-host LAN gameplay. Check those against the protected APK with the same map, scene and graphics settings. No FPS improvement is claimed. Main and Adventure Mode remain unchanged; no full-project ZIP or APK upload was created.
