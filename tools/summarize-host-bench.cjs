const fs=require('fs');
const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const r=d.result||d;
const checks=(r.checks||[]).map(x=>({name:x.name,pass:x.pass,...Object.fromEntries(Object.entries(x).filter(([k])=>!['name','pass'].includes(k)))}));
const s=r.diagnosticsAtEnd||{};
const out={test:r.test,status:r.status,mode:r.mode,bots:r.botCount,map:r.mapId,tickMs:r.tickMs,diagnostics:r.diagnosticsEnabled,observer:r.observer,checks,
  think:{calls:s.thinkCalls,perSecond:s.thinkRatePerSecond,targetPerSecond:s.targetThinkCallsPerSecond,intervalMs:s.thinkIntervalMs,botStats:s.botStats},pathTiming:s.botPathTiming,navigation:s.navigationDiagnostics,
  tick:s.tickWorkMs,gaps:s.tickStartGapsMs,liveComponentMax:s.liveComponentMax,botWork:s.botWorkDiagnostics,eventLoop:s.eventLoop,
  skippedSnapshots:s.tickStartGapsMs&&s.tickStartGapsMs.skipped,tickErrors:s.tickStartGapsMs&&s.tickStartGapsMs.tickErrors,
  serverWarnings:r.serverWarnings,error:r.errors&&r.errors.slice(0,2),blockedReason:r.blockReason};
if(process.argv.includes('--metrics-only'))console.log(JSON.stringify({test:r.test,status:r.status,botCount:r.botCount,mapId:r.mapId,tickMs:r.tickMs,diagnostics:r.diagnosticsEnabled,think:out.think,pathTiming:out.pathTiming,tick:out.tick,gaps:out.gaps,botStats:s.botStats,botWork:s.botWorkDiagnostics,skippedSnapshots:out.skippedSnapshots,tickErrors:out.tickErrors,checks:checks.filter(x=>!x.pass)},null,2));
else if(process.argv.includes('--warnings-only'))console.log(r.serverWarnings||'(no host warnings captured)');
else if(process.argv.includes('--errors-only'))console.log(JSON.stringify(checks.filter(x=>!x.pass),null,2));
else console.log(JSON.stringify(out,null,2));
