# Sightline V3 — Lobby 10 (v10) — merge-ready release

Status: **DEV / experimental.** Verified in Chromium (software GL) only. **No physical Android or LAN acceptance test has been run**; do not describe it as device-accepted.
This release contains only the final state (v10). Earlier iterations (v1–v9) are superseded.

## What it is
A UI-only revamp of the main menu / lobby: game-style Play screen (big mode title, plain mode list, map card, slanted DEPLOY with real rounds/skill label), skewed top bar with real Offline/LAN pill, per-mode accent colour, ambient + UI sound toggle, match-found transition, first-run intro, Loadout / Operators / Rules / Maps / Multiplayer / Settings restyled to match, pause/result titles preserved. Offline and LAN only: no XP, store, accounts or online counts.

## Files changed vs the original package (7 + sources)
- `AndroidProject/app/src/main/assets/www/index.html`  (patched)
- `AndroidProject/app/src/main/assets/phone-host/index.html`  (patched, same lobby code)
- `AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java`  (only the pinned `HOST_BUNDLE_SHA256` value changed)
- `AndroidProject/app/src/main/assets/phone-host/SHA256SUMS`  (new hash for phone-host/index.html)
- `AndroidProject/CURRENT-SOURCE-SHA256.txt`, `PACKAGE-SHA256-MANIFEST.txt`  (refreshed)
- `LOBBY-10-CHANGES.md`  (new: per-version change + rollback notes)
- `lobby-10/`  (new: the sources and build scripts that generate the two index.html patches)
Not touched: `AGENTS.md`, `tests/`, `tools/`, `docs/`, anything for Expansion 8.2 / Bomb Defusal 8.3 logic.

## Game-code touch points (everything else is added CSS/JS/HTML)
- idleCamera: one-line lobby-only sway (honours reduced motion)
- loadout finish markup: 3 small string edits (legendary class, finish id, share button)
- renderBody: scroll preservation
- feature block appended inside the main closure, wrapped in try/catch (`slFeatErr`), plus a `lobbyPreviewUpdate` wrapper (stage, off by default)

## How to merge
1. Copy `changed-files/` over the repo root (same relative paths), **or** apply `patches/*.patch` with `patch -p1` from a tree identical to the original package.
2. If `main` has moved (e.g. Codex edited `index.html`): do not overwrite. Re-run the builder against main's `index.html`: edit the three absolute paths at the top of `lobby-10/apply.py` and `lobby-10/build.py` (they currently point at /home/claude/...), run `python3 -I build.py && python3 -I apply.py`. apply.py asserts its anchors and fails loudly if main's markup differs.
3. Re-pin after any change to either index.html: `HOST_BUNDLE_SHA256` in MainActivity.java (appears **3 times** — see below), `phone-host/SHA256SUMS`, `CURRENT-SOURCE-SHA256.txt`, `PACKAGE-SHA256-MANIFEST.txt`. Keep CRLF line endings in those files (the original uses them).
4. Run `node tests/phase2-android-asset-parity.mjs` (expect 5 PASS).

## Rollback
Restore the 6 patched/refreshed files from main's previous commit and delete `lobby-10/` and `LOBBY-10-CHANGES.md`. Nothing else depends on them. Soft rollbacks: localStorage `sl-ambient`=off silences ambient sound; `sl-stage` is off by default.

## Tests run (all on the final build)
- asset parity: 5/5 PASS; no page errors in any flow
- Play flow: mode switch updates title/label/accent, Q/E/R keys, match-found then deploy, pause (via menu button) shows PAUSED/Resume/Restart/Quit
- Routes render: Loadout, Operators, Rules, Maps, Multiplayer, Settings
- first-run intro; sizes 1920x1080, 1280x720, 844x390, 390x844 (Play screen)

## Known issues / not verified
- **Pre-existing, not mine:** `MainActivity.java` declares `HOST_BUNDLE_SHA256` three times in the original package (looks like a copy/paste error; likely a compile error). Left as-is; fix separately.
- Baseline test failures that also fail on the original: `mp-protocol-v2-security` #6, `secure-transport-policy` (missing fixture).
- Not verified: real Android device/GPU; real audio output (checked with an AudioContext spy); desktop Esc pause (needs real pointer lock); LAN-connected visuals; Loadout finish chips and Operators bottom area; portrait for Loadout/Operators/Rules/Maps/Multiplayer/Settings.
- Settings slider value labels (72°, 100%) sit under the slider's left end (cosmetic, pre-existing).
- Fonts are a system condensed stack (no font file bundled); look varies by device.
- Loadout/Operators restyle uses `:has()`; on older WebViews they keep the previous look.
