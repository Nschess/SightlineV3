# Sightline V3 Lobby 9.1 Experimental DEV

This editable package is an experimental continuation of Lobby 9.0 and Gameplay Expansion 8.3. It is not a release. Claude Legendary work remains separate.

## Windows CMD

Extract the ZIP to a new folder, open CMD in that folder, and run the static and deterministic verification suite:

```bat
SIGHTLINE.bat verify-full
```

Run Offline mode in one CMD window:

```bat
SIGHTLINE.bat offline
```

Then open `http://127.0.0.1:8090/` in a browser. Stop the server with Ctrl+C.

Run the private-LAN development host in another CMD window:

```bat
START-HOST.bat
```

Open `http://localhost:8080` on the host. Other devices on the same trusted private LAN can use the private address printed by the host. Keep the host window open; stop it with Ctrl+C. Do not port-forward the development port.

Inspect the Offline and phone-host source fingerprints with:

```bat
SIGHTLINE.bat build-info
```

Run the packaged-page UI checks in an environment with Playwright and Chromium:

```bat
node tests\lobby-9.1-production-ui.cjs
node tests\lobby-9.1-frame-benchmark.cjs
```

The second command compares Lobby 9.0 and 9.1 in the isolated SwiftShader software renderer. It is not a hardware performance test.

Run the current package source manifest verifier with:

```bat
node tools\verify-lobby-9.1-dev-manifest.cjs
```

## Acceptance limits

- The included screenshots come from actual packaged Offline and phone-host pages in isolated Chromium, using software WebGL.
- The phone-host page was loaded from its packaged file entrypoint; no live LAN or WebSocket session was exercised in the isolated runtime.
- 960×540 is an emulated landscape viewport; no physical Android device or Android GPU was tested.
- No APK was built from this source. Human visual acceptance remains with the project owner.
