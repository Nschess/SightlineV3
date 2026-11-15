#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),manifestName='GAMEPLAY-LAN-ZOMBIES-4.1-MANIFEST.json';
const hashFile=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const list=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(e.isFile()){const rel=path.relative(root,file).split(path.sep).join('/');if(rel!==manifestName)list.push({path:rel,size:fs.statSync(file).size,sha256:hashFile(file)});}else throw new Error(`Unsupported filesystem entry: ${path.relative(root,file)}`);}}
walk(root);list.sort((a,b)=>a.path.localeCompare(b.path,'en'));
const base=JSON.parse(fs.readFileSync(path.join(root,'GAMEPLAY-LAN-ZOMBIES-4.0-MANIFEST.json'),'utf8'));
const changedParentFiles=base.files.filter(x=>{const p=path.resolve(root,...x.path.split('/'));return !fs.existsSync(p)||hashFile(p)!==x.sha256;}).map(x=>x.path).sort();
const expectedChanged=[
  'AndroidProject/CURRENT-SOURCE-SHA256.txt',
  'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS',
  'AndroidProject/app/src/main/assets/phone-host/index.html',
  'AndroidProject/app/src/main/assets/www/index.html',
  'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java',
  'tools/capture-lan-host-status.cjs'
].sort();
if(JSON.stringify(changedParentFiles)!==JSON.stringify(expectedChanged))throw new Error(`Unexpected edits to 4.0 tracked source files: ${changedParentFiles.join(', ')}`);
if(fs.readFileSync(path.join(root,'AndroidProject/app/src/main/assets/www/index.html'),'utf8')!==fs.readFileSync(path.join(root,'AndroidProject/app/src/main/assets/phone-host/index.html'),'utf8'))throw new Error('Offline and phone-host pages are not byte-identical.');
const manifest={
  schemaVersion:1,
  packageName:'SightlineV3-Gameplay-LAN-Zombies-4.1-EXPERIMENTAL-DEV-2026-11-05',
  packageType:'editable experimental development source; not a release, APK, or distribution build',
  generatedUtc:new Date().toISOString(),
  selfHashPolicy:'This manifest excludes itself to avoid circular hashing; hash the external ZIP and manifest separately.',
  sourceBase:{package:'SightlineV3-Gameplay-LAN-Zombies-4.0-EXPERIMENTAL-DEV-2026-11-05.zip',zipSha256:'5381af7457e11249d06a2d1fed2694e1c0c9224cbb0dcdf59664315cd6ff1f65',manifestSha256:'04d14694e53dd69f116211f1a536dd3332a4dd5afe83f68693528e3ae58b4a86'},
  currentSourceFingerprints:{phoneHostServerSha256:hashFile(path.join(root,'AndroidProject/app/src/main/assets/phone-host/server.js')),phoneHostPageSha256:hashFile(path.join(root,'AndroidProject/app/src/main/assets/phone-host/index.html')),offlinePageSha256:hashFile(path.join(root,'AndroidProject/app/src/main/assets/www/index.html')),phoneHostAssetManifestSha256:hashFile(path.join(root,'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS')),androidSourceManifestSha256:hashFile(path.join(root,'AndroidProject/CURRENT-SOURCE-SHA256.txt')),mainActivitySha256:hashFile(path.join(root,'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java')),projectInstructionsSha256:hashFile(path.join(root,'AGENTS.md'))},
  acceptedScope:['Preserve all Gameplay/LAN Zombies 4.0 server, bot, navigation, combat, Protocol V2, HTTPS/WSS, Offline Infection, playable infected-player, and snapshot-smoothing behavior.','On an established Outbreak zombie, flag and damp position recovery when host snapshot time has a gap of at least 100 ms.','Apply wrap-safe damped heading recovery to Outbreak zombies only; retain the established player recovery path and authoritative server state.','Keep offline and phone-host runtime pages byte-identical and update Android asset fingerprints.'],
  ownership:{changedParentFiles,legendaryModulesChanged:[],serverChanged:false,offlineAndPhoneHostPagesIdentical:true},
  verification:{fullRegression:{tests:238,passed:238,failed:0,log:'acceptance/gameplay-lan-zombies-4.1-regressions.log'},zombieJitterRecovery:{tests:4,passed:4,failed:0,testFile:'tests/mp-zombie-jitter-interpolation.test.cjs',benchmarkFile:'acceptance/benchmarks/4.1-zombie-pose-recovery-comparison.json'},androidHostAssets:'47/47',sharedOfflinePhoneHostModules:'14/14 byte-identical',androidCurrentSource:'112/112',hostSimulation:'10 s each at 16/32/64 requested Outbreak bots; 0 tick errors; report and JSON under acceptance/benchmarks',apkBuild:'not run; inherited isolated Gradle worker IPC blocker',liveLanAndWss:'not run; inherited isolated local-network restriction',browserWebglAndDevice:'not available for this isolated run'},
  rollbackFiles:['acceptance/checkpoints/2026-11-05-pre-zombie-pose-recovery/AndroidProject/app/src/main/assets/www/index.html','acceptance/checkpoints/2026-11-05-pre-zombie-pose-recovery/AndroidProject/app/src/main/assets/phone-host/index.html'],
  report:'acceptance/GAMEPLAY-LAN-ZOMBIES-4.1-2026-11-05.md',
  fileCountExcludingManifest:list.length,
  files:list
};
fs.writeFileSync(path.join(root,manifestName),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({result:'WROTE_GAMEPLAY_LAN_ZOMBIES_4.1_MANIFEST',fileCountExcludingManifest:list.length,manifestSha256:hashFile(path.join(root,manifestName)),sourceFingerprints:manifest.currentSourceFingerprints,changedParentFiles},null,2));
