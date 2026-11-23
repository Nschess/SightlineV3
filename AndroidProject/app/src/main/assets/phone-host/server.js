#!/usr/bin/env node
/* Sightline Range LAN server.
   One file, no npm packages. Serves the game page and runs a host-authoritative match over WebSocket.
   The server owns: teams, rounds, money, buying, ammo limits, hit detection, damage, kills, scores.
   Clients only send: where they are, what they bought, and when they fired.
   Usage: node server.js --transport dev [--port 8080] [--max 10] [--rounds 5] [--time 100] [--bots 0] [--skill regular]
          node server.js --transport release --bind <private-ip> --port 8080 */
'use strict';
const http = require('http'), zlib = require('zlib'), crypto = require('crypto'), fs = require('fs'), path = require('path'), os = require('os'), https = require('https'), net = require('net');
const HostTransport = require('./host-transport-config.js');

/* ---------------- options ---------------- */
const argv = process.argv.slice(2);
function opt(name, def, lo, hi) { const i = argv.indexOf('--' + name); if (i < 0 || i + 1 >= argv.length) return def; const v = Number(argv[i + 1]); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def; }
const ROOM_INDEX = argv.indexOf('--room');
const ROOM_NAME = (ROOM_INDEX >= 0 ? String(argv[ROOM_INDEX + 1] || '') : 'Sightline Match').replace(/[\x00-\x1f\x7f]/g,'').slice(0,48) || 'Sightline Match';
let ROOM_OPENED = !argv.includes('--wait-for-host');
const HOST_INSTANCE = process.env.SIGHTLINE_HOST_INSTANCE || crypto.randomBytes(12).toString('hex');
function isPrivateHostIPv4(value) {
  if(typeof value!=='string'||net.isIP(value)!==4)return false;
  const p=value.split('.').map(Number),a=p[0],b=p[1];
  return a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168);
}
function defaultPrivateBind() {
  const entries=os.networkInterfaces()||{};
  for(const [name,rows] of Object.entries(entries)) {
    if(/loopback|virtual|vethernet|docker|vpn|tun/i.test(name))continue;
    for(const row of rows||[])if(row&&row.family==='IPv4'&&!row.internal&&isPrivateHostIPv4(row.address))return row.address;
  }
  return '127.0.0.1';
}
const BIND_ARG = argv.indexOf('--bind');
const BIND = BIND_ARG >= 0 ? String(argv[BIND_ARG + 1] || '') : (require.main===module?defaultPrivateBind():'127.0.0.1');
if (BIND !== '127.0.0.1' && !isPrivateHostIPv4(BIND)) throw new Error('Host bind address must be one private IPv4 interface; wildcard/public listeners are disabled');
const PORT = opt('port', 8080, 1, 65535), MAX_PLAYERS = Math.round(opt('max', 32, 2, 32));
const MAX_PENDING_HANDSHAKES = Math.min(64,MAX_PLAYERS*2), MAX_PENDING_PER_IP = 4;
let pendingHandshakeCount=0;
const pendingHandshakesByIp=new Map();
function peerIPv4(address) { return String(address||'').replace(/^::ffff:/i,''); }
function reservePendingHandshake(address) {
  let ip=peerIPv4(address);
  // Imported server instances are used by deterministic protocol harnesses
  // with lightweight fake sockets. A real executable host always has a peer IP.
  if(require.main!==module&&!ip)ip='127.0.0.1';
  const loopback=BIND==='127.0.0.1'&&ip==='127.0.0.1';
  if(!loopback&&!isPrivateHostIPv4(ip))return null;
  const count=pendingHandshakesByIp.get(ip)||0;
  if(pendingHandshakeCount>=MAX_PENDING_HANDSHAKES||count>=MAX_PENDING_PER_IP)return null;
  pendingHandshakeCount++;pendingHandshakesByIp.set(ip,count+1);
  let held=true;
  return ()=>{if(!held)return;held=false;pendingHandshakeCount=Math.max(0,pendingHandshakeCount-1);const n=pendingHandshakesByIp.get(ip)||0;if(n<=1)pendingHandshakesByIp.delete(ip);else pendingHandshakesByIp.set(ip,n-1);};
}
const TRANSPORT_MODE = HostTransport.resolveTransportMode(argv, {
  defaultMode: require.main === module ? null : HostTransport.DEVELOPMENT_TRANSPORT
});
const RELEASE_TLS = TRANSPORT_MODE === HostTransport.RELEASE_TRANSPORT
  ? HostTransport.loadReleaseTlsConfig({ projectRoot: path.resolve(__dirname, '../../../../../..') })
  : null;
if (RELEASE_TLS && (PORT !== RELEASE_TLS.port || BIND !== RELEASE_TLS.bind)) {
  throw new Error('Release transport requires its configured private bind address and fixed port 8080.');
}
const MAX_BOTS = 64;
const MAX_TOTAL = Math.round(opt('total', 96, 2, 96));            /* up to 32 humans plus 64 AI bots */
function optStr(name, def, allowed) { const i = argv.indexOf('--' + name); return i >= 0 && allowed.includes(argv[i + 1]) ? argv[i + 1] : def; }
const LOBBY_DEFAULTS = { map: 'courtyard', rounds: Math.round(opt('rounds', 5, 1, 15)), time: Math.round(opt('time', 100, 30, 300)) };
const HOST_BUNDLE_SHA256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'index.html'))).digest('hex');
// Fingerprint the complete packaged phone-host runtime (all entries in
// SHA256SUMS), not just server.js; stale helper modules previously escaped the
// console fingerprint and made old host builds harder to distinguish.
const HOST_SERVER_SHA256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'SHA256SUMS'))).digest('hex');
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));
const MAPS = {}; DATA.maps.forEach(m => { MAPS[m.id] = m; });
const W = DATA.weapons, CFG = DATA.cfg;
const MULTIPLAYER_PROTOCOL = 2;
const MULTIPLAYER_FEATURES = ['session-generation', 'life-epoch', 'action-seq'];
const SEQUENCED_CLIENT_MESSAGES = new Set(['in', 'shot', 'rl', 'buy', 'ammo', 'obj', 'team', 'map', 'cfg', 'start', 'endmatch', 'cosmetic', 'finish', 'finishes']);
const LIFE_SCOPED_CLIENT_MESSAGES = new Set(['in', 'shot', 'rl', 'buy', 'ammo', 'obj']);
function negotiateMultiplayerProtocol(m) {
  if (!m || m.t !== 'hello') return { ok: false, code: 'invalid_hello', message: 'Invalid multiplayer hello message.' };
  if (m.v === 1) return { ok: false, code: 'protocol_upgrade_required', message: 'This host requires multiplayer protocol v2. Refresh or update the game page, then reconnect.' };
  if (m.v !== MULTIPLAYER_PROTOCOL) return { ok: false, code: 'protocol_unsupported', message: 'This multiplayer protocol version is not supported by the host.' };
  const offered = Array.isArray(m.features) ? new Set(m.features) : new Set();
  const missing = MULTIPLAYER_FEATURES.filter(feature => !offered.has(feature));
  if (missing.length) return { ok: false, code: 'protocol_capabilities_required', message: 'This host requires v2 session, life-epoch, and action-sequence support. Refresh or update the game page.' };
  return { ok: true, version: MULTIPLAYER_PROTOCOL, features: MULTIPLAYER_FEATURES.slice() };
}
// Index 15 is the Legendary entry. Restrict it to weapons with a verified,
// matching runtime model module; the uploaded catalog also contains incomplete
// prototypes which must not become selectable through a modified client.
const PAUSED_LEGENDARY_FINISH_KEYS = new Set([
  'bastion', 'forge', 'mistral', 'thunder', 'ember', 'hammer', 'vantage',
  'cyclone', 'switchback', 'mako', 'kestrel', 'pistol', 'pinion'
]);
function validFinishSelection(key, ix) {
  return !!W[key] && !W[key].melee && Number.isInteger(ix) && ix >= 0 && ix <= 15 && !(ix === 15 && PAUSED_LEGENDARY_FINISH_KEYS.has(key));
}
const COSMETIC_EVENT_SESSION = crypto.randomBytes(6).toString('hex');
let cosmeticEventSeq = 0;
/* All premium and expanded arsenal definitions live in data.json, server-authoritative. */
const Nav = require('./navigation.js');
const Squad = require('./squad-tactics.js');
const Tactics = require('./bot-tactics.js');
const Counter = require('./zombie-counterplay.js');
const InfectionEvasion = require('./infection-evasion.js');
const Hunt = require('./zombie-hunt.js');
const Deathmatch = require('./deathmatch-rules.js');
const ModeRules = require('./gameplay-mode-rules.js');
const Characters = require('./character-skins.js');
const WKEYS = Object.keys(W);
if (WKEYS.some(k => !(Number.isFinite(W[k].price)&&Number.isFinite(W[k].mag)&&Number.isFinite(W[k].rpm)))) throw new Error('Invalid server arsenal');
const PRIMARIES = ['kestrel', 'smg', 'mako', 'hammer', 'breacher', 'scatter', 'stinger', 'carbine', 'rook117', 'rampart', 'ranger', 'longbow', 'bulwark', 'aurora', 'tide', 'ember', 'switchback', 'needle', 'thunder', 'falcon', 'vantage', 'pinion', 'mistral', 'forge', 'bastion', 'cyclone'];
const MELEES = ['knife', 'shiv', 'machete', 'cleaver'];
const BUY_SECS = 12, ROUNDEND_SECS = 5, MATCHEND_SECS = 12, LIVE_BUY_SECS = CFG.buyTime;
// Preserve fractional periods so Windows hosts can opt into an OS timer-aligned
// 15.625 ms experiment. The normal production default remains 20 ms.
const TICK_MS = opt('tick-ms', 20, 10, 50), SNAP_EVERY = Math.round(opt('snapshot-every', 1, 1, 5)), RESEND_SC_MS = 1000;
const HIST_MS = 600, EYE = 1.65, HALF_W = 0.38, BODY_H = 1.8;
const MAX_SPEED = 9.6;           /* fastest legal horizontal speed (slide) plus slack, m/s */
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);
function logPlayerConnection(event, player, ...details) {
  if (RELEASE_TLS) log(event, ...details);
  else log(event, player.name, ...details);
}
/* The circle resolver must keep the ordered full scan when it touches a solid:
   its recovery pass deliberately reasons about a combined footprint.  This
   cache is therefore only an empty-contact proof for open ground, never a
   substitute candidate list for recovery. */
const COLLISION_CELL = 4, COLLISION_PAD = 1.25, collisionGridCache = new WeakMap();
const collisionStats = { calls: 0, openFast: 0, full: 0, candidates: 0, grids: 0 };

const WS_TEXT_DECODER = new (require('util').TextDecoder)('utf-8', { fatal: true, ignoreBOM: true });
/* ---------------- minimal WebSocket (RFC 6455), text frames only ---------------- */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
// Bound synchronous work per peer so a coalesced input burst cannot monopolize
// the simulation event loop. Normal Sightline clients send about 35 messages/s.
const WS_FRAME_BATCH = 32, WS_FRAME_RATE_MAX = 600, WS_MESSAGE_RATE_MAX = 150;
function frame(op, payload) {
  const len = payload.length, headerBytes = len < 126 ? 2 : len < 65536 ? 4 : 10;
  const out = Buffer.allocUnsafe(headerBytes + len);
  out[0] = 0x80 | op;
  if (headerBytes === 2) out[1] = len;
  else if (headerBytes === 4) { out[1] = 126; out.writeUInt16BE(len, 2); }
  else { out[1] = 127; out.writeUInt32BE(0, 2); out.writeUInt32BE(len, 6); }
  payload.copy(out, headerBytes);
  return out;
}
class Conn {
  constructor(sock, onMsg, onClose) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.onMsg = onMsg; this.onClose = onClose; this.closed = false; this.frag = null; this.fragOp = 0; this.lastRx = Date.now();
    this.drainScheduled = false; this.frameRateTimes = new Float64Array(WS_FRAME_RATE_MAX); this.frameRateHead = 0; this.frameRateCount = 0;
    this.messageRateTimes = new Float64Array(WS_MESSAGE_RATE_MAX); this.messageRateHead = 0; this.messageRateCount = 0;
    this.snapshotFrames = 0; this.snapshotSkipped = 0; this.snapshotBytes = 0; this.snapshotBackpressure = 0; this.snapshotQueueBytes = 0; this.snapshotQueuePeakBytes = 0;
    sock.setNoDelay(true); sock.setTimeout(0);
    sock.setKeepAlive(true, 10000);
    sock.on('data', d => this.data(d)); sock.on('end', () => this.kill()); sock.on('close', () => this.end()); sock.on('error', () => this.end());   /* http sockets are half-open by default: without 'end' a closed tab lingers until the 20 s timeout */
  }
  data(d) {
    if (this.closed) return;
    this.lastRx = Date.now();
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    if (this.buf.length > 1 << 20) return this.kill();
    this.drainFrames();
  }
  scheduleDrain() {
    if (this.closed || this.drainScheduled) return;
    this.drainScheduled = true;
    setImmediate(() => {
      this.drainScheduled = false;
      this.drainFrames();
    });
  }
  drainFrames() {
    if (this.closed || this.drainScheduled) return;
    let frameCount = 0;
    for (;;) {
      const b = this.buf; if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, op = b[0] & 15, masked = (b[1] & 0x80) !== 0; let len = b[1] & 127, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; if (b.readUInt32BE(2) !== 0) return this.kill(); len = b.readUInt32BE(6); off = 10; }
      if (len > 65536 || !masked) return this.kill();           /* clients must mask; nothing we accept is large */
      if (b[0]&0x70 || ![0,1,8,9,10].includes(op) || (op>=8 && (!fin || len>125))) return this.kill();
      if (b.length < off + 4 + len) return;
      /* Strict trailing 1 s window: a peer cannot double its allowance by
         scheduling a burst on either side of a fixed-window boundary. Count
         all completed WebSocket frames, including fragments and controls. */
      const rateNow = performance.now();
      while (this.frameRateCount && rateNow - this.frameRateTimes[this.frameRateHead] >= 1000) {
        this.frameRateHead = (this.frameRateHead + 1) % WS_FRAME_RATE_MAX;
        this.frameRateCount--;
      }
      if (this.frameRateCount >= WS_FRAME_RATE_MAX) return this.kill();
      this.frameRateTimes[(this.frameRateHead + this.frameRateCount) % WS_FRAME_RATE_MAX] = rateNow;
      this.frameRateCount++;
      const mask = b.subarray(off, off + 4), pl = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) pl[i] = b[off + 4 + i] ^ mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (op === 8) {
        /* A Close payload is either empty or contains a 2-byte status code
           followed by a UTF-8 reason. Echo a valid peer Close and half-close
           the socket so the response is not discarded by destroy(). */
        if (!validWsClosePayload(pl)) return this.kill();
        this.closed = true; this.buf = Buffer.alloc(0); this.frag = null; this.fragBytes = 0; this.fragOp = 0;
        try { this.sock.end(frame(8, pl)); } catch (e) { try { this.sock.destroy(); } catch (_) {} }
        this.onClose();
        return;
      }
      if (op === 9) { this.send(10, pl); if (this.closed) return; }
      if (op === 10) {
        if (this.transportProbe && pl.equals(this.transportProbe.token)) {
          this.transportRttMs = performance.now() - this.transportProbe.started;
          this.transportRttAt = performance.now();
          this.transportProbe = null;
        }
        if (++frameCount >= WS_FRAME_BATCH && this.buf.length >= 2) { this.scheduleDrain(); return; }
        continue;
      }
      if (op === 1) { if(this.frag || len>8192)return this.kill(); this.fragBytes=len; this.fragOp = op; this.frag = fin ? null : [pl]; if (fin) this.deliver(op, pl); if (this.closed) return; }
      else if (op === 0) { if(!this.frag || (this.fragBytes+=len)>8192)return this.kill(); this.frag.push(pl); if (fin) { const all = Buffer.concat(this.frag); this.frag = null; this.deliver(this.fragOp, all); if (this.closed) return; } }
      if (++frameCount >= WS_FRAME_BATCH && this.buf.length >= 2) { this.scheduleDrain(); return; }
    }
  }
  deliver(op, pl) {
    if (this.closed || op !== 1) return;
    let text;
    try { text = WS_TEXT_DECODER.decode(pl); } catch (e) { return this.kill(); }
    const rateNow=performance.now();
    while(this.messageRateCount&&rateNow-this.messageRateTimes[this.messageRateHead]>=1000){this.messageRateHead=(this.messageRateHead+1)%WS_MESSAGE_RATE_MAX;this.messageRateCount--;}
    if(this.messageRateCount>=WS_MESSAGE_RATE_MAX)return this.kill();
    this.messageRateTimes[(this.messageRateHead+this.messageRateCount)%WS_MESSAGE_RATE_MAX]=rateNow;this.messageRateCount++;
    try { this.onMsg(text); } catch (e) { log('handler error', e && e.stack || e); }
  }
  send(op, payload) { if (!this.closed) { if(this.backlog>262144)return this.kill(); try { this.sock.write(frame(op, payload)); } catch (e) { this.kill(); } } }
  sendFrame(buf) { if (!this.closed) { if(this.backlog>262144){this.kill();return false;} try { return this.sock.write(buf); } catch (e) { this.kill();return false; } } return false; }
  text(s) { this.send(1, Buffer.from(s, 'utf8')); }
  closeAfterMessage(value, code = 1008) {
    if (this.closed) return;
    this.closed = true; this.buf = Buffer.alloc(0); this.frag = null; this.fragBytes = 0;
    const close = Buffer.alloc(2); close.writeUInt16BE(code, 0);
    try { this.sock.end(Buffer.concat([frame(1, Buffer.from(JSON.stringify(value), 'utf8')), frame(8, close)])); }
    catch (e) { try { this.sock.destroy(); } catch (_) {} }
    this.onClose();
  }
  get backlog() { return this.sock.writableLength; }
  kill() { try { this.sock.destroy(); } catch (e) {} this.end(); }
  end() { if (this.closed) return; this.closed = true; this.buf = Buffer.alloc(0); this.frag = null; this.fragBytes = 0; this.onClose(); }
}
function validWsClosePayload(payload) {
  if (payload.length === 1) return false;
  if (payload.length === 0) return true;
  const code = payload.readUInt16BE(0);
  const validCode = (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) || (code >= 3000 && code <= 4999);
  if (!validCode) return false;
  try { WS_TEXT_DECODER.decode(payload.subarray(2)); return true; } catch (e) { return false; }
}

/* ---------------- game state ---------------- */
const players = new Map(); let nextId = 1;
const BOTCFG = { mode: 'add', balance: false, t0: Math.round(opt('bots', 0, 0, 32)), t1: Math.round(opt('bots', 0, 0, 32)), coop: Math.round(opt('bots', 0, 0, MAX_BOTS)), skill: optStr('skill', 'regular', ['recruit', 'regular', 'veteran', 'elite']) };
const G = { phase: 'lobby', mode: 'versus', auto: true, map: LOBBY_DEFAULTS.map, rounds: LOBBY_DEFAULTS.rounds, time: LOBBY_DEFAULTS.time, kills: Deathmatch.SCORE_LIMIT, round: 0, score: [0, 0], phaseEnd: 0, liveStart: 0, lastWin: -1 };
const DM = { respawns: new Map() };
const FFA = { match: null, respawns: new Map() };
const BOMB = { settings: ModeRules.settings(), sites: null, state: null, supportMap: '', unsupportedReason: '', openingTeam: 0, nextOpeningTeam: 0, matchStartConfirmed: false };
const isDeathmatch = () => G.mode === 'deathmatch';
const isFFA = () => G.mode === 'ffa';
const isBomb = () => G.mode === 'bomb';
let snapN = 0, tickN = 0, lastSc = 0;
/* Snapshot rows are serialized synchronously before any socket write. Reuse
   their arrays across ticks to avoid thousands of short-lived row allocations
   per second in full bot lobbies. The pools retain capacity; the wire arrays
   expose only the rows populated for this frame. */
const snapshotActorRowPool = [], snapshotActorRows = [];
const snapshotZombieRowPool = [], snapshotZombieRows = [];
const snapshotInfectedIds = [];
const snapshotInfection = { started:false, remaining:0, humans:0, infected:0, infectedIds:snapshotInfectedIds, chooseIn:0, surge:false };
const snapshotMessage = { t:'s', n:0, st:0, a:snapshotActorRows, infection:undefined, z:undefined, objective:undefined };
/* Opt-in stage timing for LAN jitter diagnosis. Fixed-size typed rings avoid
   per-snapshot allocations and stay completely inactive in normal hosting. */
const snapshotPipelineEnabled = process.env.SIGHTLINE_SNAPSHOT_DIAGNOSTICS === '1';
const snapshotPipelineCapacity = 1024;
const snapshotPipeline = { enabled:snapshotPipelineEnabled, count:0, cursor:0, lastStamp:0,
  scheduledGap:new Float64Array(snapshotPipelineCapacity), build:new Float64Array(snapshotPipelineCapacity),
  encode:new Float64Array(snapshotPipelineCapacity), fanout:new Float64Array(snapshotPipelineCapacity),
  total:new Float64Array(snapshotPipelineCapacity), bytes:new Float64Array(snapshotPipelineCapacity) };
/* Measure actual timer wake-up offset separately from tick work. Opt-in so
   ordinary LAN hosting does not allocate rings or call extra clocks. */
const tickSchedulerDiagnosticsEnabled = process.env.SIGHTLINE_TIMER_DIAGNOSTICS === '1';
const tickSchedulerDiagnosticsCapacity = 1024;
const tickSchedulerDiagnostics = tickSchedulerDiagnosticsEnabled ? {
  count:0,cursor:0,resyncs:0,lateCount:0,
  wakeOffset:new Float64Array(tickSchedulerDiagnosticsCapacity),
  wakeLate:new Float64Array(tickSchedulerDiagnosticsCapacity),
  tickWork:new Float64Array(tickSchedulerDiagnosticsCapacity),
  rearmDelay:new Float64Array(tickSchedulerDiagnosticsCapacity)
} : null;
function recordTickScheduler(wakeOffsetMs,tickWorkMs,rearmDelayMs,resynced) {
  const d=tickSchedulerDiagnostics,i=d.cursor;
  d.wakeOffset[i]=wakeOffsetMs;d.wakeLate[i]=Math.max(0,wakeOffsetMs);
  d.tickWork[i]=tickWorkMs;d.rearmDelay[i]=rearmDelayMs;
  if(wakeOffsetMs>0)d.lateCount++;
  if(resynced)d.resyncs++;
  d.cursor=(i+1)%tickSchedulerDiagnosticsCapacity;
  if(d.count<tickSchedulerDiagnosticsCapacity)d.count++;
}
function tickSchedulerDiagnosticsSnapshot() {
  const d=tickSchedulerDiagnostics;if(!d)return {enabled:false,samples:0,resyncs:0,lateWakeCount:0};
  const n=d.count,start=(d.cursor-n+tickSchedulerDiagnosticsCapacity)%tickSchedulerDiagnosticsCapacity;
  const values=source=>{const a=new Float64Array(n);for(let j=0;j<n;j++)a[j]=source[(start+j)%tickSchedulerDiagnosticsCapacity];return {p50:percentile(a,.5),p95:percentile(a,.95),p99:percentile(a,.99),max:n?r2(Math.max(...a)):0};};
  return {enabled:true,samples:n,capacity:tickSchedulerDiagnosticsCapacity,resyncs:d.resyncs,lateWakeCount:d.lateCount,
    wakeOffsetMs:values(d.wakeOffset),wakeLatenessMs:values(d.wakeLate),tickWorkMs:values(d.tickWork),requestedRearmDelayMs:values(d.rearmDelay)};
}
function recordSnapshotPipeline(stamp, buildMs, encodeMs, fanoutMs, totalMs, bytes) {
  const i=snapshotPipeline.cursor, prev=snapshotPipeline.lastStamp;
  snapshotPipeline.scheduledGap[i]=prev?Math.max(0,stamp-prev):0;
  snapshotPipeline.build[i]=buildMs;snapshotPipeline.encode[i]=encodeMs;snapshotPipeline.fanout[i]=fanoutMs;
  snapshotPipeline.total[i]=totalMs;snapshotPipeline.bytes[i]=bytes;
  snapshotPipeline.lastStamp=stamp;snapshotPipeline.cursor=(i+1)%snapshotPipelineCapacity;
  if(snapshotPipeline.count<snapshotPipelineCapacity)snapshotPipeline.count++;
}
function snapshotPipelineSnapshot() {
  const n=snapshotPipeline.count, values=a=>n?{p50:percentile(a.subarray(0,n),.5),p95:percentile(a.subarray(0,n),.95),p99:percentile(a.subarray(0,n),.99),max:r2(Math.max(...a.subarray(0,n)))}:{p50:0,p95:0,p99:0,max:0};
  return {enabled:snapshotPipeline.enabled,samples:n,capacity:snapshotPipelineCapacity,
    scheduledGapMs:values(snapshotPipeline.scheduledGap),buildMs:values(snapshotPipeline.build),encodeAndFrameMs:values(snapshotPipeline.encode),fanoutWriteMs:values(snapshotPipeline.fanout),totalMs:values(snapshotPipeline.total),frameBytes:values(snapshotPipeline.bytes)};
}
const stats = { snaps: 0, bytes: 0, shots: 0, rejected: 0, corr: 0, corrSpeed: 0, corrVertical: 0, corrAirtime: 0, corrBlocked: 0, dropped: 0, skipped: 0, backlogSkipped: 0, tickAvg: 0, tickMax: 0, slow: 0, tickErrors: 0 };
const eventLoopDiagnostics = { enabled: false, gcCount: 0, gcMajorCount: 0, gcTotalMs: 0, gcMaxMs: 0, lastGC: null };
const recentSlowGaps = [];
const recentSlowBotThinks = [];
const liveTickSamples=[], liveGapSamples=[];
let liveTickSampleWrite=0, liveGapSampleWrite=0, liveTickMax=0;
const liveComponentMax={modeMs:0,botsMs:0,snapshotMs:0,otherMs:0};
const botWorkDiagnostics={thinks:0,thinkMs:0,thinkMaxMs:0,thinkOver2Ms:0,scans:0,scanMs:0,scanMaxMs:0,scanOver1Ms:0,waypoints:0,waypointMs:0,waypointMaxMs:0,navBuilds:0,navBuildMs:0,navBuildMaxMs:0,batches:0,batchMs:0,batchMaxMs:0,batchMaxDecisions:0,cappedBatches:0,deferredDueMax:0,budgetHitTicks:0,budgetDeferredBots:0,budgetDeferredMax:0,budgetElapsedMaxMs:0,squadMs:0,squadMaxMs:0};
let previousTickWorkMs=0,previousTickComponents=null;
let eventLoopDelayMonitor = null, gcObserver = null, eventLoopStartPerf=0;
if (require.main === module && process.env.SIGHTLINE_DIAGNOSTICS === '1') {
  const { monitorEventLoopDelay, PerformanceObserver } = require('perf_hooks');
  eventLoopDelayMonitor = monitorEventLoopDelay({ resolution: 10 }); eventLoopDelayMonitor.enable(); eventLoopDiagnostics.enabled = true;
  gcObserver = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if(eventLoopStartPerf&&entry.startTime<eventLoopStartPerf)continue;
      const detail=entry.detail||{},durationMs = Number(entry.duration) || 0,kind=Number.isFinite(detail.kind)?detail.kind:null;
      eventLoopDiagnostics.gcCount++; eventLoopDiagnostics.gcTotalMs += durationMs;
      eventLoopDiagnostics.gcMaxMs = Math.max(eventLoopDiagnostics.gcMaxMs, durationMs);
      if (kind === 2) eventLoopDiagnostics.gcMajorCount++;
      eventLoopDiagnostics.lastGC = { at: Date.now(), durationMs: r2(durationMs), kind, flags: detail.flags??null };
    }
  });
  gcObserver.observe({ entryTypes: ['gc'] });
}
function resetLiveTimingDiagnostics(){
  liveTickSamples.length=0;liveGapSamples.length=0;liveTickSampleWrite=0;liveGapSampleWrite=0;liveTickMax=0;recentSlowGaps.length=0;
  recentSlowBotThinks.length=0;
  liveComponentMax.modeMs=0;liveComponentMax.botsMs=0;liveComponentMax.snapshotMs=0;liveComponentMax.otherMs=0;previousTickWorkMs=0;previousTickComponents=null;
  for(const key of Object.keys(botWorkDiagnostics))botWorkDiagnostics[key]=0;
  eventLoopStartPerf=eventLoopDelayMonitor?performance.now():0;
  if(eventLoopDelayMonitor)eventLoopDelayMonitor.reset();
  eventLoopDiagnostics.gcCount=0;eventLoopDiagnostics.gcMajorCount=0;eventLoopDiagnostics.gcTotalMs=0;eventLoopDiagnostics.gcMaxMs=0;eventLoopDiagnostics.lastGC=null;
}

function send(p, o) { if (p.c && !p.c.closed) p.c.text(JSON.stringify(o)); }
function bcast(o, except) { const s = Buffer.from(JSON.stringify(o), 'utf8'), f = frame(1, s); players.forEach(p => { if (p !== except && p.c && !p.c.closed) { if(p.c.backlog>262144) {stats.dropped++;p.c.kill();} else p.c.sendFrame(f); } }); }
/* AI gunfire still resolves every shot authoritatively, but its presentation is
   cosmetic. At high bot counts, broadcasting every muzzle/tracer/audio cue can
   flood clients and trip the generic slow-peer disconnect. Send a nearby, evenly
   paced sample instead; never disconnect a client because of a droppable effect. */
