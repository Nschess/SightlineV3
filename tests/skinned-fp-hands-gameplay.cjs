/* Actual Sightline game renderer QA for the rigged first-person hand candidate.
   Runs headless isolated Chromium/SwiftShader with request routing only. */
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const assets=path.join(root,'AndroidProject','app','src','main','assets','phone-host');
const out=path.join(root,'evidence','hand-workflow-20261025','skinned-fp-gameplay');
fs.mkdirSync(out,{recursive:true});
const inject=String.raw`
window.__fpHandsQA={
  classFor:fpGripClass,
  weapons:function(){return Object.keys(WEAPONS);},
  equip:function(id){owned[id]=true;ammo[id]=ammo[id]||{mag:WEAPONS[id].mag,res:WEAPONS[id].reserve};setWeapon(id);return id;},
  status:function(id){var g=gunFor(id),a=g.userData.fpRigAsset,meshes=0,weighted=0,triangles=0,bones=[];if(a)a.scene.traverse(function(o){if(o.isSkinnedMesh){meshes++;if(o.geometry.attributes.skinIndex&&o.geometry.attributes.skinWeight)weighted++;triangles+=o.geometry.index?o.geometry.index.count/3:o.geometry.attributes.position.count/3;}if(o.isBone&&/^finger[1-5]-[1-3]\\.[RL]$/.test(o.name))bones.push(o.name);});var support=g.userData.fpSupportPivot;return{weapon:id,weaponClass:fpGripClass(id),rigClass:g.userData.fpGripRigClass||null,ready:!!(a&&a.owner===g&&g.userData.fpGripRigClass===fpGripClass(id)),skins:meshes,weightedMeshes:weighted,triangles:Math.round(triangles),fingerBones:[...new Set(bones)].sort(),support:!!support,supportParent:support&&support.parent&&support.parent.name,legacyHidden:(function(){var n=0;g.traverse(function(o){if(o.isMesh&&o.userData.fpLegacyArmVisibility!==undefined&&!o.visible)n++;});return n;})(),visible:g.visible,ads:!!scoped,reloading:reloading,ammo:ammo[id]&&{mag:ammo[id].mag,res:ammo[id].res},drawCalls:renderer.info.render.calls,threeRevision:THREE.REVISION};},
  fire:function(){return tryFire(false);},
  ads:function(down){inputEvent('Mouse2',!!down);return {active:scoped,progress:adsT};},
  reload:function(id){ammo[id].mag=1;startReload();return reloading;},
  move:function(){var before=[P.x,P.z];inputEvent('KeyW',true);for(var i=0;i<24;i++)updatePlayer(1/60);inputEvent('KeyW',false);return Math.hypot(P.x-before[0],P.z-before[1]);}
};`;
function contentType(file){const ext=path.extname(file).toLowerCase();return ext==='.js'?'application/javascript':ext==='.json'?'application/json':ext==='.png'?'image/png':'application/octet-stream';}

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.SIGHTLINE_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-background-timer-throttling','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']});
 const result={method:'Actual Sightline V3 page, game weapon builders, in-game Three.js scene, isolated headless Chromium with software WebGL.',weapons:[],screenshots:[],errors:[],failedRequests:[],limitations:['SwiftShader is not an Android GPU. Physical Android-device acceptance is not performed by this test.']};
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});page.on('requestfailed',r=>result.failedRequests.push({url:r.url(),reason:r.failure()?.errorText}));
  await page.route('http://127.0.0.1:39179/**',async route=>{
   if(route.request().isNavigationRequest()){
    let html=fs.readFileSync(path.join(assets,'index.html'),'utf8');
    const marker='if (/[?&]debug\\b/.test(location.search)) window.__sl';
    if(!html.includes(marker))throw new Error('Debug injection marker missing');
    return route.fulfill({status:200,contentType:'text/html',body:html.replace(marker,inject+'\n'+marker)});
   }
   const rel=decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
   const file=path.resolve(assets,rel);
   if(!rel||rel.includes('..')||!file.startsWith(path.resolve(assets)+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing candidate asset: '+rel});
   return route.fulfill({status:200,contentType:contentType(file),body:fs.readFileSync(file)});
  });
  await page.goto('http://127.0.0.1:39179/?debug',{waitUntil:'load',timeout:60000});
  await page.locator('#btn-start').click({timeout:20000});await page.locator('#btn-go').click({force:true,timeout:20000});
  const ids=await page.evaluate(()=>window.__fpHandsQA.weapons());
  for(const id of ids){
   await page.evaluate(id=>window.__fpHandsQA.equip(id),id);
   await page.waitForFunction(id=>window.__fpHandsQA.status(id).ready,id,{timeout:45000});
   const hip=await page.evaluate(id=>window.__fpHandsQA.status(id),id);result.weapons.push(hip);
   if(!result.screenshots.some(x=>x.class===hip.weaponClass)){
    const hipFile=path.join(out,hip.weaponClass+'-hip.png');await page.screenshot({path:hipFile,fullPage:false});result.screenshots.push({class:hip.weaponClass,state:'hip',file:hipFile});
    await page.evaluate(()=>window.__fpHandsQA.ads(true));await page.waitForFunction(()=>window.__sl.adsState().progress>.985,undefined,{timeout:10000});
    const adsFile=path.join(out,hip.weaponClass+'-ads.png');await page.screenshot({path:adsFile,fullPage:false});result.screenshots.push({class:hip.weaponClass,state:'ads',file:adsFile});
    await page.evaluate(()=>window.__fpHandsQA.ads(false));await page.waitForTimeout(320);
    await page.evaluate(id=>window.__fpHandsQA.reload(id),id);await page.waitForTimeout(180);
    const reloadFile=path.join(out,hip.weaponClass+'-reload.png');await page.screenshot({path:reloadFile,fullPage:false});result.screenshots.push({class:hip.weaponClass,state:'reload',file:reloadFile});
    await page.evaluate(()=>window.__fpHandsQA.move());await page.waitForTimeout(180);
    const moveFile=path.join(out,hip.weaponClass+'-movement.png');await page.screenshot({path:moveFile,fullPage:false});result.screenshots.push({class:hip.weaponClass,state:'movement',file:moveFile});
   }
   await page.evaluate(()=>{if(reloading>0)reloading=0;scoped=false;});
  }
  result.pageStatus=await page.evaluate(()=>({state:window.__sl.state,weaponCount:window.__fpHandsQA.weapons().length,threeRevision:THREE.REVISION,renderer:renderer.info.render,geometryMemory:renderer.info.memory.geometries}));
  await page.close();
 }finally{await browser.close();}
 result.pass=result.weapons.length===28&&result.weapons.every(w=>w.ready&&w.skins>0&&w.weightedMeshes===w.skins&&w.fingerBones.length>=(w.weaponClass==='melee'?15:30))&&result.screenshots.length===28&&!result.errors.length&&!result.failedRequests.length;
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));process.exitCode=result.pass?0:1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
