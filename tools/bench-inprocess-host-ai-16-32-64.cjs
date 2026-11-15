'use strict';
// Deterministic in-process host simulation. This exercises authoritative
// infection/outbreak tick code, bot AI, path work, and snapshot construction,
// but intentionally does not open sockets or claim remote smoothness.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { G, players, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

const root = path.resolve(__dirname, '..');
const serverPath = path.join(root, 'AndroidProject/app/src/main/assets/phone-host/server.js');
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const percentile = (values, p) => { const a = values.slice().sort((x, y) => x - y); return a.length ? +a[Math.min(a.length - 1, Math.floor((a.length - 1) * p))].toFixed(4) : 0; };
const countBots = () => [...players.values()].filter(p => p.bot).length;
const countAliveBots = () => [...players.values()].filter(p => p.bot && p.alive).length;
const countMode = mode => mode === 'outbreak' ? 'outbreak' : 'infection';
const DEFAULT_BOTS = [16, 32, 64];
const WARMUP_TICKS = 100;
const MEASURE_TICKS = 400;
const TRIALS = 2;
const TICK_MS = 20;

function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function summary(ms) {
  const mean = ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length);
  return { p50Ms: percentile(ms, .50), p95Ms: percentile(ms, .95), p99Ms: percentile(ms, .99), maxMs: +Math.max(...ms).toFixed(4), meanMs: +mean.toFixed(4), sampleCount: ms.length };
}

function runScenario(mode, requestedBots, trial) {
  const effectiveBots = mode === 'outbreak' ? Math.min(requestedBots, 56) : requestedBots;
  const oldRandom = Math.random;
  const oldDateNow = Date.now;
  let simNow = 1790000000000 + (mode === 'outbreak' ? 100000 : 0) + requestedBots * 100 + trial;
  let rng = makeRng(0x534947 + requestedBots * 31 + trial * 1009 + (mode === 'outbreak' ? 0x0B7EA : 0));
  Math.random = rng;
  Date.now = () => simNow;
  try {
    players.clear();
    G.mode = mode;
    G.map = 'courtyard';
    G.phase = 'lobby';
    G.auto = false;
    _t.BOTCFG.mode = 'add';
    _t.BOTCFG.coop = requestedBots;
    _t.BOTCFG.t0 = 0; _t.BOTCFG.t1 = 0;
    const c = { closed: false, backlog: 0, snapshotFrames: 0, snapshotBytes: 0, snapshotSkipped: 0, snapshotBackpressure: 0, snapshotQueueBytes: 0, snapshotQueuePeakBytes: 0,
      text() {}, sendFrame() { this.snapshotFrames++; return true; }, closeAfterMessage() {}, kill() { this.closed = true; } };
    const human = _t.addPlayer(c, `RR7-${mode}-${requestedBots}-${trial}`);
    _t.onMessage(human, JSON.stringify({ t: 'cfg', mode }));
    _t.onMessage(human, JSON.stringify({ t: 'cfg', bots: { mode: 'add', coop: requestedBots } }));
    const configuredBots = countBots();
    if (configuredBots !== effectiveBots) throw new Error(`${mode} ${requestedBots}: expected ${effectiveBots} configured bots, got ${configuredBots}`);
    _t.startMatch();
    _t.goLive();
    if (G.phase !== 'live') throw new Error(`${mode} ${requestedBots}: match did not enter live phase`);
    const tickTimes = [];
    const thinkBefore = _t.botStats.thinks;
    const pathBefore = _t.botStats.paths;
    const pathMsBefore = _t.botStats.pathMs;
    const skippedBefore = _t.stats.skipped;
    const snapBefore = _t.stats.snaps;
    const bytesBefore = _t.stats.bytes;
    let zombieMax = _t.OB.zs.size;
    let aiMax = countAliveBots() + _t.OB.zs.size;
    for (let i = 0; i < WARMUP_TICKS + MEASURE_TICKS; i++) {
      simNow += TICK_MS;
      const begin = performance.now();
      _t.tickBody();
      const duration = performance.now() - begin;
      if (i >= WARMUP_TICKS) tickTimes.push(duration);
      zombieMax = Math.max(zombieMax, _t.OB.zs.size);
      aiMax = Math.max(aiMax, countAliveBots() + _t.OB.zs.size);
      if (G.phase !== 'live') throw new Error(`${mode} ${requestedBots}: match left live phase at tick ${i}`);
    }
    const liveBotsAtEnd = countAliveBots();
    const zombiesAtEnd = _t.OB.zs.size;
    return {
      mode, requestedBots, effectiveBots, trial, map: G.map,
      simulatedSeconds: (WARMUP_TICKS + MEASURE_TICKS) * TICK_MS / 1000,
      measuredTickSamples: tickTimes.length,
      hostTickExecution: summary(tickTimes),
      botDecisionCount: _t.botStats.thinks - thinkBefore,
      botDecisionsPerSimulatedSecond: +((_t.botStats.thinks - thinkBefore) / ((WARMUP_TICKS + MEASURE_TICKS) * TICK_MS / 1000)).toFixed(2),
      pathSearches: _t.botStats.paths - pathBefore,
      pathSearchTimeMs: +(_t.botStats.pathMs - pathMsBefore).toFixed(3),
      pathAverageMs: +(((_t.botStats.pathMs - pathMsBefore) / Math.max(1, _t.botStats.paths - pathBefore))).toFixed(4),
      requestedBotCountAtEnd: countBots(), liveBotsAtEnd, zombiesAtEnd, maximumActiveAIObserved: aiMax, maxZombiesObserved: zombieMax,
      snapshotsBuilt: _t.stats.snaps - snapBefore, snapshotBytesBuilt: _t.stats.bytes - bytesBefore,
      snapshotBytesPerSecond: +((_t.stats.bytes - bytesBefore) / ((MEASURE_TICKS * TICK_MS) / 1000)).toFixed(2),
      skippedSnapshots: _t.stats.skipped - skippedBefore,
      result: 'PASS: deterministic in-process scenario completed'
    };
  } finally {
    players.clear();
    Math.random = oldRandom;
    Date.now = oldDateNow;
  }
}

