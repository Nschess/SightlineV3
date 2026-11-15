const fs = require('fs');
const file = process.argv[2];
if (!file) throw new Error('Usage: node tools/summarize-lan-capture.cjs <capture.json>');
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const samples = d.samples || [];
const percentile = (values, p) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] : null;
};
const windowSummary = (fromMs, toMs) => {
  const rows = samples.filter(x => x.elapsedMs >= fromMs && x.elapsedMs < toMs);
  if (!rows.length) return null;
  const first = rows[0], last = rows[rows.length - 1], seconds = Math.max(0.001, (last.elapsedMs - first.elapsedMs) / 1000);
  const delta = key => Number(last[key] || 0) - Number(first[key] || 0);
  return {
    elapsedSeconds: [first.elapsedMs, last.elapsedMs],
    points: rows.length,
    bots: last.bots,
    tickWorkMs: Object.fromEntries(['tickP50Ms', 'tickP95Ms', 'tickP99Ms', 'tickMaxMs'].map(k => [k, { median: percentile(rows.map(x => x[k]), .5), p95: percentile(rows.map(x => x[k]), .95), max: Math.max(...rows.map(x => x[k] || 0)) }])),
    tickGapMs: Object.fromEntries(['tickGapP95Ms', 'tickGapP99Ms', 'tickGapMaxMs'].map(k => [k, { median: percentile(rows.map(x => x[k]), .5), p95: percentile(rows.map(x => x[k]), .95), max: Math.max(...rows.map(x => x[k] || 0)) }])),
    botDecisionsPerSecond: delta('botThinkCount') / seconds,
    pathCallsPerSecond: delta('botPathCount') / seconds,
    pathMsPerSecond: delta('botPathTimeTotalMs') / seconds,
    budgetHitTicksPerSecond: delta('botThinkBudgetHitTicks') / seconds,
    budgetDeferredBotsPerSecond: delta('botThinkBudgetDeferredBots') / seconds,
    capDeferredBotsPerSecond: delta('botThinkCapDeferredBots') / seconds,
    losReusePerSecond: delta('botScanLosReused') / seconds,
    snapshotsPerSecond: delta('snapshotCount') / seconds,
    skippedSnapshots: delta('snapshotSkipped'),
    tickErrors: delta('tickErrors'),
    cpuUserPercentOneCore: delta('cpuUserUs') / (seconds * 10000),
    cpuSystemPercentOneCore: delta('cpuSystemUs') / (seconds * 10000),
    heapUsedMaxMiB: Math.max(...rows.map(x => x.heapUsedBytes || 0)) / (1024 * 1024),
  };
};
const slim = {
  file,
  fingerprints: d.observedFingerprints,
  phase: d.phase,
  mode: d.mode,
  map: d.map,
  liveSeconds: d.liveSeconds,
  sampleCount: d.sampleCount,
  warmupFirst10s: windowSummary(0, 10000),
  settling10to48s: windowSummary(10000, 48000),
  warmed48to60s: windowSummary(48000, Infinity),
  lastSample: samples.at(-1) && { elapsedMs: samples.at(-1).elapsedMs, bots: samples.at(-1).bots, botThinkCount: samples.at(-1).botThinkCount, botThinkIntervalMs: samples.at(-1).botThinkIntervalMs, tickP95Ms: samples.at(-1).tickP95Ms, tickP99Ms: samples.at(-1).tickP99Ms, tickGapP95Ms: samples.at(-1).tickGapP95Ms, tickGapP99Ms: samples.at(-1).tickGapP99Ms, botBudgetHitTicks: samples.at(-1).botThinkBudgetHitTicks, botBudgetDeferredBots: samples.at(-1).botThinkBudgetDeferredBots },
  summary: d.summary,
  schedulerDeferrals: d.schedulerDeferrals,
  pathfindingCapture: d.pathfindingCapture,
  steadyState: d.timingWindow && d.timingWindow.steadyState,
  clientDiagnostics: d.clientDiagnostics,
  snapshotSkippedDelta: d.snapshotSkippedDelta,
  snapshotBacklogSkippedDelta: d.snapshotBacklogSkippedDelta,
  tickErrorDelta: d.tickErrorDelta,
};
process.stdout.write(JSON.stringify(slim, null, 2) + '\n');
