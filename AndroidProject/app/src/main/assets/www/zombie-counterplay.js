/* Lightweight, deterministic counterplay shared by the offline and LAN engines.
   Time is supplied by the caller so tests can use a fixed clock. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SightlineCounterplay=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const SPIT_WARN_MS=700, SPIT_RADIUS=1.4;
function spitHits(aim,target){return !!(aim&&target&&target.alive!==false&&Math.abs((target.y||0)-(aim.y||0))<=1.5&&Math.hypot(target.x-aim.x,target.z-aim.z)<=SPIT_RADIUS);}
function fatigue(now,last,stacks){return now-last>1000?{stacks:1,scale:1}:{stacks:Math.min(5,(stacks||0)+1),scale:1/(1+.32*Math.min(5,(stacks||0)+1))};}
return {SPIT_WARN_MS,SPIT_RADIUS,spitHits,fatigue};
});
