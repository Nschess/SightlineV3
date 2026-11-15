/* Sightline V3: shared, bounded zombie sensory memory and goal selection.
   Pure gameplay planning; collision, damage, movement and server authority remain in the game. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SightlineZombieHunt=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const STATES=['roam','investigate','search','chase','attack','recover'];
function create(id){return {id:id||0,state:'roam',seen:null,heard:null,goal:null,goalAt:0,lastGoal:null,searchUntil:0,seenAt:-1e9,heardAt:-1e9,fail:0,stuck:0,lastX:null,lastZ:null,progressAt:0,changedAt:0,visits:0};}
function state(h,s,t){if(h.state!==s){h.state=s;h.changedAt=t;}return h.state;}
// Small deterministic orbit step for enemies attacking a stationary target.
// Keeps a visible combat motion without changing attack range or damage.
function attackStrafe(id,x,z,tx,tz,time){
  const dx=tx-x,dz=tz-z,d=Math.hypot(dx,dz);
  if(!Number.isFinite(d)||d<1e-4)return [0,0];
  const phase=(Math.floor((Number(time)||0)/1100)+(Number(id)||0))&1,side=phase?-1:1;
  return [-dz/d*side,dx/d*side];
}
// Stable nearest-N scan for outbreak perception. Reuses the caller's buffers
// and records so large bot rosters do not allocate/sort a full candidate list
// on every perception interval. Equal-distance order remains primary then
// squad order, matching the prior stable Array.sort behavior.
function insertNearestTarget(target,origin,limit,targets,distances){
  if(!target||!target.alive||!Number.isFinite(target.x)||!Number.isFinite(target.z))return;
  const distance=Math.hypot(target.x-origin.x,target.z-origin.z);
  let at=0;while(at<distances.length&&distances[at]<=distance)at++;
  if(at>=limit)return;
  const count=Math.min(limit,targets.length+1);
  for(let i=count-1;i>at;i--){
    if(i<targets.length){targets[i]=targets[i-1];distances[i]=distances[i-1];}
  }
  targets[at]=target;distances[at]=distance;
  targets.length=count;distances.length=count;
}
function inPerceptionRange(target,origin,maxDistance,maxVertical){
  if(!target||!target.alive||!Number.isFinite(target.x)||!Number.isFinite(target.z))return false;
  const range=Number.isFinite(maxDistance)?Math.max(0,maxDistance):Infinity;
  const height=Number.isFinite(maxVertical)?Math.max(0,maxVertical):Infinity;
  return Math.hypot(target.x-origin.x,target.z-origin.z)<=range&&Math.abs((target.y||0)-(origin.y||0))<=height;
}
function insertNearestEligibleTarget(target,origin,limit,targets,distances,maxDistance,maxVertical){
  if(!inPerceptionRange(target,origin,maxDistance,maxVertical))return;
  const distance=Math.hypot(target.x-origin.x,target.z-origin.z);
  let at=0;while(at<distances.length&&distances[at]<=distance)at++;
  if(at>=limit)return;
  const count=Math.min(limit,targets.length+1);
  for(let i=count-1;i>at;i--){if(i<targets.length){targets[i]=targets[i-1];distances[i]=distances[i-1];}}
  targets[at]=target;distances[at]=distance;targets.length=count;distances.length=count;
}
function nearestEligibleTargets(origin,primary,others,limit,targets,distances,maxDistance,maxVertical){
  targets.length=0;distances.length=0;
  if(limit<=0||!origin||!Number.isFinite(origin.x)||!Number.isFinite(origin.z))return targets;
  insertNearestEligibleTarget(primary,origin,limit,targets,distances,maxDistance,maxVertical);
  if(Array.isArray(others))for(let i=0;i<others.length;i++)insertNearestEligibleTarget(others[i],origin,limit,targets,distances,maxDistance,maxVertical);
  return targets;
}
function appendPerceptionProbeById(origin,primary,others,targets,distances,afterId,maxDistance,maxVertical){
  let next=null,nextId=Infinity,nextDistance=0,wrap=null,wrapId=Infinity,wrapDistance=0;
  const consider=(p,isPrimary)=>{
    if(!inPerceptionRange(p,origin,maxDistance,maxVertical))return;
    for(let j=0;j<targets.length;j++)if(targets[j]===p)return;
    const d=Math.hypot(p.x-origin.x,p.z-origin.z),id=Number.isFinite(p.id)?p.id:(isPrimary?-1:NaN);
    if(!Number.isFinite(id))return;
    if(id>afterId){if(id<nextId){next=p;nextId=id;nextDistance=d;}}
    else if(id<wrapId){wrap=p;wrapId=id;wrapDistance=d;}
  };
  consider(primary,true);
  if(Array.isArray(others))for(let i=0;i<others.length;i++)consider(others[i],false);
  const p=next||wrap;if(!p)return null;
  const index=targets.length;targets[index]=p;distances[index]=next?nextDistance:wrapDistance;
  return next?nextId:wrapId;
}
function nearestTargets(origin,primary,others,limit,targetsOut,distancesOut){
  const max=Number.isFinite(limit)?Math.max(0,Math.floor(limit)):5;
  const targets=Array.isArray(targetsOut)?targetsOut:[],distances=Array.isArray(distancesOut)?distancesOut:[];
  targets.length=0;distances.length=0;
  if(!max||!origin||!Number.isFinite(origin.x)||!Number.isFinite(origin.z))return targets;
  insertNearestTarget(primary,origin,max,targets,distances);
  if(Array.isArray(others))for(let i=0;i<others.length;i++)insertNearestTarget(others[i],origin,max,targets,distances);
  return targets;
}
// Keep the first scan's original nearest set. Later scans retain a valid
// current target (or the nearest eligible survivor) and rotate the remaining
// LOS slots by stable actor ID. This survives roster reorder/death/respawn and
// checks up to four new survivors per scan without increasing the five-ray cap.
function perceptionTargets(origin,primary,others,limit,targetsOut,distancesOut,cursor,maxDistance,maxVertical,preferredTarget){
  const max=Number.isFinite(limit)?Math.max(0,Math.floor(limit)):5;
  const targets=Array.isArray(targetsOut)?targetsOut:[],distances=Array.isArray(distancesOut)?distancesOut:[];
  if(!Number.isFinite(cursor)){
    nearestTargets(origin,primary,others,max,targets,distances);
    const probe=targets.length>=max&&max>0?targets[max-1]:null;
    return probe&&Number.isFinite(probe.id)?probe.id:-1;
  }
  const probeCount=Math.min(4,Math.max(0,max-1)),anchors=max-probeCount;
  targets.length=0;distances.length=0;
  if(anchors>0&&inPerceptionRange(preferredTarget,origin,maxDistance,maxVertical)){
    targets[0]=preferredTarget;distances[0]=Math.hypot(preferredTarget.x-origin.x,preferredTarget.z-origin.z);
  }else nearestEligibleTargets(origin,primary,others,anchors,targets,distances,maxDistance,maxVertical);
  let afterId=cursor;
  while(targets.length<max){
    const nextId=appendPerceptionProbeById(origin,primary,others,targets,distances,afterId,maxDistance,maxVertical);
    if(nextId===null)break;
    afterId=nextId;
  }
  return afterId;
}
function seen(h,p,t){if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z))return;h.seen={x:p.x,z:p.z,y:p.y||0};h.seenAt=t;h.searchUntil=t+5000+(h.id%6)*600;if(h.state!=='chase'){h.goal=null;h.goalAt=0;}state(h,'chase',t);}
function hear(h,p,t){if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z))return;if(t-h.seenAt<1500)return;if(t-h.heardAt<850)return;h.heard={x:p.x,z:p.z,y:p.y||0};h.heardAt=t;if(h.state==='roam'||h.state==='search'||h.state==='recover'){h.goal=null;state(h,'investigate',t);}}
function candidate(h,N,x,y,z,min,max,rand){if(!N||!N.nodes||!N.nodes.length||!N.edges)return null;
  // Real game graphs expose nearest lookup through SightlineNav.nearest(N,...).
  // Keep support for the compact NAV.nearest() adapter used by test/custom graphs.
  const localNearest=typeof N.nearest==='function'?N.nearest:null;
  const graphNearest=!localNearest&&typeof SightlineNav!=='undefined'&&typeof SightlineNav.nearest==='function'?SightlineNav.nearest:null;
  const f=rand||Math.random;
  for(let j=0;j<14;j++){
    const a=f()*6.28318530718, d=min+(max-min)*f(),px=x+Math.cos(a)*d,pz=z+Math.sin(a)*d;
    const ix=localNearest?localNearest.call(N,px,y,pz):graphNearest?graphNearest(N,px,y,pz):-1, node=ix>=0?N.nodes[ix]:null;
    if(!node||!N.edges[ix]||!N.edges[ix].length||(N.reachable&&N.reachable[ix]===0))continue;
    if(Math.abs(node.y-y)>4.5||Math.hypot(node.x-x,node.z-z)<min*.65)continue;
    if(h.lastGoal&&Math.hypot(node.x-h.lastGoal.x,node.z-h.lastGoal.z)<3)continue;
    return {x:node.x,z:node.z,y:node.y};
  }
  return null;
}
function goal(h,N,p,t,rng){const rand=rng||Math.random,x=p.x,z=p.z,y=p.y||0;
  // An attack target that vanishes must enter a bounded last-known-position hunt.
  if(h.state==='attack'){
    h.goal=h.seen?{...h.seen}:null;h.goalAt=t;
    state(h,t-h.seenAt<=1200?'chase':'search',t);
  }
  if(h.state==='chase'&&t-h.seenAt>1200){h.goal=h.seen?{...h.seen}:null;state(h,'search',t);}
  if(h.state==='investigate'&&t-h.heardAt>6500){h.heard=null;h.goal=null;state(h,'roam',t);}
  if(h.state==='search'&&t>h.searchUntil){h.goal=null;h.seen=null;state(h,'roam',t);}
  if(h.state==='recover'&&t-h.changedAt>1200){h.goal=null;state(h,'roam',t);}
  const arrived=h.goal&&Math.hypot(h.goal.x-x,h.goal.z-z)<1.25&&Math.abs(h.goal.y-y)<.6;
  if(arrived){h.lastGoal=h.goal;h.goal=null;h.visits++;}
  if(h.state==='attack')return null;
  if(h.state==='chase'){if(h.seen&&(t-h.goalAt>450||!h.goal)){h.goal={...h.seen};h.goalAt=t;}return h.goal;}
  if(h.state==='investigate'){
    if(!h.goal&&h.heard){h.goal={...h.heard};h.goalAt=t;}
    if(arrived){h.searchUntil=t+4500+(h.id%5)*400;state(h,'search',t);}
    return h.goal;
  }
  if(h.state==='search'){
    if(!h.goal){const c=h.seen||h.heard||p;h.goal=candidate(h,N,c.x,c.y||0,c.z,3.5,13,rand);h.goalAt=t;
      if(!h.goal&&h.visits>2)state(h,'roam',t);}
    return h.goal;
  }
  if(!h.goal||t-h.goalAt>9000){h.goal=candidate(h,N,x,y,z,7,26,rand);h.goalAt=t;}
  return h.goal;
}
function blocked(h,t){h.fail++;h.goal=null;h.lastGoal=h.seen||h.heard||h.lastGoal;h.searchUntil=t+3000;if(h.fail>=3){h.seen=null;h.heard=null;state(h,'recover',t);}else state(h,'search',t);}
function progress(h,x,z,t,trying){if(!trying){h.lastX=x;h.lastZ=z;h.progressAt=t;return false;}
  if(h.lastX===null){h.lastX=x;h.lastZ=z;h.progressAt=t;return false;}
  if(t-h.progressAt<1800)return false;
  const d=Math.hypot(x-h.lastX,z-h.lastZ);h.lastX=x;h.lastZ=z;h.progressAt=t;
  if(d>.6){h.fail=0;h.stuck=0;return false;}
  h.stuck++;blocked(h,t);return true;
}
return {STATES,create,seen,hear,goal,blocked,progress,state,attackStrafe,nearestTargets,perceptionTargets};
});
