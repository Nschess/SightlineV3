# Google Play release preparation

DEV23 prepares the Android bundle path from DEV22. Production and Play test-track uploads remain gated on current-candidate evidence and owner approval.

## Candidate packaging

- Play identity is `com.sightline.v3`, version `0.3.4` (code 18), with minimum API 26 and target API 36. Confirm ownership of this package in Play Console and advance the code beyond every previously uploaded artifact before the first new upload.
- The Play app uses bundled game assets offline and supports joining an approved TLS host. The private diagnostic build retains phone hosting, cleartext local development, capture and sideload features under its separate identity. Confirm secure join, Match Rules and gameplay on the accepted Play candidate before describing multiplayer in the listing.
- Use JDK 17 and Android SDK 36 with the pinned Gradle wrapper. Once the release gate passes, run `AndroidProject/tools/build-play-bundle.ps1` with `-TlsHost`, `-BundletoolJar`, `-BundletoolSha256` and `-UploadCertificateSha256`. Supply the registered upload key using process-scoped `SIGHTLINE_KEYSTORE_PATH`, `SIGHTLINE_KEYSTORE_PASSWORD`, `SIGHTLINE_KEY_PASSWORD` and `SIGHTLINE_KEY_ALIAS` from approved secret storage.
- Register the upload certificate in Play App Signing. Verify Play's separate app signing certificate for distributed installs and retain a protected upload-key recovery copy. [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
- The helper validates bundle structure, identity, upload signature, manifest restrictions and SHA-256 for both packaged game asset trees. The current Play profile excludes the native Node host and expects no native libraries. Verify that expectation on the built bundle. If native libraries become necessary, check supported 64-bit ABIs, ELF and ZIP alignment, and 16 KB runtime compatibility against the distributed build. [Android 16 KB guidance](https://developer.android.com/guide/practices/page-sizes)

## Data Safety and rights inventory

| Area | Source evidence and outstanding verification |
| --- | --- |
| Offline storage | Game settings, player profile and records are stored locally in WebView storage and Android preferences. Bundled content uses the WebView's virtual app-assets origin. Verify storage and backup behavior on the accepted build. |
| Multiplayer | Optional HTTPS status and WSS gameplay traffic go to the configured host on port 8080. The host can receive connection metadata, chosen name, appearance and session/gameplay events. Confirm the operator, recipient and peer visibility, logs, processing purposes, retention and deletion before answering Data Safety. |
| Permissions and SDKs | The source declares network access and AndroidX Core 1.16.0 and WebKit 1.15.0. Android supplies the WebView provider. Review the resolved release dependency graph, merged permissions and observed network traffic. The reviewed direct dependencies contain no ads, analytics, accounts or billing SDK. Verify the final conclusion before making declarations. |
| License evidence | Bundled Three.js r128 has an MIT notice. Preserve it and verify AndroidX and resolved transitive notices. Node Mobile belongs to the private host profile. Record ownership or distribution permission for game art, icons, maps, weapons, models, audio, music and listing assets. Review [theme provenance](SIGNATURE-THEME-PRODUCTION-BLOCKER.md) with the owner. |

Finalize the [privacy draft](DEV23-PRIVACY-POLICY-DRAFT.md) and use verified runtime and host evidence to complete Data Safety. Complete the IARC questionnaire for firearms, fictional combat and infected enemies. Verify multiplayer user interaction and names, and use the owner's documented intended audience for the target audience declaration. Confirm ads and purchase declarations against the exact Play candidate. [Play Data Safety requirements](https://support.google.com/googleplay/android-developer/answer/10787469)

## Store listing draft

- Name — Sightline V3
- Short description — Tactical action with offline matches and configurable touch controls.
- Full description — Choose an arena and configure the match rules in Sightline V3. Play tactical action matches offline with landscape touch controls, and adjust audio and graphics in Settings.
- Prepare a 512 × 512 icon, 1024 × 500 feature graphic and at least two screenshots of the accepted Android build. Capture landscape gameplay and menus on supported devices and add accurate alt text. Use rights-cleared art. Supply a support email and public privacy URL. [Listing requirements](https://support.google.com/googleplay/android-developer/answer/9859152) · [Preview asset specifications](https://support.google.com/googleplay/android-developer/answer/9866151)

## Release blockers

- [ ] DEV20 physical Android ↔ Windows LAN results in both diagnostic host directions, plus Play secure-join and Match Rules acceptance with the configured host.
- [ ] DEV21 visual clarity, touch response, frame pacing, memory and thermal behavior on supported physical devices.
- [ ] DEV22 startup, offline play, landscape sizing, settings persistence, pause/resume, audio and connection recovery across supported devices and WebView providers.
- [ ] Confirm TLS deployment and data handling. Finalize rights, privacy policy, Data Safety, ratings, audience, ads and listing assets.
- [ ] Verify Play identity, version and signing registration. Pass the repository acceptance gate, then run the signed AAB and package checks. Bind evidence to the candidate and artifact fingerprints.
- [ ] Reconcile the release gate's package inventory with the public source manifest. The gate currently flags the local manifest sidecar and historical acceptance documents excluded by the public manifest generator. Preserve the historical evidence and all mandatory release checks.
- [ ] Obtain authorization before uploading the accepted candidate for Play testing. Review Play pre-launch findings and closed-test feedback before requesting production approval.