const scenarios = [];
for (const mode of ['infection', 'outbreak']) for (const bots of DEFAULT_BOTS) for (let trial = 1; trial <= TRIALS; trial++) scenarios.push(runScenario(countMode(mode), bots, trial));
const result = {
  schemaVersion: 1,
  title: 'Release Readiness 7.0 in-process bot host stress',
  generatedAtUtc: new Date().toISOString(),
  source: { phoneHostServerSha256: sha256(serverPath), offlineHtmlSha256: sha256(path.join(root, 'AndroidProject/app/src/main/assets/www/index.html')) },
  configuration: { map: 'courtyard', modes: ['infection', 'outbreak'], requestedBots: DEFAULT_BOTS, trialsPerScenario: TRIALS, tickMs: TICK_MS, warmupTicks: WARMUP_TICKS, measuredTicksPerTrial: MEASURE_TICKS, deterministicRandomSeeded: true, socketsOpened: false },
  limitations: [
    'Runs the actual authoritative in-process tick, AI, navigation, and snapshot construction functions; it does not run Node timer scheduling, socket transport, remote clients, interpolation/rendering, Android GPU, or visual gameplay.',
    'Outbreak reserves at least eight of the 64 shared AI slots for Hollowed, so a request for 64 survivor bots is capped at 56; maximum combined active survivor AI plus Hollowed is 64.',
    'Tick execution measurements are host process CPU work per invoked tick, not real 50 Hz scheduler gaps or client frame time.'
  ],
  scenarios
};
const out = path.join(root, 'acceptance/benchmarks/release-readiness-7.0-inprocess-stress.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: scenarios.every(s => s.result.startsWith('PASS')) ? 'PASS' : 'FAIL', out, scenarios: scenarios.map(s => ({ mode: s.mode, requestedBots: s.requestedBots, effectiveBots: s.effectiveBots, hostTickP95Ms: s.hostTickExecution.p95Ms, hostTickP99Ms: s.hostTickExecution.p99Ms, hostTickMaxMs: s.hostTickExecution.maxMs, botDecisionsPerSimulatedSecond: s.botDecisionsPerSimulatedSecond, pathSearches: s.pathSearches, maxActiveAI: s.maximumActiveAIObserved, skippedSnapshots: s.skippedSnapshots })) }, null, 2));
