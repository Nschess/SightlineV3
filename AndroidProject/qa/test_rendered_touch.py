import asyncio,json,re
from pathlib import Path
from playwright.async_api import async_playwright
project=Path(__file__).resolve().parents[1]
root=project/'app/src/main/assets/www'
s=(root/'index.html').read_text()
def sub(m):
 src=re.search(r'src="([^"]+)"',m.group(0))
 if src:return '<script>'+(root/src.group(1)).read_text()+'</script>'
 body=m.group(1).replace('if (/[?&]debug\\b/.test(location.search)) window.__sl','if (true) window.__sl')
 body=body.replace('requestAnimationFrame(frame);\n})();','requestAnimationFrame(frame);\nwindow.__qa={R:R,startMatch:startMatch,beginRound:beginRound,get state(){return state},get fireHeld(){return fireHeld},get activeFirePointers(){return touchFireOwners.size},get shots(){return M?.stats.shots||0},get scoped(){return scoped},get pitch(){return P.pitch},get yaw(){return P.yaw},get stick(){return [stick.x,stick.y]},get T(){return T},get nextFire(){return nextFire},get cur(){return cur},get mag(){return ammo[cur]?.mag}};\n})();')
 return '<script>'+body+'</script>'
s=re.sub(r'<script\s+src="[^"]+"\s*></script>|<script>([\s\S]*?)</script>',sub,s)
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True,executable_path=__import__('os').environ.get('SIGHTLINE_CHROMIUM') or None,args=['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  page=await browser.new_page(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)
  errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
  await page.set_content(s,wait_until='load',timeout=35000)
  await page.evaluate("()=>{__qa.R.mode='deathmatch';__qa.startMatch();__qa.beginRound();}")
  await page.wait_for_timeout(7000)
  boxes=await page.evaluate("()=>Object.fromEntries(['tb-fire','tb-fire-alt','tz-move','tz-look'].map(id=>{let r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}]}))")
  print('BOXES',boxes)
  def evt(t,id,x,y):return f"(()=>{{let el=document.getElementById('{id}');el.dispatchEvent(new PointerEvent('{t}',{{bubbles:true,cancelable:true,pointerType:'touch',pointerId:{10 if id=='tb-fire' else 11 if id=='tb-fire-alt' else 12},clientX:{x},clientY:{y}}}));return [window.__qa.fireHeld,window.__qa.activeFirePointers,window.__qa.shots,window.__qa.yaw];}})()"
  p,q=boxes['tb-fire'],boxes['tb-fire-alt']
  await page.evaluate(evt('pointerdown','tb-fire',p['x'],p['y']))
  await page.wait_for_timeout(500)
  s1=await page.evaluate(evt('pointerdown','tb-fire-alt',q['x'],q['y']))
  await page.wait_for_timeout(400)
  s2=await page.evaluate(evt('pointerup','tb-fire',p['x'],p['y']))
  await page.wait_for_timeout(450)
  s3=await page.evaluate(evt('pointerup','tb-fire-alt',q['x'],q['y']))
  s4=await page.evaluate('({fire:__qa.fireHeld,count:__qa.activeFirePointers,shots:__qa.shots,state:__qa.state})')
  print('FIRE_HOLD',s1,s2,s3,s4,await page.evaluate('({t:__qa.T,next:__qa.nextFire,gun:__qa.cur,mag:__qa.mag})'))
  await page.screenshot(path=str(project/'qa/evidence/ANDROID-TOUCH-RENDERED.png'))
  print('ERRORS',errs[:10])
  assert s2[0] and s2[1]==1, 'First trigger release stopped second trigger'
  assert not s4['fire'] and s4['count']==0, 'Stuck fire after both triggers release'
  assert s4['shots']>0, 'No actual shots registered'
  assert not errs, 'Browser JS errors'
  await browser.close()
asyncio.run(main())
