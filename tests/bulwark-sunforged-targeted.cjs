const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets');
const THREE = require(path.join(assets, 'www', 'three.min.js'));
function canvasContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({ createLinearGradient() { return gradient; }, createRadialGradient() { return gradient; } }, {
    get(o, key) { return key in o ? o[key] : function () {}; }, set(o, key, value) { o[key] = value; return true; }
  });
}
const browser = { console, THREE, innerHeight: 900,
  document: { head: { appendChild() {} }, createElement() { const ctx = canvasContext(); return { width: 256, height: 256, getContext() { return ctx; } }; } }
};
browser.window = browser; vm.createContext(browser);
const packSource = fs.readFileSync(path.join(assets, 'www', 'legendary-packs.js'), 'utf8');
vm.runInContext(packSource, browser, { filename: 'legendary-packs.js', timeout: 20000 });

const pack = browser.SightlineAegis;
assert(pack && pack.weapon === 'bulwark' && pack.finish.name === 'Sunforged Aegis', 'Sunforged Aegis registration missing');
assert.strictEqual(typeof pack.killSound, 'function', 'Bulwark-specific kill cue is not exported to the accepted router');
assert.strictEqual(typeof browser.SightlineVoid.killSound, 'undefined', 'unrelated Voidlight Hawk acquired a new kill cue');
const rig = pack.buildRig(THREE);
assert(rig && rig.group && rig.inspect, 'Bulwark rig/inspect integration missing');
const names = [];
rig.group.traverse(o => { if (o.name) names.push(o.name); });
for (const name of [
  'sunforged-aegis-bulwark-side-armor-and-belt-action', 'sunforged-aegis-forged-receiver-cheeks',
  'sunforged-aegis-sun-channel-inlays', 'sunforged-aegis-radiator-ribs', 'sunforged-aegis-flush-fasteners',
  'sunforged-aegis-belt-link-run', 'sunforged-aegis-reciprocating-bolt-shoe',
  'sunforged-aegis-charging-handle', 'sunforged-aegis-hinged-feed-cover',
  'sunforged-aegis-feed-cover-plate', 'sunforged-aegis-cover-crest'
]) assert(names.includes(name), `Sunforged component missing: ${name}`);

let vertices = 0, meshes = 0;
rig.group.traverse(o => {
  if (!o.isMesh || !o.geometry) return;
  meshes++;
  const attr = o.geometry.attributes && o.geometry.attributes.position;
  if (attr) { vertices += attr.count; for (let i = 0; i < attr.count; i++) assert(Number.isFinite(attr.getX(i)) && Number.isFinite(attr.getY(i)) && Number.isFinite(attr.getZ(i)), 'non-finite model vertex'); }
  if (o.isInstancedMesh && o.instanceMatrix) for (const n of o.instanceMatrix.array) assert(Number.isFinite(n), 'non-finite instance transform');
});
assert(meshes < 40 && vertices < 25000, `Bulwark additions exceed the bounded geometry budget: ${meshes} meshes/${vertices} vertices`);
const shoe = rig.group.getObjectByName('sunforged-aegis-reciprocating-bolt-shoe');
const cover = rig.group.getObjectByName('sunforged-aegis-hinged-feed-cover');
const baseZ = shoe.position.z;
rig.fire(); rig.update(.05, { ads: 0 });
assert(shoe.position.z > baseZ + .004, 'firing does not cycle the cosmetic bolt shoe');
rig.inspect(true); for (let i = 0; i < 8; i++) rig.update(.04, { ads: 0 });
assert(cover.rotation.x > .15, 'inspect does not expose the hinged feed cover');
rig.inspect(false); rig.setReload(.42, true); rig.update(.016, { ads: 0 });
assert(rig.state.reloading && rig.state.rf === .42, 'reload animation changed the supplied gameplay reload fraction');
assert(cover.rotation.x > 0, 'reload stage does not animate the feed cover');
rig.setReload(0, false); rig.dispose();

