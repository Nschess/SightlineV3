'use strict';
// Isolated timer strategy probe. It does not launch or modify the game server.
const {Worker}=require('node:worker_threads');
const {performance}=require('node:perf_hooks');
const N=Math.max(100,Math.min(1000,Number(process.argv[2])||300));
const MS=20;
function distribution(values){const a=values.slice().sort((x,y)=>x-y),q=p=>+a[Math.floor((a.length-1)*p)].toFixed(2);return {p50Ms:q(.5),p95Ms:q(.95),p99Ms:q(.99),maxMs:+a[a.length-1].toFixed(2)};}
function summary(name,gaps,lateness,cpuMs){return {name,samples:gaps.length,intervalMs:MS,gapMeanMs:+(gaps.reduce((s,x)=>s+x,0)/gaps.length).toFixed(2),gap:distribution(gaps),wakeLateness:distribution(lateness.map(x=>Math.max(0,x))),signedWakeOffset:distribution(lateness),cpuMs:+cpuMs.toFixed(2)};}
async function timerProbe(name,schedule){
  const gaps=[],late=[];let last=performance.now(),n=0;const cpu0=process.cpuUsage(),start=performance.now();
  await new Promise(resolve=>schedule(expected=>{const now=performance.now();gaps.push(now-last);late.push(now-expected);last=now;if(++n>=N){resolve();return false;}return true;}));
  const cpu=process.cpuUsage(cpu0);return summary(name,gaps,late,(cpu.user+cpu.system)/1000);
}
function recursiveTimeout(onTick){let deadline=performance.now()+MS;function step(){if(!onTick(deadline))return;deadline=performance.now()+MS;setTimeout(step,MS);}setTimeout(step,MS);}
function fixedDeadlineTimeout(onTick){let deadline=performance.now()+MS;function step(){if(!onTick(deadline))return;deadline+=MS;const now=performance.now();if(now-deadline>MS*4)deadline=now+MS;setTimeout(step,Math.max(1,deadline-performance.now()));}setTimeout(step,MS);}
// Arm one millisecond ahead. If Windows wakes the timer before the deadline,
// rearm for the remaining duration. This tests deadline-aware rearming without
// polling, a busy wait, or changing the system timer resolution.
function earlyRearmTimeout(onTick){let deadline=performance.now()+MS;function step(){const now=performance.now();if(now<deadline){setTimeout(step,Math.max(1,deadline-now-1));return;}if(!onTick(deadline))return;deadline+=MS;const t=performance.now();if(t-deadline>MS*4)deadline=t+MS;setTimeout(step,Math.max(1,deadline-performance.now()-1));}setTimeout(step,MS-1);}
async function workerProbe(){
  const source=`const{parentPort,workerData}=require('node:worker_threads');const g=[],l=[];let last=Number(process.hrtime.bigint())/1e6;for(let i=0;i<workerData.n;i++){const target=last+workerData.ms;Atomics.wait(new Int32Array(workerData.sab),0,0,workerData.ms);const now=Number(process.hrtime.bigint())/1e6;g.push(now-last);l.push(now-target);last=now;}parentPort.postMessage({g,l});`;
  const cpu0=process.cpuUsage(),w=new Worker(source,{eval:true,workerData:{n:N,ms:MS,sab:new SharedArrayBuffer(8)}});
  const data=await new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);});
  const cpu=process.cpuUsage(cpu0);return summary('worker Atomics.wait',data.g,data.l,(cpu.user+cpu.system)/1000);
}
(async()=>{
  const results=[];
  results.push(await timerProbe('recursive setTimeout(20)',recursiveTimeout));
  results.push(await timerProbe('current fixed-deadline setTimeout(20)',fixedDeadlineTimeout));
  results.push(await timerProbe('deadline-aware rearm 1ms early',earlyRearmTimeout));
  results.push(await workerProbe());
  console.log(JSON.stringify({platform:process.platform,node:process.version,intervalMs:MS,intervalsPerStrategy:N,results,note:'Isolated Windows scheduler measurements only; not Wi-Fi, rendered-game, or Android timing. No global timer-resolution change or busy wait.'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
