#!/usr/bin/env python3
"""Verify P10.1 against immutable P10 hash inventory and exact rollback bytes."""
from pathlib import Path
import hashlib,json,sys
ROOT=Path(__file__).resolve().parents[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
lock=json.loads((ROOT/'workflow/APPROVED-P101-CHANGES.json').read_text())
allowed={Path(x['path']).relative_to(ROOT.name).as_posix():x for x in lock['changes']+lock['p10_additions']}
if len(allowed)!=8:sys.exit('FAIL: P10.1 allowlist must contain eight uniquely changed sources')
source=(ROOT/'acceptance/P10-FINAL-FILE-SHA256SUMS.txt').read_text().splitlines()
checks=0;changes=[];errors=[]
for line in source:
 try:
  digest,rel=line.split('  ',1)
  p=ROOT/rel
  if rel.startswith('/') or '..' in Path(rel).parts or not p.is_file():raise ValueError('missing/unsafe '+rel)
  record=allowed.get(rel)
  expected=record['p101_sha256'] if record else digest
  if record:
   if record['p10_sha256']!=digest:raise ValueError('P10 baseline mismatch '+rel)
   rollback=ROOT/'rollback/P101-P10-EXACT-FILES'/rel
   if not rollback.is_file() or sha(rollback)!=digest:raise ValueError('missing rollback '+rel)
   changes.append(rel)
  if sha(p)!=expected:raise ValueError('modified/unpinned '+rel)
  checks+=1
 except Exception as ex:errors.append(str(ex))
if set(changes)!=set(allowed):errors.append('Unaccounted P10.1 source changes: '+repr(set(allowed)-set(changes)))
if len(source)!=974:errors.append('Unexpected immutable P10 file manifest length: '+str(len(source)))
print('P10.1 overlay', 'PASS' if not errors else 'FAIL', 'baseline files:',checks,'pinned changes:',len(changes),'rollback copies:',len(changes))
if errors:print('\n'.join(errors[:15]));sys.exit(1)
