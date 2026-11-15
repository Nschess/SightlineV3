const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets');
const THREE = require(path.join(assets, 'www/three.min.js'));
const html = fs.readFileSync(path.join(assets, 'www/index.html'), 'utf8');
const phoneHtml = fs.readFileSync(path.join(assets, 'phone-host/index.html'), 'utf8');
const packSource = fs.readFileSync(path.join(assets, 'www/legendary-packs.js'), 'utf8');
const skinsSource = fs.readFileSync(path.join(assets, 'www/weapon-skins.js'), 'utf8');

assert.equal(THREE.REVISION, '128', 'candidate stays on the packaged Three.js renderer');
const offlineFinishApplication = html.match(/function finishGun\(g\)\s*\{[\s\S]*?\n\}/);
const phoneFinishApplication = phoneHtml.match(/function finishGun\(g\)\s*\{[\s\S]*?\n\}/);
assert.ok(offlineFinishApplication && phoneFinishApplication, 'both production entrypoints expose the shared finish application');
assert.equal(phoneFinishApplication[0], offlineFinishApplication[0], 'shared weapon-finish runtime stays byte-identical across route-specific pages');
assert.match(packSource, /original Verdant module SHA-256 c7dc825c243afe0d9b05c36cc5ee0ead3c99cad39fcd081694856b9d02e84aeb/,
  'restored module records the audited uploaded-source section hash');

function canvasStub() {
  const context = new Proxy({
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; }
  }, { get(target, key) { return key in target ? target[key] : function () {}; }, set(target, key, value) { target[key] = value; return true; } });
  return { width: 1, height: 1, style: {}, getContext() { return context; }, addEventListener() {}, removeEventListener() {} };
}
const documentStub = { head: { appendChild() {} }, createElement(tag) { return tag === 'canvas' ? canvasStub() : { style: {}, classList: { add() {} }, appendChild() {} }; } };
const browser = { console, document: documentStub, innerHeight: 720, performance: { now: () => 0 } };
browser.window = browser;
vm.createContext(browser);
vm.runInContext(packSource, browser, { filename: 'legendary-packs.js', timeout: 20000 });
global.window = browser;
global.document = documentStub;
const skinsPath = path.join(assets, 'www/weapon-skins.js');
delete require.cache[require.resolve(skinsPath)];
const skins = require(skinsPath);

const spec = skins.legend.prototype('rook117');
assert.equal(spec.title, 'Emerald Revenant');
assert.equal(spec.pack, 'SightlineEmeraldRevenant', 'ROOK117 routes to the revived authored pack');
const pack = browser.SightlineEmeraldRevenant;
assert.ok(pack, 'the matching runtime pack was loaded');
assert.equal(pack.weapon, 'rook117');
assert.equal(pack.finish.name, spec.title, 'module identity and picker identity agree');
assert.equal(typeof pack.createFx, 'function');
for (const cue of ['equipSound', 'rearmSound', 'reloadSound', 'hitSound', 'mixShot']) assert.equal(typeof pack[cue], 'function');

const finishGunMatch = html.match(/function finishGun\(g\)\s*\{[\s\S]*?\n\}/);
assert.ok(finishGunMatch, 'the active game finish application path is present');
const finishGunSource = finishGunMatch[0];
const baseMaterialSetup = finishGunSource.indexOf('mesh.userData.finishBase=mat');
const authoredDressCall = finishGunSource.indexOf('lr.dress(g,true)');
assert.ok(baseMaterialSetup >= 0 && authoredDressCall > baseMaterialSetup,
  'finishGun applies the authored pack treatment after recording and setting the factory base materials');
assert.match(finishGunSource, /var lr=g\.userData\.legendRig;if\(lr&&lr\.dress&&lr\.group\.visible\)lr\.dress\(g,true\);/,
  'the visible authored Legendary rig dresses the real firearm meshes instead of showing only its animated detail group');

const host = new THREE.Group();
host.userData.weaponKey = 'rook117';
host.userData.sightY = 0.103;
host.userData.p10Id = 'red-dot';
host.userData.p10Optic = new THREE.Group(); host.userData.p10Optic.visible = true;
host.userData.profileOptic = new THREE.Group(); host.userData.profileOptic.visible = true;
host.add(host.userData.p10Optic, host.userData.profileOptic);
const baseMaterial = new THREE.MeshPhongMaterial({ color: 0x454d44, shininess: 50 });
const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.7), baseMaterial);
baseMesh.name = 'source-rook-receiver-test-fixture'; baseMesh.userData.finishBase = baseMaterial;
host.add(baseMesh);
const sourceGeometry = baseMesh.geometry;

