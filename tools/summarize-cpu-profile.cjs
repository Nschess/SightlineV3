const fs = require('fs');
const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const nodes = new Map();
function visit(n) {
  nodes.set(n.id, n);
  for (const c of n.children || []) visit(c);
}
for (const n of p.nodes || []) nodes.set(n.id, n);
const selfUs = new Map(), parents = new Map(), inclusiveUs = new Map();
for (const n of p.nodes || []) for (const child of n.children || []) parents.set(child, n.id);
for (let i = 0; i < (p.samples || []).length; i++) {
  const id = p.samples[i], us = Number(p.timeDeltas && p.timeDeltas[i]) || 0;
  selfUs.set(id, (selfUs.get(id) || 0) + us);
  let cur = id;
  while (cur != null) {
    const n = nodes.get(cur) || {}, c = n.callFrame || {};
    const key = `${c.url || ''}\t${c.functionName || '(anonymous)'}`;
    inclusiveUs.set(key, (inclusiveUs.get(key) || 0) + us);
    cur = parents.get(cur);
  }
}
const totalUs = [...selfUs.values()].reduce((a, b) => a + b, 0);
const rows = [...selfUs].map(([id, us]) => {
  const n = nodes.get(id) || {};
  const c = n.callFrame || {};
  return { function: c.functionName || '(anonymous)', url: c.url || '', line: c.lineNumber, selfMs: +(us / 1000).toFixed(1), share: +(100 * us / Math.max(1, totalUs)).toFixed(1) };
}).sort((a, b) => b.selfMs - a.selfMs).slice(0, 35);
const inclusive = [...inclusiveUs].map(([key, us]) => {
  const [url, fn] = key.split('\t');
  return { function: fn, url, inclusiveMs: +(us / 1000).toFixed(1), shareOfSampledCpu: +(100 * us / Math.max(1, totalUs)).toFixed(1) };
}).filter(x => x.url.includes('phone-host/')).sort((a, b) => b.inclusiveMs - a.inclusiveMs).slice(0, 35);
const result = { sampleCount: (p.samples || []).length, sampledCpuMs: +(totalUs / 1000).toFixed(1), topSelf: rows, topSightlineInclusive: inclusive };
if (process.argv.includes('--inclusive-only')) delete result.topSelf;
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
