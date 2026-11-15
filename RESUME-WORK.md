# Sightline V3 — Correct Original Map Restoration

Candidate: `world-realism-overhaul-20261111/map-original-baseline-restoration-20261112/DEV`  
Status: source restoration complete; rendered acceptance still pending.

## Correction to the previous attempt

The earlier `map-original-restoration-20261112/DEV` used a checkpoint that already contained `MAP_WORLD_EDGE_PROFILES` and `buildMapWorldBeyond`. That was not the pre-enhancement map source and did not satisfy the owner's request. It remains untouched as a failed-attempt rollback.

## Restored map source

The map presentation now comes from the earlier checkpoint `map-specific-world-realism-prechange-20261110`, under `work/map-specific-world-realism-20261110/DEV/rollback/`. Its Offline and phone-host pages each contain the same 19 map IDs and do not contain the later horizon/profile, boundary-closure, approach, batch-mesh or weathering generators.

Restored in both production pages:

- The complete `MAPS` visual configuration (including the original Courtyard and Dune sky, fog, lighting and texture values).
- The renderer section from `function mkTex(` through `function canPick(`, including map materials, ground textures, decoration and world construction.

The 19 map identities and gameplay geometry/configuration were compared against the preceding candidate. Only map visual fields (`sky`, `fog`, `fogN`, `fogF`, `hemi`, `sun`, `tex`) differed; areas, obstacles, spawns, zones, routes, objectives and navigation inputs are unchanged. No whole production page was replaced.

## Preserved sources and rollback

- Previous failed restore, complete DEV: `work/world-realism-overhaul-20261111/map-original-restoration-20261112/DEV`.
- Rejected latest candidate, complete DEV: `work/world-realism-overhaul-20261111/world-realism-overhaul-rebuild-20261111/DEV`.
- That rejected candidate's matched checkpoint: `.../rollback-checkpoints/post-dune-horizon-reconstruction-UNVERIFIED-VISUALS-20261112/DEV`, inventory SHA-256 `5294d83dfc7e455fd1b3b909928e4779d80fea40b36c1f6e0c7131c5fc861f8c`.
- New candidate's pre-edit Offline and phone-host pages are preserved in `rollback/map-original-baseline-recovery-prechange-20261112/`.
- The exact pre-world-realism 19-map reference pages are retained in `rollback/pre-world-realism-original-19-map-source-20261110/`.

To undo the restoration, copy the two saved pre-edit page files back to their matching production paths under `AndroidProject/app/src/main/assets/`, then run `node tests/phase5-refresh-android-hashes.cjs` from the DEV root.

## Verification

- Restoration/isolation tests: 5/5 passed. They assert exact map source identity, generator absence, unchanged gameplay fields and non-map page source, Offline/phone-host parity, and rollback-page integrity.
- Map schema: 19 Offline maps / 19 phone-host maps, matching IDs, no schema failures.
- Navigation audit: 19 maps, no reported faults. It is static path analysis, not live gameplay.
- Android host asset parity: 48/48; shared modules 15/15; page syntax checks passed; Android source manifest 112/112.
- Actual WebGL screenshot and FPS: UNVERIFIED. No authorized isolated renderer was available; owner screenshots from the rejected version are not post-restoration evidence.
- No ZIP, APK or release merge created. The project acceptance rule requires rendered evidence before packaging 3D changes.

## Current hashes

- Offline page SHA-256: `06871faae7cd002f769a02f17b0c01c046e0cefd325036b6aff4883e2f3a4036`
- Phone-host page SHA-256: `530167860e5cb4f0cf7006097b19336788fc365d2836c1e0c9e0c8d073821f55`
- Android source manifest SHA-256: `81dbc4b9b0c3865e46917cae44a667ff18541390ac54dc413f16b573dfad4997`
- `MainActivity.java` SHA-256: `cb4518c9232ab45a7692363702806b0ee21421036c3917fe7b7b5059f0779776` (integrity pin only)
- Project `AGENTS.md` SHA-256: `df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2`
- The source inventory is regenerated after this note; its SHA-256 is in the handoff.

## Preview

From CMD:

```cmd
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\world-realism-overhaul-20261111\map-original-baseline-restoration-20261112\DEV"
START-HOST.bat
```

In another CMD window:

```cmd
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\world-realism-overhaul-20261111\map-original-baseline-restoration-20261112\DEV"
SIGHTLINE.bat open
```

## Legendary audio continuity follow-up — 2026-11-12

- Isolated candidate remains this DEV; maps and all unrelated gameplay files were left untouched. Pre-change pages and focused tests are preserved at `rollback/legendary-audio-continuity-prechange-20261112/` with `SHA256SUMS.txt`.
- Traced local shots through `tryFire` → `playWeaponShotAudio` → `legendAudioEvent` → the cached Legendary PCM/voice pool; remote shots use the same skin voice with pan and lower priority. All 15 supported Legendary keys resolve a unique fire design/voice. The seven pack-only designs resolve to their matching authored pack; the other eight use their base profile, with ROOK117 sharing its matched pack.
- Confirmed two silent-shot edges: a suspended-context fire item could expire and be discarded without its factory fallback, and the shared 14-voice factory fallback could reject a local Legendary shot without priority-based voice recovery. Expired fire items now dispatch the factory fallback when audio resumes. Factory shots now keep the same 14-voice ceiling while local-priority fire may reclaim the oldest lower/equal-priority voice; remote-priority shots cannot steal that local voice.
- Reduced the synthetic can-like resonance without changing weapon stats/timing or output loudness target: shorter pure-tone ring decay (`1.34x` to `.62x` the body decay), ring amplitude `46%`, mechanical tone `68%`, reflection/slap `42%`; raised the broadband core from `.66` to `.72`. PCM remains finite, distinct, normalized to `.78` peak, and runtime-calibrated to +1.21 dB RMS vs its factory shot for all 15.
- Legendary effect source was not rewritten: the current registered effects already use pooled geometry and quality/active-count caps; the focused skin/effect check passed. Actual effect rendering/performance and subjective audio playback remain UNVERIFIED without an isolated game/audio runtime.
- Focused checks: Legendary P0 audio inspection PASS (all 15 firing identities, 15 unique kill cue signatures, saturation fallback and stale-context recovery); Legendary skin system PASS; P13 audio inspection PASS after correcting its stale whole-page parity/voice-cap assertions; cosmetic failure isolation PASS; Android asset parity PASS (48/48 host files, 15/15 shared modules); Android source manifest PASS (112/112); authoritative combat PASS (8/8).
- Changed production files: `AndroidProject/app/src/main/assets/www/index.html` and `AndroidProject/app/src/main/assets/phone-host/index.html`. Test maintenance: `tests/legendary-p0-audio-inspection.cjs`, `tests/p13-legendary-audio-inspection.cjs`. Android phone-host checksums and source pin were refreshed; no APK or ZIP was built.
- Rollback: restore the two page files from the rollback directory and rerun `node tests/phase5-refresh-android-hashes.cjs` from the DEV root. This recreates Android source pins after restoration.

## Premium Android HUD — 2026-11-12

