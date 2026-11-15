#!/usr/bin/env python3
"""Exact file inventory and SHA-256 of released Sightline V3 P11.1 source.
Run from any extracted folder; rejects unknown/missing/changed files.
"""
from pathlib import Path
import hashlib, sys
ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/'acceptance/P111-FINAL-SHA256SUMS.txt'

def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for buf in iter(lambda:f.read(1024*1024),b''):h.update(buf)
    return h.hexdigest()

def main():
    expected={}
    for lineno,line in enumerate(MANIFEST.read_text().splitlines(),1):
        if not line.strip():continue
        try: checksum,path=line.split('  ',1)
        except ValueError:raise ValueError(f'Malformed line {lineno}')
        rel=Path(path)
        if path in expected or not checksum or len(checksum)!=64 or not all(x in '0123456789abcdef' for x in checksum) or rel.is_absolute() or '..' in rel.parts:
            raise ValueError(f'Unsafe or duplicate line {lineno}')
        expected[path]=checksum
    actual={p.relative_to(ROOT).as_posix():p for p in ROOT.rglob('*') if p.is_file() and p!=MANIFEST and '__pycache__' not in p.parts}
    problems=[]
    for rel in sorted(set(expected)^set(actual)):
        problems.append(('MISSING' if rel in expected else 'UNEXPECTED')+' '+rel)
    for rel in sorted(set(expected)&set(actual)):
        if sha(actual[rel])!=expected[rel]:problems.append('CHANGED '+rel)
    if problems:
        print(f'FAIL: {len(problems)} release issues')
        print('\n'.join(problems[:30]))
        return 1
    print(f'PASS: {len(expected)}/{len(actual)} verified, exact file set, P11.1 manifest excluded')
    return 0

if __name__=='__main__':
    sys.exit(main())
