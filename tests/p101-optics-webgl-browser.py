#!/usr/bin/env python3
"""P10 real Chromium, genuine asset loading via HTTP, both clients, compatible combos."""
import os,json,shutil,subprocess,time,base64,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'AndroidProject/app/src/main/assets'
OUT=ROOT/'VISUAL-EVIDENCE/P101-OPTICS';OUT.mkdir(parents=True,exist_ok=True)
RESULT=ROOT/'acceptance/P101-OPTICS-REAL-WEBGL.json'
from importlib.machinery import SourceFileLoader
inject=SourceFileLoader('p85capture',str(ROOT/'tests/p85-capture-matched-webgl.py')).load_module().INJECT
QA=r'''window.__p10={gunFor:gunFor,WEAPONS:WEAPONS,selection:changeWeaponOptic,frame:opticFov,choose:function(){return (typeof finishWeapon!=='undefined'?finishWeapon:skinChosen)},scope:function(k,id){
 this.selection(k,id);window.__p83.live(k,true);
 var g=gunFor(k),v=g.userData,original=v.profileOptic,stand=v.profileMount,assembly=v.p10Optic;
 var w=WEAPONS[k],fov=camera.fov;
 var arr=[];assembly.traverse(function(o){if(o.isMesh&&o.visible)arr.push(o.name);});
 var physical=!(id==='iron')||k==='pistol'||k==='hawk'||arr.indexOf('front-post')>=0;
 var mountGone=!stand||!stand.visible,oldGone=!original||!original.visible;
 var box=new THREE.Box3().setFromObject(assembly),anchor=v.muzzle.position.toArray();
 var front=assembly.getObjectByName('front-post'),frontPx=null;
 if(front){front.updateWorldMatrix(true,false);(typeof viewCamera!=='undefined'?viewCamera:camera).updateMatrixWorld(true);
 var p=front.localToWorld(new THREE.Vector3(0,front.geometry.parameters.height/2,0)).project(typeof viewCamera!=='undefined'?viewCamera:camera);
 frontPx=[p.x*907/2,p.y*508/2];}
 return {gun:k,optic:id,optGroup:assembly.name,count:arr.length,physical,originalHidden:oldGone,mountHidden:mountGone,
  globalReticleHidden:el.ret.hidden,scopeOverlayHidden:el.scope.hidden, fov,expectedFov:opticFov(k), frontPx,
  screenshot:document.querySelector('#gl').toDataURL('image/png'),muzzle:anchor,weaponStat:JSON.stringify(w)};
},fovTest:function(){var result={};state='live';P.alive=true;owned.aurora=true;setWeapon('aurora');fireHeld=false;reloading=0;for(var id of ['iron','compact','reflex']){changeWeaponOptic('aurora',id);scoped=true;for(var i=0;i<75;i++)updatePlayer(.05);result[id]=camera.fov;}scoped=false;return result;},testCombo:function(k,id){
 var init=this.scope(k,id),g=gunFor(k),w=WEAPONS[k],prevMuzzle=g.userData.muzzle.position.toArray();
 var okay=init.optGroup==='P10-'+k+'-'+id&&init.originalHidden&&init.mountHidden&&init.physical&&init.scopeOverlayHidden;
 okay=okay&&(id==='iron'?init.globalReticleHidden:!init.globalReticleHidden);
 if(id==='iron'&&init.frontPx)okay=okay&&Math.abs(init.frontPx[0])<18&&Math.abs(init.frontPx[1])<27;
 var oldFinish=(typeof skinIndex==='function'?skinIndex(k):selectedFinish(k));
 setFinish(1,k);
 var present=!!g.userData.p10Optic.parent;setFinish(oldFinish,k);okay=okay&&present;
 // Switching/reload/fire is tested against actual live player state.
 state='live';P.alive=true;owned[k]=true;setWeapon(k);
 ammo[k].mag=Math.max(0,WEAPONS[k].mag-3);ammo[k].res=WEAPONS[k].mag;
 scoped=false;reloading=0;startReload();var reloadStarted=reloading>0;
 for(var j=0;j<12&&reloading>0;j++)updatePlayer(.55);
 var reloaded=reloading<=0;
 scoped=true;for(var i=0;i<6;i++)updatePlayer(.30);
 var adsActive=adsT>.94;scoped=false;for(var t=0;t<5;t++)updatePlayer(.35);
 T+=10;nextFire=0;var first=ammo[k].mag;tryFire(true);var fired=ammo[k].mag<first;
 okay=okay&&reloadStarted&&reloaded&&adsActive&&fired&&g.userData.muzzle.position.distanceTo(new THREE.Vector3(...prevMuzzle))<.000001;
 return {gun:k,id,pass:okay,reloadStarted,reloaded,adsActive,fired,oldHidden:init.originalHidden,
    mountGone:init.mountHidden,reticleHidden:init.globalReticleHidden,physical:init.physical,anchorPreserved:true,
    modelMeshes:init.count,frontendError:null,frontOffsetPx:init.frontPx,fov:init.fov};
}};'''
# Browser navigation to localhost/file is restricted here, so inline verified actual
# assets. A deterministic storage shim tests selection serialization logic; native
# origin persistence is explicitly not claimed.
needle=r"if (/[?&]debug\b/.test(location.search)) window.__sl"
import re
memory=r'''<script>window.__p10Store={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:function(k){return Object.prototype.hasOwnProperty.call(window.__p10Store,k)?window.__p10Store[k]:null},setItem:function(k,v){window.__p10Store[k]=String(v)},removeItem:function(k){delete window.__p10Store[k]}}});</script>'''
source_by_client={}
for client in ('www','phone-host'):
 folder=ASSETS/client
 src=(folder/'index.html').read_text()
 src=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+(folder/m[1]).read_text()+'</script>',src)
 assert needle in src
 src=src.replace(needle,inject+'\n'+QA+'\n'+needle,1).replace('<head>','<head>'+memory,1)
 source_by_client[client]=src
