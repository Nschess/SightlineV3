# Galaxy A17 rendering WIP

**Status:** source change on `codex/sightline-graphics`, based on the verified P0 FPS recovery commit `e8096c7b0230e2e7237998682152590fc6816934`. This is not an accepted device build or release.

## Change

Balanced adaptive rendering above 75 Hz raises its framebuffer ceiling from 950,000 to 1,050,000 pixels in both Android WebView clients. That is 10.5% more pixels, or about 5.1% more linear resolution at the same viewport. It remains below the existing 1,150,000-pixel Balanced ceiling at 60 Hz. The FPS controller, effects-first degradation, later resolution steps, thermal caps, and supported-refresh selection are unchanged.

The P0 baseline already includes the walking-path changes: radar obstacle scans run outside walking frames, low-travel joystick input is restored, and movement is covered across 60, 90, and 120 Hz. This graphics change does not alter movement, hitboxes, combat timing, or multiplayer authority.

## Verification status

Source-level renderer, refresh, walking, bootstrap, GPU diagnostic, and engagement regression tests pass. The integration baseline `724a95dc5fd5f63fe7d3db24369595ad6d4a6a26` is merged into this feature branch; the earlier Graphics commit remains in its ancestry. Asset parity passes for 32 phone-host files and 113 Android source entries. The `navigation.js` sources were identical after newline normalization; the worktree copy was normalized to LF and the parity check now passes. The full 95-file repository test sweep has 64 failures, including missing historical rollback fixtures, stale source snapshots, and platform/environment-dependent checks. Focused Graphics and parity checks pass. Physical Galaxy A17 rendering, frame pacing, memory, thermal behavior, screenshots, and sustained gameplay remain **UNVERIFIED**; the pixel-budget increase needs device A/B acceptance before promotion.

The Engagement prototype commit `ba0dc699c3f1361537dccd8b1507d6b7beb2d131` is not included in this worktree.
