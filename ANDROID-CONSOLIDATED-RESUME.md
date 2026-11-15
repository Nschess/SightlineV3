# Android consolidated DEV checkpoint — 2026-11-15

Baseline: android-v14-ui-20261115/DEV. v14 APK preserved in rollback/android-v14/Sightline-v14-debug.apk, SHA-256 de8d3a519fcd1f94ff009cfbe96547eb3f9292308ec58a487eef0ac18d878bb2. Prior baselines and APKs remain intact.

Completed: persistent touch Settings header covers Key Bindings, Records and Field Guide; local SVG chevrons added for dropdowns and expandable sections, and a matching SVG Back arrow added to mobile Match Rules; offline renderer resets stale callback-cadence history on visibility changes without altering simulation timing. Focused Android allowlist, Match Rules, lifecycle tests and 48 frame-pacing checks passed.

Renderer diagnosis: one isolated Edge headless process timed out and logged CreateAppContainerProfile failed with HRESULT 0x80070057. No usable rendered page or screenshots were obtained. The user's desktop and phone were not operated in this cycle.

Pending: actual rendered inspection of lobby, Graphics, Touch Controls, HUD and Match Rules; verify hitboxes, SVG arrows, accessibility and navigation; implement capability-aware 90/120 FPS selection from active Android display mode and WebView capability; measure device gameplay pacing, memory and responsiveness. The existing FPS options are unchanged and must not be advertised as hardware-verified. LAN clients receive the PC host page; these bundled offline-page changes do not change the host page or its pinned fingerprint.

Runtime/gameplay/device acceptance: UNVERIFIED. No new APK built. Production release remains blocked.
2026-11-15 restriction: Do not launch a browser on the personal Windows installation, use personal devices or wireless ADB, or control desktop applications. Use only isolated development tools. Rendered screenshots remain BLOCKED until an independent isolated runtime is available.

## Android forward movement investigation — 2026-11-15

Owner evidence: stationary smooth; forward walk/run under 20 FPS without camera rotation. Exact cause remains unconfirmed. Isolated browser and device performance are BLOCKED under the owner's restriction.

Prechange source checkpoint: rollback/android-movement-broadphase-prechange/index.html (SHA-256 042bbbb4bb70d006bd0c4b1ccd07aef63f913acbfb1c3c6097f5f5b229be0a09, omit the inserted space when comparing) and sibling work/android-movement-broadphase-prechange-20261115. Original v14 rollback remains intact.

Applied: ordered, per-box distance broadphase to offline resolve, groundAt and ceilingAt. It checks the current position for every box, preserving sequential push behavior. Targeted deterministic parity: 12,005 random and boundary positions passed against the preserved source. Separate initial sampling checked 15,000 positions. Phone-host page and LAN authority remain unchanged.

Synthetic 400-box Node VM timings, 400 samples per case, microseconds per combined collision/floor/ceiling call: old stationary p50/p95/p99/max 821.6/937.4/1346.7/1804.8; old moving 830.5/975.5/1140.8/1411.6; broadphase stationary 705.4/748.9/924.1/1347.7; broadphase moving 697.9/768.3/975.2/1663.0. VM object-boundary overhead and synthetic boxes make these unsuitable as device FPS or full-frame measurements. Collision baseline does not explain the movement-only collapse.

Footstep simulation using the actual hearPlayer function, 64 eligible nearby bots, 10 seconds at 60 updates/sec: stationary 0 calls, forward 40 calls and 2,560 bot search updates; isolated hearPlayer p95 467.4 us and max 498.1 us on this host. This is an AI activation lead, not proof of the sustained phone bottleneck. No AI behavior was disabled or weakened. Streaming boundaries, actual full-frame P95/P99, render time, allocations, phone audio and gameplay remain unmeasured. Do not claim the defect fixed or build a final candidate until the cause and moving gameplay can be verified.
## Android movement AI diagnostic — 2026-11-15

The actual offline hearPlayer path updates alerted bots' last-known points and allocates a search goal; later stepUnit calls steerTo, navLine and potentially budgeted SightlineNav.path. Footsteps are a lead; no full gameplay or device inclusive profile is available. No hearing distance, event or AI behavior was changed.

