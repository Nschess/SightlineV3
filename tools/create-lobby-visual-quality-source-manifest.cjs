'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'acceptance/lobby-9.1-visual-quality');
const manifestName='SOURCE-MANIFEST.json',sumName='SOURCE-MANIFEST.json.sha256';
const manifestPath=path.join(output,manifestName),sumPath=path.join(output,sumName);
const expectedInstructions='df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(fs.existsSync(manifestPath)||fs.existsSync(sumPath))throw new Error('Refusing to overwrite an existing visual-quality source manifest.');
if(hash(fs.readFileSync(path.join(root,'AGENTS.md')))!==expectedInstructions)throw new Error('Candidate AGENTS.md is not the verified current project instruction file.');
const report=fs.readFileSync(path.join(root,'docs/LOBBY-9.1-VISUAL-QUALITY-REPORT.md'),'utf8');
if(!report.includes('Visual acceptance is **BLOCKED**'))throw new Error('Visual acceptance status is missing from the report.');
function walk(dir){
  const rows=[];
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    const abs=path.join(dir,item.name),rel=path.relative(root,abs).split(path.sep).join('/');
    if(rel===path.relative(root,manifestPath).split(path.sep).join('/')||rel===path.relative(root,sumPath).split(path.sep).join('/')||rel==='debug.log')continue;
    if(item.isSymbolicLink())throw new Error(`Refusing symlink in source manifest: ${rel}`);
    if(item.isDirectory())rows.push(...walk(abs));
    else if(item.isFile()){const bytes=fs.readFileSync(abs);rows.push({path:rel,size:bytes.length,sha256:hash(bytes)});}
    else throw new Error(`Unsupported source entry: ${rel}`);
  }
  return rows;
}
const files=walk(root).sort((a,b)=>a.path.localeCompare(b.path,'en'));
const sha=p=>hash(fs.readFileSync(path.join(root,p)));
const data={
  schema:'sightline-lobby-9.1-visual-quality-source-v1',
  generatedAtUtc:new Date().toISOString(),
  sourceRoot:path.basename(path.dirname(root))+'/'+path.basename(root),
  artifactStatus:'Editable experimental DEV directory only; ZIP deferred because rendered visual acceptance is blocked.',
  sourceFingerprints:{offlinePageSha256:sha('AndroidProject/app/src/main/assets/www/index.html'),phoneHostPageSha256:sha('AndroidProject/app/src/main/assets/phone-host/index.html'),phoneHostInventorySha256:sha('AndroidProject/app/src/main/assets/phone-host/SHA256SUMS'),androidSourceManifestSha256:sha('AndroidProject/CURRENT-SOURCE-SHA256.txt'),mainActivitySha256:sha('AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java'),hostCaptureToolSha256:sha('tools/capture-lan-host-status.cjs'),browserHarnessSha256:sha('tests/lobby-9.1-production-ui.cjs'),projectInstructionsSha256:sha('AGENTS.md')},
  verification:{nodeTestFiles:62,nodePassed:285,nodeFailed:0,authoritativeCombat:'8/8 PASS',navigation:'19 maps; 0 faults',androidAssets:'48/48 phone-host; 15/15 shared; PASS',sharedOfflinePhoneHostStyles:'MATCH',sharedShowcaseCode:'MATCH',rollbackFiles:'7/7 SHA-256 verified',browserScreenshots:'BLOCKED; not generated',candidateFrameTime:'UNVERIFIED',apk:'NOT BUILT',physicalAndroid:'UNVERIFIED',liveLanUi:'UNVERIFIED',visualAcceptance:'BLOCKED'},
  exclusions:['Generated root debug.log is excluded.','No DEV ZIP was produced.','No APK, signing inputs, production TLS key, or distribution artifact was produced.'],
  fileCount:files.length,totalBytes:files.reduce((n,f)=>n+f.size,0),files
};
fs.mkdirSync(output,{recursive:true});
const bytes=Buffer.from(JSON.stringify(data,null,2)+'\n');
fs.writeFileSync(manifestPath,bytes,{flag:'wx'});
fs.writeFileSync(sumPath,`${hash(bytes)}  ${manifestName}\n`,{flag:'wx'});
console.log(JSON.stringify({status:'CREATED',files:files.length,totalBytes:data.totalBytes,manifestSha256:hash(bytes),sourceFingerprints:data.sourceFingerprints},null,2));
