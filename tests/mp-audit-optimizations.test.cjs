'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Hunt = require('../AndroidProject/app/src/main/assets/phone-host/zombie-hunt.js');
const Server = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const Nav = require('../AndroidProject/app/src/main/assets/phone-host/navigation.js');
const DATA = require('../AndroidProject/app/src/main/assets/phone-host/data.json');
const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'AndroidProject/app/src/main/assets');

function legacyNearest(origin, primary, others, limit) {
  const rows = [];
  if (primary && primary.alive) rows.push(primary);
  for (const p of others) if (p.alive) rows.push(p);
  rows.sort((a, b) => Math.hypot(a.x-origin.x,a.z-origin.z)-Math.hypot(b.x-origin.x,b.z-origin.z));
  return rows.slice(0, limit);
}

function legacyServerNearest(z, humans) {
  const rows=[];
  for (const p of humans) {
    const dx=p.x-z.x,dz=p.z-z.z,d2=dx*dx+dz*dz;
    if(d2<44*44&&Math.abs(p.y-z.y)<5)rows.push({p,dx,dz,d2});
  }
  rows.sort((a,b)=>a.d2-b.d2);
  return rows.slice(0,5);
}

function legacyHeap() {
  const a=[];
  return {get length(){return a.length;},push(id,cost){let k=a.length;a.push([id,cost]);while(k){const p=(k-1)>>1;if(a[p][1]<=cost)break;a[k]=a[p];k=p;}a[k]=[id,cost];},pop(){const top=a[0],last=a.pop();if(a.length){let k=0;while(k*2+1<a.length){let c=k*2+1;if(c+1<a.length&&a[c+1][1]<a[c][1])c++;if(a[c][1]>=last[1])break;a[k]=a[c];k=c;}a[k]=last;}return top;}};
}

function legacyField(nav, targets) {
  const dist=new Float64Array(nav.nodes.length);dist.fill(Infinity);
  const ground=new Float64Array(nav.w*nav.h);ground.fill(Infinity);
  const q=legacyHeap();
  for(const target of targets){const id=Nav.nearest(nav,target.x,target.y||0,target.z);if(id>=0&&dist[id]!==0){dist[id]=0;q.push(id,0);}}
  while(q.length){const [id,cost]=q.pop();if(cost>dist[id]+1e-4)continue;const node=nav.nodes[id];if(node.y<.3&&Number.isFinite(cost)&&cost<ground[node.k])ground[node.k]=cost;for(const [to,edge] of nav.reverse[id])if(cost+edge<dist[to]){dist[to]=cost+edge;q.push(to,cost+edge);}}
  return {dist,ground};
}

test('client Outbreak target scan preserves stable nearest-five choices and reuses buffers', () => {
  assert.equal(typeof Hunt.nearestTargets,'function');
  const origin={x:0,z:0},primary={alive:true,x:5,z:0},others=[
    {alive:true,x:-5,z:0},{alive:true,x:0,z:5},{alive:true,x:0,z:-5},
    {alive:false,x:.01,z:.01},{alive:true,x:1,z:1},{alive:true,x:1,z:1}
  ];
  const targets=[],distances=[];
  const got=Hunt.nearestTargets(origin,primary,others,5,targets,distances);
  assert.equal(got,targets);
  assert.deepEqual(got,legacyNearest(origin,primary,others,5));
  assert.deepEqual(distances,got.map(p=>Math.hypot(p.x,p.z)));
  const targetRef=targets,distRef=distances,recordRefs=targets.slice();
  for(let i=0;i<got.length;i++)assert.equal(targets[i],recordRefs[i]);
  primary.alive=false;for(const p of others)p.alive=false;
  assert.equal(Hunt.nearestTargets(origin,primary,others,5,targets,distances),targetRef);
  assert.equal(targets.length,0);assert.equal(distances.length,0);assert.equal(distances,distRef);
});

test('server Outbreak perception selector keeps nearest anchors, stable-ID probes, and reusable scratch records', () => {
  let seed=0x51617;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/0x100000000);
  for(const size of [0,1,4,5,6,16,32])for(let run=0;run<60;run++){
    const z={x:random()*30-15,y:run%3?0:3.7,z:random()*30-15};
    const humans=Array.from({length:size},(_,id)=>({id,x:random()*110-55,y:run%9===0?z.y+5:random()*10-2,z:random()*110-55}));
    if(run%5===0&&humans.length>=2){humans[0].x=humans[1].x;humans[0].z=humans[1].z;}
    const scratch=[],expected=legacyServerNearest(z,humans),count=Server._t.nearestZombieTargets(z,humans,scratch);
    assert.deepEqual(scratch.slice(0,count).map(({p,dx,dz,d2})=>({id:p.id,dx,dz,d2})),expected.map(({p,dx,dz,d2})=>({id:p.id,dx,dz,d2})),`size=${size}, run=${run}`);
    const records=scratch.slice(0,count);Server._t.nearestZombieTargets(z,humans,scratch);
    for(let i=0;i<count;i++)assert.equal(scratch[i],records[i]);
  }
  const body=fs.readFileSync(path.join(ASSETS,'phone-host/server.js'),'utf8').split('function zombiePerceive(')[1].split('function zombieFollow(')[0];
  assert.match(body,/z\.perceptionScratch \|\| \(z\.perceptionScratch = \[\]\)/);
  assert.match(body,/nearestZombieTargets\(z, \[preferred\], nearby, 1\)/);
  assert.match(body,/nearestZombieTargets\(z, hs, nearby, 1\)/);
  assert.match(body,/appendZombiePerceptionProbes\(z, hs, nearby, nearbyCount, 5\)/);
  assert.match(body,/z\.perceptionCursor = firstProbe \? firstProbe\.p\.id : -1/);
  assert.match(body,/zombieTargetLoad\(p, z\) \* 8/);
  assert.match(body,/z\.tgt === p \? 5 : 0/);
  assert.doesNotMatch(body,/nearby\.sort|const nearby = \[\]/);
});

