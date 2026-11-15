const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets');
const htmlPath = path.join(assets, 'www/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const THREE = require(path.join(assets, 'www/three.min.js'));
const pass = name => console.log('PASS', name);

function canvasStub() {
  const context = new Proxy({
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return {}; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)) }; },
    measureText() { return { width: 8 }; }
  }, {
    get(target, key) { return key in target ? target[key] : function () {}; },
    set(target, key, value) { target[key] = value; return true; }
  });
  return {
    width: 1, height: 1, style: {},
    getContext() { return context; },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}
  };
}
const documentStub = {
  head: { appendChild() {} },
  body: { appendChild() {} },
  createElement(tag) { return tag === 'canvas' ? canvasStub() : { style: {}, classList: { add() {} }, appendChild() {}, setAttribute() {} }; }
};
const browser = { document: documentStub, console, innerHeight: 720, devicePixelRatio: 1, performance: { now: () => 0 } };
browser.window = browser;
vm.createContext(browser);
const overlayPath = path.join(assets, 'www/legend-overlay.js');
const overlaySource = fs.readFileSync(overlayPath, 'utf8');
vm.runInContext(overlaySource, browser, { filename: 'legend-overlay.js', timeout: 10000 });
const packsPath = path.join(assets, 'www/legendary-packs.js');
const packsSource = fs.readFileSync(packsPath, 'utf8');
vm.runInContext(packsSource, browser, { filename: 'legendary-packs.js', timeout: 20000 });
global.window = browser;
global.document = documentStub;
for (const [key, value] of Object.entries(browser)) {
  if (key.startsWith('Sightline')) global[key] = value;
}
const skinsPath = path.join(assets, 'www/weapon-skins.js');
delete require.cache[require.resolve(skinsPath)];
const skins = require(skinsPath);

assert.equal(THREE.REVISION, '128', 'Use the currently packaged Three.js release');
const match = html.match(/var\s+WEAPONS\s*=\s*(\{[\s\S]*?\n\};)/);
assert.ok(match, 'Find active game weapon table');
const weaponLiteral = match[1].replace(/^var\s+WEAPONS\s*=\s*/, '').replace(/;$/, '');
const weapons = vm.runInNewContext('(' + weaponLiteral + ')');
const rookLine = html.split(/\r?\n/).find(line => line.includes('WEAPONS.rook117 = '));
assert.ok(rookLine, 'ROOK117 is registered immediately after the base weapon table');
weapons.rook117 = vm.runInNewContext('(' + rookLine.slice(rookLine.indexOf('=') + 1).trim().replace(/;$/, '') + ')');
const weaponDigest = crypto.createHash('sha256').update(JSON.stringify(weapons)).digest('hex');
assert.equal(weaponDigest, 'ef6eb1fc0a27cdda8589195d245d818463366d812dbe2c44170079be105f21a9', 'Weapon stats and registry stay at the audited baseline');
const firearmKeys = Object.keys(weapons).filter(key => !weapons[key].melee);
assert.equal(Object.keys(weapons).length, 32, 'Keep all existing weapon registry entries');
assert.equal(firearmKeys.length, 28, 'Preserve every firearm currently present');
pass('32 registry entries and all 28 firearms retain baseline gameplay configuration');

