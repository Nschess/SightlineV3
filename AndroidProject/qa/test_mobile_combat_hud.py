"""Real Chromium/SwiftShader gameplay test; instrumentation only in memory, not shipped HTML."""
import asyncio, json, re, os
from pathlib import Path
from playwright.async_api import async_playwright
root=Path(__file__).resolve().parents[1]/'app/src/main/assets/www'
html=(root/'index.html').read_text()
def bundle(m):
    src=re.search(r'src="([^"]+)"',m.group(0).split('>',1)[0])
    if src: return '<script>'+(root/src.group(1)).read_text()+'</script>'
    code=m.group(1)
    code=code.replace('requestAnimationFrame(frame);\n})();', '''requestAnimationFrame(frame);
window.__qa={G:G, R:R, startMatch:startMatch,beginRound:beginRound, get state(){return state}, get shotCount(){return M&&M.stats?M.stats.shots:0},get mag(){return ammo[cur]&&ammo[cur].mag}, get gun(){return cur}, get scoped(){return scoped},get ownedAds(){return autoAdsOwned},get held(){return fireHeld},get count(){return touchFireOwners.size},get yaw(){return P.yaw},get pitch(){return P.pitch},get stick(){return [stick.x,stick.y]}, get last(){return lastCur},get reload(){return reloading}, get zoom(){return camera.fov},get layout(){return JSON.parse(JSON.stringify(HUD_POS))},get note(){return document.querySelector('#hed-note').textContent}, openEditor:openTouchHudEditor, saveEditor:finishTouchHudEditor, layoutValid:touchHudLayoutValid, setWeapon:setWeapon, owned:owned};
})();''')
    return '<script>'+code+'</script>'
