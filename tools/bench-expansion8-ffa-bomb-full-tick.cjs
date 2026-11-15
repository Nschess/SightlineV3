'use strict';

// In-process, real-time-driven host tick workload for FFA and Bomb. This uses
// the production server tickBody and live AI/snapshot code but does not open a
// network socket or render a browser. It is not LAN, WebGL, FPS, or Android QA.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const crypto = require('node:crypto');
const Rules = require('../AndroidProject/app/src/main/assets/phone-host/gameplay-mode-rules.js');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const out = path.resolve(process.argv[3] || path.join(__dirname, '../acceptance/gameplay-expansion-8-ffa-bomb-benchmark.json'));
const Host = require(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/server.js'));
const { G, players, MAPS, _t } = Host;
const serverPath = path.join(root, 'AndroidProject/app/src/main/assets/phone-host/server.js');
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const percentile = (values, p) => {
  const a = values.slice().sort((x, y) => x - y);
  return a.length ? +a[Math.min(a.length - 1, Math.ceil(a.length * p) - 1)].toFixed(3) : null;
};
const summarize = values => ({ p50: percentile(values, .50), p95: percentile(values, .95), p99: percentile(values, .99), max: values.length ? +Math.max(...values).toFixed(3) : null });
function fakeClient() {
  return { closed: false, backlog: 0, sentBytes: 0, sentFrames: 0, snapshotFrames: 0, snapshotBytes: 0,
    snapshotQueueBytes: 0, snapshotQueuePeakBytes: 0, snapshotSkipped: 0, snapshotBackpressure: 0,
    text() {}, kill() { this.closed = true; },
    sendFrame(frame) { this.sentFrames++; this.sentBytes += frame.length; return true; } };
}
function humanPeer(id, team) {
  return { id, c: fakeClient(), bot: false, name: 'BenchmarkHost', team, homeTeam: team, host: true, op: 0, rtt: 0,
    alive: false, spec: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, cr: 0, pr: 0, hp: 100, armor: 0,
    money: 800, k: 0, d: 0, hs: 0, ep: 0, lastIn: Date.now(), lastShot: 0, nextShot: 0, hist: [], msgs: 0,
    lostKit: false, rl: null, skin: 'default', finishes: {}, spawnShieldUntil: 0, owned: new Set(['pistol', 'knife']),
    ammo: {}, cur: 'pistol', walk: false, vy: 0, moveCredit: 0, verticalCredit: 0, creditT: Date.now(), airSince: 0 };
}
function snapBotStats() { return Object.assign({}, _t.botStats); }
function deltaObject(before, after) {
  const out = {};
  for (const k of Object.keys(after)) if (typeof after[k] === 'number') out[k] = +(after[k] - (before[k] || 0)).toFixed(3);
  return out;
}
function configure(mode, botCount) {
  players.clear();
  G.mode = mode; G.phase = 'lobby'; G.map = 'courtyard'; G.round = 0; G.rounds = 3; G.score = [0, 0];
  G.time = 60; G.kills = 100; G.phaseEnd = 0; G.liveStart = 0; G.auto = false;
  _t.BOTCFG.mode = 'add'; _t.BOTCFG.balance = false; _t.BOTCFG.skill = 'regular';
  _t.BOTCFG.t0 = Math.ceil(botCount / 2); _t.BOTCFG.t1 = Math.floor(botCount / 2); _t.BOTCFG.coop = 0;
  const host = humanPeer(990001, 0); players.set(host.id, host);
  if (mode === 'bomb') _t.BOMB.settings = Rules.settings({ bestOf: 3, roundSeconds: 60, bombSeconds: 35, plantSeconds: 4, defuseSeconds: 6 });
  _t.startMatch();
  const actualBots = [...players.values()].filter(p => p.bot).length;
  if (actualBots !== botCount) throw new Error(`${mode} requested ${botCount} bots, host created ${actualBots}`);
  _t.goLive();
  if (G.phase !== 'live') throw new Error(`${mode} host did not enter live phase`);
  return { host, actualBots, actualParticipants: players.size };
}

async function trial(mode, botCount, trialIndex, warmTicks, sampleTicks, cadenceMs) {
  const { host, actualBots, actualParticipants } = configure(mode, botCount);
  const warmStart = performance.now();
  for (let i = 0; i < warmTicks; i++) { _t.tickBody(); await sleep(cadenceMs); }
  const warmElapsedMs = performance.now() - warmStart;
  const ticks = [], gaps = [], memory = [], botBefore = snapBotStats();
  const snapshotStartFrames = host.c.snapshotFrames || 0, snapshotStartBytes = host.c.snapshotBytes || 0;
  const wireStartFrames = host.c.sentFrames, wireStartBytes = host.c.sentBytes;
  const cpuStart = process.cpuUsage(), wallStart = performance.now();
  let previousStart = null;
  for (let i = 0; i < sampleTicks; i++) {
    const start = performance.now();
    if (previousStart !== null) gaps.push(start - previousStart);
    previousStart = start;
    _t.tickBody();
    ticks.push(performance.now() - start);
    const m = process.memoryUsage(); memory.push({ heapUsed: m.heapUsed, rss: m.rss, external: m.external });
    await sleep(cadenceMs);
  }
  const wallMs = performance.now() - wallStart, cpu = process.cpuUsage(cpuStart), botAfter = snapBotStats();
  const mem = key => ({ start: memory[0]?.[key] || 0, end: memory.at(-1)?.[key] || 0,
    max: memory.length ? Math.max(...memory.map(x => x[key])) : 0 });
  return { mode, requestedBots: botCount, actualBots, actualParticipants, trial: trialIndex,
    driver: { cadenceMs, sampleTicks, warmTicks, warmElapsedMs: +warmElapsedMs.toFixed(2), wallMs: +wallMs.toFixed(2),
      tickWorkMs: summarize(ticks), drivenStartGapMs: summarize(gaps),
      cpuUserMs: +(cpu.user / 1000).toFixed(2), cpuSystemMs: +(cpu.system / 1000).toFixed(2),
      oneCoreUtilizationPct: +(((cpu.user + cpu.system) / (wallMs * 1000)) * 100).toFixed(2) },
    memoryBytes: { heapUsed: mem('heapUsed'), rss: mem('rss'), external: mem('external') },
    bots: deltaObject(botBefore, botAfter),
    snapshots: { logicalFrames: (host.c.snapshotFrames || 0) - snapshotStartFrames,
      logicalBytes: (host.c.snapshotBytes || 0) - snapshotStartBytes,
      websocketFrames: host.c.sentFrames - wireStartFrames, websocketBytes: host.c.sentBytes - wireStartBytes,
      skipped: host.c.snapshotSkipped || 0, backpressure: host.c.snapshotBackpressure || 0 } };
}

(async () => {
  const warmTicks = 60, sampleTicks = 180, cadenceMs = 20, trialsPerCondition = 2;
  const results = [];
  for (const mode of ['ffa', 'bomb']) for (const bots of [16, 32, 64]) for (let n = 1; n <= trialsPerCondition; n++) {
    const row = await trial(mode, bots, n, warmTicks, sampleTicks, cadenceMs);
    results.push(row);
    console.log(`${mode} bots=${bots} trial=${n}: tick p95=${row.driver.tickWorkMs.p95}ms p99=${row.driver.tickWorkMs.p99}ms max=${row.driver.tickWorkMs.max}ms CPU=${row.driver.oneCoreUtilizationPct}% pathCalls=${row.bots.paths || 0} snapshots=${row.snapshots.logicalFrames}`);
  }
  const report = { kind: 'gameplay-expansion-8-full-tick-in-process-benchmark', createdAt: new Date().toISOString(),
    sourceRoot: root, sourceServerSha256: sha256(serverPath), environment: { node: process.version, platform: process.platform, arch: process.arch },
    configuration: { modes: ['ffa', 'bomb'], requestedBots: [16, 32, 64], trialsPerCondition, warmTicks, sampleTicks, cadenceMs, map: 'courtyard',
      nominalTickMs: _t.tickMs, singleFakeHostClient: true }, results,
    limitations: ['Actual production tickBody and AI execute in process, driven by a 20 ms timer in this harness.',
      'No TCP/UDP/WebSocket transport, remote peer, browser rendering, WebGL GPU, Android runtime, or physical device was tested.',
      'Tick start-gap values describe this harness driver, not the host fixed-deadline scheduler.',
      'CPU percentage is process usage over the benchmark wall window on this isolated machine; it is not a device target guarantee.'] };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ out, serverSha256: report.sourceServerSha256, trials: results.length }, null, 2));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

