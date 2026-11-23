const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),assert=require('node:assert/strict'),test=require('node:test');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'recovery/hud51-runtime'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'MANIFEST.json'),'utf8'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const parent=manifest.existingSourceCommit;
const rows=cp.execFileSync('git',['ls-tree','-rz',parent],{cwd:root}).toString().split('\0').filter(Boolean).map(row=>{const m=/^100(?:644|755) blob ([a-f0-9]{40})\t(.+)$/.exec(row);assert(m);return{sha:m[1],path:m[2]};});
const index=new Map(rows.map(e=>[e.path,e.sha]));
const fallback=manifest.assets.filter(e=>!e.storedOriginal);
const response=cp.execFileSync('git',['cat-file','--batch'],{cwd:root,input:fallback.map(e=>index.get(e.existingSource)).join('\n')+'\n',maxBuffer:64e6});
const originals=new Map();let offset=0;
for(const e of fallback){const end=response.indexOf(10,offset),m=/^([a-f0-9]{40}) blob (\d+)$/.exec(response.subarray(offset,end).toString());assert(m);assert.equal(m[1],index.get(e.existingSource));offset=end+1;originals.set(e.entry,response.subarray(offset,offset+Number(m[2])));offset+=Number(m[2])+1;}
function original(e){return e.storedOriginal?fs.readFileSync(path.join(root,e.storedOriginal)):originals.get(e.entry);}
test('all 102 original packaged assets can be reconstructed exactly from Git',()=>{assert.equal(manifest.apkSha256,'acea893bb7689a207a46834b58b3dc0e60e8f4e68e06101b566b312c80b617f2');assert.equal(manifest.assets.length,102);assert.equal(fallback.length,99);for(const e of manifest.assets){assert(e.entry.startsWith('assets/'));assert(!e.entry.split('/').includes('..'));assert(!/\.(apk|keystore|jks|key)$/i.test(e.entry));const bytes=original(e);assert.equal(bytes.length,e.bytes,e.entry);assert.equal(sha(bytes),e.sha256,e.entry);}});
test('recovered pages contain the original HUD and retain exact accepted hashes',()=>{const expected={'assets/www/index.html':'1e2281f407808f57ccc2b39ff5a3509c44054bf4ff4617bd32678cb5a21cf5b9','assets/phone-host/index.html':'1be6c08ca8ef0460971f47c6f2986634003d22197c1b0b6e6dcd824a76a30b23'};for(const [name,hash] of Object.entries(expected)){const e=manifest.assets.find(e=>e.entry===name),bytes=original(e),s=bytes.toString('utf8');assert.equal(sha(bytes),hash);assert(s.includes('android51-restored-hud'));assert(s.includes("el.dataset.hudStyle='text'"));assert(!s.includes('var MobileProjection ='));assert(s.includes('function tbtn('));assert(s.includes('function tryFire('));}});
test('the historical HUD package is preserved with only verified integrated asset changes',()=>{
  const evolved=new Set([
    'assets/phone-host/character-realism-v12.js','assets/phone-host/data.json',
    'assets/phone-host/gameplay-mode-rules.js','assets/phone-host/legendary-packs.js',
    'assets/phone-host/navigation.js','assets/phone-host/optics-v1.js',
    'assets/phone-host/server.js','assets/phone-host/weapon-skins.js',
    'assets/www/character-realism-v12.js','assets/www/gameplay-mode-rules.js',
    'assets/www/legendary-packs.js','assets/www/optics-v1.js',
    'assets/www/weapon-qa.html','assets/www/weapon-skins.js'
  ]);
  const changed=[],missing=[];
  for(const e of fallback){
    const file=path.join(root,e.existingSource);
    if(!fs.existsSync(file)){missing.push(e.entry);continue;}
    const actual=sha(fs.readFileSync(file));
    if(actual===e.sha256)continue;
    assert(evolved.has(e.entry),'unexpected packaged source drift: '+e.entry);
    changed.push(e.entry);
  }
  assert.deepEqual(changed.sort(),[...evolved].sort(),'every evolved package asset is explicitly identified, with no additional unexplained changes');
  const conversion='a222f1483a2210e370f81fbce885517398e4ba6d';
  const convertedDeletions=cp.execFileSync('git',['diff-tree','--no-commit-id','--diff-filter=D','--name-only','-r',conversion],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(p=>/^AndroidProject\/app\/src\/main\/assets\/(?:www|phone-host)\/rook117\//.test(p)).map(p=>'assets/'+p.slice('AndroidProject/app/src/main/assets/'.length)).sort();
  assert.deepEqual(missing.sort(),convertedDeletions,'the only missing historical package assets are the ROOK117 model/texture files deliberately removed by the verified procedural conversion');
  const androidAssets=path.join(root,'AndroidProject/app/src/main/assets');
  const offline=fs.readFileSync(path.join(androidAssets,'www/character-realism-v12.js'));
  const host=fs.readFileSync(path.join(androidAssets,'phone-host/character-realism-v12.js'));
  assert.deepEqual(offline,host,'the accepted character runtime remains byte-identical across Android pages');
  for(const file of ['gameplay-mode-rules.js','legendary-packs.js','optics-v1.js','weapon-skins.js'])assert.deepEqual(fs.readFileSync(path.join(androidAssets,'www',file)),fs.readFileSync(path.join(androidAssets,'phone-host',file)),file+' remains shared between Android clients');
  const qaFile=path.join(androidAssets,'www/weapon-qa.html');
  const convertedQaBlob=cp.execFileSync('git',['rev-parse',conversion+':AndroidProject/app/src/main/assets/www/weapon-qa.html'],{cwd:root,encoding:'utf8'}).trim();
  assert.equal(cp.execFileSync('git',['hash-object',qaFile],{cwd:root,encoding:'utf8'}).trim(),convertedQaBlob,'the packaged weapon QA page matches the approved ROOK117 pipeline conversion');
  const sums=new Map(fs.readFileSync(path.join(androidAssets,'phone-host/SHA256SUMS'),'utf8').trim().split(/\r?\n/).map(line=>{const m=/^([a-f0-9]{64})  (.+)$/.exec(line);assert(m);return[m[2],m[1]];}));
  for(const entry of evolved){if(entry==='assets/www/weapon-qa.html')continue;const file=path.posix.basename(entry);assert.equal(sums.get(file),sha(fs.readFileSync(path.join(androidAssets,'phone-host',file))),file+' is pinned by the current phone-host package checksum list');}
  for(const file of convertedDeletions){const name=path.posix.basename(file);assert(!fs.readFileSync(path.join(androidAssets,'www/index.html'),'utf8').includes(name),'Offline no longer references removed asset '+name);assert(!fs.readFileSync(path.join(androidAssets,'phone-host/index.html'),'utf8').includes(name),'Phone-host no longer references removed asset '+name);}
});
