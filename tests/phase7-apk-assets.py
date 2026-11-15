"""Verify built APK assets are byte-identical to the Android source assets."""
from pathlib import Path
import hashlib
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
APK = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "AndroidProject/app/build/outputs/apk/debug/app-debug.apk"
SRC = ROOT / "AndroidProject/app/src/main/assets"
files = sorted(p for p in SRC.rglob("*") if p.is_file())
failures = []
with zipfile.ZipFile(APK) as zf:
    names = set(zf.namelist())
    for source in files:
        rel = source.relative_to(SRC).as_posix()
        apk_name = f"assets/{rel}"
        if apk_name not in names:
            failures.append(f"missing: {apk_name}")
            continue
        expected = hashlib.sha256(source.read_bytes()).hexdigest()
        actual = hashlib.sha256(zf.read(apk_name)).hexdigest()
        if actual != expected:
            failures.append(f"hash mismatch: {apk_name}")

if failures:
    print(f"FAIL {len(files)-len(failures)}/{len(files)} APK asset hashes match")
    print("\n".join(failures))
    raise SystemExit(1)

print(f"PASS {len(files)}/{len(files)} APK assets byte-match Android source")
print(f"PASS APK: {APK} ({APK.stat().st_size} bytes)")
