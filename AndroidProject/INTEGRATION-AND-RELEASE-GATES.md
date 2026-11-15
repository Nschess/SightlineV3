# Sightline V3 — Android integration gate report

## Baseline, scope and blockers

- Supplied Android Foundation archive: original 32-file source; no compiled APK.
- Supplied optional-update project: 45-file source project, optional trusted-HTTPS updater; Android build not yet performed.
- Separately patched **latest Android Java project / installed APK**: **NOT SUPPLIED**. Do not assume these files are current; do not overwrite local Java changes, orientation fixes or working APK without comparison.
- Owner's historical rollback ZIPs were not modified. No `*.jks`, `*.p12`, `*.keystore`, password, private certificate, official manifest host or user-approved signing-provisioning action was supplied. **No key was generated**.
- Supplied Windows 507-file game archive remains unchanged. Android WebView offline assets have byte-identical JS and HTML to the supplied optional-update version.

## Actual source changes in this checkpoint

- `com.sightline.v3` unchanged. Source-only **provisional** `versionCode=3`, up from supplied `2`, versionName `0.3.0-integration-qa`. Before release compare with *highest previously distributed versionCode*; if local version is 3+ this provisional code is not sufficient.
- Added original chevron adaptive/icon/themed/legacy artwork and native OS splash theme, revised launcher header and app label.
- Retained existing `UpdateManager`, `UpdatePolicy`, FileProvider, HTTPS rules, SHA-256, package/version/signature validation, user-approved Android installer; no LAN/server/gameplay changes.
- `tools/build-release.ps1` permits a blank manifest URL so an official-feed-free release build can keep update checks disabled; it still refuses missing signing credentials.
- No new runtime dependencies, telemetry, advertisements or user accounts.

## Mandatory release gate matrix

| Gate | Evidence | Status |
|---|---|---|
| Original archives intact | SHA-256 source archive checks, file-level comparison | PASS (supplied files) |
| Safe integration into supplied optional-update project | Original 45 files retained; approved Java/Manifest/theme/version modifications | PASS (this source copy) |
| Merge with *latest locally patched* Android project | Latest local Android files unavailable | **BLOCKED** |
| Branding resources | XML, PNG dimensions, density files, adaptive masks and alpha checks | PASS (static only) |
| Update policy | Java `UpdatePolicyTest` / `HostPolicyTest` | PASS (when executed, see QA record) |
| Offline/PC LAN game unchanged | asset hashes, Android source contract | PASS (source check only) |
| Existing signing identity preserved | no keystore present or inspected | **UNTESTED** |
| Android `assembleDebug` / `assembleRelease` | Android SDK + Gradle unavailable in environment | **BLOCKED** |
| App starts in immersive landscape, splash/masks render | no APK/device runtime | **UNTESTED** |
| `versionCode` upgrade v2 → v3, original data retained | requires same release signer and physical Samsung install | **UNTESTED** |
| Invalid/wrong-signer APK rejection | static policy exists; installer/device not exercised | **UNTESTED (runtime)** |
| Physical offline & LAN gameplay, saved settings | no physical Android access | **UNTESTED** |
| Public Android release or controlled APK beta | signed/installed binary not verified | **BLOCKED** |

**Verdict: SOURCE-INTEGRATION QA CHECKPOINT ONLY.** No APK produced. Do not present this archive as an installable release candidate or claim an Android v2 → v3 successful update.

## Conflicts to reconcile with owner before signing

1. Copy/point to latest *working* project on Windows. Run `tools/audit-local-project.ps1 -LocalProjectRoot 'C:\...\YourAndroidProject'`. Examine differences in `MainActivity.java`, `AndroidManifest.xml`, `app/build.gradle`, `app/version.properties` and resources. Never automatically replace these files.
2. Carry only UpdateManager/Policy and update-related UI into that newer project with a reviewed merge, plus new branding resources. Preserve newer Java fixes, lifecycle/landscape gameplay, settings, permissions and LAN origin policy.
3. Locate an already-established **release signing** identity on the owner's PC (not debug key). Record public certificate fingerprint, no key/password uploads. Require explicit owner's approval to create a new release identity if none exists; preserve prior users/data migration expectations.
4. Compare actual installed/distributed versionCode; strictly increment, then build signed v2/v3 pair only if v2 is a legitimate same-key release and a test phone is available.
5. Leave HTTPS update checks disabled until an official owner-controlled HTTPS manifest and corresponding signed APK are available.
6. Compile exact merged project, inspect `apksigner`/`aapt`, install without uninstall, confirm data retention, complete offline/LAN smoke and real device screenshots; only then assess a controlled APK beta.
