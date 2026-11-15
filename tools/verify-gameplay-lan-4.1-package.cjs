#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const manifestName='GAMEPLAY-LAN-ZOMBIES-4.1-MANIFEST.json',manifestPath=path.join(root,manifestName);
const fail=m=>{throw new Error(m);},hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(!fs.existsSync(manifestPath))fail(`Missing manifest: ${manifestPath}`);
const m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(m.packageName!=='SightlineV3-Gameplay-LAN-Zombies-4.1-EXPERIMENTAL-DEV-2026-11-05')fail('Package identity mismatch.');
const expected=new Set();
for(const row of m.files){const rel=row.path.replace(/\\/g,'/');if(!rel||path.posix.isAbsolute(rel)||rel.split('/').some(x=>!x||x==='.'||x==='..'))fail(`Unsafe manifest path: ${row.path}`);const file=path.resolve(root,...rel.split('/'));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())fail(`Missing or escaping source path: ${rel}`);if(fs.statSync(file).size!==row.size)fail(`Size mismatch: ${rel}`);if(hash(file)!==row.sha256)fail(`SHA-256 mismatch: ${rel}`);expected.add(rel);}
const actual=new Set();function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(e.isFile()){const rel=path.relative(root,file).split(path.sep).join('/');if(rel!==manifestName)actual.add(rel);}else fail(`Unsupported filesystem entry: ${file}`);}}
walk(root);for(const p of expected)if(!actual.has(p))fail(`Manifest path missing from tree: ${p}`);for(const p of actual)if(!expected.has(p))fail(`Unmanifested file: ${p}`);
const parent=JSON.parse(fs.readFileSync(path.join(root,'GAMEPLAY-LAN-ZOMBIES-4.0-MANIFEST.json'),'utf8'));
const changed=parent.files.filter(x=>{const p=path.resolve(root,...x.path.split('/'));return !fs.existsSync(p)||hash(p)!==x.sha256;}).map(x=>x.path).sort();
const allowed=['AndroidProject/CURRENT-SOURCE-SHA256.txt','AndroidProject/app/src/main/assets/phone-host/SHA256SUMS','AndroidProject/app/src/main/assets/phone-host/index.html','AndroidProject/app/src/main/assets/www/index.html','AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java','tools/capture-lan-host-status.cjs'].sort();
if(JSON.stringify(changed)!==JSON.stringify(allowed))fail(`Parent source change set differs from the reviewed allowlist: ${changed.join(', ')}`);
const assets=path.join(root,'AndroidProject/app/src/main/assets'),phone=path.join(assets,'phone-host'),www=path.join(assets,'www');
if(fs.readFileSync(path.join(phone,'index.html'),'utf8')!==fs.readFileSync(path.join(www,'index.html'),'utf8'))fail('Offline and phone-host pages differ.');
if(hash(path.join(phone,'server.js'))!=='6f9ad2be2e1cd51cec6e4d3ee1c5acf62223096bd537e0cf06fac3feb729f508')fail('Authoritative 4.0 server changed.');
const sums=fs.readFileSync(path.join(phone,'SHA256SUMS'),'utf8').trim().split(/\r?\n/),assetCount=0;
let verifiedAssets=0;for(const line of sums){const match=line.match(/^([a-f0-9]{64})\s+(.+)$/);if(!match)fail(`Malformed phone-host SHA256SUMS row: ${line}`);const target=path.resolve(phone,match[2]);if(!target.startsWith(phone+path.sep)||!fs.existsSync(target)||hash(target)!==match[1])fail(`Phone-host asset checksum mismatch: ${match[2]}`);verifiedAssets++;}
if(verifiedAssets!==47)fail(`Expected 47 phone-host assets, saw ${verifiedAssets}.`);
const sourceLines=fs.readFileSync(path.join(root,'AndroidProject/CURRENT-SOURCE-SHA256.txt'),'utf8').trim().split(/\r?\n/);let verifiedSource=0;for(const line of sourceLines){const match=line.match(/^([a-f0-9]{64})\s+(.+)$/);if(!match)fail(`Malformed Android source hash row: ${line}`);const target=path.resolve(root,'AndroidProject',match[2]);if(!target.startsWith(path.resolve(root,'AndroidProject')+path.sep)||!fs.existsSync(target)||hash(target)!==match[1])fail(`Android source hash mismatch: ${match[2]}`);verifiedSource++;}if(verifiedSource!==112)fail(`Expected 112 Android source hashes, saw ${verifiedSource}.`);
const main=fs.readFileSync(path.join(root,'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java'),'utf8');if(!main.includes(`"${hash(path.join(phone,'index.html'))}"`))fail('Android host bundle pin does not match the packaged phone-host page.');
const regression=fs.readFileSync(path.join(root,'acceptance/gameplay-lan-zombies-4.1-regressions.log'),'utf8');if(!/ℹ tests 238/.test(regression)||!/ℹ pass 238/.test(regression)||!/ℹ fail 0/.test(regression))fail('Full regression log is missing its 238/238 passing summary.');
const agents=path.join(root,'AGENTS.md');if(hash(agents)!=='df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2')fail('Project AGENTS.md is not the current Sightline instruction set.');
const legendaryFiles=parent.files.filter(x=>/legend|weapon-skins|character-skins/i.test(x.path)).filter(x=>changed.includes(x.path));if(legendaryFiles.length)fail(`Legendary-owned source changed: ${legendaryFiles.map(x=>x.path).join(', ')}`);
console.log(JSON.stringify({status:'PASS',packageName:m.packageName,verifiedFiles:expected.size,manifestSha256:hash(manifestPath),phoneHostAssets:verifiedAssets,androidSourceEntries:verifiedSource,fullRegressions:'238/238',changedParentFiles:changed,legendarySourceChanges:legendaryFiles.length,serverSha256:hash(path.join(phone,'server.js')),pageSha256:hash(path.join(phone,'index.html')),agentsSha256:hash(agents),root},null,2));
