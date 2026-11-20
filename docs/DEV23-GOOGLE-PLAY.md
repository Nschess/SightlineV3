# Google Play release preparation

DEV23 prepares the Android bundle path from DEV22. Production and Play test-track uploads remain gated on current-candidate evidence and owner approval.

## Candidate packaging

- Play identity is `com.sightline.v3`, version `0.3.4` (code 18), with minimum API 26 and target API 36. Confirm ownership of this package in Play Console and advance the code beyond every previously uploaded artifact before the first new upload.
- The Play app uses bundled game assets offline and supports joining an approved TLS host. The private diagnostic build retains phone hosting, cleartext local development, capture and sideload features under its separate identity. Confirm secure join, Match Rules and gameplay on the accepted Play candidate before describing multiplayer in the listing.
- Use JDK 17 and Android SDK 36 with the pinned Gradle wrapper. Once the release gate passes, run `AndroidProject/tools/build-play-bundle.ps1` with `-TlsHost`, `-PrivacyPolicyUrl`, `-BundletoolJar`, `-BundletoolSha256` and `-UploadCertificateSha256`. Supply the registered upload key using process-scoped `SIGHTLINE_KEYSTORE_PATH`, `SIGHTLINE_KEYSTORE_PASSWORD`, `SIGHTLINE_KEY_PASSWORD` and `SIGHTLINE_KEY_ALIAS` from approved secret storage.
- Register the upload certificate in Play App Signing. Verify Play's separate app signing certificate for distributed installs and retain a protected upload-key recovery copy. [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
- The helper validates bundle structure, identity, upload signature, manifest restrictions and SHA-256 for both packaged game asset trees. The current Play profile excludes the native Node host and expects no native libraries. Verify that expectation on the built bundle. If native libraries become necessary, check supported 64-bit ABIs, ELF and ZIP alignment, and 16 KB runtime compatibility against the distributed build. [Android 16 KB guidance](https://developer.android.com/guide/practices/page-sizes)

## Data Safety, App Content and privacy drafts

These are source-backed draft responses for the **Play edition**. Confirm each against the signed candidate and deployed service before submission. The private diagnostic package is separate.

| Question | Draft response and evidence |
| --- | --- |
| Local settings and saves | **On-device only** for settings, offline profile/customization, controls, history and records that are never sent. The bundled [client](../AndroidProject/app/src/main/assets/www/index.html) uses WebView localStorage. [Native preferences](../AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java) store last private LAN address and optional update settings on applicable development paths. The client stores the last nickname and host preference by WebView origin. The [manifest](../AndroidProject/app/src/main/AndroidManifest.xml) sets backup off. Verify device-transfer behavior. An uninstall or Android Clear storage removes the app's retained local data. |
| Nickname and session | **Optional off-device processing · app functionality.** The WSS hello sends the chosen nickname, protocol and feature information. The [host](../AndroidProject/app/src/main/assets/phone-host/server.js) assigns a per-connection session token, keeps player and role state in memory, and broadcasts visible names and match progress to participants. Review nickname under the applicable personal-info type, potentially **Name** or user identifier depending on use. Distinguish a session token from an account or stable device identifier. |
| Activity and network data | **Optional off-device processing · app functionality.** The approved host receives the source IP, normal connection metadata, timing, gameplay inputs, actions and choices shown in the match. Review **App interactions** and the actual use of IP/session fields against Google's data types. No source evidence of GPS, IP-based geolocation, precise location, or an advertising identifier. Peers receive data relayed by the host. TLS terminates at the host, so this is encryption in transit and the host can read the payload. |
| Sharing and retention | Existing source supports app functionality and memory-resident match processing. It does not prove that all deployed processing is ephemeral or exempt from sharing disclosure. Determine whether the legal publisher, host operator and any contracted processors are separate. Confirm peer visibility, user-initiated share/copy behavior, operator logging, DNS/proxy logs and deletion. Report even ephemeral off-device data in the form as required. Evaluate the user-initiated sharing exception for each transfer with the counsel-approved facts. Until then, avoid a blanket “no data collected or shared” response. |
| Local network and diagnostics | Play uses the configured HTTPS status endpoint and WSS on port 8080 after user confirmation. Play has no private UDP discovery or phone host flow. The diagnostic build can send subnet discovery requests, run a local host and optionally export reports via the system document picker. Reports can contain host address, timestamps and performance data. The production host keeps readiness fields available to joins and limits detailed server metrics to loopback. Release joins omit verbose Android readiness errors; secure host routine connection logs omit player nicknames. Verify actual host retention and deployment logging. |
| Dependencies and external services | The [resolved Play inputs](../AndroidProject/app/play-packaging/RUNTIME-DEPENDENCIES.txt) include AndroidX WebKit/Core and supporting libraries. The reviewed runtime inputs and app code show no ad, billing, account or analytics SDK integration. Android supplies the WebView provider. No app-managed analytics or support uploads were identified. The user-initiated privacy link opens an external browser. Verify final merged permissions, SDK/provider traffic, secure host routing and policy-site data behavior on the accepted build. |
| Ads, purchases and accounts | Source-backed draft **No ads**, **No real-money in-app purchases**, **No account creation**. Buy and credits are match mechanics. Confirm the final listing, distribution configuration and runtime. A publisher should not claim a global delete-data mechanism until its deployed host and support processes are in place. |
| IARC and intended audience | Report firearms and melee combat, character and infected depictions, and multiplayer interaction and chosen names. The reviewed protocol exposes no text or voice chat action. Owner must confirm representative violence, blood/gore intensity, and all interactions against the final build, choose intended age groups, and answer IARC. The resulting rating is assigned through IARC. Document app access instructions for the secure match environment and review Families requirements if any selected audience includes children. |

Owner actions before final submission:

1. Identify the publisher, privacy contact, host and site operators, service providers and the supported rollout regions. Record actual deployment traffic, what peers see, and retention/deletion for the host, any proxy and the policy site. Retest data behavior on the signed candidate.
2. Publish and verify a globally accessible HTML privacy page under an approved HTTPS URL. Supply the same URL to the build and Play Console. Verify the in-app link, normal TLS validation and user choice to stay offline.
3. Approve the resulting Data Safety answers, IARC questionnaire, intended audience, ads and purchase declarations, and Play reviewer access. No forms have been submitted. Record distribution rights and notices independently.

[Policy draft](DEV23-PRIVACY-POLICY-DRAFT.md) · [Google Play User Data](https://support.google.com/googleplay/android-developer/answer/10144311) · [Data Safety instructions](https://support.google.com/googleplay/android-developer/answer/10787469) · [IARC requirements](https://support.google.com/googleplay/android-developer/answer/9859655) · [Target audience and app content](https://support.google.com/googleplay/android-developer/answer/9867159)

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
- [x] Align the release gate with the public source inventory. Historical acceptance documents remain available in the full local inventory, and release evidence must still match the public candidate fingerprint.
- [ ] Obtain authorization before uploading the accepted candidate for Play testing. Review Play pre-launch findings and closed-test feedback before requesting production approval.
