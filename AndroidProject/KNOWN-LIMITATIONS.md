# Known limitations and release stop conditions

1. **There is no APK in this archive.** The Android SDK, Gradle, ADB, dependency repositories, and a physical Android phone are unavailable in this runtime. Build, install and device gates are blocked.
2. WebViewAssetLoader, WebGL, touchscreen, landscape notches, audio, full app restart/persistence, and lifecycle behavior are source-integrated but **not yet verified on Android**.
3. LAN hosting is **Windows PC only**. The app must load the trusted PC game page, using HTTP and WebSockets without encryption. Do not join untrusted hosts or port-forward the PC server.
4. Android `network_security_config` allows cleartext generally to accommodate dynamic private IPv4 host addresses. The launcher restricts its own WebView URL handling to the selected private IP and port, but a compromised LAN server's JavaScript is an important residual risk.
5. The WebView game requires reasonably capable hardware acceleration and an Android System WebView supporting WebGL; real performance and thermal behavior are unmeasured.
6. Chrome-based desktop smoke tests and Java/static checks cannot establish four naturally completed Android matches or cross-device LAN reliability.
7. The Android version has no in-app PC hosting, Play Store packaging, release signing, background service, account or advertising system.
8. Production rollout/closed beta requires a genuine built APK, inspection of Android manifest/output, installation on Samsung A17 5G Android 16, real offline gameplay, real LAN joining, full restart persistence, and sustained performance.
