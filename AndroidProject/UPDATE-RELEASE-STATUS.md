# Sightline V3 — release integration checkpoint

**Verdict: SOURCE-INTEGRATION QA, NOT AN APK RELEASE.** This checkpoint is based on the provided Android optional-update project. The latest locally patched Java files, any previously installed signed APK, and release credentials were not available. Do not overwrite those local files until a three-way merge is reviewed.

- package `com.sightline.v3`: unchanged
- versionCode: **3** in this *source-only candidate*, advanced from supplied code 2; compare with the **highest actually shipped/installed** versionCode before any release build
- brand: Precision Chevron original vector art, adaptive icons, monochrome, all legacy densities, native splash theme, launcher header
- update feed: disabled by default, no official HTTPS endpoint configured
- signing key: NOT created, NOT stored here; preserve existing owner's private keystore and pinned certificate fingerprint
- core game assets: unchanged from the supplied Android optional-update archive
- Android compilation and v2-to-v3 in-place upgrade: not performed in this environment
- device UI, permissions, and data persistence: physical Samsung acceptance required
- older debug-signed installs must not be silently replaced or uninstalled

Consult `INTEGRATION-AND-RELEASE-GATES.md`, `BRAND-REVIEW.md`, and `OWNER-ACCEPTANCE.md` before attempting any release.
