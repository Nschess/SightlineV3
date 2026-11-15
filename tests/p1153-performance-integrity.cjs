'use strict';
/* P11.5.3: actual source invariants + Three.js geometry counts, NOT a real-GPU FPS claim. */
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('assert');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'AndroidProject/app/src/main/assets');
const rollback=path.join(root,'rollback/P1153-P1152-EXACT-FILES/AndroidProject/app/src/main/assets');
const read=p=>fs.readFileSync(p,'utf8'),sum=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const clients=['www','phone-host'];let checks=0;
function ok(value,msg){assert.ok(value,msg);checks++;}
const capStart='function pixelRatio() {',capEnd='function fail(msg)';
function ratio(source,w,h,dpr,scale=100,touchMode=false,perfScale=1){
 const a=source.indexOf(capStart),b=source.indexOf(capEnd,a);
 ok(a>=0&&b>a,'missing pixelRatio implementation');
 const code=source.slice(a,b);
 const c={Math,stage:{clientWidth:w,clientHeight:h},window:{innerWidth:w,innerHeight:h,devicePixelRatio:dpr},G:{renderScale:scale},touchMode,perfScale};vm.createContext(c);
 vm.runInContext(code,c);return c.pixelRatio();
}
const oldRatio=(w,h,dpr,scale=100,touch=false)=>Math.max(.4,Math.min(dpr,touch?1.5:2)*scale/100);
let pixels={};
for(const name of clients){
 const p=path.join(assets,name,'index.html'),before=path.join(rollback,name,'index.html');
 const s=read(p),b=read(before);
 for(const m of s.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(m[1].trim()){new vm.Script(m[1]);checks++;}}
 const r=ratio(s,1920,1080,2);
 ok(1920*1080*r*r <=3600001,`${name}: desktop framebuffer exceeds budget`);
 ok(r<oldRatio(1920,1080,2),`${name}: default DPR pixels unchanged`);
 ok(Math.abs(ratio(s,1000,600,1)-1)<.00001,`${name}: 1x screen degraded`);
 ok(ratio(s,1280,720,2,70) < ratio(s,1280,720,2,100),`${name}: settings scale ineffective`);
 const mobile=ratio(s,1080,2400,3,85,true);
 ok(1080*2400*mobile*mobile<=1200001,`${name}: mobile pixel budget exceeded`);
 ok(s.includes("shadows: touchMode ? 'off' : 'low'"),`${name}: excessive default shadow setting`);
 ok(s.includes("G.shadows === 'high' ? 1536 : 768"),`${name}: shadow map not reduced`);
 ok(s.includes('hudFrameT = 0.10; updateHud()'),`${name}: HUD loop not throttled`);
 ok(s.includes('radarT = 0.10; if (G.radar) drawRadar()'),`${name}: radar not visibility gated`);
 ok(s.includes('renderCalls: frameStats.drawCalls'),`${name}: missing real renderer counters`);
 ok(s.includes('cpuSubmissionMs:'),`${name}: lost existing rendering timing diagnostics`);
 const oldWeapons=b.slice(b.indexOf('var WEAPONS = {'),b.indexOf('\n};',b.indexOf('var WEAPONS = {'))+3);
 ok(s.includes(oldWeapons),`${name}: weapon stats modified`);
 pixels[name]={baseline1080p:Math.round(1920*1080*oldRatio(1920,1080,2)**2),updated1080p:Math.round(1920*1080*r*r),baselineMobile:Math.round(1080*2400*oldRatio(1080,2400,3,85,true)**2),updatedMobile:Math.round(1080*2400*mobile*mobile)};
}
const phone=path.join(assets,'phone-host');
const known=new Map(read(path.join(phone,'SHA256SUMS')).trim().split('\n').map(row=>row.split('  ').reverse()));
for(const k of ['index.html','weapon-skins.js'])ok(known.get(k)===sum(path.join(phone,k)),'manifest mismatched '+k);
ok(read(path.join(assets,'www/weapon-skins.js'))===read(path.join(phone,'weapon-skins.js')),'client cosmetics differ');
const m={exports:{}};vm.runInNewContext(read(path.join(assets,'www/three.min.js')),{module:m,exports:m.exports,window:undefined,self:undefined,globalThis:undefined,console});
const THREE=m.exports;
function loadModule(filename){const mod={exports:{}};vm.runInNewContext(read(filename),{module:mod,exports:mod.exports,window:undefined,self:undefined,globalThis:undefined,console,Math});return mod.exports;}
const old=loadModule(path.join(rollback,'www/weapon-skins.js')),updated=loadModule(path.join(assets,'www/weapon-skins.js'));
function count(lib){const rig=lib.legend.buildRig(THREE);let draws=0,instances=0;rig.group.traverse(o=>{if(o.isMesh||o.isSprite||o.isLine)draws++;if(o.isInstancedMesh)instances+=o.count;});return {rig,draws,instances};}
const before=count(old),after=count(updated);
ok(before.draws===31,'baseline expected 31 draw objects; baseline corrupted: '+before.draws);
ok(after.draws===22,'optimized rig expected 22 draw objects: '+after.draws);
ok(after.draws<before.draws,'no draw improvement');
ok(after.instances>before.instances,'decorative mesh batching missing');
for(const t of [0,1,5])after.rig.update(.016,{t,fx:'high'});
after.rig.setReload(.4,true);after.rig.update(.016,{fx:'high'});
ok(after.rig.group.getObjectByName('P1152-Azure-reload-core').visible,'lost live legendary reload VFX');
after.rig.setReload(0,false);
ok(!after.rig.group.getObjectByName('P1152-Azure-reload-core').visible,'reload cancel failed');
for(const c of clients){for(const v of ['index.html','weapon-skins.js'])ok(sum(path.join(assets,c,v))!==sum(path.join(rollback,c,v)),'file unchanged '+c+'/'+v);}
const expected=JSON.parse(read(path.join(root,'acceptance/P1153-CHANGESET.json')));
for(const x of expected.modified){ok(fs.existsSync(path.join(root,x)),`missing active: ${x}`);ok(fs.existsSync(path.join(root,'rollback/P1153-P1152-EXACT-FILES',x)),`missing original: ${x}`);}
const result={pass:true,checks,oldRigDrawObjects:before.draws,newRigDrawObjects:after.draws,oldRigInstanceCount:before.instances,newRigInstanceCount:after.instances,pixelWorkBudget:pixels,shadowPixels:{oldHigh:2048**2,newHigh:1536**2,newDefaultDesktop:768**2},limits:['No actual hardware FPS, GPU timing, or VRAM data from this source test','GPU/browser draw count depends on visible game objects; above is rig drawable object budget','OS, drivers, thermal throttling and user hardware are not observable']};
console.log(JSON.stringify(result,null,2));
