# Lobby 9.1 visual quality pass

**Candidate status:** Source changes and deterministic checks complete. Visual acceptance is **BLOCKED**. A new DEV ZIP was not created because the project instructions require the visual acceptance gates to pass before packaging.

## Scope and implementation

- Kept the existing Lobby 9.1 navigation, route structure, selection flow, mode controls, and game entrypoints.
- Added one shared local system-font hierarchy, larger supporting labels, consistent focus states, restrained aqua/amber treatment, and mode-specific colors for Tactical, FFA, Bomb, Outbreak, and Infection.
- Refined the Operators, Loadout, Settings, Multiplayer, and match-setup text and controls through the common lobby shell. No remote fonts or runtime network assets were added.
- Improved the lobby-only 3D presentation with a compact raised display platform, framed local label, warm key light, aqua rim light, subtle operator turn and idle bob, and a display-only Phong material clone. The game actor, character geometry, rigging, hitboxes, and weapon model builders are unchanged.
- Kept the showcase within the idle lobby. It is hidden during matches. Touch rendering does not enable shadow maps. The showcase uses nine stage meshes and two non-shadow-casting point lights while visible.
- Extended the browser acceptance harness to capture all major Offline and phone-host screens at 1600×900 and 960×540, including three distinct operator previews on each layout. New screenshots write to a separate output directory and cannot overwrite earlier Lobby 9.1 baseline screenshots.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Full Node regressions | PASS, 285/285 across 62 files | `acceptance/lobby-9.1-visual-quality/full-verification-final3.log` |
| Authoritative combat | PASS, 8/8 | Same log |
| Navigation audit | PASS, 19 maps, 0 faults | Same log |
| Android asset parity | PASS, 48/48 phone-host files and 15/15 shared files | Same log |
| Offline/phone-host lobby CSS | PASS, byte-identical shared visual blocks | `node tools/verify-lobby-visual-source.cjs` |
| Offline/phone-host showcase | PASS, byte-identical implementation | Same source verifier |
| Android host page bundle pin | PASS | Same source verifier |
| Rollback snapshot | PASS, 7/7 files match recorded size and SHA-256 | Same source verifier |
| Browser interaction and screenshot harness syntax | PASS | `node --check tests/lobby-9.1-production-ui.cjs` |
| Actual candidate browser screenshots | BLOCKED | Isolated Chromium could not launch. The available packaged Chromium exited with status `3221225506`; no candidate screenshots were generated. Do not use the older screenshot set as evidence for this source. |
| Candidate frame-time comparison | UNVERIFIED | No current candidate WebGL session could be rendered. |
| APK build / physical Android | UNVERIFIED | No current APK was built and no device was tested. |
| Live LAN UI | UNVERIFIED | Phone-host page parity passed, but no live host/browser session was measured. |

The earlier Lobby 9.1 software-renderer sample is retained as a baseline only: 27 draw calls, 21,814 triangles, 36 geometries, and 23 textures at 1600×900; reported RAF interval P50/P95 was 216.6/399.9 ms on desktop SwiftShader. That sample is not a hardware FPS result and is not a measurement of this candidate. This pass adds nine stage meshes and two lobby-only point lights; its actual frame-time cost remains unmeasured.

The earlier `LOBBY-9.1-DEV-MANIFEST.json` and its verifier are preserved as historical Lobby 9.1 metadata. Use the new `acceptance/lobby-9.1-visual-quality/SOURCE-MANIFEST.json` and `tools/verify-lobby-visual-quality-source-manifest.cjs` for this working tree.

## Visual decision

**DEFER visual approval.** The source and deterministic checks pass, but the required rendered review has not occurred. The existing 9.1 browser screenshots are preserved under `acceptance/lobby-9.1-actual-browser/` and are explicitly from the previous source hashes. The expanded harness will create candidate-specific screenshots in `acceptance/lobby-9.1-visual-quality/actual-browser/` when run in an environment where Chromium can launch. The isolated browser attempt failed because its packaged Chromium process exited with status `3221225506`; no screenshot from the updated candidate exists.

## Source fingerprints

| File | SHA-256 |
|---|---|
| Offline production page | `d711c7e5d4ffd178805d37fda1632c7c41ab75653aa50c0f61da1854e4582e1e` |
| Phone-host production page | `a0ad20aaea2886bb814f508ae5f678a2c43a90fbe4168e21037f18c401e87752` |
| Phone-host `SHA256SUMS` | `3835190ca683438be344b5edcf1e070724f399b691a592eefca63be3745cbd5b` |
| Android `CURRENT-SOURCE-SHA256.txt` | `b3936cf28bb5645b91906254e27a8f6f522aeb6c6b38fc0cdfe2b5b6b6475f42` |
| `MainActivity.java` | `1dcf7db7fa41f237aac13f3de2632f868a8ef6a524390367b1229aa512af0d1a4` |
| LAN capture helper | `f240b5076ef5c796c0a90bd00dbaff50301d6894c8579d82937c2058900a5a21` |
| Browser acceptance harness | `37e9967b588ea0788c0a454116a2e17bc959106d80b91fce499335c3202ed6ba` |
| Project `AGENTS.md` | `df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2` |

The current source-directory manifest and checksum are under `acceptance/lobby-9.1-visual-quality/`. They cover the editable candidate tree, not a ZIP.

## CMD test and capture

From the candidate DEV root:

```bat
node tools\verify-lobby-visual-source.cjs
node tests\lobby-9.1-production-ui.cjs
```

The second command writes desktop and emulated Android-landscape screenshots for Offline and phone-host screens, including three distinct operators. It requires Playwright and a Chromium executable. This environment could not launch Chromium, so this command has **not** passed here.

To manually try Offline gameplay:

```bat
SIGHTLINE.bat offline
```

Open `http://127.0.0.1:8090/` yourself. For LAN, use another CMD window and run `START-HOST.bat`; the host page is `http://localhost:8080/`. This is a user-run test procedure, not evidence that live LAN was tested in this environment.

## Rollback

The exact pre-change copies and hashes are preserved under `rollback/lobby-9.1-visual-quality-baseline-2026-11-07/`. Follow `docs/LOBBY-9.1-VISUAL-QUALITY-ROLLBACK.md` to restore only the touched files in this candidate.
