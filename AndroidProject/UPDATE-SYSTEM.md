# Sightline V3 — private, optional, free Android updates

**Status: source implementation / Android build and upgrade testing NOT COMPLETED.** No APK, HTTPS update host, official download link, or signing secret is delivered in this archive.

## Release identity — never change after first shipped release

- App ID: **`com.sightline.v3`**, unchanged from the Android Foundation.
- Version: `app/version.properties`, currently **versionCode 3** / `0.3.0-integration-qa` (provisional; inspect any newer local/shipped version before signing). Use `tools/bump-version.ps1 -VersionName '0.3-...'` **before each later release**. Never reuse or decrease a shipped code.
- Signing: one **private release identity**, created once on the owner's Windows PC with `tools/provision-signing-key.ps1 -CreateNewReleaseIdentity` **only after checking that no earlier release keystore exists**. It is stored by default outside the project at `%LOCALAPPDATA%\SightlineV3\ReleaseSigning\sightline-release.p12`. **Do not upload the keystore or its password to ChatGPT, a repository, or an update website.** Back it up twice to encrypted offline storage, with a separately protected password. Record the public certificate SHA-256 fingerprint. `tools/build-release.ps1` verifies the signed APK and guards against a changed signer fingerprint.
- The **debug signing key is DIFFERENT**. A release APK cannot update a debug-signed install in place without uninstalling. A debug migration and release-to-release upgrade are separate tests; NEVER uninstall an existing installation if saved data matters. Export game settings manually first if a migration is necessary.

## HTTPS release feed — explicit configuration

No domain was supplied, so the update checker is disabled by default. Provision an HTTPS host **under your control** (e.g. a free static-hosting service with HTTPS, using your own project). Upload signed APKs and `version.json` to the **same origin**. Do not use a URL shortener or unsigned third-party mirror.

Set `SIGHTLINE_UPDATE_MANIFEST_URL` at build time (or Gradle `-PsightlineUpdateManifestUrl=...`) to the HTTPS address of `version.json`. Never accept that URL from a web page, intent, URL parameter or untrusted LAN server. The app checks only on user request unless the separate opt-in checkbox is enabled. It does no tracking and does not prevent offline games.

Example manifest layout (illustration only, not a published URL):

```json
{
  "schema": 1,
  "packageName": "com.sightline.v3",
  "versionCode": 3,
  "versionName": "0.3-beta",
  "changelog": "Fix mobile touch controls and improve stability.",
  "apkUrl": "https://updates.example.invalid/sightline/android/Sightline-v3-0.3.apk",
  "sha256": "<64 lowercase hex characters of the EXACT signed APK>"
}
```

Use `tools/publish-manifest.ps1` with the **actual APK**, official HTTPS APK and manifest URLs, and changelog after verifying the signature and Android APK metadata. It creates the manifest file locally; **it does not publish anything**.

## App flow

1. Launcher shows optional Check for Updates (and separate opt-in automatic checks) only when a real trusted feed was compiled into the app.
2. Fetch a size-limited JSON manifest over system-validated HTTPS. No redirects, insecure scheme, foreign host APK or silent background download. Show the new version, changelog and official APK URL.
3. Player chooses **Download & Verify**, or **Later**. Download to private app cache, limit size to 200 MiB, SHA-256 verify entire APK, then verify package ID, higher versionCode, matching versionName and **same installed APK signing certificate**.
4. Player explicitly chooses **Open Android Installer**. Android may request per-app permission for unknown-source installations; the player may deny it. No silent install, accessibility abuse, root permissions, service, external file-manager bypass, or unsafe TLS exceptions. No auto-install after returning from Android Settings.
5. Android itself verifies the APK signature and displays the installation approval. In-place updates with the same app ID/signature retain the app's data partition; **this must be tested on an actual device**.

If offline, the HTTPS server is unreachable, malformed, missing or compromised, update check/download fails closed and Play Offline remains functional. Already-active matches are not interrupted by update dialogs.

**Release safety:** Public Play Store distribution may restrict `REQUEST_INSTALL_PACKAGES`; this source is for direct-sideload private APK distribution only. For Google Play, use Play's update system and comply with store policies instead.

## Windows steps

1. Install Android Studio, SDK 36, JDK 17 and the pinned Gradle dependencies; get a **working foundation APK** first.
2. In a local PowerShell terminal: `powershell -NoProfile -File tools\provision-signing-key.ps1 -CreateNewReleaseIdentity` (only if no prior release key exists). This runs *once*. Keep the password secret and the key backed up.
3. Temporarily set `SIGHTLINE_KEYSTORE_PASSWORD` and `SIGHTLINE_KEY_PASSWORD` in your own shell; do not save in source/config. (PKCS12 commonly uses the same password for both.)
4. Compile release using `tools\build-release.ps1 -ManifestUrl https://YOUR-OWN-HTTPS-HOST/releases/android/version.json`. Verify that the actual `app-release.apk` and certificate fingerprint match the original release identity.
5. Verify and document the SHA-256, APK version metadata and signer with Android SDK `apksigner verify --verbose --print-certs` and `aapt dump badging`.
6. Create the manifest with `tools\publish-manifest.ps1`; host both immutable APK and `version.json` over HTTPS. Publish new manifest **last**, after the APK is available.
7. For every subsequent release bump `versionCode`, use **the same keystore and alias**, and repeat signature/version checks. Never ship an APK signed with Android's debug key.

## Absolutely required real-device update acceptance

See `DEVICE-UPDATE-ACCEPTANCE.md` before allowing tester updates. The delivered source cannot establish in-place update, certificate continuity or settings preservation without Android SDK and a real device/emulator.
