'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'), AS='AndroidProject/app/src/main/assets/';
const files=['www/index.html','phone-host/index.html'];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const text=p=>fs.readFileSync(p,'utf8');
const stable=o=>JSON.stringify(JSON.parse(JSON.stringify(o)));
function sliceBetween(s,a,b){const start=s.indexOf(a);assert(start>=0,'missing '+a);const end=s.indexOf(b,start);assert(end>=0,'missing '+b);return s.slice(start,end);}
function getWeapons(s){return vm.runInNewContext('('+sliceBetween(s,'var WEAPONS = {','\n};').replace('var WEAPONS = ','')+'\n})',{}, {timeout:1500});}
function getFunction(s,name){const start=s.indexOf('function '+name+'(');assert(start>=0,'no '+name);let startBrace=s.indexOf('{',start),depth=0,quote='',escape=false;for(let i=startBrace;i<s.length;i++){let c=s[i];if(quote){if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(c===quote)quote='';continue;}if(c==='\''||c==='"'||c==='`'){quote=c;continue;}if(c==='{')depth++;if(c==='}'&&--depth===0)return s.slice(start,i+1);}throw Error('Unbalanced '+name);}
let checks=0;
function ok(x,why){assert(x,why);checks++;}
const originals=[],updated=[];
for(const f of files){
 const a=text(path.join(root,'rollback/P114-P113-LONGBOW-EXACT-FILES',AS,f));
 const b=text(path.join(root,AS,f));originals.push(a);updated.push(b);
 ok(stable(getWeapons(a))===stable(getWeapons(b)),`WEAPONS modified in ${f}`);
 ok(b.includes("if(cur==='longbow'){longbowCycleAt=T;longbowCycleStage=0;}"),`no real shot trigger in ${f}`);
 ok(b.includes("if(cur==='longbow'&&reloading<=0)updateLongbowCycle(g);"),`no cycle update in ${f}`);
 ok(b.includes('function cancelLongbowCycle()'),`no abort helper in ${f}`);
 ok(b.includes("if (k !== cur) { if (cur === 'longbow') cancelLongbowCycle();"),`switch does not cancel bolt in ${f}`);
 ok(b.includes("if (cur === 'longbow') cancelLongbowCycle();\n  reloading = w.reload;"),`reload does not cancel bolt in ${f}`);
 ok(b.includes('P114-Longbow-barrel-rings')&&b.includes('P114-Longbow-brake-ports'),`unbatched rings in ${f}`);
 ok(b.includes('P114-Longbow-captive-fasteners')&&b.includes('P114-Longbow-etched-seams'),`no detail in ${f}`);
 ok(b.includes("if(kind==='longbow'){\n      // Longbow-only"),`no unique firing report in ${f}`);
 ok(b.includes('function sfxLongbowBolt(closing)'),`no bolt sound in ${f}`);
 // syntax-check EVERY actual inline script separately (not a truncated aggregate)
 for(const m of b.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {if(m[1].trim()) {new vm.Script(m[1]); checks++;}}
}
// Original and candidate host weapons must match on all server-controlled fields
const weapons=getWeapons(updated[0]), phone=getWeapons(updated[1]);
ok(stable(weapons)===stable(phone),'client weapon definitions diverged');
ok(Object.keys(weapons).length===31,'weapon count drift');
ok(Object.keys(weapons).filter(k=>!weapons[k].melee).length===27,'firearm count drift');
const server=JSON.parse(text(path.join(root,AS,'phone-host/data.json'))).weapons;
ok(Object.keys(weapons).every(k=>server[k]&&Object.keys(server[k]).every(field=>stable(server[k][field])===stable(weapons[k][field]))),'authoritative weapon mismatch');
// Test actual Longbow action function extracted from each candidate with stubbed audiovisual hooks.
for(let v=0;v<updated.length;v++){
 let s=updated[v], shell=0, cues=[], ch={position:{z:0}};
 let stub={cur:'longbow',state:'live',P:{alive:true},reloading:0,T:20.0,longbowCycleAt:20,longbowCycleStage:0,addShell(){shell++;},sfxLongbowBolt(c){cues.push(c);},legendRearm(){}};
 stub.rEase=(a,b,x)=>Math.max(0,Math.min(1,(x-a)/(b-a)));vm.createContext(stub);
 vm.runInContext(getFunction(s,'updateLongbowCycle'),stub);
 const tick=t=>{stub.T=20+t;stub.updateLongbowCycle({userData:{ch}});};
 tick(.05);ok(ch.position.z===0&&shell===0&&cues.length===0,'premature action');
 tick(.34);ok(ch.position.z>0.07&&cues.length===1&&!cues[0],'bolt does not open');
 tick(.5);ok(shell===1,'no case ejection');
 tick(.82);ok(ch.position.z===0&&cues.length===2&&cues[1],'bolt does not close');
 tick(1);ok(shell===1&&cues.length===2,'repeated bolt stage');
 stub.guns={longbow:{userData:{ch}}};
 vm.runInContext(getFunction(s,'cancelLongbowCycle'),stub);
 ch.position.z=.061;stub.longbowCycleAt=stub.T;stub.longbowCycleStage=2;
 stub.cancelLongbowCycle();
 ok(ch.position.z===0&&stub.longbowCycleAt===-100&&stub.longbowCycleStage===0,'cancel leaves bolt extended or staged');
 const beforeCancelCues=cues.length,beforeCancelShells=shell;
 tick(.5);ok(cues.length===beforeCancelCues&&shell===beforeCancelShells,'canceled cycle produced late audio/ejection');
 stub.reloading=1;tick(.35);ok(ch.position.z===0,'reload does not cancel action');
 stub.reloading=0;stub.cur='ranger';tick(.35);ok(ch.position.z===0,'weapon switch does not cancel action');
}
// Execute the actual shot-buffer generator with a stub AudioBuffer API and test signal stability.
function makeSample(source,k){
 const ac={sampleRate:48000,createBuffer(n,len,sr){const ar=new Float32Array(len);return {sampleRate:sr,duration:len/sr,getChannelData(i){assert(i===0);return ar;},data:ar};}};
 const lib=sliceBetween(source,'var SHOT_VOICES =','function sfxShot(');
 const context={AC:ac,Math,Int16Array,Float32Array};vm.createContext(context);vm.runInContext(lib,context);return context.shotBuffer(k).data;
}
const old=makeSample(originals[0],'longbow'),newS=makeSample(updated[0],'longbow');
ok(old.length===newS.length,'Longbow duration drift');
let sum=0,peak=0,diff=0;for(let i=0;i<newS.length;i++){const x=newS[i];okIfFinite(x);sum+=x*x;peak=Math.max(peak,Math.abs(x));diff+=Math.abs(x-old[i]);}
function okIfFinite(x){if(!Number.isFinite(x))throw Error('Nonfinite audio sample');}
ok(peak<.96&&peak>.015,'invalid/quiet/overdriven audio peak');ok(Math.sqrt(sum/newS.length)<.40,'uncontrolled volume');ok(diff>1,'Longbow buffer unchanged');
const otherOld=makeSample(originals[0],'pistol'),otherNew=makeSample(updated[0],'pistol');ok(Buffer.from(otherOld.buffer).equals(Buffer.from(otherNew.buffer)),'pistol sound changed');
const otherPhone=makeSample(updated[1],'longbow');ok(Buffer.from(newS.buffer).equals(Buffer.from(otherPhone.buffer)),'Longbow phone-host sound mismatch');
// two isolated PCM WAV previews for independent AB listening, not recordings of running gameplay
function wav(data,file){const b=Buffer.alloc(44+data.length*2);b.write('RIFF',0);b.writeUInt32LE(36+data.length*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(data.length*2,40);for(let i=0;i<data.length;i++)b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,data[i]))*32767),44+i*2);fs.writeFileSync(file,b);}
if(process.argv.includes('--export-audio')){wav(old,path.join(root,'P114-LONGBOW-SOUND-BEFORE-isolated.wav'));wav(newS,path.join(root,'P114-LONGBOW-SOUND-AFTER-isolated.wav'));}
const outcome={pass:true,checks,sourceClients:files,weaponCount:Object.keys(weapons).length,firearms:27,melee:4,longbow:{beforeShotMax:Math.max(...old),afterShotPeak:peak,isolatedSampleDiff:diff,afterShotRMS:Math.sqrt(sum/newS.length)},limitations:['No browser WebGL load permitted','Device audio and gameplay presentation not verified','This is isolated algorithm audio, not captured in-game sound']};
console.log(JSON.stringify(outcome,null,2));