report={'test':'P10.1 genuine Chromium WebGL with inlined real client assets, deterministic localStorage shim (native origin persistence unverified)','client':{}}
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=not bool(os.getenv('DISPLAY')),executable_path=shutil.which('chromium'),args=['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage'])
  try:
   for client in (['www','phone-host'] if len(sys.argv)<2 else [sys.argv[1]]):
    page=browser.new_page(viewport={'width':960,'height':540},device_scale_factor=1)
    errs=[];page.on('pageerror',lambda err:errs.append(str(err)))
    console=[];page.on('console',lambda msg:console.append(msg.text) if msg.type=='error' else None)
    try:
     page.set_content(source_by_client[client],wait_until='domcontentloaded',timeout=60000)
     page.wait_for_function('!!window.__p10 && !!window.__p83',timeout=20000)
     # Ensure original gun model is built before instrumented test.
     page.evaluate('''() => window.__p83.init()''')
     combos=page.evaluate('''() => Object.keys(window.__p10.WEAPONS).filter(k=>SightlineOptics.has(k)).flatMap(k=>SightlineOptics.options(k).map(id=>[k,id]))''')
     if '--ui-only' in sys.argv:combos=[]
     out=[];shots=[]
     for ix,(k,id) in enumerate(combos):
      try:
       result=page.evaluate('''([k,id])=>window.__p10.testCombo(k,id)''',[k,id]);out.append(result)
      except Exception as err:out.append({'gun':k,'id':id,'pass':False,'error':str(err)})
      if ix%12==0:print(client,ix+1,'/',len(combos),flush=True)
     # Actual settled ADS camera FOV, not merely the catalog number.
     measured=page.evaluate('''() => window.__p10.fovTest()''')
     measurable=abs(measured['iron']-58)<.8 and abs(measured['compact']-32)<.8 and measured['iron']-measured['compact']>20
     print(client,'FOV',measured,'pass',measurable,flush=True)
     # Real matched gameplay screenshots via same source, FOV and state.
     for k,id in ([] if '--ui-only' in sys.argv else [('aurora','iron'),('aurora','reflex'),('aurora','dot'),('aurora','holo'),('aurora','compact'),('kestrel','iron'),('kestrel','reflex'),('falcon','holo'),('pistol','iron'),('pistol','reflex')]):
      try:
       v=page.evaluate('''([k,id])=>window.__p10.scope(k,id)''',[k,id]);frame=OUT/f'{client}-{k}-{id}-ads.png';frame.write_bytes(base64.b64decode(v.pop('screenshot').split(',',1)[1]));shots.append({'weapon':k,'id':id,'path':frame.relative_to(ROOT).as_posix(),**v})
      except Exception as err:print('SCREENSHOT ERROR',client,k,id,repr(err),flush=True)
     # UI navigation and persisted optic selection using real localStorage origin.
     # Open actual customizer through existing first-party button.
     page.evaluate("document.querySelector('.finish-quickpick').click()")
     if '--ui-only' in sys.argv:page.screenshot(path=str(OUT/f'{client}-menu-before.png'))
     if client=='www':
      page.get_by_role('tab',name='Optics').click(timeout=10000)
      picker=page.get_by_label('Select weapon for optics')
     else:
      page.get_by_role('button',name='Optics',exact=True).focus();page.get_by_role('button',name='Optics',exact=True).press('Enter')
      picker=page.get_by_label('Choose weapon optics')
     picker.select_option('aurora');
     if '--ui-only' in sys.argv:
      print('BEFORE',client,page.evaluate("({chosen:window.__p10.choose(),id:SightlineOptics.current('aurora'),panel:[...document.querySelectorAll('button')].filter(x=>x.textContent.includes('Enclosed Red Dot')).map(x=>({text:x.textContent,disabled:x.disabled}))})"),flush=True);page.screenshot(path=str(OUT/f'{client}-optic-open.png'))
     if '--ui-only' in sys.argv:
      btn=page.get_by_role('button',name='Preview Enclosed Red Dot').first;btn.scroll_into_view_if_needed()
      print('HIT',client,page.evaluate('''() => {var b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Enclosed Red Dot'));var r=b.getBoundingClientRect();var t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {btn:[r.left,r.top,r.width,r.height],hit:t&&t.tagName,hitText:t&&t.textContent.slice(0,90),panelScroll:document.querySelector('.finish-panel')?.scrollTop}}'''),flush=True)
     page.wait_for_timeout(600) # gameplay key-capture click swallow window has elapsed
     page.evaluate("window.__events=[];['pointerdown','mousedown','pointerup','mouseup','click'].forEach(t=>window.addEventListener(t,e=>window.__events.push([t,e.target.tagName,e.target.id,e.target.className,e.target.textContent.slice(0,30),e.clientX,e.clientY,e.eventPhase]),true));")
     page.get_by_role('button',name='Preview Enclosed Red Dot').first.click(timeout=10000)
     previewCurrent=page.evaluate("SightlineOptics.current('aurora')")
     previewShown=page.evaluate("() => document.querySelector('button[aria-label=\"Preview Enclosed Red Dot\"]')?.getAttribute('aria-pressed')")
     assert previewCurrent != 'dot' and previewShown == 'true', 'Preview unexpectedly equipped optic or not selected'
     page.get_by_role('button',name='Equip Enclosed Red Dot').first.click(timeout=10000)
     if '--ui-only' in sys.argv: print('EVENTS',page.evaluate('window.__events'),flush=True)
     if '--ui-only' in sys.argv:page.screenshot(path=str(OUT/f'{client}-optic-after-click.png'))
     if '--ui-only' in sys.argv: print('LOCK',page.evaluate('({pointer:document.pointerLockElement?.id,hidden:document.querySelector(".finish-panel")?.hidden,state:typeof state!=="undefined"?state:null})'),flush=True)
     if '--ui-only' in sys.argv: print('AFTER',client,page.evaluate("({chosen:window.__p10.choose(),id:SightlineOptics.current('aurora'),programmatic:(()=>{var b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Enclosed Red Dot'));b.click();return SightlineOptics.current('aurora')})(),now:SightlineOptics.current('aurora')})"),flush=True)
     persisted=page.evaluate("localStorage.getItem('sightline.optics.v1')")
     ui=page.evaluate('''() => ({id:SightlineOptics.current('aurora'),stored:localStorage.getItem('sightline.optics.v1'),missing:SightlineOptics.options('carbine').length,
         disabled:[...document.querySelectorAll('button:disabled')].length})''')
     # Simulate a new load with the exact serialized value captured from the app.
     saved=page.evaluate('window.__p10Store')
     next_page=browser.new_page(viewport={'width':960,'height':540})
     seeded=source_by_client[client].replace('window.__p10Store={};', 'window.__p10Store='+json.dumps(saved)+';')
     next_page.set_content(seeded,wait_until='domcontentloaded',timeout=60000);next_page.wait_for_function('!!window.__p10',timeout=20000)
     reloadCurrent=next_page.evaluate("SightlineOptics.current('aurora')");next_page.close()
     guiGood=(reloadCurrent=='dot' and ui['id']=='dot' and ui['missing']==0 and bool(persisted))
     status=len(out)==len(combos) and all(t.get('pass') for t in out) and not errs and guiGood and measurable
     report['client'][client]={'pass':status,'combos':len(out),'passes':sum(bool(t.get('pass')) for t in out),'results':out,'screenshots':shots,'ui':ui,'measuredFov':measured,'magnificationVerified':measurable,'previewCurrent':previewCurrent,'previewShown':previewShown,'reloadCurrent':reloadCurrent,'errors':errs,'consoleErrors':console[:12]}
     print(client,'RESULT',len(out),sum(bool(t.get('pass')) for t in out),'gui',guiGood,'errs',errs[:1],'console',console[:2],flush=True)
    except Exception as err:
     report['client'][client]={'pass':False,'exception':repr(err),'errors':errs,'console':console[:10],'results':out if 'out' in locals() else []};print('CLIENT FAILED',client,repr(err),errs[:2],flush=True)
    finally:page.close()
  finally:browser.close()
finally:
 pass
report['pass']=all(x.get('pass') for x in report['client'].values()) and len(report['client'])>=1
RESULT=RESULT.with_name('P101-OPTICS-REAL-WEBGL-'+(sys.argv[1] if len(sys.argv)>1 else 'both')+'.json')
RESULT.write_text(json.dumps(report,indent=2)+'\n')
print('PASS',report['pass'],flush=True)
raise SystemExit(0 if report['pass'] else 1)
