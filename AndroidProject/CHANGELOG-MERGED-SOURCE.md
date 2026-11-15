# Android integration changelog — source-only

- Based on user's exact 39-entry/386,422-byte authoritative Android archive (SHA-256 recorded in QA JSON).
- Preserved fixed MainActivity and removed conflicting final `onReceivedError` override from branding patch.
- Integrated selected Precision Chevron launcher/adaptive/round/monochrome assets and native splash.
- Integrated optional first-party HTTPS update policy, digest and signing identity checks, Android-approved installer, LAN policy preserved.
- Set **provisional** candidate versionCode 3 (subject to owner's historical version reconciliation).
- Restored Gradle 8.13 wrapper properties; added owner-PC Gradle wrapper generation instructions and script (official wrapper JAR unavailable here).
- Preserved all game HTML/JS and Windows LAN compatibility unchanged. No gameplay feature changes.
- No signing keystore or APK generated; device verification not performed.

## Phase 2 selective source recovery — 2026-10-23

- Working base remains the newer `SightlineV3-P4-BROADER-GAMEPLAY` source. P1173 was retained as a byte-level comparison and rollback reference; no whole-build overlay was used.
- Imported the V14 Infection-only reactive evasion behavior into the actual offline and LAN-host game paths. It reacts to observed nearby gunfire or real damage, waits for the configured bot skill response window, and uses existing navigation, collision, gravity and speed limits. It does not alter Outbreak behavior, infection HP/damage, weapon accuracy, reloads or hit detection.
- Reused per-zombie option/output scratch objects in the new AI path to avoid allocating those containers on every update.
- Updated Android offline/host module allowlists, host static route, staged asset SHA-256 manifest and bundle hash pin. `CURRENT-SOURCE-SHA256.txt` records the touched Android runtime files.
- Code regressions passed: 3 Infection evasion/server movement checks, 16 authoritative multiplayer checks, 24 server-derived shotgun spread checks, 18-map schema parity, and static Android asset/hash/import parity.
- Android APK compilation, rendered FPS, desktop browser visuals, Android device behavior and networked live-session tests remain unverified in this isolated code-only pass. No performance metric or APK pass is claimed.
- No original ZIP or baseline source tree was modified.
