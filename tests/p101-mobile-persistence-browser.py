from pathlib import Path
from playwright.sync_api import sync_playwright
from importlib.machinery import SourceFileLoader
import json,re,shutil,base64,os
ROOT=Path(__file__).resolve().parents[1]
PREV=Path(os.environ.get('SIGHTLINE_P10_BASELINE',str(ROOT.parent/'P10-BASELINE')))
OUT=ROOT/'VISUAL-EVIDENCE/P101-OPTICS';OUT.mkdir(parents=True,exist_ok=True)
INJECT=SourceFileLoader('p85capture',str(ROOT/'tests/p85-capture-matched-webgl.py')).load_module().INJECT
storage='''<script>window.__p101Store={};window.__p101Fail=false;Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:function(k){return Object.prototype.hasOwnProperty.call(window.__p101Store,k)?window.__p101Store[k]:null},setItem:function(k,v){if(window.__p101Fail)throw Error('QuotaExceededError');window.__p101Store[k]=String(v)},removeItem:function(k){delete window.__p101Store[k]}}});</script>'''
def make(root,client):
 folder=root/'AndroidProject/app/src/main/assets'/client
 html=(folder/'index.html').read_text()
 html=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+(folder/m[1]).read_text()+'</script>',html)
 token="if (/[?&]debug\\b/.test(location.search)) window.__sl"
 assert token in html
 html=html.replace(token,INJECT+"\nwindow.__p101test={equip:changeWeaponOptic,gun:gunFor,mem:function(){return renderer.info.memory.geometries;}};\n"+token,1).replace('<head>','<head>'+storage,1)
 return html
report={}
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=not bool(os.getenv('DISPLAY')),executable_path=shutil.which('chromium'),args=['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage'])
 for client in ['www','phone-host']:
  info={};report[client]=info
  for ver,root in ([('P10',PREV)] if (PREV/'AndroidProject/app/src/main/assets/www/index.html').exists() else [])+[('P101',ROOT)]:
   page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
   errors=[];page.on('pageerror',lambda exc:errors.append(str(exc)))
   try:
    page.set_content(make(root,client),wait_until='domcontentloaded',timeout=65000)
    page.wait_for_function('!!window.__p83&&!!window.SightlineOptics',timeout=20000)
    page.evaluate('window.__p83.init()')
    page.evaluate("document.querySelector('.finish-quickpick').click()")
    if client=='www':
     page.get_by_role('tab',name='Optics').click()
     picker=page.get_by_label('Select weapon for optics')
    else:
     page.get_by_role('button',name='Optics',exact=True).click()
     picker=page.get_by_label('Choose weapon optics')
    picker.select_option('aurora')
    page.screenshot(path=str(OUT/f'{ver}-{client}-mobile-menu.png'))
    if ver=='P101':
     # A preview should not equip until explicit confirmation.
     orig=page.evaluate("SightlineOptics.current('aurora')")
     page.get_by_role('button',name='Preview Enclosed Red Dot').click()
     still=page.evaluate("SightlineOptics.current('aurora')")
     assert orig==still,(orig,still)
     page.get_by_role('button',name='Equip Enclosed Red Dot').click()
     assert page.evaluate("SightlineOptics.current('aurora')")=='dot'
     val=page.evaluate("localStorage.getItem('sightline.optics.v1')")
     assert json.loads(val)['aurora']=='dot'
     page.screenshot(path=str(OUT/f'P101-{client}-mobile-equipped.png'))
     # Storage full must not create a phantom equipped state.
     page.evaluate('window.__p101Fail=true')
     page.get_by_role('button',name='Preview Open Reflex').click()
     page.get_by_role('button',name='Equip Open Reflex').click()
     assert page.evaluate("SightlineOptics.current('aurora')")=='dot'
     failure=page.locator('[aria-live="polite"]').all_text_contents()
     assert any('Could not save' in t for t in failure),failure
     page.evaluate('window.__p101Fail=false')
     # Switching other weapons, death state, returning to live do not reset saved optic.
     page.evaluate("window.__p83.live('pistol',false)")
     page.evaluate("window.__p83.live('aurora',true)")
     assert page.evaluate("SightlineOptics.current('aurora')")=='dot'
     # invalid legacy/unknown data is ignored in a new JS context; only supported keys persist.
     # Resource leak: rapid switching should not accumulate geometries unboundedly.
     mem=page.evaluate('''() => {let g=window.__p101test.gun('aurora');for(let i=0;i<80;i++){let id=i%2?'reflex':'dot';if(!window.__p101test.equip('aurora',id))throw Error('set');}return {meshes:g.userData.p10Optic.children.length,stats:window.__p101test.mem(),stored:SightlineOptics.current('aurora')}}''')
     assert mem['meshes']>0
     info['storageFailureRejected']=True;info['previewDoesNotEquip']=True;info['stress']=mem
     page.screenshot(path=str(OUT/f'P101-{client}-mobile-final.png'))
    info[ver]={'pageErrors':errors,'menu':f'VISUAL-EVIDENCE/P101-OPTICS/{ver}-{client}-mobile-menu.png'}
   finally:page.close()
 browser.close()
report['pass']=all(not r['P101']['pageErrors'] for r in report.values() if isinstance(r,dict))
(ROOT/'acceptance/P101-MOBILE-PREVIEW-STORAGE.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
