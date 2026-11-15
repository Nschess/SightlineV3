/* Sightline original operative wardrobe. Cosmetic definitions only; no gameplay stats. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SightlineCharacterSkins=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const ids=['default','vanguard','recon','hazmat'];
const themes={
 default:{label:'Original uniform',description:'The original squad field uniform',type:'original'},
 vanguard:{label:'Urban Vanguard',description:'Contoured ceramic armor, reinforced helmet and breaching equipment',type:'armored'},
 recon:{label:'Jungle Recon',description:'Layered tropical field gear, scout hood and asymmetric utility harness',type:'field'},
 hazmat:{label:'Hazard Response',description:'Sealed overgarment, dual filters, modular tanks and technical visor',type:'response'}
};
const titleA=['Bulwark','Ironline','Rampart','Blackstone','Palisade','Aegis','Citadel','Ironwake','Sentinel','Ward'];
const titleB=['Canopy','Pathfinder','Thorntrail','Fernwatch','Driftwood','Brushline','Wildtrack','Ridgewalker','Rainshadow','Greenline'];
const titleC=['Containment','Cleanroom','BioShield','Greywall','Quarantine','Viroguard','Barrier','Sealsuit','BioSentry','Cordons'];
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),16777619);}return h>>>0;}
function resolve(x){return typeof x==='string'&&Object.prototype.hasOwnProperty.call(themes,x)?x:'default';}
function variants(op){const n=hash(op.id),i=n%10;return ids.map((id,ix)=>({id,name:ix===0?'Original · '+op.name:op.name+' · '+[titleA,titleB,titleC][ix-1][(i+ix-1)%10],family:themes[id].label,description:themes[id].description}));}
function look(op,selected){let id=resolve(selected);if(op.zombie)id='default';if(id==='default')return op;
 const n=hash(op.id),h=n%7,blue=op.team==='blue';
 const palettes={
 vanguard:{uni:blue?['#31495c','#1c3040','#607887','#152634']:['#594044','#312a32','#826264','#251e24'],vest:blue?'#273e53':'#47313b',gear:blue?'#678394':'#998080',head:'helmet',face:'mask'},
 recon:{uni:blue?['#42615b','#233d41','#668573','#1a302c']:['#536046','#344430','#7c8b55','#253223'],vest:blue?'#38544e':'#475540',gear:blue?'#b2a37b':'#b4a47c',head:'hood',face:'scarf'},
 hazmat:{uni:blue?['#91a6ae','#5a737c','#b2c2c4','#31474c']:['#a5a29a','#79746c','#d0c4a8','#514c48'],vest:blue?'#4a7185':'#886453',gear:blue?'#274659':'#50403c',head:'visor',face:'mask'}
 };
 const p=palettes[id];const tint=(s,f)=>{const rgb=parseInt(s.slice(1),16);return '#'+[16,8,0].map(k=>Math.max(0,Math.min(255,Math.round(((rgb>>k)&255)*f))).toString(16).padStart(2,'0')).join('');};
 return Object.assign({},op,{id:op.id+'__'+id,sourceId:op.id,style:id,variation:n%4,uni:p.uni.map((c,k)=>tint(c,k===0?(.92+h*.023):1)),vest:p.vest,gear:p.gear,head:p.head,face:p.face});
}
return Object.freeze({ids:Object.freeze(ids),themes,resolve,variants,look,hash});
});
