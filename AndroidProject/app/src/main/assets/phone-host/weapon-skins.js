/* Original, weapon-specific cosmetic collection; no gameplay stats or networking. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SightlineWeaponSkins=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const forged=['Ashen','Kiln','Ember','Iron','Cinder','Scar','Anvil','Pyre','Molten'];
const circuit=['Ion','Specter','Volt','Signal','Neon','Aether','Pulse','Cipher','Vector'];
const relic=['Crown','Gilded','Opal','Regent','Ivory','Astral','Sovereign','Luster','Eclipse'];
function hash(s){let n=2166136261>>>0;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619)>>>0;return n;}
function palette(seed,family){const n=seed%9,h=(seed%13)/13;
 if(family===0)return {name:forged[n]+' Forge',desc:'Weathered forged steel · slashed ember inlay',metal:[0x66544c,0x735a4f,0x80655a,0x676567][seed%4],polymer:0x171d24,trim:[0xef763a,0xdc9a57,0xf06454][seed%3],dark:0x281c1a,roughness:.67,metalness:.65,motif:0};
 if(family===1)return {name:circuit[n]+' Circuit',desc:'Ceramic armor · precise luminescent signal traces',metal:[0x52677e,0x425d7e,0x6c718d,0x39767c][seed%4],polymer:0x111c31,trim:[0x73f4df,0x71c9ff,0xc898ff][seed%3],dark:0x16162b,roughness:.34,metalness:.55,motif:1};
 return {name:relic[n]+' Relic',desc:'Brushed noble alloy · engraved geometric filigree',metal:[0x9a865b,0x8c8174,0xc3a579,0x8c7896][seed%4],polymer:0x272a2e,trim:[0xf3dbaa,0xd4e5de,0xf5c8a8][seed%3],dark:0x3b3333,roughness:.24,metalness:.82,motif:2};
}
/* ===== P11.5 LEGENDARY TIER: Azure Sovereign (Longbow) =====
   Cosmetic only: no stats, networking or hit geometry. Everything is built
   once on equip; per-frame cost is a handful of transform/colour updates. */
var LEGENDARY_PROTOTYPES={
 stinger:{title:'Sulfur Wasp',inspect:{duration:1.5,x:-.07,y:.03,z:.03,rx:.1,ry:-.3,rz:.2},metal:0x17140f,polymer:0x0b0a08,trim:0xe8a71e,dark:0x070605,glow:0xffa51a,tracer:0xffc040,impact:0xff8a1a,flash:0xfff0b0,reticle:'#ffd27a',reticleBorder:'rgba(255,165,26,.5)',roughness:.42,metalness:.7,motif:1,desc:'A split graphite receiver, exposed gas piston, staggered hex-cell vents, skeleton stock and a compact amber-banded brake.'},
 aurora:{title:'Polar Veil',overlay:true,inspect:{duration:1.5,x:-.07,y:.03,z:.03,rx:.1,ry:-.3,rz:.2},metal:0xb9c9d8,polymer:0x43566b,trim:0xf4fbff,dark:0x1c2733,glow:0x4dffb8,tracer:0x8dffd8,impact:0xe055ff,flash:0xe8fff7,reticle:'#b6ffe6',reticleBorder:'rgba(77,255,184,.5)',roughness:.38,metalness:.62,motif:2,desc:'Frosted pearl plating etched with snow-crystal rosettes, flowing aurora ribbons and an ice-prism muzzle crown.'},
 falcon:{title:'Solar Talon',overlay:true,inspect:{duration:1.5,x:-.07,y:.03,z:.03,rx:.1,ry:-.3,rz:.2},metal:0x8f6727,polymer:0x0e0908,trim:0xf2c14e,dark:0x0a0605,glow:0xffc247,tracer:0xffd77a,impact:0xff7a2a,flash:0xfff3c8,reticle:'#ffe39a',reticleBorder:'rgba(255,194,71,.5)',roughness:.4,metalness:.7,motif:3,desc:'Brass feather-scale plating, an engraved sun disc and a three-talon muzzle with ember-gold energy lines.'},
 smg:{title:'Phantom Circuit',inspect:{duration:1.38,x:-.10,y:.028,z:.025,rx:.08,ry:-.29,rz:.25},metal:0x343943,polymer:0x12151e,trim:0x8b70ba,dark:0x090c12,glow:0xc05bff,tracer:0xd19aff,impact:0x9d63d7,flash:0xe6c0ff,reticle:'#dfbaff',reticleBorder:'rgba(185,126,255,.52)',roughness:.39,metalness:.78,motif:4,desc:'Enclosed induction cassette, vented suppressor sleeve and a restrained violet circuit core.'},
 breacher:{title:'Infernal Forge',inspect:{duration:1.62,x:-.067,y:.018,z:.036,rx:-.19,ry:.26,rz:-.23},metal:0x64452f,polymer:0x1a1715,trim:0xd2945a,dark:0x100d0b,glow:0xff903d,tracer:0xffbd70,impact:0xd97639,flash:0xffcf91,reticle:'#ffc27e',reticleBorder:'rgba(231,145,68,.48)',roughness:.52,metalness:.72,motif:5,desc:'Blackened steel action, vented pump jacket and a contained amber forge chamber.'},
 carbine:{title:'Celestial Vanguard',inspect:{duration:1.52,x:-.058,y:.039,z:.026,rx:-.10,ry:.41,rz:-.27},metal:0xa2a9a9,polymer:0x1d2938,trim:0xd7bc83,dark:0x101822,glow:0x72d8ff,tracer:0xb5ecff,impact:0x8bc9e8,flash:0xe2f7ff,reticle:'#dcf7ff',reticleBorder:'rgba(132,218,255,.5)',roughness:.29,metalness:.84,motif:7,desc:'Faceted split-titanium receiver, vented free-float shroud, open precision holographic sight and a protected cyan power cell.'},
ranger:{title:'Helios Eclipse',pack:'SightlineEclipse',inspect:{duration:1.5,x:-.07,y:.03,z:.03,rx:.1,ry:-.3,rz:.2},metal:0x1a1522,polymer:0x0b0a10,trim:0xffb22e,dark:0x050505,glow:0xffb22e,tracer:0xffb040,impact:0xffb040,flash:0xffd98a,reticle:'#ffe6a8',reticleBorder:'rgba(255,255,255,.4)',roughness:.4,metalness:.7,motif:8,desc:'Original Legendary: Helios Eclipse'},
tide:{title:'Prismatic Aurora',pack:'SightlinePrism',inspect:{duration:1.5,x:-.07,y:.03,z:.03,rx:.1,ry:-.3,rz:.2},metal:0x10131c,polymer:0x07080d,trim:0xb9d4ff,dark:0x050505,glow:0xb9d4ff,tracer:0xbfd8ff,impact:0xbfd8ff,flash:0xdfe8ff,reticle:'#e6f0ff',reticleBorder:'rgba(255,255,255,.4)',roughness:.4,metalness:.7,motif:8,desc:'Original Legendary: Prismatic Aurora'},
hawk:{title:'Voidlight Hawk',pack:'SightlineVoid',inspect:{duration:1.5,x:-.07,y:.03,z:.03,rx:.1,ry:-.3,rz:.2},metal:0x15101f,polymer:0x08060f,trim:0xc77dff,dark:0x050505,glow:0xc77dff,tracer:0xb06bff,impact:0xb06bff,flash:0xe0c0ff,reticle:'#ecd6ff',reticleBorder:'rgba(255,255,255,.4)',roughness:.4,metalness:.7,motif:8,desc:'Original Legendary: Voidlight Hawk'},
scatter:{title:'Thornbloom Scatter',pack:'SightlineThorn',inspect:{duration:1.5,x:-.07,y:.03,z:.03,rx:.1,ry:-.3,rz:.2},metal:0x1d0f17,polymer:0x0b0509,trim:0xff4f7a,dark:0x050505,glow:0xff4f7a,tracer:0xff7a9c,impact:0xff7a9c,flash:0xffb0c4,reticle:'#ffd0dc',reticleBorder:'rgba(255,255,255,.4)',roughness:.4,metalness:.7,motif:8,desc:'Original Legendary: Thornbloom Scatter'},
bulwark:{title:'Sunforged Aegis',pack:'SightlineAegis',inspect:{duration:1.5,x:-.07,y:.03,z:.03,rx:.1,ry:-.3,rz:.2},metal:0x3a342a,polymer:0x1c1913,trim:0xffd27a,dark:0x050505,glow:0xffd27a,tracer:0xffd890,impact:0xffd890,flash:0xfff0c0,reticle:'#fff2cc',reticleBorder:'rgba(255,255,255,.4)',roughness:.4,metalness:.7,motif:8,desc:'Original Legendary: Sunforged Aegis'},
rampart:{title:'Phoenix Rebirth',pack:'SightlinePhoenix',inspect:{duration:1.5,x:-.07,y:.03,z:.03,rx:.1,ry:-.3,rz:.2},metal:0x1d0c0c,polymer:0x0c0505,trim:0xff7a1e,dark:0x060303,glow:0xff7a1e,tracer:0xffb070,impact:0xff6a20,flash:0xffa860,reticle:'#ffd2a0',reticleBorder:'rgba(255,122,30,.5)',roughness:.4,metalness:.7,motif:8,desc:'Obsidian and living flame, feathered receiver armor, solid phoenix vanes, and a rebirth on every reload'},
needle:{title:'Tempest Needle',pack:'SightlineTempest',inspect:{duration:1.5,x:-.07,y:.03,z:.03,rx:.1,ry:-.3,rz:.2},metal:0x141a28,polymer:0x090c14,trim:0x7fd8ff,dark:0x05070c,glow:0x7fd8ff,tracer:0xbfe8ff,impact:0x7fc0ff,flash:0xa8d8ff,reticle:'#d8f2ff',reticleBorder:'rgba(127,216,255,.5)',roughness:.4,metalness:.7,motif:9,desc:'Thunderhead graphite, living lightning, tesla coils and chain-arc tracers'},
};
var LEGEND_WEAPONS={smg:true,breacher:true,rook117:true,carbine:true,stinger:true,aurora:true,falcon:true,longbow:true,ranger:true,tide:true,hawk:true,scatter:true,bulwark:true,rampart:true,needle:true};
function legendEntry(id,base,seed){
 var p=legendarySpec(id);
 if(p)return {id:id+'-3',weapon:id,family:3,legendary:true,tier:'Legendary',name:p.title+' \u00b7 '+base,
  desc:'LEGENDARY \u00b7 '+p.desc,metal:p.metal,polymer:p.polymer,trim:p.trim,dark:p.dark,glow:p.glow,tracer:p.tracer,impact:p.impact,flash:p.flash,
  reticle:p.reticle,reticleBorder:p.reticleBorder,roughness:p.roughness,metalness:p.metalness,motif:p.motif,theme:p.title,seed:seed};
 return {id:id+'-3',weapon:id,family:3,legendary:true,tier:'Legendary',name:'Azure Sovereign \u00b7 '+base,
  desc:'LEGENDARY \u00b7 Royal sapphire armor, gilded optics, arc-crystal reactor and a ceremonial energy reload',
  metal:0x153d91,polymer:0x071631,trim:0xffd16a,dark:0x050d22,glow:0x1caaff,roughness:.19,metalness:.9,motif:3,theme:'Azure Sovereign',seed:seed};
}
var TAU=Math.PI*2;
function lcg(seed){var s=(seed>>>0)||1;return function(){s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296*2-1;};}
function ex(x){return Math.exp(x);}
/* ---------- stateless sound primitives (closed-form phase, no NaN) ---------- */
function boomS(t,amp,tau){var ph=TAU*(46*t+44*.085*(1-ex(-t/.085)));return Math.tanh(2.4*Math.sin(ph))*ex(-t/tau)*Math.min(1,t/.004)*amp;}
function zapS(t){if(t<0||t>.4)return 0;var ph=TAU*(520*t+4680*.03*(1-ex(-t/.03)));return Math.sin(ph+3.2*Math.sin(TAU*1900*t))*ex(-t/.05)*Math.min(1,t/.0008);}
var CHORD=[[146.83,.9],[220,.8],[293.66,1],[369.99,.7],[440,.8],[587.33,.6],[880,.35]];
function choirS(t){if(t<0)return 0;var v=0,i,f;for(i=0;i<CHORD.length;i++){f=CHORD[i][0];
  v+=CHORD[i][1]*(Math.sin(TAU*f*t+.9*Math.sin(TAU*5.1*t+i))+Math.sin(TAU*(f+1.4)*t+.7*Math.sin(TAU*4.3*t+i*2)))*.5;}
 return v*(1-ex(-t/.09))*ex(-t/.95);}
