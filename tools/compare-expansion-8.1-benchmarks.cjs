'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const [baselineArg, candidateArg, outputArg] = process.argv.slice(2);
if (!baselineArg || !candidateArg || !outputArg) throw new Error('Usage: node tools/compare-expansion-8.1-benchmarks.cjs <baseline.json> <candidate.json> <output.json>');
const read = file => JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'));
const baseline = read(baselineArg), candidate = read(candidateArg);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
if (baseline.kind !== 'gameplay-expansion-8-full-tick-in-process-benchmark' || candidate.kind !== baseline.kind) throw new Error('Unexpected benchmark schema.');
if (!same(baseline.configuration, candidate.configuration) || !same(baseline.environment, candidate.environment)) throw new Error('Baseline and candidate workloads or environments differ.');
const median = values => { const sorted = values.slice().sort((a, b) => a - b); return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2; };
const aggregate = rows => ({
  tickP50Ms: median(rows.map(r => r.driver.tickWorkMs.p50)),
  tickP95Ms: median(rows.map(r => r.driver.tickWorkMs.p95)),
  tickP99Ms: median(rows.map(r => r.driver.tickWorkMs.p99)),
  tickMaxMs: median(rows.map(r => r.driver.tickWorkMs.max)),
  cpuOneCorePct: median(rows.map(r => r.driver.oneCoreUtilizationPct)),
  pathCalls: median(rows.map(r => r.bots.paths || 0)),
  pathTimeMs: median(rows.map(r => r.bots.pathMs || 0)),
  maxPathMs: Math.max(...rows.map(r => r.bots.pathMaxMs || 0)),
  snapshotFrames: rows.map(r => r.snapshots.logicalFrames),
  heapDeltaBytes: median(rows.map(r => r.memoryBytes.heapUsed.end - r.memoryBytes.heapUsed.start)),
  rssMaxBytes: Math.max(...rows.map(r => r.memoryBytes.rss.max))
});
const pct = (before, after) => before === 0 ? null : +((after - before) / before * 100).toFixed(2);
const rows = [];
for (const mode of candidate.configuration.modes) for (const bots of candidate.configuration.requestedBots) {
  const select = report => report.results.filter(r => r.mode === mode && r.requestedBots === bots);
  const b = select(baseline), c = select(candidate);
  if (b.length !== candidate.configuration.trialsPerCondition || c.length !== b.length) throw new Error(`${mode}/${bots}: incomplete matched trials`);
  const before = aggregate(b), after = aggregate(c);
  rows.push({ mode, requestedBots: bots, trials: b.length, baseline: before, candidate: after,
    changePct: { tickP95: pct(before.tickP95Ms, after.tickP95Ms), tickP99: pct(before.tickP99Ms, after.tickP99Ms), cpu: pct(before.cpuOneCorePct, after.cpuOneCorePct), pathCalls: pct(before.pathCalls, after.pathCalls) },
    allTrialsProducedAllSnapshots: before.snapshotFrames.concat(after.snapshotFrames).every(n => n === candidate.configuration.sampleTicks) });
}
const report = {
  kind: 'matched-expansion8.1-host-tick-benchmark-comparison',
  createdAtUtc: new Date().toISOString(),
  baselineSourceServerSha256: baseline.sourceServerSha256,
  candidateSourceServerSha256: candidate.sourceServerSha256,
  sourceCodeChanged: baseline.sourceServerSha256 !== candidate.sourceServerSha256,
  workload: candidate.configuration,
  environment: candidate.environment,
  rows,
  interpretation: 'Matched in-process production tick workload on one host. Reported deltas are descriptive measurements, not LAN smoothness or device performance claims.',
  limitations: [...new Set([...(baseline.limitations || []), ...(candidate.limitations || []), 'Two trials per mode/bot count are limited samples; machine load can affect the observed delta.', 'No remote client, network transport, browser rendering, WebGL GPU, Android runtime, or physical device was tested.'])]
};
const output = path.resolve(root, outputArg);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: 'CREATED', output, rows: rows.map(r => ({ mode: r.mode, bots: r.requestedBots, baselineP95: r.baseline.tickP95Ms, candidateP95: r.candidate.tickP95Ms, changePct: r.changePct, allSnapshots: r.allTrialsProducedAllSnapshots })) }, null, 2));
