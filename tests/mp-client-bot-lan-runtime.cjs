'use strict';
// Actual Sightline WebGL client + authoritative loopback host. This runs only
// inside the isolated workspace; it does not open or control the user's browser.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {chromium}=require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),hostDir=path.join(root,'AndroidProject/app/src/main/assets/phone-host');
const outDir=path.resolve(process.env.SIGHTLINE_LAN_CLIENT_EVIDENCE||path.join(root,'evidence/lan-bot-client-runtime-20261027'));
fs.mkdirSync(outDir,{recursive:true});
const cpuProfileDir=process.env.SIGHTLINE_LAN_HOST_CPU_PROFILE?path.resolve(process.env.SIGHTLINE_LAN_HOST_CPU_PROFILE):null;
if(cpuProfileDir)fs.mkdirSync(cpuProfileDir,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function port(){return new Promise((ok,fail)=>{const s=http.createServer();s.once('error',fail);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):ok(p));});});}
function getStatus(p){return new Promise((ok,fail)=>{const q=http.get({host:'127.0.0.1',port:p,path:'/status'},r=>{let b='';r.on('data',x=>b+=x);r.on('end',()=>{try{ok(JSON.parse(b));}catch(e){fail(e);}});});q.once('error',fail);});}
async function until(fn,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){const x=await fn();if(x)return x;await delay(80);}return null;}
function percentile(a,p){const s=a.slice().sort((x,y)=>x-y);return s.length?+s[Math.min(s.length-1,Math.floor(s.length*p))].toFixed(2):null;}
async function connectHostCpuProfiler(debugUrl){
  if(typeof WebSocket!=='function')throw new Error('Node global WebSocket is unavailable for the optional inspector profile');
  const ws=new WebSocket(debugUrl),pending=new Map();let nextId=0;
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Host inspector WebSocket open timed out')),5000);ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Host inspector WebSocket failed to open'));},{once:true});});
  ws.addEventListener('message',event=>{let m;try{m=JSON.parse(String(event.data));}catch{return;}if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message||'Inspector command failed')):p.resolve(m.result||{});}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  await call('Profiler.enable');
  return {start(){return call('Profiler.start');},async stop(){const result=await call('Profiler.stop');try{ws.close();}catch{}return result.profile;},close(){try{ws.close();}catch{}}};
}
(async()=>{
  const low=process.env.SIGHTLINE_LAN_CLIENT_LOW==='1';
  const requestedBots=Math.max(2,Math.min(64,Math.round(Number(process.env.SIGHTLINE_LAN_CLIENT_BOTS)||12)));
  const team0=Math.ceil(requestedBots/2),team1=requestedBots-team0;
  const p=await port(),result={test:'actual Sightline LAN bot interpolation runtime',bind:'127.0.0.1',mode:'versus',botsRequested:requestedBots,teamBots:[team0,team1],profile:low?'low settings / 640x360':'desktop defaults / 1280x720',renderer:'sandboxed headless Chromium WebGL; backend recorded from WEBGL_debug_renderer_info',checks:[],errors:[],limits:['Loopback host and isolated headless browser only; renderer backend is measured. Not physical Wi-Fi or Android device/GPU.']};
  if(cpuProfileDir)result.hostCpuProfileDir=cpuProfileDir;
  let server,browser,page,logs='',pageErrors=[],readinessError=null,hostProfiler=null,profilerStarted=false,cpuProfilePath=null,hostTimelineTimer=null;const hostTimeline=[];
  function check(name,pass,details){result.checks.push({name,pass:!!pass,...(details===undefined?{}:{details})});if(!pass)throw Error('FAIL: '+name);}
  try{
    const hostNodeArgs=cpuProfileDir?['--inspect=127.0.0.1:0']:[];
    server=spawn(process.execPath,[...hostNodeArgs,'server.js','--transport','dev','--bind','127.0.0.1','--port',String(p),'--max','2','--total','96','--bots','0','--tick-ms','20'],{cwd:hostDir,env:{...process.env,...(process.env.SIGHTLINE_LAN_DIAGNOSTICS==='1'?{SIGHTLINE_DIAGNOSTICS:'1'}:{})},stdio:['ignore','pipe','pipe']});
    server.stdout.on('data',x=>logs+=String(x));server.stderr.on('data',x=>logs+=String(x));
    const ready=await until(async()=>{if(server.exitCode!=null)return null;try{const s=await getStatus(p);if(!s.ok)readinessError='status endpoint returned ok=false: '+JSON.stringify(s);return s.ok?s:null;}catch(e){readinessError=String(e&&e.message||e);return null;}});
    check('the current host build starts on isolated loopback',!!ready,ready?{bundle:ready.bundle,server:ready.server}:{exitCode:server.exitCode,probeError:readinessError,serverLog:logs.slice(-1200)});
    if(cpuProfileDir){const debugUrl=await until(()=>logs.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-zA-Z0-9-]+/)?.[0]||null,10000);if(!debugUrl)throw new Error('Could not find the host-only 127.0.0.1 inspector endpoint in host output');hostProfiler=await connectHostCpuProfiler(debugUrl);result.hostCpuProfile={connected:true,binding:'127.0.0.1',warning:'V8 sampling profile adds small observer overhead; compare with an unprofiled production-like run.'};}
    // Keep Chromium's sandbox and normal GPU-selection policy. Do not force
    // SwiftShader or bypass the GPU blocklist: that would both distort the
    // client-performance result and weaken the test browser's isolation.
    browser=await chromium.launch({executablePath:process.env.SIGHTLINE_CHROME||undefined,headless:true,ignoreDefaultArgs:['--no-sandbox','--enable-unsafe-swiftshader'],args:['--enable-webgl','--disable-background-timer-throttling']});
    page=await browser.newPage({viewport:low?{width:640,height:360}:{width:1280,height:720},deviceScaleFactor:1});
    page.on('pageerror',e=>pageErrors.push({message:e.message,stack:e.stack}));
    await page.addInitScript(low=>{var k='sightline.settings.v1',s={};try{s=JSON.parse(localStorage.getItem(k)||'{}')||{};}catch(_){}s.interp=20;if(low){s.renderScale=50;s.shadows='off';s.drawDist=55;s.fx='low';s.fastMode=true;s.fpsCap=60;s.adaptive=true;}localStorage.setItem(k,JSON.stringify(s));window.__lanSocketTrace=[];window.__lanProtocolTrace=[];window.__lanSocketLifecycle=[];window.__lanStartStates=[];window.__lanHeartbeat={last:performance.now(),maxGapMs:0,samples:0};setInterval(function(){var t=performance.now();window.__lanHeartbeat.maxGapMs=Math.max(window.__lanHeartbeat.maxGapMs,t-window.__lanHeartbeat.last);window.__lanHeartbeat.last=t;window.__lanHeartbeat.samples++;},100);var NativeWS=window.WebSocket;function TracedWS(url,protocols){var ws=protocols===undefined?new NativeWS(url):new NativeWS(url,protocols),record=function(type,extra){window.__lanSocketLifecycle.push(Object.assign({t:performance.now(),type,readyState:ws.readyState},extra||{}));if(window.__lanSocketLifecycle.length>100)window.__lanSocketLifecycle.shift();};ws.addEventListener('open',function(){record('open');});ws.addEventListener('close',function(ev){record('close',{code:ev.code,reason:ev.reason,wasClean:ev.wasClean});});ws.addEventListener('error',function(){record('error');});ws.addEventListener('message',function(ev){try{var m=JSON.parse(ev.data),t=performance.now();if(m.t==='s')window.__lanSocketTrace.push(t);window.__lanProtocolTrace.push({t,type:m.t,phase:m.ph,round:m.round,id:m.id,playerCount:m.players&&m.players.length,mode:m.mode});if(m.t==='start')setTimeout(function(){var S=window.__sl||{},M=S.MP||{};window.__lanStartStates.push({t:performance.now(),mpOn:M.on,id:M.id,hasLobby:!!M.lobby,state:S.state});},0);if(window.__lanProtocolTrace.length>600)window.__lanProtocolTrace.shift();}catch(_){}});return ws;}TracedWS.prototype=NativeWS.prototype;Object.setPrototypeOf(TracedWS,NativeWS);window.WebSocket=TracedWS;},low);
    const response=await page.goto('http://127.0.0.1:'+p+'/?debug',{waitUntil:'load',timeout:60000});
    check('the actual game page loads from the host',response&&response.status()===200,{status:response&&response.status()});
    await page.waitForFunction(()=>!!(window.__sl&&window.__sl.MP),null,{timeout:30000});
    await page.evaluate(()=>{window.__lanSnapshotTrace=[];window.__lanLastSnap=-1;function sample(){var M=window.__sl.MP;if(M.snapN!==window.__lanLastSnap){window.__lanSnapshotTrace.push({t:performance.now(),n:M.snapN});window.__lanLastSnap=M.snapN;}requestAnimationFrame(sample);}requestAnimationFrame(sample);});
    // The game is intentionally wrapped in an IIFE. Use its existing debug
    // state hook for observation, but connect/configure through the real UI.
    await page.locator('#mn-nav [data-tab="net"]').click();
    await page.locator('#mp-name').fill('BotRuntimeQA');
    await page.locator('#mp-addr').fill(new URL(page.url()).host);
    await page.locator('[data-net="connect"]').click();
    const joined=await page.waitForFunction(()=>{var M=window.__sl&&window.__sl.MP;return !!(M&&M.id>0&&M.host===true&&M.lobby&&M.lobby.players.length===1);},null,{timeout:15000}).then(()=>true).catch(()=>false);
    check('the real WebGL client joins as LAN host',joined);
    await page.locator('[data-net="mode"][data-v="versus"]').click();
    for(const [id,value] of [['#mp-bot-t0',String(team0)],['#mp-bot-t1',String(team1)]]){
      await page.locator(id).fill(value);
      await page.locator(id).dispatchEvent('change');
      await page.waitForTimeout(150);
    }
    const roster=await page.waitForFunction(n=>{var M=window.__sl&&window.__sl.MP;return !!(M&&M.lobby&&M.lobby.players.filter(p=>p.bot).length===n);},requestedBots,{timeout:20000}).then(()=>true).catch(()=>false);
    check('the host client receives its selected bot roster',roster,{requestedBots,teamBots:[team0,team1]});
    hostTimelineTimer=setInterval(async()=>{if(hostTimeline._busy)return;hostTimeline._busy=true;const at=performance.now();try{const s=await getStatus(p);hostTimeline.push({at:+at.toFixed(1),probeMs:+(performance.now()-at).toFixed(2),phase:s.phase,players:s.players,bots:s.bots,botsAlive:s.botsAlive,tickP99:s.liveTiming?.tickP99??s.stats?.tickP99,gapP99:s.liveTiming?.gapP99??s.stats?.gapP99,gapMax:s.stats?.gapMax,eventLoop:s.eventLoop?.delayMs||null,hostCpu:s.cpu});if(hostTimeline.length>180)hostTimeline.shift();}catch(e){hostTimeline.push({at:+at.toFixed(1),error:String(e&&e.message||e)});}finally{hostTimeline._busy=false;}},1000);
    await page.locator('[data-net="start"]').click();
    const startProbeTrace=[];let startProbeBusy=false;const startProbeTimer=setInterval(async()=>{if(startProbeBusy)return;startProbeBusy=true;const at=performance.now();try{const s=await getStatus(p);startProbeTrace.push({at:+at.toFixed(1),durationMs:+(performance.now()-at).toFixed(2),phase:s.phase,players:s.players,bots:s.bots,liveGapMax:s.stats?.gapMax,eventLoop:s.eventLoop?.delayMs||null});}catch(e){startProbeTrace.push({at:+at.toFixed(1),error:String(e&&e.message||e)});}finally{startProbeBusy=false;}},250);
    const live=await page.waitForFunction(()=>{var M=window.__sl&&window.__sl.MP;return !!(M&&M.on&&M.lobby&&M.lobby.players.some(p=>p.id===M.id));},null,{timeout:30000}).then(()=>true).catch(()=>false);
    clearInterval(startProbeTimer);
    if(hostTimelineTimer){clearInterval(hostTimelineTimer);hostTimelineTimer=null;}
    result.startGate={passed:live,hostProbeCount:startProbeTrace.length,hostProbeDurationMs:startProbeTrace.length?{p95:percentile(startProbeTrace.filter(x=>x.durationMs!=null).map(x=>x.durationMs),.95),max:Math.max(...startProbeTrace.filter(x=>x.durationMs!=null).map(x=>x.durationMs))}:null,hostProbeTrace:startProbeTrace.filter((_,i)=>i%4===0).slice(-32)};
    if(!live){result.startDiagnostics={client:await page.evaluate(()=>{var S=window.__sl||{},M=S.MP||{},players=M.lobby&&M.lobby.players||[];return {mpOn:M.on,id:M.id,host:M.host,mode:M.mode,hasLobby:!!M.lobby,lobbyPlayerCount:players.length,lobbyPlayers:players.slice(0,4).map(p=>({id:p.id,bot:!!p.bot,team:p.team})),localPlayerFound:players.some(p=>String(p.id)===String(M.id)),gameState:S.state,socketState:M.sock&&M.sock.readyState,sinceLastRxMs:M.net&&M.net.lastRx?Math.round(performance.now()-M.net.lastRx):null,heartbeat:window.__lanHeartbeat,startStates:window.__lanStartStates,socketLifecycle:window.__lanSocketLifecycle,protocolTrace:(window.__lanProtocolTrace||[]).slice(-40)};}),hostTimeline,server:await getStatus(p),serverLog:logs.slice(-2200)};}
    check('the actual game client enters the authoritative match',live);
    const puppets=await page.waitForFunction(n=>Object.values(window.__sl.MP.puppets).filter(u=>u.netBot).length>=n,requestedBots,{timeout:15000}).then(()=>true).catch(()=>false);
    check('all remote bot puppets are created in the game renderer',puppets,{requestedBots});
    const livePhase=await until(async()=>{try{return (await getStatus(p)).phase==='live';}catch{return false;}},20000,200);
    check('server buy phase completes and bots are measured during live play',livePhase,{serverPhase:livePhase?'live':(await getStatus(p)).phase});
    if(hostProfiler){await hostProfiler.start();profilerStarted=true;cpuProfilePath=path.join(cpuProfileDir,'sightline-host-'+process.pid+'-'+Date.now()+'.cpuprofile');result.hostCpuProfile={...result.hostCpuProfile,started:true,profilePath:cpuProfilePath};}
    const hostProbeStart=await getStatus(p),hostProbeAt=performance.now();
    await page.waitForTimeout(4500);
    const observed=await page.evaluate(()=>{
      var MP=window.__sl.MP;
      var all=Object.values(MP.puppets),bots=all.filter(u=>u.netBot),active=bots.filter(u=>u.alive&&u.buf&&u.buf.length>=2);
      var ranked=active.map(u=>{var a=u.buf[u.buf.length-2],c=u.buf[u.buf.length-1],span=Math.max(1,c.t-a.t);return {u:u,speed:Math.hypot(c.x-a.x,c.z-a.z)/span*1000};}).sort((a,b)=>b.speed-a.speed);
      var pick=ranked[0],u=pick&&pick.u;
      var gpu='unavailable',gl=window.__sl.renderer&&window.__sl.renderer.getContext();try{var dbg=gl&&gl.getExtension('WEBGL_debug_renderer_info');if(dbg)gpu=gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);}catch(_){}
      window.__lanMotion={started:performance.now(),botCount:bots.length,activeBotCount:active.length,selectedBotId:u&&u.id,snapshotSpeedUnitsPerSec:pick&&pick.speed,frameSamples:[],intervalMs:MP.net.ema,jitterMs:MP.net.jit,rendererDrawCalls:window.__sl.renderer&&window.__sl.renderer.info.render.calls,rendererTriangles:window.__sl.renderer&&window.__sl.renderer.info.render.triangles,webglRenderer:gpu,gamePerformanceInfo:window.__sl.performanceInfo?window.__sl.performanceInfo():null};
      if(u){var targetId=u.id;function frame(){var current=window.__sl.MP.puppets[targetId];if(!current)return;window.__lanMotion.frameSamples.push({t:performance.now(),x:current.x,z:current.z,rx:current.g.position.x,rz:current.g.position.z,snap:window.__sl.MP.snapN});if(window.__lanMotion.frameSamples.length<150)requestAnimationFrame(frame);}requestAnimationFrame(frame);}
      return {botCount:bots.length,activeBotCount:active.length,botsWithBuffers:bots.filter(u=>u.buf&&u.buf.length>=2).length,alives:bots.filter(u=>u.alive).length,snapshotCount:window.__lanSnapshotTrace.length,bufferLengths:bots.slice(0,5).map(u=>u.buf&&u.buf.length),clientState:window.__sl.state};
    });
    await page.waitForTimeout(5000);
    const motion=await page.evaluate(()=>{var m=window.__lanMotion,s=m.frameSamples,moving=0,maxStep=0,trace=window.__lanSocketTrace,gaps=trace.slice(1).map((t,i)=>t-trace[i]).filter(x=>x<1000),frames=s.slice(1).map((x,i)=>x.t-s[i].t),cfg={};for(var i=1;i<s.length;i++){var d=Math.hypot(s[i].x-s[i-1].x,s[i].z-s[i-1].z);if(d>1e-5)moving++;maxStep=Math.max(maxStep,d);}try{cfg=JSON.parse(localStorage.getItem('sightline.settings.v1')||'{}')||{};}catch(_){}var pct=(a,p)=>{a=a.slice().sort((x,y)=>x-y);return a.length?+a[Math.min(a.length-1,Math.floor((a.length-1)*p))].toFixed(2):null;};return {...m,frameSamples:s.length,renderFrameHz:frames.length?+(1000/(frames.reduce((a,b)=>a+b,0)/frames.length)).toFixed(1):null,renderFrameGapMs:{p95:pct(frames,.95),p99:pct(frames,.99)},movingFrameSamples:moving,maxFrameStep:+maxStep.toFixed(4),rendererTransformMatchesState:s.length>0&&s.every(q=>Math.abs(q.x-q.rx)<1e-6&&Math.abs(q.z-q.rz)<1e-6),snapshotCount:trace.length,clientSnapshotGapMs:{mean:gaps.length?+(gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(2):null,p95:pct(gaps,.95),p99:pct(gaps,.99),max:gaps.length?+Math.max(...gaps).toFixed(2):null},selectedSmoothingMs:cfg.interp||Math.max(20,Math.min(180,Math.round((window.__sl.MP.net.ema||40)+(window.__sl.MP.net.jit||0)*2))),sampleTrace:s.slice(-12)};});
    const host=await getStatus(p);
    const hostProbeSeconds=(performance.now()-hostProbeAt)/1000,thinkDelta=Math.max(0,host.bot.thinks-hostProbeStart.bot.thinks),thinkRate=thinkDelta/Math.max(.001,hostProbeSeconds);
    const cpuUserUs=Math.max(0,(host.cpu?.user||0)-(hostProbeStart.cpu?.user||0)),cpuSystemUs=Math.max(0,(host.cpu?.system||0)-(hostProbeStart.cpu?.system||0)),hostCpuMs=(cpuUserUs+cpuSystemUs)/1000;
    const botThinkIntervalMs=Math.max(50,Number(host.botWork?.thinkIntervalMs)||50),expectedBotThinkPerSecond=host.botsAlive*1000/botThinkIntervalMs,botCadencePercent=expectedBotThinkPerSecond?100*thinkRate/expectedBotThinkPerSecond:100;
    const perfGates={
      botDecisionCadence95pct:botCadencePercent>=95,
      hostTickWorkP99Within20ms:(host.liveTiming?.tickP99??host.stats.tickP99)<=20,
      hostTickGapP95Within40ms:host.liveTiming?.gapP95<=40,
      clientSnapshotP95Within50ms:motion.clientSnapshotGapMs.p95<=50,
      clientRenderAtLeast30Hz:motion.renderFrameHz>=30,
      noSnapshotBacklogDrops:(host.stats.backlogSkipped||0)===0&&(host.stats.skipped||0)===0,
      noSimulationTickErrors:(host.stats.tickErrors||0)===0
    };
    const perfPass=Object.values(perfGates).every(Boolean);
    result.runtime={...observed,...motion,server:{tickWorkP95Ms:host.liveTiming?.tickP95??host.stats.tickP95,tickWorkP99Ms:host.liveTiming?.tickP99??host.stats.tickP99,tickStartGapP95Ms:host.liveTiming?.gapP95??host.stats.gapP95,tickStartGapP99Ms:host.liveTiming?.gapP99??host.stats.gapP99,tickErrors:host.stats.tickErrors||0,tactics:host.tactics,invalidTargets:host.bot.invalidTargets||0,botThinkCalls:thinkDelta,botThinkPerSecond:+thinkRate.toFixed(1),botThinkIntervalMs,expectedBotThinkPerSecond,botCadencePercent:+botCadencePercent.toFixed(1),hostProcessCpuMs:+hostCpuMs.toFixed(1),hostProcessCpuSharePercent:+(hostCpuMs/(hostProbeSeconds*10)).toFixed(1),hostProcessCpuWindowSeconds:+hostProbeSeconds.toFixed(2),backlogSkipped:host.stats.backlogSkipped,skippedSnapshots:host.stats.skipped,liveComponentMax:host.liveComponentMax||null,botWork:host.botWork||null,eventLoop:host.eventLoop||null,slowGaps:host.slowGaps||[],bot:host.bot||null,navigation:host.navigation||null}};
    result.performanceAssessment={status:perfPass?'PASS':'FAIL',gates:perfGates,reason:'This is a combined isolated-runtime gate only. The actual WebGL backend is recorded below; this test cannot certify physical-Wi-Fi or Android-device smoothness.',renderFrameHz:motion.renderFrameHz,clientSnapshotP95Ms:motion.clientSnapshotGapMs.p95,hostTickGapP95Ms:host.liveTiming?.gapP95??host.stats.gapP95,hostProcessCpuMs:+hostCpuMs.toFixed(1),hostProcessCpuSharePercent:+(hostCpuMs/(hostProbeSeconds*10)).toFixed(1),gamePerformanceInfo:motion.gamePerformanceInfo,webglRenderer:motion.webglRenderer};
    await page.locator('#gl').screenshot({path:path.join(outDir,'lan-12bots-webgl.png')});
    check('the client receives real bot movement snapshots at the expected LAN rate',motion.botCount===requestedBots&&motion.activeBotCount===requestedBots&&motion.snapshotCount>100,{botCount:motion.botCount,activeBotCount:motion.activeBotCount,requestedBots,snapshots:motion.snapshotCount,clientSnapshotGapMs:motion.clientSnapshotGapMs});
    check('client interpolation advances at least one moving bot and keeps its render transform synchronized',motion.movingFrameSamples>0&&motion.rendererTransformMatchesState,{movingFrameSamples:motion.movingFrameSamples,rendererTransformMatchesState:motion.rendererTransformMatchesState,renderFrameHz:motion.renderFrameHz});
    check('LAN snapshot stream has no host backlog drops',host.stats.backlogSkipped===0&&host.stats.skipped===0,{backlogSkipped:host.stats.backlogSkipped,skipped:host.stats.skipped});
    check('the authoritative host recorded no simulation tick exceptions',(host.stats.tickErrors||0)===0,{tickErrors:host.stats.tickErrors||0});
    check('host bot tactical searches remained valid',host.tactics?.invalidQueries===0&&host.tactics?.missingColumns===0,host.tactics);
    check('host bot perception accepted no non-finite targets',(host.bot?.invalidTargets||0)===0,{invalidTargets:host.bot?.invalidTargets||0});
    check('the actual game page has no uncaught JavaScript errors',pageErrors.length===0,{pageErrors});
  }catch(e){
    const message=String(e&&e.message||e);
    if(/Executable doesn't exist at|Please run the following command to download new browsers/i.test(message)){
      result.blockedReason='Isolated Playwright Chromium binary is not installed. No personal browser was used and no browser download was attempted.';
      result.errors.push(String(e.stack||e));
    }else if(/connect EACCES 127\.0\.0\.1|connect EPERM 127\.0\.0\.1/i.test(message)||/connect EACCES 127\.0\.0\.1|connect EPERM 127\.0\.0\.1/i.test(readinessError||'')){
      result.blockedReason='The isolated runtime denied the harness loopback status probe. This is a sandbox permission block, not a game failure.';
      result.errors.push(String(e.stack||e));
    }else if(/browserType\.launch: Target page, context or browser has been closed|process did exit with exitCode=2147483651/i.test(message)){
      result.blockedReason='Sandbox-preserving Chromium exited before page creation in this isolated Windows runtime. The test will not disable Chromium sandboxing to work around it.';
      result.errors.push(String(e.stack||e));
    }else result.errors.push(String(e.stack||e));
  }
  finally{
    if(hostTimelineTimer)clearInterval(hostTimelineTimer);
    if(page)try{await page.close();}catch{}if(browser)try{await browser.close();}catch{}
    if(hostProfiler&&profilerStarted){try{const profile=await hostProfiler.stop();fs.writeFileSync(cpuProfilePath,JSON.stringify(profile));result.hostCpuProfile={...result.hostCpuProfile,stopped:true,nodeCount:profile?.nodes?.length||0,sampleCount:profile?.samples?.length||0,bytes:fs.statSync(cpuProfilePath).size};}catch(e){result.hostCpuProfile={...result.hostCpuProfile,stopped:false,error:String(e&&e.message||e)};hostProfiler.close();}}else if(hostProfiler)hostProfiler.close();
    if(server){server.kill('SIGTERM');await delay(120);if(server.exitCode===null)server.kill('SIGKILL');}
    result.hostTimeline=hostTimeline;result.pageErrors=pageErrors;result.serverLog=logs.slice(-1600);result.pass=!result.blockedReason&&!result.errors.length&&result.checks.every(c=>c.pass);result.overallStatus=result.blockedReason?'BLOCKED':result.pass?(result.performanceAssessment&&result.performanceAssessment.status==='PASS'?'PASS':result.performanceAssessment&&result.performanceAssessment.status==='FAIL'?'FAIL':'UNVERIFIED'):'FAIL';
    fs.writeFileSync(path.join(outDir,'runtime-results.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({pass:result.pass,overallStatus:result.overallStatus,performanceAssessment:result.performanceAssessment,checks:result.checks,errors:result.errors,runtime:result.runtime,serverLog:result.serverLog,evidence:outDir},null,2));
  }
  if(!result.pass)process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
