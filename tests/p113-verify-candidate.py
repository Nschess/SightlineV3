#!/usr/bin/env python3
"""Independent complete-file integrity verifier for experimental P11.3 candidate; NOT P11.1 approval."""
from pathlib import Path
import hashlib,sys
ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/'acceptance/P113-FINAL-SHA256SUMS.txt'

def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    return h.hexdigest()

def main():
    expected={}
    for line in MANIFEST.read_text().splitlines():
        checksum,name=line.split('  ',1)
        p=Path(name)
        if name in expected or p.is_absolute() or '..' in p.parts or len(checksum)!=64:
            raise ValueError('unsafe or duplicate manifest entry')
        expected[name]=checksum
    present={p.relative_to(ROOT).as_posix():p for p in ROOT.rglob('*') if p.is_file() and p!=MANIFEST and '__pycache__' not in p.parts}
    errors=[]
    for n in set(expected)^set(present):errors.append('inventory mismatch '+n)
    for n in set(expected)&set(present):
        if sha(present[n])!=expected[n]:errors.append('hash mismatch '+n)
    print(('PASS' if not errors else 'FAIL')+': P11.3 candidate inventory: '+str(len(expected))+' expected, '+str(len(present))+' found')
    for e in errors[:20]:print(e)
    return int(bool(errors))
if __name__=='__main__':sys.exit(main())
