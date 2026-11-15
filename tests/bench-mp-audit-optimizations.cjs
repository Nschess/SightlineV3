'use strict';
// Matched source-level benchmark for the retained nearest-target scan.
// This does not measure LAN, browser rendering, or Android performance.
const path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'AndroidProject/app/src/main/assets');
const Hunt=require(path.join(assets,'phone-host/zombie-hunt.js'));
const baseline=path.join(root,'acceptance/rollback/multiplayer-integration-before-20261029/AndroidProject/app/src/main/assets/phone-host/zombie-hunt.js');
const candidate=path.join(assets,'phone-host/zombie-hunt.js');
const sha=p=>crypto.createHash('sha256').update(require('node:fs').readFileSync(p)).digest('hex');
const now=()=>Number(process.hrtime.bigint())/1e6;
const median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
function fullSort(origin,primary,others){const a=[];if(primary&&primary.alive)a.push(primary);for(const p of others)if(p.alive)a.push(p);a.sort((x,y)=>Math.hypot(x.x-origin.x,x.z-origin.z)-Math.hypot(y.x-origin.x,y.z-origin.z));return a.slice(0,5);}
function measure(fn,frames,zombies,others){const trials=[];let checksum=0;for(let trial=0;trial<5;trial++){const start=now();for(let f=0;f<frames;f++)for(const z of zombies){const got=fn(z,others);checksum+=got.length+(got[0]?got[0].id:0);}trials.push(now()-start);}return {trialsMs:trials,medianMs:median(trials),checksum};}
let seed=0x51a7e;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/0x100000000);
const others=Array.from({length:32},(_,id)=>({id:id+1,alive:true,x:rand()*120-60,z:rand()*120-60}));
const primary={id:0,alive:true,x:rand()*40-20,z:rand()*40-20};
const zombies=Array.from({length:64},(_,id)=>({id:id+100,x:rand()*120-60,z:rand()*120-60}));
const frames=4000,old=measure((z,all)=>fullSort(z,primary,all),frames,zombies,others);
const scratch=zombies.map(()=>({targets:[],distances:[]}));
const current=measure((z,all)=>{const s=scratch[z.id-100];return Hunt.nearestTargets(z,primary,all,5,s.targets,s.distances);},frames,zombies,others);
if(old.checksum!==current.checksum)throw new Error('target output checksums differ');
const report={kind:'matched-source-target-scan-microbenchmark',createdAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch},sourceHashes:{baselineZombieHunt:sha(baseline),candidateZombieHunt:sha(candidate)},configuration:{frames,zombiesPerFrame:zombies.length,survivors:others.length+1,nearestLimit:5,trials:5},legacyFullSort:old,boundedInsertion:current,medianReductionPercent:+((old.medianMs-current.medianMs)/old.medianMs*100).toFixed(2),checksumMatches:true,limitations:['Pure source microbenchmark. It does not prove live host tick improvements, LAN smoothness, browser frame rate, remote receive timing, or Android GPU performance.']};
const out=path.join(root,'acceptance/mp-audit-target-scan-benchmark-2026-10-29.json');require('node:fs').writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({out,configuration:report.configuration,oldMedianMs:old.medianMs,newMedianMs:current.medianMs,medianReductionPercent:report.medianReductionPercent,checksumMatches:true},null,2));
