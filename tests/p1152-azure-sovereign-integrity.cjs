"use strict";
const assert=require('assert'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'AndroidProject/app/src/main/assets');
const www=path.join(base,'www'),phone=path.join(base,'phone-host');
const read=p=>fs.readFileSync(p,'utf8'),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.strictEqual(read(path.join(www,'weapon-skins.js')),read(path.join(phone,'weapon-skins.js')),'clients have different legendary code');
for(const c of [www,phone]){
 const h=read(path.join(c,'index.html'));
 assert(h.includes('legendTick(g,dt,rf,reloading>0);'),'missing reload integration');
 assert(h.includes('legendFire(gun,mp,end,legendHit);'),'missing fire integration');
 assert(h.includes('legendRearm(g);'),'missing rearm integration');
}
const hashes=new Map(read(path.join(phone,'SHA256SUMS')).trim().split('\n').map(l=>l.split('  ').reverse()));
for(const k of ['index.html','weapon-skins.js'])assert.equal(hashes.get(k),sha(path.join(phone,k)),'active client hash mismatch '+k);
const skin=require(path.join(www,'weapon-skins.js'));
const w=JSON.parse(read(path.join(phone,'data.json'))).weapons;
const cat=skin.catalog(w);
assert.equal(cat.longbow[3].name.startsWith('Azure Sovereign'),true);
assert.equal(cat.longbow[3].legendary,true);
const original=JSON.parse(read(path.join(root,'acceptance/P1152-CHANGESET.json')));
assert(original.modified.length===5,'expected only five runtime/manifest files in changeset');
for(const rel of original.modified){
 if(rel.endsWith('SHA256SUMS'))continue;
 const f=path.join(root,rel),rollback=path.join(root,'rollback/P1152-P1151-EXACT-FILES',rel);
 assert(fs.existsSync(f)&&fs.existsSync(rollback),'missing candidate or rollback '+rel);
 assert.notEqual(sha(f),sha(rollback),'change missing '+rel);
}
console.log('PASS P11.5.2 runtime source integrity + synchronisation');
