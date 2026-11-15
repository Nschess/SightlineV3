#!/usr/bin/env python3
"""Cumulative P8.6 source/hash + visual-evidence verifier. Python stdlib only.
The historical P8.5 manifest remains immutable, with six reviewed overlays.
Does not run a browser or assert subjective visual quality, genuine samples or APK readiness.
"""
from pathlib import Path
import json,hashlib,struct,sys
R=Path(__file__).resolve().parents[1]
old=R/'acceptance/P85-FINAL-FILE-SHA256SUMS.txt'
manifest=R/'acceptance/P86-FINAL-FILE-SHA256SUMS.txt'
approval=R/'workflow/APPROVED-P86-CHANGES.json'
errors=[]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def read_manifest(path):
    data={}
    for line in path.read_text().splitlines():
        try:
            digest,rel=line.split('  ',1)
            p=Path(rel)
            if (rel in data or len(digest)!=64 or p.is_absolute() or '..' in p.parts or
                p.parts[0] in ('', '.') or '\\' in rel):raise ValueError('invalid or duplicate path')
            data[rel]=digest
        except Exception as e:errors.append('invalid manifest line: '+str(e))
    return data
if not old.is_file() or not manifest.is_file() or not approval.is_file():
    sys.exit('BLOCKED: expected P8.5 baseline, P8.6 release manifest and overlay missing')
prior=read_manifest(old);latest=read_manifest(manifest);app=json.loads(approval.read_text())
review={}
for change in app['changes']:
    path=change['path'];prefix=R.name+'/'
    if not path.startswith(prefix):errors.append('unsafe overlay '+path);continue
    rel=path[len(prefix):]
    if rel in review or rel not in prior:errors.append('untracked or duplicate overlay '+rel)
    review[rel]=change
if len(review)!=7:errors.append('expected seven exact P8.5 source changes, found '+str(len(review)))
for rel,expected in prior.items():
    dest=R/rel
    if not dest.is_file():errors.append('missing original '+rel);continue
    actual=sha(dest)
    if rel in review:
        if review[rel]['p85_sha256']!=expected or review[rel]['p86_sha256']!=actual:errors.append('overlay does not match '+rel)
    elif actual!=expected:errors.append('unexpected P8.5 modification '+rel)
for rel,expected in latest.items():
    dest=R/rel
    if not dest.is_file() or sha(dest)!=expected:errors.append('P8.6 missing/changed '+rel)
files={p.relative_to(R).as_posix() for p in R.rglob('*') if p.is_file() and p!=manifest}
if files!=set(latest):errors.append(f'release manifest coverage: {len(files-set(latest))} extra, {len(set(latest)-files)} missing')
visual=R/'VISUAL-EVIDENCE/P86-ADS-AND-QUALITY'
prev=R/'VISUAL-EVIDENCE/P85-PLAYER-FIRST/raw-after'
keys=[r['key'] for r in json.loads((visual/'P86-PER-GUN-VERDICTS.json').read_text())['weapons']]
if len(keys)!=27 or len(set(keys))!=27:errors.append('invalid 27-gun catalog')
def image_size(p):
    data=p.read_bytes()[:24]
    if data[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('not PNG '+str(p))
    return struct.unpack('>II',data[16:24])
for k in keys:
    if not (visual/'individual'/f'{k}-P85-vs-P86.jpg').is_file():errors.append('missing sheet '+k)
    for m,d in [('side',(850,320)),('idle',(907,508)),('ads',(907,508))]:
        for folder in [prev,visual/'raw-after-offline',visual/'phone-host-after']:
            p=folder/f'{k}-{m}.png'
            try:
                if image_size(p)!=d:errors.append('size mismatch '+str(p))
            except Exception as e:errors.append(str(e))
for i in range(1,6):
    if not (visual/f'P86-Overview-{i}.jpg').is_file():errors.append('missing overview '+str(i))
for k in ['kestrel','mako','needle','switchback','aurora','falcon','stinger','bastion','mistral','carbine']:
    if not (visual/'phone-host-matched'/f'{k}-host-ads.jpg').is_file():errors.append('missing host comparison '+k)
# Known VR-18 baseline bytes must remain identical across both client sources.
vr=[]
for client in ('www','phone-host'):
    vr.append(sha(R/'AndroidProject/app/src/main/assets'/client/'vr18-v31.js'))
if vr[0]!=vr[1]:errors.append('offline/host VR18 modules differ')
if sha(prev/'carbine-side.png')!=sha(visual/'raw-after-offline/carbine-side.png'):
    errors.append('VR-18 frozen diagnostic changed')
for rel,item in review.items():
    oldfile=R/'rollback/P86-P85-EXACT-FILES'/rel
    if not oldfile.is_file() or sha(oldfile)!=item['p85_sha256']:errors.append('missing exact rollback '+rel)
qa=R/'acceptance/P86-ADS-AUDIO-REAL-WEBGL.json'
try:
    js=json.loads(qa.read_text())
    if set(js['clients'])!={'www','phone-host'}:errors.append('missing client QA records')
    for name,q in js['clients'].items():
        if not q['pass'] or q['shots']!=54 or q['sound_profiles']!=27:errors.append('invalid runtime QA '+name)
except Exception as e:errors.append('missing/invalid runtime QA '+str(e))
if errors:
    print('FAIL P8.6 manifest / evidence:',len(errors), 'errors',*errors[:15],sep='\n  ');sys.exit(1)
print('PASS P8.6 cumulative: original',len(prior),'records; seven pinned modifications;',len(latest),'verified files; 27 comparisons; 162 offline + 81 phone-host new frames; exact rollback and VR18 preserved')
