// Phase 18 isolated runtime verification.
// Serves the real phone-host game tree on 127.0.0.1 only and injects QA accessors
// into the response in memory; production assets are never edited.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const gameRoot = path.join(root, 'AndroidProject/app/src/main/assets/phone-host');
const output = path.resolve(process.env.SIGHTLINE_PHASE18_OUTPUT || path.join(root, 'evidence/phase18'));
const source = fs.readFileSync(path.join(gameRoot, 'index.html'), 'utf8');
const matches = Array.from(source.matchAll(/requestAnimationFrame\(frame\);\r?\n\}\)\(\);\r?\n<\/script>/g));
const marker = matches.at(-1);
assert.ok(marker, 'game-loop injection point changed');
const instrumentation = [
  'var __p18ids=new WeakMap(),__p18next=0;window.__p18qa={WEAPONS:WEAPONS,MAPS:MAPS,R:R,OB:OB,P:P,startMatch:startMatch,beginRound:beginRound,setMap:setMap,setWeapon:setWeapon,startReload:startReload,tryFire:tryFire,get owned(){return owned},get ammo(){return ammo},get guns(){return guns},get current(){return cur},get state(){return state},get scoped(){return scoped},get reloading(){return reloading},get bots(){return bots},get mates(){return mates},get units(){return units},get touchMode(){return touchMode},get stick(){return stick},get lookTouch(){return lookTouch},get match(){return M},get renderer(){return renderer},get scene(){return scene},get camera(){return camera},get map(){return MAPD},get nav(){return NAV},get boxes(){return BOXES},losClear:losClear,get fireHeld(){return fireHeld},get activeFirePointers(){return touchFireOwners.size},get time(){return T},get nextFire(){return nextFire},get huntStats(){return outbreakHuntStats},trackId:function(o){if(!__p18ids.has(o))__p18ids.set(o,++__p18next);return __p18ids.get(o)},infectionState:function(){return SOLO_INF},fireOwners:touchFireOwners,resetTouchMotion:resetTouchMotion,adsState:function(){return {scoped:scoped,adsT:adsT,fov:camera.fov,target:WEAPONS[cur].zoomFov[Math.min(zoomLvl,WEAPONS[cur].zoomFov.length-1)]}}};'
].join('');
const instrumented = source.slice(0, marker.index) + 'requestAnimationFrame(frame);' + instrumentation + '\n})();\n</script>' + source.slice(marker.index + marker[0].length);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.css':'text/css; charset=utf-8', '.mp3':'audio/mpeg', '.ogg':'audio/ogg', '.wav':'audio/wav' };
const requests = [];
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400).end(); return; }
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'content-type':'text/html; charset=utf-8', 'cache-control':'no-store' });
    res.end(instrumented);
    return;
  }
  const file = path.resolve(gameRoot, '.' + pathname);
  if (file !== gameRoot && !file.startsWith(gameRoot + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end(); return; }
    requests.push({ path:pathname, status:200, bytes:st.size });
    res.writeHead(200, { 'content-type':mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length':st.size, 'cache-control':'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});

function summarizeGun(key) {
  const g = window.__p18qa.guns[key], r = { key:key, meshes:0, triangles:0, mappedMaterials:0, loadedMaps:0, normalMaps:0, roughnessMaps:0, materials:[] };
  if (!g) return r;
  g.traverse(function (o) {
    if (!o.isMesh) return;
    r.meshes++;
    if (o.geometry && o.geometry.index) r.triangles += o.geometry.index.count / 3;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(function (m) {
      if (!m) return;
      if (m.map) { r.mappedMaterials++; if (m.map.image && (m.map.image.complete || m.map.image.width > 0)) r.loadedMaps++; }
      if (m.normalMap) r.normalMaps++;
      if (m.roughnessMap) r.roughnessMaps++;
      if (m.name && r.materials.indexOf(m.name) < 0) r.materials.push(m.name);
    });
  });
  return r;
}

async function main() {
  fs.mkdirSync(output, { recursive:true });
  let browser;
  let serverClosed = false;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert.equal(address.address, '127.0.0.1', 'test server must bind only to loopback');
    const executablePath = process.env.P18_CHROMIUM || 'C:/Users/LOCAL_USER/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
    browser = await chromium.launch({ headless:true, executablePath:executablePath, args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking','--disable-sync','--no-first-run'] });
    const context = await browser.newContext({ viewport:{width:1280,height:720}, isMobile:true, hasTouch:true });
    const page = await context.newPage();
    const pageErrors = [], consoleErrors = [], failedRequests = [], textureResponses = [];
    page.on('pageerror', e => pageErrors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('requestfailed', r => failedRequests.push({ url:r.url(), failure:r.failure() && r.failure().errorText }));
    page.on('response', r => {
      const u = new URL(r.url());
      if (u.pathname.includes('/rook117/rook117_') && u.pathname.endsWith('.png')) textureResponses.push({ path:u.pathname, status:r.status(), type:r.headers()['content-type'] });
    });
    await page.route(/^https?:\/\//, route => {
      const u = new URL(route.request().url());
      if (u.hostname === '127.0.0.1' && Number(u.port) === address.port) route.continue();
      else route.abort();
    });
    const url = 'http://127.0.0.1:' + address.port + '/?debug=phase18';
    const pageResponse = await page.goto(url, { waitUntil:'load', timeout:60000 });
    assert.equal(pageResponse.status(), 200);
    await page.waitForFunction(() => !!window.__p18qa && !!window.__p18qa.renderer, null, { timeout:30000 });
    await page.waitForTimeout(1200);
    const probe = await page.evaluate(() => {
      const gl = __p18qa.renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return { browser:navigator.userAgent, glVersion:gl.getParameter(gl.VERSION), glRenderer:gl.getParameter(gl.RENDERER), unmaskedRenderer:dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null, firearms:Object.keys(__p18qa.WEAPONS).filter(k=>!__p18qa.WEAPONS[k].melee), maps:__p18qa.MAPS.map(m=>m.id), touchMode:__p18qa.touchMode };
    });
    assert.ok(probe.glVersion && probe.glRenderer, 'game did not create WebGL context');
    assert.equal(probe.firearms.length, 28);
    assert.equal(probe.maps.length, 18);
    assert.ok(probe.touchMode);

    const mapSmoke = [];
    for (const id of probe.maps) {
      await page.evaluate(k => __p18qa.setMap(k), id);
      await page.waitForTimeout(25);
      const m = await page.evaluate(() => ({ id:__p18qa.map.id, nodes:__p18qa.nav.nodes.length, calls:__p18qa.renderer.info.render.calls, triangles:__p18qa.renderer.info.render.triangles }));
      assert.equal(m.id, id);
      assert.ok(m.nodes > 0 && m.calls > 0 && m.triangles > 0, 'map failed render/nav smoke: ' + id);
      mapSmoke.push(m);
    }

    await page.evaluate(() => {
      const q=__p18qa; q.setMap('courtyard'); q.R.mode='deathmatch'; q.R.bots=0; q.R.mates=0; q.startMatch(); q.beginRound();
      Object.keys(q.WEAPONS).forEach(k=>{q.owned[k]=true;});
      q.setWeapon('rook117');
    });
    await page.waitForFunction(() => __p18qa.state === 'live', null, { timeout:10000 });
    await page.waitForTimeout(1500);
    const centerHitTest = await page.evaluate(() => document.elementsFromPoint(innerWidth / 2, innerHeight / 2).slice(0,8).map(el => {
      const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return {tag:el.tagName,id:el.id,className:typeof el.className==='string'?el.className:'',text:(el.innerText||'').slice(0,80),rect:{x:r.x,y:r.y,width:r.width,height:r.height},background:s.backgroundColor,border:s.border,opacity:s.opacity,display:s.display,pointerEvents:s.pointerEvents,zIndex:s.zIndex};
    }));
    assert.ok(!centerHitTest.some(el=>el.className==='finish-panel'),'hidden cosmetic panel must not cover the center aim point in a touch session');
    const rookHip = await page.evaluate(summarizeGun, 'rook117');
    await page.screenshot({ path:path.join(output,'rook117-hip-http.png'), fullPage:false });
    const textureList = textureResponses.slice();
    assert.ok(textureList.length > 0, 'ROOK117 texture maps were not requested over HTTP');
    assert.ok(textureList.every(t=>t.status===200 && t.type && t.type.includes('image/png')), 'one or more authored ROOK117 textures failed HTTP delivery');
    assert.ok(rookHip.meshes > 0 && rookHip.mappedMaterials > 0 && rookHip.loadedMaps > 0, 'authored ROOK117 maps are not attached to rendered mesh materials');
    assert.equal(rookHip.loadedMaps,rookHip.mappedMaterials,'every mapped ROOK117 material on the active first-person mesh should have a loaded image');
    await page.evaluate(() => { document.getElementById('tb-aim').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:801})); document.getElementById('tb-aim').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerType:'touch',pointerId:801})); });
    await page.waitForFunction(() => { const a=__p18qa.adsState(),o=window.__sl&&window.__sl.opticInfo?window.__sl.opticInfo('rook117'):null; return a.scoped&&o&&Math.abs(a.fov-o.fov)<1; }, null, { timeout:6000 });
    await page.waitForTimeout(100);
    const rookAds = await page.evaluate(() => {
      const q=__p18qa,r=document.getElementById('reticle'),dot=document.querySelector('#reticle i'),b=dot.getBoundingClientRect(),c=q.renderer.domElement.getBoundingClientRect();
      const sights=[];q.camera.updateMatrixWorld(true);q.guns.rook117.updateMatrixWorld(true);
      q.guns.rook117.traverse(function(o){if(!o.isMesh||!/sight|optic|iron|aperture|post/i.test(o.name))return;let v=o,visible=true;while(v){if(!v.visible)visible=false;v=v.parent;}const p=o.getWorldPosition(new THREE.Vector3()).project(q.camera);sights.push({name:o.name,visible:visible,ndc:{x:p.x,y:p.y,z:p.z},screen:{x:(p.x*.5+.5)*c.width+c.x,y:(-.5*p.y+.5)*c.height+c.y}});});
      const msg=document.getElementById('msg'),scope=document.getElementById('scope');
      return { state:q.adsState(),reticle:{hidden:r.hidden,display:getComputedStyle(r).display,dotRect:{x:b.x,y:b.y,width:b.width,height:b.height},x:b.x+b.width/2,y:b.y+b.height/2,viewportX:c.x+c.width/2,viewportY:c.y+c.height/2,canvas:{x:c.x,y:c.y,width:c.width,height:c.height}},scope:{hidden:scope.hidden,display:getComputedStyle(scope).display},message:{text:msg.innerText,shown:msg.classList.contains('on')},optics:window.__sl&&window.__sl.opticInfo?window.__sl.opticInfo('rook117'):null,sights:sights };
    });
    await page.screenshot({ path:path.join(output,'rook117-ads-http.png'), fullPage:false });
    assert.equal(rookAds.state.scoped,true,'ROOK117 touch ADS did not engage');
    assert.ok(rookAds.state.fov < 90,'ADS did not narrow FOV');
    const rookReticleCentered=!rookAds.reticle.hidden&&Math.abs(rookAds.reticle.x-rookAds.reticle.viewportX)<4&&Math.abs(rookAds.reticle.y-rookAds.reticle.viewportY)<4;

    async function pointer(id,event,pointerId) {
      return page.evaluate(({id,event,pointerId})=>{const el=document.getElementById(id);el.dispatchEvent(new PointerEvent(event,{bubbles:true,cancelable:true,pointerType:'touch',pointerId,button:0}));return {held:__p18qa.fireHeld,owners:__p18qa.activeFirePointers,current:__p18qa.current};},{id,event,pointerId});
    }
    await page.evaluate(() => { const q=__p18qa;q.scoped=false;q.setWeapon('carbine');q.ammo.carbine.mag=q.WEAPONS.carbine.mag; });
    await page.waitForFunction(() => __p18qa.time >= __p18qa.nextFire, null, { timeout:20000 });
    await page.waitForTimeout(300);
    const shotsBefore=await page.evaluate(()=>__p18qa.match.stats.shots);
    await pointer('tb-fire-alt','pointerdown',901); await pointer('tb-fire','pointerdown',902); await page.waitForTimeout(800);
    const shotsBoth=await page.evaluate(()=>__p18qa.match.stats.shots);
    const releaseRight=await pointer('tb-fire','pointerup',902); await page.waitForTimeout(450);
    const shotsLeft=await page.evaluate(()=>__p18qa.match.stats.shots);
    const cancelLeft=await pointer('tb-fire-alt','pointercancel',901);
    assert.ok(shotsBoth>shotsBefore,'dual-fire press produced no shots');
    assert.equal(releaseRight.held,true,'releasing one fire button stopped the other');
    assert.ok(shotsLeft>=shotsBoth,'remaining fire pointer did not continue firing');
    assert.equal(cancelLeft.held,false,'touch cancel left firing held');
    assert.equal(cancelLeft.owners,0);

    const motion = await page.evaluate(() => {
      const q=__p18qa,move=document.getElementById('tz-move'),look=document.getElementById('tz-look'),yaw=q.P.yaw,mr=move.getBoundingClientRect(),lr=look.getBoundingClientRect();
      const a=new Touch({identifier:1001,target:move,clientX:mr.left+mr.width/2,clientY:mr.top+mr.height/2});
      move.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[a],changedTouches:[a]}));
      const b=new Touch({identifier:1001,target:move,clientX:a.clientX+55,clientY:a.clientY-30});
      move.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[b],changedTouches:[b]}));
      const stick=[q.stick.x,q.stick.y];move.dispatchEvent(new TouchEvent('touchcancel',{bubbles:true,cancelable:true,touches:[],changedTouches:[b]}));
      const c=new Touch({identifier:1002,target:look,clientX:lr.left+lr.width*.7,clientY:lr.top+lr.height*.5});
      look.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[c],changedTouches:[c]}));
      const d=new Touch({identifier:1002,target:look,clientX:c.clientX+50,clientY:c.clientY+12});
      look.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[d],changedTouches:[d]}));
      const yawDelta=q.P.yaw-yaw;look.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],changedTouches:[d]}));
      return {stick:stick,yawDelta:yawDelta,moveCleared:q.stick.id===null,lookCleared:q.lookTouch.id===null};
    });
    assert.ok(Math.abs(motion.stick[0])>.2||Math.abs(motion.stick[1])>.2,'movement touch did not change joystick');
    assert.notEqual(motion.yawDelta,0,'look touch did not turn');
    assert.ok(motion.moveCleared&&motion.lookCleared,'touch cancel/end left movement or look active');

    await page.evaluate(() => { const q=__p18qa;q.owned.carbine=true;q.owned.rook117=true;q.setWeapon('carbine'); });
    await pointer('tb-swap','pointerdown',1101); await pointer('tb-swap','pointerup',1101);
    const switched=await page.evaluate(()=>__p18qa.current);
    assert.equal(switched,'rook117','touch weapon switch failed');
    await page.evaluate(() => { const q=__p18qa;q.setWeapon('rook117');q.ammo.rook117.mag=Math.max(1,q.ammo.rook117.mag-1); });
    await pointer('tb-aim','pointerdown',1102); await pointer('tb-aim','pointerup',1102);
    const adsAgain=await page.evaluate(()=>__p18qa.adsState());
    await pointer('tb-rel','pointerdown',1103); await pointer('tb-rel','pointerup',1103);
    const reload=await page.evaluate(()=>({remaining:__p18qa.reloading,scoped:__p18qa.scoped}));
    assert.ok(reload.remaining>0,'touch reload did not start');
    assert.equal(reload.scoped,false,'reload did not clear ADS');

    await page.evaluate(() => { const q=__p18qa;q.R.mode='outbreak';q.R.bots=0;q.R.mates=3;q.startMatch();q.beginRound(); });
    await page.waitForFunction(() => __p18qa.OB.phase==='fight'&&__p18qa.bots.some(z=>z.alive&&z.zombie),null,{timeout:30000});
    const outbreakSamples=[];
    const outbreakStart=Date.now();
    for(let i=0;i<36;i++){
      outbreakSamples.push(await page.evaluate(()=>({t:performance.now(),player:{x:__p18qa.P.x,z:__p18qa.P.z,alive:__p18qa.P.alive},stats:{...__p18qa.huntStats},zombies:__p18qa.bots.filter(z=>z.alive&&z.zombie).map(z=>({id:__p18qa.trackId(z),x:z.x,z:z.z,state:z.hunt&&z.hunt.state,hasTarget:!!z.tgt,lastSeen:z.hunt&&z.hunt.seen&&{x:z.hunt.seen.x,z:z.hunt.seen.z},pathNodes:z.path&&z.path.length,rise:z.rise,speed:z.gSpd,distance:z.dP,goal:z.hunt&&z.hunt.goal,fail:z.hunt&&z.hunt.fail,stuck:z.hunt&&z.hunt.stuck,progressAt:z.hunt&&z.hunt.progressAt}))})));
      await page.waitForTimeout(750);
    }
    const outbreakElapsedMs=Date.now()-outbreakStart;
    const huntDeltas=outbreakSamples.map((s,i)=>i?{visible:s.stats.visible-outbreakSamples[i-1].stats.visible,search:s.stats.search-outbreakSamples[i-1].stats.search,stuck:s.stats.stuck-outbreakSamples[i-1].stats.stuck}:null).filter(Boolean);
    const maxVisible=outbreakSamples.at(-1).stats.visible;
    const states=new Set(outbreakSamples.flatMap(s=>s.zombies.map(z=>z.state).filter(Boolean)));
    const firstById=new Map();outbreakSamples.forEach(s=>s.zombies.forEach(z=>{if(!firstById.has(z.id))firstById.set(z.id,{first:z,points:[]});firstById.get(z.id).points.push(z);}));
    const movedZombies=Array.from(firstById.values()).map(({first,points})=>{let maxDisplacement=0;for(const z of points)maxDisplacement=Math.max(maxDisplacement,Math.hypot(z.x-first.x,z.z-first.z));return {id:first.id,samples:points.length,initial:{x:first.x,z:first.z},final:{x:points.at(-1).x,z:points.at(-1).z},maxDisplacement:Math.round(maxDisplacement*100)/100,states:Array.from(new Set(points.map(z=>z.state).filter(Boolean))),targetSamples:points.filter(z=>z.hasTarget).length,pathSamples:points.filter(z=>z.pathNodes>0).length,diagnostic:{rise:points.at(-1).rise,speed:points.at(-1).speed,distance:points.at(-1).distance,goal:points.at(-1).goal,fail:points.at(-1).fail,stuck:points.at(-1).stuck,progressAt:points.at(-1).progressAt}};});
    await page.screenshot({path:path.join(output,'outbreak-live-http.png'),fullPage:false});
    assert.ok(outbreakSamples.at(-1).zombies.length>0,'Outbreak zombies did not remain active during extended sample');
    const outbreakMoved=movedZombies.some(z=>z.maxDisplacement>.5);
    const outbreakTargetOrSearch=maxVisible>0||states.has('chase')||states.has('search');

    const performance=await page.evaluate(()=>({stats:window.__sl&&window.__sl.frameStats?window.__sl.frameStats():null,render:{calls:__p18qa.renderer.info.render.calls,triangles:__p18qa.renderer.info.render.triangles,geometries:__p18qa.renderer.info.memory.geometries,textures:__p18qa.renderer.info.memory.textures}}));
    const runtimeRequests=requests.slice();
    const result={
      server:{bind:address.address,port:address.port,onlyLoopback:true,productionSourceMutated:false},
      renderer:probe,
      screenshotCenterHitTest:centerHitTest,
      assets:{textureResponses:textureResponses,rook117:rookHip,ads:rookAds,allTexturesHttp200:textureResponses.length>0&&textureResponses.every(t=>t.status===200)},
      controls:{dualFire:{shotsBefore:shotsBefore,shotsBothHeld:shotsBoth,shotsAfterOneReleased:shotsLeft,releaseOneHeld:releaseRight.held,cancelCleared:!cancelLeft.held&&cancelLeft.owners===0},movementLookCancel:motion,weaponSwitch:switched,ads:adsAgain,reload:reload},
      maps:{count:mapSmoke.length,allRendered:mapSmoke.every(m=>m.nodes>0&&m.calls>0&&m.triangles>0),details:mapSmoke},
      outbreak:{durationMs:outbreakElapsedMs,samples:outbreakSamples.length,finalStats:outbreakSamples.at(-1).stats,observedStates:Array.from(states),zombieDisplacement:movedZombies,searchSamples:huntDeltas.filter(x=>x.search>0).length,stuckIncrements:huntDeltas.reduce((n,x)=>n+x.stuck,0),sampleTrace:outbreakSamples},
      performance:{...performance,environment:'Headless Chrome 156 / SwiftShader software WebGL; not target device or hardware GPU',phase17Baseline:{p50:50,p95:116.7,p99:133.4,max:233.3,scenario:'Phase 17 final short Outbreak wave; software renderer; comparison is approximate because scene duration/state can differ'}},
      network:{failedRequests:failedRequests,consoleErrors:consoleErrors,pageErrors:pageErrors,servedAssetRequests:runtimeRequests.length},
      acceptance:{textureHttpDelivery:textureResponses.length>0&&textureResponses.every(t=>t.status===200),textureMapsApplied:rookHip.loadedMaps>0,rookAdsCentered:rookReticleCentered,adsReticleApplicable:!rookAds.reticle.hidden,physicalIronSightRendered:rookAds.sights.some(s=>s.visible&&/iron|sight|aperture/i.test(s.name)),mobileDualFire:true,mobileMoveLookCancel:true,mobileSwitchAdsReload:true,outbreakMoved:outbreakMoved,outbreakTargetOrSearchObserved:outbreakTargetOrSearch,runtimeErrors:pageErrors.length}
    };
    fs.writeFileSync(path.join(output,'phase18-runtime-acceptance.json'),JSON.stringify(result,null,2));
    assert.deepEqual(pageErrors,[],'runtime JavaScript exception occurred');
    assert.deepEqual(failedRequests,[],'local page/assets request failed');
    console.log(JSON.stringify({server:result.server,renderer:result.renderer,textureCount:textureResponses.length,loadedMaps:rookHip.loadedMaps,ads:rookAds.state,controls:result.controls,maps:{count:mapSmoke.length,allRendered:result.maps.allRendered},outbreak:{durationMs:outbreakElapsedMs,lineOfSight:result.outbreakLineOfSight,finalStats:result.outbreak.finalStats,states:result.outbreak.observedStates,displacement:movedZombies.map(z=>({id:z.id,maxDisplacement:z.maxDisplacement})),searchSamples:result.outbreak.searchSamples,stuckIncrements:result.outbreak.stuckIncrements},performance:result.performance,errors:{page:pageErrors.length,console:consoleErrors,failedRequests:failedRequests.length}},null,2));
  } finally {
    if(browser) await browser.close();
    if(server.listening) await new Promise(resolve=>server.close(()=>resolve()));
    serverClosed=true;
    if(!serverClosed) throw new Error('loopback server did not shut down');
  }
}

main().catch(e=>{console.error(e);process.exitCode=1;});