var BELLS=[[1,1,.55],[2.76,.5,.30],[5.4,.28,.18],[8.93,.14,.10]];
function bellS(t){if(t<0)return 0;var v=0,i;for(i=0;i<4;i++)v+=BELLS[i][1]*Math.sin(TAU*587.33*BELLS[i][0]*t)*ex(-t/BELLS[i][2]);return v*Math.min(1,t/.001);}
function sparkS(t,notes){var v=0,i,tt;for(i=0;i<notes.length;i++){tt=t-notes[i][1];if(tt>0)v+=Math.sin(TAU*notes[i][0]*tt)*ex(-tt/.22)*Math.min(1,tt/.002);}return v;}
function echo(w,sr){var d1=Math.round(.137*sr),d2=Math.round(.291*sr),i;for(i=d1;i<w.length;i++)w[i]+=.3*w[i-d1];for(i=d2;i<w.length;i++)w[i]+=.17*w[i-d2];}
function finish(o,sr,peak){var i,m=0,n=o.length,f=Math.round(.06*sr);
 for(i=0;i<n;i++){if(!(Math.abs(o[i])<1e9))o[i]=0;m=Math.max(m,Math.abs(o[i]));}
 var g=m>0?peak/m:1;for(i=0;i<n;i++){o[i]=Math.tanh(o[i]*g*1.1)/Math.tanh(1.1);if(i>n-f)o[i]*=(n-i)/f;}return o;}
var SPARKS=[[1174.66,.16],[1479.98,.23],[1760,.30],[2349.3,.38]];
/* Shot report: thunder crack + sub boom + electric arc + gold choir/bell sparkle. 1.9 s. */
function shotLayers(sr){
 var n=Math.ceil(1.9*sr),dry=new Float32Array(n),wet=new Float32Array(n),rnd=lcg(115001),dt=1/sr;
 var lp1=0,lp2=0,prev=0,gate=0,a1=1-ex(-TAU*520*dt),a2=1-ex(-TAU*300*dt),i,t,nz,hp,roll;
 for(i=0;i<n;i++){t=i*dt;nz=rnd();
  lp1+=a1*(nz-lp1);lp2+=a2*(lp1-lp2);hp=nz-prev;prev=nz;
  if(Math.abs(rnd())>.9955)gate=1;gate*=ex(-dt/.003);
  dry[i]=boomS(t,.26,.30)+zapS(t)*.32+hp*gate*ex(-t/.16)*.34+(t<.02?nz*ex(-t/.0016)*.6:0);
  roll=.62+.38*Math.sin(TAU*4.7*t+1.1)*Math.sin(TAU*2.3*t+.4);
  wet[i]=lp2*3.2*(1-ex(-t/.07))*ex(-t/.62)*roll*.9
   +choirS(t-.02)*.12+bellS(t-.02)*.13+sparkS(t,SPARKS)*.09;}
 echo(wet,sr);var o=new Float32Array(n);for(i=0;i<n;i++)o[i]=dry[i]+wet[i];return finish(o,sr,.85);
}
/* Mixes the game's existing procedural Longbow report under the legendary layers. */
function mixShot(sr,base){var L=shotLayers(sr),i,n=base?Math.min(base.length,L.length):0;
 var o=new Float32Array(L.length);for(i=0;i<L.length;i++)o[i]=L[i]*.9+(i<n?base[i]*.55:0);return finish(o,sr,.92);}
