#!/usr/bin/env python3
"""Verify extracted cumulative source manifest + required P8.5 visual evidence.
Does not assert subjective visual quality, APK compilation, or Android runtime.
"""
from pathlib import Path
import struct
import hashlib, json, sys
ROOT=Path(__file__).resolve().parents[1]
manifest=ROOT/'acceptance/P85-FINAL-FILE-SHA256SUMS.txt'
if not manifest.is_file():sys.exit('BLOCKED: P8.5 release manifest missing')
errors=[]; checked=set()
for line in manifest.read_text().splitlines():
 try:
  digest,rel=line.split('  ',1)
  p=Path(rel)
  if p.is_absolute() or '..' in p.parts or rel in checked or len(digest)!=64:
   raise ValueError('unsafe or duplicate release entry')
  f=ROOT/rel
  if not f.is_file() or hashlib.sha256(f.read_bytes()).hexdigest()!=digest:errors.append(rel)
  checked.add(rel)
 except Exception as e:errors.append(str(e))
actual={p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file() and p!=manifest}
if actual!=checked:errors.append(f'manifest coverage mismatch, unlisted={len(actual-checked)}, missing={len(checked-actual)}')
e=ROOT/'VISUAL-EVIDENCE/P85-PLAYER-FIRST'; prev=ROOT/'VISUAL-EVIDENCE/P84-ALL-GUNS/raw/candidate'
rows=json.loads((e/'P85-PER-GUN-VERDICTS.json').read_text())['weapons']
if len(rows)!=27:errors.append('expected 27 per-gun verdicts')
for x in rows:
 key=x['key']; sheet=e/'individual'/f'{key}-before-after.jpg'
 if not sheet.is_file():errors.append(f'missing comparison for {key}')
 for mode,dim in [('side',(850,320)),('idle',(907,508)),('ads',(907,508))]:
  a=prev/f'{key}-{mode}.png';b=e/'raw-after'/f'{key}-{mode}.png'
  if not a.is_file() or not b.is_file():errors.append(f'missing {key} {mode}')
  else:
   try:
    def size(png):
     with open(png,'rb') as stream: header=stream.read(24)
     if header[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('invalid PNG')
     return struct.unpack('>II',header[16:24])
    if size(a)!=dim or size(b)!=dim:errors.append(f'wrong frame dimensions {key} {mode}')
   except Exception as exc:errors.append(str(exc))
if hashlib.sha256((prev/'carbine-side.png').read_bytes()).hexdigest()!=hashlib.sha256((e/'raw-after/carbine-side.png').read_bytes()).hexdigest():errors.append('VR18 side screenshot not identical')
if errors:
 print('FAIL',errors[:12]);sys.exit(1)
print(f'PASS: {len(checked)} manifest-pinned files, 27 comparison sheets, 162 matched offline frames, frozen VR18 image')