function metrics(data) { let sum = 0, peak = 0; for (const x of data) { assert(Number.isFinite(x), 'audio contains NaN/Infinity'); sum += x*x; peak = Math.max(peak, Math.abs(x)); } return { rms: Math.sqrt(sum/data.length), peak }; }
const sr = 48000, base = new Float32Array(Math.floor(sr * .4));
for (let i = 0; i < base.length; i++) base[i] = Math.sin(i * .17) * Math.exp(-i / 950);
const fire = pack.mixShot(sr, base), kill = pack.killSound(sr), fireStats = metrics(fire), killStats = metrics(kill);
assert(fireStats.rms > .005 && fireStats.peak <= .901, `Bulwark fire sample is silent/clipped: ${JSON.stringify(fireStats)}`);
assert(killStats.rms > .005 && killStats.peak <= .841, `Bulwark kill sample is silent/clipped: ${JSON.stringify(killStats)}`);
assert(fire.length !== kill.length, 'fire and kill cues share the same duration');

const web = fs.readFileSync(path.join(assets, 'www', 'index.html'), 'utf8');
const phone = fs.readFileSync(path.join(assets, 'phone-host', 'index.html'), 'utf8');
const phonePack = fs.readFileSync(path.join(assets, 'phone-host', 'legendary-packs.js'), 'utf8');
const beforeWeb = fs.readFileSync(path.join(root, 'rollback', 'bulwark-sunforged-aegis-before-20261109', 'files', 'AndroidProject', 'app', 'src', 'main', 'assets', 'www', 'index.html'), 'utf8');
const weaponRecord = s => (s.match(/^  bulwark: \{ key: 'bulwark'.*$/m) || [])[0];
assert.strictEqual(weaponRecord(web), weaponRecord(beforeWeb), 'factory Bulwark stats/handling record changed');
assert(/bulwark:\s*\.080/.test(web) && /bulwark:\s*\.080/.test(beforeWeb), 'Bulwark iron-sight height changed or sight corridor contract is missing');
assert.strictEqual(phonePack, packSource, 'Offline and phone-host Legendary pack differs');
for (const [label, page] of [['Offline', web], ['phone-host', phone]]) {
  assert(page.includes("if((event==='elimination'||event==='kill-confirm'||event==='kill-chain')&&pack.killSound)return pack.killSound(sr);"), `${label} route does not select Bulwark confirmed-kill audio`);
  assert(page.includes("!target||!claimLegendEvent('elimination',eventId)"), `${label} confirmed-kill deduplication guard missing`);
  assert(page.includes("if(cur==='bulwark'&&legendActive(gun))sunforgedViewKick"), `${label} Bulwark cosmetic firing kick missing`);
  assert(page.includes("if(type==='impact'&&key==='bulwark')return new THREE.RingGeometry"), `${label} Sunforged solar ring missing`);
  assert(page.includes("var count=key==='scatter'||key==='bulwark'?6:4"), `${label} six-piece Sunforged fragment burst missing`);
  assert(page.includes("else if(key==='bulwark'&&elim)"), `${label} Sunforged elimination animation missing`);
}
const routeStart = web.indexOf('function legendaryPackAudioSamples('), routeEnd = web.indexOf('\nvar LEGEND_AUDIO_DUR', routeStart);
assert(routeStart >= 0 && routeEnd > routeStart, 'production audio route could not be isolated');
const routeContext = vm.createContext({ Float32Array, Math });
vm.runInContext(web.slice(routeStart, routeEnd), routeContext);
const routed = routeContext.legendaryPackAudioSamples(pack, 'bulwark', 'kill-confirm', sr);
assert.deepStrictEqual(Array.from(routed), Array.from(kill), 'confirmed Bulwark kill event does not select its dedicated sound');

const baselinePack = fs.readFileSync(path.join(root, 'rollback', 'bulwark-sunforged-aegis-before-20261109', 'files', 'AndroidProject', 'app', 'src', 'main', 'assets', 'www', 'legendary-packs.js'), 'utf8');
function thornSection(s) { const a = s.indexOf('/* ============================================================== THORNBLOOM SCATTER'); const b = s.indexOf('var ANCHOR_TH', a); assert(a >= 0 && b > a, 'Thornbloom source section boundaries missing'); return s.slice(a, b); }
assert.strictEqual(thornSection(packSource), thornSection(baselinePack), 'SCATTER12 Thornbloom pack implementation changed');

console.log(JSON.stringify({ pass: true, weapon: 'BULWARK Sunforged Aegis', meshes, vertices, fire: fireStats, kill: killStats, cosmeticBoltCycle: true, inspectAndReloadHooks: true, authoritativeKillAudioRoute: true, offlinePhoneHostParity: true, scatterPackUnchanged: true }));
