# Sightline V3 — HUD51 runtime recovery milestone

Branch: `recovery/hud51-packaged-evidence`
Parent commit: `77b2b6645df120c76a334c8a5ac2157feae68c2d`
Latest checkpoint: the commit containing this document (`git rev-parse HEAD`). The delivery report records the verified remote SHA.
Canonical remote: https://github.com/Nschess/SightlineV3

## Recovered original runtime source

The protected owner-approved HUD51 APK was located and read without modification. Full SHA-256 matched `ACEA893BB7689A207A46834B58B3DC0E60E8F4E68E06101B566B312C80B617F2` before and after extraction.

All 102 packaged runtime assets are recoverable from Git: 99 match the pinned parent commit exactly; the other three are preserved byte-for-byte under `recovery/hud51-runtime/assets/`. `MANIFEST.json` records every entry, length, SHA-256 and reconstruction source. These are original packaged assets, not reconstructed replacements.

Original Offline HTML SHA-256: `1e2281f407808f57ccc2b39ff5a3509c44054bf4ff4617bd32678cb5a21cf5b9`.
Original phone-host HTML SHA-256: `1be6c08ca8ef0460971f47c6f2986634003d22197c1b0b6e6dcd824a76a30b23`.
The pages contain the approved `android51-restored-hud` styling and text-button renderer.

Focused verification: `node tests/hud51-packaged-recovery.test.cjs` — 3 tests verify all asset hashes, original HUD markers and unchanged active game assets. No device, renderer or APK build was attempted. The protected binary's owner acceptance does not transfer to a newly integrated build.

## Preserved development and remaining gap

Active gameplay still contains the camera/ADS development work from `dev/mobile-visibility-context-recovery` at the parent commit. Its source-level checks remain recorded there; original HUD evidence has NOT yet been integrated into active gameplay. Both lineages are preserved, and main remains unchanged. No Adventure Mode access or changes.

The original packaged Web game/HUD source gap is closed. The complete deleted editable workspace is not recovered: native Java source, original Gradle settings, signing keys and build-time metadata cannot be claimed from compiled APK contents. Historical whole-project fingerprint `80a6cd49fe1ba36a54edbccfac5600ae450b8a32383a8770475a444c4209b139` remains a recorded reference, not a recovered project identity.

Next step: create a controlled integration branch, use the exact recovered HUD source with the preserved camera work, verify native startup/host pin/build configuration independently, and validate the resulting Android baseline before any main merge. Do not blindly replace gameplay or equate a source reconstruction with the accepted APK. Production release remains blocked by current-candidate runtime/device acceptance.

## Git and storage

Source milestones belong in Git commits, pushed development branches and verified remote refs. Keep source byte integrity portable through `.gitattributes`. Keep generated APKs, caches, toolchains, signing credentials and redundant archives out of ordinary Git history. Use reviewed PRs for substantial integrations; keep main stable.

The owner-approved redundant inspection clone was verified to contain no unique files, ignored files, unreachable objects or commits missing from the active repository, then deleted alone: 54,490,383 file bytes removed. No other folder, APK, backup or Adventure Mode workspace was deleted. Recovery evidence reuses 99 existing assets instead of creating another full-project copy or ZIP.