const rig = skins.legend.buildRig(THREE, 'rook117', host);
assert.equal(rig.kind, 'verdant', 'the actual build route returns the authored Verdant shader/effect design');
assert.notEqual(rig.replacesBase, true, 'the revived pack decorates the factory rifle rather than replacing it');
host.add(rig.group);
host.updateMatrixWorld(true);
rig.dress(host, true);
assert.equal(baseMesh.geometry, sourceGeometry, 'factory rifle geometry remains unchanged');
assert.equal(baseMesh.visible, true, 'factory receiver is not hidden');
assert.notEqual(baseMesh.material, baseMaterial, 'the source material is dressed with the authored animated shader');
assert.equal(typeof baseMesh.material.onBeforeCompile, 'function');
assert.equal(baseMesh.material.customProgramCacheKey(), 'verdant-wyrm-v2');
const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>' };
baseMesh.material.onBeforeCompile(shader);
assert.match(shader.vertexShader, /vEcl=\(uInv\*modelMatrix\*vec4\(transformed,1\.\)\)\.xyz/);
assert.match(shader.fragmentShader, /eHex\(vec2 p,out vec2 id\)/);
assert.match(shader.fragmentShader, /totalEmissiveRadiance\+=/);
assert.equal(host.userData.sightY, 0.103, 'ADS anchor remains at the existing calibrated stock optic height');

const names = [];
let meshCount = 0;
rig.group.traverse(object => { if (object.isMesh) { meshCount++; names.push(object.name); } });
assert.ok(meshCount >= 15 && meshCount < 50, 'original rail, eye, muzzle and decorative geometry is present and bounded');
assert.equal(rig.group.name, 'verdant-wyrm-rig');
assert.ok(rig.group.children.some(object => object.isPoints), 'pooled animated spores are present');
assert.equal(pack.anchors.muzzle[2], -0.70, 'authored muzzle anchor is retained');
assert.equal(pack.anchors.spine.n, 9, 'the signature top-rail spine is retained');
assert.equal(pack.anchors.slats.n, 4, 'signature handguard slats are retained');

rig.setDetail('high'); rig.awaken(); rig.fire(); rig.setReload(0.4, true); rig.update(1 / 60, { ads: 0 });
assert.equal(rig.state.reloading, true, 'reload presentation uses the existing reload progress signal');
rig.setReload(1, false); rig.rearm(); rig.update(1 / 60, { ads: 0.7 });
assert.equal(rig.takeReload(), true, 'reload cue is queued once by the pack');
assert.equal(rig.takeRearm(), true, 'completion accent is queued once by the pack');

const scene = new THREE.Scene();
const fx = pack.createFx(THREE, scene);
assert.deepEqual(['spawn', 'burst', 'tick', 'setLow'].map(key => typeof fx[key]), ['function', 'function', 'function', 'function']);
fx.spawn(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, -4));
fx.burst(new THREE.Vector3(0, 1, -4), new THREE.Vector3(0, 1, 0), true);
fx.tick(1 / 60); fx.setLow(true); fx.tick(1 / 60);
assert.ok(scene.children.length > 0, 'weapon-specific tracer and impact effects attach to the game scene');

const opticMatch = html.match(/function legendRookOpticSync\(g,active\)\{[\s\S]*?\n\}/);
assert.ok(opticMatch, 'actual runtime ROOK117 optic synchronizer is present');
const opticContext = vm.createContext({ SightlineOptics: { has: () => true, current: () => 'red-dot' } });
vm.runInContext(opticMatch[0] + ';globalThis.sync=legendRookOpticSync;', opticContext);
opticContext.sync(host, true);
assert.equal(host.userData.p10Optic.visible, true, 'Legendary does not hide the player-selected optic');
assert.equal(host.userData.profileOptic.visible, true, 'Legendary does not hide the stock/profile optic');
assert.equal(host.userData.sightY, 0.103, 'Legendary leaves the calibrated ADS camera anchor intact');

assert.match(html, /source:'authored-legendary-pack'/, 'runtime diagnostic identifies the actual authored module path');
assert.match(html, /function legendaryPackFx\(key\)\{[\s\S]*?var pack=legendaryPackForAudio\(key\);if\(!pack\|\|!pack\.createFx\)return null;[\s\S]*?pack\.createFx\(THREE,scene\)/,
  'weapon-specific pooled effects instantiate only the identity-verified authored pack');
assert.match(html, /function legendaryPackElimination\(key,pos,from\)\{[\s\S]*?fx\.eliminate\(pos,from\);return true;/,
  'the flagship elimination route invokes its pack-authored signature effect');
const confirmedKill = html.match(/function legendConfirmedElimination\([^\n]+\n[\s\S]*?\n\}/);
assert.ok(confirmedKill, 'authoritative confirmed-elimination handler is present');
assert.ok(confirmedKill[0].indexOf("claimLegendEvent('elimination',eventId)") < confirmedKill[0].indexOf('legendaryPackElimination('),
  'pack elimination effects remain behind confirmed-event deduplication');
assert.match(html, /LEGENDARY_PACK_FX_KEYS=\{rampart:1,needle:1,rook117:1,ranger:1,tide:1,hawk:1,scatter:1,bulwark:1\}/,
  'pack-specific effects stay limited to the eight authored builders verified by the Legendary registry checks');
assert.match(skinsSource, /if\(pack\)return pack\.buildRig\(T,host,sp\);[\s\S]*?buildOriginalLegendaryRig/,
  'verified module selection occurs before the preserved legacy replacement fallback');

console.log('PASS: ROOK117 uses the archive-matched Emerald Revenant material treatment, rail/spore geometry, sound and pooled effect pack; active finish path applies the shader to the firearm body and preserves factory geometry/ADS optics');
console.log('METRICS', JSON.stringify({ meshes: meshCount, authoredMuzzle: pack.anchors.muzzle, packVersion: pack.version, baseGeometryPreserved: true, opticHeight: host.userData.sightY }));
