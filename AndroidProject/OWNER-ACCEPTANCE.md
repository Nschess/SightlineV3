# Sightline V3 — One focused Samsung Galaxy A17 5G acceptance

**Perform on a copy/backed-up setup. Do not uninstall an existing APK containing important data.** Samsung Galaxy A17 5G / Android 16 target (physical evidence not yet obtained).

1. On Windows, audit against your **latest local Android project** and established signing credentials; reject unexplained Java/manifest differences. Build debug APK via genuine SDK/Gradle; verify the installed application ID `com.sightline.v3`.
2. Install APK; see the teal/white V with orange stripes under launcher circular/adaptive/themed masks. Cold-start splash appears briefly and opens directly to the native Offline / Join PC LAN launcher; no extra delay.
3. Airplane mode (Wi-Fi off): Play Offline → Tactical and Outbreak; verify WebGL assets, movement, two-thumb Fire + Aim, ADS/scopes, pause/resume. Check Infection and Deathmatch mode selection. No server required for offline mode.
4. Change HUD and aim options. Force stop / relaunch app; confirm the same offline settings, and separately verify LAN-origin settings when connected.
5. Trusted private Wi-Fi: host Sightline on a Windows PC at `http://<PC-IP>:8080`; join using native PC IP entry; verify PC/WebSocket origin protection, movement/fire, round results, and safe failure when PC goes offline. Never expose port 8080 to the internet.
6. Updates should be disabled when no manifest is configured. For an owner-controlled test feed, use only HTTPS and a matching signed APK. Test Later, no-network, bad checksum, wrong package, wrong signer, downgrade, and redirect rejection; ensure offline play still works.
7. Using the **same release signing identity**, install signed v2 with known saved HUD/game preferences, install higher signed v3 over it **without uninstall**, confirm preferences retained. Debug→release is a separate migration and cannot be assumed to work in place.
8. Capture Android build log, Android System WebView version, FPS/frame times and any crash/logcat; attach screenshots and observed outcomes before marking PASS. If any critical feature fails, stop and keep previous build.

**Certification is not complete until the actual phone and signed APK are tested.**
