"""Create Phase 12 acceptance artifacts from actual-game render evidence."""
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat
import csv, json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "evidence" / "phase12"
P11 = ROOT / "evidence" / "phase11" / "claude-roster"
P12 = OUT / "current-game-roster"
P11_JSON = ROOT / "evidence" / "phase11" / "claude-roster-results.json"
P11_MATRIX = ROOT / "evidence" / "phase11" / "character-comparison-matrix.csv"
P12_JSON = OUT / "current-game-roster-benchmark-results.json"
CONTROL_JSON = OUT / "performance-control-results.json"

old = json.loads(P11_JSON.read_text(encoding="utf-8"))
current = json.loads(P12_JSON.read_text(encoding="utf-8"))
control = json.loads(CONTROL_JSON.read_text(encoding="utf-8"))
old_by_id = {c["id"]: c for c in old["characters"]}
new_by_id = {c["id"]: c for c in current["characters"]}
p11_review = {r["id"]: r for r in csv.DictReader(P11_MATRIX.open(encoding="utf-8-sig", newline=""))}
assert len(old_by_id) == 42 and len(new_by_id) == 42
assert set(old_by_id) == set(new_by_id) == set(p11_review)

matrix_path = OUT / "phase12-acceptance-matrix.csv"
diff_path = OUT / "phase11-phase12-image-comparison.csv"
diff_rows = []
matrix_rows = []
for cid in sorted(new_by_id):
    a = old_by_id[cid]
    b = new_by_id[cid]
    old_image = Image.open(P11 / a["file"]).convert("RGB")
    new_image = Image.open(P12 / b["file"]).convert("RGB")
    same_size = old_image.size == new_image.size
    diff = ImageChops.difference(old_image, new_image) if same_size else None
    exact = bool(same_size and diff.getbbox() is None)
    mae = round(sum(ImageStat.Stat(diff).mean) / 3, 6) if diff else None
    diff_rows.append({
        "id": cid, "name": b["name"], "same_dimensions": same_size,
        "pixel_identical": exact, "mean_absolute_rgb_delta": mae,
        "phase11_image": f"../phase11/claude-roster/{a['file']}",
        "phase12_image": f"current-game-roster/{b['file']}"
    })

    zombie = bool(b["zombie"])
    cells = b.get("cells", [])
    has_hit = bool(b.get("hitChecks", {}).get("torso", {}).get("hit") and
                   b.get("hitChecks", {}).get("head", {}).get("head"))
    matrix_rows.append({
        "id": cid,
        "name": b["name"],
        "faction": b.get("team", "infected"),
        "class_or_type": b.get("role", ""),
        "phase11_vs_phase9_design_improvement": p11_review[cid].get("design_improvement", ""),
        "identity_readability_phase11_and_12": p11_review[cid].get("identity_readability", ""),
        "phase11_triangles": a.get("bodyTriangles", ""),
        "phase12_triangles": b.get("bodyTriangles", ""),
        "geometry_fingerprint_phase12": b.get("fingerprint", ""),
        "design_improvement_phase12": "FAIL — Phase 12 introduces no character asset or geometry change; rerender is unchanged from Phase 11",
        "final_realism": "FAIL — faceted procedural body/face and Lambert-only character materials remain below realistic-art target",
        "pose_capture": f"PASS — {len(cells)} isolated actual-renderer pose/view cells captured; these are QA-injected poses, not live match interactions",
        "hit_region_probe": "PASS — head and torso probes passed in the isolated game renderer" if has_hit else "FAIL — head/torso probe failed",
        "live_weapon_grip_ads_fire_reload": "UNVERIFIED — pose renders do not exercise live weapon input or attachment motion",
        "phase12_screenshot": f"current-game-roster/{b['file']}",
        "notes": "Infected visual is preserved unchanged; no horror redesign was attempted before supplying an authored character asset." if zombie else "Phase 11 Claude design is preserved; distinct geometry fingerprint does not establish gameplay-distance readability."
    })

