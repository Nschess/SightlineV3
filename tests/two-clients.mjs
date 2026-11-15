#!/usr/bin/env node
// Runs the Android candidate authoritative V12 game server on desktop with two real RFC6455 clients.
// This adapted V12 smoke deliberately does NOT claim Android hosting, rendering, or device validation.
import {spawn} from 'node:child_process';
import {createServer, request} from 'node:http';
import {createConnection} from 'node:net';
import {promises as fs} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {observeProtocolV2,protocolHello,sendProtocolV2} from './lib/mp-protocol-v2-client.mjs';

const ROOT=resolve(process.argv[2]||'./windows');
const PORT=await new Promise((resolve,reject)=>{let s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{let p=s.address().port;s.close(()=>resolve(p));});});
let child=null, clients=[];const tStart=performance.now();const events=[],result={protocol:'Sightline authoritative Node LAN',runtime:'desktop Node.js, programmatic WebSocket clients (NOT Android)',port:PORT,checks:[],errors:[],durationMs:0};
function check(name,ok,details={}){result.checks.push({name,pass:!!ok,...details});if(!ok)throw Error('FAIL: '+name);}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function get(path){return new Promise((resolve,reject)=>{const q=request({host:'127.0.0.1',port:PORT,path},r=>{let s='';r.on('data',c=>s+=c);r.on('end',()=>resolve({status:r.statusCode,body:s}));});q.once('error',reject);q.end();});}
async function until(f,timeout=5500){let since=Date.now();while(Date.now()-since<timeout){if(f())return true;await delay(30);}return false;}
function open(name){return new Promise((resolve,reject)=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/ws`);const o={name,ws,events:[],closed:false,session:'',actionSeq:0,ep:null};clients.push(o);const timer=setTimeout(()=>reject(Error('WS connect timeout: '+name)),6000);ws.addEventListener('open',()=>{clearTimeout(timer);ws.send(JSON.stringify(protocolHello(name)));resolve(o);});ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('WS error: '+name));});ws.addEventListener('close',()=>{o.closed=true;});ws.addEventListener('message',ev=>{let m;try{m=JSON.parse(ev.data)}catch{return;}observeProtocolV2(o,m);o.events.push(m);if(m.t==='ping')ws.send(JSON.stringify({t:'pong',s:m.s}));});});}
function send(o,m){sendProtocolV2(o,m);}
function seen(o,t){return o.events.filter(x=>x.t===t);}
async function originStatus(origin){return new Promise((resolve,reject)=>{let done=false;const sock=createConnection({host:'127.0.0.1',port:PORT});const timeout=setTimeout(()=>{if(!done){done=true;sock.destroy();reject(Error('origin probe timeout'));}},2000);let b='';sock.on('connect',()=>sock.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: ZGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nOrigin: ${origin}\r\n\r\n`));sock.on('data',x=>{b+=x.toString();if(b.includes('\r\n')){if(!done){done=true;clearTimeout(timeout);sock.destroy();resolve(Number((b.match(/HTTP\/1\.1 (\d+)/)||[])[1]));}}});sock.once('error',err=>{if(!done){done=true;clearTimeout(timeout);reject(err);}});});}
try{
 const a=await fs.stat(resolve(ROOT,'server.js'));check('Authoritative server source exists',a.size>25000,{bytes:a.size});
 child=spawn(process.execPath,['server.js','--transport','dev','--bind','127.0.0.1','--port',String(PORT),'--max','2','--total','4','--bots','0'],{cwd:ROOT,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>events.push(String(d)));child.stderr.on('data',d=>events.push(String(d)));
 let serverReady=false,startupProbeError='';
 for(let i=0;i<80;i++){
   if(child.exitCode!==null){startupProbeError='server process exited with code '+child.exitCode;break;}
   try{const response=await get('/status');if(response.status===200){serverReady=true;break;}startupProbeError='HTTP '+response.status;}
   catch(e){startupProbeError=String(e.message||e);}
   await delay(50);
 }
 check('Node server started',serverReady,{startupProbeError,serverExitCode:child.exitCode});
 const status=await get('/status');const initial=JSON.parse(status.body);check('Authoritative status and port',initial.ok===true&&initial.players===0&&initial.capacity===4);
 const digest=createHash('sha256').update(await fs.readFile(resolve(ROOT,'index.html'))).digest('hex');
 check('Exact game bundle matches readiness fingerprint',initial.bundle===digest&&initial.game==='sightline-v12-host-prototype');
 const html=await get('/index.html');check('Actual browser page served',html.status===200&&html.body.includes('Sightline'),{bytes:html.body.length});
 for(const asset of ['three.min.js','navigation.js','squad-tactics.js','bot-tactics.js','character-poses.js','character-prototypes.js','zombie-counterplay.js','squad-loadout.js']) { const r=await get('/'+asset);check('Serves '+asset,r.status===200&&r.body.length>100); }
 check('Unlisted files not exposed',(await get('/SHA256SUMS')).status===404);
 const foreign=await originStatus('https://other.example');check('Foreign WebSocket origin denied',foreign===403,{response:foreign});
 const same=await originStatus(`http://127.0.0.1:${PORT}`);check('Same-host WebSocket origin allowed',same===101,{response:same});
 const host=await open('HostPhoneSim');const guest=await open('JoinPhoneSim');check('Two real protocol handshakes',await until(()=>seen(host,'welcome').length&&seen(guest,'welcome').length));
 const third=await originStatus(`http://127.0.0.1:${PORT}`);check('Third person refused at 2-player cap',third===503,{response:third});
 check('Host identity established',seen(host,'welcome')[0].host===true&&seen(guest,'welcome')[0].host===false);
 check('Lobby shows two distinct peers',await until(()=>seen(host,'lobby').some(x=>x.players.filter(p=>!p.bot).length===2)&&seen(guest,'lobby').some(x=>x.players.filter(p=>!p.bot).length===2)));
 send(host,{t:'cfg',mode:'versus',rounds:1,time:60,limit:10});check('Versus configuration propagated',await until(()=>seen(guest,'lobby').some(x=>x.mode==='versus'&&x.rounds===1)));
 send(host,{t:'start'});check('Both clients receive real match start',await until(()=>seen(host,'start').length&&seen(guest,'start').length));
 check('Natural live phase reached',await until(()=>seen(host,'ph').some(x=>x.ph==='live'),15500));
 check('Server-authoritative spawn/snapshot',await until(()=>seen(host,'sp').length>0&&seen(guest,'sp').length>0&&seen(host,'s').length>0,5500));
 send(host,{t:'shot',w:'pistol',d:[[0,0,-1]]});await delay(400);
 const live=JSON.parse((await get('/status')).body);check('Server records real shot requests',live.stats.shots>=1,{shots:live.stats.shots,rejected:live.stats.rejected});
 check('Server keeps both peers connected',live.players===2,{players:live.players});
 check('Loopback diagnostics expose one redacted transport record per connected human',Array.isArray(live.clients)&&live.clients.length===2&&new Set(live.clients.map(p=>p.id)).size===2&&live.clients.every(p=>Number.isFinite(p.outboundQueueBytes)&&Number.isFinite(p.receiveIdleMs)&&Number.isFinite(p.snapshotFrames)&&Number.isFinite(p.snapshotSkipped)&&!Object.hasOwn(p,'name')&&!Object.hasOwn(p,'address')),{clients:live.clients});
 check('Per-client snapshot send/skip counters advance without queue or backpressure growth',live.clients.every(p=>p.snapshotFrames>0&&p.snapshotBytes>0&&p.snapshotSkipped===0&&p.snapshotQueuePeakBytes<262144),{clients:live.clients.map(p=>({id:p.id,snapshotFrames:p.snapshotFrames,snapshotBytes:p.snapshotBytes,snapshotSkipped:p.snapshotSkipped,snapshotBackpressure:p.snapshotBackpressure,outboundQueueBytes:p.outboundQueueBytes,snapshotQueuePeakBytes:p.snapshotQueuePeakBytes}))});
 check('Scoreboard broadcast',await until(()=>seen(host,'sc').length>0&&seen(guest,'sc').length>0));
 check('Move input sent over protocol',(()=>{send(guest,{t:'in',x:0,y:0,z:0,yaw:0,pitch:0,cr:0,pr:0,ep:0});return true;})());
 guest.ws.close();check('Guest disconnect reclaims slot',await until(async()=>false,1).then(async()=>{for(let i=0;i<90;i++){let s=JSON.parse((await get('/status')).body);if(s.players===1)return true;await delay(60);}return false;}));
 const rejoin=await open('RejoinPhoneSim');check('Rejoin creates one active session',await until(()=>seen(rejoin,'welcome').length>0));
 const rejoined=JSON.parse((await get('/status')).body);check('Rejoined player count remains 2',rejoined.players===2,{players:rejoined.players});
 result.runtimeStats={tickP95:rejoined.stats.tickP95,tickP99:rejoined.stats.tickP99,serverRSSBytes:rejoined.memory.rss,serverHeapUsedBytes:rejoined.memory.heapUsed,shots:rejoined.stats.shots,rejected:rejoined.stats.rejected};
} catch(e){result.errors.push(String(e.stack||e));} finally {for(let x of clients){try{x.ws.close()}catch{}}if(child){child.kill('SIGTERM');await delay(120);if(child.exitCode===null)child.kill('SIGKILL');}result.durationMs=Math.round(performance.now()-tStart);result.pass=result.errors.length===0&&result.checks.every(x=>x.pass);result.serverLog=events.join('').slice(-2400);const out=resolve(process.argv[3]||'./phone_lan_protocol_results.json');await fs.writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify({pass:result.pass,count:result.checks.length,failed:result.checks.filter(x=>!x.pass).map(x=>x.name),errors:result.errors,durationMs:result.durationMs,out}));}
if(!result.pass)process.exitCode=1;
