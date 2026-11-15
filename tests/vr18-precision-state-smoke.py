# Independent WebGL gameplay instrumentation; NEVER shipped or injected into game files.
from pathlib import Path
import json,os,re,sys,traceback
from playwright.sync_api import sync_playwright
root=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True);host='phone-host' in str(root)
s=(root/'index.html').read_text()
s=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+(root/m[1]).read_text()+'</script>',s)
s=s.replace("return localStorage.getItem(MAP_KEY) || 'courtyard';", "return 'courtyard';")
s=s.replace('if (/[?&]debug\\b/.test(location.search)) window.__sl','if (true) window.__sl')
s=s.replace("var R_KEY = 'sightline.rules.v1', R = loadObj(R_KEY, DEF_R);", "DEF_R.mode='deathmatch'; DEF_R.bots=1; DEF_R.mates=-1; DEF_R.time=600; DEF_R.cash=9000; var R_KEY = 'sightline.rules.v1', R = loadObj(R_KEY, DEF_R);")
s=s.replace('idleCamera(0);\nrequestAnimationFrame(frame);',"if(window.__sl)window.__sl.qaAdvance=function(dt){T+=dt;updatePlayer(dt);}; idleCamera(0);\nrequestAnimationFrame(frame);")
if host: s=s.replace('window.__sl = { MP: MP','window.__sl = { gunModel:function(k){return gunFor(k);}, MP: MP')
assert 'window.__sl.qaAdvance' in s
result={'error':None,'jsErrors':[],'checks':{}}
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-dev-shm-usage'])
  page=b.new_page(viewport={'width':1200,'height':760},device_scale_factor=1)
  page.on('pageerror',lambda err:result['jsErrors'].append(str(err)))
  page.set_content(s,wait_until='load',timeout=45000);page.wait_for_timeout(700)
  page.locator('#btn-start').click(timeout=15000)
  if host:
   page.evaluate('window.__sl.buy("carbine")');page.locator('#btn-go').click(timeout=15000)
  page.wait_for_timeout(1500)
  if page.evaluate('window.__sl.cur')!='carbine':page.evaluate('window.__sl.owned.carbine=true;window.__sl.setWeapon("carbine")')
  result['initial']=page.evaluate('''() => ({state:window.__sl.state,cur:window.__sl.cur,mag:window.__sl.ammo().carbine.mag})''')
  page.evaluate('window.__sl.qaAdvance(.6)')
  for k in range(7):
   page.evaluate('window.__sl.tryFire(false)')
   page.wait_for_timeout(250)
   if page.evaluate('window.__sl.ammo().carbine.mag')<result['initial']['mag']:break
  result['fired']=page.evaluate('window.__sl.ammo().carbine.mag')<result['initial']['mag']
  if not result['fired']: raise AssertionError('Initial firing setup failed: no ammo consumed')
  page.evaluate('window.__sl.press("KeyR",true);window.__sl.press("KeyR",false)')
  page.wait_for_timeout(180)
  # Diagnostic time step through EXISTING updatePlayer animation code.
  page.evaluate('window.__sl.qaAdvance(.65)')
  result['midReload']=page.evaluate('''() => {const g=window.__sl.gunModel?window.__sl.gunModel('carbine'):null;return g?{mag:g.userData.mag.visible,fresh:g.userData.fresh.visible,left:g.userData.left.visible}:null}''')
  page.locator('#stage').screenshot(path=str(out/'reload-mid.png'))
  page.evaluate('window.__sl.qaAdvance(.95)')
  result['lateReload']=page.evaluate('''() => {const g=window.__sl.gunModel?window.__sl.gunModel('carbine'):null;return g?{mag:g.userData.mag.visible,fresh:g.userData.fresh.visible,left:g.userData.left.visible}:null}''')
  page.evaluate('window.__sl.qaAdvance(.7)')
  page.wait_for_timeout(400)
  result['afterReload']=page.evaluate('window.__sl.ammo().carbine')
  page.evaluate('window.__sl.press("Mouse2",true)')
  page.wait_for_function('() => window.__sl.adsState().progress > .985',timeout=12000)
  result['ads']=page.evaluate('window.__sl.adsState()')
  page.locator('#stage').screenshot(path=str(out/'ads.png'))
  page.evaluate('window.__sl.press("Mouse2",false)')
  page.wait_for_function('() => window.__sl.adsState().progress < .08',timeout=12000)
  result['adsExit']=page.evaluate('window.__sl.adsState()')
  page.evaluate('window.__sl.owned.stinger=true;window.__sl.setWeapon("stinger")')
  result['switchAway']=page.evaluate('window.__sl.cur')
  page.evaluate('window.__sl.setWeapon("carbine")')
  result['switchBack']=page.evaluate('window.__sl.cur')
  result['movementBefore']=page.evaluate('() => [window.__sl.P.x,window.__sl.P.z]')
  page.evaluate('window.__sl.press("KeyW",true)');page.evaluate('window.__sl.qaAdvance(.35)');page.wait_for_timeout(120);page.evaluate('window.__sl.press("KeyW",false)')
  result['movementAfter']=page.evaluate('() => [window.__sl.P.x,window.__sl.P.z]')
  result['render']=page.evaluate('window.__sl.renderer?.info?.render || null')
  b.close()
except Exception as e:
 result['error']=repr(e);traceback.print_exc()
(out/'smoke.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2),flush=True)
