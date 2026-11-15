/* P10.1 deterministic storage contract checks; this does not simulate Android hardware. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../AndroidProject/app/src/main/assets');
const key='sightline.optics.v1',report={name:'P10.1 optic persistence and compatibility',clients:{}};
for(const client of ['www','phone-host']){
 const script=fs.readFileSync(resolve(root,client,'optics-v1.js'),'utf8');
 let data={},fail=false,lie=false;
 const localStorage={getItem:k=>Object.hasOwn(data,k)?data[k]:null,setItem:(k,v)=>{if(fail)throw Error('quota');if(!lie)data[k]=String(v);},removeItem:k=>delete data[k]};
 const load=()=>{const window={};vm.runInNewContext(script,{window,localStorage}, {filename:client+'/optics-v1.js'});return window.SightlineOptics;};
 const checks=[],ck=(label,fn)=>{try{fn();checks.push({label,pass:true});}catch(e){checks.push({label,pass:false,error:String(e)});}};
 let opt=load();
 ck('No Scope default for supported guns',()=>assert.equal(opt.current('aurora'),'iron'));
 ck('Unsupported gun cannot be equipped',()=>assert.equal(opt.set('carbine','dot'),false));
 ck('Unsupported optic cannot be equipped',()=>assert.equal(opt.set('pistol','compact'),false));
 ck('Allowed optic saves one weapon only',()=>{assert.equal(opt.set('aurora','dot'),true);assert.equal(opt.current('aurora'),'dot');assert.equal(opt.current('kestrel'),'iron');});
 ck('Persistent after JavaScript restart',()=>{opt=load();assert.equal(opt.current('aurora'),'dot');});
 ck('Malformed JSON ignored',()=>{data[key]='{broken';opt=load();assert.equal(opt.current('aurora'),'iron');});
 ck('Invalid/unknown legacy records ignored while retaining valid values',()=>{data[key]=JSON.stringify({aurora:'compact',carbine:'reflex',kestrel:'unknown',__proto__:{hack:true}});opt=load();assert.equal(opt.current('aurora'),'compact');assert.equal(opt.current('kestrel'),'iron');assert.equal(Object.keys(opt.exportChoices()).length,12);});
 ck('Quota failure does not change current choice',()=>{fail=true;assert.equal(opt.set('aurora','reflex'),false);assert.equal(opt.current('aurora'),'compact');fail=false;});
 ck('Silent readback failure also rejected',()=>{lie=true;assert.equal(opt.set('aurora','dot'),false);assert.equal(opt.current('aurora'),'compact');lie=false;});
 ck('Successful save after storage recovers',()=>{assert.equal(opt.set('aurora','iron'),true);assert.equal(load().current('aurora'),'iron');});
 ck('All validated combinations are exactly 50',()=>{const list=Object.keys(opt.exportChoices());assert.equal(list.length,12);assert.equal(list.reduce((s,k)=>s+opt.options(k).length,0),50);});
 report.clients[client]={pass:checks.every(x=>x.pass),checks};
 console.log(client,checks.filter(x=>x.pass).length+'/'+checks.length,'PASS',report.clients[client].pass);
}
report.pass=Object.values(report.clients).every(x=>x.pass);
const dest=resolve(import.meta.dirname,'../acceptance/P101-OPTICS-STORAGE-REGRESSION.json');fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n');
if(!report.pass)process.exitCode=1;
