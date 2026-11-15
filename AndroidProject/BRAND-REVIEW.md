# Sightline V3 — Original mobile brand review

**Scope:** New source artwork and Android resource integration. These are original geometric explorations created for Sightline, not copied commercial-game assets. Trademark/marketplace clearance still requires owner review. The large earlier presentation image is a *mockup*, not release or test evidence.

| Concept | Idea | Small-size clarity | Strongest quality | Limitation | Decision |
|---|---|---|---|---|---|
| Tactical Operator | Helmet visor / geometric armor | Fair | Tactical genre signal | Detailed identity looks like many FPS operators at 24–32 px | Reject for launcher |
| **Precision Chevron** | Angular V mark with three orange sightline slashes | **Strong** | Immediate, clean recognition at 24–32 px; no text dependency | Abstract symbol requires Sightline V3 title elsewhere | **SELECTED** |
| Recon Horizon | Layered hexagonal recon/shield mark | Good | Distinctive geometry | Multiple nested marks become busy under small round masks | Alternate |

Visual review: `branding/THREE-CONCEPTS-COMPARISON.png` and `branding/ADAPTIVE-MASK-PREVIEW.png`. This is an independent design judgment, not measured user preference or trademark clearance.

## Implemented design system

- Palette: deep navy `#0B1522`, tactical cyan `#28BFEF`, bright white `#F4FAFF`, restrained orange `#FF864D`.
- Original SVG sources: `branding/selected-chevron.svg`, `branding/selected-monochrome.svg`.
- 108dp adaptive icon split into opaque brand background and transparent foreground. Symbol lies within Android's central 66dp safe zone; all typical circular and rounded masks preserve it.
- Transparent monochrome mark for themed icons (tested non-opaque background). Legacy square and round PNGs: mdpi 48, hdpi 72, xhdpi 96, xxhdpi 144, xxxhdpi 192 pixels.
- Android 12+ native splash: same icon on matching background. No extra splash Activity, timer, blocking animations or network fetches.
- Native launcher: matching compact image header; TalkBack description is present. All game/WebView assets are unchanged.

**Evidence limit:** Preview masks and pixel dimensions were inspected statically; actual Samsung One UI launcher masks, Android themed icon rendering, OS splash and app startup timing are **UNTESTED** until a real APK exists.
