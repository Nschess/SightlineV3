'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const packPath = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets', 'www', 'legendary-packs.js');
const source = fs.readFileSync(packPath, 'utf8');
const THREE = require(path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets', 'www', 'three.min.js'));
const canvasContext = new Proxy({
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
  getImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; }
}, { get(target, key) { return key in target ? target[key] : function () {}; }, set(target, key, value) { target[key] = value; return true; } });
const sandbox = {
  console,
  document: {
    head: { appendChild() {} },
    createElement() { return { width: 1, height: 1, getContext() { return canvasContext; } }; }
  },
  setTimeout() {}
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'legendary-packs.js', timeout: 20000 });

const packs = [
  ['rampart', 'Phoenix Rebirth', 'SightlinePhoenix'],
  ['needle', 'Tempest Needle', 'SightlineTempest'],
  ['ranger', 'Helios Eclipse', 'SightlineEclipse'],
  ['tide', 'Prismatic Aurora', 'SightlinePrism'],
  ['hawk', 'Voidlight Hawk', 'SightlineVoid']
];
const rates = [44100, 48000, 96000];

for (const [weapon, title, globalName] of packs) {
  const pack = sandbox[globalName];
  assert.ok(pack && pack.weapon === weapon && pack.finish && pack.finish.name === title, `${weapon}: exact skin-pack mapping exists`);
  assert.equal(typeof pack.mixShot, 'function', `${weapon}: authored fire generator exists`);
  const rig = pack.buildRig(THREE, new THREE.Group());
  assert.ok(rig && rig.group && typeof rig.fire === 'function' && typeof rig.update === 'function', `${weapon}: in-game rig exposes firing animation hooks`);
  rig.fire();
  assert.ok(rig.state && rig.state.pulse === 0, `${weapon}: firing animation dispatch changes the rig state`);
  rig.update(1 / 60, { ads: 0 });
  assert.ok(rig.state.pulse > 0, `${weapon}: rig update advances the firing animation`);
  rig.setReload(0.4, true);
  rig.update(1 / 60, { ads: 0 });
  rig.dispose();
  console.log(`PASS ${weapon}: Three.js r${THREE.REVISION} rig builds; fire/reload state advances`);
  for (const sampleRate of rates) {
    const base = new Float32Array(Math.floor(sampleRate * 0.25));
    for (let i = 0; i < base.length; i++) base[i] = Math.sin(i * 0.17) * Math.exp(-i / (sampleRate * 0.08)) * 0.2;
    const cue = pack.mixShot(sampleRate, base);
    assert.ok(cue && cue.length > 0 && Object.prototype.toString.call(cue) === '[object Float32Array]', `${weapon}/${sampleRate}: returns Float32 PCM`);
    let peak = 0;
    for (const sample of cue) {
      assert.ok(Number.isFinite(sample), `${weapon}/${sampleRate}: all samples are finite`);
      peak = Math.max(peak, Math.abs(sample));
    }
    assert.ok(peak > 0.0001 && peak <= 1, `${weapon}/${sampleRate}: cue is audible and normalized (peak ${peak})`);
    console.log(`PASS ${weapon}/${sampleRate} Hz: ${cue.length} samples, peak ${peak.toFixed(3)}`);
  }
}
