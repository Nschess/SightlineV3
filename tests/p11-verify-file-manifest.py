#!/usr/bin/env python3
"""P11 complete extracted-file SHA-256 and exact-set integrity verifier."""
from pathlib import Path
import hashlib,sys
ROOT=Path(__file__).resolve().parent.parent
MANIFEST=ROOT/'acceptance/P11-FINAL-SHA256SUMS.txt'
lines=MANIFEST.read_text(encoding='utf8').splitlines()
entries={}
for line in lines:
    h,rel=line.split('  ',1)
    assert len(h)==64 and rel not in entries and not rel.startswith('/'),line
    entries[rel]=h
actual={p.relative_to(ROOT).as_posix():p for p in ROOT.rglob('*') if p.is_file() and p!=MANIFEST}
missing=set(entries)-set(actual)
extra=set(actual)-set(entries)
bad=[]
for rel,h in entries.items():
    if rel in actual and hashlib.sha256(actual[rel].read_bytes()).hexdigest()!=h:bad.append(rel)
print(f'P11 complete file integrity: {len(entries)-len(missing)-len(bad)}/{len(entries)} PASS; missing={len(missing)}, unexpected={len(extra)}, mismatched={len(bad)}')
for name,items in [('missing',missing),('unexpected',extra),('mismatched',bad)]:
    for x in sorted(items)[:8]:print(name,x)
if missing or extra or bad:sys.exit(1)
