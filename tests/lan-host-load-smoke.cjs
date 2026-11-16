'use strict';
// Real loopback sockets and server CPU timings. Not Android or rendered gameplay evidence.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks'),{LocalLanHost}=require('../tools/local-lan-host.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f){for(let i=0;i<600;i++){if(f())return;await delay(30);}throw Error('Live host event timeout');}
(async()=>{const manager=new LocalLanHost({addressProvider:()=> '127.0.0.1',allowLoopbackForTests:true}),peers=[];let timer;
try{const {protocolHello,observeProtocolV2,sendProtocolV2}=await import('./lib/mp-protocol-v2-client.mjs');await manager.start();for(let i=0;i<4;i++){const p={ws:new WebSocket('ws://127.0.0.1:8080/ws'),events:[]};peers.push(p);p.ws.onmessage=e=>{const m=JSON.parse(e.data);observeProtocolV2(p,m);p.events.push(m);if(m.t==='sp')p.spawn=m;if(m.t==='ping')p.ws.send(JSON.stringify({t:'pong',s:m.s}));};await new Promise((r,j)=>{p.ws.onopen=r;p.ws.onerror=j;});p.ws.send(JSON.stringify(protocolHello('LoadPeer'+i)));await until(()=>p.session);}
sendProtocolV2(peers[0],{t:'cfg',mode:'deathmatch'});await until(()=>peers[0].events.some(m=>m.t==='lobby'&&m.mode==='deathmatch'));sendProtocolV2(peers[0],{t:'start'});await until(()=>peers.every(p=>p.spawn));await until(()=>peers[0].events.some(m=>m.t==='ph'&&m.ph==='live'));
const get=async()=>await(await fetch('http://127.0.0.1:8080/status')).json(),before=await get(),start=performance.now();let step=0;
timer=setInterval(()=>{step++;for(const p of peers){const q=p.spawn;sendProtocolV2(p,{t:'in',x:q.x+Math.sin(step*.1)*.04,y:q.y,z:q.z,yaw:q.yaw,pitch:0,cr:0,pr:0});if(step%10===0)sendProtocolV2(p,{t:'shot',w:q.cur,d:[[0,0,-1]]});}},50);
await delay(4000);clearInterval(timer);timer=null;const after=await get(),wall=performance.now()-start,cpuMs=(after.cpu.user+after.cpu.system-before.cpu.user-before.cpu.system)/1000;
assert.equal(after.players,4);assert(after.stats.shots>before.stats.shots);assert(peers.every(p=>p.events.filter(m=>m.t==='s').length>1));
const result={runtime:'Windows Node, four programmatic loopback clients; NOT Android or rendered acceptance',players:4,bots:0,sampleWallMs:+wall.toFixed(2),hostCpuMs:+cpuMs.toFixed(2),hostCpuPercentOfOneCore:+(cpuMs/wall*100).toFixed(2),tickP95Ms:after.liveTiming.tickP95,tickP99Ms:after.liveTiming.tickP99,worstTickMs:after.liveTiming.tickMax,tickGapP95Ms:after.liveTiming.gapP95,tickGapP99Ms:after.liveTiming.gapP99,worstTickGapMs:after.liveTiming.gapMax,tickSamples:after.liveTiming.samples,rssBytes:after.memory.rss,acceptedShots:after.stats.shots-before.stats.shots,snapshots:peers.map(p=>p.events.filter(m=>m.t==='s').length),pass:true};
const out=path.resolve(process.argv[2]||'AndroidProject/app/build/verification/host-load.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{if(timer)clearInterval(timer);for(const p of peers)p.ws.close();await manager.stop();}})().catch(e=>{console.error(e);process.exitCode=1;});
