# Sightline V3 Premium Visual Polish — 2026-11-08

## Status

**Presentation-only implementation complete in a separate DEV descendant. Focused verification passes. Rendered visual behavior remains UNVERIFIED.** The three visual outputs supplied with this handoff are generated previews from existing Lobby 9.1 production captures; they are not gameplay screenshots.

## What changed

- Updated the same lobby presentation stylesheet in Offline and phone-host production pages: scene tint/depth gradients, clearer charcoal/slate surfaces, ivory text, teal selection, amber Deploy, consistent focus and hover feedback, and touch-sized controls.
- Refined the Squad Bay five-mode rail to keep all modes visible at desktop/tablet/mobile breakpoints without a horizontal mode carousel. Mode colors and hierarchy remain restrained and readable.
- Replaced the mode glyphs with a cohesive Sightline set: shield formation for Tactical, separated combatants for FFA, charge device for Bomb Defusal, claw slashes for Outbreak, and an infected-cell symbol for Infection. Replaced the Settings gear with a control-rail glyph.
- Applied the same styling treatment to Operations Table, Bomb A/B plan, Armory Ready Room, Operators roster, Settings rows, and navigation.
- Kept the existing map, selected operator, weapon preview renderer, roster entries, controls, saved preferences, and game logic. **No character or weapon model, material, rig, pose, animation, combat, map, or network source was edited.**
- Used CSS gradients and inline SVG only; no new runtime dependency, remote asset, blur filter, or expensive scene effect was added.

## Files changed

Relative to the preserved pre-polish candidate `work/lobby-ux-9.1-visual-quality-20261107/DEV`: 7 existing files changed, 1 new utility added, 0 files removed.

1. `AndroidProject/app/src/main/assets/www/index.html` — Offline lobby styles and custom icons.
2. `AndroidProject/app/src/main/assets/phone-host/index.html` — matching phone-host styles and icons.
3. `tools/sightline-premium-lobby-spaces.css` — shared presentation source.
4. `tools/apply-premium-visual-polish.mjs` — applies the shared CSS and SVG changes to both pages.
5. `tests/premium-lobby-experiences.test.cjs` — focused icon, parity, layout, and touch-target assertions.
6. `AndroidProject/app/src/main/assets/phone-host/SHA256SUMS` — refreshed phone-host page inventory.
7. `AndroidProject/CURRENT-SOURCE-SHA256.txt` — refreshed Android source inventory.
8. `AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java` — refreshed pinned host-page hash only.

The last three entries are Android integrity metadata/pinning; they do not change native behavior. The untouched source candidate remains at `work/lobby-ux-9.1-visual-quality-20261107/DEV`. Its baseline source manifest is preserved beside this DEV as `PRE-POLISH-BASELINE-MANIFEST.json` and `.sha256`; its manifest SHA-256 is `69135d575e935ead99b8b933ddbab4e179947944ec0fae0a375dee6dfeaf0fdb`. Project `AGENTS.md` is present in the new DEV root with SHA-256 `df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2`.

## Verification

- Focused UI tests: **12/12 PASS** (`node --test tests/premium-lobby-experiences.test.cjs tests/lobby-9.1-command-lobby-source.test.cjs`).
- Offline and phone-host production script parse checks: **PASS**, one inline classic script per page.
- Shared lobby CSS and live operator-stage parity: **PASS**.
- Android host page pin, 112 Android source inventory entries, and 48 phone-host inventory entries: **PASS**.
- No Legendary-named source path changed; no baseline file was removed.
- Full regression suite, APK/device acceptance, live LAN, and rendered visual inspection were not run for this presentation-only task.

## Visual outputs and remaining gate

Generated previews are shown separately in the task response and labeled `VISUAL PREVIEW — NOT GAMEPLAY`. They reuse existing Lobby 9.1 production captures as visual references but do not prove how the updated pages render. A browser preview was not retried; the earlier isolated Offline preview was blocked by port 8090 already being occupied. Therefore clipping, actual color appearance, and real-device layout remain visually **UNVERIFIED**.

The candidate is available for manual review through the normal workflow from this DEV root:

```bat
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\lobby-premium-visual-polish-20261108\DEV"
SIGHTLINE.bat offline
```

This command was not run here. No DEV ZIP was created. Review the live Offline page and the phone-host page before claiming visual acceptance or packaging. The existing pre-polish candidate and original rollback remain untouched.
