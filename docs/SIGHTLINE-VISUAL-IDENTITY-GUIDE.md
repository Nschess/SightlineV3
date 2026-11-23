# Sightline V3 Visual Identity Guide

This guide records the procedural character direction used by the isolated character-visuals reconstruction branch. It describes the current implementation; it does not claim legal uniqueness, exclusive ownership, or commercial clearance.

## Shared language

- Build characters from compact, readable silhouettes and layered field equipment rather than ornamental detail.
- Use worn matte cloth, subdued polymer, dull metal and restrained signal-color accents. Reserve bright bioluminescent color for the Hollowed identity already established in game.
- Keep faction identity legible through shape, kit arrangement and original abstract markings as well as palette.
- Prefer details baked into the existing body/arm meshes and cloth atlas. Do not add per-frame work, external assets, new materials or extra render objects for purely visual marks.
- Keep faces, uniforms, faction signs and equipment independently authored. Do not trace or reproduce a recognizable third-party character, logo, uniform, skin or visual motif.

## Factions and enemy forms

| Group | Silhouette and equipment language | Color and surface language | Source cues |
| --- | --- | --- | --- |
| Tidewatch | Paired low-profile shoulder shells; paired crown rails on field helmets; compact, balanced field kit | Stone/field colors with a quiet blue-green signal index; broken channel-line textile weave and three-bar chest mark | `character-realism-v12.js`: `paintFactionWeave`, `buildHeadgear`, `buildBody` |
| Cinder Pact | Irregular field kit with a single left shoulder mantle rather than mirrored armor | Earth/rust palette; interrupted angular weave and a split diagonal chest mark | `character-realism-v12.js`: `paintFactionWeave`, `buildBody` |
| Hollowed | Leaning organic forms remain type-specific: the walker has a small dorsal scapular spur; the spitter has paired throat glands and ducts | Desaturated tissue with sparse seeded branching marks; the existing bloom accent remains controlled | `character-realism-v12.js`: `paintFactionWeave`, `buildZombie` |

## Geometry and mobile budget

Faction shoulder details are part of the two existing pose-driven arm builders; helmet and chest details remain in the existing body builder. Hollowed details are added to the existing zombie body builder before its existing lean transform. The details do not change rig anchors, hitboxes, weapon alignment, animation logic, mesh count, material count, texture dimensions or quality settings. New tessellation uses the current quality helper where available. Automated checks validate finite builder arrays, indices, faction/type exclusivity, rig-anchor source constants, a bounded Tidewatch detail vertex count and byte-identical Android builder copies.

These are source-level checks only. No rendered visual review, physical Android measurement, or gameplay acceptance was performed for this reconstruction.

## Provenance and rights

The new details and weave strokes are procedural JavaScript authored in the project source for this task. No external geometry, images, textures, fonts, sounds or libraries were introduced. The existing Three.js dependency remains separately documented in the rights inventory. The source contribution and generated result still require the legal publisher/contributor grant and any applicable reference-source confirmation recorded there before commercial release. Do not mark these additions or the full character family cleared based only on their procedural construction.
