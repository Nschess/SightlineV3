#!/usr/bin/env python3
from pathlib import Path
import zipfile,hashlib,json,re,subprocess,sys
root=Path(__file__).resolve().parents[1];p=root/'AndroidProject';rb=root/'rollback'
rollback=rb/'VR18-V3-PRE-V31-CODE-ROLLBACK.zip';expected=hashlib.sha256(rollback.read_bytes()).hexdigest()
checks={}
def ck(name,result):checks[name]=bool(result)
ck('verified V3 rollback',expected== (rb/'ROLLBACK-SHA256.txt').read_text().split()[0] and zipfile.ZipFile(rollback).testzip() is None)
with zipfile.ZipFile(rollback) as z:
 ck('V3 rollback covers changed content',len(z.namelist())==8 and all(b'vr18-v31' not in z.read(k) for k in z.namelist()))
known=json.loads((rb/'V3-UNCHANGED-SOURCE-HASHES.json').read_text())
ck('unmodified original source hashes',all((root/k).is_file() and hashlib.sha256((root/k).read_bytes()).hexdigest()==sha for k,sha in known.items()))
a=p/'app/src/main/assets';w=a/'www';host=a/'phone-host'
ck('module exact match', (w/'vr18-v31.js').read_bytes()==(host/'vr18-v31.js').read_bytes())
ck('obsolete live module absent', not (w/'vr18-v3.js').exists() and not (host/'vr18-v3.js').exists())
for folder in [w,host]:
 s=(folder/'index.html').read_text()
 ck(folder.name+' correct active script and constructor', '<script src="vr18-v31.js"></script>' in s and 'SightlineVR18V31.build(THREE)' in s and 'vr18ModelVersion' in s)
 ck(folder.name+' only carbine new hands', 'g.add(vr18.firingHand)' in s and 'freshGrp.add(vr18.makeReloadHand())' in s)
 old=(zipfile.ZipFile(rollback).read('AndroidProject/app/src/main/assets/'+folder.name+'/index.html')).decode()
 def definitions(txt):
  i=txt.index('var WEAPONS = {');j=txt.index('\n};',i)+3
  return txt[i:j]
 ck(folder.name+' exact original weapon stats',definitions(s)==definitions(old))
ck('module really 3D', all(x in (w/'vr18-v31.js').read_text() for x in ['CylinderGeometry','ExtrudeGeometry','BufferGeometry','gloveRig','CanvasTexture']) and 'VR18-V3.3-R' in (w/'vr18-v31.js').read_text())
manifest={}
for line in (host/'SHA256SUMS').read_text().splitlines():
 sha,name=line.split('  ');manifest[name]=sha
ck('host SHA list 11 files',len(manifest)==11 and 'vr18-v31.js' in manifest and 'vr18-v3.js' not in manifest)
ck('host all SHA matches',all((host/k).is_file() and hashlib.sha256((host/k).read_bytes()).hexdigest()==v for k,v in manifest.items()))
ck('host route exists',"'/vr18-v31.js': ['vr18-v31.js'" in (host/'server.js').read_text())
j=(p/'app/src/main/java/com/sightline/v3/MainActivity.java').read_text()
ck('Android offline WebView JS allowlist', '"vr18-v31.js"' in j and '"vr18-v3.js"' not in j)
ck('Android host bundle checksum', ('HOST_BUNDLE_SHA256="'+hashlib.sha256((host/'index.html').read_bytes()).hexdigest()+'"') in j)
for path in (w/'vr18-v31.js',host/'vr18-v31.js'):
 ck(path.parent.name+' module syntax',subprocess.run(['node','--check',str(path)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0)
r={'passed':sum(checks.values()),'total':len(checks),'pass':all(checks.values()),'checks':checks,'rollback_sha256':expected,'android_device_tested':False}
print(json.dumps(r,indent=2));sys.exit(0 if r['pass'] else 1)