const expected = {
  smg: { title: 'Phantom Circuit', marker: 'signature-energy-cell', detail: 'circuit-induction-loop-1', pump: false },
  breacher: { title: 'Infernal Forge', marker: 'signature-energy-cell', detail: 'forge-chamber-heat-shield-1', pump: true },
  carbine: { title: 'Celestial Vanguard', marker: 'signature-energy-cell', detail: 'vanguard-crystal-retainer-1', pump: false }
};
const catalog = skins.catalog(weapons);
const warning = console.warn;
const warnings = [];
console.warn = (...args) => warnings.push(args.join(' '));
const coreMetrics = {};
try {
  for (const [key, spec] of Object.entries(expected)) {
    const entry = catalog[key].at(-1);
    assert.equal(entry.legendary, true);
    assert.equal(entry.theme, spec.title);
    assert.equal(entry.id, key + '-3');
    const host = new THREE.Group(); host.userData.weaponKey = key;
    host.userData.muzzle = new THREE.Object3D(); host.userData.muzzle.position.z = -.72; host.add(host.userData.muzzle);
    host.userData.mag = new THREE.Group(); host.userData.fresh = new THREE.Group(); host.userData.pump = new THREE.Group();
    host.add(host.userData.mag, host.userData.fresh, host.userData.pump);
    const rig = skins.legend.buildRig(THREE, key, host);
    assert.equal(rig.replacesBase, true, key + ' builds its current complete replacement viewmodel');
    assert.equal(rig.group.name, 'Legendary-' + key + '-' + spec.title.replace(/\s+/g, '-') + '-replacement');
    let meshes = 0, triangles = 0, names = [];
    rig.group.traverse(o => {
      if (!o.isMesh) return;
      meshes++; names.push(o.name);
      const count = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
      triangles += count / 3 * (o.isInstancedMesh ? o.count : 1);
    });
    assert.ok(meshes >= 18 && meshes < 48 && triangles >= 250, key + ' retains detailed bounded geometry');
    assert.ok(names.some(n => n.includes(spec.marker)), key + ' has its animated signature mechanism');
    assert.ok(rig.group.getObjectByName('legendary-' + key + '-signature-receiver-shell-1'), key + ' retains its original replacement receiver geometry');
    const energy = rig.group.getObjectByName('legendary-' + key + '-signature-energy-cell');
    assert.ok(energy && energy.isMesh, key + ' has its theme-specific energy assembly');
    assert.ok(rig.opticGroup && rig.opticGroup.userData.sightY > .06, key + ' retains its physical optic on the established sight line');
    assert.equal(!!rig.pumpGroup, spec.pump, key + ' keeps the active pump attachment');
    rig.mount(host);
    assert.equal(rig.group.parent, host);
    if (spec.pump) assert.equal(rig.pumpGroup.parent, host.userData.pump);
    rig.setVisible(false); assert.equal(rig.group.visible, false);
    rig.setVisible(true); rig.setDetail('high'); rig.setReload(.5, true); rig.fire(); rig.hit(); rig.kill(); rig.awaken();
    rig.update(1 / 60, { fx: 'high' });
    const shutter = rig.group.getObjectByName('legendary-' + key + '-reactor-shutter-hinge-1');
    assert.ok(shutter && Math.abs(shutter.rotation.z) > .01, key + ' reload animation moves its reactor shutter');
    rig.setReload(1, false); rig.update(1 / 60, { fx: 'low' });
    assert.equal(shutter.rotation.z, .16, key + ' shutter returns to its closed pose');
    rig.setDetail('low');
    const lowA = [energy.scale.x, energy.scale.y, energy.scale.z, energy.rotation.y, energy.material.emissiveIntensity];
    rig.update(.18, { fx: 'low' }); const lowB = [energy.scale.x, energy.scale.y, energy.scale.z, energy.rotation.y, energy.material.emissiveIntensity];
    rig.update(.42, { fx: 'low' }); const lowC = [energy.scale.x, energy.scale.y, energy.scale.z, energy.rotation.y, energy.material.emissiveIntensity];
    assert.deepEqual(lowC, lowB, key + ' effects-low mode keeps idle core animation static');
    assert.equal(rig.magazineDecor.length, key === 'breacher' ? 1 : 2);
    coreMetrics[key] = { theme: spec.title, meshes, triangles, pumpFollow: spec.pump };
  }
} finally { console.warn = warning; }
assert.deepEqual(warnings, [], 'No unsupported Three.js material options');
pass('Three active replacement models, optics, reload shutters, energy cores, and support assemblies build under Three.js 128');