- Isolated candidate: `work/mobile-premium-hud-20261112/DEV`, descended from the restored-map Android-compatible DEV. Protected parent and earlier rollback checkpoints were not modified.
- Added a consistent touch-only HUD skin and component layout to the Offline and phone-host production pages. The HUD has labeled SVG actions, two-thumb default placement, configurable size/opacity, handedness mirroring, a paused-match drag-position editor, low-ammo/reload states, and responsive touch navigation. Existing combat actions, timing, and pointer/touch-cancel cleanup remain wired.
- Authored CSS: `tools/premium-mobile-hud.css`; application/refresh helper: `tools/apply-premium-mobile-hud.cjs`; focused regression: `tests/premium-mobile-hud-20261112.cjs`.
- Focused HUD verification: PASS. Offline/phone-host CSS parity, action/cancel-path presence, preference/editor source, inline JavaScript syntax, layout-source calculations at 844×390 and 740×360, and rollback hashes passed. The layout bounds are source calculations, not browser-computed DOM geometry.
- Android parity: PASS — 48/48 phone-host inventory files and 15/15 shared libraries match; both page inline scripts parse. Android source pin was refreshed. No APK was built.
- Current key hashes: Offline page `61dc85ca02bca3f44cb7238a9b54405e59bc785016c39450c59f4e609698832f`; phone-host page `8f2465d28460a771849c30608e9114817c53d6ca9d2fdd8e1c62886d3d3f689d`; authored HUD CSS `79a9d71125dfb668a3d33f55d27ff6c6375228e496010d1a1ce935745c0c073e`; Android source inventory `283b169f3c2a5bd7981a63a5a782a90d6675bd33fd43afaafcc1fe411ba755dc`; `AGENTS.md` `df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2`.
- Pre-change rollback: `rollback/premium-mobile-hud-prechange-20261112/`; its two-page SHA-256 inventory is verified by the focused test. Restore both saved pages to their matching `AndroidProject/app/src/main/assets/{www,phone-host}/index.html` paths, then run `node tests/phase5-refresh-android-hashes.cjs` to refresh Android pins.
- Visual, actual simultaneous multi-touch, pause/resume in a running match, and physical Android acceptance: UNVERIFIED. No isolated rendered runtime/device evidence was available. No ZIP, APK, or release merge was created; the project's rendered-evidence gate remains in force.
- Preview workflow: from this DEV root run `START-HOST.bat`, then in another CMD window run `SIGHTLINE.bat open`. To preview the phone-host page, use the existing host workflow and its printed phone-host URL. These instructions do not establish Android device acceptance.

## Mobile HUD P1 — touch ownership and saved-layout bounds — 2026-11-12

- Continued in the same isolated DEV; the pre-P1 state is preserved in `rollback/mobile-hud-p1-prechange-20261112/` (8 files, SHA-256 inventory verified by the P1 test).
- Confirmed defects and fixes:
  - `tbtn` previously invoked down/up for every pointer on every button. An early finger release could cancel a still-held bomb objective or other hold action. Generic buttons now acquire once and release on the last finger. Fire controls keep per-pointer callbacks so each finger is independently removed from the fire-owner set.
  - Blur, visibility loss, and pause cleared touch bookkeeping without invoking button release callbacks. Reset now dispatches the matching release/cancel for active controls before clearing state, preventing a held objective action from persisting.
  - Saved normalized HUD coordinates were only clamped to generic percentages, so a control could cross a safe edge after resize/rotation. Position edits now clamp the control center using its bounds and safe-area insets; stored preferences remain unchanged while resized layouts are rendered inside bounds. Hidden actions use a conservative 88 px bound. A coalesced resize handler reapplies layout once per animation frame.
- Offline and phone-host production pages were changed in parity. The mobile position editor still saves on pointer release/cancel; the same source-level harness reloads those preferences, resizes through 740×360, 844×390 and 1280×720, and checks safe bounds.
- Verification PASS: `node tests/premium-mobile-hud-20261112.cjs`; `node tests/mobile-hud-touch-ownership-20261112.cjs`; `node tests/phase2-android-asset-parity.mjs` (48/48 host assets, 15/15 shared libraries, page script syntax and Android pin checks). The production event harness keeps movement, camera-look and fire active at once, confirms each retains its owner when another is released, checks two-finger fire ownership with only one initial shot trigger, pointer-up/cancel, aggregate hold-action release and reset cleanup. It also verifies save/reload and safe-area clamps at 740×360, 844×390 and 1280×720. Reload, ADS, weapon-switch, pause/resume wiring was checked; weapon balance/action logic was not changed.
- Current key hashes: Offline page `397031d44a582c7edabc17628870c5e02469872fee850dfd137036353a0b09ad`; phone-host page `9cfe0e271da61bff72a8a59c12524066ec283c3b80f49478e6791cb67503eee2`; Android source inventory `0573a02e529495cd6c85c6cfbc97531f8dceca902c96e3b6811947cc59028b67` (112 entries); phone-host checksum list `4bf4042eac75fac52d06efd53e1b88950eafd7f6dbc48bb73cb0098086535747`; `MainActivity.java` `7dbb0176018b9b864cc96e6a64d24a1a49d8a91f43b3b38efbc0b950cba21ae8` (Android source pin refresh only); `AGENTS.md` `df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2`.
- Actual browser/WebView rendering, computed DOM bounds, simultaneous physical touch, and Android-device gameplay: UNVERIFIED. The deterministic harness models the production event handlers and layout math; it is not a real browser/device test. No new browser attempt was made. No APK or ZIP was created.
- Preview: from this DEV root, run `START-HOST.bat`; in a second CMD window run `SIGHTLINE.bat open`. Use the host's existing phone-host URL for a same-network preview. Test on a real phone before accepting ergonomics or touch feel.

## Mobile HUD P2 — Android integration acceptance — 2026-11-12

- Continued from this DEV without changing production gameplay or redrawing the HUD. P1 production pages and rollback `rollback/mobile-hud-p1-prechange-20261112/` remain intact.
- Android source wiring is consistent: Offline and phone-host pages both declare `viewport-fit=cover`, share the HUD preference key, enable `touch-action:none` on gameplay touch surfaces, expose all safe-area inset variables, handle pointer cancellation/reset, and keep the same HUD settings save/load flow. Native Android WebView enables JavaScript and DOM storage, loads the bundled Offline asset or configured LAN origin, dispatches blur on pause/back, and calls WebView `onPause`/`onResume`. The activity remains sensor-landscape and hardware accelerated.
- No reproducible Android source integration defect was found, so no production source was changed for P2. Added targeted source check: `tests/mobile-android-p2-integration-20261112.cjs`.
- P2 targeted verification PASS: `node tests/mobile-android-p2-integration-20261112.cjs`; P1 touch-ownership test PASS; premium-HUD test PASS; Android asset parity PASS (48/48 phone-host files, 15/15 shared modules, 112 source-manifest entries and current bundle pin). These are static/source checks and deterministic JavaScript event simulations only.
- APK build and touchscreen acceptance are BLOCKED. `SIGHTLINE.bat status` reports Java, `adb`, `ANDROID_HOME` and `ANDROID_SDK_ROOT` missing; the isolated workspace has no Android SDK toolchain or `AndroidProject/local.properties`. Existing `AndroidProject/build-debug.bat` requires JDK 17, SDK Platform 36, Build Tools 35+, and the checked-in Gradle wrapper. No authorized emulator/device is available. In addition, project `AGENTS.md` requires actual renderer evidence for UI changes and bars packaging until the stated acceptance gates pass; actual Android-rendered visual and physical-touch acceptance remain outstanding. No APK was built.
- Preserve current files using the P2 source checkpoint at `rollback/mobile-hud-p2-android-acceptance-20261112/`; its `SHA256SUMS.txt` inventories the captured source and verification evidence. The P1 pre-change rollback remains separate and verified.
- Acceptance remains UNVERIFIED for actual Android rendering, touch hardware, display cutouts, pause/resume in a running Android match, and Android FPS. No new browser launch was attempted. Next acceptance step: use the authorized Android debug build workflow after renderer acceptance and an isolated JDK 17 + SDK Platform 36/Build Tools 35+ toolchain are available, then test on an authorized emulator/device.

