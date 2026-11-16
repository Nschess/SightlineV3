# Sightline V3 — GitHub-first development checkpoint

Branch: `dev/mobile-visibility-context-recovery`
Base commit: `77fa265a9ab96c9429011c437da5ee980c51e575`
Latest source milestone: the commit containing this document; resolve its exact ID with `git rev-parse HEAD`. The delivery report records the verified remote SHA.
Canonical remote: https://github.com/Nschess/SightlineV3

## Completed in this branch

Recovered the previously recorded mobile camera/ADS implementation into the existing Offline and phone-host pages: separate persisted horizontal FOV (75 degrees, adjustable 65–95), aspect-correct projection, relative optic magnification, true Compact 2x, perspective-scaled touch look and local weapon projection compensation. Desktop FOV, firing/ballistics, movement/collision, networking authority, existing HUD DOM/CSS and lobby camera remain unchanged. Native host validation explicitly permits this branch's exact host bundle and the existing recovered PC host; unknown bundles remain rejected. The older host serves its own camera code, so use this branch's host for matching mobile camera behavior.

Focused verification: `node tests/mobile-visibility-context-recovery.test.cjs --report`. Includes syntax, projection/magnification, PC behavior, actual scope-transition/weapon-framing math, center-ray alignment, persistence, unchanged HUD/gameplay and native bundle pins. Projection output: `docs/MOBILE-VISIBILITY-PROJECTION.json`. This is CPU/source evidence, not rendered or device evidence. At 960x432, a 1.8m target at 25m projects to 21.41px previously, 45.04px hip-fire, 59.03px iron ADS and 90.08px Compact 2x.

Updated Git ignore rules and project instructions for source-only Git milestones, verified pushes and protected artifacts. No APK built or published. No main merge. No Adventure Mode access or changes.

## Recovery gap — do not misrepresent this branch

This repository does NOT contain the approved restored HUD51 styling/source or the original mobile-visibility WIP directory. The supplied recovery working tree was clean at the base commit and still used the later icon-label HUD. The camera work here was reconstructed from recorded development context, not recovered byte-for-byte from the deleted WIP. Its old test results do not transfer to this source; this branch has its own focused evidence.

Owner-accepted HUD51 reference APK SHA-256, from the recorded owner receipt: `ACEA893BB7689A207A46834B58B3DC0E60E8F4E68E06101B566B312C80B617F2`.
Protected historical source fingerprint, from recorded context: `80a6cd49fe1ba36a54edbccfac5600ae450b8a32383a8770475a444c4209b139`.
Those artifacts are NOT verified present in this recovered repository and must not be assumed backed up by this push. Do not invent the original HUD from partial styling notes or claim smooth movement acceptance on this branch.

Next step: obtain the exact accepted HUD51 APK/source from an available independent checkpoint, verify its fingerprint, then selectively integrate only confirmed differences on a dedicated branch. Do not replace current gameplay wholesale. Keep separate Adventure Mode untouched; migrate it only with confirmed complete lineage/assets and explicit integration scope.

## Git workflow and storage

After a meaningful milestone: run focused checks; refresh current source inventories after intentional edits; commit intended source/assets/config/docs; push the development branch; compare `git rev-parse HEAD` with `git ls-remote origin refs/heads/dev/mobile-visibility-context-recovery`. Do not force push or report backup success before remote verification. Use PRs and keep main stable. Production release remains blocked by missing current-candidate runtime/device acceptance.

Retain one working source repository, independent rollback and signing credentials. Exclude caches, toolchains, generated APKs and redundant archives from normal source history. Use explicitly authorized Releases for distributable APKs. Do not delete any local file until the exact cleanup targets are approved. The auxiliary inspection clone created before the recovery path was supplied is redundant; it can be proposed for cleanup only after remote verification and separate approval. No other local cleanup has been authorized or performed.
