"""Dependency-light static regression for Sightline's two-camera first-person rendering."""
import json,re,subprocess,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'app/src/main/assets/www/index.html'
s=p.read_text();checks={}
def ck(k,v):checks[k]=bool(v)
ck('two independent PerspectiveCameras','var camera = new THREE.PerspectiveCamera(' in s and 'var viewCamera = new THREE.PerspectiveCamera(' in s)
ck('viewmodel fixed at 72 degrees','var viewCamera = new THREE.PerspectiveCamera(72, 16 / 9, 0.012, 8);' in s)
ck('gun and knife belong to viewmodel camera',s.count('viewCamera.add(g);')==2 and 'camera.add(g);' not in s)
ck('viewmodel aspect updated on resize','viewCamera.aspect = w / h;' in s)
ck('camera pose synchronized at shot','camera.updateMatrixWorld(true);\n  syncViewCamera();' in s)
ck('renderer depth reset between passes','renderer.clearDepth();\n  renderer.render(viewScene, viewCamera);' in s)
ck('overlay camera used only for visuals','raycaster.set(origin, dir)' in s and 'camera.quaternion).normalize()' in s)
ck('original damage multiplier preserved','function fallMul(w, dist)' in s and 'w.dmg * (isHead ? w.head : 1)' in s)
ck('original 100 HP walker balance', "<script src=\"zombie-balance.js\"></script>" in s and 'zombie-balance.js' in [x.name for x in p.parent.glob('*.js')])
ck('four game modes present', all(x in s for x in ['tactical','deathmatch','infection','outbreak']))
ck('JavaScript syntax',subprocess.run(['node','--check','-'],input=re.findall(r'<script>([\s\S]*?)</script>',s)[-1],text=True,capture_output=True).returncode==0)
files=list((root/'app/src/main/assets/www').glob('*.js'))
ck('original JS modules plus shared VR18 source',len(files)>=13 and (root/'app/src/main/assets/www/vr18-v31.js').is_file() and 'vr18-v31.js' in s)
result={'passed':sum(checks.values()),'checks':len(checks),'errors':[k for k,v in checks.items() if not v],'details':checks,'source_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'android_compiled':False,'physical_device_tested':False}
print(json.dumps(result,indent=2));raise SystemExit(bool(result['errors']))