## Mobile HUD P3 — visual acceptance availability — 2026-11-12

- No HUD redesign or production change made. The verified P2 source checkpoint remains untouched at `rollback/mobile-hud-p2-android-acceptance-20261112/`.
- Existing project render scripts were inspected. The only mobile rendered-check path is `tests/p111-mobile-webgl-qa.py`, which imports Python Playwright and launches a `chromium` executable; the project-local Node Playwright/Puppeteer packages and runner configs are absent. `tests/p7-rendered-ui-webgl.py` hardcodes Linux `/usr/bin/chromium`. The Python launcher in this environment resolves to a WindowsApps shim that fails to start, and no Chromium/Chrome/Edge/Firefox command is available on PATH. No renderer was launched and no screenshot was fabricated. Earlier isolated Chromium startup failure remains known; no retry was made.
- Result: actual rendered HUD inspection at 740×360, 844×390 or a wider viewport is BLOCKED by the missing isolated renderer/runtime. Visual clipping, overlap and readability therefore remain UNVERIFIED; source-level viewport and layout simulations from P1 are not rendered evidence.
- Android build prerequisites are carried forward from the single P2 check: JDK/Java, `adb`, `ANDROID_HOME` and `ANDROID_SDK_ROOT` were unavailable; the existing build script requires JDK 17, SDK Platform 36 and Build Tools 35+. No build retry was made. Packaging remains prohibited by the project acceptance rule until rendered acceptance passes.
- Next step: provision an already-authorized isolated browser runtime and an authorized Android emulator/device; then inspect the three landscape sizes and run physical touch acceptance. Until then, keep this DEV and its P2 checkpoint intact; no APK/ZIP or release merge.

## Lobby mode, map and rules clarity — 2026-11-12

- Continued in this DEV from the P2 mobile HUD candidate. Pre-change lobby pages are preserved at `rollback/lobby-mode-rules-clarity-prechange-20261112/`; saved-page SHA-256 values were rechecked against `SHA256SUMS.txt` and match.
- The lobby mode selector now displays the currently selected map and mode-specific rules in two direct, clickable setup rows. Selecting a mode refreshes the rule summary; the rows open the existing Maps and Match Rules screens. Offline users can access them before starting a match. A connected LAN host still uses the authoritative host rules route.
- Outbreak's 64 setting is a requested survivor-bot count, not a total-participant count: the existing shared AI budget caps allies at 56 to reserve up to 8 active Hollowed. The lobby now states `64 requested → 56 survivor bots` and `Squad 57 incl. you`; the rules explanation and squad summary use the same definitions. Spawn behavior and the 64-AI budget were not changed.
- Phone-host disconnected mode selection now keeps all five mode choices local rather than unexpectedly redirecting FFA/Bomb Defusal to Multiplayer. Connected host selection remains server-authoritative.
- Changed production pages: `AndroidProject/app/src/main/assets/www/index.html` and `AndroidProject/app/src/main/assets/phone-host/index.html`. Focused test updated: `tests/lobby-9.2-interaction-and-world-isolation.test.cjs`.
- Focused checks PASS: lobby routing/clarity 6/6; Outbreak spawn budget; shared Offline/phone-host rules module; Android integration source checks; Android asset parity (48/48 host assets, 15/15 shared modules); Android source inventory and bundle pin refreshed (112 entries). These are source/static and deterministic checks, not rendered gameplay acceptance.
- Current source SHA-256: Offline page `f5f1fe532f66a7d242b038345e3082619b3db7b3d81e6c83d13d3fbdbffc400d`; phone-host page `49e9421231f51492d8e0f5e51e827f7e931128d59af9463fd400024b3b2eb7cc`; phone-host inventory `d09467aa0d1feab4995e642f63fb57fe288bebda86b7d35e814720ab01e12f80`; `MainActivity.java` `31f3d83f5cad659a29f3003c33c710830158cfe812647dd1cf05a98cc4758adc`.
- Actual browser/gameplay verification remains UNVERIFIED. The isolated Outbreak runtime test could not start because the Playwright package is unavailable; no retry or install was attempted. No APK, ZIP or release merge was created.
- Rollback: restore the two saved pages from `rollback/lobby-mode-rules-clarity-prechange-20261112/` to their corresponding Offline and phone-host paths, then run `node tools/refresh-lobby-android-hashes.cjs` from this DEV root.

## Emergency playable-game recovery — 2026-11-14

**Candidate:** `work/playable-game-recovery-20261114/DEV`  
**State:** Separate owner-test recovery candidate. **Runtime playability is UNVERIFIED; do not treat this as an accepted release or merge.**

### Baseline decision
Selected the coherent pre-full-screen-lobby source at `work/mobile-premium-hud-20261112/DEV` as the strongest earlier candidate. It supplies the paired Offline and phone-host pages, the existing map renderer and lobby lifecycle before the newer navigation/render-loop changes. Its recorded resume notes explicitly say rendered gameplay was not verified, so this is not evidence of a genuinely playable checkpoint. No source checkpoint found in this recovery establishes a complete runtime PASS. The broken `work/zombie-behavior-balance-20261112/DEV` and its existing 1,774-file recovery backup remain untouched.

The recovered page pair contains neither `lobbyPreviewFaultKey` nor `safeLobbyPreviewUpdate`; this removes the later repeating undefined-identifier path from this candidate. It does **not** prove that the error was the only cause of black rendering or failed deployment. The earlier HTML/CSS/renderer/event lifecycle is kept as a coherent pair rather than mixing in the rejected full-screen lobby DOM or its renderer lifecycle.

### Preserved / selectively carried forward
- Kept the chosen baseline's existing maps, operators, weapons, Legendary integration, LAN authority, mobile HUD, and previous source improvements.
- Carried over the reviewed later Outbreak/weapon behavior functions and 64-bot Infection roster-scaled Patient Zero logic; Offline and phone-host shared paths are aligned.
- Kept the selected `sightline-theme.mp3` asset in Offline and phone-host and restored its small playback controller with autoplay-policy handling. Asset parity is verified; actual playback is not.
- Updated the Android LAN host inventory from 48 to 49 files to include the theme. The native host still validates listed file hashes.
- Preserved baseline and pre-port rollback evidence in the recovery workspace's `checkpoints/` and the copied DEV's existing rollback folders.

### Focused verification
- 68 focused Node checks passed, including setup route handling, local/host-authoritative map and rule routes, Offline/phone-host Outbreak and Infection behavior, 64-bot roster scaling, bomb-rule validation, and shared Outbreak parity.
- Phone-host bundle: 49/49 `SHA256SUMS` entries resolve and match; Offline/phone-host shared rules module and theme asset hashes match.
- Both production HTML pages have no references to the repeating `lobbyPreviewFaultKey` or `safeLobbyPreviewUpdate` path. Page script parse/source checks passed in the focused run.
- `SIGHTLINE.bat build-info`: offline page SHA-256 `a5ff6314b274849b886039bbc7f558dae6ad9869c28a1a112a98d01a57161620`; phone-host page SHA-256 `725e3cfa807beb5e7e50da710cae02c81edd6fa54b0548683374989371f335ad`; phone-host inventory SHA-256 `30a1cf163a6340d0739a2cedc00f84ad1eb7f5ab5871c63bba4bf5e0ca977233`; phone-host server source SHA-256 `31527fbbe7a5e1f9c7a91dae9dc7e97c2bef4a2de463d23c37be30044845d29d`.

