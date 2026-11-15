'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {MAPS,DATA,_t}=require('../AndroidProject/app/src/main/assets/phone-host/server.js');

function slowWallDist(m,ox,oy,oz,dx,dy,dz,maxT){
  let best=maxT;const B=m.boxes;
  for(let i=0;i<B.length;i++){
    const b=B[i],bottom=b[5]||0;let t0=0,t1=best,a,c,s;
    const ex=Math.abs(dx)<1e-9,ey=Math.abs(dy)<1e-9,ez=Math.abs(dz)<1e-9,ix=ex?0:1/dx,iy=ey?0:1/dy,iz=ez?0:1/dz;
    if(ex){if(ox<b[0]||ox>b[1])continue;}else{a=(b[0]-ox)*ix;c=(b[1]-ox)*ix;if(a>c){s=a;a=c;c=s;}if(a>t0)t0=a;if(c<t1)t1=c;if(t0>t1)continue;}
    if(ez){if(oz<b[2]||oz>b[3])continue;}else{a=(b[2]-oz)*iz;c=(b[3]-oz)*iz;if(a>c){s=a;a=c;c=s;}if(a>t0)t0=a;if(c<t1)t1=c;if(t0>t1)continue;}
    if(ey){if(oy<bottom||oy>b[4])continue;}else{a=(bottom-oy)*iy;c=(b[4]-oy)*iy;if(a>c){s=a;a=c;c=s;}if(a>t0)t0=a;if(c<t1)t1=c;if(t0>t1)continue;}
    if(t0<best)best=t0;
  }
  return best;
}
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};}

test('cached wall-ray BVH returns the exact full-scan distance on every map',()=>{
  let cases=0;
  for(const spec of DATA.maps){
    const m=MAPS[spec.id],random=rng(0x51A7+spec.id.length*97);
    assert.ok(m&&Array.isArray(m.boxes),`map geometry exists: ${spec.id}`);
    const rays=[];
    for(let i=0;i<400;i++){
      const ox=m.area.x0-8+random()*(m.area.x1-m.area.x0+16),oz=m.area.z0-8+random()*(m.area.z1-m.area.z0+16),oy=-1+random()*12;
      let dx=random()*2-1,dy=random()*2-1,dz=random()*2-1,L=Math.hypot(dx,dy,dz)||1;dx/=L;dy/=L;dz/=L;
      rays.push([ox,oy,oz,dx,dy,dz,1+random()*150]);
    }
    for(const b of m.boxes){
      const x=(b[0]+b[1])*.5,z=(b[2]+b[3])*.5,y=((b[5]||0)+b[4])*.5;
      rays.push([b[0]-2,y,z,1,0,0,12],[b[1]+2,y,z,-1,0,0,12],[x,y,b[2]-2,0,0,1,12],[x,y,b[3]+2,0,0,-1,12]);
      rays.push([b[0],y-2,z,0,1,0,12],[b[0],y+2,z,0,-1,0,12]);
    }
    for(const r of rays){
      const expected=slowWallDist(m,...r),actual=_t.wallDist(m,...r);
      assert.ok(Math.abs(actual-expected)<=1e-9,`${spec.id} ray ${JSON.stringify(r)}: indexed=${actual}, full=${expected}`);
      cases++;
    }
  }
  assert.ok(cases>10000,`broad deterministic ray coverage: ${cases}`);
});

test('static map bounds and start-inside ray behavior match the legacy slab rule',()=>{
  const m=MAPS.courtyard,box=m.boxes[0];
  for(const r of [
    [box[0],(box[4]+(box[5]||0))*.5,(box[2]+box[3])*.5,1,0,0,100],
    [box[0]-100,0,box[2]-100,1,0,0,10],
    [0,2,0,0,1,0,1],
    [0,2,0,0,-1,0,1]
  ])assert.equal(_t.wallDist(m,...r),slowWallDist(m,...r));
});
