# Sightline V3 — Cinematic Lobby Environment Upgrade

Date: 2026-11-08  
Candidate: `work/lobby-cinematic-environment-20261108/DEV`  
Untouched rollback: `work/lobby-premium-lobby-final-presentation-20261108/DEV`

## Implementation

The production Offline and phone-host pages now construct the same lobby-only ready-room set around the existing operator preview. It includes a dark staging floor and platform, bulkhead with side returns, compact equipment racks and cases, three low-resolution tactical displays with line-map detail, short console forms, and warm/cool practical strips.

The room is a separate scene group. It is created lazily when the idle lobby opens, follows the existing operator preview anchor and small camera orbit, and is hidden whenever `lobbyPreviewUpdate` receives `active=false`. It is deliberately not added to `worldObjs`, `OBST`, collision, or navigation. `buildWorld(CURMAP)` and playable map content are unchanged.

Repeated room forms are batched into eight material-based `InstancedMesh` groups; the room adds one floor mesh and one line-segment display mesh. Room props and the room fill light cast no shadows. The existing operator fill remains, and the original playable operator/weapon assets are reused. No assets, CSS, weapon code, gameplay rules, controls, networking, or Legendary source were modified.

## Focused verification

- Ready-room and lobby experience tests: **16/16 PASS**.
- Offline/phone-host ready-room source parity: **PASS**.
- Both production inline scripts parsed: **PASS**.
- Lobby Android source/integrity check: **PASS**; 112 Android source entries and 48 phone-host entries verified, host hash pin matches, and 7 preserved rollback files pass.
- Candidate AGENTS.md matches the source candidate's instruction file: SHA-256 `df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2`.
- Changed-source SHA-256 entries: `acceptance/lobby-cinematic-environment-20261108/CHANGED-SOURCE-MANIFEST.json`.

The set is source-checked, not visually or performance measured. No browser/runtime, APK, physical Android, or gameplay test was run. No full regression suite or ZIP was produced.

## Visual outputs

The following generated images are **previews only**, not screenshots of the implemented Three.js scene. They were based on prior actual lobby captures and show the intended ready-room composition. Generation can alter UI and asset details, so use them for atmosphere review only:

- PLAY: `C:\Users\LOCAL_USER\.codex\generated_images\01a161da-a570-7d12-a77e-2259a28a2940\exec-5bcbbbd0-2f35-4984-98ca-61ed657bada1.png`
- LOADOUT: `C:\Users\LOCAL_USER\.codex\generated_images\01a161da-a570-7d12-a77e-2259a28a2940\exec-78cecc2a-395e-46b0-ad30-127e91269ddc.png`
- OPERATORS: `C:\Users\LOCAL_USER\.codex\generated_images\01a161da-a570-7d12-a77e-2259a28a2940\exec-6d61b691-ca96-4259-ad99-e5d8b29f4a6f.png`

Actual ready-room appearance, mobile layout, stage occlusion, and performance remain **UNVERIFIED** until the normal game preview is run. To launch this candidate manually from CMD:

```bat
cd /d "C:\Users\LOCAL_USER\Documents\Codex\2026-10-22\now-merge-them-the-old-version\work\lobby-cinematic-environment-20261108\DEV"
SIGHTLINE.bat offline
```

No screenshot acceptance or package promotion is claimed.
