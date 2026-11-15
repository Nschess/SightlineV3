'use strict';
// Replays a captured loopback snapshot stream through the actual Sightline
// client queue/interpolation/pose functions. No browser or WebGL is involved.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets', 'phone-host');
const html = fs.readFileSync(path.join(assets, 'index.html'), 'utf8');
const tracePath = process.argv[2] && path.resolve(process.argv[2]);
if (!tracePath) throw new Error('Pass a protocol-capture JSON that includes snapshotPayloadTrace.');
const capture = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
const client = capture.runtime?.clientDelivery?.find(c => Array.isArray(c.snapshotPayloadTrace));
const intervals = client?.snapshotGapTraceMs || [];
const snapshots = client?.snapshotPayloadTrace || [];
if (intervals.length < 100 || intervals.some(x => !Number.isFinite(x) || x <= 0)) throw new Error('Expected at least 100 valid captured snapshot gaps.');
if (snapshots.length !== intervals.length + 1 || snapshots.some(m => !Array.isArray(m.a) || !Array.isArray(m.z))) throw new Error('Captured snapshot payloads and receive intervals do not align.');
const queueStart = html.indexOf('function mpQueueRemotePose(');
const interpStart = html.indexOf('function interpMs() {');
const interpEnd = html.indexOf('function mpPrefs()', interpStart);
const snapshotStart = html.indexOf('function mpQueueRemotePose(');
const snapshotEnd = html.indexOf('function mpEnsureZombie(', snapshotStart);
if ([queueStart, interpStart, interpEnd, snapshotStart, snapshotEnd].some(n => n < 0)) throw new Error('Could not extract actual client interpolation functions.');
const gameData = JSON.parse(fs.readFileSync(path.join(assets, 'data.json'), 'utf8'));
const SightlinePoses = require(path.join(assets, 'character-poses.js'));
const localId = Number.isInteger(capture.runtime.hostPlayerId) ? capture.runtime.hostPlayerId : -1;
const actorIds = new Set();
for (const m of snapshots) for (const r of m.a) if (r[0] !== localId) actorIds.add(r[0]);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function pct(values, p) { const a = values.slice().sort((x, y) => x - y); return a.length ? +a[Math.min(a.length - 1, Math.floor((a.length - 1) * p))].toFixed(4) : null; }
function axis() { return { x: 0, y: 0, z: 0, set(x, y, z) { this.x=x; this.y=y; this.z=z; } }; }
function puppet(id, zombie=false) {
  return { id, netBot:!zombie, bot:!zombie, team:1, opIndex:0, skin:0, name:zombie?'captured-zombie':'captured-bot', finishes:{}, infected:false, zombie,
    x:0,y:0,z:0,yaw:0,pitch:0,alive:false,wasAlive:false,fall:zombie?1:0,gone:0,phase:0,cr:0,pr:0,buf:[],poseSamplePool:[],flashT:0,hurtT:0,flash:{visible:false},
    op:{w:1,h:1,zombie},legs:{position:axis(),rotation:{x:0}},legR:{position:axis(),rotation:{x:0}},body:{position:axis(),rotation:{x:0}},
    g:{parent:{},visible:true,position:axis(),rotation:{x:0,y:0,z:0},scale:{set(x,y,z){this.x=x;this.y=y;this.z=z;}}},
    worldKey:'pistol',worldGun:{visible:true,position:axis(),rotation:{x:0,y:0,z:0}} };
}
const initialArrival = 0;
const arrivals = [initialArrival];
for (const gap of intervals) arrivals.push(arrivals.at(-1) + gap);
const durationMs = arrivals.at(-1);
function run(interpChoice) {
  let now = initialArrival;
  const MP = {on:true,id:localId,mode:'outbreak',myTeam:0,myInfected:false,net:{last:0,gapMax:0,ema:50,jit:0,rate:0,rn:0},
    snapN:0,puppets:Object.create(null),zombies:Object.create(null),weapons:Object.keys(gameData.weapons||{}),dirty:false,lobby:null,infStatus:null};
  for (const id of actorIds) MP.puppets[id] = puppet(id);
  const G = {interp:interpChoice};
  const ctx = {MP,G,Math,Number,Array,JSON,performance:{now:()=>now},SightlinePoses,
    __createPuppet:puppet,scene:{add(o){o.parent={};},remove(o){o.parent=null;}},hurtGlow(){},showMsg(){},sfxTone(){},renderInfectionStatus(){},
    ensureWorldWeapon(){},mpApplyWorldFinish(){},worldWeaponUsesModelGrip(){return false;},poseWorldArms(){},
    WORLD_RIGHT_GRIP:{x:0,y:1.3,z:-.4},WORLD_WEAPON_PRESENTATION:{},WEAPONS:Object.fromEntries(Object.keys(gameData.weapons||{}).map(k=>[k,{}]))};
  let source = html.slice(interpStart,interpEnd)+'\nthis.__interp=interpMs;'+html.slice(snapshotStart,snapshotEnd)+
    '\nthis.mpEnsureZombie=function(id,ti){var u=__createPuppet(id,true);u.ztype=ti;u.alive=false;u.wasAlive=false;u.seen=MP.snapN;u.rise=1;u.gone=0;MP.zombies[id]=u;return u;};'+
    '\nthis.__snapshot=mpSnapshot;this.__step=mpPuppetStep;';
  const speedMark='speed=Math.hypot(vx,vz)*1000;';
  if(!source.includes(speedMark))throw new Error('could not instrument the pose velocity guard');
  source=source.replace(speedMark,speedMark+'u.benchPoseSpeed=speed;u.benchPoseSpeedAccepted=speed<=14;');
  vm.runInNewContext(source,ctx,{timeout:15000});
  const snapshotCosts=[],frameCosts=[],interpValues=[],cappedPredictionDistances=[];
  let si=0,frames=0,poseCalls=0,maxActors=0,maxZombies=0,maxBuffer=0,activeMovingSamples=0,lowMotionFrames=0,invalidTransforms=0,maxPredictionDistance=0;
  const poseStateFrames={interpolated:0,wait:0,predicted:0,capped:0,unknown:0};
  const lowMotionByPoseState={interpolated:0,wait:0,predicted:0,capped:0,unknown:0};
  const cappedPredictionVelocity={accepted:0,rejected:0,lowMotionAccepted:0,lowMotionRejected:0};
  const dt=1/60, frameStep=1000/60, end=durationMs;
  for(let frameT=0;frameT<=end+0.001;frameT+=frameStep){
    while(si<snapshots.length&&arrivals[si]<=frameT){
      now=arrivals[si];const t0=performance.now();ctx.__snapshot(snapshots[si]);snapshotCosts.push(performance.now()-t0);si++;
    }
    now=frameT;const renderT=frameT-ctx.__interp();interpValues.push(ctx.__interp());
    const actors=Object.values(MP.puppets),zombies=Object.values(MP.zombies),units=actors.concat(zombies);
    maxActors=Math.max(maxActors,actors.length);maxZombies=Math.max(maxZombies,zombies.length);maxBuffer=Math.max(maxBuffer,...units.map(u=>u.buf.length),0);
    const frameStart=performance.now();
    for(const u of units){
      const beforeX=u.x,beforeZ=u.z,b=u.buf,a=b[0],c=b[1]||a;
      let expected=0;if(a&&c&&c.t>a.t)expected=Math.hypot(c.x-a.x,c.z-a.z)*dt*1000/(c.t-a.t);
      ctx.__step(u,dt,renderT);poseCalls++;
      const poseState=u.poseState===0?'interpolated':u.poseState===1?'wait':u.poseState===2?'predicted':u.poseState===3?'capped':'unknown';
      poseStateFrames[poseState]++;
      if(u.poseState===3&&Number.isFinite(u.benchPoseSpeed)){
        if(u.benchPoseSpeedAccepted)cappedPredictionVelocity.accepted++;else cappedPredictionVelocity.rejected++;
      }
      if(expected>0.001){activeMovingSamples++;if(Math.hypot(u.x-beforeX,u.z-beforeZ)<expected*.12){lowMotionFrames++;lowMotionByPoseState[poseState]++;if(u.poseState===3){if(u.benchPoseSpeedAccepted)cappedPredictionVelocity.lowMotionAccepted++;else cappedPredictionVelocity.lowMotionRejected++;}}}
      if(c&&renderT>c.t){const distance=Math.hypot(u.x-c.x,u.z-c.z);maxPredictionDistance=Math.max(maxPredictionDistance,distance);if(u.poseState===3)cappedPredictionDistances.push(distance);}
      if(!Number.isFinite(u.x)||!Number.isFinite(u.y)||!Number.isFinite(u.z))invalidTransforms++;
    }
    frameCosts.push(performance.now()-frameStart);frames++;
    for(const id of Object.keys(MP.zombies)){const z=MP.zombies[id];if((!z.alive&&z.gone>2.5)||(z.alive&&MP.snapN-z.seen>40))delete MP.zombies[id];}
  }
  return {mode:interpChoice===0?'Auto':'fixed-'+interpChoice+'ms',capturedSnapshots:si,remotePlayers:actorIds.size,peakRemotePlayers:maxActors,peakZombieModels:maxZombies,simulatedFrames:frames,poseCalls,
    snapshotProcessingMs:{p50:pct(snapshotCosts,.5),p95:pct(snapshotCosts,.95),p99:pct(snapshotCosts,.99),max:+Math.max(...snapshotCosts).toFixed(4)},
    allRemotePoseWorkPerFrameMs:{p50:pct(frameCosts,.5),p95:pct(frameCosts,.95),p99:pct(frameCosts,.99),max:+Math.max(...frameCosts).toFixed(4),framesOver16_67ms:frameCosts.filter(x=>x>16.667).length},
    interpolationBufferMs:{p50:pct(interpValues,.5),p95:pct(interpValues,.95),p99:pct(interpValues,.99),max:+Math.max(...interpValues).toFixed(3)},
    maximumPoseBufferSamples:maxBuffer,sourceMovingPoseSamples:activeMovingSamples,lowMotionDuringMovingPoseSamples:lowMotionFrames,
    poseStateFrameCounts:poseStateFrames,lowMotionByPoseState,cappedPredictionVelocity,maxPredictionDistanceUnits:+maxPredictionDistance.toFixed(4),
    cappedPredictionDistanceUnits:{p95:pct(cappedPredictionDistances,.95),p99:pct(cappedPredictionDistances,.99),max:cappedPredictionDistances.length?+Math.max(...cappedPredictionDistances).toFixed(4):null},
    invalidTransforms,receiveGapMs:{p50:pct(intervals,.5),p95:pct(intervals,.95),p99:pct(intervals,.99),max:+Math.max(...intervals).toFixed(3)}};
}
const report={test:'Captured Outbreak snapshots through actual client pose/interpolation code',pageSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(assets,'index.html'))).digest('hex'),
  input:{capturePath:tracePath,protocolClients:capture.protocolClientCount,tickMs:capture.tickMs,ai:capture.runtime.ai,bots:capture.runtime.bots,zombies:capture.runtime.zombies,localPlayerId:localId,
    sourceSnapshotCount:snapshots.length,receiveIntervals:intervals.length,arrivalOrder:'captured real loopback WebSocket message order'},
  results:[run(0),run(20),run(40),run(55)],
  limitations:['Runs the current mpSnapshot, mpQueueRemotePose, interpMs, mpPuppetStep, and SightlinePoses functions in Node with transform stubs.','The input snapshots are a real loopback capture from before host timestamps; this replay exercises the legacy arrival-time fallback, not the new host timestamp path.','Measures CPU pose work and interpolation over captured loopback data, not browser event-loop time, Three.js/WebGL/GPU frame time, Wi-Fi jitter, packet loss, or physical-device behavior.']};
const out=path.resolve(process.argv[3]||path.join(root,'acceptance','lan-client-pose-replay-2026-10-28.json'));
fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,out},null,2));