/* Equip sound: rising swell, then thunder-bloom with arpeggio. 1.5 s. */
function equipSound(sr){
 var n=Math.ceil(1.5*sr),o=new Float32Array(n),rnd=lcg(115077),dt=1/sr,lp=0,i,t,k,a,v,sw=.55;
 var arp=[[880,.6],[1174.66,.67],[1479.98,.74],[1760,.81],[2349.3,.88]];
 for(i=0;i<n;i++){t=i*dt;v=0;
  if(t<sw){k=t/sw;a=1-ex(-TAU*(250+3500*k*k)*dt);lp+=a*(rnd()-lp);
   v+=lp*k*k*2.2+Math.sin(TAU*(73.4*t+(293.66-73.4)*sw/Math.log(4)*(Math.pow(4,t/sw)-1)/1))*k*k*.18;}
  else{var u=t-sw;v+=boomS(u,.38,.25)+zapS(u)*.2+choirS(u)*.07+bellS(u)*.07;}
  v+=sparkS(t,arp)*.05;o[i]=v;}
 var w=new Float32Array(o);echo(w,sr);for(i=0;i<n;i++)o[i]=o[i]*.7+w[i]*.5;return finish(o,sr,.8);
}
/* Re-arm chime when the bolt closes. 0.6 s. */
function rearmSound(sr){
 var n=Math.ceil(.6*sr),o=new Float32Array(n),rnd=lcg(115123),dt=1/sr,i,t,v;
 for(i=0;i<n;i++){t=i*dt;
  v=(t<.004?rnd()*ex(-t/.0012):0)*.5
   +Math.sin(TAU*1760*t+1.4*Math.sin(TAU*3520*t))*ex(-t/.16)*.45
   +(t>.07?Math.sin(TAU*2349.3*(t-.07)+1.1*Math.sin(TAU*4698*(t-.07)))*ex(-(t-.07)/.2)*.4:0)
   +Math.sin(TAU*120*t)*ex(-t/.05)*.2*(Math.sin(TAU*120*t)>0?1:.5);
  o[i]=v;}
 return finish(o,sr,.7);
}
/* ---------- first-person visual rig ---------- */
function glowTexture(){
 if(typeof document==='undefined')return null;
 var c=document.createElement('canvas');c.width=c.height=64;var x=c.getContext('2d');if(!x)return null;
 var g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(140,240,255,.7)');g.addColorStop(.6,'rgba(60,170,255,.18)');g.addColorStop(1,'rgba(0,0,0,0)');
 x.fillStyle=g;x.fillRect(0,0,64,64);return c;
}
function buildRig(THREE){
 var grp=new THREE.Group();grp.name='P1152-Legendary-Azure-Sovereign-rig';
 var O=new THREE.Object3D(),GOLD=0xffd16a;
 var gold=new THREE.MeshPhongMaterial({color:0xf7bc47,shininess:130,specular:0xfff2cc});
 var royal=new THREE.MeshPhongMaterial({color:0x123eac,shininess:132,specular:0x6ca9ff});
 var deep=new THREE.MeshPhongMaterial({color:0x071938,shininess:105,specular:0x2c79dc});
 var crystal=new THREE.MeshPhongMaterial({color:0x16baff,emissive:0x065bca,shininess:160,specular:0xc8f6ff});
 var inlay=new THREE.MeshPhongMaterial({color:0x061126,shininess:96,specular:0x225ab0});
 var glow=new THREE.MeshBasicMaterial({color:0x24baff});
 var halo=new THREE.MeshBasicMaterial({color:0x24baff,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false});
 function add(m){m.frustumCulled=false;grp.add(m);return m;}
 function inst(geo,mat,list,name){var m=new THREE.InstancedMesh(geo,mat,list.length),i,s;m.name=name;
  for(i=0;i<list.length;i++){s=list[i];O.position.set(s[0],s[1],s[2]);O.rotation.set(s[6]||0,s[7]||0,s[8]||0);O.scale.set(s[3],s[4],s[5]);O.updateMatrix();m.setMatrixAt(i,O.matrix);}
  m.instanceMatrix.needsUpdate=true;return add(m);}
 var unit=new THREE.BoxGeometry(1,1,1),plates=[],rails=[],bolts=[],stand=[],dashes=[],side,i;
 var zz=[[-.52,.020],[-.47,-.002],[-.43,.024],[-.37,-.004],[-.32,.026],[-.26,0],[-.21,.022],[-.15,-.006],[-.09,.018],[-.04,-.002]];
 for(side=-1;side<=1;side+=2){
  plates.push([side*.0385,.006,-.34,.005,.036,.21],[side*.0385,.004,-.02,.005,.034,.13]);
  rails.push([side*.0392,.024,-.34,.006,.003,.21],[side*.0392,-.012,-.34,.006,.003,.21],[side*.0392,.021,-.02,.006,.003,.13],[side*.0392,-.013,-.02,.006,.003,.13]);
  for(i=0;i<zz.length-1;i++){var dz=zz[i+1][0]-zz[i][0],dy=zz[i+1][1]-zz[i][1];
   bolts.push([side*.0420,(zz[i][1]+zz[i+1][1])/2,(zz[i][0]+zz[i+1][0])/2,.003,.0045,Math.sqrt(dz*dz+dy*dy)+.004,-Math.atan2(dy,dz)]);}
  [-.075,.035].forEach(function(z){stand.push([side*.0335,.020,z,.008,.006,.006],[side*.0335,-.012,z,.008,.006,.006]);});
  for(i=0;i<8;i++)dashes.push([side*.0129,0,-.59-i*.04,.003,.004,.028]);
 }
 for(i=0;i<8;i++)dashes.push([0,.0129,-.59-i*.04,.004,.003,.028]);

 /* Same glow material and cube geometry: one GPU submission for the filigree and barrel. */
 inst(unit,glow,bolts.concat(dashes),'P1154-batched-legendary-channels');
 /* P11.5.2 genuine viewmodel geometry: sapphire facet armor follows existing Longbow receiver,
    stock, barrel and scope anchors. All plates are instanced and decorative (no collider). */
 var armor=[],edge=[],navy=[],engrave=[];
 for(side=-1;side<=1;side+=2){
  armor.push([side*.042,.007,-.34,.007,.049,.235], [side*.044,.008,-.015,.006,.051,.165],
             [side*.040,-.011,.275,.007,.059,.245]);
  navy.push([side*.048,.004,-.37,.005,.018,.18], [side*.049,.006,-.008,.005,.02,.105]);
  edge.push([side*.050,.033,-.34,.008,.003,.228], [side*.050,-.024,-.34,.008,.003,.228],
            [side*.051,.036,-.015,.008,.003,.162], [side*.051,-.023,-.015,.008,.003,.162],
            [side*.046,.026,.275,.007,.003,.242], [side*.046,-.043,.275,.007,.003,.242]);
  for(i=0;i<5;i++){
   engrave.push([side*.054,-.001,-.48+i*.067,.003,.004,.022,0,0,0],
                [side*.054,.013,-.48+i*.067,.003,.003,.012,0,0,-.6]);
  }
 }
 inst(unit,royal,armor,'P1152-sapphire-facet-armor');

 inst(unit,gold,edge,'P1152-precision-gold-chamfers');
 inst(unit,crystal,engrave,'P1152-etched-azure-runes');
 /* Optical axis (y=.105): matching actual built-in Longbow scope, not invented camera geometry. */
 var bezel=[];[-.351,-.319,-.273,-.10,.138,.185].forEach(function(z,k){
   bezel.push([0,.105,z,k===0?1.21:1, k===0?1.21:1, 1]);
 });
 inst(new THREE.TorusGeometry(.034,.0035,4,10),gold,bezel,'P1152-scope-gilded-rims');
 inst(new THREE.TorusGeometry(.0265,.0014,3,10),crystal,[[0,.105,-.353,1,1,1],[0,.105,.192,1,1,1]],'P1152-scope-azure-optic-halos');
 /* Receiver sapphire and crown in the prominent near-side silhouette. */
 var jewels=[];for(side=-1;side<=1;side+=2){
  jewels.push([side*.056,.012,-.080,.70,1.55,.9], [side*.049,.013,.245,.65,1,.8]);
 }
 inst(new THREE.OctahedronGeometry(.015,0),crystal,jewels,'P1152-crystal-receiver-inlays');
 var crowns=[];for(i=0;i<3;i++)crowns.push([-.023+i*.023,.141,-.065,.012,.015,.016]);
 inst(new THREE.OctahedronGeometry(1,0),gold,crowns,'P1152-triple-crown-scope-finials');
 /* Ceremonial reload VFX is a real in-game animation synchronized to rf (0..1). */
 var recharge=new THREE.Group();recharge.name='P1152-Azure-reload-core';add(recharge);
 var rechargeCrystal=new THREE.Mesh(new THREE.OctahedronGeometry(.020,0),crystal);
 rechargeCrystal.scale.set(.7,1.55,.85);recharge.add(rechargeCrystal);
 var rechargeHalo=new THREE.Mesh(new THREE.TorusGeometry(.031,.0026,4,12),gold);
 recharge.add(rechargeHalo);
 var rechargeHaloBlue=new THREE.Mesh(new THREE.TorusGeometry(.040,.0013,3,12),
    new THREE.MeshBasicMaterial({color:0x69dfff,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));
 recharge.add(rechargeHaloBlue);
 recharge.position.set(.062,-.079,-.078);recharge.visible=false;

 /* living lightning cores */
 var gtex=glowTexture(),coreMat=new THREE.MeshBasicMaterial({color:0x35d2ff}),cores=[],sprites=[];
 /* All eight tiny gold reactor clamps are static and share a single draw.
    One shared canvas texture also replaces duplicate GPU texture uploads. */
 var clamps=[],sharedGlow=gtex?new THREE.CanvasTexture(gtex):null;
 [1,-1].forEach(function(sd){
  var c=new THREE.Mesh(new THREE.OctahedronGeometry(.011,0),coreMat);c.scale.set(.8,1.5,.8);c.position.set(sd*.0465,.014,-.07);c.userData.base=sd>0?1:.7;add(c);cores.push(c);
  [[0,.017],[0,-.017]].forEach(function(o){clamps.push([sd*.0455,.014+o[1],-.07,.004,.003,.034]);});
  [[-.017],[.017]].forEach(function(o){clamps.push([sd*.0455,.014,-.07+o[0],.004,.034,.003]);});
  if(sharedGlow){var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:sharedGlow,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.5}));sp.position.set(sd*.0475,.014,-.07);sp.scale.set(.075,.075,1);add(sp);sprites.push(sp);}
 });
 inst(unit,gold,clamps,'P1153-batched-reactor-clamps');
 /* orbiting halo rings at the muzzle */
 var haloA=new THREE.Mesh(new THREE.TorusGeometry(.036,.0017,4,16),gold);haloA.position.set(0,0,-.93);add(haloA);
 var haloGems=[];for(i=0;i<3;i++)haloGems.push([Math.cos(i*TAU/3)*.036,Math.sin(i*TAU/3)*.036,0,1,1,1]);
 var hg=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.0055,0),glow,3);
 for(i=0;i<3;i++){O.position.set(haloGems[i][0],haloGems[i][1],0);O.rotation.set(0,0,0);O.scale.set(1,1,1);O.updateMatrix();hg.setMatrixAt(i,O.matrix);}
 hg.instanceMatrix.needsUpdate=true;hg.frustumCulled=false;hg.name='P1153-batched-orbiting-jewels';haloA.add(hg);
 var haloB=new THREE.Mesh(new THREE.TorusGeometry(.027,.0014,4,14),new THREE.MeshBasicMaterial({color:0x5de7ff,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));haloB.position.set(0,0,-.965);add(haloB);
 /* crawling static arcs */
 var arcs=[],arcMat=new THREE.LineBasicMaterial({color:0x9ff3ff,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false});
 for(i=0;i<3;i++){var ag=new THREE.BufferGeometry();ag.setAttribute('position',new THREE.BufferAttribute(new Float32Array(7*3),3));var al=new THREE.Line(ag,arcMat);al.frustumCulled=false;al.userData.phi=i*TAU/3;add(al);arcs.push(al);}
 /* muzzle shock ring + flare */
 var shock=new THREE.Mesh(new THREE.RingGeometry(.02,.028,16),new THREE.MeshBasicMaterial({color:0x8ff0ff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));shock.position.set(0,0,-.99);shock.visible=false;add(shock);
 var flare=null;if(gtex){flare=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(gtex),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0}));flare.position.set(0,0,-.99);flare.visible=false;add(flare);}
 grp.traverse(function(o){o.userData.finishBadge=true;});
 var st={t:0,hot:0,shock:0,flare:0,ping:0,arcT:0,fx:'high',detail:'high',reload:0,reloading:false,completions:0},col=new THREE.Color(),cyan=new THREE.Color(0x24c4ff),white=new THREE.Color(0xffffff),goldC=new THREE.Color(0xffe9a0),coreC=new THREE.Color(0x35d2ff),rnd=lcg(115999);
 function arcs_(force){for(var a=0;a<arcs.length;a++){var l=arcs[a],p=l.geometry.attributes.position,z0=-.58-(rnd()*.5+.5)*.12,len=.2+(rnd()*.5+.5)*.1,ph=l.userData.phi+rnd()*.9,k;
   for(k=0;k<7;k++){var ang=ph+rnd()*.8,r=.0155+(rnd()*.5+.5)*.012;p.setXYZ(k,Math.cos(ang)*r,Math.sin(ang)*r,z0-len*k/6);}
   p.needsUpdate=true;l.visible=force||rnd()>-.4;}}
 var rig={group:grp,state:st,
  update:function(dt,o){o=o||{};st.fx=o.fx||st.fx;if(o.t!==undefined)st.t=o.t;else st.t+=dt;
   var t=st.t,pulse=.5+.5*Math.sin(t*3.1),k;st.hot=Math.max(0,st.hot-dt*1.3);st.ping=Math.max(0,st.ping-dt*2.2);
   col.copy(cyan).multiplyScalar(.75+.25*pulse).lerp(white,Math.min(1,st.hot));glow.color.copy(col);
   coreMat.color.copy(coreC).lerp(goldC,st.ping).lerp(white,st.hot*.7);
   for(k=0;k<cores.length;k++){var c=cores[k],s=c.userData.base*(1+.12*pulse+st.hot*.5+st.ping*.35);c.rotation.y=t*(1.4+st.hot*6);c.scale.set(.8*s,1.5*s,.8*s);}
   for(k=0;k<sprites.length;k++){sprites[k].visible=st.detail!=='low';if(sprites[k].visible)sprites[k].material.opacity=Math.min(1,.35+.25*pulse+st.hot*.5+st.ping*.3);}
   haloA.visible=haloB.visible=st.detail!=='low';
   haloA.rotation.z=t*(.9+st.hot*5);haloA.rotation.x=.12*Math.sin(t*1.7);haloA.rotation.y=.12*Math.cos(t*1.3);
   haloB.rotation.z=-t*(1.3+st.hot*6);haloB.rotation.x=.16*Math.cos(t*1.9);haloB.rotation.y=.16*Math.sin(t*1.1);
   /* Full-magazine legend choreography. Never changes ammo/reload clocks: rf is read-only. */
   if(st.reloading){
    var r=Math.max(0,Math.min(1,st.reload)),open=Math.min(1,r/.22),close=Math.max(0,Math.min(1,(r-.70)/.27));
    recharge.visible=true;
    recharge.position.set(.065-.065*close,-.085+.12*Math.sin(Math.PI*r),-.075+.085*(open-close));
    recharge.rotation.y=t*4+r*TAU;recharge.rotation.z=Math.sin(r*Math.PI)*.35;
    rechargeCrystal.scale.set(.7+open*.3,1.55+Math.sin(Math.PI*r)*1.5,.85+open*.3);
    rechargeHalo.rotation.z=t*3;rechargeHaloBlue.rotation.z=-t*4;

    coreMat.color.copy(coreC).lerp(goldC,close*.75); 
   }else recharge.visible=false;
   var low=st.fx==='low'||st.detail==='low';st.arcT-=dt;
   if(low){for(k=0;k<arcs.length;k++)arcs[k].visible=false;}else if(st.arcT<=0||o.t!==undefined){st.arcT=.10;arcs_(st.hot>.2||o.t!==undefined);}
   if(st.shock>0){st.shock=Math.max(0,st.shock-dt);var u=1-st.shock/.34;shock.visible=true;shock.scale.setScalar(1+u*8);shock.material.opacity=(1-u)*.85;if(st.shock<=0)shock.visible=false;}
   if(flare){if(st.flare>0){st.flare=Math.max(0,st.flare-dt);var f=st.flare/.14;flare.visible=true;flare.scale.set(.05+(1-f)*.2,.05+(1-f)*.2,1);flare.material.opacity=f;if(st.flare<=0)flare.visible=false;}}},
  setDetail:function(level){st.detail=level==='low'?'low':'high';},
  setReload:function(progress,active){
   if(active){st.reloading=true;st.reload=Math.max(0,Math.min(1,progress));}
   else{if(st.reloading&&st.reload>.87){st.ping=1;st.hot=Math.max(st.hot,.7);st.completions++;}
      st.reloading=false;st.reload=0;recharge.visible=false;}
  },
  fire:function(){st.hot=1;st.shock=.34;st.flare=.14;st.arcT=0;},
  rearm:function(){st.ping=1;},
  awaken:function(){st.hot=1;st.shock=.34;st.ping=1;}};
 return rig;
}
/* Four weapon-specific legendary assemblies. These add small mounted plates and
   inlays to the existing model; they do not replace its silhouette, optic axis,
   muzzle anchor, moving magazine or combat mesh. Static parts are instanced. */
