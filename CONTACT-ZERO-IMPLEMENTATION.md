# Sightline V3 — CONTACT ZERO lobby theme

## Style decision

| Direction | Fit for this game | Main tradeoff |
|---|---|---|
| Dark military orchestral | Strong drama and deployment weight | Can sound like a generic trailer and feel overblown during long lobby sessions |
| Tactical industrial electronic | Fits equipment, comms, and machinery | Can become cold or mechanically repetitive without a memorable theme |
| Hybrid orchestral + industrial | Best fit: melodic identity and cinematic scale over a controlled tactical pulse | Needs restrained orchestration to avoid constant action intensity |
| Dark tension with rhythmic build | Fits the dangerous mission tone and long waits | Alone, it can underplay the energy of a shooter lobby |

Selected: a restrained **hybrid orchestral-industrial score**, with dark tension shaping its opening and gradual build. Sightline's stylized armory, operators, deployment flow, and active combat call for a recognizable melodic signature with tactile mechanical rhythm, not pure trailer scoring or subdued ambience.

## New original theme

`CONTACT ZERO` is a new locally synthesized composition; it does not reuse the prior `BEFORE THE STORM` melody. It is 134 BPM, C minor, 64 bars / 114.627 seconds, with a C–Db–G–F warning motif, Cm–Ab–Fm–G7(b9) progression, half-time tactical pulse, low brass and dark string-like voices, industrial steel accents, and a restrained hybrid climax. The WAV is stereo 16-bit PCM at 22.05 kHz. Measured sample peak is -1.01 dBFS and mastered RMS is -13.53 dBFS. These measurements establish file level and headroom; they do not establish subjective sound quality.

Track SHA-256: `61382cd1a2609974161daf863915286fcf64d0b33b0c99f4f70e30b8567ce47f`.

## Startup playback behavior

- Offline and phone-host pages preload the same `sightline-main-theme.wav` and attempt playback as the lobby opens.
- If browser autoplay policy rejects unmuted playback, the play promise is caught, the internal state becomes blocked, and volume is returned to zero. There is no false “playing” indicator.
- A pointer, touch, or keyboard event anywhere in the game retries immediately and unlocks/reuses the existing Web Audio context. The music is a single looping media element, routed through the existing music/master path when available.
- Saved mute, master, and music-volume preferences remain in effect. Existing cue ducking and deployment fade remain wired. No autoplay restriction is bypassed.
- The Android offline allowlist and phone-host staging/route inventories include the new WAV; the page fingerprint and file hashes were regenerated.

## Changed implementation

- New score generator: `tools/generate-sightline-main-theme.cjs`.
- Startup, retry, gain, and transition logic in the production Offline and phone-host `index.html` files.
- Phone-host WAV route in `phone-host/server.js`.
- Android packaged-file and staged-host allowlists, host page pin, and SHA-256 inventories.
- Focused tests: `tests/sightline-main-theme-audio.test.cjs`; Android parity assertions now require the current track.
- Prior `BEFORE THE STORM` score, metadata, generator, integrator, updater, and the prior report are retained under `audio-comparison/`. The direct parent candidate remains unchanged.

## Verification

- Focused theme/startup checks: **7/7 passed**, including a simulated autoplay rejection followed by successful first-input playback using the same audio element.
- Android phone-host asset parity: **49/49 files**, **15/15 shared modules**, Offline/phone-host inline script syntax, Android route allowlists, and page pin passed.
- Generator, integrator, and manifest updater pass `node --check`.
- Asset hashes and Offline/phone-host track bytes match. See `acceptance/contact-zero/CHANGED-FILES-SHA256.txt`.
- Not run: full gameplay regressions, APK build, visual rendering, or device acceptance; this is a targeted audio change.

## Acceptance limits and test

The new WAV and event wiring are verified statically, but no isolated game audio output was available for listening. **Actual speaker playback and subjective mix acceptance remain UNVERIFIED.** Browser autoplay may be blocked until the first user input; the implementation attempts startup playback and retries on the first valid input.

To preview the standalone score, play `AndroidProject/app/src/main/assets/www/sightline-main-theme.wav`. To try it in the existing Windows host workflow:

```cmd
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\before-the-storm-game-identity-20261110\DEV"
START-HOST.bat
```

In a second CMD window, run `SIGHTLINE.bat open`. If autoplay is blocked, click/tap anywhere or press a key once. Audio controls remain under Settings → Audio → Lobby music.

No ZIP, APK, or production merge was created. Rollback is available from the untouched direct parent `work/before-the-storm-anthem-20261109/DEV`; the prior theme source and audio are also preserved in `audio-comparison/`.
