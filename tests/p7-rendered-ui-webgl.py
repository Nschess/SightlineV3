#!/usr/bin/env python3
"""Chromium/software-WebGL UI acceptance with in-memory source + test-only LAN stand-ins.
Navigation to a real localhost LAN server is administrator-blocked in this environment.
This is NOT two-browser network E2E, physical Android or real-origin storage testing.
"""
import json,re,sys,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
ASSET=ROOT/'AndroidProject/app/src/main/assets/phone-host'
s=(ASSET/'index.html').read_text(encoding='utf-8')
s=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+ (ASSET/m[1]).read_text(encoding='utf-8')+'</script>',s)
hook="""window.__parityQA={mpPanel,mpAction,mpCosmeticHtml,mpSaveSkin,mpEnsurePuppet,mpSendCosmetics,weaponFinishList,setFinish,MP,
setLobby:function(L){MP.lobby=L;MP.id=1;MP.host=true;MP.myTeam=0;MP.mode=L.mode;MP.sock={readyState:1,send:function(v){(MP.qaMessages||(MP.qaMessages=[])).push(JSON.parse(v));}};}};
if(true) window.__sl"""
needle=r'if (/[?&]debug\b/.test(location.search)) window.__sl'
assert needle in s,'QA injection anchor missing'
s=s.replace(needle,hook,1)
rows=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-dev-shm-usage'])
 try:
  for width,height in [(1280,800),(390,844)]:
   row={'viewport':[width,height],'checks':[],'errors':[]}
   page=browser.new_page(viewport={'width':width,'height':height})
   page.on('pageerror',lambda e,row=row:row['errors'].append(str(e)))
   def check(label,test):row['checks'].append({'label':label,'pass':bool(test)})
   try:
    # About:blank has no real localStorage; a QA-only shim checks save behavior.
    page.evaluate("() => { const saved={};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(k){return Object.prototype.hasOwnProperty.call(saved,k)?saved[k]:null},setItem(k,v){saved[k]=String(v)},removeItem(k){delete saved[k]}}}) }")
    page.set_content(s,wait_until='load',timeout=60000)
    page.wait_for_timeout(500)
    check('Game boots under genuine Chromium/WebGL renderer',page.evaluate('window.__sl?.state')=='idle')
    x=page.evaluate('''() => {const Q=window.__parityQA;
const L={mode:'deathmatch',phase:'lobby',auto:false,map:'courtyard',max:10,rounds:1,time:300,kills:20,maps:[['courtyard','Courtyard','Close']],players:[{id:1,name:'Host',team:0,op:0,skin:'default',finishes:{},host:true},{id:2,name:'Guest',team:1,op:0,skin:'recon',finishes:{carbine:14},host:false}],bots:{mode:'add',skill:'regular',t0:0,t1:0,coop:0,balance:false}};
Q.setLobby(L);
const h=Q.mpPanel('');
const sent=Q.MP.qaMessages||(Q.MP.qaMessages=[]);
Q.mpAction({getAttribute(k){return {"data-net":"kills","data-v":"50"}[k]}});
Q.mpAction({getAttribute(k){return {"data-net":"time","data-v":"600"}[k]}});
Q.mpSaveSkin('recon');
Q.setFinish(14,'carbine');
const u=Q.mpEnsurePuppet(L.players[1]);
return {deathmatch:h.includes('Team Deathmatch'), kills:[10,20,30,50].every(k=>h.includes('data-net="kills" data-v="'+k+'"')),time:[180,300,600,900].every(t=>h.includes('data-net="time" data-v="'+t+'"')),roundsHidden:!h.includes('Rounds to win'), wardrobe:SightlineCharacterSkins.ids.every(id=>h.includes('data-net="skin" data-v="'+id+'"')),finishCatalog:Q.weaponFinishList('carbine').length,otherWeapon:Q.weaponFinishList('pistol').length,playerOutfit:u.skin,puppetMeshes:u.meshes?.length||0,remoteFinish:u.finishes?.carbine, msgs:sent, storedSkin:localStorage.getItem('sightline.characterSkins.v1'),storedFinishes:localStorage.getItem('sightline.weaponFinishes.v2'), ui:Q.mpPanel('')};}''')
    check('Actual host lobby exposes Team Deathmatch',x['deathmatch'])
    check('All four valid server kill limits shown',x['kills'])
    check('All four valid Deathmatch timers shown',x['time'])
    check('Tactical rounds hidden only in Deathmatch',x['roundsHidden'])
    check('Four character outfit choices shown',x['wardrobe'])
    check('Per-weapon base and exclusive finishes exposed',x['finishCatalog']==15 and x['otherWeapon']==15)
    check('Real remote puppet created with selected outfit and cosmetic meshes',x['playerOutfit']=='recon' and x['puppetMeshes']>=3)
    check('Remote weapon finish arrives on puppet',x['remoteFinish']==14)
    msgs=x['msgs']
    check('UI emits authoritative kill-limit and timer commands',any(m.get('t')=='cfg' and m.get('kills')==50 for m in msgs) and any(m.get('t')=='cfg' and m.get('time')==600 for m in msgs))
    check('Outfit selection saved and sent to host',x['storedSkin'] and 'recon' in x['storedSkin'] and any(m.get('t')=='cosmetic' and m.get('skin')=='recon' for m in msgs))
    check('Per-gun finish stored and sent',x['storedFinishes'] and 'carbine' in x['storedFinishes'] and any(m.get('t')=='finish' and m.get('index')==14 for m in msgs))
    # Draw actual lobby HTML using the game's CSS without a server or fake screenshot.
    page.evaluate('''() => { const parent=document.querySelector('.mn-main');if(parent){parent.innerHTML=window.__parityQA.mpPanel('');parent.scrollTop=0;}}''')
    page.wait_for_timeout(150)
    check('Cosmetics and match controls are rendered in the live DOM',page.locator('button[data-net="kills"]').count()==4 and page.locator('button[data-net="skin"]').count()==4)
    row['cosmeticModules']={'outfits':len(x['ui'].split('data-net="skin"'))-1,'weapon_finishes_per_gun':x['finishCatalog']}
    row['pass']=all(c['pass'] for c in row['checks']) and not row['errors']
   except Exception as exc:row['error']=str(exc);row['trace']=traceback.format_exc(limit=2);row['pass']=False
   finally:rows.append(row);page.close();print(('PASS' if row['pass'] else 'FAIL'), 'Chromium/WebGL viewport',width,height,'checks',sum(c['pass'] for c in row['checks']),'/',len(row['checks']),'err',row.get('error'),flush=True)
 finally:browser.close()
out={'kind':'real WebGL renderer + QA-instrumented menu; simulated LAN message capture and storage','two_browser_multiplayer':'BLOCKED (browser navigation ERR_BLOCKED_BY_ADMINISTRATOR)','physical_android':'NOT TESTED','results':rows,'pass':all(x['pass'] for x in rows)}
path=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'acceptance/P7-RENDERED-UI-RESULTS.json'
path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(out,indent=2),encoding='utf-8')
print('RESULT', 'PASS' if out['pass'] else 'FAIL',path)
sys.exit(0 if out['pass'] else 1)
