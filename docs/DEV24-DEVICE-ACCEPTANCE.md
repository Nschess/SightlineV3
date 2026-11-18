# DEV24 physical-device acceptance

Use the three files from one Actions artifact. Keep `diagnostic-build.txt` with the evidence. It identifies the source commit, APK and Windows ZIP SHA-256, Android debug signing certificate, and host fingerprints. The APK is an ARM64 diagnostic install with package ID `com.sightline.v3.diagnostic.visibility`. Android may reject an update over a prior diagnostic signed with a different debug key. Preserve any prior captures and leave the protected install alone.

## Windows CMD

In the folder containing the downloaded files, compare both hashes with the report, then extract the host ZIP. Node.js must be available on PATH.

```cmd
certutil -hashfile sightline-lan-acceptance.apk SHA256
certutil -hashfile sightline-windows-host.zip SHA256
powershell -NoProfile -Command "Expand-Archive -LiteralPath 'sightline-windows-host.zip' -DestinationPath 'sightline-windows-host'"
cd /d sightline-windows-host
node --version
START-HOST.bat
```

Open `http://localhost:8080/?lanDiag=1` when the host reports ready. Use one trusted private network for LAN tests, allow Node on Windows Private networks if prompted, and use Ctrl+C in the host CMD window to stop this session. For Android-host testing, stop the Windows host and browse to `http://PHONE_IP:8080/?lanDiag=1`.

## One test sequence

1. **Offline and controls.** With Android offline, cold-launch and play Infection. Check touch aiming, firing, ADS, movement, HUD reach, menus, audio and landscape fit. Change audio and graphics settings. Background and resume during play, then rotate between landscape sides, interrupt audio once and return. Relaunch and check that settings persisted and offline play still works.
2. **Clarity and sustained performance.** Compare the same Infection map, location, sight line and weapon on Android and the matching Windows build. Capture the HUD, weapon and distant targets on each. On Android, use Settings → Video to test Low, Balanced and High under the same cap and scene. With frame diagnostics enabled, save a report or capture the report panel for each preset after about two minutes. Record FPS, P95 frame interval, canvas size and long stalls. Continue for at least 15 minutes on the preset intended for the device and compare early versus late results. Record available memory and thermal readings before and after using approved device tools. If ADB is already authorized, `adb shell dumpsys meminfo com.sightline.v3.diagnostic.visibility` and `adb shell dumpsys thermalservice` can supply supplementary readings. Mark unavailable metrics UNVERIFIED.
3. **Windows host → Android client.** Connect from Windows first, then find and join the room on Android. Check Lobby → Maps → Match Rules, Apply, Cancel, Back to Lobby and guest read-only controls. Start the match and play for 90 seconds with both players moving and firing. Check guest leave/rejoin, background/resume and host shutdown recovery. Note any waiting, snaps, delayed actions or disconnects and their times.
4. **Android host → Windows client.** Use Create Match on Android and join from the Windows URL above. Repeat the host/guest Match Rules, start, play, leave/rejoin and shutdown checks with ownership reversed. In both directions, use **Stop capture** and **Save JSON** on Android and **Download JSON** on Windows. Verify the Android picker saves a readable JSON file and record failures with the WebView version. Capture before disconnecting or leaving the diagnostics page.
5. **Bind evidence to the build.** Include device models, Android/WebView versions, Windows/Node versions, presets, cap, network conditions, map, roster, timings and outcomes. Match JSON `hostFingerprints.bundle` and `hostFingerprints.server` to `host_bundle_sha256` and `host_inventory_sha256` in the report. Keep JSON private because it can contain LAN addresses. Review heartbeat RTT, transport RTT, snapshot gaps, corrections and frame pacing together. [LAN timing and export details](DEV20-LAN-ACCEPTANCE.md)

Record PASS only for exercised cases with evidence, FAIL for observed defects, and BLOCKED or UNVERIFIED for unavailable cases. Keep isolated checks and measurements from physical devices in separate reports.
