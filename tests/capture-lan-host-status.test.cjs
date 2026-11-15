'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const {EXPECTED,row,makeReport,captureGate}=require('../tools/capture-lan-host-status.cjs');

test('LAN capture fingerprint pins the current phone-host page and source manifest',()=>{
  const host=path.join(__dirname,'..','AndroidProject','app','src','main','assets','phone-host');
  const hash=file=>crypto.createHash('sha256').update(readFileSync(path.join(host,file))).digest('hex');
  assert.equal(EXPECTED.bundle,hash('index.html'));
  assert.equal(EXPECTED.server,hash('SHA256SUMS'));
});

test('LAN capture retains server component, bot-work, event-loop and recent slow-tick diagnostics',()=>{
  const slowGaps=Array.from({length:6},(_,i)=>({at:i+1,tickMs:i+2,phase:'live'}));
  const slowThinks=[{at:7,botId:18,thinkMs:8.4,scanMs:0.4,waypointMs:0,pathMs:2.1,otherMs:5.9}];
  const sample=row({
    phase:'live',mode:'infection',bots:12,botsAlive:12,
    eventLoop:{enabled:true,delayMs:{p95:8,p99:24}},
    liveComponentMax:{modeMs:1.1,botsMs:3.2,snapshotMs:0.8,otherMs:0.3},
    botWork:{thinks:300,thinkMaxMs:1.4,batchMaxMs:4.2,slowThinks},slowGaps,
    stats:{snaps:1200,bytes:100000,skipped:0,tickErrors:0},
    bot:{thinks:300,paths:14,pathMs:12.5,pathMaxMs:2.1,thinkBudgetHitTicks:8,thinkBudgetDeferredBots:17,thinkCapDeferredBots:3,scanLosReused:29}
  },1000);

  assert.equal(sample.diagnosticsEnabled,true);
  assert.deepEqual(sample.componentMaxMs,{modeMs:1.1,botsMs:3.2,snapshotMs:0.8,otherMs:0.3});
  assert.deepEqual(sample.botWork,{thinks:300,thinkMaxMs:1.4,batchMaxMs:4.2,slowThinks});
  assert.deepEqual(sample.slowGaps,slowGaps.slice(-4));
  assert.equal(sample.eventLoopDelayP99Ms,24);
  assert.equal(sample.botPathMaxMs,2.1);
  assert.equal(sample.botPathTimeTotalMs,12.5);
  assert.equal(sample.botThinkBudgetHitTicks,8);
  assert.equal(sample.botThinkBudgetDeferredBots,17);
  assert.equal(sample.botThinkCapDeferredBots,3);
  assert.equal(sample.botScanLosReused,29);
});

test('LAN capture evaluates bot cadence against the interval the host actually schedules',()=>{
  const rows=[
    {elapsedMs:0,phase:'live',mode:'infection',botsAlive:64,botThinkCount:100,botThinkIntervalMs:100,cpuUserUs:0,cpuSystemUs:0},
    {elapsedMs:1000,phase:'live',mode:'infection',botsAlive:64,botThinkCount:740,botThinkIntervalMs:100,cpuUserUs:100000,cpuSystemUs:0}
  ];
  const report=makeReport({port:8080,durationSec:1,intervalMs:1000,status:{bundle:'b',server:'s'},rows,local:{bundle:'b',server:'s'}});
  assert.equal(report.expectedDecisionRatePerSecond,640);
  assert.equal(report.botDecisionRatePerSecond,640);
  assert.equal(report.botCadencePercent,100);
});

test('LAN bot cadence excludes buy and round-end phases instead of reporting a false low rate',()=>{
  const rows=[
    {elapsedMs:0,phase:'live',mode:'infection',botsAlive:4,botThinkCount:100,cpuUserUs:100000,cpuSystemUs:50000},
    {elapsedMs:1000,phase:'live',mode:'infection',botsAlive:4,botThinkCount:180,cpuUserUs:500000,cpuSystemUs:100000},
    {elapsedMs:2000,phase:'roundend',mode:'infection',botsAlive:4,botThinkCount:200,cpuUserUs:900000,cpuSystemUs:150000},
    {elapsedMs:3000,phase:'buy',mode:'infection',botsAlive:4,botThinkCount:200,cpuUserUs:1300000,cpuSystemUs:200000},
    {elapsedMs:4000,phase:'live',mode:'infection',botsAlive:4,botThinkCount:220,cpuUserUs:1800000,cpuSystemUs:300000},
    {elapsedMs:5000,phase:'live',mode:'infection',botsAlive:4,botThinkCount:300,cpuUserUs:2600000,cpuSystemUs:550000}
  ];
  const report=makeReport({port:8080,durationSec:5,intervalMs:1000,status:{bundle:'b',server:'s'},rows,local:{bundle:'b',server:'s'}});
  assert.equal(report.liveSeconds,2);
  assert.equal(report.liveIntervals,2);
  assert.equal(report.liveBotThinkCount,160);
  assert.equal(report.wholeCaptureBotDecisionRatePerSecond,40);
  assert.equal(report.botDecisionRatePerSecond,80);
  assert.equal(report.expectedDecisionRatePerSecond,80);
  assert.equal(report.botCadencePercent,100);
  assert.equal(report.serverCpu.oneCorePercent,60);
});

