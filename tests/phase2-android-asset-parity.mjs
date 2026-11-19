import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const assets=join(root,'AndroidProject','app','src','main','assets');
const host=join(assets,'phone-host'),offline=join(assets,'www');
const androidRoot=join(root,'AndroidProject');
const java=join(root,'AndroidProject','app','src','main','java','com','sightline','v3');
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=readFileSync(join(host,'SHA256SUMS'),'utf8').trim().split(/\r?\n/).map(line=>{
  const m=line.match(/^([a-f0-9]{64})  (.+)$/);assert.ok(m,`bad manifest entry: ${line}`);return [m[2],m[1]];
});
assert.equal(manifest.length,31,'host staging count must match native host service');
for(const [name,expected] of manifest){
  assert.ok(!name.startsWith('/')&&!name.includes('\\')&&!name.split('/').some(p=>!p||p==='.'||p==='..'),`unsafe path: ${name}`);
  const data=readFileSync(join(host,name));assert.equal(hash(data),expected,`host hash mismatch: ${name}`);
}
console.log(`PASS ${manifest.length}/${manifest.length} manifest-listed host files match SHA-256`);

const sourceRows=readFileSync(join(androidRoot,'CURRENT-SOURCE-SHA256.txt'),'utf8').trim().split(/\r?\n/).map(line=>{
  const m=line.match(/^([a-f0-9]{64})  (.+)$/);assert.ok(m,`bad Android source entry: ${line}`);return [m[2],m[1]];
});
for(const [name,expected] of sourceRows)assert.equal(hash(readFileSync(join(androidRoot,name))),expected,`Android source hash mismatch: ${name}`);
console.log(`PASS ${sourceRows.length}/${sourceRows.length} Android source files match CURRENT-SOURCE-SHA256.txt`);

const shared=['weapon-skins.js','character-skins.js','deathmatch-rules.js','gameplay-mode-rules.js','optics-v1.js','weapon-realism.js','infection-evasion.js','zombie-hunt.js','bot-tactics.js','character-poses.js','character-prototypes.js','character-realism.js','zombie-counterplay.js','navigation.js','mp-transport-policy.js'];
for(const name of [...shared,'legendary-packs.js'])assert.deepEqual(readFileSync(join(host,name)),readFileSync(join(offline,name)),`offline copy differs: ${name}`);
console.log(`PASS ${shared.length}/${shared.length} shared libraries match offline assets`);

