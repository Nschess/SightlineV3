/* Runs the complete playable HTML in Chrome, using test-only access to the
   game's existing weapon/reload/ADS functions. No separate model viewer. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require('C:/Users/LOCAL_USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),beforeAssets=path.join(root,'work/phase6-baseline/phone-host'),afterAssets=path.join(root,'AndroidProject/app/src/main/assets/phone-host');
const out=path.join(root,'evidence/phase6-final');fs.mkdirSync(out,{recursive:true});
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
  this._worldShot={unit,cameraModels,observer,cameraRotation};
  return {finite:ok,vertices:geom.attributes.position.count,triangles:geom.index?geom.index.count/3:geom.attributes.position.count/3,actor:!!unit.body,worldWeapon:!!unit.worldGun};
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
  nextFire=0;T+=10;drawT=0;var loaded=a.mag;tryFire(true);var fired=a.mag<loaded;
  renderer.render(scene,camera);var drawCalls=renderer.info.render.calls;
  var vertices=0,triangles=0,meshes=0,newBody=0,bad=[];
  gun.traverse(function(o){if(!o.isMesh)return;var p=o;while(p&&p!==gun){if(!p.visible)return;p=p.parent;}
   meshes++;var g=o.geometry;vertices+=g.attributes.position.count;triangles+=(g.index?g.index.count:g.attributes.position.count)/3;
   if(o.name.indexOf('P1164-baked-'+key)===0)newBody++;
   for(var attr of ['position','normal','uv'])if(g.attributes[attr]&&!Array.from(g.attributes[attr].array).every(Number.isFinite))bad.push(o.name+':'+attr);
  });
  var world=worldWeaponShape(key),worldFinite=Array.from(world.attributes.position.array).every(Number.isFinite);
  var ok=started&&reloaded&&aimed&&unAimed&&fired&&!gun.userData.emergencyModel&&!bad.length&&worldFinite;
  var constructionSignature=gun.userData.bodySignature;
  gun.traverse(function(o){if(o!==gun&&o.userData&&typeof o.userData.bodySignature==='string')constructionSignature=o.userData.bodySignature;});
  return {key,pass:ok,started,reloaded,aimed,unAimed,fired,vertices,triangles,meshes,drawCalls,newBody,bad,worldFinite,signature:constructionSignature,muzzle:m,sight,hipPose,adsPose,stats:JSON.parse(JSON.stringify(w)),realism:!!gun.userData.realism};
 },
 metrics:function(){return {perf:performanceInfo(),render:renderer.info.render,gl:renderer.getContext().getParameter(renderer.getContext().RENDERER)};}
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
   const keys=await page.evaluate(()=>window.__bodyQA.keys()),archiveKeys=await page.evaluate(()=>window.__bodyQA.realismKeys()),guns=[];
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
   const optics=[],actionQA=[];
   if(label==='after'){
    for(const key of keys){
     const shot=await page.evaluate(k=>window.__bodyQA.worldView(k),key);
     await page.screenshot({path:path.join(out,key+'-third-person.png')});
     await page.evaluate(()=>window.__bodyQA.endWorldView());
     if(!shot.finite)throw Error('Non-finite third-person world weapon: '+key);
     const fire=await page.evaluate(k=>window.__bodyQA.action(k,'fire'),key);
     actionQA.push({key,fire});
     await page.screenshot({path:path.join(out,key+'-firing.png')});
     const reload=await page.evaluate(k=>window.__bodyQA.action(k,'reload'),key);
     actionQA[actionQA.length-1].reload=reload;
     await page.screenshot({path:path.join(out,key+'-reload.png')});
    }
    for(const key of await page.evaluate(()=>window.__bodyQA.opticKeys()))optics.push(await page.evaluate(k=>window.__bodyQA.optics(k),key));
   }
   await page.evaluate(()=>{window.__bodyQA.equip('rook117',true);window.__bodyQA.freeze();});
   await page.screenshot({path:path.join(out,'rook117-ads-'+label+'.png')});
   await page.evaluate(()=>window.__bodyQA.equip('rook117',false));
   await page.waitForTimeout(1800);
   const cadence=await page.evaluate(()=>new Promise(resolve=>{
    const frames=[],start=performance.now();let last=start;
    function frame(t){frames.push(t-last);last=t;if(t-start<4000)requestAnimationFrame(frame);else{frames.sort((a,b)=>a-b);resolve({fps:1000*frames.length/(t-start),p50:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],samples:frames.length});}}requestAnimationFrame(frame);
   }));
   results[label]={sourceSHA256:sha(source),archiveKeys,guns,optics,actionQA,errors,cadence,metrics:await page.evaluate(()=>window.__bodyQA.metrics())};
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
  results.drawCalls={beforeAverage:results.before.guns.reduce((n,g)=>n+g.drawCalls,0)/28,afterAverage:results.after.guns.reduce((n,g)=>n+g.drawCalls,0)/28,beforeMax:Math.max(...results.before.guns.map(g=>g.drawCalls)),afterMax:Math.max(...results.after.guns.map(g=>g.drawCalls))};
  results.pass=results.individualBodySignatures===28&&results.archiveSpecSetMatchesRuntime&&results.opticsPass&&results.actionCapturesPass&&results.sourceLoadedFromDisk&&results.statsUnchanged&&results.anchorsFinite&&['before','after'].every(k=>!results[k].errors.length&&results[k].guns.every(g=>g.pass));
 }catch(e){results.error=e.stack;results.pass=false;console.error(e.stack);}
 finally{await browser.close();fs.writeFileSync(path.join(out,'gameplay-results.json'),JSON.stringify(results,null,2));}
 console.log('RESULT',results.pass?'PASS':'FAIL','source='+results.sourceLoadedFromDisk,'stats='+results.statsUnchanged,'anchorsFinite='+results.anchorsFinite);process.exitCode=results.pass?0:1;
})();
