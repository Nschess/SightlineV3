'use strict';
// Deterministic motion-presentation model using the packaged host snapshot helpers.
// This is not a browser, GPU, or live-network acceptance test.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const { _t }=require('../AndroidProject/app/src/main/assets/phone-host/server.js');

const root=path.resolve(__dirname,'..');
const page=path.join(root,'AndroidProject/app/src/main/assets/phone-host/index.html');
const serverPath=path.join(root,'AndroidProject/app/src/main/assets/phone-host/server.js');
const speed=4.5,turnRate=2.5,tickMs=_t.tickMs;
const q2=n=>Math.round(n*100)/100;
function wrap(a){while(a>Math.PI)a-=2*Math.PI;while(a< -Math.PI)a+=2*Math.PI;return a;}
function angleDelta(a,b){let d=a-b;while(d>Math.PI)d-=2*Math.PI;while(d< -Math.PI)d+=2*Math.PI;return d;}
function oldAgeMs(elapsed){const full=Math.min(100,elapsed),fade=Math.max(0,Math.min(50,elapsed-100));return full+fade-(fade*fade)/100;}
function offlineHz(count){return count>48?15:count>32?20:30;}
function run(count){
  const interval=_t.botThinkPolicy.intervalForRoster(count),hz=offlineHz(count);
  let due=interval,service=0,x=0,yaw=0,maxOldPositionCorrection=0,maxNewPositionCorrection=0,maxOldYawStep=0,maxNewYawStep=0;
  const bot={bot:true,x:0,y:0,z:0,yaw:0,pitch:0,ai:{}};
  // The first AI step has no previous render velocity; seed the same motion
  // state the host records after its first decision before measuring cadence.
  const firstDt=.02,firstX=speed*firstDt,firstYaw=turnRate*firstDt;
  _t.recordBotRenderMotion(bot.ai,{x:firstX,z:0,yaw:firstYaw,pitch:0},0,0,0,0,firstDt,0,interval,interval);
  bot.x=firstX;bot.yaw=firstYaw;x=firstX;yaw=firstYaw;
  let oldV=speed;
  for(let i=0;i<120;i++){
    const nextService=Math.ceil((due-1e-9)/tickMs)*tickMs,elapsed=nextService-service,movementDt=Math.min(.1,elapsed/1000);
    const nextDue=due+interval,followingService=Math.ceil((nextDue-1e-9)/tickMs)*tickMs;
    const nextX=x+speed*movementDt,nextYaw=wrap(yaw+turnRate*movementDt);
    const oldProjected=q2(x+speed*oldAgeMs(elapsed)/1000);
    maxOldPositionCorrection=Math.max(maxOldPositionCorrection,Math.abs(oldProjected-q2(nextX)));
    const newProjected=_t.botSnapshotPosition(bot,nextService).x;
    maxNewPositionCorrection=Math.max(maxNewPositionCorrection,Math.abs(newProjected-q2(nextX)));
    maxOldYawStep=Math.max(maxOldYawStep,Math.abs(angleDelta(nextYaw,yaw)));
    let previous=_t.botSnapshotAngles(bot,service).yaw;
    for(let sample=service+tickMs;sample<=nextService;sample+=tickMs){
      const current=_t.botSnapshotAngles(bot,sample).yaw;
      maxNewYawStep=Math.max(maxNewYawStep,Math.abs(angleDelta(current,previous)));
      previous=current;
    }
    _t.recordBotRenderMotion(bot.ai,{x:nextX,z:0,yaw:nextYaw,pitch:0},x,0,yaw,0,movementDt,nextService,interval,nextDue);
    bot.x=nextX;bot.yaw=nextYaw;x=nextX;yaw=nextYaw;service=nextService;due=nextDue;
  }
  return {
    actors:count,
    offlineBotStepHz:hz,
    lanBotDecisionIntervalMs:interval,
    lanBotDecisionHz:+(1000/interval).toFixed(2),
    offline60HzReference:{frameDistanceM:+(speed/60).toFixed(4),frameTurnRad:+(turnRate/60).toFixed(4)},
    baselineSnapshotPresentation:{maxReanchorPositionCorrectionM:+maxOldPositionCorrection.toFixed(4),maxYawChangePer20msSnapshotRad:+maxOldYawStep.toFixed(4)},
    correctedSnapshotPresentation:{maxReanchorPositionCorrectionM:+maxNewPositionCorrection.toFixed(4),maxYawChangePer20msSnapshotRad:+maxNewYawStep.toFixed(4)},
    model:'constant 4.5 m/s, 2.5 rad/s intent; 20 ms host tick; update intervals rounded to host ticks; 100 ms maximum authoritative movement step; positions/angles rounded like host snapshots'
  };
}
const result={
  test:'LAN bot snapshot motion-presentation comparison',
  source:{serverSha256:crypto.createHash('sha256').update(fs.readFileSync(serverPath)).digest('hex'),pageSha256:crypto.createHash('sha256').update(fs.readFileSync(page)).digest('hex')},
  results:[16,32,64].map(run),
  limitations:['Deterministic model only; no live server, network, browser rendering, frame capture, or physical-device evidence.','Offline cadence is read from runOfflineBots policy; the reference frame-step assumes 60 Hz display interpolation.']
};
const out=path.resolve(process.argv[2]||path.join(root,'acceptance/lan-motion-presentation-2026-11-02.json'));
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,out},null,2));
