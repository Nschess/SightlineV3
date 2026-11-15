#!/usr/bin/env python3
"""P8.4 exact-file SHA256/CRC-agnostic source tree check (standard library only).
Original P8.3 historical manifest is intentionally retained as a rollback record.
"""
import pathlib, hashlib, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
MANIFEST=ROOT/'acceptance/P84-FINAL-FILE-SHA256SUMS.txt'
try:
    expected={}
    for line in MANIFEST.read_text(encoding='utf8').splitlines():
        sha,name=line.split('  ',1)
        p=pathlib.PurePosixPath(name)
        if len(sha)!=64 or not p.parts or p.is_absolute() or '..' in p.parts or name in expected:
            raise ValueError('Malformed or duplicated filename in manifest')
        expected[name]=sha
    actual={p.relative_to(ROOT).as_posix():p for p in ROOT.rglob('*') if p.is_file() and p!=MANIFEST}
    missing=set(expected)-set(actual)
    extra=set(actual)-set(expected)
    modified=[name for name,sha in expected.items() if name in actual and hashlib.sha256(actual[name].read_bytes()).hexdigest()!=sha]
    if missing or extra or modified:
        print('FAIL P8.4 integrity', 'missing',sorted(missing)[:6], 'extra',sorted(extra)[:6], 'modified',modified[:6]);sys.exit(1)
    print(f'PASS P8.4 exact tree and per-file SHA256: {len(expected)}/{len(expected)}')
except Exception as e:
    print('FAIL P8.4 integrity',str(e));sys.exit(1)
