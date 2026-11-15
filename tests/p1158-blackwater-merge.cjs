'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets');
const read = p => fs.readFileSync(p, 'utf8');
const data = JSON.parse(read(path.join(assets, 'phone-host/data.json')));
assert.equal(data.maps.length, 18, 'updated game should contain 18 maps');
assert.equal(new Set(data.maps.map(m => m.id)).size, 18, 'map ids should be unique');
const map = data.maps.find(m => m.id === 'blackwater_old_quarter');
assert.ok(map, 'server must expose Blackwater Old Quarter');
assert.equal(map.boxes.length, 562, 'server collision boxes should match the verified Blackwater source');
assert.equal(map.qaRoutes.length, 53);
assert.equal(map.qaStairs.length, 14);

// The standalone source used for the integration must generate the exact authoritative map boxes.
const mapContext = { MAPS: [], O(x,z,w,d,h,k,bottom) { const o={x,z,w,d,h,k}; if(bottom)o.bottom=bottom; return o; } };
vm.runInNewContext(read(path.join(root, 'BLACKWATER_MAP_SOURCE.js')), mapContext, { filename: 'BLACKWATER_MAP_SOURCE.js' });
const authored = mapContext.MAPS[0];
assert.equal(authored.id, map.id);
const area = map.area, cx=(area.x0+area.x1)/2, cz=(area.z0+area.z1)/2, w=area.x1-area.x0, d=area.z1-area.z0;
const border=[[-w/2-1,w/2+1,area.z0-1,area.z0,6],[-w/2-1,w/2+1,area.z1,area.z1+1,6],[area.x0-1,area.x0,cz-d/2-1,cz+d/2+1,6],[area.x1,area.x1+1,cz-d/2-1,cz+d/2+1,6]];
const boxFromObstacle=o=>[o.x-o.w/2,o.x+o.w/2,o.z-o.d/2,o.z+o.d/2,o.h,o.bottom||0];
const generated=[...border,...authored.obst.map(boxFromObstacle)];
assert.equal(generated.length, map.boxes.length, 'client and server box counts should match');
for(let i=0;i<generated.length;i++)for(let j=0;j<6;j++)assert.ok(Math.abs((generated[i][j]||0)-(map.boxes[i][j]||0))<1e-8, `geometry mismatch at box ${i}, field ${j}`);

// Validate JS syntax and verify both browser shells retain the P1157 smoothness controls.
for(const rel of ['www/index.html','phone-host/index.html']){
  const html=read(path.join(assets,rel));
  assert.equal((html.match(/MAPS\.push\(makeBlackwaterOldQuarter\(\)\)/g)||[]).length,1,`${rel}: Blackwater should be registered exactly once`);
  assert.ok(html.includes('Smooth + clear · 60 FPS'),`${rel}: P1157 graphics preset missing`);
  assert.ok(html.includes('var PERF_SCALE = [1, 0.97, 0.94, 0.90]'),`${rel}: P1157 sharpness settings missing`);
  const blocks=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/(?:^|\s)src\s*=/.test(m[1]));
  assert.ok(blocks.length>0,`${rel}: no inline scripts found`);
  blocks.forEach((m,i)=>new vm.Script(m[2],{filename:`${rel} inline script ${i+1}`}));
}

// Compare exact graph nodes and edges with the unindexed reference builder in both runtimes.
const boxes=map.boxes;
function signature(N){return JSON.stringify({nodes:N.nodes,edges:N.edges,columns:N.columns});}
for(const rel of ['www/navigation.js','phone-host/navigation.js']){
  const Nav=require(path.join(assets,rel));
  const base=Nav.build({area:map.area,boxes,optimized:false});
  const fast=Nav.build({area:map.area,boxes,optimized:true});
  assert.equal(signature(fast),signature(base),`${rel}: optimized map graph must match reference`);
  for(const r of map.qaRoutes){
    const from=Nav.path(fast,map.spawn.x,0,map.spawn.z,r.x,r.y||0,r.z);
    const fromBot=Nav.path(fast,(map.botSpawn.x0+map.botSpawn.x1)/2,0,(map.botSpawn.z0+map.botSpawn.z1)/2,r.x,r.y||0,r.z);
    assert.ok(from,`${rel}: survivor route missing to ${r.name}`);
    assert.ok(fromBot,`${rel}: infected route missing to ${r.name}`);
  }
}

// Reproduce the map-only 16+ player spawn spread against the server collision boxes.
const posts=[[-15,50],[1,53],[16,50]];
let state=0x5a17c0de;
function rand(){state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;}
let placements=0,minSeparation=Infinity;
for(let round=0;round<60;round++){
  const taken=[];
  for(let i=0;i<32;i++){
    const post=posts[taken.length%posts.length],x0=post[0]-4.5,x1=post[0]+4.5,z0=post[1]-4,z1=post[1]+4;
    let sep=1.6,point=null;
    for(let t=0;t<400;t++){
      if(t===120)sep=1.1;if(t===260)sep=.7;
      const x=Math.max(map.area.x0+1.5,Math.min(map.area.x1-1.5,x0+rand()*(x1-x0)));
      const z=Math.max(map.area.z0+1.5,Math.min(map.area.z1-1.5,z0+rand()*(z1-z0)));
      if(boxes.some(b=>x>b[0]-.45&&x<b[1]+.45&&z>b[2]-.45&&z<b[3]+.45))continue;
      if(taken.some(q=>Math.hypot(q.x-x,q.z-z)<sep))continue;
      point={x,z};break;
    }
    assert.ok(point,`spawn placement failed in simulated round ${round+1}, player ${i+1}`);
    assert.ok(!boxes.some(b=>point.x>b[0]-.45&&point.x<b[1]+.45&&point.z>b[2]-.45&&point.z<b[3]+.45),'spawn overlaps map geometry');
    for(const q of taken)minSeparation=Math.min(minSeparation,Math.hypot(q.x-point.x,q.z-point.z));
    taken.push(point);placements++;
  }
}
assert.equal(placements,1920);
assert.ok(minSeparation>=.7-1e-9,`spawn separation below fallback threshold: ${minSeparation}`);

// Keep the Android host's source integrity manifest in sync with the merged playable assets.
const sumsFile=path.join(assets,'phone-host/SHA256SUMS');
for(const line of read(sumsFile).trim().split(/\r?\n/)){
  const [,digest,rel]=line.match(/^([a-f0-9]{64})  (.+)$/)||[];
  assert.ok(digest&&rel,`malformed SHA256SUMS entry: ${line}`);
  const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(path.dirname(sumsFile),rel))).digest('hex');
  assert.equal(actual,digest,`SHA256SUMS mismatch: ${rel}`);
}
console.log(JSON.stringify({ok:true,maps:data.maps.length,blackwaterCollisionBoxes:map.boxes.length,blackwaterRoutes:map.qaRoutes.length,blackwaterStairs:map.qaStairs.length,spawnPlacements:placements,minSpawnSeparationMeters:+minSeparation.toFixed(3),browserShells:2,navRuntimes:2,serverAssetsHashed:read(sumsFile).trim().split(/\r?\n/).length},null,2));
