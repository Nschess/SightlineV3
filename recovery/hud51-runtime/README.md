# Exact owner-approved HUD51 runtime recovery evidence

The protected APK was found and its full SHA-256 matches the recorded owner acceptance:
`ACEA893BB7689A207A46834B58B3DC0E60E8F4E68E06101B566B312C80B617F2`.
It was read only and remains unchanged. The APK itself is not committed here.

All **102 bundled runtime assets** can be reproduced from this repository:
- 99 assets match the exact source bytes at commit `77b2b6645df120c76a334c8a5ac2157feae68c2d` and are reused without duplication.
- The three differing assets are preserved here as exact original APK-entry bytes: Offline HTML, phone-host HTML and the original phone-host checksum inventory.
- `MANIFEST.json` maps every APK entry to its SHA-256, length, existing Git source and/or stored original. `tests/hud51-packaged-recovery.test.cjs` verifies reconstruction against those fingerprints.

The original pages include `<style id="android51-restored-hud">` and the text-only `renderTouchActionButton` implementation. These are the actual packaged HUD51 source, not a new design or a reconstruction. They do not contain the later mobile camera changes.

This closes the missing **packaged Web game/HUD source** gap. It does not recover the deleted editable project as a whole: original native Java sources, Gradle settings, signing keys and build-time metadata cannot be claimed from compiled APK contents. The preserved APK remains the accepted binary; newly integrated source has no inherited phone acceptance.

For a future controlled recovery, use a separate branch, reconstruct each entry at its `AndroidProject/app/src/main/<entry>` destination using `storedOriginal` when present and the pinned parent commit otherwise, then verify all 102 hashes. Preserve the current camera development branch. Validate native startup, host bundle pin, signing and build settings independently before building an acceptance APK. Do not overwrite the protected APK or main.

The active game assets have deliberately not been changed by this evidence milestone. No new APK, release, full-project ZIP or Adventure Mode integration was produced.