test('offline outbreak uses shared bounded scan while retaining LOS, team-load and target-retention scoring', () => {
  for(const platform of ['www','phone-host']){
    const page=fs.readFileSync(path.join(ASSETS,platform,'index.html'),'utf8');
    const start=page.indexOf('function stepOutbreakZombie('),end=page.indexOf('\nfunction stepZombie(',start);
    assert.ok(start>=0&&end>start,`${platform} Outbreak loop exists`);
    const body=page.slice(start,end);
    assert.match(body,/SightlineZombieHunt\.perceptionTargets\(u, P, mates, 5, candidates, candidateDistances, u\.huntCandidateCursor, 43, 5, u\.tgt\)/);
    assert.match(body,/outbreakTargetLoad\(a, u\) \* 8/);
    assert.match(body,/u\.tgt === a \? 5 : 0/);
    assert.match(body,/losClear\(/);
    assert.doesNotMatch(body,/candidates\.sort\(/);
  }
});

test('incremental flow fields preserve exact Dijkstra distances and bounded steps on every map', () => {
  for(const map of DATA.maps){
    const nav=Nav.build(map);
    const ground=nav.nodes.filter(n=>n.y<.3);
    const targets=[ground[0],ground[Math.floor(ground.length/3)],ground[Math.floor(ground.length*2/3)]]
      .filter(Boolean).map(n=>({x:n.x,y:n.y,z:n.z}));
    for(const count of [1,Math.min(8,targets.length),targets.length]){
      const subset=targets.slice(0,count),expected=legacyField(nav,subset);
      Nav.fieldStart(nav,subset);
      let steps=0;while(!Nav.fieldStep(nav,160)){if(++steps>100000)throw Error(`${map.id}: flow field did not finish`);}
      assert.ok(Buffer.from(nav.dist.buffer).equals(Buffer.from(expected.dist.buffer)),`${map.id} distances / ${count} targets`);
      assert.ok(Buffer.from(nav.groundDist.buffer).equals(Buffer.from(expected.ground.buffer)),`${map.id} ground distances / ${count} targets`);
    }
    assert.ok(nav.fieldDiagnostics.maxPops<=160,`${map.id} incremental pop cap preserved`);
  }
});

test('offline and phone-host shared gameplay modules and AI paths remain in parity; cadence is unchanged', () => {
  for(const name of ['navigation.js','zombie-hunt.js'])
    assert.deepEqual(fs.readFileSync(path.join(ASSETS,'www',name)),fs.readFileSync(path.join(ASSETS,'phone-host',name)),`${name} parity`);
  const pages=['www','phone-host'].map(name=>fs.readFileSync(path.join(ASSETS,name,'index.html'),'utf8'));
  function declaration(html,name){const start=html.indexOf(`function ${name}(`);assert.ok(start>=0,`${name} is present`);const end=html.indexOf('\nfunction ',start+1);return html.slice(start,end<0?html.length:end).trim();}
  for(const name of ['localSquadNode','infectionSoloTick','runOfflineBots','updateBots','stepZombie'])
    assert.equal(declaration(pages[0],name),declaration(pages[1],name),`${name} shared gameplay parity`);
  assert.match(pages[0],/startSoloFFA\(\)/,'offline page wires its solo FFA lifecycle');
  assert.match(pages[0],/startSoloBombRound\(\)/,'offline page wires its solo Bomb lifecycle');
  assert.match(pages[1],/data-v="ffa"/,'phone-host page exposes the LAN FFA mode');
  assert.match(pages[1],/data-v="bomb"/,'phone-host page exposes the LAN Bomb mode');
  const server=fs.readFileSync(path.join(ASSETS,'phone-host/server.js'),'utf8');
  assert.match(server,/opt\('tick-ms', 20, 10, 50\)/);
  assert.match(server,/opt\('snapshot-every', 1, 1, 5\)/);
  assert.equal(Server._t.tickMs,20);
  assert.equal(Server._t.snapshotEveryNow(),1);
});