const BOT_FX_MIN_INTERVAL_MS = 33, BOT_FX_RANGE = 72;
const botFxStats = { sent: 0, throttled: 0, outOfRange: 0, backlogDropped: 0 };
function bcastBotFx(o, source, t = now()) {
  const s = Buffer.from(JSON.stringify(o), 'utf8'), f = frame(1, s);
  players.forEach(p => {
    if (p.bot || !p.c || p.c.closed) return;
    if (Math.hypot(p.x - source.x, p.z - source.z) > BOT_FX_RANGE) { botFxStats.outOfRange++; return; }
    if (Number.isFinite(p.botFxAt) && t - p.botFxAt < BOT_FX_MIN_INTERVAL_MS) { botFxStats.throttled++; return; }
    if (p.c.backlog > 262144) { botFxStats.backlogDropped++; return; }
    p.botFxAt = t; botFxStats.sent++; p.c.sendFrame(f);
  });
}
const now = () => Date.now();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const r2 = v => Math.round(v * 100) / 100;
const teamList = t => [...players.values()].filter(p => p.team === t);
const realPlayers = () => [...players.values()].filter(p => !p.bot);
const humanCount = () => { let n = 0; players.forEach(p => { if (!p.bot) n++; }); return n; };
function fallMul(w, dist) {      /* damage multiplier by distance; same numbers the client uses for its own feedback */
  if (w.pellets) return clamp(1 - (dist - w.falloffStart) / (w.falloffEnd - w.falloffStart), 0, 1);
  if (w.key === 'longbow' || w.longRange) return 1;
  const rs = w.rs === undefined ? 40 : w.rs, rk = w.rk === undefined ? 0.004 : w.rk, rmin = w.rmin === undefined ? 0.7 : w.rmin;
  return Math.max(rmin, 1 - Math.max(0, dist - rs) * rk);
}
const mapData = () => MAPS[G.map] || MAPS.courtyard;
const AMMO_PRICE = 300, stationCache = new Map();
function ammoStations() {
  if (isInfection()) return [];
  const m=mapData(), key=m.id+':'+G.mode; if(stationCache.has(key)) return stationCache.get(key);
  const anchors = groupMode() ? [[m.spawn.x,m.spawn.z,0],[(m.area.x0+m.area.x1)/2-12,(m.area.z0+m.area.z1)/2,0],[(m.area.x0+m.area.x1)/2+12,(m.area.z0+m.area.z1)/2,0]] : [[m.spawn.x,m.spawn.z,0],[(m.botSpawn.x0+m.botSpawn.x1)/2,(m.botSpawn.z0+m.botSpawn.z1)/2,1]];
  const out=[], N=buildNav(m);
  for(const [ax,az,team] of anchors) {
    const candidates=[];
    for(let j=1;j<N.h-1;j++) for(let i=1;i<N.w-1;i++) {const k=j*N.w+i,x=N.x0+i+.5,z=N.z0+j+.5; if(N.c[k]||N.y[k]>.25||boxOverlap(m,x,z,1.2)||out.some(s=>Math.hypot(s.x-x,s.z-z)<8))continue;candidates.push({x,z,d:Math.hypot(x-ax,z-az)});}
    candidates.sort((a,b)=>a.d-b.d);
    for(const c of candidates) if(astar(N,m.spawn.x,m.spawn.z,c.x,c.z)){out.push({id:out.length,x:c.x,z:c.z,y:0,team,price:AMMO_PRICE});break;}
  }
  stationCache.set(key,out); return out;
}
function onAmmo(p,m) {
  const reply=(ok,why)=>send(p,{t:'supply',ok,why:why||'',money:p.money});
  if (isInfection()) return reply(false, 'No ammo stations during Infection');
  if(!p.alive || !(G.phase==='buy' || G.phase==='live') || (!isCoop() && !buyWindow())) return reply(false,'Supply access is closed');
  const s=ammoStations().find(s=>s.id===m.id && (isCoop() || s.team===p.team));
  if(!s || Math.hypot(p.x-s.x,p.z-s.z)>2.8 || Math.abs(p.y-s.y)>2) return reply(false,'Move closer to your ammo station');
  const dx=s.x-p.x,dz=s.z-p.z,L=Math.hypot(dx,dz); if(L>0.01 && wallDist(mapData(),p.x,p.y+1.3,p.z,dx/L,(s.y-p.y)/L,dz/L,L)<L-0.1) return reply(false,'Station is obstructed');
  if(now()-(p.lastSupply||0)<1000) return reply(false,'Wait a moment before resupplying');
  const guns=[...p.owned].filter(k=>W[k]&&!W[k].melee&&p.ammo[k].res<W[k].reserve);
  if(!guns.length)return reply(false,'Your reserve ammunition is full');
  if(p.money<AMMO_PRICE)return reply(false,'Need $'+(AMMO_PRICE-p.money)+' more');
  p.money-=AMMO_PRICE; p.lastSupply=now(); guns.forEach(k=>p.ammo[k].res=W[k].reserve); reply(true); send(p,ammoMsg(p));
}

function meleeOf(p) { for (const k of MELEES) if (p.owned.has(k)) return k; return 'knife'; }
function newLoadout(p) { p.owned = new Set(['pistol', 'knife']); p.armor = 0; p.cur = 'pistol'; p.ammo = {}; p.rl = null; WKEYS.forEach(k => { p.ammo[k] = { mag: W[k].mag, res: W[k].reserve }; }); }
function refillAmmo(p) { WKEYS.forEach(k => { p.ammo[k] = { mag: W[k].mag, res: W[k].reserve }; }); p.rl = null; }
/* Zombie-mode SURVIVOR bots can reload forever, not fire forever. Human ammo,
   tactical bots, and infected (melee-only) retain their original rules.
   The rule is computed from authoritative state so conversions/mode changes
   cannot leak an old unlimited-ammo flag into another round. */
function botUnlimitedAmmo(p) { return !!(p && p.bot && p.alive && groupMode() && (!isInfection() || !p.infected)); }
function botHasReload(p, key) { return botUnlimitedAmmo(p) || !!(p.ammo[key] && p.ammo[key].res > 0); }

function lobbyMsg() {
  if (isBomb() && BOMB.supportMap !== G.map) prepareBombSites();
  return { t: 'lobby', phase: G.phase, mode: G.mode, auto: G.auto, map: G.map, rounds: G.rounds, time: G.time, kills: G.kills, cash: CFG.startMoney, max: MAX_PLAYERS, total: MAX_TOTAL, maps: DATA.maps.map(m => [m.id, m.name, m.tag]), teams: DATA.teams,
    bomb: { settings: BOMB.settings, supported: BOMB.supportMap === G.map && !!BOMB.sites, unsupportedReason: BOMB.supportMap === G.map ? BOMB.unsupportedReason : 'Checking this map\'s validated bomb sites' },
    bots: { mode: BOTCFG.mode, balance: BOTCFG.balance, t0: BOTCFG.t0, t1: BOTCFG.t1, coop: BOTCFG.coop, skill: BOTCFG.skill },
    players: [...players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, infected: isInfection() && p.infected ? 1 : 0, host: p.host, ping: p.bot ? 0 : Math.round(p.rtt), op: p.op, skin: p.skin || 'default', finishes: p.finishes || {}, bot: p.bot ? 1 : 0, skill: p.bot ? p.skill : undefined })) };
}
function pushLobby() { bcast(lobbyMsg()); }
function pushLobbyPings() {
  const peers = realPlayers();
  const pings = frame(1, Buffer.from(JSON.stringify({
    t: 'lobbyPings', rows: peers.map(p => [p.id, Math.round(p.rtt)])
  }), 'utf8'));
  let legacy;
  for (const p of peers) {
    if (!p.c || p.c.closed) continue;
    if (p.lobbyPingUpdates) {
      // Ping labels are replaceable. Leave queued gameplay/control data ahead of them.
      if (p.c.backlog === 0) p.c.sendFrame(pings);
    } else {
      legacy ||= frame(1, Buffer.from(JSON.stringify(lobbyMsg()), 'utf8'));
      p.c.sendFrame(legacy);
    }
  }
}
function scoreMsg() {
  return { t: 'sc', score: G.score, round: G.round, kills: G.kills, ffa: isFFA() ? [...(FFA.match?.scores || new Map())].sort((a,b)=>b[1]-a[1]).map(([id,k])=>({id,k})) : undefined,
    objective: isBomb() ? bombStateMessage() : undefined,
    players: [...players.values()].map(p => ({ id: p.id, k: p.k, d: p.d, hs: p.hs, alive: p.alive, ping: p.bot ? 0 : Math.round(p.rtt), team: p.team, infected: isInfection() && p.infected ? 1 : 0, name: p.name, op: p.op, money: p.money, bot: p.bot ? 1 : 0 })) };
}
function pickOp(team) { const used = new Set(teamList(team).map(p => p.op)); for (let i = 0; i < 17; i++) if (!used.has(i)) return i; return 0; }
function ensureHost() { if ([...players.values()].some(p => p.host)) return; const f = realPlayers()[0]; if (f) f.host = true; }

/* ---------------- geometry ---------------- */
/* Exact static-geometry BVH for line-of-sight queries. The old routine tested
   every obstacle for every sight ray. A 56-survivor Outbreak squad can issue
   hundreds of these checks per second, and the larger maps contain 477–562
   boxes. This index only prunes impossible boxes; leaf intersections use the
   same slab math and tie behavior as the original full scan. */
const wallIndexCache = new WeakMap();
const wallRayStats = { queries:0, linearQueries:0, bvhQueries:0, boxTests:0, fullScanEquivalent:0, maxBoxTests:0, indexBuilds:0, indexBuildMs:0, maxIndexBuildMs:0 };
function wallBoxEntry(b,ox,oy,oz,dx,dy,dz,limit){
  let best=Infinity,t0=0,t1=limit,a,c,s;const ex=Math.abs(dx)<1e-9,ey=Math.abs(dy)<1e-9,ez=Math.abs(dz)<1e-9,ix=ex?0:1/dx,iy=ey?0:1/dy,iz=ez?0:1/dz,bottom=b[5]||0;
  if(ex){if(ox<b[0]||ox>b[1])return Infinity;}else{a=(b[0]-ox)*ix;c=(b[1]-ox)*ix;if(a>c){s=a;a=c;c=s;}if(a>t0)t0=a;if(c<t1)t1=c;if(t0>t1)return Infinity;}
  if(ez){if(oz<b[2]||oz>b[3])return Infinity;}else{a=(b[2]-oz)*iz;c=(b[3]-oz)*iz;if(a>c){s=a;a=c;c=s;}if(a>t0)t0=a;if(c<t1)t1=c;if(t0>t1)return Infinity;}
  if(ey){if(oy<bottom||oy>b[4])return Infinity;}else{a=(bottom-oy)*iy;c=(b[4]-oy)*iy;if(a>c){s=a;a=c;c=s;}if(a>t0)t0=a;if(c<t1)t1=c;if(t0>t1)return Infinity;}
  if(t0<best)best=t0;return best;
}
function wallBoundsEntry(q,ox,oy,oz,dx,dy,dz,limit){
  let t0=0,t1=limit,a,c,s;const ex=Math.abs(dx)<1e-9,ey=Math.abs(dy)<1e-9,ez=Math.abs(dz)<1e-9,ix=ex?0:1/dx,iy=ey?0:1/dy,iz=ez?0:1/dz;
  if(ex){if(ox<q.minX||ox>q.maxX)return Infinity;}else{a=(q.minX-ox)*ix;c=(q.maxX-ox)*ix;if(a>c){s=a;a=c;c=s;}if(a>t0)t0=a;if(c<t1)t1=c;if(t0>t1)return Infinity;}
  if(ez){if(oz<q.minZ||oz>q.maxZ)return Infinity;}else{a=(q.minZ-oz)*iz;c=(q.maxZ-oz)*iz;if(a>c){s=a;a=c;c=s;}if(a>t0)t0=a;if(c<t1)t1=c;if(t0>t1)return Infinity;}
  if(ey){if(oy<q.minY||oy>q.maxY)return Infinity;}else{a=(q.minY-oy)*iy;c=(q.maxY-oy)*iy;if(a>c){s=a;a=c;c=s;}if(a>t0)t0=a;if(c<t1)t1=c;if(t0>t1)return Infinity;}
  return t0;
}
function wallIndex(boxes){
  let root=wallIndexCache.get(boxes);if(root)return root;
  const diag=eventLoopDiagnostics.enabled,started=diag?performance.now():0;
  const items=boxes.map(box=>({box,minX:box[0],maxX:box[1],minY:box[5]||0,maxY:box[4],minZ:box[2],maxZ:box[3],cx:(box[0]+box[1])*.5,cy:((box[5]||0)+box[4])*.5,cz:(box[2]+box[3])*.5}));
  function build(list){
    if(!list.length)return null;
    const q={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity,left:null,right:null,boxes:null};
    for(const x of list){q.minX=Math.min(q.minX,x.minX);q.maxX=Math.max(q.maxX,x.maxX);q.minY=Math.min(q.minY,x.minY);q.maxY=Math.max(q.maxY,x.maxY);q.minZ=Math.min(q.minZ,x.minZ);q.maxZ=Math.max(q.maxZ,x.maxZ);}
    if(list.length<=8){q.boxes=list.map(x=>x.box);return q;}
    const spans=[q.maxX-q.minX,q.maxY-q.minY,q.maxZ-q.minZ],axis=spans[0]>=spans[1]&&spans[0]>=spans[2]?'cx':spans[1]>=spans[2]?'cy':'cz';
    list.sort((a,b)=>a[axis]-b[axis]);const mid=list.length>>1;q.left=build(list.slice(0,mid));q.right=build(list.slice(mid));return q;
  }
  root=build(items);wallIndexCache.set(boxes,root);
  if(diag){const ms=performance.now()-started;wallRayStats.indexBuilds++;wallRayStats.indexBuildMs+=ms;wallRayStats.maxIndexBuildMs=Math.max(wallRayStats.maxIndexBuildMs,ms);}
  return root;
}
function wallRayNode(q,ox,oy,oz,dx,dy,dz,best,diag){
  if(!q||wallBoundsEntry(q,ox,oy,oz,dx,dy,dz,best)>=best)return best;
  if(q.boxes){let tested=0;for(const b of q.boxes){tested++;const hit=wallBoxEntry(b,ox,oy,oz,dx,dy,dz,best);if(hit<best)best=hit;}if(diag){wallRayStats.boxTests+=tested;wallRayStats.maxBoxTests=Math.max(wallRayStats.maxBoxTests,tested);}return best;}
  const leftNear=wallBoundsEntry(q.left,ox,oy,oz,dx,dy,dz,best),rightNear=wallBoundsEntry(q.right,ox,oy,oz,dx,dy,dz,best);
  if(leftNear<=rightNear){best=wallRayNode(q.left,ox,oy,oz,dx,dy,dz,best,diag);return wallRayNode(q.right,ox,oy,oz,dx,dy,dz,best,diag);}
  best=wallRayNode(q.right,ox,oy,oz,dx,dy,dz,best,diag);return wallRayNode(q.left,ox,oy,oz,dx,dy,dz,best,diag);
}
function wallDistLinear(m,ox,oy,oz,dx,dy,dz,maxT,diag){
  const B=m.boxes;let best=maxT;
  for(let i=0;i<B.length;i++){
    if(diag)wallRayStats.boxTests++;
    const b=B[i],bottom=b[5]||0;let t0=0,t1=best,a,c,s;
    const ex=Math.abs(dx)<1e-9,ey=Math.abs(dy)<1e-9,ez=Math.abs(dz)<1e-9,ix=ex?0:1/dx,iy=ey?0:1/dy,iz=ez?0:1/dz;
    if(ex){if(ox<b[0]||ox>b[1])continue;}else{a=(b[0]-ox)*ix;c=(b[1]-ox)*ix;if(a>c){s=a;a=c;c=s;}if(a>t0)t0=a;if(c<t1)t1=c;if(t0>t1)continue;}
    if(ez){if(oz<b[2]||oz>b[3])continue;}else{a=(b[2]-oz)*iz;c=(b[3]-oz)*iz;if(a>c){s=a;a=c;c=s;}if(a>t0)t0=a;if(c<t1)t1=c;if(t0>t1)continue;}
    if(ey){if(oy<bottom||oy>b[4])continue;}else{a=(bottom-oy)*iy;c=(b[4]-oy)*iy;if(a>c){s=a;a=c;c=s;}if(a>t0)t0=a;if(c<t1)t1=c;if(t0>t1)continue;}
    if(t0<best)best=t0;
  }
  return best;
}
function wallDist(m,ox,oy,oz,dx,dy,dz,maxT){
  const B=m.boxes,diag=eventLoopDiagnostics.enabled;if(diag){wallRayStats.queries++;wallRayStats.fullScanEquivalent+=B.length;}
  // Tiny maps are faster with the original ordered scan. Use the index only
  // once its pruning repays the tree traversal cost on larger obstacle sets.
  if(B.length<=70){if(diag)wallRayStats.linearQueries++;return wallDistLinear(m,ox,oy,oz,dx,dy,dz,maxT,diag);}
  if(diag)wallRayStats.bvhQueries++;
  const result=wallRayNode(wallIndex(B),ox,oy,oz,dx,dy,dz,maxT,diag);return result<maxT?result:maxT;
}
function inBox(m, x, z, y, pad) { const B = m.boxes; for (let i = 0; i < B.length; i++) { const b = B[i]; if (b[4] <= y + 0.35 || (b[5]||0)>=y+BODY_H) continue; if (x > b[0] - pad && x < b[1] + pad && z > b[2] - pad && z < b[3] + pad) return true; } return false; }
function groundAt(m, x, z, feetY) { let y = 0; for (const b of m.boxes) { if (b[4] > feetY + 0.35) continue; const dx = x - clamp(x,b[0],b[1]), dz = z - clamp(z,b[2],b[3]); if (dx*dx+dz*dz < 0.46*0.46) y = Math.max(y,b[4]); } return y; }
function settleBotHeight(b, dt, m) {
  const oldY=b.y; b.vy=(b.vy||0)-22*dt;b.y+=b.vy*dt;
  if(b.y>oldY)for(const box of m.boxes){const bottom=box[5]||0;if(bottom && oldY+BODY_H<=bottom+.03 && b.y+BODY_H>bottom && b.x>box[0]-.35&&b.x<box[1]+.35&&b.z>box[2]-.35&&b.z<box[3]+.35){b.y=bottom-BODY_H;b.vy=0;}}
  const gy=groundAt(m,b.x,b.z,b.y);if(b.y<=gy){b.y=gy;b.vy=0;}
}

function boxOverlap(m, x, z, pad) { const B = collisionCell(m,x,z); for (let i = 0; i < B.length; i++) { const b = B[i]; if (x > b[0] - pad && x < b[1] + pad && z > b[2] - pad && z < b[3] + pad) return true; } return false; }
function bodyH(cr, pr) { return BODY_H * (1 - 0.22 * cr - 0.5 * pr); }
function rayAabb(ox, oy, oz, dx, dy, dz, x0, x1, y0, y1, z0, z1) {   /* returns [t, hitY] or null */
  let t0 = 0, t1 = 1e9;
  const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) return null; continue; }
    let a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k]; if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return null;
  }
  return [t0, oy + dy * t0];
}
function posAt(p, t) {     /* lag compensation: where was p at server time t */
  const h = p.hist; if (!h.length) return p;
  if (t >= h[h.length - 1].t) return h[h.length - 1];
  if (t <= h[0].t) return h[0];
  for (let i = h.length - 1; i > 0; i--) if (h[i - 1].t <= t) { const a = h[i - 1], b = h[i], k = (t - a.t) / Math.max(1, b.t - a.t); return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, cr: a.cr + (b.cr - a.cr) * k, pr: a.pr + (b.pr - a.pr) * k }; }
  return h[0];
}

/* ---------------- spawns ---------------- */
function spawnPoint(m, team, taken) {
  let x0, x1, z0, z1;
  if (team === 0) {
    if (m.id === 'blackwater_old_quarter' && isInfection() && players.size >= 16) {
      const posts = [[-15, 50], [1, 53], [16, 50]];
      const post = posts[taken.length % posts.length];
      x0 = post[0] - 4.5; x1 = post[0] + 4.5; z0 = post[1] - 4; z1 = post[1] + 4;
    } else {
      x0 = m.spawn.x - 6; x1 = m.spawn.x + 6; z0 = m.spawn.z - 5; z1 = m.spawn.z + 4;
    }
  }
  else { x0 = m.botSpawn.x0; x1 = m.botSpawn.x1; z0 = m.botSpawn.z0; z1 = m.botSpawn.z1; }
  let sep = 1.6;
  for (let t = 0; t < 400; t++) {
    if (t === 120) sep = 1.1; if (t === 260) sep = 0.7;
    const x = clamp(x0 + Math.random() * (x1 - x0), m.area.x0 + 1.5, m.area.x1 - 1.5), z = clamp(z0 + Math.random() * (z1 - z0), m.area.z0 + 1.5, m.area.z1 - 1.5);
    if (boxOverlap(m, x, z, 0.9)) continue;
    let ok = true; for (const q of taken) if (Math.hypot(q.x - x, q.z - z) < sep) { ok = false; break; }
    if (ok) return { x, z };
  }
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
}

/* ---------------- rounds ---------------- */
function phaseMsg(extra) { return Object.assign({ t: 'ph', ph: G.phase, round: G.round, ms: Math.max(0, G.phaseEnd - now()), score: G.score, rounds: G.rounds, time: G.time, kills: G.kills,
  attackTeam: isBomb() ? (BOMB.state ? BOMB.state.attackTeam : bombAttackTeamForRound(G.round || 1)) : undefined, objective: isBomb() ? bombStateMessage() : undefined }, extra || {}); }
function beginBombMatch() {
  BOMB.openingTeam = BOMB.nextOpeningTeam === 1 ? 1 : 0;
  BOMB.matchStartConfirmed = false;
}
function confirmBombMatchStart() {
  if (BOMB.matchStartConfirmed || !BOMB.state || BOMB.state.round !== 1) return false;
  BOMB.nextOpeningTeam = 1 - BOMB.openingTeam;
  BOMB.matchStartConfirmed = true;
  return true;
}
function bombAttackTeamForRound(round) { return ModeRules.bombAttackTeamForRound(round, BOMB.settings.bestOf, BOMB.openingTeam); }
function bombStateMessage() {
  const s = BOMB.state;
  if (!s) return { phase: 'idle', settings: BOMB.settings, sites: BOMB.sites, unsupportedReason: BOMB.unsupportedReason };
  const actorName=id=>{const p=id==null?null:players.get(id);return p&&typeof p.name==='string'?p.name.slice(0,24):null;};
  return { phase:s.phase, round:s.round, attackTeam:s.attackTeam, defendTeam:s.defendTeam, carrierId:s.carrierId, carrierName:s.carrierId==null?null:(actorName(s.carrierId)||s.carrierName||null),
    plantedBy:s.plantedBy?{id:s.plantedBy.id,name:s.plantedBy.name||actorName(s.plantedBy.id)||null}:null,
    defusedBy:s.defusedBy?{id:s.defusedBy.id,name:s.defusedBy.name||actorName(s.defusedBy.id)||null}:null,
    droppedBy:s.droppedBy?{id:s.droppedBy.id,name:s.droppedBy.name||actorName(s.droppedBy.id)||null}:null,
    siteId:s.siteId, x:s.x, y:s.y, z:s.z, explodeInMs:s.phase==='planted'?Math.max(0,s.explodeAt-now()):0,
    use:s.use?{action:s.use.action,actorId:s.use.actorId,actorName:s.use.actorName||actorName(s.use.actorId)||null,siteId:s.use.siteId,x:s.use.x,y:s.use.y||0,z:s.use.z,remainingMs:Math.max(0,s.use.completeAt-now()),durationMs:s.use.completeAt-s.use.startedAt}:null,
    sites:s.sites, scores:G.score, settings:BOMB.settings, revision:s.revision };
}
function bombStateBroadcast() { if (isBomb()) bcast({t:'objective', objective:bombStateMessage()}); }
function prepareBombSites() {
  BOMB.sites=null; BOMB.supportMap=G.map; BOMB.unsupportedReason='';
  try { const map=mapData(); BOMB.sites=ModeRules.resolveBombSites(buildNav(map),map.area,map.bombSites); }
  catch (e) { BOMB.sites=null; BOMB.unsupportedReason='Map navigation data is invalid'; }
  if (!BOMB.sites) BOMB.unsupportedReason=BOMB.unsupportedReason||'This map has no validated pair of reachable bomb sites';
  else BOMB.unsupportedReason='';
  return BOMB.sites;
}
function bombRoundStart() {
  const attackers=teamList(bombAttackTeamForRound(G.round)).filter(p=>p.alive).sort((a,b)=>a.id-b.id);
  if (!prepareBombSites()) { endMatchForfeit(); return false; }
  const carrier=attackers.length?attackers[(G.round-1)%attackers.length]:null;
  BOMB.state=ModeRules.createBombRound({round:G.round,attackTeam:bombAttackTeamForRound(G.round),carrierId:carrier?carrier.id:null,carrierName:carrier?carrier.name:null,sites:BOMB.sites,settings:BOMB.settings});
  return !!BOMB.state;
}
function bombActor(p) { return p ? {id:p.id,team:p.team,name:typeof p.name==='string'?p.name.slice(0,24):null,x:p.x,y:p.y||0,z:p.z,alive:!!p.alive} : null; }
function bombDropCarrier(p) {
  const s=BOMB.state;
  if (!s||s.phase!=='carried'||!p||s.carrierId!==p.id) return false;
  const m=mapData(), point={x:p.x,y:groundAt(m,p.x,p.z,p.y),z:p.z};
  if (!Number.isFinite(point.x+point.y+point.z)||boxOverlap(m,point.x,point.z,.65)) return false;
  return ModeRules.dropBomb(s,p.id,point);
}
function bombAction(p, action) {
  const s=BOMB.state,t=now(),actor=bombActor(p);
  if (!isBomb()||G.phase!=='live'||!s||!p||!p.alive) return false;
  let changed=false;
  if (action==='pickup') changed=ModeRules.pickupBomb(s,actor);
  else if (action==='plant'||action==='defuse') changed=ModeRules.beginUse(s,actor,action,t);
  else if (action==='cancel') changed=ModeRules.cancelUse(s,p.id);
  else if (action==='drop') changed=bombDropCarrier(p);
  if (changed) {
    bombStateBroadcast(); bcast(scoreMsg());
    const event=action==='pickup'?'recovered':action==='drop'?'dropped':action==='plant'||action==='defuse'?'started':action==='cancel'?'cancelled':null;
    if(event)bcast({t:'objfx',event,action:action==='pickup'?'pickup':action==='drop'?'drop':action,actorName:p.name||null});
  }
  return changed;
}
function bombTick(t) {
  const s=BOMB.state;if(!isBomb()||G.phase!=='live'||!s)return;
  const pending=s.use?{action:s.use.action,actorId:s.use.actorId,actorName:s.use.actorName||null}:null,actor=pending?players.get(pending.actorId):null,event=ModeRules.advance(s,t,bombActor(actor));
  if(event&&event.event==='cancelled'){bombStateBroadcast();bcast({t:'objfx',event:'cancelled',actorName:pending&&((actor&&actor.name)||pending.actorName)||null,action:pending&&pending.action||null});}else if(event&&event.event==='planted'){bombStateBroadcast();bcast({t:'objfx',event:'planted',site:s.siteId,actorName:s.plantedBy&&s.plantedBy.name||null});}
  else if(event&&event.event==='defused'){bombStateBroadcast();bcast({t:'objfx',event:'defused',actorName:s.defusedBy&&s.defusedBy.name||null});endRound(s.defendTeam,'Bomb defused');return;}
  else if(event&&event.event==='exploded'){bombStateBroadcast();bcast({t:'objfx',event:'exploded',site:s.siteId});endRound(s.attackTeam,'Bomb exploded');return;}
  const aa=alive(s.attackTeam),dd=alive(s.defendTeam),result=ModeRules.bombWinner(s,aa,dd,t>=G.phaseEnd);
  if(result==='attack')endRound(s.attackTeam,s.phase==='planted'?'Attackers secured the objective':'Attackers eliminated the defense');
  else if(result==='defend')endRound(s.defendTeam,s.phase==='planted'?'Defense eliminated the attackers after the plant':'Defense survived the round');
}
function bombBotObjective(p,t,allowUse) {
  const s=BOMB.state;if(!isBomb()||G.phase!=='live'||!s||!p||!p.bot||!p.alive)return;
  const A=p.ai,site=s.sites[(p.id%2?'A':'B')];
  // Recompute the objective every decision so stale destinations cannot pull
  // a bot away from a carrier, dropped bomb, or active plant/defuse action.
  A.bombGoal=null;
  // A visible enemy is not a reason to cancel an authoritative hold action.
  // bombTick() still cancels if the actor dies or leaves the validated radius.
  if(s.use&&s.use.actorId===p.id)return;
  if(s.phase==='dropped'&&p.team===s.attackTeam&&Math.hypot(p.x-s.x,p.z-s.z)<1.55&&ModeRules.pickupBomb(s,bombActor(p))){bombStateBroadcast();bcast({t:'objfx',event:'recovered',action:'pickup',actorName:p.name||null});return;}
    if(s.phase==='carried'&&s.carrierId===p.id){
    const goal=site;A.bombGoal=[goal.x,goal.z,goal.y||0];
    if(allowUse&&Math.hypot(p.x-goal.x,p.z-goal.z)<=1.8&&!s.use&&ModeRules.beginUse(s,bombActor(p),'plant',t)){bombStateBroadcast();bcast({t:'objfx',event:'started',action:'plant',site:s.sites[s.use.siteId].id,actorName:p.name||null});}
    return;
  }
  if(s.phase==='dropped'&&p.team===s.attackTeam){A.bombGoal=[s.x,s.z,s.y||0];return;}
  if(s.phase==='planted'&&p.team===s.defendTeam){A.bombGoal=[s.x,s.z,s.y||0];if(allowUse&&Math.hypot(p.x-s.x,p.z-s.z)<=1.8&&!s.use&&ModeRules.beginUse(s,bombActor(p),'defuse',t)){bombStateBroadcast();bcast({t:'objfx',event:'started',action:'defuse',site:s.siteId,actorName:p.name||null});}return;}
  if(s.phase==='carried'&&p.team===s.defendTeam){const carrier=players.get(s.carrierId);if(carrier)A.bombGoal=[carrier.x,carrier.z,carrier.y||0];else A.bombGoal=[site.x,site.z,site.y||0];return;}
  if(s.phase==='carried'&&p.team===s.attackTeam){const carrier=players.get(s.carrierId);A.bombGoal=carrier?[carrier.x,carrier.z,carrier.y||0]:[site.x,site.z,site.y||0];return;}
  if(p.team===s.defendTeam)A.bombGoal=[site.x,site.z,site.y||0];
}
function spawnPlayer(p, m, taken, forced) {
  const sp = forced || spawnPoint(m, p.team, taken); taken.push(sp);
  p.x = sp.x; p.z = sp.z; p.y = 0; p.vy = 0; p.moveCredit = 0.6; p.verticalCredit = 0.35; p.creditT = now(); p.airSince = 0; p.yaw = p.team === 0 ? 0 : Math.PI; p.pitch = 0; p.cr = 0; p.pr = 0; p.walk = false; p.hp = 100; p.spawnShieldUntil=0; p.alive = true; p.spec = false; p.ep++; p.lastIn = now(); p.hist = []; p.lastShot = 0; p.nextShot = 0; if (p.bot) p.ai = newAI();
  p.cur = p.owned.has(p.cur) ? p.cur : (p.owned.has('hawk') ? 'hawk' : 'pistol'); refillAmmo(p);
  send(p, { t: 'sp', x: r2(sp.x), y: 0, z: r2(sp.z), yaw: r2(p.yaw), ep: p.ep, money: p.money, owned: [...p.owned], armor: p.armor, cur: p.cur });
}
function startRound() {
  if (isDeathmatch()) DM.respawns.clear();
  if (isFFA()) FFA.respawns.clear();
  if (isInfection()) { infectionReset(); players.forEach(p => { p.team=p.bot&&Number.isInteger(p.homeTeam)?p.homeTeam:p.team; p.infected=false; p.money=CFG.startMoney; p.lostKit=false; newLoadout(p); }); pushLobby(); }
  G.round++; G.phase = 'buy'; G.phaseEnd = now() + BUY_SECS * 1000;
  syncBots(true);
  const m = mapData(), taken = [[], []];
  players.forEach(p => {
    if (p.team !== 0 && p.team !== 1) return;
    if (p.lostKit) { newLoadout(p); p.lostKit = false; }
    spawnPlayer(p, m, taken[p.team]);
    if (p.bot) botBuy(p);
  });
  if (isBomb() && !bombRoundStart()) return;
  bcast(phaseMsg()); bcast(scoreMsg()); log('round', G.round, 'buy phase');
}
function goLive() {
  G.phase = 'live'; if (isBomb() && G.round === 1) confirmBombMatchStart(); G.liveStart = now(); G.phaseEnd = now() + (isCoop() ? 3600 : isBomb() ? BOMB.settings.roundSeconds : G.time) * 1000; bcast(phaseMsg());
  resetLiveTimingDiagnostics();
  if (isCoop()) { startWave(1); }
  if (isInfection()) {
    // Blue and Red are visual/identity teams, but all start as companions.
    // Patient Zero is selected from the full living roster after incubation.
    INF.started = false;
    INF.chooseAt = now() + 10000;
    bcast(infectionMsg());
  }
}
function alive(t) { let n = 0; players.forEach(p => { if (!p.alive) return; if (isInfection() ? (!!p.infected === (t === 1)) : p.team === t) n++; }); return n; }
function endRound(win, why) {
  if (G.phase !== 'live') return;
  if (isBomb() && BOMB.state && BOMB.state.use) ModeRules.cancelUse(BOMB.state);
  G.phase = 'roundend'; G.phaseEnd = now() + ROUNDEND_SECS * 1000; G.lastWin = win;
  if (win >= 0) G.score[win]++;
  players.forEach(p => {
    if (p.team !== 0 && p.team !== 1) return;
    p.money = Math.min(CFG.maxMoney, p.money + (win === p.team ? CFG.winBonus : CFG.lossBonus));
    if (!p.alive) p.lostKit = true;
  });
  bcast(phaseMsg({ win, why })); bcast(scoreMsg()); log('round', G.round, 'won by', win < 0 ? 'nobody' : win, '-', why, G.score.join(':'));
}
function checkElimination() {
  if (G.phase !== 'live' || isCoop() || isDeathmatch()) return;
  if (isFFA()) return;
  if (isBomb()) { bombTick(now()); return; }
  if (isInfection()) { if (INF.started && alive(0)===0) endRound(1,'The infection consumed the city'); else if(INF.started)infectionLastStand(); return; }
  const a = alive(0), b = alive(1);
  if (a === 0 && b === 0) endRound(-1, 'Everyone is down');
  else if (a === 0) endRound(1, 'Team eliminated');
  else if (b === 0) endRound(0, 'Team eliminated');
}
function endMatch(why) {
  if (G.phase === 'matchend') return;
  if (isBomb() && BOMB.state && BOMB.state.use) ModeRules.cancelUse(BOMB.state);
  DM.respawns.clear(); FFA.respawns.clear();
  const ffaWinnerId=isFFA()&&FFA.match?(FFA.match.winnerId!=null?FFA.match.winnerId:ModeRules.ffaTimedWinner(FFA.match)):null;
  const win = isFFA() ? (ffaWinnerId == null ? -1 : ffaWinnerId) : G.score[0] > G.score[1] ? 0 : G.score[1] > G.score[0] ? 1 : -1;
  G.phase = 'matchend'; G.phaseEnd = now() + MATCHEND_SECS * 1000;
  bcast(phaseMsg({ win, winnerId: isFFA() ? ffaWinnerId : undefined, why: why || 'Match over' })); bcast(scoreMsg()); log('match over', G.score.join(':'));
}
function backToLobby() { DM.respawns.clear(); FFA.respawns.clear(); BOMB.state=null; FFA.match=null; G.phase = 'lobby'; G.round = 0; G.score = [0, 0]; players.forEach(p => { p.alive = false; p.spec = false; }); bcast({ t: 'lobbyreset' }); syncBots(); pushLobby(); }
function startMatch() {
  G.phase = 'match'; G.round = 0; G.score = [0, 0]; DM.respawns.clear();
  FFA.respawns.clear(); FFA.match=isFFA()?ModeRules.createFFA({killLimit:G.kills,matchSeconds:G.time,startedAt:now()}):null;
  BOMB.score=[0,0];BOMB.state=null;
  if(isBomb()){
    BOMB.settings=ModeRules.settings(BOMB.settings);G.rounds=Math.ceil(BOMB.settings.bestOf/2);G.time=BOMB.settings.roundSeconds;
    if(!prepareBombSites()){G.phase='lobby';pushLobby();return false;}
    beginBombMatch();
  }
  syncBots(true);
  if (groupMode()) { let i = 0, counts=[0,0]; players.forEach(p => { if (p.bot && Number.isInteger(p.homeTeam)) p.team=p.homeTeam; else p.team=counts[0]<=counts[1]?0:1; counts[p.team]++; p.infected=false; p.op = (i++) % 17; }); obReset(); pushLobby(); }
  // Navigation graph construction is synchronous and cold builds measured
  // 170–227 ms on the larger authored maps. Build it during match setup,
  // before the first live AI tick, so bot hosts do not hitch/freeze when the
  // first patrol, squad, respawn, or Hollowed route is requested.
  if (players.size > humanCount() || isCoop() || isInfection() || isDeathmatch()) {
    try { buildNav(mapData()); }
    catch (error) { log('navigation prewarm failed; live AI will retry', error && error.stack || error); }
  }
  players.forEach(p => { p.k = 0; p.d = 0; p.hs = 0; p.money = CFG.startMoney; p.lostKit = false; newLoadout(p); });
  bcast({ t: 'start', mode: G.mode, map: G.map, stations: ammoStations(), rounds: G.rounds, time: G.time, kills: G.kills, weapons: WKEYS, cash: CFG.startMoney, teams: DATA.teams });
  log('match start on', G.map, 'players', players.size, 'bots', players.size - humanCount(), 'mode', G.mode, 'requested co-op bots', BOTCFG.coop);
  startRound();
}
function teamsOk() {
  if (groupMode()) return players.size > 0;
  // FFA needs two actual combatants. A lone human with no bots would otherwise
  // start a live match with nobody to fight and a meaningless timed result.
  if (isFFA()) return players.size >= 2;
  return teamList(0).length > 0 && teamList(1).length > 0;
}
/* Continuous Team Deathmatch: server-owned kills, respawns, clock, and win conditions.
   The existing Tactical round lifecycle is deliberately left unchanged. */
