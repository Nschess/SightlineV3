# Sightline V3 Lobby 9.1 implementation and acceptance

**Candidate:** Sightline V3 Lobby 9.1 Experimental DEV  
**Parent:** Gameplay Expansion 8.3 and Lobby 9.0, preserved separately as rollback sources.  
**Status:** Experimental; not a release build.

## Implemented

- Applied one coordinated Sightline presentation system across the Offline and phone-host production entrypoints: graphite and muted-teal surfaces, readable heading hierarchy, consistent vector route and mode marks, restrained warm accents, selection feedback, and reduced-motion behavior.
- Kept the Play, Loadout, Operators, and Settings primary routes. Records, Field Guide, Preferences, Key Bindings, Multiplayer, Maps, and Match Rules remain reachable as secondary navigation.
- Retained the actual in-game Three.js operator showcase and weapon builder. The scene uses existing character and firearm assets, existing renderer, and restrained idle motion; no new post-processing pass or Claude Legendary branch was added.
- Reworked Operators into a two-step selection flow with the 3D preview, identity and faction information, faction filters, explicit confirmation, and saved selection. The game exposes 10 player-selectable identities; the full 34-human bot roster remains present and unchanged. The 24 bot-only variants were not promoted into player choices because the existing player-selection API does not define them as selectable identities.
- Reworked Loadout around the current 28-firearm catalog and its actual first-person weapon builder, with category filters, weapon details, locally persisted preview selection, available cosmetic finishes, optics, and the existing customization bench.
- Refined Play mode selection, selected-mode brief, map preview, Bomb Defusal A/B details, and deployment summary. At the emulated 960×540 landscape viewport, the Deploy action is fully within the viewport, with no horizontal overflow. Operator choice targets measure 50×118 px at that viewport.
- Organized the existing Graphics, Audio, Controls, Gameplay, and Network settings under one Settings route. Existing settings storage and controls are retained. The mobile HUD opacity interaction and restoration after refresh were exercised.
- Fixed the phone-host Loadout route so it renders the 9.1 Loadout panel rather than falling through to an unrelated customization route.
- Updated the Android phone-host bundle pin, phone-host file hashes, Android source hashes, and LAN capture fingerprint for the actual new production page.

No combat, AI, weapon balance, networking protocol, gameplay rules, weapon geometry, Legendary assets, or character rig was changed as part of Lobby 9.1.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Complete Node regression suite | PASS | 62 files; 285 passed, 0 failed |
| Authoritative combat | PASS | 8/8 checks |
| Navigation audit | PASS | 19 maps; 0 reported faults |
| Android static parity | PASS | 48/48 phone-host files, 15/15 shared modules, native page pin and allowlists |
| Production UI browser walkthrough | PASS | 8 grouped scenarios, 17 actual production-page screenshots, 0 page errors |
| Offline and phone-host production routes | PASS within file-based runtime | Actual packaged HTML, Three.js r128 renderer, existing 3D characters and weapon previews; no live server session |
| Operator roster | PASS | All 10 existing player-selectable identities are represented; 34-human bot roster count remains 34; two identities were confirmed and persisted |
| Main navigation and persistence | PASS | Play, Loadout, Operators, Settings, weapon/finish choices, operator choices, and a Controls setting were exercised; refresh restored saved values |
| Android landscape layout | PASS in emulated viewport | 960×540; no horizontal overflow; Deploy visible; operator controls at least 50×118 px |
| Matched renderer diagnostics | See JSON | Baseline Lobby 9.0 vs candidate Lobby 9.1 in the same Chromium SwiftShader environment; report contains source hashes and renderer counters |
| Current-source APK | NOT BUILT | This task did not provision or use an Android SDK/JDK build environment |
| Live LAN/WebSocket gameplay | BLOCKED | Localhost network access is unavailable to this isolated runtime; phone-host page was loaded from its packaged file |
| Physical Android GPU/touch and human visual acceptance | UNVERIFIED | No phone or first-time player test was available |

The Chromium screenshots are real production-page renders but use SwiftShader software WebGL. The accompanying frame intervals are renderer diagnostics for the isolated runtime only; they are not Windows or Android FPS. See `acceptance/lobby-9.1-actual-browser/report.json` and `performance-comparison.json`.

Screenshots include Play, Offline Map selection, Bomb setup, Loadout and restored Loadout, Operators in both factions, Settings before/after interaction, the emulated Android landscape Play/Operators/Loadout routes, and phone-host Multiplayer, Play, Loadout, Operators, and Settings.

## Source integrity and rollback

The authoritative Expansion 8.3 source and Lobby 9.0 baseline remain outside this editable descendant and were not modified. Lobby 9.0 baseline page hashes are preserved in the 9.0 manifest and in `rollback/lobby-9.1-pre-change-2026-11-08/`. Lobby 9.0’s original manifest is retained as historical evidence; the new Lobby 9.1 manifest separately identifies this descendant.

Use `docs/LOBBY-9.1-ROLLBACK.md` for a reversible rollback procedure. No release APK, production credentials, TLS private key, or distribution artifact is included.
