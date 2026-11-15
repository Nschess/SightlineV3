from pathlib import Path
import json,hashlib,re,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'app/src/main/assets/www/index.html';t=p.read_text()
m=json.loads((ROOT/'ART-ACCEPTANCE-EVIDENCE/ROLLBACK-REFERENCE-SHA256.json').read_text())['files']
for rel,h in m.items():
 f=ROOT/rel
 assert f.is_file(),rel
 if rel!='app/src/main/assets/www/index.html': assert hashlib.sha256(f.read_bytes()).hexdigest()==h,rel
checks={
 'fixed viewmodel camera':'var viewCamera = new THREE.PerspectiveCamera(72' in t,
 'pose-bound fingers':'function finishHandPose(g,kind)' in t and 'new THREE.InstancedMesh(vmFingerGeo,mGlove,4)' in t,
 'tapered sleeves':'if(mat===mSleeve && d>h*1.5)' in t,
 'rejected superficial receiver details absent':'function machineProfile(' not in t and 'sightlineArtDetails(' not in t,
 'four game modes':all(q in t for q in ['tactical','deathmatch','infection','outbreak']),
 'unchanged ballistic raycasts':'raycaster.set(origin, dir)' in t,
 'shot camera sync':'camera.updateMatrixWorld(true);\n  syncViewCamera();' in t,
 'all bundled modules':len(list((ROOT/'app/src/main/assets/www').glob('*.js')))==11
}
code=re.findall(r'<script>([\s\S]*?)</script>',t)[-1]
checks['game script syntax']=subprocess.run(['node','--check','-'],input=code,text=True,capture_output=True).returncode==0
assert all(checks.values()),checks
print(json.dumps({'status':'PASS','checks':checks,'original_files':len(m),'only_changed_preexisting_file':'app/src/main/assets/www/index.html'},indent=2))
