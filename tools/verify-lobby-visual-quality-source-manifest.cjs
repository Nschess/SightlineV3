'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'acceptance/lobby-9.1-visual-quality');
const manifestName='SOURCE-MANIFEST.json',sumName='SOURCE-MANIFEST.json.sha256';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function walk(dir){const a=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name),rel=path.relative(root,p).split(path.sep).join('/');if(rel==='acceptance/lobby-9.1-visual-quality/'+manifestName||rel==='acceptance/lobby-9.1-visual-quality/'+sumName||rel==='debug.log')continue;if(e.isSymbolicLink())throw new Error(`Unexpected symlink: ${rel}`);if(e.isDirectory())a.push(...walk(p));else if(e.isFile())a.push(rel);else throw new Error(`Unexpected entry: ${rel}`);}return a;}
try{
  const bytes=fs.readFileSync(path.join(output,manifestName));
  const side=fs.readFileSync(path.join(output,sumName),'utf8').trim().match(/^([a-f0-9]{64})  SOURCE-MANIFEST\.json$/);
  if(!side||hash(bytes)!==side[1])throw new Error('Source-manifest checksum mismatch.');
  const doc=JSON.parse(bytes.toString('utf8')),listed=new Map();let total=0;
  for(const file of doc.files){if(listed.has(file.path))throw new Error(`Duplicate manifest path: ${file.path}`);listed.set(file.path,file);const abs=path.resolve(root,...file.path.split('/'));if(!abs.startsWith(root+path.sep))throw new Error(`Unsafe manifest path: ${file.path}`);const data=fs.readFileSync(abs);if(data.length!==file.size||hash(data)!==file.sha256)throw new Error(`File size/hash mismatch: ${file.path}`);total+=data.length;}
  const actual=walk(root).sort((a,b)=>a.localeCompare(b,'en')),expected=[...listed.keys()].sort((a,b)=>a.localeCompare(b,'en'));
  if(actual.length!==expected.length)throw new Error(`Inventory mismatch: actual ${actual.length}, manifest ${expected.length}`);
  for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])throw new Error(`Missing or unlisted file: ${actual[i]||expected[i]}`);
  const pageHash=hash(fs.readFileSync(path.join(root,'AndroidProject/app/src/main/assets/phone-host/index.html')));
  const main=fs.readFileSync(path.join(root,'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java'),'utf8');
  if(!main.includes(`HOST_BUNDLE_SHA256 = "${pageHash}"`))throw new Error('Android host page pin mismatch.');
  console.log(JSON.stringify({status:'PASS',manifestSha256:side[1],files:actual.length,totalBytes:total,visualAcceptance:doc.verification.visualAcceptance,zipProduced:false},null,2));
}catch(error){console.error(JSON.stringify({status:'FAIL',reason:error.message}));process.exitCode=1;}
