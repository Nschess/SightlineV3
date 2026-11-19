# DEV24.1 Android clarity recovery

## Physical-device outcome

**FAIL on DEV24.0.** The owner tested Infection Mode on an Android phone and reported that graphics remained noticeably blurry compared with PC. DEV21's isolated checks verified buffer and preset behavior but could not establish perceived clarity on a phone. This outcome applies to diagnostic APK SHA-256 `f8daed3e8233fffd140ff96355193288f325cc2a929334b2b831cb54ea65714c`, built from `bf4dbc4711983c6b54e3d069a0e8e85b9ba25ea7`. DEV24.1 remains **UNVERIFIED on devices**. Its source rollback is `79059f465dd67c874462f45d319548a1bcbda2b9`.

## Source findings and correction

On the reviewed mobile path, the WebGL canvas fills the CSS stage. The old Balanced policy capped DPR at 1.8 before applying the saved render scale. At the default 90%, that produces a ratio of 1.62 even when display DPR is 2.75 and the framebuffer is below its pixel budget. Adaptive pressure could reduce that ratio by a further 10%. The compositor upscales this smaller framebuffer while the DOM HUD retains its own resolution.

Balanced now permits DPR up to 2.25 and 1.25 million pixels at the 60 FPS target. Its 30 FPS target has a 1.45 million pixel ceiling and its adaptive high-refresh ceiling is 1.05 million. High permits DPR up to 2.75, with ceilings of 1.85 million pixels and 1.45 million under adaptive high refresh. Actual device DPR, selected scale, viewport area and the budget still bound resolution. Low and the explicit fast fallback retain their original limits.

At the first adaptive step, Balanced and High drop enabled shadow-map costs and retain their full selected resolution. More pressure scales it to 96% and then 90%. Existing adaptive Legendary effects reduction still applies. The player-selected scale is preserved. The report includes physical-stage coverage and actual WebGL antialias status.

The reviewed map textures use shared sizes and filtering, and the map fog and default draw distance are shared. Mobile MSAA is disabled. The WebView source uses a device-width viewport, and the isolated capture preserved aspect ratio without changing the DOM HUD. The exact device compositor behavior, saved settings and GPU characteristics remain unmeasured. Geometry, texture assets, fog, antialiasing, PC defaults and gameplay remain as before.

## Isolated comparison

Both pages reached live Infection on Courtyard under headless Chromium with SwiftShader. The mobile fixture used a 667 × 375 CSS stage, DPR 2.75, Balanced with saved scale 90%, a 60 FPS target and adaptive disabled to isolate buffer sizing.

| Measurement | DEV24.0 | DEV24.1 |
| --- | ---: | ---: |
| WebGL buffer | 1080 × 607 | 1341 × 754 |
| Pixels rendered per frame | 655,560 | 1,011,114 |
| Stage width coverage | 59% | 73% |
| Allocated texture count | 53 | 53 |

The screenshots show finer static wall edges and ground detail. Live bot positions vary between the captures. The software fixture reported 2 FPS in both samples and does not resolve Android FPS, GPU memory or thermal cost. This configuration renders about 54% more pixels, so GPU fill and framebuffer traffic can grow even with the same texture count. The targeted policy test covers bounds, pressure steps, buffer resize avoidance, Low, the fast fallback and the desktop path. Android asset parity and source integrity are checked separately.

## Physical retest

Run the DEV24 device sequence once a consolidated candidate is built. On the originally affected phone, compare the same map, weapon and view with DEV24.0 and PC. Save the performance report for Low, Balanced and High. Record display resolution, CSS size, WebGL buffer, selected and adaptive scale, FPS and P95 frame interval. Test near and distant targets, HUD legibility, touch response, sustained memory and thermal behavior on budget and midrange hardware. Keep LAN and lifecycle acceptance separately open. [DEV24 device sequence](DEV24-DEVICE-ACCEPTANCE.md)
