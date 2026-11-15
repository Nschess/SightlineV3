'use strict';

// Matched deterministic client-interpolation microbench. It runs the actual
// mpSnapshot/mpPuppetStep functions at a fixed 50 Hz input / 60 Hz render trace
// for 16/32/64 zombie actors, with LAN diagnostics disabled. This is not a
// socket, browser, GPU, Wi-Fi, or physical-device test.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const bench = path.join(root, 'tests/bench-mp-client-interpolation.cjs');
const current = path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html');
const baseline = path.resolve(root, '../../gameplay-lan-zombies-4.1-20261105/outputs/SightlineV3-Gameplay-LAN-Zombies-4.1-clean-extracted/AndroidProject/app/src/main/assets/phone-host/index.html');
const outDir = path.join(root, 'acceptance/benchmarks');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (!fs.existsSync(baseline)) throw new Error('Verified 4.1 clean-extraction page is unavailable: ' + baseline);

const sources = [
  { name: '4.1-baseline-diagnostics-absent', page: baseline },
  { name: '4.2-candidate-diagnostics-disabled', page: current }
];
const repetitions = 3, runs = [];
for (const source of sources) {
  for (let trial = 1; trial <= repetitions; trial++) {
    const out = path.join(outDir, `4.2-client-presentation-${source.name}-trial-${trial}.json`);
    const env = { ...process.env, SIGHTLINE_CLIENT_BENCH_HTML: source.page };
    const result = spawnSync(process.execPath, [bench, out], { cwd: root, env, encoding: 'utf8', shell: false });
    if (result.status !== 0) throw new Error(`${source.name} trial ${trial} failed: ${result.stderr || result.stdout}`);
    const measured = JSON.parse(fs.readFileSync(out, 'utf8'));
    runs.push({ source: source.name, trial, pageSha256: measured.sourcePageSha256, results: measured.results, output: path.relative(root, out).split(path.sep).join('/') });
  }
}
function median(a) { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
const comparison = sources.map(source => ({
  source: source.name, pageSha256: hash(source.page),
  counts: [16, 32, 64].map(count => {
    const rows = runs.filter(r => r.source === source.name).map(r => r.results.find(x => x.remoteBots === count));
    const fields = ['clientInterpolationMsPerRenderedFrame', 'snapshotParseAndBufferMs'];
    const summary = {};
    for (const field of fields) {
      summary[field] = {};
      for (const q of ['p50', 'p95', 'p99', 'max']) summary[field][q] = median(rows.map(r => r[field][q]));
    }
    return { actors: count, trialCount: rows.length, medianOfTrialPercentilesMs: summary };
  })
}));
const report = {
  schema: 'sightline-lan-presentation-benchmark-v1',
  scenario: { seed: 'fixed-linear-trajectory-v1 (no random inputs)', mode: 'LAN remote zombie pose presentation', snapshotsHz: 50, renderHz: 60, requestedActors: [16, 32, 64], framesPerTrial: 1800, repetitionsPerSource: repetitions },
  diagnosticState: 'disabled in both measured clients; telemetry is evaluated separately by tests/lan-diagnostics.test.cjs',
  comparisons: comparison,
  runs,
  limitations: ['In-process Node VM replay of actual client snapshot/interpolation functions with lightweight renderer stubs.', 'Not a live WebSocket, browser/WebGL, display-frame-pacing, Wi-Fi, or Android device measurement.', 'Three trials reduce timing noise; median-of-trial percentiles is reported, not a confidence interval.']
};
const destination = path.join(outDir, '4.2-client-presentation-comparison.json');
fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: 'PASS', out: path.relative(root, destination), comparisons: report.comparisons }, null, 2));

