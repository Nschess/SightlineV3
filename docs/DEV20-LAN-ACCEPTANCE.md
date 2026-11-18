# DEV20 LAN acceptance

Use the debug diagnostic APK and the Windows checkout from the workflow's `source_commit`. The APK report records the APK SHA-256 and the two Windows host fingerprints. The Windows checkout uses `AndroidProject/app/src/main/assets/phone-host` for hosting, the same runtime that the APK packages.

## Run both directions

- **Windows host, Android client.** On Windows, run `START-HOST.bat` from the matching checkout. Open `http://WINDOWS_LAN_IP:8080/?lanDiag=1` using the bound adapter's private IPv4 address, go to Play → Multiplayer and connect first so Windows owns the match. On Android, use Play → Multiplayer → Find LAN Match and select the Windows room. Use the displayed private IP if discovery is unavailable.
- **Android host, Windows client.** In the diagnostic APK, use Play → Multiplayer → Create Match. Wait for the phone to join its own room. On Windows, open `http://PHONE_IP:8080/?lanDiag=1` and connect in Multiplayer. The phone owns Match Rules and Start Match.

Use the same trusted private network for both peers. For each direction, let the host choose the rules and start. Play for about 90 seconds with both peers moving and firing. Record any waits, snaps, action delays or disconnects and roughly when they occurred. Include one leave/rejoin while the host remains up, followed by a host shutdown check. Capture one run per direction before changing settings or network conditions.

## Save the evidence

- On Android, tap **Stop capture**, then **Save JSON**. Choose a folder in Android's file picker. If the app reports that saving requires a supported Android System WebView, note the installed WebView version.
- On Windows, tap **Stop capture**, then **Download JSON**. Save both players' JSON files with the host direction, device models, Android/WebView versions, Windows/Node versions, map, mode, number of players and bots, and approximate incident times.
- Compare `hostFingerprints.bundle` and `hostFingerprints.server` with `host_bundle_sha256` and `host_inventory_sha256` in the APK report. Keep the JSON private when sharing because it includes the selected LAN address and environment details.

Use heartbeat RTT and queue samples together with client snapshot gaps, frame pacing and corrections when reviewing a spike. Timing differs between the Windows and Android paths. A loopback RTT sample does not replace either device capture.

## Interpreting DEV20.1 timing

The roster uses the smoothed application heartbeat RTT. It includes client JavaScript handling, event loop scheduling and socket queues. `transportRttMs` measures a separate WebSocket control-frame exchange, which bypasses page JavaScript but still includes the network, socket queues and host scheduling. Treat the difference as a clue rather than an exact measurement of client processing time. Correlate it with `lobbyFrameMs`, live frame and snapshot gaps, queue bytes, and the host tick maxima for the heartbeat window. Compare both host directions using the same source revision.

In Match Rules, Apply submits staged settings to the host. Cancel discards the draft. Back to Lobby and Maps leave the draft in the current session. Mode selection applies immediately because it changes the applicable rules and map validation. Guests can review saved rules.
