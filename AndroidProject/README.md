# Sightline V3 — Android Release Integration SOURCE-ONLY QA

This is a consolidated **source checkpoint, not an APK**, based on the provided Android Optional Update source. The original Windows game and prior Android archives are untouched. The latest locally modified Java sources and release signing material were not supplied, therefore this archive must **not** overwrite a newer working Android project without a controlled merge.

- Package ID: `com.sightline.v3` (unchanged)
- Candidate versionCode: `3` (`0.3.0-integration-qa`), **provisional** until reconciled with previously shipped versions
- Art: original Precision Chevron icon, adaptive/themed/legacy resources, native OS splash and launcher image
- Optional update code: retained, **HTTPS feed disabled by default**, user-controlled and signed APK checks unchanged
- Offline assets: intact; PC-hosted LAN preserved; no Windows/server changes
- Signing: no private keys included/created. Reuse your established release identity; if absent, owner must approve provisioning on their own PC.

Read `BRAND-REVIEW.md`, `INTEGRATION-AND-RELEASE-GATES.md`, `OWNER-ACCEPTANCE.md`, `UPDATE-SYSTEM.md` and `BUILD-ON-WINDOWS.md` in that order.

## Local source QA

```powershell
python qa/check_project.py
python qa/check_brand_integration.py
# JDK 17 required; QA does not compile Android source:
javac -d qa\out app\src\main\java\com\sightline\v3\HostPolicy.java qa\HostPolicyTest.java
java -cp qa\out HostPolicyTest
javac -d qa\out app\src\main\java\com\sightline\v3\UpdatePolicy.java qa\UpdatePolicyTest.java
java -cp qa\out com.sightline.v3.UpdatePolicyTest
```

Build only after successful three-way merge, Android SDK / Gradle installation and owner signing decisions. A true upgrade requires a separately installed v2 app signed with the same key.


See `MILESTONE-RELEASE-GATES.md` for the verified gameplay candidate, official wrapper bootstrap, and blocked Android build/device gates.
