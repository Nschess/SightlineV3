# DEV21 Android visual clarity

## Confirmed rendering differences

On the DEV20.1 mobile path, DPR was clamped to 1.5 before the default 85% render scale and adaptive reductions. That put a DPR 2.75 viewport at a ratio of 1.275 even with room in its pixel budget. On budget-limited viewports, the old order could also hide the first adaptive reductions because the output was still pinned to the same ceiling. The touch renderer disables MSAA and defaults to shadows off. Desktop uses its existing 1.75 DPR ceiling, MSAA and shadow policy.

The two trees use the same Three.js renderer, map fog and material paths. Color textures retain their mipmap/filter settings and existing anisotropy, including 4× on common terrain textures and 8× on the procedural grit texture path where supported. The gameplay renderer does not run a blur or sharpening postprocess. The saved low-resolution fallback intentionally limits the buffer to 600,000 mobile pixels at higher frame rates. The old 60 FPS shortcut also shortened the fog horizon on mobile.

## Source changes

- Graphics → Low, Balanced and High set distinct mobile DPR and pixel ceilings. Mobile presets keep shadows off, effects low and use the normal fog horizon. The frame rate cap stays a separate setting. Selecting a preset clears the explicit low-resolution fallback.
- Render scale and adaptive reductions apply to the bounded mobile target, after its device DPR, preset and pixel limits. Existing explicit scale choices are retained. New mobile settings default to Balanced at 90%.
- Mobile resize allocates once when dimensions or ratio change and skips duplicate writes. The camera aspect still follows the CSS stage. The performance report reads actual WebGL buffer dimensions as well as CSS and device dimensions.
- Shader, texture, MSAA, character, weapon, HUD, touch and gameplay behavior keep their existing paths. Desktop resolution policy and presets remain as before.

## Isolated evidence

A dedicated headless Chromium run used software WebGL and a 667 × 375 CSS viewport at DPR 2.75 (about 1834 × 1031 device pixels). Both captures were live Infection during incubation, using the same saved 85% scale and adaptation disabled to expose the buffer target. The visible bot poses and draw work differed.

| Metric | DEV20.1 | DEV21 Balanced |
| --- | ---: | ---: |
| WebGL buffer | 850 × 478 | 1020 × 573 |
| Buffer pixels | 406,300 | 584,460 |
| One RGBA8 color buffer, estimate | 1.55 MiB | 2.23 MiB |
| Frame interval P95 | 583.4 ms | 583.3 ms |
| Frame interval P99 | 766.6 ms | 2,999.9 ms |
| Sampled JavaScript heap | 51.4 MiB | 74.6 MiB |

The buffer gained about 44% more pixels without exceeding the preset limits. The color buffer estimate excludes depth, compositor surfaces and driver allocations. The timing and heap figures are short software-renderer samples with different visible geometry. They establish neither a device FPS result nor the cause of the heap difference.

## Remaining acceptance

Use a matching device build to compare the presets in the same Infection scene on lower-end and capable Android hardware. Capture motion clarity, actual buffer size, frame intervals, touch response and memory across a sustained session. Verify physical landscape and continue both DEV20 LAN acceptance directions. This is a source checkpoint.
