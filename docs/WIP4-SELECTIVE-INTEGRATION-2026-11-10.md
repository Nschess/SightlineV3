# WIP-4 Void selective integration

## Decision

Created an isolated descendant at `work/legendary-wip4-selective-merge-20261110/DEV` from the unchanged `work/lan-one-tap-discovery-20261110/DEV` baseline. The baseline Android source-manifest fingerprint is `e132b1fe800421977616efad6132ddde5855eab84860bc52e0cbba52a1616d46`; its `AGENTS.md` hash remains `df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2`.

The supplied ZIP SHA-256 is `c3771d769259d449a498b202807783dafc7da326e050b5e96be693b83221c00c`. Its phone-host checksum list verifies 48/48 files. Its broader 112-row source manifest contains 41 files omitted from the ZIP; therefore it was not used as a complete source tree. The current complete baseline was used, and only the reviewed production changes were applied.

## Selectively retained

- Updated the existing pack modules for Rampart Phoenix Requiem, Needle Tempest, Ranger Eclipse, Tide Prism, and Voidlight Hawk. These are authored Legendary weapon modules in the real game pack, not a separate studio or test presentation.
- Kept their weapon-specific audio synthesis and bounded elimination effects. The runtime already dispatches pack audio and elimination hooks from the existing equipped-skin and authoritative elimination paths, so combat authority and server code did not need changes.
- Kept shared audio cue warming and added a deduplicated first-fire cue warm-up when a Legendary weapon is selected/equipped, to avoid the measured one-time synchronous synthesis cost at first fire.
- Added an explicit `hasEliminationFx` eligibility guard. Packs without an authored kill effect do not allocate these effect objects or receive a generic WIP effect. The shared FX pool remains at its prior capacity when a pack has no authored kill configuration.
- Kept Offline and phone-host pack copies byte-identical and refreshed the host checksum list, Android source manifest, and native hosted-page hash pin from the integrated files.

No Weapon Studio, ZIP helper scripts, screenshot harnesses, resume instructions, gameplay rules, combat authority, LAN protocol code, maps, character assets, or other Legendary weapon designs were imported. The other ten weapons remain as they were in the baseline.

## Verification

- `node --check` on both production `legendary-packs.js` copies: PASS.
- `node tests/legendary-wip4-selective-guards.cjs`: PASS on Offline and phone-host pages; checks memoized shared cue warming, one fire prewarm per key/sample rate, and no FX allocation for packs explicitly lacking an authored elimination effect.
- `node tests/legendary-p0-audio-inspection.cjs`: PASS; 15 weapon identities and cached, finite, voice-limited cues. This is source/DSP verification, not listening acceptance.
- `node tests/phase2-android-asset-parity.mjs`: PASS, 48/48 host hashes, 15/15 shared modules, script parsing, Android allowlists and host pin.
- `node tests/phase6-source-manifest.cjs`: PASS, 112/112 current Android source hashes.
- `node tests/p16-legendary-world-replacement.cjs`: PASS; unrelated geometry checks remained stable.
- Rollback checkpoint hash verification: PASS, 7/7 pre-merge files.

Known unrelated test debt remains: older `p12` checks assert a removed literal FX-pool expression; `p13`/`phase15` require Offline and phone-host HTML to be identical even though those pages intentionally diverge; `p115` asserts a stale Legendary-isolation condition. These failures were reproduced against the untouched baseline, so they are not introduced by this integration.

## Acceptance limits

The WIP archive itself says its changes were checked in a headless harness with a stand-in weapon, not the actual game/device. It flags Phoenix wing angle, Tempest tracer thickness, and Eclipse kill-ray/ring tuning for visual review. Isolated WebGL rendering and actual audio playback/listening were not available in this run. Treat geometry/effect appearance and subjective sound quality as **UNVERIFIED**, not accepted. No APK or ZIP was built.

## Fingerprints and rollback

The refreshed 112-entry Android source manifest SHA-256 is `a93c7a5625dfdec12e4c50a551ac8b2e065c566f1e7a923e4315f1f72169db5b`. Current Offline page SHA-256: `b6a14d1798d884fbc479c8096f0267c2d2a482bba23e0c4fc64eccceaac0906f`. Current phone-host page SHA-256: `cb731e3b5bc0eb37fb2bf5413a18a3fc4929c5b5a5967d6dd771520b6dd07a23`. Current 48-entry phone-host inventory SHA-256: `a9c717d8712faa2dfb6122b300369f0fdb295d996b37f0f410753891ffb62b1f`.

`acceptance/WIP4-SELECTIVE-INTEGRATION-SHA256.txt` lists the current changed production, test and report files with their hashes. To undo the integration, restore the seven production files from `rollback/wip4-premerge-20261110` using the commands in `rollback/wip4-premerge-20261110/ROLLBACK.md`. The focused tests can remain or be removed separately. The authoritative baseline and supplied ZIP are untouched.

## Follow-up: missing Legendary fire feedback diagnosis

The shared local firing order was `playWeaponShotAudio(...)` followed by `legendFire(...)`. Legendary pack PCM was generated synchronously inside `legendAudioBuffer()` before `legendPlayAudioEvent()` entered its WebAudio node-construction `try` block. A thrown pack generator therefore escaped the audio call and skipped the immediately following Legendary rig-fire dispatch for that shot. The Offline and phone-host pages now catch this optional cue failure, warn once per weapon, and play the normal factory shot; this keeps the subsequent `legendFire()` call reachable. This is a verified control-flow defect and resilience fix, but no real-device occurrence was captured.

WIP-4 authored-pack mappings checked: Rampart / Phoenix Rebirth, Needle / Tempest Needle, Ranger / Helios Eclipse, Tide / Prismatic Aurora, and Hawk / Voidlight Hawk. Each pack's actual Three.js r128 rig built in a headless Node harness; calling its `fire()` advanced its animation state, and reload state advanced without throwing. Their `mixShot` functions produced finite, non-silent, normalized Float32 PCM at 44.1, 48, and 96 kHz. The focused route test injects a generator exception on both pages and confirms factory fallback without an exception escaping, then confirms that a successful skin cue suppresses factory duplication. The broader audio inspection still passes for all 15 registered weapon identities.

Other intentional gates that can make the *special* presentation disappear: `Settings > Legendary weapon audio` disables Legendary cues (factory audio is then intended); `Settings > Legendary weapon effects` disables rig-fire visuals; and a failed `buildRig()` leaves `legendActive()` false, causing factory-shot fallback with no Legendary rig animation. A fully silent shot also depends on ordinary audio being available (`Sound on`, nonzero master/SFX level, and an AudioContext in the running state). These states are not evidence of a pack-specific failure by themselves.

Focused follow-up checks passed: `legendary-wip4-selective-guards.cjs`, `legendary-wip4-pack-fire-rates.cjs`, `legendary-p0-audio-inspection.cjs`, `phase2-android-asset-parity.mjs` (48/48 host files), `phase6-source-manifest.cjs` (112/112), and `p16-legendary-world-replacement.cjs`. Pack sample generation and source checks are not audible playback or in-game rendering; both remain **UNVERIFIED** in this isolated runtime.

## Quick follow-up: confirmed-elimination fail-safe

The confirmed-kill handler previously called the local rig's optional `kill()` animation and authored pack effect before its kill-audio event, without exception isolation. A rendering/FX exception could therefore suppress later kill feedback. Both Offline and phone-host pages now isolate those cosmetic calls, log one warning per affected weapon, and fall through to the bounded generic elimination effect when an authored pack effect fails. The kill event ID/deduplication and authoritative attribution were not changed. This is source-level hardening only; no new visual acceptance is claimed.
