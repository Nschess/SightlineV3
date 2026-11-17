'use strict';

// Local-only IPv4 broadcast discovery. Advertisements reveal no player names,
// tokens, or match secrets. A reply is only a candidate; the game still requires
// the normal Protocol V2 WebSocket handshake before creating a player.
const dgram = require('node:dgram');
const crypto = require('node:crypto');
const http = require('node:http');
const os = require('node:os');

const DISCOVERY_PORT = 49192;
const SERVICE = 'sightline-v3-lan';
const DISCOVERY_VERSION = 1;
const MULTIPLAYER_PROTOCOL = 2;
const GAME_ID = 'sightline-v12-host-prototype';
const DEFAULT_SCAN_MS = 1200;
const HOST_TTL_MS = 3500;
const MAX_PACKET_BYTES = 1024;
const MAX_RESPONDED_ADDRESSES = 256;
const MAX_SCAN_HOSTS = 32;

function isRfc1918IPv4(value) {
  if (typeof value !== 'string') return false;
  const p = value.split('.');
  if (p.length !== 4 || p.some(x => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return false;
  const a = Number(p[0]), b = Number(p[1]);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function isPrivateIPv4(value) {
  if (!isRfc1918IPv4(value)) return false;
  const last = Number(value.split('.')[3]);
  return last > 0 && last < 255;
}

function ipv4Number(value) {
  return value.split('.').reduce((n, p) => ((n << 8) | Number(p)) >>> 0, 0) >>> 0;
}

function numberIPv4(value) {
  return [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join('.');
}

function validNetmask(mask) {
  if (typeof mask !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(mask) || mask.split('.').some(x => Number(x) > 255)) return false;
  const value = ipv4Number(mask), inverse = (~value) >>> 0;
  return value !== 0 && inverse !== 0 && (inverse & (inverse + 1)) === 0;
}

function privateBroadcastTargets(interfaces = os.networkInterfaces()) {
  const targets = new Set();
  for (const rows of Object.values(interfaces || {})) for (const row of rows || []) {
    if (!row || row.family !== 'IPv4' || row.internal || !isPrivateIPv4(row.address) || !validNetmask(row.netmask)) continue;
    const mask = ipv4Number(row.netmask);
    const broadcast = ((ipv4Number(row.address) & mask) | (~mask >>> 0)) >>> 0;
    const value = numberIPv4(broadcast);
    if (isRfc1918IPv4(value) && value !== row.address) targets.add(value);
  }
  return [...targets].slice(0, 8);
}

function encode(value) { return Buffer.from(JSON.stringify(value), 'utf8'); }

function parsePacket(packet) {
  if (!Buffer.isBuffer(packet) || packet.length < 2 || packet.length > MAX_PACKET_BYTES) return null;
  try { const value = JSON.parse(packet.toString('utf8')); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
  catch (_) { return null; }
}

function makeProbe(nonce) {
  if (typeof nonce !== 'string' || !/^[a-f0-9]{24,64}$/.test(nonce)) throw new Error('Invalid discovery nonce.');
  return encode({ service: SERVICE, kind: 'probe', version: DISCOVERY_VERSION, nonce });
}

function parseProbe(packet, remoteAddress) {
  if (!isPrivateIPv4(remoteAddress)) return null;
  const value = parsePacket(packet);
  if (!value || value.service !== SERVICE || value.kind !== 'probe' || value.version !== DISCOVERY_VERSION ||
      typeof value.nonce !== 'string' || !/^[a-f0-9]{24,64}$/.test(value.nonce)) return null;
  return { nonce: value.nonce };
}

function makeOffer(info, nonce) {
  const players = Number(info.players), maxPlayers = Number(info.maxPlayers);
  return encode({
    service: SERVICE, kind: 'offer', version: DISCOVERY_VERSION, nonce,
    id: String(info.id || '').slice(0, 64), name: String(info.name || 'Sightline Match').replace(/[\x00-\x1f\x7f]/g,'').slice(0,48),
    protocol: MULTIPLAYER_PROTOCOL, transport: 'dev', port: Number(info.port || 8080),
    players: Number.isInteger(players) ? Math.max(0, Math.min(32, players)) : 0,
    maxPlayers: Number.isInteger(maxPlayers) ? Math.max(2, Math.min(32, maxPlayers)) : 10,
    phase: ['lobby', 'live', 'post'].includes(info.phase) ? info.phase : 'lobby',
    mode: String(info.mode || 'versus').slice(0, 16), map: String(info.map || 'courtyard').slice(0, 32)
  });
}

function parseOffer(packet, remoteAddress, expectedNonce, seenAt = Date.now()) {
  if (!isPrivateIPv4(remoteAddress) || typeof expectedNonce !== 'string') return null;
  const value = parsePacket(packet);
  if (!value || value.service !== SERVICE || value.kind !== 'offer' || value.version !== DISCOVERY_VERSION ||
      value.nonce !== expectedNonce || value.protocol !== MULTIPLAYER_PROTOCOL || value.transport !== 'dev' ||
      value.port !== 8080 || typeof value.id !== 'string' || !/^[a-f0-9-]{16,64}$/i.test(value.id) ||
      !Number.isInteger(value.players) || value.players < 0 || value.players > 32 ||
      !Number.isInteger(value.maxPlayers) || value.maxPlayers < 2 || value.maxPlayers > 32 ||
      value.players > value.maxPlayers) return null;
  return {
    id: value.id, name: typeof value.name==='string'?value.name.slice(0,48):'Sightline Match', address: remoteAddress, port: 8080,
    players: value.players, maxPlayers: value.maxPlayers, phase: value.phase,
    mode: value.mode, map: value.map, protocol: value.protocol, transport: value.transport, seenAt
  };
}

function dedupeHosts(hosts, now = Date.now(), ttlMs = HOST_TTL_MS) {
  const byId = new Map();
  for (const host of hosts || []) {
    if (!host || !host.id || !isPrivateIPv4(host.address) || host.port !== 8080 ||
        !Number.isFinite(host.seenAt) || now - host.seenAt > ttlMs || host.seenAt > now + 1000) continue;
    const prior = byId.get(host.id);
    if (!prior || host.seenAt > prior.seenAt) byId.set(host.id, host);
  }
  return [...byId.values()].sort((a, b) => a.address.localeCompare(b.address));
}

function createLanDiscoveryHost({ info, interfaces = os.networkInterfaces, socketFactory = () => dgram.createSocket({ type: 'udp4', reuseAddr: true }), now = Date.now, onError = () => {} } = {}) {
  if (typeof info !== 'function') throw new TypeError('Discovery host info callback is required.');
  let sockets = [], started = false;
  const responded = new Map();
  function onMessage(socket, packet, remote) {
    const probe = parseProbe(packet, remote && remote.address);
    if (!probe || !remote || !Number.isInteger(remote.port) || remote.port < 1 || remote.port > 65535) return;
    const at = now(), prior = responded.get(remote.address) || 0;
    if (at - prior < 300) return;
    if (responded.size >= MAX_RESPONDED_ADDRESSES && !responded.has(remote.address)) {
      for (const [ip, stamp] of responded) if (at - stamp > 5000) responded.delete(ip);
      while(responded.size>=MAX_RESPONDED_ADDRESSES)responded.delete(responded.keys().next().value);
    }
    responded.set(remote.address, at);
    let body;
    try { const details=info(); if(details.ready===false)return; body = makeOffer(details, probe.nonce); } catch (_) { return; }
    socket.send(body, 0, body.length, remote.port, remote.address, () => {});
  }
  return {
    start() {
      if (started) return;
      started = true;
      const addresses = [...new Set(Object.values(interfaces() || {}).flat().filter(row => row && row.family === 'IPv4' && !row.internal && isPrivateIPv4(row.address)).map(row => row.address))].slice(0, 8);
      // Broadcast datagrams target the interface broadcast address, not its unicast IP.
      // One wildcard socket receives them on Windows and Android; source policy/rate limits still apply.
      for (const address of addresses.length ? ['0.0.0.0'] : []) {
        const socket = socketFactory(); sockets.push(socket);
        socket.on('message', (packet, remote) => onMessage(socket, packet, remote));
        socket.on('error', error => { try { onError(error); } catch (_) {} });
        socket.bind(DISCOVERY_PORT, address, () => {});
      }
      return sockets.length > 0;
    },
    close() { if (!started) return; started = false; for (const socket of sockets) try { socket.close(); } catch (_) {} sockets = []; responded.clear(); },
    get port() { return DISCOVERY_PORT; }
  };
}

function verifyHostStatus(host, timeoutMs = 650) {
  if (!host || !isPrivateIPv4(host.address) || host.port !== 8080) return Promise.resolve(null);
  return new Promise(resolve => {
    let done = false;
    const finish = value => { if (done) return; done = true; resolve(value); };
    const req = http.get({ host: host.address, port: host.port, path: '/status', timeout: timeoutMs, headers: { accept: 'application/json' } }, res => {
      if (res.statusCode !== 200) { res.resume(); return finish(null); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
      res.on('end', () => {
        try {
          const status = JSON.parse(body);
          if (!status.ok || status.game !== GAME_ID || status.protocol !== MULTIPLAYER_PROTOCOL || status.transport !== 'dev' ||
              !Number.isInteger(status.maxPlayers) || status.maxPlayers < 2 || status.maxPlayers > 32 ||
              !Number.isInteger(status.players) || status.players < 0 || status.players > status.maxPlayers) return finish(null);
          if (typeof status.instanceId === 'string' && status.instanceId !== host.id) return finish(null);
          finish({ ...host, name: String(status.name || host.name || 'Sightline Match').slice(0,48), players: Math.max(0, Math.min(status.players, status.maxPlayers)),
            maxPlayers: status.maxPlayers, phase: status.phase, mode: status.mode, map: status.map, verified: true });
        } catch (_) { finish(null); }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => finish(null));
  });
}

function createLanDiscoveryClient({ interfaces = os.networkInterfaces, socketFactory = () => dgram.createSocket('udp4'), now = Date.now,
  verify = verifyHostStatus, scanMs = DEFAULT_SCAN_MS } = {}) {
  let activeScan = null;
  async function scan() {
    if (activeScan) return activeScan;
    activeScan = new Promise(resolve => {
      const nonce = crypto.randomBytes(16).toString('hex'), found = new Map();
      let socket, settled = false, timer;
      const finish = async error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (socket) try { socket.close(); } catch (_) {}
        const discovered = dedupeHosts([...found.values()], now());
        const checked = error ? [] : await Promise.all(discovered.map(host => verify(host)));
        resolve({ ok: !error, error: error ? 'Local network discovery is unavailable. Check network permissions or use manual IP.' : '',
          hosts: checked.filter(Boolean), scannedAt: now() });
      };
      try {
        socket = socketFactory();
        socket.on('error', () => finish(true));
        socket.on('message', (packet, remote) => {
          const host = parseOffer(packet, remote && remote.address, nonce, now());
          if (host && (found.has(host.id) || found.size < MAX_SCAN_HOSTS) && (!found.has(host.id) || host.seenAt > found.get(host.id).seenAt)) found.set(host.id, host);
        });
        socket.bind(0, '0.0.0.0', () => {
          try { socket.setBroadcast(true); } catch (_) { return finish(true); }
          const targets = privateBroadcastTargets(interfaces());
          if (!targets.length) return finish(false);
          const probe = makeProbe(nonce);
          for (const address of targets) socket.send(probe, 0, probe.length, DISCOVERY_PORT, address, error => { if (error) finish(true); });
          timer = setTimeout(() => finish(false), Math.max(250, Math.min(1800, scanMs)));
        });
      } catch (_) { finish(true); }
    }).finally(() => { activeScan = null; });
    return activeScan;
  }
  return { scan };
}

module.exports = Object.freeze({ DISCOVERY_PORT, SERVICE, DISCOVERY_VERSION, MULTIPLAYER_PROTOCOL,
  isPrivateIPv4, isRfc1918IPv4, validNetmask, privateBroadcastTargets, makeProbe, parseProbe, makeOffer, parseOffer, dedupeHosts,
  createLanDiscoveryHost, createLanDiscoveryClient, verifyHostStatus });
