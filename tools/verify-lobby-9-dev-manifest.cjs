'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),manifestName='LOBBY-9.0-DEV-MANIFEST.json',sumName=manifestName+'.sha256';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),fail=m=>{console.error('FAIL '+m);process.exitCode=1;};
try{
  const bytes=fs.readFileSync(path.join(root,manifestName)),side=fs.readFileSync(path.join(root,sumName),'utf8').trim().match(/^([a-f0-9]{64})  (.+)$/);
  if(!side||side[2]!==manifestName||hash(bytes)!==side[1])throw new Error('Candidate manifest checksum mismatch.');
  const m=JSON.parse(bytes.toString('utf8')),expectedInstructions='df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2';
  if(hash(fs.readFileSync(path.join(root,'AGENTS.md')))!==expectedInstructions)throw new Error('Root AGENTS.md is missing or is not the current project instruction copy.');
  const listed=new Map();let total=0;
  for(const f of m.files){if(listed.has(f.path))throw new Error(`Duplicate manifest path: ${f.path}`);listed.set(f.path,f);const target=path.resolve(root,...f.path.split('/'));if(!target.startsWith(root+path.sep))throw new Error(`Unsafe manifest path: ${f.path}`);const stat=fs.statSync(target);if(!stat.isFile()||stat.size!==f.size||hash(fs.readFileSync(target))!==f.sha256)throw new Error(`Manifest mismatch: ${f.path}`);total+=stat.size;}
  const actual=[];
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name),rel=path.relative(root,p).split(path.sep).join('/');if(rel===manifestName||rel===sumName||rel==='debug.log')continue;if(e.isSymbolicLink())throw new Error(`Unexpected symbolic link: ${rel}`);if(e.isDirectory())walk(p);else if(e.isFile())actual.push(rel);else throw new Error(`Unexpected filesystem entry: ${rel}`);}}
  walk(root);actual.sort();const expected=[...listed.keys()].sort();if(actual.length!==expected.length)throw new Error(`File inventory count mismatch: actual ${actual.length}, listed ${expected.length}`);for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])throw new Error(`Unlisted or missing package file: ${actual[i]||expected[i]}`);
  const android=path.join(root,'AndroidProject'),host=path.join(android,'app/src/main/assets/phone-host'),hostRows=fs.readFileSync(path.join(host,'SHA256SUMS'),'utf8').trim().split(/\r?\n/),sourceRows=fs.readFileSync(path.join(android,'CURRENT-SOURCE-SHA256.txt'),'utf8').trim().split(/\r?\n/);
  function verifyRows(rows,base,label){for(const line of rows){const match=line.match(/^([a-f0-9]{64})  (.+)$/);if(!match)throw new Error(`Malformed ${label} entry: ${line}`);const target=path.resolve(base,...match[2].split('/'));if(!target.startsWith(base+path.sep)||!fs.statSync(target).isFile()||hash(fs.readFileSync(target))!==match[1])throw new Error(`${label} hash mismatch: ${match[2]}`);}}
  verifyRows(hostRows,host,'phone-host inventory');verifyRows(sourceRows,android,'Android source inventory');
  const pageHash=hash(fs.readFileSync(path.join(host,'index.html'))),main=fs.readFileSync(path.join(android,'app/src/main/java/com/sightline/v3/MainActivity.java'),'utf8');if(!main.includes(`HOST_BUNDLE_SHA256 = "${pageHash}"`))throw new Error('Android host bundle pin is stale.');
  console.log(JSON.stringify({status:'PASS',manifestSha256:side[1],files:actual.length,totalBytes:total,projectInstructionsSha256:expectedInstructions,phoneHostEntries:hostRows.length,androidSourceEntries:sourceRows.length,offlinePageSha256:hash(fs.readFileSync(path.join(android,'app/src/main/assets/www/index.html'))),phoneHostPageSha256:pageHash},null,2));
}catch(error){fail(error.message);}
