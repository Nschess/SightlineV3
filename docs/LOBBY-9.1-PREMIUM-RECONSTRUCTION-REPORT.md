# Sightline V3 Lobby 9.1 — Visual Correction Status

**Candidate:** `C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\lobby-ux-9.1-visual-quality-20261107\DEV`  
**Decision:** Corrected source candidate is playable through the existing launch workflow; visual acceptance remains **UNVERIFIED**; package status **DEFERRED**.

## What changed

- Replaced the menu's standalone branded room, circular plinth, extra point lights, and lobby-wide material override. The selected arena stays in the existing Three.js scene.
- The screenshot's clipping came from a 790 px `.mn-panel` inside a 650 px `.mn-main` scroller. Horizontal overflow let focus/scrolling move the entire Play content, cropping the Offline Modes, description, Mission Select, and map labels. The production layout now constrains the context, panels, and children to the main viewport, disables horizontal scrolling there, and resets `scrollLeft` after menu rerenders.
- All five modes now fit without a horizontal carousel: five columns on desktop, three on compact landscape/tablet, and two on narrow screens. The buttons have bounded widths and readable wrapping. Mode selection and locking remain wired to the existing five mode IDs and handlers.
- Replaced the crosshair, target, stopwatch, and gear glyphs with five distinct, original inline SVG marks for Tactical, Free-for-All, Bomb Defusal, Outbreak, and Infection.
- The operator continues to use the actual game's `makeUnit()` and `ensureWorldWeapon()` builders. A single low-intensity, shadowless point fill is attached to the lobby preview model only; existing per-mesh character materials and gameplay rigs remain unchanged. The arena remains the selected map rendered by the game.
- Reframed the existing operator roster around the live 3D preview. Loadout continues to render the actual viewmodel canvas. Existing stored selections, settings, host/join, maps, and gameplay routes are retained.
- Applied matching production changes to Offline and phone-host HTML. Updated the Android host page pin, source inventories, and live-host capture fingerprints.

No combat, AI, weapon, network-protocol, Legendary, or character asset files were redesigned or replaced.

## Verification

| Check | Result |
|---|---|
| Full source regression | **PASS — 289/289 tests across 63 test files** |
| Authoritative combat | **PASS — 8/8** |
| Navigation audit | **PASS — 19 maps, 0 faults** |
| Android asset parity | **PASS — 48/48 phone-host assets; 15/15 shared modules** |
| Production-page inline JavaScript parse and Offline/host shared scene/style integrity | **PASS** |
| Lobby correction source invariants | **PASS — 4/4 focused tests** |
| Static responsive-width checks | **PASS — desktop 5-column, compact 3-column, narrow 2-column rules; panel and tile widths are constrained to the viewport** |
| Rollback checks | **PASS — 7 candidate baseline files; 10 earlier pre-edit files; new 11-file pre-correction checkpoint hash-verified** |
| Offline CMD launcher | **PASS — `SIGHTLINE.bat offline` started the loopback server at 127.0.0.1:8090 and was stopped with Ctrl+C** |
| Phone-host launcher | **BLOCKED — `SIGHTLINE.bat host` reached the candidate launcher, but it refused to bind because port 8080 is already in use. The existing listener was left untouched; no candidate host started.** |
| Phone-host live UI/browser | **UNVERIFIED — no browser page was loaded, and the current candidate was not serving on port 8080** |
| Browser-based production UI run | **BLOCKED — installed Playwright harness has no Chromium executable at its configured path** |
| Actual rendered lobby screenshots/visual review | **UNVERIFIED — no authorized functioning renderer is available here; no screenshots were fabricated** |
| Physical Android, live LAN UI, and current-source APK | **UNVERIFIED** |

The failed browser harness was not repaired or reinstalled. Static checks verify the source constraints, not computed browser DOM geometry or the final rendered appearance. The phone-host check confirms only that this candidate's startup script ran and detected an occupied port; it does not verify the existing listener or this candidate's served page. The fill light is unmeasured on Android hardware.

Static CSS width budget (arithmetic check, not a browser DOM measurement): at 1919 px desktop width the 650 px panel gives five 124.4 px mode cells; at 800×360 landscape the 432 px panel gives three 139.3 px cells; at 390 px narrow width the 362 px panel gives two 178 px cells. Each grid's columns and gaps fit its assigned panel width.

## Source fingerprints

| File | SHA-256 |
|---|---|
| Offline production page | `d17489d3a45e7089a6a71cb2600628ceff02ab40a4c3c0b7c0ea738fc875a4ca` |
| Phone-host production page | `5aa3e4520ea4b306554e9dcb801e2b81bb22f117528181af9060b5a965db4125` |
| Phone-host SHA256SUMS | `b044ab9504540377282b409c7e8739fd4bb5544e2a8d9bab16be0ea3f1f384cd` |
| Android source inventory | `f8acd068b78a744378b6e8264e960e2b9bdf11db7479af83ba07b3292630db1d` |
| MainActivity host bundle pin | `6c989e2c7a180b95bf5da5fd32578d58e9d8b207d8d51cd1e27fe180e18fed8d` |
| Lobby source verifier | `8860dd0d9bcd3f884b2425a2dd6c4b16e31b22aa56669a3b196e893017878c3b` |
| Focused lobby source tests | `3000ff984a16302d0b67b9bea383489f3f3c0e1fe6a7034fc7dc47ef6890fca5` |
| LAN capture fingerprint tool | `47f9b5a65e8afe3b250d695c91b2c6c8fa728b353cc4bf5e58f16d2d70ff1b9f` |

The prior manifest under `acceptance/lobby-9.1-visual-quality/` remains unchanged as historical pre-reconstruction evidence. The new source manifest at `acceptance/lobby-9.1-premium-reconstruction/SOURCE-MANIFEST.json` is bound to this candidate state.

The 11-file pre-correction checkpoint is at `C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\lobby-ux-9.1-visual-quality-20261107\rollback-lobby-visual-correction-2026-11-08` with `ROLLBACK-MANIFEST.json` SHA-256 `88c0ce74908b23142cc6dbbd205b7d13ea2690d8cf9bdcfdb4e78de14f3c3e3b`.

## Owner-controlled preview

From Windows CMD:

```bat
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\lobby-ux-9.1-visual-quality-20261107\DEV"
SIGHTLINE.bat offline
```

Then open `http://127.0.0.1:8090/` yourself. For LAN host preview, run `START-HOST.bat` in the same candidate and use its printed address on your private network. Do not port-forward the development host.

## Gate

The project's `DEV/AGENTS.md` requires actual game-renderer screenshots for UI visual acceptance and says not to package or promote before the stated gates pass (Acceptance evidence, lines 18–21). The candidate source and normal Offline launch path are ready, but **no ZIP was created**. The remaining visual step is to load this candidate on an authorized machine and inspect the Play, Operators, Loadout, Settings, Multiplayer, and landscape views; LAN preview also requires port 8080 to be available. Until then, the user-provided screenshot's defects have source-level corrections but rendered acceptance remains open.
