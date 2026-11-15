# Gate 3 experimental phone hosting — runtime remains unproven

The native host is **not enabled** in a normal build. Its source is integrated but no `libnode.so`, Node headers or APK are supplied. The experimentally selected runtime is a pinned Node.js Mobile 24.21.0-0 Android Lite community prerelease. This is NOT a certification of its binary or of Samsung compatibility.

Read `GATE3-WINDOWS-SAMSUNG-ACCEPTANCE.md` for the exact one-command Windows installer/build and two-device verification gates. `tools/install-phone-node-runtime.ps1` verifies downloaded runtime/headers with the official published SHA256SUMS, ARM64 ELF/PT_LOAD 16 KiB checks and dynamic dependencies. The Android Gradle build fails closed on a missing or mismatched runtime. Neither source authenticity nor device behavior has been independently verified here.

Do not distribute phone hosting until ARM64 build, APK verification, server boot, real LAN traffic and physical Android acceptance pass. Preserve the included original rollback ZIP.