function deathmatchRespawn(p) {
  if (!p || !players.has(p.id) || G.phase !== 'live' || !(isDeathmatch()||isFFA())) return false;
  const map = mapData(), nav = buildNav(map);
  const live = [...players.values()].filter(q => q !== p && q.alive);
  // The shared solo policy uses navigable ground; never trust client spawn coordinates.
  const nodes = nav.nodes || (nav.c ? (() => { const a=[];for(let j=0;j<nav.h;j++)for(let i=0;i<nav.w;i++){const n=j*nav.w+i;if(!nav.c[n])a.push({x:nav.x0+i+.5,y:nav.y?.[n]||0,z:nav.z0+j+.5});}return a;})() : []);
  const spot = Deathmatch.safeSpawn({nodes,reachable:nav.reachable},p.id,isFFA()?99:p.team,live,n=>n.x>map.area.x0+1.5&&n.x<map.area.x1-1.5&&n.z>map.area.z0+1.5&&n.z<map.area.z1-1.5&&!inBox(map,n.x,n.z,n.y,.55));
  if (!spot) return false;
  // Deathmatch retains the owned loadout; only health, armor, and carried ammo reset.
  const taken=[];spawnPlayer(p,map,taken,spot);
  p.nextShot=now()+600;
  send(p,{t:isFFA()?'ffa-respawn':'dm-respawn',shield:isFFA()?ModeRules.FFA_DEFAULTS.spawnShieldMs:1200});
  p.spawnShieldUntil=now()+(isFFA()?ModeRules.FFA_DEFAULTS.spawnShieldMs:1200);
  bcast(scoreMsg());
  return true;
}
function deathmatchTick(t) {
  if (!(isDeathmatch()||isFFA()) || G.phase !== 'live') return;
  const pending=isFFA()?FFA.respawns:DM.respawns;
  for(const [id,due] of pending){if(t<due)continue;const p=players.get(id);if(!p){pending.delete(id);continue;}if(deathmatchRespawn(p))pending.delete(id);else pending.set(id,t+750);}
  if(t>=G.phaseEnd)endMatch('Time expired');
}
function checkForfeit() {
  if (G.phase === 'lobby' || G.phase === 'matchend' || isCoop()) return;
  if (!teamsOk()) { G.score = G.score.slice(); endMatchForfeit(); }
}
function endMatchForfeit() { if (isBomb() && BOMB.state && BOMB.state.use) ModeRules.cancelUse(BOMB.state); G.phase = 'matchend'; G.phaseEnd = now() + 5000; bcast(phaseMsg({ win: -1, why: 'A team left the match' })); }


