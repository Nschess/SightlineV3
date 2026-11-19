# Sightline diagnostic signing and migration

The DEV24.0 Actions APK used package `com.sightline.v3.diagnostic.visibility` and certificate SHA-256 `6558b1ab0edf277ed804c7733dd6f7bf2d57da167599ba15767883c48e580117`. Its workflow used the hosted runner's default debug signing and retained the APK and fingerprint. The original private key was never retained by that workflow.

**Keep DEV24.0 installed.** Verify the new APK against `diagnostic-build.txt`, then install **Sightline Acceptance** alongside it. Its package is `com.sightline.v3.diagnostic.acceptance`. On an already authorized ADB connection, `adb install -r sightline-lan-acceptance.apk` installs the new app and works for subsequent updates signed by the same acceptance key with an equal or higher version code. The old app remains a rollback and data source. [Android update requirements](https://developer.android.com/google/play/app-updates)

## Optional offline settings and records transfer

1. On the existing diagnostic, open the bundled offline game and stay at the lobby. With an owner-authorized USB debugging connection and WebView 113 or newer, open `chrome://inspect/#devices` on Windows Chrome and inspect the old diagnostic's offline WebView. Confirm its URL is `https://appassets.androidplatform.net/assets/www/index.html`. [Debugging Android WebViews](https://developer.android.com/reference/android/webkit/WebView#setWebContentsDebuggingEnabled(boolean))
2. Run the bundled `diagnostic-storage-transfer.js` in that WebView's DevTools Console. Then run `copy(JSON.stringify(sightlineSaveTransfer.export()))` and save the copied JSON locally. Keep the file private.
3. Open the **new** Sightline Acceptance app at its offline lobby and inspect that app's WebView. Run the same transfer script, then run `sightlineSaveTransfer.restore(/* paste the saved JSON object here */)`. Reload the WebView and verify your settings, loadout and offline records. Retain DEV24.0 and the backup until you have confirmed the result.

Transfer covers the reviewed offline preferences, controls, cosmetics and local records. LAN-origin details, active matches and other application-private data stay with the old installation. If the old WebView is unavailable for inspection, keep DEV24.0 intact and use the new app alongside it.

## Maintaining the acceptance identity

- The Actions job requires `SIGHTLINE_DIAGNOSTIC_KEYSTORE_B64` and `SIGHTLINE_DIAGNOSTIC_KEYSTORE_PASSWORD` from repository secrets. It verifies the certificate before packaging and verifies the APK afterward.
- Certificate SHA-256 is `772e5f251ec7eae3d2ece447869be0bd9e28e2a79f947befa1c226aa4fd7acc3`. Keep this key and the acceptance package ID for future updates. Maintain the encrypted recovery copy outside Git.
- Physical-device installation and transfer remain to be verified. Use the existing DEV24 acceptance sequence for graphics and LAN evidence.
