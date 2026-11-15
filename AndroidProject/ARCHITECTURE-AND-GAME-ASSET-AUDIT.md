# Android architecture and asset audit

**Input:** exact original Windows QA archive, SHA-256 `dfd10479ea4a18135a2895c1f846e249ccca088ade1d8f26c411a9e65efc02d3`.

The extracted desktop game contains `PLAY-OFFLINE.bat` (opens `index.html` locally) and `host.bat` (launches `node server.js`). The offline game includes its own combat, maps, AI, UI, and render code; the LAN server is Node.js and remains on Windows. No service worker file was found. The main HTML imports 12 script occurrences for 11 local JavaScript files. All 11 bundled JS assets are byte-identical to the verified Windows baseline; no weapon, map, score, bot, or combat code was edited. There are 18 map definitions and four supported mode identifiers in the baseline.

The Android-only `index.html` differs solely by removal of three optional Google Font link tags and the CDN fallback for Three.js, avoiding unexpected internet dependency. The original duplicate `combat-foundation.js` import was intentionally retained. No image files, external fonts, test screenshots, Windows executables, host server code, or QA logs are required for the offline WebGL game and none are bundled in `assets/www`.

The Android frontend has a native entry point for the offline `WebViewAssetLoader` page, or an explicitly selected `http://PC-IP:8080/` LAN origin. JavaScript only connects to LAN when running from the PC game page. The Node server's WebSocket policy accepts the same-origin host page; it intentionally rejects opaque `file://` and unrelated origins. No changes to the Windows server are required or included.

**Limitations:** Source structure, module integrity, basic desktop-inline initialization and the LAN-host input validator were checked. This is not a compiled Android app; no Android WebView instance, Android network stack, GPU, touch, persistence, or runtime gameplay was observed.
