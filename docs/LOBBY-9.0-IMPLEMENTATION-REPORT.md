# Lobby 9.0 implementation and acceptance report

**Candidate:** Sightline V3 Lobby 9.0 Experimental DEV  
**Date:** 2026-11-07  
**Parent:** Gameplay Expansion 8.3, preserved as a separate untouched source tree and rollback reference.

## Implemented

- Replaced the old start-menu presentation in both production Offline and phone-host pages with four primary game routes: Play, Loadout, Operators, and Settings. Records, Field Guide, Preferences, and Key Bindings remain reachable as secondary routes.
- Added a real in-engine operator preview built from the current selected operator and existing weapon geometry. It uses the existing Three.js scene and renderer, restrained point lighting, and low-amplitude idle motion. The showcase hides when a match starts. No separate render pass, external asset, or Legendary branch was added.
- Integrated Tactical, Free-for-All, Bomb Defusal, Outbreak, and Infection into Play. Deployment summaries follow the selected mode, map, operator, and rules.
- Added map selection with the existing arena plans and A/B site markers for Bomb Defusal. The game mode and map controls route into the existing match configuration.
- Kept existing weapon/finish customization reachable from Loadout, and existing character selection reachable from Operators.
- Grouped existing settings into Graphics, Audio, Controls, Gameplay, and Network; moved Records and Field Guide to secondary navigation. Existing setting keys and local persistence were preserved. Mobile HUD options remain under Controls.
- Updated the Android host bundle SHA-256 pin, phone-host asset inventory, Android source inventory, and the host capture's source fingerprint to match the new phone-host entrypoint.
- Updated two stale UI regressions whose expectations referred to the removed settings tab and sticky layout. The tests now assert the current five categories, retained mobile controls, focus behavior, and non-sticky overlay navigation.

No game combat, AI, networking protocol, weapon geometry, Legendary module, or rules implementation was changed for this lobby work.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Complete Node regression suite | PASS | 62 test files; 285 passed, 0 failed |
| Authoritative combat | PASS | 8/8 checks |
| Map navigation audit | PASS | 19 maps; 0 reported faults |
| Android source and asset parity | PASS | 48/48 phone-host manifest entries; 15/15 shared modules; native bundle pin and allowlists checked |
| Production-page Chromium exercise | PASS | 8 grouped scenarios; no page errors; Offline and phone-host entrypoints |
| Actual 3D lobby showcase | PASS | Offline idle lobby; 9 operator-scene meshes and 34,200-vertex equipped weapon mesh at 1600x900 |
| Mode, map, and Bomb sites | PASS | All five mode choices, map selection, Bomb A/B setup, and deployment flow exercised |
| Settings and persistence | PASS | Categories exercised; test changed Mobile HUD opacity to 75%, reloaded, and confirmed persistence |
| Landscape responsiveness | PASS | 960x540 emulated viewport; 960px scroll width (no horizontal overflow) |
| Current-source APK build | BLOCKED / NOT RUN | Prior isolated SDK provisioning was stopped at the user's direction; no APK is represented as current-source output |
| Live LAN and WebSocket session | BLOCKED | Isolated localhost/network restriction; phone-host page was rendered without a live host |
| Physical Android and GPU performance | UNVERIFIED | No physical device or Android GPU test was used |
| Human visual review | UNVERIFIED | Owner review is still required |

The browser used isolated Chromium with SwiftShader software rendering and the packaged production HTML. This is actual application rendering, but its frame timing is not Android or hardware-GPU performance evidence. Screenshots and the machine-readable run report are in `acceptance/lobby-9-actual-browser/`.

## Source and rollback

The parent Expansion 8.3 source directory was not used as an edit target. The descendant keeps the pre-lobby Offline and phone-host pages under `rollback/lobby-9.0-pre-change-2026-11-07/`. The existing Expansion 8.3 manifest files remain as historical baseline evidence; `LOBBY-9.0-DEV-MANIFEST.json` identifies the current candidate.

Use `docs/LOBBY-9.0-ROLLBACK.md` for the revert procedure. The new package is experimental and is not signed, promoted, or distributed as a release.
