'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),manifestName='LOBBY-9.1-DEV-MANIFEST.json',sumName=manifestName+'.sha256';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
try{
 const bytes=fs.readFileSync(path.join(root,manifestName)),line=fs.readFileSync(path.join(root,sumName),'utf8').trim(),m=line.match(/^([a-f0-9]{64})  (.+)$/);
 if(!m||m[2]!==manifestName||hash(bytes)!==m[1])throw new Error('Manifest checksum mismatch.');
 const data=JSON.parse(bytes.toString('utf8')),expectedInstructions='df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2';
 if(hash(fs.readFileSync(path.join(root,'AGENTS.md')))!==expectedInstructions)throw new Error('Root AGENTS.md is missing or differs from the approved current instructions.');
 const listed=new Map();let total=0;
 for(const f of data.files){if(listed.has(f.path))throw new Error(`Duplicate manifest path: ${f.path}`);listed.set(f.path,f);const target=path.resolve(root,...f.path.split('/'));if(!target.startsWith(root+path.sep))throw new Error(`Unsafe manifest path: ${f.path}`);const stat=fs.statSync(target);if(!stat.isFile()||stat.size!==f.size||hash(fs.readFileSync(target))!==f.sha256)throw new Error(`File hash/size mismatch: ${f.path}`);total+=stat.size;}
 const actual=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name),rel=path.relative(root,p).split(path.sep).join('/');if(rel===manifestName||rel===sumName||rel==='debug.log')continue;if(e.isSymbolicLink())throw new Error(`Unexpected symbolic link: ${rel}`);if(e.isDirectory())walk(p);else if(e.isFile())actual.push(rel);else throw new Error(`Unexpected filesystem entry: ${rel}`);}}
 walk(root);actual.sort();const expected=[...listed.keys()].sort();if(actual.length!==expected.length)throw new Error(`File inventory count mismatch: actual ${actual.length}, expected ${expected.length}`);for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])throw new Error(`Unlisted or missing file: ${actual[i]||expected[i]}`);
 const android=path.join(root,'AndroidProject'),host=path.join(android,'app/src/main/assets/phone-host');
 function verifyRows(list,base,label){const rows=fs.readFileSync(list,'utf8').trim().split(/\r?\n/);for(const row of rows){const x=row.match(/^([a-f0-9]{64})  (.+)$/);if(!x)throw new Error(`Malformed ${label} row.`);const p=path.resolve(base,...x[2].split('/'));if(!p.startsWith(base+path.sep)||!fs.statSync(p).isFile()||hash(fs.readFileSync(p))!==x[1])throw new Error(`${label} hash mismatch: ${x[2]}`);}return rows.length;}
 const hostRows=verifyRows(path.join(host,'SHA256SUMS'),host,'Phone-host inventory'),androidRows=verifyRows(path.join(android,'CURRENT-SOURCE-SHA256.txt'),android,'Android source inventory');
 const hostHash=hash(fs.readFileSync(path.join(host,'index.html'))),main=fs.readFileSync(path.join(android,'app/src/main/java/com/sightline/v3/MainActivity.java'),'utf8');if(!main.includes(`HOST_BUNDLE_SHA256 = "${hostHash}"`))throw new Error('Android phone-host bundle pin is stale.');
 const browser=JSON.parse(fs.readFileSync(path.join(root,'acceptance/lobby-9.1-actual-browser/report.json'),'utf8')),perf=JSON.parse(fs.readFileSync(path.join(root,'acceptance/lobby-9.1-actual-browser/performance-comparison.json'),'utf8'));
 const offlineHash=hash(fs.readFileSync(path.join(android,'app/src/main/assets/www/index.html')));if(browser.entrypoints.offline.sha256!==offlineHash||browser.entrypoints.phoneHost.sha256!==hostHash||perf.candidate.offlinePageSha256!==offlineHash||perf.candidate.phoneHostPageSha256!==hostHash)throw new Error('Browser or renderer evidence source fingerprint does not match candidate.');
 console.log(JSON.stringify({status:'PASS',manifestSha256:m[1],files:actual.length,totalBytes:total,projectInstructionsSha256:expectedInstructions,phoneHostEntries:hostRows,androidSourceEntries:androidRows,offlinePageSha256:offlineHash,phoneHostPageSha256:hostHash},null,2));
}catch(e){console.error(JSON.stringify({status:'FAIL',reason:e.message}));process.exitCode=1;}
