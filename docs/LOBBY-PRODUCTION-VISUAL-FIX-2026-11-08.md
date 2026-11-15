# Sightline V3 — Production Lobby Visual Fix

Candidate: `lobby-cinematic-environment-20261108 / production-visible-fix-1`  
Updated: 2026-11-08  
Rollback: `work/lobby-premium-lobby-final-presentation-20261108/DEV` (untouched)

## Root cause found in the verified production source

The owner-provided pre-fix Offline page hash (`7ecf4868288c029d286780a142cb3119283d192dadd228898d41faeb1ed4a22e`) corresponded to this candidate. The room-building code was present and its lobby visibility path was connected. The room was not missing because of a stale page, an asset cache, or a missing texture: all furnishings are procedural Three.js geometry and local materials, with no external asset requests.

The composition and luminance were the problem. The camera deliberately leaves the left side of the screen for the UI and frames the operator to the right, but the prior racks were centered at x = -4.65 and +4.65, floor cases were around x = +/-4–5, and the largest console/display sat left of the operator. Most set detail therefore landed at the edges or beneath the dark UI side. The Lambert room materials were also very dark; the room had a single point fill at intensity 0.16 and the operator fill was 0.4. The rear wall and open floor consequently dominated the production view.

## Targeted correction

- Repositioned the large wall display, consoles, cases, and one equipment rack into the existing camera's visible staging pocket beside and above the operator.
- Brightened the room's matte shell, steel, case, floor, and screen palette; raised tactical linework contrast; added two slim emissive wall accents.
- Replaced the weak room fill with a cool, shadow-free fill and a restrained warm fill. Increased the existing operator-only fill and moved it slightly forward/up so the current face and gear receive more light.
- Kept the room lobby-only, generated from local Three.js primitives, outside collision/navigation/world geometry, and batched by the existing material groups. No real-time shadow casters, new asset downloads, heavy postprocessing, or new dependencies were added.
- Did not change the camera, UI, characters, weapons, game rules, map builder, controls, LAN server, or Legendary modules.

## Exact updated source files

The detailed SHA-256 and byte counts are in `acceptance/lobby-production-visual-fix-20261108/CHANGED-SOURCE-MANIFEST.json`.

- `AndroidProject/app/src/main/assets/www/index.html`
- `AndroidProject/app/src/main/assets/phone-host/index.html`
- `tools/apply-cinematic-lobby-environment.mjs`
- `tests/cinematic-lobby-environment.test.cjs`
- `tests/premium-lobby-experiences.test.cjs` (updates the expected operator-fill value)
- `AndroidProject/CURRENT-SOURCE-SHA256.txt`
- `AndroidProject/app/src/main/assets/phone-host/SHA256SUMS`
- `AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java` (host asset hash pin only)

The focused boundary test confirms that, in both Offline and phone-host HTML, every byte outside the existing lobby-preview/ready-room block remains identical to the preserved pre-environment page. The main activity change is limited to its phone-host bundle hash.

## Verification

- Lobby/ready-room source regression tests: **18/18 PASS**.
- Offline and phone-host ready-room source parity: **PASS**.
- Offline and phone-host inline production scripts parse: **PASS**.
- `tools/verify-lobby-visual-source.cjs`: **PASS**; 112 Android source entries, 48 phone-host entries, host page pin valid, 7 pre-existing rollback files verified.
- Applicator/test syntax checks: **PASS**.
- Full gameplay regression suite: **NOT RUN**; this change is confined to the lobby preview block.
- Actual browser/WebGL rendering, visual comparison, physical Android, and device performance: **UNVERIFIED**. No new preview images were used as proof, and no unsupported browser workaround was attempted.

## CMD review

In one Command Prompt:

```bat
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\lobby-cinematic-environment-20261108\DEV"
SIGHTLINE.bat offline
```

In another Command Prompt:

```bat
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\lobby-cinematic-environment-20261108\DEV"
SIGHTLINE.bat open-offline
```

Review the actual ready room on Play, Operators, and Loadout, then send a current screenshot for visual acceptance. For LAN, stop the Offline server, run `START-HOST.bat` from the same candidate, and open the URL it prints. Stop either server with Ctrl+C.

## Decision

**Source fix: ACCEPT for owner review. Visual acceptance: UNVERIFIED.** The candidate is directly testable through CMD but is not a release/package candidate. Do not promote it until the owner confirms the actual rendered scene and Android/LAN acceptance gates are resolved.
