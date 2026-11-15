from pathlib import Path
from playwright.sync_api import sync_playwright
from importlib.machinery import SourceFileLoader
import os,re,shutil,base64,json
from PIL import Image,ImageOps,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
FOLDER=ROOT/'AndroidProject/app/src/main/assets'
OUT=ROOT/'VISUAL-EVIDENCE/P101-OPTICS';OUT.mkdir(parents=True,exist_ok=True)
INJECT=SourceFileLoader('inject',str(ROOT/'tests/p85-capture-matched-webgl.py')).load_module().INJECT
memory='''<script>window.__p101Store={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:function(k){return window.__p101Store[k]??null},setItem:function(k,v){window.__p101Store[k]=String(v)},removeItem:function(k){delete window.__p101Store[k]}}});</script>'''
summary={};LABEL={'iron':'Iron Sights','reflex':'Open Reflex','holo':'Holographic','compact':'Compact 2×'}
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=not bool(os.getenv('DISPLAY')),executable_path=shutil.which('chromium'),args=['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage'])
 for client in ['www','phone-host']:
  html=(FOLDER/client/'index.html').read_text()
  html=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+(FOLDER/client/m[1]).read_text()+'</script>',html)
  target='if (/[?&]debug\\b/.test(location.search)) window.__sl';assert target in html
  html=html.replace(target,INJECT+'\nwindow.__p101shot={equip:changeWeaponOptic};\n'+target,1).replace('<head>','<head>'+memory,1)
  page=b.new_page(viewport={'width':960,'height':540},device_scale_factor=1)
  errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
  page.set_content(html,wait_until='domcontentloaded',timeout=60000)
  page.wait_for_function('!!window.__p101shot&&!!window.__p83',timeout=15000)
  paths=[]
  for gun in ['aurora','falcon']:
   for opt in ['iron','reflex','holo','compact']:
    assert page.evaluate('''([k,id])=>window.__p101shot.equip(k,id)''',[gun,opt])
    for state in ['idle','ads']:
     data=page.evaluate('''([k,ads])=>{window.__p83.live(k,ads);return document.querySelector('#gl').toDataURL('image/png')}''',[gun,state=='ads'])
     assert data.startswith('data:image/png;base64,')
     targetf=OUT/f'P101-{client}-{gun}-{opt}-{state}.png'
     targetf.write_bytes(base64.b64decode(data.split(',',1)[1]))
     paths.append(str(targetf.relative_to(ROOT)))
  summary[client]={'frames':len(paths),'errors':errs,'files':paths}
  page.close()
 b.close()
for client in summary:
 for gun in ['aurora','falcon']:
  for state in ['idle','ads']:
   thumbs=[]
   for opt in LABEL:
    im=Image.open(OUT/f'P101-{client}-{gun}-{opt}-{state}.png').convert('RGB');im.thumbnail((500,282))
    thumbs.append(im)
   tileW=max(im.width for im in thumbs);tileH=max(im.height for im in thumbs);gap=16;head=35
   canvas=Image.new('RGB',(tileW*2+gap*3,(tileH+head)*2+gap*3),'#131d28');d=ImageDraw.Draw(canvas)
   for ix,im in enumerate(thumbs):
    x=gap+(ix%2)*(tileW+gap);y=gap+(ix//2)*(tileH+head+gap)
    d.text((x+6,y+5),list(LABEL.values())[ix],fill='#e6f5ff')
    canvas.paste(im,(x,y+head))
   targetf=OUT/f'P101-{client}-{gun}-{state}-Overview.jpg';canvas.save(targetf,quality=88)
summary['pass']=all(x['frames']==16 and not x['errors'] for x in summary.values() if isinstance(x,dict))
(ROOT/'acceptance/P101-OPTIC-GAMEPLAY-CAPTURES.json').write_text(json.dumps(summary,indent=2)+'\n')
print('Captures', {x:{'frames':y['frames'],'errors':y['errors']} for x,y in summary.items() if isinstance(y,dict)},'PASS',summary['pass'])
