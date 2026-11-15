'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const Nav=require('../../AndroidProject/app/src/main/assets/phone-host/navigation.js'),{MAPS,DATA}=require('../../AndroidProject/app/src/main/assets/phone-host/server.js');
const assets=path.resolve(__dirname,'../../AndroidProject/app/src/main/assets');
const html=fs.readFileSync(path.join(assets,'www/index.html'),'utf8');
const srv=fs.readFileSync(path.join(assets,'phone-host/server.js'),'utf8');
test('all actual 18 maps build a finite navigation graph and spawn-to-spawn legal path',()=>{
 assert.equal(Object.keys(MAPS).length,DATA.maps.length,'server registry must include every shipped map exactly once');
 assert.ok(DATA.maps.length>=18,'current source must retain the established map set');
 for(const m of Object.values(MAPS)){
  const N=Nav.build(m),sx=m.spawn.x,sz=m.spawn.z,gx=(m.botSpawn.x0+m.botSpawn.x1)/2,gz=(m.botSpawn.z0+m.botSpawn.z1)/2;
  assert(N.nodes.length>100, m.id);let p=Nav.path(N,sx,0,sz,gx,0,gz,50000);
  assert(p && p.length>1,'missing spawn connection: '+m.id);
  for(const a of p) assert(Number.isFinite(a[0]+a[1]+a[2]),m.id);
 }
});
test('staged jump clears a genuine 1.1m riser; descending never injects upward velocity',()=>{
 let b={y:0,vy:0};assert.equal(Nav.stepVertical(b,1.1,true),0);assert.equal(b.vy,7.4);
 const dt=.05;let waited=0;
 for(let i=0;i<15;i++){b.vy-=22*dt;b.y+=b.vy*dt;const go=Nav.stepVertical(b,1.1,false);if(!go) waited++; if(go){assert(b.y>=.78,'risers must clear the actual .35m solid ceiling allowance');break;}}
 assert(waited>0,'must not walk into wall immediately');
 let drop={y:2.2,vy:0};assert.equal(Nav.stepVertical(drop,0,true),1);assert.equal(drop.vy,0);
});
test('flow routing never invents shortcuts to unreachable targets',()=>{
 const N={x0:0,z0:0,w:3,h:1,nodes:[{x:.5,y:0,z:.5},{x:1.5,y:0,z:.5},{x:2.5,y:0,z:.5}],columns:[[0],[1],[2]],edges:[[],[],[]],dist:new Float64Array([Infinity,Infinity,0])};
 assert.equal(Nav.next(N,.5,0,.5),null);assert.equal(Nav.next(N,1.5,0,.5),null);
});
test('stuck-recovery waypoint avoids the blocked first choice but only uses graph edges',()=>{
 const nodes=[{x:.5,y:0,z:.5},{x:1.5,y:0,z:.5},{x:.5,y:0,z:1.5}];
 const N={x0:0,z0:0,w:2,h:2,nodes,columns:[[0],[1],[2],[]],edges:[[[1,1],[2,1]],[],[]],dist:new Float64Array([5,3,4])};
 assert.deepEqual(Nav.next(N,.5,0,.5),[1.5,.5,0]);
 assert.deepEqual(Nav.next(N,.5,0,.5,[1.5,.5]),[.5,1.5,0]);
});
test('offline outbreak routing, LAN outbreak jumps, and LAN Infection staged climbs use legal navigation paths',()=>{
 assert.match(html,/SightlineNav\.stepVertical\(u,np\[2\],grounded\)/);
 // LAN Infection uses the shared staged-climb helper. LAN Outbreak follows
 // graph waypoints and asks gravity to clear only a bounded 0.35–1.1 m rise.
 assert.match(srv,/if\(!Nav\.stepVertical\(b,ty,grounded\)\)return false;/);
 assert.match(srv,/if \(node\[2\] > z\.y \+ 0\.35 && node\[2\] <= z\.y \+ 1\.1 && !z\.vy\) z\.vy = 7\.4;/);
 assert.match(srv,/Nav\.path\(N, z\.x, z\.y, z\.z, goal\.x, goal\.y \|\| 0, goal\.z, BOT_PATH_MAX_VISITS, BOT_PATH_WORK_BUDGET\)/);
 assert.match(srv,/Hunt\.goal\(h, zombieHuntNav, z, t\)/);
 // Recovery is mode-specific: Outbreak invalidates stuck hunt routes, offline
 // play calls the same planner, and Infection bots discard their stuck path.
 assert.match(srv,/Hunt\.progress\(h, z\.x, z\.z, t, spd > 0 && \(mvx !== 0 \|\| mvz !== 0\)\)/);
 assert.match(html,/SightlineZombieHunt\.progress\(h, u\.x, u\.z, performance\.now\(\), spd > 0 && \(mvx !== 0 \|\| mvz !== 0\)\)/);
 assert.match(srv,/A\.stuckT >= 1\.2/);assert.match(srv,/A\.path = null; A\.wp = null/);
 assert.match(srv,/if \(!z\.route \|\| !z\.route\.length\) return null;/);
 assert.doesNotMatch(srv,/else \{ mvx = dx \/ dist; mvz = dz \/ dist; \} \}/);
});

test('physics-stepped zombie climbs two real solid tiers and safely descends without teleportation',()=>{
 const m={area:{x0:-5,x1:7,z0:-4,z1:5},boxes:[[0,3,-2,2,1.1,0],[3,6,-2,2,2.2,0]]},N=Nav.build(m),dt=.05;
 function journey(start,goal){
   let u={...start,vy:0},jumps=0,drops=0,maxMove=0;
   Nav.field(N,[goal]);
   let success=false;
   for(let i=0;i<240;i++){
     const next=Nav.next(N,u.x,u.y,u.z);
     if(next){
       const grounded=Math.abs(u.vy)<.001;
       const oldVy=u.vy,go=Nav.stepVertical(u,next[2],grounded);
       if(oldVy===0 && u.vy>0)jumps++;
       const dx=next[0]-u.x,dz=next[1]-u.z,len=Math.hypot(dx,dz)||1;
       const xx=u.x+dx/len*2.3*dt*go,zz=u.z+dz/len*2.3*dt*go;
       maxMove=Math.max(maxMove,Math.hypot(xx-u.x,zz-u.z));
       if(!Nav.blocked(m.boxes,xx,u.y,zz,.4)){u.x=xx;u.z=zz;}
     }
     const oldY=u.y;u.vy-=22*dt;u.y+=u.vy*dt;
     if(u.y<oldY-.001)drops++;
     let floor=0;for(const b of m.boxes){const dx=u.x-Math.max(b[0],Math.min(u.x,b[1])),dz=u.z-Math.max(b[2],Math.min(u.z,b[3]));if(dx*dx+dz*dz<.46**2 && b[4]<=u.y+.35)floor=Math.max(floor,b[4]);}
     if(u.y<=floor){u.y=floor;u.vy=0;}
     if(Math.hypot(u.x-goal.x,u.z-goal.z)<.8 && Math.abs(u.y-goal.y)<.11){success=true;break;}
   }
   assert(success,'must arrive at destination on the intended deck: '+JSON.stringify(u));
   assert(maxMove<.13,'horizontal traversal speed must remain physically bounded');
   return{jumps,drops};
 }
 const asc=journey({x:-1.5,y:0,z:.5},{x:4.5,y:2.2,z:.5});
 assert(asc.jumps>=2,'two raised tiers demand two separate jumps');
 const desc=journey({x:4.5,y:2.2,z:.5},{x:-1.5,y:0,z:.5});
 assert(desc.drops>0,'descending requires real gravity integration');
});