/* ---------------- co-op outbreak: everyone against the Hollowed ---------------- */
const ZT = {
  walker: { hp: 100, spd: 2.3, dmg: 14, rate: 0.9, reach: 1.7, bounty: 100, w: 1.0, h: 1.0, r: 0.4 },
  sprinter: { hp: 100, spd: 5.0, dmg: 10, rate: 0.6, reach: 1.6, bounty: 140, w: 0.9, h: 1.0, r: 0.38 },
  brute: { hp: 100, spd: 2.0, dmg: 34, rate: 1.4, reach: 2.3, bounty: 500, w: 1.4, h: 1.28, r: 0.6 },
  spitter: { hp: 100, spd: 2.2, dmg: 9, rate: 2.3, reach: 1.6, bounty: 200, w: 0.88, h: 1.05, r: 0.4 }
};
const ZKINDS = ['walker', 'sprinter', 'brute', 'spitter'];
const OB_REST = 14, ZMAX = 56;
const OB = { phase: 'prep', wave: 0, quota: 0, spawned: 0, spawnCd: 0, spawnBurstRemaining: 0, spawnBurstType: null, rest: 0, tail: 0, t: 0, total: 0, zs: new Map(), nextZ: 1000, nav: null, navMap: '', fieldT: 0, msgT: 0 };
const isCoop = () => G.mode === 'outbreak';
const isInfection = () => G.mode === 'infection';
const groupMode = () => isCoop() || isInfection();
function sameCombatSide(a,b) { return isFFA() ? a===b : isInfection() ? !!a.infected === !!b.infected : (isCoop() || a.team === b.team); }
const humans = () => [...players.values()].filter(p => isInfection() ? !p.infected : (isCoop() || p.team === 0));
function turnTo(a, b, k) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + clamp(d, -k, k); }
function buildNav(m) {
  if (OB.navMap === m.id && OB.nav) return OB.nav;
  const diag=eventLoopDiagnostics.enabled,buildT=diag?performance.now():0;
  OB.nav=Nav.build(m.id === 'blackwater_old_quarter' ? { ...m, optimized: true } : m);
  // Build the static collision-cell index with the navigation graph during
  // match setup. Its first-use allocation must never land inside a live bot
  // path/replan and monopolize an authoritative tick.
  Nav.prepareCollisionIndex(OB.nav.boxes);
  // Cover/retreat line checks use the same immutable map boxes. Build their
  // spatial index here, before live AI decisions can first request cover.
  Tactics.prepareRayIndex(OB.nav.boxes);
  OB.nav.spawnCells=[];
  for(let k=0;k<OB.nav.columns.length;k++)if(!OB.nav.c[k]&&OB.nav.columns[k].some(id=>OB.nav.nodes[id].y<.3))OB.nav.spawnCells.push(k);
  const start=Nav.nearest(OB.nav,m.spawn.x,0,m.spawn.z),seen=new Uint8Array(OB.nav.nodes.length),q=[start];if(start>=0)seen[start]=1;
  for(let i=0;i<q.length;i++)for(const [to]of OB.nav.edges[q[i]]||[])if(!seen[to]){seen[to]=1;q.push(to);}
  OB.nav.reachable=seen;OB.nav.elevated=OB.nav.nodes.filter((n,i)=>seen[i]&&n.y>=.6&&n.y<=5);OB.nav.vantages=OB.nav.elevated.filter(n=>n.y>=3.5);OB.navMap=m.id;
  if(diag){const ms=performance.now()-buildT;botWorkDiagnostics.navBuilds++;botWorkDiagnostics.navBuildMs+=ms;botWorkDiagnostics.navBuildMaxMs=Math.max(botWorkDiagnostics.navBuildMaxMs,ms);}
  return OB.nav;
}
function collisionCell(m, x, z) {
  let grid = collisionGridCache.get(m);
  if (!grid) {
    grid = new Map(); collisionGridCache.set(m, grid); collisionStats.grids++;
    for (const b of m.boxes) {
      const ix0 = Math.floor((b[0] - COLLISION_PAD) / COLLISION_CELL), ix1 = Math.floor((b[1] + COLLISION_PAD) / COLLISION_CELL);
      const iz0 = Math.floor((b[2] - COLLISION_PAD) / COLLISION_CELL), iz1 = Math.floor((b[3] + COLLISION_PAD) / COLLISION_CELL);
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
        const key = ix + ',' + iz, list = grid.get(key); if (list) list.push(b); else grid.set(key, [b]);
      }
    }
  }
  return grid.get(Math.floor(x / COLLISION_CELL) + ',' + Math.floor(z / COLLISION_CELL)) || [];
}
function hasInitialCircleContact(m, o, r) {
  if (r > COLLISION_PAD) return true; // Preserve exact semantics for any future larger body.
  /* The legacy order scans solids before clamping to map bounds.  An illegal
     long move can therefore be clamped into a wall and require recovery even
     when its source position is clear; retain the full path at every edge. */
  if (o.x < m.area.x0 + r || o.x > m.area.x1 - r || o.z < m.area.z0 + r || o.z > m.area.z1 - r) return true;
  const y = o.y || 0, local = collisionCell(m, o.x, o.z); collisionStats.candidates += local.length;
  for (const b of local) {
    if (b[4] <= y + .35 || (b[5] || 0) >= y + BODY_H) continue;
    const dx = o.x - clamp(o.x, b[0], b[1]), dz = o.z - clamp(o.z, b[2], b[3]);
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}
function resolveCircle(m, o, r) {
  collisionStats.calls++;
  /* With no initial contact, the legacy resolver can only clamp the map edge.
     A padded grid proves that no omitted box can touch this circle.  Once any
     contact exists, run the original ordered algorithm verbatim. */
  if (!hasInitialCircleContact(m, o, r)) {
    collisionStats.openFast++; o.x = clamp(o.x, m.area.x0 + r, m.area.x1 - r); o.z = clamp(o.z, m.area.z0 + r, m.area.z1 - r); return;
  }
  collisionStats.full++; return resolveCircleFull(m, o, r);
}
function resolveCircleFull(m, o, r) {
  const B = m.boxes;
  for (let i = 0; i < B.length; i++) {
    const b = B[i]; if (b[4] <= (o.y || 0) + 0.35 || (b[5]||0)>=(o.y||0)+BODY_H) continue;
    const cx = clamp(o.x, b[0], b[1]), cz = clamp(o.z, b[2], b[3]), dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz; if (d2 >= r * r) continue;
    if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (r - d) / d; o.x += dx * k; o.z += dz * k; }
    else { const l = o.x - b[0], rr = b[1] - o.x, t = o.z - b[2], bt = b[3] - o.z, mn = Math.min(l, rr, t, bt); if (mn === l) o.x = b[0] - r; else if (mn === rr) o.x = b[1] + r; else if (mn === t) o.z = b[2] - r; else o.z = b[3] + r; }
  }
  o.x = clamp(o.x, m.area.x0 + r, m.area.x1 - r); o.z = clamp(o.z, m.area.z0 + r, m.area.z1 - r);
  // Adjacent solids can push a displaced body back into a box already visited.
  // Escape their combined footprint at the current height, never onto a roof.
  let trapped=false;
  for(const b of B){if(b[4]<=(o.y||0)+.35||(b[5]||0)>=(o.y||0)+BODY_H)continue;const dx=o.x-clamp(o.x,b[0],b[1]),dz=o.z-clamp(o.z,b[2],b[3]);if(dx*dx+dz*dz<r*r-1e-8){trapped=true;break;}}
  if (trapped) {
    const solid = b => b[4] > (o.y || 0) + 0.35 && (b[5] || 0) < (o.y || 0) + BODY_H;
    const overlaps = (x,z) => B.some(b => { if (!solid(b)) return false; const dx=x-clamp(x,b[0],b[1]), dz=z-clamp(z,b[2],b[3]); return dx*dx+dz*dz < r*r-1e-8; });
    let best=null, distance=Infinity;
    const offer=(x,z)=>{if(x<m.area.x0+r||x>m.area.x1-r||z<m.area.z0+r||z>m.area.z1-r)return;const d=(x-o.x)**2+(z-o.z)**2;if(d>=distance||overlaps(x,z))return;best=[x,z];distance=d;};
    for(const b of B)if(solid(b)){offer(b[0]-r-.001,o.z);offer(b[1]+r+.001,o.z);offer(o.x,b[2]-r-.001);offer(o.x,b[3]+r+.001);}
    if(best){o.x=best[0];o.z=best[1];}
  }
}
function zSpot(m) {
  const diag=eventLoopDiagnostics.enabled,t0=diag?performance.now():0,N=OB.nav; let best=null,fb=null,bestScore=Infinity,fbScore=Infinity,randomOffers=0,losRays=0; const hs=humans().filter(p=>p.alive),cells=N.spawnCells||[];
  const offer=idx=>{
    randomOffers++;
    const j=Math.floor(idx/N.w),i=idx-j*N.w; let routeDist=N.groundDist?N.groundDist[idx]:Infinity;
    if(!N.groundDist)for(const p of hs)routeDist=Math.min(routeDist,Math.hypot(p.x-(N.x0+i+.5),p.z-(N.z0+j+.5)));
    if(routeDist>=32000||routeDist<18||routeDist>34)return;
    const x=N.x0+i+.5,z=N.z0+j+.5;
    if(boxOverlap(m,x,z,.8))return;
    let spacing=99;
    for(const p of hs)spacing=Math.min(spacing,Math.hypot(p.x-x,p.z-z));
    for(const o of OB.zs.values()){const d=Math.hypot(o.x-x,o.z-z);if(d<1.2)return;spacing=Math.min(spacing,d);}
    const score=Math.abs(routeDist-26)+Math.max(0,9-spacing)*1.4;
    if(best&&score>=bestScore)return;
    let seen=false,visibilityUnknown=false;
    for(const p of hs){const dx=x-p.x,dz=z-p.z,dd=Math.hypot(dx,dz)||1;if(dd<60){
      if(losRays>=ZSPOT_LOS_RAY_BUDGET){visibilityUnknown=true;break;}
      losRays++;
      if(wallDist(m,p.x,p.y+1.6,p.z,dx/dd,(1.3-(p.y+1.6))/dd,dz/dd,dd)>=dd-.1){seen=true;break;}
    }}
    // When the ray budget is exhausted, conservatively treat visibility as
    // exposed. This keeps spawn fairness while bounding expensive LOS work.
    if(visibilityUnknown)seen=true;
    const candidate={x,z};
    if(seen){if(score<fbScore){fbScore=score;fb=candidate;}}else if(score<bestScore){bestScore=score;best=candidate;}
  };
  const randomStart=diag?performance.now():0;
  if(cells.length)for(let k=0;k<ZSPOT_RANDOM_OFFERS;k++)offer(cells[(Math.random()*cells.length)|0]);
  const randomMs=diag?performance.now()-randomStart:0;
  if(diag){const total=performance.now()-t0;outbreakSpawnStats.calls++;outbreakSpawnStats.randomOffers+=randomOffers;outbreakSpawnStats.randomOffersMax=Math.max(outbreakSpawnStats.randomOffersMax,randomOffers);outbreakSpawnStats.losRays+=losRays;outbreakSpawnStats.losRaysMax=Math.max(outbreakSpawnStats.losRaysMax,losRays);outbreakSpawnStats.lastCallMs=r2(total);outbreakSpawnStats.lastRandomMs=r2(randomMs);outbreakSpawnStats.lastFallbackMs=0;outbreakSpawnStats.maxCallMs=Math.max(outbreakSpawnStats.maxCallMs,total);outbreakSpawnStats.maxRandomMs=Math.max(outbreakSpawnStats.maxRandomMs,randomMs);}
  return best||fb;
}
function pickZType(w) {
  const r = Math.random(), br = w >= 4 ? Math.min(0.1, 0.015 + 0.005 * w) : 0, sp = br + (w >= 2 ? Math.min(0.22, 0.06 * (w - 1)) : 0), sr = sp + Math.min(0.32, 0.3 + 0.012 * w);
  return r < br ? 'brute' : r < sp ? 'spitter' : r < sr ? 'sprinter' : 'walker';
}
function makeZ(x, z, type, wave) {
  const t = ZT[type], id = OB.nextZ++, hp = t.hp; // Outbreak-only HP: no Infection scaling
  const zb = { id, type, t, isZ: true, alive: true, x, z, y: 0, yaw: Math.random() * 6.28, hp, maxhp: hp, dmgK: Math.min(1.8, 1 + 0.025 * Math.max(0, wave - 1)), atkT: 0.4 + Math.random() * 0.5, spitT: 1 + Math.random() * 2, spitAim: null, gSpd: t.spd * (0.9 + Math.random() * 0.25) * (1 + Math.min(0.3, 0.012 * wave)), tgt: null, tt: 0, rise: 1, hist: [], hunt: Hunt.create(id), route: null, routeIndex: 0, routeAt: 0, routeGoal: null, routeWait: 0, senseChecks: 0 };
  OB.zs.set(id, zb); return zb;
}
const waveQuota = (w, n) => Math.round((9 + 5 * w + 0.3 * w * w) * (0.7 + 0.35 * Math.min(n, 32)));
const zCap = (w, n) => {
  const squadBots = [...players.values()].filter(p => p.bot && p.alive && (isCoop() || p.team === 0)).length;
  const remainingAiSlots = Math.max(0, MAX_BOTS - squadBots);
  return Math.min(ZMAX, remainingAiSlots, Math.max(6, Math.round(9 + 3 * w) + 4 * (Math.min(n, 32) - 1)));
};
function obMsg() { return { t: 'ob', phase: OB.phase, wave: OB.wave, rem: Math.max(0, OB.quota - OB.spawned), rest: Math.round(Math.max(0, OB.rest) * 1000), z: OB.zs.size, tot: OB.total }; }
function obReset() { OB.phase = 'prep'; OB.wave = 0; OB.quota = 0; OB.spawned = 0; OB.spawnCd = 0; OB.spawnBurstRemaining = 0; OB.spawnBurstType = null; OB.rest = 0; OB.tail = 0; OB.t = 0; OB.total = 0; OB.zs.clear(); OB.fieldT = 0; OB.msgT = 0; buildNav(mapData()); OB.nav.fieldWork = null; OB.nav.dist = null; OB.nav.groundDist = null; }
function startWave(w) {
  const n = humans().length; OB.wave = w; OB.phase = 'fight'; OB.quota = waveQuota(w, n); OB.spawned = 0; OB.tail = 0;
  OB.spawnCd = Math.max(0.3, 1.0 - 0.04 * OB.wave) / Math.sqrt(1 + (n - 1) * 0.3);
  const nb = Math.min(4 + (n >> 2), Math.floor(w / 3)), cap = zCap(w, n);
  // Seed brutes over successive simulation ticks; synchronous spawn searches
  // here used to hitch the first tick of a new wave on large maps.
  OB.spawnBurstRemaining = Math.min(nb, OB.quota, Math.max(0, cap - OB.zs.size));
  OB.spawnBurstType = 'brute';
  bcast(obMsg()); log('wave', w, 'quota', OB.quota);
}
function ammoMsg(p) { const a = {}; p.owned.forEach(k => { if (p.ammo[k]) a[k] = [p.ammo[k].mag, p.ammo[k].res]; }); return { t: 'am', a }; }
function endWave() {
  OB.phase = 'rest'; OB.rest = OB_REST; const w = OB.wave, m = mapData(), taken = [];
  syncBots(true);
  humans().forEach(p => { if (p.alive) taken.push({ x: p.x, z: p.z }); });
  humans().forEach(p => {
    p.money = Math.min(CFG.maxMoney, p.money + 300 + 100 * w);
    if (!p.alive) { const money = p.money; newLoadout(p); p.money = money; spawnPlayer(p, m, taken); }   /* downed players rejoin with a basic kit */
    else {
      p.owned.forEach(k => { const wp = W[k], a = p.ammo[k]; if (wp && !wp.melee && a) a.res = Math.min(wp.reserve, a.res + wp.mag); });
      p.armor = Math.min(100, p.armor + 25); p.hp = Math.min(100, p.hp + 35); send(p, { t: 'heal', hp: Math.ceil(p.hp), ar: Math.ceil(p.armor) }); send(p, ammoMsg(p));
    }
    send(p, { t: 'money', money: p.money });
    if (p.bot) botBuy(p);
  });
  bcast(obMsg()); bcast(scoreMsg()); pushLobby(); log('wave', w, 'cleared');
}
function checkAllDown() {
  if (!isCoop() || G.phase !== 'live') return;
  if (humans().some(p => p.alive)) return;
  G.phase = 'matchend'; G.phaseEnd = now() + MATCHEND_SECS * 1000;
  bcast(phaseMsg({ win: -1, why: 'Your squad fell on wave ' + OB.wave, wave: OB.wave, total: OB.total, secs: Math.round(OB.t) })); bcast(scoreMsg()); log('outbreak over, wave', OB.wave);
}
function hurtHuman(q, dmg, z) {
  if (!q.alive) return;
  if (q.armor > 0) { const ab = Math.min(q.armor, dmg * 0.5); q.armor -= ab; dmg -= ab; }
  q.hp -= dmg; const dead = q.hp <= 0; if (dead) q.hp = 0;
  send(q, { t: 'hp', hp: Math.ceil(q.hp), ar: Math.ceil(q.armor), from: z.id, x: r2(z.x), z: r2(z.z) });
  if (dead) { q.alive = false; q.d++; bcast({ t: 'kill', k: z.id, zk: z.type, v: q.id, h: 0 }); bcast(scoreMsg()); checkAllDown(); }
}
function damageZ(from, z, dmg, head, wkey) {
  if (!z.alive) return;
  if(dmg>0 && W[wkey] && !W[wkey].melee)z.tagUntil=now()+350;
  z.hp -= dmg; const dead = z.hp <= 0;
  const eventId = COSMETIC_EVENT_SESSION + ':' + (++cosmeticEventSeq);
  send(from, { t: 'hit', v: z.id, k: dead ? 1 : 0, h: head ? 1 : 0, ev: eventId });
  if (dead) {
    z.alive = false; OB.zs.delete(z.id); OB.total++; from.k++; if (head) from.hs++;
    from.money = Math.min(CFG.maxMoney, from.money + z.t.bounty); send(from, { t: 'money', money: from.money });
    bcast({ t: 'kill', k: from.id, zv: z.type, v: z.id, w: wkey, f: Number.isInteger(from.finishes && from.finishes[wkey]) ? from.finishes[wkey] : 0, h: head ? 1 : 0, ev: eventId }); bcast(scoreMsg());
  }
}
const zombieHuntStats = { sight: 0, heard: 0, roam: 0, search: 0, recover: 0, failed: 0, pathMs: 0, pathMaxMs: 0, pathOverBudget: 0, pathBudgetExhausted:0, paths: 0 };
const ZSPOT_RANDOM_OFFERS = 24, ZSPOT_LOS_RAY_BUDGET = 24;
const outbreakSpawnStats = { calls: 0, randomOffers: 0, randomOffersMax: 0, fallbackScans: 0, fallbackCells: 0, losRays: 0, losRaysMax: 0, maxSpawnedPerTick: 0, maxCallMs: 0, maxRandomMs: 0, maxFallbackMs: 0, lastCallMs: 0, lastRandomMs: 0, lastFallbackMs: 0 };
let zombiePathBudget = 0, zombiePathSpent = 0, zombiePathCursor = 0;
const zombieHuntNav = {
  get nodes() { return OB.nav ? OB.nav.nodes : []; },
  get edges() { return OB.nav ? OB.nav.edges : []; },
  get reachable() { return OB.nav ? OB.nav.reachable : []; },
  nearest(x, y, z) { return OB.nav ? Nav.nearest(OB.nav, x, y, z) : -1; }
};
function zombieHearShot(p, w, key) {
  if (!isCoop() || !p || !p.alive) return;
  const time = now(), radius = w.melee ? 8 : (key === 'smg' || key === 'kestrel') ? 24 : (key === 'longbow' || key === 'rampart') ? 70 : 36;
  for (const z of OB.zs.values()) {
    if (!z.alive || Math.abs(z.y - p.y) > 5 || Math.hypot(p.x - z.x, p.z - z.z) > radius) continue;
    if (!z.hunt) z.hunt = Hunt.create(z.id);
    Hunt.hear(z.hunt, { x: p.x + (Math.random() - 0.5) * 6, z: p.z + (Math.random() - 0.5) * 6, y: p.y || 0 }, time);
    zombieHuntStats.heard++;
  }
}
function nearestZombieTargets(z, hs, scratch, limit = 5) {
  const maxCount = Math.max(0, Math.min(5, Number.isInteger(limit) ? limit : 5));
  let count = 0;
  for (let sourceIndex = 0; sourceIndex < hs.length; sourceIndex++) {
    const p = hs[sourceIndex];
    const dx = p.x - z.x, dz = p.z - z.z, d2 = dx * dx + dz * dz;
    if (!(d2 < 56 * 56) || !(Math.abs(p.y - z.y) < 5)) continue;
    let at = 0;
    while (at < count && scratch[at].d2 <= d2) at++;
    if (at >= maxCount) continue;
    if (count < maxCount) count++;
    for (let i = count - 1; i > at; i--) {
      const dst = scratch[i], src = scratch[i - 1];
      if (!dst) scratch[i] = { p: src.p, dx: src.dx, dz: src.dz, d2: src.d2, sourceIndex: src.sourceIndex };
      else { dst.p = src.p; dst.dx = src.dx; dst.dz = src.dz; dst.d2 = src.d2; dst.sourceIndex = src.sourceIndex; }
    }
    const entry = scratch[at] || (scratch[at] = {});
    entry.p = p; entry.dx = dx; entry.dz = dz; entry.d2 = d2; entry.sourceIndex = sourceIndex;
  }
  return count;
}
function appendZombiePerceptionProbes(z, hs, scratch, count, maxCount = 5) {
  const limit = Math.max(0, Math.min(5, Number.isInteger(maxCount) ? maxCount : 5));
  if (count >= limit) return count;
  let afterId = Number.isInteger(z.perceptionCursor) ? z.perceptionCursor : -1;
  while (count < limit) {
    let next = null, nextId = Infinity, nextDx = 0, nextDz = 0, nextD2 = 0;
    let wrap = null, wrapId = Infinity, wrapDx = 0, wrapDz = 0, wrapD2 = 0;
    for (let index = 0; index < hs.length; index++) {
      const p = hs[index];
      if (!p || !p.alive || !Number.isFinite(p.id) || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
      let duplicate = false;
      for (let i = 0; i < count; i++) if (scratch[i].p === p) { duplicate = true; break; }
      if (duplicate) continue;
      const dx = p.x - z.x, dz = p.z - z.z, d2 = dx * dx + dz * dz;
      if (!(d2 < 56 * 56) || !(Math.abs((p.y || 0) - z.y) < 5)) continue;
      const id = p.id;
      if (id > afterId) {
        if (id < nextId) { next = p; nextId = id; nextDx = dx; nextDz = dz; nextD2 = d2; }
      } else if (id < wrapId) { wrap = p; wrapId = id; wrapDx = dx; wrapDz = dz; wrapD2 = d2; }
    }
    const p = next || wrap;
    if (!p) break;
    const id = next ? nextId : wrapId, entry = scratch[count] || (scratch[count] = {});
    entry.p = p; entry.dx = next ? nextDx : wrapDx; entry.dz = next ? nextDz : wrapDz;
    entry.d2 = next ? nextD2 : wrapD2; entry.sourceIndex = -1;
    afterId = id; count++;
  }
  z.perceptionCursor = afterId;
  return count;
}
function zombieTargetLoad(target, exclude) { let n = 0; for (const o of OB.zs.values()) if (o !== exclude && o.alive && o.tgt === target) n++; return n; }
// Keep phone-host Outbreak perception inside Offline's scan window and
// distribute stable per-zombie phases so a large horde does not scan in lockstep.
function zombiePerceptionInterval(id) {
  const phase = (Math.abs(Number.isInteger(id) ? id : 0) * 0.6180339887498949) % 1;
  return 0.24 + phase * 0.11;
}
function zombiePerceive(z, hs, m, time) {
  const h = z.hunt; z.tt -= Math.min(0.15, Math.max(0.01, z.senseDt || 0.05));
  if (z.tt > 0) return z.tgt && z.tgt.alive && time - h.seenAt < 1100 ? z.tgt : null;
  z.tt = zombiePerceptionInterval(z.id);
  const nearby = z.perceptionScratch || (z.perceptionScratch = []);
  let nearbyCount;
  if (!Number.isInteger(z.perceptionCursor)) {
    nearbyCount = nearestZombieTargets(z, hs, nearby);
    const firstProbe = nearbyCount >= 5 ? nearby[4] : null;
    z.perceptionCursor = firstProbe ? firstProbe.p.id : -1;
  } else {
    const preferred = z.tgt && z.tgt.alive && hs.includes(z.tgt) ? z.tgt : null;
    nearbyCount = preferred ? nearestZombieTargets(z, [preferred], nearby, 1) : nearestZombieTargets(z, hs, nearby, 1);
    nearbyCount = appendZombiePerceptionProbes(z, hs, nearby, nearbyCount, 5);
  }
  const first = nearbyCount ? nearby[0] : null;
  if (!first) { z.tgt = null; return null; }
  const dNearest = Math.sqrt(first.d2) || 1;
  if (time - h.heardAt > 850) {
    for (let i = 0; i < nearbyCount; i++) {
      const cue = nearby[i], cueDist = Math.sqrt(cue.d2) || 1, moving = cue.p.zombieNoiseUntil > time;
      if (cueDist >= (moving ? (cue.p.zombieNoiseRadius || 54) : 34)) continue;
      const sx = moving && Number.isFinite(cue.p.zombieNoiseX) ? cue.p.zombieNoiseX : cue.p.x;
      const sy = moving && Number.isFinite(cue.p.zombieNoiseY) ? cue.p.zombieNoiseY : cue.p.y || 0;
      const sz = moving && Number.isFinite(cue.p.zombieNoiseZ) ? cue.p.zombieNoiseZ : cue.p.z;
      Hunt.hear(h, { x: sx + (Math.random() - 0.5) * 4, z: sz + (Math.random() - 0.5) * 4, y: sy }, time);
      zombieHuntStats.heard++; break;
    }
  }
  let selected = null, selectedScore = Infinity;
  for (let i = 0; i < nearbyCount; i++) {
    const { p, dx, dz, d2 } = nearby[i], d = Math.sqrt(d2) || 1, facing = -Math.sin(z.yaw) * dx / d - Math.cos(z.yaw) * dz / d;
    if (d <= 44 && (d < 8 || facing > -0.36) && wallDist(m, z.x, z.y + 1.35, z.z, dx / d, (p.y - z.y) / d, dz / d, d) >= d - 0.12) {
      const score = d + zombieTargetLoad(p, z) * 8 - (z.tgt === p ? 5 : 0);
      if (score < selectedScore) { selected = p; selectedScore = score; }
    }
  }
  if (selected) { Hunt.seen(h, selected, time); z.tgt = selected; zombieHuntStats.sight++; return selected; }
  z.tgt = null; return null;
}
function zombieFollow(z, goal, m, time) {
  if (!goal) return null;
  const N = OB.nav, dGoal = z.routeGoal ? Math.hypot(goal.x - z.routeGoal.x, goal.z - z.routeGoal.z) : Infinity;
  if ((!z.route || time > z.routeAt || dGoal > 4.5) && time > z.routeWait && zombiePathBudget > 0 && zombiePathSpent < 5) {
    zombiePathBudget--; const start = process.hrtime.bigint();
    z.route = Nav.path(N, z.x, z.y, z.z, goal.x, goal.y || 0, goal.z, BOT_PATH_MAX_VISITS, BOT_PATH_WORK_BUDGET);
    const cost = Number(process.hrtime.bigint() - start) / 1e6; zombiePathSpent += cost; zombieHuntStats.pathMs += cost; zombieHuntStats.pathMaxMs=Math.max(zombieHuntStats.pathMaxMs,cost);if(cost>BOT_PATH_BUDGET_MS)zombieHuntStats.pathOverBudget++;if(N.pathDiagnostics&&N.pathDiagnostics.lastBudgetExhausted)zombieHuntStats.pathBudgetExhausted++;zombieHuntStats.paths++;
    z.routeGoal = { x: goal.x, z: goal.z }; z.routeIndex = 0; z.routeAt = time + 1700 + (z.id % 7) * 190; z.routeWait = time + (z.route ? 600 + (z.id % 5) * 160 : 100);
    if (!z.route) { Hunt.blocked(z.hunt, time); zombieHuntStats.failed++; return null; }
  }
  if (!z.route || !z.route.length) return null;
  while (z.routeIndex < z.route.length - 1 && Math.hypot(z.route[z.routeIndex][0] - z.x, z.route[z.routeIndex][1] - z.z) < 0.32 && Math.abs(z.route[z.routeIndex][2] - z.y) < 0.45) z.routeIndex++;
  const node = z.route[z.routeIndex], dx = node[0] - z.x, dz = node[1] - z.z, d = Math.hypot(dx, dz);
  if (d < 0.22 && z.routeIndex === z.route.length - 1) { z.route = null; return null; }
  if (node[2] > z.y + 0.35 && node[2] <= z.y + 1.1 && !z.vy) z.vy = 7.4;
  return d > 0.01 ? [dx / d, dz / d] : null;
}
function stepZombies(dt) {
  const m = mapData(), N = OB.nav, hs = humans().filter(p => p.alive), t = now();
  // The old synchronous multi-source Dijkstra updated spawn distances every
  // 0.5 s. Incremental slices keep each authoritative tick bounded while the
  // previous complete field remains available to spawn selection.
  if (OB.phase === 'fight') {
    if (!N.fieldWork && (!N.dist || OB.fieldT <= 0)) Nav.fieldStart(N, hs);
    if (N.fieldWork) {
      if (Nav.fieldStep(N, 160)) OB.fieldT = 0.75;
    } else OB.fieldT = Math.max(0, OB.fieldT - dt);
  }
  
  const list = [...OB.zs.values()];
  if (list.length) { const shift = zombiePathCursor % list.length; zombiePathCursor = (shift + 3) % list.length; for (let i = 0; i < shift; i++) list.push(list.shift()); }
  zombiePathBudget = 3; zombiePathSpent = 0;
  for (const z of list) {
    const T = z.t;
    if (z.rise > 0) { z.rise -= dt; continue; }
    // Keep the existing telegraphed area attack and dodge window unchanged.
    if (z.spitAim && t >= z.spitAim.readyAt) {
      const aim = z.spitAim; z.spitAim = null;
      bcast({ t: 'zfx', id: z.id, e: [r2(aim.x), r2(aim.y + 1.3), r2(aim.z)] });
      for (const victim of hs) if (Counter.spitHits(aim, victim)) hurtHuman(victim, 9 + Math.random() * 3, z);
    }
    const h = z.hunt || (z.hunt = Hunt.create(z.id)); z.senseDt = dt;
    const q = zombiePerceive(z, hs, m, t); let mvx = 0, mvz = 0, spd = 0;
    if (q) {
      const dx = q.x - z.x, dz = q.z - z.z, dist = Math.hypot(dx, dz) || 0.001;
      if (dist < T.reach && Math.abs(q.y - z.y) < 1.6 && wallDist(m, z.x, z.y + 1.2, z.z, dx / dist, (q.y - z.y) / dist, dz / dist, dist) >= dist - 0.1) {
        Hunt.state(h, 'attack', t); z.yaw = turnTo(z.yaw, Math.atan2(-dx, -dz), dt * 8); z.atkT -= dt;
        // Do not hard-freeze on a stationary player: keep a restrained orbit
        // step while the existing authoritative melee timer resolves hits.
        [mvx, mvz] = Hunt.attackStrafe(z.id, z.x, z.z, q.x, q.z, t); spd = Math.min(0.9, Math.max(0.4, z.gSpd * 0.24));
        if (z.atkT <= 0) { z.atkT = T.rate * (0.9 + Math.random() * 0.2); hurtHuman(q, T.dmg * z.dmgK, z); }
      } else if (z.type === 'spitter' && dist > 7 && dist < 24 && wallDist(m, z.x, z.y + 1.4, z.z, dx / dist, (q.y + 1.3 - (z.y + 1.4)) / dist, dz / dist, dist) >= dist - 0.1) {
        Hunt.state(h, 'attack', t); z.yaw = turnTo(z.yaw, Math.atan2(-dx, -dz), dt * 6); z.spitT -= dt;
        [mvx, mvz] = Hunt.attackStrafe(z.id, z.x, z.z, q.x, q.z, t); spd = Math.min(0.55, Math.max(0.25, z.gSpd * 0.16));
        if (z.spitT <= 0) {
          z.spitT = T.rate + Math.random();
          if (!z.spitAim) { z.spitAim = { x: q.x, y: q.y || 0, z: q.z, readyAt: t + Counter.SPIT_WARN_MS };
            bcast({ t: 'zwarn', id: z.id, e: [r2(q.x), r2(q.y || 0), r2(q.z)], ms: Counter.SPIT_WARN_MS }); }
        }
      } else {
        Hunt.state(h, 'chase', t);
        if (dist < 5 && Math.abs(q.y - z.y) < 0.5 && wallDist(m, z.x, z.y + 0.6, z.z, dx / dist, 0, dz / dist, dist) >= dist - 0.07) { mvx = dx / dist; mvz = dz / dist; }
        else { const v = zombieFollow(z, Hunt.goal(h, zombieHuntNav, z, t), m, t); if (v) { mvx = v[0]; mvz = v[1]; } }
        if (z.type === 'sprinter') { const farBlend = Math.max(0, Math.min(1, (dist - 18) / 22)), smoothFar = farBlend * farBlend * (3 - 2 * farBlend); spd = z.gSpd * (1 - 0.32 * smoothFar); }
        else spd = z.gSpd;
      }
    } else {
      const goal = Hunt.goal(h, zombieHuntNav, z, t), v = zombieFollow(z, goal, m, t);
      if (v) { mvx = v[0]; mvz = v[1]; spd = z.gSpd * (h.state === 'roam' ? 0.65 : 0.85); }
      if (h.state === 'roam') zombieHuntStats.roam++; else if (h.state === 'search') zombieHuntStats.search++;
    }
    settleBotHeight(z, dt, m); if (z.tagUntil > t) spd *= 0.8;
    if (spd > 0 && (mvx || mvz)) { z.x += mvx * spd * dt; z.z += mvz * spd * dt; resolveCircle(m, z, T.r); z.yaw = turnTo(z.yaw, Math.atan2(-mvx, -mvz), dt * 5); }
    if (Hunt.progress(h, z.x, z.z, t, spd > 0 && (mvx !== 0 || mvz !== 0))) { z.route = null; z.routeWait = t + 300 + (z.id % 5) * 150; zombieHuntStats.recover++; }
  }
  for (let a = 0; a < list.length; a++) {        /* keep the horde from stacking into one point */
    const u = list[a]; let moved = false;
    for (let b = a + 1; b < list.length; b++) {
      const o = list[b]; if (Math.abs(u.y - o.y) > 1.2) continue; const ox = u.x - o.x, oz = u.z - o.z; if (ox > 0.9 || ox < -0.9 || oz > 0.9 || oz < -0.9) continue;
      const d2 = ox * ox + oz * oz; if (d2 < 0.81 && d2 > 1e-6) { const d = Math.sqrt(d2), pu = (0.9 - d) * 0.25; u.x += ox / d * pu; u.z += oz / d * pu; o.x -= ox / d * pu; o.z -= oz / d * pu; moved = true; }
    }
    for (const p of hs) { if (Math.abs(u.y - p.y) > 1.2) continue; const px = u.x - p.x, pz = u.z - p.z, d2 = px * px + pz * pz; if (d2 < 0.64 && d2 > 1e-6) { const d = Math.sqrt(d2), pu = 0.8 - d; u.x += px / d * pu; u.z += pz / d * pu; moved = true; } }
    if (moved) resolveCircle(m, u, u.t.r);
    u.hist.push({ t, x: u.x, y: u.y, z: u.z, cr: 0, pr: 0 }); while (u.hist.length && u.hist[0].t < t - 500) u.hist.shift();
  }
}
function outbreakTick(dt) {
  OB.t += dt; const n = humans().length;
  if (OB.phase === 'rest') { OB.rest -= dt; if (OB.rest <= 0) startWave(OB.wave + 1); }
  else if (OB.phase === 'fight') {
    OB.spawnCd -= dt;
    const m = mapData(), cap = zCap(OB.wave, n);
    if(OB.spawnBurstRemaining>0&&(OB.spawned>=OB.quota||OB.zs.size>=cap))OB.spawnBurstRemaining=0;
    if (OB.spawnBurstRemaining<=0 && OB.spawnCd <= 0 && OB.spawned < OB.quota && OB.zs.size < cap) {
      OB.spawnCd = Math.max(0.3, 1.0 - 0.04 * OB.wave) / Math.sqrt(1 + (n - 1) * 0.3);
      OB.spawnBurstRemaining = Math.min(3, OB.quota - OB.spawned, cap - OB.zs.size);
      OB.spawnBurstType = null;
    }
    // Resolve at most one bounded spawn search per simulation tick. A three-
    // zombie burst is spread over three ticks, preserving its count and timer
    // while preventing several line-of-sight scans from stacking into one tick.
    let spawnedThisTick=0;
    if(OB.spawnBurstRemaining>0){
      const sp=zSpot(m);
      if(sp){makeZ(sp.x,sp.z,OB.spawnBurstType||pickZType(OB.wave),OB.wave);OB.spawned++;OB.spawnBurstRemaining--;spawnedThisTick=1;if(OB.spawnBurstRemaining<=0)OB.spawnBurstType=null;}
      else{OB.spawnBurstRemaining=0;OB.spawnBurstType=null;}
    }
    outbreakSpawnStats.maxSpawnedPerTick=Math.max(outbreakSpawnStats.maxSpawnedPerTick,spawnedThisTick);
    if (OB.spawned >= OB.quota) { OB.tail += dt; if (OB.zs.size === 0) endWave(); }
  }
  if (OB.phase !== 'prep') stepZombies(dt);
  OB.msgT -= dt; if (OB.msgT <= 0) { OB.msgT = 1; bcast(obMsg()); }
}

/* ---------------- combat ---------------- */
function settleReload(p) { if (p.rl && now() >= p.rl.at) { const w = W[p.rl.w], a = p.ammo[p.rl.w]; if (w && a) { const take = Math.max(0, Math.min(w.mag - a.mag, botUnlimitedAmmo(p) && !w.melee ? w.mag : a.res)); a.mag += take; if (!botUnlimitedAmmo(p)) a.res -= take; } p.rl = null; if (!p.bot) send(p, ammoMsg(p)); } }
function buyItem(p, id) {      /* shared by humans and bots; the caller checks the buy window */
  let price;
  if (id === 'armor') { if (p.armor >= 100) return { ok: false, why: 'You already have it' }; price = CFG.armorPrice; }
  else if (id === 'vest') { if (p.armor >= 50) return { ok: false, why: 'You already have it' }; price = CFG.vestPrice; }
  else if (W[id] && W[id].price > 0) { if (p.owned.has(id)) return { ok: false, why: 'You already have it' }; price = W[id].price; }
  else return { ok: false, why: 'Not for sale in multiplayer' };
  if (p.money < price) return { ok: false, why: 'Need $' + (price - p.money) + ' more' };
  p.money -= price;
  if (id === 'armor') p.armor = 100; else if (id === 'vest') p.armor = Math.max(p.armor, 50);
  else if (W[id].melee) { const wasMelee = MELEES.includes(p.cur); MELEES.forEach(k => p.owned.delete(k)); p.owned.add(id); p.ammo[id] = { mag: 1, res: 0 }; if (wasMelee) { p.cur = id; p.rl = null; } }
  else { if (PRIMARIES.includes(id)) PRIMARIES.forEach(k => p.owned.delete(k)); else p.owned.delete('pistol'); p.owned.add(id); p.ammo[id] = { mag: W[id].mag, res: W[id].reserve }; p.cur = id; p.rl = null; }
  return { ok: true };
}
function buyWindow() { return G.phase === 'buy' || (G.phase === 'live' && (isDeathmatch() || now() - G.liveStart < LIVE_BUY_SECS * 1000 || (isCoop() && OB.phase === 'rest'))); }
function onBuy(p, m) {
  if (isInfection() && p.infected) return send(p,{t:'bought',id:String(m.id),ok:false,why:'Infected cannot purchase guns',money:p.money,owned:[...p.owned],cur:p.cur});
  if (!p.alive || (p.team !== 0 && p.team !== 1)) return;
  const id = String(m.id), reply = (ok, why) => send(p, { t: 'bought', id, ok, why: why || '', money: p.money, armor: Math.ceil(p.armor), owned: [...p.owned], cur: p.cur });
  if (!buyWindow()) return reply(false, 'Buy time is over');
  const r = buyItem(p, id); reply(r.ok, r.why);
}
function movementSpeedFrac(p) {
  const h=p.hist||[]; if(h.length<2)return 0;
  const newest=h[h.length-1]; let older=null;
  for(let i=h.length-2;i>=0;i--) if(newest.t-h[i].t>=75) { older=h[i]; break; }
  if(!older)return 0;
  const dt=(newest.t-older.t)/1000; if(!(dt>0))return 0;
  return clamp(Math.hypot(newest.x-older.x,newest.z-older.z)/(dt*5.2),0,1);
}
function shotSpeedFrac(p,w) {
  const movement=movementSpeedFrac(p);
  // Walking only steadies shots while accepted movement remains within the
  // weapon's walk-speed envelope; a forged walk flag during a sprint is ignored.
  return p.walk&&movement<=w.speed*0.5+0.08?movement*0.4:movement;
}
function shotgunSpread(w, speedFrac, crouch) {
  const movement = clamp(Number.isFinite(speedFrac) ? speedFrac : 0, 0, 1);
  const crouchAmount = clamp(Number.isFinite(crouch) ? crouch : 0, 0, 1);
  return w.pelletSpread * (1 + movement * 0.6) * (1 - crouchAmount * 0.15);
}
function onShot(p, m) {
  if (G.phase !== 'live' && (isFFA()||isBomb()||G.phase !== 'roundend')) return;
  if(isInfection() && G.phase!=='live')return;
  // Combat actions belong to the life epoch that produced them. Keep the
  // optional field for v1 protocol compatibility, while current clients send
  // it so a queued pre-death shot cannot switch/fire after a respawn.
  if (m.ep !== undefined && m.ep !== p.ep) { stats.rejected++; return; }
  if (!p.alive) return;
  if (isBomb() && BOMB.state?.use?.actorId===p.id) { ModeRules.cancelUse(BOMB.state,p.id); bombStateBroadcast(); }
  const key = String(m.w), w = W[key];
  if (isInfection() && p.infected && !w?.melee) { stats.rejected++; return; } if (!w || !p.owned.has(key)) { stats.rejected++; return; }
  const supplied=Array.isArray(m.d)?m.d:[], central=[0,0,0];
  if(!supplied.length || supplied.length>(w.pellets||1)) {stats.rejected++;return;}
  for(const d of supplied) { if(!Array.isArray(d)||d.length!==3||!d.every(Number.isFinite)) {stats.rejected++;return;} const l=Math.hypot(...d); if(l<0.5||l>1.5) {stats.rejected++;return;} for(let i=0;i<3;i++)central[i]+=d[i]/l; }
  const cl=Math.hypot(...central); if(cl<0.1) {stats.rejected++;return;} for(let i=0;i<3;i++)central[i]/=cl;
  /* A client chooses aim, never the shotgun pattern. Identical pellet rays cannot become a precision slug. */
  let dirs=[central]; if(w.pellets) { const speedFrac=shotSpeedFrac(p,w), crouch=clamp(Number.isFinite(p.cr)?p.cr:0,0,1), spread=shotgunSpread(w,speedFrac,crouch), yaw=Math.atan2(-central[0],-central[2]), pitch=Math.asin(clamp(central[1],-1,1)); dirs=[]; for(let i=0;i<w.pellets;i++) { const a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*spread,rx=Math.cos(a)*r,ry=Math.sin(a)*r; const d=[central[0]+Math.cos(yaw)*rx+Math.sin(yaw)*Math.sin(pitch)*ry,central[1]+Math.cos(pitch)*ry,central[2]-Math.sin(yaw)*rx+Math.cos(yaw)*Math.sin(pitch)*ry],l=Math.hypot(...d);dirs.push(d.map(v=>v/l)); } }
  const t = now();
  settleReload(p);
  if (key !== p.cur) { p.cur = key; p.rl = null; p.nextShot = now() + 200; }
  if (p.rl) { stats.rejected++; return; }
  const iv = 60000 / w.rpm;
  if (w.melee) { if (t < (p.nextShot || 0) || t - p.lastShot < (m.heavy ? 700 : iv * 0.6)) { stats.rejected++; return; } }
  else {      /* strict average rate with a little slack so Wi-Fi jitter does not eat bullets */
    const slack = Math.min(110, iv * 0.8);
    if (t < (p.nextShot || 0) - slack) { stats.rejected++; return; }
    p.nextShot = Math.max(p.nextShot || 0, t) + iv;
  }
  if (!w.melee) { const a = p.ammo[key]; if (a.mag <= 0) { stats.rejected++; return; } a.mag--; }
  p.lastShot = t; stats.shots++;
  resolveShot(p, key, w, dirs, !!m.heavy, t - 100 - clamp(p.rtt / 2, 0, 250));
}
/* Ray tests for one trigger pull. dirs are unit-ish vectors from the shooter's eye. rt is the server time to rewind targets to. */
function resolveShot(p, key, w, dirs, heavy, rt) {
  const mp = mapData(), eyeY = p.y + EYE - p.cr * 0.5 - p.pr * 0.7;
  const n = Math.min(dirs.length, w.pellets || 1); if (!n) return;
  const maxR = w.melee ? w.range + 0.5 : 220;
  const foes = [];
  if (isCoop()) OB.zs.forEach(q => { if (q.alive && q.rise <= 0 && Math.abs(q.x - p.x) < maxR && Math.abs(q.z - p.z) < maxR) foes.push([q, posAt(q, rt)]); });
  else players.forEach(q => { if (q.alive && !sameCombatSide(q,p) && (q.team === 0 || q.team === 1) && Math.abs(q.x - p.x) < maxR && Math.abs(q.z - p.z) < maxR) foes.push([q, posAt(q, rt)]); });
  const dmgBy = new Map(); let endPt = null;
  for (let i = 0; i < n; i++) {
    const d = dirs[i]; if (!Array.isArray(d)) continue;
    let dx = +d[0], dy = +d[1], dz = +d[2]; if (!isFinite(dx + dy + dz)) continue;
    const l = Math.hypot(dx, dy, dz); if (l < 0.5 || l > 1.5) continue; dx /= l; dy /= l; dz /= l;
    let tw = wallDist(mp, p.x, eyeY, p.z, dx, dy, dz, maxR), hit = null;
    for (const [q, pos] of foes) {
      const H = q.isZ ? BODY_H * q.t.h : bodyH(pos.cr || 0, pos.pr || 0), hw = q.isZ ? HALF_W * q.t.w : HALF_W, hh = rayAabb(p.x, eyeY, p.z, dx, dy, dz, pos.x - hw, pos.x + hw, pos.y, pos.y + H, pos.z - hw, pos.z + hw);
      if (hh && hh[0] < tw && (!hit || hh[0] < hit.t)) hit = { q, t: hh[0], rel: (hh[1] - pos.y) / H, pos };
    }
    const tEnd = hit ? hit.t : tw; if (!endPt) endPt = [r2(p.x + dx * tEnd), r2(eyeY + dy * tEnd), r2(p.z + dz * tEnd)];
    if (!hit) continue;
    const head = hit.rel > 0.866, leg = hit.rel < 0.47; let dmg;
    if (w.melee) {
      const vx = -Math.sin(hit.q.yaw), vz = -Math.cos(hit.q.yaw), ax = p.x - hit.pos.x, az = p.z - hit.pos.z, al = Math.hypot(ax, az) || 1;
      const back = (ax * vx + az * vz) / al < -0.25; dmg = back ? 200 : (heavy ? (w.heavy || 65) : w.dmg);
    } else dmg = w.dmg * (head ? w.head : 1) * (leg ? 0.75 : 1) * fallMul(w, hit.t);
    dmg *= p.dmgMul || 1;
    const rec = dmgBy.get(hit.q) || { d: 0, head: false }; rec.d += dmg; rec.head = rec.head || head; dmgBy.set(hit.q, rec);
  }
  if (!endPt) { const d = dirs[0] || [0, 0, -1]; endPt = [r2(p.x + (+d[0] || 0) * 60), r2(eyeY + (+d[1] || 0) * 60), r2(p.z + (+d[2] || 0) * 60)]; }
  const fx = { t: 'fx', id: p.id, w: key, e: endPt };
  if (p.bot) bcastBotFx(fx, p); else bcast(fx, p);
  if (!w.melee) hearShot(p, w);
  if (isCoop()) zombieHearShot(p, w, key);
  dmgBy.forEach((rec, q) => q.isZ ? damageZ(p, q, rec.d, rec.head, key) : damage(p, q, rec.d, rec.head, key));
}
function damage(from, q, dmg, head, wkey) {
  if (!q.alive || G.phase === 'matchend' || ((isDeathmatch()||isFFA()) && q.spawnShieldUntil>now())) return;
  if(isInfection() && sameCombatSide(from,q))return;
  if (isInfection() && from.infected && !q.infected) {
    if (!W[wkey]?.melee || Math.hypot(from.x-q.x,from.z-q.z)>3.1 || Math.abs(from.y-q.y)>1.4) return;
    infectionConvert(q,from); return;
  }
  if (q.armor > 0) { const ab = Math.min(q.armor, dmg * 0.5); q.armor -= ab; dmg -= ab; }
  if(isInfection() && q.infected && !from.infected && dmg>0 && W[wkey] && !W[wkey].melee){infectionKnockback(from,q,dmg,wkey);q.tagUntil=now()+320;send(q,{t:'tag',ms:320});}
  q.hp -= dmg; if (q.bot) botHurt(q, from);
  const dead = q.hp <= 0; if (dead) q.hp = 0;
  send(q, { t: 'hp', hp: Math.ceil(q.hp), ar: Math.ceil(q.armor), from: from.id, x: r2(from.x), z: r2(from.z) });
  const eventId = COSMETIC_EVENT_SESSION + ':' + (++cosmeticEventSeq);
  send(from, { t: 'hit', v: q.id, k: dead ? 1 : 0, h: head ? 1 : 0, ev: eventId });
  if (from.bot) { botStats.hits++; if (dead) botStats.kills++; }
  if (dead) {
    q.alive = false; q.d++; from.k++; if (head) from.hs++;
    if(isDeathmatch()){ DM.respawns.set(q.id,now()+Deathmatch.RESPAWN_MS); G.score[from.team]++; }
    if(isFFA()){
      const outcome=ModeRules.recordFFAElimination(FFA.match,from.id,q.id,q.ep);
      if(outcome.accepted){FFA.respawns.set(q.id,now()+Deathmatch.RESPAWN_MS);if(outcome.winnerId!=null)FFA.match.winnerId=outcome.winnerId;}
    }
    if(isBomb()&&BOMB.state?.carrierId===q.id&&bombDropCarrier(q)){bombStateBroadcast();bcast({t:'objfx',event:'dropped',actorName:q.name||null,reason:'eliminated'});}
    if (isInfection() && q.infected) INF.respawns.set(q.id,now()+4500);
    from.money = Math.min(CFG.maxMoney, from.money + CFG.killReward);
    send(from, { t: 'money', money: from.money });
    bcast({ t: 'kill', k: from.id, v: q.id, w: wkey, f: Number.isInteger(from.finishes && from.finishes[wkey]) ? from.finishes[wkey] : 0, h: head ? 1 : 0, ev: eventId });
    bcast(scoreMsg());
    if(isDeathmatch() && G.phase==='live' && G.score[from.team]>=G.kills)endMatch('Kill target reached');
    else if(isFFA()&&FFA.match&&FFA.match.winnerId!=null)endMatch('Kill target reached');
    else checkElimination();
  }
}
function onInput(p, m) {
  if (m.ep !== p.ep) return;
  const t = now(), mp = mapData();
  p.yaw = clamp(+m.yaw || 0, -1000, 1000); p.pitch = clamp(+m.pitch || 0, -1.6, 1.6);
  if (typeof m.w === 'string' && (!isInfection() || !p.infected || W[m.w]?.melee) && p.owned.has(m.w) && m.w !== p.cur) { if (p.alive) settleReload(p); p.cur = m.w; p.rl = null; p.nextShot = now() + 200; }
  if (!p.alive || G.phase === 'buy' || G.phase === 'lobby' || G.phase === 'matchend') { p.lastIn = t; return; }
  let x = +m.x, y = +m.y, z = +m.z; if (!isFinite(x + y + z)) return;
  const dt = clamp((t - (p.creditT || p.lastIn)) / 1000, 0, 0.6); p.creditT = t;
  // Buffer 600 ms at the client's 8 m/s peak slide speed. The former 2.5 m
  // cap was below a normal sprint over this window, so a delayed Wi-Fi packet
  // could be rejected and snap the player backward. Keep the bucket bounded
  // to plausible client movement rather than the wider anti-cheat ceiling.
  p.moveCredit = Math.min(4.8, (p.moveCredit || 0) + MAX_SPEED*dt*(isInfection() && p.infected && p.tagUntil>t ? .8 : 1));
  p.verticalCredit = Math.min(1.6, (p.verticalCredit || 0) + 8*dt);
  x = clamp(x, mp.area.x0 + 0.3, mp.area.x1 - 0.3); z = clamp(z, mp.area.z0 + 0.3, mp.area.z1 - 0.3); y = clamp(y, 0, 8);
  const dist=Math.hypot(x-p.x,z-p.z), rise=Math.max(0,y-p.y), gy=groundAt(mp,x,z,y);
  let blocked=false; const steps=Math.max(1,Math.ceil(dist/0.18)); for(let i=1;i<=steps;i++) if(inBox(mp,p.x+(x-p.x)*i/steps,p.z+(z-p.z)*i/steps,p.y+(y-p.y)*i/steps,0.15)) { blocked=true;break; }
  if(y>gy+.25) { if(!p.airSince) {p.airSince=t;p.launchY=groundAt(mp,p.x,p.z,p.y);} } else p.airSince=0;
  const tooFast = dist > p.moveCredit+0.02, tooVertical = rise > p.verticalCredit+0.02, airtime = !!(p.airSince && (t-p.airSince>1600 || y>(p.launchY||0)+1.4));
  if (tooFast || tooVertical || airtime || blocked) { if(p.airSince && t-p.airSince>1600) {p.y=groundAt(mp,p.x,p.z,p.y);p.airSince=0;} const reason=blocked?'blocked':airtime?'airtime':tooVertical?'vertical':'speed'; stats.corr++; stats['corr'+reason[0].toUpperCase()+reason.slice(1)]++; p.ep++; send(p, { t: 'corr', x: r2(p.x), y: r2(p.y), z: r2(p.z), ep: p.ep, why: reason, distance: r2(dist), allowance: r2(p.moveCredit) }); p.lastIn = t; return; }
  p.moveCredit-=dist; p.verticalCredit-=rise;
  p.x = x; p.y = y; p.z = z; p.cr = clamp(Number.isFinite(+m.cr) ? +m.cr : 0, 0, 1); p.pr = clamp(Number.isFinite(+m.pr) ? +m.pr : 0, 0, 1); p.walk = m.wk === 1; p.lastIn = t;
  // Validated player movement emits a short local footstep cue. Quiet walking
  // is audible at shorter range; idle position packets do not create noise.
  const footstepMin = p.walk ? 0.82 : 0.34;
  if (isCoop() && !p.infected && dist >= footstepMin && t >= (p.zombieNoiseNext || 0)) {
    p.zombieNoiseNext = t + (p.walk ? 1100 : 620);
    p.zombieNoiseUntil = t + 950; p.zombieNoiseX = x; p.zombieNoiseY = y; p.zombieNoiseZ = z;
    p.zombieNoiseRadius = p.walk ? 34 : 54;
  }
  p.hist.push({ t, x, y, z, cr: p.cr, pr: p.pr }); while (p.hist.length && p.hist[0].t < t - HIST_MS) p.hist.shift();
}

/* ---------------- bots: server-side players (versus opponents, versus teammates, co-op squadmates) ----------------
   A bot is a normal entry in `players` with bot:true and no socket. It buys, moves, aims and shoots through the same
   code paths as a human (buyItem, resolveShot, damage), so the server stays the only referee and every client simply
   sees one more player in the snapshots. Nothing here is trusted from a browser. */
const SKILL = {
  // Skill scales awareness and aim progressively; bot damage stays equal to
  // player weapon damage at every level.
  recruit: { name: 'Recruit', react: 0.70, err: 0.060, head: 0.02, dmg: 1.0, turn: 3.8, mem: 5.5, run: 0.88 },
  regular: { name: 'Regular', react: 0.46, err: 0.038, head: 0.07, dmg: 1.0, turn: 5.2, mem: 8, run: 0.94 },
  veteran: { name: 'Veteran', react: 0.33, err: 0.026, head: 0.13, dmg: 1.0, turn: 6.8, mem: 10.5, run: 0.98 },
  elite: { name: 'Elite', react: 0.24, err: 0.018, head: 0.19, dmg: 1.0, turn: 8.2, mem: 12, run: 1.0 }
};
const BOT_MODE_POLICY = Object.freeze({
  tactical: Object.freeze({ id:'tactical', patrolPhase:'advance', waypointBase:10, waypointStep:2, highGround:true, shareIntel:true, flank:true, approachExtra:5, pursuitScale:.9 }),
  deathmatch: Object.freeze({ id:'deathmatch', patrolPhase:'hunt', waypointBase:5, waypointStep:1, highGround:false, shareIntel:false, flank:false, approachExtra:1.5, pursuitScale:1 })
});
function botModePolicy() { return BOT_MODE_POLICY[(isDeathmatch() || isFFA()) ? 'deathmatch' : 'tactical']; }
const BOT_NAMES = ['Rook', 'Vega', 'Sable', 'Quill', 'Marlow', 'Ember', 'Tarn', 'Juno', 'Brisk', 'Onyx', 'Wren', 'Cobalt', 'Flint', 'Ivy', 'Lark', 'Moss', 'Nova', 'Pike', 'Reef', 'Slate', 'Thorn', 'Umber', 'Vale', 'Yarrow', 'Zephyr', 'Ash', 'Birch', 'Cairn', 'Dune', 'Echo', 'Fable', 'Grit', 'Haze', 'Indigo', 'Jade', 'Kite', 'Lumen', 'Mica', 'Nettle', 'Opal'];
const BOT_MAX_TEAM = 32, BOT_MAX_COOP = MAX_BOTS;
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(6.283185307 * Math.random());
function botName() {
  const used = new Set([...players.values()].map(p => p.name));
  for (let i = 0; i < 80; i++) { const n = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]; if (!used.has('Bot ' + n)) return 'Bot ' + n; }
  return 'Bot ' + (nextId);
}
function newAI() { return { infectionEvasion: null, infectionEvasionScratch: null, squadRole: 'protect', squadSlot: 0, squadGoal: null, squadAnchor: 0, tgt: null, seenT: 0, scanT: Math.random() * 0.15, alert: 0, invest: null, path: null, pi: 0, goal: null, repathT: 0, strafe: Math.random() < 0.5 ? -1 : 1, strafeT: 0.5 + Math.random(), burst: 0, cool: 0.3, stuckT: 0, sx: 0, sz: 0, wp: null, wpT: 0, nStuck: 0, aimT: 0, roundT: 0 }; }
function makeBot(team) {
  const id = nextId++, skill = BOTCFG.skill;
  const p = { id, c: null, bot: true, name: botName(), team, homeTeam: team, host: false, op: 0, rtt: 0, alive: false, spec: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, cr: 0, pr: 0, hp: 100, money: CFG.startMoney, k: 0, d: 0, hs: 0, ep: 0, lastIn: now(), lastShot: 0, nextShot: 0, hist: [], msgs: 0, lostKit: false, rl: null, skin: 'default', finishes: {}, armor: 0, skill, dmgMul: SKILL[skill].dmg, ai: newAI() };
  p.op = pickOp(team); newLoadout(p); players.set(id, p); return p;
}
function removeBot(p) { if (!players.delete(p.id)) return; p.alive=false; bcast({ t: 'left', id: p.id }); }
function setBotSkill(sk) { BOTCFG.skill = sk; players.forEach(p => { if (p.bot) { p.skill = sk; p.dmgMul = SKILL[sk].dmg; } }); }
function botsOn(team) { return [...players.values()].filter(p => p.bot && (isInfection() ? (Number.isInteger(p.homeTeam)?p.homeTeam:p.team) : p.team) === team); }
function desiredBots() {
  const hum = realPlayers(); if (!hum.length) return [0, 0];
  if (isFFA()) {
    const humansByTeam=[hum.filter(p=>p.team===0).length,hum.filter(p=>p.team===1).length];
    let want=BOTCFG.mode==='fill'
      ? [Math.max(0,BOTCFG.t0-humansByTeam[0]),Math.max(0,BOTCFG.t1-humansByTeam[1])]
      : [BOTCFG.t0,BOTCFG.t1];
    // Team IDs are visual only in FFA; honor the lobby controls while
    // respecting the shared AI and participant caps.
    const cap=Math.min(BOT_MAX_COOP,Math.max(0,MAX_TOTAL-hum.length));
    while(want[0]+want[1]>cap){const t=want[0]>=want[1]?0:1;if(!want[t])break;want[t]--;}
    return want;
  }
  if (groupMode()) {
    const coopCap = G.mode === 'outbreak' ? Math.max(0, MAX_BOTS - 8) : BOT_MAX_COOP;
    if (isInfection()) {
      const totalCap=Math.min(coopCap,Math.max(0,MAX_TOTAL-hum.length));
      const total=BOTCFG.mode==='fill'?Math.max(0,BOTCFG.coop-hum.length):BOTCFG.coop;
      const target=Math.min(totalCap,Math.max(total,Math.max(0,4-hum.length)));
      // Add mode counts AI separately: split its roster evenly. Fill mode
      // counts humans toward a 32/32 target at 64 total participants.
      let want=[0,0];
      if(BOTCFG.mode==='fill') {
        const rosterTarget=Math.max(BOTCFG.coop,4);
        const targets=[Math.ceil(rosterTarget/2),Math.floor(rosterTarget/2)];
        const hc=[hum.filter(p=>p.team===0).length,hum.filter(p=>p.team===1).length];
        want=targets.map((n,t)=>Math.max(0,n-hc[t]));
        while(want[0]+want[1]>totalCap){const t=want[0]>=want[1]?0:1;if(!want[t])break;want[t]--;}
      } else want=[Math.ceil(target/2),Math.floor(target/2)];
      return want;
    }
    const n = Math.min(BOTCFG.mode === 'fill' ? Math.max(0, BOTCFG.coop - hum.length) : BOTCFG.coop, coopCap, MAX_TOTAL - hum.length);
    return [Math.ceil(n/2), Math.floor(n/2)];
  }
  const hc = [hum.filter(p => p.team === 0).length, hum.filter(p => p.team === 1).length], cfg = [BOTCFG.t0, BOTCFG.t1];
  const d = [0, 1].map(t => Math.min(BOT_MAX_TEAM, BOTCFG.mode === 'fill' ? Math.max(0, cfg[t] - hc[t]) : cfg[t]));
  if (BOTCFG.balance) { const target = Math.max(hc[0] + d[0], hc[1] + d[1]); for (let t = 0; t < 2; t++) d[t] = Math.max(0, target - hc[t]); }
  while (hum.length + d[0] + d[1] > MAX_TOTAL) { const t = d[0] && (!d[1] || hc[0] + d[0] >= hc[1] + d[1]) ? 0 : 1; d[t]--; }
  return d;
}
/* Brings the bot roster in line with the lobby settings. Only runs where it is safe: in the lobby, or at a round/wave boundary. */
function syncBots(force) {
  if (G.phase !== 'lobby' && !force) return false;
  let changed = false;
  if (!humanCount()) { botsOn(0).concat(botsOn(1)).forEach(removeBot); return false; }
  const want = desiredBots();
  [0, 1].forEach(t => {
    let have = botsOn(t);
    while (have.length > want[t]) { have.sort((a, b) => (a.alive - b.alive) || (b.id - a.id)); removeBot(have.shift()); changed = true; }
    while (have.length < want[t]) { have.push(makeBot(t)); changed = true; }
  });
  if (changed) pushLobby();
  return changed;
}

