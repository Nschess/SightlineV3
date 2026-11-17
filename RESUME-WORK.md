# v18 LAN join recovery (2026-11-17)

Current branch: `feature/cross-platform-lan-hosting`; parent `6409ff3fb1d093acac0f97a5cb22e1a8c2acabfc`. Latest checkpoint is the commit containing this note; use `git rev-parse HEAD` and compare the remote branch. Main remains unchanged.

Fixed native broadcast `.255` rejection, remote-HTML navigation dependency and bundled HTTPS offline manual-Connect/appassets WSS mismatch. Join checks a responding compatible server, keeps the old screen on failure and serves APK assets under a virtual selected-host origin. Actual WS/WSS remains server-authoritative. Production TLS policy is unchanged. Read `docs/LAN-JOIN-RECOVERY-V18.md` for exact tests and limitations. V17 rollback branch and APK are preserved. No Android runtime or connected devices were used; all actual device pairings remain UNVERIFIED. Do not repeat unavailable emulator setup or claim phone recovery.

VersionCode 18 was built successfully once. APK SHA256: `43e1437b51ab5111aa2fe6e393b20609c7a3a90b5a8d7b3c988717936a6ee6cc`, 82,947,058 bytes. All 104 assets, signature, native correction markers, permissions and diagnostic startup policy verified; see `docs/LAN-JOIN-V18-APK.json`. APKs/toolchains stay out of Git. The delivery supplies the verified remote SHA. Current-source additions after the APK are documentation and guarded test-port isolation in the Windows host manager/tests, not Android inputs.

---
Previous milestone retained below for history:
# Sightline V3 — genuine cross-platform LAN host milestone (2026-11-17)

Branch: `feature/cross-platform-lan-hosting`
Parent: verified HUD51/camera integration `fdf31c8ca876a815b7e6e5b01168c721c3cb6803`.
Latest milestone: commit containing this document; resolve `git rev-parse HEAD`. Delivery reports the verified remote SHA. Main and the original recovery/camera branches remain unchanged.

Implemented real Android hosting using the same authoritative server.js as Windows. The ARM64 Node runtime, C++20 JNI bridge and shared STL are compiled/packaged, not downloaded at game runtime. Create Match starts a foreground host process and connects the phone automatically. CPU/multicast locks, native network-address monitoring, startup/stop failures and shutdown cleanup are implemented. No PC, internet or cloud is used by a running phone host.

Windows PLAY.vbs starts the normal local game/discovery bridge without a console; Create Match automatically spawns its owned authoritative server. Existing Node runtime is required (or a private distribution can supply runtime/node.exe). The launcher has not been executed on the owner's desktop. Same-origin JSON POST guards privileged local actions; tests do not kill unrelated processes.

Canonical UDP discovery now ships with the server and is shared with Windows tools. Correct wildcard broadcast binding, nonce/private-source validation, rate limiting, HTTP readiness verification, room identity/name/capacity and stale-instance checks are present. Initial rooms wait for a real first player before advertising. Find/Refresh are bounded; manual IP is Advanced. Android native result lists no longer hide behind a message panel. Legacy compatible hosts remain manually joinable and discoverable when they advertise; newer hosts additionally verify instance identity.

Approved HUD51 DOM/CSS/text controls, multitouch, animation, camera/ADS and original gameplay are preserved. A source check proves the authoritative simulation/AI/combat/rules core is unchanged. Four human slots are configured for initial testing; that is NOT a measured Android capacity. No Adventure Mode access, production release or main merge.

Verification: 35 focused tests passed. A final real two-peer loopback protocol scenario passed 47 assertions for live startup, buying, snapshots, server-side shots, host-only configuration, scoreboard, disconnect and reconnect. Four programmatic live clients recorded 4.01 seconds of Windows Node load: CPU 156 ms (3.89% of one core), tick CPU P95 0.44 ms/P99 0.57 ms, worst tick 1.07 ms, scheduler gap P95/P99/max 32 ms. Zero AI in this load sample. These are NOT phone FPS, device capacity or rendered gameplay evidence.

Final native debug build PASSED `:app:assembleDiagnostic`; the source-integrity gate ran during Gradle. APK contains all 104 intended assets and ARM64 libnode.so, libsightline_host.so and libc++_shared.so. Signature, package identity, host-enabled BuildConfig and 16 KiB alignment passed. See docs/CROSS-PLATFORM-LAN-APK.json for exact SHA-256, size and build input inventory. APK is ignored local output: AndroidProject/app/build/outputs/apk/diagnostic/app-diagnostic.apk. VersionCode 17, package com.sightline.v3.diagnostic.visibility, debug certificate 74516cfda39e6250bf50bedab19fbcaf0d33970db6807ad3ba7888a85f59c041. It preserves the separate owner-approved com.sightline.v3.diagnostic app. Previous v16 comparison remains under app/build/outputs/rollback.

Native SDK comes from pinned community Node Mobile Lite 24.22.0-0, archive SHA-256 e04c4f818e4a613b705d009323175f0bfe3fe31a2220ca8aac4b2f73d231615d. Complete headers/library hashes, ELF alignment and embedding export checks remain fail-closed. SDK, NDK, JDK, caches and debug key are outside source; binaries are not committed. Use AndroidProject/PHONE-HOST-RUNTIME-SETUP.md and tools/build-hud51-comparison.ps1. Native .cxx generated caches are excluded, not protected source. The old installer now delegates to the explicit isolated setup instead of touching a personal SDK.

REMAINING ACCEPTANCE: Android host -> Android client, Android host -> Windows client, Windows host -> Android client and rendered Windows host -> Windows client are all UNVERIFIED. Native Android load/boot, actual touch-to-Create, real Wi-Fi routing/firewall behavior, device CPU/thermals/background lifecycle and rendered gameplay have not been exercised. No personal browser, desktop, physical phone, ADB or blocked emulator was used. Production release remains BLOCKED.

Next gate: on the same Wi-Fi, two ARM64 phones use this exact APK: A Multiplayer/Create Match; B Find LAN Match/tap Phone Match; A starts a match. Confirm synchronized movement/shooting and disconnect/rejoin with no PC running. Then use the Windows launcher for both cross-platform directions. Do not claim acceptance from source checks or APK assembly. Keep the protected APK unchanged (ACEA893BB7689A207A46834B58B3DC0E60E8F4E68E06101B566B312C80B617F2), preserve signing keys and independent evidence, and continue Git-first milestones without duplicate project ZIPs.