### Runtime acceptance still required
No authorized isolated browser/runtime is available in this environment. Therefore 3D lobby visibility, operator rendering, actual Deploy/Begin Round gameplay, movement/aim/fire, bots, settings interaction, theme playback, and absence of live console exceptions remain **UNVERIFIED**. The old page source removes the known error symbol, but no claim is made that the visual/gameplay recovery passed. Owner review is required before acceptance or merge.

### Owner preview
From this DEV directory:

```cmd
START-HOST.bat
```

In a second CMD window:

```cmd
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\playable-game-recovery-20261114\DEV"
SIGHTLINE.bat open
```

Check the served identity with `SIGHTLINE.bat build-info`. This candidate is a private recovery test build only; it does not replace the protected baseline.

### Recovery candidate file delta
Production files changed in this isolated recovery copy:
- `AndroidProject/app/src/main/assets/www/index.html`
- `AndroidProject/app/src/main/assets/phone-host/index.html`
- `AndroidProject/app/src/main/assets/phone-host/server.js`
- `AndroidProject/app/src/main/assets/www/gameplay-mode-rules.js`
- `AndroidProject/app/src/main/assets/phone-host/gameplay-mode-rules.js`
- `AndroidProject/app/src/main/assets/phone-host/SHA256SUMS`
- `AndroidProject/app/src/main/java/com/sightline/v3/LanHostService.java`
- Added the matched `sightline-theme.mp3` to both Offline and phone-host asset directories.

Focused test files updated for the roster-scaled Patient Zero rule and Offline harness:
- `tests/gameplay-mode-rules.test.cjs`
- `tests/infection-lan-protocol.mjs`
- `tests/infection-offline-flow.test.cjs`
- `tests/infection-squad-roles.test.cjs`

No source file in the rejected candidate was changed. The isolated recovery copy also has `RECOVERY-SHA256SUMS.txt`; its 1,474 entries cover every other file in this DEV tree at manifest-generation time.
## Release-candidate audio calibration — 2026-11-14

**Protected input:** owner-accepted SightlineV3-Recovery-UNVERIFIED-Windows-2026-11-14.zip (owner reports actual gameplay works). It remains untouched. Its SHA-256 is 26cd05e60ab670dcb3eb1fe89c5f4a4a359e8ac1f94dbb98b823b1b3ea2f6ccd; a byte-identical protected copy is in recovery-release-candidate-20261114/backups/.

**Working copy:** this DEV is an isolated copy of that recovery. protected-baseline/ remains a separate extracted reference. Pre-change rollback for the seven edited source/manifest/test files is rollback/legend-audio-level-prechange-20261114/; its SHA256SUMS.txt records their prior hashes.

### Legend audio finding and correction
The 15 per-weapon Legendary shot buffers were distinct and reached the skin-specific local-fire route (tryFire → playWeaponShotAudio → legendAudioEvent → legendAudioSourceGain → Legendary bus → shared effects/master chain). Factory shot amplitude is explicitly volume × .50; the old calibration targeted 1.15x the resulting factory RMS for fire (+1.21 dB) and 1.35x for confirmed-kill cues (+2.61 dB). The same master/SFX controls apply to both routes, and the local Legendary path has no distance attenuation. This points to a conservative relative-level target in source, not a missing asset or wrong skin route.

Raised only the per-skin fire and kill calibration ratios to 1.50x factory output. Global master/SFX settings, limiter/compressor, sound palettes, factory sounds, kill authority and gameplay were not changed. The measured fire target is now +3.52 dB versus factory; all 15 source peaks pass the existing safety ceiling. Actual speaker loudness, subjective balance in combat, and real kill-event playback still require listening in-game.

### Android parity
The 49-file host manifest and LanHostService.java both already required 49 entries, including the theme. The parity test still expected 48; that stale assertion caused the first check to fail. Updated the test expectation to 49. Refreshed the host page SHA row, native bundle pin, and the 112-entry Android source manifest for the changed candidate page.

### Focused checks
- node tests/legendary-p0-audio-inspection.cjs — PASS: all 15 per-weapon fire cues calibrated at +3.52 dB relative to actual factory RMS; firing and kill source peak limits passed; generated/authored cue routing and voice caps passed.
- node tests/p13-legendary-audio-inspection.cjs — PASS: weapon-specific audio/effect path checks.
- node tests/phase2-android-asset-parity.mjs — PASS: 49/49 host files hash-valid; 15/15 shared libraries match Offline; Android bundle pin, native/Node allowlists and inline script parsing pass.
- cmd.exe /d /c SIGHTLINE.bat build-info — PASS: local candidate fingerprint generated. Offline and LAN servers were not running.
- No isolated browser/audio playback or runtime console is available here. Speaker listening, live WebGL/gameplay, actual LAN, and Android APK/device acceptance remain UNVERIFIED. This artifact is a private audio-listening/test RC, not a release approval.

### Candidate fingerprints
- Offline page: fa9616eaa605e4d06557e216000dc5ca840530803af8e7fbd8f3235a990203ee
- Phone-host page: 3decff17808d44f7ad213a34f687f10eb69e3be545904df19f0bcfc176fd8f59
- Phone-host inventory: cbe82cdbb4065922a37bd2afd5bb2b554d12ab70f558d1b809baf3a8a1de3651
- Host server source: 31527fbbe7a5e1f9c7a91dae9dc7e97c2bef4a2de463d23c37be30044845d29d
- MainActivity.java: 38b5842b6e61a8019e4a45acebf94a4c5eaef4939ca679c2dc24bd13378232a5

### Preview and rollback
From the extracted RC DEV directory, run START-HOST.bat, then in another CMD window run SIGHTLINE.bat open. To verify the served build, run SIGHTLINE.bat build-info. On Android, use the existing debug/phone-host workflow; no APK was built here.

To revert only this audio-level change, restore the two production HTML pages and tests/legendary-p0-audio-inspection.cjs from rollback/legend-audio-level-prechange-20261114/, then run node tools/refresh-lobby-android-hashes.cjs and node tests/phase2-android-asset-parity.mjs. Keep the workspace-level accepted baseline ZIP unchanged.


The inherited RECOVERY-SHA256SUMS.txt and RC-SHA256SUMS.txt describe earlier recovery/RC snapshots; they are retained unchanged and are not inventories of this gameplay-stability descendant. See the descendant manifest recorded below.


## Gameplay stability follow-up — 2026-11-14

**Isolated candidate:** `work/gameplay-stability-20261114/DEV`, copied from the owner-accepted recovery-based `work/recovery-release-candidate-20261114/DEV`. The accepted recovery source and the previous RC are unchanged. This DEV root's `AGENTS.md` is byte-identical to the current canonical Sightline project instructions (SHA-256 `3175FC5C9F991AC683D697FB8AE6C116EBD6D56CA7A3BD9FF297E0EFF45E5401`).

**Confirmed menu input defect:** the owner screenshots show the browser's pointer-lock prompt while the Play/pause menu is visible. The old `pointerlockchange` listener accepted a canvas lock without checking whether a menu was open. Since pointer-lock requests resolve asynchronously, a grant arriving after `pause()` or `quitToMenu()` called `exitLock()` could leave the cursor captured; visible Map/Match Rules controls then received no normal pointer input. Programmatic unlock events could also be mistaken for unexpected gameplay cursor loss and immediately pause again.

