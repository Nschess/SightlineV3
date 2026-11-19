# DEV24 physical-device acceptance

Use the APK and Windows host ZIP from the same Actions artifact. Keep `diagnostic-build.txt` with the evidence. It identifies the source commit, both SHA-256 hashes, the persistent diagnostic signing certificate and the host fingerprints. The ARM64 APK updates **Sightline Acceptance** (`com.sightline.v3.diagnostic.acceptance`) and coexists with DEV24.0. Leave DEV24.0 and its app data intact. Use `MIGRATION.md` for optional transfer of offline preferences and records.

DEV24.7 shares the DEV24.4 acceptance package and signer. To keep the original DEV24.4 APK installed alongside the new build for comparison, use another compatible phone. An in-place update replaces the DEV24.4 APK and retains its app data. Follow the installation instructions in the matching artifact and keep the original DEV24.4 archive.

## Windows CMD

In the folder containing the downloaded files, compare both hashes with the report, then extract the host ZIP. Node.js must be available on PATH.

```cmd
certutil -hashfile sightline-lan-acceptance.apk SHA256
certutil -hashfile sightline-windows-host.zip SHA256
adb install -r sightline-lan-acceptance.apk
powershell -NoProfile -Command "Expand-Archive -LiteralPath 'sightline-windows-host.zip' -DestinationPath 'sightline-windows-host'"
cd /d sightline-windows-host
node --version
START-HOST.bat
```

The ADB command requires an already authorized connection. You can also open the APK on the phone and use Android's install or update dialog for Sightline Acceptance.

On the Windows host itself, open `http://WINDOWS_LAN_IP:8080/?lanDiag=1`, using the private IPv4 address printed by the host for the bound adapter. The LAN host listens on that address. Use one trusted private network, allow Node on Windows Private networks if prompted, and use Ctrl+C in the host CMD window to stop this session. For Android-host testing, stop the Windows host and browse to `http://PHONE_IP:8080/?lanDiag=1`.

## One test sequence

1. **Offline and controls.** With Android offline, cold-launch and play Infection. Check simultaneous move, aim and fire, HUD readability and safe-area clearance, both hand layouts, alternate fire, and reload feedback. Open Settings from the match menu, change a preset and resume. Background and resume during play, rotate between landscape sides, interrupt audio once and return. Relaunch and verify settings persistence and offline play.
2. **Clarity and sustained performance.** Compare the same Infection map, location, sight line and weapon against DEV24.0 and the matching Windows build. Capture the HUD, weapon and distant targets. In Settings → Graphics, compare Balanced and High Quality at the same frame cap. Test Competitive at its 120 FPS limit on a capable phone. Record the display refresh, WebView callback rate and game FPS separately. Repeat the same scene on the earlier fast APK if available. Capture the performance and frame diagnostics reports, including actual drawing-buffer size, FPS and P95 frame interval. Play for at least 15 minutes on the intended preset and compare early and late performance. Record memory and thermal readings if available. With authorized ADB, use `adb shell dumpsys meminfo com.sightline.v3.diagnostic.acceptance` and `adb shell dumpsys thermalservice`. Mark unavailable metrics UNVERIFIED.
3. **Windows host → Android client.** Connect from Windows first, then find and join the room on Android. Check Lobby → Maps → Match Rules, Apply, Cancel, Back to Lobby and guest read-only controls. Start the match and play for 90 seconds with both players moving and firing. Check guest leave/rejoin, background/resume and host shutdown recovery. Note any waiting, snaps, delayed actions or disconnects and their times.
4. **Android host → Windows client.** Use Create Match on Android and join from the Windows URL above. Repeat the host/guest Match Rules, start, play, leave/rejoin and shutdown checks with ownership reversed. In both directions, use **Stop capture** and **Save JSON** on Android and **Download JSON** on Windows. Verify the Android picker saves a readable JSON file and record failures with the WebView version. Capture before disconnecting or leaving the diagnostics page.
5. **Bind evidence to the build.** Include device models, Android/WebView versions, Windows/Node versions, presets, cap, network conditions, map, roster, timings and outcomes. Match JSON `hostFingerprints.bundle` and `hostFingerprints.server` to `host_bundle_sha256` and `host_inventory_sha256` in the report. Keep JSON private because it can contain LAN addresses. Review heartbeat RTT, transport RTT, snapshot gaps, corrections and frame pacing together. [LAN timing and export details](DEV20-LAN-ACCEPTANCE.md)

Record PASS only for exercised cases with evidence, FAIL for observed defects, and BLOCKED or UNVERIFIED for unavailable cases. Keep isolated checks and measurements from physical devices in separate reports.
