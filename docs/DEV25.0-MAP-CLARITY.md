# DEV25.0 Android map clarity

Rollback is DEV24.9 at 24c9034ae5f1a92e90491d5c9a7aa4b37b9acb6a.

In both Android asset trees, selected stone, brick, plaster, stucco and terrain surfaces now tile according to the dimensions of each face. The previous box-wide repeat projected many tiles onto narrow wall ends and used wall height to tile horizontal treads. The new mapping reuses a texture across affected boxes of different dimensions. It applies through the shared world builder used by all five game modes.

The selected surfaces use up to 2× anisotropic filtering on mobile Competitive and Balanced. High retains its existing sampler allowance. Ground and painted roads keep their original preset filtering because the first preview showed softer Courtyard floor lines at 2×. The existing mipmapped canvas textures and the DEV24.9 resolution budgets still apply.

## Isolated comparison

Courtyard and Horror City used the same fixed camera, 667 × 375 CSS viewport, simulated DPR 2.75, Competitive preset and mocked 90 FPS target. Both builds drew 1229 × 691 at effective DPR 1.84 and adaptive scale 100%. That is about 45% of the simulated 1834 × 1031 screen pixels. A separate full-DPR reference showed finer overall edges, consistent with the Competitive pixel budget contributing to full-scene softness. At equal resolution, Courtyard's narrow wall returns and Horror City's masonry read more clearly with the new UVs.

Nine warmed-up software WebGL draws per scene were timed with synchronous completion. Courtyard median was 76.5 → 76.8 ms and distinct world texture handles were 9 → 5. Horror City median was 118.1 → 115.0 ms and distinct world handles stayed at 11. Draw calls and rendered triangle counts matched each scene's baseline. These timings are fixed-scene software measurements. Physical acceptance still needs moving views, texture shimmer checks, sustained frame pacing and both directions of Android ↔ Windows LAN on actual phones.
