# Sightline V3 — HUD51/mobile camera integration

Branch: `integration/hud51-mobile-camera`
Recovery parent: `b0cd2cfb2f127ff5a86781a6ca5ae5661d1beec7`
Current milestone SHA: `git rev-parse HEAD`; delivery report records the verified remote commit.

Active game source now uses the exact recovered HUD51 runtime plus only the preserved mobile projection changes. Approved HUD styling/text controls, movement, animations, combat/respawn/Bomb Defusal/radar fixes and all 99 shared runtime assets are retained. Default mobile FOV is 75 horizontal degrees (65–95 adjustable); relative ADS and weapon framing are corrected without changing desktop defaults or authoritative shots. Original 102 assets remain reconstructable independently from the recovery evidence.

Surviving native project was reused, not represented as original DEX-recovered Java. Protected APK metadata corroborates SDK 26/36, landscape and hardware configuration. Diagnostic LAN network policy was corrected: initWith(debug) did not include debug network resources, and the protected APK also had cleartext disabled. Release policy, WebView allowlist, HostPolicy and explicit bundle pins remain enforced. Comparison app is separate: `com.sightline.v3.diagnostic.visibility`, versionCode 16, label `Sightline HUD51 Visibility WIP`.

BUILD PASSED: one `:app:assembleDiagnostic` using workspace tools only; source gate passed during Gradle. APK: `AndroidProject/app/build/outputs/apk/diagnostic/app-diagnostic.apk`, 15,326,607 bytes, SHA-256 `027e7163cbdefa0893a8b2ef7c0d897498b6372e364f20f3086a461ceb4e4345`. Debug certificate SHA-256: `74516cfda39e6250bf50bedab19fbcaf0d33970db6807ad3ba7888a85f59c041`. The separate package does not replace the protected HUD51 installation or its data. APK remains local and ignored by Git.

Fourteen targeted source/CPU checks passed. All 102 packaged assets, the exact diagnostic HTML transformation, compiled identity/landscape/LAN resources, signature and alignment were verified. Build input inventory was `c10f061f8190c8c260d8c3181fe08b142df6a323e57fa9054ef7bebcdfce2e3d`; subsequent changes add documentation/verification only. See `docs/HUD51-CAMERA-INTEGRATION.md` and its verification JSON for original-versus-reconstructed components and exact evidence.

The owner-approved APK is unchanged: SHA-256 `ACEA893BB7689A207A46834B58B3DC0E60E8F4E68E06101B566B312C80B617F2`. Original editable native workspace/signing identity is not claimed recovered. A new workspace debug key is used only for the separately identified comparison app.

Next: validate this exact comparison APK's actual Android startup, HUD, multitouch, Deploy, camera/ADS, frame pacing during walking, and matching PC-host LAN play. Those remain UNVERIFIED; production release and main merge remain blocked. No personal device/UI or Adventure Mode was accessed, no release published and no duplicate project ZIP created. Continue Git-first milestones and verify remote SHAs. Keep protected artifacts and independent recovery evidence intact.
