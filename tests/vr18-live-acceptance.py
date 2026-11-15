import os, json, threading, http.server, contextlib, time, argparse, re
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--out',required=True);p.add_argument('--host',action='store_true');p.add_argument('--mobile',action='store_true');p.add_argument('--map',default='courtyard');p.add_argument('--detail',action='store_true');a=p.parse_args()
root=Path(a.root);out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kw):super().__init__(*args,directory=str(root),**kw)
 def log_message(self,*x):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),H)
threading.Thread(target=server.serve_forever,daemon=True).start()
url=(root/'index.html').as_uri()+'?debug=1'
results={'url':url,'logs':[], 'errors':[]}
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN', '/usr/bin/chromium') if os.path.exists(os.environ.get('CHROMIUM_BIN', '/usr/bin/chromium')) else None,headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--hide-scrollbars'])
  page=browser.new_page(viewport={'width':390,'height':844} if a.mobile else {'width':1200,'height':760},device_scale_factor=1)
  page.on('pageerror',lambda e: results['errors'].append(str(e)))
  page.on('console',lambda m: results['logs'].append(m.text) if m.type=='error' else None)
  html=(root/'index.html').read_text()
  html=re.sub(r'<script src=\"([^\"]+)\"></script>',lambda m: '<script>'+ (root/m[1]).read_text()+'</script>',html)
  # The packaged scripts are reproduced as-is; only debug/session/map QA defaults change.
  assert a.map in ('courtyard','foundry','cathedral')
  html=html.replace("return localStorage.getItem(MAP_KEY) || 'courtyard';", "return "+repr(a.map)+";")
  # about:blank avoids restricted local navigation; preset only QA default mode
  html=html.replace("if (/[?&]debug\\b/.test(location.search)) window.__sl", "if (true) window.__sl")
  if a.host: html=html.replace("if(window.__sl)window.__sl.qa=","if(window.__sl)window.__sl.gunModel=function(k){return gunFor(k);}; if(window.__sl)window.__sl.qa=")
  html=html.replace("var R_KEY = 'sightline.rules.v1', R = loadObj(R_KEY, DEF_R);","DEF_R.mode='deathmatch'; DEF_R.bots=1; DEF_R.mates=-1; DEF_R.time=600; DEF_R.cash=9000; var R_KEY = 'sightline.rules.v1', R = loadObj(R_KEY, DEF_R);")
  html=html.replace('idleCamera(0);\nrequestAnimationFrame(frame);',"if(window.__sl)window.__sl.reloadTime=function(){return reloading;}; idleCamera(0);\nrequestAnimationFrame(frame);")
  page.set_content(html,wait_until='load',timeout=40000)
  
  page.wait_for_timeout(500)
  page.locator('#btn-start').click(timeout=15000)
  if a.host:
   page.evaluate("window.__sl.buy('carbine')")
   page.locator('#btn-go').click(timeout=15000)
  page.wait_for_timeout(3500)
  results['map']=a.map
  results['initial']=page.evaluate("""() => ({state:window.__sl?.state, cur:window.__sl?.cur, gun:!!window.__sl?.gunModel('carbine'), webgl:!!window.__sl?.renderer?.getContext(), ads:window.__sl?.adsState(), rect:document.getElementById('stage').getBoundingClientRect().toJSON(), trace:window.__sl?.gunModel('carbine')?.userData?.vr18ModelVersion})""")
  results['relatedWeaponModels']=page.evaluate("""() => Object.fromEntries(['carbine','stinger','falcon','rampart','aurora'].map(k=>{try { let g=window.__sl.gunModel(k); return [k, {built:!!g, fallback:!!g.userData.emergencyModel, v3:!!g.userData.vr18ModelVersion, chassis:g.children.filter(c=>c.name?.includes('VR-18 V3')).length}]; } catch(e) { return [k, {error:String(e)}]; }}))""")
  results['mesh']=page.evaluate("""() => {let g=window.__sl.gunModel('carbine'), n=0,t=0,ms=[];g.traverse(o=>{if(o.isMesh){n++;if(o.geometry?.getAttribute('position'))t+=o.geometry.getAttribute('position').count/3;ms.push(o.name)}});return {meshes:n,estimatedTriangles:t,parts:ms,hasMuzzle:!!g.userData.muzzle,magChildren:g.userData.mag?.children.length,charge:!!g.userData.ch,sightY:g.userData.sightY};}""")
  page.locator('#stage').screenshot(path=str(out/'idle.png'))
  if a.detail:
   results['closeupScale']=1.5
   page.evaluate("window.__sl.gunModel('carbine').scale.multiplyScalar(1.5)")
   page.wait_for_timeout(150)
   page.locator('#stage').screenshot(path=str(out/'real-game-model-closeup.png'))
   page.evaluate("window.__sl.gunModel('carbine').scale.multiplyScalar(1/1.5)")
  page.evaluate("window.__sl.setView(0,0)")
  # Fire an actual game round before initiating reload; don't assume a browser
  # clock frame or authoritative client's cooldown has already elapsed.
  results['preReloadAmmo']=page.evaluate("window.__sl.ammo().carbine.mag")
  for attempt in range(7):
   page.evaluate('window.__sl.tryFire(false)')
   page.wait_for_timeout(400)
   if page.evaluate('window.__sl.ammo().carbine.mag')<results['preReloadAmmo']:break
  results['setupShotConsumed']=page.evaluate('window.__sl.ammo().carbine.mag')<results['preReloadAmmo']
  if not results['setupShotConsumed']:raise AssertionError('Could not consume round for reload setup')
  page.evaluate("window.__sl.press('KeyR',true); window.__sl.press('KeyR',false)")
  page.wait_for_function('() => window.__sl.reloadTime()>0',timeout=6000)
  if a.detail:
   results['reloadSequence']=[]
   results['reloadSequence'].append(page.evaluate("() => ({phase:'early', remaining:window.__sl.reloadTime(), left:window.__sl.gunModel('carbine').userData.left?.position.toArray(),leftVisible:window.__sl.gunModel('carbine').userData.left?.visible})"))
   page.locator('#stage').screenshot(path=str(out/'reload-early.png'))
  results['reloadBegin']=page.evaluate("() => ({mag:window.__sl.gunModel('carbine').userData.mag.visible,fresh:window.__sl.gunModel('carbine').userData.fresh.visible})")
  # Use engine states rather than a fixed sleep or racing three software renderers.
  try:
   page.wait_for_function("() => {let g=window.__sl.gunModel('carbine');return !g.userData.mag.visible&&g.userData.fresh.visible}",timeout=14000,polling='raf')
   results['reloadStageObserved']=True
  except Exception:
   results['reloadStageObserved']=False
  results['reloadMid']=page.evaluate("() => ({magVisible:window.__sl.gunModel('carbine').userData.mag.visible, freshVisible:window.__sl.gunModel('carbine').userData.fresh.visible, chargeZ:window.__sl.gunModel('carbine').userData.ch.position.z})")
  page.locator('#stage').screenshot(path=str(out/'reload.png'))
  if a.detail:
   results['reloadSequence'].append(page.evaluate("() => ({phase:'mid', remaining:window.__sl.reloadTime(), left:window.__sl.gunModel('carbine').userData.left?.position.toArray(),leftVisible:window.__sl.gunModel('carbine').userData.left?.visible,mag:window.__sl.gunModel('carbine').userData.mag.visible,fresh:window.__sl.gunModel('carbine').userData.fresh.visible})"))
   page.wait_for_function("() => window.__sl.reloadTime()>0 && window.__sl.reloadTime() / 2.3 < .20",timeout=15000)
   results['reloadSequence'].append(page.evaluate("() => ({phase:'late', remaining:window.__sl.reloadTime(), left:window.__sl.gunModel('carbine').userData.left?.position.toArray(),leftVisible:window.__sl.gunModel('carbine').userData.left?.visible,mag:window.__sl.gunModel('carbine').userData.mag.visible,fresh:window.__sl.gunModel('carbine').userData.fresh.visible})"))
   page.locator('#stage').screenshot(path=str(out/'reload-late.png'))
  page.wait_for_function('() => window.__sl.reloadTime()<=0',timeout=20000)
  results['beforeADS']=page.evaluate("() => ({alive:window.__sl.P.alive,reload:window.__sl.reloadTime(), state:window.__sl.state,ammo:window.__sl.ammo().carbine})")
  page.evaluate("window.__sl.press('Mouse2',true)")
  page.wait_for_function('() => window.__sl.adsState().progress >= .98',timeout=13000)
  results['ads']=page.evaluate('window.__sl.adsState()')
  page.locator('#stage').screenshot(path=str(out/'ads.png'))
  page.evaluate("window.__sl.press('Mouse2',false)")
  page.wait_for_function('() => window.__sl.adsState().progress <= .05',timeout=13000)
  results['beforeFire']=page.evaluate('window.__sl.ammo().carbine')
  page.evaluate('window.__sl.tryFire(false)')
  page.wait_for_timeout(60)
  page.locator('#stage').screenshot(path=str(out/'fire.png'))
  results['afterFire']=page.evaluate('window.__sl.ammo().carbine')
  page.evaluate("window.__sl.owned.stinger=true;window.__sl.setWeapon('stinger')")
  page.wait_for_timeout(330)
  results['switchAway']=page.evaluate("() => ({current:window.__sl.cur, fallback:!!window.__sl.gunModel('stinger').userData.emergencyModel})")
  page.evaluate("window.__sl.setWeapon('carbine')")
  page.wait_for_timeout(330)
  results['switchBack']=page.evaluate("() => ({current:window.__sl.cur, version:window.__sl.gunModel('carbine').userData.vr18ModelVersion})")
  results['final']=page.evaluate("""() => ({state:window.__sl?.state, cur:window.__sl?.cur, gun:window.__sl?.gunModel('carbine')?.userData?.vr18ModelVersion, info:window.__sl?.renderer?.info?.render, stats:window.__sl?.frameStats?.()})""")
  results['movementStart']=page.evaluate("() => ({x:window.__sl.P.x,z:window.__sl.P.z})")
  page.evaluate("window.__sl.press('KeyW',true)")
  page.wait_for_timeout(450)
  page.evaluate("window.__sl.press('KeyW',false)")
  results['movementEnd']=page.evaluate("() => ({x:window.__sl.P.x,z:window.__sl.P.z})")
  results['movementDistance']=((results['movementEnd']['x']-results['movementStart']['x'])**2+(results['movementEnd']['z']-results['movementStart']['z'])**2)**.5
  results['viewport']={'mobile':a.mobile,'width':page.viewport_size['width'],'height':page.viewport_size['height']}
  browser.close()
except Exception as e: results['failure']=repr(e)
finally:
 server.shutdown()
 (out/'browser-results.json').write_text(json.dumps(results,indent=2,default=str))
 print(json.dumps(results,indent=2,default=str)[:8000])
