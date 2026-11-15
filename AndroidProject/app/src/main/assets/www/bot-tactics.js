/* Shared Sightline bot tactics. Geometry only; no omniscient player lookup.
   Same lightweight cover, lane and pincer decisions in offline and LAN games. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SightlineTactics=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const searchDiagnostics={invalidQueries:0,missingColumns:0,yieldedQueries:0,last:null};
const RAY_CELL=4,RAY_INDEX_MIN_BOXES=48,rayIndexes=new WeakMap();
function recordSearchDiagnostic(kind,N,wish,origin,index,source){
  searchDiagnostics[kind]++;
  searchDiagnostics.last={kind,source:source||null,index:Number.isFinite(index)?index:null,wish:wish?[wish.x,wish.y,wish.z]:null,origin:origin?[origin.x,origin.y,origin.z]:null,grid:N?{x0:N.x0,z0:N.z0,w:N.w,h:N.h,columns:Array.isArray(N.columns)?N.columns.length:null}:null};
}
function occupiedIndex(points,minSep){
  // Below a full-squad-sized reservation list, the direct scan is cheaper.
  if(points.length<48||!(minSep>0)||!Number.isFinite(minSep))return null;
  const buckets=new Map();
  for(const p of points){
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z))continue;
    const x=Math.floor(p.x/minSep),z=Math.floor(p.z/minSep),key=x+','+z;
    let bucket=buckets.get(key);if(!bucket){bucket=[];buckets.set(key,bucket);}bucket.push(p);
  }
  return buckets;
}
function occupiedNear(index,p,minSep){
  if(!index)return false;
  const x=Math.floor(p.x/minSep),z=Math.floor(p.z/minSep);
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    const bucket=index.get((x+dx)+','+(z+dz));if(!bucket)continue;
    for(const q of bucket)if(Math.abs((q.y||0)-p.y)<1.25&&Math.hypot(q.x-p.x,q.z-p.z)<minSep)return true;
  }
  return false;
}
function prepareRayIndex(boxes){
  if(!Array.isArray(boxes)||boxes.length<RAY_INDEX_MIN_BOXES)return false;
  if(rayIndexes.has(boxes))return true;
  const grid=new Map(),always=[];
  for(let id=0;id<boxes.length;id++){
    const q=boxes[id];if(!q||q.length<5||![q[0],q[1],q[2],q[3],q[4]].every(Number.isFinite))continue;
    const x0=Math.floor(q[0]/RAY_CELL),x1=Math.floor(q[1]/RAY_CELL),z0=Math.floor(q[2]/RAY_CELL),z1=Math.floor(q[3]/RAY_CELL);
    if(x1<x0||z1<z0)continue;
    // A few long boundary walls are cheaper to test once per query than to
    // duplicate into an excessive number of spatial bins.
    if((x1-x0+1)*(z1-z0+1)>256){always.push(id);continue;}
    for(let x=x0;x<=x1;x++){
      let column=grid.get(x);if(!column){column=new Map();grid.set(x,column);}
      for(let z=z0;z<=z1;z++){let ids=column.get(z);if(!ids){ids=[];column.set(z,ids);}ids.push(id);}
    }
  }
  rayIndexes.set(boxes,{grid,always,seen:new Uint32Array(boxes.length),serial:0});
  return true;
}
function rayIntersectsBox(q,ax,ay,az,dx,dy,dz){
  let lo=0,hi=1,min=q[0],max=q[1];
  if(Math.abs(dx)<1e-8){if(ax<=min||ax>=max)return false;}
  else{let x=(min-ax)/dx,y=(max-ax)/dx;if(x>y){const tmp=x;x=y;y=tmp;}if(x>lo)lo=x;if(y<hi)hi=y;if(lo>hi)return false;}
  min=q[5]||0;max=q[4];
  if(Math.abs(dy)<1e-8){if(ay<=min||ay>=max)return false;}
  else{let x=(min-ay)/dy,y=(max-ay)/dy;if(x>y){const tmp=x;x=y;y=tmp;}if(x>lo)lo=x;if(y<hi)hi=y;if(lo>hi)return false;}
  min=q[2];max=q[3];
  if(Math.abs(dz)<1e-8){if(az<=min||az>=max)return false;}
  else{let x=(min-az)/dz,y=(max-az)/dz;if(x>y){const tmp=x;x=y;y=tmp;}if(x>lo)lo=x;if(y<hi)hi=y;if(lo>hi)return false;}
  return hi>0.04&&lo<0.96;
}
function rayIdCovered(index,boxes,id,serial,ax,ay,az,dx,dy,dz){
  if(index.seen[id]===serial)return false;
  index.seen[id]=serial;
  return rayIntersectsBox(boxes[id],ax,ay,az,dx,dy,dz);
}
function rayCoveredLinear(boxes,ax,ay,az,bx,by,bz){
  const dx=bx-ax,dy=by-ay,dz=bz-az;
  for(const q of boxes)if(rayIntersectsBox(q,ax,ay,az,dx,dy,dz))return true;
  return false;
}
function rayCoveredXYZ(boxes,ax,ay,az,bx,by,bz){
  // Both endpoints are at eye/chest height; overhead decks do not masquerade as cover.
  const index=Array.isArray(boxes)?rayIndexes.get(boxes):null;
  if(!index)return rayCoveredLinear(boxes,ax,ay,az,bx,by,bz);
  let serial=(index.serial+1)>>>0;if(!serial){index.seen.fill(0);serial=1;}index.serial=serial;
  const dx=bx-ax,dy=by-ay,dz=bz-az,grid=index.grid;
  for(const id of index.always)if(rayIdCovered(index,boxes,id,serial,ax,ay,az,dx,dy,dz))return true;
  const x0=Math.floor(Math.min(ax,bx)/RAY_CELL),x1=Math.floor(Math.max(ax,bx)/RAY_CELL);
  const z0=Math.floor(Math.min(az,bz)/RAY_CELL),z1=Math.floor(Math.max(az,bz)/RAY_CELL);
  for(let x=x0;x<=x1;x++){
    const column=grid.get(x);if(!column)continue;
    for(let z=z0;z<=z1;z++){
      const ids=column.get(z);if(!ids)continue;
      for(let i=0;i<ids.length;i++)if(rayIdCovered(index,boxes,ids[i],serial,ax,ay,az,dx,dy,dz))return true;
    }
  }
  return false;
}
function rayCovered(boxes,a,b){return rayCoveredXYZ(boxes,a.x,a.y,a.z,b.x,b.y,b.z);}
function search(N,wish,origin,occupied,opts){
  if(!N||!wish||!origin)return null;
  opts=opts||{};
  const used=occupied||[], y=Number.isFinite(wish.y)?wish.y:(origin.y||0);
  if(!Array.isArray(N.columns)||!Array.isArray(N.nodes)||!Number.isInteger(N.w)||!Number.isInteger(N.h)||N.w<1||N.h<1||!Number.isFinite(N.x0)||!Number.isFinite(N.z0)||![wish.x,wish.z,origin.x,origin.z].every(Number.isFinite)){
    recordSearchDiagnostic('invalidQueries',N,wish,origin,undefined,opts.source);return null;
  }
  const ix=Math.floor(wish.x-N.x0),iz=Math.floor(wish.z-N.z0);
  const radius=opts.radius==null?9:opts.radius, minSep=opts.separation==null?3.4:opts.separation;
  // Tactical search checks candidate nodes against reserved squad posts.
  // Index them once instead of scanning the whole roster per nav candidate.
  const reserved=occupiedIndex(used,minSep);
  const maxCandidates=Number.isFinite(opts.maxCandidates)?Math.max(1,Math.floor(opts.maxCandidates)):Infinity;
  const maxMs=Number.isFinite(opts.maxMs)?Math.max(0,opts.maxMs):Infinity;
  const clock=typeof performance!=='undefined'&&typeof performance.now==='function'?()=>performance.now():()=>Date.now();
  const started=Number.isFinite(maxMs)?clock():0;
  let best=null,bscore=-Infinity,examined=0,cells=0,yielded=false;
  function visitCell(cx,cz){
    if(++cells%8===0&&Number.isFinite(maxMs)&&clock()-started>=maxMs){yielded=true;return false;}
    if(cx<0||cz<0||cx>=N.w||cz>=N.h)return true;
    const column=N.columns[cz*N.w+cx];
    if(!Array.isArray(column)){recordSearchDiagnostic('missingColumns',N,wish,origin,cz*N.w+cx,opts.source);return true;}
    for(const id of column){
      if(examined>=maxCandidates){yielded=true;return false;}examined++;
      if((examined&15)===0&&Number.isFinite(maxMs)&&clock()-started>=maxMs){yielded=true;return false;}
      if(N.reachable&&!N.reachable[id])continue;
      const p=N.nodes[id];if(Math.abs(p.y-y)>.18||!N.edges[id].length)continue;
      const dist=Math.hypot(p.x-origin.x,p.z-origin.z);
      if(opts.maxTravel&&dist>opts.maxTravel)continue;
      if(reserved?occupiedNear(reserved,p,minSep):(used.length&&used.some(u=>Math.abs((u.y||0)-p.y)<1.25&&Math.hypot(u.x-p.x,u.z-p.z)<minSep)))continue;
      const nearWish=Math.hypot(p.x-wish.x,p.z-wish.z);
      let score=-nearWish*2-dist*.05;
      if(opts.threat){
        const th=opts.threat,range=Math.hypot(p.x-th.x,p.z-th.z);
        if(opts.kind==='cover'){
          if(range<2.8||range>25)continue;
          const covered=rayCoveredXYZ(N.boxes,p.x,p.y+1.25,p.z,th.x,(th.y||0)+1.25,th.z);
          score+=(covered?18:-15)-Math.abs(range-9)*.17;
        }
        if(opts.kind==='hold')score+=(rayCoveredXYZ(N.boxes,p.x,p.y+1.25,p.z,th.x,(th.y||0)+1.25,th.z)?3:0);
      }
      if(score>bscore){bscore=score;best=p;}
    }
    return true;
  }
  // Visit cells center-out. If this tactical query reaches its small time or
  // candidate budget, the best-so-far position is local and useful instead
  // of being biased toward the far corner of a row-major scan.
  searchLoop:for(let ring=0;ring<=radius;ring++){
    if(!ring){if(!visitCell(ix,iz))break;continue;}
    for(let dx=-ring;dx<=ring;dx++){
      if(!visitCell(ix+dx,iz-ring)||!visitCell(ix+dx,iz+ring))break searchLoop;
    }
    for(let dz=-ring+1;dz<ring;dz++){
      if(!visitCell(ix-ring,iz+dz)||!visitCell(ix+ring,iz+dz))break searchLoop;
    }
  }
  if(yielded)searchDiagnostics.yieldedQueries++;
  if(opts.kind==='cover'&&bscore<0)return null;
  return best?{x:best.x,y:best.y,z:best.z}:null;
}
function patrol(N,origin,slot,team,occupied,phase,total,cycle){
  if(!N||!N.nodes.length)return null;
  if(phase==='infection'){
    const cols=Math.max(1,Math.ceil(Math.sqrt(Math.max(1,total||1)))),rows=Math.max(1,Math.ceil(Math.max(1,total||1)/cols));
    const turn=Math.max(0,cycle|0),col=(Math.max(0,slot|0)%cols+turn)%cols,row=(Math.floor(Math.max(0,slot|0)/cols)+Math.floor(turn/cols))%rows;
    const x=clamp(N.x0+N.w*(.08+(col+.5)*.84/cols),N.x0+2,N.x0+N.w-2);
    const z=clamp(N.z0+N.h*(.08+(row+.5)*.84/rows),N.z0+2,N.z0+N.h-2);
    return search(N,{x,y:origin.y||0,z},origin,occupied,{radius:12,separation:4.2,maxCandidates:400,maxMs:2})||
      search(N,{x:origin.x+(col-(cols-1)/2)*5,y:origin.y||0,z:origin.z+(row-(rows-1)/2)*5},origin,occupied,{radius:10,separation:2.8,maxCandidates:260,maxMs:1});
  }
  const side=team===0?-1:1, lane=slot%3-1, depth=Math.floor(slot/3)%4;
  const w=N.w,h=N.h,centerX=N.x0+w/2,centerZ=N.z0+h/2;
  const progress=phase==='defend'?.55:phase==='hunt'?.1:.24;
  const x=clamp(centerX+lane*w*.23+((Math.floor(slot/12)%3)-1)*4,N.x0+2,N.x0+w-2);
  const z=clamp(centerZ+side*h*(progress+(depth-1.5)*.065),N.z0+2,N.z0+h-2);
  return search(N,{x,y:origin.y||0,z},origin,occupied,{radius:13,separation:4.5,maxCandidates:420,maxMs:2}) ||
         search(N,{x:origin.x+lane*6,y:origin.y||0,z:origin.z+side*8},origin,occupied,{radius:9,separation:3.1,maxCandidates:260,maxMs:1});
}
function cover(N,self,threat,occupied){
  if(!threat)return null;
  const dx=self.x-threat.x,dz=self.z-threat.z,len=Math.hypot(dx,dz)||1;
  return search(N,{x:self.x+dx/len*4,y:self.y||0,z:self.z+dz/len*4},self,occupied,
    {kind:'cover',threat,radius:6,maxTravel:10,separation:2.1,source:'cover',maxCandidates:220,maxMs:1.25});
}
function retreat(N,self,threat,occupied){
  if(!N||!self||!threat)return null;
  const dx=self.x-threat.x,dz=self.z-threat.z,len=Math.hypot(dx,dz)||1;
  const wish={x:self.x+dx/len*9,y:self.y||0,z:self.z+dz/len*9};
  return search(N,wish,self,occupied,{kind:'cover',threat,radius:9,maxTravel:18,separation:2.2,source:'retreat-cover',maxCandidates:300,maxMs:1.5})||
    search(N,wish,self,occupied,{radius:10,maxTravel:18,separation:2.2,source:'retreat-open',maxCandidates:260,maxMs:1});
}
function pincer(N,self,threat,slot,occupied,kind){
  if(!threat)return null;
  const dx=threat.x-self.x,dz=threat.z-self.z,len=Math.hypot(dx,dz)||1;
  const side=slot%2?-1:1,flank=kind==='hunter'?3.5:6,back=kind==='hunter'?1.5:9;
  const wish={x:threat.x-dx/len*back-dz/len*side*flank,
    y:Number.isFinite(threat.y)?threat.y:0,z:threat.z-dz/len*back+dx/len*side*flank};
  return search(N,wish,self,occupied,{radius:5,separation:2.5,maxTravel:45,source:'pincer',maxCandidates:260,maxMs:1});
}
// Stable lane-holder slice for tactical rounds. These bots keep their already
// assigned patrol post during mid-range contact instead of joining every push.
function holdsPost(slot,dist,guardPlayer){return (guardPlayer||slot%4===2)&&dist>5&&dist<36;}
// Infection roles are stable by squad slot: protect, conceal, hunt infected,
// or hold a defensive post. The infected team hunts. These roles only change
// routing, never damage, accuracy, movement speed, or conversion rules.
function infectionRole(slot,team){
  if(team===1)return 'hunt';
  // Keep only one in eight survivors anchored to the human; the larger
  // remainder can scout, conceal, hunt infected, and secure separate lanes.
  return ['protect','hide','hunt','hold','hunt','hide','hunt','hold'][Math.max(0,slot|0)%8];
}
return {rayCovered,prepareRayIndex,search,patrol,cover,retreat,pincer,holdsPost,infectionRole,searchDiagnostics};
});
