/* Run the real offline game in Codex's bundled headless Chromium shell via CDP.
   No desktop browser, UI automation, HTTP server, or Playwright package used. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),html=path.join(root,'AndroidProject','app','src','main','assets','phone-host','index.html');
const shell=process.env.SIGHTLINE_HEADLESS_SHELL||'C:\\Users\\LOCAL_USER\\Documents\\Codex\\_sightline-playwright-browsers\\chromium_headless_shell-1234\\chrome-headless-shell-win64\\chrome-headless-shell.exe';
const evidenceRoot=path.join(root,'evidence','hand-workflow-20261025','skinned-fp-gameplay');
const out=path.join(evidenceRoot,process.env.SIGHTLINE_LEGACY_FP==='1'?'legacy':'skinned');fs.mkdirSync(out,{recursive:true});
class CDP {
 constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.events=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&this.pending.has(m.id)){const p=this.pending.get(m.id);this.pending.delete(m.id);m.error?p.reject(new Error(p.method+': '+JSON.stringify(m.error))):p.resolve(m.result||{});}else if(m.method){for(const f of this.events.get(m.method)||[])f(m.params||{});}});}
 send(method,params={},timeoutMs=12000){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject,method});this.ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(this.pending.has(id)){this.pending.delete(id);reject(new Error('CDP timeout '+method+' after '+timeoutMs+'ms'));}},timeoutMs);});}
 on(method,fn){const a=this.events.get(method)||[];a.push(fn);this.events.set(method,a);}
 async evaluate(expression){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
 async waitFor(expression,timeout=15000){const until=Date.now()+timeout;while(Date.now()<until){const v=await this.evaluate(expression);if(v)return v;await new Promise(r=>setTimeout(r,100));}throw new Error('Wait condition timed out: '+expression);}
 async screenshot(file){const r=await this.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false},60000);fs.writeFileSync(file,Buffer.from(r.data,'base64'));}
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 if(!fs.existsSync(shell))throw new Error('Codex bundled headless Chromium missing: '+shell);
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sightline-fp-cdp-'));
 const proc=spawn(shell,['--headless','--no-sandbox','--disable-background-timer-throttling','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-angle=swiftshader','--allow-file-access-from-files','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
 let chromiumStderr='';proc.stderr.on('data',b=>{chromiumStderr=(chromiumStderr+String(b)).slice(-3000);});
 const result={method:'Actual offline Sightline index.html in the Codex bundled headless Chromium shell with SwiftShader WebGL, controlled through local CDP.',mode:process.env.SIGHTLINE_LEGACY_FP==='1'?'legacy arms baseline':'skinned first-person arms',weapons:[],screenshots:[],errors:[],failedLoads:[],limitations:['Software WebGL is not Android GPU verification. No physical Android device was accessed.']};
 try{
  const active=path.join(profile,'DevToolsActivePort');let port=null,wsPath=null;
  for(let i=0;i<100;i++){if(proc.exitCode!==null)throw new Error('Headless Chromium exited early: '+proc.exitCode+'; stderr='+chromiumStderr);if(fs.existsSync(active)){const lines=fs.readFileSync(active,'utf8').trim().split(/\r?\n/);port=+lines[0];wsPath=lines[1];break;}await delay(100);}
  if(!port)throw new Error('Headless Chromium DevToolsActivePort did not appear');
  let targets=null,lastTargetError=null;
  for(let i=0;i<80&&!targets;i++){try{const response=await fetch('http://127.0.0.1:'+port+'/json/list');if(response.ok)targets=await response.json();}catch(e){lastTargetError=e;}if(!targets)await delay(100);}
  if(!targets)throw new Error('Headless Chromium CDP target endpoint unavailable on isolated loopback: '+String(lastTargetError)+'; stderr='+chromiumStderr);
  const target=targets.find(x=>x.type==='page');if(!target)throw new Error('No headless page target');
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(new Error('CDP WebSocket failed'));});
  const cdp=new CDP(ws);cdp.on('Runtime.exceptionThrown',e=>result.errors.push(e.exceptionDetails?.text||'exception'));cdp.on('Runtime.consoleAPICalled',e=>{if(e.type==='error')result.errors.push((e.args||[]).map(x=>x.value||x.description||'').join(' '));});cdp.on('Network.loadingFailed',e=>result.failedLoads.push(e.errorText||e.requestId));
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  const legacy=process.env.SIGHTLINE_LEGACY_FP==='1';
  await cdp.send('Page.navigate',{url:'file:///'+html.replace(/\\/g,'/')+(legacy?'?debug&legacyFP=1':'?debug')});
  await cdp.waitFor("document.readyState==='complete'&&!!window.__sl",30000);
  console.log('[webgl] game loaded');
  const title=await cdp.evaluate('document.title');
  await cdp.evaluate("document.querySelector('#btn-start').click()");await delay(250);
  await cdp.evaluate("document.querySelector('#btn-go').click()");await cdp.waitFor("window.__sl.state==='live'&&window.__sl.P.alive",20000);
  await cdp.evaluate("document.querySelector('#msg').style.display='none'");
  const blueRows=await cdp.evaluate('window.__sl.characterQA.blueGearAudit()');
  const blueIssues=blueRows.filter(x=>x.head!=='helmet'||!['ach','pasgt'].includes(x.helmet)||x.sleeves!=='long'||x.gloves!=='full'||!['carrier','heavy'].includes(x.vest)||!x.pack||x.pack==='none'||!x.extras.includes('kneepads')||!x.extras.includes('elbowpads')||!x.extras.includes('headset'));
  result.blueGearAudit={humanRoster:await cdp.evaluate('window.__sl.characterQA.operators().length'),blueCount:blueRows.length,completeFieldKit:blueRows.length===17&&blueIssues.length===0,issues:blueIssues,loadouts:blueRows};
  console.log('[webgl] Blue gear audit:',blueRows.length,'operators; clean=',result.blueGearAudit.completeFieldKit);
  result.thirdPersonGripAudit=await cdp.evaluate(`(function(){
   var qa=window.__sl.characterQA,specs=qa.weaponSpecs(),keys=Object.keys(specs).filter(function(k){return !specs[k].melee;}),ops=qa.operators().filter(function(op){return !op.zombie;}),rows=[],maxR=0,maxL=0;
   function targetError(arm,dir,gun,offset){var hand=arm.localToWorld(dir.clone());var expected=gun.localToWorld(new THREE.Vector3(offset[0],offset[1],offset[2]));return hand.distanceTo(expected);}
   for(var oi=0;oi<ops.length;oi++){var op=ops[oi],u=null;try{u=qa.makeUnit(120+oi*2,220,op);var errors=[];
    for(var wi=0;wi<keys.length;wi++){var key=keys[wi];qa.ensureWorldWeapon(u,key);qa.poseWorldArms(u);u.g.updateMatrixWorld(true);
     var meta=key==='rook117'?null:qa.weaponMeta()[key],profile=qa.weaponProfiles()[key],right=meta&&meta.rightGrip||profile&&profile.rightGrip||[0,0,0],left=meta&&meta.leftGrip||profile&&profile.leftGrip||[0,0,-.29];
     if(!u.armR||!u.armL||!u.worldGun||!u.armRDefaultDir||!u.armLDefaultDir)throw new Error('Missing arm, weapon, or grip target for '+key);
     var re=targetError(u.armR,u.armRDefaultDir,u.worldGun,right),le=targetError(u.armL,u.armLDefaultDir,u.worldGun,left);maxR=Math.max(maxR,re);maxL=Math.max(maxL,le);errors.push({weapon:key,rightMeters:re,supportMeters:le});
    }
    rows.push({id:op.id,role:op.role,weaponPairs:errors.length,maxRightMeters:Math.max.apply(null,errors.map(function(e){return e.rightMeters;})),maxSupportMeters:Math.max.apply(null,errors.map(function(e){return e.supportMeters;})),failures:errors.filter(function(e){return e.rightMeters>.015||e.supportMeters>.015;})});
   }catch(e){rows.push({id:op.id,role:op.role,error:String(e&&e.message||e)});}finally{if(u&&u.g&&u.g.parent)u.g.parent.remove(u.g);}}
   return {humanVariants:ops.length,firearms:keys.length,pairs:rows.reduce(function(n,r){return n+(r.weaponPairs||0);},0),maxRightMeters:maxR,maxSupportMeters:maxL,failures:rows.filter(function(r){return r.error||r.weaponPairs!==keys.length||r.failures&&r.failures.length;}),rows:rows};
  })()`);
  console.log('[webgl] third-person grip audit:',result.thirdPersonGripAudit.pairs,'pairs; failures=',result.thirdPersonGripAudit.failures.length);
  const allIds=await cdp.evaluate('window.__sl.weaponIds()');
  const filter=(process.env.SIGHTLINE_WEAPON_FILTER||'').split(',').map(s=>s.trim()).filter(Boolean);
  const ids=filter.length?allIds.filter(id=>filter.includes(id)):allIds;
  const types={firearms:0,melee:0};for(const id of allIds){const inf=await cdp.evaluate(`window.__sl.weaponInfo('${id}')`);types[inf.melee?'melee':'firearms']++;}
  result.weaponInventory={all:allIds.length,firearms:types.firearms,melee:types.melee,tested:ids.length,filter:filter.length?filter:null};
  console.log('[webgl] weapon inventory:',JSON.stringify(result.weaponInventory));
  for(const id of ids){
   console.log('[webgl] weapon:',id);
   await cdp.evaluate(`window.__sl.prepareWeaponQA('${id}')`);
   const statusExpr=`window.__sl.fpWeaponStatus('${id}')`;
   const cls=await cdp.evaluate(`${statusExpr}.className`);
   try{await cdp.waitFor(statusExpr+'.ready',15000);}catch(e){throw new Error(e.message+'; status='+JSON.stringify(await cdp.evaluate(statusExpr))+'; console='+JSON.stringify(result.errors.slice(-3))+'; failedLoads='+JSON.stringify(result.failedLoads));}
   const snap=await cdp.evaluate(statusExpr);result.weapons.push(snap);
   if(!result.screenshots.some(x=>x.className===cls)){
    await delay(400);const hip=path.join(out,cls+'-hip.png');await cdp.screenshot(hip);result.screenshots.push({className:cls,state:'hip',file:hip});
    if(cls!=='melee'){await cdp.evaluate("window.__sl.press('Mouse2',true)");await cdp.waitFor('window.__sl.adsState().progress>.985',15000);const ads=path.join(out,cls+'-ads.png');await cdp.screenshot(ads);result.screenshots.push({className:cls,state:'ads',file:ads});await cdp.evaluate("window.__sl.press('Mouse2',false)");await delay(240);}else result.skippedStates=[...(result.skippedStates||[]),{className:cls,state:'ads',reason:'Melee weapon class has no ADS action.'}];
    await cdp.evaluate(`(function(){window.__sl.tryFire(true);})()`);await delay(120);const firing=path.join(out,cls+'-firing.png');await cdp.screenshot(firing);result.screenshots.push({className:cls,state:'firing',file:firing});
    await cdp.evaluate(`(function(){window.__sl.setAmmoForQA('${id}',1,999);window.__sl.startReload();})()`);const ri=await cdp.evaluate(`window.__sl.weaponInfo('${id}')`);await delay(Math.max(150,Math.round((ri.reload||1)*430)));const reload=path.join(out,cls+'-reload.png');await cdp.screenshot(reload);result.screenshots.push({className:cls,state:'reload',file:reload});
    await cdp.evaluate("window.__sl.press('KeyW',true)");await delay(240);await cdp.evaluate("window.__sl.press('KeyW',false)");const movement=path.join(out,cls+'-movement.png');await cdp.screenshot(movement);result.screenshots.push({className:cls,state:'movement',file:movement});
   }
   await cdp.evaluate('window.__sl.resetReloadForQA()');
  }
  if(process.env.SIGHTLINE_GRIP_POSE_PROBE==='1'){
   const probeId=ids.find(id=>id==='rook117')||ids.find(id=>id==='carbine')||ids[0];
   if(probeId){
    await cdp.evaluate(`window.__sl.prepareWeaponQA('${probeId}')`);
    const probeClass=await cdp.evaluate(`window.__sl.fpWeaponStatus('${probeId}').className`);
    await cdp.waitFor(`window.__sl.fpWeaponStatus('${probeId}').ready`,15000);await delay(350);
    result.gripPoseProbe=[];
    for(const angle of [-1.0,-.65,.65,1.0]){
     const pose=await cdp.evaluate(`window.SightlineFPRigAssets.debugSetFingerCurl('${probeClass}',${angle})`);
     await delay(160);const file=path.join(out,`probe-${probeClass}-support-curl-${String(angle).replace('-','m').replace('.','p')}.png`);await cdp.screenshot(file);result.gripPoseProbe.push({...pose,file});
    }
   }
  }
  const roleWeapons={Captain:'carbine',Heavy:'bulwark',Scout:'ranger',Rusher:'smg',Marksman:'longbow',Support:'mistral',Breacher:'breacher',Anchor:'falcon'};
  await cdp.evaluate("window.__sl.bots().length=0;window.__sl.mates().length=0;window.__sl.characterQA.hideLocalViewModel();window.__sl.P.alive=true;window.__sl.P.hp=100;window.__sl.P.x=0;window.__sl.P.z=36;window.__sl.P.yaw=0;window.__sl.P.pitch=0;var r=document.querySelector('#reticle');if(r){r.hidden=true;r.style.setProperty('display','none','important')}var m=document.querySelector('#msg');if(m)m.style.display='none'");
  result.blueTeamScreenshots=[];
  const explicitBlue=blueRows.map(x=>({id:x.id,role:x.role}));
  for(const {id:character,role} of explicitBlue){
   const weapon=roleWeapons[role]||'carbine';console.log('[webgl] third-person:',character,weapon);
   const pose=await cdp.evaluate(`(function(){var qa=window.__sl.characterQA,op=qa.operators().find(x=>x.id==='${character}');if(!op)throw new Error('Missing Blue operator ${character}');if(window.__qaStagedUnit){window.__sl.scene.remove(window.__qaStagedUnit.g);window.__qaStagedUnit=null;}var p=window.__sl.P;p.alive=true;p.hp=100;p.x=0;p.z=36;p.yaw=0;p.pitch=0;var u=qa.makeUnit(0,34.1,op);u.g.rotation.y=Math.PI;u.yaw=Math.PI;qa.ensureWorldWeapon(u,'${weapon}');qa.poseWorldArms(u);u.g.updateMatrixWorld(true);window.__qaStagedUnit=u;return{character:op.id,role:'${role}',weapon:u.worldKey||'${weapon}',rightArm:!!u.armR,leftArm:!!u.armL,worldGun:!!u.worldGun};})()`);
   await delay(300);const file=path.join(out,`blue-${character}-${weapon}-thirdperson.png`);await cdp.screenshot(file);result.blueTeamScreenshots.push({...pose,file});
  }
  result.page={title,allWeaponCount:allIds.length,testedWeaponCount:ids.length,renderer:await cdp.evaluate('window.__sl.renderer?({calls:window.__sl.renderer.info.render.calls,triangles:window.__sl.renderer.info.render.triangles,geometries:window.__sl.renderer.info.memory.geometries,textures:window.__sl.renderer.info.memory.textures}):null'),frameStats:await cdp.evaluate('window.__sl.frameStats?window.__sl.frameStats():null')};
  ws.close();
 }finally{proc.kill();await delay(200);try{fs.rmSync(profile,{recursive:true,force:true});}catch{}}
 const testedClasses=new Set(result.weapons.map(w=>w.className));
 const expectedShots=[...testedClasses].reduce((n,c)=>n+(c==='melee'?4:5),0);
 result.expectedScreenshotCount=expectedShots;
  result.pass=result.weapons.length===result.weaponInventory.tested&&(!result.weaponInventory.filter?(result.weaponInventory.all===32&&result.weaponInventory.firearms===28&&result.weaponInventory.melee===4):true)&&result.weapons.every(w=>w.ready&&w.skins>0&&w.weightedMeshes===w.skins&&w.fingerBoneCount>=(w.className==='melee'?15:30))&&result.screenshots.length===expectedShots&&result.blueGearAudit.completeFieldKit&&result.thirdPersonGripAudit.humanVariants===34&&result.thirdPersonGripAudit.firearms===28&&result.thirdPersonGripAudit.pairs===952&&result.thirdPersonGripAudit.failures.length===0&&result.thirdPersonGripAudit.maxRightMeters<=.015&&result.thirdPersonGripAudit.maxSupportMeters<=.015&&result.blueTeamScreenshots.length===17&&result.blueTeamScreenshots.every(x=>x.rightArm&&x.leftArm&&x.worldGun)&&!result.errors.length&&!result.failedLoads.length;
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));process.exitCode=result.pass?0:1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
