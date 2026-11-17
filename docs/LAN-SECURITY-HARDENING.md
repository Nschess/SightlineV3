# LAN security and reliability hardening

Branch starts at verified v18 checkpoint `7b7706c0ad1ce25594ddc8d3759e25d057b1d171`. This source-only milestone preserves the v18 APK as rollback; it does not produce a new APK or claim device acceptance.

## Implemented

- The shared Windows/Android authoritative server now binds to one selected private IPv4 interface by default. It rejects wildcard and public binds. If no private interface exists, it listens only on loopback. Console join-address output filters virtual/public interfaces.
- Incoming WebSocket clients must originate on a private IPv4 LAN (mapped IPv4 addresses are normalized; loopback is allowed only for an explicitly loopback-bound server). Pending hellos are capped globally and per source IP before upgrade and always release their reservation on acceptance, rejection, timeout or disconnect.
- WebSocket text messages use a fixed-size sliding one-second limiter in addition to the existing frame-rate, frame-size, queue, and hello-time limits. No per-message timing arrays are allocated. The HTTP server also bounds header/request time, header count, idle connections, and total sockets.
- LAN discovery now caps both remembered source addresses and candidates per scan. A flood of unique private source addresses can no longer grow the responder's throttle map or the client's pending verification set without bound.
- Windows starts the child host with a small explicit environment allowlist, excluding inherited credentials, `NODE_OPTIONS`, package-manager and editor variables. Shutdown now waits for exit, escalates to kill, and reports failure instead of returning a false stopped result. The local game bridge also has bounded HTTP resources.

Gameplay authority, protocol version, packet semantics, HUD, camera/ADS, assets, Android foreground service behavior, release TLS configuration and cleartext policy were not changed. No gameplay tests, automated suites, emulator, phone, benchmark or APK build was run in this cycle, as requested. The implementation follows the existing v18 source/test evidence. Runtime compatibility and resource limits remain UNVERIFIED.

Rollback: v18 commit above and its already-built diagnostic APK remain unchanged. Production `main`, the protected HUD51 APK and Adventure Mode remain outside this branch.