const supportedKeys = ['smg', 'breacher', 'rook117', 'carbine', 'stinger', 'aurora', 'falcon', 'longbow', 'ranger', 'tide', 'hawk', 'scatter', 'bulwark', 'rampart', 'needle'];
const heldKeys = ['bastion', 'forge', 'mistral', 'thunder', 'ember', 'hammer', 'vantage', 'cyclone', 'switchback', 'mako', 'kestrel', 'pistol', 'pinion'];
assert.equal(Object.keys(catalog).filter(key => catalog[key].some(f => f.legendary)).length, supportedKeys.length, 'Only constructible Legendary entries are exposed');
assert.deepEqual(supportedKeys.filter(key => !catalog[key].some(f => f.legendary)), [], 'Every supported Legendary key appears in the catalogue');
assert.deepEqual(heldKeys.filter(key => catalog[key].some(f => f.legendary)), [], 'Incomplete archive prototypes stay out of the catalogue');
const legendaryNames = [];
const buildMetrics = {};
const flagshipMagNames = {
  rampart: 'phoenix-2-moving-magazine-armor',
  needle: 'tempest-2-moving-magazine-armor',
  rook117: 'revenant-2-moving-magazine-armor'
};
const flagshipReceiverNames = {
  rampart: ['phoenix-2-wing-root-receiver-shell-side-left', 'phoenix-2-machined-feather-channel-side-right'],
  needle: ['tempest-2-segmented-bullpup-shell-side-left', 'tempest-2-machined-insulator-channel-side-right'],
  rook117: ['revenant-2-sculpted-receiver-scales-side-left', 'revenant-2-jade-inset-bevels-side-right', 'revenant-2-faceted-reactor-core-left', 'revenant-2-faceted-reactor-core-right']
};
for (const key of supportedKeys) {
  const entry = catalog[key].filter(f => f.legendary);
  assert.equal(entry.length, 1, key + ' has exactly one Legendary finish');
  assert.ok(entry[0].name && entry[0].theme, key + ' has named Legendary identity');
  legendaryNames.push(entry[0].theme);
  const spec = skins.legend.prototype(key) || {};
  if (spec.pack) {
    const pack = browser[spec.pack];
    assert.ok(pack && typeof pack.buildRig === 'function', key + ' pack module is loaded');
    assert.equal(pack.weapon, key, key + ' pack is bound to the matching firearm');
    if (pack.finish && pack.finish.name) assert.equal(pack.finish.name, spec.title, key + ' pack label matches picker identity');
  }
  const host = new THREE.Group(); host.userData.weaponKey = key;
  host.userData.muzzle = new THREE.Object3D(); host.add(host.userData.muzzle);
  host.userData.mag = new THREE.Group(); host.userData.fresh = new THREE.Group(); host.userData.pump = new THREE.Group();
  host.add(host.userData.mag, host.userData.fresh, host.userData.pump);
  const rig = skins.legend.buildRig(THREE, key, host);
  assert.ok(rig && rig.group && rig.group.isObject3D, key + ' builds an actual Three.js weapon rig');
  if (flagshipMagNames[key]) {
    const receiverParts = [];
    rig.group.traverse(object => { if (object.isMesh && object.name) receiverParts.push(object); });
    for (const name of flagshipReceiverNames[key]) {
      const part = receiverParts.find(object => object.name === name);
      assert.ok(part, key + ' includes authored receiver structure ' + name);
      assert.ok(part.geometry && part.geometry.attributes.position.count > 0, key + ' receiver structure is mesh geometry, not a material-only overlay');
    }
    buildMetrics[key] = Object.assign(buildMetrics[key] || {}, { receiverPartChecks: flagshipReceiverNames[key].length });
    const details = host.userData.mag.children.filter(child => child.name === flagshipMagNames[key]);
    assert.equal(details.length, 1, key + ' has exactly one authored structural detail group on its live magazine');
    const movingArmor = details[0], structural = [];
    movingArmor.traverse(object => { if (object.isMesh && object.userData.legendaryStructuralPart) structural.push(object); });
    assert.equal(structural.length, 5, key + ' magazine armor has bounded bilateral shell/inlay and keel geometry');
    assert.ok(structural.every(object => object.geometry && object.geometry.attributes.position.count > 0), key + ' structural parts contain real mesh geometry');
    assert.equal(typeof rig.setVisible, 'function', key + ' visibility controller includes the moving magazine details');
    rig.setVisible(false); assert.equal(movingArmor.visible, false, key + ' hides magazine details when its skin is inactive');
    rig.setVisible(true); assert.equal(movingArmor.visible, true, key + ' reveals magazine details when its skin is active');
    host.updateMatrixWorld(true);
    const before = movingArmor.getWorldPosition(new THREE.Vector3()).clone();
    host.userData.mag.position.x += .05; host.updateMatrixWorld(true);
    const after = movingArmor.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs((after.x - before.x) - .05) < 1e-6, key + ' magazine armor follows the existing magazine transform');
    buildMetrics[key] = buildMetrics[key] || {};
    buildMetrics[key].movingMagazineMeshes = structural.length;
    buildMetrics[key].movingMagazineTriangles = structural.reduce((sum, object) => {
      const count = object.geometry.index ? object.geometry.index.count : object.geometry.attributes.position.count;
      return sum + count / 3;
    }, 0);
  }
  let meshes = 0, triangles = 0;
  rig.group.traverse(o => { if (!o.isMesh) return; meshes++; const count = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; triangles += count / 3 * (o.isInstancedMesh ? o.count : 1); });
  assert.ok(meshes > 0 && triangles >= 24, key + ' has non-placeholder weapon geometry');
  if (rig.mount) rig.mount(host); else host.add(rig.group);
  if (['rampart', 'needle', 'rook117'].includes(key)) {
    assert.equal(typeof rig.dress, 'function', key + ' constructed rig exposes its authored firearm material treatment');
    const factoryMaterial = new THREE.MeshPhongMaterial({ color: 0x555555 });
    const factorySurface = new THREE.Mesh(new THREE.BoxGeometry(.08, .06, .12), factoryMaterial);
    const factoryGeometry = factorySurface.geometry;
    factorySurface.userData.finishBase = factoryMaterial;
    host.add(factorySurface);
    rig.dress(host, true);
    assert.notEqual(factorySurface.material, factoryMaterial, key + ' authored dresser visibly replaces the eligible factory surface material');
    assert.equal(factorySurface.material.map, factoryMaterial.map, key + ' retains the factory surface map while applying its authored material');
    assert.equal(factorySurface.geometry, factoryGeometry, key + ' leaves factory weapon geometry intact');
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>'
    };
    factorySurface.material.onBeforeCompile(shader);
    assert.match(shader.fragmentShader, /vEcl/,
      key + ' authored body shader adds its weapon-space surface pattern coordinates');
    assert.match(shader.fragmentShader, /totalEmissiveRadiance/,
      key + ' authored body shader adds its animated emissive treatment');
  }
  if (rig.update) rig.update(1 / 60, { fx: 'high' });
  if (rig.fire) rig.fire();
  if (rig.setReload) rig.setReload(.35, true);
  if (rig.update) rig.update(1 / 60, { fx: 'high' });
  buildMetrics[key] = Object.assign(buildMetrics[key] || {}, { theme: entry[0].theme, rig: rig.group.name, meshes, triangles, pack: spec.pack || null });
}
const finishGun = html.match(/function finishGun\(g\)\s*\{[\s\S]*?\n\}/);
assert.ok(finishGun, 'active finish application function is present');
assert.ok(finishGun[0].indexOf('lr.dress(g,true)') > finishGun[0].indexOf('mesh.userData.finishBase=mat'),
  'active finish path applies authored pack materials to factory meshes after capturing their base materials');
