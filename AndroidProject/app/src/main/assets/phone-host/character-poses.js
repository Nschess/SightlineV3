/* Sightline V9 character presentation — cosmetic only. No server hitbox or gameplay state changes.
   Character parts are batched at creation; transform only existing sections per frame.
   CommonJS export permits deterministic regression checks without WebGL. */
(function(root,factory){
  var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SightlinePoses=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null,function(){
  'use strict';
  function bound(v,min,max){return Math.max(min,Math.min(max,Number(v)||0));}
  function ease(from,to,dt){return from+(to-from)*Math.min(1,Math.max(0,dt)*15);}
  function apply(u,s,dt){
    if(!u||!u.alive||!u.body||!u.legs||!u.legR)return;
    var crouch=bound(s.crouch,0,1),prone=bound(s.prone,0,1),air=bound(s.air,-1,1),rl=bound(s.reload,0,1);
    // Head stays connected to the torso. Crouching lowers the hips and tucks the
    // knees; jumping splits the legs slightly. The body is never shrunk into a box.
    var low=.26*crouch+.91*prone; // Keep the head near LAN prone hitbox height (.9 m)
    u.body.position.y=ease(u.body.position.y,-low+(air>0?.028*air:0),dt);
    u.body.rotation.x=ease(u.body.rotation.x,.035*crouch-.21*prone-.065*air+Math.sin(rl*Math.PI)*.075,dt);
    var pivot=.85-.105*crouch-.39*prone;
    u.legs.position.y=ease(u.legs.position.y,pivot,dt);
    u.legR.position.y=ease(u.legR.position.y,pivot,dt);
    u.legs.position.z=ease(u.legs.position.z,-.075*crouch-.16*prone,dt);
    u.legR.position.z=ease(u.legR.position.z,.03*crouch+.08*prone,dt);
    // Add a finite stance offset to the gait pose supplied this frame. Never
    // accumulate across frames or a stationary remote actor's knees drift away.
    var gaitL=bound(s.gaitL,-.85,.85),gaitR=bound(s.gaitR,-.85,.85);
    u.legs.rotation.x=ease(u.legs.rotation.x,gaitL+.43*crouch+.66*prone-.40*air,dt);
    u.legR.rotation.x=ease(u.legR.rotation.x,gaitR-.32*crouch+.36*prone+.33*air,dt);
  }
  function weapon(u,s){
    if(!u||!u.worldGun||!u.alive)return;
    var cr=bound(s.crouch,0,1),pr=bound(s.prone,0,1),air=bound(s.air,-1,1),rl=bound(s.reload,0,1);
    var lift=Math.sin(rl*Math.PI);
    // Authoritative equipment pose based on a fixed attachment height;
    // do not subtract each frame (V9's previous weapon sank below the actor).
    u.worldGun.position.y=(s.baseGunY===undefined?1.31:bound(s.baseGunY,.7,2))-.27*cr-.84*pr-lift*.085;
    u.worldGun.rotation.x=(s.baseGunPitch||0)+lift*.43+.07*air+.17*pr;
    u.worldGun.rotation.z=lift*.15;
  }
  return {apply:apply,weapon:weapon};
});
