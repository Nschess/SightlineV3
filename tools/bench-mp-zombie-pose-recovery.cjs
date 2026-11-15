#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const beforeRoot = path.join(root, 'acceptance/checkpoints/2026-11-05-pre-zombie-pose-recovery/AndroidProject/app/src/main/assets');
const afterRoot = path.join(root, 'AndroidProject/app/src/main/assets');
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
function run(html) {
  const start = html.indexOf('function mpQueueRemotePose('), end = html.indexOf('function mpEnsureZombie(', start);
  const interp = html.match(/function interpMs\(\) \{[^\n]+\}/)?.[0];
  if (start < 0 || end <= start || !interp) throw new Error('client interpolation functions unavailable');
  let now = 0;
  const axis = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x=x;this.y=y;this.z=z; } });
  const MP={on:true,id:0,mode:'outbreak',net:{last:0,ema:50,jit:0},snapN:0,puppets:{},zombies:{},weapons:[]};
  const ctx=vm.createContext({Math,Number,Array,JSON,MP,G:{interp:0},performance:{now:()=>now},scene:{add(){}},SightlinePoses:{apply(){},weapon(){}},hurtGlow(){},mpEnsureZombie(id){
    if(MP.zombies[id])return MP.zombies[id];
    return MP.zombies[id]={id,zombie:true,alive:false,wasAlive:false,x:0,y:0,z:0,yaw:0,pitch:0,op:{w:1,h:1},legs:{rotation:{x:0}},buf:[],poseSamplePool:[],fall:1,gone:0,g:{parent:{},visible:false,position:axis(),rotation:{x:0,y:0,z:0},scale:{set(){}}}};
  }});
  vm.runInContext(interp+'\n'+html.slice(start,end)+'\nthis.delay=interpMs;this.snapshot=mpSnapshot;this.step=mpPuppetStep;',ctx,{timeout:10000});
  const u=ctx.mpEnsureZombie(77,0);
  function snapshot(seq,st,rx,yaw){now=rx;ctx.snapshot({n:seq,st,a:[],z:[[77,0,st*.002,st*.001,yaw,0]]});}
  function render(t){now=t;ctx.step(u,1/60,t-ctx.delay());return{x:u.x,z:u.z,yaw:u.yaw,recovery:u.poseRecovery?{...u.poseRecovery}:null};}
  snapshot(1,0,1000,2.9);snapshot(2,20,1020,2.9);
  let last=render(1036.67);
  for(let t=1053.34;t<=1303.34;t+=1000/60)last=render(t);
  const before={x:last.x,z:last.z,yaw:last.yaw};
  snapshot(17,320,1320,-2.9);
  const resumed=render(1336.67);
  let maxPosStep=Math.hypot(resumed.x-before.x,resumed.z-before.z);
  let maxYawStep=Math.abs(Math.atan2(Math.sin(resumed.yaw-before.yaw),Math.cos(resumed.yaw-before.yaw)));
  let prior={x:resumed.x,z:resumed.z,yaw:resumed.yaw},recoveryStart=u.poseRecovery?{...u.poseRecovery}:null;
  for(let seq=18,rx=1340,st=340;seq<=77;seq++,rx+=20,st+=20){snapshot(seq,st,rx,-2.9);const pose=render(rx+16.67);maxPosStep=Math.max(maxPosStep,Math.hypot(pose.x-prior.x,pose.z-prior.z));maxYawStep=Math.max(maxYawStep,Math.abs(Math.atan2(Math.sin(pose.yaw-prior.yaw),Math.cos(pose.yaw-prior.yaw))));prior={x:pose.x,z:pose.z,yaw:pose.yaw};}
  return {initialGapStepM:+Math.hypot(resumed.x-before.x,resumed.z-before.z).toFixed(4),maxRecoveryStepM:+maxPosStep.toFixed(4),initialGapTurnRad:+Math.abs(Math.atan2(Math.sin(resumed.yaw-before.yaw),Math.cos(resumed.yaw-before.yaw))).toFixed(4),maxRecoveryTurnRad:+maxYawStep.toFixed(4),recoveryStarted:!!recoveryStart,recoveryStartM:recoveryStart?+Math.hypot(recoveryStart.x,recoveryStart.z).toFixed(4):0,recoveryStartYawRad:recoveryStart?+Math.abs(recoveryStart.yaw||0).toFixed(4):0,recoveryConverged:!u.poseRecovery};
}
const results=[];
for(const client of ['www','phone-host']){
  const before=fs.readFileSync(path.join(beforeRoot,client,'index.html'),'utf8');
  const after=fs.readFileSync(path.join(afterRoot,client,'index.html'),'utf8');
  results.push({client,baselineSha256:digest(before),candidateSha256:digest(after),before:run(before),after:run(after)});
}
const report={test:'synthetic established Outbreak zombie long-gap pose recovery; extracted actual client interpolation functions',trace:{snapshots:'20 ms host cadence then one 300 ms gap (14 sequence frames absent)',position:'constant 4.5 m/s equivalent on the 20 ms host-time samples',turn:'wrap-crossing 2.9 rad to -2.9 rad across the gap',render:'60 Hz synthetic frames',recovery:'60 subsequent 20 ms snapshots'},results,limitations:['Deterministic client function replay only; no live WebSocket, browser-rendered WebGL, animation capture, Wi-Fi, or Android device.']};
const out=path.resolve(process.argv[2]||path.join(root,'acceptance/benchmarks/4.1-zombie-pose-recovery-comparison.json'));
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({out,results},null,2));
