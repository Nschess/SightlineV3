# Physical Android QA checklist — required before beta approval

Primary target: Samsung Galaxy A17 5G (SM-A176B), Android 16. Record Android System WebView version, phone build, PC CPU/GPU, Windows IP, Wi-Fi/hotspot mode, test date, FPS and logs. Do not assume a desktop browser emulation is equivalent.

## Offline, with airplane mode enabled

1. Install the genuine `app-debug.apk` built by Gradle; launch it with **no Wi-Fi or mobile data**. Select Play Offline. Verify all assets load and the menu opens without an external server request.
2. Complete naturally finished rounds/matches in **Tactical, Team Deathmatch, Zombie Infection and Co-op Outbreak**. Check maps, 27 firearms, 81 weapon skins, 34 character identities/102 premium variants, bot ammo, zombie conversion, scoring, results and replay. Test a second map, preferably Blackwater.
3. Test two-thumb movement/camera, Fire + Aim drag, three simultaneous fingers, release/cancel, manual ADS, Auto ADS, sniper magnification, scoped sensitivity, weapon switch, crouch, jump and reload.
4. Edit a HUD element: Save; fully force-close the app and reopen; confirm persistence. Repeat Reset/Cancel. Verify accessibility at both landscape orientations, notches and safe areas.
5. Background app for 1 minute and resume; verify no stuck Fire or camera jump. Interrupt with notification and return. Test app Back -> Home -> Offline and saved settings.

## LAN, with trusted private Wi-Fi

1. On a PC, run the original `host.bat`, confirm the PC IPv4 address and firewall permission for private networks only. Open the Android app -> Join PC LAN Game -> enter PC IPv4 (port 8080 fixed).
2. Run **1 PC + 1 Android** and **2 PC + 1 Android** sessions if devices available. Verify WebSocket connect, visible movement both ways, shots, damage, reloads, respawns, cosmetics, match scoring/results and reconnection. Do not use public internet port forwarding.
3. Test **Deathmatch and Infection**, 1v1 then bot-filled sessions. Run a sustained **15-minute mixed-device session**, test background/resume and a brief controlled Wi-Fi interruption. Check duplicate sessions and stale input.
4. Record ping median/P95/P99/max, WebSocket disconnects, server tick P95/P99, received message gaps, Android FPS/frame-time spikes, memory/thermal behavior and crashes. Distinguish actual RTT from rendering lag.

## Evidence needed

Record screen recordings/screenshots, logcat error trace, hardware/Android/WebView version, start/end time, actual match results, whether each control worked and any missing assets. If any P0/P1 defect occurs, **stop beta approval** and return to a source-level fix/retest.
