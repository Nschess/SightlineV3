# Sightline V3 Gameplay Quality 6.0 — Experimental Verification Report

**Disposition: DEFER gameplay-quality acceptance.** This package is an isolated, source-pinned verification candidate. No gameplay-runtime defect was confirmed strongly enough to justify changing AI timing, combat, touch behavior, or render policy without browser/device evidence. It is not a release candidate.

## Source and protection

- Parent: verified Android 5.1 DEV source at `work/android-apk-restoration-5.1-20261105/DEV`.
- Parent gameplay lineage: LAN Zombies 4.2. Its host and phone-host page fingerprints are recorded below.
- Candidate: a separate copy at `work/gameplay-quality-6.0-20261105/DEV`; it is not a Git branch because the packaged parent has no Git metadata.
- The candidate's `AndroidProject` tree is byte-identical to Android 5.1: 190/190 files matched by SHA-256 after excluding generated Gradle/build directories. This includes all 70 Claude-owned Legendary files previously audited in the Android 5.1 source-delta report.
- The complete source-tree audit against Android 5.1 found 0 missing files, 13 added evidence/tooling files, and one changed test fixture. See `acceptance/gameplay-quality-6.0-parent-diff.json` for the exact path list.
- The verified Android 5.1 debug APK was left untouched. It was not rebuilt because no Android runtime source changed.
- The source instructions at the candidate root match the current project instructions.

### Preserved Android 5.1 debug APK

- Path: `work/android-apk-restoration-5.1-20261105/outputs/SightlineV3-Android-5.1-debug-v4.apk`
- SHA-256: `1a673656e95671264e2401f165d4e09ba722db4f1e2736fe9cfbfb16aee9a8ba`
- Package: `com.sightline.v3`; versionCode 4; versionName `0.3.1-integration-android-5.1`.
- The existing 5.1 report records debug signature, alignment, package metadata, and 98/98 packaged asset hashes as verified. This is inherited evidence for that APK, not an Android 6.0 build or device acceptance.

## What changed in 6.0

The only code change is a test-fixture correction in `tests/settings-accuracy.mjs`: the mocked settings context now supplies `units: []`, which the production `performanceInfo()` function reads. This fixes a false failure in the test harness; it does not change game behavior.

The candidate adds the three source-bound deterministic benchmark JSONs under `acceptance/benchmarks/`, the full regression log, this report, a repeatable CMD verification script, and a current source/hash manifest. No game runtime file under `AndroidProject` changed. No Legendary weapon file changed.

## Verification results

- Full integrated Node regressions: **243/243 PASS** (`acceptance/gameplay-quality-6.0-final-regressions.log`).
- Mobile settings accuracy: **26 checks PASS**; 55 settings keys audited; offline/phone-host settings parity and persistence checks pass. These are source/mock checks.
- Dual-fire touch helper: PASS for independent pointers, release, cancel, and reset in a mocked event harness.
- Touch source routes: PASS for movement/look, fire, ADS, reload, switch, cancellation, and offline/phone-host parity.
- Frame-pacing policy: **48/48 checks PASS** across two clients (deterministic/source simulation).
- Offline 64-bot capacity: **15/15 source-contract checks PASS**. This does not measure actual 64-bot frame rate.
- Android asset parity: **47/47 host assets**, **14/14 shared libraries**, runtime syntax and Android pin checks PASS.
- Existing complete suite includes combat, navigation (all 18 maps), Infection/Outbreak, Protocol V2, WebSocket parser/security, HTTPS/WSS policy, and multiplayer deterministic checks.

## Movement and AI measurements

`acceptance/benchmarks/gq6-lan-motion-presentation.json` replays the current 20 ms host-pose helpers with the same constant-velocity/turn input at 16, 32, and 64 actors. The corrected presentation has zero modeled re-anchor displacement at all three sizes. At 64 actors the earlier presentation model had a 0.07 m re-anchor and 0.25 rad per-snapshot yaw step; the corrected helper modeled 0 m re-anchor and a maximum 0.0532 rad step. This is deterministic presentation math, not WebGL or live-network proof.

`acceptance/benchmarks/gq6-zombie-pose-recovery.json` replays a 300 ms snapshot gap followed by regular snapshots at 60 Hz rendering. The extracted current client code starts recovery with no initial position jump and converges; the prior checkpoint model jumped 0.4113 m and 0.4295 rad immediately. This is synthetic client-function replay, not rendered gameplay.

`acceptance/benchmarks/gq6-outbreak-target-acquisition.json` measures a deliberately difficult 64-survivor roster with 63 occluded actors and one visible actor. The current fair-probe policy acquired the visible outlier after 2.24 simulated seconds while staying within its five-candidate visibility budget. This reveals a worst-case acquisition delay worth monitoring, but not a proven player-visible failure: the scenario is in-process, has no full movement/render loop, and intentionally places many occluded candidates before the visible one. Increasing the visibility budget or changing scheduling without matched host-cost and gameplay evidence was not justified.

Offline bot cadence remains 30 Hz up to 32 units, 20 Hz for 33–48, and 15 Hz above 48, with render interpolation in source. The 64-bot checks confirm the configured ceiling and presentation path only. **No 64-bot Android or Windows FPS measurement was available.**

## Runtime acceptance status

| Gate | Result | Evidence / limitation |
|---|---|---|
| Source and regression checks | PASS | 243/243 plus focused checks above |
| Touch behavior in a mock event harness | PASS | Independent dual-fire, release/cancel/reset and route checks |
| Physical touchscreen latency, sensitivity, and reachability | UNVERIFIED | No authorized device/browser interaction available |
| Offline Infection at 16/32/64 rendered bots | UNVERIFIED | Source and deterministic tests only; no browser/emulator |
| LAN Zombies at 16/32/64 rendered bots | UNVERIFIED | Live two-peer/browser acceptance is unavailable here |
| WebGL visual smoothness/frame pacing | BLOCKED | Playwright is unavailable; the installed headless shell crashed on launch. No sandbox bypass was attempted. |
| Android current-source build/install/gameplay | UNVERIFIED | Runtime sources are unchanged from the separately verified 5.1 APK; no 6.0 APK was built and no emulator/device was available. |
| Claude Legendary compatibility | PASS (source integrity only) | 190/190 AndroidProject files unchanged; prior report audited 70 Legendary-owned files |
| Release readiness | NO-GO | Physical device, current candidate WebGL, and end-to-end LAN gates remain open |

## CMD workflow

Extract the experimental ZIP to a new folder, then run:

```bat
cd /d "%USERPROFILE%\Documents\SightlineV3-Gameplay-Quality-6.0-Test"
VERIFY-GAMEPLAY-QUALITY.bat
START-HOST.bat
```

The verification batch runs the package manifest checker, full 243-test suite, and the focused settings, mobile-input, frame-pacing, offline 64-bot source-contract, and Android asset-parity checks. `START-HOST.bat` starts the existing development host; it does not provide TLS release transport or prove Wi-Fi acceptance. Keep it on a trusted private LAN and do not port-forward its development port.

## Merge guidance for Claude Legendary 3.0

Do not merge or replace runtime files from this package: they are unchanged from the Android 5.1 parent. If desired, copy only the `tests/settings-accuracy.mjs` fixture correction and the GQ6 verification/benchmark documentation. Re-run the receiving branch's full suite and Android parity checks. This package makes no claim about Legendary visual/audio quality.
