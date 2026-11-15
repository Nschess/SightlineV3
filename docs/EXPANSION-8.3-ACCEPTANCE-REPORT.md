# Expansion 8.3 — Acceptance report

**Candidate:** `work/gameplay-expansion-8.3-20261107/DEV`  
**Baseline:** verified Expansion 8.2 package preserved unchanged; source package SHA-256 `deb825732ad385f28bd54b9409278d2b489ad7df76e9c2365885eb5b515a8199`.  
**Candidate type:** experimental DEV only. No APK was built, no release was approved, and no package was distributed.

## Changes

- Added name attribution to Offline and LAN bomb states for carrier, active planter/defuser, completed planter/defuser, and dropped-bomb cause.
- Added A/B site markers, carried/dropped/planted device presentation, plant/defuse progress display, and objective notifications/cues to the Offline and phone-host game pages.
- Moved the tall A/B site beacon to the outer edge of the site ring so it no longer visually intersects the planted device; Offline and phone-host implementations match.
- Made objective notifications compact and placed them above the aiming center; the named/progress HUD remains persistent while brief action notifications fade.
- Added the missing host-authoritative dropped-bomb notification on carrier elimination/disconnect. Objective identity, positions, interaction progress, event ordering, and completion continue to be derived/validated by the existing authority path.
- Kept `gameplay-mode-rules.js` byte-identical between Offline and phone-host assets.
- No Legendary modules were edited. Existing source changes remain within the 8.3 descendant; 8.2 and rollback inputs are untouched.

## Verification results

| Check | Result | Evidence/limit |
|---|---|---|
| Node regression suite | **PASS — 285/285, 62 test files** | `tools/run-expansion8.1-full-verify.cjs` |
| Authoritative combat | **PASS — 8/8** | Same full-verification run |
| Navigation | **PASS — 19 maps, 0 reported faults** | Same full-verification run |
| Android source/asset parity | **PASS — 48/48 host files; 15/15 shared modules** | Static hash/parity check; not an APK or device test |
| Offline FFA in actual game loop | **PASS, with debug-only deterministic target setup** | Latest-source run: two bots moved; a test-only actor placement used a collision-clear ray and lethal HP, then real firing/raycast/damage/scoring/match-end code ran |
| Offline Bomb in actual WebGL game loop | **PASS — unassisted AI carrier planted at A; AI defender physically arrived and defused** | Latest-source run: no bot positions, objective state, AI state, or timers were injected; named progression and progress presentation were sampled |
| Objective timer/state gates | **PASS** | Regression tests confirm timers alone cannot start or complete planting/defusing; range, role, carrier, hold, and interruption checks remain required |
| Host-authority tests | **PASS** | V2 session, ordered sequence, current life epoch, and state validation covered by deterministic tests |
| Current-source APK | **BLOCKED/NOT BUILT** | No current-source APK artifact was produced in this task |
| LAN browser/2-client playthrough | **BLOCKED** | Isolated browser navigation to loopback is denied (`ERR_NETWORK_ACCESS_DENIED`); no real LAN claim |
| Human keyboard/mouse action acceptance | **UNVERIFIED** | Automated Offline test exercises AI objective behavior, not a human plant/defuse session |
| Android touch/device acceptance | **UNVERIFIED** | No physical Android device/emulator used |
| Audible cue playback | **UNVERIFIED** | Source event/cue paths exist; actual speaker playback was not captured |
| Operator hand/action animation | **UNVERIFIED** | Evidence verifies objective progress/device presentation, not a dedicated hand-to-device animation |
| World device/site/progress rendering | **PASS for the captured close gameplay view** | In the current-source run, the player moved from `(0, 36)` to near site A using normal W movement along 4 legal route points (77 movement samples); the player arrived without teleportation. Actual WebGL captures show the device, site ring, active plant/defuse progress, and named operators. A far spawn angle can still be occluded by map cover. Human visual acceptance remains unverified. |

The latest-source Offline runtime trace is `acceptance/EXPANSION-8.3-FINAL/report.json`; the W-key walk-up trace and current-source screenshots are in the same folder. The runtime harness selected a collision-clear FFA firing ray; this is a test-only deterministic setup, not a gameplay change. The walk-up harness steered only the camera; the production movement simulation advanced the player along legal waypoints. Neither harness injected Bomb state or bot positions.

## Source fingerprints

| Component | SHA-256 |
|---|---|
| Offline game page | `565ad5f794020834cb0a2176162ffb7e7a2f092ca53fdd2d05d3f582ab710952` |
| Phone-host game page | `2958f32d4dc4158114306fd4eeda03f462379d0c1921de89d345e72d615d90a3` |
| Phone-host source inventory | `604c9cf5dd008271feba4987838130ade5d3eab0e2c7af7436eae80a6056a57e` |
| Phone-host `server.js` | `66249cb76ef79d6aa04ea61dc3d444a568b5531a09ddc65930f95c9904d8cfb7` |
| Root project instructions (`AGENTS.md`) | `df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2` |

Latest isolated WebGL evidence was captured on 2026-11-07 from source page SHA-256 `565ad5f794020834cb0a2176162ffb7e7a2f092ca53fdd2d05d3f582ab710952`. The walk-up trace reports `ARRIVED`, 4 legal route points, and 77 W-key movement samples. Both `bomb-plant-progress-near-site.png` and `bomb-defuse-progress-near-site.png` show the actual in-game device/site ring and named active interaction; dedicated human hand-to-device animation is not shown.

## Decision

**ACCEPT** the source/test changes for experimental review: the Offline bot-driven objective loop and close-range world-object/progress rendering pass in the isolated WebGL run. **DEFER** human visual/audio acceptance, dedicated hand-to-device action animation, LAN synchronization in a live session, APK/device compatibility, and release readiness. The package is suitable for your local gameplay evaluation only; it is not a completed release candidate.

## Rollback

The Expansion 8.2 package and its original archive remain untouched. Revert this 8.3 descendant as a whole or restore the protected 8.2 source; do not overlay only selected UI files without reviewing Offline/phone-host parity and host event synchronization.
