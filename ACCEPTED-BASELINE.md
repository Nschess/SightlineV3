# Sightline V3 accepted baseline

| Reference | What it establishes |
| --- | --- |
| DEV24.9 `24c9034ae5f1a92e90491d5c9a7aa4b37b9acb6a` | Owner-confirmed smooth Android movement. Device, map, frame-time traces and thermal conditions were not supplied. Keep this build as the movement comparison reference. |
| DEV25.4 `285ab5f4e7dd39427f30b2af83710c62100e4c06` | Owner reported irregular movement while stationary camera swipes remained smooth. |
| DEV25.5 `6a7f2e15d3340f1080f0410b82a206124e32ead2` | Feature and rollback baseline. Preserve the startup gate, compact and advanced HUDs, custom layouts and saved settings, five-category Smart Setup and selective Undo, map materials, all five modes, offline-only aim, and Android/Windows LAN. Physical performance acceptance remains open. |

## Development gate

1. Record the starting SHA, affected player journeys and shared dependencies. Work on the development branch and retain the stable checkpoint.
2. Change the smallest responsible path. Keep the Android offline and phone-host assets in parity. Preserve established gameplay, visuals, and device refresh, battery and thermal limits.
3. Run focused checks for changed behavior. Require the **Sightline approved baseline** Actions job to pass before promoting a candidate. It checks authored-map movement, touch ownership, startup, preferences, rendering policy, match rules, outbreak and loopback LAN. It does not build an APK.
4. For movement and performance changes, compare the same scenarios against DEV24.9 on matched conditions. A failing approved journey blocks promotion. Repair the affected path or restore its stable implementation and verify again.
5. Advance the protected baseline only after the owner accepts the exact candidate. Keep previous commits, artifacts and app data. Production still requires the existing fail-closed release gate.

## Movement evidence and next device comparison

The source replay uses production stick sampling, movement integration and authored map collision boxes in Courtyard and Horror City. Both Android trees are checked at simulated 60, 90 and 120 Hz. At 60 Hz, a 16 CSS px drag traveled 1.8207 m in DEV24.9 and 2.8244 m in DEV25.5 over two seconds. The precision-walk correction restores 1.8207 m and keeps the input continuous. Full-stick directions and the aimed turning course match DEV24.9. The fire check counts calls into the weapon path. It does not measure ballistics, Android input latency or physical FPS.

To repeat the commit comparison, set `SIGHTLINE_MOVEMENT_REFERENCE` to the full DEV24.9 SHA and run `node --test tests/mobile-movement-reference.test.cjs`. The lightweight CI check also pins measured trajectory values without fetching the reference history.

Before another performance APK is promoted, record the exact APK hash, phone and Android/WebView versions, refresh rate, preset, render scale and performance mode. Match the map, mode, roster and route, and start from comparable temperature and Battery Saver states. Check stationary aim, precision walk, full-stick strafe and sprint, turns while moving, and aiming and firing together. Save rendered FPS, P95/P99 frame intervals, spikes over 50 ms and any dropped or stuck touches. Device smoothness, sustained heat and Android ↔ Windows LAN remain open until measured.