const main=readFileSync(join(java,'MainActivity.java'),'utf8'),server=readFileSync(join(host,'server.js'),'utf8');
const page=readFileSync(join(host,'index.html'),'utf8'),service=readFileSync(join(java,'LanHostService.java'),'utf8');
const pageHash=hash(readFileSync(join(host,'index.html')));
assert.ok(main.includes(`HOST_BUNDLE_SHA256 = "${pageHash}"`),'native bundle hash pin differs');
const fileAllowlist=main.match(/private static final Set<String> FILES = new HashSet<>\(Arrays\.asList\(([\s\S]*?)\)\);/);
const hostAllowlist=main.match(/private static final Set<String> HOSTED_MODULES = new HashSet<>\(Arrays\.asList\(([\s\S]*?)\)\);/);
assert.ok(fileAllowlist&&fileAllowlist[1].includes('"gameplay-mode-rules.js"'),'offline Android asset allowlist omits the FFA/Bomb rules module');
assert.ok(hostAllowlist&&hostAllowlist[1].includes('"gameplay-mode-rules.js"'),'Android hosted-module allowlist omits the FFA/Bomb rules module');
for(const name of shared){
  assert.ok(main.includes(`"${name}"`),`native allowlist missing ${name}`);
  assert.ok(server.includes(`'/${name}'`),`Node route missing ${name}`);
  assert.ok(page.includes(`<script src="${name}"></script>`),`host page missing ${name}`);
}
for(const name of ['legendary-packs.js']){
  assert.ok(main.includes(`"${name}"`),`native offline allowlist missing ${name}`);
  assert.ok(main.includes(`"${name}"`),`native hosted-module allowlist missing ${name}`);
  assert.ok(server.includes(`'/${name}'`),`Node route missing ${name}`);
  assert.ok(page.includes(`<script src="${name}"></script>`),`host page missing ${name}`);
  assert.ok(readFileSync(join(offline,name)).equals(readFileSync(join(host,name))),`offline copy differs: ${name}`);
}
const themeName='sightline-theme.mp3';
const themeBytes=readFileSync(join(host,themeName));
const themeHash=hash(themeBytes);
assert.deepEqual(themeBytes,readFileSync(join(offline,themeName)),'Offline and phone-host theme assets differ');
assert.ok(manifest.some(([name,expected])=>name===themeName&&expected===themeHash),'owner-provided lobby theme is missing or not hash-pinned');
assert.ok(server.includes("'/sightline-theme.mp3':['sightline-theme.mp3','audio/mpeg']"),'phone-host server does not route the theme as MP3');
const offlinePage=readFileSync(join(offline,'index.html'),'utf8');
for(const [label,html] of [['offline',offlinePage],['phone-host',page]]){
  assert.ok(html.includes("el.src='sightline-theme.mp3';el.preload='auto';el.loop=true"),`${label} page does not load the owner-provided theme`);
  assert.ok(html.includes("addEventListener('pointerdown',lobbyMusicGesture,true)"),`${label} page lacks the user-gesture autoplay fallback`);
}
const offlineAllowlist=main.match(/private static final Set<String> FILES = new HashSet<>\(Arrays\.asList\(([\s\S]*?)\)\);/);
assert.ok(offlineAllowlist&&offlineAllowlist[1].includes('"sightline-theme.mp3"'),'Android WebView offline allowlist blocks the theme asset');
assert.ok(service.includes('hashes.size()!=31'),'Android host service count differs');
assert.ok(service.includes('hashes.containsKey("sightline-theme.mp3")'),'Android host staging does not require the active theme');
assert.ok(service.includes('b.size()>16_000_000'),'Android host staging file-size guard is missing');
assert.ok(service.includes('hashes.containsKey("legendary-packs.js")'),'Android host staging does not require Legendary module');
assert.ok(service.includes('hashes.containsKey("gameplay-mode-rules.js")'),'Android host staging does not require the shared FFA/Bomb rules module');
assert.ok(main.includes('"gameplay-mode-rules.js"'),'Android offline and hosted module allowlists omit the FFA/Bomb rules module');
assert.ok(service.includes('"--transport","dev"'),'Android development phone-host must select development HTTP/WS explicitly');
assert.ok(server.includes("'/mp-transport-policy.js'"),'Node route missing secure transport policy');
assert.ok(main.includes('"mp-transport-policy.js"'),'Android WebView allowlist missing secure transport policy');
for(const [label,html] of [['host',page],['offline',readFileSync(join(offline,'index.html'),'utf8')]]){
  assert.ok(html.includes('<script src="infection-evasion.js"></script>'),`${label} page missing Infection module`);
  for(const hook of ['SightlineInfectionEvasion.gunshot','SightlineInfectionEvasion.hurt','SightlineInfectionEvasion.choose'])
    assert.ok(html.includes(hook),`${label} page missing ${hook} integration`);
  let inlineCount=0;
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
    if(/\bsrc\s*=/.test(match[1])||!match[2].trim()||/application\/json|importmap/i.test(match[1]))continue;
    new Script(match[2],{filename:`${label}-inline-${++inlineCount}.js`});
  }
  assert.ok(inlineCount>0,`${label} page has no inline game scripts`);
  console.log(`PASS ${label} page Infection hooks and ${inlineCount} inline script syntax blocks`);
}
for(const [root,html] of [[host,page],[offline,offlinePage]]){
  assert.ok(!existsSync(join(root,'rook117')),'obsolete Blender payload remains packaged');
  assert.ok(!html.includes('SightlineRook117Asset')&&!html.includes('rook117/'),'obsolete ROOK117 loader remains active');
  assert.ok(html.includes("rook117:{length:.65,anchor:'right-palm'}"),'ROOK117 must use the shared world presentation');
}
assert.ok(!manifest.some(([name])=>name.startsWith('rook117/')),'obsolete ROOK117 host asset still staged');
assert.ok(!server.includes('/rook117/')&&!main.includes('rook117/'),'obsolete ROOK117 routes remain exposed');
for(const name of ['index-fp-grip-qa.html','gltf-loader-r128.js','fp-hands-rig.js','models/fp-arms/data/lmg.js','models/fp-arms/data/marksman.js','models/fp-arms/data/melee.js','models/fp-arms/data/pistol.js','models/fp-arms/data/rifle.js','models/fp-arms/data/shotgun.js','models/fp-arms/data/smg.js']){
  assert.ok(!manifest.some(([p])=>p===name),`rejected first-person rig remains in host manifest: ${name}`);
  assert.ok(!main.includes(`"${name}"`),`Android allowlist still exposes rejected rig: ${name}`);
  assert.ok(!server.includes(name),`phone-host server still exposes rejected rig: ${name}`);
  for(const root of [host,offline])assert.ok(!existsSync(join(root,name)),`rejected first-person asset still exists: ${name}`);
}
assert.ok(!page.includes('fp-hands-rig.js')&&!page.includes('gltf-loader-r128.js'),'host page still references rejected FP loader');
assert.ok(!readFileSync(join(offline,'index.html'),'utf8').includes('fp-hands-rig.js'),'offline page still references rejected FP loader');
console.log('PASS Android bundle pin, native/Node allowlists, rejection removal, module imports, and ROOK117 assets');
console.log('NOTE Static asset parity is not an APK build or device test.');
