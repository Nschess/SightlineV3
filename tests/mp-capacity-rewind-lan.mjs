#!/usr/bin/env node
// Isolated loopback-only WebSocket smoke for the 64-slot bot cap and movement
// correction under delayed packets. Not a physical-LAN or browser test.
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { observeProtocolV2, protocolHello, sendProtocolV2 } from './lib/mp-protocol-v2-client.mjs';

const root = resolve(process.argv[2] || './AndroidProject/app/src/main/assets/phone-host');
const testStart = performance.now();
const port = await new Promise((ok, fail) => { const s = createServer(); s.once('error', fail); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const result = { test: 'loopback multiplayer capacity and movement correction', bind: '127.0.0.1', port, checks: [], errors: [], limits: ['No browser rendering, Wi-Fi, Android, or hardware GPU validation.'] };
const clients = []; let server;
const delay = ms => new Promise(r => setTimeout(r, ms));
function check(name, pass, details = {}) { result.checks.push({ name, pass: !!pass, ...details }); if (!pass) throw Error('FAIL ' + name); }
async function http(path) { return new Promise((ok, fail) => { const q = request({ host: '127.0.0.1', port, path }, r => { let b = ''; r.on('data', x => b += x); r.on('end', () => ok({ status: r.statusCode, body: b })); }); q.once('error', fail); q.end(); }); }
async function until(fn, ms = 8000) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await delay(25); } return false; }
function connect(name) { return new Promise((ok, fail) => { const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`), c = { ws, events: [], session:'', actionSeq:0, ep:null }; clients.push(c); const timeout = setTimeout(() => fail(Error('WS timeout ' + name)), 5000); ws.addEventListener('open', () => { clearTimeout(timeout); ws.send(JSON.stringify(protocolHello(name))); ok(c); }); ws.addEventListener('message', e => { let m; try { m = JSON.parse(e.data); } catch { return; } observeProtocolV2(c,m); m.__rx = performance.now(); c.events.push(m); if (m.t === 'ping') ws.send(JSON.stringify({ t: 'pong', s: m.s })); }); ws.addEventListener('error', () => { clearTimeout(timeout); fail(Error('WS error ' + name)); }); }); }
const send = (c, m) => sendProtocolV2(c,m);
const last = (c, t) => [...c.events].reverse().find(m => m.t === t);
try {
  server = spawn(process.execPath, ['server.js', '--transport', 'dev', '--bind', '127.0.0.1', '--port', String(port), '--max', '2', '--bots', '0'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; server.stdout.on('data', x => logs += x); server.stderr.on('data', x => logs += x);
  check('server starts on isolated loopback with default 96 roster slots', await until(async () => false, 1).then(async () => { for (let i=0;i<100;i++) { if (server.exitCode !== null) return false; try { const s=JSON.parse((await http('/status')).body); if (s.capacity === 96) return true; } catch {} await delay(30); } return false; }));
  const host = await connect('CapacityHost'), guest = await connect('CapacityGuest');
  check('two players join and host receives lobby state', await until(() => last(host, 'lobby')?.players?.length === 2));
  send(host, { t:'cfg', bots:{ mode:'add', balance:false, t0:32, t1:32 } });
  check('host lobby applies 64 bots (32 per team) plus two humans', await until(() => { const l=last(host,'lobby'); return l?.players?.length===66 && l.players.filter(p=>p.bot).length===64 && l.players.filter(p=>p.team===0).length===33 && l.players.filter(p=>p.team===1).length===33; }, 10000));
  send(host, { t:'cfg', bots:{ t0:0, t1:0 } });
  check('bot load can be removed cleanly before movement check', await until(() => last(host,'lobby')?.players?.length===2));
  send(host, { t:'cfg', mode:'versus', rounds:1, time:60 }); send(host, { t:'start' });
  check('both players receive spawn and live phase', await until(() => !!last(host,'sp') && !!last(guest,'sp') && host.events.some(m=>m.t==='ph'&&m.ph==='live'), 18000));

  const data = JSON.parse(await fs.readFile(resolve(root,'data.json'),'utf8'));
  const map = data.maps.find(m=>m.id==='courtyard') || data.maps[0];
  const sp = last(host,'sp'), hostId = last(host,'welcome').id;
  function blocked(x,z) { for (const b of map.boxes) { if (b[4] <= 0.35 || (b[5]||0) >= 1.8) continue; if (x > b[0]-.15 && x < b[1]+.15 && z > b[2]-.15 && z < b[3]+.15) return true; } return false; }
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[Math.SQRT1_2,Math.SQRT1_2],[Math.SQRT1_2,-Math.SQRT1_2],[-Math.SQRT1_2,Math.SQRT1_2],[-Math.SQRT1_2,-Math.SQRT1_2]];
  const dir=dirs.find(([x,z])=>Array.from({length:31},(_,i)=>!blocked(sp.x+x*i*.1,sp.z+z*i*.1)).every(Boolean));
  check('spawn has a collision-free straight 3 m lane', !!dir, { spawn:{x:sp.x,z:sp.z} });
  await delay(620); // emulate a delayed update while the local player runs normally
  const tx=sp.x+dir[0]*3, tz=sp.z+dir[1]*3;
  send(host,{t:'in',ep:sp.ep,x:tx,y:0,z:tz,yaw:0,pitch:0,cr:0,pr:0,wk:0});
  check('600 ms legal straight-run update is accepted and appears in authoritative snapshot', await until(()=>{const s=last(host,'s'),p=s&&s.a.find(r=>r[0]===hostId);return p&&Math.hypot(p[1]-tx,p[3]-tz)<.03;},1800));
  await delay(80);
  check('no correction was sent for the legal delayed movement', !host.events.some(m=>m.t==='corr'), { latestPosition:{x:tx,z:tz} });
  const accepted = await http('/status');
  check('movement accepted by authoritative player position', JSON.parse(accepted.body).stats.corr === 0, { corrections:JSON.parse(accepted.body).stats.corr });
  send(host,{t:'in',ep:sp.ep,x:sp.x+dir[0]*10,y:0,z:sp.z+dir[1]*10,yaw:0,pitch:0,cr:0,pr:0,wk:0});
  check('unreasonable movement is still rejected with an explicit cause', await until(()=>host.events.some(m=>m.t==='corr'&&m.why==='speed'),1200));
  const beforeSnaps=host.events.filter(m=>m.t==='s').length;
  check('host receives an extended 50 Hz authoritative snapshot sample', await until(()=>host.events.filter(m=>m.t==='s').length>=beforeSnaps+80,3500));
  const snapTimes=host.events.filter(m=>m.t==='s').slice(-80).map(m=>m.__rx), intervals=snapTimes.slice(1).map((t,i)=>t-snapTimes[i]).sort((a,b)=>a-b), avgInterval=intervals.reduce((a,b)=>a+b,0)/Math.max(1,intervals.length), p95Interval=intervals[Math.floor((intervals.length-1)*.95)]||0, maxInterval=intervals.at(-1)||0;
  check('snapshot cadence stays near 50 Hz without repeated long gaps', avgInterval>=16&&avgInterval<=26&&p95Interval<42&&maxInterval<100, { averageIntervalMs:+avgInterval.toFixed(2), p95IntervalMs:+p95Interval.toFixed(2), maxIntervalMs:+maxInterval.toFixed(2), intervalsMs:intervals.map(x=>+x.toFixed(1)) });
  const status=JSON.parse((await http('/status')).body);
  result.runtime={capacity:status.capacity, players:status.players, bots:status.bots, snapshotsPerSecond:+(1000/avgInterval).toFixed(1), snapshotIntervalP95Ms:+p95Interval.toFixed(2), snapshotIntervalMaxMs:+maxInterval.toFixed(2), tickP95Ms:status.stats.tickP95, tickP99Ms:status.stats.tickP99, corrections:status.stats.corr, speedCorrections:status.stats.corrSpeed, rssBytes:status.memory.rss};
} catch (e) { result.errors.push(String(e.stack||e)); }
finally {
  for (const c of clients) try { c.ws.close(); } catch {}
  if (server) { server.kill('SIGTERM'); await delay(120); if (server.exitCode===null) server.kill('SIGKILL'); }
  result.pass=!result.errors.length&&result.checks.every(x=>x.pass); result.durationMs=Math.round(performance.now()-testStart);
  const out=resolve(process.argv[3]||'./acceptance/mp-capacity-rewind-lan-2026-10-26.json'); await fs.mkdir(resolve(out,'..'),{recursive:true}); await fs.writeFile(out,JSON.stringify(result,null,2));
  console.log(JSON.stringify({pass:result.pass,checks:result.checks.length,failed:result.checks.filter(x=>!x.pass).map(x=>x.name),errors:result.errors,runtime:result.runtime,out}));
}
if(!result.pass)process.exitCode=1;
