# Sightline V3 Expansion 8.2 — Acceptance Report

**Candidate:** Experimental DEV, 2026-11-07  
**Disposition:** Source and offline integration ACCEPTED for manual evaluation; overall release acceptance DEFERRED.  
**Protected sources:** Expansion 8.1 and its rollback snapshots remain unchanged. Claude-owned Legendary modules were not edited.

## Implemented player-facing integration

- Offline Play presents Tactical, Free-for-All, Bomb Defusal, Outbreak, and Infection as selectable modes.
- Offline and LAN have the compact four-section navigation and separate mode/map/rule workflows.
- The LAN host lobby offers validated maps, explicit mode selection, bot configuration, match settings, and a visible build identifier.
- Bomb map selection exposes the 19 checked arenas; the current map registry and navigation tests verify A/B sites and routes.
- CMD launchers run Offline on loopback port 8090 and LAN HTTP/WS on port 8080.
- Actual old/new lobby captures are included for comparison; revised screenshots cover desktop and mobile-sized viewports.

## Verification matrix

| Area | Result | Evidence and limits |
|---|---|---|
| Offline lobby and mode discovery | PASS | Actual Chromium/SwiftShader screenshots at 1600×900, 1366×768, 844×390 landscape, and 390×844 portrait are included under `acceptance/EXPANSION-8.2/screenshots/`. All five Offline modes are visible. |
| Before/after lobby comparison | PASS | Actual prior and revised Offline/host screenshots are included under `acceptance/EXPANSION-8.2/screenshots/`; the revised navigation has four primary sections and separate mode/map/rule routes. |
| LAN lobby and controls | PASS | Actual phone-host page screenshots include roster, maps, validated Bomb map picker, and match rules. Four navigation items replace the prior nine-section sidebar. |
| Offline FFA gameplay | PASS WITH TEST FIXTURE | Actual WebGL game loop, bots, firing, damage, scoring, and match end ran. To make the result deterministic, the debug-only QA harness positioned one bot and set its health to 1 before firing; this is not an unassisted natural-match test. |
| Offline Bomb Defusal | PASS | Actual game loop, unassisted bot AI: carried → plant interaction → planted at A → defender defuse → defused/round end. No bot position, AI state, objective state, or timer injection. |
| LAN Bomb Defusal | PASS, LOOPBACK | Two Protocol V2 browser clients, host-selected mode, 8 bots, 20 ms/50 Hz host, 1,449 snapshots per client, zero snapshot skips/backpressure; bot planted at A, AI defender defused, and round ended. Not private Wi-Fi. |
| LAN FFA live start/snapshots | PASS, LOOPBACK | Two clients reached live FFA; 6,650 snapshots each, zero skipped/backpressure. |
| LAN FFA scoring and match end | UNVERIFIED | One actual runtime probe sent 64 client fire actions at a remote actor about 68.67 m away but got zero confirmed hits. This does not establish a game defect; the probe lacked a close, clear shot. A corrected approach-and-fire harness was prepared, but the isolated runner then could not fetch `/status` from its child host (`TypeError: fetch failed`) even though the host printed that it was listening on 127.0.0.1. No second scoring result is claimed. |
| Node regression suite | PASS | `node tools/run-expansion8.1-full-verify.cjs`: 61 test files, 280 passed, 0 failed. |
| Clean extraction | PASS, SOURCE | Archive extracted; 613-file manifest and source fingerprints verify; project `AGENTS.md` is byte-identical; full regression/combat/navigation/Android-parity suite passes from the extraction. The project-prescribed Python helper could not launch because only the inaccessible WindowsApps Python alias was present; the Node verifier checked the same archive/root-instruction hashes directly. |
| Clean-extract browser replay | BLOCKED | A repeat of the Offline WebGL runtime test from the clean extraction failed before page load with Chromium `net::ERR_NETWORK_ACCESS_DENIED` to its temporary `127.0.0.1` URL. This does not erase the earlier actual Offline runtime evidence, but a second runtime replay from the extracted archive was not completed. |
| Authoritative combat | PASS | 8/8 checks. |
| Navigation | PASS | 19 maps, zero reported faults; suite includes legal path/route checks. |
| Android static source parity | PASS | 48/48 host-manifest files and 15/15 shared libraries; syntax checks passed. This is not an APK build. |
| Current-source APK | BLOCKED / NOT BUILT | No fresh APK was produced for this candidate. Do not install or distribute a preserved older APK as if it were current. |
| Physical Android, Wi-Fi, release TLS/signing | UNVERIFIED | No device or private-Wi-Fi run. The LAN test used loopback development HTTP/WS only. |
| LAN active-scene screenshots | UNAVAILABLE | Headless SwiftShader screenshot readback timed out; live gameplay state and snapshots were checked independently. |

## Source identity

- Offline page SHA-256: `3cf687ed457b0b37644022d9d1afe525d672178c9e04e5b1694b9fbbb1dfff93`
- Phone-host page SHA-256: `f55e23bbb82767f63dd9a5cfef0b25bb3e894716f623b70868dec833ee251867`
- Phone-host server SHA-256: `b2bf086f83ebf6538d12023fbc0698a807177c6fc1c53159242c2918919eb70f`
- Phone-host `SHA256SUMS` inventory SHA-256: `9bebaf6e3fb0b119d6d7f98124ea567f3c430f798d31a5f724688a49fd551f7e`
- Android source index SHA-256: `3597b339682362686227171c8108bbea79a7c9c8648f04a5bd2967c3107461b4`

The LAN FFA live test report and loopback Bomb report are retained alongside this summary. The package verifier checks every staged file and the project instructions file.

## Decision

Suitable for isolated manual gameplay evaluation as an experimental DEV package. Not release-ready: LAN FFA scoring remains unverified, and current-source APK, private-Wi-Fi, physical-device, and production transport/signing acceptance remain open.
