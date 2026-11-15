'use strict';
/* P11.5 Legendary Longbow deterministic QA. Source + DSP + rig geometry only; NOT a device or real-speaker test. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),AS=path.join(root,'AndroidProject/app/src/main/assets');
let checks=0;const ok=(x,why)=>{assert(x,why);checks++;};
const text=p=>fs.readFileSync(p,'utf8');
const www=text(path.join(AS,'www/index.html')),ph=text(path.join(AS,'phone-host/index.html'));
ok(text(path.join(AS,'www/weapon-skins.js'))===text(path.join(AS,'phone-host/weapon-skins.js')),'weapon-skins.js diverged between clients');
const S=require(path.join(AS,'www/weapon-skins.js')),L=S.legend;
/* catalog: Longbow gets exactly one extra Legendary entry; every other gun is untouched */
const W=JSON.parse(text(path.join(AS,'phone-host/data.json'))).weapons,cat=S.catalog(W);
ok(cat.longbow.length===4&&cat.longbow[3].legendary&&cat.longbow[3].family===3,'longbow legendary entry missing');
ok(Object.keys(cat).filter(k=>k!=='longbow').every(k=>cat[k].length===3&&!cat[k].some(e=>e.legendary)),'legendary leaked to other weapons');
ok(cat.longbow.slice(0,3).every((e,i)=>e.family===i),'standard families changed');
/* gameplay data frozen: authoritative stats identical to the P11.4.1 rollback */
const roll=path.join(root,'rollback/P115-P1141-EXACT-FILES/AndroidProject/app/src/main/assets');
function weapons(s){const a=s.indexOf('var WEAPONS = {'),b=s.indexOf('\n};',a);return JSON.stringify(vm.runInNewContext('('+s.slice(a,b).replace('var WEAPONS = ','')+'\n})',{}));}
for(const c of ['www','phone-host']){ok(weapons(text(path.join(roll,c,'index.html')))===weapons(text(path.join(AS,c,'index.html'))),'WEAPONS stats changed in '+c);}
/* sound */
const sr=44100,shot=L.mixShot(sr,null),eq=L.equipSound(sr),re=L.rearmSound(sr);
function stat(a){let pk=0,e=0;for(const x of a){ok(Number.isFinite(x),'non-finite sample');pk=Math.max(pk,Math.abs(x));e+=x*x;}return {pk,rms:Math.sqrt(e/a.length),dur:a.length/sr};}
const s1=stat(shot),s2=stat(eq),s3=stat(re);
ok(s1.dur>1.5&&s1.dur<2.2&&s1.pk<=.98&&s1.rms>.05,'shot level/length');
ok(s2.dur>1.2&&s2.pk<=.98&&s2.rms>.04,'equip sound level/length');
ok(s3.dur>.4&&s3.dur<.9&&s3.pk<=.98&&s3.rms>.05,'rearm sound level/length');
ok(Math.abs(shot[shot.length-1])<1e-3,'shot does not end silent (click)');
const again=L.mixShot(sr,null);ok(shot.every((x,i)=>x===again[i]),'shot generator not deterministic');
const shot48=L.mixShot(48000,null);ok(shot48.length>1.5*48000,'48 kHz context unsupported');
/* rig geometry on the real bundled three.js */
const THREE=(function(){const m={exports:{}};vm.runInNewContext(text(path.join(AS,'www/three.min.js')),{module:m,exports:m.exports,window:undefined,self:undefined,globalThis:undefined,console});return m.exports;})();
const rig=L.buildRig(THREE);let draws=0,instances=0;rig.group.traverse(o=>{if(o.isMesh||o.isLine||o.isSprite)draws++;if(o.isInstancedMesh)instances+=o.count;});
ok(draws<=32,'rig draw calls '+draws+' exceed budget 32');ok(instances<120,'too many instances');
let unflagged=0;rig.group.traverse(o=>{if(!o.userData.finishBadge)unflagged++;});ok(unflagged===0,'rig meshes would be re-tinted by finishGun');
for(const t of [0,.4,1.3,7.7]){rig.update(0,{t,fx:'high'});}
rig.fire();rig.update(.05,{fx:'low'});ok(rig.group.children.filter(o=>o.isLine).every(o=>!o.visible),'arcs not disabled at low fx');
rig.update(.5,{fx:'high'});rig.update(.5,{fx:'high'});ok(rig.state.hot===0,'afterglow does not decay');
/* P11.5.2 ceremonial magazine recharge: all meshes cosmetic; state cancels cleanly. */
const recharge=rig.group.getObjectByName('P1152-Azure-reload-core');
ok(!!recharge,'no premium reload crystal assembly');
ok(rig.group.getObjectByName('P1152-sapphire-facet-armor')!==undefined,'missing royal-blue body geometry');
ok(rig.group.getObjectByName('P1152-scope-gilded-rims')!==undefined,'missing scope rim geometry');
ok(rig.group.getObjectByName('P1152-crystal-receiver-inlays')!==undefined,'missing crystalline receiver');
rig.setReload(.13,true);rig.update(.016,{fx:'high'});ok(recharge.visible&&rig.state.reloading,'recharge not visible during reload');
const pos1=recharge.position.clone();rig.setReload(.53,true);rig.update(.016,{fx:'high'});ok(pos1.distanceTo(recharge.position)>.01,'reload choreography has no motion');
rig.setReload(.96,true);rig.update(.016,{fx:'high'});rig.setReload(0,false);rig.update(.016,{fx:'high'});
ok(!recharge.visible&&!rig.state.reloading&&rig.state.completions===1,'reload did not finish cleanly');
rig.setReload(.40,true);rig.setReload(0,false);ok(!recharge.visible&&rig.state.completions===1,'cancel triggered false completion');
const sc=new THREE.Scene(),B=L.createBolts(THREE,sc);B.spawn(new THREE.Vector3(0,0,0),new THREE.Vector3(3,1,-60),{ttl:.2});ok(B.active()===1,'bolt not active');
for(let i=0;i<30;i++)B.tick(.016);ok(B.active()===0,'bolt does not expire');for(let i=0;i<20;i++)B.spawn(new THREE.Vector3(),new THREE.Vector3(0,0,-5));ok(B.active()<=4,'bolt pool not bounded');
/* hooks present in both clients; fire path keeps the standard sound as fallback */
for(const [n,s] of [['www',www],['phone-host',ph]]){
 for(const frag of ["legendSync(g,f);","legendBoltsTick(dt);","if(cur==='longbow'&&legendActive(gun)){sfxLegend('shot',1);legendFire(gun,mp,end,legendHit);}else sfxShot(w.key, 1);","legendRearm(g);}","if(cur==='longbow')legendTick(g,dt,rf,reloading>0);","legendCue(guns[k])","WEAPON_EXCLUSIVE[k].length"])ok(s.includes(frag),n+' missing hook '+frag);
 ok(!/localStorage\.setItem\([^)]*legend/i.test(s),'unexpected legendary persistence');
 for(const m of s.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(m[1].trim()){new vm.Script(m[1]);checks++;}}
}
console.log(JSON.stringify({pass:true,checks,rigDrawCalls:draws,instances,shot:s1,equip:s2,rearm:s3},null,1));