with diff_path.open("w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(diff_rows[0]))
    w.writeheader(); w.writerows(diff_rows)
with matrix_path.open("w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(matrix_rows[0]))
    w.writeheader(); w.writerows(matrix_rows)

# Compact visual evidence: identical camera cell, all characters side by side.
items = [new_by_id[cid] for cid in sorted(new_by_id)]
cols, tile_w, tile_h, label_h = 6, 320, 236, 22
rows = (len(items) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tile_w, rows * (tile_h + label_h)), "#17212b")
draw = ImageDraw.Draw(sheet)
for i, c in enumerate(items):
    im = Image.open(P12 / c["file"]).convert("RGB")
    # The actual-game contact sheet's fourth cell is the matching three-quarter idle view.
    crop = im.crop((960, 48, 1280, 284))
    x, y = (i % cols) * tile_w, (i // cols) * (tile_h + label_h)
    sheet.paste(crop, (x, y + label_h))
    draw.text((x + 6, y + 4), f"{c['name']} · {c.get('team', 'infected')}", fill="#e8edf1")
sheet.save(OUT / "phase12-current-roster-contact-sheet.jpg", quality=92)

# Face panels are crops of the face cell from each actual-game sheet.
humans = [c for c in items if not c["zombie"]]
infected = [c for c in items if c["zombie"]]
def face_sheet(characters, filename, cols):
    tile_w, tile_h, label_h = 320, 236, 22
    rows = (len(characters) + cols - 1) // cols
    canvas = Image.new("RGB", (cols * tile_w, rows * (tile_h + label_h)), "#17212b")
    d = ImageDraw.Draw(canvas)
    for i, c in enumerate(characters):
        im = Image.open(P12 / c["file"]).convert("RGB")
        face = im.crop((640, 284, 960, 520))
        x, y = (i % cols) * tile_w, (i // cols) * (tile_h + label_h)
        canvas.paste(face, (x, y + label_h))
        d.text((x + 6, y + 4), f"{c['name']} · {c.get('team', 'infected')}", fill="#e8edf1")
    canvas.save(OUT / filename, quality=93)
face_sheet(humans, "phase12-human-face-closeups.jpg", 6)
face_sheet(infected, "phase12-infected-face-closeups.jpg", 4)

# P11/P12 pair sheet uses the same camera crop and size for every character.
pair_w, pair_h, pair_label = 320, 118, 20
pairs = Image.new("RGB", (cols * pair_w, rows * (pair_h + pair_label)), "#17212b")
pd = ImageDraw.Draw(pairs)
for i, cid in enumerate(sorted(new_by_id)):
    a, b = old_by_id[cid], new_by_id[cid]
    x, y = (i % cols) * pair_w, (i // cols) * (pair_h + pair_label)
    pd.text((x + 4, y + 2), f"{b['name']} · Phase 11 | Phase 12", fill="#e8edf1")
    for side, folder, c in ((0, P11, a), (1, P12, b)):
        im = Image.open(folder / c["file"]).convert("RGB").crop((960, 48, 1280, 284))
        im.thumbnail((pair_w // 2, pair_h), Image.Resampling.LANCZOS)
        pairs.paste(im, (x + side * (pair_w // 2), y + pair_label))
pairs.save(OUT / "phase11-vs-phase12-roster-pairs.jpg", quality=91)

summary = {
    "phase": "Phase 12 current-game recapture",
    "active_game_source_changed_for_character_art": False,
    "renderer": current.get("renderer"),
    "capture_pass": current.get("pass"),
    "characters": len(new_by_id),
    "humans": sum(not c["zombie"] for c in current["characters"]),
    "infected": sum(bool(c["zombie"]) for c in current["characters"]),
    "same_camera_pose_exact_image_matches": sum(r["pixel_identical"] for r in diff_rows),
    "same_camera_pose_image_comparisons": len(diff_rows),
    "all_images_pixel_identical": all(r["pixel_identical"] for r in diff_rows),
    "mean_absolute_rgb_delta_across_roster": round(sum(r["mean_absolute_rgb_delta"] for r in diff_rows) / len(diff_rows), 6),
    "max_absolute_rgb_delta_for_one_character": max(r["mean_absolute_rgb_delta"] for r in diff_rows),
    "all_geometry_fingerprints_unchanged": all(old_by_id[cid].get("fingerprint") == new_by_id[cid].get("fingerprint") for cid in new_by_id),
    "all_body_triangle_counts_unchanged": all(old_by_id[cid].get("bodyTriangles") == new_by_id[cid].get("bodyTriangles") for cid in new_by_id),
    "phase11_summary": old.get("summary"),
    "phase12_summary": current.get("summary"),
    "phase12_benchmark": control.get("benchmark"),
    "phase12_full_roster_benchmark": current.get("benchmark")
}
(OUT / "phase12-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

report = f"""# Sightline V3 — Phase 12 Character Detail and Identity Assessment

## Decision

**Stopped before further procedural character edits.** The Phase 11 builder already meets the stop condition in the user request: the actual game still renders faceted procedural heads and faces with `MeshLambertMaterial`, and the asset tree contains no authored `.glb`, `.gltf`, `.fbx`, or `.obj` character model. Adding more primitive facial and cloth pieces would repeat the rejected cosmetic-geometry loop. No character source, gameplay source, or original archive was changed in Phase 12.

Phase 12 did produce a fresh 42-character capture through the playable game renderer and compared it to Phase 11 at matched camera cells. This is a baseline verification, **not** a visual improvement claim.

## Actual renderer and capture

- Active human path: `AndroidProject/app/src/main/assets/phone-host/index.html` loads `character-realism.js`; `buildRig -> bakeOp -> makeUnit` uses the Claude procedural builder for humans and preserves the legacy fallback.
- Offline path: `AndroidProject/app/src/main/assets/www/index.html` and its mirrored `character-realism.js` remain parity checked.
- Renderer: bundled Three.js r128; the active character material construction is `MeshLambertMaterial`. Three.js includes `MeshStandardMaterial`/`MeshPhysicalMaterial` implementation, but the current character module has no standard/physical materials or normal/roughness/metalness maps. No `GLTFLoader` bundle or character mesh file was found in the candidate.
- Isolated Chromium/SwiftShader rerender: **{len(new_by_id)}/42 sheets**, **34 human / 8 infected**, zero page errors, all head/torso probes pass. Each sheet has front, back, side, three-quarter, mid, distance and face views plus game `mpPuppetStep` movement/crouch/aim/fire/reload poses for humans and walk/run/attack poses for infected. These QA-injected poses do not prove live input, weapon grip, firing, or reload acceptance.
- Phase 11 to Phase 12: same renderer, camera cells and pose set. JPEG recaptures are not byte-identical (**{summary['same_camera_pose_exact_image_matches']}/42**), with mean RGB delta **{summary['mean_absolute_rgb_delta_across_roster']:.2f}/255** per character. **All 42 geometry fingerprints and triangle counts are unchanged.** This small recapture variance is not a design change. Therefore Phase 12 design improvement is FAIL for all 42; final realistic-art approval is FAIL for all 42.

## Character-by-character results

See `phase12-acceptance-matrix.csv` for all 42 IDs, triangle counts, rendered evidence, pose-capture status, hit-region probe result, separate visual-improvement/final-realism decisions, and live-gameplay verification status. `phase11-phase12-image-comparison.csv` records per-character matched-image equality and image deltas. Full 1280×1000 actual-game sheets are in `current-game-roster/`; the two contact sheets show a matched three-quarter idle camera view.

![Phase 12 current in-game roster](phase12-current-roster-contact-sheet.jpg)

![Phase 11 and Phase 12 matched character captures](phase11-vs-phase12-roster-pairs.jpg)

![Human face close-ups from the actual game renderer](phase12-human-face-closeups.jpg)

![Infected face close-ups from the actual game renderer](phase12-infected-face-closeups.jpg)

Human designs retain Phase 11's richer equipment layering and 34 distinct mesh fingerprints, but many characters still share archetype silhouettes and the close-up facial construction is visibly stylized. The eight infected remain unchanged; their gameplay is preserved, but their current green, low-poly forms do not meet realistic horror art approval.

## Performance

The measured scene triangle total remains **428,526 vs 360,094** for the Phase 9 baseline (**+19.0%**), with **208 draw calls** and no added draw-call count. The Phase 12 roster recapture uses **272 cached geometries** after constructing all 42 characters. For an apples-to-apples timing check, the controlled Phase 12 run captured only the same two prototypes before benchmarking the same 24-actor scene (90 frames/run, three runs): median **{summary['phase12_benchmark']['medianMs']:.1f} ms**, p95 **{summary['phase12_benchmark']['p95Ms']:.1f} ms**, p99 **{summary['phase12_benchmark']['p99Ms']:.1f} ms**. Phase 11 measured median 12.9 ms, p95 27.1 ms, p99 43.3 ms. Median is unchanged, but Phase 12's p95/p99 are higher and remain an unresolved frame-time-tail risk. The all-roster run had a 15.4 ms median and 39.3/63.4 ms p95/p99 after all models were cached. These are software-renderer command-submission timings, not hardware FPS or Android performance. No character source changed; the measurements do not identify a code regression. No detail was removed because it would not solve the realism gap and could damage approved Phase 11 art.

## Regression and build verification

| Check | Result |
|---|---|
| Core game regression suite | PASS — 6/6 |
| Infection evasion tests | PASS — 3/3 |
| Outbreak integration tests | PASS — 3/3 |
| Authoritative combat feature parity | PASS — 16/16 |
| Android/offline and phone-host asset hashes | PASS — 39/39 staged assets; 12/12 shared modules |
| Android source/XML static QA | PASS — 18 scripts, 8 XML files; baseline digest comparison skipped because its archive is unavailable |
| LAN protocol harness | BLOCKED — invoked against the phone-host root; server printed its ready banner, but the isolated test did not receive `/status` on loopback within its timeout (2 checks, server-start check failed). Not a physical LAN test. |
| Combat milestone QA | FAIL / applicability unresolved — after fixing its Windows UTF-8 and null-regex harness crashes, 30/39 checks pass. The four `tb-fire-alt`/pointer ownership checks fail; five other checks target an older asset digest, recoil, zombie spawn/telegraph, and wrapper state. The referenced milestone documentation and runtime tests describe dual-fire as implemented, while Phase 9/11 game HTML has no alternate-fire control. That does not confirm the assertion is stale, so it remains and no gameplay was edited. |
| Android debug APK | BLOCKED — `build-debug.bat` was attempted and stopped at missing isolated JDK 17. `java`, `javac`, Gradle, `adb`, `sdkmanager`, `ANDROID_HOME` and `ANDROID_SDK_ROOT` are absent from the isolated runtime. The project contains a wrapper JAR, but the bootstrap still requires Gradle 8.13 and SDK Platform 36. Build/signature/device checks were not performed. |
| Physical Android, device FPS, real LAN | UNVERIFIED |

## Phase 12 file changes

- `AndroidProject/qa/check_combat_milestone.py`: made UTF-8 parsing explicit and guarded the missing `HUD_EDIT_IDS` match so the legacy check reports failures instead of crashing. No `tb-fire-alt` assertion was removed or weakened.
- `tests/phase12_build_evidence.py`: evidence-only script that writes the 42-row matrix, matched-image deltas and contact sheets from saved renderer outputs.
- `evidence/phase12/`: screenshots, JSON and CSV results, contact sheets and this report.
- No game renderer, character, combat, Android asset, or historical archive file was changed.

## Exact requirements to resume realistic character art

1. Provide or author one original, commercial-use-cleared rigged humanoid GLB for the military operator and one for the irregular fighter, with documented creator/source/license and modification rights. Include UVs and original texture sources.
2. Supply 2K or mobile-scaled base-color, tangent-space normal, roughness and metallic/ORM maps for skin, cloth, polymer, leather and metal; include authored face/eye/hair meshes and hands/fingers, not only palette swaps.
3. Define a compatible humanoid skeleton/animations or a retarget map to Sightline's existing movement, aim, fire and reload states. Provide weapon-hand and attachment sockets and keep existing collision/hit-region proxies independent of render LOD.
4. Integrate the version-compatible bundled `GLTFLoader` locally (no runtime network access), verify offline and phone-host asset/hash registration, and create LOD/texture budgets for Android WebView.
5. Review both prototypes in actual game WebGL at close-up and gameplay distance. Expand to the rest of the roster only after face, material, animation, hand grip, clipping and performance acceptance pass.
6. Restore isolated JDK 17, Gradle 8.13 and Android SDK Platform 36 before claiming clean APK verification.

No release ZIP, master approval, or archive cleanup is produced by this phase.
"""
(OUT / "PHASE12-CHARACTER-ASSESSMENT.md").write_text(report, encoding="utf-8")
print(json.dumps(summary, indent=2))
print(f"matrix={matrix_path}")
print(f"imageComparison={diff_path}")
print(f"report={OUT / 'PHASE12-CHARACTER-ASSESSMENT.md'}")
