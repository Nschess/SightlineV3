# Android transport security review

**Scope:** source review of the secure-transport development descendant, 2026-11-01. This is not an APK or device acceptance record.

**Offline game:** AndroidX WebKit `WebViewAssetLoader` serves bundled assets through `https://appassets.androidplatform.net`. File URL access, universal file URLs, content access, third-party cookies, cross-origin navigation, and extra windows are disabled. No JavaScript bridge is exposed to native Android.

**Debug LAN builds:** the debug source set alone permits cleartext traffic. The debug app joins a private IPv4 host over HTTP/WS. Use only an isolated trusted development network without port forwarding, internet exposure, or sensitive data. The in-app address validation remains restricted to private IPv4 addresses and port 8080.

**Release LAN clients:** the main manifest and network security configuration deny cleartext. Release build configuration requires a non-reserved DNS hostname and normal HTTPS certificate validation. The Android client connects only to that configured host on port 8080; it has no certificate override and the game page selects same-origin WSS only. A failed certificate check has no insecure fallback. Release builds cannot enable the embedded phone-host service because that service only serves development HTTP/WS.

**Windows release host:** `SIGHTLINE.bat host-release` starts the HTTPS listener only after validating externally supplied certificate/key paths, approved DNS host, and a private interface bind address. The private key and optional passphrase file must live outside the project tree. TLS requires at least 1.2. Provision a certificate whose SAN matches the configured DNS name and whose chain is trusted by the joining devices. Configure LAN DNS to resolve that name to the private bind address. Do not place private keys in source, artifacts, or logs.

**Unverified:** no approved production hostname, certificate, key, or LAN DNS deployment was supplied. The isolated environment cannot run TCP listeners/clients, Android Gradle builds, or physical-device tests. Certificate acceptance in Android WebView and a real TLS/WSS handshake therefore remain unverified. No locally generated certificate should be installed or trusted by users.

**Other permissions:** the manifest retains the app's existing network and foreground-service permissions. This source review does not replace an Android security scan or permission review on a built package.
