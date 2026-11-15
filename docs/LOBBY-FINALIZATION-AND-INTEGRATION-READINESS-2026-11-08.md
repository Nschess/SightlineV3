# Sightline V3 Lobby Finalization and Integration Readiness

Date: 2026-11-08  
Candidate: `work/lobby-cinematic-environment-20261108/DEV`  
Rollback: `work/lobby-premium-lobby-final-presentation-20261108/DEV`

## Decision

**Source candidate preserved and ready for controlled review. Legendary 3.0 integration is deferred until its exact source branch and manifest are available.** No game or Legendary code was changed during this finalization pass. No package was created or promoted.

## Candidate and rollback integrity

- The candidate's `AGENTS.md` is byte-identical to the designated workspace source of truth at `work/consolidation-threezip-20261025/independent-extract-release/DEV/AGENTS.md`; SHA-256: `df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2`.
- The original candidate/rollback comparison found 1,289 candidate files and 1,285 rollback files. It found five changed existing files (the two production pages and three Android hash metadata files) plus four candidate-only environment implementation/evidence files; no rollback-only files were found. This report and the finalization manifest were then added to the candidate, so the final manifest records 1,290 candidate files plus itself, versus 1,285 rollback files. The current eleven path/hash differences are the original nine plus this report and manifest; no rollback-only files exist.
- `acceptance/lobby-finalization-20261108/FINALIZATION-SOURCE-MANIFEST.json` records SHA-256 and size for every candidate file except itself and every rollback file, plus reproducible tree fingerprints. Its own hash is excluded to avoid a circular digest.
- Restore by using the untouched rollback directory above as the source of truth. Do not copy the candidate over it. To abandon the environment change, run the rollback candidate directly; keep both directories until review is complete.

## Production source verification

The ready room and lobby are wired in both production entry pages:

- `AndroidProject/app/src/main/assets/www/index.html` — Offline WebView/game page.
- `AndroidProject/app/src/main/assets/phone-host/index.html` — LAN phone-host page.

The environment is created by `createLobbyReadyRoom()` and updated by `lobbyPreviewUpdate()` only while the idle menu is open. It is hidden when the preview is inactive and remains outside `worldObjs`, `OBST`, collision, navigation, and `buildWorld(CURMAP)`. `setMap()` still applies the selected map data, rebuilds its world/targets, renders map information, and saves `MAP_KEY`. The current page still uses the production `makeUnit`, `ensureWorldWeapon`, `gunFor`, and `renderPhoneOpticPreview` paths.

Source-level behavior checked:

- Five modes — Tactical, FFA, Bomb Defusal, Outbreak, Infection — remain selectable through the production `data-quick-mode` handlers; disabled/connected-state rules and accessible pressed state are retained.
- Maps and Bomb Defusal use the existing `MAPS`, `mapSvg`, A/B site preparation, and `RULE_SPEC` selectors.
- Operator choice persists through `OP_KEY`; weapon choice persists through `LOADOUT_WEAPON_KEY`; map choice persists through `MAP_KEY`.
- Deploy remains the existing `#btn-start` action and calls the existing match-start flow.
- Offline and phone-host lobby blocks and the ready-room scene source match. The page loads local Three.js r128 and local modules; the environment introduces no external asset or runtime dependency.

These are source-level checks, not actual browser interaction evidence.

## Legendary integration boundary

No current Claude Legendary Guns 3.0 source tree or source manifest was present in the accessible worktrees. The closest accessible candidate is the directory named `work/legendary-guns-2.0-20261104/DEV`; its package metadata identifies an earlier 2026-11-03 Accurate Legendary Model Restore lineage (509 manifest-listed files). An older 2026-10-25 Legendary development output is also present. Neither is treated as Claude 3.0 or as an approved replacement.

### Known overlap and dependencies

