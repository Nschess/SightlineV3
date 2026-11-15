/* Sightline V3: bounded Infection-only movement adaptation.
   Reactive heuristic, not machine learning or bullet precognition.
   Events contain no unseen opponent coordinates. Returns navigation goals, not teleportation.
   Used exclusively for infected team bots (LAN) and infected AI (offline). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SightlineInfectionEvasion=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const LEVELS={
  recruit:{react:570,threshold:.68,jump:.14,cooldown:6800},
  regular:{react:430,threshold:.50,jump:.23,cooldown:5400},
  veteran:{react:340,threshold:.42,jump:.29,cooldown:4700},
  elite:{react:270,threshold:.36,jump:.33,cooldown:4300}
};
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function create(id){return {id:id||0,pressure:0,firstThreat:-1e9,lastThreat:-1e9,lastShot:-1e9,lastHit:-1e9,lastUpdate:0,nextJump:0,nextSidestep:0,side:((id||0)%2===0?1:-1),sidestepUntil:0,dodges:0};}
function alert(s,t,intensity){
 if(!s||!Number.isFinite(t))return;
 if(t-s.lastThreat>2200)s.firstThreat=t;
 s.lastThreat=t;s.pressure=clamp(s.pressure+intensity,0,1.3);
}
function gunshot(s,t,dist){
 if(!s||!Number.isFinite(dist)||dist>25||dist<0||t-s.lastShot<320)return;
 s.lastShot=t;alert(s,t,.25+(dist<12?.10:0));
}
function hurt(s,t){if(!s||t-s.lastHit<120)return;s.lastHit=t;alert(s,t,.64);}
function choose(s,opts,random,out){
 out=out||{};out.active=false;out.jump=false;out.goal=null;
 if(!s)return out;
 const t=opts.time,dt=s.lastUpdate?clamp((t-s.lastUpdate)/1000,0,1.5):0;s.lastUpdate=t;
 s.pressure=Math.max(0,s.pressure-.17*dt);
 const d=opts.distance,profile=LEVELS[opts.skill]||LEVELS.regular;
 if(!opts.visible||!opts.target||!Number.isFinite(d)||d<3.6||d>27||t-s.lastThreat>2250||t-s.firstThreat<profile.react||s.pressure<profile.threshold)
   return out;
 const r=random||Math.random;
 // A timed change of lane reacts to visible fire, not a predicted bullet trajectory.
 if(t>=s.nextSidestep){s.side=-s.side;s.nextSidestep=t+700+Math.floor(r()*700);s.sidestepUntil=t+650;}
 const sidestep=t<s.sidestepUntil&&d>4.5;
 let goal=null;
 if(sidestep){
   const dx=(opts.target.x-opts.x)/d,dz=(opts.target.z-opts.z)/d;
   const forward=Math.min(4.4,Math.max(1.0,d-2.7));
   const lateral=1.35*s.side;
   goal=out.goalScratch||(out.goalScratch={});
   goal.x=opts.x+dx*forward-dz*lateral;goal.z=opts.z+dz*forward+dx*lateral;goal.y=opts.target.y||0;
 }
 let jump=false;
 if(opts.grounded&&opts.clearance&&d>5&&d<19&&t>=s.nextJump){
   const chance=Math.min(.36,profile.jump+Math.min(.035,s.dodges*.005));
   jump=r()<chance;
   // Failed attempts also consume the reaction window. No jump-spam.
   s.nextJump=t+profile.cooldown+Math.floor(r()*1100);
   if(jump)s.dodges++;
 }
 out.active=true;out.jump=jump;out.goal=goal;return out;
}
return {LEVELS,create,gunshot,hurt,choose};
});
