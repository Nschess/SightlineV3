'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const manifestRel='acceptance/EXPANSION-8.0-DEV-MANIFEST.json';
const excluded=[
  'PACKAGE-MANIFEST.json',
  'artifacts/baseline/SightlineV3-Android-5.1-debug-v4.apk'
];
const excludedSet=new Set(excluded);
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rel=file=>path.relative(root,file).split(path.sep).join('/');
const files=[];
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name),name=rel(file);
    if(entry.isSymbolicLink())throw new Error(`Refusing symbolic link: ${name}`);
    if(entry.isDirectory())walk(file);
    else if(entry.isFile()&&!excludedSet.has(name)&&name!==manifestRel)files.push({path:name,size:fs.statSync(file).size,sha256:digest(file)});
    else if(!entry.isFile())throw new Error(`Unsupported filesystem entry: ${name}`);
  }
}
walk(root);
files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
const assets=path.join(root,'AndroidProject/app/src/main/assets');
const manifest={
  schemaVersion:1,
  packageName:'SightlineV3-Gameplay-Expansion-8.0-EXPERIMENTAL-DEV-2026-11-06',
  packageType:'experimental editable source and verification evidence; not an APK, signed release, or public distribution',
  generatedAtUtc:new Date().toISOString(),
  filesExcludingManifest:files.length,
  sourceFingerprints:{
    offlinePage:digest(path.join(assets,'www/index.html')),
    phoneHostPage:digest(path.join(assets,'phone-host/index.html')),
    phoneHostServer:digest(path.join(assets,'phone-host/server.js')),
    phoneHostAssetManifest:digest(path.join(assets,'phone-host/SHA256SUMS')),
    androidSourceManifest:digest(path.join(root,'AndroidProject/CURRENT-SOURCE-SHA256.txt')),
    projectInstructions:digest(path.join(root,'AGENTS.md'))
  },
  excludedFiles:excluded,
  files
};
const target=path.join(root,...manifestRel.split('/'));
if(fs.existsSync(target))throw new Error(`Refusing to overwrite existing manifest: ${target}`);
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({status:'CREATED',manifest:manifestRel,files:files.length,sha256:digest(target),sourceFingerprints:manifest.sourceFingerprints,excluded},null,2));
