# Sightline V3 — BREACH VECTOR

## Music direction and implementation

Replaced the default lobby score with **BREACH VECTOR**, a newly composed dark tactical phonk / industrial electronic track. It starts on the drop: 154 BPM, syncopated kick, distorted 808 with mid-bass harmonics, a new FM cowbell motif (`F#–A–C#–C`), fast hats, snare fills, and short metallic impacts. A driving half-time section and snare/808 build break up the drops. There are no orchestral pads, external samples, or copied melodies.

The 64-bar, 99.74-second loop is stereo 16-bit PCM at 22.05 kHz. Measured master: -11.21 dBFS RMS, -5.63 dBFS sample peak, with a 40 ms end/start blend and measured edge jump of 0.00139. It stays below the existing Android host's 16 MB per-file limit.

## Game playback

BREACH VECTOR uses the existing `sightline-main-theme.wav` runtime path in Offline and phone-host builds. The same master is packaged in both. The game still prepares playback at lobby startup and attempts autoplay. If policy blocks it, the first click, touch, or keypress retries the same looping audio element. Existing saved music volume/mute settings, UI cue ducking, deployment fade, and return-to-lobby behavior remain in place. No autoplay restriction is bypassed.

The previous **CONTACT ZERO** and **BEFORE THE STORM** WAVs, metadata, and comparison sources are retained in `audio-comparison/`.

## Focused verification

- Phonk/audio/startup checks: **4/4 passed**, including PCM/hash/loudness/loop bounds, a simulated autoplay block followed by first-input retry, and a single-element assertion.
- Android parity: **49/49** host files, **15/15** shared modules, inline page syntax, allowlists, and phone-host fingerprint checks passed.
- Generator, integration, and inventory scripts pass JavaScript syntax checks.
- Exact candidate changes and hashes: `acceptance/phonk/CHANGED-FILES-SHA256.txt`.
- The prior candidate's root `AGENTS.md` is preserved byte-for-byte. No ZIP, APK, or production merge was created.

## Acceptance status

The track is generated and source-wired, but **speaker listening and in-game audio acceptance remain UNVERIFIED** because no isolated game audio output was available. RMS and peak measurements do not prove how it sounds on speakers. Browser autoplay may still require one user input.

To audition the WAV directly, open `AndroidProject/app/src/main/assets/www/sightline-main-theme.wav`. To test the game in the normal Windows workflow:

```cmd
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\sightline-phonk-main-menu-20261110\DEV"
START-HOST.bat
```

In a second CMD window, run `SIGHTLINE.bat open`. If the browser blocks autoplay, click, touch, or press a key once. Existing Settings → Audio controls still adjust or mute lobby music.