/* ---- navigation: A* over the same 1 m grid the zombies use ---- */
function walkClear(N,ax,az,bx,bz,feetY=0,maxSteps=Infinity) {const n=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)/.15));if(n>maxSteps)return false;for(let i=1;i<=n;i++)if(Nav.blocked(N.boxes,ax+(bx-ax)*i/n,feetY,az+(bz-az)*i/n))return false;return true;}
function astar(N,sx,sz,gx,gz,sy=0,gy=0,maxVisits,workBudget) { return Nav.path(N,sx,sy,sz,gx,gy,gz,maxVisits,workBudget); }
function botGoalMoved(A,gx,gz,gy=0) {
  return !A.goal || Math.hypot(A.goal[0]-gx,A.goal[1]-gz)>8 || Math.abs((A.goal[2]||0)-gy)>.3;
}
let pathBudget = 0;
let pathSpentMs=0;
let botTickCursor=0;
const BOT_PATH_TIMING_CAP=1024,botPathTimingSamples=new Float32Array(BOT_PATH_TIMING_CAP);
let botPathTimingCount=0,botPathTimingWrite=0;
function recordBotPathTiming(ms){botPathTimingSamples[botPathTimingWrite]=ms;botPathTimingWrite=(botPathTimingWrite+1)%BOT_PATH_TIMING_CAP;if(botPathTimingCount<BOT_PATH_TIMING_CAP)botPathTimingCount++;}
function botPathTimingSnapshot(){
  if(!botPathTimingCount)return {samples:0,capacity:BOT_PATH_TIMING_CAP,p50:0,p95:0,p99:0,max:0};
  const sorted=Array.from(botPathTimingSamples.subarray(0,botPathTimingCount)).sort((a,b)=>a-b);
  const q=p=>r2(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]);
  return {samples:botPathTimingCount,capacity:BOT_PATH_TIMING_CAP,window:'most recent bot path searches',p50:q(.5),p95:q(.95),p99:q(.99),max:r2(sorted[sorted.length-1])};
}
const BOT_PATH_MAX_VISITS=450, BOT_PATH_BUDGET_MS=4;
/* A tick-wide budget cannot preempt one synchronous A* call. Bound each
   search too, returning a legal partial route and skipping optional smoothing
   when work must yield back to the authoritative host loop. */
const BOT_PATH_WORK_BUDGET=Object.freeze({maxMs:2.5,maxLandingChecks:64,maxSmoothChecks:320});
/* Bound catch-up work independently from the roster cadence. Small lobbies
   retain 20 Hz; high bot counts are staggered to the measured aggregate budget
   before this cap is reached. */
const BOT_THINK_MAX_PER_TICK=Math.min(MAX_BOTS,Math.max(8,Math.ceil(MAX_BOTS*TICK_MS/Math.max(50,TICK_MS))+8));
/* Keep a catch-up wave of overdue bot decisions from monopolizing one host tick.
   This is a soft wall-time budget: a single synchronous decision can overrun it,
   but later due bots are carried forward fairly instead of being dropped. */
const BOT_THINK_BUDGET_MS=6;
function botThinkBudgetExpired(elapsedMs){return Number.isFinite(elapsedMs)&&elapsedMs>=BOT_THINK_BUDGET_MS;}
/* A matched 64-bot loopback trial sustained 578 decisions/s at this target,
   with 4.64 ms live tick p95, 6.59 ms p99, and no skipped snapshots. The
   previous 400/s target needlessly stretched 64-bot decisions to 160 ms and
   made remote reactions feel slow. Keep 20 Hz through 20 bots; use the
   measured 600/s budget for larger rosters. Authoritative movement snapshots
   remain 50 Hz and extrapolate renderVx/Vz. */
const BOT_THINK_DECISIONS_PER_SECOND=600;
function botThinkIntervalMs(aliveBotCount){
  const count=Math.max(0,Math.floor(Number(aliveBotCount)||0)),base=Math.max(50,TICK_MS);
  if(!count)return base;
  const scaled=Math.ceil((count*1000/BOT_THINK_DECISIONS_PER_SECOND)/10)*10;
  return Math.max(base,scaled);
}
let botThinkIntervalNow=Math.max(50,TICK_MS);
const botStats = { thinks: 0, paths: 0, pathMs: 0, pathMaxMs: 0, pathOverBudget: 0, pathBudgetExhausted: 0, pathFail: 0, thinkBudgetHitTicks:0, thinkBudgetDeferredBots:0, thinkCapDeferredBots:0, scanLosReused:0, invalidTargets: 0, shots: 0, hits: 0, kills: 0, stuck: 0 };
/* Moves b toward (gx,gz) along an A* path. Returns false when it has nothing to follow. */
function botSteer(b, gx, gz, dt, spd, m, gy=0) {
  const A = b.ai, N = buildNav(m);
  A.repathT -= dt;
  const movedGoal=botGoalMoved(A,gx,gz,gy);
  const need = !A.goal || A.repathT<=0 || (A.path && movedGoal);
  if (need && pathBudget > 0 && pathSpentMs<BOT_PATH_BUDGET_MS) {
    pathBudget--; const t0 = process.hrtime.bigint(); A.path = astar(N, b.x, b.z, gx, gz,b.y,gy,BOT_PATH_MAX_VISITS,BOT_PATH_WORK_BUDGET); const ms=Number(process.hrtime.bigint()-t0)/1e6;recordBotPathTiming(ms);pathSpentMs+=ms;botStats.paths++; botStats.pathMs += ms;botStats.pathMaxMs=Math.max(botStats.pathMaxMs,ms);if(ms>BOT_PATH_BUDGET_MS)botStats.pathOverBudget++;if(N.pathDiagnostics&&N.pathDiagnostics.lastBudgetExhausted)botStats.pathBudgetExhausted++;
    A.pi = 0; A.goal = [gx, gz,gy];
    /* A yielded/failed search must retry soon. Holding the normal 1.2–2 s
       replan delay after returning no route made an unlucky search look like
       a bot freeze even though the host continued ticking. */
    A.repathT = A.path ? 1.2 + Math.random() * 0.8 : 0.1;
    if (!A.path) botStats.pathFail++;
  }
  let tx = gx, tz = gz, ty=gy;
  if (A.path && A.pi < A.path.length) {
      /* Grid centers have only a 10 cm clearance margin at some corners.
         Reach the center before turning; a broad arrival radius cuts walls. */
      while (A.pi < A.path.length - 1 && Math.hypot(A.path[A.pi][0] - b.x, A.path[A.pi][1] - b.z) < 0.08 && Math.abs(A.path[A.pi][2]-b.y)<=.351) A.pi++;
    tx = A.path[A.pi][0]; tz = A.path[A.pi][1]; ty=A.path[A.pi][2];
  } else if (!need && A.path) { A.path = null; A.repathT=0; }
  // A* failure or exhausted per-tick budget is NOT permission to run through
  // a wall. A short direct segment may still be proven clear, but bound that
  // synchronous fallback so one failed/partial route cannot scan a long ray
  // against every map obstacle inside the authoritative tick.
  if ((!A.path || A.pi >= A.path.length) &&
      (Math.abs(gy-b.y)>.35 || !walkClear(N,b.x,b.z,gx,gz,b.y,64))) return false;
  const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return false;
  // The LAN Infection bots use the same step-up timing as Outbreak;
  // walking into a riser before the jump clears it used to cause wall loops.
  const grounded=Math.abs(b.y-groundAt(m,b.x,b.z,b.y))<.07;
  if(!Nav.stepVertical(b,ty,grounded))return false;
  const nx=b.x+dx/d*Math.min(d,spd*dt), nz=b.z+dz/d*Math.min(d,spd*dt);
  b.x=nx;b.z=nz;resolveCircle(m,b,.4);
  b.yaw = turnAng(b.yaw, Math.atan2(-dx, -dz), dt * 7);
  return true;
}
function turnAng(a, t, k) { let d = t - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + clamp(d, -k, k); }

/* ---- senses ---- */
/* Keep only the ten best observed candidates in reusable per-bot buffers.
   This preserves Array#sort's stable score order without allocating a foe
   array, one score object per enemy, and a sort workspace on every scan. */
function insertBotScanCandidate(targets,scores,q,score,limit=10,indices=null,sourceIndex=-1) {
  let at=0;while(at<targets.length&&scores[at]<=score)at++;
  if(at>=limit)return false;
  const nextLength=Math.min(limit,targets.length+1);
  for(let i=nextLength-1;i>at;i--){targets[i]=targets[i-1];scores[i]=scores[i-1];if(indices)indices[i]=indices[i-1];}
  targets[at]=q;scores[at]=score;if(indices)indices[at]=sourceIndex;targets.length=nextLength;scores.length=nextLength;if(indices)indices.length=nextLength;
  return true;
}
function botScanCandidateScore(A,b,q,coop,fx,fz,allies) {
  if(!Number.isFinite(q.x)||!Number.isFinite(q.z)){botStats.invalidTargets++;return;}
  const dx=q.x-b.x,dz=q.z-b.z,d=Math.hypot(dx,dz);
  if(d>90||(d>5&&(dx*fx+dz*fz)/Math.max(.001,d)<(A.alert>0?-.15:.3)))return null;
  let score=d*(q===A.tgt ? .75 : 1);
  if(coop)for(let i=0;i<allies.length;i++){const a=allies[i];if(Math.hypot(a.x-q.x,a.z-q.z)<5){score*=.55;break;}}
  return score;
}
function offerBotScanCandidate(A,b,q,coop,fx,fz,allies,targets,scores,limit=10,indices=null,sourceIndex=-1) {
  const score=botScanCandidateScore(A,b,q,coop,fx,fz,allies);
  if(score===null||score===undefined)return false;
  return insertBotScanCandidate(targets,scores,q,score,limit,indices,sourceIndex);
}
function considerBotScanProbe(out,A,b,q,coop,fx,fz,allies,targets,afterId) {
  if(!q||!q.alive||!Number.isFinite(q.id))return;
  if(coop){if(q.rise>0)return;}
  else if(sameCombatSide(q,b)||(q.team!==0&&q.team!==1))return;
  for(let i=0;i<targets.length;i++)if(targets[i]===q)return;
  const score=botScanCandidateScore(A,b,q,coop,fx,fz,allies);
  if(score===null||score===undefined)return;
  if(q.id>afterId){if(q.id<out.nextId){out.next=q;out.nextId=q.id;out.nextScore=score;}}
  else if(q.id<out.wrapId){out.wrap=q;out.wrapId=q.id;out.wrapScore=score;}
}
function findNextBotScanProbe(out,A,b,actors,coop,fx,fz,allies,targets,afterId){
  out.next=out.wrap=null;out.nextId=out.wrapId=Infinity;out.nextScore=out.wrapScore=0;
  if(coop){for(const q of OB.zs.values())considerBotScanProbe(out,A,b,q,true,fx,fz,allies,targets,afterId);}
  else for(const q of actors)considerBotScanProbe(out,A,b,q,false,fx,fz,allies,targets,afterId);
  if(out.next){out.q=out.next;out.id=out.nextId;out.score=out.nextScore;return true;}
  if(out.wrap){out.q=out.wrap;out.id=out.wrapId;out.score=out.wrapScore;return true;}
  out.q=null;return false;
}
function sortBotScanProbeScores(targets,scores,from){
  for(let i=from+1;i<targets.length;i++){
    const q=targets[i],score=scores[i];let j=i;
    while(j>from&&scores[j-1]>score){targets[j]=targets[j-1];scores[j]=scores[j-1];j--;}
    targets[j]=q;scores[j]=score;
  }
}
const chestY = q => q.isZ ? BODY_H * q.t.h * 0.62 + (q.y || 0) : bodyH(q.cr || 0, q.pr || 0) * 0.62 + (q.y || 0);
function botScan(b, S, m, roster) {
  const diag=eventLoopDiagnostics.enabled,scanT=diag?performance.now():0;
  const A = b.ai, ey = b.y + EYE, fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw), coop = isCoop();
  const actors=Array.isArray(roster)?roster:[...players.values()];
  const allies=A.scanAllies||(A.scanAllies=[]),targets=A.scanTargets||(A.scanTargets=[]),scores=A.scanScores||(A.scanScores=[]);
  allies.length=0;targets.length=0;scores.length=0;
  if(coop)for(const q of actors)if(q.alive&&!q.bot)allies.push(q);
  const initialized=Number.isFinite(A.scanProbeAfterId),scanLimit=initialized?5:10;
  if(coop){for(const q of OB.zs.values())if(q.alive&&q.rise<=0)offerBotScanCandidate(A,b,q,true,fx,fz,allies,targets,scores,scanLimit);}
  else for(const q of actors){if(q.alive&&!sameCombatSide(q,b)&&(q.team===0||q.team===1))offerBotScanCandidate(A,b,q,false,fx,fz,allies,targets,scores,scanLimit);}
  if(!initialized){A.scanProbeAfterId=targets.length?targets[targets.length-1].id:-1;}
  else {
    const anchorCount=targets.length,choice=A.scanProbeChoice||(A.scanProbeChoice={});let afterId=A.scanProbeAfterId;
    while(targets.length<10&&findNextBotScanProbe(choice,A,b,actors,coop,fx,fz,allies,targets,afterId)){
      const at=targets.length;targets[at]=choice.q;scores[at]=choice.score;afterId=choice.id;
    }
    A.scanProbeAfterId=afterId;
    sortBotScanProbeScores(targets,scores,anchorCount);
  }
  let best = null, bd = 1e9;
  /* A bounded visibility budget prevents large hordes monopolizing the tick. */
  for (let i = 0; i < targets.length; i++) {
    const q = targets[i], dx = q.x - b.x, dz = q.z - b.z, dy = chestY(q) - ey, L = Math.hypot(dx, dy, dz) || 0.001;
    if (wallDist(m, b.x, ey, b.z, dx / L, dy / L, dz / L, L) >= L - 0.05) { best = q; bd = L; break; }
  }
  if (best) {
    if (best !== A.tgt) { A.tgt = best; A.seenT = 0; A.aimT = 0; A.head = Math.random() < S.head; }
    A.last = { x: best.x, y: best.y || 0, z: best.z }; A.alert = S.mem; A.invest = null; A.dist = bd;
    /* Share only observed coordinates, never a target reference or hidden updates. */
    const t = now(), policy = botModePolicy();
    if (policy.shareIntel && t >= (A.shareAt || 0)) {
      A.shareAt = t + 900;
      for(const a of actors){ if (a !== b && a.bot && a.alive && sameCombatSide(a,b) && !a.ai.tgt && Math.hypot(a.x - b.x, a.z - b.z) < 30) {
        a.ai.alert = Math.max(a.ai.alert, S.mem * 0.6); a.ai.invest = { ...A.last };
      } }
    }
  } else if (A.tgt) { A.invest = A.last ? { ...A.last } : null; A.tgt = null; A.seenT = 0; }
  if(diag){const ms=performance.now()-scanT;botWorkDiagnostics.scans++;botWorkDiagnostics.scanMs+=ms;botWorkDiagnostics.scanMaxMs=Math.max(botWorkDiagnostics.scanMaxMs,ms);if(ms>1)botWorkDiagnostics.scanOver1Ms++;}
}
function fillBotCombatMates(out,b,roster){
  out.length=0;
  for(const p of roster)if(p!==b&&p.alive&&sameCombatSide(p,b))out.push(p);
  return out;
}
function hearShot(p, w) {
  const r = (w.key === 'smg' || w.key === 'kestrel') ? 34 : (w.key === 'longbow' || w.key === 'rampart') ? 70 : 52;
  players.forEach(b => {
    if (!b.bot || !b.alive || b === p) return;
    if (isInfection() && b.infected && !p.infected) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < 25) {
        if (!b.ai.infectionEvasion) b.ai.infectionEvasion = InfectionEvasion.create(b.id);
        InfectionEvasion.gunshot(b.ai.infectionEvasion, now(), d);
      }
    }
    if (b.ai.tgt) return;
    if (isCoop() || sameCombatSide(b,p)) return;
    const dx = b.x - p.x, dz = b.z - p.z; if (dx * dx + dz * dz > r * r) return;
    b.ai.alert = Math.max(b.ai.alert, SKILL[b.skill].mem * 0.5);
    b.ai.invest = { x: p.x + (Math.random() - 0.5) * 10, y: p.y || 0, z: p.z + (Math.random() - 0.5) * 10 };
  });
}
function botHurt(q, from) {
  q.ai.hurtAt = now();
  if (isInfection() && q.infected) {
    if (!q.ai.infectionEvasion) q.ai.infectionEvasion = InfectionEvasion.create(q.id);
    InfectionEvasion.hurt(q.ai.infectionEvasion, now());
  }
  if (!q.ai.tgt && from) {
    q.ai.alert = Math.max(q.ai.alert, SKILL[q.skill].mem);
    /* A hit reveals an approximate direction, not the attacker's precise location. */
    const dx = from.x - q.x, dz = from.z - q.z, d = Math.hypot(dx, dz) || 1, r = Math.min(d, 18);
    q.ai.invest = { x: q.x + dx / d * r + (Math.random() - 0.5) * 6, y: q.y || 0, z: q.z + dz / d * r + (Math.random() - 0.5) * 6 };
  }
}

/* ---- buying ---- */
function botBuy(p) {
  if (!p.alive || isInfection() && p.infected) return;
  const current = PRIMARIES.find(k => p.owned.has(k)), coop = isCoop();
  if(!coop && p.id%4===1 && !current && !p.owned.has('hawk') && p.money>=W.hawk.price && p.money<W.stinger.price) buyItem(p,'hawk');
  const reserve = p.armor < 50 && p.money >= 1800 ? CFG.armorPrice : 0;
  const preferences = coop ? [
      ['carbine','rook117','aurora','falcon','stinger','smg','switchback','kestrel','pistol'],
      ['longbow','ranger','rampart','vantage','mistral','pinion','carbine','rook117','hawk','pistol'],
      ['breacher','scatter','hammer','mako','ember','tide','smg','kestrel','hawk','pistol'],
      ['bulwark','bastion','cyclone','forge','thunder','carbine','rook117','aurora','pistol']
    ][p.id % 4]
    : [['carbine','rook117','aurora','falcon','stinger','smg','switchback','needle','kestrel','mako','pistol'],
       ['longbow','ranger','rampart','vantage','mistral','pinion','carbine','rook117','stinger','hawk','pistol'],
       ['scatter','breacher','hammer','mako','ember','tide','smg','switchback','kestrel','hawk','pistol'],
       ['bulwark','bastion','cyclone','forge','thunder','tide','ember','carbine','rook117','aurora','pistol']][p.id % 4];
  const pick = preferences.find(k => W[k].price <= p.money - reserve);
  const upgrade = current && (preferences.indexOf(current) < 0 || preferences.indexOf(pick) < preferences.indexOf(current));
  if (pick && (!current || (upgrade && p.money >= W[pick].price + CFG.armorPrice + 600))) {
    buyItem(p, pick);
  }
  if (p.armor < 100 && p.money >= CFG.armorPrice) buyItem(p, 'armor'); else if (p.armor < 50 && p.money >= CFG.vestPrice) buyItem(p, 'vest');
  if (!PRIMARIES.some(k => p.owned.has(k)) && !p.owned.has('hawk') && p.money >= W.hawk.price) buyItem(p, 'hawk');
  const pk = PRIMARIES.find(k => p.owned.has(k)); p.cur = pk || (p.owned.has('hawk') ? 'hawk' : 'pistol'); p.rl = null;
}

