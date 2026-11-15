#!/usr/bin/env node
'use strict';
/*
 * Matched in-process full-tick comparison for the saved cyclic-probe host and
 * the current candidate. It uses the actual server tick, bots, map, snapshot
 * projection and in-memory sinks under a seeded virtual 20 ms clock. It does
 * not open sockets or claim timer, LAN, rendering, Android, or device results.
 * Usage: node tools/bench-combat-full-tick.cjs [warmupTicks=300] [sampleTicks=1200] [output.json] [baselineServer.js]
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

const root = path.resolve(__dirname, '..');
const phoneHost = path.join(root, 'AndroidProject/app/src/main/assets/phone-host');
const baselineServer = path.resolve(process.argv[5] || path.join(root, 'rollback/expansion-8.0-pre-ffa-bomb-integration/server.js'));
const output = path.resolve(process.argv[4] || path.join(root, 'acceptance/benchmarks/combat-full-tick-2026-10-30.json'));
const warmupTicks = Math.max(100, Math.min(2000, Math.trunc(Number(process.argv[2]) || 300)));
const sampleTicks = Math.max(300, Math.min(5000, Math.trunc(Number(process.argv[3]) || 1200)));
const tickMs = 20;
const workloads = [
  { id: 'balanced-32', bots: 16, humans: 16 },
  { id: 'max-96', bots: 64, humans: 32 }
];
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const summarize = values => {
  const sorted = values.slice().sort((a, b) => a - b), at = p => Number(sorted[Math.floor((sorted.length - 1) * p)].toFixed(4));
  return { samples: sorted.length, p50Ms: at(.5), p95Ms: at(.95), p99Ms: at(.99), maxMs: Number(sorted.at(-1).toFixed(4)) };
};
const makeSeededRandom = seed => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

if (!fs.statSync(baselineServer).isFile()) throw new Error('Saved pre-change comparison server is missing: ' + baselineServer);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sightline-fulltick-'));
const baselineHostDir = path.join(tempRoot, 'phone-host');
fs.cpSync(phoneHost, baselineHostDir, { recursive: true });
fs.copyFileSync(baselineServer, path.join(baselineHostDir, 'server.js'));

const oldDateNow = Date.now, oldRandom = Math.random;
let simulatedNow = 1793350000000;
Date.now = () => simulatedNow;
let Baseline, Candidate;
try {
  Baseline = require(path.join(baselineHostDir, 'server.js'));
  Candidate = require(path.join(phoneHost, 'server.js'));
} catch (error) {
  Date.now = oldDateNow;
  fs.rmSync(tempRoot, { recursive: true, force: true });
  throw error;
}

function fixture(Host, seed, workload) {
  Math.random = makeSeededRandom(seed);
  simulatedNow = 1793350000000;
  const { G, players, _t } = Host;
  players.clear(); _t.DM.respawns.clear();
  G.mode = 'deathmatch'; G.map = 'courtyard'; G.phase = 'lobby'; G.auto = false;
  G.rounds = 15; G.time = 300; G.kills = 99; G.score = [0, 0];
  _t.BOTCFG.mode = 'add'; _t.BOTCFG.balance = false; _t.BOTCFG.skill = 'regular';
  _t.BOTCFG.t0 = workload.bots / 2; _t.BOTCFG.t1 = workload.bots / 2; _t.BOTCFG.coop = 0;
  const sink = () => ({ closed: false, backlog: 0, text() {}, sendFrame() { return true; }, kill() { this.closed = true; } });
  for (let i = 0; i < workload.humans; i++) {
    const p = _t.addPlayer(sink(), 'TickBench' + i);
    p.team = i < workload.humans / 2 ? 0 : 1;
  }
  _t.syncBots(true);
  const actualBots = [...players.values()].filter(p => p.bot).length;
  if (actualBots !== workload.bots || players.size !== workload.humans + workload.bots) throw new Error(`fixture roster mismatch: ${players.size} actors, ${actualBots} bots`);
  _t.startMatch();
  _t.goLive();
  return { ...Host, botCount: actualBots };
}

function runProfile(Host, seed, workload) {
  const fixtureInfo = fixture(Host, seed, workload), { _t, players, G } = fixtureInfo;
  const elapsedTicks = warmupTicks + sampleTicks, samples = [];
  let tickErrors = 0;
  const botThinkStart = _t.botStats.thinks, pathStart = _t.botStats.paths;
  const snapshotStart = _t.stats.snaps, bytesStart = _t.stats.bytes;
  for (let i = 0; i < elapsedTicks; i++) {
    simulatedNow += tickMs;
    const start = performance.now();
    try { _t.tickBody(); } catch (error) { tickErrors++; if (tickErrors === 1) console.error(error.stack || error); }
    const cost = performance.now() - start;
    if (i >= warmupTicks) samples.push(cost);
  }
  return {
    profile: { mode: G.mode, map: G.map, tickMs, virtualTickHz: 1000 / tickMs, bots: fixtureInfo.botCount,
      humans: workload.humans, actors: players.size, warmupTicks, sampleTicks, seed },
    tickWorkMs: summarize(samples),
    simulation: { tickErrors, botThinkCalls: _t.botStats.thinks - botThinkStart,
      pathCalls: _t.botStats.paths - pathStart, snapshots: _t.stats.snaps - snapshotStart,
      snapshotBytes: _t.stats.bytes - bytesStart, phase: G.phase }
  };
}

try {
  const shared = ['data.json', 'navigation.js', 'squad-tactics.js', 'bot-tactics.js', 'zombie-counterplay.js',
    'infection-evasion.js', 'zombie-hunt.js', 'deathmatch-rules.js', 'character-skins.js'];
  const before = { server: hash(baselineServer), shared: Object.fromEntries(shared.map(name => [name, hash(path.join(phoneHost, name))])) };
  const after = { server: hash(path.join(phoneHost, 'server.js')), shared: Object.fromEntries(shared.map(name => [name, hash(path.join(phoneHost, name))])) };
  const trials = [];
  for (let trial = 0; trial < 3; trial++) {
    const order = trial % 2 ? [['candidate', Candidate], ['baseline', Baseline]] : [['baseline', Baseline], ['candidate', Candidate]];
    const pair = { trial: trial + 1, workloads: {} };
    for (const workload of workloads) {
      pair.workloads[workload.id] = {};
      for (const [label, Host] of order) pair.workloads[workload.id][label] = runProfile(Host, 741103, workload);
    }
    trials.push(pair);
  }
  const median = values => { const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.floor((sorted.length - 1) / 2)]; };
  const aggregate = (label, workloadId) => ({
    tickWorkMs: Object.fromEntries(['p50Ms', 'p95Ms', 'p99Ms', 'maxMs'].map(key => [key, Number(median(trials.map(trial => trial.workloads[workloadId][label].tickWorkMs[key])).toFixed(4))])),
    botThinkCalls: median(trials.map(trial => trial.workloads[workloadId][label].simulation.botThinkCalls)),
    pathCalls: median(trials.map(trial => trial.workloads[workloadId][label].simulation.pathCalls)),
    snapshotBytes: median(trials.map(trial => trial.workloads[workloadId][label].simulation.snapshotBytes)),
    tickErrors: trials.reduce((sum, trial) => sum + trial.workloads[workloadId][label].simulation.tickErrors, 0)
  });
  const results = {};
  for (const workload of workloads) {
    const baseline = aggregate('baseline', workload.id), candidate = aggregate('candidate', workload.id);
    const change = key => Number((((candidate.tickWorkMs[key] / baseline.tickWorkMs[key]) - 1) * 100).toFixed(2));
    results[workload.id] = { baseline, candidate,
      deltaPercent: { p50: change('p50Ms'), p95: change('p95Ms'), p99: change('p99Ms'), max: change('maxMs') } };
  }
  const report = {
    scope: 'seeded in-process authoritative full-tick comparison with virtual 20 ms cadence',
    comparison: { baseline: 'saved pre-FFA/Bomb server checkpoint', candidate: 'current server candidate', sharedDependenciesIdentical: JSON.stringify(before.shared) === JSON.stringify(after.shared) },
    sourceSha256: { baseline: before, candidate: after, baselineCheckpoint: path.relative(root, baselineServer).split(path.sep).join('/') },
    workloads: { trials: 3, warmupTicks, sampleTicks, virtualTickMs: tickMs, profiles: workloads, map: 'courtyard', mode: 'deathmatch', skill: 'regular', snapshotSink: 'in-memory accept-all; no sockets', seededRandom: 'LCG seed 741103; same seed per matched run' },
    results: { byWorkload: results, trials },
    limitations: [
      'This measures synchronous CPU work of the actual authoritative tick under a seeded virtual clock; it does not measure real timer wakeups, live TCP/WebSocket, network delivery, client rendering, WebGL, Android GPU, or physical devices.',
      'The baseline uses the saved pre-FFA/Bomb server.js with the current identical data and imported helper modules. Tick deltas therefore compare the server revisions while holding those dependencies fixed.',
      'In-memory sinks accept all writes; transport backpressure and actual LAN smoothness remain unmeasured.'
    ],
    generatedAt: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  const hasTickErrors = Object.values(results).some(result => result.baseline.tickErrors || result.candidate.tickErrors);
  console.log(JSON.stringify({ status: hasTickErrors ? 'FAIL' : 'MEASURED', output, sourceSha256: report.sourceSha256,
    results: report.results, sameHelpers: report.comparison.sharedDependenciesIdentical }, null, 2));
  if (hasTickErrors) process.exitCode = 1;
} finally {
  Date.now = oldDateNow; Math.random = oldRandom;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
