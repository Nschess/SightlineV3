'use strict';
// Offline Bomb visual capture using the real game loop and keyboard movement.
// Debug access is limited to reading state and steering camera yaw; no actor,
// objective, AI, position, health, or timer state is injected.
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE||'C:/Users/LOCAL_USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const executablePath=process.env.SIGHTLINE_CHROMIUM_EXECUTABLE||'C:/Users/LOCAL_USER/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
const root=path.resolve(__dirname,'..'),www=path.join(root,'AndroidProject/app/src/main/assets/www');
const out=path.join(root,'acceptance',`expansion-8.3-walkup-${new Date().toISOString().replace(/[:.]/g,'-')}`);fs.mkdirSync(out,{recursive:false});
async function modeRules(page){
  await page.locator('#mn-subnav [data-shell-route="offline"]').click();
  await page.locator('#mode-select [data-quick-mode="bomb"]').click();
  await page.locator('#mn-subnav [data-shell-route="rules"]').click();
  for(const [key,value] of [['diff','recruit'],['bots','2'],['mates','1'],['bombBestOf','3'],['bombTime','90'],['bombSeconds','30'],['plantSeconds','5'],['defuseSeconds','6']]){
    const s=`#pn-dyn button[data-o="R"][data-k="${key}"][data-v="${value}"]`;
    await page.locator(s).click();
  }
  await page.locator('#mn-subnav [data-shell-route="offline"]').click();
  await page.locator('#btn-start').click();await page.waitForFunction(()=>!document.querySelector('#ov-buy').hidden,{timeout:10000});
  await page.locator('#btn-go').click();await page.waitForFunction(()=>window.__sl?.state==='live',{timeout:10000});
}
async function read(page){return page.evaluate(()=>{const a=window.__sl,b=a.soloBombState(),v=a.qa.bombVisualStatus();return{state:a.state,pos:{x:a.P.x,y:a.P.y,z:a.P.z},bomb:b&&{phase:b.phase,siteId:b.siteId,carrierId:b.carrierId,use:b.use&&{action:b.use.action,actorName:b.use.actorName,siteId:b.use.siteId,completeAt:b.use.completeAt},sites:b.sites},visual:v,objective:document.querySelector('#objective-status')?.textContent||''};});}
async function faceDevice(page){return page.evaluate(()=>{const a=window.__sl,P=a.P,v=a.qa.bombVisualStatus(),p=v&&v.device&&v.device.world;if(!p)return null;const dx=p[0]-P.x,dz=p[2]-P.z,dist=Math.max(.2,Math.hypot(dx,dz)),yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(p[1]-1.62,dist);a.setView(yaw,pitch);a.scene.updateMatrixWorld(true);return{yaw,pitch,projection:a.qa.bombVisualStatus().device};});}
async function moveToSite(page,siteId){
  const route=await page.evaluate(siteId=>{const a=window.__sl,P=a.P,s=a.soloBombState().sites[siteId],points=window.SightlineNav.path(a.qa.nav,P.x,P.y||0,P.z,s.x,s.y||0,s.z);return points&&points.map(p=>({x:p[0],z:p[1],y:p[2]||0}));},siteId);
  if(!route||route.length<2)throw new Error(`No legal navigation path to Bomb site ${siteId}`);
  const origin=await page.evaluate(()=>({x:window.__sl.P.x,z:window.__sl.P.z}));
  await page.keyboard.down('KeyW');let steps=0,stalled=0,last=origin;
  try{
    for(const wp of route.slice(1)){
      for(let i=0;i<50;i++){
        const state=await page.evaluate(w=>{const a=window.__sl,P=a.P,dx=w.x-P.x,dz=w.z-P.z,d=Math.hypot(dx,dz),yaw=Math.atan2(-dx,-dz);a.setView(yaw,0);return{d,x:P.x,z:P.z,state:a.state};},wp);
        if(state.state!=='live')return{status:'ROUND_ENDED_BEFORE_ARRIVAL',routePoints:route.length,steps,origin,last:state};
        if(state.d<1.35)break;
        await page.waitForTimeout(250);steps++;
        const now=await page.evaluate(()=>({x:window.__sl.P.x,z:window.__sl.P.z}));
        if(Math.hypot(now.x-last.x,now.z-last.z)<0.035)stalled++;else stalled=0;
        last=now;
        if(stalled>32)throw new Error(`Normal W-key movement stalled near route waypoint ${steps}; player=${JSON.stringify(now)}`);
      }
    }
  }finally{await page.keyboard.up('KeyW');}
  const framing=await faceDevice(page);
  return{status:'ARRIVED',routePoints:route.length,steps,origin,final:await page.evaluate(()=>({x:window.__sl.P.x,z:window.__sl.P.z})),framing};
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-first-run','--disable-background-networking','--disable-extensions','--disable-sync','--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>{if(!e.message.includes('Fetch API cannot load file:///C:/__build. URL scheme "file" is not supported.'))errors.push(e.message);});
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Fetch API cannot load file:///C:/__build. URL scheme "file" is not supported.'))errors.push(m.text());});
  try{
    const url=pathToFileURL(path.join(www,'index.html')).href;
    await page.goto(url+'?debug',{waitUntil:'domcontentloaded',timeout:30000});await page.waitForFunction(()=>window.__sl?.state!==undefined,{timeout:20000});
    await modeRules(page);await page.screenshot({path:path.join(out,'bomb-walkup-start.png')});
    const initial=await read(page);const siteId=initial.bomb.sites.A.x!==undefined?'A':'B';
    const travel=await moveToSite(page,siteId);const atSite=await read(page);await page.screenshot({path:path.join(out,'bomb-player-walked-to-site.png')});
    const phases=[],objectiveCaptures={};
    for(let i=0;i<200;i++){
      await page.waitForTimeout(1000);const s=await read(page),use=s.bomb?.use;
      if(use&&!objectiveCaptures[use.action]){
        const framing=await faceDevice(page);await page.waitForTimeout(180);const started=await read(page);started.framing=framing;
        objectiveCaptures[use.action]={started};
        if(started.bomb?.use?.action===use.action&&started.visual?.progressVisible)await page.screenshot({path:path.join(out,`bomb-${use.action}-near-site.png`)});
        // Save a second, quieter frame only if the real interaction remains active.
        await page.waitForTimeout(1450);const afterToast=await read(page);objectiveCaptures[use.action].afterToast=afterToast;
        if(afterToast.bomb?.use?.action===use.action&&afterToast.visual?.progressVisible){await faceDevice(page);await page.screenshot({path:path.join(out,`bomb-${use.action}-progress-near-site.png`)});}
      }
      const p={second:i+1,phase:s.bomb?.phase||null,action:use?.action||null,actor:use?.actorName||null,site:s.bomb?.siteId||null,objective:s.objective,device:s.visual?.device,progressVisible:s.visual?.progressVisible};
      if(!phases.length||JSON.stringify(phases[phases.length-1])!==JSON.stringify(p))phases.push(p);
      if(s.bomb?.phase==='planted')await page.screenshot({path:path.join(out,'bomb-planted-near-site.png')});
      if(s.state==='roundend'||s.state==='matchend'){await page.screenshot({path:path.join(out,'bomb-terminal-near-site.png')});break;}
    }
    const plantFrame=objectiveCaptures.plant?.started,plantVisible=!!(plantFrame?.bomb?.use?.action==='plant'&&plantFrame?.visual?.progressVisible),defuseFrame=objectiveCaptures.defuse?.started,defuseVisual=!!(defuseFrame?.bomb?.use?.action==='defuse'&&defuseFrame?.visual?.progressVisible);
    const report={status:travel.status==='ARRIVED'&&plantVisible&&errors.length===0?'PASS':'FAIL',renderer:'Actual Offline game WebGL page in isolated Chromium/SwiftShader, loaded from local files',controlMethod:'Playwright KeyW held along legal nav waypoints; camera direction followed by debug view-only steering. Player position was advanced only by production movement simulation; no objective/actor/timer state was injected.',sourcePageSha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(www,'index.html'))).digest('hex'),initial,travel,atSite,objectiveCaptures,visualChecks:{plantProgressCaptured:plantVisible,defuseProgressCaptured: defuseVisual,defuseCloseup:'PASS'===('PASS')&&defuseVisual?'PASS':defuseFrame?'CANCELLED_OR_HIDDEN_BEFORE_CAPTURE':'NOT_OBSERVED'},phases,errors,limitations:['This is bot-driven Offline acceptance, not a human usability test.','Software WebGL only; not Android GPU evidence.','The file:// build identity request to /__build is not available; no other failed resource is accepted.']};
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,output:out,travel,atSite:{position:atSite.pos,phase:atSite.bomb?.phase,objective:atSite.objective},objectiveCaptures:Object.fromEntries(Object.entries(objectiveCaptures).map(([k,v])=>[k,{phase:v.bomb?.phase,actor:v.bomb?.use?.actorName,device:v.visual?.device,progressVisible:v.visual?.progressVisible}])),errors},null,2));
    if(report.status!=='PASS')process.exitCode=1;
  }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
