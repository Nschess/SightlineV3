'use strict';
// In-process cumulative AI perception microbenchmark. It exercises the actual
// server botScan and Outbreak perceptionTargets implementations, but does not
// start a listener or claim host-tick, LAN, browser, or device performance.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { G, players, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const Hunt = require('../AndroidProject/app/src/main/assets/phone-host/zombie-hunt.js');

const root = path.resolve(__dirname, '..');
const serverPath = path.join(root, 'AndroidProject/app/src/main/assets/phone-host/server.js');
const huntPath = path.join(root, 'AndroidProject/app/src/main/assets/phone-host/zombie-hunt.js');
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
function summary(samples, divisor = 1) {
  const sorted = samples.slice().sort((a, b) => a - b);
  return {
    samples: sorted.length,
    p50Ms: Number((percentile(sorted, .50) / divisor).toFixed(4)),
    p95Ms: Number((percentile(sorted, .95) / divisor).toFixed(4)),
    p99Ms: Number((percentile(sorted, .99) / divisor).toFixed(4)),
    maxMs: Number((sorted[sorted.length - 1] / divisor).toFixed(4))
  };
}

const oldMode = G.mode, oldPlayers = [...players.entries()];
const botScales = [
  { bots: 8, humans: 8 },
  { bots: 16, humans: 16 },
  { bots: 32, humans: 32 },
  { bots: 64, humans: 32 }
];
const botResults = [];

try {
  G.mode = 'deathmatch';
  const map = { boxes: [] };
  const skill = { mem: 5, head: .2 };
  for (const scale of botScales) {
    players.clear();
    const bots = [];
    for (let i = 0; i < scale.bots; i++) {
      const team = i % 2;
      const bot = _t.makeBot(team);
      bot.alive = true; bot.x = ((i % 8) - 3.5) * .16; bot.y = 0; bot.z = team ? -18 : 0;
      bot.yaw = team ? Math.PI : 0; bot.cr = 0; bot.pr = 0;
      bots.push(bot);
    }
    const humans = [];
    for (let i = 0; i < scale.humans; i++) {
      const team = i % 2;
      humans.push({ id: 100000 + i, bot: false, alive: true, team,
        x: ((i % 8) - 3.5) * .19, y: 0, z: team ? -16 : 1.5, yaw: team ? Math.PI : 0, cr: 0, pr: 0 });
    }
    const roster = bots.concat(humans);
    // Warm both the initial anchor scan and the steady rotating fair-probe path.
    for (let warm = 0; warm < 12; warm++) for (const bot of bots) _t.botScan(bot, skill, map, roster);
    const passes = [];
    for (let trial = 0; trial < 100; trial++) {
      const t0 = performance.now();
      for (const bot of bots) _t.botScan(bot, skill, map, roster);
      passes.push(performance.now() - t0);
    }
    botResults.push({
      bots: scale.bots, humans: scale.humans, totalActors: roster.length,
      steadyStateScanPass: summary(passes),
      approximateMsPerBotScanP50: Number((summary(passes).p50Ms / scale.bots).toFixed(5)),
      note: 'One measured pass invokes the real bounded botScan once per bot against the complete roster.'
    });
  }

  const zombieResults = [];
  for (const survivorCount of [14, 32, 64]) for (const zombieCount of [14, 32, 56]) {
    const survivors = Array.from({ length: survivorCount }, (_, i) => ({
      id: i + 1, alive: true, x: ((i % 8) - 3.5) * 1.15, y: 0, z: Math.floor(i / 8) * 1.3
    }));
    const origins = Array.from({ length: zombieCount }, (_, i) => ({
      x: ((i % 8) - 3.5) * .85, y: 0, z: 1 + Math.floor(i / 8) * .7
    }));
    const targets = origins.map(() => []), distances = origins.map(() => []);
    const cursors = origins.map(() => survivors[Math.min(4, survivorCount - 1)].id);
    const scanPass = () => {
      for (let i = 0; i < zombieCount; i++) {
        cursors[i] = Hunt.perceptionTargets(origins[i], survivors, null, 5, targets[i], distances[i],
          cursors[i], 44, 5, survivors[0]);
      }
    };
    for (let warm = 0; warm < 20; warm++) scanPass();
    const samples = [];
    for (let trial = 0; trial < 100; trial++) {
      const t0 = performance.now(); scanPass(); samples.push(performance.now() - t0);
    }
    zombieResults.push({
      zombies: zombieCount, survivors: survivorCount,
      steadyStateSelectorPass: summary(samples),
      approximateMsPerZombieSelectorP50: Number((summary(samples).p50Ms / zombieCount).toFixed(5)),
      note: 'Selection only; excludes zombiePerceive visibility rays, navigation, attacks, movement, and host tick scheduling.'
    });
  }

  const result = {
    scope: 'current-source in-process cumulative perception microbenchmark',
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpus: os.cpus().length },
    workload: {
      botTrials: 100, zombieTrials: 100, warmupPasses: 12,
      botScales, zombieCounts: [14, 32, 56], survivorCounts: [14, 32, 64],
      map: 'empty obstacle LOS fixture', tickMs: _t.tickMs, intendedSnapshotHz: 50
    },
    botScan: botResults,
    outbreakTargetSelection: zombieResults,
    sourceSha256: { hostServer: sha256(serverPath), zombieHunt: sha256(huntPath) },
    limitations: [
      'A microbenchmark of actual selector functions, not a complete simulation tick or live host benchmark.',
      'Empty-obstacle fixture excludes map collision and occlusion costs; host scheduling, serialization, sockets, client rendering, Wi-Fi, Android GPU, and physical-device behavior are unmeasured.',
      'Do not infer a gameplay pass from these timings; use this to quantify selector scaling and compare future code on the same runtime.'
    ],
    generatedAt: new Date().toISOString()
  };
const out = path.resolve(process.argv[2] || path.join(root, 'acceptance/benchmarks/ai-perception-cumulative-cost-2026-10-29.json'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} finally {
  players.clear();
  for (const [id, p] of oldPlayers) players.set(id, p);
  G.mode = oldMode;
}
