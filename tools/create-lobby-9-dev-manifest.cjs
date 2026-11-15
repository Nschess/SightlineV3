'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const manifestName='LOBBY-9.0-DEV-MANIFEST.json',sumName=manifestName+'.sha256';
const expectedInstructions='df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2';
if(fs.existsSync(path.join(root,manifestName))||fs.existsSync(path.join(root,sumName)))throw new Error('Refusing to overwrite an existing Lobby 9.0 package manifest.');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const fileHash=p=>hash(fs.readFileSync(p));
const instructionsHash=fileHash(path.join(root,'AGENTS.md'));
if(instructionsHash!==expectedInstructions)throw new Error(`Project instructions differ from the current approved copy: ${instructionsHash}`);
function walk(dir){
  const result=[];
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const abs=path.join(dir,e.name),rel=path.relative(root,abs).split(path.sep).join('/');
    if(rel===manifestName||rel===sumName||rel==='debug.log')continue;
    if(e.isSymbolicLink())throw new Error(`Refusing a symbolic link in the DEV package: ${rel}`);
    if(e.isDirectory())result.push(...walk(abs));
    else if(e.isFile())result.push({path:rel,size:fs.statSync(abs).size,sha256:fileHash(abs)});
    else throw new Error(`Unsupported filesystem entry: ${rel}`);
  }
  return result;
}
const files=walk(root).sort((a,b)=>a.path.localeCompare(b.path,'en'));
for(const required of ['AGENTS.md','LOBBY-9.0-QUICKSTART.md','docs/LOBBY-9.0-IMPLEMENTATION-REPORT.md','docs/LOBBY-9.0-ROLLBACK.md','acceptance/lobby-9-full-verification.json','acceptance/lobby-9-actual-browser/report.json','AndroidProject/app/src/main/assets/www/index.html','AndroidProject/app/src/main/assets/phone-host/index.html','AndroidProject/app/src/main/assets/phone-host/SHA256SUMS','AndroidProject/CURRENT-SOURCE-SHA256.txt'])if(!files.some(f=>f.path===required))throw new Error(`Required DEV package file is missing: ${required}`);
const pick=p=>files.find(f=>f.path===p);
const manifest={
  schemaVersion:1,
  packageName:'SightlineV3-Lobby-9.0-EXPERIMENTAL-DEV-2026-11-07',
  packageType:'editable experimental DEV source and acceptance evidence; not a release',
  generatedAtUtc:new Date().toISOString(),
  parentBaseline:{name:'Sightline V3 Gameplay Expansion 8.3',preservedInSeparateSourceTree:true,preLobbyOfflineSha256:'565ad5f794020834cb0a2176162ffb7e7a2f092ca53fdd2d05d3f582ab710952',preLobbyPhoneHostSha256:'2958f32d4dc4158114306fd4eeda03f462379d0c1921de89d345e72d615d90a3'},
  sourceFingerprints:{offlinePageSha256:pick('AndroidProject/app/src/main/assets/www/index.html').sha256,phoneHostPageSha256:pick('AndroidProject/app/src/main/assets/phone-host/index.html').sha256,phoneHostManifestSha256:pick('AndroidProject/app/src/main/assets/phone-host/SHA256SUMS').sha256,androidSourceManifestSha256:pick('AndroidProject/CURRENT-SOURCE-SHA256.txt').sha256,projectInstructionsSha256:instructionsHash},
  verification:{nodeTestFiles:62,nodePassed:285,nodeFailed:0,authoritativeCombat:'8/8 PASS',navigation:'19 maps; 0 faults',androidAssetParity:'48/48 phone-host files; 15/15 shared modules; PASS',isolatedProductionPageBrowser:'8/8 scenarios PASS; 0 page errors; SwiftShader',offlineDeployment:'PASS in isolated Chromium',mobileLandscape:'PASS at emulated 960x540; no horizontal overflow',currentSourceApk:'NOT BUILT',liveLanWebSocket:'BLOCKED',physicalAndroid:'UNVERIFIED',humanVisualReview:'UNVERIFIED'},
  exclusions:['Generated root debug.log is excluded.','No APK, release credentials, private TLS material, or distribution artifacts are included.','No node_modules, external browser installation, or Android SDK was added by this lobby task.'],
  fileCountExcludingThisManifestAndChecksum:files.length,
  totalBytes:files.reduce((n,f)=>n+f.size,0),
  files
};
const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(root,manifestName),bytes,{flag:'wx'});
fs.writeFileSync(path.join(root,sumName),`${hash(bytes)}  ${manifestName}\n`,{flag:'wx'});
console.log(JSON.stringify({status:'CREATED',fileCount:files.length,totalBytes:manifest.totalBytes,manifestSha256:hash(bytes),sourceFingerprints:manifest.sourceFingerprints},null,2));
