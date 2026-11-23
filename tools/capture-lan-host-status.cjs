'use strict';
// Read-only live host sampling for a user's LAN match. This connects only to
// 127.0.0.1 and refuses to collect data from a stale or different candidate.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');

const ROOT=path.resolve(__dirname,'..');
const HOST_DIR=path.join(ROOT,'AndroidProject','app','src','main','assets','phone-host');
const EXPECTED=Object.freeze({
  // Pinned to this candidate's phone-host assets and SHA256SUMS manifest.
  bundle:'1e1d05c898b2b4e4f9eeee52b1956e366fea22e649e9ede1032b51fe155d2e9c',
  server:'9de350c2acd1c367c5d5b62bd3ae28164c437e92267b24f80da21da9722faa9d'
});
const LIVE_SAMPLE_CAPACITY=2400;
function sha256(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function percentile(values,p){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?+a[Math.min(a.length-1,Math.floor((a.length-1)*p))].toFixed(2):null;}
function getStatus(port,timeoutMs=3000){return new Promise((resolve,reject)=>{
  const req=http.get({host:'127.0.0.1',port,path:'/status',timeout:timeoutMs,headers:{accept:'application/json'}},res=>{
    let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;if(body.length>1024*1024)req.destroy(new Error('status response exceeded 1 MiB'));});
    res.on('end',()=>{try{if(res.statusCode!==200)throw new Error('HTTP '+res.statusCode);resolve(JSON.parse(body));}catch(e){reject(e);}});
  });
  req.on('timeout',()=>req.destroy(new Error('status request timed out')));req.on('error',reject);
});}
function row(s,t){
  const live=s.liveTiming||{},st=s.stats||{},bot=s.bot||{},event=s.eventLoop||{},delay=event.delayMs,cpu=s.cpu||{};
  return {atUtc:new Date().toISOString(),elapsedMs:+t.toFixed(1),phase:s.phase,mode:s.mode,map:s.map,players:s.players,bots:s.bots,botsAlive:s.botsAlive,zombies:s.zombies,snapshotHz:s.snapshot?.hz,
    liveSamples:live.samples||0,tickP50Ms:live.tickP50,tickP95Ms:live.tickP95,tickP99Ms:live.tickP99,tickMaxMs:live.tickMax,tickGapP95Ms:live.gapP95,tickGapP99Ms:live.gapP99,tickGapMaxMs:live.gapMax,
    eventLoopDelayP95Ms:delay&&typeof delay==='object'?delay.p95:delay,eventLoopDelayP99Ms:delay&&typeof delay==='object'?delay.p99:null,
    diagnosticsEnabled:event.enabled===true,componentMaxMs:s.liveComponentMax?{...s.liveComponentMax}:null,
    botWork:s.botWork?{...s.botWork}:null,slowGaps:Array.isArray(s.slowGaps)?s.slowGaps.slice(-4):[],
    serverTickMs:s.snapshot?.tickMs,botThinkIntervalMs:s.botWork?.thinkIntervalMs||50,botThinkCount:bot.thinks||0,botPathCount:bot.paths||0,botPathTimeTotalMs:bot.pathMs||0,botPathMaxMs:bot.pathMaxMs||0,botPathMaxProcessMs:bot.pathMaxMs||0,botPathOverBudget:bot.pathOverBudget||0,botPathBudgetExhausted:bot.pathBudgetExhausted||0,botThinkBudgetHitTicks:bot.thinkBudgetHitTicks||0,botThinkBudgetDeferredBots:bot.thinkBudgetDeferredBots||0,botThinkCapDeferredBots:bot.thinkCapDeferredBots||0,botScanLosReused:bot.scanLosReused||0,botStuck:bot.stuck||0,
    snapshotCount:st.snaps||0,serverBytes:st.bytes||0,snapshotSkipped:st.skipped||0,snapshotBacklogSkipped:st.backlogSkipped||0,tickErrors:st.tickErrors||0,
    heapUsedBytes:s.memory?.heapUsed||0,cpuUserUs:Number(cpu.user)||0,cpuSystemUs:Number(cpu.system)||0,botFxBacklogDropped:s.botFx?.backlogDropped||0,
    clients:(s.clients||[]).map(c=>({id:c.id,team:c.team,alive:c.alive,rttMs:c.rttMs,rttAgeMs:c.rttAgeMs,receiveIdleMs:c.receiveIdleMs,outboundQueueBytes:c.outboundQueueBytes,
      snapshotFrames:c.snapshotFrames,snapshotBytes:c.snapshotBytes,snapshotSkipped:c.snapshotSkipped,snapshotBackpressure:c.snapshotBackpressure,snapshotQueueBytes:c.snapshotQueueBytes,snapshotQueuePeakBytes:c.snapshotQueuePeakBytes}))};
}
function makeReport({port,durationSec,intervalMs,status,rows,local}){
  const first=rows[0],last=rows.at(-1),elapsed=Math.max(1,(last?.elapsedMs||0)-(first?.elapsedMs||0));
  const countDelta=(field)=>Math.max(0,(last?.[field]||0)-(first?.[field]||0));
  // Bot AI intentionally pauses during buy/round-end phases. Compute its
  // cadence only from intervals whose two endpoints are live in the same
  // mode, otherwise a round transition falsely reports lag for time when no
  // decisions were due. Integrate alive-bot seconds to handle deaths cleanly.
  let liveSeconds=0,liveBotSeconds=0,liveThinkCount=0,expectedLiveThinkCount=0,liveIntervals=0;
  for(let i=1;i<rows.length;i++){
    const a=rows[i-1],b=rows[i],dt=((Number(b.elapsedMs)||0)-(Number(a.elapsedMs)||0))/1000;
    if(a.phase!=='live'||b.phase!=='live'||a.mode!==b.mode||!(dt>0)||!Number.isFinite(dt)||!Number.isFinite(a.botThinkCount)||!Number.isFinite(b.botThinkCount))continue;
    const decisions=Number(b.botThinkCount)-Number(a.botThinkCount);if(decisions<0)continue;
    const alive=Math.max(0,(Number(a.botsAlive)||0)+(Number(b.botsAlive)||0))*0.5,thinkIntervalMs=Math.max(50,(Number(a.botThinkIntervalMs)||Number(b.botThinkIntervalMs)||50));
    liveSeconds+=dt;liveBotSeconds+=alive*dt;liveThinkCount+=decisions;expectedLiveThinkCount+=alive*dt*1000/thinkIntervalMs;liveIntervals++;
  }
  const botThinkRate=liveSeconds>0?liveThinkCount/liveSeconds:0;
  const liveBotAverage=liveSeconds>0?liveBotSeconds/liveSeconds:0;
  const wholeCaptureThinkRate=elapsed>0?countDelta('botThinkCount')/(elapsed/1000):0;
  const tickMs=Math.max(1,Number(last?.serverTickMs)||Number(status.snapshot?.tickMs)||20);
  const rollingWindowMs=LIVE_SAMPLE_CAPACITY*tickMs;
  /* /status reports quantiles over the server's last 2,400 live ticks. The
     first samples can therefore contain up to 48 seconds from before capture.
     Only call the tail a steady-state window once that old history has rolled
     out; short captures are explicitly marked unavailable. */
  const steadyRows=rows.filter(r=>Number(r.elapsedMs)>=rollingWindowMs&&r.phase==='live'&&Number(r.liveSamples)>=LIVE_SAMPLE_CAPACITY);
  const steadyState=steadyRows.length>=3?{
    source:'live-timing rolling window after capture warmup',
    warmupSeconds:+(rollingWindowMs/1000).toFixed(1),
    sampleCount:steadyRows.length,
    elapsedStartMs:steadyRows[0].elapsedMs,
    elapsedEndMs:steadyRows.at(-1).elapsedMs,
    tickWorkP95Ms:{p95:percentile(steadyRows.map(r=>r.tickP95Ms),.95),max:Math.max(...steadyRows.map(r=>Number(r.tickP95Ms)||0))},
    tickWorkP99Ms:{p95:percentile(steadyRows.map(r=>r.tickP99Ms),.95),max:Math.max(...steadyRows.map(r=>Number(r.tickP99Ms)||0))},
    tickGapP95Ms:{p95:percentile(steadyRows.map(r=>r.tickGapP95Ms),.95),max:Math.max(...steadyRows.map(r=>Number(r.tickGapP95Ms)||0))},
    tickGapP99Ms:{p95:percentile(steadyRows.map(r=>r.tickGapP99Ms),.95),max:Math.max(...steadyRows.map(r=>Number(r.tickGapP99Ms)||0))}
  }:null;
  const deferralDiagnostics={
    budgetHitTicks:countDelta('botThinkBudgetHitTicks'),
    budgetDeferredBots:countDelta('botThinkBudgetDeferredBots'),
    capDeferredBots:countDelta('botThinkCapDeferredBots'),
    redundantSightRaysAvoided:countDelta('botScanLosReused')
  };
  const pathCallsDelta=countDelta('botPathCount'),pathTimeDeltaMs=countDelta('botPathTimeTotalMs');
  const cpuElapsedUs=elapsed*1000,cpuUserDelta=countDelta('cpuUserUs'),cpuSystemDelta=countDelta('cpuSystemUs');
  const gaps=rows.slice(1).map((r,i)=>r.elapsedMs-rows[i].elapsedMs);
  const clientsById=new Map();
  for(const sample of rows)for(const c of sample.clients||[]){let v=clientsById.get(c.id);if(!v){v={id:c.id,team:c.team,first:c,last:c,queuePeakBytes:0,receiveIdleMaxMs:0,rttLatestMs:null,rttLatestAgeMs:null,samples:0};clientsById.set(c.id,v);}v.last=c;v.queuePeakBytes=Math.max(v.queuePeakBytes,Number(c.snapshotQueuePeakBytes)||0,Number(c.outboundQueueBytes)||0);v.receiveIdleMaxMs=Math.max(v.receiveIdleMaxMs,Number(c.receiveIdleMs)||0);if(c.rttMs!=null){v.rttLatestMs=c.rttMs;v.rttLatestAgeMs=c.rttAgeMs;}v.samples++;}
  const clientDiagnostics=[...clientsById.values()].map(v=>({id:v.id,team:v.team,samples:v.samples,alive:v.last.alive,rttLatestMs:v.rttLatestMs,rttAgeMs:v.rttLatestAgeMs,maxReceiveIdleMs:+v.receiveIdleMaxMs.toFixed(1),outboundQueuePeakBytes:v.queuePeakBytes,
    snapshotFramesDelta:Math.max(0,(v.last.snapshotFrames||0)-(v.first.snapshotFrames||0)),snapshotBytesDelta:Math.max(0,(v.last.snapshotBytes||0)-(v.first.snapshotBytes||0)),snapshotSkippedDelta:Math.max(0,(v.last.snapshotSkipped||0)-(v.first.snapshotSkipped||0)),snapshotBackpressureDelta:Math.max(0,(v.last.snapshotBackpressure||0)-(v.first.snapshotBackpressure||0)),snapshotQueuePeakBytes:v.queuePeakBytes,
    snapshotKiBPerSecond:+((Math.max(0,(v.last.snapshotBytes||0)-(v.first.snapshotBytes||0))/(elapsed/1000))/1024).toFixed(2)}));
  return {test:'Sightline live LAN host status capture',createdAtUtc:new Date().toISOString(),bind:'127.0.0.1',port,durationRequestedSec:durationSec,intervalMs,expectedFingerprints:EXPECTED,localCandidateFingerprints:local,observedFingerprints:{bundle:status.bundle,server:status.server},buildMatch:status.bundle===EXPECTED.bundle&&status.server===EXPECTED.server,
    phase:status.phase,mode:status.mode,map:status.map,serverTickMs:status.snapshot?.tickMs,botsRequested:Number(status.bots)||0,sampleCount:rows.length,samplingGapMs:{p95:percentile(gaps,.95),max:gaps.length?+Math.max(...gaps).toFixed(2):null},
    liveSeconds:+liveSeconds.toFixed(2),liveIntervals,liveBotThinkCount:liveThinkCount,wholeCaptureBotDecisionRatePerSecond:+wholeCaptureThinkRate.toFixed(2),
    botDecisionRatePerSecond:+botThinkRate.toFixed(2),averageAliveBots:+liveBotAverage.toFixed(2),expectedDecisionRatePerSecond:+(liveSeconds>0?expectedLiveThinkCount/liveSeconds:0).toFixed(2),botCadencePercent:expectedLiveThinkCount?+(100*liveThinkCount/expectedLiveThinkCount).toFixed(1):null,
    schedulerDeferrals: deferralDiagnostics,
    pathfindingCapture:{calls:pathCallsDelta,totalMs:+pathTimeDeltaMs.toFixed(2),averageMsPerSearch:pathCallsDelta?+(pathTimeDeltaMs/pathCallsDelta).toFixed(3):0,processLifetimeMaxMs:last?.botPathMaxProcessMs||0},
    serverCpu:{userDeltaUs:cpuUserDelta,systemDeltaUs:cpuSystemDelta,oneCorePercent:cpuElapsedUs>0?+((cpuUserDelta+cpuSystemDelta)/cpuElapsedUs*100).toFixed(1):null},
    clientDiagnostics,
    serverApplicationKiBPerSecond:+(countDelta('serverBytes')/(elapsed/1000)/1024).toFixed(2),snapshotCountDelta:countDelta('snapshotCount'),snapshotSkippedDelta:countDelta('snapshotSkipped'),snapshotBacklogSkippedDelta:countDelta('snapshotBacklogSkipped'),tickErrorDelta:countDelta('tickErrors'),
    timingWindow:{sampleCapacity:LIVE_SAMPLE_CAPACITY,tickMs,historySeconds:+(rollingWindowMs/1000).toFixed(1),steadyStateAvailable:!!steadyState,steadyState},
    summary:{tickWorkP95Ms:{p95:percentile(rows.map(r=>r.tickP95Ms),.95),max:rows.length?Math.max(...rows.map(r=>Number(r.tickP95Ms)||0)):null},tickWorkP99Ms:{p95:percentile(rows.map(r=>r.tickP99Ms),.95),max:rows.length?Math.max(...rows.map(r=>Number(r.tickP99Ms)||0)):null},tickGapP95Ms:{p95:percentile(rows.map(r=>r.tickGapP95Ms),.95),max:rows.length?Math.max(...rows.map(r=>Number(r.tickGapP95Ms)||0)):null},tickGapP99Ms:{p95:percentile(rows.map(r=>r.tickGapP99Ms),.95),max:rows.length?Math.max(...rows.map(r=>Number(r.tickGapP99Ms)||0)):null},eventLoopDelayP95Ms:{p95:percentile(rows.map(r=>r.eventLoopDelayP95Ms),.95),max:rows.length?Math.max(...rows.map(r=>Number(r.eventLoopDelayP95Ms)||0)):null},botPathMaxProcessMs:rows.length?+Math.max(...rows.map(r=>Number(r.botPathMaxProcessMs)||0)).toFixed(2):null,heapUsedMaxBytes:rows.length?Math.max(...rows.map(r=>Number(r.heapUsedBytes)||0)):null},
    limitations:['Host-side sampler only; it does not measure remote client receive timestamps, browser frame timing, Wi-Fi airtime, or Android GPU performance.','Run only after the correct host reports phase=live and the intended bot count.','A locally healthy host does not prove remote bot rendering is smooth.'],samples:rows};
}
function captureGate(status){
  const bots=Math.max(0,Number(status&&status.bots)||0);
  if(!status||status.phase!=='live')return {ok:false,status:'NOT_REPRODUCED',reason:'The current match is not in live gameplay. Start the match, wait for the live phase, then capture again.',phase:status&&status.phase||'unknown',mode:status&&status.mode||null,bots};
  if(bots<1)return {ok:false,status:'NOT_REPRODUCED',reason:'The live match has no bots. Select the bot load that reproduces the delay, then capture again.',phase:status.phase,mode:status.mode||null,bots};
  return {ok:true,status:'READY',phase:status.phase,mode:status.mode||null,bots};
}
async function main(){
  const durationSec=Math.max(5,Math.min(600,Number(process.argv[2])||60));
  const intervalMs=Math.max(250,Math.min(10000,Number(process.argv[3])||1000));
  const port=Math.max(1,Math.min(65535,Number(process.argv[4])||8080));
  const outFile=path.resolve(process.argv[5]||path.join(ROOT,'acceptance','live-host-capture-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'));
  const local={bundle:sha256(path.join(HOST_DIR,'index.html')),server:sha256(path.join(HOST_DIR,'SHA256SUMS'))};
  if(local.bundle!==EXPECTED.bundle||local.server!==EXPECTED.server){
    console.error(JSON.stringify({status:'BLOCKED',reason:'This capture utility is pinned to the current verified candidate; local files have changed. Update and review its expected fingerprints before using it.',expected:EXPECTED,local},null,2));process.exitCode=2;return;
  }
  let initial;
  try{initial=await getStatus(port);}catch(e){console.error(JSON.stringify({status:'BLOCKED',reason:'Could not read the local Sightline host status. Start the candidate host, then retry.',url:'http://127.0.0.1:'+port+'/status',error:String(e.message||e)},null,2));process.exitCode=2;return;}
  if(initial.bundle!==EXPECTED.bundle||initial.server!==EXPECTED.server){
    console.error(JSON.stringify({status:'WRONG_BUILD',reason:'Refusing to capture a stale or different running host. Stop it with Ctrl+C and restart START-HOST.bat from this candidate.',expected:EXPECTED,observed:{bundle:initial.bundle,server:initial.server},phase:initial.phase},null,2));process.exitCode=3;return;
  }
  const gate=captureGate(initial);
  if(!gate.ok){
    const report={test:'Sightline live LAN host status capture',status:gate.status,createdAtUtc:new Date().toISOString(),bind:'127.0.0.1',port,durationRequestedSec:durationSec,intervalMs,expectedFingerprints:EXPECTED,localCandidateFingerprints:local,observedFingerprints:{bundle:initial.bundle,server:initial.server},buildMatch:true,...gate,sampleCount:0,samples:[],limitations:['No performance capture was run because the match was not actively reproducing bot gameplay.']};
    fs.mkdirSync(path.dirname(outFile),{recursive:true});fs.writeFileSync(outFile,JSON.stringify(report,null,2));
    console.log(JSON.stringify({status:gate.status,outFile,phase:gate.phase,mode:gate.mode,bots:gate.bots,reason:gate.reason},null,2));process.exitCode=4;return;
  }
  const started=performance.now(),rows=[row(initial,0)];let next=started+intervalMs;
  while(performance.now()-started<durationSec*1000){
    const wait=next-performance.now();if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
    try{rows.push(row(await getStatus(port),performance.now()-started));}catch(e){rows.push({atUtc:new Date().toISOString(),elapsedMs:+(performance.now()-started).toFixed(1),probeError:String(e.message||e)});}
    next+=intervalMs;if(next<performance.now()-intervalMs)next=performance.now()+intervalMs;
  }
  const report=makeReport({port,durationSec,intervalMs,status:initial,rows,local});
  fs.mkdirSync(path.dirname(outFile),{recursive:true});fs.writeFileSync(outFile,JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.buildMatch?'CAPTURED':'WRONG_BUILD',outFile,observedFingerprints:report.observedFingerprints,phase:report.phase,mode:report.mode,map:report.map,serverTickMs:report.serverTickMs,sampleCount:report.sampleCount,samplingGapMs:report.samplingGapMs,liveSeconds:report.liveSeconds,liveIntervals:report.liveIntervals,wholeCaptureBotDecisionRatePerSecond:report.wholeCaptureBotDecisionRatePerSecond,botDecisionRatePerSecond:report.botDecisionRatePerSecond,expectedDecisionRatePerSecond:report.expectedDecisionRatePerSecond,botCadencePercent:report.botCadencePercent,schedulerDeferrals:report.schedulerDeferrals,pathfindingCapture:report.pathfindingCapture,timingWindow:report.timingWindow,serverCpu:report.serverCpu,clientDiagnostics:report.clientDiagnostics,summary:report.summary,snapshotSkippedDelta:report.snapshotSkippedDelta,snapshotBacklogSkippedDelta:report.snapshotBacklogSkippedDelta,tickErrorDelta:report.tickErrorDelta,limitations:report.limitations},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
module.exports={EXPECTED,row,makeReport,captureGate};
