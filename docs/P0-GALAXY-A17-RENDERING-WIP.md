# Galaxy A17 rendering WIP

**Status:** source change on `codex/sightline-graphics`, based on the verified P0 FPS recovery commit `e8096c7b0230e2e7237998682152590fc6816934`. This is not an accepted device build or release.

## Change

Balanced adaptive rendering above 75 Hz raises its framebuffer ceiling from 950,000 to 1,050,000 pixels in both Android WebView clients. That is 10.5% more pixels, or about 5.1% more linear resolution at the same viewport. It remains below the existing 1,150,000-pixel Balanced ceiling at 60 Hz. The FPS controller, effects-first degradation, later resolution steps, thermal caps, and supported-refresh selection are unchanged.

The P0 baseline already includes the walking-path changes: radar obstacle scans run outside walking frames, low-travel joystick input is restored, and movement is covered across 60, 90, and 120 Hz. This graphics change does not alter movement, hitboxes, combat timing, or multiplayer authority.

## Verification status

Source-level renderer, refresh, walking, bootstrap, GPU diagnostic, and engagement regression tests pass. The integration baseline `724a95dc5fd5f63fe7d3db24369595ad6d4a6a26` is merged into this feature branch; the earlier Graphics commit remains in its ancestry. Asset parity passes for 32 phone-host files and 113 Android source entries. The `navigation.js` sources have identical bytes in the current worktree.

A same-environment run of all 95 test files produced 365 pass / 64 fail on the clean authoritative baseline and 366 pass / 63 fail on this candidate. The failure-title sets matched except that this branch now updates the LAN performance capture tool's stale bundle and host-manifest pins; its 9 focused tests pass. The remaining failures include missing historical rollback fixtures, outdated source-contract assertions, incomplete test harness globals, unavailable JDK 17, and local host socket checks that cannot start in this environment. Their titles and first failure diagnostics were present on the authoritative baseline, so they are assigned to Chat 1 for triage. The renderer and movement checks show no new regression.

An SM-A176B Galaxy A17 running Android 17 was accessible. It reports a 1080×2340 display at 450 dpi and supports 60 Hz and 90 Hz. The candidate APK was not built because this environment has only Android Studio JBR 25.0.3 (the project pins JDK 17) and lacks the required bundled Node runtime library and headers. No candidate gameplay session or sustained performance capture was run. Physical visual quality, frame pacing, memory growth, thermals under load, touch controls, and aiming alignment remain **UNVERIFIED**; device A/B acceptance is required before promotion.

The Engagement prototype commit `ba0dc699c3f1361537dccd8b1507d6b7beb2d131` is not included in this worktree.