function buildPrototypeRig(T,key,host){
 var spec=LEGENDARY_PROTOTYPES[key];if(!spec)throw new Error('Unknown legendary prototype '+key);
 var grp=new T.Group();grp.name='Legendary-'+key+'-'+spec.title.replace(/\s+/g,'-');
 var Std=T.MeshStandardMaterial||T.MeshPhongMaterial;
 var metal=new Std({color:spec.metal,metalness:spec.metalness,roughness:spec.roughness});
 var ceramic=new Std({color:spec.polymer,metalness:.18,roughness:.48});
 var trim=new Std({color:spec.trim,metalness:.68,roughness:.29});
 var glow=new Std({color:spec.glow,emissive:spec.glow,emissiveIntensity:.18,metalness:.25,roughness:.28});
 var dark=new Std({color:spec.dark,metalness:.35,roughness:.63});
 var unit=new T.BoxGeometry(1,1,1),O=new T.Object3D(),batches=[],pumpGroup=null,core=null,reloadFill=null;
 function part(x,y,z,w,h,d,rz){return [x,y,z,w,h,d,0,0,rz||0];}
 function batch(name,mat,parts){if(!parts.length)return null;var m=new T.InstancedMesh(unit,mat,parts.length);m.name='legend-'+key+'-'+name;
  for(var i=0;i<parts.length;i++){var a=parts[i];O.position.set(a[0],a[1],a[2]);O.rotation.set(a[6]||0,a[7]||0,a[8]||0);O.scale.set(a[3],a[4],a[5]);O.updateMatrix();m.setMatrixAt(i,O.matrix);}
  m.instanceMatrix.needsUpdate=true;m.userData.finishBadge=true;grp.add(m);batches.push(m);return m;}
 function mesh(name,geo,mat,x,y,z,rx,ry,rz){var m=new T.Mesh(geo,mat);m.name='legend-'+key+'-'+name;m.position.set(x,y,z);m.rotation.set(rx||0,ry||0,rz||0);m.userData.finishBadge=true;grp.add(m);return m;}
 function sidePlate(name,surface,y,z,points,mat){var sh=new T.Shape();points.forEach(function(p,i){if(!i)sh.moveTo(p[0],p[1]);else sh.lineTo(p[0],p[1]);});sh.closePath();
  var geo=new T.ExtrudeGeometry(sh,{steps:1,depth:.0026,bevelEnabled:true,bevelSegments:1,bevelThickness:.0012,bevelSize:.0014,curveSegments:1});geo.computeVertexNormals();
  var m=new T.InstancedMesh(geo,mat,2);m.name='legend-'+key+'-'+name;m.userData.finishBadge=true;
  [-1,1].forEach(function(s){O.position.set(s*surface,y,z);O.rotation.set(0,s*Math.PI/2,0);O.scale.set(1,1,1);O.updateMatrix();m.setMatrixAt(s>0?1:0,O.matrix);});m.instanceMatrix.needsUpdate=true;grp.add(m);batches.push(m);return m;}
 var armor=[],poly=[],edges=[],inlays=[],hardware=[];
 if(key==='smg'){
  // Suppressed Vesper: segmented ceramic receiver cheek, ribbed suppressor collar,
  // and branching signal traces placed on the SMG's short body and shroud.
  sidePlate('faceted-circuit-cheeks',.029,.012,-.052,[[-.074,-.014],[-.068,.013],[-.052,.021],[.028,.020],[.062,.013],[.070,-.004],[.041,-.020],[-.045,-.019]],metal);
  [-1,1].forEach(function(s){poly.push(part(s*.031,.011,-.053,.0018,.031,.116));
   edges.push(part(s*.032,.034,-.052,.0016,.0025,.135),part(s*.032,-.009,-.052,.0016,.0025,.135));
   for(var i=0;i<5;i++)inlays.push(part(s*.030,.014,-.208-i*.028,.002,.008,.013));
   inlays.push(part(s*.033,.025,-.102,.002,.003,.058, s*.28),part(s*.033,.012,-.139,.002,.003,.032,-s*.4),part(s*.033,.003,-.105,.002,.003,.033,s*.5));
   hardware.push(part(s*.032,.012,-.045,.003,.007,.007),part(s*.032,.012,-.105,.003,.007,.007));
  });
  mesh('suppressor-collar-a',new T.TorusGeometry(.030,.0022,5,16),trim,0,.016,-.505);
  mesh('suppressor-collar-b',new T.TorusGeometry(.030,.0016,5,16),metal,0,.016,-.605);
  core=mesh('circuit-reactor',new T.OctahedronGeometry(.009,0),glow,.034,.013,-.145);core.scale.set(.8,1,.55);
 }else if(key==='breacher'){
  // Infernal Forge: machined receiver scales and a distinct, separately mounted
  // pump shroud. Pump decorations follow the existing animated pump group.
  sidePlate('forged-heat-scales',.026,.004,.025,[[-.076,-.021],[-.069,.019],[-.052,.026],[.038,.024],[.070,.012],[.060,-.022],[.025,-.027],[-.050,-.025]],metal);
  [-1,1].forEach(function(s){poly.push(part(s*.028,.005,.024,.0018,.032,.121));
   edges.push(part(s*.028,.029,.025,.0015,.002,.136),part(s*.028,-.021,.025,.0015,.002,.136));
   for(var i=0;i<3;i++)hardware.push(part(s*.029,.008,.078-i*.066,.0035,.006,.006));
  });
  pumpGroup=new T.Group();pumpGroup.name='legend-breacher-pump-follow';
  var shields=new T.InstancedMesh(new T.BoxGeometry(.0028,.027,.142),metal,2);shields.name='legend-breacher-pump-side-shields';shields.userData.finishBadge=true;
  var ribs=new T.InstancedMesh(unit,trim,8);ribs.name='legend-breacher-pump-vent-ribs';ribs.userData.finishBadge=true;
  [-1,1].forEach(function(s,side){O.position.set(s*.023,-.011,-.33);O.rotation.set(0,0,0);O.scale.set(1,1,1);O.updateMatrix();shields.setMatrixAt(side,O.matrix);
   for(var i=0;i<4;i++){O.position.set(s*.025,-.011,-.279-i*.034);O.scale.set(.002,.018,.004);O.updateMatrix();ribs.setMatrixAt(side*4+i,O.matrix);}
  });
  shields.instanceMatrix.needsUpdate=true;ribs.instanceMatrix.needsUpdate=true;pumpGroup.add(shields,ribs);
  var barrelRing=new T.Mesh(new T.TorusGeometry(.0168,.0018,5,14),trim);barrelRing.position.set(0,.022,-.688);barrelRing.userData.finishBadge=true;grp.add(barrelRing);
  core=mesh('forge-mark',new T.OctahedronGeometry(.008,0),glow,.030,.011,.075);core.rotation.z=Math.PI/4;core.scale.set(.65,.9,.45);
 }else if(key==='carbine'){
  // VR-18: satin split receiver plates, chamfered side rails, optic side caps
  // kept outside the transparent sight window, and a restrained muzzle band.
  sidePlate('split-vanguard-chassis',.034,.017,-.035,[[-.079,-.017],[-.071,.014],[-.052,.024],[-.018,.020],[.012,.015],[.067,.015],[.078,.005],[.055,-.019],[.018,-.024],[-.049,-.021]],metal);
  [-1,1].forEach(function(s){poly.push(part(s*.036,.017,-.035,.0018,.031,.128),part(s*.033,-.012,.065,.003,.021,.060));
   edges.push(part(s*.036,.040,-.035,.0016,.0025,.138),part(s*.036,-.005,-.035,.0016,.0025,.138));
   for(var i=0;i<4;i++)inlays.push(part(s*.034,.014,-.195-i*.033,.002,.007,.018));
   hardware.push(part(s*.036,.016,.011,.003,.006,.007),part(s*.036,.016,-.096,.003,.006,.007));
   // Outer optic cheeks frame the existing open lens without crossing its center.
   armor.push(part(s*.025,.125,-.059,.003,.014,.022));
  });
  for(var j=0;j<4;j++)edges.push(part(-.021+j*.014,.072,-.115,.008,.003,.019));
  var muzzle=new T.Mesh(new T.TorusGeometry(.020,.0017,5,16),trim);muzzle.position.set(0,.012,-.632);muzzle.userData.finishBadge=true;grp.add(muzzle);
  core=mesh('vanguard-index',new T.OctahedronGeometry(.008,0),glow,.037,.019,-.045);core.scale.set(.5,1,.32);
 }
 batch('receiver-armor',metal,armor);batch('ceramic-insets',ceramic,poly);batch('machined-edges',trim,edges);
 batch('signal-inlays',glow,inlays);batch('flush-hardware',dark,hardware);
 // A narrow reload indicator slides only in presentation time; the real reload
 // clock and magazine animation remain owned by the original weapon code.
 var reloadBaseZ=key==='smg'?-.047:key==='breacher'?.018:-.035;
 var reloadX=key==='breacher'?.029:.032;
 reloadFill=mesh('reload-charge-indicator',new T.BoxGeometry(.0018,.004,.052),glow,reloadX,.012,reloadBaseZ);
 reloadFill.visible=false;reloadFill.scale.z=.01;
 var st={t:0,hot:0,ping:0,reload:0,reloading:false,inspect:0,detail:'high',fx:'high'};
 function mount(root){root.add(grp);if(pumpGroup){if(root.userData&&root.userData.pump)root.userData.pump.add(pumpGroup);else grp.add(pumpGroup);}}
 function visible(v){grp.visible=!!v;if(pumpGroup)pumpGroup.visible=!!v;}
 return {group:grp,pumpGroup:pumpGroup,state:st,mount:mount,setVisible:visible,
  update:function(dt,o){o=o||{};st.t+=dt;st.fx=o.fx||st.fx;st.hot=Math.max(0,st.hot-dt*2.7);st.ping=Math.max(0,st.ping-dt*3.2);st.inspect=Math.max(0,st.inspect-dt*1.6);
   var reduced=st.fx==='low'||st.detail==='low',pulse=reduced?0:.5+.5*Math.sin(st.t*2.6),power=reduced?.10:.16+.14*pulse+st.hot*.18+st.ping*.10+st.inspect*.16;
   glow.emissiveIntensity=power;if(core){var sc=reduced?1:1+.08*pulse+.2*st.hot+.1*st.ping+.13*st.inspect;core.scale.set(.7*sc,1.0*sc,.5*sc);core.rotation.y=reduced?0:st.t*.7;}
   reloadFill.visible=st.reloading&&st.detail!=='low';if(st.reloading){var p=Math.max(0,Math.min(1,st.reload));reloadFill.scale.z=.012+.040*p;reloadFill.position.z=reloadBaseZ+(p-.5)*.04;}
  },
  setDetail:function(v){st.detail=v==='low'?'low':'high';},
  setReload:function(p,active){if(active){st.reloading=true;st.reload=Math.max(0,Math.min(1,p));}else{if(st.reloading&&st.reload>.85)st.ping=1;st.reloading=false;st.reload=0;reloadFill.visible=false;}},
  inspect:function(active){st.inspect=active?1:0;},fire:function(){st.hot=1;},hit:function(){st.ping=1;},kill:function(){st.ping=1;st.hot=1;},awaken:function(){st.hot=1;st.ping=1;}
 };
}
/* Complete viewmodel replacements for the four named Legendary firearms.
   These are original silhouettes in the existing gun coordinate system; the
   Factory firearm meshes are hidden while the replacement finish is active. */