- Lobby experience changes and the live weapon-preview wiring share the two inline production pages named above. A whole-page overwrite would discard lobby state and presentation work.
- Existing page preview calls `renderPhoneOpticPreview(finishWeapon, canvas, optic)`, which constructs via the current `gunFor(k)` path. Skin/Legendary selection is supplied by the current `weapon-skins.js` and `legendary-packs.js` modules; the load order is declared in the page's local script tags.
- LAN delivery is separately constrained by `AndroidProject/app/src/main/assets/phone-host/server.js`'s `FILES` allowlist. Android phone-host staging integrity is also bound through `phone-host/SHA256SUMS`, `AndroidProject/CURRENT-SOURCE-SHA256.txt`, and the embedded `HOST_BUNDLE_SHA256` in `MainActivity.java`.

### Safe integration sequence (not executed)

1. Obtain Claude 3.0's exact source root/archive, root `AGENTS.md`, source manifest, and ownership/readiness report; verify all hashes before inspecting for integration.
2. Three-way compare only changed files against this candidate and its rollback. Identify whether 3.0 adds modules/assets or changes shared page builders, `weapon-skins.js`, `legendary-packs.js`, optics, host allowlists, or Android hash pins.
3. Preserve the lobby page blocks and merge the smallest reviewed Legendary hooks. Keep Offline and phone-host pages synchronized; add only verified local assets to Android WebView/host routes and regenerate integrity pins from the accepted source.
4. Run Legendary-specific source/geometry tests, lobby mode/map/operator/loadout tests, Offline/phone-host parity, Android asset parity, full regressions, and server route checks. Require actual Offline and LAN WebGL screenshots for visual acceptance before promotion.
5. Retain this candidate and rollback untouched. If any check fails, restore from the rollback directory rather than reverting files piecemeal.

## Verification results

- Focused lobby/ready-room regression tests: **16/16 PASS**.
- Offline/phone-host ready-room and relevant lobby blocks: **MATCH**.
- `node tools/verify-lobby-visual-source.cjs`: **PASS** (112 Android source entries, 48 phone-host entries, host hash pin matches; 7 pre-existing rollback files pass).
- `node tools/check-production-html-scripts.cjs .`: **PASS** (both production pages' inline scripts parse).
- `node --check tools/apply-cinematic-lobby-environment.mjs`: **PASS**.
- Full game regressions, actual WebGL/browser rendering, physical Android, live LAN visual behavior, and performance measurement: **NOT RUN / UNVERIFIED**.

No confirmed code defect requiring a targeted fix was found in the source checks. The previously recorded previews are generated images, not gameplay screenshots.

## CMD preview instructions

Offline preview, first Command Prompt:

```bat
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\lobby-cinematic-environment-20261108\DEV"
SIGHTLINE.bat offline
```

In a second Command Prompt, open the page:

```bat
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\lobby-cinematic-environment-20261108\DEV"
SIGHTLINE.bat open-offline
```

LAN host preview:

```bat
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\lobby-cinematic-environment-20261108\DEV"
START-HOST.bat
```

The host prints its local and LAN URLs. Stop it with Ctrl+C. This procedure has not been executed in this finalization pass, and a successful start would not by itself establish visual or physical-device acceptance.

## Acceptance status

| Gate | Status | Evidence/limit |
|---|---|---|
| Production source wired in Offline and phone-host | PASS | Inline source and parity checks |
| Modes, maps, rules, operator/loadout persistence, Deploy hooks | PASS (source-level) | Focused source regression tests |
| Rollback and full file inventories | PASS | Candidate/rollback tree comparison and finalization manifest |
| Visual acceptance in actual game renderer | UNVERIFIED | Browser/runtime screenshot not captured |
| Android visual/performance acceptance | UNVERIFIED | No APK/device test in this pass |
| Live LAN acceptance | UNVERIFIED | CMD preview instructions provided; no live session run |
| Claude Legendary Guns 3.0 source compatibility | DEFERRED | Exact current 3.0 branch/manifest unavailable |
| Release/package readiness | NO-GO | Visual and external acceptance gates remain open; package restrictions remain in force |
