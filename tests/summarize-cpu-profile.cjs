'use strict';
const fs=require('node:fs');
const file=process.argv[2];
if(!file)throw new Error('Usage: node tests/summarize-cpu-profile.cjs <profile.cpuprofile>');
const profile=JSON.parse(fs.readFileSync(file,'utf8'));
const labels=new Map((profile.nodes||[]).map(n=>[n.id,[n.callFrame?.functionName||'(anonymous)',n.callFrame?.url||'',n.callFrame?.lineNumber??-1]]));
const time=new Map();
for(let i=0;i<(profile.samples||[]).length;i++){
  const id=profile.samples[i],delta=profile.timeDeltas?.[i]||0;
  time.set(id,(time.get(id)||0)+delta);
}
const rows=[...time].map(([id,microseconds])=>({id,function:labels.get(id)?.[0],url:labels.get(id)?.[1],line:labels.get(id)?.[2],sampledMs:+(microseconds/1000).toFixed(2)}))
  .sort((a,b)=>b.sampledMs-a.sampledMs).slice(0,30);
console.log(JSON.stringify({file,profileDurationMs:+((profile.endTime-profile.startTime)/1000).toFixed(2),sampleCount:profile.samples?.length||0,nodes:profile.nodes?.length||0,topSampledFunctions:rows,warning:'Inspector samples measure Node CPU while profiling; they do not include time the process was descheduled or browser/GPU work.'},null,2));