Confirmed separate movement-triggered cost: actual localSquadUpdate on authored Courtyard navigation, 32 allied actors, same fixed camera/yaw and map, 24 updates at 0.95-second intervals. Stationary player: 32 initial formation calls, update p50 0.098 ms, p95 0.343 ms, max 15.814 ms. Player moving 2 units/update: 768 formation calls, p50 2.600 ms, p95 6.455 ms, max 18.345 ms. These are host-side isolated component timings, not Android frame times; first invocation includes graph component caching.

Rejected: building a temporary reservation index increased moving-formation p50 from 2.75 ms to 11.40 ms on the isolated workload. It was not applied.

Applied to offline www/navigation.js: evaluate each candidate's existing score before checking reservations; if it cannot improve the current best, skip reservation scanning. Strict comparison preserves tie and NaN behavior. Matched identical ordered selected posts in prototype, then passed 1,296 sequential choices across two authored map graphs. Moving 32-member formation microbenchmark, 36 updates: baseline p50 3.267 ms, p95 15.721 ms, max 18.425 ms; candidate p50 1.079 ms, p95 6.153 ms, max 20.017 ms. Not a sustained-FPS measurement; warm-up/GC and host timing limit comparison. Worst frame did not improve. Original file: rollback/android-formation-prechange-20261115/navigation.js, SHA-256 3603b9bdbbc15f17e5c04c3c15cee97e95524836456a26d7ca343cfe40261c4e. Phone-host navigation remains original and its protocol/fingerprint unchanged.

Still UNKNOWN: whether footsteps, pathfinding, render visibility/uploads, streaming, garbage collection or device-specific GPU behavior causes the reported phone FPS collapse. Actual Android full-frame and rendered gameplay acceptance BLOCKED under the owner device restriction; no FPS claim.
Build status: BLOCKED in the owner-authorized isolated scope. AndroidProject/local.properties points to the personal Windows Android SDK, and the available workspace-owned isolated runtime does not contain the Gradle 8.13 distribution or Android SDK platform/build tools. No personal SDK, desktop, browser, ADB or phone was accessed. Version code 15 is prepared in source, but no APK was generated. A compatible isolated toolchain and debug signing identity are needed for a build.

## Movement investigation continuation — 2026-11-15

No confirmed root cause. The source constructs the world during initial map load and map selection; no player-position chunk streamer was identified in the inspected paths. Position affects camera coordinates and can change visible geometry even when yaw is fixed; actual draw calls, GPU uploads and Android frame time remain unmeasured.

Controlled Courtyard navLine probe using shipped navigation and 256 calls per scenario, fixed orientation, synthetic near (2-unit) versus follow (12-unit) targets: short lines made 1,890 collision/1,862 nearest queries, median 0.0233 ms, P95 0.0424 ms, P99 0.0931 ms, max 0.3429 ms; long lines made 10,179 collision/10,118 nearest queries, median 0.1021 ms, P95 0.1313 ms, P99 0.1971 ms, max 3.6508 ms. These are host component timings, not observed production bot distributions or full frames. The longer test goal was intentionally controlled, not evidence of an actual in-game goal distribution.

Rejected nearest-node shortcut: matched 10,000 controlled line results but was slower (12-unit median 0.1618 vs baseline 0.0990 ms). No navigation shortcut applied. Footstep search-goal reuse prototype matched sampled tactical/outbreak search states and gave host p95 176.9 vs 183.9 microseconds, but broke existing offline/phone-host shared-helper source parity. Reverted byte-for-byte; all 8 offline/host bot autonomy checks passed afterward. No hearing, AI or host source changed. Preserved rollback/android-footstep-search-prechange-20261115/index.html.

The prior build-environment note is superseded in part: checksum-verified official Gradle 8.13, Adoptium JDK 17.0.21, Android platform 36 and build tools 36.0.0 now exist entirely under work/isolated-android-toolchain-20261115. They were installed without using the personal Windows SDK or Gradle. The workspace-owned debug key has certificate SHA-256 5d4f7045c31de17d72d70c54ba2c11949e8c4ebfbefe0f21fdcf866ac962e510, which differs from v14 debug certificate c98ea0df43b501ad85078d4c37a9436ab936a293728cbf088388d3b2505c54d0. A matching authorized isolated debug signing key is not available. No key was substituted, and no APK was built. Full-frame/device performance and root cause remain BLOCKED/UNKNOWN.