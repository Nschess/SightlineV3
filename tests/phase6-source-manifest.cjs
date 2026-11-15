'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const android=path.resolve(__dirname,'../AndroidProject');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const lines=fs.readFileSync(path.join(android,'CURRENT-SOURCE-SHA256.txt'),'utf8').trim().split(/\r?\n/);
const seen=new Set();
for(const line of lines){
  const m=line.match(/^([a-f0-9]{64})  (.+)$/);if(!m)throw Error('Malformed source hash entry: '+line);
  const rel=m[2];if(seen.has(rel)||path.isAbsolute(rel)||rel.split(/[\\/]/).some(p=>p==='..'||p==='.'||!p))throw Error('Duplicate or unsafe source path: '+rel);
  seen.add(rel);const file=path.join(android,rel);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()||digest(fs.readFileSync(file))!==m[1])throw Error('Source hash mismatch: '+rel);
}
if(!seen.has('app/src/main/assets/phone-host/weapon-realism.js')||!seen.has('app/src/main/assets/www/weapon-realism.js'))throw Error('New module missing from Android source manifest');
for(const name of [
  'app/src/main/assets/phone-host/host-transport-config.js',
  'app/src/main/assets/phone-host/mp-transport-policy.js',
  'app/src/main/assets/www/mp-transport-policy.js',
  'app/src/debug/AndroidManifest.xml',
  'app/src/debug/res/xml/network_security_config.xml'
])if(!seen.has(name))throw Error('Secure transport file missing from Android source manifest: '+name);
const host=path.join(android,'app/src/main/assets/phone-host'),offline=path.join(android,'app/src/main/assets/www');
if(!fs.readFileSync(path.join(host,'weapon-realism.js')).equals(fs.readFileSync(path.join(offline,'weapon-realism.js'))))throw Error('Host/offline parity mismatch: weapon-realism.js');
if(!fs.readFileSync(path.join(host,'mp-transport-policy.js')).equals(fs.readFileSync(path.join(offline,'mp-transport-policy.js'))))throw Error('Host/offline parity mismatch: mp-transport-policy.js');
const server=fs.readFileSync(path.join(host,'server.js'),'utf8'),gradle=fs.readFileSync(path.join(android,'app/build.gradle'),'utf8');
if(!server.includes("HostTransport.createListener(")||!server.includes("'--transport release'")&& !server.includes('Release transport requires its configured'))throw Error('Host HTTPS/WSS release listener guard is missing');
if(!gradle.includes('SECURE_LAN_RELEASE')||!gradle.includes('sightlineLanTlsHost'))throw Error('Android secure release transport build policy is missing');
for(const name of ['index.html']){
  const html=fs.readFileSync(path.join(host,name),'utf8'),offlineHtml=fs.readFileSync(path.join(offline,name),'utf8');
  for(const [variant,source] of [['phone-host',html],['offline',offlineHtml]]){
    if(!source.includes('<script src="weapon-realism.js"></script>'))throw Error(variant+' page does not load the shared weapon module');
    if(!source.includes('<script src="mp-transport-policy.js"></script>'))throw Error(variant+' page does not load the transport policy');
    if(!source.includes('SightlineTransport.resolveWebSocketEndpoint'))throw Error(variant+' page does not enforce WS/WSS selection');
    if(!/SEND_MS\s*=\s*20/.test(source))throw Error(variant+' multiplayer input cadence is not 20 ms');
  }
}
console.log(`PASS ${lines.length}/${lines.length} current Android source hashes; shared module, host/offline load path, and multiplayer cadence verified`);