/* ---- thinking ---- */
function prefRange(w, coop) {
  if (coop) return w.pellets ? 6 : 11;
  if (w.melee) return 1.5; if (w.pellets) return 6; if (w.key === 'longbow') return 38; if (w.longRange) return 30; if (w.rpm > 700) return 11; return w.speed < 0.85 ? 22 : 17;
}
function bestGun(p) { return PRIMARIES.find(k => p.owned.has(k) && (p.ammo[k].mag > 0 || botHasReload(p,k))) || (p.owned.has('hawk') && (p.ammo.hawk.mag > 0 || botHasReload(p,'hawk')) ? 'hawk' : (p.owned.has('pistol') && (p.ammo.pistol.mag > 0 || botHasReload(p,'pistol')) ? 'pistol' : meleeOf(p))); }
function botFire(b, tg, dist, S, t, roster) {
  const A = b.ai; let key = b.cur, w = W[key];
  if (isInfection() && b.infected) {
    if (dist<=2.35 && Math.abs(b.y-(tg.y||0))<1.35 && t>=(b.nextShot||0)) {
      const dx=tg.x-b.x,dz=tg.z-b.z,L=Math.hypot(dx,dz)||1;
      if (wallDist(mapData(),b.x,b.y+1.3,b.z,dx/L,0,dz/L,L)>=L-.13) { b.nextShot=t+1050; infectionConvert(tg,b); botStats.shots++; }
    } return;
  }
  if (dist < 1.7 && !w.melee && !b.rl && b.ammo[key].mag <= 0 && !botHasReload(b,key)) { key = meleeOf(b); b.cur = key; w = W[key]; b.nextShot = Math.max(b.nextShot || 0, t + 200); return; }
  if (dist > 3.4 && w.melee) { key = bestGun(b); b.cur = key; w = W[key]; b.nextShot = Math.max(b.nextShot || 0, t + 250); return; }
  if (!w.melee) { const a = b.ammo[key]; if (a.mag <= 0) { if (!botHasReload(b,key)) { b.cur = bestGun(b); b.nextShot = t + 250; return; } if (!b.rl) b.rl = { w: key, at: t + w.reload * 1000 }; return; } }
  if (b.rl || t < (b.nextShot || 0)) return;
  if (A.cool > 0) return;
  const iv = 60000 / w.rpm;
  if (w.pellets && dist > w.falloffEnd + 4) return;            /* shotguns do nothing out there */
  if (w.melee) { if (dist > w.range - 0.2) return; }
  else if (!w.auto && w.key === 'longbow' && A.aimT < 0.35) return;
  const eye = b.y + EYE, ty = A.head ? (tg.isZ ? BODY_H * tg.t.h * 0.93 + (tg.y || 0) : bodyH(tg.cr || 0, tg.pr || 0) * 0.93 + (tg.y || 0)) : chestY(tg);
  const dx = tg.x - b.x, dy = ty - eye, dz = tg.z - b.z, L = Math.hypot(dx, dy, dz) || 1;
  const cp = Math.cos(b.pitch), fx = -Math.sin(b.yaw) * cp, fy = Math.sin(b.pitch), fz = -Math.cos(b.yaw) * cp;
  if ((dx * fx + dy * fy + dz * fz) / L < Math.cos(w.melee ? 0.35 : 0.13)) return;
  if (wallDist(mapData(), b.x, eye, b.z, dx / L, dy / L, dz / L, L) < L - 0.05) return;
  /* Hold the trigger while a squadmate crosses the firing lane. */
  for (const q of roster || players.values()) {
    if (q === b || !q.alive || !sameCombatSide(q,b)) continue;
    const qx = q.x - b.x, qz = q.z - b.z, along = (qx * dx + qz * dz) / Math.max(0.001, dist);
    if (along > 0 && along < dist && Math.abs(qx * dz - qz * dx) / Math.max(0.001, dist) < 0.7 && Math.abs(chestY(q) - (eye + dy * along / dist)) < 1.2) return;
  }
  const mv = A.moving ? 0.7 : 0, sig = S.err * (1 + mv + Math.min(8, A.shots || 0) * 0.09) * (w.melee ? 0 : 1), dirs = [], n = w.pellets || 1;
  const yaw = b.yaw + gauss() * sig, pitch = b.pitch + gauss() * sig * 0.8;
  const cx = -Math.sin(yaw) * Math.cos(pitch), cy = Math.sin(pitch), cz = -Math.cos(yaw) * Math.cos(pitch);
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * (w.pelletSpread || 0) * (A.moving ? 1.6 : 1), ex = Math.cos(ang) * rad, ey2 = Math.sin(ang) * rad;
    const vx = cx + Math.cos(yaw) * ex + Math.sin(yaw) * Math.sin(pitch) * ey2, vy = cy + Math.cos(pitch) * ey2, vz = cz - Math.sin(yaw) * ex + Math.cos(yaw) * Math.sin(pitch) * ey2, l = Math.hypot(vx, vy, vz); dirs.push([vx / l, vy / l, vz / l]);
  }
  if (w.melee) { b.lastShot = t; b.nextShot = t + iv * 1.3; stats.shots++; botStats.shots++; resolveShot(b, key, w, dirs, false, t); return; }
  const a = b.ammo[key]; a.mag--; b.nextShot = Math.max(b.nextShot || 0, t) + iv; b.lastShot = t; stats.shots++; botStats.shots++;
  resolveShot(b, key, w, dirs, false, t);
  A.shots = (A.shots || 0) + 1;
  if (w.auto) { if (--A.burst <= 0) { A.burst = 2 + Math.floor(Math.random() * (dist > 20 ? 3 : 6)); A.cool = (0.12 + Math.random() * 0.4) * (dist > 25 ? 1.5 : 1); A.shots = 0; } }
  else A.cool = (iv / 1000) * (0.3 + Math.random() * 0.9) * (1 + S.react);
}
function botPickWaypoint(b, m, roster) {
  const diag=eventLoopDiagnostics.enabled,waypointT=diag?performance.now():0;
  const A=b.ai,N=buildNav(m),policy=botModePolicy();
  const actors=roster||[...players.values()],squad=A.waypointSquad||(A.waypointSquad=[]),occupied=A.waypointOccupied||(A.waypointOccupied=[]),anchors=A.waypointAnchors||(A.waypointAnchors=[]);
  squad.length=0;occupied.length=0;anchors.length=0;
  // Real team assignments: spread defenders, midfield scouts and flankers
  // onto separate NAV posts instead of sending everybody to a random cell.
  for(const p of actors){if(p.bot&&p.alive&&(isCoop()||sameCombatSide(p,b)))squad.push(p);if(p!==b&&p.bot&&p.alive&&p.ai&&p.ai.wp)occupied.push({x:p.ai.wp[0],y:p.ai.wpY||0,z:p.ai.wp[1]});if(!p.bot&&p.alive&&sameCombatSide(p,b))anchors.push(p);}
  squad.sort((a,z)=>a.id-z.id);
  const slot=Math.max(0,squad.indexOf(b));
  const infectionRole=isInfection()?Tactics.infectionRole(slot,b.team):null;
  if(infectionRole)A.infectionRole=infectionRole;
  const phase=isInfection()?(b.infected?'hunt':'infection'):policy.patrolPhase;
  const patrolCycle=isInfection()&&!b.infected?(A.infectionPatrolCycle=(A.infectionPatrolCycle||0)+1):0;
  const guardPlayer=anchors.length>0&&(isInfection()?infectionRole==='protect':policy.id==='tactical'&&slot%5===0);
  let post=null,assignedGuard=false;
  if(guardPlayer){
    const leader=anchors[b.id%anchors.length],wish=Squad.point(leader,'protect',slot,false);
    const node=Nav.formation(N,wish,leader,occupied)||botFormationNode(N,wish.x,wish.y,wish.z);
    if(node){post={x:node.x,y:node.y,z:node.z};assignedGuard=true;A.guardAnchor=leader.id;}
  }
  if(!post)post=Tactics.patrol(N,b,slot,b.team,occupied,phase,squad.length,patrolCycle);
  // A defender on a different floor must not mistake the nearest XY location
  // for a legal route. Nav.path in botSteer will make the actual transition.
  if(!post){const id=Nav.nearest(N,b.x,b.y,b.z);post=id>=0?N.nodes[id]:{x:b.x,y:b.y,z:b.z};}
  A.wp=[post.x,post.z];A.wpY=post.y;A.wpT=policy.waypointBase+(slot%4)*policy.waypointStep;A.path=null;A.guardPlayer=assignedGuard;
  if(diag){const ms=performance.now()-waypointT;botWorkDiagnostics.waypoints++;botWorkDiagnostics.waypointMs+=ms;botWorkDiagnostics.waypointMaxMs=Math.max(botWorkDiagnostics.waypointMaxMs,ms);}
}
/* Reassign at most once per second; no per-frame sorting or path searches.
   The player is the anchor. Observed enemies are never read for hidden positions. */
const SQUAD_ASSIGNMENTS_PER_TICK=8,SQUAD_WORK_BUDGET_MS=2;
let squadNextAt = 0, squadSignature = '', squadWork = null;
function resetCoopSquad(){squadNextAt=0;squadSignature='';squadWork=null;}
function processCoopSquadWork(){
  const work=squadWork;if(!work)return;
  const started=performance.now();let processed=0;
  while(work.index<work.sorted.length&&processed<SQUAD_ASSIGNMENTS_PER_TICK){
    if(processed&&performance.now()-started>=SQUAD_WORK_BUDGET_MS)break;
    const i=work.index++,b=work.sorted[i],A=b.ai,leader=work.lead[b.id%work.lead.length];
    let occupied=work.occupiedByLeader.get(leader.id);
    if(!occupied){occupied=[];work.occupiedByLeader.set(leader.id,occupied);}
    if(A.squadGoal&&Number.isFinite(A.squadAnchor)){
      const old=work.occupiedByLeader.get(A.squadAnchor),oldAt=old?old.indexOf(A.squadGoal):-1;
      if(oldAt>=0)old.splice(oldAt,1);
    }
    const role=Squad.assignment(work.sorted.length,i),pressure=leader.hp<65||(A.alert>0&&!!A.last);
    const desired=Squad.point(leader,role,i,pressure),prev=A.squadWish;
    /* Keep an unchanged post only when it does not overlap a goal already reserved
       for another bot. Existing posts are pre-reserved before this incremental pass. */
    const conflicts=goal=>occupied.some(other=>{const dx=goal.x-other.x,dz=goal.z-other.z;return dx*dx+dz*dz<1.44;});
    if(A.squadGoal&&prev&&A.squadRole===role&&A.squadAnchor===leader.id&&
       Math.abs(desired.y-prev.y)<.15&&Math.hypot(desired.x-prev.x,desired.z-prev.z)<1.1&&!conflicts(A.squadGoal)){
      occupied.push(A.squadGoal);processed++;continue;
    }
    /* Reserve distinct goals on the leader's connected deck before falling
       back to legacy projection in rare transitional/jumping states. */
    const node=Nav.formation(work.nav,desired,leader,occupied)
      ||botFormationNode(work.nav,desired.x,desired.y,desired.z)
      ||botFormationNode(work.nav,leader.x,leader.y||0,leader.z);
    A.squadRole=role;A.squadSlot=i;A.squadAnchor=leader.id;A.squadWish=desired;
    A.squadGoal=node?{x:node.x,y:node.y,z:node.z}:null;
    if(A.squadGoal)occupied.push(A.squadGoal);
    processed++;
  }
  if(work.index>=work.sorted.length)squadWork=null;
}
function updateCoopSquad(t) {
  if (!isCoop()) { resetCoopSquad(); return; }
  if(squadWork){processCoopSquadWork();return;}
  const team=[...players.values()].filter(p=>p.bot&&p.alive),lead=[...players.values()].filter(p=>!p.bot&&p.alive);
  if(!lead.length){squadSignature='';squadNextAt=t+1000;return;}
  const signature=team.map(p=>p.id).join(',')+'/'+lead.map(p=>p.id).join(',');
  if(t<squadNextAt&&signature===squadSignature)return;
  squadSignature=signature;squadNextAt=t+1000;
  const sorted=Squad.order(team),nav=buildNav(mapData()),occupiedByLeader=new Map();
  /* Keep current assignments reserved while the refresh is spread across ticks. */
  for(const b of sorted){const A=b.ai;if(!A.squadGoal||!Number.isFinite(A.squadAnchor))continue;let used=occupiedByLeader.get(A.squadAnchor);if(!used){used=[];occupiedByLeader.set(A.squadAnchor,used);}used.push(A.squadGoal);}
  squadWork={sorted,lead,nav,occupiedByLeader,index:0};
  processCoopSquadWork();
}
function coopAnchor(b) { return players.get(b.ai.squadAnchor) || null; }
function coopRescue(b) {
  if (b.ai.squadRole !== 'reinforce') return null;
  let best = null, bestD = Infinity;
  for (const p of players.values()) {
    if (p === b || !p.alive || !sameCombatSide(p,b) || p.hp >= 55) continue;
    const d = Math.hypot(p.x-b.x,p.z-b.z);
    if (d < 22 && d < bestD) { best = p; bestD = d; }
  }
  return best;
}
function botFormationNode(N,x,y,z) {
  const i=Math.floor(x-N.x0),j=Math.floor(z-N.z0);let best=null,score=Infinity;
  for(let dz=-7;dz<=7;dz++)for(let dx=-7;dx<=7;dx++){const ni=i+dx,nj=j+dz;if(ni<0||nj<0||ni>=N.w||nj>=N.h)continue;for(const id of N.columns[nj*N.w+ni]){const node=N.nodes[id];if(Math.abs(node.y-y)>.15||!N.reachable[id])continue;const d=(node.x-x)**2+(node.z-z)**2;if(d<score){score=d;best=node;}}}
  return best;
}
function botThink(b, dt, t, m, roster) {
  const S = SKILL[b.skill], A = b.ai, coop = isCoop(), infectedChaser = isInfection() && !!b.infected, policy = botModePolicy(); let w = W[b.cur] || W.pistol;
  const actors=roster||[...players.values()],mates=A.combatSideScratch||(A.combatSideScratch=[]);
  A.behaviorMode = policy.id;
  if(!A.tacticSeeded){
    A.tacticSeeded=true;
    if(!coop){
      botPickWaypoint(b,m,actors);
      // One in four covers high ground when a connected, nearby deck exists.
      // Do not select a random distant roof across the entire city.
      if(policy.highGround && !A.guardPlayer && b.id%4===1){const N=buildNav(m),near=N.vantages.filter(n=>Math.hypot(n.x-b.x,n.z-b.z)<36);
        if(near.length){const node=near[Math.floor(b.id*7)%near.length];A.wp=[node.x,node.z];A.wpY=node.y;A.wpT=22;}}
    }
  }
  settleReload(b);
  A.scanT -= dt; A.roundT += dt; if (A.cool > 0) A.cool -= dt;
  if (A.alert > 0) A.alert -= dt;
  let scannedThisThink=false;
  if (A.scanT <= 0) { A.scanT = 0.11 + Math.random() * 0.07; botScan(b, S, m, actors); scannedThisThink=true; }
  let tg = A.tgt;
  if(tg&&(!Number.isFinite(tg.x)||!Number.isFinite(tg.z))){botStats.invalidTargets++;A.tgt=null;A.invest=A.last?{...A.last}:null;tg=null;A.scanT=0;}
  if (isBomb()) bombBotObjective(b,t,true); else A.bombGoal=null;
  if (tg) {
    const dx = tg.x - b.x, dz = tg.z - b.z, dy = chestY(tg) - (b.y + EYE), L = Math.hypot(dx, dy, dz) || 0.001;
    /* botScan just did this exact visibility ray and selected tg only if its
       position was visible. Repeating the ray in the same synchronous think
       wastes host time for every engaged bot; still revalidate on intervening
       thinks so movement and cover changes retain authoritative LOS checks. */
    if (scannedThisThink&&tg.alive) botStats.scanLosReused++;
    if (!tg.alive || (!scannedThisThink&&wallDist(m, b.x, b.y + EYE, b.z, dx / L, dy / L, dz / L, L) < L - 0.05)) {
      A.invest = A.last ? { ...A.last } : null; tg = A.tgt = null; A.seenT = 0;
    } else A.last = { x: tg.x, y: tg.y || 0, z: tg.z };
  }
  if (!w.melee && !b.rl) { const a = b.ammo[b.cur]; if (a && botHasReload(b,b.cur) && (a.mag <= 0 || (!tg && a.mag < w.mag * 0.4))) b.rl = { w: b.cur, at: t + w.reload * 1000 }; }
  let moved = false, intended = 0; const px0 = b.x, pz0 = b.z, base = 4.5 * S.run * w.speed * (infectedChaser && b.tagUntil>t ? .8 : 1) * (infectedChaser && infectionSurge()?1.08:1);
  if (tg) {
    const dx = tg.x - b.x, dz = tg.z - b.z, dist = Math.hypot(dx, dz) || 0.01, aimYaw = b.yaw;
    A.seenT += dt; A.aimT += dt; A.dist = dist;
    const R = prefRange(w, coop); A.strafeT -= dt; if (A.strafeT <= 0) { A.strafe = -A.strafe; A.strafeT = 0.7 + Math.random() * 1.3; }
    let vx = 0, vz = 0, sp = 0;
    if (isBomb() && BOMB.state && BOMB.state.use && BOMB.state.use.actorId===b.id) {
      // Plant/defuse holds take precedence over combat movement, but aiming,
      // firing, damage and the existing authoritative objective clock continue.
      A.moving=false;
    }
    else if (isBomb() && A.bombGoal && Math.hypot(A.bombGoal[0]-b.x,A.bombGoal[1]-b.z)>1.8) {
      const g=A.bombGoal;moved=botSteer(b,g[0],g[1],dt,base*.88,m,g[2]||0);
    }
    else if (b.rl || (!coop && b.hp < 35 && t - (A.hurtAt || 0) < 2000)) {
      /* Sample nearby cover at a human pace, then use navigation to reach it.
         Reloading never refills early or cancels itself to attack. */
      if (t >= (A.coverAt || 0)) {
        A.coverAt = t + 1000;
        const post = Tactics.cover(buildNav(m),b,tg,fillBotCombatMates(mates,b,actors),{});
        A.cover = post ? [post.x,post.z,post.y] : null;
      }
      if (A.cover) moved = botSteer(b, A.cover[0], A.cover[1], dt, base * 0.95, m, A.cover[2]);
      else { vx = -dx / dist; vz = -dz / dist; sp = base * 0.8; }
    }
    else if (policy.highGround && !coop && !A.guardPlayer && b.id%4===1 && A.wp && (A.wpY||0)>=3.5 && (Math.abs(A.wpY-b.y)>.15 || Math.hypot(A.wp[0]-b.x,A.wp[1]-b.z)>1.6) && dist>6 && b.hp>35) {moved=botSteer(b,A.wp[0],A.wp[1],dt,base*.9,m,A.wpY);}
    else if (infectedChaser && (dist > 1.85 || Math.abs((tg.y||0)-b.y)>1.1)) {
      // React only to nearby, observed fire or damage; keep legal navigation and melee pursuit.
      if (!A.infectionEvasion) A.infectionEvasion = InfectionEvasion.create(b.id);
      const floor = groundAt(m, b.x, b.z, b.y);
      const scratch = A.infectionEvasionScratch || (A.infectionEvasionScratch = { opts: { target: {} }, out: {} });
      const opts = scratch.opts;
      opts.time = t; opts.x = b.x; opts.z = b.z; opts.distance = dist; opts.visible = true;
      opts.target.x = tg.x; opts.target.y = tg.y || 0; opts.target.z = tg.z; opts.skill = b.skill;
      opts.grounded = Math.abs(b.y - floor) < 0.07 && (b.vy || 0) <= 0;
      opts.clearance = wallDist(m, b.x, b.y + BODY_H - 0.05, b.z, 0, 1, 0, 1.05) >= 1.03 && b.tagUntil <= t;
      const dodge = InfectionEvasion.choose(A.infectionEvasion, opts, null, scratch.out);
      if (dodge.goal) moved = botSteer(b, dodge.goal.x, dodge.goal.z, dt, base * 0.91, m, dodge.goal.y);
      if (dodge.jump) b.vy = 6.6; // Normal gravity and collision remain authoritative.
      if (!moved && dist > 10 && b.id % 3 !== 0) {
        if (t >= (A.flankAt || 0) || !A.flankGoal) {
          A.flankAt = t + 2500;
          A.flankGoal = Tactics.pincer(buildNav(m), b, tg, b.id, [], 'hunter');
        }
        const side = A.flankGoal;
        moved = side ? botSteer(b, side.x, side.z, dt, base * 0.95, m, side.y) : false;
      }
      if (!moved) moved = botSteer(b, tg.x, tg.z, dt, base * 0.95, m, tg.y || 0);
    }
    else if (isInfection() && !b.infected && A.infectionRole && dist < (A.infectionRole==='hunt'?4.5:9.5)) {
      if(t>=(A.infectionRetreatAt||0)||!A.infectionRetreat){
        A.infectionRetreatAt=t+900;
        A.infectionRetreat=Tactics.retreat(buildNav(m),b,tg,fillBotCombatMates(mates,b,actors));
      }
      const safe=A.infectionRetreat;
      if(safe)moved=botSteer(b,safe.x,safe.z,dt,base*.94,m,safe.y);
      else {vx=-dx/dist;vz=-dz/dist;sp=base*.78;}
    }
    else if (isInfection() && !b.infected && A.infectionRole==='protect' && A.guardPlayer && A.wp) {
      const anchor=players.get(A.guardAnchor),postD=Math.hypot(A.wp[0]-b.x,A.wp[1]-b.z);
      if((anchor&&Math.hypot(anchor.x-b.x,anchor.z-b.z)>10)||postD>2.2)moved=botSteer(b,A.wp[0],A.wp[1],dt,base*.82,m,A.wpY||0);
      else {vx=-dz/dist*A.strafe;vz=dx/dist*A.strafe;sp=base*.30;}
    }
    else if (isInfection() && !b.infected && (A.infectionRole==='hide'||A.infectionRole==='hold') && A.wp) {
      let post=null;
      if(A.infectionRole==='hide'&&t>= (A.hideCoverAt||0)){
        A.hideCoverAt=t+1200;
        // `t` is this AI decision's timestamp; cover() needs the observed
        // threat actor. Passing the timestamp generated NaN cover targets,
        // which silently left hiding survivors without valid cover choices.
        A.hideCover=Tactics.cover(buildNav(m),b,tg,[...players.values()].filter(p=>p!==b&&p.alive&&sameCombatSide(p,b)));
      }
      if(A.infectionRole==='hide'&&A.hideCover)post=A.hideCover;
      const gx=post?post.x:A.wp[0],gz=post?post.z:A.wp[1],gy=post?post.y:(A.wpY||0),postD=Math.hypot(gx-b.x,gz-b.z);
      if(postD>2.3||Math.abs(gy-b.y)>.6)moved=botSteer(b,gx,gz,dt,base*.72,m,gy);
      else {vx=-dz/dist*A.strafe;vz=dx/dist*A.strafe;sp=base*(A.infectionRole==='hide'?.18:.30);}
    }
    else if (policy.id === 'tactical' && !coop && !infectedChaser && Tactics.holdsPost(b.id,dist,A.guardPlayer) && A.wp) {
      /* A dedicated lane-holder keeps part of the squad on its assigned post
         while engaging. Other bots can advance or flank instead of dogpiling. */
      const postD=Math.hypot(A.wp[0]-b.x,A.wp[1]-b.z);
      if(postD>2.2)moved=botSteer(b,A.wp[0],A.wp[1],dt,base*.72,m,A.wpY||0);
      else {vx=-dz/dist*A.strafe;vz=dx/dist*A.strafe;sp=base*.30;}
    }
    else if (policy.flank && !coop && !infectedChaser && b.id%3===0 && !b.rl && dist>8 && dist<45 && b.hp>=40) {
      // One member of each three-bot slice pressures from a side angle;
      // wingmen keep direct lanes and do not all run to the same enemy.
      if(t>=(A.flankAt||0)||!A.flankGoal){
        A.flankAt=t+3200;
        A.flankGoal=Tactics.pincer(buildNav(m),b,tg,b.id,fillBotCombatMates(mates,b,actors),'tactical');
      }
      if(A.flankGoal && (Math.hypot(A.flankGoal.x-b.x,A.flankGoal.z-b.z)>1.8 || Math.abs(A.flankGoal.y-b.y)>.5))
        moved=botSteer(b,A.flankGoal.x,A.flankGoal.z,dt,base*.84,m,A.flankGoal.y);
      else if(dist>R+5)moved=botSteer(b,tg.x,tg.z,dt,base*.83,m,tg.y||0);
      else {vx=-dz/dist*A.strafe;vz=dx/dist*A.strafe;sp=base*.2;}
    }
    else if (coop && dist < 5.5) { vx = -dx / dist; vz = -dz / dist; sp = base * 0.95; }              /* kite the horde */
    else if (coop && A.squadGoal && coopAnchor(b) &&
             (Math.hypot(b.x-coopAnchor(b).x,b.z-coopAnchor(b).z) > (A.squadRole === 'protect' ? 9 : 17) ||
              (A.squadRole === 'secure' && dist > 13))) {
      /* Fall back to assigned player lane instead of chasing the horde away. */
      const g = A.squadGoal;
      if (Math.hypot(g.x-b.x,g.z-b.z)>1.8 || Math.abs(g.y-b.y)>.5)
        moved=botSteer(b,g.x,g.z,dt,base*.9,m,g.y);
    }
    else if (dist > R + policy.approachExtra || Math.abs((tg.y || 0) - b.y) > 1.1) { moved = botSteer(b, tg.x, tg.z, dt, base * policy.pursuitScale, m, tg.y || 0); }
    else if (!w.melee && dist < R * 0.4 && !w.pellets) { vx = -dx / dist; vz = -dz / dist; sp = base * 0.45; }
    else if (w.key !== 'longbow' && w.key !== 'rampart' && !(w.longRange)) { vx = -dz / dist * A.strafe; vz = dx / dist * A.strafe; sp = base * 0.42; }
    if (sp > 0) { b.x += vx * sp * dt; b.z += vz * sp * dt; moved = true; intended = sp * dt; A.free = true; }
    /* Navigation may turn the body. Aim after movement so visible facing and
       shot direction agree, with finite yaw and pitch tracking speed. */
    const ax = tg.x - b.x, az = tg.z - b.z;
    const ty = A.head ? (tg.isZ ? BODY_H * tg.t.h * 0.93 + (tg.y || 0) : bodyH(tg.cr || 0, tg.pr || 0) * 0.93 + (tg.y || 0)) : chestY(tg);
    b.yaw = turnAng(aimYaw, Math.atan2(-ax, -az), S.turn * dt);
    b.pitch += clamp(Math.atan2(ty - (b.y + EYE), Math.hypot(ax, az)) - b.pitch, -S.turn * dt * 0.65, S.turn * dt * 0.65);
    A.moving = moved;
    if (A.seenT >= S.react * (coop ? 0.5 : 1) * (0.8 + (b.id % 5) * 0.1) && G.phase === 'live') botFire(b, tg, dist, S, t, actors);
  } else {
    A.moving = false; A.shots = 0;
    let goal = null, goalY = b.y, sp = base * 0.8;
    if (isBomb() && BOMB.state && BOMB.state.use && BOMB.state.use.actorId===b.id) { /* hold position until authoritative plant/defuse completion */ }
    else if (A.bombGoal) { goal=[A.bombGoal[0],A.bombGoal[1]];goalY=A.bombGoal[2]||0;sp=base*.92;if(Math.hypot(goal[0]-b.x,goal[1]-b.z)<1.8&&Math.abs(goalY-b.y)<.5)goal=null; }
    else if (policy.highGround && !coop && !A.guardPlayer && b.id%4===1 && A.wp && (A.wpY||0)>=3.5 && b.hp>35 && (Math.abs(A.wpY-b.y)>.15||Math.hypot(A.wp[0]-b.x,A.wp[1]-b.z)>1.6) && (!A.invest||Math.hypot(A.invest.x-b.x,A.invest.z-b.z)>8)) {goal=A.wp;goalY=A.wpY;sp=base*.9;}
    else if (A.invest && A.alert > 0) { goal = [A.invest.x, A.invest.z]; goalY = A.invest.y || 0; sp = base * 0.95; if (Math.hypot(goal[0] - b.x, goal[1] - b.z) < 1.5 && Math.abs(goalY - b.y) < 0.5) { A.invest = null; A.alert = 0; } }
    else if (coop) {
      const rescue = coopRescue(b), anchor = coopAnchor(b), g = A.squadGoal;
      /* Reinforcements cover a pressured ally without teleporting or free healing. */
      const target = rescue && Math.hypot(rescue.x-b.x,rescue.z-b.z)>4 &&
        Math.abs(rescue.y-b.y)<1.1 ? rescue : g;
      if (target) { goal=[target.x,target.z]; goalY=target.y || 0;
        sp=base*(Math.hypot(goal[0]-b.x,goal[1]-b.z)>13 ? 1 : .78);
        if (Math.hypot(goal[0]-b.x,goal[1]-b.z)<1.6 && Math.abs(goalY-b.y)<.5) goal=null;
      } else if (!anchor) { A.wpT -= dt; if (!A.wp || A.wpT <= 0) botPickWaypoint(b,m); goal=A.wp; goalY=A.wpY||0; }
    } else {
      A.wpT -= dt; if (!A.wp || A.wpT <= 0 || (Math.hypot(A.wp[0] - b.x, A.wp[1] - b.z) < 1.6 && Math.abs((A.wpY||0)-b.y)<.15)) botPickWaypoint(b, m, actors);
      goal = A.wp; goalY = A.wpY || 0;
    }
    if (goal) moved = botSteer(b, goal[0], goal[1], dt, sp, m, goalY);
  }
  if (moved && intended>0) { resolveCircle(m, b, 0.4); if (Math.hypot(b.x - px0, b.z - pz0) < intended * 0.4) A.strafe = -A.strafe; }
  /* anti-stacking against everyone else */
  for(const o of actors){ if (o === b || !o.alive || Math.abs(b.y - o.y) > 1.2) continue; const ox = b.x - o.x, oz = b.z - o.z; if (ox > 0.75 || ox < -0.75 || oz > 0.75 || oz < -0.75) continue; const d2 = ox * ox + oz * oz; if (d2 < 0.5625 && d2 > 1e-6) { const d = Math.sqrt(d2), pu = (0.75 - d) * 0.5; b.x += ox / d * pu; b.z += oz / d * pu; } }
  /* stuck detection: no progress for a while means pick another goal */
  A.stuckT += dt; if (A.stuckT >= 1.2) { if (moved && Math.hypot(b.x - A.sx, b.z - A.sz) < 0.35) { A.nStuck++; botStats.stuck++; A.path = null; A.wp = null; A.invest = null; A.coverAt = 0; A.strafe = -A.strafe; } else A.nStuck = 0; A.sx = b.x; A.sz = b.z; A.stuckT = 0; }
  settleBotHeight(b, dt, m); resolveCircle(m, b, 0.4);
  if (!tg) b.pitch += clamp(-b.pitch, -dt * 2, dt * 2);
  b.hist.push({ t, x: b.x, y: b.y, z: b.z, cr: 0, pr: 0 }); while (b.hist.length && b.hist[0].t < t - HIST_MS) b.hist.shift();
}
function botsTick(dt, t) {
  if (G.phase !== 'live') return;
  const diag=eventLoopDiagnostics.enabled,batchT=diag?performance.now():0;let decisions=0,budgetDeferred=0,budgetHit=false;
  const roster=[...players.values()];let aliveBotCount=0;for(const p of roster)if(p.bot&&p.alive&&p.ai)aliveBotCount++;
  const thinkEvery=botThinkIntervalNow=botThinkIntervalMs(aliveBotCount);
  const m = mapData(); pathBudget = 2;pathSpentMs=0;
  const squadT=diag?performance.now():0;
  updateCoopSquad(t);
  if(diag){const squadMs=performance.now()-squadT;botWorkDiagnostics.squadMs+=squadMs;botWorkDiagnostics.squadMaxMs=Math.max(botWorkDiagnostics.squadMaxMs,squadMs);}
  // Spread bot AI work according to the bounded aggregate decision budget.
  // The 50 Hz host/snapshot cadence is unchanged; clients still receive
  // projected bot motion between these authoritative decisions.
  const thinkWorkStarted=performance.now(),count=roster.length,start=count?botTickCursor%count:0;let deferredDue=0,completedAny=false;
  for(let offset=0;offset<count;offset++){
    const rosterIndex=(start+offset)%count,b=roster[rosterIndex];
    if (!b.bot || !b.alive || !b.ai) continue;
    const A=b.ai;
    const phase=aliveBotCount?(b.id%aliveBotCount)*thinkEvery/aliveBotCount:0;
    if (!Number.isFinite(A.nextThinkAt)) A.nextThinkAt=t+phase;
    // A bot that is not due must not terminate this whole roster pass.
    // Returning here starved every later bot until the cursor happened to
    // rotate past the waiting bot, producing delayed movement and fire.
    if (t < A.nextThinkAt) continue;
    if(decisions>=BOT_THINK_MAX_PER_TICK){deferredDue++;continue;}
    if(budgetHit||botThinkBudgetExpired(performance.now()-thinkWorkStarted)){
      budgetHit=true;budgetDeferred++;continue;
    }
    const priorThinkAt=A.lastThinkAt,elapsedMs=Number.isFinite(priorThinkAt)?Math.max(0,t-priorThinkAt):dt*1000;
    const thinkDt=clamp(elapsedMs/1000,0.005,0.1),fromX=b.x,fromZ=b.z,fromYaw=b.yaw,fromPitch=b.pitch;
    A.lastThinkAt=t;
    /* Preserve each bot's phase when a host tick arrives late. Resetting every
       overdue deadline to t+50 synchronized the full roster after one stall. */
    const dueAt=A.nextThinkAt,lateness=t-dueAt;
    if(lateness>=thinkEvery) A.nextThinkAt=t+thinkEvery+phase;
    else {
      const nextThinkAt=dueAt+thinkEvery;
      A.nextThinkAt=nextThinkAt<=t?nextThinkAt+(Math.floor((t-nextThinkAt)/thinkEvery)+1)*thinkEvery:nextThinkAt;
    }
    if(diag){
      const thinkT=performance.now(),scanBefore=botWorkDiagnostics.scanMs,waypointBefore=botWorkDiagnostics.waypointMs,pathBefore=botStats.pathMs,pathCallsBefore=botStats.paths;
      try{botThink(b,thinkDt,t,m,roster);}
      finally{
        const ms=performance.now()-thinkT;botWorkDiagnostics.thinks++;botWorkDiagnostics.thinkMs+=ms;botWorkDiagnostics.thinkMaxMs=Math.max(botWorkDiagnostics.thinkMaxMs,ms);if(ms>2)botWorkDiagnostics.thinkOver2Ms++;
        if(ms>=4){
          const scanMs=botWorkDiagnostics.scanMs-scanBefore,waypointMs=botWorkDiagnostics.waypointMs-waypointBefore,pathMs=botStats.pathMs-pathBefore;
          recentSlowBotThinks.push({at:Date.now(),botId:b.id,team:b.team,mode:G.mode,thinkMs:r2(ms),scanMs:r2(scanMs),waypointMs:r2(waypointMs),pathMs:r2(pathMs),pathCalls:botStats.paths-pathCallsBefore,otherMs:r2(Math.max(0,ms-scanMs-waypointMs-pathMs)),weapon:b.cur,targetId:b.ai.tgt&&b.ai.tgt.id||null,squadRole:b.ai.squadRole||null,infectionRole:b.ai.infectionRole||null,infected:!!b.infected});
          if(recentSlowBotThinks.length>16)recentSlowBotThinks.shift();
        }
      }
    }
    else botThink(b,thinkDt,t,m,roster);
    decisions++;
    botStats.thinks++;
    /* Resume after the last serviced actor. When a time/catch-up cap defers
       the tail of the due queue, advancing by only one roster slot repeatedly
       puts the same actors at the front and makes overdue bots wait unevenly. */
    botTickCursor=(rosterIndex+1)%count;completedAny=true;
    /* Large lobbies stagger expensive AI decisions by the host budget. Retain the
       authoritative step, but remember its velocity so network snapshots can
       visually fill the gaps between those decisions. */
    recordBotRenderMotion(A,b,fromX,fromZ,fromYaw,fromPitch,thinkDt,t,thinkEvery,A.nextThinkAt);
  }
  if(count&&!completedAny)botTickCursor=(start+1)%count;
  /* Keep scheduler-cause counters on in ordinary hosts. These integer updates
     add no timers or per-bot allocations, and let /status distinguish an AI
     work-budget shortfall from network snapshot backpressure without enabling
     the heavier timing diagnostics. */
  if(budgetHit)botStats.thinkBudgetHitTicks++;
  botStats.thinkBudgetDeferredBots+=budgetDeferred;
  botStats.thinkCapDeferredBots+=deferredDue;
  if(diag){const thinkElapsed=performance.now()-thinkWorkStarted,ms=performance.now()-batchT;botWorkDiagnostics.batches++;botWorkDiagnostics.batchMs+=ms;botWorkDiagnostics.batchMaxMs=Math.max(botWorkDiagnostics.batchMaxMs,ms);botWorkDiagnostics.batchMaxDecisions=Math.max(botWorkDiagnostics.batchMaxDecisions,decisions);botWorkDiagnostics.deferredDueMax=Math.max(botWorkDiagnostics.deferredDueMax,deferredDue);if(deferredDue)botWorkDiagnostics.cappedBatches++;if(budgetHit){botWorkDiagnostics.budgetHitTicks++;botWorkDiagnostics.budgetDeferredBots+=budgetDeferred;botWorkDiagnostics.budgetDeferredMax=Math.max(botWorkDiagnostics.budgetDeferredMax,budgetDeferred);}botWorkDiagnostics.budgetElapsedMaxMs=Math.max(botWorkDiagnostics.budgetElapsedMax,thinkElapsed);}
}
function botsRoundReset(p) { p.ai = newAI(); }

