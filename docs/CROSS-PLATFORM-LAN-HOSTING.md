# Cross-platform LAN hosting — private milestone

Branch: `feature/cross-platform-lan-hosting`, based on verified integration commit `fdf31c8ca876a815b7e6e5b01168c721c3cb6803`. Main, both recovery branches, the owner-approved APK and Adventure Mode remain untouched.

## Implemented player paths

Android Multiplayer -> CREATE MATCH starts the actual authoritative Node server inside a separate native foreground process, waits for the pinned local server to respond, then automatically connects the phone as a protocol-v2 player. It does not use a PC, cloud, internet endpoint or disguised single-player mode. The APK packages Node, JNI bridge, shared STL and the complete checked host bundle. Node argv storage is contiguous and null-terminated. C++20 matches the runtime headers. Foreground notification Stop, CPU/multicast locks, network-address monitoring, startup failures and shutdown cleanup are implemented. Hosting is not tied to the WebView render thread.

Windows players launch PLAY.vbs (requires the existing Node runtime, or an explicitly bundled runtime/node.exe). The normal local game bridge starts hidden; Create Match starts its owned authoritative child automatically. No separate CMD/server launch is needed. The launcher is player-invoked code and was NOT executed against the owner's desktop during development. Loopback process-creation APIs require same-origin JSON POST; other websites, GET and form posts cannot start a host. Closing the owning page requests host shutdown; Stop Hosting is visible while owned. Neither code nor tests kill unrelated processes by port.

FIND LAN MATCH uses the same bounded UDP query/reply discovery protocol on port 49192. Actual room name, instance, port, protocol, occupancy and map are advertised. Responders are checked by HTTP status before Join is offered. Wildcard UDP binding fixes broadcast reception without changing private-source validation/rate limits. New Create Match rooms wait for a real player handshake before advertising, reducing startup/creator races. Windows scans on entry/Refresh rather than polling indefinitely; Android scans are bounded. Manual IP remains Advanced. Native results no longer combine AlertDialog message/list content that could hide rooms.

Both platforms execute the same server.js simulation, rules, AI, combat and sync protocol. A source comparison proves the entire existing authoritative core remains identical to the parent; only startup, status identity and packaged discovery integration change. Discovery implementation is canonical in phone-host and reused by the Windows tools wrapper. Original HUD51 styling/rendering, multitouch, weapon animation and integrated mobile camera remain unchanged.

Four human slots are configured initially. Default AI is zero, but existing host rules/modes remain available. This is not a measured Android capacity claim. Match control keeps the established first-connected-player model; new automatic discovery waits for that initial connection. Advanced manual joining retains the existing trusted-LAN behavior.

## Evidence and limits

- Native ARM64 JNI/Node host compiled successfully in the isolated workspace. Runtime dependency is the pinned community Node Mobile Lite 24.22.0-0 SDK, with archive, library, complete-header-tree and ELF alignment checks. It is not claimed independently audited or physical-phone certified. Full third-party license is included in the APK. SDK binaries/NDK/caches stay outside Git.
- Focused source/protocol regression coverage: 35 tests. An additional existing real two-peer protocol scenario passed 47 assertions, including startup, buying, live snapshots, server-side shot processing, unauthorized configuration rejection, scoreboard, disconnect and rejoin.
- Four programmatic loopback clients exercised live movement/shots. The 4.01-second sample measured 156 ms host CPU (3.89% of one core), tick CPU P95 0.44 ms/P99 0.57 ms, worst tick 1.07 ms; scheduler gap P95/P99/max 32 ms; 201 measured live ticks. This is a short Windows Node sample with zero AI, NOT Android FPS, Android capacity or rendered gameplay evidence. See CROSS-PLATFORM-LAN-VERIFICATION.json.
- The old protocol harness waited for HTTP 403 when the existing server intentionally closed forbidden upgrades without a response. It now recognizes close-or-403 rejection, still requires 101 for valid upgrades and still fails actual timeouts. No server security rule was relaxed for the test. The load scenario waits for live phase before measuring shots.

All four real device pairings remain UNVERIFIED: Android->Android, Android->Windows, Windows->Android and Windows->Windows. Source tests, desktop loopback traffic and APK assembly do not pass those gates. Android boot of the embedded runtime, touch-to-Create, actual Wi-Fi broadcast/firewall routing, sustained CPU/thermals, background lifecycle and real client rendering are pending. No personal browser, desktop, physical phone, wireless ADB or unavailable emulator was used.

Windows firewall must allow the game/Node on the trusted Private network. Router client isolation or incompatible hotspot routing can block discovery and gameplay; the app reports failure and leaves manual joining as a fallback. No Windows firewall settings are changed automatically. Host traffic is development HTTP/WS on private LAN only; existing release transport/evidence gates remain fail-closed.

## Build and preservation

See AndroidProject/PHONE-HOST-RUNTIME-SETUP.md. Build uses isolated JDK17, Gradle8.13/AGP8.13.2, SDK36, NDK28.2.13676358 and CMake3.22.1. The native SDK is external and pinned by app/phone-node-runtime.properties. Default builds require the genuine host runtime; an explicitly disabled-host build is client-only and cannot be presented as this milestone. Generated .cxx caches are excluded from source inventory/Git while native source, lock and full dependency hashes remain verified.

The old v16 comparison APK is preserved locally under app/build/outputs/rollback. The original accepted HUD51 APK is unchanged. No duplicate full-project ZIP, production release, main merge or APK upload is created. The next acceptance gate is two Android phones playing a real synchronized match with one hosting and no PC running, followed by both Windows cross-platform paths.
