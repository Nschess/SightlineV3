'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const baselinePath = path.join(root, 'acceptance/expansion8-ffa-bomb-benchmark-baseline.json');
const candidatePath = path.join(root, 'acceptance/expansion8-ffa-bomb-benchmark-candidate.json');
const outPath = path.join(root, 'acceptance/expansion8-ffa-bomb-benchmark-comparison.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
if (baseline.configuration.sourceServerSha256 && baseline.configuration.sourceServerSha256 !== candidate.configuration.sourceServerSha256) throw new Error('Source SHA mismatch');
if (baseline.sourceServerSha256 !== candidate.sourceServerSha256) throw new Error('Baseline and candidate server sources differ');
const median = xs => { const a = xs.slice().sort((x,y)=>x-y); return a.length ? a[Math.floor(a.length/2)] : null; };
const group = report => {
  const m = new Map();
  for (const row of report.results) {
    const key = `${row.mode}:${row.requestedBots}`;
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(row);
  }
  return m;
};
const bg=group(baseline),cg=group(candidate),rows=[];
for(const mode of ['ffa','bomb']) for(const bots of [16,32,64]){
  const key=`${mode}:${bots}`, b=bg.get(key)||[],c=cg.get(key)||[];
  if(b.length!==2||c.length!==2)throw new Error(`${key} requires two baseline and candidate trials`);
  const aggregate=xs=>({
    tickP50Ms:median(xs.map(x=>x.driver.tickWorkMs.p50)),tickP95Ms:median(xs.map(x=>x.driver.tickWorkMs.p95)),
    tickP99Ms:median(xs.map(x=>x.driver.tickWorkMs.p99)),tickMaxMs:median(xs.map(x=>x.driver.tickWorkMs.max)),
    drivenGapP95Ms:median(xs.map(x=>x.driver.drivenStartGapMs.p95)),cpuOneCorePct:median(xs.map(x=>x.driver.oneCoreUtilizationPct)),
    pathCalls:median(xs.map(x=>x.bots.paths||0)),pathMs:median(xs.map(x=>x.bots.pathMs||0)),pathMaxMs:median(xs.map(x=>x.bots.pathMaxMs||0)),
    botThinks:median(xs.map(x=>x.bots.thinks||0)),snapshotFrames:median(xs.map(x=>x.snapshots.logicalFrames)),
    snapshotBytes:median(xs.map(x=>x.snapshots.logicalBytes)),heapDeltaBytes:median(xs.map(x=>x.memoryBytes.heapUsed.end-x.memoryBytes.heapUsed.start)),
    rssMaxBytes:median(xs.map(x=>x.memoryBytes.rss.max))
  });
  const before=aggregate(b),after=aggregate(c),pct=(a,z)=>a===0?null:+((z-a)/a*100).toFixed(2);
  rows.push({mode,requestedBots: bots,trials:2,baseline:before,candidate:after,changePct:{tickP95:pct(before.tickP95Ms,after.tickP95Ms),tickP99:pct(before.tickP99Ms,after.tickP99Ms),cpu:pct(before.cpuOneCorePct,after.cpuOneCorePct),pathCalls:pct(before.pathCalls,after.pathCalls)},allSamplesHad180Snapshots:b.concat(c).every(x=>x.snapshots.logicalFrames===180)});
}
const report={kind:'matched-expansion8-ffa-bomb-benchmark-comparison',createdAt:new Date().toISOString(),baselineSourceServerSha256:baseline.sourceServerSha256,candidateSourceServerSha256:candidate.sourceServerSha256,productionServerSourceIdentical:baseline.sourceServerSha256===candidate.sourceServerSha256,workloadIdentical:JSON.stringify(baseline.configuration)===JSON.stringify(candidate.configuration),interpretation:'Only test and benchmark harness files changed; production host game source hash is identical. Differences are run-to-run machine variance, not a claimed optimization.',rows,limitations:[...new Set([...baseline.limitations,...candidate.limitations])]};
fs.writeFileSync(outPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({out:outPath,serverSha256:report.baselineSourceServerSha256,rows:rows.map(x=>({mode:x.mode,bots:x.requestedBots,baseP95:x.baseline.tickP95Ms,candidateP95:x.candidate.tickP95Ms,baseP99:x.baseline.tickP99Ms,candidateP99:x.candidate.tickP99Ms,baseCpu:x.baseline.cpuOneCorePct,candidateCpu:x.candidate.cpuOneCorePct,snapshots180:x.allSamplesHad180Snapshots}))},null,2));