/* ---------------- network messages ---------------- */
function onMessage(p, raw) {
  // The socket callback owns a specific player object. Ignore bytes delivered
  // after that session has been removed or replaced in the authoritative roster.
  if (!p || players.get(p.id) !== p || (p.c && p.c.closed)) return;
  if (raw.length > 8192) return;
  p.msgs++; let m; try { m = JSON.parse(raw); } catch (e) { return; }
  if (!m || typeof m.t !== 'string') return;
  if (p.protocol === MULTIPLAYER_PROTOCOL && SEQUENCED_CLIENT_MESSAGES.has(m.t)) {
    if (!Number.isSafeInteger(m.seq) || m.seq <= p.lastActionSeq || m.session !== p.session ||
        (LIFE_SCOPED_CLIENT_MESSAGES.has(m.t) && (!Number.isSafeInteger(m.ep) || m.ep !== p.ep))) {
      stats.rejected++; return;
    }
    p.lastActionSeq = m.seq;
  }
  switch (m.t) {



    case 'in': return onInput(p, m);
    case 'shot': return onShot(p, m);
    case 'buy': return onBuy(p, m);
    case 'ammo': return onAmmo(p,m);
    case 'obj': {
      // Objective actions were added in Protocol V2. Keep legacy sessions
      // compatible for ordinary play, but never accept unsequenced objective
      // mutations that cannot be bound to the current session/life epoch.
      if (p.protocol !== MULTIPLAYER_PROTOCOL) { stats.rejected++; return; }
      if (!['pickup','plant','defuse','cancel','drop'].includes(m.action)) { stats.rejected++; return; }
      if (!bombAction(p,m.action)) stats.rejected++;
      return;
    }
    case 'rl': {
      if (m.ep !== undefined && m.ep !== p.ep) return;
      if (!p.alive || (isInfection() && p.infected)) return; const key = String(m.w), w = W[key]; if (!w || w.melee || !p.owned.has(key)) return;
      settleReload(p); const a = p.ammo[key]; if (p.rl || a.mag >= w.mag || a.res <= 0) return;
      p.cur = key; p.rl = { w: key, at: now() + w.reload * 1000 }; return;
    }
    case 'cosmetic': {
      const skin=Characters.resolve(m.skin);
      if(skin !== m.skin || p.skin===skin) return;
      p.skin=skin;pushLobby();return;
    }
    case 'finishes': {
      if (!m.finishes || typeof m.finishes !== 'object' || Array.isArray(m.finishes)) return;
      const changes=Object.entries(m.finishes).slice(0,64);let updated=false;
      for(const [key,ix] of changes){if(!validFinishSelection(key,ix))continue;
        if(!p.finishes)p.finishes={};if(p.finishes[key]===ix)continue;p.finishes[key]=ix;updated=true;}
      if(updated)pushLobby();return;
    }
    case 'finish': {
      const key=String(m.key||'');const ix=m.index;
      if(!validFinishSelection(key,ix))return;
      if(!p.finishes)p.finishes={};if(p.finishes[key]===ix)return;
      p.finishes[key]=ix;pushLobby();return;
    }
    case 'pong': {
      if (!p.pingSent || m.s !== p.pingSent) return;
      const rtt = performance.now() - p.pingStartedMs;
      p.pingSent = 0;
      p.rtt = p.rtt ? p.rtt * 0.7 + rtt * 0.3 : rtt;
      p.rttAt = now();
      if (p.diagnostics) p.lastRttMs = rtt;
      return;
    }
    case 'team': {
      if (G.phase !== 'lobby' || groupMode()) return; const t = m.team === 1 ? 1 : 0; if (t === p.team) return;
      p.team = t; p.op = pickOp(t); syncBots(); pushLobby(); return;
    }
    case 'map': { if (!p.host || G.phase !== 'lobby' || !Object.hasOwn(MAPS,m.id)) return; G.map = m.id; if (isBomb()) prepareBombSites(); pushLobby(); return; }
    case 'cfg': {
      if (!p.host) return;
      if (G.phase !== 'lobby') { if (m.bots && Object.hasOwn(SKILL,m.bots.skill)) { setBotSkill(m.bots.skill); pushLobby(); } return; }
      if ([1, 3, 5, 8, 10, 15].includes(+m.rounds)) G.rounds = +m.rounds;
      if ((isDeathmatch() || isFFA() ? [180, 300, 600, 900] : [60, 90, 100, 150, 180]).includes(+m.time)) G.time = +m.time;
      if(isDeathmatch() && Deathmatch.SCORE_LIMITS.includes(+m.kills))G.kills=+m.kills;
      if(isFFA() && [10,20,30,50].includes(+m.kills))G.kills=+m.kills;
      if ([800, 2000, 5000, 9000].includes(+m.cash)) CFG.startMoney = +m.cash;
      if (typeof m.auto === 'boolean') G.auto = m.auto;
      if ((m.mode === 'versus' || m.mode === 'outbreak' || m.mode === 'infection' || m.mode === 'deathmatch' || m.mode === 'ffa' || m.mode === 'bomb') && m.mode !== G.mode) {
        botsOn(0).concat(botsOn(1)).forEach(removeBot);
        G.mode = m.mode; G.time=isDeathmatch()?300:100; let i = 0, groupCounts=[0,0];
        players.forEach(p => { p.team = groupMode() ? (groupCounts[0]<=groupCounts[1]?0:1) : (i % 2); if(groupMode())groupCounts[p.team]++; p.infected=false; p.op = groupMode() ? i : Math.floor(i / 2); i++; });
        if(isFFA()){BOTCFG.mode='add';BOTCFG.coop=12;G.kills=20;G.time=300;}
        else if(isBomb()){BOMB.settings=ModeRules.settings();G.rounds=Math.ceil(BOMB.settings.bestOf/2);G.time=BOMB.settings.roundSeconds;BOTCFG.mode='fill';BOTCFG.t0=5;BOTCFG.t1=5;}
        else G.rounds=LOBBY_DEFAULTS.rounds;
        if(!isBomb())BOMB.state=null;
      }
      if(isBomb() && m.bomb && typeof m.bomb==='object'){
        BOMB.settings=ModeRules.settings(Object.assign({},BOMB.settings,m.bomb));
        G.rounds=Math.ceil(BOMB.settings.bestOf/2);G.time=BOMB.settings.roundSeconds;
      }
      if (m.bots && typeof m.bots === 'object') {
        const b = m.bots, n = (v, hi) => clamp(Math.round(+v) || 0, 0, hi);
        if (b.skill !== undefined && Object.hasOwn(SKILL,b.skill)) setBotSkill(b.skill);
        if (G.phase === 'lobby') {
          if (b.mode === 'add' || b.mode === 'fill') BOTCFG.mode = b.mode;
          if (typeof b.balance === 'boolean') BOTCFG.balance = b.balance;
          if (b.t0 !== undefined) BOTCFG.t0 = n(b.t0, BOT_MAX_TEAM);
          if (b.t1 !== undefined) BOTCFG.t1 = n(b.t1, BOT_MAX_TEAM);
          if (b.coop !== undefined) BOTCFG.coop = n(b.coop, BOT_MAX_COOP);
        }
      }
      syncBots(); pushLobby();
      if (require.main === module && (m.mode !== undefined || (m.bots && (m.bots.coop !== undefined || m.bots.t0 !== undefined || m.bots.t1 !== undefined)))) {
        log('lobby config applied', 'mode', G.mode, 'requested co-op bots', BOTCFG.coop, 'active player bots', players.size - humanCount());
      }
      return;
    }
    case 'start': {
      if (!p.host || G.phase !== 'lobby') return;
      if (!teamsOk()) return send(p, { t: 'err', msg: isFFA() ? 'Free-for-all needs at least two combatants. Add a bot or another player.' : 'Each team needs at least one player.' });
      if (startMatch() === false) send(p, { t: 'err', msg: BOMB.unsupportedReason || 'The selected mode cannot start on this map.' }); return;
    }
    case 'endmatch': { if (p.host && G.phase !== 'lobby') { bcast({ t: 'err', msg: 'The host ended the match.' }); backToLobby(); } return; }
  }
}
function addPlayer(c, name) {
  const id = nextId++; let nm = String(name || 'Player').replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 16) || 'Player', base = nm, k = 2;
  while ([...players.values()].some(q => q.name === nm)) nm = base.slice(0, 13) + ' ' + (k++);
  const t0 = teamList(0).length, t1 = teamList(1).length, team = t0 <= t1 ? 0 : 1;
  const p = { id, c, name: nm, team, host: false, op: 0, rtt: 0, rttAt: 0, alive: false, spec: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, cr: 0, pr: 0, hp: 100, money: CFG.startMoney, k: 0, d: 0, hs: 0, ep: 0, protocol: 1, session: '', lastActionSeq: 0, lastIn: now(), lastShot: 0, hist: [], msgs: 0, lostKit: false, rl: null, skin: 'default', finishes: {} };
  p.op = pickOp(team); newLoadout(p); players.set(id, p); p.host = humanCount() === 1; return p;
}
function removePlayer(p) {
  if (isBomb() && BOMB.state && BOMB.state.carrierId===p.id && bombDropCarrier(p)) { bombStateBroadcast(); bcast({t:'objfx',event:'dropped',actorName:p.name||null,reason:'disconnected'}); }
  if (!players.delete(p.id)) return;
  DM.respawns.delete(p.id);
  FFA.respawns.delete(p.id);
  logPlayerConnection('left:', p, '(' + humanCount() + ' players connected)');
  const wasHost = p.host; if (wasHost) ensureHost();
  bcast({ t: 'left', id: p.id });
  if (!humanCount()) { players.forEach(q => { if (q.bot) { q.alive = false; } }); G.phase = 'lobby'; G.round = 0; G.score = [0, 0]; syncBots(); pushLobby(); return; }
  syncBots(); pushLobby();
  if (G.phase === 'live') { checkElimination(); checkAllDown(); }
  checkForfeit();
}
function joinMidMatch(p) {
  send(p, { t: 'start', mode: G.mode, map: G.map, stations: ammoStations(), rounds: G.rounds, time: G.time, kills: G.kills, weapons: WKEYS, cash: CFG.startMoney, teams: DATA.teams, late: true });
  p.money = CFG.startMoney; newLoadout(p);
  if (G.phase === 'buy') spawnPlayer(p, mapData(), [...players.values()].filter(q => q.team === p.team && q !== p && q.alive));
  else if ((isDeathmatch()||isFFA()) && G.phase==='live') {p.alive=false;p.spec=true;(isFFA()?FFA.respawns:DM.respawns).set(p.id,now()+1000);}
  else { p.alive = false; p.spec = true; }
  send(p, phaseMsg()); send(p, scoreMsg()); if (isCoop()) send(p, obMsg()); if (isInfection()) send(p,infectionMsg()); if(isBomb())send(p,{t:'objective',objective:bombStateMessage()});
}

/* ---------------- Zombie Infection: isolated authoritative round state ----------------
   Human clients cannot assign teams, convert other players, claim zombie weapons,
   or skip cooldowns. Unlike Outbreak, converted humans stay infected until next round. */
const INF = { started:false, chooseAt:0, respawns:new Map(), conversions:0, lastStandId:0 };
function infectionSurge() { return isInfection() && INF.started && G.phase==='live' && G.phaseEnd-now()<=25000; }
// Shotgun blast creates a larger but capped gap; rapid-fire weapons hold a lane.
// Server calculates all impulses from confirmed hits, never a client-provided force.
function infectionImpulse(dmg, wkey) {
  const w=W[wkey]; if(!w || w.melee || !Number.isFinite(dmg) || dmg<=0)return 0;
  const shotgun=!!w.pellets, rapid=w.rpm>=700;
  return clamp((shotgun?.46:rapid?.17:.23) + Math.sqrt(Math.min(dmg,250))*(shotgun?.028:.013), .10, shotgun?1.05:.58);
}
function infectionKnockback(from,z,dmg,wkey) {
  if (!isInfection() || !INF.started || G.phase!=='live' || !from || !z.alive || !z.infected || from.infected)return 0;
  const t=now(); if(t<(z.nextPush||0))return 0;
  const dx=z.x-from.x,dz=z.z-from.z,dist=Math.hypot(dx,dz);
  if(dist<.15)return 0;
  // Move along the attack line in small pieces; reject movement into solid cover.
  const f=Counter.fatigue(t,z.pushLast||0,z.pushStacks||0);
  const push=infectionImpulse(dmg,wkey)*f.scale, m=mapData();let moved=0;
  for(let v=.12;v<=push+.11;v+=.12){
    const x=z.x+dx/dist*Math.min(.12,push-moved), zz=z.z+dz/dist*Math.min(.12,push-moved);
    if(boxOverlap(m,x,zz,.4))break;
    z.x=x;z.z=zz;moved+=Math.min(.12,push-moved);if(moved>=push-.001)break;
  }
  if(moved<=0)return 0;
  z.nextPush=t+120;z.pushLast=t;z.pushStacks=f.stacks;
  // Force a synchronized relocation; stale pre-push inputs cannot undo it.
  if(!z.bot){z.ep++;z.creditT=t;z.moveCredit=.8;z.hist=[];send(z,{t:'corr',x:r2(z.x),y:r2(z.y),z:r2(z.z),ep:z.ep});}
  else if(z.ai){z.ai.path=null;z.ai.repathT=0;}
  return moved;
}
function infectionLastStand() {
  if(!INF.started || G.phase!=='live' || alive(0)!==1)return;
  const last=[...players.values()].find(p=>p.alive&&!p.infected);
  if(!last || INF.lastStandId===last.id)return;
  INF.lastStandId=last.id;
  last.armor=Math.min(100,last.armor+45);
  // Small, limited reserve boost, not an infinite-ammo power-up.
  last.owned.forEach(k=>{const w=W[k],a=last.ammo[k];if(w&&!w.melee&&a)a.res=Math.min(w.reserve,a.res+w.mag);});
  send(last,{t:'heal',hp:Math.ceil(last.hp),ar:Math.ceil(last.armor)});
  send(last,ammoMsg(last));
  bcast({t:'laststand',id:last.id,humans:1,remaining:Math.max(0,G.phaseEnd-now())});
}

