#!/usr/bin/env python3
"""Verify the complete P8.3 handoff file tree against a self-excluding manifest."""
from pathlib import Path
import hashlib, sys
R=Path(__file__).resolve().parents[1]
M=R/'acceptance/P83-FINAL-FILE-SHA256SUMS.txt'
rows={}
try:
    for line in M.read_text(encoding='utf-8').splitlines():
        digest, rel=line.split('  ',1)
        p=Path(rel)
        if len(digest)!=64 or p.is_absolute() or '..' in p.parts or rel in rows:
            raise ValueError('invalid or duplicate manifest entry')
        rows[rel]=digest
    actual={p.relative_to(R).as_posix() for p in R.rglob('*') if p.is_file() and p!=M}
    missing=sorted(set(rows)-actual)
    extra=sorted(actual-set(rows))
    changed=[name for name, sha in rows.items() if (R/name).is_file() and hashlib.sha256((R/name).read_bytes()).hexdigest()!=sha]
    if missing or extra or changed:
        print('FAIL manifest:', 'missing',missing[:5], 'extra',extra[:5], 'modified',changed[:5])
        sys.exit(1)
    print(f'PASS full P8.3 extracted file integrity: {len(rows)}/{len(rows)} SHA-256 and exact file set')
except Exception as e:
    print('FAIL source manifest:',e)
    sys.exit(1)
