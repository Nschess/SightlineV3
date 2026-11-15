/* Runs the complete playable HTML in Chrome, using test-only access to the
   game's existing weapon/reload/ADS functions. No separate model viewer. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require('C:/Users/LOCAL_USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'AndroidProject/app/src/main/assets/phone-host');
const out=path.join(root,'evidence/P1179');fs.mkdirSync(out,{recursive:true});
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const probe=String.raw`
window.__bodyQA={
 init:function(){R.bots=1;R.mates=-1;startMatch();beginRound();clearUnits();G.fpsCap=60;G.adaptive=false;G.fps=false;G.shadows='off';G.renderScale=100;applyG();},
 keys:function(){return Object.keys(WEAPONS).filter(k=>!WEAPONS[k].melee);},
 equip:function(key,ads){
  updateEffects(10);state='live';P.alive=true;P.hp=100;P.punch=0;P.bob=0;gunKick=0;owned[key]=true;setWeapon(key);
  ammo[key].mag=WEAPONS[key].mag;ammo[key].res=WEAPONS[key].reserve;
  reloading=0;reloadStage=0;drawT=0;T=500;nextFire=0;scoped=!!ads;adsT=ads?1:0;
  P.yaw=0;P.pitch=-.09;
  for(var n=0;n<12;n++)updatePlayer(.016);
  updateHud();renderer.render(scene,camera);return true;
 },
 freeze:function(){state='paused';pausedDrawn=false;renderer.render(scene,camera);},
 test:function(key){
  this.equip(key,false);var gun=gunFor(key),w=WEAPONS[key],a=ammo[key],m=gun.userData.muzzle.position.toArray(),sight=gun.userData.sightY,hipPose=gun.position.toArray();
  a.mag=Math.max(0,w.mag-4);a.res=w.mag*2;var before=a.mag;startReload();var started=reloading>0;
  for(var i=0;i<90&&reloading>0;i++){T+=.10;updatePlayer(.10);}
  var reloaded=reloading===0&&a.mag>before;
  scoped=true;for(i=0;i<25;i++){T+=.08;updatePlayer(.08);}var aimed=adsT>.94,adsPose=gun.position.toArray();
  scoped=false;for(i=0;i<25;i++){T+=.08;updatePlayer(.08);}var unAimed=adsT<.07;
  nextFire=0;T+=10;drawT=0;var loaded=a.mag;tryFire(true);var fired=a.mag<loaded;
  var vertices=0,triangles=0,meshes=0,newBody=0,bad=[];
  gun.traverse(function(o){if(!o.isMesh)return;var p=o;while(p&&p!==gun){if(!p.visible)return;p=p.parent;}
   meshes++;var g=o.geometry;vertices+=g.attributes.position.count;triangles+=(g.index?g.index.count:g.attributes.position.count)/3;
   if(o.name.indexOf('P1164-baked-'+key)===0)newBody++;
   for(var attr of ['position','normal','uv'])if(g.attributes[attr]&&!Array.from(g.attributes[attr].array).every(Number.isFinite))bad.push(o.name+':'+attr);
  });
  var world=worldWeaponShape(key),worldFinite=Array.from(world.attributes.position.array).every(Number.isFinite);
  var ok=started&&reloaded&&aimed&&unAimed&&fired&&!gun.userData.emergencyModel&&!bad.length&&worldFinite;
  return {key,pass:ok,started,reloaded,aimed,unAimed,fired,vertices,triangles,meshes,newBody,bad,worldFinite,muzzle:m,sight,hipPose,adsPose,stats:JSON.parse(JSON.stringify(w))};
 },
 metrics:function(){return {perf:performanceInfo(),render:renderer.info.render,gl:renderer.getContext().getParameter(renderer.getContext().RENDERER)};}
};
`;
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-background-timer-throttling']});
 const results={note:'Complete playable game in headless Chrome at 1280x720. Controlled offline scene; this is not a measurement of the user\'s visible Chrome window or LAN multiplayer.'};
 try{
  const liveContext=await browser.newContext();
  const served=await liveContext.request.get('http://localhost:8080/');
  results.servedSourceMatchesDisk=sha(await served.body())===sha(fs.readFileSync(path.join(assets,'index.html')));
  await liveContext.close();
  for(const [label,file] of [['before',path.join(root,'rollback/P1179-BEFORE-REALISTIC-PROPORTIONS/phone-host-index.html')],['after',path.join(assets,'index.html')]]){
   const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const source=fs.readFileSync(file,'utf8'),marker='if (/[?&]debug\\b/.test(location.search)) window.__sl';
   if(!source.includes(marker))throw Error('game probe anchor missing');
   await page.route('http://localhost:8080/**',async route=>{
    if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:source.replace(marker,probe+'\n'+marker)});
    return route.continue();
   });
   await page.goto('http://localhost:8080/?debug',{waitUntil:'load'});
   await page.evaluate(()=>window.__bodyQA.init());
   const keys=await page.evaluate(()=>window.__bodyQA.keys()),guns=[];
   for(const key of keys)guns.push(await page.evaluate(k=>window.__bodyQA.test(k),key));
   for(const key of ['rook117','scatter','thunder','kestrel','vantage']){
    await page.evaluate(k=>{window.__bodyQA.equip(k,false);window.__bodyQA.freeze();},key);
    await page.screenshot({path:path.join(out,key+'-'+label+'.png')});
   }
   await page.evaluate(()=>{window.__bodyQA.equip('rook117',true);window.__bodyQA.freeze();});
   await page.screenshot({path:path.join(out,'rook117-ads-'+label+'.png')});
   await page.evaluate(()=>window.__bodyQA.equip('rook117',false));
   await page.waitForTimeout(1800);
   const cadence=await page.evaluate(()=>new Promise(resolve=>{
    const frames=[],start=performance.now();let last=start;
    function frame(t){frames.push(t-last);last=t;if(t-start<4000)requestAnimationFrame(frame);else{frames.sort((a,b)=>a-b);resolve({fps:1000*frames.length/(t-start),p50:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],samples:frames.length});}}requestAnimationFrame(frame);
   }));
   results[label]={sourceSHA256:sha(source),guns,errors,cadence,metrics:await page.evaluate(()=>window.__bodyQA.metrics())};
   console.log(label,guns.filter(g=>g.pass).length+'/'+guns.length,'passed','pageErrors='+errors.length,'rAF FPS='+cadence.fps.toFixed(1));
   await context.close();
  }
  results.statsAndAnchorsUnchanged=results.before.guns.every((b,i)=>{
   const a=results.after.guns[i];return b.key===a.key&&JSON.stringify(b.stats)===JSON.stringify(a.stats)&&b.sight===a.sight&&JSON.stringify(b.muzzle)===JSON.stringify(a.muzzle)&&b.adsPose.every((v,j)=>Math.abs(v-a.adsPose[j])<1e-7);
  });
  results.pass=results.servedSourceMatchesDisk&&results.statsAndAnchorsUnchanged&&['before','after'].every(k=>!results[k].errors.length&&results[k].guns.every(g=>g.pass));
 }catch(e){results.error=e.stack;results.pass=false;console.error(e.stack);}
 finally{await browser.close();fs.writeFileSync(path.join(out,'gameplay-results.json'),JSON.stringify(results,null,2));}
 console.log('RESULT',results.pass?'PASS':'FAIL','served='+results.servedSourceMatchesDisk,'stats/anchors='+results.statsAndAnchorsUnchanged);process.exitCode=results.pass?0:1;
})();
