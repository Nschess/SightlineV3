const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'), android=path.join(root,'AndroidProject');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const rel=p=>path.relative(android,p).split(path.sep).join('/');
const phone=path.join(android,'app/src/main/assets/phone-host');
const entries=fs.readdirSync(phone,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(phone,d.name)):d.isFile()?[path.join(phone,d.name)]:[]).filter(p=>path.basename(p)!=='SHA256SUMS'&&path.relative(phone,p).split(path.sep).join('/')!=='fps-lab.html').map(p=>[rel(p),hash(fs.readFileSync(p))]).sort((a,b)=>a[0].localeCompare(b[0]));
function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):e.isFile()?[path.join(d,e.name)]:[])}
fs.writeFileSync(path.join(phone,'SHA256SUMS'),entries.map(([n,h])=>`${h}  ${n.slice('app/src/main/assets/phone-host/'.length)}`).join('\n')+'\n');
const indexHash=hash(fs.readFileSync(path.join(phone,'index.html')));
const mainPath=path.join(android,'app/src/main/java/com/sightline/v3/MainActivity.java');let main=fs.readFileSync(mainPath,'utf8');
main=main.replace(/(HOST_BUNDLE_SHA256\s*=\s*")[a-f0-9]{64}(")/,(m,a,b)=>a+indexHash+b);fs.writeFileSync(mainPath,main);
const manifestPath=path.join(android,'CURRENT-SOURCE-SHA256.txt');const old=fs.readFileSync(manifestPath,'utf8').split(/\r?\n/).filter(Boolean);const listed=new Set(old.map(line=>{const m=line.match(/^([a-f0-9]{64})\s+(.+)$/);if(!m)throw Error('bad manifest line: '+line);return m[2];}));for(const name of ['app/src/main/assets/phone-host/weapon-realism.js','app/src/main/assets/www/weapon-realism.js','app/src/main/assets/phone-host/host-transport-config.js','app/src/main/assets/phone-host/mp-transport-policy.js','app/src/main/assets/www/mp-transport-policy.js','app/src/main/assets/phone-host/legendary-packs.js','app/src/main/assets/www/legendary-packs.js','app/src/debug/AndroidManifest.xml','app/src/debug/res/xml/network_security_config.xml'])if(!listed.has(name))old.push(`${hash(fs.readFileSync(path.join(android,name)))}  ${name}`);const rows=old.map(line=>{const m=line.match(/^([a-f0-9]{64})\s+(.+)$/);if(!m)throw Error('bad manifest line: '+line);const target=path.join(android,m[2]);if(!fs.existsSync(target))throw Error('missing listed source: '+m[2]);return `${hash(fs.readFileSync(target))}  ${m[2]}`});fs.writeFileSync(manifestPath,rows.join('\n')+'\n');
console.log(JSON.stringify({phoneHostFiles:entries.length,indexSha256:indexHash,sourceManifestEntries:rows.length,sourceManifestSha256:hash(fs.readFileSync(manifestPath))},null,2));