pass('Rampart, Needle, and Rook117 route to authored material dressers that are actually invoked on the live firearm');
assert.equal(new Set(legendaryNames).size, supportedKeys.length, 'All supported Legendary catalogue identities are distinct');
for (const key of heldKeys) assert.throws(() => skins.legend.buildRig(THREE, key, new THREE.Group()), /not verified/, key + ' refuses incomplete placeholder construction');
pass('All 15 source-supported Legendary firearm keys construct geometry and update hooks; 13 incomplete prototypes fail closed');

const effectScene = new THREE.Scene(), effectSignatures = [];
for (const [key, packName] of [['rampart', 'SightlinePhoenix'], ['needle', 'SightlineTempest'], ['rook117', 'SightlineEmeraldRevenant']]) {
  const pack = browser[packName], fx = pack.createFx(THREE, effectScene);
  assert.equal(typeof fx.eliminate, 'function', key + ' exposes a dedicated confirmed-elimination presentation');
  effectSignatures.push(fx.signature);
  const pooledChildCount = effectScene.children.length;
  fx.eliminate(new THREE.Vector3(0, 1, -2), new THREE.Vector3(0, 1, 1));
  fx.eliminate(new THREE.Vector3(1, 1, -2), new THREE.Vector3(1, 1, 1));
  assert.equal(effectScene.children.length, pooledChildCount, key + ' reuses prebuilt effect pools during eliminations');
  assert.ok(effectScene.children.some(child => child.visible), key + ' elimination activates a visible pooled effect object');
}
assert.equal(new Set(effectSignatures).size, 3, 'flagship elimination signatures are visually distinct by implementation identity');
pass('Phoenix, Tempest, and Revenant elimination effects are distinct and reuse fixed pools');

