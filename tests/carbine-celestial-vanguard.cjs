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
const weapons = offline.slice(offline.indexOf('var LEGEND_AUDIO_PROFILES={'), offline.indexOf('var LEGEND_AUDIO_DUR=', offline.indexOf('var LEGEND_AUDIO_PROFILES={')));

function createHost(key) {
  const host = new THREE.Group();
  host.userData.weaponKey = key;
  host.userData.sightY = 0.112;
  host.userData.muzzle = new THREE.Object3D();
  host.userData.muzzle.position.z = -0.72;
  host.userData.mag = new THREE.Group();
  host.userData.fresh = new THREE.Group();
  host.userData.pump = new THREE.Group();
  host.add(host.userData.muzzle, host.userData.mag, host.userData.fresh, host.userData.pump);
  return host;
}

const carbineHost = createHost('carbine');
const carbine = skins.legend.buildRig(THREE, 'carbine', carbineHost);
const expectedParts = [
  'vanguard-split-titanium-cheek-1', 'vanguard-tapered-freefloat-armor-1',
  'vanguard-triport-compensator', 'vanguard-holo-window',
  'vanguard-moving-bolt-carrier', 'vanguard-ejection-port-hinge'
];
for (const part of expectedParts) assert.ok(carbine.group.getObjectByName('legendary-carbine-' + part), `Carbine has ${part}`);
assert.equal(carbine.opticGroup.userData.sightY, carbineHost.userData.sightY, 'open optic preserves calibrated sight height');
assert.equal(carbine.group.getObjectByName('legendary-carbine-precision-scope-tube'), undefined, 'old enclosed scope is removed');

let meshCount = 0;
carbine.group.traverse(object => { if (object.isMesh) meshCount++; });
assert.ok(meshCount >= 18 && meshCount < 48, `Carbine replacement remains detailed and bounded (${meshCount} meshes)`);

const carrier = carbine.group.getObjectByName('legendary-carbine-vanguard-moving-bolt-carrier');
const cover = carbine.group.getObjectByName('legendary-carbine-vanguard-ejection-port-hinge');
const restZ = carrier.position.z;
carbine.fire();
carbine.update(1 / 60, { fx: 'high' });
assert.ok(carrier.position.z > restZ, 'fire animates the visible carrier without touching weapon timing');
carbine.inspect(true);
carbine.update(0.1, { fx: 'high' });
assert.ok(cover.rotation.y < 0, 'inspect opens the Carbine ejection-port cover');
carbine.inspect(false);
carbine.setReload(0.45, true);
carbine.update(1 / 60, { fx: 'high' });
assert.ok(carrier.position.z > restZ && cover.rotation.y < 0, 'reload stage holds the carrier and opens the port');
carbine.setReload(1, false);

const carbineAudio = offline.match(/carbine:\{root:276,mode:'vanguard'[^\n]+/);
assert.ok(carbineAudio, 'Carbine has a distinct lower-register Vanguard firing profile');
assert.ok(offline.includes("mode==='vanguard'"), 'Vanguard waveform has its own synthesis branch');
assert.ok(offline.includes('carbine:{duration:.152,low:156,body:332'), 'Carbine firing layer has a tuned transient/body mix');
const profileStart = html => html.indexOf('var LEGEND_AUDIO_PROFILES={');
const audioBlock = html => html.slice(profileStart(html), html.indexOf('var legendSeenEvents=', profileStart(html)));
assert.equal(audioBlock(phone), audioBlock(offline), 'Offline and phone-host Carbine audio implementation stays aligned');
assert.ok(offline.includes('legendConfirmedElimination(key,target,eventId'), 'Carbine retains the authoritative elimination event path');

const other = skins.legend.buildRig(THREE, 'rook117', createHost('rook117'));
other.inspect(true);
assert.equal(other.state.inspectTarget, 0, 'Carbine inspect mechanics do not change another Legendary weapon');

console.log(`PASS Carbine Celestial Vanguard geometry, optic alignment, bounded mesh count (${meshCount}), cycling, inspect, reload, audio profile and phone-host audio parity`);
