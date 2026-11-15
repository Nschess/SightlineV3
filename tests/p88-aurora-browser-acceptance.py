#!/usr/bin/env python3
"""P8.8 Aurora-specific genuine Chromium test, no APK or device claim.
Checks new stock geometry/skin coverage and reload frames in BOTH clients.
"""
import base64, json, os, re, shutil, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'AndroidProject/app/src/main/assets'
OUT=ROOT/'VISUAL-EVIDENCE/P88-AURORA/real-reload'
OUT.mkdir(exist_ok=True,parents=True)
INJECT=r'''window.__p88={
  examine:function(){
    var key='aurora',g=gunFor(key),s=g.getObjectByName('P88-Aurora-open-stock');
    if(!s)return {error:'missing P88 stock'};
    var meshes=[],geoValid=true;
    s.traverse(function(m){
      if(!m.isMesh)return;
      var pos=m.geometry.attributes.position,norm=m.geometry.attributes.normal;
      if(!pos||!norm)geoValid=false;
      else for(var i=0;i<norm.count;i++) if(!Number.isFinite(norm.getX(i))||!Number.isFinite(norm.getY(i))||!Number.isFinite(norm.getZ(i)))geoValid=false;
      meshes.push({name:m.name||'',material:m.material.type,visible:m.visible});
    });
    var original=g.userData.muzzle.position.toArray(),sightY=g.userData.sightY;
    setFinish(2,key);var colored=0,total=0;
    s.traverse(function(m){if(m.isMesh){total++;if(m.userData.finishBase&&m.material!==m.userData.finishBase)colored++;}});
    setFinish(0,key);var restored=true;
    s.traverse(function(m){if(m.isMesh&&m.userData.finishBase&&m.material!==m.userData.finishBase)restored=false;});
    var all=Object.keys(WEAPONS).filter(k=>!WEAPONS[k].melee);
    return {stockGroup:s.name,meshCount:meshes.length,meshes,geometryNormalsFinite:geoValid,
      finishCount:(typeof skinList==='function'?skinList(key):weaponFinishList(key)).length,tintedStockMeshes:colored,stockMeshes:total,finishRestored:restored,
      muzzle:original,sightY,vr18GroupPresent:!gunFor('carbine').getObjectByName('P88-Aurora-open-stock'),
      firearms:all.length};
  },
  reload:function(){
    window.__p83.live('aurora',false);
    var key='aurora',g=gunFor(key);
    scoped=false;adsT=0;state='live';drawT=0;
    T=700;ammo[key].mag=8;ammo[key].res=120;reloading=0;
    startReload();var begun=reloading>0;
    for(var i=0;i<4;i++)updatePlayer(.16);
    var animation={begun,phase:reloadStage,remaining:reloading};
    renderer.setPixelRatio(1);renderer.setSize(907,508,false);
    camera.aspect=907/508;camera.updateProjectionMatrix();
    if(typeof viewCamera!=='undefined'){viewCamera.aspect=907/508;viewCamera.updateProjectionMatrix();}
    renderer.clear(true,true,true);renderer.render(scene,camera);renderer.clearDepth();
    if(typeof viewScene!=='undefined'&&typeof viewCamera!=='undefined')renderer.render(viewScene,viewCamera);
    return {animation,image:document.querySelector('#gl').toDataURL('image/png')};
  }
};'''

def game(folder):
    page=(folder/'index.html').read_text()
    page=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+(folder/m[1]).read_text()+'</script>',page)
    marker=r'if (/[?&]debug\b/.test(location.search)) window.__sl'
    from importlib.machinery import SourceFileLoader
    sys.dont_write_bytecode=True
    lib=SourceFileLoader('p88capture',str(ROOT/'tests/p85-capture-matched-webgl.py')).load_module()
    assert marker in page
    return page.replace(marker,lib.INJECT+'\n'+INJECT+'\n'+marker,1)

report={'test':'P8.8 Aurora genuine browser skin / stock normals / reload smoke','clients':{}}
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=not bool(os.getenv('DISPLAY')),executable_path=shutil.which('chromium'),args=['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage'])
    try:
        for client in ['www','phone-host']:
            page=browser.new_page(viewport={'width':960,'height':540},device_scale_factor=1)
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            try:
                page.set_content(game(ASSETS/client),wait_until='domcontentloaded',timeout=45000)
                page.wait_for_function('typeof window.__p88!=="undefined"')
                state=page.evaluate('window.__p88.examine()')
                render=page.evaluate('window.__p88.reload()')
                frame=OUT/(client+'-Aurora-reload.png')
                frame.write_bytes(base64.b64decode(render['image'].split(',',1)[1]))
                passed=(state.get('stockGroup')=='P88-Aurora-open-stock' and state.get('meshCount',0)>=10 and
                  state.get('geometryNormalsFinite') and state.get('tintedStockMeshes',0)>=2 and
                  state.get('finishRestored') and state.get('vr18GroupPresent') and state.get('firearms')==27 and
                  state.get('finishCount')==(12 if client=='www' else 15) and
                  render['animation']['begun'] and render['animation']['remaining']>0 and not errors)
                report['clients'][client]={'pass':passed,'stock':state,'reload':render['animation'],'errors':errors,'screenshot':frame.relative_to(ROOT).as_posix()}
                print(client,'PASS' if passed else 'FAIL','stock meshes',state.get('meshCount'),'tinted',state.get('tintedStockMeshes'),'reload',render['animation'],'errors',len(errors),flush=True)
            except Exception as exc:
                print(client,'ERROR',repr(exc),flush=True)
                report['clients'][client]={'pass':False,'error':repr(exc),'pageErrors':errors}
            finally:page.close()
    finally:browser.close()
report['pass']=bool(report['clients']) and all(c.get('pass') for c in report['clients'].values())
(ROOT/'acceptance/P88-AURORA-BROWSER-QA.json').write_text(json.dumps(report,indent=2)+'\n')
sys.exit(0 if report['pass'] else 1)
