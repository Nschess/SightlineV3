# Sightline V3 Lobby 9.0 Experimental DEV

This package is an editable test candidate, not a release. The lobby runs in the Offline entrypoint and in the phone-host/LAN entrypoint. Expansion 8.3 remains the rollback baseline.

## Windows CMD

Extract the ZIP into a new folder, open CMD in that folder, then run:

```bat
SIGHTLINE.bat verify-full
```

Start Offline in one CMD window:

```bat
SIGHTLINE.bat offline
```

Open `http://127.0.0.1:8090/` in a browser. To stop Offline, press Ctrl+C in its server window.

Start the LAN host in another CMD window:

```bat
START-HOST.bat
```

The host opens at `http://localhost:8080`; clients on the same private LAN use the host's displayed private address. Keep the host window open. Do not port-forward the development port. To stop it, press Ctrl+C.

For source integrity and project-instruction verification, run:

```bat
node tools\verify-lobby-9-dev-manifest.cjs
```

The optional production-page browser harness is:

```bat
node tests\lobby-9-production-ui.cjs
```

It requires Playwright and a compatible Chromium. Set `SIGHTLINE_PLAYWRIGHT_MODULE` or `SIGHTLINE_CHROMIUM_EXECUTABLE` only when the test environment needs explicit paths. The screenshots shipped in `acceptance\lobby-9-actual-browser` were captured from the packaged production pages in isolated Chromium.

## Acceptance limits

- The Chromium run exercised actual production game HTML and Three.js, in Offline and phone-host entrypoints. Chromium used SwiftShader software rendering.
- The LAN entrypoint was rendered as a packaged page; a live host/WebSocket session was not run in the isolated environment.
- The 960x540 landscape view is an emulated viewport, not a physical Android device.
- This package contains no newly built APK. Android GPU performance, phone installation, and physical touch acceptance remain unverified.
- Human visual approval remains with the project owner.