for (const key of ['ranger', 'tide', 'hawk', 'scatter', 'bulwark', 'rampart', 'needle', 'rook117']) {
  const classes = [], children = [], button = { style: {}, classList: { add(name) { classes.push(name); } }, appendChild(node) { children.push(node); } };
  skins.legend.decorate(button, catalog[key].at(-1), false);
  assert.ok(classes.length > 0 && children.length >= 2, key + ' registers its authored Legendary card treatment: '+JSON.stringify({classes,children:children.length}));
}
pass('Eight recovered skins use their matching authored picker decoration modules');

for (const file of ['www/index.html', 'phone-host/index.html']) {
  const source = fs.readFileSync(path.join(assets, file), 'utf8');
  let n = 0;
  for (const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=|application\/json|importmap/i.test(m[1]) || !m[2].trim()) continue;
    new vm.Script(m[2], { filename: file + ':inline-' + (++n) });
  }
  assert.ok(n > 0, file + ' contains executable game code');
}
pass('Offline and phone-host inline game scripts parse');

const source = fs.readFileSync(htmlPath, 'utf8');
const pausedMatch = source.match(/var LEGENDARY_SELECTION_PAUSED=(\{[^;]*\});/);
assert.ok(pausedMatch, 'reversible per-weapon quality-hold map is retained');
const pausedKeys = vm.runInNewContext('(' + pausedMatch[1] + ')');
assert.deepEqual(Object.keys(pausedKeys).sort(), heldKeys.slice().sort(), 'only entries without verified model builders remain paused');
const finishListMatch = source.match(/function weaponFinishList\(key\)\{[^\n]+\}/);
assert.ok(finishListMatch, 'normal finish picker uses a single source of truth');
const finishList = vm.runInNewContext('(' + finishListMatch[0] + ')', { FINISHES: Array(12).fill({}), WEAPON_EXCLUSIVE: catalog, LEGENDARY_SELECTION_PAUSED: pausedKeys });
for (const key of supportedKeys) {
  const available = finishList(key);
  assert.equal(available.length, 16, key + ' exposes 12 standard, 3 exclusive, and 1 Legendary finish');
  assert.equal(available.at(-1).legendary, true, key + ' Legendary remains the final selectable choice');
}
for (const key of heldKeys) {
  const available = finishList(key);
  assert.equal(available.length, 15, key + ' exposes standard and existing exclusive finishes only');
  assert.equal(available.some(entry => entry.legendary), false, key + ' incomplete Legendary is not selectable');
}
assert.ok(source.includes('ix<weaponFinishList(k).length'), 'saved finish choices are validated against the active list');
pass('All 15 supported Legendary choices are selectable; 13 incomplete designs are hidden from the Offline and LAN finish picker');

