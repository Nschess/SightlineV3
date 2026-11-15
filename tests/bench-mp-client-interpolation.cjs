'use strict';
// Executes the actual phone-host mpSnapshot/mpPuppetStep functions with real
// SightlinePoses transforms and lightweight scene nodes. This isolates client
// packet/interpolation CPU from Chromium/WebGL/GPU time; it is not a browser FPS
// or visual acceptance test.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
const hostAssets=path.join(root,'AndroidProject/app/src/main/assets/phone-host');
const sourcePath=path.resolve(process.env.SIGHTLINE_CLIENT_BENCH_HTML||path.join(hostAssets,'index.html'));
const html=fs.readFileSync(sourcePath,'utf8');
const queueStart=html.indexOf('function mpQueueRemotePose(');
const start=queueStart>=0?queueStart:html.indexOf('function mpSnapshot(m) {');
const end=html.indexOf('function mpEnsureZombie(',start);
if(start<0||end<0)throw new Error('Could not locate actual client snapshot/interpolation functions');
const posePath=path.join(hostAssets,'character-poses.js');
const SightlinePoses=require(posePath);
const makeAxis=()=>({x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}});
const makePuppet=(id)=>({
  id,netBot:true,bot:true,zombie:true,team:id%2,opIndex:0,skin:0,name:'bench-'+id,finishes:{},infected:false,
  x:id*.2,y:0,z:id*.1,yaw:0,pitch:0,alive:true,wasAlive:true,fall:0,gone:0,phase:0,
  cr:0,pr:0,buf:[],flashT:0,hurtT:0,flash:{visible:false},
  op:{w:1,h:1},legs:{position:makeAxis(),rotation:{x:0}},legR:{position:makeAxis(),rotation:{x:0}},
  body:{position:makeAxis(),rotation:{x:0}},
  g:{parent:{},visible:true,position:makeAxis(),rotation:{x:0,y:0,z:0},scale:{set(x,y,z){this.x=x;this.y=y;this.z=z;}}},
  worldKey:'rook117',worldGun:{visible:true,position:makeAxis(),rotation:{x:0,y:0,z:0}}
});
function pct(values,p){const a=values.slice().sort((x,y)=>x-y);return a.length?+a[Math.min(a.length-1,Math.floor((a.length-1)*p))].toFixed(4):null;}
function bench(count){
  let simNow=1000;
  const actors=Array.from({length:count},(_,i)=>makePuppet(i+1));
  const MP={on:true,id:0,mode:'versus',net:{last:0,gapMax:0,ema:20,jit:0,rn:0},snapN:0,puppets:Object.fromEntries(actors.map(u=>[u.id,u])),zombies:{},weapons:['rook117'],dirty:false,lobby:null,infStatus:null};
  const ctx={MP,Math,Number,Array,JSON,performance:{now:()=>simNow},SightlinePoses,scene:{add(){}},hurtGlow(){},
    showMsg(){},sfxTone(){},renderInfectionStatus(){},
    ensureWorldWeapon(){},mpApplyWorldFinish(){},worldWeaponUsesModelGrip(){return false;},poseWorldArms(){},
    WORLD_RIGHT_GRIP:{x:0,y:1.3,z:-.4},WORLD_WEAPON_PRESENTATION:{rook117:{root:[0,1.3,0]}},WEAPONS:{rook117:{}}};
  vm.runInNewContext(html.slice(start,end)+'\nthis.__snapshot=mpSnapshot;this.__step=mpPuppetStep;',ctx,{timeout:10000});
  const row=(u,t)=>[u.id,u.id*.2+2*(t/1000),0,u.id*.1+1.2*(t/1000),.12,0,0,0,0,1,0,0];
  const packetTimes=[],frameTimes=[],frameSteps=[];
  let nextSnap=simNow,frameIndex=0,lastSnap=simNow-20;
  for(let i=0;i<3;i++){const t=lastSnap-40+i*20;for(const u of actors)u.buf.push({t,x:row(u,t)[1],y:0,z:row(u,t)[3],yaw:.12,pitch:0,cr:0,pr:0,al:true,rl:0});}
  const frames=1800,dt=1/60;
  for(let f=0;f<frames;f++){
    simNow+=1000/60;
    if(simNow>=nextSnap){
      const m={a:actors.map(u=>row(u,simNow)),z:[]};
      const wire=JSON.stringify(m),parseAt=performance.now();
      const parsed=JSON.parse(wire);ctx.__snapshot(parsed);packetTimes.push(performance.now()-parseAt);
      lastSnap=simNow;nextSnap+=20;
      if(nextSnap<simNow-20)nextSnap=simNow+20;
    }
    const rt=simNow-20,started=performance.now();
    for(const u of actors)ctx.__step(u,dt,rt);
    const cost=performance.now()-started;
    if(f>=60){frameTimes.push(cost);frameSteps.push(count);}
  }
  return {remoteBots:count,snapshotHz:50,renderSimulationHz:60,sampledFrames:frameTimes.length,clientInterpolationMsPerRenderedFrame:{p50:pct(frameTimes,.5),p95:pct(frameTimes,.95),p99:pct(frameTimes,.99),max:+Math.max(...frameTimes).toFixed(4)},snapshotParseAndBufferMs:{p50:pct(packetTimes,.5),p95:pct(packetTimes,.95),p99:pct(packetTimes,.99),max:+Math.max(...packetTimes).toFixed(4)},snapshotMessages:packetTimes.length,botsMoved:actors.filter(u=>u.x>u.id*.2+.2).length,maxBufferDepth:Math.max(...actors.map(u=>u.buf.length)),allRenderTransformsMatch:actors.every(u=>Math.abs(u.g.position.x-u.x)<1e-9&&Math.abs(u.g.position.z-u.z)<1e-9),measurementScope:'actual mpSnapshot/mpPuppetStep + actual SightlinePoses, stubs for Three.js nodes/world-arm geometry; excludes browser event delivery, mpUpdate extras, DOM, GPU, WebGL submission, and physical display'};
}
const results=[16,32,64].map(bench);
const result={test:'Sightline client snapshot/interpolation CPU microbenchmark',sourcePath,sourcePageSha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'),results,limits:['Node VM using actual client interpolation and pose functions; not a Chromium/WebGL or FPS measurement.']};
const out=path.resolve(process.argv[2]||path.join(root,'acceptance/mp-client-interpolation-cpu-2026-10-28.json'));
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,out},null,2));
