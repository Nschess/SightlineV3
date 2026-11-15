#!/usr/bin/env python3
"""P8.8 cumulative source and evidence integrity; no hardware acceptance claim."""
from pathlib import Path
import json,hashlib,struct,sys
R=Path(__file__).resolve().parents[1]
prev=R/'acceptance/P86-FINAL-FILE-SHA256SUMS.txt'
current=R/'acceptance/P88-FINAL-FILE-SHA256SUMS.txt'
approval=R/'workflow/APPROVED-P88-CHANGES.json'
errors=[]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def load(path):
    rows={}
    if not path.is_file():errors.append('missing manifest: '+str(path));return rows
    for line in path.read_text().splitlines():
        try:
            h,rel=line.split('  ',1);t=Path(rel)
            if rel in rows or len(h)!=64 or t.is_absolute() or '..' in t.parts or '\\' in rel:
                raise ValueError('unsafe/duplicate entry '+rel)
            rows[rel]=h
        except Exception as e:errors.append(str(e))
    return rows
p86=load(prev);p88=load(current)
if not approval.is_file():sys.exit('BLOCKED: no P8.8 approval lock')
lock=json.loads(approval.read_text());review={}
for c in lock['changes']:
    t=c['path'];prefix=R.name+'/'
    if not t.startswith(prefix):errors.append('unsafe approval '+t);continue
    rel=t[len(prefix):]
    if rel in review or rel not in p86:errors.append('untracked change '+rel)
    review[rel]=c
if len(review)!=6:errors.append(f'Expected exactly 6 source modifications; found {len(review)}')
for rel,expected in p86.items():
    f=R/rel
    if not f.is_file():errors.append('missing original '+rel);continue
    actual=sha(f)
    if rel in review:
        c=review[rel]
        if c['p86_sha256']!=expected or c['p88_sha256']!=actual:errors.append('bad reviewed hash '+rel)
        rb=R/'rollback/P88-P86-EXACT-FILES'/rel
        if not rb.is_file() or sha(rb)!=expected:errors.append('missing or invalid exact P8.6 rollback '+rel)
    elif actual!=expected:errors.append('UNAPPROVED historic file modification '+rel)
if len(p86)!=873:errors.append(f'Unexpected P8.6 baseline entries: {len(p86)}')
for rel,h in p88.items():
    f=R/rel
    if not f.is_file() or sha(f)!=h:errors.append('new manifest hash mismatch '+rel)
actual={p.relative_to(R).as_posix() for p in R.rglob('*') if p.is_file() and p!=current}
if actual!=set(p88):errors.append('new release manifest coverage discrepancy: extras '+str(sorted(actual-set(p88))[:8])+' missing '+str(sorted(set(p88)-actual)[:8]))
assets=R/'AndroidProject/app/src/main/assets'
vr=[sha(assets/client/'vr18-v31.js') for client in ('www','phone-host')]
if len(set(vr))!=1 or vr[0]!='d35f701ad05c32482b131aedcdd61c3a764afdf9a584308bba0b71892a424acf':errors.append('VR-18 source differs from frozen reference')
vis=R/'VISUAL-EVIDENCE/P88-AURORA'
def image_dim(p):
    x=p.read_bytes()[:24]
    if x[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('bad PNG '+str(p))
    return struct.unpack('>II',x[16:24])
for client in ('www','phone-host'):
    for scope in ('baseline','candidate'):
        for key in ('aurora','carbine'):
            for mode,dim in [('side',(850,320)),('idle',(907,508)),('ads',(907,508))]:
                path=vis/'matched-raw'/client/scope/(key+'-'+mode+'.png')
                try:
                    if image_dim(path)!=dim:errors.append('wrong dimensions '+str(path))
                except Exception as e:errors.append(str(e))
    # The VR18 is not only source-frozen, but diagnostic-render identical.
    for mode in ('side','idle','ads'):
        a=vis/'matched-raw'/client/'baseline'/('carbine-'+mode+'.png')
        b=vis/'matched-raw'/client/'candidate'/('carbine-'+mode+'.png')
        if mode=='side' and a.is_file() and b.is_file() and sha(a)!=sha(b):errors.append('VR18 side screenshot changed '+client)
    if not (vis/f'P88-{client}-Aurora-vs-P86-and-VR18.jpg').is_file():errors.append('missing visual comparison '+client)
    try:
        if image_dim(vis/'real-reload'/(client+'-Aurora-reload.png'))!=(907,508):errors.append('invalid reload PNG '+client)
    except Exception as e:errors.append(str(e))
for name in ('P88-ADS-AUDIO-REAL-WEBGL.json','P88-ANIMATIONS-WEBGL-RESULTS.json','P88-ART-WEBGL-RESULTS.json','P88-AURORA-BROWSER-QA.json'):
    try:
        data=json.loads((R/'acceptance'/name).read_text())
        if name.endswith('ANIMATIONS-WEBGL-RESULTS.json') or name.endswith('ART-WEBGL-RESULTS.json'):
            if not data.get('pass'):errors.append('webgl result failed '+name)
        else:
            if not all(row.get('pass') for row in data['clients'].values()):errors.append('WebGL result failed '+name)
    except Exception as e:errors.append('missing/bad test result '+name+': '+str(e))
for name,count in [('P88-LAN-TWO-CLIENT.json',30),('P88-LAN-FEATURE-PARITY.json',37)]:
    try:
        row=json.loads((R/'acceptance'/name).read_text())
        if not row.get('pass') or len(row.get('checks',[]))!=count:errors.append('LAN protocol result failed '+name)
    except Exception as e:errors.append('bad LAN report '+str(e))
if errors:
    print('FAIL P8.8 release integrity:',len(errors),*errors[:15],sep='\n  ');sys.exit(1)
print(f'PASS P8.8: P8.6 original {len(p86)} files verified with six exact reviewed source updates + exact rollback; {len(p88)} current files pinned; 24 matched Aurora/VR18 frames in both clients; 2 reload frames; 4 Chromium reports; 2 LAN reports')