for (const token of [
  ['surface-hit effect hook', 'legendSurfaceImpact(cur,h)'],
  ['Effects: Low standard-impact fallback', 'if(!legendaryEffectsEnabled()||G.fx===\'low\'){addPuff(hit.point,0xd8cfae,.22);return;}'],
  ['server-confirmed hit/elimination hook', 'legendConfirmedHit(cur,confirmed,m.ev,!!m.k'],
  ['third-person skin projection', 'legendaryWorldOverlayGeometry(key)'],
  ['low-quality effect downgrade', '!legendaryEffectsEnabled()||G.fx===\'low\'||(window.matchMedia']
]) assert.ok(source.includes(token[1]), token[0] + ' integration');
assert.match(source,/var maxActive=G\.fx==='low'\?3:G\.fx==='med'\?5:12;[\s\S]*?legendFxActive>=maxActive/,
  'pooled Legendary effects use the current low/medium/high active-object caps');
const overlayOrder = source.indexOf('<script src="weapon-skins.js"></script>');
assert.ok(overlayOrder >= 0 && overlayOrder < source.indexOf('<script src="legend-overlay.js"></script>') && source.indexOf('<script src="legend-overlay.js"></script>') < source.indexOf('<script src="legendary-packs.js"></script>'), 'skin registry, renderer helpers, and authored packs load in dependency order');
pass('Skin effects remain cosmetic and attach to existing hit, elimination, and third-person paths');

const serverPath = path.join(assets, 'phone-host/server.js');
const serverSource = fs.readFileSync(serverPath, 'utf8');
assert.ok(serverSource.includes("const PAUSED_LEGENDARY_FINISH_KEYS = new Set(["), 'LAN server restricts Legendary choices to the source-supported set');
assert.ok(serverSource.includes("'/legendary-packs.js':['legendary-packs.js','application/javascript; charset=utf-8']"), 'LAN host serves the locally packaged Legendary builder module');
const server = require(serverPath);
const peer = server._t.addPlayer({ closed: false, text() {}, sendFrame() {}, get backlog() { return 0; } }, 'LegendaryQA');
for (const key of supportedKeys) {
  server._t.onMessage(peer, JSON.stringify({ t: 'finish', key, index: 15 }));
  assert.equal(peer.finishes[key], 15, key + ' is selectable and persists through authoritative LAN validation');
}
for (const key of heldKeys) {
  server._t.onMessage(peer, JSON.stringify({ t: 'finish', key, index: 15 }));
  assert.notEqual(peer.finishes[key], 15, key + ' incomplete Legendary is rejected by authoritative LAN validation');
}
server._t.onMessage(peer, JSON.stringify({ t: 'finish', key: 'smg', index: 16 }));
assert.equal(peer.finishes.smg, 15, 'server still rejects out-of-range finish IDs');
server._t.onMessage(peer, JSON.stringify({ t: 'finishes', finishes: { carbine: 15, breacher: 15 } }));
assert.equal(peer.finishes.carbine, 15); assert.equal(peer.finishes.breacher, 15);
server._t.onMessage(peer, JSON.stringify({ t: 'finishes', finishes: { pistol: 15, pinion: 15 } }));
assert.notEqual(peer.finishes.pistol, 15); assert.notEqual(peer.finishes.pinion, 15);
pass('Server-authoritative selection accepts 15 supported entries, rejects 13 incomplete entries, and retains the upper-bound guard');

for (const name of ['weapon-skins.js', 'legend-overlay.js', 'legendary-packs.js']) {
  assert.deepEqual(fs.readFileSync(path.join(assets, 'www', name)), fs.readFileSync(path.join(assets, 'phone-host', name)), name + ' Offline/phone-host parity');
}
assert.ok(browser.SightlineLegendarySkinModules['assault-rifles'], 'authored overlay registry is present');
pass('Shared Legendary modules are byte-identical; Offline/phone-host game pages retain route-specific wrappers');

console.log('METRICS', JSON.stringify({ core: coreMetrics, supported: buildMetrics, held: heldKeys }));
console.log('VISUAL_ACCEPTANCE UNVERIFIED: Three.js geometry construction passed; no isolated WebGL/browser renderer was available.');
