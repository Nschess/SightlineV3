#!/usr/bin/env python3
"""Actual Chromium WebGL animation state-machine smoke for 27 firearms in both clients.
Tests genuine buildGun/gunFor/ADS/reload/shot transitions, not Android hardware or LAN E2E.
Requires Playwright Chromium. On headless Linux use xvfb-run -a python3 tests/p83-weapons-animations-webgl.py
"""
import json,os,re,shutil,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'AndroidProject/app/src/main/assets'
OUT=ROOT/'acceptance/P83-ANIMATIONS-WEBGL-RESULTS.json'
INSTRUMENT=r'''window.__p83Anim={
  initialized:false,
  list:function(){return Object.keys(WEAPONS).filter(k=>!WEAPONS[k].melee);},
  test:function(key){
    if(!this.initialized){
      R.mode='deathmatch';R.bots=1;R.mates=-1;R.dmKills=50;
      startMatch();beginRound();clearUnits();this.initialized=true;
    }
    const w=WEAPONS[key];if(!w||w.melee)return {key,pass:false,error:'not a firearm'};
    state='live';P.alive=true;P.punch=0;P.bob=0;
    owned[key]=true;setWeapon(key);
    const gun=gunFor(key),a=ammo[key];
    const before=Math.max(0,w.mag-4);a.mag=before;a.res=Math.max(w.mag,10);
    const muzzle=gun.userData.muzzle?.position.toArray()||null;
    const sight=gun.userData.sightY;
    T=500;scoped=false;adsT=0;drawT=0;
    startReload();const started=reloading>0;
    let peakFrame=0;
    for(let i=0;i<40&&reloading>0;i++){
      updatePlayer(.16);
      peakFrame=Math.max(peakFrame,reloadStage);
    }
    const reloaded=reloading===0&&a.mag>before;
    scoped=true;adsT=0;
    for(let i=0;i<25;i++)updatePlayer(.12);
    const aimed=adsT>.94;
    scoped=false;for(let i=0;i<25;i++)updatePlayer(.12);
    const recovered=adsT<.07;
    T=510;nextFire=0;
    const beforeShot=a.mag;
    tryFire(true);
    const fired=a.mag<beforeShot;
    const finite=!!muzzle&&muzzle.every(Number.isFinite)&&Number.isFinite(sight);
    return {key,pass:started&&reloaded&&aimed&&recovered&&fired&&finite&&!gun.userData.emergencyModel,
      started,reloaded,aimed,recovered,fired,finite,sight,muzzle,peakFrame};
  }
};
'''
results=[]
with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=not bool(os.environ.get('DISPLAY')),
     executable_path=shutil.which('chromium') or shutil.which('chromium-browser'),
     args=['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage'])
  try:
    for client in ('www','phone-host'):
      folder=BASE/client
      source=(folder/'index.html').read_text()
      source=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+(folder/m[1]).read_text()+'</script>',source)
      marker=r'if (/[?&]debug\b/.test(location.search)) window.__sl'
      assert marker in source
      source=source.replace(marker,INSTRUMENT+'\n'+marker,1)
      page=browser.new_page(viewport={'width':960,'height':540})
      errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
      try:
        page.set_content(source,wait_until='domcontentloaded',timeout=45000)
        keys=page.evaluate('''() => window.__p83Anim.list()''')
        # A stable game JavaScript closure; test one real weapon by weapon.
        values=[page.evaluate('(key)=>window.__p83Anim.test(key)',key) for key in keys]
        good=all(v['pass'] for v in values) and len(values)==27 and not errors
        results.append({'client':client,'pass':good,'count':len(values),'passed':sum(v['pass'] for v in values),'results':values,'pageErrors':errors})
        print(client,'PASS' if good else 'FAIL',sum(v['pass'] for v in values),'/',len(values),'page errors:',len(errors),flush=True)
      except Exception as e:
        results.append({'client':client,'pass':False,'exception':repr(e),'pageErrors':errors})
        print('ERROR',client,repr(e),flush=True)
      finally:page.close()
  finally:browser.close()
OUT.write_text(json.dumps({'pass':all(r['pass'] for r in results),'note':'real browser source/runtime with deterministic reload and ADS transitions; not actual two-browser E2E or Android', 'results':results},indent=2)+'\n')
sys.exit(0 if all(r['pass'] for r in results) else 1)
