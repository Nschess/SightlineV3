/* Runs the complete playable HTML in Chrome, using test-only access to the
   game's existing weapon/reload/ADS functions. No separate model viewer. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require('C:/Users/LOCAL_USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),beforeAssets=path.resolve(root,'../../../phase7-baseline/phone-host'),afterAssets=path.join(root,'AndroidProject/app/src/main/assets/phone-host');
const out=path.join(root,'evidence/phase7');fs.mkdirSync(out,{recursive:true});
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const probe=String.raw`
window.__bodyQA={
 init:function(){R.bots=1;R.mates=-1;startMatch();beginRound();clearUnits();G.fpsCap=60;G.adaptive=false;G.fps=false;G.shadows='off';G.renderScale=100;applyG();},
 keys:function(){return Object.keys(WEAPONS).filter(k=>!WEAPONS[k].melee);},
 realismKeys:function(){return window.SightlineRealism?SightlineRealism.keys():[];},
 opticKeys:function(){return Object.keys(WEAPONS).filter(k=>SightlineOptics.has(k));},
 equip:function(key,ads){
  updateEffects(10);state='live';P.alive=true;P.hp=100;P.punch=0;P.bob=0;gunKick=0;owned[key]=true;setWeapon(key);
  ammo[key].mag=WEAPONS[key].mag;ammo[key].res=WEAPONS[key].reserve;
  reloading=0;reloadStage=0;drawT=0;T=500;nextFire=0;scoped=!!ads;adsT=ads?1:0;
  P.yaw=0;P.pitch=-.09;
  for(var n=0;n<12;n++)updatePlayer(.016);
  updateHud();renderer.render(scene,camera);return true;
 },
 freeze:function(){state='paused';pausedDrawn=false;renderer.render(scene,camera);},
 action:function(key,kind){
  this.equip(key,false);var w=WEAPONS[key],a=ammo[key];
  if(kind==='reload'){a.mag=Math.max(0,w.mag-4);a.res=w.mag*2;startReload();T+=.12;updatePlayer(.12);}
  else{nextFire=0;T+=10;drawT=0;tryFire(true);updatePlayer(.04);}
  renderer.render(scene,camera);return {kind,mag:a.mag,reloading:reloading>0,fireVisible:!!gunFor(key).userData.flash.visible};
 },
 worldCache:function(){
  var keys=Object.keys(WORLD_GEO),vertices=0,triangles=0,bufferBytes=0;
  keys.forEach(function(key){var g=WORLD_GEO[key];vertices+=g.attributes.position.count;triangles+=(g.index?g.index.count:g.attributes.position.count)/3;
   Object.keys(g.attributes).forEach(function(name){bufferBytes+=g.attributes[name].array.byteLength;});if(g.index)bufferBytes+=g.index.array.byteLength;});
  return {weapons:keys.length,vertices,triangles,geometryBufferBytes:bufferBytes,rendererGeometryCount:renderer.info.memory.geometries};
 },
 optics:function(key){
  if(!SightlineOptics.has(key))return {key,supported:false,options:[]};
  this.equip(key,false);var gun=gunFor(key),original=SightlineOptics.current(key),out=[];
  for(var id of SightlineOptics.options(key)){
   var saved=SightlineOptics.set(key,id);installWeaponOptic(gun,key);renderer.render(scene,camera);
   var node=gun.userData.p10Optic,box=node?new THREE.Box3().setFromObject(node):new THREE.Box3();
   var factoryIron=(id==='iron'&&(key==='pistol'||key==='hawk')&&!!gun.userData.p10Id);
   out.push({id,saved,installed:gun.userData.p10Id===id,sightYFinite:Number.isFinite(gun.userData.sightY),factoryIron,geometryFinite:factoryIron&&box.isEmpty()||!node||[box.min.x,box.min.y,box.min.z,box.max.x,box.max.y,box.max.z].every(Number.isFinite)});
  }
  SightlineOptics.set(key,original);installWeaponOptic(gun,key);renderer.render(scene,camera);
  return {key,supported:true,options:out};
 },
 worldView:function(key){
  this.equip(key,false);
  this.freeze();
  var observer=camera.position.clone(),cameraModels=camera.children.filter(function(o){return !o.isLight;}).map(function(o){return [o,o.visible];});
  var cameraRotation=camera.rotation.clone();
  var direction=new THREE.Vector3();camera.getWorldDirection(direction);
  var right=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(0,1,0)).normalize();
  var at=observer.clone().addScaledVector(direction,2.7).addScaledVector(right,.8);at.y=0;
  var unit=makeUnit(at.x,at.z,ROSTER[ENEMY][0]);unit.y=0;unit.g.position.y=0;
  unit.yaw=Math.atan2(-(observer.x-at.x),-(observer.z-at.z))+.7;unit.g.rotation.y=unit.yaw;
  unit.weapon=key;ensureWorldWeapon(unit,key);cameraModels.forEach(function(p){p[0].visible=false;});
  camera.position.copy(observer);camera.lookAt(at.x,1.10,at.z);camera.updateMatrixWorld(true);unit.g.updateMatrixWorld(true);renderer.render(scene,camera);
  var geom=unit.worldGun.geometry,ok=Array.from(geom.attributes.position.array).every(Number.isFinite);
  this._worldShot={unit,cameraModels,observer,cameraRotation,at:at.clone()};
  var meta=typeof WORLD_WEAPON_META!=='undefined'?WORLD_WEAPON_META[key]||null:null;
  var gripTarget=typeof WORLD_RIGHT_GRIP!=='undefined'?WORLD_RIGHT_GRIP:typeof WORLD_RIGHT_PALM!=='undefined'?WORLD_RIGHT_PALM:null;
  var handMountError=meta&&gripTarget?unit.worldGun.position.distanceTo(gripTarget):null;
  return {finite:ok,vertices:geom.attributes.position.count,triangles:geom.index?geom.index.count/3:geom.attributes.position.count/3,actor:!!unit.body,worldWeapon:!!unit.worldGun,source:meta&&meta.source||'legacy-dedicated',worldMeta:meta,handMountError,drawCalls:renderer.info.render.calls,renderTriangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries};
 },
 closeWorldView:function(){
  var saved=this._worldShot;if(!saved)return false;
  var at=saved.at,camPos=at.clone().add(new THREE.Vector3(1.6,1.55,1.9));
  camera.position.copy(camPos);camera.lookAt(at.x,1.18,at.z);camera.updateMatrixWorld(true);
  // Inspection camera puts the avatar at a three-quarter side angle so the
  // actual firearm silhouette, grip and stock remain readable instead of
  // collapsing into a muzzle-on view.
  var yaw=Math.atan2(-(camPos.x-at.x),-(camPos.z-at.z))+.7;
  saved.unit.yaw=yaw;saved.unit.g.rotation.y=yaw;saved.unit.g.updateMatrixWorld(true);renderer.render(scene,camera);
  return {camera:camPos.toArray(),target:at.toArray(),weaponYaw:saved.unit.worldGun.rotation.y};
 },
 endWorldView:function(){
  var saved=this._worldShot;if(!saved)return false;
  scene.remove(saved.unit.g);saved.cameraModels.forEach(function(p){p[0].visible=p[1];});
  camera.position.copy(saved.observer);camera.rotation.copy(saved.cameraRotation);camera.updateMatrixWorld(true);renderer.render(scene,camera);this._worldShot=null;return true;
 },
 test:function(key){
  this.equip(key,false);var gun=gunFor(key),w=WEAPONS[key],a=ammo[key],m=gun.userData.muzzle.position.toArray(),sight=gun.userData.sightY,hipPose=gun.position.toArray();
  a.mag=Math.max(0,w.mag-4);a.res=w.mag*2;var before=a.mag;startReload();var started=reloading>0;
  for(var i=0;i<90&&reloading>0;i++){T+=.10;updatePlayer(.10);}
  var reloaded=reloading===0&&a.mag>before;
  scoped=true;for(i=0;i<25;i++){T+=.08;updatePlayer(.08);}var aimed=adsT>.94,adsPose=gun.position.toArray();
  scoped=false;for(i=0;i<25;i++){T+=.08;updatePlayer(.08);}var unAimed=adsT<.07;
  // Force an exact zero-spread ADS shot and observe the game's actual Raycaster
  // input. This verifies the center reticle ray and ballistic ray agree.
  scoped=true;for(i=0;i<12;i++){T+=.016;updatePlayer(.016);}camera.rotation.y=P.yaw;camera.rotation.x=P.pitch+P.punch;camera.updateMatrixWorld(true);
  var expectedRay=camera.getWorldDirection(new THREE.Vector3()),capturedRay=null,capturedOrigin=null,oldRandom=Math.random,oldRaySet=raycaster.set;
  nextFire=0;T+=10;drawT=0;var loaded=a.mag;
  try{Math.random=function(){return 0;};raycaster.set=function(origin,direction){capturedOrigin=origin.clone();capturedRay=direction.clone();return oldRaySet.call(raycaster,origin,direction);};tryFire(true);}
  finally{Math.random=oldRandom;raycaster.set=oldRaySet;}
  var fired=a.mag<loaded,centerRayAngle=capturedRay?expectedRay.angleTo(capturedRay):Infinity,centerRayOriginError=capturedOrigin?capturedOrigin.distanceTo(camera.position):Infinity;
  var stageRect=document.getElementById('stage').getBoundingClientRect(),reticleStyle=getComputedStyle(el.xh);
  function reticleAxis(value,extent){var n=parseFloat(value);return value.indexOf('%')>=0?extent*n/100:n;}
  var centerReticleError=Math.hypot((stageRect.left+reticleAxis(reticleStyle.left,stageRect.width))-(stageRect.left+stageRect.width/2),(stageRect.top+reticleAxis(reticleStyle.top,stageRect.height))-(stageRect.top+stageRect.height/2));
  var centerRay={angleRadians:centerRayAngle,originError:centerRayOriginError,reticleCenterError:centerReticleError,pass:centerRayAngle<1e-6&&centerRayOriginError<1e-6&&centerReticleError<1.5};
  renderer.render(scene,camera);var drawCalls=renderer.info.render.calls;
  var vertices=0,triangles=0,meshes=0,newBody=0,bad=[];
  gun.traverse(function(o){if(!o.isMesh)return;var p=o;while(p&&p!==gun){if(!p.visible)return;p=p.parent;}
   meshes++;var g=o.geometry;vertices+=g.attributes.position.count;triangles+=(g.index?g.index.count:g.attributes.position.count)/3;
   if(o.name.indexOf('P1164-baked-'+key)===0)newBody++;
   for(var attr of ['position','normal','uv'])if(g.attributes[attr]&&!Array.from(g.attributes[attr].array).every(Number.isFinite))bad.push(o.name+':'+attr);
  });
  var world=worldWeaponShape(key),worldFinite=Array.from(world.attributes.position.array).every(Number.isFinite);
  var ok=started&&reloaded&&aimed&&unAimed&&fired&&centerRay.pass&&!gun.userData.emergencyModel&&!bad.length&&worldFinite;
  var constructionSignature=gun.userData.bodySignature;
  gun.traverse(function(o){if(o!==gun&&o.userData&&typeof o.userData.bodySignature==='string')constructionSignature=o.userData.bodySignature;});
  return {key,pass:ok,started,reloaded,aimed,unAimed,fired,centerRay,vertices,triangles,meshes,drawCalls,newBody,bad,worldFinite,signature:constructionSignature,muzzle:m,sight,hipPose,adsPose,stats:JSON.parse(JSON.stringify(w)),realism:!!gun.userData.realism};
 },
 metrics:function(){return {perf:performanceInfo(),render:renderer.info.render,gl:renderer.getContext().getParameter(renderer.getContext().RENDERER),worldCache:this.worldCache()};}
};
`;
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-background-timer-throttling','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 const results={note:'Complete playable game in headless Chrome at 1280x720. Controlled offline scene; this is not a measurement of the user\'s visible Chrome window or LAN multiplayer.'};
 try{
  // The isolated browser route below fulfills the actual game source and assets from disk.
  for(const [label,file] of [['before',path.join(beforeAssets,'index.html')],['after',path.join(afterAssets,'index.html')]]){
   const captureDir=path.join(out,label);fs.mkdirSync(captureDir,{recursive:true});
   const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const assets=label==='before'?beforeAssets:afterAssets;
   const source=fs.readFileSync(file,'utf8'),marker='if (/[?&]debug\\b/.test(location.search)) window.__sl';
   if(!source.includes(marker))throw Error('game probe anchor missing');
   await page.route('http://127.0.0.1:39171/**',async route=>{
    if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:source.replace(marker,probe+'\n'+marker)});
    const url=new URL(route.request().url()),relative=decodeURIComponent(url.pathname.replace(/^\/+/,''));
    if(!relative||relative.includes('..'))return route.fulfill({status:404,body:'Not found'});
    const asset=path.resolve(assets,relative);
    if(!asset.startsWith(path.resolve(assets)+path.sep)||!fs.existsSync(asset))return route.fulfill({status:404,body:'Not found'});
    const ext=path.extname(asset).toLowerCase(),contentType=ext==='.js'?'application/javascript':ext==='.json'?'application/json':ext==='.png'?'image/png':ext==='.css'?'text/css':ext==='.wav'?'audio/wav':'application/octet-stream';
    return route.fulfill({status:200,contentType,body:fs.readFileSync(asset)});
   });
   await page.goto('http://127.0.0.1:39171/?debug',{waitUntil:'load'});
   await page.evaluate(()=>window.__bodyQA.init());
   const allKeys=await page.evaluate(()=>window.__bodyQA.keys()),keys=process.env.PHASE7_KEYS?process.env.PHASE7_KEYS.split(',').filter(k=>allKeys.includes(k)):allKeys,archiveKeys=await page.evaluate(()=>window.__bodyQA.realismKeys()),guns=[];
   for(const key of keys)guns.push(await page.evaluate(k=>window.__bodyQA.test(k),key));
   for(const key of keys){
    await page.evaluate(k=>{window.__bodyQA.equip(k,false);window.__bodyQA.freeze();},key);
    await page.screenshot({path:path.join(captureDir,key+'-hip.png')});
    if(label==='after')await page.screenshot({path:path.join(out,key+'-hip.png')});
   }
   for(const key of keys){
    await page.evaluate(k=>{window.__bodyQA.equip(k,true);window.__bodyQA.freeze();},key);
    await page.screenshot({path:path.join(captureDir,key+'-ads.png')});
    if(label==='after')await page.screenshot({path:path.join(out,key+'-ads.png')});
   }
   const optics=[],actionQA=[],worldQA=[];
   for(const key of keys){
    const shot=await page.evaluate(k=>window.__bodyQA.worldView(k),key);
    worldQA.push({key,...shot});
    await page.screenshot({path:path.join(captureDir,key+'-third-person.png')});
    await page.evaluate(()=>window.__bodyQA.closeWorldView());
    await page.screenshot({path:path.join(captureDir,key+'-third-person-close.png')});
    await page.evaluate(()=>window.__bodyQA.endWorldView());
    if(!shot.finite)throw Error('Non-finite third-person world weapon: '+key);
    for(const action of ['fire','reload']){
     const state=await page.evaluate((x)=>window.__bodyQA.action(x.key,x.action),{key,action});
     var entry=actionQA.find(function(a){return a.key===key;});if(!entry){entry={key};actionQA.push(entry);}entry[action]=state;
     await page.screenshot({path:path.join(captureDir,key+'-'+(action==='fire'?'firing':'reload')+'.png')});
    }
   }
   if(label==='after')for(const key of await page.evaluate(()=>window.__bodyQA.opticKeys()))optics.push(await page.evaluate(k=>window.__bodyQA.optics(k),key));
   await page.evaluate(()=>{window.__bodyQA.equip('rook117',true);window.__bodyQA.freeze();});
   await page.screenshot({path:path.join(out,'rook117-ads-'+label+'.png')});
   await page.evaluate(()=>window.__bodyQA.equip('rook117',false));
   await page.waitForTimeout(1800);
   const cadence=await page.evaluate(()=>new Promise(resolve=>{
    const frames=[],start=performance.now();let last=start;
    function frame(t){frames.push(t-last);last=t;if(t-start<4000)requestAnimationFrame(frame);else{frames.sort((a,b)=>a-b);resolve({fps:1000*frames.length/(t-start),p50:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],samples:frames.length});}}requestAnimationFrame(frame);
   }));
   results[label]={sourceSHA256:sha(source),archiveKeys,guns,optics,actionQA,worldQA,errors,cadence,metrics:await page.evaluate(()=>window.__bodyQA.metrics())};
   console.log(label,guns.filter(g=>g.pass).length+'/'+guns.length,'passed','pageErrors='+errors.length,'rAF FPS='+cadence.fps.toFixed(1));
   await context.close();
  }
  results.sourceLoadedFromDisk=results.after.sourceSHA256===sha(fs.readFileSync(path.join(afterAssets,'index.html')));
  results.statsUnchanged=results.before.guns.every((b,i)=>{const a=results.after.guns[i];return b.key===a.key&&JSON.stringify(b.stats)===JSON.stringify(a.stats);});
  results.anchorsFinite=results.after.guns.every(g=>[...g.muzzle,g.sight,...g.hipPose,...g.adsPose].every(Number.isFinite));
  results.individualBodySignatures=new Set(results.after.guns.map(g=>g.signature)).size;
 results.archiveCoverageCount=results.after.guns.filter(g=>g.realism).length;
 results.archiveCoverageKeys=results.after.guns.filter(g=>g.realism).map(g=>g.key);
  results.archiveSpecSetMatchesRuntime=results.after.archiveKeys.length===25&&results.archiveCoverageCount===25&&results.after.archiveKeys.every(k=>results.archiveCoverageKeys.includes(k));
  results.opticsPass=results.after.optics.every(o=>!o.supported||o.options.length>0&&o.options.every(x=>x.saved&&x.installed&&x.sightYFinite&&x.geometryFinite));
  results.actionCapturesPass=results.after.actionQA.length===28&&results.after.actionQA.every(x=>x.fire.mag<results.after.guns.find(g=>g.key===x.key).stats.mag&&x.reload.reloading);
  results.allWeaponWorldModelsCaptured=results.after.worldQA.length===28&&results.after.worldQA.every(x=>x.finite&&x.actor&&x.worldWeapon);
  results.sharedGeometryCoverage=results.after.worldQA.filter(x=>x.key!=='rook117').length===27&&results.after.worldQA.filter(x=>x.key!=='rook117').every(x=>x.source==='first-person-builder'&&x.worldMeta&&x.worldMeta.bounds.every(Number.isFinite)&&x.worldMeta.worldLength>0);
  results.handMountCoverage=results.after.worldQA.filter(x=>x.key!=='rook117').length===27&&results.after.worldQA.filter(x=>x.key!=='rook117').every(x=>x.handMountError!==null&&x.handMountError<1e-6);
  results.worldBoundsPass=results.after.worldQA.filter(x=>x.key!=='rook117').every(x=>x.worldMeta&&x.worldMeta.bounds[0]<=.20&&x.worldMeta.bounds[1]<=.32&&Math.abs(x.worldMeta.bounds[2]-x.worldMeta.worldLength)<=.02);
  results.worldCachePass=results.after.metrics.worldCache.weapons===28&&results.after.metrics.worldCache.vertices>0&&results.after.metrics.worldCache.triangles>0&&results.after.metrics.worldCache.geometryBufferBytes>0;
  results.worldBounds={minX:Math.min(...results.after.worldQA.map(x=>x.worldMeta?x.worldMeta.bounds[0]:0)),maxX:Math.max(...results.after.worldQA.map(x=>x.worldMeta?x.worldMeta.bounds[0]:0)),minY:Math.min(...results.after.worldQA.map(x=>x.worldMeta?x.worldMeta.bounds[1]:0)),maxY:Math.max(...results.after.worldQA.map(x=>x.worldMeta?x.worldMeta.bounds[1]:0)),minZ:Math.min(...results.after.worldQA.map(x=>x.worldMeta?x.worldMeta.bounds[2]:0)),maxZ:Math.max(...results.after.worldQA.map(x=>x.worldMeta?x.worldMeta.bounds[2]:0))};
  results.frameTiming={before:results.before.cadence,after:results.after.cadence,renderer:'headless Chrome SwiftShader software WebGL; not device GPU FPS'};
  results.drawCalls={beforeAverage:results.before.guns.reduce((n,g)=>n+g.drawCalls,0)/28,afterAverage:results.after.guns.reduce((n,g)=>n+g.drawCalls,0)/28,beforeMax:Math.max(...results.before.guns.map(g=>g.drawCalls)),afterMax:Math.max(...results.after.guns.map(g=>g.drawCalls))};
  results.pass=results.individualBodySignatures===28&&results.archiveSpecSetMatchesRuntime&&results.opticsPass&&results.actionCapturesPass&&results.allWeaponWorldModelsCaptured&&results.sharedGeometryCoverage&&results.handMountCoverage&&results.worldBoundsPass&&results.worldCachePass&&results.sourceLoadedFromDisk&&results.statsUnchanged&&results.anchorsFinite&&['before','after'].every(k=>!results[k].errors.length&&results[k].guns.every(g=>g.pass));
 }catch(e){results.error=e.stack;results.pass=false;console.error(e.stack);}
 finally{await browser.close();fs.writeFileSync(path.join(out,'gameplay-results.json'),JSON.stringify(results,null,2));}
 console.log('RESULT',results.pass?'PASS':'FAIL','source='+results.sourceLoadedFromDisk,'stats='+results.statsUnchanged,'anchorsFinite='+results.anchorsFinite);process.exitCode=results.pass?0:1;
})();
