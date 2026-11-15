# Sightline V3 Integrated Release Source Package

This archive contains editable integrated source, runtime assets, build scripts, deterministic tests, and current source-bound acceptance evidence. It is a source package only: it contains no APK, signing credentials, production certificate, or private deployment key.

## Integrity and identity

Run `node tools/verify-source-package.cjs` from this directory to check every listed file, the complete file inventory, Android and host fingerprints, and the blank release-input template. The package manifest intentionally excludes its own hash; its SHA-256 and the ZIP SHA-256 are supplied as sidecars with the release-owner handoff.

`AGENTS.md` is preserved byte-for-byte from the integrated source root. `PACKAGE-MANIFEST.json` records source fingerprints for the Protocol V2 + secure transport + Chat 1 integration descendant. Historical rollback archives and the stale 570-path inventory are not included. See `acceptance/RELEASE-OWNER-HANDOFF.md` and `acceptance/INHERITED-PACKAGE-INVENTORY-AUDIT-2026-11-02.json` for disposition and acceptance gates.

## Local verification

```text
node tools/verify-source-package.cjs
node tools/run-package-regressions.cjs
node tests/phase6-source-manifest.cjs
node tests/phase2-android-asset-parity.mjs
node tests/authoritative-combat.mjs
node tests/map-bot-navigation-audit.cjs
```

The automated tests are source/runtime simulations. They do not prove live LAN/WSS, Android device startup, WebGL rendering, or human visual acceptance.

## Android build prerequisites

Use JDK 17, the included Gradle 8.13 wrapper, Android Gradle Plugin 8.13.2, Android SDK Platform 36, and Android Build Tools 35.0 or later. The first build also needs access to the pinned AndroidX and Gradle dependencies unless they are cached. Use `AndroidProject/BUILD-ON-WINDOWS.md` for the debug build command. The package was not compiled here.

The optional Android phone-host build is not ready: its verified ARM64 `libnode.so`, matching Node headers, and runtime lock file are absent. Do not set `-PenableLanHost=true`. Normal offline/game-client builds keep that feature disabled.

## Secure release inputs

`config/release-inputs.template.env` lists required input names and contains no values. Populate deployment values only in an approved external secret store. TLS release hosting requires a CA-trusted certificate with a DNS SAN matching the approved FQDN, its matching protected private key, a local private IPv4 bind, and port 8080. Android release signing requires the existing authorized signing credential. No insecure downgrade or certificate-validation bypass is permitted.