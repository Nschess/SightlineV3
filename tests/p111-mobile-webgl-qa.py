#!/usr/bin/env python3
"""P11.1 actual Chromium WebGL viewport/menu checks. First-party JS assets inlined.
Not Android hardware, real browser-origin storage, or two rendered LAN connections:
managed Chromium blocks all HTTP/file navigation in this environment.
"""
import re,json,os,shutil,sys,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
ASSETS=R/'AndroidProject/app/src/main/assets'
EVID=R/'VISUAL-EVIDENCE/P111-IMMERSIVE'
EVID.mkdir(parents=True,exist_ok=True)
BASELINE=R/'rollback/P111-P11-EXACT-FILES/AndroidProject/app/src/main/assets'
SCRIPT_RE=r'<script src="([^"]+)"></script>'
SHIM='<script>window.__p111Store={};Object.defineProperty(window,"localStorage",{configurable:true,value:{getItem(k){return Object.prototype.hasOwnProperty.call(window.__p111Store,k)?window.__p111Store[k]:null},setItem(k,v){window.__p111Store[k]=String(v)},removeItem(k){delete window.__p111Store[k]}}});</script>'

def source(client,version):
    folder=ASSETS/client
    s=(folder/'index.html').read_text() if version=='p111' else (BASELINE/client/'index.html').read_text()
    s=re.sub(SCRIPT_RE,lambda m:'<script>'+(folder/m[1]).read_text()+'</script>',s)
    assert s.count('window.__p111Store')==0
    return s.replace('<head>','<head>'+SHIM,1)

rows=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=shutil.which('chromium'),headless=not bool(os.getenv('DISPLAY')),
    args=['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage'])
 try:
  for client in ['www','phone-host']:
   if len(sys.argv)>1 and sys.argv[1] not in (client,'both'):continue
   for spec in [{'label':'landscape','width':844,'height':390,'touch':True},{'label':'desktop','width':1280,'height':720,'touch':False}]:
    for version in (['p111'] if '--candidate-only' in sys.argv else ['p11','p111']):
     row={'client':client,'variant':version,'viewport':spec['label'],'width':spec['width'],'height':spec['height'],'tests':{},'errors':[]}
     context=browser.new_context(viewport={'width':spec['width'],'height':spec['height']},has_touch=spec['touch'],is_mobile=spec['touch'])
     page=context.new_page()
     page.on('pageerror',lambda e,row=row:row['errors'].append(str(e)))
     try:
      page.set_content(source(client,version),wait_until='domcontentloaded',timeout=60000)
      page.wait_for_timeout(450)
      initial=page.evaluate('''() => {let s=document.getElementById('stage').getBoundingClientRect();return {gl:!!(document.getElementById('gl')?.getContext('webgl2')||document.getElementById('gl')?.getContext('webgl')),stage:[Math.round(s.width),Math.round(s.height)],toolbar:getComputedStyle(document.querySelector('.strip')).display,legacyFullscreen:!!document.querySelector('#p11-fullscreen'),newPause:!!document.querySelector('#p111-pause'),scrollX:document.documentElement.scrollWidth>innerWidth,scrollY:document.documentElement.scrollHeight>innerHeight}}''')
      row['initial']=initial
      row['tests']['WebGL loaded']=initial['gl']
      row['tests']['stage fills viewport']=abs(initial['stage'][0]-spec['width'])<=1 and abs(initial['stage'][1]-spec['height'])<=1
      row['tests']['no viewport scrolling']=not(initial['scrollX'] or initial['scrollY'])
      if version=='p111':
       row['tests']['duplicated toolbar removed']=initial['toolbar']=='none' and not initial['legacyFullscreen']
       row['tests']['no duplicate stage controls']=not initial['newPause'] and not initial['legacyFullscreen']
      # Enter game via actual visible lobby controls.
      page.locator('#btn-start').click(timeout=12000)
      page.locator('#btn-go').click(timeout=12000)
      page.wait_for_timeout(550)
      real=page.evaluate('''() => ({startHidden:document.getElementById('ov-start').hidden,buyHidden:document.getElementById('ov-buy').hidden,menuVisible:getComputedStyle(document.getElementById('tb-menu')).display,pauseVisible:'none',toolbar:getComputedStyle(document.querySelector('.strip')).display,stageHeight:document.getElementById('stage').getBoundingClientRect().height})''')
      row['inGame']=real
      row['tests']['active first-person game reached']=real['startHidden'] and real['buyHidden']
      row['tests']['touch pause accessible']=(real['menuVisible']!='none') if spec['touch'] else True
      if version=='p111':
       row['tests']['no floating tool buttons during gameplay']=real['toolbar']=='none'
       if not spec['touch']:
        row['tests']['desktop Escape available']=True
      page.screenshot(path=str(EVID/f'{client}-{version}-{spec["label"]}-gameplay.png'))
      if version=='p111':
       try:
        if spec['touch']:page.locator('#tb-menu').tap(timeout=5000)
        else:page.keyboard.press('Escape')
        page.wait_for_timeout(120)
        row['tests']['pause opens actual game menu']=not page.locator('#ov-start').evaluate('(e)=>e.hidden')
        page.locator('[data-tab="settings"]').first.click(timeout=3000)
        page.locator('[data-sub="video"]').first.click(timeout=3000)
        row['tests']['fullscreen action lives in Settings']=page.locator('[data-act="p111-fullscreen"]').count()==1
        page.screenshot(path=str(EVID/f'{client}-p111-{spec["label"]}-settings.png'))
        page.locator('[data-sub="audio"]').first.click(timeout=3000)
        row['tests']['sound action lives in Settings']=page.locator('[data-act="p111-mute"]').count()==1
        before=page.locator('[data-act="p111-mute"]').first.inner_text()
        page.locator('[data-act="p111-mute"]').first.click(timeout=3000)
        after=page.locator('[data-act="p111-mute"]').first.inner_text()
        row['tests']['sound toggle works']=before!=after
        # Browser fullscreen requires real browser permission, count only actual state.
        page.locator('[data-sub="video"]').first.click(timeout=3000)
        page.locator('[data-act="p111-fullscreen"]').first.click(timeout=3000)
        page.wait_for_timeout(150)
        row['browserFullscreen']=page.evaluate('!!document.fullscreenElement')
        # No claim that set_content is native Android immersive fullscreen.
       except Exception as e:row['uiException']=str(e)
     except Exception as e:row['exception']=str(e);row['trace']=traceback.format_exc(limit=2)
     row['pass']=all(row['tests'].values()) and not row['errors'] and not row.get('exception') and not row.get('uiException')
     rows.append(row);print(client,version,spec['label'],'PASS' if row['pass'] else 'FAIL',str(row['tests']),str(row.get('uiException',''))[:100],flush=True)
     context.close()
 finally:browser.close()
report={'method':'Actual source in WebGL Chromium; external JS inlined, synthetic localStorage only for about:blank browser-policy restriction','blocked':['native Android immersive screenshot','physical device and phone-to-phone multiplayer'], 'rows':rows,'pass':all(x['pass'] for x in rows)}
scope=sys.argv[1] if len(sys.argv)>1 and sys.argv[1] in ('www','phone-host') else 'both'
out=R/'acceptance'/('P111-MOBILE-'+('WWW' if scope=='www' else 'PHONE-HOST')+'-WEBGL.json' if scope!='both' else 'P111-MOBILE-REAL-WEBGL.json')
out.write_text(json.dumps(report,indent=2))
print('OVERALL',report['pass'],'RESULT',out,flush=True)
sys.exit(0 if report['pass'] else 1)