**Correction:** Offline and phone-host pages now share `handlePointerLockChange()`. Any lock grant while the finish picker or lobby menu is visible is released. `exitLock()` records an expected programmatic unlock, and the listener consumes that event without pausing; normal gameplay lock acquisition remains active, while an unexpected unlock during live gameplay still pauses. No combat, map, weapon, AI, mode, or rule values changed.

**Changed source and integrity files:**
- `AndroidProject/app/src/main/assets/www/index.html`
- `AndroidProject/app/src/main/assets/phone-host/index.html`
- `AndroidProject/app/src/main/assets/phone-host/SHA256SUMS`
- `AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java` (refreshed existing host-page integrity pin only)
- `AndroidProject/CURRENT-SOURCE-SHA256.txt`
- `tests/pointer-lock-menu-interaction.test.cjs`
- `rollback/pointer-lock-menu-interaction-prechange-20261114/` holds the pre-change Offline page, phone-host page and prior lobby source test, with hashes recorded in the checkpoint manifest.

**Checkpoint integrity:** the pre-change rollback snapshot has a 3-file `SHA256SUMS.txt` manifest. The complete isolated DEV tree has `GAMEPLAY-STABILITY-20261114-SHA256SUMS.txt`; its detached `.sha256` sidecar authenticates that inventory. The inventory excludes only itself and its sidecar.

