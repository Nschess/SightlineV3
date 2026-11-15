"""Create a source-only Sightline master ZIP without historical archive inputs.

Usage: python tests/package-provisional-master.py C:/path/to/output.zip
The destination must not already exist. Generated APK/build caches and the
historical archive/toolchain staging tree are intentionally excluded.
"""
from __future__ import annotations

import hashlib
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit("usage: python tests/package-provisional-master.py OUTPUT.zip")

destination = Path(sys.argv[1]).resolve()
if destination.exists():
    raise SystemExit(f"refusing to overwrite existing output: {destination}")
if destination.suffix.lower() != ".zip":
    raise SystemExit("destination must end in .zip")


def excluded(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    parts = rel.parts
    if not parts:
        return True
    if parts[0] in {"work", "android-sdk", "outputs"}:
        return True
    if parts[0] == "evidence" and (len(parts) < 2 or parts[1] != "phase8"):
        return True
    if len(parts) > 2 and parts[:3] == ("evidence", "phase8", "performance") and path.name != "gameplay-results.json":
        return True
    if parts[0] == "tests" and len(parts) > 1 and parts[1] == "phase8-tmp":
        return True
    if any(part in {".git", ".gradle", "build", "node_modules", "__pycache__"} for part in parts):
        return True
    if path.suffix.lower() in {".zip", ".apk", ".aab", ".pyc", ".class"}:
        return True
    if path.name in {"Thumbs.db", ".DS_Store"}:
        return True
    return False


files = sorted(p for p in ROOT.rglob("*") if p.is_file() and not excluded(p))
if any(p.is_symlink() for p in files):
    raise SystemExit("refusing to package symbolic links")
if not files:
    raise SystemExit("no source files selected")

manifest_lines = ["# SHA256  SIZE  PATH"]
for path in files:
    rel = path.relative_to(ROOT).as_posix()
    data_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest_lines.append(f"{data_hash}  {path.stat().st_size}  {rel}")
manifest = ("\n".join(manifest_lines) + "\n").encode("utf-8")

destination.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
    for path in files:
        archive.write(path, path.relative_to(ROOT).as_posix())
    archive.writestr("PACKAGE-CONTENTS-SHA256.txt", manifest)

with zipfile.ZipFile(destination) as archive:
    corrupt = archive.testzip()
    if corrupt:
        raise SystemExit(f"ZIP CRC failure: {corrupt}")
    names = archive.namelist()
    if any(name.lower().endswith((".zip", ".apk", ".aab")) for name in names):
        raise SystemExit("generated/source archive leaked into package")
    if "AndroidProject/app/src/main/assets/phone-host/index.html" not in names:
        raise SystemExit("phone-host game source missing")
    if "AndroidProject/app/src/main/assets/www/index.html" not in names:
        raise SystemExit("offline game source missing")
    if "AndroidProject/gradle/wrapper/gradle-wrapper.jar" not in names:
        raise SystemExit("Gradle wrapper JAR missing")
    if "evidence/phase8/review-results.json" not in names:
        raise SystemExit("Phase 8 verification evidence missing")

print(f"PASS source files: {len(files)}")
print(f"PASS ZIP CRC and required build/game/evidence paths: {len(names)} entries")
print(f"PASS package bytes: {destination.stat().st_size}")
print(f"SHA256: {hashlib.sha256(destination.read_bytes()).hexdigest()}")
print(f"OUTPUT: {destination}")
