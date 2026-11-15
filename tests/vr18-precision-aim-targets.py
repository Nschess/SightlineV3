from pathlib import Path
import sys,json,re,traceback
from playwright.sync_api import sync_playwright
root=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True);host='phone-host' in str(root)
s=(root/'index.html').read_text();s=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+(root/m[1]).read_text()+'</script>',s)
s=s.replace('if (/[?&]debug\\b/.test(location.search)) window.__sl','if (true) window.__sl')
s=s.replace("return localStorage.getItem(MAP_KEY) || 'courtyard';", "return 'courtyard';")
s=s.replace("var R_KEY = 'sightline.rules.v1', R = loadObj(R_KEY, DEF_R);", "DEF_R.mode='deathmatch'; DEF_R.bots=1; DEF_R.mates=-1; DEF_R.time=600; DEF_R.cash=9000; var R_KEY = 'sightline.rules.v1', R = loadObj(R_KEY, DEF_R);")
# Test-only runtime function calls REAL tryFire and REAL Raycaster hits with a
# temporary synthetic 3D collision target, restoring target list after each test.
source='''if(window.__sl)window.__sl.qaTarget=function(range){
  var w=WEAPONS[cur],saved=targets.slice(),oldRandom=Math.random,oldNext=nextFire, oldPunch=P.punch;
  var actualHits=[],captured=[],baseSet=THREE.Raycaster.prototype.intersectObjects;
  P.punch=0;camera.rotation.y=P.yaw;camera.rotation.x=P.pitch;camera.updateMatrixWorld(true);
  var target=new THREE.Mesh(new THREE.SphereGeometry(.12,16,12),new THREE.MeshBasicMaterial());
  var heading=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
  target.position.copy(camera.position).addScaledVector(heading,range);target.updateMatrixWorld(true);
  targets.length=0;targets.push(target);
  THREE.Raycaster.prototype.intersectObjects=function(objects,recursive){
    var h=baseSet.call(this,objects,recursive);captured.push({origin:this.ray.origin.toArray(),direction:this.ray.direction.toArray(),hit:h.map(x=>({distance:x.distance,target:x.object===target}))});return h;
  };
  P.punch=0;Math.random=function(){return 0};nextFire=T;
  var before=ammo[cur].mag,failed=null;
  try{tryFire(false)}catch(e){failed=String(e)}finally{
    THREE.Raycaster.prototype.intersectObjects=baseSet;
    Math.random=oldRandom;P.punch=oldPunch;
    targets.length=0;saved.forEach(x=>targets.push(x));target.geometry.dispose();target.material.dispose();
  }
  return {range:range,before:before,after:ammo[cur].mag,shotCount:captured.length,collision:captured,failed:failed};
};
'''
s=s.replace('if(window.__sl)window.__sl.qa=',source+'if(window.__sl)window.__sl.qa=')
if host:s=s.replace('window.__sl = { MP: MP','window.__sl = { gunModel:function(k){return gunFor(k);}, MP: MP')
result={'tests':[],'errors':[]}
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-dev-shm-usage'])
  page=b.new_page(viewport={'width':1200,'height':760});page.on('pageerror',lambda e:result['errors'].append(str(e)))
  page.set_content(s,wait_until='load',timeout=45000);page.wait_for_timeout(500)
  page.locator('#btn-start').click(timeout=14000)
  if host:page.evaluate('window.__sl.buy("carbine")');page.locator('#btn-go').click(timeout=14000)
  page.wait_for_timeout(1400)
  if page.evaluate('window.__sl.cur')!='carbine':page.evaluate('window.__sl.owned.carbine=true;window.__sl.setWeapon("carbine")')
  page.evaluate('window.__sl.setView(0,0);window.__sl.press("Mouse2",true)')
  page.wait_for_function('() => window.__sl.adsState().progress>=.99',timeout=12000)
  for dist in (2,40):
   res=page.evaluate('d => window.__sl.qaTarget(d)',dist)
   result['tests'].append(res)
   print('range',dist,'ammo',res['before'],res['after'],'real collider hits',res['collision'], 'failure',res['failed'],flush=True)
  b.close()
except Exception as e:result['failure']=repr(e);traceback.print_exc()
(out/'target.json').write_text(json.dumps(result,indent=2))
