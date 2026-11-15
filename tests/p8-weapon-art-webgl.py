#!/usr/bin/env python3
"""Genuine Chromium WebGL model + skin regression, not Android or LAN E2E.
On Linux without a display: xvfb-run -a python tests/p8-weapon-art-webgl.py
"""
import re, json, shutil, sys, os, traceback
from pathlib import Path
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit('BLOCKED: playwright package unavailable; requires Chromium WebGL runtime')
ROOT=Path(__file__).resolve().parents[1]
ASSET=ROOT/'AndroidProject/app/src/main/assets'
BASE=json.loads((ROOT/'tests/p8-p7-weapon-anchors.json').read_text())
OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'acceptance/P8-ART-WEBGL-RESULTS.json'
OUT.parent.mkdir(exist_ok=True,parents=True)
results=[]
with sync_playwright() as pw:
    executable=shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    cfg={'headless':not bool(os.environ.get('DISPLAY')),
         'args':['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}
    if executable: cfg['executable_path']=executable
    browser=pw.chromium.launch(**cfg)
    try:
        for client in ('www','phone-host'):
            folder=ASSET/client
            source=(folder/'index.html').read_text()
            source=re.sub(r'<script src="([^"]+)"></script>',
                lambda m:'<script>'+(folder/m[1]).read_text(encoding='utf-8')+'</script>',source)
            needle=r'if (/[?&]debug\b/.test(location.search)) window.__sl'
            assert needle in source,'Missing debug instrumentation anchor'
            source=source.replace(needle,
                "window.__p8={gunFor:gunFor,WEAPONS:WEAPONS,setFinish:setFinish,skinList:typeof skinList==='function'?skinList:weaponFinishList};\n"+needle,1)
            result={'client':client,'checks':[],'page_errors':[]}
            page=browser.new_page(viewport={'width':1280,'height':800})
            page.on('pageerror',lambda error,row=result:row['page_errors'].append(str(error)))
            def check(title,passed):result['checks'].append({'title':title,'pass':bool(passed)})
            try:
                page.set_content(source,wait_until='load',timeout=70000)
                page.wait_for_timeout(250)
                payload=page.evaluate('''() => {
                    const q=window.__p8,models=[];
                    for(const key of Object.keys(q.WEAPONS)){
                        const g=q.gunFor(key),art=[];
                        g.traverse(o=>{if(o.name?.startsWith('P8-'))art.push(o.name)});
                        models.push({key,melee:!!q.WEAPONS[key].melee,art,
                            emergency:!!g.userData.emergencyModel,sightY:g.userData.sightY??null,
                            muzzle:g.userData.muzzle?.position.toArray()??null,
                            mag:!!g.userData.mag,model:g.userData.vr18ModelVersion||'',
                            design:g.userData.design||null});
                    }
                    q.setFinish(2,'pistol');const gun=q.gunFor('pistol');let tinted=0;
                    gun.traverse(o=>{if(o.isMesh&&o.userData.finishBase&&o.material!==o.userData.finishBase)tinted++});
                    q.setFinish(0,'pistol');let restored=true;
                    gun.traverse(o=>{if(o.isMesh&&o.userData.finishBase&&o.material!==o.userData.finishBase)restored=false});
                    return {models,skinVariants:q.skinList('pistol').length,tinted,restored};
                }''')
                models=payload['models'];baseline=BASE[client]
                check('31 weapon models built',len(models)==len(baseline)==31)
                check('27 firearms, no fallback',sum(not m['melee'] for m in models)==27 and
                    all(not m['emergency'] for m in models))
                check('26 firearm detail groups created',all(m['art'] for m in models if
                    not m['melee'] and m['key']!='carbine'))
                check('VR18 geometry is frozen',not next(m['art'] for m in models if m['key']=='carbine'))
                check('All P7 ADS sight/muzzle anchors and identities unchanged',all(
                    {k:m[k] for k in ('sightY','muzzle','mag','model','design')}==baseline.get(m['key'])
                    for m in models))
                check('Existing client-specific weapon finish list preserved',payload['skinVariants']==(12 if client=='www' else 15))
                check('Weapon finishes tint correctly and Factory restores',payload['tinted']>0 and payload['restored'])
                check('No page errors',not result['page_errors'])
                result['models_built']=len(models)
            except Exception as exc:
                result['error']=str(exc)
                result['trace']=traceback.format_exc(limit=2)
            finally:
                result['pass']=bool(result['checks'] and all(c['pass'] for c in result['checks']) and
                                    'error' not in result)
                results.append(result)
                page.close()
                print('PASS' if result['pass'] else 'FAIL',client,
                      sum(c['pass'] for c in result['checks']),'/',len(result['checks']),
                      result.get('error',''),flush=True)
    finally:browser.close()
report={'pass':all(x['pass'] for x in results),'scope':'Real Chromium WebGL model and skin checks; not an APK, Android device, or real LAN multiplayer test','results':results}
OUT.write_text(json.dumps(report,indent=2)+'\n')
print('P8 WebGL', 'PASS' if report['pass'] else 'FAIL',OUT)
sys.exit(0 if report['pass'] else 1)
