'use strict';
/* P11.5.4 concrete source/geometry comparison, not a hardware FPS claim. */
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('assert');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'AndroidProject/app/src/main/assets');
const before=path.join(root,'rollback/P1154-P1153-EXACT-FILES/AndroidProject/app/src/main/assets');
let checks=0;const ok=(b,s)=>{assert.ok(b,s);checks++};const rd=f=>fs.readFileSync(f,'utf8');const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const THREE=require(path.join(assets,'www/three.min.js'));
const orig=path.join(assets,'www/weapon-skins.js'),prev=path.join(before,'www/weapon-skins.js');
function metrics(mod){const rig=mod.legend.buildRig(THREE),m={drawable:0,triangles:0,instances:0,transparent:0,rig};
 rig.group.traverse(o=>{if(o.isMesh||o.isLine||o.isSprite){m.drawable++;if(o.material&&o.material.transparent)m.transparent++;if(o.isInstancedMesh)m.instances+=o.count;if(o.geometry){m.triangles+=(o.geometry.index?o.geometry.index.count/3:o.geometry.attributes.position.count/3)*(o.count||1)}}});return m;}
const old=metrics(require(prev)),now=metrics(require(orig));
ok(old.drawable===22, 'P1153 baseline drawable count differs');
ok(Math.round(old.triangles)===4679, 'P1153 baseline triangles differ');
ok(now.drawable<=21 && now.drawable<old.drawable,'P1154 did not reduce drawable objects');
ok(now.triangles<=2215 && now.triangles<old.triangles*.5,'P1154 geometry did not return near P1151 triangle budget');
ok(now.instances===106,'Legend ornaments/instance budget changed');
ok(now.rig.group.getObjectByName('P1152-sapphire-facet-armor'),'sapphire geometry removed');
ok(now.rig.group.getObjectByName('P1152-scope-gilded-rims'),'gold scope removed');
ok(now.rig.group.getObjectByName('P1152-Azure-reload-core'),'reload removed');
now.rig.setDetail('low');now.rig.update(.016,{fx:'high'});
ok(now.rig.group.getObjectByName('P1152-sapphire-facet-armor').visible,'low mode removed legendary skin');
ok(now.rig.group.getObjectByName('P1152-Azure-reload-core').visible===false,'reload unexpectedly visible');
ok(now.rig.group.children.filter(o=>o.isLine).every(o=>!o.visible),'adaptive low mode still draws arcs');
now.rig.setReload(.55,true);now.rig.update(.016,{fx:'high'});ok(now.rig.group.getObjectByName('P1152-Azure-reload-core').visible,'low mode broke ceremonial reload');
now.rig.setReload(0,false);now.rig.setDetail('high');now.rig.update(.016,{fx:'high'});
ok(now.rig.group.children.some(o=>o.isLine&&o.visible),'high mode did not restore storm arcs');
for(const c of ['www','phone-host']){
 const s=rd(path.join(assets,c,'index.html'));
 for(const match of s.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim()){new vm.Script(match[1]);checks++;}
 const patternStart=s.indexOf('function effectiveShadowTier()'),patternEnd=s.indexOf('function applyG()',patternStart);
 ok(patternStart>0&&patternEnd>patternStart,'Missing adaptive shadow budget '+c);
 const budget=s.slice(patternStart,patternEnd);
 const G={adaptive:true,shadows:'high'};
 const sun={castShadow:true,shadow:{mapSize:{x:1536,set(x,y){this.x=x;this.y=y}},map:null}};
 const renderer={shadowMap:{enabled:true}};
 const cx={G,sun,renderer,perfLvl:0};vm.createContext(cx);vm.runInContext(budget,cx);
 ok(cx.effectiveShadowTier()==='high',c+' high shadow config ignored at stable perf');
 cx.perfLvl=1;ok(cx.effectiveShadowTier()==='low',c+' failed to downgrade persistent HIGH shadows');cx.applyShadowBudget();ok(sun.shadow.mapSize.x===768 && renderer.shadowMap.enabled,c+' shadow map not reduced');
 cx.perfLvl=2;cx.applyShadowBudget();ok(!sun.castShadow&&!renderer.shadowMap.enabled,c+' did not skip expensive shadow pass');
 cx.perfLvl=0;cx.applyShadowBudget();ok(renderer.shadowMap.enabled&&sun.shadow.mapSize.x===1536,c+' shadow restore failed');
 G.adaptive=false;cx.perfLvl=3;ok(cx.effectiveShadowTier()==='high',c+' ignored user adaptive off choice');
 ok(G.shadows==='high','modified saved shadow setting');
 ok(s.includes("g.userData.legendRig.setDetail(G.adaptive && perfLvl >= 1 ? 'low' : 'high')"),'missing lightweight cosmetic adaptation '+c);
 ok(s.includes("hudFrameT = 0.05; updateHud()"),'HUD remained at 10 Hz '+c);
 ok(s.includes("radarT = 0.05; if (G.radar) drawRadar()"),'radar remained at 10 Hz '+c);
 ok(s.includes('window.__sl.testLegendGeometry'),'missing in-game controlled skin isolation '+c);
 const oldIndex=rd(path.join(before,c,'index.html'));
 const i=oldIndex.indexOf('var WEAPONS = {'),j=oldIndex.indexOf('\n};',i)+3;
 ok(i>=0&&s.includes(oldIndex.slice(i,j)),'weapon configuration changed '+c);
}
ok(rd(path.join(assets,'www/weapon-skins.js'))===rd(path.join(assets,'phone-host/weapon-skins.js')),'browser and phone-host weapon skins diverge');
const shas=rd(path.join(assets,'phone-host/SHA256SUMS')).trim().split('\n');
for(const file of ['index.html','weapon-skins.js']){let row=shas.find(x=>x.endsWith('  '+file));ok(row && row.slice(0,64)===sha(path.join(assets,'phone-host',file)),'stale phone-host manifest '+file)}
const changes=JSON.parse(rd(path.join(root,'acceptance/P1154-CHANGESET.json')));
for(const rel of changes.modified){ok(fs.existsSync(path.join(root,rel)),`missing ${rel}`);ok(fs.existsSync(path.join(root,changes.rollback,rel)),`missing rollback ${rel}`);ok(sha(path.join(root,rel))!==sha(path.join(root,changes.rollback,rel)),`unchanged ${rel}`)}
console.log(JSON.stringify({pass:true,checks,triangles:{beforeP1153:Math.round(old.triangles),afterP1154:Math.round(now.triangles),reductionPercent:+(100*(1-now.triangles/old.triangles)).toFixed(1)},drawable:{beforeP1153:old.drawable,afterP1154:now.drawable},lowDetailStillHasSapphire:true,adaptiveShadowsVerified:true,hardwareGpuFps:'NOT_MEASURED'},null,2));
