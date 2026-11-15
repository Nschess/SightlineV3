import re, asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
project=Path(__file__).resolve().parents[1]
root=project/'app/src/main/assets/www'
s=(root/'index.html').read_text()
def sub(m):
 src=re.search(r'src="([^"]+)"',m.group(0).split('>',1)[0])
 if src:
  return '<script>'+ (root/src.group(1)).read_text()+'</script>'
 body=m.group(1).replace("if (/[?&]debug\\b/.test(location.search)) window.__sl", "if (true) window.__sl")
 body=body.replace('requestAnimationFrame(frame);\n})();', 'requestAnimationFrame(frame);\nwindow.__qa={makeZombie:makeZombie,hurtBot:hurtBot,startMatch:startMatch,beginRound:beginRound,startWave:startWave,zBalance:ZB,R:R,get bots(){return bots},get units(){return units},get fireHeld(){return fireHeld},get touchFireOwners(){return [...touchFireOwners]},get pitch(){return P.pitch},get yaw(){return P.yaw},get ammo(){return ammo[cur]},get scoped(){return scoped},get wave(){return OB.wave},get mode(){return R.mode},get state(){return state}};\n})();')
 return '<script>'+body+'</script>'
s=re.sub(r'<script\s+src="[^"]+"\s*></script>|<script>([\s\S]*?)</script>',sub,s)
async def run():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=False,executable_path=__import__('os').environ.get('SIGHTLINE_CHROMIUM') or None,args=['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  page=await browser.new_page(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content(s, wait_until='load',timeout=30000)
  await page.wait_for_timeout(1500)
  print('PAGE', await page.evaluate('({canvas:!!document.querySelector("canvas"), qa:!!window.__qa, sl:!!window.__sl,stage:document.querySelector("#stage")?.getBoundingClientRect().width,play:document.querySelector("#pn-play")?.innerText.slice(0,120)})'))
  
  try:
   print('MOBILE_TOUCH',await page.evaluate('({touch:document.documentElement.className,touchBtns:["tb-fire","tb-fire-alt"].map(id=>!!document.getElementById(id)),mode:window.__qa.R.mode})'))
   info=await page.evaluate('''(()=>{__qa.R.mode='outbreak';__qa.startMatch();__qa.beginRound();var u=__qa.makeZombie(9,9,'walker',30,0);var start=u.hp;__qa.hurtBot(u,99,false,true);var mid=u.hp;__qa.hurtBot(u,1,false,true);return {start,mid,end:u.hp,dead:!u.alive,wave30:__qa.zBalance.health('walker',30,'outbreak'),special:__qa.zBalance.health('brute',30,'outbreak')}})()''')
   print('EFFECTIVE_HP',info)
   assert info['start']==100 and info['mid']==1 and info['end']==0 and info['dead'] and info['wave30']==100
   assert info['special']>100
  except Exception as e:
   print('TEST_ERROR',str(e)[:280]); raise
  print('ERRORS',errors[:6]); assert not errors; await browser.close()
if __name__=='__main__':asyncio.run(run())