function buildOriginalLegendaryRig(T,key,host){
 var spec=LEGENDARY_PROTOTYPES[key];if(!spec)throw new Error('Unknown replacement Legendary '+key);
 var grp=new T.Group();grp.name='Legendary-'+key+'-'+spec.title.replace(/\s+/g,'-')+'-replacement';
 grp.userData.sightlineLegendary={weapon:key,design:spec.title,source:'original-code-authored-replacement',replacesFactory:true};
 var Std=T.MeshStandardMaterial||T.MeshPhongMaterial;
 var metal=new Std({color:spec.metal,metalness:spec.metalness,roughness:spec.roughness});
 var ceramic=new Std({color:spec.polymer,metalness:.18,roughness:.56});
 var trim=new Std({color:spec.trim,metalness:.76,roughness:.32});
 var dark=new Std({color:spec.dark,metalness:.42,roughness:.72});
 var glow=new Std({color:spec.glow,emissive:spec.glow,emissiveIntensity:.95,metalness:.08,roughness:.22});
 var lens=new T.MeshBasicMaterial({color:spec.glow,transparent:true,opacity:.34,side:T.DoubleSide,depthWrite:false});
 var blackGlass=new T.MeshStandardMaterial({color:0x101922,metalness:.45,roughness:.12,transparent:true,opacity:.72,side:T.DoubleSide,depthWrite:false});
 var unit=new T.BoxGeometry(1,1,1),unitBeam=new T.CylinderGeometry(1,1,1,8,1,false),namePrefix='legendary-'+key+'-',boxBuckets=Object.create(null),beamBuckets=Object.create(null),batchMarker=new T.Object3D();
 function mark(o,name,parent){o.name=namePrefix+name;o.userData.finishBadge=true;(parent||grp).add(o);return o;}
 function box(name,w,h,d,x,y,z,mat,rz,parent){var par=parent||grp,tag=par.uuid+':'+mat.uuid,b=boxBuckets[tag]||(boxBuckets[tag]={parent:par,material:mat,parts:[]});b.parts.push({name:name,w:w,h:h,d:d,x:x,y:y,z:z,rz:rz||0});}
 function cylinder(name,r0,r1,len,x,y,z,mat,segments,parent){var m=new T.Mesh(new T.CylinderGeometry(r0,r1,len,segments||12,1,false),mat);m.rotation.x=Math.PI/2;m.position.set(x,y,z);return mark(m,name,parent);}
 function profile(name,side,centerZ,surface,points,mat,depth,parent){
  var sh=new T.Shape();points.forEach(function(p,i){var x=-side*p[0];if(!i)sh.moveTo(x,p[1]);else sh.lineTo(x,p[1]);});sh.closePath();
  var d=depth||.007,geo=new T.ExtrudeGeometry(sh,{steps:1,depth:d,bevelEnabled:true,bevelSegments:2,bevelThickness:.0015,bevelSize:.0015,curveSegments:3});
  geo.translate(0,0,-d/2);geo.computeVertexNormals();var m=new T.Mesh(geo,mat);m.position.set(side*surface,0,centerZ);m.rotation.y=side*Math.PI/2;return mark(m,name,parent);
 }
 function beam(name,a,b,r,mat,parent){var va=new T.Vector3(a[0],a[1],a[2]),vb=new T.Vector3(b[0],b[1],b[2]),delta=new T.Vector3().subVectors(vb,va),len=delta.length(),par=parent||grp,tag=par.uuid+':'+mat.uuid,b=beamBuckets[tag]||(beamBuckets[tag]={parent:par,material:mat,parts:[]});b.parts.push({name:name,x:(va.x+vb.x)*.5,y:(va.y+vb.y)*.5,z:(va.z+vb.z)*.5,dx:delta.x/len,dy:delta.y/len,dz:delta.z/len,r:r,len:len});}
 function torus(name,r,tube,x,y,z,mat,rotY,parent){var m=new T.Mesh(new T.TorusGeometry(r,tube,6,20),mat);m.position.set(x,y,z);m.rotation.y=rotY||0;return mark(m,name,parent);}
 var muzzleZ=host&&host.userData&&host.userData.muzzle?host.userData.muzzle.position.z:-.72;
 var foreStart=muzzleZ+.085,foreEnd=Math.min(-.25,muzzleZ+.34),foreLen=Math.max(.16,foreEnd-foreStart),foreZ=(foreStart+foreEnd)*.5;
 var recFront=foreEnd-.025,recRear=.105,recZ=(recFront+recRear)*.5,recLen=recRear-recFront;
 var width=key==='breacher'?.088:key==='carbine'?.074:key==='stinger'?.072:.068;
 box('forged-receiver-core',width,.066,recLen,0,.002,recZ,metal,0);
 var receiverProfiles={
  smg:[[-.24,-.026],[-.21,.010],[-.16,.045],[-.05,.047],[.14,.031],[.22,.010],[.19,-.025],[.05,-.045],[-.08,-.041]],
  breacher:[[-.24,-.030],[-.22,.020],[-.16,.049],[.12,.047],[.23,.022],[.19,-.024],[.03,-.041],[-.15,-.036]],
  carbine:[[-.24,-.030],[-.20,.022],[-.13,.050],[.14,.046],[.23,.020],[.20,-.020],[.06,-.043],[-.10,-.034]],
  stinger:[[-.252,-.025],[-.232,.020],[-.190,.047],[-.128,.049],[-.080,.034],[.112,.038],[.213,.022],[.239,-.002],[.202,-.027],[.126,-.040],[.018,-.036],[-.094,-.043],[-.195,-.036]]
 }[key];
 [-1,1].forEach(function(s){
  profile('signature-receiver-shell-'+s,s,recZ,width*.47,receiverProfiles,ceramic,.008);
  profile('receiver-machined-bevel-'+s,s,recZ,width*.50,receiverProfiles.map(function(p){return [p[0]*.91,p[1]*.82];}),trim,.0026);
 });
 if(key==='carbine'){
  // A stepped titanium receiver and exposed carrier track give the Vanguard a
  // recognizable split upper without changing the host rifle's grip or anchors.
  [-1,1].forEach(function(s){
   profile('vanguard-split-titanium-cheek-'+s,s,recZ,width*.515,[[-.205,-.018],[-.183,.029],[-.116,.052],[.118,.045],[.205,.014],[.174,-.021],[.055,-.035],[-.112,-.031]],trim,.0038);
   profile('vanguard-ceramic-receiver-inset-'+s,s,recZ,width*.531,[[-.142,-.012],[-.116,.026],[-.064,.038],[.103,.031],[.151,.006],[.128,-.018],[.025,-.027],[-.085,-.025]],ceramic,.0024);
   for(var vi=0;vi<4;vi++){
    var vz=foreStart+.060+vi*Math.max(.014,(foreLen-.120)/3);
    box('vanguard-handguard-vent-'+s+'-'+vi,.0035,.009,.018,s*(width*.514),.010,vz,dark,0);
    box('vanguard-vent-index-'+s+'-'+vi,.0025,.002,.009,s*(width*.518),.019,vz,trim,0);
   }
   box('vanguard-receiver-fastener-'+s,.003,.006,.006,s*(width*.536),.006,recZ-.105,dark,0);
  });
  box('vanguard-bolt-track',.004,.010,.118,width*.526,.021,recZ-.018,dark,0);
 }
 if(key==='stinger'){
  // Sulfur Wasp's split receiver and exposed hex-cell pack establish a
  // replacement silhouette rather than relying on the old factory body.
  [-1,1].forEach(function(s){
   profile('sulfur-split-receiver-cheek-'+s,s,recZ,width*.516,[[-.222,-.018],[-.207,.023],[-.166,.041],[-.103,.039],[-.070,.025],[.120,.031],[.200,.015],[.218,-.010],[.166,-.027],[.038,-.029],[-.092,-.035],[-.184,-.030]],trim,.0038);
   profile('sulfur-ceramic-chamber-inset-'+s,s,recZ,width*.531,[[-.159,-.012],[-.144,.020],[-.100,.029],[.060,.024],[.132,.009],[.113,-.019],[-.035,-.025],[-.126,-.022]],ceramic,.0024);
   for(var sv=0;sv<4;sv++){
    var ventZ=foreStart+.046+sv*Math.max(.026,(foreLen-.105)/3);
    box('sulfur-fore-end-vent-'+s+'-'+sv,.003,.010,.020,s*(width*.523),.010,ventZ,dark,0);
    box('sulfur-vent-lip-'+s+'-'+sv,.0022,.0022,.022,s*(width*.526),.010,ventZ,trim,0);
   }
   box('sulfur-action-guide-'+s,.003,.006,.104,s*(width*.535),.022,recZ-.020,dark,0);
   box('sulfur-retainer-pin-'+s,.0035,.005,.005,s*(width*.541),.010,recZ-.142,trim,0);
  });
  var hexCellGeo=new T.CylinderGeometry(.0072,.0072,.0022,6,1,false),hexCoreGeo=new T.CylinderGeometry(.0047,.0047,.0024,6,1,false);
  var hexFrames=mark(new T.InstancedMesh(hexCellGeo,trim,8),'sulfur-receiver-hex-cell-rims');
  var hexCores=mark(new T.InstancedMesh(hexCoreGeo,dark,8),'sulfur-receiver-hex-cell-insets'),cellIndex=0;
  [-1,1].forEach(function(side){for(var hi=0;hi<4;hi++){
   var y=.006+(hi%2)*.013,z=recZ-.105+hi*.039;
   batchMarker.position.set(side*(width*.540),y,z);batchMarker.rotation.set(0,0,side*Math.PI/2);batchMarker.scale.set(1,1,1);batchMarker.updateMatrix();hexFrames.setMatrixAt(cellIndex,batchMarker.matrix);
   batchMarker.position.x=side*(width*.542);batchMarker.updateMatrix();hexCores.setMatrixAt(cellIndex,batchMarker.matrix);cellIndex++;
  }});
  hexFrames.instanceMatrix.needsUpdate=true;hexCores.instanceMatrix.needsUpdate=true;
 }
 box('upper-action-cover',width*.72,.014,recLen*.82,0,.045,recZ,dark,0);
 box('lower-trigger-housing',width*.68,.022,recLen*.44,0,-.040,recZ+.035,ceramic,0);
 var carbineBoltGroup=null,carbinePortCover=null,stingerBoltGroup=null,stingerPortCover=null,stingerPiston=null;
 if(key==='carbine'){
  carbineBoltGroup=new T.Group();carbineBoltGroup.position.set(width*.50,.020,recZ-.010);mark(carbineBoltGroup,'vanguard-moving-bolt-carrier');
  var bolt=new T.Mesh(new T.BoxGeometry(.010,.012,.066),metal);mark(bolt,'vanguard-bolt-body',carbineBoltGroup);bolt.position.set(.003,0,0);
  var lug=new T.Mesh(new T.BoxGeometry(.018,.004,.018),trim);mark(lug,'vanguard-charging-lug',carbineBoltGroup);lug.position.set(.010,.002,.020);
  carbinePortCover=new T.Group();carbinePortCover.position.set(width*.514,.028,recZ-.020);mark(carbinePortCover,'vanguard-ejection-port-hinge');
  var port=new T.Mesh(new T.BoxGeometry(.004,.020,.058),ceramic);mark(port,'vanguard-ejection-port-cover',carbinePortCover);port.position.set(0,-.004,0);
  var portEdge=new T.Mesh(new T.BoxGeometry(.002,.002,.048),trim);mark(portEdge,'vanguard-port-cover-edge',carbinePortCover);portEdge.position.set(.002,.005,0);
 }
 if(key==='stinger'){
  stingerBoltGroup=new T.Group();stingerBoltGroup.position.set(width*.50,.026,recZ-.012);mark(stingerBoltGroup,'sulfur-short-stroke-carrier');
  cylinder('sulfur-carrier-body',.0052,.0052,.068,.002,0,0,metal,8,stingerBoltGroup);
  box('sulfur-cocking-shoe',.016,.006,.020,.008,.003,.018,trim,0,stingerBoltGroup);
  box('sulfur-extractor',.008,.004,.010,.002,-.005,-.018,dark,0,stingerBoltGroup);
  stingerPortCover=new T.Group();stingerPortCover.position.set(width*.514,.027,recZ-.022);mark(stingerPortCover,'sulfur-ejection-port-hinge');
  box('sulfur-ejection-port-flap',.003,.020,.054,0,-.003,0,ceramic,0,stingerPortCover);
  box('sulfur-ejection-port-safety-edge',.002,.002,.046,.002,.006,0,trim,0,stingerPortCover);
  stingerPiston=new T.Group();stingerPiston.position.set(0,.038,foreZ);mark(stingerPiston,'sulfur-exposed-gas-piston');
  cylinder('sulfur-piston-rod',.0042,.0042,foreLen*.64,0,0,0,metal,7,stingerPiston);
  [-.28,.28].forEach(function(q,qi){torus('sulfur-piston-collar-'+qi,.006,.0014,0,0,q*foreLen*.64,trim,Math.PI/2,stingerPiston);});
 }
 // Full handguard shell and continuous barrel replace the base furniture.
 if(key==='stinger')box('sulfur-centered-handguard-core',width*.70,.052,foreLen,0,.008,foreZ,ceramic,0);
 else box('full-length-vented-handguard',width,.058,foreLen,0,.012,foreZ,ceramic,0);
 [-1,1].forEach(function(s){
  var surf=width*.50;
   if(key==='stinger')profile('sulfur-tapered-hex-fore-end-'+s,s,foreZ,surf,[[-foreLen*.54,-.020],[-foreLen*.48,.015],[-foreLen*.32,.032],[foreLen*.34,.030],[foreLen*.51,.010],[foreLen*.43,-.025],[foreLen*.02,-.033],[-foreLen*.36,-.030]],metal,.007);
   else if(key==='smg')profile('circuit-handguard-armor-'+s,s,foreZ,surf,[[ -foreLen*.53,-.010],[-foreLen*.42,.031],[foreLen*.43,.031],[foreLen*.53,-.005],[foreLen*.36,-.029],[-foreLen*.33,-.029]],metal,.006);
  else if(key==='breacher')profile('forged-vented-pump-jacket-'+s,s,foreZ,surf,[[-foreLen*.52,-.022],[-foreLen*.48,.015],[-foreLen*.32,.033],[foreLen*.37,.031],[foreLen*.51,.014],[foreLen*.45,-.028],[0,-.035]],metal,.007);
  else if(key==='carbine')profile('vanguard-tapered-freefloat-armor-'+s,s,foreZ,surf,[[-foreLen*.54,-.021],[-foreLen*.46,.021],[-foreLen*.32,.034],[foreLen*.27,.030],[foreLen*.51,.012],[foreLen*.44,-.026],[foreLen*.05,-.036],[-foreLen*.36,-.032]],metal,.008);
  else profile('vanguard-freefloat-handguard-'+s,s,foreZ,surf,[[-foreLen*.53,-.024],[-foreLen*.48,.018],[-foreLen*.31,.029],[foreLen*.40,.028],[foreLen*.52,.014],[foreLen*.48,-.020],[0,-.033]],metal,.006);
 });
 var barrelRear=recFront+.02,barrelLen=Math.max(.18,barrelRear-muzzleZ),barrelZ=(barrelRear+muzzleZ)*.5;
 cylinder('continuous-inner-barrel',key==='breacher'?.014:.010,key==='breacher'?.014:.010,barrelLen,0,.020,barrelZ,trim,12);
 // Separate silhouette treatments for each muzzle and fore-end.
 if(key==='smg'){
  cylinder('induction-suppressor-sleeve',.030,.027,.13,0,.021,muzzleZ-.045,metal,12);
  [-.094,-.052,.006].forEach(function(o,i){torus('suppressor-lock-ring-'+i,.028-i*.001,.002,0,.021,muzzleZ+o,trim,Math.PI/2);});
 }else if(key==='breacher'){
  cylinder('multiport-forge-brake',.033,.026,.070,0,.020,muzzleZ-.020,metal,10);
  [-1,1].forEach(function(s){box('brake-side-port-'+s,.004,.018,.040,s*.027,.020,muzzleZ-.020,dark,0);});
  [-1,0,1].forEach(function(s){box('flash-hider-prong-'+s,.004,.010,.075,s*.014,.020,muzzleZ-.030,trim,0);});
 }else if(key==='carbine'){
  cylinder('vanguard-triport-compensator',.023,.019,.066,0,.020,muzzleZ-.018,metal,12);
  [-1,1].forEach(function(s){
   box('vanguard-compensator-port-'+s,.006,.015,.026,s*.017,.020,muzzleZ-.018,dark,0);
   torus('vanguard-compensator-band-'+s,.021,.0017,0,.020,muzzleZ-.039-s*.009,trim,Math.PI/2);
  });
 }else if(key==='stinger'){
  cylinder('sulfur-hex-bore-brake',.023,.019,.060,0,.020,muzzleZ-.018,metal,6);
  [-1,1].forEach(function(s){
   box('sulfur-relief-port-'+s,.004,.012,.026,s*.018,.025,muzzleZ-.018,dark,0);
   torus('sulfur-brake-amber-band-'+s,.020,.0016,0,.020,muzzleZ-.044-s*.006,trim,Math.PI/2);
  });
 }else{
  cylinder('titanium-compensator',.024,.018,.062,0,.020,muzzleZ-.018,metal,10);
  [-1,1].forEach(function(s){box('compensator-port-'+s,.006,.020,.026,s*.018,.020,muzzleZ-.018,dark,0);});
 }
 // Shared top rail, but each skin's handguard and optic have a distinct profile.
 var railCount=Math.max(5,Math.min(10,Math.round(foreLen/.035))),railZs=[];
 for(var ri=0;ri<railCount;ri++)railZs.push(foreStart+.018+ri*Math.max(.006,(foreLen-.036)/Math.max(1,railCount-1)));
 railZs.forEach(function(z,i){box('continuous-top-rail-slot-'+i,width*.65,.004,.010,0,.051,z,trim,0);});
 box('upper-optic-rail',width*.56,.006,.23,0,.054,recZ-.025,dark,0);
 // Skin-specific stock silhouettes.
  if(key==='smg'||key==='carbine'||key==='stinger'){
  var stockZ=.43,rootZ=.12,stockY=.006;
  if(key==='smg'){
   [-1,1].forEach(function(s){beam('phantom-open-stock-rail-'+s,[s*.022,stockY,rootZ],[s*.034,.020,stockZ-.05],.006,metal);beam('phantom-stock-diagonal-'+s,[s*.034,.020,stockZ-.05],[s*.022,-.014,rootZ+.08],.005,trim);});
   beam('phantom-stock-crossbar',[ -.032,.020,stockZ-.05],[.032,.020,stockZ-.05],.006,metal);
   box('phantom-shoulder-pad',.074,.095,.025,0,.004,stockZ,ceramic,0);
  }else if(key==='stinger'){
   [-1,1].forEach(function(s){beam('sulfur-skeletal-stock-upper-'+s,[s*.023,.018,.125],[s*.034,.020,.385],.0065,metal);beam('sulfur-skeletal-stock-lower-'+s,[s*.023,-.042,.145],[s*.034,.020,.385],.0055,trim);});
   beam('sulfur-stock-cheek-rest',[-.031,.038,.312],[.031,.038,.312],.006,ceramic);
   beam('sulfur-stock-crossbar',[-.034,-.003,.252],[.034,-.003,.252],.0045,dark);
   box('sulfur-rubber-recoil-pad',.070,.096,.024,0,.010,.397,dark,0);
  }else{
   [-1,1].forEach(function(s){beam('vanguard-triangle-stock-upper-'+s,[s*.025,.025,rootZ],[s*.037,.018,stockZ-.055],.006,trim);beam('vanguard-triangle-stock-lower-'+s,[s*.025,-.045,rootZ+.035],[s*.037,.018,stockZ-.055],.006,metal);});
   beam('vanguard-stock-spine',[0,-.045,rootZ+.035],[0,.025,rootZ],.005,dark);
   box('vanguard-recoil-pad',.080,.112,.026,0,-.010,stockZ,ceramic,0);
  }
 }else{
  box('forge-fixed-stock-neck',.058,.054,.20,0,.008,.205,metal,0);
  profile('forge-stock-cheek-shell-left',-1,.305,.034,[[-.10,-.048],[-.08,.040],[.075,.042],[.13,.012],[.11,-.050]],ceramic,.012);
  profile('forge-stock-cheek-shell-right',1,.305,.034,[[-.10,-.048],[-.08,.040],[.075,.042],[.13,.012],[.11,-.050]],ceramic,.012);
  box('forge-rubber-buttplate',.084,.126,.026,0,-.010,.43,dark,0);
 }
 // Distinct grip construction below the trigger line.
 box('ergonomic-pistol-grip',.045,.11,.072,0,-.092,.060,ceramic,key==='breacher'?.13:-.16);
 [-1,1].forEach(function(s){profile('grip-checkered-side-'+s,s,.060,.024,[[-.034,-.13],[.020,-.13],[.042,-.047],[-.024,-.038]],dark,.002);});
 var guard=new T.Mesh(new T.TorusGeometry(.025,.0022,6,18),trim);guard.scale.set(.82,1.25,1);guard.position.set(0,-.060,.005);mark(guard,'trigger-guard');
 // Receiver identity hardware, vents, fasteners and non-repeating energy chamber.
 var coreY=.008,coreZ=recZ-.035,coreX=width*.51;
 var chamber=new T.Group();mark(chamber,'signature-reactor-cage');
  var crystal=key==='stinger'?new T.CylinderGeometry(.017,.017,.048,6,1,false):key==='breacher'?new T.CylinderGeometry(.017,.017,.060,8):key==='carbine'?new T.OctahedronGeometry(.022,0):key==='smg'?new T.TorusKnotGeometry(.020,.004,40,6,2,3):new T.DodecahedronGeometry(.023,0);
 var cell=new T.Mesh(crystal,glow);cell.position.set(coreX,coreY,coreZ);cell.scale.set(1,.78,1.22);mark(cell,'signature-energy-cell',chamber);
 var rotor=torus('reactor-retaining-rim',.027,.0028,coreX,coreY,coreZ,trim,Math.PI/2,chamber);
 [-1,1].forEach(function(s){box('reactor-cage-rail-'+s,.005,.052,.070,s*(coreX+.004),coreY,coreZ,dark,0,chamber);});
 if(key==='smg'){
  [-1,1].forEach(function(s){beam('circuit-induction-loop-'+s,[s*.043,.010,coreZ+.035],[s*.043,.010,coreZ-.035],.003,glow,chamber);});
 }else if(key==='breacher'){
  [-1,1].forEach(function(s){box('forge-chamber-heat-shield-'+s,.006,.060,.078,s*(coreX+.009),coreY,coreZ,metal,0,chamber);});
  }else if(key==='stinger'){
   [-1,1].forEach(function(s){beam('sulfur-core-retainer-'+s,[s*.037,-.018,coreZ-.026],[s*.037,.034,coreZ+.026],.003,trim,chamber);});
 }else{
  [-1,1].forEach(function(s){beam('vanguard-crystal-retainer-'+s,[s*.040,-.021,coreZ-.028],[s*.040,.030,coreZ+.028],.003,trim,chamber);});
 }
 // Large identity windows reveal a protected core; reload shutters move on the
 // existing reload clock without delaying or changing the actual reload.
 var shutters=[];
 [-1,1].forEach(function(s){var hinge=new T.Group();hinge.position.set(s*(coreX+.010),coreY,coreZ);mark(hinge,'reactor-shutter-hinge-'+s);var leaf=new T.Mesh(new T.BoxGeometry(.006,.052,.066),metal);leaf.position.x=-s*.004;mark(leaf,'reactor-shutter-leaf-'+s,hinge);shutters.push([hinge,s]);});
 var magShells=[];
 function makeMagazine(parent,label){var assembly=new T.Group();assembly.name=namePrefix+label;parent.add(assembly);
  var y=key==='smg'?-.132:-.142,z=key==='smg'?.020:-.080;
   var pts=key==='stinger'?[[-.057,-.211],[-.050,-.060],[-.034,-.040],[.038,-.045],[.055,-.100],[.067,-.205],[.038,-.227],[-.040,-.225]]:
   key==='breacher'?[[-.075,-.215],[-.071,-.042],[.062,-.042],[.068,-.215],[.046,-.230],[-.050,-.230]]:
   key==='smg'?[[-.042,-.190],[-.040,-.046],[.047,-.046],[.051,-.190],[.035,-.206],[-.030,-.206]]:
   [[-.052,-.213],[-.050,-.048],[.049,-.048],[.052,-.213],[.035,-.226],[-.034,-.226]];
  if(key==='breacher'){
   // Shotgun's visible under-barrel tube is its signature feed, not a rifle mag.
   cylinder('forge-tubular-magazine',.018,.018,.39,0,-.026,(muzzleZ+recFront)*.5,metal,10,assembly);
   [-.14,-.28].forEach(function(d,i){torus('forge-tube-retainer-'+i,.018,.002,0,-.026,(muzzleZ+recFront)*.5+d,trim,Math.PI/2,assembly);});
  }else{
   [-1,1].forEach(function(s){profile('custom-magazine-shell-'+s,s,z,.025,pts,ceramic,.005,assembly);});
   box('magazine-spine',.054,.010,.15,0,y-.094,z,trim,0,assembly);
    [-1,1].forEach(function(s){box('magazine-reinforcement-'+s,.003,.008,.12,s*.027,y-.105,z,metal,0,assembly);});
    if(key==='stinger')[-1,1].forEach(function(s){for(var sf=0;sf<3;sf++)box('sulfur-magazine-rivet-'+s+'-'+sf,.0035,.004,.004,s*.029,y-.055,z-.135+sf*.055,dark,0,assembly);});
  }
  assembly.visible=true;magShells.push(assembly);return assembly;
 }
 var mag=host&&host.userData&&host.userData.mag,fresh=host&&host.userData&&host.userData.fresh;
 if(key==='breacher')makeMagazine(grp,'infernal-tube-magazine');
 else if(mag){makeMagazine(mag,'replacement-magazine');if(fresh)makeMagazine(fresh,'replacement-magazine-hand');}
 else makeMagazine(grp,'fixed-magazine');
 var pumpAssembly=null;
 if(key==='breacher'){
  pumpAssembly=new T.Group();pumpAssembly.name=namePrefix+'animated-forge-pump';
  var pumpParent=host&&host.userData&&host.userData.pump;if(pumpParent)pumpParent.add(pumpAssembly);else grp.add(pumpAssembly);
  box('forged-pump-foregrip',.090,.064,Math.max(.15,foreLen*.56),0,-.025,foreZ,ceramic,0,pumpAssembly);
  [-1,1].forEach(function(s){box('pump-heat-fin-'+s,.005,.034,Math.max(.14,foreLen*.52),s*.047,-.014,foreZ,trim,0,pumpAssembly);});
  for(var fi=0;fi<5;fi++)box('pump-grip-channel-'+fi,.092,.003,.006,0,-.055,foreZ-.065+fi*.032,dark,0,pumpAssembly);
 }
 // The optics sit on the established sight line and keep the game reticle at
 // center. Each housing/window is distinct and never changes the camera ray.
 var opticGroup=new T.Group();mark(opticGroup,'signature-optic-assembly');
 var sightY=host&&host.userData&&host.userData.sightY||.105,optZ=recZ-.025;
  box('optic-mount-foot',key==='stinger'?.036:.048,key==='stinger'?.009:.012,.088,0,sightY-(key==='stinger'?.040:.052),optZ,trim,0,opticGroup);
 if(key==='carbine'){
  // Compact open emitter optic: the sight line remains exactly at the host's
  // calibrated sightY and the center stays clear for ADS targets.
  box('vanguard-holo-frame-left',.004,.045,.052,-.023,sightY,optZ,metal,0,opticGroup);
  box('vanguard-holo-frame-right',.004,.045,.052,.023,sightY,optZ,metal,0,opticGroup);
  box('vanguard-holo-hood',.050,.004,.054,0,sightY+.022,optZ,trim,0,opticGroup);
  box('vanguard-holo-emitter-base',.050,.004,.046,0,sightY-.022,optZ,dark,0,opticGroup);
  box('vanguard-holo-rear-guard',.004,.030,.008,0,sightY,optZ+.026,trim,0,opticGroup);
  var pane=new T.Mesh(new T.PlaneGeometry(.036,.034),lens);pane.position.set(0,sightY,optZ-.021);mark(pane,'vanguard-holo-window',opticGroup);pane.userData.legendNoWorldOverlay=true;
  var emitter=new T.Mesh(new T.TorusGeometry(.0048,.0012,4,12),new T.MeshBasicMaterial({color:spec.flash,transparent:true,opacity:.8,depthWrite:false}));emitter.position.set(-.014,sightY+.010,optZ-.028);mark(emitter,'vanguard-holo-emitter',opticGroup);emitter.userData.legendNoWorldOverlay=true;
  }else if(key==='stinger'){
   // Compact open rear notch and protected front blade; the center of the
   // host sight line remains completely clear for both the game reticle and ADS.
   [-1,1].forEach(function(s){box('sulfur-open-rear-notch-post-'+s,.0035,.032,.009,s*.016,sightY,optZ+.018,metal,0,opticGroup);});
   box('sulfur-rear-notch-crown',.038,.0035,.009,0,sightY+.015,optZ+.018,trim,0,opticGroup);
   box('sulfur-front-sight-blade',.004,.020,.009,0,sightY,optZ-.172,trim,0,opticGroup);
   box('sulfur-front-sight-protector-left',.0028,.013,.009,-.009,sightY+.004,optZ-.172,metal,0,opticGroup);
   box('sulfur-front-sight-protector-right',.0028,.013,.009,.009,sightY+.004,optZ-.172,metal,0,opticGroup);
  }else{
  var windowH=key==='breacher'?.044:.052,windowW=key==='smg'?.055:.048;
  box('optic-outer-cheek-left',.006,windowH,.050,-windowW*.46,sightY,optZ,metal,0,opticGroup);
  box('optic-outer-cheek-right',.006,windowH,.050,windowW*.46,sightY,optZ,metal,0,opticGroup);
  box('optic-hood-top',windowW,.006,.050,0,sightY+windowH*.5,optZ,trim,0,opticGroup);
  box('optic-hood-bottom',windowW,.006,.050,0,sightY-windowH*.5,optZ,trim,0,opticGroup);
  if(key==='smg')box('phantom-sight-hood',.076,.064,.065,0,sightY,optZ-.008,dark,0,opticGroup);
  if(key==='breacher')[-1,1].forEach(function(s){box('forge-sight-heat-wing-'+s,.010,.064,.060,s*.040,sightY,optZ,trim,0,opticGroup);});
  var pane=new T.Mesh(new T.PlaneGeometry(.034,.034),lens);pane.position.set(0,sightY,optZ-.029);mark(pane,'optic-lens',opticGroup);pane.userData.legendNoWorldOverlay=true;
 }
  if(key!=='stinger'){var reticle=new T.Mesh(new T.RingGeometry(.0025,.0036,16),new T.MeshBasicMaterial({color:spec.flash,transparent:true,opacity:.86,depthWrite:false}));reticle.position.set(0,sightY,optZ-.034);mark(reticle,'optic-reticle',opticGroup);reticle.userData.legendNoWorldOverlay=true;}
 opticGroup.userData.sightY=sightY;
 var glowCanvas=glowTexture(),glowMap=glowCanvas&&T.CanvasTexture?new T.CanvasTexture(glowCanvas):null;
 var reactorGlow=new T.Sprite(new T.SpriteMaterial({map:glowMap,color:spec.glow,transparent:true,opacity:.2,blending:T.AdditiveBlending,depthWrite:false}));
 reactorGlow.position.set(coreX*1.48,coreY,coreZ);reactorGlow.scale.set(.11,.075,1);mark(reactorGlow,'reactor-light-scatter');
 var state={t:0,hot:0,hit:0,kill:0,reload:0,reloading:false,cycle:0,inspect:0,inspectTarget:0,detail:'high',fx:'high'};
 function flushBatches(){
  Object.keys(boxBuckets).forEach(function(tag,bi){var b=boxBuckets[tag],inst=new T.InstancedMesh(unit,b.material,b.parts.length);inst.name=namePrefix+'batched-boxes-'+bi;inst.userData.finishBadge=true;inst.userData.designDetails=b.parts.map(function(p){return p.name;});
   b.parts.forEach(function(p,i){batchMarker.position.set(p.x,p.y,p.z);batchMarker.rotation.set(0,0,p.rz);batchMarker.scale.set(p.w,p.h,p.d);batchMarker.updateMatrix();inst.setMatrixAt(i,batchMarker.matrix);});inst.instanceMatrix.needsUpdate=true;b.parent.add(inst);
  });
  Object.keys(beamBuckets).forEach(function(tag,bi){var b=beamBuckets[tag],inst=new T.InstancedMesh(unitBeam,b.material,b.parts.length);inst.name=namePrefix+'batched-beams-'+bi;inst.userData.finishBadge=true;inst.userData.designDetails=b.parts.map(function(p){return p.name;});
   b.parts.forEach(function(p,i){batchMarker.position.set(p.x,p.y,p.z);batchMarker.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(p.dx,p.dy,p.dz));batchMarker.scale.set(p.r,p.len,p.r);batchMarker.updateMatrix();inst.setMatrixAt(i,batchMarker.matrix);});inst.instanceMatrix.needsUpdate=true;b.parent.add(inst);
  });
 }
 flushBatches();
 function updateShutters(open){for(var i=0;i<shutters.length;i++)shutters[i][0].rotation.z=shutters[i][1]*(.16+.54*open);}
 updateShutters(0);
 function setVisible(v){grp.visible=!!v;magShells.forEach(function(m){m.visible=!!v;});if(pumpAssembly)pumpAssembly.visible=!!v;}
 return {group:grp,state:state,replacesBase:true,magazineDecor:magShells,pumpGroup:pumpAssembly,opticGroup:opticGroup,
  mount:function(root){root.add(grp);},setVisible:setVisible,setOpticVisible:function(v){opticGroup.visible=!!v;},
  update:function(dt,o){o=o||{};state.t+=dt;state.fx=o.fx||state.fx;state.detail=o.detail||state.detail;
   state.hot=Math.max(0,state.hot-dt*2.6);state.hit=Math.max(0,state.hit-dt*3.5);state.kill=Math.max(0,state.kill-dt*2.1);
   if(carbineBoltGroup||stingerBoltGroup){state.cycle=Math.max(0,state.cycle-dt*8.5);state.inspect+=(state.inspectTarget-state.inspect)*Math.min(1,dt*7);}
   var reduced=state.fx==='low'||state.detail==='low',pulse=reduced?.5:.5+.5*Math.sin(state.t*(key==='breacher'?5.1:3.2));
   glow.emissiveIntensity=reduced?.40:.72+.52*pulse+state.hot*.42+state.hit*.55+state.kill*.38;
   rotor.rotation.x=reduced?0:state.t*(key==='smg'?3.8:key==='breacher'?1.7:2.9);
   cell.rotation.y=reduced?0:state.t*(key==='breacher'?.8:1.15);cell.scale.set(1+.08*pulse, .78+.10*pulse, 1.22+.08*pulse);
   reactorGlow.visible=!reduced;reactorGlow.material.opacity=reduced?0:.12+.18*pulse+.14*state.hot+.12*state.hit+.15*state.kill;
   var q=state.reloading?Math.max(0,Math.min(1,state.reload)):0,open=state.reloading?Math.max(0,Math.min(1,(q-.16)/.18))*(1-Math.max(0,Math.min(1,(q-.70)/.20))):0;
   updateShutters(open);if(pumpAssembly&&state.reloading)pumpAssembly.rotation.x=Math.sin(q*Math.PI)*.035;
   if(carbineBoltGroup){var held=state.reloading&&q>.18&&q<.72?1:0;carbineBoltGroup.position.z=recZ-.010+.020*Math.max(state.cycle,held)+.007*state.inspect;if(carbinePortCover)carbinePortCover.rotation.y=-.34*Math.max(state.inspect,held*.5);}
   if(stingerBoltGroup){var sulfurHeld=state.reloading&&q>.20&&q<.74?1:0;stingerBoltGroup.position.z=recZ-.012+.017*Math.max(state.cycle,sulfurHeld)+.006*state.inspect;if(stingerPortCover)stingerPortCover.rotation.z=.40*Math.max(state.inspect,sulfurHeld*.55);if(stingerPiston)stingerPiston.position.z=foreZ+.006*Math.max(state.cycle,sulfurHeld);}
  },
  setDetail:function(v){state.detail=v==='low'?'low':'high';},
  setReload:function(p,active){state.reloading=!!active;state.reload=active?Math.max(0,Math.min(1,p)):0;if(!active&&pumpAssembly)pumpAssembly.rotation.x=0;},
  inspect:function(active){if(carbineBoltGroup||stingerBoltGroup)state.inspectTarget=active?1:0;state.hot=active?Math.max(state.hot,.45):state.hot;},
  fire:function(){state.hot=1;if(carbineBoltGroup||stingerBoltGroup){state.cycle=1;state.inspectTarget=0;}},hit:function(){state.hit=1;},kill:function(){state.kill=1;state.hot=1;},awaken:function(){state.hot=1;state.hit=1;}
 };
}
function verifiedLegendaryPack(key){var sp=legendarySpec(key),pack=sp&&sp.pack&&typeof window!=='undefined'?window[sp.pack]:null;return pack&&pack.weapon===key&&pack.finish&&pack.finish.name===sp.title&&typeof pack.buildRig==='function'?pack:null;}
function buildLegendaryRig(T,key,host){if(!LEGEND_WEAPONS[key])throw new Error('Legendary source is not verified for '+key);var sp=legendarySpec(key),pack=verifiedLegendaryPack(key);if(pack)return pack.buildRig(T,host,sp);if(key==='rook117')throw new Error('Contour Relay pack unavailable');if(sp&&sp.overlay&&typeof SightlineLegendaryOverlay!=='undefined')return SightlineLegendaryOverlay.buildRig(T,key,host,sp);return key==='longbow'?buildRig(T):buildOriginalLegendaryRig(T,key,host);}
function legendarySpec(key){return key==='rook117'?globalThis.SightlineContourRelay?.spec||null:LEGENDARY_PROTOTYPES[key]||null;}
/* ---------- lightning bolts (tracers) ---------- */
function createBolts(THREE,scene){
 var LAYERS=[[0xffffff,1],[0x6fe9ff,.75],[0xffd36b,.55]],active=[],i,j,N=24;
 function mkBolt(){var b={lines:[],ttl:0,max:1,a:new THREE.Vector3(),b:new THREE.Vector3(),amp:.3,re:0,R:new Float32Array(48)};
  LAYERS.forEach(function(L){var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*3),3));
   var l=new THREE.Line(g,new THREE.LineBasicMaterial({color:L[0],transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));l.frustumCulled=false;l.visible=false;l.userData.w=L[1];scene.add(l);b.lines.push(l);});return b;}
 var pool=[];for(i=0;i<4;i++)pool.push(mkBolt());
 var dir=new THREE.Vector3(),u=new THREE.Vector3(),v=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),p=new THREE.Vector3();
 function shape(b){dir.subVectors(b.b,b.a);var len=dir.length();if(len<.01)return;dir.divideScalar(len);
  if(Math.abs(dir.y)>.95)up.set(1,0,0);else up.set(0,1,0);u.crossVectors(dir,up).normalize();v.crossVectors(dir,u);
  var R=b.R,k,s,off;for(k=0;k<N;k++){s=k/(N-1);off=Math.sin(Math.PI*s)*b.amp;R[k*2]=(k===0||k===N-1)?0:(Math.random()*2-1)*off;R[k*2+1]=(k===0||k===N-1)?0:(Math.random()*2-1)*off;}
  b.lines.forEach(function(l,li){var pa=l.geometry.attributes.position,e=li?.02*li:0,j;
   for(k=0;k<N;k++){s=k/(N-1);j=(k===0||k===N-1)?0:e;
    p.copy(b.a).addScaledVector(dir,len*s).addScaledVector(u,R[k*2]+(Math.random()*2-1)*j).addScaledVector(v,R[k*2+1]+(Math.random()*2-1)*j);pa.setXYZ(k,p.x,p.y,p.z);}
   pa.needsUpdate=true;});}
 return {
  spawn:function(a,bb,o){o=o||{};var b=pool.pop()||active.shift();b.a.copy(a);b.b.copy(bb);var len=a.distanceTo(bb);
   b.amp=o.amp!==undefined?o.amp:Math.min(.55,.05+len*.02);b.max=b.ttl=o.ttl||.2;b.re=0;shape(b);
   b.lines.forEach(function(l){l.visible=true;});active.push(b);},
  tick:function(dt){for(var k=active.length-1;k>=0;k--){var b=active[k];b.ttl-=dt;b.re-=dt;
    if(b.ttl<=0){b.lines.forEach(function(l){l.visible=false;l.material.opacity=0;});active.splice(k,1);pool.push(b);continue;}
    if(b.re<=0){b.re=.035;shape(b);}
    var f=b.ttl/b.max,fl=Math.random()<.3?.35:1;b.lines.forEach(function(l){l.material.opacity=f*fl*l.userData.w;});}},
  active:function(){return active.length;}
 };
}
/* ---------- picker styling ---------- */
var cssDone=false;
function decorate(btn,f,active){
 if(typeof document==='undefined')return;
 var pack=verifiedLegendaryPack(f&&f.weapon);if(pack&&typeof pack.decorate==='function'){pack.decorate(btn,f,active);return;}
 if(!cssDone){cssDone=true;var s=document.createElement('style');
  s.textContent='@keyframes slLegendSheen{0%{background-position:0% 50%}100%{background-position:200% 50%}}'
  +'.sl-legendary{background:linear-gradient(110deg,#07131a 0%,var(--legend-metal,#174db5) 28%,var(--legend-trim,#0cc2f7) 49%,#e9d49b 66%,#07131a 100%)!important;background-size:200% 100%;animation:slLegendSheen 5.8s linear infinite;border:1px solid var(--legend-trim,#ffd16a)!important;box-shadow:0 0 9px color-mix(in srgb,var(--legend-trim,#ffd16a) 24%,transparent),inset 0 0 13px color-mix(in srgb,var(--legend-glow,#0cc2f7) 18%,transparent)}'
  +'.sl-legend-tag{display:block;font:800 10px/1 system-ui;letter-spacing:.18em;color:#ffd978;text-shadow:0 0 8px #f5c451;margin-bottom:6px;font-style:normal}'
  +'@media (prefers-reduced-motion:reduce){.sl-legendary{animation:none}}';document.head.appendChild(s);}
 btn.classList.add('sl-legendary');btn.style.gridColumn='1 / -1';btn.style.setProperty('--legend-metal','#'+(f.metal||0x174db5).toString(16).padStart(6,'0'));btn.style.setProperty('--legend-trim','#'+(f.trim||0x0cc2f7).toString(16).padStart(6,'0'));btn.style.setProperty('--legend-glow','#'+(f.glow||0x0cc2f7).toString(16).padStart(6,'0'));
 var tag=document.createElement('em');tag.className='sl-legend-tag';tag.textContent='\u2605 LEGENDARY \u00b7 '+String(f.theme||'AZURE SOVEREIGN').toUpperCase()+' \u00b7 COSMETIC ONLY';btn.insertBefore(tag,btn.firstChild);
}
var legend={spec:legendEntry,buildRig:buildLegendaryRig,buildPrototypeRig:buildPrototypeRig,prototype:legendarySpec,createBolts:createBolts,shotLayers:shotLayers,mixShot:mixShot,equipSound:equipSound,rearmSound:rearmSound,decorate:decorate};
function catalog(weapons){const out={};for(const id of Object.keys(weapons)){
 if(weapons[id].melee)continue;
 const seed=hash(id),base=weapons[id].name||id;
 const entries=[0,1,2].map((family)=>{const s=palette(seed+family*17,family);return {id:id+'-'+family,weapon:id,family,name:s.name+' · '+base,...s,seed};});
 if(LEGEND_WEAPONS[id])entries.push(legendEntry(id,base,seed));
 out[id]=entries;
}return out;}
return {catalog,hash,legend};
});
