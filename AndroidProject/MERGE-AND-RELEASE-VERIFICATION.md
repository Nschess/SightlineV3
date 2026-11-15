# Sightline V3 — Android Final Integration: independent QA checkpoint

**Status: SOURCE INTEGRATED / APK BUILD BLOCKED. Not signed or authorized for public release.**

## Authoritative input / rollback

- User-provided `SightlineV3-LATEST-ANDROID-PROJECT(1).zip`: **386,422 bytes, 39 archive entries**, SHA-256 `66294822b3ea8943e51871f6f903cd555cd5e9fd13317581b144973ef6576ece`. Preserved unchanged outside this source ZIP.
- Earlier branding/update checkpoint: SHA-256 `8db702c51ad9718c63777ca755a50dd3a4056bcbcb845dad9774024e36ff6749`. Treated as a patch donor, **not** the authoritative gameplay/Java baseline.
- Original user baseline `MainActivity.java`: excluded the broken override, as requested. Its `.bak` was *not* copied into the candidate.

## Exact conflicts and selected resolution

1. **Critical Java conflict:** update checkpoint reintroduced `onReceivedError(WebView, WebResourceRequest, android.webkit.WebResourceError)` on `WebViewClientCompat`, which has a final API method. Removed that override from merged source. No speculative replacement was added. Kept the user's working WebView navigation, error handling baseline, offline/LAN code, and rendering process recovery.
2. **App identity:** retained `applicationId`/namespace `com.sightline.v3`, original LAN HostPolicy, all bundled game HTML and 11 JS modules **byte-identical** to the uploaded baseline.
3. **Version:** uploaded source says `versionCode 1`; prior checkpoint says `versionCode 3`. Candidate **provisionally** uses 3 (`0.3.0-integration-qa`). The owner MUST reconcile the largest ever signed or installed code before building any release; there is no evidence a signed v2 exists. Debug-signed installs cannot be assumed upgradable under the release key.
4. **Branding:** migrated selected Precision Chevron launcher, round/adaptive/monochrome icons, Android system splash assets, and short native launcher banner. Original gameplay screens remain unchanged.
5. **Updates:** included optional first-party HTTPS manager/policy, SHA-256, package/version/certificate checks and Android user-approved installer. **No update host is configured**; automatic checks disabled by default. No silent install.
6. **Gradle:** retained baseline `gradle/wrapper/gradle-wrapper.properties` (Gradle 8.13); Android Gradle Plugin 8.13.2 with compileSdk 36 and Java 17. **No genuine wrapper JAR/Gradle executable was available**; `tools/create-genuine-wrapper.ps1` uses a real installed Gradle on Windows to generate all wrapper files. Never fake wrapper JAR.
7. **Signing:** no keystore or release private signing identity found inside either source archive; this does not prove one does not exist on the owner's PC. Do not create any until explicitly approved after searching the owner's secure key backups.

## Release-test evidence

- Current source tests and Java pure-policy unit tests: recorded in `QA-MERGE-RESULTS.json` (see exact pass/fail output).
- No Android SDK, installed Gradle, ADB, or Android device in execution environment; internet/DNS access to Android/Gradle distributions was unavailable.
- **Gradle compile UNTESTED; debug/release APK NOT BUILT; signer/version v2→v3 upgrade UNTESTED; Samsung Android test UNTESTED.** No APK SHA-256 available.
- Brand assets reviewed statically at 32/48/72/96/144/192 pixel icon sizes and mask previews. Appearance inside the actual Android launcher remains UNTESTED.
- Offline WebView/game rendering on Android and PC LAN join remain UNTESTED in the merged app; source asset and security parity only.
- Stable ADS, top-left secondary fire, and upgraded Outbreak presentation remain *separate unfinished gameplay work*; this integration did not invent implementation or pass claims. `zombie-balance.js` keeps standard Outbreak walkers at 100 HP in solo, including later waves. LAN server behavior needs its own runtime checks using Windows host.

## How to finish on Windows (one consolidated acceptance)

1. Make a secure offline copy of the baseline archive and this source; **never upload a release key**. Check currently installed/signed versions and locate any existing keystore/certificate pin on your Windows PC.
2. Install Android Studio SDK 36 / compatible build tools, JDK 17+ (JDK 17 recommended), Gradle 8.13. Run `powershell -ExecutionPolicy Bypass -File tools/create-genuine-wrapper.ps1` if the wrapper files are not present.
3. Run `gradlew.bat :app:assembleDebug` and inspect/resolve real compilation errors. Install debug APK on a spare/uninstalled test device first. Never uninstall a data-bearing build to change signing identities without an explicit migration/backup plan.
4. Provision or reuse **one release-signing identity** only with explicit owner approval. Reconcile versionCode with installed/distributed builds and build two successive release-signed versions with the same certificate. Verify each APK with `apksigner verify --print-certs`.
5. On Samsung Android 16, test installation, launcher/icon masks, immersive landscape, offline matches in all four modes, manual touch Fire+Aim, ADS, LAN PC join on trusted Wi-Fi, app close/reopen and retained HUD/game settings.
6. With official HTTPS feed configured only after checking ownership, test valid optional v2→v3 upgrade without uninstall; reject a wrong hash, package, downgrade and wrong signer; confirm user approval and preserved game data. Run PC LAN host origin/security smoke test.
7. Mark release PASS only after build, installed gameplay, signing and upgrade, and regression evidence from the **exact** final APK. Otherwise BLOCKED.

**No deployment, no signing, no new release APK, and no alteration to the original Windows/Android ZIPs.**
