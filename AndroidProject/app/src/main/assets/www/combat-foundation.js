/* Zero-distance safe collision separation; no changes to movement or damage statistics. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SightlineCombat=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function separate(ax,az,bx,bz,aId,bId,radius,scale){
 var dx=ax-bx,dz=az-bz,d2=dx*dx+dz*dz;
 if(!Number.isFinite(d2)||d2>=radius*radius)return null;
 var d=Math.sqrt(d2);
 if(d<1e-5){
  // The pair receives opposing directions. Spread directional choices to avoid lane bias.
  var a=Math.min(aId,bId),b=Math.max(aId,bId),ang=((a*7+b*13)%8)*Math.PI/4;
  var sign=aId<bId?1:-1;
  return {x:Math.cos(ang)*sign*radius*scale,z:Math.sin(ang)*sign*radius*scale};
 }
 var push=(radius-d)*scale/d;
 return {x:dx*push,z:dz*push};
}
return Object.freeze({separate:separate});
});
