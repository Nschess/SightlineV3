'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets');
const THREE = require(path.join(assets, 'www', 'three.min.js'));
const skins = require(path.join(assets, 'www', 'weapon-skins.js'));
const offline = fs.readFileSync(path.join(assets, 'www', 'index.html'), 'utf8');
const phone = fs.readFileSync(path.join(assets, 'phone-host', 'index.html'), 'utf8');
const phoneSkins = fs.readFileSync(path.join(assets, 'phone-host', 'weapon-skins.js'), 'utf8');
const sharedAudio = page => {
  const start = page.indexOf('var LEGEND_AUDIO_PROFILES={');
  const end = page.indexOf('var legendSeenEvents=', start);
  assert.ok(start >= 0 && end > start, 'Legendary audio block is present');
  return page.slice(start, end);
};

function createHost() {
  const host = new THREE.Group();
  host.userData.weaponKey = 'stinger';
  host.userData.sightY = 0.105;
  host.userData.muzzle = new THREE.Object3D();
  host.userData.muzzle.position.z = -0.72;
  host.userData.mag = new THREE.Group();
  host.userData.fresh = new THREE.Group();
  host.add(host.userData.muzzle, host.userData.mag, host.userData.fresh);
  return host;
}

assert.equal(skins.legend.prototype('stinger').overlay, undefined, 'Stinger routes to a real replacement rig');
const rig = skins.legend.buildRig(THREE, 'stinger', createHost());
assert.equal(rig.replacesBase, true, 'Legendary geometry replaces factory body presentation');
assert.equal(rig.opticGroup.userData.sightY, 0.105, 'iron sight retains authored ADS height');
const names = [
  'sulfur-split-receiver-cheek-1', 'sulfur-receiver-hex-cell-rims',
  'sulfur-exposed-gas-piston', 'sulfur-tapered-hex-fore-end-1',
  'sulfur-skeletal-stock-upper-1', 'sulfur-hex-bore-brake',
  'sulfur-open-rear-notch-post-1', 'sulfur-front-sight-blade',
  'sulfur-short-stroke-carrier', 'sulfur-ejection-port-hinge'
];
function hasDesign(name) {
  let found = false;
  rig.group.traverse(o => {
    if (o.name === 'legendary-stinger-' + name || (o.userData.designDetails || []).some(detail => detail === name)) found = true;
  });
  return found;
}
for (const name of names) assert.ok(hasDesign(name), `Stinger includes ${name}`);
assert.equal(rig.group.getObjectByName('legendary-stinger-optic-lens'), undefined, 'ADS has no pane across the iron-sight picture');
assert.equal(rig.group.getObjectByName('legendary-stinger-optic-reticle'), undefined, 'ADS center remains unobstructed');
let meshes = 0;
rig.group.traverse(o => { if (o.isMesh) meshes++; });
assert.ok(meshes >= 22 && meshes <= 64, `Stinger replacement detail stays bounded (${meshes} meshes)`);

const carrier = rig.group.getObjectByName('legendary-stinger-sulfur-short-stroke-carrier');
const cover = rig.group.getObjectByName('legendary-stinger-sulfur-ejection-port-hinge');
const rest = carrier.position.z;
rig.fire();
rig.update(0, { fx: 'high' });
assert.ok(carrier.position.z > rest, 'fire animates the Stinger bolt carrier');
rig.setReload(0.5, true);
rig.update(1 / 60, { fx: 'high' });
assert.ok(carrier.position.z > rest && cover.rotation.z > 0, 'reload stage exposes and holds the action');
rig.setReload(1, false);
rig.inspect(true);
rig.update(0.1, { fx: 'high' });
assert.ok(cover.rotation.z > 0.1, 'inspect opens the ejection-port cover');
rig.inspect(false);

assert.ok(offline.includes("stinger:{root:226,mode:'sulfur',filter:'bandpass',cut:1760"), 'Stinger uses its tuned mid-body signature waveform');
assert.ok(offline.includes('mode===\'sulfur\''), 'Stinger signature waveform is implemented in synthesis');
assert.ok(offline.includes('stinger:{duration:.132,low:138,body:430,ring:1180'), 'Stinger fire transient/body layer is retuned');
assert.equal(sharedAudio(phone), sharedAudio(offline), 'Offline and phone-host audio routing stays in parity');
assert.equal(phoneSkins, fs.readFileSync(path.join(assets, 'www', 'weapon-skins.js'), 'utf8'), 'Offline and phone-host weapon rig module is identical');
assert.ok(offline.includes("if(key==='stinger')return new THREE.RingGeometry(.016,.026,6)"), 'Stinger keeps its unique circuit kill-effect identity');

console.log(`PASS Sulfur Wasp replacement silhouette, clear ADS, firing/reload/inspect action, bounded geometry, unique fire synthesis, factory path isolation and phone-host parity (${meshes} meshes)`);
