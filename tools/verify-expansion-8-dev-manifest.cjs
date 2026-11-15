'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(process.argv[2]||'.');
const manifestRel='acceptance/EXPANSION-8.0-DEV-MANIFEST.json';
const manifestPath=path.join(root,...manifestRel.split('/'));
const fail=message=>{throw new Error(message);};
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if(!fs.existsSync(manifestPath))fail(`Missing package manifest: ${manifestPath}`);
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(manifest.packageName!=='SightlineV3-Gameplay-Expansion-8.0-EXPERIMENTAL-DEV-2026-11-06')fail('Unexpected package identity');
const excluded=new Set(manifest.excludedFiles);
const expected=new Map();
for(const entry of manifest.files){
  const rel=entry.path.replace(/\\/g,'/');
  if(!rel||path.posix.isAbsolute(rel)||rel.split('/').some(p=>!p||p==='.'||p==='..'))fail(`Unsafe package path: ${entry.path}`);
  if(expected.has(rel))fail(`Duplicate manifest path: ${rel}`);
  const file=path.resolve(root,...rel.split('/'));
  if(!file.startsWith(root+path.sep))fail(`Manifest path escaped root: ${rel}`);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())fail(`Missing file: ${rel}`);
  if(fs.statSync(file).size!==entry.size)fail(`Size mismatch: ${rel}`);
  const actual=digest(file);if(actual!==entry.sha256)fail(`SHA-256 mismatch: ${rel}`);
  expected.set(rel,entry);
}
const actual=new Set();
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name),rel=path.relative(root,file).split(path.sep).join('/');
    if(entry.isSymbolicLink())fail(`Unexpected symbolic link: ${rel}`);
    if(entry.isDirectory())walk(file);
    else if(entry.isFile()&&rel!==manifestRel&&!excluded.has(rel))actual.add(rel);
    else if(!entry.isFile())fail(`Unsupported filesystem entry: ${rel}`);
  }
}
walk(root);
for(const rel of actual)if(!expected.has(rel))fail(`Unmanifested file: ${rel}`);
for(const rel of expected.keys())if(!actual.has(rel))fail(`Manifest-only file: ${rel}`);
const agents=path.join(root,'AGENTS.md');
if(!fs.existsSync(agents))fail('Root AGENTS.md missing');
if(digest(agents)!==manifest.sourceFingerprints.projectInstructions)fail('Root AGENTS.md hash differs from the package fingerprint');
console.log(JSON.stringify({status:'PASS',packageName:manifest.packageName,verifiedFiles:expected.size,manifestSha256:digest(manifestPath),instructionsSha256:digest(agents),excludedFiles:[...excluded]},null,2));
