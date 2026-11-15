'use strict';
// Reproducible in-process microbenchmark of the current selector's cold first
// scan versus its steady-state five-anchor/five-fair-probe scan on the same
// current source and identical 64-bot / 96-actor deathmatch roster. It is not
// an old-build comparison and does not measure host ticks, transport, rendering,
// or LAN FPS.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { G, players, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const serverFile = require.resolve('../AndroidProject/app/src/main/assets/phone-host/server.js');
const botFile = require.resolve('../AndroidProject/app/src/main/assets/phone-host/zombie-hunt.js');
const oldMode = G.mode, oldPlayers = [...players.entries()];

function percentile(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]; }
function summary(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return { p50MsPer256Scans: percentile(sorted, .50), p95MsPer256Scans: percentile(sorted, .95), p99MsPer256Scans: percentile(sorted, .99), batches: sorted.length };
}
function resetBot(bot) {
  bot.ai.tgt = null; bot.ai.last = null; bot.ai.invest = null; bot.ai.alert = 0;
}

try {
  G.mode = 'deathmatch';
  players.clear();
  const bots = [];
  for (let i = 0; i < 64; i++) {
    const team = i < 32 ? 0 : 1;
    const bot = _t.makeBot(team);
    bot.alive = true; bot.y = 0; bot.cr = 0; bot.pr = 0;
    bot.x = team ? ((i % 9) - 4) * .16 : ((i % 9) - 4) * .16;
    bot.z = team ? -18 : 0; bot.yaw = team ? Math.PI : 0;
    bots.push(bot);
  }
  const humans = [];
  for (let i = 0; i < 32; i++) {
    const team = i < 16 ? 0 : 1;
    humans.push({ id: 10000 + i, bot: false, alive: true, team, x: ((i % 8) - 3.5) * .21,
      y: 0, z: team ? -16 : 1.5, yaw: team ? Math.PI : 0, cr: 0, pr: 0 });
  }
  const roster = [...bots, ...humans], map = { boxes: [] }, skill = { mem: 5, head: .2 };
  if (roster.length !== 96 || bots.length !== 64) throw new Error('invalid benchmark roster');

  function batch(originalPath) {
    const start = performance.now();
    for (let round = 0; round < 4; round++) for (const bot of bots) {
      if (originalPath) bot.ai.scanProbeAfterId = undefined;
      resetBot(bot);
      _t.botScan(bot, skill, map, roster);
    }
    return performance.now() - start;
  }
  for (const bot of bots) {
    bot.ai.scanProbeAfterId = undefined;
    _t.botScan(bot, skill, map, roster);
  }
  for (let i = 0; i < 12; i++) { batch(true); batch(false); }
  const originalSamples = [], rotatingSamples = [];
  for (let i = 0; i < 100; i++) {
    if (i & 1) { rotatingSamples.push(batch(false)); originalSamples.push(batch(true)); }
    else { originalSamples.push(batch(true)); rotatingSamples.push(batch(false)); }
  }
  const original = summary(originalSamples), rotating = summary(rotatingSamples);
  const result = {
    scope: 'paired same-source candidate-selection microbenchmark; in-process only',
    workload: { bots: 64, actors: 96, scansPerBatch: 256, batchesPerPath: 100, map: 'empty LOS fixture', simulationTickMs: 20, intendedSnapshotHz: 50 },
    coldFirstScanNearestTen: original,
    steadyStateFiveAnchorsFiveFairProbes: rotating,
    steadyStateCostChangeVsColdPercent: Number(((rotating.p50MsPer256Scans / original.p50MsPer256Scans - 1) * 100).toFixed(2)),
    sourceSha256: { server: sha256(serverFile), sharedPerception: sha256(botFile) },
    limitations: ['Does not measure authoritative host tick work, navigation, socket scheduling, remote receive jitter, WebGL, Android GPU, or gameplay acceptance.'],
    generatedAt: new Date().toISOString()
  };
  const out = path.resolve(__dirname, '../acceptance/benchmarks/ai-perception-scan-cost-2026-10-29.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} finally {
  players.clear();
  for (const [id, p] of oldPlayers) players.set(id, p);
  G.mode = oldMode;
}
