# Sightline V3 Project Instructions

These project requirements supplement the global Codex Engineering Standards. If a project instruction conflicts with the global standards or the user's current request, follow the higher-priority instruction.

## Protected baselines and scope
- Treat the Phase 8 master, the original historical ZIP archives, and the verified Claude v12.8 DEV package as protected recovery sources. Do not overwrite or delete them.
- Make changes in a clearly isolated candidate or working copy. Do not silently turn the independent package extraction into a replacement release.
- Preserve the active Claude v12.8 character baseline and its rollback snapshot. The rejected procedural character merge and rejected Legendary skins are not approved replacements.
- Preserve the clean Phase 19.5 mobile HUD, 28 active firearms, 18 maps, Infection and Outbreak, multiplayer authority, and Android offline/phone-host parity unless the user explicitly scopes a change to them.

## Sightline architecture
- The Android WebView source is under `AndroidProject/app/src/main/assets/`; keep `www` and `phone-host` copies in parity when changing shared gameplay assets.
- The game uses Three.js r128. Keep runtime assets local for offline and phone-host use; do not rely on an external asset server.
- Inspect the real first-person viewmodel, third-person renderer, weapon anchors, animation paths, and relevant asset loading before modifying visual systems. Similar-looking paths may be independent implementations.
- Keep combat statistics, hitboxes, authoritative multiplayer behavior, and weapon timing unchanged unless the task explicitly authorizes gameplay changes.
- Use original or license-verified art assets. Record provenance and license terms for imported third-party models, textures, and audio.

## Acceptance evidence
- Distinguish source-level checks, isolated runtime checks, actual in-game visual checks, Android builds, and physical-device tests. Never present one as proof of another.
- For 3D or UI changes, inspect screenshots from the actual game renderer at relevant gameplay states. Source checks and standalone previews do not establish in-game visual acceptance.
- Report unsupported states as UNVERIFIED or BLOCKED and explain the specific missing check. Production release and promotion remain blocked until their stated acceptance gates pass.
- For Android work, verify asset parity between offline and phone-host trees and report clean-build/device limits separately.

## Lineage ownership and artifact classes
- Establish the feature-owning lineage from project notes, source inventory, and checkpoint ancestry before game-code edits. Keep recovery, gameplay-expansion, Android, and feature branches separate; do not assume a recovery candidate owns Adventure Mode. If ownership is unresolved, do not guess or merge; continue independent safe work and report the missing lineage.
- Runtime unavailability does not end unrelated safe engineering work. Continue source-level implementation and focused checks, while marking actual gameplay/runtime acceptance UNVERIFIED.
- Complete source WIP/checkpoint ZIPs and private PC test packages are permitted after the source manifest, archive contents, path safety, and root `AGENTS.md` have been verified. Mark them `WIP-UNVERIFIED` when gameplay/runtime acceptance is outstanding. These are not releases.
- Private Android debug APKs are permitted after build, package identity, debug signing mode, source/asset integrity, and checksum verification. Real-device/gameplay status remains separate and debug APKs are not production-ready.
- Keep `require-release-acceptance.ps1` fail-closed for production. Test/WIP exceptions must use separate commands and may not weaken production checks. A source-level pointer-lock fix is not gameplay-verified until actual pointer/touch interaction is exercised.

## Principal Game Engineer Protocol
- Before a change, name the authoritative candidate, affected player journey/platforms, dependent systems, acceptance evidence, and rollback point. Avoid repeating reliable checks.
- Implement the complete scoped experience and preserve approved systems. Use focused regression coverage for the changed behavior.
- When an owner reports a gameplay/runtime defect after PASS, investigate the escaped defect and why the earlier verification missed it. Fix the root cause and add a targeted regression test where practical; record unresolved test gaps.
- Report PASS only for executed checks with evidence. Source tests do not establish gameplay, visual, physical-device, or LAN acceptance.
- Track first-pass acceptance and escaped defects through `tools/record-engineering-outcome.ps1`; use `-Summary` for metrics and count only owner outcomes with intact hashed evidence. Do not assume or manufacture a 99% rate.
- Production releases fail closed through `tools/require-release-acceptance.ps1`: `SIGHTLINE.bat release-check`, direct Android Gradle release tasks, the Android release helper, and release-manifest generation all enforce it. A failed, stale, missing, or unverified mandatory gate blocks release. Debug/test builds remain clearly non-production.
- Release evidence must identify the current candidate fingerprint and hash each evidence artifact. After source changes, run `powershell -NoProfile -ExecutionPolicy Bypass -File tools\update-package-content-manifest.ps1` before collecting candidate-specific evidence.

## Persistent project instructions
- Keep this file at the root of every new or extracted editable Sightline DEV project before beginning development.
- Use the workspace helper `tools/preserve_sightline_dev_instructions.py` to prepare missing instruction files and verify project roots and new DEV ZIP packages.
- If an extracted project already has an `AGENTS.md` that differs from this one, preserve it and review both before reconciling. Never replace newer or project-specific rules with an older copy.
- Every newly created DEV ZIP must contain the applicable `AGENTS.md` at the project root, byte-identical to the staged project's file. Verify the archive before delivery.

## GitHub-first checkpoints
- Follow [ACCEPTED-BASELINE.md](ACCEPTED-BASELINE.md) on each development cycle. Preserve the pre-change commit, record affected journeys, and require the source regression job to pass. For performance or touch changes, compare like-for-like traces and keep physical acceptance open until the owner verifies the exact candidate. Use the stable implementation when a verified regression cannot safely be repaired.
- Canonical remote: `https://github.com/Nschess/SightlineV3`. Keep `main` stable; work on dedicated development branches and use reviewed pull requests for substantial integrations.
- After meaningful verified source milestones, commit intended source/assets/configuration/documentation, push the development branch, and compare the exact local and remote commit IDs before calling the work remotely backed up.
- Keep toolchains, caches, logs, generated binaries, redundant checkpoint archives, signing keys and credentials out of Git. Private distributable APKs belong in separately protected artifact storage or an explicitly authorized GitHub Release, not normal source history.
- Do not delete local checkpoints until exact cleanup targets are approved. Protect independent signing credentials and a rollback backup. Adventure Mode remains separate and must not be migrated or merged until its complete source/assets and lineage are confirmed.
- Document missing recovery work honestly. A Git commit or successful push does not prove HUD51 recovery, Android rendering, movement performance or physical-device acceptance.
