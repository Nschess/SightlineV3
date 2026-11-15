# Lobby 10 premium menu (DEV, source-only)
Changed: www/index.html and phone-host/index.html (kept in parity), MainActivity.java HOST_BUNDLE_SHA256 pin, phone-host/SHA256SUMS, manifests.
- One final CSS layer `sightline-lobby-10-premium` (source: lobby-10/, includes v2 polish: chamfered cards, per-mode colour, entry animations, glowing DEPLOY; all disabled under prefers-reduced-motion).
- Play panel HTML: #mode-brief and the deploy row are wrapped in `<aside class="lobby-deploy-card">`. All ids unchanged.
- renderBody now also preserves #pn-dyn scroll position (panel is the scroller).
- No gameplay, renderer, protocol, LAN or asset changes. AGENTS.md untouched.
Verified: source parity test, 48/48 host hashes, Chromium (SwiftShader) screenshots at 1920x1080, 1280x720, 844x390.
UNVERIFIED: Android build, physical device, real-GPU rendering, in-match pause menu state visuals.
Pre-existing failures on baseline too: mp-protocol-v2-security #6, secure-transport-policy (missing fixture).
Rollback: restore the two index.html files, MainActivity.java and SHA256SUMS from the original zip.
- v3 cinematic layer: colour grade, vignette, anamorphic streak, film grain, dust motes, bottom letterbox, title-card intro. Grain/dust hidden under prefers-reduced-motion. Cost: animated full-screen overlays; check frame rate on a real phone and delete the 'v3 cinematic' block in lobby10.template.css if it drops frames.
- v3.1 (recommended): measured in Chromium/SwiftShader, 1280x720 lobby avg frame ms: original ~197, v1 ~208, v2 ~248, v3 ~375, v3.1 ~243. Cost of v3 was the always-animated full-screen dust layer; v3.1 makes dust/grain/flare/glow static, entry animations stay one-time. Software GL is pessimistic, not a phone measurement.
- First-run intro (lobby-10/intro.html, intro.css, intro.js; injected by apply.py): "Tap to begin" splash, 5 title cards (~3 s each), Skip button, Esc/→ keys, dots. Shown once (localStorage key `sl-intro-seen-v1`, wrapped in try/catch), never when the URL has join=1. "Watch intro" button (#btn-intro) in the Play title block replays it (hidden on short landscape phones). No new files, so no allowlist/hash-count change. No sound, no camera or game-code changes. Reset for testing: clear that localStorage key.

## v5 features (source: lobby-10/features.js, features.template.css, matchfound.html; injected by apply.py)
- Sound: builds on the game's own audio engine (audio(), busUi, G.uiSound, soundOn). Adds a synthesized ambient bed (idle lobby only, stops in match / when hidden), tab + hover ticks, intro-card hit, match-found riser. Toggle: speaker button in the top bar (localStorage `sl-ambient`). Nothing plays before the first user gesture. Existing Settings > Audio (UI sound, UI volume, master) still governs it.
- DEPLOY card: real values from R / CURMAP (map, rounds or score limit, time, enemies, allies, skill) that follow the selected mode; "Edit rules" opens Match Rules. On LAN it shows "Set by LAN host".
- Match-found transition before an OFFLINE deploy (~1.6 s, click to skip, Esc cancels). Not used for LAN, resume, or reduced-motion. Re-clicks Deploy programmatically so pointer-lock still has user activation.
- Operative showcase: name plate (name, role, faction, Change operative) and a gentle lobby camera drift (one-line change in idleCamera, lobby preview branch only, honours reduced motion).
- Loadout: Legendary finishes get gold styling + tag; "NEW" tags appear only for finishes added after a weapon was first viewed (per-weapon baseline in localStorage `sl-finish-seen-v1`, so nothing is NEW on first install). Share loadout button (Web Share, else clipboard, else execCommand).
- Social: squad strip (LAN online count/names when connected, else solo + Find friends -> Multiplayer). It reflects real connection state only; there is no friends list or presence service.
- Screen transitions only when the route changes (not on each re-render); press feedback; short vibration on touch devices.
- Game code touched: idleCamera angle (1 line), loadout finish markup (3 small string edits), renderBody scroll preservation. Feature block runs inside try/catch at the end of the main closure.
- Not verified: Android device, real audio output (checked via instrumented AudioContext: starts after gesture, 3 oscillators, stops/restarts with the toggle), real clipboard/share on Android WebView.

## v6 backdrop (CSS only)
- Appended block "v6 backdrop" at the end of lobby-10/features.template.css: overrides only `.mn::before` / `.mn::after` background layers (night navy-teal base, cold rim-light halo behind the operative, light shafts from upper right, teal/ember floor blooms, deeper vignette, retained left readability scrim and anamorphic streak). Static gradients only, no new animation.
- Rollback: delete that block (or use the v5 zip). No JS or game-code changes in v6.

## v7 lobby stage + per-mode atmosphere (JS + CSS)
- features.js (end): wraps `lobbyPreviewUpdate`. On Play and Operators only (not Maps/Multiplayer/Rules/Loadout), while the lobby preview is shown, it hides the map (all scene children except camera, hemi, sun, the preview operative and its own stage), hides `sky`, and builds a stage: dark gradient dome, accent horizon band, floor pool, glow under the feet, three accent rings, a soft light cone, two light bars (cool/warm) and dust motes (desktop only). Hemi/sun are re-lit as a key/fill rig and the operative rim light takes the mode accent.
- Per-mode atmosphere: accent is read from the selected mode card's `--ac`, eased in, and also written to `--sl-ac` on <html> so the CSS backdrop tints with it (class `sl-stage-on` on <body>).
- Everything is restored on leaving the lobby (map visibility, lights, background, sky). Map change while on stage re-saves the lights. No new lights are added (no shader recompile).
- Switch off: localStorage `sl-stage` = `off` (then v6 look). Rollback: remove the v7 block at the end of features.js and the "v7" block of features.template.css, or use the v6 zip.
- Measured (software GL, 1280x720, noisy): original 205 ms, v7 stage on 210 ms, v7 stage off 258 ms avg frame. Not tested on a real device/GPU.
- Tests: stage on/off per route, accent per mode (teal/amber/green/red), Maps shows the real map, match start restores the world, no page errors, parity 5/5.

## v8 game-style Play screen (CSS + JS; no change to match logic)
- Play screen rebuilt to the v4 target: big italic mode title + one-line description, plain skewed mode list (no cards), operative callout, map card (real CURMAP name + Change map / Match rules / LAN links), slanted gold DEPLOY slab with real sub-label (rounds/score/best-of/time + skill; "Set by LAN host" when connected), hint row (R Rules, Watch intro).
- Top bar: skewed tabs, LAN/offline pill (real mpConnected state; opens Multiplayer), sound toggle. Operative chip in the bar is hidden (callout replaces it). The Offline/Multiplayer/Maps/Rules sub-bar is hidden on the Play route only; it still shows on Maps, Match rules and Multiplayer.
- Removed from Play (CSS-hidden, code still present): stats list, squad strip, "Edit rules" box.
- Mode accent: `--sl-ac` follows the selected mode (teal, amber, green, red) and drives tabs, title gradient, map links and the diagonal accent line. Hero re-animates only when the mode changes (transform/opacity, skipped for reduced motion).
- Background: the selected map shows behind the operative with static scrim gradients. The v7 stage is now opt-in: localStorage `sl-stage` = `on`.
- Keys (desktop, menu idle only, not in inputs): Q / E previous / next main tab, R opens Match rules on the Play route.
- Font: system condensed stack (Barlow Condensed, Oswald, Roboto Condensed, sans-serif-condensed, Arial Narrow). No font file bundled; appearance varies by device.
- Rollback: delete the "v8" blocks in features.template.css and the slRenderV8 block + keydown handler in features.js, or use the v7 zip.
- Verified (Chromium, software GL): 1920x1080, 1280x720, 844x390, 390x844; all routes (Loadout, Operators, Rules, Maps, LAN, Settings) render without the Play panel; mode switch updates title/sub-label; Q/E/R; match-found then deploy; buy menu in match; intro regression; parity 5/5; no page errors.
- Not verified: real Android device, in-match pause menu (Esc went to the bomb buy menu in my test), LAN connected state visuals, touch tap targets on a real phone.

## v8.1 pause / result titles
- When the game sets a real overlay title (Paused, match results), `#pn-play` gets class `sl-titled`: that title replaces the mode name as the hero, the game's note text shows as the description, and the operative callout and hint row are hidden. Driven by a MutationObserver on `#ov-title` (default title text is captured at load).
- Verified: pause via the in-game menu button (desktop and phone landscape) shows PAUSED, Resume with the real sub-label, Restart match, Quit to menu. Desktop Esc pause needs real pointer lock, which headless Chromium does not provide, so Esc itself was not exercised.
- Added a shared heading rule for other screens; it had no visible effect in testing and is harmless. Loadout and Operators bodies are unchanged from v7 apart from the new top bar.
- Rollback: as v8, plus remove this block and the sl-titled observer in features.js.

## v9 Loadout + Operators restyle (CSS only)
- Scoped with `:has(.loadout-page)` / `:has(.operator-console)` on `#pn-dyn`, so other screens (Rules, Maps, Multiplayer, Settings) keep their v8 panels. On WebViews without `:has()` support the old look remains (no breakage).
- Panel de-boxed (dark left gradient instead of a bordered card); big italic section title, weapon/operator names in the same condensed italic voice; Loadout weapon categories as a plain skewed list with an accent bar; Equip/Confirm buttons as the gold slanted style; operator chips slanted; operator-bay callout hidden (duplicate text).
- Top-bar selected tab: removed the double outline.
- Rollback: delete the "v9" blocks at the end of features.template.css.
- Verified at 1280x720 and 844x390 in Chromium; no page errors; parity 5/5; Play flow (mode switch, Q/E/R, deploy) still passes. First-run intro test also passes. Not re-checked: finish chips, Operators bottom area, portrait. Phone landscape: content below the first screen needs scrolling (as before).

## v10 remaining screens (CSS only)
- Rules, Multiplayer and Settings now use the same de-boxed dark-left panel and big italic title as v9; the sub-bar tabs (Offline modes / Multiplayer / Maps / Match rules, Preferences / Key bindings / ...) are skewed like the main tabs, selected one filled with the mode accent. Form controls, sliders and buttons are unchanged and still work.
- Maps screen keeps its own heading ("Operations table"), only the panel and sub-bar changed.
- Known and not fixed: Settings slider value labels (72°, 100%) sit under the left of the slider.
- Rollback: delete the "v10" block at the end of features.template.css.
- Verified at 1280x720 in Chromium: Rules, Maps, Multiplayer, Settings; Play flow; intro; parity 5/5. Not checked: phone and portrait for these screens, real device.