function infectionMsg() {
  return {t:'inf', started:INF.started, remaining:Math.max(0,G.phaseEnd-now()),
    humans:alive(0), infected:alive(1), infectedIds:[...players.values()].filter(p=>p.infected).map(p=>p.id), chooseIn:INF.started?0:Math.max(0,INF.chooseAt-now()), surge:infectionSurge()};
}
function infectionReset() { INF.started=false; INF.chooseAt=0; INF.respawns.clear(); INF.conversions=0; INF.lastStandId=0; players.forEach(p=>{p.infected=false;}); }
function infectionPrepareBot(p) {
  p.money=0; p.hp=1150; p.armor=0; p.owned=new Set(['knife']); p.cur='knife'; p.rl=null;
  p.ammo={knife:{mag:1,res:0}}; p.dmgMul=1; p.ai=newAI(); p.nextShot=now()+1200;
}
function infectionConvert(p, source) {
  if (!isInfection() || !INF.started && source || G.phase!=='live' || !p.alive || p.infected) return false;
  p.infected=true; p.op=p.op%17; p.hp=source?1150:Math.min(3300,1500+alive(0)*100); p.armor=0; p.money=0;
  newLoadout(p); p.owned=new Set(['knife']);p.cur='knife';p.rl=null;
  p.ammo.knife={mag:1,res:0};p.nextShot=now()+(source?1200:1800); p.nextPush=0; p.pushLast=0;p.pushStacks=0;p.tagUntil=0;
  if (p.bot) {p.ai=newAI();p.dmgMul=1;infectionPrepareBot(p);}
  if (source) {source.k++;p.d++;}
  INF.conversions++; bcast({t:'inf',id:p.id,isInfected:true,by:source?source.id:0,started:true,remaining:Math.max(0,G.phaseEnd-now()),humans:alive(0),infected:alive(1)});
  send(p,{t:'infected',cur:'knife',owned:['knife'],hp:p.hp,ep:p.ep});
  bcast(scoreMsg());checkElimination();if(G.phase==='live')infectionLastStand();return true;
}
function infectionRespawn(p) {
  // Visual team colors stay fixed throughout Infection. Respawn eligibility is
  // allegiance-based so either original team can return after turning.
  if (!p || !p.infected || p.alive || G.phase!=='live') return;
  const m=mapData(), others=[...players.values()].filter(q=>q.alive && q!==p), hs=others.filter(q=>!q.infected);
  let candidate=null;
  const N=buildNav(m), pool=N.nodes.filter((n,i)=>n.y<.1 && N.reachable[i]);
  for(let i=0;i<160;i++) {
    const at=pool[Math.floor(Math.random()*pool.length)];if(!at)break;
    const dist=hs.length?Math.min(...hs.map(q=>Math.hypot(q.x-at.x,q.z-at.z))):100;
    if (dist<14 || boxOverlap(m,at.x,at.z,.65))continue;
    if(others.some(q=>Math.hypot(q.x-at.x,q.z-at.z)<2))continue;
    candidate=at;break;
  }
  if(!candidate){INF.respawns.set(p.id,now()+700);return;}
  p.x=candidate.x;p.z=candidate.z;p.y=groundAt(m,p.x,p.z,0);p.alive=true;p.infected=true;p.hp=1150;p.armor=0;p.cur='knife';p.rl=null;p.ep++;p.tagUntil=0;p.nextPush=0;p.pushLast=0;p.pushStacks=0;
  p.hist=[];p.lastShot=0;p.nextShot=now()+900;p.ai=p.bot?newAI():p.ai;
  p.moveCredit=.6;p.verticalCredit=.35;p.creditT=now();
  send(p,{t:'sp',x:r2(p.x),y:r2(p.y),z:r2(p.z),yaw:r2(p.yaw),ep:p.ep,hp:p.hp,money:0,owned:['knife'],armor:0,cur:'knife'});
  bcast({t:'inf',id:p.id,isInfected:true,respawn:true,started:true,remaining:Math.max(0,G.phaseEnd-now()),humans:alive(0),infected:alive(1)});
}
function infectionTick(t) {
  if(!INF.started && t>=INF.chooseAt) {
    INF.started=true;
    const roster=[...players.values()].filter(p=>p.alive && !p.infected);
    if(!roster.length)return endRound(1,'No humans remain');
    // Scale Patient Zero to the actual bot roster, independent of Blue/Red color.
    // If no AI bots are present, select from players while leaving one survivor.
    const botRoster=roster.filter(p=>p.bot),pool=botRoster.length?botRoster:roster.slice();
    const requested=botRoster.length||roster.length;
    const available=botRoster.length?botRoster.length:Math.max(0,pool.length-1);
    const first=ModeRules.infectionPatientZeroCount(requested,available);
    const chosen=[];for(let i=0;i<first&&pool.length;i++){const ix=Math.floor(Math.random()*pool.length);const p=pool.splice(ix,1)[0];if(infectionConvert(p,null))chosen.push(p.id);}
    bcast(infectionMsg());log('infection patient zero',chosen.join(','));
  }
  if(!INF.started)return;
  INF.respawns.forEach((when,id)=>{if(t<when)return;INF.respawns.delete(id);infectionRespawn(players.get(id));});
  if(t>=G.phaseEnd)endRound(0,'The survivors held until sunrise');
  else if(alive(0)===0)endRound(1,'Everyone was infected');
}
/* ---------------- main loop ---------------- */
let lastTickT = now();
const tickSamples=[], gapSamples=[];
let tickSampleWrite = 0, gapSampleWrite = 0;
function recordSample(samples, value, cursor) {
  if (samples.length < 2400) samples.push(value);
  else samples[cursor] = value;
  return (cursor + 1) % 2400;
}
function percentile(a,p) { if(!a.length)return 0;const s=a.slice().sort((a,b)=>a-b);return r2(s[Math.min(s.length-1,Math.floor(s.length*p))]); }
let heartbeatTickGapMax = 0, heartbeatTickWorkMax = 0;
function tick() {
  const t0 = process.hrtime.bigint();
  try { tickBody(); } catch (e) { stats.tickErrors++; log('tick error', e && e.stack || e); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6; stats.tickAvg = stats.tickAvg * 0.98 + ms * 0.02; if (ms > stats.tickMax) stats.tickMax = ms; if (ms > 30) stats.slow++;
  const components=stats.lastTickComponents||null;
  if(stats.lastTickPhase==='live'){
    liveTickSampleWrite=recordSample(liveTickSamples,ms,liveTickSampleWrite);liveTickMax=Math.max(liveTickMax,ms);
    if(components){components.otherMs=Math.max(0,ms-components.modeMs-components.botsMs-components.snapshotMs);for(const key of Object.keys(liveComponentMax))liveComponentMax[key]=Math.max(liveComponentMax[key],components[key]||0);}
  }
  if (stats.lastTickPhase==='live' && (stats.lastGap > 50 || ms > 20)) {
    recentSlowGaps.push({ at: Date.now(), gapMs: stats.lastGap, tickMs: r2(ms), previousTickMs:r2(previousTickWorkMs), tickComponents:components&&{...components}, previousComponents:previousTickComponents, phase: G.phase, mode: G.mode, bots: players.size - humanCount(), zombies: OB.zs.size, heapUsed: process.memoryUsage().heapUsed, lastGC: eventLoopDiagnostics.lastGC });
    if (recentSlowGaps.length > 16) recentSlowGaps.shift();
  }
  heartbeatTickGapMax = Math.max(heartbeatTickGapMax, stats.lastGap || 0);
  heartbeatTickWorkMax = Math.max(heartbeatTickWorkMax, ms);
  previousTickWorkMs=ms;previousTickComponents=components?{...components}:null;
  tickSampleWrite = recordSample(tickSamples, ms, tickSampleWrite);
}
function botSnapshotPosition(p, at) {
  let x=p.x, z=p.z;
  if (p.bot && p.ai && Number.isFinite(p.ai.renderVx) && Number.isFinite(p.ai.renderVz)) {
    const A=p.ai,age=botSnapshotMotionAgeMs(A,at)/1000;
    x+=A.renderVx*age; z+=A.renderVz*age;
  }
  return { x:r2(x), z:r2(z) };
}
function botSnapshotMotionAgeMs(A,at){
  if(!A||!Number.isFinite(at))return 0;
  const renderAt=Number.isFinite(A.renderAt)?A.renderAt:at,elapsed=Math.max(0,at-renderAt);
  /* Large-roster decisions are staggered beyond 100 ms. Carry the known
     motion through that bot's nominal interval plus one 20 ms host tick of
     deadline quantization, then ease stale motion to rest over a bounded tail. */
  const fullMs=clamp(Number.isFinite(A.renderFullMs)?A.renderFullMs:100,100,200);
  const full=Math.min(fullMs,elapsed),fade=Math.max(0,Math.min(50,elapsed-fullMs));
  return full+fade-(fade*fade)/100;
}
function botSnapshotAngles(p,at){
  let yaw=p.yaw,pitch=p.pitch;
  if(p.bot&&p.ai){
    const A=p.ai,age=botSnapshotMotionAgeMs(A,at)/1000;
    if(Number.isFinite(A.renderYawRate))yaw+=A.renderYawRate*age;
    if(Number.isFinite(A.renderPitchRate))pitch=clamp(pitch+A.renderPitchRate*age,-1.35,1.35);
  }
  if(Number.isFinite(yaw)){while(yaw>Math.PI)yaw-=2*Math.PI;while(yaw< -Math.PI)yaw+=2*Math.PI;}
  return {yaw:r2(yaw),pitch:r2(pitch)};
}
function recordBotRenderMotion(A,b,fromX,fromZ,fromYaw,fromPitch,movementDt,at,thinkIntervalMs,nextThinkAt){
  const stepSeconds=clamp(Number.isFinite(movementDt)?movementDt:0.005,0.005,0.1);
  const untilDeadline=Number.isFinite(nextThinkAt)?Math.max(0,nextThinkAt-at):Math.max(TICK_MS,Number.isFinite(thinkIntervalMs)?thinkIntervalMs:TICK_MS);
  const nextGapMs=Math.max(TICK_MS,Math.ceil(untilDeadline/TICK_MS)*TICK_MS),nextStepSeconds=Math.min(0.1,nextGapMs/1000),renderScale=nextStepSeconds/(nextGapMs/1000);
  /* Bot movement is integrated once per scheduled AI service, not on every
     20 ms host tick. Estimate the next bounded movement step over its actual
     tick-quantized deadline so its projected snapshots meet the next
     authoritative position instead of rewinding at that boundary. */
  A.renderVx=clamp((b.x-fromX)/stepSeconds*renderScale,-MAX_SPEED,MAX_SPEED);
  A.renderVz=clamp((b.z-fromZ)/stepSeconds*renderScale,-MAX_SPEED,MAX_SPEED);
  let yawDelta=(Number.isFinite(b.yaw)?b.yaw:0)-(Number.isFinite(fromYaw)?fromYaw:0);
  while(yawDelta>Math.PI)yawDelta-=2*Math.PI;while(yawDelta< -Math.PI)yawDelta+=2*Math.PI;
  A.renderYawRate=clamp(yawDelta/stepSeconds*renderScale,-12,12);
  A.renderPitchRate=clamp(((Number.isFinite(b.pitch)?b.pitch:0)-(Number.isFinite(fromPitch)?fromPitch:0))/stepSeconds*renderScale,-12,12);
  A.renderAt=at;
  A.renderFullMs=clamp(nextGapMs+TICK_MS,100,200);
}
function snapshotEveryNow() {
  if(SNAP_EVERY>1)return SNAP_EVERY;
  const entities=players.size+(isCoop()&&G.phase==='live'?OB.zs.size:0);
  /* Keep the normal and 64-AI lobbies at the 50 Hz simulation cadence. The
     previous 25 Hz threshold made remote bots visibly pause between updates
     once a 32-actor match began. Only throttle the unusually large 80+ actor
     roster, where serialization and per-client bandwidth become material. */
  return entities>=80?2:1;
}
function snapshotBacklogLimit(frameBytes) { return Math.max(4096,Math.ceil(Math.max(0,frameBytes)*1.25)); }
function snapshotEntityCount(){return players.size+(isCoop()&&G.phase==='live'?OB.zs.size:0);}
function tickBody() {
  tickN++; const t = now(), gap=t-lastTickT, dtS = clamp(gap / 1000, 0.005, 0.1); lastTickT = t; stats.lastGap=gap;stats.lastTickPhase=G.phase; gapSampleWrite = recordSample(gapSamples, gap, gapSampleWrite);if(stats.lastTickPhase==='live')liveGapSampleWrite=recordSample(liveGapSamples,gap,liveGapSampleWrite);
  const components=eventLoopDiagnostics.enabled?{modeMs:0,botsMs:0,snapshotMs:0,otherMs:0}:null;stats.lastTickComponents=components;
  if (G.phase === 'buy' && t >= G.phaseEnd) goLive();
  else if (G.phase === 'live') {
    const modeT=components?performance.now():0;
    if (isCoop()) outbreakTick(dtS);
    if (isInfection()) infectionTick(t);
      if (isDeathmatch() || isFFA()) deathmatchTick(t);
      if (isBomb()) bombTick(t);
    if(components)components.modeMs=performance.now()-modeT;
    const botsT=components?performance.now():0;
    botsTick(dtS, t);
    if(components)components.botsMs=performance.now()-botsT;
    if (!isCoop() && !isInfection() && !isDeathmatch() && !isFFA() && !isBomb() && t >= G.phaseEnd) { const a = alive(0), b = alive(1); endRound(a > b ? 0 : b > a ? 1 : -1, a === b ? 'Time ran out: draw' : 'Time ran out: more survivors win'); }
  } else if (G.phase === 'roundend' && t >= G.phaseEnd) {
    if (!teamsOk()) endMatchForfeit();
    else if (G.score[0] >= G.rounds || G.score[1] >= G.rounds) endMatch();
    else startRound();
  } else if (G.phase === 'matchend' && t >= G.phaseEnd) { if (G.auto && humanCount() && teamsOk()) startMatch(); else backToLobby(); }
  const snapshotEvery=snapshotEveryNow();
  const snapshotT=components?performance.now():0;
  if (tickN % snapshotEvery === 0 && (G.phase === 'buy' || G.phase === 'live' || G.phase === 'roundend')) {
    const pipelineStart=snapshotPipelineEnabled?performance.now():0;
    let actorCount=0;
    players.forEach(p => { if (p.team === 0 || p.team === 1) {
      const w = p.rl && W[p.rl.w], pos=botSnapshotPosition(p,t), reloadPct = w ? Math.max(1, Math.min(100, Math.round((p.rl.at - now()) / (w.reload * 1000) * 100))) : 0;
      const row=snapshotActorRowPool[actorCount]||(snapshotActorRowPool[actorCount]=[]);
      const angles=botSnapshotAngles(p,t);
      row[0]=p.id;row[1]=pos.x;row[2]=r2(p.y);row[3]=pos.z;row[4]=angles.yaw;row[5]=angles.pitch;row[6]=r2(p.cr);row[7]=r2(p.pr);row[8]=WKEYS.indexOf(p.cur);row[9]=p.alive?1:0;row[10]=reloadPct;row[11]=p.infected?1:0;
      snapshotActorRows[actorCount++]=row;
    } });
    snapshotActorRows.length=actorCount;
    snapshotMessage.n=++snapN;snapshotMessage.st=performance.now();snapshotMessage.infection=undefined;snapshotMessage.z=undefined;snapshotMessage.objective=isBomb()?bombStateMessage():undefined;
    if (isInfection()) {
      snapshotInfectedIds.length=0;players.forEach(q=>{if(q.infected)snapshotInfectedIds.push(q.id);});
      snapshotInfection.started=INF.started;snapshotInfection.remaining=Math.max(0,G.phaseEnd-now());snapshotInfection.humans=alive(0);snapshotInfection.infected=alive(1);snapshotInfection.chooseIn=INF.started?0:Math.max(0,INF.chooseAt-now());snapshotInfection.surge=infectionSurge();
      snapshotMessage.infection=snapshotInfection;
    }
    if (isCoop() && G.phase === 'live') {
      let zombieCount=0;OB.zs.forEach(z=>{const row=snapshotZombieRowPool[zombieCount]||(snapshotZombieRowPool[zombieCount]=[]);row[0]=z.id;row[1]=ZKINDS.indexOf(z.type);row[2]=r2(z.x);row[3]=r2(z.z);row[4]=r2(z.yaw);row[5]=r2(z.y);snapshotZombieRows[zombieCount++]=row;});
      snapshotZombieRows.length=zombieCount;snapshotMessage.z=snapshotZombieRows;
    } else snapshotZombieRows.length=0;
    const pipelineStamp=snapshotPipelineEnabled?performance.now():0;
    const pipelineBuildMs=snapshotPipelineEnabled?pipelineStamp-pipelineStart:0;
    const encodeStart=snapshotPipelineEnabled?performance.now():0;
    const buf = frame(1, Buffer.from(JSON.stringify(snapshotMessage), 'utf8'));
    const fanoutStart=snapshotPipelineEnabled?performance.now():0;
    // A snapshot is a replaceable full state. Keep at most about one pending
    // state per client; queueing several stale snapshots creates visible input
    // delay on busy LAN/Wi-Fi links even when radio signal is strong.
    const maxSnapshotBacklog=snapshotBacklogLimit(buf.length);
    players.forEach(p => { if (p.c && !p.c.closed) { const c=p.c,queuedBefore=c.backlog;c.snapshotQueueBytes=queuedBefore;c.snapshotQueuePeakBytes=Math.max(c.snapshotQueuePeakBytes,queuedBefore);if (queuedBefore < maxSnapshotBacklog) { const accepted=c.sendFrame(buf);c.snapshotFrames++;c.snapshotBytes+=buf.length;c.snapshotQueueBytes=c.backlog;c.snapshotQueuePeakBytes=Math.max(c.snapshotQueuePeakBytes,c.snapshotQueueBytes);if(!accepted)c.snapshotBackpressure++;stats.snaps++; stats.bytes += buf.length; } else {c.snapshotSkipped++;stats.skipped++;stats.backlogSkipped++;} } });
    if(snapshotPipelineEnabled){const done=performance.now();recordSnapshotPipeline(pipelineStamp,pipelineBuildMs,fanoutStart-encodeStart,done-fanoutStart,done-pipelineStart,buf.length);}
  }
  if(components)components.snapshotMs=performance.now()-snapshotT;
  if (t - lastSc > RESEND_SC_MS) { lastSc = t; if (G.phase !== 'lobby') bcast(scoreMsg()); }
}
let tickDeadline=performance.now()+TICK_MS;
function scheduleTick(){let wake=0,wakeOffset=0;if(tickSchedulerDiagnostics){wake=performance.now();wakeOffset=wake-tickDeadline;}tick();const t=performance.now();tickDeadline+=TICK_MS;let resynced=false;if(t-tickDeadline>TICK_MS*4){tickDeadline=t+TICK_MS;resynced=true;}const remaining=tickDeadline-performance.now(),delay=Math.max(1,remaining);if(tickSchedulerDiagnostics)recordTickScheduler(wakeOffset,t-wake,delay,resynced);setTimeout(scheduleTick,delay);}
// Importing the authority for deterministic tests must not start a perpetual loop.
if (require.main === module) {
  setTimeout(scheduleTick,TICK_MS);
  setInterval(() => {
    const t = now(); let n = 0;
    players.forEach(p => {
      if (p.bot) return;
      if (t - p.c.lastRx > 20000) { logPlayerConnection('timeout:', p); p.c.kill(); return; }
      p.pingSent = now();
      const ping = { t: 'ping', s: p.pingSent };
      const probeQueue = p.c.backlog;
      if (p.diagnostics) ping.diagnostics = {
        phase: G.phase, bundle: HOST_BUNDLE_SHA256, server: HOST_SERVER_SHA256,
        rttMs: p.rttAt && t - p.rttAt <= 5000 ? p.lastRttMs : null,
        displayedRttMs: p.rttAt && t - p.rttAt <= 5000 ? Math.round(p.rtt) : null,
        transportRttMs: performance.now() - (p.c.transportRttAt ?? -Infinity) <= 5000 ? r2(p.c.transportRttMs) : null,
        tickGapWindowMaxMs: heartbeatTickGapMax, tickWorkWindowMaxMs: r2(heartbeatTickWorkMax),
        tickWorkMs: r2(previousTickWorkMs), tickGapMs: stats.lastGap ?? null,
        snapshotCadenceMs: TICK_MS * snapshotEveryNow(),
        snapshotFrames: p.c.snapshotFrames, snapshotSkipped: p.c.snapshotSkipped,
        outboundQueueBytes: p.c.backlog, snapshotQueuePeakBytes: p.c.snapshotQueuePeakBytes
      };
      p.pingStartedMs = performance.now();
      send(p, ping);
      if (p.diagnostics && probeQueue === 0 && !p.c.closed) {
        const token = crypto.randomBytes(8);
        p.c.transportProbe = { token, started: performance.now() };
        p.c.send(9, token);
      }
      n++;
    });
    if (n && G.phase === 'lobby') pushLobbyPings();
    heartbeatTickGapMax = heartbeatTickWorkMax = 0;
  }, 2000);
}

/* ---------------- HTTP ---------------- */
const STATIC = {};
const FILES = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/sightline-theme.mp3':['sightline-theme.mp3','audio/mpeg'], '/fps-lab.html': ['fps-lab.html', 'text/html; charset=utf-8'], '/three.min.js': ['three.min.js', 'application/javascript; charset=utf-8'], '/engagement-prototypes.js':['engagement-prototypes.js','application/javascript; charset=utf-8'], '/mp-transport-policy.js':['mp-transport-policy.js','application/javascript; charset=utf-8'], '/threejs-license.txt':['threejs-license.txt','text/plain; charset=utf-8'], '/vr18-v31.js': ['vr18-v31.js', 'application/javascript; charset=utf-8'], '/navigation.js':['navigation.js','application/javascript; charset=utf-8'], '/squad-tactics.js':['squad-tactics.js','application/javascript; charset=utf-8'], '/bot-tactics.js':['bot-tactics.js','application/javascript; charset=utf-8'], '/character-poses.js':['character-poses.js','application/javascript; charset=utf-8'], '/character-prototypes.js':['character-prototypes.js','application/javascript; charset=utf-8'], '/character-realism.js':['character-realism.js','application/javascript; charset=utf-8'], '/character-realism-v12.js':['character-realism-v12.js','application/javascript; charset=utf-8'], '/thirdperson-hands.js':['thirdperson-hands.js','application/javascript; charset=utf-8'], '/zombie-counterplay.js':['zombie-counterplay.js','application/javascript; charset=utf-8'], '/infection-evasion.js':['infection-evasion.js','application/javascript; charset=utf-8'], '/zombie-hunt.js':['zombie-hunt.js','application/javascript; charset=utf-8'], '/squad-loadout.js':['squad-loadout.js','application/javascript; charset=utf-8'], '/deathmatch-rules.js':['deathmatch-rules.js','application/javascript; charset=utf-8'], '/gameplay-mode-rules.js':['gameplay-mode-rules.js','application/javascript; charset=utf-8'], '/optics-v1.js':['optics-v1.js','application/javascript; charset=utf-8'], '/weapon-realism.js':['weapon-realism.js','application/javascript; charset=utf-8'], '/weapon-skins.js':['weapon-skins.js','application/javascript; charset=utf-8'], '/legend-overlay.js':['legend-overlay.js','application/javascript; charset=utf-8'], '/legendary-packs.js':['legendary-packs.js','application/javascript; charset=utf-8'], '/character-skins.js':['character-skins.js','application/javascript; charset=utf-8'] };
function handleHttpRequest(req, res) {
  if (RELEASE_TLS && String(req.headers.host || '').toLowerCase() !== RELEASE_TLS.authority) {
    res.writeHead(421, { 'connection': 'close', 'cache-control': 'no-store' });
    return res.end('Misdirected request');
  }
  const u = (req.url || '/').split('?')[0];
  if(u==='/favicon.ico'){res.writeHead(204);return res.end();}
  if (u === '/status') {
    res.writeHead(200, { 'content-type': 'application/json','cache-control':'no-store' });
    if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))
      return res.end(JSON.stringify({ok:true,game:'sightline-v12-host-prototype',name:ROOM_NAME,instanceId:HOST_INSTANCE,protocol:MULTIPLAYER_PROTOCOL,transport:RELEASE_TLS?'release':'dev',bundle:HOST_BUNDLE_SHA256,server:HOST_SERVER_SHA256,phase:G.phase,mode:G.mode,map:G.map,players:humanCount(),maxPlayers:MAX_PLAYERS}));
    const statusAt=now(),clients=[...players.values()].filter(p=>!p.bot&&p.c&&!p.c.closed).map(p=>({
      id:p.id,team:p.team,alive:!!p.alive,
      rttMs:p.rttAt&&statusAt-p.rttAt<=5000?r2(p.rtt):null,
      rttAgeMs:p.rttAt?Math.max(0,statusAt-p.rttAt):null,
      receiveIdleMs:Math.max(0,statusAt-p.c.lastRx),
      outboundQueueBytes:p.c.backlog,
      snapshotFrames:p.c.snapshotFrames,snapshotBytes:p.c.snapshotBytes,
      snapshotSkipped:p.c.snapshotSkipped,snapshotBackpressure:p.c.snapshotBackpressure,
      snapshotQueueBytes:p.c.snapshotQueueBytes,snapshotQueuePeakBytes:p.c.snapshotQueuePeakBytes
    }));
    return res.end(JSON.stringify({
      ok:true,game:'sightline-v12-host-prototype',name:ROOM_NAME,instanceId:HOST_INSTANCE,protocol:MULTIPLAYER_PROTOCOL,transport:RELEASE_TLS?'release':'dev',maxPlayers:MAX_PLAYERS,bundle:HOST_BUNDLE_SHA256,server:HOST_SERVER_SHA256,
      capacity:MAX_TOTAL,players:humanCount(),bots:players.size-humanCount(),botsAlive:[...players.values()].filter(p=>p.bot&&p.alive).length,
      botConfig:{mode:BOTCFG.mode,cooperative:BOTCFG.coop,team0:BOTCFG.t0,team1:BOTCFG.t1},zombies:OB.zs.size,zombieCap:ZMAX,
      phase:G.phase,map:G.map,mode:G.mode,snapshot:{tickMs:TICK_MS,everyTicks:snapshotEveryNow(),hz:Math.round(1000/(TICK_MS*snapshotEveryNow())),entities:snapshotEntityCount()},clients,
      memory:process.memoryUsage(),cpu:process.cpuUsage(),collision:{...collisionStats},wallRays:{...wallRayStats},infection:isInfection()?infectionMsg():null,
      stats:{...stats,tickP50:percentile(tickSamples,.5),tickP95:percentile(tickSamples,.95),tickP99:percentile(tickSamples,.99),gapP95:percentile(gapSamples,.95),gapP99:percentile(gapSamples,.99),gapMax:gapSamples.length?Math.max(...gapSamples):0,samples:tickSamples.length},
      liveTiming:{tickP50:percentile(liveTickSamples,.5),tickP95:percentile(liveTickSamples,.95),tickP99:percentile(liveTickSamples,.99),tickMax:r2(liveTickMax),gapP95:percentile(liveGapSamples,.95),gapP99:percentile(liveGapSamples,.99),gapMax:liveGapSamples.length?Math.max(...liveGapSamples):0,samples:liveTickSamples.length},
      liveComponentMax:{...liveComponentMax},snapshotPipeline:snapshotPipelineSnapshot(),tickScheduler:tickSchedulerDiagnosticsSnapshot(),botPathTiming:botPathTimingSnapshot(),eventLoop:{...eventLoopDiagnostics,delayMs:eventLoopDelayMonitor?{p95:r2(eventLoopDelayMonitor.percentile(95)/1e6),p99:r2(eventLoopDelayMonitor.percentile(99)/1e6),max:r2(eventLoopDelayMonitor.max/1e6)}:null},
      slowGaps:recentSlowGaps.slice(-12),bot:botStats,botWork:{...botWorkDiagnostics,slowThinks:recentSlowBotThinks.slice(-12),budgetMs:BOT_THINK_BUDGET_MS,thinkIntervalMs:botThinkIntervalNow},navigation:OB.nav?{...OB.nav.pathDiagnostics,field:OB.nav.fieldDiagnostics||null}:null,
      zombiePaths:zombieHuntStats,outbreakSpawn:outbreakSpawnStats,tactics:Tactics.searchDiagnostics,botFx:{...botFxStats,perClientLimit:Math.round(1000/BOT_FX_MIN_INTERVAL_MS),nearbyRange:BOT_FX_RANGE}
    }));
  }
  const f = FILES[u];
  if (!f) { res.writeHead(404); return res.end('Not found'); }
  const fp = path.join(__dirname, f[0]);
  fs.stat(fp, (e0, st) => {
    if (e0) { res.writeHead(404); return res.end('Missing ' + f[0]); }
    const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || ''), ck = f[0] + (gz ? ':gz' : ''), hit = STATIC[ck];
    const out = (buf, enc) => { const h = { 'content-type': f[1], 'cache-control': (f[0]==='index.html'||f[0]==='character-poses.js'?'no-store':'no-cache'), 'content-length': buf.length, etag: 'W/"' + st.size + '-' + Math.round(st.mtimeMs) + '"' }; if (enc) h['content-encoding'] = 'gzip'; if (req.headers['if-none-match'] === h.etag) { res.writeHead(304); return res.end(); } res.writeHead(200, h); res.end(buf); };
    if (hit && hit.m === st.mtimeMs) return out(hit.b, gz);
    fs.readFile(fp, (err, raw) => { if (err) { res.writeHead(404); return res.end('Missing ' + f[0]); } const b = gz ? zlib.gzipSync(raw, { level: 6 }) : raw; STATIC[ck] = { m: st.mtimeMs, b }; out(b, gz); });   /* gzip once, then serve from memory: 400 KB becomes ~90 KB over Wi-Fi */
  });
}
const server = HostTransport.createListener(
  TRANSPORT_MODE,
  handleHttpRequest,
  RELEASE_TLS && RELEASE_TLS.secureOptions
);
// Bound pre-upgrade HTTP work and idle keep-alive sockets. WebSocket Conn
// explicitly disables the HTTP idle timeout after a validated upgrade.
server.headersTimeout=10000;
server.requestTimeout=15000;
server.keepAliveTimeout=5000;
server.timeout=15000;
server.maxHeadersCount=32;
server.maxConnections=MAX_PLAYERS+MAX_PENDING_HANDSHAKES+16;
function validWebSocketKey(value) {
  if (typeof value !== 'string') return false;
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === 16 && decoded.toString('base64') === value;
}
server.on('upgrade', (req, sock) => {
  const requestHost = String(req.headers.host || '');
  if (!HostTransport.allowWebSocketUpgrade({
    mode: TRANSPORT_MODE,
    origin: req.headers.origin,
    requestHost,
    encrypted: !!req.socket.encrypted,
    authority: RELEASE_TLS && RELEASE_TLS.authority
  })) { sock.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  const connectionTokens = String(req.headers.connection || '').split(',').map(token => token.trim().toLowerCase());
  if (req.method !== 'GET' || req.httpVersion !== '1.1' ||
      (req.url || '').split('?')[0] !== '/ws' ||
      String(req.headers.upgrade || '').trim().toLowerCase() !== 'websocket' ||
      !connectionTokens.includes('upgrade') ||
      String(req.headers['sec-websocket-version'] || '') !== '13' ||
      !validWebSocketKey(key)) { sock.destroy(); return; }
  if (humanCount() >= MAX_PLAYERS) {
    const accept=crypto.createHash('sha1').update(key+GUID).digest('base64');
    const close=Buffer.alloc(2);close.writeUInt16BE(4403);
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
    sock.end(frame(8,close));return;
  }
  const releasePending=reservePendingHandshake(sock.remoteAddress);
  if(!releasePending){sock.end('HTTP/1.1 429 Too Many Connections\r\nConnection: close\r\n\r\n');return;}
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  let me = null;
  let awaitingHello=true;
  const releaseHelloSlot=()=>{if(awaitingHello){awaitingHello=false;releasePending();}};
  const hello = setTimeout(() => { if (!me) c.kill(); }, 8000);
  const c = new Conn(sock, raw => {
    if (!me) {
      let m; try { m = JSON.parse(raw); } catch (e) { return c.kill(); }
      const negotiation = negotiateMultiplayerProtocol(m);
      if (!negotiation.ok) return c.closeAfterMessage({ t: 'err', code: negotiation.code, requiredProtocol: MULTIPLAYER_PROTOCOL, msg: negotiation.message });
      if (humanCount() >= MAX_PLAYERS) { c.text(JSON.stringify({ t: 'err', msg: 'Server is full.' })); return c.kill(); }
      if (players.size >= MAX_TOTAL) { const victim = [...players.values()].filter(p => p.bot).sort((a,b) => (a.alive-b.alive) || (b.id-a.id))[0]; if (victim) removeBot(victim); else { c.text(JSON.stringify({t:'err',msg:'Server is full.'})); return c.kill(); } }
      me = addPlayer(c, m.name); releaseHelloSlot(); ROOM_OPENED=true; logPlayerConnection('joined:', me, '(' + humanCount() + '/' + MAX_PLAYERS + ' players, ' + (players.size - humanCount()) + ' bots)');
      me.diagnostics = !RELEASE_TLS && m.diagnostics === true;
      me.lobbyPingUpdates = m.lobbyPingUpdates === true;
      me.protocol = MULTIPLAYER_PROTOCOL; me.session = crypto.randomBytes(16).toString('hex'); me.lastActionSeq = 0;
      send(me, { t: 'welcome', protocol: MULTIPLAYER_PROTOCOL, features: negotiation.features, session: me.session, id: me.id, host: me.host, max: MAX_PLAYERS });
      syncBots(); pushLobby();
      if (G.phase !== 'lobby') joinMidMatch(me);
      if(G.phase==='live'){checkElimination();checkAllDown();}
      return;
    }
    onMessage(me, raw);
  }, () => { clearTimeout(hello); releaseHelloSlot(); if (me) removePlayer(me); });
});
function fatalHostError(error, io = {}) {
  const err = error instanceof Error ? error : new Error(String(error == null ? 'Unknown fatal host error' : error));
  const record = {
    event: 'fatal_uncaught_exception',
    timestamp: new Date().toISOString(),
    name: String(err.name || 'Error').slice(0, 100),
    message: String(err.message || err).slice(0, 2000),
    stack: String(err.stack || '').slice(0, 12000)
  };
  const line = '[sightline-host] ' + JSON.stringify(record) + '\n';
  try {
    if (typeof io.write === 'function') io.write(line);
    else fs.writeSync(2, line);
  } catch (_) { /* Preserve fail-fast behavior even when stderr is unavailable. */ }
  const exit = typeof io.exit === 'function' ? io.exit : code => process.exit(code);
  exit(1);
}
if (require.main === module) process.on('uncaughtException', fatalHostError);
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? 'Port ' + PORT + ' is already in use. Close the other server or run the same --transport mode on port 8081.' : e); process.exit(1); });

function lanAddresses() {
  const out = []; const ifs = os.networkInterfaces();
  Object.keys(ifs).forEach(n => {if(/loopback|virtual|vethernet|docker|vpn|tun/i.test(n))return;(ifs[n]||[]).forEach(a=>{if(a.family==='IPv4'&&!a.internal&&isPrivateHostIPv4(a.address))out.push({name:n,ip:a.address});});});
  return out;
}
function ensureThree(cb) {
  const f = path.join(__dirname, 'three.min.js');
  try { if (fs.statSync(f).size > 400000) return cb(true); } catch (e) {}
  console.log('Downloading three.min.js once (needs internet on this PC). Other PCs will then not need internet.');
  const req = https.get('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', { timeout: 15000 }, res => {
    if (res.statusCode !== 200) { res.resume(); return cb(false); }
    const parts = []; res.on('data', d => parts.push(d)); res.on('end', () => { const b = Buffer.concat(parts); if (b.length < 400000) return cb(false); try { fs.writeFileSync(f, b); cb(true); } catch (e) { cb(false); } });
  });
  req.on('error', () => cb(false)); req.on('timeout', () => { req.destroy(); cb(false); });
}
if (require.main === module) {
  const have = (() => { try { return fs.statSync(path.join(__dirname, 'three.min.js')).size > 400000; } catch (e) { return false; } })();
  if(!have)throw new Error("Bundled Three.js is missing. Restore the game assets; this host never needs internet downloads.");
  let discoveryHost = null;
  server.listen(PORT, BIND, () => {
    console.log('\n  SIGHTLINE RANGE  -  LAN server running (max ' + MAX_PLAYERS + ' players, up to ' + MAX_TOTAL + ' with bots)');
    console.log('  LAN transport: ' + (RELEASE_TLS ? 'HTTPS/WSS release' : 'HTTP/WS development only'));
    console.log('  Build fingerprint (served phone-host page): ' + HOST_BUNDLE_SHA256);
    console.log('  Host source fingerprint: ' + HOST_SERVER_SHA256 + '\n');
    console.log('  Simulation tick: ' + TICK_MS + ' ms (' + (1000/TICK_MS).toFixed(2) + ' Hz); default is 20 ms.');
    const a = lanAddresses();
    if (RELEASE_TLS) {
      console.log('  Secure host:  https://' + RELEASE_TLS.authority + '/');
      console.log('  Friends join the approved DNS host over HTTPS/WSS. No plaintext listener is active.');
    } else {
      console.log('  Host (you):   http://localhost:' + PORT);
      if (a.length) a.forEach(x => console.log('  Friends join: http://' + x.ip + ':' + PORT + '    (' + x.name + ')'));
      else console.log('  No network found. Connect to Wi-Fi or turn on a hotspot, then restart.');
      if (argv.includes('--discover-lan')) {
        try {
          const Discovery = require('./lan-discovery.cjs');
          const discoveryInstance = HOST_INSTANCE;
          discoveryHost = Discovery.createLanDiscoveryHost({ interfaces: () => Object.fromEntries(Object.entries(os.networkInterfaces()||{}).map(([name,rows])=>[name,(rows||[]).filter(row=>row.address===BIND)])), info: () => ({
            id: discoveryInstance, name: ROOM_NAME, port: PORT, ready: ROOM_OPENED,
            players: humanCount(), maxPlayers: MAX_PLAYERS, phase: G.phase, mode: G.mode, map: G.map
          }), onError: error => console.error('  LAN discovery socket error:', error && (error.code || error.message) || 'unknown error') });
          if (discoveryHost.start()) console.log('  LAN discovery: private IPv4 query/reply only on UDP ' + Discovery.DISCOVERY_PORT + ' (HTTP/WS remains on this host)');
          else { console.log('  LAN discovery unavailable: no private IPv4 interface found. Manual IP remains available.'); discoveryHost.close(); discoveryHost = null; }
        } catch (e) { console.error('  LAN discovery unavailable:', e && e.message ? e.message : e); }
      }
    }
    console.log('\n  Keep this window open while you play. Press Ctrl+C to stop.\n');
  });
  const stopDiscovery = () => { if (discoveryHost) discoveryHost.close(); process.exit(0); };
  process.once('SIGINT', stopDiscovery); process.once('SIGTERM', stopDiscovery);
}
module.exports = { server, G, players, DATA, MAPS, _t: { transportMode:TRANSPORT_MODE, secureRelease:!!RELEASE_TLS, tickMs:TICK_MS, INF, infectionConvert, infectionTick, infectionRespawn, infectionPrepareBot, infectionImpulse, infectionKnockback, Counter, infectionLastStand, infectionSurge, infectionRole:Tactics.infectionRole, makeBot, addPlayer, damage, BOTCFG, desiredBots, botsOn, syncBots, startMatch, addPlayer, mapData, buildNav, astar, wallDist, wallRayStats, walkClear, OB, W, botStats, botPathPolicy: { maxVisits: BOT_PATH_MAX_VISITS, budgetMs: BOT_PATH_BUDGET_MS, workBudgetMs:BOT_PATH_WORK_BUDGET.maxMs, maxLandingChecks:BOT_PATH_WORK_BUDGET.maxLandingChecks, maxSmoothChecks:BOT_PATH_WORK_BUDGET.maxSmoothChecks }, botThinkPolicy:{intervalMs:Math.max(50,TICK_MS),intervalForRoster:botThinkIntervalMs,targetDecisionsPerSecond:BOT_THINK_DECISIONS_PER_SECOND,maxPerTick:BOT_THINK_MAX_PER_TICK,budgetMs:BOT_THINK_BUDGET_MS}, botThinkBudgetExpired, coopSquadPolicy:{assignmentsPerTick:SQUAD_ASSIGNMENTS_PER_TICK,workBudgetMs:SQUAD_WORK_BUDGET_MS}, resetCoopSquad, updateCoopSquad, outbreakSpawnPolicy:{randomOffers:ZSPOT_RANDOM_OFFERS,losRays:ZSPOT_LOS_RAY_BUDGET,maxSpawnedPerTick:1}, botFxStats, stats, onMessage, onInput, onShot, negotiateMultiplayerProtocol, multiplayerProtocol:MULTIPLAYER_PROTOCOL, multiplayerFeatures:MULTIPLAYER_FEATURES.slice(), sequencedClientMessages:[...SEQUENCED_CLIENT_MESSAGES], lifeScopedClientMessages:[...LIFE_SCOPED_CLIENT_MESSAGES], shotgunSpread, movementSpeedFrac, shotSpeedFrac, tickBody, botSnapshotPosition, botSnapshotAngles, botSnapshotMotionAgeMs, recordBotRenderMotion, snapshotEveryNow, snapshotEntityCount, snapshotBacklogLimit, sameCombatSide, bcastBotFx, boxOverlap, insertBotScanCandidate, botPickWaypoint, botThink, botSteer, botScan, botsTick, botBuy, hearShot, newAI, SKILL, BOT_MODE_POLICY, botModePolicy, botUnlimitedAmmo, botHasReload, settleReload, bestGun, ZT, makeZ, nearestZombieTargets, appendZombiePerceptionProbes, zombiePerceptionInterval, zombiePerceive, damageZ, stepZombies, startWave, outbreakTick, endWave, obReset, DM, deathmatchTick, deathmatchRespawn, endMatch, startRound, goLive, checkElimination, backToLobby, FFA, BOMB, scoreMsg, phaseMsg, bombStateMessage, bombAction, bombTick, bombBotObjective, teamsOk } };
