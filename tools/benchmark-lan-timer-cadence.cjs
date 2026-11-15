'use strict';
// Isolated cadence diagnostic for the 20 ms LAN host loop. No sockets or game state.
// Compares Node timers with a worker-thread high-resolution wait experiment.
const { performance } = require('node:perf_hooks');
const { Worker } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
const PERIOD_MS = 20;
const DURATION_MS = Math.max(4000, Math.min(30000, Number(process.argv[2]) || 8000));
function pct(values, p) { const sorted = [...values].sort((a, b) => a - b); return Number((sorted[Math.floor((sorted.length - 1) * p)] || 0).toFixed(2)); }
function summarize(name, gaps, wallMs, cpu) {
  const bins4ms = {};
  for (const gap of gaps) { const bucket = Math.round(gap / 4) * 4; bins4ms[bucket] = (bins4ms[bucket] || 0) + 1; }
  return { name, samples: gaps.length, p50Ms: pct(gaps, .5), p95Ms: pct(gaps, .95), p99Ms: pct(gaps, .99), maxMs: Number(Math.max(...gaps).toFixed(2)), bins4ms,
    processCpuPercent: Number((((cpu.user + cpu.system) / 1000) / wallMs * 100).toFixed(2)) };
}
async function measureMainTimer(name, durationMs) {
  const gaps = [], cpu0 = process.cpuUsage(), start = performance.now();
  let previous = null, deadline = start + PERIOD_MS, timer = null;
  await new Promise(resolve => {
    function pulse() {
      const t = performance.now();
      if (previous !== null) gaps.push(t - previous);
      previous = t;
      if (t - start >= durationMs) { if (timer) clearInterval(timer); resolve(); return; }
      if (name === 'fixed-deadline-setTimeout') {
        deadline += PERIOD_MS;
        if (t - deadline > PERIOD_MS * 4) deadline = t + PERIOD_MS;
        timer = setTimeout(pulse, Math.max(1, deadline - performance.now()));
      } else if (name === 'setInterval-20ms') {
        // This callback is driven by a single interval installed below.
      } else if (name === 'poll-setTimeout-1ms') {
        timer = setTimeout(pulse, 1);
      }
    }
    if (name === 'setInterval-20ms') { pulse(); timer = setInterval(pulse, PERIOD_MS); }
    else timer = setTimeout(pulse, PERIOD_MS);
  });
  const wallMs = performance.now() - start;
  return summarize(name, gaps, wallMs, process.cpuUsage(cpu0));
}
async function measureWorkerWait(durationMs) {
  const code = `
    const { parentPort, workerData } = require('node:worker_threads');
    const cell = new Int32Array(new SharedArrayBuffer(4));
    const now = () => Number(process.hrtime.bigint()) / 1e6;
    let target = now() + workerData.period;
    const stop = now() + workerData.duration;
    while (target <= stop) {
      let remaining = target - now();
      while (remaining > 0) { Atomics.wait(cell, 0, 0, remaining); remaining = target - now(); }
      parentPort.postMessage(now());
      target += workerData.period;
    }
    parentPort.postMessage(null);
  `;
  const cpu0 = process.cpuUsage(), start = performance.now(), gaps = [];
  return await new Promise((resolve, reject) => {
    const worker = new Worker(code, { eval: true, workerData: { period: PERIOD_MS, duration: durationMs } });
    let previous = null;
    worker.on('message', t => {
      if (t === null) {
        worker.terminate().catch(() => {});
        const wallMs = performance.now() - start;
        resolve(summarize('worker-Atomics.wait-20ms', gaps, wallMs, process.cpuUsage(cpu0)));
      } else { const value = Number(t); if (previous !== null) gaps.push(value - previous); previous = value; }
    });
    worker.on('error', reject);
  });
}
(async () => {
  const results = [];
  for (const name of ['fixed-deadline-setTimeout', 'setInterval-20ms', 'poll-setTimeout-1ms']) results.push(await measureMainTimer(name, DURATION_MS));
  results.push(await measureWorkerWait(DURATION_MS));
  const report = { test: 'LAN host timer cadence alternatives (isolated; no game/network)', intervalMs: PERIOD_MS, durationPerStrategyMs: DURATION_MS, results,
    limitations: ['No server tick workload, bot AI, sockets, page rendering, Wi-Fi, or Android GPU.', 'Worker wait is diagnostic only; it is not a proposed production change until measured in the actual host and validated against gameplay.'] };
  const out = path.resolve(process.argv[3] || path.join(__dirname, '..', 'acceptance', 'lan-timer-strategy-benchmark-2026-10-28.json'));
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile: out, ...report }, null, 2));
})().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
