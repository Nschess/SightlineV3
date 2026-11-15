"""Live Three.js/Chromium regression for delayed empty-mag auto-reload.
Run with: xvfb-run -a python tests/vr18-empty-mag-switch-webgl.py <www-or-phone-host-dir>
All instrumentation is in the browser test document, not shipping game assets.
"""
from pathlib import Path
import sys,re,json,traceback
from playwright.sync_api import sync_playwright
root=Path(sys.argv[1]);host=root.name=='phone-host'
s=(root/'index.html').read_text()
s=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+(root/m[1]).read_text()+'</script>',s)
s=s.replace('if (/[?&]debug\\b/.test(location.search)) window.__sl','if (true) window.__sl')
s=s.replace("return localStorage.getItem(MAP_KEY) || 'courtyard';", "return 'courtyard';")
s=s.replace("var R_KEY = 'sightline.rules.v1', R = loadObj(R_KEY, DEF_R);", "DEF_R.mode='deathmatch'; DEF_R.bots=1; DEF_R.mates=-1; DEF_R.time=600; DEF_R.cash=9000; var R_KEY = 'sightline.rules.v1', R = loadObj(R_KEY, DEF_R);")
s=s.replace('function startReload() {',"function startReload() {window._startlog=(window._startlog||[]).concat({cur:cur,mag:ammo[cur].mag,state:state,t:T,clock:performance.now()});")
s=s.replace('if(window.__sl)window.__sl.qa=', 'if(window.__sl)window.__sl.qaReloadTime=function(){return reloading;};window.__sl.qaReady=function(){nextFire=T;};if(window.__sl)window.__sl.qa=')
res={'jsErrors':[],'case':'empty VR18 auto-reload timer after switching to partially used pistol'}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':1200,'height':760},device_scale_factor=1)
  page.on('pageerror',lambda e:res['jsErrors'].append(str(e)))
  page.set_content(s,wait_until='load',timeout=45000); page.wait_for_timeout(450)
  page.evaluate("document.querySelector('#btn-start').click()")
  if host:
   page.evaluate('window.__sl.buy("carbine")');page.locator('#btn-go').click(timeout=15000)
  page.wait_for_timeout(850)
  page.evaluate('''() => {window.__sl.owned.carbine=true;window.__sl.setWeapon('carbine');}''')
  page.wait_for_timeout(480)
  setup=page.evaluate('''() => {
    const g=window.__sl, a=g.ammo();a.carbine.mag=1;a.carbine.res=90;
    g.owned.pistol=true;a.pistol.mag=7;a.pistol.res=40;
    return {carbine:a.carbine,pistol:a.pistol,cur:g.cur};
  }''');res['setup']=setup
  page.evaluate('window.__sl.qaReady();window.__sl.tryFire(true)')
  a=page.evaluate('''() => ({carbine:window.__sl.ammo().carbine,cur:window.__sl.cur,reload:window.__sl.qaReloadTime(),state:window.__sl.state,log:window._startlog||[]})''');res['postFire']=a
  page.evaluate('window.__sl.setWeapon("pistol")')
  res['afterSwitch']=page.evaluate('''() => ({pistol:window.__sl.ammo().pistol,cur:window.__sl.cur,reload:window.__sl.qaReloadTime(),state:window.__sl.state,log:window._startlog||[]})''')
  page.wait_for_timeout(410)
  res['afterCallback']=page.evaluate('''() => ({pistol:window.__sl.ammo().pistol,cur:window.__sl.cur,reload:window.__sl.qaReloadTime(),state:window.__sl.state,log:window._startlog||[]})''')
  res['wrongReload']=res['afterCallback']['reload']>0
  # Positive control: last-shot reload still activates when remaining on carbine.
  page.evaluate("window.__sl.setWeapon('carbine')")
  page.evaluate("window.__sl.ammo().carbine.mag=1;window.__sl.qaReady();window.__sl.tryFire(true)")
  res['controlEmptyAfterShot']=page.evaluate('window.__sl.ammo().carbine.mag')==0
  try:page.wait_for_function('window.__sl.qaReloadTime()>0',timeout=4500)
  except Exception:pass
  res['normalAutoReloadStarts']=page.evaluate('window.__sl.qaReloadTime()>0')
  res['pass']=res['controlEmptyAfterShot'] and res['normalAutoReloadStarts'] and not res['wrongReload'] and not res['jsErrors']
  print(json.dumps(res,indent=2),flush=True)
  browser.close()
except Exception as e:res['error']=str(e);traceback.print_exc()
if not res.get('pass',False):sys.exit(1)
