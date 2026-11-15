#!/usr/bin/env node
// Loopback-only protocol acceptance for the actual host server. This is not a
// physical Wi-Fi/LAN test and never binds to a non-loopback interface.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { observeProtocolV2, protocolHello, sendProtocolV2 } from './lib/mp-protocol-v2-client.mjs';

const root = resolve(process.argv[2] || './AndroidProject/app/src/main/assets/phone-host');
const output = resolve(process.argv[3] || './evidence/phase19/infection-loopback-protocol.json');
const botCount = Math.max(2,Math.min(64,Math.trunc(Number(process.argv[4])||64)));
const tickMs=Number(process.env.SIGHTLINE_HOST_TICK_MS||20);
if(!Number.isFinite(tickMs)||tickMs<10||tickMs>50)throw new Error('SIGHTLINE_HOST_TICK_MS must be between 10 and 50 ms');
const teamBotCounts=[Math.ceil(botCount/2),Math.floor(botCount/2)];
const diagnosticsEnabled=process.env.SIGHTLINE_DIAGNOSTICS!=='0';
const pause = ms => new Promise(r => setTimeout(r, ms));
const port = await new Promise((ok, fail) => {
  const probe = createServer(); probe.once('error', fail);
  probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => ok(p)); });
});
const result = { bind:'127.0.0.1', externalLanTest:false, tickMs, checks:[], errors:[], snapshots:{gapsMs:[]} };
let child, ws, readinessProbeError=null;const log=[];
function check(name, condition, detail) { result.checks.push({name,pass:!!condition,...(detail===undefined?{}:{detail})}); if(!condition) throw Error('FAIL: '+name); }
async function status() {
  return new Promise((ok, fail) => {
    const q=request({host:'127.0.0.1',port,path:'/status'},r=>{let s='';r.on('data',c=>s+=c);r.on('end',()=>{try{ok(Object.assign(JSON.parse(s),{_httpStatus:r.statusCode}));}catch(e){fail(e);}});});
    q.once('error',fail);q.end();
  });
}
async function until(fn, timeout=8000, interval=50) {
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=await fn();if(value)return value;await pause(interval);}
  return null;
}
try {
  check('Node WebSocket client is available', typeof WebSocket==='function');
  child=spawn(process.execPath,['server.js','--transport','dev','--bind','127.0.0.1','--port',String(port),'--max','2','--total','96','--bots','0','--tick-ms',String(tickMs)],{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,SIGHTLINE_DIAGNOSTICS:diagnosticsEnabled?'1':'0'}});
  child.stdout.on('data',d=>log.push(String(d)));child.stderr.on('data',d=>log.push(String(d)));
  const ready=await until(async()=>{if(child.exitCode!==null)return false;try{const s=await status();return s._httpStatus===200&&s.ok?s:false;}catch(e){readinessProbeError={code:e&&e.code||null,message:String(e&&e.message||e)};return false;}});
  result.readinessProbeError=readinessProbeError;
  if(!ready&&child.exitCode===null&&readinessProbeError&&['EACCES','EPERM'].includes(readinessProbeError.code)){
    result.blockedReason='The host process started, but this isolated runtime denied its loopback status probe. This is an environment/network-permission block, not a gameplay failure.';
    result.errors.push('BLOCKED: '+readinessProbeError.code+' while probing 127.0.0.1:'+port);
    const blocked=new Error(result.blockedReason);blocked.reported=true;throw blocked;
  }
  check('Host process starts on the isolated loopback port',!!ready,ready||{exitCode:child.exitCode});
  check('Host reports the requested simulation tick',Number(ready.snapshot?.tickMs)===tickMs,{requestedTickMs:tickMs,reportedTickMs:ready.snapshot?.tickMs,snapshotHz:ready.snapshot?.hz});
  ws=new WebSocket('ws://127.0.0.1:'+port+'/ws');
  const events=[],arrivals=[],peer={ws,session:'',actionSeq:0,ep:null};
  ws.addEventListener('message',e=>{try{const m=JSON.parse(e.data);observeProtocolV2(peer,m);events.push(m);if(m.t==='s')arrivals.push(performance.now());if(m.t==='ping')ws.send(JSON.stringify({t:'pong',s:m.s}));}catch{}});
  await new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(Error('host WebSocket timeout')),5000);ws.addEventListener('open',()=>{clearTimeout(timer);ws.send(JSON.stringify(protocolHello('InfectionLoopbackQA')));ok();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);fail(Error('host WebSocket error'));},{once:true});});
  check('Host receives authoritative lobby handshake',await until(()=>events.some(e=>e.t==='welcome')&&events.some(e=>e.t==='lobby'))===true);
  sendProtocolV2(peer,{t:'cfg',mode:'infection'});
  sendProtocolV2(peer,{t:'cfg',bots:{mode:'add',coop:botCount}});
  const lobby=await until(()=>{const x=events.filter(e=>e.t==='lobby').at(-1);return x&&x.players&&x.players.filter(p=>p.bot).length===botCount?x:null;},10000);
  check('Lobby applies the selected bot roster',!!lobby, lobby&&{bots:lobby.players.filter(p=>p.bot).length,teams:[0,1].map(t=>lobby.players.filter(p=>p.bot&&p.team===t).length)});
  check('Infection bot roster preserves Blue/Red visual identities',!!lobby&&[0,1].every(t=>lobby.players.filter(p=>p.bot&&p.team===t).length===teamBotCounts[t]));
  check('No selected bots start infected',!!lobby&&lobby.players.filter(p=>p.bot).every(p=>!p.infected));
  sendProtocolV2(peer,{t:'start'});
  const live=await until(async()=>{const s=await status();return s.phase==='live'?s:null;},20000);
  check('Match reaches live phase',!!live,live&&{phase:live.phase,mode:live.mode,bots:live.bots});
  check('10-second incubation begins with zero infected',!!live&&live.mode==='infection'&&live.infection&&!live.infection.started&&live.infection.infected===0&&live.infection.chooseIn>8500,live&&live.infection);
  const runBefore=await status(),snapshotBefore=events.slice().reverse().find(e=>e.t==='s'),runStarted=performance.now();
  await pause(5000);
  const mid=await status();
  check('Blue and Red remain companions through incubation',mid.mode==='infection'&&mid.infection&&!mid.infection.started&&mid.infection.infected===0&&mid.bots===botCount,mid.infection);
  const converted=await until(async()=>{const s=await status();return s.infection&&s.infection.started&&s.infection.infected===8?s:null;},10000);
  check('Eight Patient Zero are selected from the 64-bot roster after the countdown',!!converted,converted&&converted.infection);
  const final=await status();
  // Save server-side diagnostics before cadence assertions so a stress failure
  // still contains the evidence needed to find its cause.
  result.server={mode:final.mode,phase:final.phase,players:final.players,bots:final.bots,botConfig:final.botConfig,snapshot:final.snapshot,
    tickMs:{p50:final.stats.tickP50,p95:final.stats.tickP95,p99:final.stats.tickP99,max:final.stats.tickMax},
    tickGapMs:{p95:final.stats.gapP95,p99:final.stats.gapP99,max:final.stats.gapMax},slowTicks:final.stats.slow,tickErrors:final.stats.tickErrors,backlogSkipped:final.stats.backlogSkipped,bytesSent:final.stats.bytes,tactics:final.tactics,
    liveTiming:final.liveTiming,liveComponentMax:final.liveComponentMax,eventLoop:final.eventLoop,slowGaps:final.slowGaps,
    botThink:{calls:0,callsPerSecond:0,expectedPerSecond:botCount*1000/(final.botWork?.thinkIntervalMs||50),intervalMs:final.botWork?.thinkIntervalMs||50},botStats:final.bot,movedBots:0,
    zombies:final.zombies,zombiePaths:final.zombiePaths,pathfinding:{calls:final.bot.paths,spentMs:final.bot.pathMs,maxMs:final.bot.pathMaxMs,overBudget:final.bot.pathOverBudget,failures:final.bot.pathFail}};
  const snapshotAfter=events.slice().reverse().find(e=>e.t==='s'),botIds=new Set((lobby.players||[]).filter(p=>p.bot).map(p=>p.id));
  const beforeById=new Map((snapshotBefore?.a||[]).map(p=>[p[0],p])),afterById=new Map((snapshotAfter?.a||[]).map(p=>[p[0],p]));
  const movedBots=[...botIds].filter(id=>{const a=beforeById.get(id),b=afterById.get(id);return a&&b&&Math.hypot(b[1]-a[1],b[3]-a[3])>.15;});
  const runElapsed=Math.max(.001,(performance.now()-runStarted)/1000),thinkCalls=Math.max(0,(final.bot?.thinks||0)-(runBefore.bot?.thinks||0));
  result.server.botThink={calls:thinkCalls,callsPerSecond:Math.round(thinkCalls/runElapsed),expectedPerSecond:botCount*1000/(final.botWork?.thinkIntervalMs||50),intervalMs:final.botWork?.thinkIntervalMs||50};
  result.server.movedBots=movedBots.length;
  const expectedEntities=1+botCount;
  const expectedEveryTicks=expectedEntities>=80?2:1;
  const expectedHz=Math.round(1000/(tickMs*expectedEveryTicks));
  check('Snapshot pacing matches the configured host tick and actor-count budget',final.snapshot&&final.snapshot.entities===expectedEntities&&final.snapshot.everyTicks===expectedEveryTicks&&final.snapshot.hz===expectedHz,{expectedEntities,expectedEveryTicks,expectedHz,actual:final.snapshot});
  await pause(1800);
  const gaps=arrivals.slice(1).map((t,i)=>Math.round((t-arrivals[i])*10)/10);
  result.snapshots={count:arrivals.length,meanGapMs:gaps.length?Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length*10)/10:null,p95GapMs:gaps.length?gaps.slice().sort((a,b)=>a-b)[Math.floor(gaps.length*.95)]:null,maxGapMs:gaps.length?Math.max(...gaps):null,gapsMs:gaps.slice(-100)};
  const thinkEveryMs=Math.max(50,Number(final.botWork?.thinkIntervalMs)||50);
  const thinkRate=thinkCalls/runElapsed,expectedThinkRate=botCount*1000/thinkEveryMs;
  check('LAN bot AI holds its host-budgeted decision cadence',thinkRate>=expectedThinkRate*.85&&thinkRate<=expectedThinkRate*1.25,{calls:thinkCalls,callsPerSecond:Math.round(thinkRate),expectedPerSecond:expectedThinkRate,thinkIntervalMs:thinkEveryMs});
  result.server.botThink={calls:thinkCalls,callsPerSecond:Math.round(thinkRate),expectedPerSecond:expectedThinkRate,intervalMs:thinkEveryMs};
  check('No authoritative simulation tick errors occurred',final.stats.tickErrors===0,{tickErrors:final.stats.tickErrors,serverLog:log.join('').slice(-1200)});
  check('Tactical position queries and navigation cells stayed valid',final.tactics?.invalidQueries===0&&final.tactics?.missingColumns===0,final.tactics);
  check('Bot perception never accepted an actor with an invalid position',(final.bot?.invalidTargets||0)===0,{invalidTargets:final.bot?.invalidTargets||0});
  check('Infection snapshots show the selected bots continuing to move',movedBots.length>=Math.min(8,botCount),{movedBots:movedBots.length,roster:botIds.size});
  check('Loopback client receives ongoing snapshots',arrivals.length>20,{snapshots:arrivals.length,...result.snapshots});
} catch(e) { if(!e.reported)result.errors.push(String(e.stack||e)); }
finally {
  try{if(ws)ws.close();}catch{}
  if(child){child.kill('SIGTERM');await pause(150);if(child.exitCode===null)child.kill('SIGKILL');}
  result.pass=!result.blockedReason&&!result.errors.length&&result.checks.every(c=>c.pass);
  result.overallStatus=result.blockedReason?'BLOCKED':result.pass?'PASS':'FAIL';
  result.serverLog=log.join('').slice(-1600);
  await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(result,null,2));
  console.log(JSON.stringify({pass:result.pass,overallStatus:result.overallStatus,blockedReason:result.blockedReason||null,readinessProbeError:result.readinessProbeError||null,checks:result.checks,errors:result.errors,server:result.server,snapshots:result.snapshots,out:output},null,2));
}
if(!result.pass)process.exitCode=1;
