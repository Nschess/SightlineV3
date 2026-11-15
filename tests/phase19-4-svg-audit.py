"""Validate Phase 19.4 HUD vector assets and Android offline/LAN parity."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "design/mobile-hud-icons"
HOST = ROOT / "AndroidProject/app/src/main/assets/phone-host"
WWW = ROOT / "AndroidProject/app/src/main/assets/www"
ANDROID = ROOT / "AndroidProject"
EXPECTED = {
    "aim.svg", "close.svg", "fire.svg", "fire-2.svg", "jump.svg",
    "more.svg", "reload.svg", "slide.svg", "swap.svg",
}
NS = {"svg": "http://www.w3.org/2000/svg"}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


files = sorted(ICONS.glob("*.svg"))
assert {p.name for p in files} == EXPECTED
roots = {p.name: ET.parse(p).getroot() for p in files}
for name, svg in roots.items():
    assert svg.tag == f"{{{NS['svg']}}}svg", name
    assert svg.attrib.get("viewBox") == "0 0 64 64", name
    assert svg.find("svg:title", NS) is not None, name

fire_core = roots["fire.svg"].find("svg:g[@class='tb-icon-fire-core']", NS)
fire2_core = roots["fire-2.svg"].find("svg:g[@class='tb-icon-fire-core']", NS)
assert ET.tostring(fire_core) == ET.tostring(fire2_core)
assert roots["fire-2.svg"].find(".//svg:path[@class='tb-icon-secondary-mark']", NS) is not None

manifest_path = HOST / "SHA256SUMS"
manifest = {}
for line in manifest_path.read_text(encoding="ascii").splitlines():
    digest, name = line.split("  ", 1)
    asset = HOST / name
    assert asset.is_file() and sha256(asset) == digest, f"host asset hash mismatch: {name}"
    manifest[name] = digest
assert len(manifest) == 39

host_index = HOST / "index.html"
www_index = WWW / "index.html"
main_activity = ANDROID / "app/src/main/java/com/sightline/v3/MainActivity.java"
assert sha256(host_index) == manifest["index.html"]
assert host_index.read_bytes() == www_index.read_bytes()
assert sha256(host_index) in main_activity.read_text(encoding="utf-8-sig")

checked_paths = [
    "app/src/main/assets/phone-host/index.html",
    "app/src/main/assets/phone-host/SHA256SUMS",
    "app/src/main/assets/www/index.html",
    "app/src/main/java/com/sightline/v3/MainActivity.java",
]
current_lines = (ANDROID / "CURRENT-SOURCE-SHA256.txt").read_text(encoding="ascii").splitlines()
for rel in checked_paths:
    actual = sha256(ANDROID / rel)
    matches = [line.split("  ", 1)[0] for line in current_lines if line.endswith("  " + rel)]
    assert matches == [actual], f"current-source hash mismatch: {rel}"

result = {
    "status": "PASS",
    "svgFiles": len(files),
    "svgViewBox": "64x64",
    "fireAndFire2CoreIdentical": True,
    "fire2MarkerPresent": True,
    "offlineAndLanHtmlByteIdentical": True,
    "phoneHostManifestEntries": len(manifest),
    "phoneHostManifestHashes": "PASS",
    "currentSourcePins": "PASS",
}
output = ROOT / "evidence/phase19.4/svg-and-asset-validation.json"
output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