test('LAN capture reports scheduler/path deltas and excludes pre-capture rolling history from steady-state timing',()=>{
  const rows=[
    {elapsedMs:0,phase:'live',mode:'infection',botsAlive:64,botThinkCount:0,botThinkIntervalMs:110,serverTickMs:20,liveSamples:2400,tickP95Ms:95,tickP99Ms:300,tickGapP95Ms:150,tickGapP99Ms:400,botThinkBudgetHitTicks:1,botThinkBudgetDeferredBots:2,botThinkCapDeferredBots:0,botScanLosReused:10,botPathCount:3,botPathTimeTotalMs:500,botPathMaxProcessMs:500},
    {elapsedMs:47000,phase:'live',mode:'infection',botsAlive:64,botThinkCount:25000,botThinkIntervalMs:110,serverTickMs:20,liveSamples:2400,tickP95Ms:80,tickP99Ms:240,tickGapP95Ms:130,tickGapP99Ms:360,botThinkBudgetHitTicks:20,botThinkBudgetDeferredBots:35,botThinkCapDeferredBots:2,botScanLosReused:1000,botPathCount:500,botPathTimeTotalMs:750,botPathMaxProcessMs:500},
    {elapsedMs:48000,phase:'live',mode:'infection',botsAlive:64,botThinkCount:25500,botThinkIntervalMs:110,serverTickMs:20,liveSamples:2400,tickP95Ms:12,tickP99Ms:20,tickGapP95Ms:25,tickGapP99Ms:35,botThinkBudgetHitTicks:21,botThinkBudgetDeferredBots:36,botThinkCapDeferredBots:2,botScanLosReused:1005,botPathCount:510,botPathTimeTotalMs:751,botPathMaxProcessMs:500},
    {elapsedMs:49000,phase:'live',mode:'infection',botsAlive:64,botThinkCount:26000,botThinkIntervalMs:110,serverTickMs:20,liveSamples:2400,tickP95Ms:14,tickP99Ms:22,tickGapP95Ms:27,tickGapP99Ms:38,botThinkBudgetHitTicks:22,botThinkBudgetDeferredBots:38,botThinkCapDeferredBots:3,botScanLosReused:1010,botPathCount:520,botPathTimeTotalMs:753,botPathMaxProcessMs:500},
    {elapsedMs:50000,phase:'live',mode:'infection',botsAlive:64,botThinkCount:26500,botThinkIntervalMs:110,serverTickMs:20,liveSamples:2400,tickP95Ms:13,tickP99Ms:21,tickGapP95Ms:26,tickGapP99Ms:37,botThinkBudgetHitTicks:23,botThinkBudgetDeferredBots:39,botThinkCapDeferredBots:3,botScanLosReused:1016,botPathCount:530,botPathTimeTotalMs:754,botPathMaxProcessMs:500}
  ];
  const report=makeReport({port:8080,durationSec:50,intervalMs:1000,status:{bundle:'b',server:'s',snapshot:{tickMs:20}},rows,local:{bundle:'b',server:'s'}});
  assert.equal(report.schedulerDeferrals.budgetHitTicks,22);
  assert.equal(report.schedulerDeferrals.budgetDeferredBots,37);
  assert.equal(report.schedulerDeferrals.capDeferredBots,3);
  assert.equal(report.schedulerDeferrals.redundantSightRaysAvoided,1006);
  assert.deepEqual(report.pathfindingCapture,{calls:527,totalMs:254,averageMsPerSearch:0.482,processLifetimeMaxMs:500});
  assert.equal(report.timingWindow.historySeconds,48);
  assert.equal(report.timingWindow.steadyStateAvailable,true);
  assert.equal(report.timingWindow.steadyState.sampleCount,3);
  assert.equal(report.timingWindow.steadyState.tickWorkP99Ms.max,22);
});

