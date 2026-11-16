# Native cross-platform LAN host build

Current implementation lives on `feature/cross-platform-lan-hosting`. Main and the protected HUD51 APK are unchanged. This is a private development candidate; real Android hosting is not device-accepted.

The app embeds the same authoritative `assets/phone-host/server.js` as Windows, using a dedicated foreground Android process and pinned ARM64 Node Mobile runtime. A normal host-capable build now requires the verified native SDK rather than emitting a client-only APK silently. Use `-PenableLanHost=false` only for an explicitly labelled client-only build.

Required workspace tools: JDK 17, Gradle 8.13, AGP 8.13.2, SDK 36/build tools 35+, NDK 28.2.13676358 and CMake 3.22.1. Keep tools, SDK headers/binaries and signing keys outside source.

1. Run `tools/setup-native-host-sdk.ps1 -RuntimeRoot <external-cache> -AndroidSdkRoot <sdk>` from AndroidProject. It downloads/reuses exactly Node Mobile Lite 24.22.0-0, verifies the pinned archive, library and complete header-tree digests, and checks exported embedding symbols/dependencies using the NDK.
2. From the repository root use `tools/build-hud51-comparison.ps1` with explicit isolated Java/SDK/Gradle/cache/private-home paths and `-PhoneNodeSdkRoot <external-cache>/sdk`. It runs `:app:assembleDiagnostic` with the real host enabled and the source-integrity gate intact. Direct Gradle builds use `-PphoneNodeSdkRoot=<external-cache>/sdk`.
3. Gradle checks native SDK hashes and 16 KiB ELF alignment before compiling the C++20 JNI bridge. The private APK packages libnode, the JNI bridge and shared STL; no host binary is fetched at game runtime.

Runtime provenance: https://github.com/fogtape/nodejs-mobile/releases/tag/v24.22.0-0 — a community-maintained SDK, not an independent physical-device certification. The complete Node/third-party license is packaged as `assets/node-mobile-LICENSE.txt`. The SDK archive/headers stay outside Git; the source lock and reproducible installer stay tracked.

On Android, Multiplayer -> Create Match starts the local service and joins it automatically. Find LAN Match scans local UDP and verifies each responder over HTTP before offering Join. Same Wi-Fi or a compatible hotspot is required; router client isolation/firewall restrictions can prevent connectivity. Manual IP remains an advanced fallback. No PC, internet or cloud is required for a phone host once installed.

On Windows, the player launches `PLAY.vbs`; it starts the local game client/discovery bridge without a console window. Create Match starts the authoritative child server automatically. The existing Node.js runtime must be installed, or a private Windows distribution may provide `runtime/node.exe`. No separate server command or second application window is required. The Codex task never executes this GUI launcher.

Four human slots are configured for initial private tests, not claimed as measured mobile capacity. Phone CPU, background lifecycle, Wi-Fi routing and all real device pairings remain unverified until exercised. Do not publish or merge based on APK compilation or loopback tests.
