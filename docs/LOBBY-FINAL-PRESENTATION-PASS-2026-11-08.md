# Sightline V3 Lobby — Final Presentation Pass

Date: 2026-11-08  
Candidate: `work/lobby-premium-lobby-final-presentation-20261108/DEV`  
Rollback baseline: `work/lobby-premium-visual-polish-20261108/DEV` (left unchanged)

## Changes

- Refined the Squad Bay overlay with a restrained light falloff over the existing courtyard scene, keeping the left-side text readable.
- Made the five mode choices a compact icon-and-label row on desktop and Android landscape. Removed duplicated per-card descriptions and repeated mode metadata from the selected-mode strip. The labels remain available to screen readers and in button titles.
- Replaced the Infection spiky gear-like mark with a three-lobed contagion/biohazard mark. Tactical, FFA, Bomb Defusal, and Outbreak retain their established custom marks.
- Increased the live Armory preview's share of available horizontal space while retaining the existing `renderPhoneOpticPreview` renderer and its 380×175 render target.
- Improved operator roster selection contrast and usable roster height.
- Adjusted only the existing menu-preview point light and idle camera distance slightly. The existing operator model, spawn transform, rig, materials, weapon and gameplay animation remain intact.
- Kept the same CSS and preview code in Offline and phone-host pages. No added dependency or asset.

## Changed files

1. `AndroidProject/app/src/main/assets/www/index.html`
2. `AndroidProject/app/src/main/assets/phone-host/index.html`
3. `tools/sightline-premium-lobby-spaces.css`
4. `tools/apply-premium-visual-polish.mjs`
5. `tests/premium-lobby-experiences.test.cjs`
6. `AndroidProject/app/src/main/assets/phone-host/SHA256SUMS` (integrity metadata)
7. `AndroidProject/CURRENT-SOURCE-SHA256.txt` (integrity metadata)
8. `AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java` (phone-host SHA-256 pin only)

Per-file SHA-256 values are in `acceptance/lobby-final-presentation-20261108/CHANGED-SOURCE-MANIFEST.json`.

## Focused verification

- Lobby experience tests: **13/13 PASS**.
- Production inline-script syntax check: **PASS** (both production pages parsed).
- Lobby source/integrity check: **PASS**; Offline and phone-host CSS/showcase code match, host-page pin matches, 112 Android source entries and 48 phone-host entries verify, and the 7 preserved rollback files verify.
- Android source hash indexes were refreshed after updating both served pages.

These checks establish source consistency and integrity, not visual acceptance.

## Visual evidence and limits

Three generated visual previews were produced from the prior actual Lobby 9.1 captures for fast review:

- PLAY: `C:\Users\LOCAL_USER\.codex\generated_images\01a161da-a570-7d12-a77e-2259a28a2940\exec-a60f1734-02e8-40e2-863d-b9b3a65c4943.png`
- LOADOUT: `C:\Users\LOCAL_USER\.codex\generated_images\01a161da-a570-7d12-a77e-2259a28a2940\exec-6aa6366d-a217-4219-8130-c979bf2a4892.png`
- OPERATORS: `C:\Users\LOCAL_USER\.codex\generated_images\01a161da-a570-7d12-a77e-2259a28a2940\exec-659ea434-b09a-42fc-a096-5441e744aef6.png`

They are **VISUAL PREVIEWS, NOT GAMEPLAY SCREENSHOTS**. Image generation may alter small details and is not proof of the page's exact runtime layout. The actual updated Offline and phone-host pages were not rendered in this turn. Desktop/Android landscape clipping, perceived lighting, final operator framing, and weapon-preview sharpness therefore remain **UNVERIFIED**. No full regression suite, APK build, or package was produced.

## Rollback and preview

The prior candidate remains untouched at `work/lobby-premium-visual-polish-20261108/DEV`. To preview this descendant through the project's normal workflow, run `SIGHTLINE.bat offline` from the new candidate's `DEV` root. This command is provided for the user; it was not run during this source-only pass.

The candidate remains experimental and unaccepted until the updated production page is visually reviewed. No release package was created.
