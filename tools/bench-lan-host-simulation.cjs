#!/usr/bin/env node
'use strict';
/*
 * In-process host-simulation benchmark for LAN bot-delay investigation.
 * It runs the actual authoritative server tick/AI and serializes snapshots to
 * two bounded in-memory client sinks. It deliberately opens no sockets.
 * This measures scheduler/tick/AI/serialization cost, not Wi-Fi or client FPS.
 * Usage: node tools/bench-lan-host-simulation.cjs [tick-ms] [mode] [bots]
 *        [map-id] [duration-ms] [output.json]
 */
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { monitorEventLoopDelay } = require('node:perf_hooks');

const tickMs = Number(process.argv[2] || 20);
const mode = String(process.argv[3] || 'deathmatch').toLowerCase();
const requestedBots = Math.max(2, Math.min(64, Math.trunc(Number(process.argv[4]) || 64)));
const mapId = String(process.argv[5] || 'courtyard');
const durationMs = Math.max(5000, Math.min(60000, Math.trunc(Number(process.argv[6]) || 10000)));
const out = path.resolve(process.argv[7] || `./acceptance/lan-host-simulation-${tickMs}ms-${mode}-${requestedBots}bots-${mapId}.json`);
const requestedSkill=String(process.env.SIGHTLINE_BENCH_SKILL||'recruit').toLowerCase();
const humanCount=Math.max(1,Math.min(10,Math.trunc(Number(process.env.SIGHTLINE_BENCH_HUMANS)||2)));
if (!Number.isFinite(tickMs) || tickMs < 10 || tickMs > 50) throw new Error('tick-ms must be 10–50');
if (!['versus', 'deathmatch', 'infection', 'outbreak'].includes(mode)) throw new Error('mode must be versus, deathmatch, infection, or outbreak');
if (!['recruit','regular','veteran','elite'].includes(requestedSkill)) throw new Error('SIGHTLINE_BENCH_SKILL must be recruit, regular, veteran, or elite');

process.argv = [process.argv[0], 'server.js', '--tick-ms', String(tickMs)];
const host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const { _t, G, players, DATA } = host;
if (!DATA.maps.some(map => map.id === mapId)) throw new Error(`Unknown map id: ${mapId}`);

const delays = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sortedSummary = values => {
  if (!values.length) return { count: 0, p50: null, p95: null, p99: null, max: null };
  const sorted = values.slice().sort((a, b) => a - b);
  const at = p => +sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))].toFixed(3);
  return { count: sorted.length, p50: at(.50), p95: at(.95), p99: at(.99), max: +sorted.at(-1).toFixed(3) };
};
function makeSink(name) {
  const stats = { name, frames: 0, applicationBytes: 0, snapshotFrames: 0, snapshotBytes: 0, backlog: 0, closed: false };
  const record = data => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
    stats.frames++;
    stats.applicationBytes += buf.length;
    // Server text frames are unmasked. Decode only enough of the frame header
    // to inspect the JSON message type; retain the original serialized bytes.
    if (buf.length >= 2) {
      let offset = 2;
      const len = buf[1] & 0x7f;
      if (len === 126) offset = 4;
      else if (len === 127) offset = 10;
      if (buf.subarray(offset).includes(Buffer.from('"t":"s"'))) {
        stats.snapshotFrames++;
        stats.snapshotBytes += buf.length;
      }
    }
  };
  const connection = {
    closed: false,
    backlog: 0,
    lastRx: Date.now(),
    text(value) { record(value); },
    sendFrame(value) { record(value); return true; },
    kill() { this.closed = true; stats.closed = true; }
  };
  return { stats, connection };
}

const sinks = Array.from({length:humanCount},(_,i)=>makeSink(i?'guest-'+i:'host'));
for (let i = 0; i < sinks.length; i++) _t.addPlayer(sinks[i].connection, `SimulationClient${i + 1}`);
G.map = mapId;
G.mode = mode;
G.time = 300;
G.rounds = 15;
G.auto = false;
_t.BOTCFG.mode = 'add';
_t.BOTCFG.balance = false;
_t.BOTCFG.skill = requestedSkill;
_t.BOTCFG.coop = requestedBots;
_t.BOTCFG.t0 = Math.ceil(requestedBots / 2);
_t.BOTCFG.t1 = Math.floor(requestedBots / 2);
_t.syncBots(true);
_t.startMatch();
_t.goLive();

const botList = [...players.values()].filter(p => p.bot);
const expectedBots = mode === 'outbreak' ? Math.min(requestedBots, 56) : requestedBots;
if (botList.length !== expectedBots) throw new Error(`Setup expected ${expectedBots} bots but created ${botList.length}`);
// One warm-up live step primes mode state and bot work before measuring.
_t.tickBody();
const sinkMarks = sinks.map(s => ({ frames: s.stats.frames, appBytes: s.stats.applicationBytes, snapFrames: s.stats.snapshotFrames, snapBytes: s.stats.snapshotBytes }));
const botThinkStart = _t.botStats.thinks, pathStart = _t.botStats.paths, pathMsStart = _t.botStats.pathMs;
const shotsStart = _t.botStats.shots, hitsStart = _t.botStats.hits, killsStart = _t.botStats.kills;
const cpuStart = process.cpuUsage();
const heapStart = process.memoryUsage().heapUsed;
const delayMonitor = monitorEventLoopDelay({ resolution: 10 });
delayMonitor.enable();

