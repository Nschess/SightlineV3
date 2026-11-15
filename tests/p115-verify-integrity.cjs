'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert');
const root=path.resolve(__dirname,'..'),manifest=path.join(root,'acceptance/P115-FINAL-SHA256SUMS.txt');
const lines=fs.readFileSync(manifest,'utf8').trim().split('\n');const expected=new Map();
for(const line of lines){const m=line.match(/^([a-f0-9]{64})  (.+)$/);assert(m,'invalid manifest entry');assert(!expected.has(m[2]),'duplicate path');assert(!path.isAbsolute(m[2])&&!m[2].split('/').includes('..'),'unsafe manifest entry');expected.set(m[2],m[1]);}
let errors=[];
for(const [rel,hash] of expected){const f=path.join(root,rel);if(!fs.existsSync(f))errors.push('missing '+rel);else if(crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')!==hash)errors.push('hash mismatch '+rel);}
function gather(dir){let out=[];for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name==='__pycache__')continue;const p=path.join(dir,entry.name);if(entry.isDirectory())out.push(...gather(p));else if(entry.isFile()&&p!==manifest)out.push(path.relative(root,p).split(path.sep).join('/'));}return out;}
for(const rel of gather(root)){if(!expected.has(rel))errors.push('unexpected '+rel);}
console.log((errors.length?'FAIL':'PASS')+' P11.5 source integrity: '+expected.size+' listed files; '+errors.length+' issues');for(const e of errors.slice(0,20))console.error(e);if(errors.length)process.exitCode=1;
