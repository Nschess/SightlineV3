/* Isolated real-game WebGL capture harness for Phase 8. It injects only a QA
   probe into the playable HTML, then exercises the game's world weapon and
   remote-puppet pose functions in headless Chrome/SwiftShader. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const baselineRoot=fs.mkdtempSync(path.join(root,'tests','.phase8-baseline-'));
const afterAssets=path.join(root,'AndroidProject/app/src/main/assets/phone-host');
const beforeAssets=path.join(baselineRoot,'phone-host');fs.cpSync(afterAssets,beforeAssets,{recursive:true});
fs.copyFileSync(path.join(root,'rollback/phase8-prechange/phone-host-index.html'),path.join(beforeAssets,'index.html'));
const builds={before:beforeAssets,after:afterAssets};
const out=path.join(root,'evidence/phase8');fs.mkdirSync(out,{recursive:true});
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const probe=String.raw`
window.__p8={
 init:function(){R.bots=1;R.mates=-1;startMatch();beginRound();clearUnits();G.fpsCap=60;G.adaptive=false;G.fps=false;G.shadows='off';G.renderScale=100;applyG();},
 keys:function(){return Object.keys(WEAPONS).filter(k=>!WEAPONS[k].melee);},
 grip:function(){return typeof WORLD_RIGHT_GRIP!=='undefined'?WORLD_RIGHT_GRIP:new THREE.Vector3(.12,1.22,-.05);},
 start:function(key,view,state){
  if(this.unit){scene.remove(this.unit.g);this.unit=null;}
  this.equip(key);state=''+(state||'idle');
  var observer=camera.position.clone(),cameraModels=camera.children.filter(o=>!o.isLight).map(o=>[o,o.visible]);
  var direction=new THREE.Vector3();camera.getWorldDirection(direction);
  var right=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(0,1,0)).normalize();
  var at=observer.clone().addScaledVector(direction,2.7).addScaledVector(right,.8);at.y=0;
  var unit=makeUnit(at.x,at.z,ROSTER[ENEMY][0]);unit.x=at.x;unit.z=at.z;unit.y=0;unit.g.position.set(at.x,0,at.z);unit.yaw=0;unit.g.rotation.y=0;
  unit.weapon=key;unit.wk=key;ensureWorldWeapon(unit,key);unit.worldGun.visible=true;
  cameraModels.forEach(p=>p[0].visible=false);
  var angles={front:[0,-2.75],right:[2.75,0],rear:[0,2.75],left:[-2.75,0],threequarter:[1.9,-2.0]};
  var d=angles[view]||angles.threequarter;
  camera.position.set(at.x+d[0],1.32,at.z+d[1]);camera.lookAt(at.x,1.02,at.z);camera.updateMatrixWorld(true);
  unit.wasAlive=true;unit.alive=true;unit.buf=[];unit.worldKey=key;unit.weaponPulse=state==='firing'?1:0;
  var t=1000,move=state==='movement';
  var a={t:t,x:at.x,y:0,z:at.z,yaw:0,pitch:state==='aiming'?.24:0,cr:0,pr:0,al:true,rl:state==='reload'?.5:0};
  var c=Object.assign({},a,{t:t+100,x:at.x+(move?.18:0)});unit.buf=[a,c];
  if(typeof mpPuppetStep==='function')mpPuppetStep(unit,move?.1:.016,t+(move?100:16));
  else throw new Error('Playable remote puppet pose function is not available');
  if(state==='idle'){
    unit.worldGun.position.copy(this.grip());unit.worldGun.rotation.set(0,.31,0);
    unit.g.position.set(at.x,0,at.z);unit.g.rotation.y=0;
  }
  unit.g.updateMatrixWorld(true);camera.updateMatrixWorld(true);renderer.render(scene,camera);
  this.saved={observer,cameraRotation:camera.rotation.clone(),cameraModels,at};this.unit=unit;
  var meta=typeof WORLD_WEAPON_META!=='undefined'?WORLD_WEAPON_META[key]:null;
  var gaps=this.armGaps();
  return {key,view,state,root:unit.worldGun.position.toArray(),rotation:[unit.worldGun.rotation.x,unit.worldGun.rotation.y,unit.worldGun.rotation.z],weaponLength:meta&&meta.worldLength||null,playerHeight:unit.op.h,bodyBounds:new THREE.Box3().setFromObject(unit.body).getSize(new THREE.Vector3()).toArray(),armGaps:gaps};
 },
 equip:function(key){updateEffects(10);state='live';P.alive=true;P.hp=100;P.punch=0;P.bob=0;gunKick=0;owned[key]=true;setWeapon(key);ammo[key].mag=WEAPONS[key].mag;ammo[key].res=WEAPONS[key].reserve;reloading=0;reloadStage=0;drawT=0;T=500;nextFire=0;scoped=false;adsT=0;P.yaw=0;P.pitch=-.09;for(var n=0;n<8;n++)updatePlayer(.016);state='paused';pausedDrawn=false;renderer.render(scene,camera);},
 armGaps:function(){var u=this.unit;if(!u||!u.armR||!u.armL)return {right:Infinity,left:Infinity};u.g.updateMatrixWorld(true);var r=WORLD_RIGHT_DEFAULT_DIR.clone().applyMatrix4(u.armR.matrixWorld),l=WORLD_LEFT_DEFAULT_DIR.clone().applyMatrix4(u.armL.matrixWorld),rt=WORLD_ARM_RIGHT_TARGET.clone().applyMatrix4(u.g.matrixWorld),lt=WORLD_ARM_LEFT_TARGET.clone().applyMatrix4(u.g.matrixWorld);return {right:r.distanceTo(rt),left:l.distanceTo(lt)};},
 pose:function(){var u=this.unit,gaps=this.armGaps();return {position:u.worldGun.position.toArray(),rotation:[u.worldGun.rotation.x,u.worldGun.rotation.y,u.worldGun.rotation.z],root:this.grip().toArray(),armGaps:gaps,finite:[...u.worldGun.position.toArray(),u.worldGun.rotation.x,u.worldGun.rotation.y,u.worldGun.rotation.z].every(Number.isFinite)&&gaps.right<.025&&gaps.left<.025};},
 end:function(){if(!this.unit)return;scene.remove(this.unit.g);this.saved.cameraModels.forEach(p=>p[0].visible=p[1]);camera.position.copy(this.saved.observer);camera.rotation.copy(this.saved.cameraRotation);camera.updateMatrixWorld(true);this.unit=null;this.saved=null;renderer.render(scene,camera);}
};`;
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-background-timer-throttling','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 const results={renderer:'Playable Sightline V3 source in isolated headless Chrome SwiftShader WebGL; no separate model viewer.',states:['idle','movement','aiming','firing','reload'],angles:['front','right','rear','left','threequarter'],builds:{}};
 try{
  for(const label of ['before','after']){
   const assets=builds[label],file=path.join(assets,'index.html'),source=fs.readFileSync(file,'utf8'),marker='if (/[?&]debug\\b/.test(location.search)) window.__sl';
   if(!source.includes(marker))throw Error('QA injection anchor missing in '+file);
   const dir=path.join(out,label);fs.mkdirSync(dir,{recursive:true});
   const context=await browser.newContext({viewport:{width:960,height:540},deviceScaleFactor:1});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('http://127.0.0.1:39172/**',async route=>{
    if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:source.replace(marker,probe+'\n'+marker)});
    const url=new URL(route.request().url()),relative=decodeURIComponent(url.pathname.replace(/^\/+/,''));
    if(!relative||relative.includes('..'))return route.fulfill({status:404,body:'Not found'});
    const asset=path.resolve(assets,relative);if(!asset.startsWith(path.resolve(assets)+path.sep)||!fs.existsSync(asset))return route.fulfill({status:404,body:'Not found'});
    const ext=path.extname(asset).toLowerCase(),type=ext==='.js'?'application/javascript':ext==='.json'?'application/json':ext==='.png'?'image/png':ext==='.css'?'text/css':ext==='.wav'?'audio/wav':'application/octet-stream';
    return route.fulfill({status:200,contentType:type,body:fs.readFileSync(asset)});
   });
   await page.goto('http://127.0.0.1:39172/?debug',{waitUntil:'load'});await page.evaluate(()=>window.__p8.init());
   const keys=await page.evaluate(()=>window.__p8.keys()),shots=[],poseResults=[];
   for(const key of keys){
    for(const angle of results.angles){
     const data=await page.evaluate(([k,a])=>window.__p8.start(k,a,'idle'),[key,angle]);
     const name=key+'__'+angle+'__idle.jpg';await page.screenshot({path:path.join(dir,name),type:'jpeg',quality:84});shots.push({key,angle,state:'idle',file:name,pose:data});
     await page.evaluate(()=>window.__p8.end());
    }
    for(const pose of ['movement','aiming','firing','reload']){
     const data=await page.evaluate(([k,s])=>window.__p8.start(k,'threequarter',s),[key,pose]);
     const name=key+'__threequarter__'+pose+'.jpg';await page.screenshot({path:path.join(dir,name),type:'jpeg',quality:84});
     const measured=await page.evaluate(()=>window.__p8.pose());poseResults.push({key,state:pose,finite:measured.finite,position:measured.position,rotation:measured.rotation,armGaps:measured.armGaps});shots.push({key,angle:'threequarter',state:pose,file:name,pose:data});
     await page.evaluate(()=>window.__p8.end());
    }
   }
   results.builds[label]={sourceSha256:sha(source),keys,shots,poseResults,errors};
   console.log(label+': '+keys.length+' weapons, '+shots.length+' rendered captures, page errors '+errors.length);
   await context.close();
  }
  const a=results.builds.after;results.weaponCount=a.keys.length;results.allCapturesFinite=a.shots.every(s=>s.pose&&s.pose.root.every(Number.isFinite)&&s.pose.armGaps&&s.pose.armGaps.right<.025&&s.pose.armGaps.left<.025)&&a.poseResults.every(p=>p.finite);results.pageErrors=results.builds.before.errors.concat(results.builds.after.errors);results.pass=results.weaponCount===28&&a.shots.length===28*9&&results.allCapturesFinite&&!results.pageErrors.length;
 }catch(e){results.error=e.stack;results.pass=false;console.error(e.stack);}finally{await browser.close();fs.writeFileSync(path.join(out,'review-results.json'),JSON.stringify(results,null,2));fs.rmSync(baselineRoot,{recursive:true,force:true});}
 console.log('RESULT '+(results.pass?'PASS':'FAIL'));process.exitCode=results.pass?0:1;
})();