test('LAN captures shorter than the rolling-stat warmup mark steady-state timing unavailable',()=>{
  const rows=[
    {elapsedMs:0,phase:'live',mode:'infection',botsAlive:4,botThinkCount:0,botThinkIntervalMs:50,serverTickMs:20,liveSamples:20,tickP95Ms:90,tickP99Ms:200,tickGapP95Ms:100,tickGapP99Ms:250},
    {elapsedMs:1000,phase:'live',mode:'infection',botsAlive:4,botThinkCount:80,botThinkIntervalMs:50,serverTickMs:20,liveSamples:50,tickP95Ms:60,tickP99Ms:180,tickGapP95Ms:80,tickGapP99Ms:220}
  ];
  const report=makeReport({port:8080,durationSec:1,intervalMs:1000,status:{bundle:'b',server:'s',snapshot:{tickMs:20}},rows,local:{bundle:'b',server:'s'}});
  assert.equal(report.timingWindow.steadyStateAvailable,false);
  assert.equal(report.timingWindow.steadyState,null);
});

test('LAN capture refuses lobby or zero-bot samples instead of reporting a false capture',()=>{
  assert.deepEqual(captureGate({phase:'lobby',mode:'versus',bots:0}),{
    ok:false,status:'NOT_REPRODUCED',reason:'The current match is not in live gameplay. Start the match, wait for the live phase, then capture again.',phase:'lobby',mode:'versus',bots:0
  });
  assert.deepEqual(captureGate({phase:'live',mode:'infection',bots:0}),{
    ok:false,status:'NOT_REPRODUCED',reason:'The live match has no bots. Select the bot load that reproduces the delay, then capture again.',phase:'live',mode:'infection',bots:0
  });
  assert.deepEqual(captureGate({phase:'live',mode:'infection',bots:12}),{ok:true,status:'READY',phase:'live',mode:'infection',bots:12});
});

test('host launcher detects an occupied 8080 before launch without stopping the existing process',()=>{
  const launcher=readFileSync(path.join(__dirname,'..','SIGHTLINE.bat'),'utf8');
  const preflight=launcher.indexOf('call :check_port 8080 "Sightline LAN host"');
  const launch=launcher.indexOf('node server.js --transport dev --port 8080');
  assert.ok(preflight>=0&&preflight<launch,'port check must run before the candidate host starts');
  assert.match(launcher,/set "CHECK_PORT=%~1"/);
  assert.match(launcher,/netstat -ano -p tcp \^\| findstr \/C:":%CHECK_PORT% " \^\| findstr \/I "LISTENING"/);
  assert.match(launcher,/Owning process PID %%P/);
  assert.match(launcher,/tasklist \/FI "PID eq %%P"/);
  assert.match(launcher,/No process was stopped/);
  assert.match(launcher,/call :check_port 8080 "Sightline HTTPS\/WSS host"/);
  assert.match(launcher,/call :check_port 8090 "Offline compatibility server"/);
  assert.doesNotMatch(launcher,/taskkill|Stop-Process/i);
});

test('START-HOST and SIGHTLINE open remain the primary LAN client workflow for this candidate',()=>{
  const root=path.join(__dirname,'..');
  const start=readFileSync(path.join(root,'START-HOST.bat'),'utf8');
  const launcher=readFileSync(path.join(root,'SIGHTLINE.bat'),'utf8');
  const server=readFileSync(path.join(root,'AndroidProject','app','src','main','assets','phone-host','server.js'),'utf8');
  const buildInfo=readFileSync(path.join(root,'tools','show-build-info.cjs'),'utf8');
  assert.match(start,/call "%~dp0SIGHTLINE\.bat" host/);
  assert.doesNotMatch(launcher,/START-HOST-64HZ-EXPERIMENTAL\.bat/, 'Help must not advertise the absent experimental launcher.');
  assert.match(launcher,/set "SERVER=%ROOT%AndroidProject\\app\\src\\main\\assets\\phone-host"/);
  assert.match(launcher,/node server\.js --transport dev --port 8080/);
  assert.match(launcher,/:open[\s\S]*?start "" "http:\/\/localhost:8080\/"/);
  assert.match(server,/HOST_BUNDLE_SHA256 = crypto\.createHash\('sha256'\)\.update\(fs\.readFileSync\(path\.join\(__dirname, 'index\.html'\)\)\)/);
  assert.match(server,/Build fingerprint \(served phone-host page\): '\s*\+\s*HOST_BUNDLE_SHA256/);
  assert.match(buildInfo,/lanHost:\s*lan\.state[\s\S]*?pageSha256:\s*lan\.body\?\.bundle/);
  assert.match(buildInfo,/lan\.body\?\.bundle !== local\.phoneHostPageSha256/);
  assert.match(buildInfo,/lan\.body\?\.server !== local\.phoneHostInventorySha256/);
});
