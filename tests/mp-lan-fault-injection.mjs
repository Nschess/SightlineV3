#!/usr/bin/env node
// Isolated TCP/WebSocket relay for repeatable latency, jitter, whole-snapshot
// loss, and reconnect checks. It binds both host and proxy to loopback only.
// This is protocol QA, not a Wi-Fi, browser-render, or Android-device test.
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import net from 'node:net';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { observeProtocolV2, protocolHello, sendProtocolV2 } from './lib/mp-protocol-v2-client.mjs';

const root=resolve(process.argv[2]||'./AndroidProject/app/src/main/assets/phone-host');
const out=resolve(process.argv[3]||'./acceptance/mp-lan-fault-injection.json');
const durationMs=Math.max(5000,Math.min(60000,Number(process.env.SIGHTLINE_FAULT_DURATION_MS)||15000));
const baseDelayMs=Math.max(0,Math.min(100,Number(process.env.SIGHTLINE_FAULT_LATENCY_MS)||15));
const jitterMs=Math.max(0,Math.min(60,Number(process.env.SIGHTLINE_FAULT_JITTER_MS)||12));
const dropEvery=Math.max(0,Math.min(10000,Math.trunc(Number(process.env.SIGHTLINE_FAULT_DROP_EVERY)||127)));
const jitterPattern=[0,0.82,0.14,0.55,1,0.27,0.68,0.08,0.94,0.39,0.73,0.2];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const hostPort=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>ok(p));});});
const proxyPort=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>ok(p));});});
const result={test:'Sightline isolated LAN fault-injection/reconnect',createdAtUtc:new Date().toISOString(),bind:'127.0.0.1',mode:'deathmatch',botCount:16,peerCount:2,simulationTickMs:20,snapshotHz:50,proxy:{oneWayBaseLatencyMs:baseDelayMs,deterministicJitterRangeMs:jitterMs,applicationSnapshotDropEvery:dropEvery,bind:'127.0.0.1'},limits:['Latency and jitter are injected at complete WebSocket-frame boundaries through an isolated loopback relay. Snapshot loss is intentional whole-message loss, not Wi-Fi packet loss.','No remote Wi-Fi, Chromium/WebGL frame-time, Android GPU, or physical device was tested.'],checks:[],errors:[]};
let child,proxy,client,anchor,serverOutput='';
function check(name,pass,details={}){result.checks.push({name,pass:!!pass,...details});if(!pass)throw new Error(name);}
async function http(path){return new Promise((ok,fail)=>{const q=request({host:'127.0.0.1',port:hostPort,path},r=>{let s='';r.on('data',x=>s+=x);r.on('end',()=>{try{ok(JSON.parse(s));}catch(e){fail(e);}});});q.once('error',fail);q.end();});}
function pctl(v,p){const a=v.filter(Number.isFinite).slice().sort((x,y)=>x-y);return a.length?+a[Math.min(a.length-1,Math.floor((a.length-1)*p))].toFixed(2):null;}
function gapsSummary(v){return{count:v.length,mean:v.length?+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(2):null,p50:pctl(v,.5),p95:pctl(v,.95),p99:pctl(v,.99),max:v.length?+Math.max(...v).toFixed(2):null};}
function createFaultRelay(){
  const stats={framesDelayed:0,snapshotsSeen:0,snapshotsDropped:0,bytesForwarded:0,connections:0,handshakeCount:0};
  const relay=net.createServer(clientSocket=>{
    stats.connections++;
    const upstream=net.connect(hostPort,'127.0.0.1');
    const states=[
      {src:clientSocket,dst:upstream,serverToClient:false,handshake:true,buffer:Buffer.alloc(0),seq:0,nextAt:0,queue:[],timer:null},
      {src:upstream,dst:clientSocket,serverToClient:true,handshake:true,buffer:Buffer.alloc(0),seq:0,nextAt:0,queue:[],timer:null}
    ];
    let dead=false;
    const stop=()=>{if(dead)return;dead=true;for(const s of states)if(s.timer)clearTimeout(s.timer);try{clientSocket.destroy();}catch{}try{upstream.destroy();}catch{}};
    clientSocket.on('error',stop);upstream.on('error',stop);clientSocket.on('close',stop);upstream.on('close',stop);
    function frameLength(buf){
      if(buf.length<2)return 0;let len=buf[1]&127,off=2;
      if(len===126){if(buf.length<4)return 0;len=buf.readUInt16BE(2);off=4;}
      else if(len===127){if(buf.length<10)return 0;if(buf.readUInt32BE(2)!==0)return -1;len=buf.readUInt32BE(6);off=10;}
      const masked=!!(buf[1]&128),total=off+(masked?4:0)+len;
      return total>2*1024*1024?-1:(buf.length>=total?total:0);
    }
    function sendFrame(state,frameBuf){
      const op=frameBuf[0]&15,masked=!!(frameBuf[1]&128);let len=frameBuf[1]&127,off=2;
      if(len===126){len=frameBuf.readUInt16BE(2);off=4;}else if(len===127){len=frameBuf.readUInt32BE(6);off=10;}
      const payloadOff=off+(masked?4:0),payload=frameBuf.subarray(payloadOff,payloadOff+len);
      let snapshot=false;
      if(state.serverToClient&&op===1&&payload.length>=7&&payload.toString('utf8',0,8).includes('"t":"s"')){
        snapshot=true;stats.snapshotsSeen++;
        if(dropEvery&&stats.snapshotsSeen%dropEvery===0){stats.snapshotsDropped++;return;}
      }
      state.seq++;
      const jitter=jitterMs*jitterPattern[(state.seq-1)%jitterPattern.length];
      const due=Math.max(performance.now()+baseDelayMs+jitter,state.nextAt);
      state.nextAt=due+0.05;state.queue.push({due,frame:frameBuf});
      if(!state.timer){const drain=()=>{state.timer=null;if(dead)return;const item=state.queue[0];if(!item)return;const wait=item.due-performance.now();if(wait>0){state.timer=setTimeout(drain,wait);return;}state.queue.shift();if(!state.dst.destroyed){state.dst.write(item.frame);stats.framesDelayed++;stats.bytesForwarded+=item.frame.length;}if(state.queue.length){state.timer=setTimeout(drain,0);}};state.timer=setTimeout(drain,Math.max(0,due-performance.now()));}
    }
    function frames(state,chunk){
      state.buffer=state.buffer.length?Buffer.concat([state.buffer,chunk]):chunk;
      for(;;){const n=frameLength(state.buffer);if(n===0)return;if(n<0)return stop();const f=state.buffer.subarray(0,n);state.buffer=state.buffer.subarray(n);sendFrame(state,f);}
    }
    function data(state,chunk){
      if(dead)return;
      if(state.handshake){
        state.buffer=state.buffer.length?Buffer.concat([state.buffer,chunk]):chunk;
        const end=state.buffer.indexOf('\r\n\r\n');if(end<0){if(state.buffer.length>16384)stop();return;}
        const cut=end+4,head=state.buffer.subarray(0,cut),rest=state.buffer.subarray(cut);stats.handshakeCount++;state.buffer=Buffer.alloc(0);state.handshake=false;state.dst.write(head);if(rest.length)frames(state,rest);return;
      }
      frames(state,chunk);
    }
    for(const state of states)state.src.on('data',chunk=>data(state,chunk));
  });
  return new Promise((ok,fail)=>{relay.once('error',fail);relay.listen(proxyPort,'127.0.0.1',()=>ok({server:relay,stats}));});
}
function connect(name){return new Promise((ok,fail)=>{const ws=new WebSocket(`ws://127.0.0.1:${proxyPort}/ws`),c={ws,name,session:'',actionSeq:0,ep:null,received:[],messages:[],open:false};const timeout=setTimeout(()=>fail(new Error(name+' WebSocket handshake timed out')),5000);ws.addEventListener('open',()=>{clearTimeout(timeout);c.open=true;ws.send(JSON.stringify(protocolHello(name)));ok(c);},{once:true});ws.addEventListener('message',e=>{let m;try{m=JSON.parse(String(e.data));}catch{return;}observeProtocolV2(c,m);if(m.t==='s')c.received.push({rx:performance.now(),seq:m.n,st:m.st,actors:m.a});else{c.messages.push(m);if(m.t==='ping')ws.send(JSON.stringify({t:'pong',s:m.s}));}});ws.addEventListener('error',()=>{clearTimeout(timeout);if(!c.open)fail(new Error(name+' WebSocket failed'));});});}
try{
  child=spawn(process.execPath,['server.js','--transport','dev','--bind','127.0.0.1','--port',String(hostPort),'--max','2','--total','96','--tick-ms','20','--snapshot-every','1','--bots','0'],{cwd:root,env:{...process.env,SIGHTLINE_DIAGNOSTICS:'0',SIGHTLINE_SNAPSHOT_DIAGNOSTICS:'1'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>serverOutput+=b);child.stderr.on('data',b=>serverOutput+=b);
  const startEnd=Date.now()+20000;let status;
  while(Date.now()<startEnd){try{status=await http('/status');break;}catch{await delay(50);}}
  if(!status)throw new Error('loopback host did not start: '+serverOutput.slice(-1200));
  result.fingerprints={bundle:status.bundle,server:status.server};
  const fault=await createFaultRelay();proxy=fault.server;result.proxyCounters=fault.stats;
  client=await connect('FaultBench');anchor=await connect('AnchorPeer');
  const welcomed=()=>client.messages.some(m=>m.t==='welcome');
  const welcomeEnd=Date.now()+5000;while(Date.now()<welcomeEnd&&!welcomed())await delay(20);
  check('client connects through the loopback fault relay and receives welcome',welcomed());
  sendProtocolV2(client,{t:'cfg',mode:'deathmatch',rounds:1,time:180,kills:200});
  sendProtocolV2(client,{t:'cfg',bots:{mode:'add',balance:false,t0:8,t1:8,coop:0,skill:'recruit'}});
  const lobbyEnd=Date.now()+5000;while(Date.now()<lobbyEnd){const s=await http('/status');if(s.bots===16)break;await delay(40);}
  const lobby=await http('/status');check('host accepts the full 16-bot roster through the delayed input path',lobby.bots===16,{bots:lobby.bots});
  sendProtocolV2(client,{t:'start'});
  const liveEnd=Date.now()+15000;while(Date.now()<liveEnd){status=await http('/status');if(status.phase==='live')break;await delay(50);}
  check('match starts with authoritative 20 ms tick and 50 Hz snapshots',status.phase==='live'&&status.snapshot.tickMs===20&&status.snapshot.hz===50,{phase:status.phase,snapshot:status.snapshot});
  while(status.phase==='live'&&client.received.length<20) {await delay(20);status=await http('/status');}
  const measureStart=performance.now(),firstCount=client.received.length;
  await delay(durationMs);
  status=await http('/status');
  const trace=client.received.slice(firstCount),receiveGaps=[],hostGaps=[],excess=[];
  for(let i=1;i<trace.length;i++){const r=trace[i].rx-trace[i-1].rx,h=trace[i].st-trace[i-1].st;receiveGaps.push(r);hostGaps.push(h);excess.push(r-h);}
  const seqGaps=[];for(let i=1;i<trace.length;i++)if(trace[i].seq>trace[i-1].seq+1)seqGaps.push({from:trace[i-1].seq,to:trace[i].seq,missed:trace[i].seq-trace[i-1].seq-1});
  const first=trace[0]?.actors,last=trace.at(-1)?.actors,positions=new Map((first||[]).map(a=>[a[0],a]));
  const movedBots=(last||[]).filter(a=>positions.has(a[0])&&Math.hypot(a[1]-positions.get(a[0])[1],a[3]-positions.get(a[0])[3])>.15).length;
  result.runtime={measurementSeconds:+((performance.now()-measureStart)/1000).toFixed(2),snapshotsReceived:trace.length,hostTickMs:status.snapshot.tickMs,hostSnapshotHz:status.snapshot.hz,hostSnapshotGapTelemetry:status.snapshotPipeline,snapshotReceiveGapMs:gapsSummary(receiveGaps),hostStampedGapMs:gapsSummary(hostGaps),receiveMinusHostGapMs:gapsSummary(excess),intentionalSequenceGapCount:seqGaps.length,intentionalMissedSequences:seqGaps.reduce((a,x)=>a+x.missed,0),sequenceGapSamples:seqGaps.slice(0,12),movedBots,memory:{rssBytes:status.memory.rss,heapUsedBytes:status.memory.heapUsed},host:{players:status.players,bots:status.bots,phase:status.phase,tickErrors:status.stats.tickErrors,snapshotSkipped:status.stats.skipped,snapshotBacklogSkipped:status.stats.backlogSkipped},proxyCounters:fault.stats};
  check('the relay produced deterministic whole-snapshot loss instead of corrupting the WebSocket/TCP stream',fault.stats.snapshotsDropped>=1&&seqGaps.length>=1,{dropped: fault.stats.snapshotsDropped,sequenceGaps:seqGaps.length});
  check('authoritative host keeps every configured bot and records no tick/backlog failures',status.phase==='live'&&status.bots===16&&status.stats.tickErrors===0&&status.stats.skipped===0&&status.stats.backlogSkipped===0,{phase:status.phase,bots:status.bots,tickErrors:status.stats.tickErrors,skipped:status.stats.skipped,backlogSkipped:status.stats.backlogSkipped});
  check('bots continue to move under latency, jitter, and intentional snapshot loss',movedBots>=6,{movedBots});
  client.ws.close();
  const goneEnd=Date.now()+5000;while(Date.now()<goneEnd&&(await http('/status')).players!==1)await delay(40);
  const afterDisconnect=await http('/status');check('host removes the dropped peer while the anchor keeps the live match running',afterDisconnect.players===1&&afterDisconnect.phase==='live',{players:afterDisconnect.players,phase:afterDisconnect.phase});
  client=await connect('ReconnectBench');
  const reconnectEnd=Date.now()+8000;while(Date.now()<reconnectEnd&&!client.messages.some(m=>m.t==='welcome'))await delay(30);
  const reconnected=await http('/status');
  check('a new peer can reconnect while the match remains live',client.messages.some(m=>m.t==='welcome')&&reconnected.phase==='live'&&reconnected.players===2,{welcomed:client.messages.some(m=>m.t==='welcome'),phase:reconnected.phase,players:reconnected.players});
  result.reconnect={welcome:client.messages.some(m=>m.t==='welcome'),phase:reconnected.phase,players:reconnected.players};
}catch(e){result.errors.push(String(e.stack||e));}
finally{
  try{client?.ws.close();}catch{}try{anchor?.ws.close();}catch{}
  try{proxy?.close();}catch{}
  if(child){child.kill('SIGTERM');await delay(100);if(child.exitCode===null)child.kill('SIGKILL');}
  result.pass=!result.errors.length&&result.checks.length>0&&result.checks.every(x=>x.pass);result.status=result.pass?'PASS':'FAIL';
  const sums=await readFile(resolve(root,'SHA256SUMS')).catch(()=>Buffer.alloc(0));result.fingerprints=result.fingerprints||{};result.fingerprints.phoneHostManifestSha256=createHash('sha256').update(sums).digest('hex');
  if(serverOutput)result.hostOutputTail=serverOutput.slice(-1600);
  await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,out},null,2));
}
if(!result.pass)process.exitCode=1;
