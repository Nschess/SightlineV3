#!/usr/bin/env node
// Loopback Outbreak acceptance: 56 survivor bots reserve at least 8 of the
// shared 64 AI slots for Hollowed, with the active total kept within budget.
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { observeProtocolV2, protocolHello, sendProtocolV2 } from './lib/mp-protocol-v2-client.mjs';

const root = resolve(process.argv[2] || './AndroidProject/app/src/main/assets/phone-host');
const out = resolve(process.argv[3] || './acceptance/mp-outbreak-64bot-cap-2026-10-26.json');
const durationMs = Math.max(17000, Number(process.argv[4] || 45000));
const mapId=process.argv[5]||null;
const tickMs=Number(process.env.SIGHTLINE_HOST_TICK_MS||20);
const protocolClientCount=Math.max(2,Math.min(10,Math.trunc(Number(process.env.SIGHTLINE_PROTOCOL_CLIENTS)||2)));
if(!Number.isFinite(tickMs)||tickMs<10||tickMs>50)throw new Error('SIGHTLINE_HOST_TICK_MS must be between 10 and 50 ms');
if(mapId){const d=JSON.parse(await readFile(resolve(root,'data.json'),'utf8'));if(!d.maps.some(m=>m.id===mapId))throw new Error(`Unknown map id '${mapId}'. Use one of: ${d.maps.map(m=>m.id).join(', ')}`);}
const cpuProfilePath = process.env.SIGHTLINE_HOST_CPU_PROFILE ? resolve(process.env.SIGHTLINE_HOST_CPU_PROFILE) : null;
if (cpuProfilePath) await mkdir(dirname(cpuProfilePath), { recursive: true });
const t0 = performance.now(), delay = ms => new Promise(r => setTimeout(r, ms));
const port = await new Promise((ok, fail) => { const s = createServer(); s.once('error', fail); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(e => e ? fail(e) : ok(p)); }); });
const diagnosticsEnabled = process.env.SIGHTLINE_DIAGNOSTICS !== '0';
const captureGapTrace = process.env.SIGHTLINE_CAPTURE_GAP_TRACE === '1';
const captureSnapshotTrace = process.env.SIGHTLINE_CAPTURE_SNAPSHOT_TRACE === '1';
const hostStartTimeoutMs=Math.max(12000,Number(process.env.SIGHTLINE_HOST_START_TIMEOUT_MS)||30000);
const result = { test: '64 AI combined cap in LAN Outbreak', mapId, bind: '127.0.0.1', port, durationMs, tickMs, protocolClientCount, diagnosticsEnabled, hostStartTimeoutMs, status:'RUNNING', checks: [], errors: [], limits: ['Loopback protocol test only; no browser, Wi-Fi, Android or GPU validation.'] };
const clients = []; let server, logs = '', lastStatusError = '', hostProfiler = null, profilerStarted = false;
function check(name, pass, details = {}) { result.checks.push({ name, pass: !!pass, ...details }); if (!pass) throw Error(name); }
async function status() { return new Promise((ok, fail) => { const q = request({ host: '127.0.0.1', port, path: '/status' }, r => { let b=''; r.on('data', x => b += x); r.on('end', () => { try { ok(JSON.parse(b)); } catch (e) { lastStatusError=String(e.stack||e); fail(e); } }); }); q.once('error', e=>{lastStatusError=String(e.code||e.message||e);fail(e);}); q.end(); }); }
async function until(fn, timeout = 12000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return true; await delay(40); } return false; }
function connect(name) { return new Promise((ok, fail) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const c = { name, ws, session:'', actionSeq:0, ep:null, events: [], snapshotTimes: [], snapshotServerTimes: [], snapshotPayloads: [], snapshotBytes: 0, botIds: new Set(), lastBotPosition: new Map(), movedBotIds: new Set(), lastZombiePosition: new Map(), movedZombieIds: new Set(), movingFrames: 0 };
  clients.push(c);
  const tm = setTimeout(() => fail(Error('connect timeout '+name)), 5000);
  ws.addEventListener('open', () => { clearTimeout(tm); ws.send(JSON.stringify(protocolHello(name))); });
  ws.addEventListener('message', e => {
    let m; try { m=JSON.parse(e.data); } catch { return; }
    observeProtocolV2(c,m);
    if(m.t==='lobby'&&Array.isArray(m.players))c.botIds=new Set(m.players.filter(p=>p.bot).map(p=>p.id));
    if(m.t==='s'){
      c.snapshotTimes.push(performance.now());
      if(Number.isFinite(m.st))c.snapshotServerTimes.push(m.st);
      if(captureSnapshotTrace&&name==='OutbreakHost')c.snapshotPayloads.push(m);
      c.snapshotBytes+=Buffer.byteLength(String(e.data),'utf8');
      for(const row of m.a||[]){if(!c.botIds.has(row[0]))continue;const prev=c.lastBotPosition.get(row[0]);if(prev&&Math.hypot(row[1]-prev[0],row[3]-prev[1])>.02)c.movedBotIds.add(row[0]);c.lastBotPosition.set(row[0],[row[1],row[3]]);}
      for(const row of m.z||[]){const prev=c.lastZombiePosition.get(row[0]);if(prev&&Math.hypot(row[2]-prev[0],row[3]-prev[1])>.02)c.movedZombieIds.add(row[0]);c.lastZombiePosition.set(row[0],[row[2],row[3]]);}
    } else c.events.push(m);
    if (m.t==='ping') ws.send(JSON.stringify({t:'pong',s:m.s}));
    if (m.t==='welcome') ok(c);
  });
  ws.addEventListener('error', () => { clearTimeout(tm); fail(Error('websocket error '+name)); });
}); }
async function connectHostProfiler(debugUrl) {
  if (typeof WebSocket !== 'function') throw new Error('Node global WebSocket is unavailable for the optional host CPU profile');
  const ws = new WebSocket(debugUrl), pending = new Map(); let id = 0;
  await new Promise((ok, fail) => { const timer=setTimeout(()=>fail(new Error('Inspector WebSocket open timed out')),5000); ws.addEventListener('open',()=>{clearTimeout(timer);ok();},{once:true}); ws.addEventListener('error',()=>{clearTimeout(timer);fail(new Error('Inspector WebSocket failed to open'));},{once:true}); });
  ws.addEventListener('message', event=>{let m;try{m=JSON.parse(String(event.data));}catch{return;}if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message||'Inspector command failed')):p.resolve(m.result||{});}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});ws.send(JSON.stringify({id:requestId,method,params}));});
  await call('Profiler.enable'); return {start(){return call('Profiler.start');},async stop(){const r=await call('Profiler.stop');try{ws.close();}catch{}return r.profile;},close(){try{ws.close();}catch{}}};
}
const send = (c, m) => sendProtocolV2(c,m);
const last = (c, t) => [...c.events].reverse().find(m => m.t === t);
try {
  server = spawn(process.execPath, [...(cpuProfilePath?['--inspect=127.0.0.1:0']:[]),'server.js','--transport','dev','--bind','127.0.0.1','--port',String(port),'--max',String(protocolClientCount),'--total','96','--bots','0','--tick-ms',String(tickMs)], { cwd: root, env:{...process.env,SIGHTLINE_DIAGNOSTICS:diagnosticsEnabled?'1':'0'}, stdio: ['ignore','pipe','pipe'] });
  server.stdout.on('data', x => logs += x); server.stderr.on('data', x => logs += x);
  const hostReady=await until(async () => { if (server.exitCode != null) return false; try { return (await status()).capacity === 96; } catch (e) { lastStatusError=String(e.code||e.message||e); if(e&&['EACCES','EPERM'].includes(e.code)){const blocked=new Error('Sandbox denied the loopback /status probe ('+e.code+'); network acceptance cannot run here.');blocked.code='SIGHTLINE_LOOPBACK_BLOCKED';throw blocked;} return false; } },hostStartTimeoutMs);
  check('host starts with 96 player-plus-bot capacity',hostReady,{serverOutput:logs.slice(-500),statusRequestError:lastStatusError||null});
  const configuredStatus=await status();check('host reports the requested simulation tick',Number(configuredStatus.snapshot?.tickMs)===tickMs,{requestedTickMs:tickMs,reportedTickMs:configuredStatus.snapshot?.tickMs,snapshotHz:configuredStatus.snapshot?.hz});
  const h = await connect('OutbreakHost'), g = await connect('OutbreakGuest');
  for(let i=2;i<protocolClientCount;i++) await connect(`OutbreakGuest${i+1}`);
  check(`${protocolClientCount} protocol clients connect`, clients.length===protocolClientCount&&clients.every(c=>last(c,'welcome')));
  if(mapId){send(h,{t:'map',id:mapId});const mapApplied=await until(()=>last(h,'lobby')?.map===mapId);check('requested map is active before starting the match',mapApplied,{requestedMap:mapId,actualMap:last(h,'lobby')?.map||null});}
  send(h, { t:'cfg', mode:'outbreak' }); send(h, { t:'cfg', bots:{ mode:'add', coop:64 } });
  check('Outbreak caps the selected squad at 56 so at least eight shared AI slots remain for Hollowed', await until(() => { const s=last(h,'lobby'); return s?.players?.filter(p=>p.bot).length===56; }));
  send(h, { t:'start' });
  const navWarm=await until(async()=>{const s=await status();return s.phase==='buy'&&!!s.navigation;},18000),navProbe=await status();
  check('Outbreak navigation graph is ready before live simulation',navWarm,{map:navProbe.map,navigationReady:!!navProbe.navigation,navigationBuilds:navProbe.navigation?1:0});
  check('Outbreak match starts', await until(() => h.events.some(m=>m.t==='ph'&&m.ph==='live'), 18000));
  check('the 56 survivor bots remain in the started match', (last(h,'sc')?.players||[]).filter(p=>p.bot).length===56);
  if (cpuProfilePath) {
    const end=Date.now()+10000; let debugUrl=null;
    while(Date.now()<end&&!debugUrl){debugUrl=logs.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-zA-Z0-9-]+/)?.[0]||null;if(!debugUrl)await delay(40);}
    if(!debugUrl)throw new Error('Could not find the host-only inspector endpoint');
    hostProfiler=await connectHostProfiler(debugUrl);await hostProfiler.start();profilerStarted=true;
  }
  const before=await status(),sampleStarted=performance.now();for(const c of clients){c.snapshotTimes.length=0;c.snapshotServerTimes.length=0;c.snapshotPayloads.length=0;c.snapshotBytes=0;c.movedBotIds.clear();c.movedZombieIds.clear();c.movingFrames=0;}
  const maxSamples = { ai: 0, bots: 0, zombies: 0, tickP95Ms: 0, tickP99Ms: 0, tickMaxMs: 0, gapP95Ms: 0, gapP99Ms: 0, gapMaxMs: 0, skipped: 0, stableTimingSamples: 0 };
  const end = Date.now() + durationMs;
  while (Date.now() < end) {
    const s=await status();
    maxSamples.ai=Math.max(maxSamples.ai,s.bots+s.zombies);
    maxSamples.bots=Math.max(maxSamples.bots,s.bots);
    maxSamples.zombies=Math.max(maxSamples.zombies,s.zombies);
    // Ignore warm-up percentiles: the first few live ticks can contain setup work
    // and make this summary look like a persistent stall. Acceptance uses stable
    // windows with at least 100 timing samples; final metrics remain recorded below.
    if ((s.liveTiming?.samples||0) >= 100) {
      maxSamples.stableTimingSamples++;
      maxSamples.tickP95Ms=Math.max(maxSamples.tickP95Ms,s.liveTiming?.tickP95||0);
      maxSamples.tickP99Ms=Math.max(maxSamples.tickP99Ms,s.liveTiming?.tickP99||0);
      maxSamples.tickMaxMs=Math.max(maxSamples.tickMaxMs,s.liveTiming?.tickMax||0);
      maxSamples.gapP95Ms=Math.max(maxSamples.gapP95Ms,s.liveTiming?.gapP95||0);
      maxSamples.gapP99Ms=Math.max(maxSamples.gapP99Ms,s.liveTiming?.gapP99||0);
      maxSamples.gapMaxMs=Math.max(maxSamples.gapMaxMs,s.liveTiming?.gapMax||0);
    }
    maxSamples.skipped=Math.max(maxSamples.skipped,s.stats.skipped||0);
    if (s.bots+s.zombies>64) throw Error('AI cap exceeded: '+JSON.stringify({bots:s.bots,zombies:s.zombies}));
    await delay(250);
  }
  check('active survivor bots plus Hollowed never exceed 64', maxSamples.ai <= 64, maxSamples);
  check('Outbreak kept at least one Hollowed active within the remaining eight slots', maxSamples.zombies > 0 && maxSamples.zombies <= 8, maxSamples);
  const finalStatus=await status();
  // Preserve diagnostic context even when a later acceptance assertion fails.
  // Previously the first failing check aborted before result.runtime was saved.
  result.diagnosticSnapshot={liveTiming:finalStatus.liveTiming,stats:finalStatus.stats,liveComponentMax:finalStatus.liveComponentMax,botWork:finalStatus.botWork,bot:finalStatus.bot,zombiePaths:finalStatus.zombiePaths,eventLoop:finalStatus.eventLoop,slowGaps:finalStatus.slowGaps};
  const expectedSnapshotEntities=finalStatus.players+finalStatus.bots+finalStatus.zombies;
  const expectedSnapshotEveryTicks=expectedSnapshotEntities>=80?2:1;
  const expectedSnapshotHz=Math.round(1000/(tickMs*expectedSnapshotEveryTicks));
  const serverPoseTimes=h.snapshotServerTimes;
  check('snapshots carry strictly increasing monotonic host timestamps for remote pose interpolation',serverPoseTimes.length>100&&serverPoseTimes.every((stamp,i)=>Number.isFinite(stamp)&&(i===0||stamp>serverPoseTimes[i-1])),{samples:serverPoseTimes.length,first:serverPoseTimes[0],last:serverPoseTimes.at(-1)});
  check('Outbreak snapshot entity count includes connected humans, survivor bots, and active Hollowed',finalStatus.snapshot?.entities===expectedSnapshotEntities,{expected:expectedSnapshotEntities,reported:finalStatus.snapshot?.entities,humans:finalStatus.players,survivorBots:finalStatus.bots,hollowed:finalStatus.zombies});
  check('Outbreak snapshot pacing matches the configured host tick and full actor count',finalStatus.snapshot?.tickMs===tickMs&&finalStatus.snapshot?.everyTicks===expectedSnapshotEveryTicks&&finalStatus.snapshot?.hz===expectedSnapshotHz,{expected:{tickMs,everyTicks:expectedSnapshotEveryTicks,hz:expectedSnapshotHz,entities:expectedSnapshotEntities},actual:finalStatus.snapshot});
  const elapsed=(performance.now()-sampleStarted)/1000,thinkCalls=Math.max(0,(finalStatus.bot?.thinks||0)-(before.bot?.thinks||0)),thinkRate=thinkCalls/Math.max(.001,elapsed),botIds=last(h,'lobby')?.players?.filter(p=>p.bot).map(p=>p.id)||[],hostSnaps=h.snapshotTimes,gaps=hostSnaps.slice(1).map((t,i)=>t-hostSnaps[i]).sort((a,b)=>a-b),pct=(a,p)=>a.length?+a[Math.min(a.length-1,Math.floor((a.length-1)*p))].toFixed(2):null,hostMoveBots=h.movedBotIds.size,hostMoveZombies=h.movedZombieIds.size;
  const clientDelivery=clients.map(c=>{const stream=c.snapshotTimes.slice(),gapTrace=stream.slice(1).map((t,i)=>t-stream[i]),cg=gapTrace.slice().sort((a,b)=>a-b);return {client:c.name,snapshots:stream.length,snapshotGapMs:{p95:pct(cg,.95),p99:pct(cg,.99),max:cg.length?+cg.at(-1).toFixed(2):null},...(captureGapTrace?{snapshotGapTraceMs:gapTrace.map(x=>+x.toFixed(3))}:{}),...(captureSnapshotTrace&&c.name==='OutbreakHost'?{snapshotPayloadTrace:c.snapshotPayloads}:{}),snapshotBytes:c.snapshotBytes,snapshotKiBPerSecond:+(c.snapshotBytes/Math.max(.001,elapsed)/1024).toFixed(2),movedBots:c.movedBotIds.size,movedHollowed:c.movedZombieIds.size};});
  result.runtime = {...maxSamples,elapsedSec:+elapsed.toFixed(2),botThinkCalls:thinkCalls,botThinkRatePerSecond:+thinkRate.toFixed(1),hostPlayerId:last(h,'welcome')?.id,movedBots:hostMoveBots,botRoster:botIds.length,movedHollowed:hostMoveZombies,snapshotGapMs:{p95:pct(gaps,.95),p99:pct(gaps,.99),max:gaps.at(-1)?+gaps.at(-1).toFixed(2):null},clientDelivery,zombiePathStats:finalStatus.zombiePaths||null,spawnSearchStats:finalStatus.outbreakSpawn||null,navigationDiagnostics:finalStatus.navigation||null,botPathStats:finalStatus.bot||null,botWorkDiagnostics:finalStatus.botWork||null,eventLoopDiagnostics:finalStatus.eventLoop||null,liveComponentMax:finalStatus.liveComponentMax||null,slowGaps:finalStatus.slowGaps||[],serverTickStats:{...finalStatus.liveTiming,tickErrors:finalStatus.stats.tickErrors,skipped:finalStatus.stats.skipped}};
  check('authoritative simulation recorded no tick exceptions',(finalStatus.stats.tickErrors||0)===0,{tickErrors:finalStatus.stats.tickErrors||0,serverLog:logs.slice(-1200)});
  check('live host tick work stays below half the configured cadence at p95',finalStatus.liveTiming.tickP95<tickMs/2,{tickMs,tickP50:finalStatus.liveTiming.tickP50,tickP95:finalStatus.liveTiming.tickP95,tickP99:finalStatus.liveTiming.tickP99,tickMax:finalStatus.liveTiming.tickMax});
  check('live host tick p99 stays within one configured cadence and scheduler gaps stay bounded',finalStatus.liveTiming.tickP99<tickMs&&finalStatus.liveTiming.gapP99<tickMs*3&&finalStatus.liveTiming.gapMax<tickMs*10,{tickMs,tickP99:finalStatus.liveTiming.tickP99,gapP99:finalStatus.liveTiming.gapP99,gapMax:finalStatus.liveTiming.gapMax});
  const tickSpikeLimitMs=Math.max(40,tickMs*2),botWork=finalStatus.botWork||{};
  check('no single live host tick exceeds the severe-spike limit',finalStatus.liveTiming.tickMax<tickSpikeLimitMs,{tickMs,tickSpikeLimitMs,tickMax:finalStatus.liveTiming.tickMax,slowGaps:finalStatus.slowGaps});
  check('bot catch-up uses its wall-time budget and deferrals fit within one synchronous decision overrun',botWork.budgetMs===6&&botWork.budgetElapsedMaxMs<botWork.budgetMs+(botWork.thinkMaxMs||0)+2&&(!(botWork.budgetDeferredBots>0)||botWork.budgetHitTicks>0),{budgetMs:botWork.budgetMs,budgetElapsedMaxMs:botWork.budgetElapsedMaxMs,thinkMaxMs:botWork.thinkMaxMs,budgetHitTicks:botWork.budgetHitTicks,budgetDeferredBots:botWork.budgetDeferredBots});
  const thinkIntervalMs=Math.max(50,Number(finalStatus.botWork?.thinkIntervalMs)||50),targetThinkRate=Math.max(1,finalStatus.botsAlive)*1000/thinkIntervalMs;
  check('survivor bots sustain at least 85 percent of their host-budgeted decision rate',thinkRate>=targetThinkRate*.85,{thinkCalls,thinkRatePerSecond:+thinkRate.toFixed(1),thinkIntervalMs,botsAlive:finalStatus.botsAlive,targetThinkRate:+targetThinkRate.toFixed(1)});
  check('bots and Hollowed show position changes in actual protocol snapshots',hostMoveBots>=Math.min(14,Math.ceil(botIds.length*.25))&&hostMoveZombies>=1,{movedBots:hostMoveBots,botRoster:botIds.length,movedHollowed:hostMoveZombies,movingFrames:h.movingFrames});
  const clientsRegular=clientDelivery.every(c=>c.snapshots>100&&c.snapshotGapMs.p95<=50&&c.snapshotGapMs.p99<=80&&c.snapshotGapMs.max<=150);
  check(`all ${protocolClientCount} protocol clients receive regular snapshots without large gaps`,clientsRegular,{clientCount:protocolClientCount,clients:clientDelivery});
  check('bot tactical searches never received invalid positions',finalStatus.tactics?.invalidQueries===0&&finalStatus.tactics?.missingColumns===0,finalStatus.tactics);
  check('bot perception never accepted an actor with an invalid position',(finalStatus.bot?.invalidTargets||0)===0,{invalidTargets:finalStatus.bot?.invalidTargets||0});
  check('Outbreak spawn searches and spawn bursts stay within their per-tick work limits',finalStatus.outbreakSpawn?.randomOffersMax<=24&&finalStatus.outbreakSpawn?.losRaysMax<=24&&finalStatus.outbreakSpawn?.maxSpawnedPerTick<=1,finalStatus.outbreakSpawn);
} catch (e) {
  result.errors.push(String(e.stack||e));
  if(e&&e.code==='SIGHTLINE_LOOPBACK_BLOCKED'){
    result.status='BLOCKED';
    result.blocker={code:'ISOLATED_LOOPBACK_DENIED',reason:e.message,osError:lastStatusError};
  }else result.status='FAIL';
}
finally {
  for (const c of clients) try { c.ws.close(); } catch {}
  if(hostProfiler&&profilerStarted){try{const profile=await hostProfiler.stop();await writeFile(cpuProfilePath,JSON.stringify(profile));const info=await stat(cpuProfilePath);result.hostCpuProfile={binding:'127.0.0.1',stopped:true,nodeCount:profile?.nodes?.length||0,sampleCount:profile?.samples?.length||0,bytes:info.size,path:cpuProfilePath,warning:'V8 sampling profile adds small observer overhead.'};}catch(e){result.hostCpuProfile={binding:'127.0.0.1',stopped:false,error:String(e.message||e)};hostProfiler.close();}}
  else if(hostProfiler)hostProfiler.close();
  if (server) { server.kill('SIGTERM'); await delay(100); if (server.exitCode===null) server.kill('SIGKILL'); }
  result.pass=!result.errors.length&&result.checks.every(x=>x.pass);if(result.status==='RUNNING')result.status=result.pass?'PASS':'FAIL';result.durationMs=Math.round(performance.now()-t0);
  await mkdir(resolve(out,'..'),{recursive:true}); await writeFile(out,JSON.stringify(result,null,2)); const displayRuntime=result.runtime&&{...result.runtime,clientDelivery:result.runtime.clientDelivery?.map(({snapshotGapTraceMs,snapshotPayloadTrace,...c})=>c)};console.log(JSON.stringify({pass:result.pass,checks:result.checks.length,failed:result.checks.filter(x=>!x.pass).map(x=>x.name),errors:result.errors,runtime:displayRuntime,out},null,2));
}
if(!result.pass)process.exitCode=1;
