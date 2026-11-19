# DEV24.5 mobile renderer

Rollback is DEV24.4 at 71a1945c8ee826043806eb1478f7c83a817655dd. Android offline and phone-host clients use the same quality policy for Tactical, Free-for-All, Bomb Defusal, Outbreak and Infection.

- Balanced applies the saved render scale before the final pixel ceiling. Its 60 FPS ceiling is 1.15 million pixels and Low keeps the previous budget. High keeps its larger budget and raises anisotropic filtering up to 8× where the GPU supports it. Adaptive quality still reduces effects and shadows first.
- Map surfaces reuse textures with identical source and UV repeat, releasing them on map change. Capable WebGL 2 devices reporting at least 4 GB of RAM paint the existing operator and zombie atlases at 384 px instead of 256 px. The atlas tier is stable through map, mode and preset changes. First-person sleeve camo is painted at 128 px using its existing pattern. Mobile shadow map sizes are capped when shadows are explicitly enabled.
- An offline Outbreak zombie with a stale target and cleared sight memory now follows the existing recovery path. This avoids a null dereference without changing how zombies acquire targets or how the LAN server simulates them.

## Isolated evidence

At 667 × 375 CSS pixels, DPR 2.75 and saved render scale 90%, the Balanced Infection buffer increased from 1341 × 754 to 1410 × 793. The number of distinct Courtyard world textures in the rendered scene fell from 25 to 9. Outbreak rendered active zombies with 384 px atlas textures. These observations use software WebGL. Browser timing samples in this environment vary sharply and cannot establish Android frame pacing.

The larger buffer increases mobile fill work. Each upgraded atlas has 2.25× the texel count of the prior mobile atlas, so measure memory after repeated matches and map changes. The map texture reuse reduces allocations but the total savings depend on the map. Hardware antialiasing remains disabled on mobile. Map fog and lighting retain their authored values.

Before acceptance, compare Balanced and High on the same phone and scenes at a fixed frame cap. Capture drawing-buffer dimensions, FPS, P95 frame interval, memory and thermals over sustained sessions. Verify moving sights and combat-distance enemies, including dark maps, and rerun the physical touch and two-way LAN acceptance checks.
