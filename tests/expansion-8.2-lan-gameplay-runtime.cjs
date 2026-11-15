'use strict';

// Source-pinned local host smoke: two isolated Chromium clients join the real
// phone-host server and start FFA and Bomb matches. This is loopback QA only.
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const {chromium}=require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE||'C:/Users/LOCAL_USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const chromiumPath=process.env.SIGHTLINE_CHROMIUM_EXECUTABLE||'C:/Users/LOCAL_USER/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
const root=path.resolve(__dirname,'..');
const phone=path.join(root,'AndroidProject/app/src/main/assets/phone-host');
const output=path.join(root,'acceptance',`expansion-8.2-lan-gameplay-${new Date().toISOString().replace(/[:.]/g,'-')}`);
fs.mkdirSync(output,{recursive:false});
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?reject(e):resolve(p));});});}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function capturePage(page,file,results){
  const name=path.basename(file);
  try{await page.screenshot({path:file,timeout:6000,animations:'disabled',caret:'hide'});results.push({file:name,status:'CAPTURED'});}
  catch(e){results.push({file:name,status:'UNAVAILABLE',reason:String(e.message||e).slice(0,240)});}
}
async function startHost(port){
  const child=spawn(process.execPath,[path.join(phone,'server.js'),'--transport','dev','--bind','127.0.0.1','--port',String(port),'--max','10','--total','64','--bots','0','--tick-ms','20'],{cwd:phone,stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',x=>logs+=x.toString());child.stderr.on('data',x=>logs+=x.toString());
  const end=Date.now()+15000;let lastFetchError='no response yet';
  while(Date.now()<end){if(child.exitCode!==null)throw new Error(`host exited ${child.exitCode}: ${logs}`);try{const r=await fetch(`http://127.0.0.1:${port}/status`,{signal:AbortSignal.timeout(800)});if(r.ok)return{child,logs:()=>logs,status:()=>r.json()};lastFetchError=`HTTP ${r.status}`;}catch(e){lastFetchError=`${e.name}: ${e.message}`;}await delay(100);}
  child.kill();throw new Error(`host readiness timeout (${lastFetchError}): ${logs}`);
}
async function status(port){const r=await fetch(`http://127.0.0.1:${port}/status`);if(!r.ok)throw new Error(`status HTTP ${r.status}`);return r.json();}
async function openPeer(browser,port,name){
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1}),page=await context.newPage(),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)failed.push({status:r.status(),url:r.url()});});
  await page.goto(`http://127.0.0.1:${port}/?debug`,{waitUntil:'domcontentloaded',timeout:20000});
  await page.locator('#mn-subnav [data-shell-route="multiplayer"]').click();
  await page.locator('#mp-name').fill(name);await page.locator('#mp-addr').fill(`127.0.0.1:${port}`);
  await page.locator('#pn-dyn [data-net="connect"]').click();
  await page.waitForFunction(()=>window.__sl?.MP?.id>0&&window.__sl.MP.session.length>=16,null,{timeout:12000});
  return{context,page,errors,failed};
}
async function until(fn,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return true;await delay(100);}return false;}
async function runCase(browser,mode){
  const port=await freePort(),host=await startHost(port);let peers=[];const screenshots=[];
  try{
    peers.push(await openPeer(browser,port,'Codex host'));
    peers.push(await openPeer(browser,port,'Codex guest'));
    const joined=await until(async()=>{const s=await status(port);return s.players===2&&s.clients.length===2;});
    if(!joined)throw new Error(`${mode}: two independent Protocol V2 clients did not join`);
    const [h,g]=peers;
    // The Expansion 8.2 host lobby separates roster, maps, and match rules.
    // Mode controls live on the Match rules route, not the Multiplayer route.
    await h.page.locator('#mn-subnav [data-shell-route="rules"]').click();
    await h.page.waitForFunction(()=>!!document.querySelector('#pn-dyn [data-net="mode"]'),null,{timeout:8000});
    await h.page.locator(`#pn-dyn [data-net="mode"][data-v="${mode}"]`).click();
    const selected=await until(async()=>{const s=await status(port);return s.mode===mode;});
    if(!selected)throw new Error(`${mode}: host-selected mode was not applied`);
    if(mode==='ffa'){
      // A compact, supported arena shortens the initial cross-map chase while
      // still exercising the real host-selected map and spawn pipeline.
      await h.page.locator('#mn-subnav [data-shell-route="maps"]').click();
      await h.page.locator('#pn-dyn [data-net="map"][data-v="yard"]').click();
      const mapSelected=await until(async()=>{const s=await status(port);return s.map==='yard';});
      if(!mapSelected)throw new Error('ffa: the selected Yard arena was not applied');
      await h.page.locator('#mn-subnav [data-shell-route="rules"]').click();
      await h.page.waitForFunction(()=>!!document.querySelector('#pn-dyn [data-net="kills"]'),null,{timeout:8000});
      await h.page.locator('#pn-dyn [data-net="kills"][data-v="10"]').click();
      await h.page.waitForFunction(()=>document.querySelector('#pn-dyn [data-net="kills"][data-v="10"]')?.getAttribute('aria-pressed')==='true',null,{timeout:5000});
    }
    if(mode==='bomb'){
      // Selecting Bomb rebalances both humans; only then assign both to
      // defense so the carrier is a bot and the objective test is unassisted.
      await h.page.locator('#mn-subnav [data-shell-route="multiplayer"]').click();
      const hostDefenders=h.page.locator('#pn-dyn [data-net="team"][data-v="1"]');
      if(await hostDefenders.isEnabled())await hostDefenders.click();
      const guestDefenders=g.page.locator('#pn-dyn [data-net="team"][data-v="1"]');
      if(await guestDefenders.isEnabled())await guestDefenders.click();
      const teamMoved=await until(async()=>{const s=await status(port);return s.clients.length===2&&s.clients.every(c=>c.team===1);});
      if(!teamMoved)throw new Error('Bomb: both test clients did not reach the defender side after mode selection');
      await h.page.locator('#mn-subnav [data-shell-route="rules"]').click();
      await h.page.waitForFunction(()=>!!document.querySelector('#pn-dyn [data-net="mode"]'),null,{timeout:8000});
      const botSetup=h.page.locator('#pn-dyn .sl82-bot-settings');
      if(await botSetup.count()&&!(await botSetup.evaluate(e=>e.open)))await botSetup.locator('summary').click();
      await h.page.locator('#pn-dyn [data-net="bots"][data-k="skill"][data-v="recruit"]').click();
      const a=h.page.locator('#pn-dyn [data-bot-count="t0"]'),b=h.page.locator('#pn-dyn [data-bot-count="t1"]');
      if(await a.count()&&await b.count()){
        // Both humans are on team 1. Four Recruit attackers face four AI
        // defenders plus the two human defenders, allowing the bot carrier and an
        // AI defuser to complete the production objective loop.
        await a.fill('4');await a.dispatchEvent('change');
        const attackerTarget=await until(async()=>{const s=await status(port);return s.botConfig.team0===4;});
        if(!attackerTarget){const s=await status(port),ui=await h.page.evaluate(()=>({host:window.__sl.MP.lobby&&window.__sl.MP.lobby.players.find(p=>p.id===window.__sl.MP.id)?.host,connected:window.__sl.MP.sock&&window.__sl.MP.sock.readyState,botConfig:window.__sl.MP.lobby&&window.__sl.MP.lobby.bots,inputs:Array.from(document.querySelectorAll('[data-bot-count]')).map(e=>({key:e.getAttribute('data-bot-count'),value:e.value,disabled:e.disabled}))}));throw new Error(`Bomb: attacker bot target was not acknowledged; status=${JSON.stringify({bots:s.bots,botConfig:s.botConfig})}; ui=${JSON.stringify(ui)}; hostLogs=${host.logs()}`);}
        await b.fill('6');await b.dispatchEvent('change');
      }else throw new Error('Bomb: host bot-count controls are missing');
      const botConfig=await until(async()=>{const s=await status(port);return s.bots===8&&s.botConfig.team0===4&&s.botConfig.team1===6;});
      if(!botConfig){const s=await status(port);throw new Error(`Bomb: 4 attacker / 6 total defender bot configuration was not applied; observed=${JSON.stringify({bots:s.bots,botConfig:s.botConfig})}`);}
    }
    const start=h.page.locator('#pn-dyn [data-net="start"]');
    await start.waitFor({state:'visible',timeout:8000});
    await h.page.waitForFunction(()=>{const b=document.querySelector('#pn-dyn [data-net="start"]');return b&&!b.disabled;},null,{timeout:8000});
    await start.click();
    const live=await until(async()=>{const s=await status(port);return s.phase==='live'&&s.mode===mode;},22000);
    if(!live)throw new Error(`${mode}: host did not reach live phase`);
    const synchronized=await until(async()=>{
      const s=await status(port);return s.players===2&&s.clients.length===2&&s.clients.every(c=>c.snapshotFrames>0&&c.snapshotSkipped===0);
    },5000);
    const clientsLive=await until(async()=>{const states=await Promise.all(peers.map(p=>p.page.evaluate(()=>window.__sl.state)));return states.every(state=>state==='live');},12000);
    const hostView=await h.page.evaluate(()=>({state:window.__sl.state,mode:window.__sl.MP.mode,sessionLength:window.__sl.MP.session.length,objective:window.__sl.MP.objective&&{phase:window.__sl.MP.objective.phase,attackTeam:window.__sl.MP.objective.attackTeam,siteId:window.__sl.MP.objective.siteId}}));
    const guestView=await g.page.evaluate(()=>({state:window.__sl.state,mode:window.__sl.MP.mode,sessionLength:window.__sl.MP.session.length,objective:window.__sl.MP.objective&&{phase:window.__sl.MP.objective.phase,attackTeam:window.__sl.MP.objective.attackTeam,siteId:window.__sl.MP.objective.siteId}}));
    const scoreLabels=await Promise.all(peers.map(p=>p.page.locator('#sc-bot-label').textContent()));
    const expectedScoreLabel=mode==='ffa'?'TOP':'ENEMY';
    const hudBands=await Promise.all(peers.map(p=>p.page.evaluate(()=>{const box=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return{top:+r.top.toFixed(1),bottom:+r.bottom.toFixed(1),hidden:e.hidden};};const top=box('topbar'),alive=box('alive'),objective=box('objective-status');return{topbar:top,alive,objective,overlapTopbarAlive:alive.top<top.bottom,overlapAliveObjective:!objective.hidden&&objective.top<alive.bottom};})));
    const hudLayoutClean=hudBands.every(x=>!x.overlapTopbarAlive&&!x.overlapAliveObjective);
    await capturePage(h.page,path.join(output,`${mode}-host-live.png`),screenshots);
    await capturePage(g.page,path.join(output,`${mode}-guest-live.png`),screenshots);
    let ffaEvidence=null;
    if(mode==='ffa'){
      const result=await h.page.evaluate(async()=>{
        const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),shots=[],approach=[];
        const began=performance.now();let loops=0,stalls=0,lastRange=Infinity,side='KeyA';
        while(performance.now()-began<170000&&window.__sl.state==='live'&&window.__sl.M.you<10&&loops<520){
          loops++;
          const mp=window.__sl.MP,op=Object.values(mp.puppets||{}).find(p=>p&&p.alive&&Number(p.id)!==mp.id);
          if(!op){await pause(150);continue;}
          const P=window.__sl.P,dx=op.x-P.x,dz=op.z-P.z,range=Math.hypot(dx,dz),targetY=(op.y||0)+1.0;
          const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(targetY-(P.y+1.45),Math.max(.2,range));
          if(range>17){
            window.__sl.setView(yaw,pitch);
            if(range>=lastRange-.2)stalls++;else stalls=0;
            lastRange=range;
            const before={x:P.x,z:P.z};
            if(stalls<3){window.__sl.press('KeyW',true);await pause(260);window.__sl.press('KeyW',false);}
            else{window.__sl.press(side,true);await pause(230);window.__sl.press(side,false);side=side==='KeyA'?'KeyD':'KeyA';stalls=0;}
            approach.push({target:op.id,range:+range.toFixed(2),moved:+Math.hypot(P.x-before.x,P.z-before.z).toFixed(2)});
            await pause(100);continue;
          }
          const weapon=window.__sl.cur,a=window.__sl.ammo()[weapon];
          if(!a||a.mag<=0){window.__sl.startReload();await pause(1200);continue;}
          window.__sl.setView(yaw,pitch);
          const before=window.__sl.M.stats.shots;window.__sl.tryFire(true);
          if(window.__sl.M.stats.shots>before)shots.push({target:op.id,range:+range.toFixed(2),ammo:a.mag});
          await pause(360);
        }
        const mp=window.__sl.MP;
        window.__sl.press('KeyW',false);window.__sl.press('KeyA',false);window.__sl.press('KeyD',false);
        return{state:window.__sl.state,score:window.__sl.M.you,target:10,shotsFired:window.__sl.M.stats.shots,confirmedHits:window.__sl.M.stats.hits,kills:window.__sl.M.stats.kills,loops,elapsedMs:Math.round(performance.now()-began),remainingAmmo:window.__sl.ammo()[window.__sl.cur],sessionValid:mp.session.length>=16,shotAttempts:shots.slice(-12),approach:approach.slice(-20)};
      });
      ffaEvidence={status:result.score>=10&&result.state==='matchend'&&result.kills>=10&&result.sessionValid?'PASS':'FAIL',...result,notes:['Test uses normal host-selected map, spawn positions, movement input, aim and fire through the client input/tryFire/Protocol V2 shot path; server validates each shot, damage, scoring and match-end. No server health, position, score, or match-state injection.']};
    }
    let bombEvidence=null;
    if(mode==='bomb'){
      const phases=new Set(),timeline=[],captured=new Set(),end=Date.now()+90000;let terminal=false;
      while(Date.now()<end){
        const o=await h.page.evaluate(()=>{const q=window.__sl.MP.objective;return q&&{phase:q.phase,attackTeam:q.attackTeam,siteId:q.siteId,use:q.use&&{action:q.use.action,remainingMs:q.use.remainingMs},state:window.__sl.state};});
        if(o){phases.add(o.phase);const sig=`${o.phase}:${o.use&&o.use.action||''}`;if(!timeline.length||timeline[timeline.length-1].state!==sig)timeline.push({elapsedSec:+((90000-(end-Date.now()))/1000).toFixed(1),state:sig,siteId:o.siteId,remainingMs:o.use&&Math.round(o.use.remainingMs),gameState:o.state});
          if(o.phase==='planted'&&!captured.has('planted')){captured.add('planted');await capturePage(h.page,path.join(output,'bomb-planted.png'),screenshots);}
          if(o.use&&o.use.action==='defuse'&&!captured.has('defusing')){captured.add('defusing');await capturePage(h.page,path.join(output,'bomb-defusing.png'),screenshots);}
          if((o.phase==='defused'||o.phase==='exploded')&&o.state==='roundend'){terminal=true;await capturePage(h.page,path.join(output,'bomb-round-end.png'),screenshots);break;}
        }
        await delay(200);
      }
      const finalHostStatus=await status(port);
      bombEvidence={status:phases.has('planted')&&phases.has('defused')&&captured.has('defusing')&&terminal?'PASS':'FAIL',phases:[...phases],timeline,plantedScreenshot:captured.has('planted')?'bomb-planted.png':null,defusingScreenshot:captured.has('defusing')?'bomb-defusing.png':null,terminal,finalHostStatus:{phase:finalHostStatus.phase,bots:finalHostStatus.bots,botsAlive:finalHostStatus.botsAlive,botConfig:finalHostStatus.botConfig,bot:finalHostStatus.bot},notes:['Unassisted authoritative host bot AI and two live Protocol V2 browser clients; no bot/objective position, health, phase, or timer injection.']};
    }
    const s=await status(port),allErrors=peers.flatMap(p=>p.errors),allFailed=peers.flatMap(p=>p.failed);
    return{status:live&&synchronized&&clientsLive&&(!ffaEvidence||ffaEvidence.status==='PASS')&&hostView.state==='live'&&guestView.state==='live'&&scoreLabels.every(label=>label===expectedScoreLabel)&&hudLayoutClean&&(!bombEvidence||bombEvidence.status==='PASS')&&!allErrors.length&&!allFailed.length?'PASS':'FAIL',mode,port,players:s.players,bots:s.bots,phase:s.phase,tickMs:s.snapshot.tickMs,snapshotHz:s.snapshot.hz,clientSnapshots:s.clients.map(c=>({id:c.id,team:c.team,snapshotFrames:c.snapshotFrames,snapshotSkipped:c.snapshotSkipped,backpressure:c.snapshotBackpressure})),scoreLabels,expectedScoreLabel,hudBands,hudLayoutClean,clientsLive,hostView,guestView,ffaEvidence,bombEvidence,errors:allErrors,failedResponses:allFailed,screenshots,notes:['Actual phone-host server and two independent Protocol V2 browser clients rendered by isolated Chromium on loopback.','Screenshot capture is recorded separately; software-WebGL compositor stalls do not invalidate protocol/state assertions.','This does not test private Wi-Fi, Android hardware, or physical-device frame rate.']};
  }finally{
    for(const p of peers)await p.context.close().catch(()=>{});
    if(host.child.exitCode===null){host.child.kill();await new Promise(resolve=>{const t=setTimeout(resolve,2000);host.child.once('exit',()=>{clearTimeout(t);resolve();});});}
  }
}
(async()=>{
  let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:chromiumPath,args:['--no-first-run','--disable-background-networking','--disable-extensions','--disable-sync','--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const results=[];for(const mode of (process.env.SIGHTLINE_LAN_CASES||'ffa,bomb').split(',').filter(Boolean))results.push(await runCase(browser,mode));
    const report={status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',createdAt:new Date().toISOString(),phoneHostPageSha256:sha(path.join(phone,'index.html')),phoneHostServerSha256:sha(path.join(phone,'server.js')),renderer:'Codex-managed headless Chromium using SwiftShader software WebGL',results,limitations:['Loopback Protocol V2 gameplay only; not private Wi-Fi.','Software WebGL; not Android GPU or physical-device acceptance.','The Bomb case verifies synchronized live match start, objective state, and snapshot delivery; the unassisted plant/defuse gameplay loop is separately verified in the Offline E2E.']};
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({status:report.status,output,source:{page:report.phoneHostPageSha256,server:report.phoneHostServerSha256},results:results.map(r=>({mode:r.mode,status:r.status,phase:r.phase,players:r.players,bots:r.bots,tickMs:r.tickMs,snapshotHz:r.snapshotHz,clientSnapshots:r.clientSnapshots,hostView:r.hostView,guestView:r.guestView,errors:r.errors,failedResponses:r.failedResponses}))},null,2));
    if(report.status!=='PASS')process.exitCode=1;
  }finally{if(browser)await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