async function main() {
let tickWorkMs = [], lastTickAt = null, tickErrors = 0, activeSamples = [], movedBots = new Set(), lastPositions = new Map();
for (const bot of botList) lastPositions.set(bot.id, [bot.x, bot.z]);
const start = performance.now();
let deadline = start + tickMs;
const until = start + durationMs;
while (performance.now() < until) {
  await pause(Math.max(1, deadline - performance.now()));
  const tickAt = performance.now();
  if (lastTickAt !== null) delays.push(tickAt - lastTickAt);
  lastTickAt = tickAt;
  const cpuTickStart = process.hrtime.bigint();
  try { _t.tickBody(); } catch (error) { tickErrors++; }
  tickWorkMs.push(Number(process.hrtime.bigint() - cpuTickStart) / 1e6);
  const aliveBots = botList.filter(bot => bot.alive).length;
  activeSamples.push(aliveBots);
  for (const bot of botList) {
    const prev = lastPositions.get(bot.id);
    if (prev && Math.hypot(bot.x - prev[0], bot.z - prev[1]) > .02) movedBots.add(bot.id);
    lastPositions.set(bot.id, [bot.x, bot.z]);
  }
  const finishedAt = performance.now();
  deadline += tickMs;
  if (finishedAt - deadline > tickMs * 4) deadline = finishedAt + tickMs;
}

delayMonitor.disable();
const elapsedMs = performance.now() - start;
const cpu = process.cpuUsage(cpuStart);
const botThinkCalls = Math.max(0, _t.botStats.thinks - botThinkStart);
const averageAliveBots = activeSamples.reduce((sum, value) => sum + value, 0) / Math.max(1, activeSamples.length);
const thinkRatePerAliveBot = botThinkCalls / Math.max(.001, elapsedMs / 1000) / Math.max(1, averageAliveBots);
const snapshotEveryTicks = _t.snapshotEveryNow();
const bytesByClient = sinks.map((sink, i) => {
  const mark = sinkMarks[i];
  const seconds = elapsedMs / 1000;
  return {
    client: sink.stats.name,
    snapshotFrames: sink.stats.snapshotFrames - mark.snapFrames,
    snapshotsPerSecond: +((sink.stats.snapshotFrames - mark.snapFrames) / seconds).toFixed(1),
    snapshotBytesPerSecond: +((sink.stats.snapshotBytes - mark.snapBytes) / seconds).toFixed(1),
    applicationBytesPerSecond: +((sink.stats.applicationBytes - mark.appBytes) / seconds).toFixed(1),
    sinkAlwaysAcceptedWrites: true,
    limitation: 'In-memory sink always accepts writes; not a transport or Wi-Fi measurement.'
  };
});

const report = {
  test: 'actual authoritative host simulation with in-memory protocol sinks',
  status: tickErrors ? 'FAIL' : 'MEASURED',
  profile: { tickMs, nominalTickHz: +(1000 / tickMs).toFixed(2), mode, requestedBots, activeBots: botList.length, humans: sinks.length, mapId, durationMs: +elapsedMs.toFixed(1), skill: requestedSkill },
  setup: { phase: G.phase, mode: G.mode, activePlayers: players.size, activeZombies: _t.OB.zs.size, snapshotEveryTicks, nominalSnapshotHz: +(1000 / (tickMs * snapshotEveryTicks)).toFixed(2), snapshotEntities: _t.snapshotEntityCount() },
  timing: { tickWorkMs: sortedSummary(tickWorkMs), scheduledStartGapsMs: sortedSummary(delays), eventLoopDelayMs: { p95: +(delayMonitor.percentile(95) / 1e6).toFixed(3), p99: +(delayMonitor.percentile(99) / 1e6).toFixed(3), max: +(delayMonitor.max / 1e6).toFixed(3) } },
  simulation: { tickErrors, botThinkCalls, botThinkCallsPerSecond: +(botThinkCalls / Math.max(.001, elapsedMs / 1000)).toFixed(1), averageAliveBots: +averageAliveBots.toFixed(2), botThinkCallsPerAliveBotPerSecond: +thinkRatePerAliveBot.toFixed(2), botsWithObservedMovement: movedBots.size, botRoster: botList.length, pathCalls: _t.botStats.paths - pathStart, pathMs: +(_t.botStats.pathMs - pathMsStart).toFixed(2), shots: _t.botStats.shots - shotsStart, hits: _t.botStats.hits - hitsStart, kills: _t.botStats.kills - killsStart, zombies: _t.OB.zs.size },
  resourceUse: { processCpuMs: { user: +(cpu.user / 1000).toFixed(2), system: +(cpu.system / 1000).toFixed(2) }, oneCorePercent: +(((cpu.user + cpu.system) / 1000) / Math.max(1, elapsedMs) * 100).toFixed(2), heapUsedStartBytes: heapStart, heapUsedEndBytes: process.memoryUsage().heapUsed },
  serializedTraffic: bytesByClient,
  limits: ['No TCP/WebSocket socket, remote client, operating-system network stack, Wi-Fi, browser, rendering or GPU.', 'In-memory sinks accept every write and therefore cannot validate queue growth, backpressure or packet delivery.', 'This is a same-process simulation/serialization comparison, not LAN acceptance.'],
  benchmarkAcceptance: 'Measure only; do not select a default profile without a live client/host A/B.'
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, profile: report.profile, timing: report.timing, simulation: report.simulation, serializedTraffic: report.serializedTraffic, out }, null, 2));
if (tickErrors) process.exitCode = 1;
}
main().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; });