html=re.sub(r'<script\s+src="[^"]+"\s*></script>|<script>([\s\S]*?)</script>',bundle,html)
assert 'window.__qa=' in html
async def main():
    results={};errors=[]
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(headless=False,executable_path=os.environ.get('SIGHTLINE_CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        page=await browser.new_page(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.on('console',lambda m: print('CONSOLE',m.type,m.text[:220]) if m.type in ('error','warning') else None)
        await page.set_content(html,wait_until='load',timeout=45000)
        assert await page.evaluate('()=>!!window.__qa'), 'Game instrumentation unavailable' 
        await page.evaluate("()=>{__qa.R.mode='deathmatch';__qa.startMatch();__qa.beginRound();__qa.G.touchAutoAds=true;__qa.G.touchLabels=false;}")
        await page.wait_for_timeout(6500)
        state=await page.evaluate('()=>__qa.state');results['live_state']=state
        async def emit(event,id,pointer,dx=0,dy=0):
            return await page.evaluate('''({event,id,pointer,dx,dy})=>{
                let el=document.getElementById(id),r=el.getBoundingClientRect();
                el.dispatchEvent(new PointerEvent(event,{bubbles:true,cancelable:true,pointerId:pointer,pointerType:'touch',clientX:r.left+r.width/2+dx,clientY:r.top+r.height/2+dy}));
                return {held:__qa.held,count:__qa.count,scoped:__qa.scoped,yaw:__qa.yaw,shots:__qa.shotCount,gun:__qa.gun};
            }''',dict(event=event,id=id,pointer=pointer,dx=dx,dy=dy))
        # HP FIRE must not enter ADS, even when main auto-ADS is enabled.
        hp=await emit('pointerdown','tb-fire-alt',11);results['hp_start']=hp
        assert not hp['scoped'] and hp['held'] and hp['count']==1,hp
        main=await emit('pointerdown','tb-fire',12);results['main_auto_ads']=main
        assert main['scoped'] and main['count']==2,main
        # Three independent pointers: movement + aim + fire, with visible camera/joystick change.
        await emit('pointerdown','tz-move',21)
        await emit('pointermove','tz-move',21,46,-20)
        movement=await page.evaluate('()=>__qa.stick')
        assert abs(movement[0])>0.2 or abs(movement[1])>0.2,movement
        await emit('pointermove','tb-fire',12,42,18)
        await page.wait_for_timeout(1500)
        results['three_pointer_movement']=movement
        results['three_pointer_yaw']=await page.evaluate('()=>__qa.yaw')
        await emit('pointerup','tz-move',21)
        await page.screenshot(path=str(Path(__file__).parent/'evidence'/'MOBILE-DUAL-FIRE-LIVE-WEBGL-844x390.png'))
        after=await emit('pointerup','tb-fire',12);results['main_release_secondary_held']=after
        assert not after['scoped'] and after['held'] and after['count']==1,after
        await page.wait_for_timeout(750)
        fin=await emit('pointerup','tb-fire-alt',11);results['both_released']=fin
        assert not fin['held'] and fin['count']==0 and not fin['scoped'],fin
        assert fin['shots']>0,fin
        # Glyph mode and always-present screen-reader label.
        results['icon_accessibility']=await page.evaluate('''()=>{let b=document.getElementById('tb-fire-alt');return {icon:!!b.querySelector('.tb-symbol'),caption:!!b.querySelector('.touch-text'),aria:b.getAttribute('aria-label')};}''')
        assert results['icon_accessibility']['icon'] and 'hip-fire' in results['icon_accessibility']['aria']
        # Optional labels should be visible only when selected in settings.
        results['icons_label_hidden']=await page.evaluate('()=>getComputedStyle(document.querySelector("#tb-fire .touch-text")).display')
        await page.evaluate('()=>{__qa.G.touchLabels=true; document.getElementById("touch").classList.add("labels-on")}')
        results['icons_label_visible']=await page.evaluate('()=>getComputedStyle(document.querySelector("#tb-fire .touch-text")).display')
        assert results['icons_label_hidden']=='none' and results['icons_label_visible']!='none'
        # Weapon swap must use last valid firearm and consume neither rounds nor reserve.
        swap=await page.evaluate('''()=>{__qa.owned.carbine=true;__qa.setWeapon('carbine');
            let before={gun:__qa.gun,mag:__qa.mag};document.getElementById('tb-swap').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:44,pointerType:'touch',clientX:650,clientY:350}));
            document.getElementById('tb-swap').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:44,pointerType:'touch'}));
            return {before,after:{gun:__qa.gun,mag:__qa.mag,scoped:__qa.scoped,reload:__qa.reload}};}''')
        results['swap']=swap
        assert swap['after']['gun']=='pistol' and not swap['after']['scoped'] and swap['after']['reload']==0,swap
        # Test touch interruption, no stuck fire or ADS.
        await emit('pointerdown','tb-fire',55)
        await page.evaluate('window.dispatchEvent(new Event("blur"))')
        interrupted=await page.evaluate('()=>({held:__qa.held,count:__qa.count,scoped:__qa.scoped})');results['blur']=interrupted
        assert not interrupted['held'] and interrupted['count']==0 and not interrupted['scoped'],interrupted
        # HUD edit modes, cancel/reset/undo, unsafe drag rejection.
        await page.evaluate('()=>__qa.openEditor()')
        results['editor_open']=await page.locator('#hud-editor').is_visible()
        assert results['editor_open']
        await page.locator('#hed-size').evaluate('(e)=>{e.value="115";e.dispatchEvent(new Event("input",{bubbles:true}))}')
        await page.locator('#hed-undo').click()
        results['undo']=await page.locator('#hed-size').input_value();assert results['undo']=='100'
        # drag fire into centre of editor to ensure it cannot be saved
        await page.evaluate('''()=>{let e=document.getElementById('tb-fire'),r=e.getBoundingClientRect(),stage=document.getElementById('stage').getBoundingClientRect();
            e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:61,pointerType:'touch',clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
            e.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerId:61,pointerType:'touch',clientX:stage.x+stage.width/2,clientY:stage.y+28}));
            e.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:61,pointerType:'touch'}));
        }''')
        results['drag_invalid_message']=await page.evaluate('()=>__qa.layoutValid()')
        assert results['drag_invalid_message'],results
        await page.locator('#hed-save').click()
        results['invalid_save_stays_open']=await page.locator('#hud-editor').is_visible()
        assert results['invalid_save_stays_open']
        await page.locator('#hed-cancel').click()
        assert not await page.locator('#hud-editor').is_visible()
        results['cancel_restored']=True
        # Re-open and Reset plus labels are usable in editor.
        await page.evaluate('()=>__qa.openEditor()')
        await page.locator('#hed-reset').click()
        results['default_layout_check']=await page.evaluate('()=>__qa.layoutValid()')
        await page.screenshot(path=str(Path(__file__).parent/'evidence'/'MOBILE-HUD-EDITOR-844x390.png'))
        await page.locator('#hed-cancel').click()
        # Stretch orientation/resize with touch safe constraints.
        for width,height in [(915,412),(1024,768),(740,360)]:
            await page.set_viewport_size({'width':width,'height':height})
            await page.wait_for_timeout(180)
            results[f'viewport_{width}x{height}']=await page.evaluate('''()=>{
              let st=document.getElementById('stage').getBoundingClientRect();
              return {stage:[st.width,st.height], buttons:Object.fromEntries(['tb-fire','tb-fire-alt','tb-aim','tb-rel','tb-swap'].map(id=>{let r=document.getElementById(id).getBoundingClientRect();return [id,[r.left,r.top,r.right,r.bottom]]}))};
            }''')
        await page.screenshot(path=str(Path(__file__).parent/'evidence'/'MOBILE-HUD-LANDSCAPE-740x360.png'))
        results['errors']=errors
        (Path(__file__).parent/'evidence'/'MOBILE-HUD-RUNTIME-RESULTS.json').write_text(json.dumps(results,indent=2))
        print(json.dumps(results,indent=2)[:8000])
        await browser.close()
        assert not errors, errors
asyncio.run(main())
