'use strict';
const { performance } = require('node:perf_hooks');
const { DATA, MAPS, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

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
function percentile(a,p){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor((s.length-1)*p))];}

const raysPerMap=Math.max(250,Number(process.argv[2]||1200));
const rounds=Math.max(3,Number(process.argv[3]||5));
const report={test:'production wall-ray query (small-map linear fallback / large-map BVH) versus legacy linear scan',raysPerMap,rounds,bind:'none',claims:'microbenchmark only; no gameplay or hardware-FPS claim',maps:[]};
for(const spec of DATA.maps){
  const m=MAPS[spec.id],random=rng(0xB17F+spec.id.length*7919),rays=[];
  for(let i=0;i<raysPerMap;i++){
    const ox=m.area.x0-8+random()*(m.area.x1-m.area.x0+16),oz=m.area.z0-8+random()*(m.area.z1-m.area.z0+16),oy=-1+random()*12;
    let dx=random()*2-1,dy=random()*2-1,dz=random()*2-1,L=Math.hypot(dx,dy,dz)||1;dx/=L;dy/=L;dz/=L;
    rays.push([ox,oy,oz,dx,dy,dz,1+random()*150]);
  }
  for(const r of rays.slice(0,Math.min(80,rays.length)))_t.wallDist(m,...r);
  const slow=[],fast=[];let exact=true;
  for(let round=0;round<rounds;round++){
    const firstFast=round%2===0;
    for(let pass=0;pass<2;pass++){
      const isFast=(pass===0)===firstFast,start=performance.now();
      if(isFast){for(const r of rays)_t.wallDist(m,...r);fast.push((performance.now()-start)*1000/rays.length);}
      else {for(const r of rays)slowWallDist(m,...r);slow.push((performance.now()-start)*1000/rays.length);}
    }
  }
  for(const r of rays){if(Math.abs(_t.wallDist(m,...r)-slowWallDist(m,...r))>1e-9){exact=false;break;}}
  report.maps.push({id:spec.id,boxes:m.boxes.length,rays:rays.length,exact,legacyMeanUs:+(slow.reduce((a,b)=>a+b,0)/slow.length).toFixed(3),productionMeanUs:+(fast.reduce((a,b)=>a+b,0)/fast.length).toFixed(3),legacyMedianUs:+percentile(slow,.5).toFixed(3),productionMedianUs:+percentile(fast,.5).toFixed(3),medianSpeedup:+(percentile(slow,.5)/Math.max(.001,percentile(fast,.5))).toFixed(2)});
}
const averages=report.maps.map(x=>x.medianSpeedup).sort((a,b)=>a-b);
report.summary={mapCount:report.maps.length,allExact:report.maps.every(x=>x.exact),medianMapSpeedup:averages[Math.floor(averages.length/2)],weightedLegacyUs:+(report.maps.reduce((a,x)=>a+x.legacyMedianUs*x.rays,0)/report.maps.reduce((a,x)=>a+x.rays,0)).toFixed(3),weightedProductionUs:+(report.maps.reduce((a,x)=>a+x.productionMedianUs*x.rays,0)/report.maps.reduce((a,x)=>a+x.rays,0)).toFixed(3),totalRays:report.maps.reduce((a,x)=>a+x.rays,0)};
console.log(JSON.stringify(report,null,2));
if(!report.summary.allExact)process.exitCode=1;
