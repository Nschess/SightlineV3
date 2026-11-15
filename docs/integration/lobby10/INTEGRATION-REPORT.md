# Controlled integration record — 2026-11-14

## Inputs and baseline relationship

- Claude Lobby v10 overlay: `SightlineV3-Lobby10-RELEASE-v10-merge-ready.zip`, SHA-256 `d669249b7d1c16d11f70fcb012dfb834bd8e33b42a9c8f946a6d6786b07f56cd`.
- Codex LAN smoothing baseline: `SightlineV3-LAN-Bot-Smoothness-WIP-UNVERIFIED-2026-11-14-r2.zip`, SHA-256 `86c3095f7dfbb3ab1acfef38be269807169702fc536b9ae8efc3a4c9ec1d859c`.
- The Claude ZIP is a patch/overlay, not a complete project tree. Its notes identify a Lobby 10 source from 2026-11-10 and a pre-patch phone-host page hash of `3954481c41e85901cc00d197317956ab4e1d6108ac35aa70ee1c261578eb71bb`. That does not match the Codex WIP phone-host page (`a82c31e54a01c863ea7895ccdafb3543c203478b35a994638dcbfffa1113747e`). No common commit or byte-identical common source snapshot is present in the two supplied artifacts, so an exact common ancestor cannot be claimed.
- Claude's own notes explicitly describe regenerating the Lobby 10 overlay when the main page has moved. That route was used: all required markup, render, camera, loadout and closure anchors were asserted unique in both current pages before any mutation. The complete Claude Offline/phone-host HTML files and its `MainActivity.java` were not copied over Codex files.
- A five-file pre-integration rollback snapshot was made before applying the overlay. The original two archives remain external, unchanged inputs.

## Changes

- Rebased the authored Lobby 10 CSS, intro, match-found content and lobby-only UI feature block onto the Codex Offline and phone-host pages.
- Preserved the Codex snapshot/heading interpolation implementation and the server-authoritative LAN host source. The host `server.js` remains at its input SHA-256 `31527fbbe7a5e1f9c7a91dae9dc7e97c2bef4a2de463d23c37be30044845d29d`.
- Kept the original `sightline-theme.mp3` loader and its existing lobby visibility / deployment lifecycle in both pages. Existing audio code was not replaced.
- Updated only the native `HOST_BUNDLE_SHA256` pin to the newly generated phone-host page hash, then refreshed the Android source and host asset inventories.
- Integrity verification exposed an existing hash-refresh ordering defect: the helper hashed `CURRENT-SOURCE-SHA256.txt` before refreshing the host `SHA256SUMS` file it records. Reordered those two refresh steps and strengthened the Android parity gate to verify all 112 current-source rows.
- Added `tests/lobby10-lan-smoothing-integration.test.mjs`, the checked application helper, retained Lobby 10 source files/release notes, and this rollback record.
- No Adventure Mode code, gameplay map/weapon/operator edits, or LAN server behavior were added.

## Result fingerprints

- Offline page: `2255fcbbf912d89586a4144def014a1ec1198173e3f9c091dec5fcfa3023eb03`.
- Phone-host page: `67588d0f375294a5d0dc88c303741fcbd54f4ba3e8632109a19f7a642c580f82`.
- Host `MainActivity.java`: `24c03e5c725ba782f1a262c3007f9f105e4aed73cbfdf07b29629d524e6f1ca`.
- Candidate `server.js`: `31527fbbe7a5e1f9c7a91dae9dc7e97c2bef4a2de463d23c37be30044845d29d`.
- Exact final package inventory fingerprint is recorded in `PACKAGE-CONTENTS-SHA256.txt` and the adjacent WIP archive report.

## Verification

- Integration-specific source/syntax/parity checks: 3/3 PASS.
- Focused compatibility group: 75/75 PASS, including lobby mode/map/rules routing, rule/objective behavior, infection flows, LAN discovery policy, and Offline/phone-host snapshot jitter recovery.
- Android parity gate: 49/49 host assets and 15/15 shared libraries hash-valid; current native host pin and script parsing passed.
- Android source inventory: 112/112 rows match the current source files, including the host `SHA256SUMS` inventory.
- Both original input ZIP SHA-256 values were rechecked before packaging.
- Runtime gameplay, actual WebGL visuals, actual LAN host/client behavior, Android build/device behavior and music playback were not exercised in an isolated runtime during this integration. They remain UNVERIFIED; this is not a release candidate.
