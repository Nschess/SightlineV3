import sys,json,os,re,time,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
is_host=len(sys.argv)>3 and sys.argv[3]=='host'
root=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
s=(root/'index.html').read_text()
s=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+(root/m[1]).read_text()+'</script>',s)
s=s.replace("return localStorage.getItem(MAP_KEY) || 'courtyard';", "return 'courtyard';")
s=s.replace('if (/[?&]debug\\b/.test(location.search)) window.__sl', 'if (true) window.__sl')
s=s.replace("var R_KEY = 'sightline.rules.v1', R = loadObj(R_KEY, DEF_R);", "DEF_R.mode='deathmatch'; DEF_R.bots=1; DEF_R.mates=-1; DEF_R.time=600; DEF_R.cash=9000; var R_KEY = 'sightline.rules.v1', R = loadObj(R_KEY, DEF_R);")
s=s.replace('if (window.__sl) { window.__sl.frameStats', 'if (window.__sl) {window.__sl.qaSetFov=function(f){S.fov=f;baseFov=f;}; window.__sl.frameStats')
s=s.replace('idleCamera(0);\nrequestAnimationFrame(frame);',"if(window.__sl)window.__sl.reloadTime=function(){return reloading;}; idleCamera(0);\nrequestAnimationFrame(frame);")
if is_host: s=s.replace('window.__sl = { MP: MP', 'window.__sl = { gunModel:function(k){return gunFor(k);}, MP: MP')
assert 'window.__sl' in s
outcome={'cases':[],'errors':[]}
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':1200,'height':760},device_scale_factor=1)
  page.on('pageerror',lambda e:outcome['errors'].append(str(e)))
  page.set_content(s,wait_until='load',timeout=45000)
  page.wait_for_timeout(700)
  print('DBG',page.evaluate("() => ({title:document.title,state:window.__sl?.state, menu:document.querySelector('#btn-start')?.outerHTML,body:document.body?.className,sc:document.querySelector('#btn-go')?.outerHTML})"),flush=True)
  page.screenshot(path=str(out/'prestart.png'))
  page.locator('#btn-start').click(timeout=15000)
  if is_host:
   page.evaluate("window.__sl.buy('carbine')")
   page.locator('#btn-go').click(timeout=15000)
  # V3.3R game default on offline already holds carbine?
  page.wait_for_timeout(3500)
  outcome['start']=page.evaluate('''() => ({state:window.__sl?.state,weapon:window.__sl?.cur,version:window.__sl?.gunModel('carbine')?.userData?.vr18ModelVersion})''')
  if outcome['start']['weapon']!='carbine':
   page.evaluate("window.__sl.owned.carbine=true;window.__sl.setWeapon('carbine')")
  page.evaluate("window.__sl.setView(0,0);window.__sl.press('Mouse2',true)")
  page.wait_for_function('() => window.__sl.adsState().progress >=.998',timeout=12000)
  def probe(name):
   x=page.evaluate('''() => {
    const w=window.__sl, v=w.viewCamera||w.camera,gun=w.gunModel('carbine'),optic=gun.userData.optic;
    const lens=optic.children.find(c=>c.name&&c.name.includes('transparent lens'));
    gun.updateMatrixWorld(true);v.updateMatrixWorld(true);w.camera.updateMatrixWorld(true);
    const rect=document.getElementById('stage').getBoundingClientRect();
    const pt=lens.getWorldPosition(new THREE.Vector3());const clip=pt.clone().project(v);
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(w.camera.quaternion);
    const sightRay=pt.clone().sub(v.position).normalize();
    const shotRay=new THREE.Vector3(0,0,-1).applyQuaternion(w.camera.quaternion);
    const offset=Math.acos(Math.min(1,Math.max(-1,sightRay.dot(shotRay))))*180/Math.PI;
    return {ads:w.adsState(),screen:{width:rect.width,height:rect.height},opticWorld:pt.toArray(),
       opticLocal:lens.position.toArray(),opticNDC:clip.toArray(),
       opticPixels:[(clip.x+1)*.5*rect.width,(1-clip.y)*.5*rect.height],
       center:[rect.width*.5,rect.height*.5],deltaPx:[clip.x*.5*rect.width,-clip.y*.5*rect.height],offsetAngleDeg:offset,
       viewFov:v.fov,ballisticFov:w.camera.fov,gunPos:gun.position.toArray(),gunScale:gun.scale.toArray(),weaponRotation:gun.rotation.toArray(),
       reticleClass:document.getElementById('reticle').className};
    }''')
   x['name']=name
   outcome['cases'].append(x)
   return x
  for name,width,height in [('landscape',1200,760),('wide',1280,720),('portrait',390,844)]:
   page.set_viewport_size({'width':width,'height':height})
   page.wait_for_timeout(700)
   d=probe(name)
   page.locator('#stage').screenshot(path=str(out/(name+'-ads.png')))
   print(name,'pixels',d['deltaPx'],'angle',d['offsetAngleDeg'], 'fov',d['ballisticFov'], flush=True)
  for fov in (65,72,100):
   page.evaluate('(f) => window.__sl.qaSetFov(f)',fov)
   page.wait_for_timeout(320)
   d=probe('world-fov-'+str(fov))
   print('fov',fov,'lens error',d['deltaPx'],'world fov',d['ballisticFov'],flush=True)
  # Get instantaneous camera/fire ray at one actual shot with spread disabled solely in QA.
  shot=page.evaluate('''() => {
    const savedSet=THREE.Raycaster.prototype.set, random=Math.random,w=window.__sl;
    let rays=[];
    THREE.Raycaster.prototype.set=function(o,d){rays.push({origin:o.toArray(),dir:d.toArray()});return savedSet.apply(this,arguments);};
    Math.random=()=>0;
    const pre=w.ammo().carbine.mag;
    try{w.tryFire(false);}finally{Math.random=random;THREE.Raycaster.prototype.set=savedSet;}
    const expected=new THREE.Vector3(0,0,-1).applyQuaternion(w.camera.quaternion).normalize();
    const hit=rays.find(x=>x.dir[2]!==0);
    return {pre,post:w.ammo().carbine.mag,rays,expected:expected.toArray(),
       headingErrorDeg:hit?Math.acos(Math.min(1,Math.max(-1,new THREE.Vector3(...hit.dir).dot(expected))))*180/Math.PI:null};
   }''')
  outcome['shot']=shot
  print('shot',shot,flush=True)
  page.wait_for_timeout(900)
  d=probe('recoil-recovered')
  page.locator('#stage').screenshot(path=str(out/'recoil-recovered.png'))
  page.evaluate("window.__sl.press('Mouse2',false)")
  page.wait_for_function('() => window.__sl.adsState().progress<.05', timeout=13000)
  outcome['adsExit']=page.evaluate('window.__sl.adsState()')
  print('exit',outcome['adsExit'],flush=True)
  browser.close()
except Exception as e:
 outcome['failure']=repr(e);traceback.print_exc()
(out/'probe.json').write_text(json.dumps(outcome,indent=2))
print('SAVED',out/'probe.json',flush=True)
