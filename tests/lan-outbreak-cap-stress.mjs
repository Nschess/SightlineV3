#!/usr/bin/env node
// Loopback-only authoritative LAN-server stress probe. Clients are real
// WebSocket protocol peers but do not render the game or emulate a device.
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { createConnection } from 'node:net';
import { performance } from 'node:perf_hooks';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { observeProtocolV2, protocolHello, sendProtocolV2 } from './lib/mp-protocol-v2-client.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../AndroidProject/app/src/main/assets/phone-host');
const maxPeers = 12;
const holdMs = 10000;
const delay = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, timeout = 20000) => { const end=Date.now()+timeout; while(Date.now()<end){if(await fn())return true;await delay(50);}return false; };
async function freePort(){return await new Promise((ok,bad)=>{const s=createServer();s.once('error',bad);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?bad(e):ok(p));});});}
async function httpJson(port, pathname){return await new Promise((ok,bad)=>{const q=request({host:'127.0.0.1',port,path:pathname},r=>{let b='';r.on('data',x=>b+=x);r.on('end',()=>{try{ok(JSON.parse(b));}catch(e){bad(e);}});});q.once('error',bad);q.end();});}
async function openClient(port,name){return await new Promise((ok,bad)=>{const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),peer={name,ws,events:[],closed:false,session:'',actionSeq:0,ep:null};const timer=setTimeout(()=>bad(new Error('client handshake timeout: '+name)),6000);ws.addEventListener('open',()=>{clearTimeout(timer);ws.send(JSON.stringify(protocolHello(name)));});ws.addEventListener('error',()=>{clearTimeout(timer);bad(new Error('websocket error: '+name));});ws.addEventListener('close',()=>{peer.closed=true;});ws.addEventListener('message',e=>{let m;try{m=JSON.parse(e.data);}catch{return;}observeProtocolV2(peer,m);peer.events.push(m);if(m.t==='ping')ws.send(JSON.stringify({t:'pong',s:m.s}));if(m.t==='welcome')ok(peer);});});}

const port=await freePort();
const child=spawn(process.execPath,['server.js','--transport','dev','--bind','127.0.0.1','--port',String(port),'--max','32','--total','32','--bots','0'],{cwd:root,stdio:['ignore','pipe','pipe']});
let logs=''; child.stdout.on('data',d=>logs+=String(d)); child.stderr.on('data',d=>logs+=String(d));
const peers=[]; const result={runtime:'isolated Node host bound only to 127.0.0.1',mode:'Outbreak, infinite-wave-equivalent swarm saturation',clients:maxPeers,holdMs,checks:[],error:null};
function check(name,pass,data={}){result.checks.push({name,pass:!!pass,...data});if(!pass)throw new Error('failed '+name);}
try{
  check('host server becomes ready',await until(async()=>{try{const s=await httpJson(port,'/status');return s.ok===true;}catch{return false;}}),{bind:'127.0.0.1'});
  for(let i=0;i<maxPeers;i++)peers.push(await openClient(port,'StressPeer'+i));
  check('12 WebSocket peers accepted',await until(()=>peers.every(p=>p.events.some(e=>e.t==='welcome'))),{peers:peers.length});
  sendProtocolV2(peers[0],{t:'cfg',mode:'outbreak',bots:{mode:'add',coop:0}});
  check('host sets authoritative Outbreak mode',await until(async()=>{const s=await httpJson(port,'/status');return s.mode==='outbreak';}));
  sendProtocolV2(peers[0],{t:'start'});
  check('Outbreak round begins',await until(async()=>{const s=await httpJson(port,'/status');return s.phase==='buy';}));
  check('live wave begins',await until(async()=>{const s=await httpJson(port,'/status');return s.phase==='live';},20000));
  check('server reaches the configured 56-zombie cap',await until(async()=>{const s=await httpJson(port,'/status');result.maxObservedZombies=Math.max(result.maxObservedZombies||0,s.zombies||0);return s.zombies===s.zombieCap&&s.zombieCap===56;},15000),{cap:56});
  const before=await httpJson(port,'/status'); const snapCounts=peers.map(p=>p.events.filter(e=>e.t==='s').length); const start=performance.now();
  await delay(holdMs);
  const after=await httpJson(port,'/status'); const elapsed=(performance.now()-start)/1000;
  const snapshotDeltas=peers.map((p,i)=>p.events.filter(e=>e.t==='s').length-snapCounts[i]);
  const observedZ=peers.flatMap(p=>p.events.filter(e=>e.t==='s'&&Array.isArray(e.z)).map(e=>e.z.length));
  const cpuUs=(after.cpu.user-before.cpu.user)+(after.cpu.system-before.cpu.system);
  const resultStats={zombies:after.zombies,zombieCap:after.zombieCap,phase:after.phase,mode:after.mode,
    serverTickP95Ms:after.stats.tickP95,serverTickP99Ms:after.stats.tickP99,serverTickMaxMs:after.stats.tickMax,slowServerTicks:after.stats.slow,
    slowServerTicksDuringHold:after.stats.slow-before.stats.slow,
    serverSnapshotBytesPerSecond:Math.round((after.stats.bytes-before.stats.bytes)/elapsed),serverSnapshotsPerSecond:Math.round((after.stats.snaps-before.stats.snaps)/elapsed),
    maxClientSnapshotsPerSecond:Math.round(Math.max(...snapshotDeltas)/elapsed),meanClientSnapshotsPerSecond:+(snapshotDeltas.reduce((a,b)=>a+b,0)/snapshotDeltas.length/elapsed).toFixed(1),
    maximumZombieCountInClientSnapshot:observedZ.length?Math.max(...observedZ):0,serverCpuPercentOfOneCore:+(cpuUs/1000/elapsed/10).toFixed(1),
    heapUsedBytes:after.memory.heapUsed,skippedSnapshots:after.stats.skipped,intervalSeconds:+elapsed.toFixed(2)};
  result.measurements=resultStats;
  check('all peers receive zombie-state snapshots',observedZ.length>0&&resultStats.maximumZombieCountInClientSnapshot===56,{snapshotSamples:observedZ.length});
  check('server ticks stay below half of 25 ms budget at p95',resultStats.serverTickP95Ms<12.5,{tickP95Ms:resultStats.serverTickP95Ms,budgetMs:25});
  check('no snapshot backpressure drops under this loopback load',resultStats.skippedSnapshots===0,{skipped:resultStats.skippedSnapshots});
  check('all clients remain connected',peers.every(p=>!p.closed),{connected:peers.filter(p=>!p.closed).length});
}catch(e){result.error=String(e.stack||e);}finally{
  for(const p of peers){try{p.ws.close();}catch{}}
  child.kill('SIGTERM'); await delay(150);
  if(child.exitCode===null)child.kill('SIGKILL');
  result.serverLog=logs.slice(-1200); result.pass=!result.error&&result.checks.every(c=>c.pass);
  const out=resolve(process.argv[2]||'acceptance/lan-outbreak-cap-stress.json');
  const fs=await import('node:fs/promises');await fs.mkdir(dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}
if(!result.pass)process.exitCode=1;