**Focused evidence:**
- New pointer-lock lifecycle harness: 5/5 pass (late grant in menu released; intentional unlock doesn't re-pause; unexpected live unlock still pauses; normal gameplay grant preserved; Offline/phone-host handler parity).
- Existing lobby/routing/world-isolation checks: 6/6 pass.
- Existing mode/objective/rule checks: 16/16 pass.
- Android asset parity: 49/49 host files hash-valid, 15/15 shared libraries match, inline scripts parse, host pin and source allowlists pass.
- Local candidate fingerprint: Offline page `e38b7fb1ee76768bd9dab8a9345217084d5099fd4df29591b656329cdf3c7e0a`; phone-host page `de276eb22b0cc0d17ebe0a51de36ab03e4524ded1869fb24fa22fed5721f5a05`; inventory `3d116ebb5c45a4471364c9cfa8138be75342744d41128540363344165a9b57a5`; host server source remains `31527fbbe7a5e1f9c7a91dae9dc7e97c2bef4a2de463d23c37be30044845d29d`.

**Acceptance remains NOT VERIFIED:** no authorized isolated browser or Android runtime is available here, so rendered cursor release, actual Map/Match Rules clicks, Deploy, movement, bot AI, weapon firing, and theme playback were not exercised in this candidate. No private ZIP/APK was created in the pointer-lock correction cycle. The workflow gate is now separated: a complete WIP-UNVERIFIED source ZIP is allowed after source/archive/instruction integrity checks, and a private debug APK is allowed after build and package-integrity checks; neither is production-ready without runtime evidence. The active recovery tree contains no Adventure Mode implementation; Adventure belongs to a separate development lineage and was not invented or modified here. Preserve this candidate for owner testing; do not promote it as release-ready.

## Engineering workflow correction — 2026-11-14

- The owner-accepted recovery build and `gameplay-stability-20261114/DEV` remain the recovery/runtime line. The existing `gameplay-expansion-8.3-20261107/DEV` is a separate experimental gameplay line with its own bot, population, Outbreak/Infection and performance evidence. No merge between them was authorized.
- No Adventure Mode implementation or separately named Adventure branch was found in the current workspace. The expansion 8.3 source does not identify an Adventure Mode feature. Do not edit the recovery source as a proxy; locate its owning source before Adventure-specific changes. General bot/gameplay work must use its actual owning branch.
- WIP source packaging now has a separate source-integrity/archive gate; private debug APK builds verify the current package manifest before building. Production Windows/Android release checks remain fail-closed through `require-release-acceptance.ps1`.
- Pointer-lock lifecycle tests remain source/harness evidence only. Actual cursor release, Match Rules clicks, deployment and gameplay have not been runtime-verified.

## Engineering workflow correction follow-up — 2026-11-14

- Kept `gameplay-stability-20261114/DEV` as the recovery/pointer-lock lineage; did not edit game HTML, rendering, combat, map, operator, weapon, or network behavior.
- Found active-branch workflow omissions against its own project instructions: SHA-256 helper, outcome recorder, production evidence gate, and `release-check` command were absent. The existing Gradle release hook checked signing/TLS but not current candidate acceptance evidence. Restored the shared helpers and added fail-closed current-candidate acceptance checks to direct Gradle release, Android release helper, Android manifest generation, and Windows `release-check`. Direct debug packaging checks only source integrity and remains a private/test path.
- Fixed source-inventory enumeration so generated `.gradle`, `build`, `outputs`, `.git`, and `.tmp` directories are pruned before traversal. Previous recursive enumeration entered generated Android build paths before filtering and could fail on transient Gradle output directories. WIP/debug integrity checks now run against a complete source inventory without walking those generated trees.
- Added focused protocol assertions for direct Gradle debug source-integrity gating, separate production evidence gates, WIP archive labeling/AGENTS/hash validation, stale/untracked-source rejection, and generated-build exclusion. Canonical and active test files are synchronized; branch-specific release Gradle checks are retained.
- Before edits, preserved workflow files in `rollback/engineering-protocol-wip-gate-prechange-20261114/`; its `SHA256SUMS.txt` verifies every snapshot. Original active files that did not exist are documented as absent in the snapshot instead of represented by fabricated backups. Current pointer-lock correction and its original rollback remain intact.
- Current manifests were refreshed; no WIP ZIP, APK, or release artifact was produced. Runtime/gameplay acceptance remains UNVERIFIED.
- Gameplay lineage: `gameplay-expansion-8.3-20261107/DEV` owns the existing bot/Outbreak/FFA/Bomb development work and remains separate from recovery. Adventure Mode source/branch ownership is still not identified; no Adventure-specific edits are allowed until its actual source is found.

## Workflow gate correction and isolated renderer evidence — 2026-11-14

- Confirmed this session's applicable global, workspace, canonical-project, and recovery-project instruction files are present. The protocol tests verified markers and executable gate behavior; future-session loading is enforced by file-presence checks but cannot be independently observed from this running session.
- Canonical and recovery protocol tests passed after refreshing their source inventories. They verify WIP source packaging is distinct from production release, WIP packages require the project `AGENTS.md`, current source/hash integrity, explicit unverified status and non-overwrite behavior, while Windows/Android production gates fail closed without current acceptance evidence. Direct Android debug packaging checks source integrity without implying production approval.
- Recorded the owner's observed lobby runtime escape in `acceptance/ENGINEERING-OUTCOMES.json` with owner-provided evidence, root cause and the earlier source-only test gap. It records one rejected task, zero first-pass acceptances, and one escaped defect; no success rate is inferred from that sample.
- New isolated render check: the actual Offline production page was opened directly in headless Chromium 156.0.8078.4 with WebGL/SwiftShader. At capture, the package-manifest fingerprint was `89564ea77d86cd82c1aa1729e695adef87d6240fe303bcb32d9cd789bd4b291c` and Offline HTML SHA-256 was `e38b7fb1ee76768bd9dab8a9345217084d5099fd4df29591b656329cdf3c7e0a`. Rendered evidence shows the 3D courtyard and operator visible: `acceptance/evidence/isolated-headless-lobby-webgl-2026-11-14.png` (SHA-256 `6cd5471775eb7700cbe691064b3c8a2ccec335a5a640facf23d8cc023151aa1d`). This is isolated-render evidence only; it is not physical-device or owner-browser acceptance.
- A single CDP interaction attempt could not attach to the isolated page target. Therefore real click/touch behavior, Match Rules edits, Deploy into a rendered match, movement/aim/fire, pause/return, and audible theme playback remain **UNVERIFIED**. The render smoke does not close those gates.
- No gameplay source, Adventure Mode implementation, protected baseline, APK or release package was changed. Adventure Mode's owning lineage remains unidentified. Existing bot/zombie work remains in its distinct branches; do not copy it into recovery without a scoped integration.

## LAN bot smoothness assessment — 2026-11-14

- **Scope/lineage:** main recovery-based candidate `gameplay-stability-20261114/DEV`; Adventure Mode and Claude-owned lobby/menu work untouched. The Windows LAN launcher and Android phone-host service use `AndroidProject/app/src/main/assets/phone-host/server.js`; the browser client uses the paired `phone-host/index.html` and shared `character-poses.js`.
- **Baseline identity:** phone-host page SHA-256 `de276eb22b0cc0d17ebe0a51de36ab03e4524ded1869fb24fa22fed5721f5a05`; authoritative server SHA-256 restored to `31527fbbe7a5e1f9c7a91dae9dc7e97c2bef4a2de463d23c37be30044845d29d`. Pre-change source snapshot: `rollback/lan-bot-waypoint-optimization-prechange-20261114/` (its checksum file verifies the restored host).
- **Measured 64-bot loopback host baseline:** same authoritative source, 20 ms tick, 50 Hz snapshots, 2 Protocol V2 clients, 10 seconds. Controlled run: tick work p50/p95/p99/max `2.31/5.68/6.79/10.06 ms`; 582.8 bot decisions/s against 581.8/s target; 64/64 bots moved; zero tick errors and zero skipped snapshots. Snapshot receive p95 was about 33.7 ms. Evidence: `acceptance/lan-bot-host-control-baseline-20261114.json`.
- **Client source microbenchmark:** actual `mpSnapshot`, `mpPuppetStep`, and `SightlinePoses` at 50 Hz snapshots / 60 Hz simulated render; all 16/32/64 bots advanced, max sample queue depth 3, transforms matched state. Interpolation p95 was `0.1577/0.1439/0.2981 ms` per frame. Evidence: `acceptance/lan-bot-client-interpolation-before-20261114.json`. This is a Node VM microbenchmark, not browser FPS/GPU or physical-device evidence.
- **Rejected optimization:** waypoint rank/pool change passed behavior checks but degraded the repeated host measure (64-bot tick p95 `7.09 ms`, 562.3 decisions/s, 953 deferred decisions, versus baseline `5.68 ms`, 582.8/s, 183 deferred). It was reverted; no gameplay source change from this experiment remains. After-run evidence is retained in `acceptance/lan-bot-host-after-20261114.json` and `acceptance/lan-bot-host-after-repeat-20261114.json` so the regression is not repeated.
- **Focused checks on restored source:** `node --check` passed; tactical post assignment passed; Infection/Outbreak roster and role tests passed 10/10; 64-bot loopback host functional checks passed (all bots moved, no tick errors or skipped snapshots).
- **Rendered acceptance:** the existing actual Chromium/WebGL LAN harness started the isolated host successfully, but Chromium launch was **BLOCKED** because its sandbox runtime had no installed headless browser binary. No download or personal browser was used. Therefore actual rendered interpolation, browser frame rate, camera/aim/fire presentation, and device/Wi-Fi smoothness remain **UNVERIFIED**. Do not infer them from the source microbenchmark.
- **Decision:** no further player-facing change is justified by current evidence; the attempted code optimization regressed measured host behavior and was removed. No WIP ZIP or APK was produced because the candidate has no retained gameplay improvement. Continue only when an actual LAN render/telemetry report identifies a reproducible issue or a measured source bottleneck.

## LAN client bot smoothness — targeted heading recovery fix — 2026-11-14

- **Lineage and preservation:** continued only in `gameplay-stability-20261114/DEV`, the recovery-based main-game candidate. Adventure Mode and Claude-owned lobby/menu source were untouched. The authoritative server `phone-host/server.js` remains unchanged at SHA-256 `31527fbbe7a5e1f9c7a91dae9dc7e97c2bef4a2de463d23c37be30044845d29d`; the 64-bot host baseline and prior waypoint rollback remain preserved.
- **Before-change rollback:** `rollback/lan-client-visual-smoothing-prechange-20261114/` contains Offline HTML, phone-host HTML, and `MainActivity.java` reconstructed to the exact prechange state (the only native-source edit in this cycle was its bundle hash pin). `SHA256SUMS.txt` records all three prechange hashes.
- **Root cause:** remote human players and remote bots are created in the same `MP.puppets` collection and use the same `mpSnapshot` → `mpQueueRemotePose` → `mpPuppetStep` path. Their positions, buffers, timestamps, prediction, and position recovery were equivalent. On a host snapshot gap of at least 100 ms, however, `mpPuppetStep` captured heading correction only for `u.zombie`; player/bot actors received positional recovery but their heading could jump directly to the new authoritative pose. A deterministic 320 ms host-stamp gap reproduced a maximum 1.4745 rad/frame heading change.
- **Implementation:** both Offline and phone-host `index.html` now calculate the wrapped yaw recovery offset for every remote actor and ease only that visual yaw correction with a 250 ms exponential time constant. Position recovery retains its original 180 ms behavior. Server authority, collision, hit detection, combat, snapshot cadence, host interpolation clock and bot decisions are unchanged. `MainActivity.java`’s `HOST_BUNDLE_SHA256` pin was updated to match the current phone-host HTML.
- **A/B evidence:** before and after reports are `acceptance/lan-bot-client-snapshot-stress-before-20261114.json` and `acceptance/lan-bot-client-snapshot-stress-20261114.json`. The same deterministic traces executed actual `mpSnapshot`, `mpPuppetStep` and `interpMs` for a remote bot and human at 50 Hz snapshots / 60 Hz simulated rendering. At a smooth 200 ms 90-degree turn and 320 ms snapshot blackout, peak heading step improved from `1.4745` to `0.1795` rad/frame (~88% lower). Position error and frame-step measurements are unchanged: blackout p95 error `0.1432 m`, max position error `0.864 m`, max frame step `0.1389 m`. Under 5% deterministic loss, position error p95 is `0.104 m`, max frame step `0.1364 m`; max buffer depth is 5/12 and no timestamp regressions occurred. The bot and human results matched exactly (zero measured divergence).
- **Focused verification:** new `tests/mp-client-snapshot-stress.cjs` passes for ordinary 16/34 ms inter-arrival jitter, 5% loss, and a 320 ms gap/recovery in both page copies. Existing `tests/mp-jitter-interpolation.test.cjs` and `tests/mp-zombie-jitter-interpolation.test.cjs` pass 12/12. `tests/phase2-android-asset-parity.mjs` passes: 49/49 host hashes, 15/15 shared libraries, inline-script syntax, native bundle pin and allowlists. The server source hash remains the preserved baseline.
- **Limits:** this deterministic Node VM simulation is not Chromium/WebGL rendering, Wi-Fi, Android hardware, combat hit registration, measured browser frame rate, or player-perceived acceptance. The isolated browser executable is still unavailable; rendered remote-bot smoothness and real LAN conditions remain **UNVERIFIED**. A 320 ms outage still causes up to `0.864 m` simulated position error while recovery catches up; no claim is made that a long interruption looks seamless.
- **Package status at that pass:** Python verification was blocked (`python.exe` resolves to an inaccessible Windows Store alias; `py.exe` is absent), and cleanup removed the partial ZIP. A later pass adds and tests an equivalent fail-closed Node verifier; see the follow-up section below for current packaging status.

## LAN WIP verifier fallback — 2026-11-14

- Preserved `tools/preserve_sightline_dev_instructions.py`; added `tools/preserve_sightline_dev_instructions.mjs` as a Node fallback for the existing `verify` operation. The package gate uses it when Node is available, while retaining the original Python path as fallback.
- The Node implementation checks the same verifier requirements: project-root `AGENTS.md`, required instruction markers, authoritative-template condition, exactly one archive-root `AGENTS.md`, readable ZIP payload/CRC, and byte-for-byte equality with the staged project file. Unsupported/encrypted/ZIP64 or malformed entries fail closed. It does not bypass the package source-manifest or full archive/tree hash checks.
- Added `tests/preserve-sightline-dev-instructions.test.mjs`; positive and negative cases pass 6/6, including tampered instructions, missing/duplicate root entries, missing required sections, corrupt CRC, and canonical drift. The actual project source-manifest verification passes.
- WIP packaging is unblocked by the local Node runtime. The package gate passed and produced `work/gameplay-stability-20261114/outputs/SightlineV3-LAN-Bot-Smoothness-WIP-UNVERIFIED-2026-11-14-r2.zip` from this checkpoint; its final SHA-256 is recorded in the adjacent `.sha256` file and delivery record. Runtime LAN smoothness remains **UNVERIFIED**; this is a private test package, not a release.
# Lobby 10 + LAN smoothing controlled integration — 2026-11-14

**Isolated candidate:** `work/lobby10-lan-smoothing-integration-20261114/DEV`. The source base is the unchanged Codex `gameplay-stability-20261114` LAN bot smoothness WIP r2. The original Codex WIP and Claude Lobby 10 ZIP were re-hashed and left unchanged.

**Baseline comparison:** Claude's deliverable is an overlay, not a full game project. Its package notes refer to an older base phone-host page hash (`3954481c...`), which does not match Codex WIP r2 (`a82c31e5...`); neither artifact carries a shared commit identifier, so an exact common ancestor is unavailable. The package instructs re-generating its overlay when the main page moves. The integration followed that path with a local anchored generator: every insertion anchor was required exactly once on both pages before edits. Claude's full HTML and MainActivity were not copied. This is a controlled overlay rebase onto the current Codex WIP, not a claim of an identical common revision.

**Implemented:** Claude's Lobby 10 presentation, CSS, intro/match-found elements, and lobby-scoped interactions are applied consistently to Offline and phone-host pages. The original `sightline-theme.mp3` and existing music lifecycle remain. The Codex remote position/heading interpolation and LAN `server.js` remain unchanged. The native host retains one authoritative checksum declaration, updated to the resulting phone-host page. No Adventure Mode, gameplay map, combat or server implementation was added.

**Integrity correction found during integration:** the existing Android hash refresher updated `CURRENT-SOURCE-SHA256.txt` before refreshing the host `SHA256SUMS` file that the source manifest hashes. Reordered the helper to refresh host sums first and strengthened `phase2-android-asset-parity.mjs` to verify all 112 source-manifest entries; both now pass.

**Before-change rollback:** `rollback/claude-lobby10-premerge-20261114/` contains the five pre-merge page/pin/hash-manifest files, with hashes in its `SHA256SUMS.txt`. Full rollback steps are in `docs/integration/lobby10/INTEGRATION-ROLLBACK.md`. The source overlay, application helper and Claude release notes remain in `lobby-10/` and `docs/integration/lobby10/`.

**Focused checks:** the integration-specific parity/music/inline-script checks passed 3/3. The focused compatibility batch passed 75/75: mode/map/rules routing, gameplay mode rules, Infection flow, LAN discovery and LAN snapshot jitter interpolation. Android parity passed (49/49 host files, 15/15 shared libraries; host pin/allowlist/import and script checks passed). Input archive hashes rechecked: Claude `d669249b...` and Codex r2 `86c3095f...`.

**Acceptance:** actual rendered lobby, Deploy gameplay, LAN host/client session and audio playback are **UNVERIFIED** because no authorized isolated game browser/runtime or test devices are available in this environment. No Android APK was built. This is a private WIP only; production release remains blocked. See `docs/integration/lobby10/INTEGRATION-REPORT.md` for exact fingerprints, evidence and baseline limitation.

## Lobby v10 Match Rules Back control — 2026-11-14

- **Scope/lineage:** continued only from `work/lobby10-lan-smoothing-integration-20261114/DEV`, the combined Lobby 10 + LAN smoothing WIP. Claude's accepted lobby presentation remains the UI baseline; LAN smoothing and gameplay code were not changed. Adventure Mode remains separate and untouched.
- **Defect:** the Play sub-navigation routed into a dedicated Match Rules page, but that page rendered without its own Back action. Returning required selecting the Modes/Offline modes navigation item again.
- **Fix:** added a visible `← Back` button at the top of the Rules panel in Offline and phone-host pages. Rules entry records its setup destination: Offline modes, Host modes, or Multiplayer for a connected authoritative host. The Back action routes directly to that destination without assigning `R.mode`, `CURMAP`, or rule fields. Existing `setVal('R', ...)` persistence and rules rendering remain unchanged.
- **Rollback:** pre-change copies of Offline/phone-host HTML, Android host pin, phone-host sums and Android source manifest are in `rollback/lobby10-match-rules-back-prechange-20261114/`, verified by its `SHA256SUMS.txt`. Restore only these five runtime/integrity files using `docs/integration/lobby10/MATCH-RULES-BACK-ROLLBACK.md`; earlier integration rollback remains intact.
- **Focused evidence:** `node --test tests/lobby10-match-rules-back.test.mjs tests/lobby10-lan-smoothing-integration.test.mjs` passes 7/7. Tests exercise the actual route functions in isolated Node contexts for Offline, offline host and connected host; check the button markup and dispatch, unchanged mode/map/rules across back navigation, and the existing rule setter's persistence/re-render state source. `node tests/phase2-android-asset-parity.mjs` passes 49/49 host inventory hashes, 112/112 Android source rows, 15/15 shared libraries, and page syntax/pin checks.
- **Current phone-host page SHA-256:** `0ac90fdb6bb238e5184fdfd48d9c4d45c806301ddab8328565ff842129ceb99c`. Native host pin and Android manifests were refreshed.
- **Acceptance:** actual browser mouse/touch rendering and interaction are **UNVERIFIED** pending owner review. No production merge or APK was made. The first WIP attempt was blocked by low disk space; after C: space became available, private WIP packaging succeeded. The verified package is `outputs/SightlineV3-Lobby10-MatchRulesBack-WIP-UNVERIFIED-2026-11-14.zip` (SHA-256 `258a3a19d1f760bace2a7d01b06426b60b2f3109aabd58358fc4455d1d018bcb`). Its internal 1,590-entry manifest and all current source hashes were verified; the generated WIP status remains `UNVERIFIED` / `NOT RELEASE READY`. The earlier Lobby 10 + LAN smoothing ZIP remains unchanged.


# Android v5 private debug candidate — 2026-11-14

- Built `AndroidProject` debug variant from this Lobby v10 + LAN smoothing + Match Rules Back candidate. `VERSION_CODE` advanced from 4 to 5; `VERSION_NAME` from `0.3.1-integration-android-5.1` to `0.3.2-integration-android-5.1`. Application ID, SDK configuration, game assets and LAN source were preserved.
- Build blocker corrected: `AndroidProject/app/build.gradle` redeclared the outer `name` version variable in the debug task-graph closure. Renamed only the local variable to `taskVariantName`; the original file is in `rollback/android-v5-prebuild-20261114/app-build.gradle`.
- Gradle 8.13 / JDK 17 / SDK 36 `assembleDebug` passed with the project source-integrity gate. The default user debug keystore did not match the previous accepted v4 APK, so the build process used a temporary workspace-local Java user home containing a byte-identical copy of the pre-existing matching debug key. No project signing config or user-profile keystore was changed.
- APK: `../outputs/PRIVATE-ANDROID-v5-2026-11-14/SightlineV3-Lobby10-LAN-Smoothing-MatchRulesBack-v5-DEBUG.apk`; SHA-256 `
737e05ceb149703db2458f0fc15060c07741823bee7b8e030df1b29fb34804a5
`; versionCode 5; package `com.sightline.v3`; APK signer SHA-256 `5d4f7045c31de17d72d70c54ba2c11949e8c4ebfbefe0f21fdcf866ac962e510` (matches v4 rollback APK).
- APK content verified: Offline and phone-host `index.html` hashes match current Android source and both include the `← Back` action; original `sightline-theme.mp3` is present and identical in both asset trees. aapt identity/version and apksigner v2 verification passed.
- Rollback: `rollback/android-v5-prebuild-20261114/`; prior accepted v4 APK SHA-256 `aef036f3f469001d8dd678acee4b9e9ef7cee005472c8b4f765b6e1827ead528`. An initial v5 APK signed with the machine-local key is retained there for traceability; it is not the delivered update APK.
- Physical-device installation, runtime rendering, gameplay, and LAN acceptance remain NOT TESTED. This is a private debug candidate, not a production release.

## Android v6 critical recovery — 2026-11-14

- **Candidate/rollback:** isolated from `lobby10-lan-smoothing-integration-20261114/DEV`; pre-change HTML, Android activity, and version file are preserved at `rollback/android-v6-prechange-20261114/` with `SHA256SUMS.txt`. v5 remains unchanged at `../lobby10-lan-smoothing-integration-20261114/outputs/PRIVATE-ANDROID-v5-2026-11-14/` (SHA-256 `737e05ceb149703db2458f0fc15060c07741823bee7b8e030df1b29fb34804a5`); v4 remains in the prior rollback record.
- **Owner-reported v5 failure:** physical phone showed an intro but no playable match, roughly half-black display, and an oversized speaker control. This environment has no usable Android runtime: ADB daemon would not start, and the installed emulator lacks its hypervisor driver. The exact physical root cause is therefore **unconfirmed**.
- **Source corrections:** offline and phone-host entry pages now give the speaker button/SVG explicit bounded dimensions before route initialization and keep intro buttons touch-action enabled. The optional lobby preview update is isolated from the shared animation frame; if it throws, the preview is disabled, its hidden world state is restored, one diagnostic is logged, and the main scene render continues. Android debug builds now report WebView console/asset errors, usable viewport/WebView/canvas dimensions, intro/speaker/Deploy geometry and click hit targets, and observed pointer/click events. Native landscape, immersive layout, WebViewAssetLoader, package ID, theme, Lobby v10, LAN smoothing, and Match Rules Back are retained.
- **Version:** `VERSION_CODE=6`, `VERSION_NAME=0.3.3-integration-android-6`; package stays `com.sightline.v3`. The debug signing key is the existing v4/v5-compatible local debug identity; no production signing was used.
- **Focused source checks:** Android v6 recovery + Match Rules Back tests passed 13/13. Android parity passed 49/49 phone-host inventory files, 112/112 current Android source entries, 15/15 shared libraries, and inline-script parsing. These are source checks only.
- **Runtime status:** `PHYSICAL-DEVICE ACCEPTANCE BLOCKED`. No rendered screen, touch, intro-to-match, audio, gameplay, or APK-install result is claimed. The debug APK is only for owner manual testing and is not production-ready.
- **Next evidence:** install the private v6 APK over v5 using the compatible debug key; capture `adb logcat -s SightlineV6 chromium WebView AndroidRuntime` during start, Intro Begin/Skip, Lobby, Match Rules Back, and Deploy. Verify full-screen landscape canvas and target hit-test logs, then confirm rendered lobby and one playable match on the phone.
- **APK build and package checks:** Gradle 8.13 `:app:assembleDebug` succeeded using the existing JDK 17 / AGP 8.13.2 / SDK 36 setup. APK aapt identity is `com.sightline.v3`, versionCode 6, versionName `0.3.3-integration-android-6`; it is debuggable and zipaligned. `apksigner verify` passed, with signer certificate SHA-256 matching v5: `5d4f7045c31de17d72d70c54ba2c11949e8c4ebfbefe0f21fdcf866ac962e510`. Embedded Offline page, phone-host page, both original theme MP3s, and phone-host SHA256SUMS were each byte-hash matched to this source candidate. APK SHA-256: `6eb6a7423848f8e4c2f23bef2bc90ad8798ed80e329b5ddfa4ae1c29c81988b6`; private copy: `outputs/PRIVATE-ANDROID-v6-2026-11-14/SightlineV3-Android-v6-CRITICAL-RECOVERY-DEBUG-PRIVATE-TEST.apk`.
- **Build integration issue found and fixed:** the first compile exposed that AndroidX WebViewClientCompat finalizes the platform `onReceivedError(..., WebResourceError)` callback. The debug telemetry now uses the documented `onReceivedError(..., WebResourceErrorCompat)` overload; the subsequent Gradle build succeeded. This was a v6 diagnostic-code compile defect, not evidence about the owner's earlier black screen.
# Android Studio v7 integration — 2026-11-15

- **Source lineage:** isolated copy of `work/android-v6-critical-recovery-20261114/DEV`; v6 and both preserved v4 APK lineages remain untouched. A v6 APK rollback copy and pre-change Android source snapshot are under `rollback/`.
- **Root cause:** Android `onCreate()` always called native `showHome()`. Lobby v10 was loaded only after the native “Play Offline” button. This made the legacy native launcher the app’s first screen even though the v6 APK bundled the v10 HTML.
- **Fix:** v7 starts through the existing WebViewAssetLoader with the packaged Lobby v10. Android Back returns to the native Offline/LAN launcher; its Offline and LAN actions are retained. `openGame(null)` now remains a bundled Offline route even in secure-LAN variants; TLS host validation is limited to explicit joins. The existing Activity/WebView, landscape, permissions, LAN flow, and lobby HTML are preserved. Package ID remains `com.sightline.v3`; version is 7 / `0.3.4-integration-android-7`.
- **Focused source checks:** v7 startup 6/6; Match Rules Back 3/3; v6 Android sizing/input/render-loop subset 9/9; Lobby v10/phone-host parity, theme routing, and inline-script parse 3/3. Total 21/21 focused source checks passed. This is source-level evidence only.
- **APK build:** not performed. The project build helper requires JDK 17; the available Android Studio JBR is 25 and `java` is not configured on PATH. SDK 36 and Build Tools 35/36 are present. The project is ready to open in Android Studio and build once JDK 17 is selected.
- **Rendered/device status:** UNVERIFIED. No authorized Android runtime/device was used. Do not treat the source test as visual or physical acceptance.
