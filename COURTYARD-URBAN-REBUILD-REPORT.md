# Courtyard Urban Rebuild — Windows Private Test

Candidate: `world-realism-overhaul-rebuild-20261111/DEV`
Scope: Courtyard presentation only. The screenshot shows Outbreak HUD (`WAVE 1 CLEARED`, `56 ALLIES`, squad count 57). Courtyard is the best-supported map match because it is the only registered map using the old tile-ground treatment, and it is the launcher default. The screenshot itself does not display a map ID, so this identification is high-confidence, not direct HUD proof.

## Changes

- Replaced Courtyard's repeated tile floor with one deterministic 1024px painted asphalt surface: worn aggregate variation, staggered repair joints, edge drains, faded loading lanes, cracks, and grates.
- Reworked Courtyard's render profile for subdued urban light/fog and slate concrete.
- Added a render-only surrounding city district: varied stepped/gabled/sawtooth roof profiles, windows with lintels/sills, structural piers, slatted service bays, canopies, roof equipment, and a distant skyline beyond a single apron plane.
- Added instanced structural details to eligible existing Courtyard wall visuals. Existing collision, map area, cover obstacles, zones, callouts, spawn positions, and navigation inputs are unchanged.
- Kept the new scene objects in the existing world cleanup path; no scenery is added to AI, collision, or snapshot state.
- Synchronized the shared Courtyard map/rendering blocks to Phone-host. Android host bundle and native page hash were refreshed; no APK was built.

## Changed source

- `AndroidProject/app/src/main/assets/www/index.html`
- `AndroidProject/app/src/main/assets/phone-host/index.html`
- `AndroidProject/app/src/main/assets/phone-host/SHA256SUMS`
- `AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java` (bundle hash pin only)
- `AndroidProject/CURRENT-SOURCE-SHA256.txt`
- `tools/sync-courtyard-rendering.js`
- `tests/courtyard-urban-rebuild.test.cjs`

## Verification

- Map schema: 19/19 map IDs and bounds pass; no map added/removed.
- Map-specific scenery tests: 4/4 pass.
- Focused Courtyard isolation/gameplay-definition tests: 2/2 pass.
- Android Phone-host bundle: 48/48 SHA-256 entries pass; shared modules 15/15; Offline/Phone-host shared scenery and `buildWorld` blocks match.
- Phone-host server JavaScript syntax: pass.
- Normal launch files `START-HOST.bat` and `SIGHTLINE.bat` are preserved.

## Acceptance limits

Actual WebGL rendering, gameplay screenshots, GPU/CPU frame time, and Android runtime were not available in this environment. Visual acceptance and performance acceptance remain **UNVERIFIED**. Instancing and render-only scenery reduce per-object submissions and avoid collision/navigation cost, but this is not a measured FPS result. The package is for private owner review; it is not a release build. No Android APK was built and no other map was modified.

## Preview

From an extracted package root, run `START-HOST.bat`; in a second CMD window run `SIGHTLINE.bat open` (or open `http://localhost:8080`). Select Outbreak and Courtyard. For offline compatibility, run `SIGHTLINE.bat offline` and open the address it prints. Stop servers with Ctrl+C.

## Rollback

Restore the five checkpointed Android source files from `rollback/courtyard-rebuild-prechange-20261111/files/` to their matching paths. Verify them against `rollback/courtyard-rebuild-prechange-20261111/checkpoint-manifest.json`. The manifest SHA-256 is `74cfe9620c01f7dcfacecaa488293bab619f57a6b0b93cb8ec331747de519370`. The original protected baseline ZIP remains unchanged (SHA-256 `957f3a94192399ac12ed3ab430520a412f38c8eb2ae0176ce480341f2cda3be7`).