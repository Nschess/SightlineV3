# Sightline V3 Premium Lobby Implementation — 2026-11-08

## Decision

**Source implementation: COMPLETE. Rendered visual acceptance: UNVERIFIED. Package/release: DEFERRED.**

This candidate implements the approved Squad Bay, Operations Table, and Armory Ready Room directions in the production Offline and phone-host pages. It is an editable, directly testable DEV directory. It is not a released or visually approved build, and no new ZIP was created.

## Implemented

- Play is organized as the **Squad Bay**: all five existing modes remain available, the selected mode and deployment details are retained, and Deploy is given the strongest action treatment. The map thumbnail is derived from the selected map data.
- Maps and Bomb Defusal use the **Operations Table** presentation. The map view is generated from the game's existing arena geometry; Bomb Defusal continues to use the existing site validation and rule controls. Existing selection handlers and gameplay configuration remain in place.
- Loadout uses the **Armory Ready Room** layout with the existing weapon rendering path, weapon/category selection, finishes, optics, and saved preferences.
- Operators retains the playable roster, faction filtering, selection/confirmation, saved choice, and the existing 3D lobby-stage character. No replacement character art or synthetic operator image was introduced.
- A coordinated original inline SVG icon family represents Tactical formation/defense, FFA combatants, Bomb Defusal, Outbreak claw, and Infection biohazard. Infection no longer uses a generic gear symbol.
- The shared visual system applies charcoal/slate, ivory, teal selection states, and amber Deploy emphasis, with desktop and landscape responsive rules and reduced-motion handling.
- The same production UI changes are present in both Offline and phone-host pages. No new remote runtime assets or dependencies were added. Gameplay systems and Claude-owned Legendary modules were left untouched.

## Changed source scope

Compared with the complete pre-change rollback snapshot at `work/lobby-ux-9.1-visual-quality-20261107/rollback-complete-pre-premium-implementation-2026-11-08/DEV`:

- **5 added files; 7 changed files; 0 missing baseline files.**
- No changed, added, or missing path matched the Legendary/weapon-skin ownership filter.
- The two production files are `AndroidProject/app/src/main/assets/www/index.html` and `AndroidProject/app/src/main/assets/phone-host/index.html`.
- Other changed files are the phone-host inventory, `AndroidProject/CURRENT-SOURCE-SHA256.txt`, the Android host page pin in `MainActivity.java`, and lobby/source verification utilities. Added files are the shared lobby CSS, its application utility, production HTML script checker, Android hash refresher, and the focused lobby test file.

## Verification

| Gate | Result | Evidence |
|---|---|---|
| Full Node regression suite | **PASS — 295/295, 64 test files** | `SIGHTLINE.bat verify-full` |
| Focused premium lobby + Lobby 9.1 source tests | **PASS — 10/10** | `node --test tests/premium-lobby-experiences.test.cjs tests/lobby-9.1-command-lobby-source.test.cjs` |
| Production page inline-script parse check | **PASS — both pages** | `node tools/check-production-html-scripts.cjs .` |
| Lobby source wiring and Offline/phone-host parity | **PASS** | `node tools/verify-lobby-visual-source.cjs` |
| Authoritative combat | **PASS — 8/8** | `SIGHTLINE.bat verify-full` |
| Navigation audit | **PASS — 19 maps, 0 reported faults** | `SIGHTLINE.bat verify-full` |
| Android source/asset parity | **PASS — 48/48 phone-host files; 15/15 shared modules** | `SIGHTLINE.bat verify-full` |
| Rollback | **PASS — 1,271 files / 222,513,174 bytes verified** | `ROLLBACK-MANIFEST.json`; SHA-256 `07cc98f25a3e6e5ec1430ad2598015082238ecc476cdf9843a957fd9a9647270` |
| Normal Offline preview launch | **BLOCKED — port 8090 returned `EADDRINUSE`** | `SIGHTLINE.bat offline`; existing listener was not stopped or changed |
| Rendered visual inspection/screenshots | **UNVERIFIED** | No updated-candidate screenshot was captured |
| Physical Android, Android GPU performance, live LAN UI | **UNVERIFIED** | No device or live host/browser acceptance was performed |
| APK build | **NOT PERFORMED** | This task changed the lobby presentation only |

Source and DOM checks establish that the UI is wired into both served pages; they do not prove visual acceptance. The occupied preview port prevented a fresh local Offline preview. No attempt was made to terminate its listener or repeat browser-automation troubleshooting.

## Current source fingerprints

| File | SHA-256 |
|---|---|
| Offline production page | `04d35ccb7afe41e9e1163130526f705132682ca2c291dad5f9f7f48c1820ef5a` |
| Phone-host production page | `7bae7a1027046a3751597914858838f0af42d1674bbfbc7a0fb6c5d3ebb50d46` |
| Phone-host `SHA256SUMS` | `f5f90610646c7959df9bf925193431de114c513b4b375bf3427114967c84d1c5` |
| Android current-source inventory | `7bb698bef1bfeeacfd1e68fbaddcea2888a7a38f9c378949f4dd24a0b0de119b` |
| `MainActivity.java` | `7182e38f45aeabc0f5d3a620b162403c3bf1ff0d7ea788300c7f948832fb4ea6` |
| Lobby stylesheet | `73acb0cb13a75d1293e2dd0fef3ecec9c98f74c7b28a259e5ed17c9c6d3ef18e` |
| Focused lobby tests | `c307aeaf9fa8235ef22712dd997a77405a4dedb2092f646f5df78515f971dc36` |
| Project `AGENTS.md` | `df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2` |

The complete current DEV inventory and per-file hashes are recorded in `acceptance/premium-lobby-implementation-2026-11-08/SOURCE-MANIFEST.json` with its `.sha256` sidecar. That manifest identifies a source directory, not a ZIP.

## Manual test workflow

From a CMD window, when port 8090 is free:

```bat
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\lobby-ux-9.1-visual-quality-20261107\DEV"
SIGHTLINE.bat offline
```

Open `http://127.0.0.1:8090/` yourself and inspect Play, every mode, map selection, Bomb Defusal A/B sites, Loadout, Operators, Settings, and Multiplayer. For LAN testing, use a separate CMD window and run `START-HOST.bat` only when its configured port is available. Keep these as user-run acceptance steps; they have not passed in this report.

## Rollback and release gate

The full untouched pre-implementation DEV tree and its hash manifest remain at `work/lobby-ux-9.1-visual-quality-20261107/rollback-complete-pre-premium-implementation-2026-11-08/`. Compare its `ROLLBACK-MANIFEST.json` before restoring any files. No original package, protected baseline, or Legendary branch was overwritten.

The project `AGENTS.md` requires actual-game screenshots for UI changes and prohibits packaging/promoting until acceptance gates pass. Therefore, do not create a DEV ZIP or label this lobby visually accepted until a fresh rendered review is captured and approved. The smallest next step is to free port 8090 safely (without stopping an unknown listener), launch this DEV root with the CMD workflow above, and inspect the actual production page.
