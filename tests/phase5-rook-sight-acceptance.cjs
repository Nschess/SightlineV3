/* Runs the actual Sightline game source with test-only probes injected. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require('C:/Users/LOCAL_USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'AndroidProject/app/src/main/assets/phone-host');
const evidence=path.join(root,'evidence/phase5-rook');fs.mkdirSync(evidence,{recursive:true});
// Compare the same authored Rook model immediately before and after the mount
// patch; P1182 predates the current model and made the old comparison invalid.
const baseline=path.join(root,'rollback/P5-BEFORE-ROOK117-REAR-SIGHT-MOUNT');
// Rollback snapshots captured the HTML/manifest but not the large model folder.
// Serve the same current authored model/textures to both HTML revisions so the
// comparison isolates the mount instead of triggering the emergency fallback.
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const probe=String.raw`
window.__rookQA={
 start:function(){R.bots=1;R.mates=-1;startMatch();beginRound();clearUnits();G.fpsCap=60;G.adaptive=false;G.fps=false;G.shadows='off';G.renderScale=100;applyG();},
 equip:function(ads){updateEffects(10);state='live';P.alive=true;P.hp=100;P.punch=0;P.bob=0;gunKick=0;owned.rook117=true;setWeapon('rook117');ammo.rook117.mag=WEAPONS.rook117.mag;ammo.rook117.res=WEAPONS.rook117.reserve;reloading=0;reloadStage=0;drawT=0;T=500;nextFire=0;scoped=!!ads;adsT=ads?1:0;P.yaw=0;P.pitch=-.09;for(var i=0;i<12;i++)updatePlayer(.016);updateHud();renderer.render(scene,camera);},
 inspect:function(){var gun=gunFor('rook117'),names=[],materials={},triangles=0;gun.traverse(function(o){if(!o.isMesh)return;var p=o;while(p&&p!==gun){if(!p.visible)return;p=p.parent;}names.push(o.name);materials[o.material.type]=(materials[o.material.type]||0)+1;var g=o.geometry;triangles+=(g.index?g.index.count:g.attributes.position.count)/3;});var world=worldWeaponShape('rook117');return {names:names,materials:materials,triangles:triangles,sightMountMeshes:names.filter(function(n){return n.indexOf('P5-ROOK117-rear-sight-')===0;}).length,worldTriangles:(world.index?world.index.count:world.attributes.position.count)/3,signature:gun.userData.bodySignature,sightY:gun.userData.sightY,weapon:JSON.parse(JSON.stringify(WEAPONS.rook117)),modelFaults:MODEL_DIAGNOSTICS.slice()};},
 sight:function(){renderer.render(scene,camera);var gun=gunFor('rook117');function project(v){return new THREE.Vector3(v[0],v[1],v[2]).applyMatrix4(gun.matrixWorld).project(camera).toArray();}return {frontPostTop:project([0,.124,-.535]),rearAperture:project([0,.138,.051]),center:[0,0]};},
 gameplay:function(){state='live';P.alive=true;var gun=gunFor('rook117'),w=WEAPONS.rook117,a=ammo.rook117,muzzle=gun.userData.muzzle.position.toArray();a.mag=w.mag-5;a.res=w.reserve;var before=a.mag;startReload();var reloadStarted=reloading>0;for(var i=0;i<100&&reloading>0;i++){T+=.10;updatePlayer(.10);}var reloadPassed=reloading===0&&a.mag>before;state='live';P.alive=true;scoped=true;for(i=0;i<26;i++){T+=.08;updatePlayer(.08);}var adsPassed=adsT>.94;scoped=false;for(i=0;i<26;i++){T+=.08;updatePlayer(.08);}var hipPassed=adsT<.07;nextFire=0;drawT=0;T+=10;var loaded=a.mag;tryFire(true);var fired=a.mag<loaded;return {reloadStarted:reloadStarted,reloadPassed:reloadPassed,adsPassed:adsPassed,adsValue:adsT,hipPassed:hipPassed,fired:fired,current:cur,state:state,alive:P.alive,muzzle:muzzle,stats:JSON.parse(JSON.stringify(w))};},
 freeze:function(){state='paused';pausedDrawn=false;renderer.render(scene,camera);},
 metrics:function(){return {render:renderer.info.render,renderer:renderer.getContext().getParameter(renderer.getContext().RENDERER)};}
};`;
async function cadence(page){return page.evaluate(()=>new Promise(resolve=>{const a=[],s=performance.now();let last=s;function f(t){a.push(t-last);last=t;if(t-s<3000)requestAnimationFrame(f);else{a.sort((x,y)=>x-y);resolve({fps:1000*a.length/(t-s),p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],samples:a.length});}}requestAnimationFrame(f);}));}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-background-timer-throttling']});
 const results={note:'Actual game source at 1280x720 in controlled offline Chrome; this is not user-visible Chrome or mobile/LAN performance.'};
 try{
  // The isolated browser route below fulfills the actual game source and assets from disk.
  for(const [label,file] of [['before',path.join(baseline,'phone-host-index.html')],['after',path.join(assets,'index.html')]]){
   const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1}),page=await ctx.newPage(),errors=[],assetResponses=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).pathname.indexOf('/rook117/')===0)assetResponses.push({path:new URL(r.url()).pathname,status:r.status()});});
   const source=fs.readFileSync(file,'utf8'),marker='if (/[?&]debug\\b/.test(location.search)) window.__sl';if(!source.includes(marker))throw Error('Game probe anchor missing in '+label);
   await page.route('http://127.0.0.1:39171/**',async route=>{
    if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:source.replace(marker,probe+'\n'+marker)});
    const url=new URL(route.request().url());
     const relative=decodeURIComponent(url.pathname.replace(/^\/+/,''));
     if(!relative||relative.includes('..'))return route.fulfill({status:404,body:'Not found'});
     const asset=path.resolve(assets,relative);
     if(!asset.startsWith(path.resolve(assets)+path.sep)||!fs.existsSync(asset))return route.fulfill({status:404,body:'Not found'});
     const ext=path.extname(asset).toLowerCase(),contentType=ext==='.js'?'application/javascript':ext==='.json'?'application/json':ext==='.png'?'image/png':ext==='.css'?'text/css':ext==='.wav'?'audio/wav':'application/octet-stream';
     return route.fulfill({status:200,contentType,body:fs.readFileSync(asset)});
   });
   await page.goto('http://127.0.0.1:39171/?debug',{waitUntil:'load'});await page.evaluate(()=>window.__rookQA.start());
   await page.evaluate(()=>window.__rookQA.equip(false));await page.waitForTimeout(2500);await page.evaluate(()=>window.__rookQA.freeze());
   await page.screenshot({path:path.join(evidence,'rook117-'+label+'.png')});const hip=await page.evaluate(()=>window.__rookQA.inspect());
   const gameplay=await page.evaluate(()=>window.__rookQA.gameplay());await page.evaluate(()=>window.__rookQA.equip(true));await page.waitForTimeout(2500);await page.evaluate(()=>window.__rookQA.freeze());
   const sight=await page.evaluate(()=>window.__rookQA.sight());await page.screenshot({path:path.join(evidence,'rook117-ads-'+label+'.png')});const fps=await cadence(page);
   results[label]={sourceSHA256:sha(source),hip,gameplay,sight,fps,errors,assetResponses,render:await page.evaluate(()=>window.__rookQA.metrics())};await ctx.close();
  }
  const old=results.before.gameplay,now=results.after.gameplay;
  results.sourceLoadedFromDisk=results.after.sourceSHA256===sha(fs.readFileSync(path.join(assets,'index.html')));
  results.statsUnchanged=JSON.stringify(old.stats)===JSON.stringify(now.stats);results.muzzleAnchorUnchanged=JSON.stringify(old.muzzle)===JSON.stringify(now.muzzle);
  results.authoredModelLoaded=results.after.hip.names.some(n=>n.indexOf('ROOK117-P1181-')===0)&&results.after.hip.materials.MeshStandardMaterial>0&&results.after.hip.worldTriangles>0;
  results.assetLoadsPassed=results.after.assetResponses.length===19&&results.after.assetResponses.every(a=>a.status===200);
  results.sightAligned=Math.abs(results.after.sight.frontPostTop[1])<.025&&Math.abs(results.after.sight.rearAperture[1])<.025&&Math.abs(results.after.sight.frontPostTop[0])<.01&&Math.abs(results.after.sight.rearAperture[0])<.01;
  results.gameplayPassed=results.after.gameplay.reloadStarted&&results.after.gameplay.reloadPassed&&results.after.gameplay.adsPassed&&results.after.gameplay.hipPassed&&results.after.gameplay.fired;
  results.sightMountVerified=results.before.hip.sightMountMeshes===0&&results.after.hip.sightMountMeshes>=7;
  results.pass=results.sourceLoadedFromDisk&&results.statsUnchanged&&results.muzzleAnchorUnchanged&&results.authoredModelLoaded&&results.assetLoadsPassed&&results.sightMountVerified&&results.sightAligned&&results.gameplayPassed&&!results.after.errors.length&&!results.after.hip.modelFaults.length;
 }catch(e){results.error=e.stack;results.pass=false;console.error(e.stack);}finally{await browser.close();fs.writeFileSync(path.join(evidence,'gameplay-results.json'),JSON.stringify(results,null,2));}
 console.log('RESULT',results.pass?'PASS':'FAIL','source='+results.sourceLoadedFromDisk,'model='+results.authoredModelLoaded,'mount='+results.sightMountVerified,'assets='+results.assetLoadsPassed,'ADS='+results.sightAligned,'gameplay='+results.gameplayPassed);process.exitCode=results.pass?0:1;
})();

