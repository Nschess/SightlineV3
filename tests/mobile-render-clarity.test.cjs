'use strict';
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const path = require('node:path');

const assets = path.join(__dirname, '../AndroidProject/app/src/main/assets');
const pages = ['www','phone-host'].map(tree => readFileSync(path.join(assets,tree,'index.html'),'utf8'));
function section(page, start, end) {
  const a = page.indexOf(start), b = page.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return page.slice(a,b).replace(/\r\n/g,'\n');
}
test('reticle presentation avoids redundant per-frame DOM mutations', () => {
  const helper = section(pages[0], 'function syncReticlePresentation(', 'function updatePlayer(dt)');
  assert.equal(helper, section(pages[1], 'function syncReticlePresentation(', 'function updatePlayer(dt)'), 'Android reticle helpers stay synchronized');
  const update = section(pages[0], 'function updatePlayer(dt)', 'var LOBBY_PREVIEW=');
  assert.match(update, /syncReticlePresentation\(el\.ret,\s*reticleBaseClass,\s*cur,\s*isLegendaryReticle,\s*legendaryAds\)/);
  assert.doesNotMatch(update, /el\.ret\.className\s*=|el\.ret\.classList\.toggle|el\.ret\.style\.(?:setProperty|removeProperty)/);

  const writes = { className: 0, toggles: 0, styleSet: 0, styleRemove: 0 };
  const classes = new Set();
  const values = new Map();
  const reticle = {};
  Object.defineProperty(reticle, 'className', {
    get() { return Array.from(classes).join(' '); },
    set(value) { writes.className++; classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(name => classes.add(name)); }
  });
  reticle.classList = { toggle(name, force) { writes.toggles++; if (force) classes.add(name); else classes.delete(name); } };
  reticle.style = {
    setProperty(name, value) { writes.styleSet++; values.set(name, String(value)); },
    removeProperty(name) { writes.styleRemove++; values.delete(name); }
  };
  const context = vm.createContext({});
  vm.runInContext(helper + '\nthis.syncReticlePresentation = syncReticlePresentation;', context);

  context.syncReticlePresentation(reticle, 'optic', 'carbine', false, null);
  const unchanged = { ...writes };
  context.syncReticlePresentation(reticle, 'optic', 'carbine', false, null);
  assert.deepEqual(writes, unchanged, 'stable non-legendary state causes no repeat DOM mutations');

  const finish = { reticle: '#b8f1ff', reticleBorder: '#203f50' };
  context.syncReticlePresentation(reticle, 'optic', 'carbine', true, finish);
  assert.ok(classes.has('optic') && classes.has('legendary-reticle') && classes.has('legendary-carbine'));
  assert.equal(values.get('--legend-reticle'), finish.reticle);
  const active = { ...writes };
  context.syncReticlePresentation(reticle, 'optic', 'carbine', true, finish);
  assert.deepEqual(writes, active, 'stable legendary reticle state does not rewrite classes or CSS variables');

  context.syncReticlePresentation(reticle, 'holo', 'scatter', true, finish);
  assert.ok(!classes.has('optic') && !classes.has('legendary-carbine'));
  assert.ok(classes.has('holo') && classes.has('legendary-reticle') && classes.has('legendary-scatter'));
  context.syncReticlePresentation(reticle, 'holo', 'scatter', false, null);
  assert.ok(!classes.has('legendary-reticle') && !classes.has('legendary-scatter'));
  assert.ok(!values.has('--legend-reticle') && !values.has('--legend-reticle-border'));
  const cleared = { ...writes };
  context.syncReticlePresentation(reticle, 'holo', 'scatter', false, null);
  assert.deepEqual(writes, cleared, 'cleared state remains mutation-free on following frames');
});

test('Both clients share the bounded mobile policy, presets and drawing buffer resize', () => {
  const atlas = tree => readFileSync(path.join(assets,tree,'character-realism-v12.js'));
  assert.deepEqual(atlas('www'),atlas('phone-host'));
  for (const [start,end] of [
    ['function framePixelBudget()', 'function fail(msg)'],
    ['var mobileTextureLimit', 'if (!touchMode) renderer.setPixelRatio'],
    ['var mobileMapTextures', '/* ---------- sky, zones'],
    ['function mobileTilesBoxFaces', '/* ---------- map picker'],
    ['var lastMobileBufferWidth', 'if (window.ResizeObserver)'],
    ['function effectiveShadowTier()', 'function applyShadowBudget()'],
    ['var QUALITY = touchMode', 'function qualityNow()']
  ]) assert.equal(section(pages[0],start,end),section(pages[1],start,end));
  const code = section(pages[0],'function framePixelBudget()','function fail(msg)');
  const resize = section(pages[0],'var lastMobileBufferWidth','if (window.ResizeObserver)');
  const writes=[];
  const v = vm.createContext({
    G: { fpsCap: 60, adaptive: true, renderScale: 85, mobileQuality: 'balanced' },
    stage: { clientWidth:667, clientHeight:375, style:{setProperty(){}} },
    window: { devicePixelRatio:2.75 }, touchMode:true, perfLvl:0, perfScale:1, rafHzBest:60,
    camera:{updateProjectionMatrix(){}}, renderer:{setDrawingBufferSize(...args){writes.push(args);}}
  });
  const shadows = section(pages[0],'function effectiveShadowTier()','function applyShadowBudget()');
  vm.runInContext(code+resize+shadows,v);
  const balanced = 2.35*.85;
  v.G.renderScale = 100;
  assert.equal(v.pixelRatio(), Math.sqrt(1150000/(667*375)));
  v.G.fpsCap = 90; v.rafHzBest = 90;
  assert.equal(v.framePixelBudget(), 1050000);
  const highRefreshBalanced = Math.sqrt(1050000/(667*375));
  assert.equal(v.pixelRatio(), highRefreshBalanced);
  assert.ok(highRefreshBalanced > Math.sqrt(950000/(667*375)));
  assert.ok(highRefreshBalanced < Math.sqrt(1150000/(667*375)));
  v.G.adaptive = false;
  assert.equal(v.framePixelBudget(), 1150000, 'manual adaptive disable keeps the full Balanced pixel budget');
  v.G.adaptive = true; v.G.fpsCap = 60; v.rafHzBest = 60;
  v.G.renderScale = 85;
  assert.equal(v.pixelRatio(),balanced);
  assert.ok(balanced > 1.53);
  v.resize(); v.resize();
  assert.deepEqual(writes,[[667,375,balanced]]);
  assert.equal(v.camera.aspect,667/375);
  v.G.shadows='high'; v.perfLvl=1; v.perfScale=.97;
  assert.equal(v.effectiveShadowTier(),'off');
  assert.equal(v.pixelRatio(),balanced);
  v.resize();
  assert.equal(writes.length,1,'effects-first stage does not reallocate the drawing buffer');
  v.stage.clientWidth=1200; v.stage.clientHeight=720; v.G.renderScale=100;
  const initial=v.pixelRatio();
  assert.ok(Math.abs(initial**2*1200*720-1150000)<0.01);
  v.perfLvl=2; v.perfScale=.94;
  assert.equal(v.pixelRatio(),initial*.96);
  v.perfLvl=3; v.perfScale=.9;
  assert.ok(Math.abs(v.pixelRatio()/initial-.9)<1e-10);
  v.G.adaptive=false;
  assert.equal(v.pixelRatio(),initial);
  v.G.adaptive=true;
  v.G.mobileQuality='low'; assert.equal(v.framePixelBudget(),650000);
  assert.equal(v.pixelRatio(),Math.sqrt(650000/(1200*720))*.9);
  assert.equal(v.effectiveAdaptiveScale(),.9);
  v.G.fastMode=true; assert.equal(v.framePixelBudget(),600000);
  v.G.fastMode=false;
  v.G.mobileQuality='high'; assert.equal(v.framePixelBudget(),1850000);
  v.G.fpsCap=120; v.rafHzBest=120; assert.equal(v.framePixelBudget(),1450000);
  v.window.devicePixelRatio=1; assert.ok(v.pixelRatio()<=1);
  v.touchMode=false; v.G.fpsCap=60; v.perfScale=1; v.window.devicePixelRatio=2;
  assert.equal(v.framePixelBudget(),2400000);
  assert.equal(v.pixelRatio(),Math.min(1.75,Math.sqrt(2400000/(1200*720))));
});

test('Mobile texture variants are shared, cap filtering at device support and leave desktop clones unchanged', () => {
  const filtering = section(pages[0], 'var mobileTextureLimit', 'if (!touchMode) renderer.setPixelRatio');
  const pool = section(pages[0], 'var mobileMapTextures', '/* ---------- sky, zones');
  class Texture extends EventTarget {
    anisotropy = 4;
    uploads = 0;
    repeat = { set: (x,y) => { this.uv = [x,y]; } };
    set needsUpdate(changed) { if (changed) this.uploads++; }
    clone() { return new Texture(); }
  }
  const G = { mobileQuality: 'balanced' };
  const renderer = { capabilities: { isWebGL2: true, getMaxAnisotropy: () => 6 } };
  const navigator = { deviceMemory: 4 };
  const v = vm.createContext({ G, renderer, navigator, touchMode: true });
  vm.runInContext(filtering+pool,v);
  assert.equal(v.mobileCharacterAtlasScale(),1.5);
  navigator.deviceMemory = 2;
  assert.equal(v.mobileCharacterAtlasScale(),undefined);
  navigator.deviceMemory = 8;
  renderer.capabilities.isWebGL2 = false;
  assert.equal(v.mobileCharacterAtlasScale(),undefined);
  const base = new Texture();
  const tex = v.ctexTint(base,3,2);
  assert.equal(v.ctexTint(base,3,2),tex);
  assert.notEqual(v.ctexTint(base,2,3),tex);
  assert.notEqual(v.ctexTint(new Texture(),3,2),tex);
  assert.deepEqual(tex.uv,[3,2]);
  const angled=v.ctexTint(base,3,2,true);
  assert.notEqual(angled,tex);
  assert.equal(v.ctexTint(base,3,2,true),angled);
  assert.equal(angled.anisotropy,2);
  assert.equal(tex.anisotropy,4);
  G.mobileQuality = 'high';
  v.mobileSurfaceTextures.forEach(v.applySurfaceFiltering);
  assert.equal(tex.anisotropy,6);
  assert.equal(angled.anisotropy,6);
  const previousUploads = tex.uploads;
  v.mobileSurfaceTextures.forEach(v.applySurfaceFiltering);
  assert.equal(tex.uploads,previousUploads);
  tex.dispatchEvent(new Event('dispose'));
  assert.ok(!v.mobileSurfaceTextures.has(tex));
  assert.equal(base.anisotropy,4);
  G.fastMode = true;
  assert.equal(v.mobileSurfaceAnisotropy(),2);
  const noAniso = vm.createContext({ G, renderer:{capabilities:{getMaxAnisotropy:()=>0}}, touchMode:true });
  vm.runInContext(filtering+pool,noAniso);
  assert.equal(noAniso.ctexTint(base,3,2,true).anisotropy,1);

  const desktop = vm.createContext({ G, touchMode: false });
  vm.runInContext(filtering+pool,desktop);
  const desktopTexture = desktop.ctexTint(base,3,2);
  assert.notEqual(desktop.ctexTint(base,3,2),desktopTexture);
  assert.equal(desktopTexture.anisotropy,4);
});

test('mobile map obstacles reuse materials for shared textures and dispose them once on rebuild', () => {
  const materialStart = pages[0].indexOf('function mapObstacleMaterial(map, cache)');
  const materialFactory = materialStart >= 0 ? section(pages[0], 'function mapObstacleMaterial(map, cache)', 'function paintZone(') : '';
  if (materialStart >= 0) assert.equal(materialFactory, section(pages[1], 'function mapObstacleMaterial(map, cache)', 'function paintZone('));
  const worldBuilder = section(pages[0], 'function buildWorld(m)', 'buildWorld(CURMAP);');
  const THREE = require(path.join(assets, 'www/three.min.js'));
  const context = vm.createContext({ THREE });
  const materialFor = materialFactory
    ? (vm.runInContext(materialFactory, context), context.mapObstacleMaterial)
    : (map => new THREE.MeshLambertMaterial({ map }));
  const sharedTexture = new THREE.Texture(), otherTexture = new THREE.Texture(), cache = new Map();
  const first = materialFor(sharedTexture, cache), repeated = materialFor(sharedTexture, cache);
  assert.strictEqual(first, repeated, 'same mobile texture variant must not allocate duplicate map materials');
  const other = materialFor(otherTexture, cache);
  assert.notStrictEqual(first, other, 'different textures must keep independent material state');
  assert.equal(cache.size, 2);
  assert.match(worldBuilder, /var obstacleMaterialCache = new Map\(\),\s*obstacleGeometryCache = new Map\(\);/, 'material and geometry caches are scoped to one map build');
  assert.match(worldBuilder, /mapObstacleMaterial\(map,\s*obstacleMaterialCache\)/, 'non-CDO obstacle meshes use the shared material factory');
  const nextMapMaterial = materialFor(sharedTexture, new Map());
  assert.notStrictEqual(first, nextMapMaterial, 'a later map build gets fresh material ownership');

  const scene = new THREE.Scene(), geometryA = new THREE.BoxGeometry(1, 1, 1), geometryB = new THREE.BoxGeometry(2, 1, 2);
  const meshA = new THREE.Mesh(geometryA, first), meshB = new THREE.Mesh(geometryB, first);
  scene.add(meshA, meshB);
  let materialDisposals = 0, textureDisposals = 0, geometryDisposals = 0;
  first.addEventListener('dispose', () => materialDisposals++);
  sharedTexture.addEventListener('dispose', () => textureDisposals++);
  geometryA.addEventListener('dispose', () => geometryDisposals++);
  geometryB.addEventListener('dispose', () => geometryDisposals++);
  const cleanup = section(pages[0], 'function clearWorld()', 'function paintTex(');
  assert.equal(cleanup, section(pages[1], 'function clearWorld()', 'function paintTex('));
  const cleanupContext = vm.createContext({ scene, worldObjs: [meshA, meshB], obstacleMeshes: [meshA, meshB], mobileMapTextures: new Map() });
  vm.runInContext(cleanup, cleanupContext);
  cleanupContext.clearWorld();
  assert.equal(materialDisposals, 1, 'shared material is disposed once when the previous map is cleared');
  assert.equal(textureDisposals, 1, 'shared texture is disposed once');
  assert.equal(geometryDisposals, 2, 'each per-mesh geometry retains independent ownership');
  assert.equal(scene.children.length, 0, 'map rebuild removes the old map meshes');
  assert.equal(cleanupContext.mobileMapTextures.size, 0, 'per-map texture variants are released on transition');
});

test('map detail color batches share one map-owned box geometry across rebuilds', () => {
  const detailCode = section(pages[0], '  if(m.details&&m.details.length){', '  (m.vis || []).forEach');
  assert.equal(detailCode, section(pages[1], '  if(m.details&&m.details.length){', '  (m.vis || []).forEach'));
  const mapStart = pages[0].indexOf('var MAPS = ['), mapEnd = pages[0].indexOf('\nvar DEFTEX', mapStart);
  assert.ok(mapStart >= 0 && mapEnd > mapStart);
  const mapCode = 'function O(x,z,w,d,h,k,bottom){return {x,z,w,d,h,k,bottom:bottom||0};}\n' + pages[0].slice(mapStart, mapEnd) + '\nMAPS';
  const maps = vm.runInNewContext(mapCode, {}, { timeout: 2000 });
  const map = maps.find(entry => entry.id === 'blackwater_old_quarter');
  assert.ok(map && map.details);
  assert.equal(map.details.length, 817);
  assert.equal(new Set(map.details.map(detail => detail[3])).size, 52, 'the real map forms 52 independent material color batches');

  const THREE = require(path.join(assets, 'www/three.min.js'));
  const createdGeometries = [];
  const trackedThree = Object.create(THREE);
  trackedThree.BoxGeometry = class extends THREE.BoxGeometry {
    constructor(...args) { super(...args); createdGeometries.push(this); }
  };
  function buildDetailBatches() {
    const scene = new THREE.Scene(), worldObjs = [], materials = new Map();
    function lam(color) {
      if (!materials.has(color)) materials.set(color, new THREE.MeshLambertMaterial({ color }));
      return materials.get(color);
    }
    function add(object, castsShadow) { object.castShadow = castsShadow !== false; scene.add(object); worldObjs.push(object); return object; }
    const context = vm.createContext({ THREE: trackedThree, m: map, scene, worldObjs, lam, add });
    vm.runInContext(detailCode, context);
    return { scene, worldObjs, materials: Array.from(materials.values()) };
  }

  const first = buildDetailBatches();
  assert.equal(first.worldObjs.length, 52, 'color grouping retains all independent instanced batches');
  assert.equal(first.worldObjs.reduce((sum, mesh) => sum + mesh.count, 0), 817, 'all original detail instances are preserved');
  assert.equal(new Set(first.worldObjs.map(mesh => mesh.geometry)).size, 1, 'all color batches share the same immutable unit box');
  assert.equal(createdGeometries.length, 1, 'one unit geometry is generated per map build regardless of color count');
  assert.ok(first.worldObjs.every(mesh => !mesh.castShadow && !mesh.receiveShadow));
  first.worldObjs[0].visible = false;
  assert.equal(first.worldObjs[1].visible, true, 'sharing geometry does not couple object visibility');

  let geometryDisposals = 0, materialDisposals = 0;
  const oldGeometry = createdGeometries[0];
  oldGeometry.addEventListener('dispose', () => geometryDisposals++);
  first.materials.forEach(material => material.addEventListener('dispose', () => materialDisposals++));
  const cleanup = section(pages[0], 'function clearWorld()', 'function paintTex(');
  const cleanupContext = vm.createContext({ scene: first.scene, worldObjs: first.worldObjs, obstacleMeshes: [], mobileMapTextures: new Map() });
  vm.runInContext(cleanup, cleanupContext); cleanupContext.clearWorld();
  assert.equal(geometryDisposals, 1, 'the shared detail geometry is disposed exactly once on map transition');
  assert.equal(materialDisposals, 52, 'each color material is disposed exactly once');
  assert.equal(first.scene.children.length, 0);

  const second = buildDetailBatches();
  assert.notStrictEqual(second.worldObjs[0].geometry, oldGeometry, 'a later map build gets a fresh geometry owner');
  assert.equal(createdGeometries.length, 2, 'each repeated map build creates one fresh unit geometry');
  assert.equal(second.worldObjs.reduce((sum, mesh) => sum + mesh.count, 0), 817);
  let secondGeometryDisposals = 0, secondMaterialDisposals = 0;
  second.worldObjs[0].geometry.addEventListener('dispose', () => secondGeometryDisposals++);
  second.materials.forEach(material => material.addEventListener('dispose', () => secondMaterialDisposals++));
  const secondCleanup = vm.createContext({ scene: second.scene, worldObjs: second.worldObjs, obstacleMeshes: [], mobileMapTextures: new Map() });
  vm.runInContext(cleanup, secondCleanup); secondCleanup.clearWorld();
  assert.equal(secondGeometryDisposals, 1);
  assert.equal(secondMaterialDisposals, 52);
  assert.equal(second.scene.children.length, 0);
});

test('non-CDO obstacle meshes reuse matching box geometry only for the current map build', () => {
  const builder = section(pages[0], 'function buildWorld(m)', 'buildWorld(CURMAP);');
  assert.match(builder, /var obstacleMaterialCache = new Map\(\),\s*obstacleGeometryCache = new Map\(\);/, 'the non-CDO builder owns a scoped immutable geometry cache');
  assert.match(builder, /mapObstacleGeometry\(o\.w,\s*o\.h-bottom,\s*o\.d,\s*tiled,\s*obstacleGeometryCache\)/);
  const geometryFactory = section(pages[0], 'function tileMapBoxFaces(', 'function buildWorld(');
  assert.equal(geometryFactory, section(pages[1], 'function tileMapBoxFaces(', 'function buildWorld('));

  const mapStart = pages[0].indexOf('var MAPS = ['), mapEnd = pages[0].indexOf('\nvar DEFTEX', mapStart);
  assert.ok(mapStart >= 0 && mapEnd > mapStart, 'actual authored map definitions are available for source-level counts');
  const mapCode = 'function O(x,z,w,d,h,k,bottom){return {x,z,w,d,h,k,bottom:bottom||0};}\n' + pages[0].slice(mapStart, mapEnd) + '\nMAPS';
  const maps = vm.runInNewContext(mapCode, {}, { timeout: 2000 });
  const cathedral = maps.find(map => map.id === 'cathedral');
  assert.ok(cathedral && !cathedral.cdoPremium);
  const tiledTypes = /^(brick|stone|plaster|stucco|asphalt|cobble|plate)$/;
  const shapeKeys = new Set(cathedral.obst.map(obstacle => {
    const spec = cathedral.tex[obstacle.k] || cathedral.tex.wall;
    return [obstacle.w, obstacle.h - (obstacle.bottom || 0), obstacle.d, tiledTypes.test(spec.t) ? 1 : 0].join(':');
  }));
  assert.equal(cathedral.obst.length, 90);
  assert.equal(shapeKeys.size, 24, 'Cathedral has 24 geometry/UV variants for 90 obstacle meshes');

  const THREE = require(path.join(assets, 'www/three.min.js'));
  const context = vm.createContext({ THREE, touchMode: true });
  vm.runInContext(geometryFactory, context);
  const cache = new Map();
  const first = context.mapObstacleGeometry(1, 2, 3, false, cache);
  const repeated = context.mapObstacleGeometry(1, 2, 3, false, cache);
  assert.strictEqual(first, repeated, 'matching obstacles reuse one local geometry object');
  const tiled = context.mapObstacleGeometry(1, 2, 3, true, cache);
  assert.notStrictEqual(tiled, first, 'UV tiling policy is part of the geometry cache key');
  assert.notDeepEqual(Array.from(tiled.getAttribute('uv').array), Array.from(first.getAttribute('uv').array));
  const different = context.mapObstacleGeometry(2, 2, 3, false, cache);
  assert.notStrictEqual(different, first, 'different dimensions keep independent geometry');
  assert.equal(cache.size, 3);

  const scene = new THREE.Scene(), sharedMaterial = new THREE.MeshBasicMaterial();
  const meshA = new THREE.Mesh(first, sharedMaterial), meshB = new THREE.Mesh(repeated, sharedMaterial);
  meshB.position.x = 4; scene.add(meshA, meshB);
  scene.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.set(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, -1, 0));
  assert.strictEqual(raycaster.intersectObjects([meshA, meshB], false)[0].object, meshA);
  raycaster.set(new THREE.Vector3(4, 3, 0), new THREE.Vector3(0, -1, 0));
  assert.strictEqual(raycaster.intersectObjects([meshA, meshB], false)[0].object, meshB, 'shared geometry retains independent mesh transforms and ray hits');

  let geometryDisposals = 0, materialDisposals = 0;
  first.addEventListener('dispose', () => geometryDisposals++);
  sharedMaterial.addEventListener('dispose', () => materialDisposals++);
  const cleanup = section(pages[0], 'function clearWorld()', 'function paintTex(');
  const cleanupContext = vm.createContext({ scene, worldObjs: [meshA, meshB], obstacleMeshes: [meshA, meshB], mobileMapTextures: new Map() });
  vm.runInContext(cleanup, cleanupContext); cleanupContext.clearWorld();
  assert.equal(geometryDisposals, 1, 'clearWorld disposes shared geometry once across both obstacle meshes');
  assert.equal(materialDisposals, 1, 'clearWorld disposes the shared obstacle material once');
  assert.equal(scene.children.length, 0);

  const nextMapGeometry = context.mapObstacleGeometry(1, 2, 3, false, new Map());
  assert.notStrictEqual(nextMapGeometry, first, 'a later map build gets fresh ownership after transition cleanup');
  tiled.dispose();
  different.dispose();
  nextMapGeometry.dispose();
});

test('static bamboo stalks batch by shade while preserving placement, collisions and map cleanup', () => {
  const helperStart = pages[0].indexOf('function addBambooBatches(bamboo, add)');
  assert.ok(helperStart >= 0, 'repeated static bamboo stalk meshes are consolidated into color batches');
  const helper = section(pages[0], 'function addBambooBatches(bamboo, add)', 'function addPalmTreeBatches');
  assert.equal(helper, section(pages[1], 'function addBambooBatches(bamboo, add)', 'function addPalmTreeBatches'));
  const deco = section(pages[0], 'function buildDeco(m)', 'function mobileTilesBoxFaces(');
  assert.match(deco, /if\s*\(m\.bamboo\s*&&\s*m\.bamboo\.length\)\s*addBambooBatches\(m\.bamboo,\s*add\)/);
  const gorge = section(pages[0], 'function makeGorge()', 'function makePark()');
  assert.match(gorge, /\[-36, 16\].*\[16, 50\].*bamboo\.push/s, 'the 8-cluster Gorge foliage uses the shared batch path');
  const park = section(pages[0], 'function makePark()', 'function makeMacasandigRiverside()');
  assert.match(park, /bamboo\.push\(\[-33,\s*15\],\s*\[33,\s*15\],\s*\[-32,\s*-36\],\s*\[32,\s*-36\]\)/, 'the 4-cluster Park foliage uses the shared batch path');

  const THREE = require(path.join(assets, 'www/three.min.js'));
  const temporaryGeometries = [];
  const trackedThree = Object.create(THREE);
  trackedThree.CylinderGeometry = class extends THREE.CylinderGeometry {
    constructor(...args) {
      super(...args);
      this.disposeCount = 0;
      this.addEventListener('dispose', () => this.disposeCount++);
      temporaryGeometries.push(this);
    }
  };
  const context = vm.createContext({ THREE: trackedThree });
  vm.runInContext(helper, context);
  const bamboo = [[-36,16],[36,16],[-17,-8],[17,-8],[-38,-36],[38,-28],[-16,44],[16,50]];
  const scene = new THREE.Scene(), worldObjs = [], obstacleMeshes = [{ gameplayCollider: true }], added = [];
  function add(object, castsShadow) { object.castShadow = castsShadow !== false; scene.add(object); worldObjs.push(object); added.push(object); return object; }
  context.addBambooBatches(bamboo, add);

  assert.equal(added.length, 1, '48 Gorge stalks become one static scene object');
  assert.equal(added[0].geometry.groups.length, 2, 'two shades require two material draw groups');
  const sampleCylinder = new THREE.CylinderGeometry(0.07, 0.05, 6.6, 8);
  assert.deepEqual(added[0].geometry.groups.map(group => group.count), [sampleCylinder.index.count * 24, sampleCylinder.index.count * 24]);
  assert.deepEqual(Array.from(added[0].material, material => material.color.getHexString()), ['77963c','8fae4a']);
  assert.ok(added[0].castShadow && !added[0].receiveShadow, 'the batch retains the old stalk shadow policy');
  assert.ok(added[0].geometry.boundingSphere);
  assert.equal(temporaryGeometries.length, 3, 'only the three repeated stalk shapes are built');
  assert.ok(temporaryGeometries.every(geometry => geometry.disposeCount === 1), 'temporary shape templates are disposed after merging');

  const positions = added[0].geometry.getAttribute('position').array;
  const normals = added[0].geometry.getAttribute('normal').array;
  const indices = added[0].geometry.index.array;
  const shapeTemplates = temporaryGeometries.slice(0, 3), verticesPerCylinder = shapeTemplates[0].getAttribute('position').count;
  const globalVertexBase = [0, verticesPerCylinder * 24], vertexCursor = [0, 0], indexCursor = [0, 0];
  for (let bi = 0; bi < bamboo.length; bi++) {
    for (let k = 0; k < 6; k++) {
      const colorIndex = k % 2, shape = shapeTemplates[k % 3];
      const sourcePositions = shape.getAttribute('position').array, sourceNormals = shape.getAttribute('normal').array, sourceIndices = shape.index.array;
      const angle = k * 1.05 + bi, radius = 0.25 + (k % 3) * 0.22;
      const x = bamboo[bi][0] + Math.cos(angle) * radius, z = bamboo[bi][1] + Math.sin(angle) * radius;
      const vertexStart = globalVertexBase[colorIndex] + vertexCursor[colorIndex];
      const indexStart = added[0].geometry.groups[colorIndex].start + indexCursor[colorIndex];
      for (let i = 0; i < sourcePositions.length / 3; i++) {
        const target = (vertexStart + i) * 3, source = i * 3;
        assert.ok(Math.abs(positions[target] - (sourcePositions[source] + x)) < 1e-5, 'all stalks retain their original x placement');
        assert.ok(Math.abs(positions[target + 1] - (sourcePositions[source + 1] + 3.4)) < 1e-5);
        assert.ok(Math.abs(positions[target + 2] - (sourcePositions[source + 2] + z)) < 1e-5);
        assert.ok(Math.abs(normals[target] - sourceNormals[source]) < 1e-5, 'vertical cylinder normals are preserved');
        assert.ok(Math.abs(normals[target + 1] - sourceNormals[source + 1]) < 1e-5);
        assert.ok(Math.abs(normals[target + 2] - sourceNormals[source + 2]) < 1e-5);
      }
      for (let i = 0; i < sourceIndices.length; i++) assert.equal(indices[indexStart + i], sourceIndices[i] + vertexStart, 'triangle winding and connectivity are preserved');
      vertexCursor[colorIndex] += sourcePositions.length / 3;
      indexCursor[colorIndex] += sourceIndices.length;
    }
  }
  assert.equal(worldObjs.length, 1);
  assert.equal(obstacleMeshes.length, 1, 'batching leaves hidden gameplay collision and raycast data independent');

  const parkObjects = [], parkScene = new THREE.Scene();
  context.addBambooBatches([[-33,15],[33,15],[-32,-36],[32,-36]], object => { parkScene.add(object); parkObjects.push(object); return object; });
  assert.equal(parkObjects.length, 1, '24 Park stalks also become one scene object');
  assert.deepEqual(parkObjects[0].geometry.groups.map(group => group.count), [sampleCylinder.index.count * 12, sampleCylinder.index.count * 12]);
  assert.equal(parkObjects[0].geometry.groups.length, 2);
  assert.ok(temporaryGeometries.every(geometry => geometry.disposeCount === 1), 'each map disposes its three shape templates after merging');

  let geometryDisposals = 0, materialDisposals = 0;
  const oldGeometry = added[0].geometry, oldMaterials = added[0].material;
  oldGeometry.addEventListener('dispose', () => geometryDisposals++);
  oldMaterials.forEach(material => material.addEventListener('dispose', () => materialDisposals++));
  const cleanup = section(pages[0], 'function clearWorld()', 'function paintTex(');
  const cleanupContext = vm.createContext({ scene, worldObjs, obstacleMeshes, mobileMapTextures: new Map() });
  vm.runInContext(cleanup, cleanupContext); cleanupContext.clearWorld();
  assert.equal(geometryDisposals, 1, 'merged bamboo geometry is disposed once during a map transition');
  assert.equal(materialDisposals, 2, 'each shared shade material is disposed once');
  assert.equal(scene.children.length, 0);
  assert.equal(cleanupContext.worldObjs.length, 0);
  const parkCleanup = vm.createContext({ scene: parkScene, worldObjs: parkObjects, obstacleMeshes: [], mobileMapTextures: new Map() });
  let parkGeometryDisposals = 0, parkMaterialDisposals = 0;
  parkObjects[0].geometry.addEventListener('dispose', () => parkGeometryDisposals++);
  parkObjects[0].material.forEach(material => material.addEventListener('dispose', () => parkMaterialDisposals++));
  vm.runInContext(cleanup, parkCleanup); parkCleanup.clearWorld();
  assert.equal(parkScene.children.length, 0, 'the Park batch is also removed on map transition');
  assert.equal(parkGeometryDisposals, 1);
  assert.equal(parkMaterialDisposals, 2);
  sampleCylinder.dispose();
  shapeTemplates.forEach(shape => shape.dispose());

  const rebuilt = [];
  context.addBambooBatches(bamboo, object => { scene.add(object); rebuilt.push(object); return object; });
  assert.equal(rebuilt.length, 1, 'map rebuild recreates one bamboo batch');
  assert.notStrictEqual(rebuilt[0].geometry, oldGeometry, 'the rebuilt map never reuses disposed geometry');
  assert.equal(scene.children.length, 1);
});

test('static palm decorations batch by color without entering collision and clean up on map rebuild', () => {
  const helperStart = pages[0].indexOf('function addPalmTreeBatches(trees, add)');
  assert.ok(helperStart >= 0, 'repeated static palm geometry is consolidated into color batches');
  const helper = section(pages[0], 'function addPalmTreeBatches(trees, add)', 'function buildDeco(m)');
  assert.equal(helper, section(pages[1], 'function addPalmTreeBatches(trees, add)', 'function buildDeco(m)'));
  const deco = section(pages[0], 'function buildDeco(m)', 'function mobileTilesBoxFaces(');
  assert.match(deco, /if\s*\(m\.palmTrees\)\s*addPalmTreeBatches\(m\.trees\s*\|\|\s*\[\],\s*add\)/);

  const THREE = require(path.join(assets, 'www/three.min.js'));
  const context = vm.createContext({ THREE });
  vm.runInContext(helper, context);
  const trees = [[-29,-27],[29,-27],[-31,4],[31,4],[-21,33],[21,33],[-18,-32],[18,-32],[-11,22],[11,27],[-26,-11],[26,-11]];
  const scene = new THREE.Scene(), worldObjs = [], obstacleMeshes = [{ gameplayCollider: true }], added = [];
  function add(object, castsShadow) { object.castShadow = castsShadow !== false; scene.add(object); worldObjs.push(object); added.push(object); return object; }
  context.addPalmTreeBatches(trees, add);
  assert.equal(added.length, 1, 'the Park map 12-tree fixture becomes one static scene object');
  assert.equal(added[0].geometry.groups.length, 2, 'the merged geometry keeps two material draw groups');
  assert.deepEqual(added[0].geometry.groups.map(group => group.count), [756, 756]);
  assert.equal(added[0].material[0].color.getHexString(), '56863d');
  assert.equal(added[0].material[1].color.getHexString(), '39774c');
  assert.ok(added[0].castShadow && !added[0].receiveShadow);
  assert.ok(added[0].geometry.boundingSphere);
  const bounds = added[0].geometry.boundingSphere, vertex = new THREE.Vector3(), vertexData = added[0].geometry.getAttribute('position').array;
  for (let i = 0; i < vertexData.length; i += 3) {
    vertex.set(vertexData[i], vertexData[i + 1], vertexData[i + 2]);
    assert.ok(bounds.containsPoint(vertex), 'aggregate bounds include every tree vertex for correct frustum culling');
  }
  assert.equal(worldObjs.length, 1);
  assert.equal(obstacleMeshes.length, 1, 'decorative batching leaves collision and raycast lists independent');

  const positions = added[0].geometry.getAttribute('position').array;
  const secondEvenTreeVertex = 126 + 6;
  const tree = trees[2], angle = 2 * 0.37, width = 0.32 * (1 - 1 / 3);
  const expectedX = tree[0] + Math.cos(angle) * 0.9 - Math.sin(angle) * width;
  const expectedZ = tree[1] + Math.sin(angle) * 0.9 + Math.cos(angle) * width;
  assert.ok(Math.abs(positions[secondEvenTreeVertex * 3] - expectedX) < 1e-5, 'batched palm vertices retain the original per-tree rotation');
  assert.ok(Math.abs(positions[secondEvenTreeVertex * 3 + 2] - expectedZ) < 1e-5);

  let geometryDisposals = 0, materialDisposals = 0;
  const oldGeometry = added[0].geometry, oldMaterials = added[0].material;
  oldGeometry.addEventListener('dispose', () => geometryDisposals++);
  oldMaterials.forEach(material => material.addEventListener('dispose', () => materialDisposals++));
  const cleanup = section(pages[0], 'function clearWorld()', 'function paintTex(');
  const cleanupContext = vm.createContext({ scene, worldObjs, obstacleMeshes, mobileMapTextures: new Map() });
  vm.runInContext(cleanup, cleanupContext); cleanupContext.clearWorld();
  assert.equal(geometryDisposals, 1, 'shared palm geometry is disposed once during a map transition');
  assert.equal(materialDisposals, 2, 'each color material is disposed once');
  assert.equal(scene.children.length, 0);
  assert.equal(cleanupContext.worldObjs.length, 0);

  const rebuilt = [];
  context.addPalmTreeBatches(trees, object => { scene.add(object); rebuilt.push(object); return object; });
  assert.equal(rebuilt.length, 1, 'the next map rebuild recreates one static palm object');
  assert.notStrictEqual(rebuilt[0].geometry, oldGeometry, 'a rebuilt map does not reuse disposed geometry');
  assert.equal(scene.children.length, 1);
});

test('Generated canvas surfaces follow the active mobile anisotropy tier', () => {
  const filtering = section(pages[0], 'var mobileTextureLimit', 'if (!touchMode) renderer.setPixelRatio');
  const factory = section(pages[0], 'function ctex(w, h, draw, rx, ry)', 'function speckle(');
  assert.equal(filtering, section(pages[1], 'var mobileTextureLimit', 'if (!touchMode) renderer.setPixelRatio'));
  assert.equal(factory, section(pages[1], 'function ctex(w, h, draw, rx, ry)', 'function speckle('));
  class Texture extends EventTarget {
    anisotropy = 4;
    repeat = { set() {} };
    set needsUpdate(value) { if (value) this.uploads = (this.uploads || 0) + 1; }
  }
  const context = vm.createContext({
    G: { mobileQuality: 'low', fastMode: false },
    renderer: { capabilities: { getMaxAnisotropy: () => 6 } },
    touchMode: true,
    document: { createElement: () => ({ getContext: () => ({}) }) },
    THREE: { CanvasTexture: Texture, RepeatWrapping: 1000 },
    colorTexture: texture => texture
  });
  vm.runInContext(filtering + factory, context);

  const texture = context.ctex(64, 64, () => {});
  assert.equal(texture.anisotropy, 2, 'Low quality must use the mobile filtering budget');
  assert.ok(context.mobileSurfaceTextures.has(texture));
  assert.equal(texture.uploads, 1);

  context.G.mobileQuality = 'high';
  context.mobileSurfaceTextures.forEach(context.applySurfaceFiltering);
  assert.equal(texture.anisotropy, 6, 'High quality must be capped by device support');
  context.G.fastMode = true;
  context.mobileSurfaceTextures.forEach(context.applySurfaceFiltering);
  assert.equal(texture.anisotropy, 2, 'Fast mode must return to the lower filtering budget');
  texture.dispatchEvent(new Event('dispose'));
  assert.ok(!context.mobileSurfaceTextures.has(texture));
});

test('Generated map signage follows mobile anisotropy tiers and releases tracking on disposal', () => {
  const filtering = section(pages[0], 'var mobileTextureLimit', 'if (!touchMode) renderer.setPixelRatio');
  const factory = section(pages[0], 'function textTex(txt, bg, fg)', 'function buildDeco(m)');
  assert.equal(factory, section(pages[1], 'function textTex(txt, bg, fg)', 'function buildDeco(m)'));
  class Texture extends EventTarget {
    anisotropy = 4;
    set needsUpdate(value) { if (value) this.uploads = (this.uploads || 0) + 1; }
  }
  const context = vm.createContext({
    G: { mobileQuality: 'low', fastMode: false },
    renderer: { capabilities: { getMaxAnisotropy: () => 6 } },
    touchMode: true,
    document: { createElement: () => ({ getContext: () => ({
      fillRect() {}, strokeRect() {}, measureText() { return { width: 100 }; }, fillText() {}
    }) }) },
    THREE: { CanvasTexture: Texture },
    colorTexture: texture => texture
  });
  vm.runInContext(filtering + factory, context);

  const texture = context.textTex('SITE A', '#000', '#fff');
  assert.equal(texture.anisotropy, 2, 'Low quality must use the mobile filtering budget');
  assert.ok(context.mobileSurfaceTextures.has(texture));
  context.G.mobileQuality = 'high';
  context.mobileSurfaceTextures.forEach(context.applySurfaceFiltering);
  assert.equal(texture.anisotropy, 6, 'High quality must be capped by device support');
  context.G.fastMode = true;
  context.mobileSurfaceTextures.forEach(context.applySurfaceFiltering);
  assert.equal(texture.anisotropy, 2, 'Fast mode must return to the lower filtering budget');
  texture.dispatchEvent(new Event('dispose'));
  assert.ok(!context.mobileSurfaceTextures.has(texture));
});

test('Smoke clouds share one sphere geometry and dispose it once per cloud', () => {
  const smoke = section(pages[0], 'function smokeBurst(pos)', 'function smokeBlocks(');
  assert.equal(smoke, section(pages[1], 'function smokeBurst(pos)', 'function smokeBlocks('));
  class Geometry {
    static created = 0;
    static disposed = 0;
    constructor(radius, widthSegments, heightSegments) {
      Geometry.created++;
      this.radius = radius;
      this.widthSegments = widthSegments;
      this.heightSegments = heightSegments;
    }
    dispose() { Geometry.disposed++; }
  }
  class Material { constructor(options) { Object.assign(this, options); } dispose() {} }
  const vector = () => ({ set(x, y, z) { Object.assign(this, { x, y, z }); } });
  class Group {
    constructor() { this.children = []; this.position = vector(); this.scale = vector(); }
    add(child) { this.children.push(child); }
  }
  class Mesh {
    constructor(geometry, material) { this.geometry = geometry; this.material = material; this.position = vector(); this.scale = { setScalar(value) { this.x = this.y = this.z = value; } }; }
  }
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0;
  const context = vm.createContext({
    Math: deterministicMath,
    smokes: [],
    THREE: { Group, Mesh, MeshBasicMaterial: Material, SphereGeometry: Geometry },
    scene: { add() {}, remove() {} },
    sfxNoise() {}, sfxTone() {},
    rEase: (a, b, value) => Math.max(0, Math.min(1, (value - a) / (b - a)))
  });
  vm.runInContext(smoke, context);

  context.smokeBurst({ x: 3, z: 4 });
  context.smokeBurst({ x: -1, z: 2 });
  assert.equal(Geometry.created, 2, 'each cloud should create one shared unit-sphere geometry');
  assert.equal(context.smokes.length, 2);
  for (const cloud of context.smokes) {
    assert.equal(cloud.geos.length, 1);
    assert.ok(cloud.g.children.every(mesh => mesh.geometry === cloud.geos[0]));
    for (const mesh of cloud.g.children)
      assert.equal(mesh.geometry.radius * mesh.scale.x, 1.1, 'per-particle radius must stay visually equivalent');
  }
  context.updateSmokes(18);
  assert.equal(Geometry.disposed, 2, 'each cloud should dispose its shared geometry once');
  assert.equal(context.smokes.length, 0);
});

test('Bomb objective visual sync reuses loops instead of allocating per-frame callbacks', () => {
  const sync = section(pages[0], 'function syncBombWorldVisuals(now)', 'function updateBombHudProgress(');
  assert.equal(sync, section(pages[1], 'function syncBombWorldVisuals(now)', 'function updateBombHudProgress('));
  const vector = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); }, setScalar(value) { this.x = this.y = this.z = value; }, copy(value) { Object.assign(this, value); } });
  const object = () => ({ visible: false, position: vector(), rotation: vector(), scale: vector() });
  const sites = { A: object(), B: object() };
  const deviceMats = Array.from({ length: 4 }, () => ({ transparent: false, opacity: 1 }));
  const visual = {
    root: object(), sites, device: object(), carrier: object(), progress: Object.assign(object(), { material: { opacity: 1 } }),
    led: { material: { color: { set(value) { this.value = value; } }, opacity: 1 } },
    screen: { color: { set(value) { this.value = value; } } },
    deviceMats, baseScale: { x: 1, y: 1, z: 1 }
  };
  const callbacks = [];
  deviceMats.forEach = callback => { callbacks.push(callback); for (let i=0; i<deviceMats.length; i++) callback(deviceMats[i], i, deviceMats); };
  const objective = { sites: { A: { x: 2, y: 0, z: 3 }, B: { x: 8, y: 0, z: 9 } }, phase: 'dropped', x: 4, y: 0, z: 5, use: null };
  const context = vm.createContext({
    MP: { on: true, mode: 'bomb', objective }, state: 'live', R: { mode: 'bomb' }, SOLO_BOMB: { state: null },
    BOMB_WORLD_VIS: visual, ensureBombWorldVisuals: () => visual,
    bombProgressFraction: () => 0.5, bombVisualActor: () => null,
    __callbacks: callbacks
  });
  vm.runInContext("Array.prototype.forEach = function (callback) { __callbacks.push(callback); for (var i=0; i<this.length; i++) callback(this[i], i, this); };\n" + sync, context);

  for (let i = 0; i < 4; i++) context.syncBombWorldVisuals(i * 16.67);
  assert.equal(callbacks.length, 0, 'active frames should not allocate temporary callback closures');
  assert.deepEqual([sites.A.position.x, sites.A.position.z, sites.B.position.x, sites.B.position.z], [2, 3, 8, 9]);
  assert.deepEqual([visual.device.position.x, visual.device.position.z], [4, 5]);
  assert.ok(deviceMats.every(material => !material.transparent && material.opacity === 1));
  objective.use = { action: 'plant', siteId: 'A' };
  context.syncBombWorldVisuals(83.35);
  assert.equal(visual.device.visible, true);
  assert.equal(visual.device.scale.x, 0.89);
  assert.ok(deviceMats.every(material => material.transparent && material.opacity === 0.74));
  assert.equal(visual.progress.visible, true);
  assert.equal(callbacks.length, 0, 'planting frames should not allocate material callbacks');
});

test('Fire bursts share one cone geometry while preserving each flame size', () => {
  const fire = section(pages[0], 'function fireBurst(pos)', 'function decoyDeploy(');
  assert.equal(fire, section(pages[1], 'function fireBurst(pos)', 'function decoyDeploy('));
  class Geometry {
    static created = 0;
    constructor(radius, height, radialSegments) { Geometry.created++; Object.assign(this, { radius, height, radialSegments }); }
    dispose() {}
  }
  class Material { constructor(options) { Object.assign(this, options); } dispose() {} }
  const vector = () => ({ set(x, y, z) { Object.assign(this, { x, y, z }); }, setScalar(value) { this.x = this.y = this.z = value; } });
  class Group { constructor() { this.children = []; this.position = vector(); } add(child) { this.children.push(child); } }
  class Mesh { constructor(geometry, material) { Object.assign(this, { geometry, material, position: vector(), scale: vector(), userData: {} }); } }
  const context = vm.createContext({
    fires: [], THREE: { Group, Mesh, MeshBasicMaterial: Material, ConeGeometry: Geometry },
    scene: { add() {}, remove() {} }, sfxNoise() {}, sfxTone() {}
  });
  vm.runInContext(fire, context);

  context.fireBurst({ x: 1, z: 2 });
  context.fireBurst({ x: 3, z: 4 });
  assert.equal(Geometry.created, 2, 'each burst should create one shared cone geometry');
  context.fires.forEach(effect => { effect.tick = 1; });
  context.updateFires(0.016);
  for (const flame of context.fires.flatMap(effect => effect.g.children)) {
    assert.ok(context.fires.some(effect => flame.geometry === effect.geo));
    const k = 0.7 + Math.sin(flame.userData.ph) * 0.35;
    assert.ok(Math.abs(flame.geometry.radius * flame.scale.x - flame.userData.s * (1 + Math.sin(flame.userData.ph * 0.7) * 0.1) * 0.5) < 1e-12);
    assert.ok(Math.abs(flame.geometry.height * flame.scale.y * 0.5 - flame.userData.s * k * 0.9) < 1e-12);
  }
});

test('Fire animation updates children without creating per-frame callbacks', () => {
  const fire = section(pages[0], 'function fireBurst(pos)', 'function decoyDeploy(');
  const callbacks = [];
  class Geometry { constructor() {} dispose() {} }
  class Material { constructor(options) { Object.assign(this, options); } dispose() {} }
  const vector = () => ({ set(x, y, z) { Object.assign(this, { x, y, z }); }, setScalar(value) { this.x = this.y = this.z = value; } });
  class Group { constructor() { this.children = []; this.position = vector(); this.children.forEach = callback => { callbacks.push(callback); for (let i=0; i<this.children.length; i++) callback(this.children[i], i, this.children); }; } add(child) { this.children.push(child); } }
  class Mesh { constructor(geometry, material) { Object.assign(this, { geometry, material, position: vector(), scale: vector(), userData: {} }); } }
  const context = vm.createContext({
    fires: [], bots: [], P: { alive: false }, THREE: { Group, Mesh, MeshBasicMaterial: Material, ConeGeometry: Geometry },
    scene: { add() {}, remove() {} }, sfxNoise() {}, sfxTone() {}, hurtBot() {}, hurtPlayer() {}, __callbacks: callbacks
  });
  const instrument = "Array.prototype.forEach = function (callback) { __callbacks.push(callback); for (var i=0; i<this.length; i++) callback(this[i], i, this); };\n";
  vm.runInContext(instrument + fire, context);
  context.fireBurst({ x: 0, z: 0 });
  context.fires[0].tick = 1;
  context.updateFires(0.016);
  assert.equal(callbacks.length, 0, 'active fire frames should not allocate child-update callbacks');
});

test('Flash and explosion spheres reuse geometry, materials and meshes after expiry', () => {
  const helperStart = pages[0].indexOf('function addPooledBurstSphere(');
  assert.ok(helperStart >= 0, 'flash and explosion effects need the shared pool factory');
  const helper = section(pages[0], 'function addPooledBurstSphere(', 'function flashBang(pos)');
  const flash = section(pages[0], 'function flashBang(pos)', 'function smokeBurst(pos)');
  const explosion = section(pages[0], 'function explode(pos)', '/* ---------- rounds ---------- */');
  assert.equal(helper, section(pages[1], 'function addPooledBurstSphere(', 'function flashBang(pos)'));
  assert.equal(flash, section(pages[1], 'function flashBang(pos)', 'function smokeBurst(pos)'));
  assert.equal(explosion, section(pages[1], 'function explode(pos)', '/* ---------- rounds ---------- */'));
  assert.match(flash, /addPooledBurstSphere\('flash'/);
  assert.match(explosion, /addPooledBurstSphere\('explosion'/);
  assert.doesNotMatch(flash + explosion, /new THREE\.(SphereGeometry|MeshBasicMaterial)/);
  class Geometry {
    static created = 0;
    constructor(radius, widthSegments, heightSegments) { Geometry.created++; Object.assign(this, { radius, widthSegments, heightSegments }); }
    dispose() {}
  }
  class Material {
    static created = 0;
    constructor(options) { Material.created++; Object.assign(this, options); this.color = { setHex(value) { this.value = value; } }; }
    dispose() {}
  }
  class Mesh {
    static created = 0;
    constructor(geometry, material) { Mesh.created++; Object.assign(this, { geometry, material, visible: true, position: { set(x, y, z) { Object.assign(this, { x, y, z }); } }, scale: { setScalar(value) { this.x = this.y = this.z = value; }, multiplyScalar(value) { this.x *= value; this.y *= value; this.z *= value; } } }); }
  }
  const context = vm.createContext({
    effects: [], THREE: { SphereGeometry: Geometry, MeshBasicMaterial: Material, Mesh },
    scene: { add() {}, remove() {} }, flashSpherePool: [], explosionSpherePool: [],
    flashSphereGeo: null, explosionSphereGeo: null, legendBoltsTick() {}
  });
  vm.runInContext(helper + section(pages[0], 'function updateEffects(dt)', '/* ---------- hud ---------- */'), context);
  context.addPooledBurstSphere('flash', 1, 0.5, 2, 0.5, 0xffffff, 0.95, 0.3);
  const firstFlash = context.effects[0].obj;
  context.updateEffects(0.31);
  context.addPooledBurstSphere('flash', 3, 0.5, 4, 0.5, 0xffffff, 0.95, 0.3);
  assert.equal(context.effects[0].obj, firstFlash);
  assert.deepEqual([firstFlash.position.x, firstFlash.position.y, firstFlash.position.z], [3, 0.5, 4]);
  assert.deepEqual([firstFlash.scale.x, firstFlash.scale.y, firstFlash.scale.z], [0.5, 0.5, 0.5]);
  context.updateEffects(0.31);
  context.addPooledBurstSphere('explosion', 5, 0.08, 6, 0.6, 0xffa44a, 0.9, 0.45);
  const firstExplosion = context.effects[0].obj;
  context.updateEffects(0.46);
  context.addPooledBurstSphere('explosion', 7, 0.1, 8, 0.6, 0xffa44a, 0.9, 0.45);
  assert.equal(context.effects[0].obj, firstExplosion);
  assert.equal(Geometry.created, 2);
  assert.equal(Material.created, 2);
  assert.equal(Mesh.created, 2);
});

test('Clearing grenade effects disposes every active owned GPU resource', () => {
  const helper = section(pages[0], 'function disposeNadeMesh(root)', 'function clearNades()');
  const clear = section(pages[0], 'function clearNades()', 'function updateNades(dt)');
  assert.equal(helper, section(pages[1], 'function disposeNadeMesh(root)', 'function clearNades()'));
  assert.equal(clear, section(pages[1], 'function clearNades()', 'function updateNades(dt)'));
  const disposed = [], removed = [];
  const resource = name => ({ name, dispose() { disposed.push(name); } });
  const mesh = name => ({ geometry: resource(name + '-geo'), material: resource(name + '-mat'), children: [{ geometry: resource(name + '-child-geo'), material: resource(name + '-child-mat'), children: [] }] });
  const flying = [{ m: mesh('flying') }], smokes = [{ g: {}, mat: resource('smoke-mat'), geos: [resource('smoke-geo')] }];
  const fires = [{ g: {}, geo: resource('fire-geo'), mats: [resource('fire-mat-a'), resource('fire-mat-b')] }], decoys = [{ m: mesh('decoy') }];
  const context = vm.createContext({
    flying, smokes, fires, decoys, whiteT: 1, elWhite: { style: { opacity: 1 } },
    scene: { remove(object) { removed.push(object); } }
  });
  vm.runInContext(helper + clear, context);
  context.clearNades();
  assert.equal(disposed.length, 13, 'flying and decoy child resources must be released with smoke and fire resources');
  assert.equal(new Set(disposed).size, 13, 'each owned resource is disposed exactly once');
  assert.equal(removed.length, 4);
  assert.deepEqual([context.flying.length, context.smokes.length, context.fires.length, context.decoys.length], [0, 0, 0, 0]);
});

test('Grenade detonation and decoy expiry dispose nested GPU resources', () => {
  const helper = section(pages[0], 'function disposeNadeMesh(root)', 'function clearNades()');
  const detonation = section(pages[0], 'function updateNades(dt)', 'var fires = [], decoys = [];');
  const decoyExpiry = section(pages[0], 'function updateDecoys(dt)', 'var flashSpherePool=');
  assert.equal(detonation, section(pages[1], 'function updateNades(dt)', 'var fires = [], decoys = [];'));
  assert.equal(decoyExpiry, section(pages[1], 'function updateDecoys(dt)', 'var flashSpherePool='));
  const makeMesh = name => ({
    geometry: { dispose() { disposed.push(name + '-geo'); } },
    material: { dispose() { disposed.push(name + '-mat'); } },
    children: [{
      geometry: { dispose() { disposed.push(name + '-child-geo'); } },
      material: { dispose() { disposed.push(name + '-child-mat'); } },
      children: []
    }],
    position: { x: 1, y: 1, z: 1, addScaledVector() {}, clone() { return { x: this.x, y: this.y, z: this.z }; } },
    rotation: { x: 0 }
  });
  let disposed = [], removed = 0;
  const grenade = { m: makeMesh('grenade'), vel: { x: 0, y: 0, z: 0 }, t: 0.01, type: 'frag' };
  const context = vm.createContext({
    flying: [grenade], smokes: [], fires: [], decoys: [], whiteT: 0,
    G: { flashAmt: 100 }, BOXES: [], AREA: { x0: -10, x1: 10, z0: -10, z1: 10 },
    scene: { remove() { removed++; } }, updateSmokes() {}, updateFires() {}, updateDecoys() {}, explode() {}
  });
  vm.runInContext(helper + detonation, context);
  context.updateNades(0.02);
  assert.deepEqual(disposed.sort(), ['grenade-child-geo', 'grenade-child-mat', 'grenade-geo', 'grenade-mat']);
  assert.equal(removed, 1);
  assert.equal(context.flying.length, 0);

  disposed = [];
  const decoy = { m: makeMesh('decoy'), x: 0, z: 0, t: 0.01, tick: 1 };
  const decoyContext = vm.createContext({ decoys: [decoy], P: { x: 100, z: 100 }, scene: { remove() { removed++; } } });
  vm.runInContext(helper + decoyExpiry, decoyContext);
  decoyContext.updateDecoys(0.02);
  assert.deepEqual(disposed.sort(), ['decoy-child-geo', 'decoy-child-mat', 'decoy-geo', 'decoy-mat']);
  assert.equal(decoyContext.decoys.length, 0);
  assert.equal(removed, 2);
});

test('inactive lobby preview leaves the render tree and reattaches across map changes and rounds', () => {
  const preview = section(pages[0], 'function lobbyPreviewUpdate(active)', 'function updateLobbyPreviewForFrame(active)');
  assert.equal(preview, section(pages[1], 'function lobbyPreviewUpdate(active)', 'function updateLobbyPreviewForFrame(active)'));
  const helperStart = pages[0].indexOf('function detachLobbyPreview()');
  const helper = helperStart >= 0 ? section(pages[0], 'function detachLobbyPreview()', 'function lobbyPreviewUpdate(active)') : '';
  if (helperStart >= 0) assert.equal(helper, section(pages[1], 'function detachLobbyPreview()', 'function lobbyPreviewUpdate(active)'));
  const THREE = require(path.join(assets, 'www/three.min.js'));
  const scene = new THREE.Scene(), mapObject = new THREE.Group(), previewRoot = new THREE.Group();
  scene.add(mapObject, previewRoot);
  for (let i = 0; i < 32; i++) previewRoot.add(new THREE.Group());
  let childMatrixUpdates = 0;
  previewRoot.traverse(node => {
    if (node === previewRoot) return;
    const update = node.updateMatrixWorld;
    node.updateMatrixWorld = function () { childMatrixUpdates++; return update.apply(this, arguments); };
  });
  previewRoot.visible = false;
  scene.updateMatrixWorld(true);
  assert.equal(childMatrixUpdates, 32, 'Three.js traverses descendants while the hidden preview root remains attached');

  let created = 0;
  const context = vm.createContext({
    LOBBY_PREVIEW: { g: previewRoot, baseY: 0.08, baseYaw: Math.PI },
    LOBBY_PREVIEW_KEY: 'operator|map-one|carbine', scene,
    menuOpen: () => false, menuTab: '', setTab: '', finishWeapon: 'carbine', pendingOpId: null,
    ME: { id: 'operator' }, CURMAP: { id: 'map-one' }, MAPD: { spawn: { x: 0, z: 0 } },
    opById: () => null, ensureWorldWeapon() {}, makeUnit() { created++; const g = new THREE.Group(); scene.add(g); return { g }; },
    THREE, window: { matchMedia: () => ({ matches: true }) }, matchMedia: () => ({ matches: true }),
    performance: { now: () => 1000 }
  });
  vm.runInContext(helper + preview, context);
  context.lobbyPreviewUpdate(false);
  assert.equal(context.LOBBY_PREVIEW.g, previewRoot, 'deactivation retains the cached preview object');
  assert.equal(previewRoot.visible, false);
  assert.equal(previewRoot.parent, null, 'inactive preview is removed from the per-frame scene traversal');
  assert.equal(mapObject.parent, scene, 'map objects remain attached');
  childMatrixUpdates = 0;
  scene.updateMatrixWorld(true);
  assert.equal(childMatrixUpdates, 0, 'detached preview descendants receive no matrix updates');

  const effect = new THREE.Group(); scene.add(effect);
  context.CURMAP.id = 'map-two';
  context.lobbyPreviewUpdate(true);
  const rebuiltRoot = context.LOBBY_PREVIEW.g;
  assert.notEqual(rebuiltRoot, previewRoot, 'map changes rebuild the preview model');
  assert.equal(previewRoot.parent, null);
  assert.equal(rebuiltRoot.parent, scene);
  assert.equal(rebuiltRoot.visible, true);
  assert.equal(effect.parent, scene, 'effect objects are unaffected by preview detachment');
  assert.equal(created, 1);

  context.lobbyPreviewUpdate(false);
  scene.remove(effect); // simulate normal effect expiry during a later round
  context.lobbyPreviewUpdate(true);
  assert.equal(context.LOBBY_PREVIEW.g, rebuiltRoot, 'round transitions reuse the cached map preview');
  assert.equal(rebuiltRoot.parent, scene);
  assert.equal(rebuiltRoot.visible, true);
  assert.equal(created, 1);
});

test('static map transforms stay cached while moving parent-child transforms still propagate', () => {
  for (const page of pages) {
    const worldBuilder = section(page, 'function buildWorld(m)', 'buildWorld(CURMAP);');
    assert.ok(worldBuilder.includes('freezeStaticWorldMatrices();'), 'each asset tree freezes map roots after map construction');
  }
  const helperStart = pages[0].indexOf('function freezeStaticWorldMatrices()');
  const helper = helperStart >= 0 ? section(pages[0], 'function freezeStaticWorldMatrices()', 'function paintZone(') : '';
  if (helperStart >= 0) assert.equal(helper, section(pages[1], 'function freezeStaticWorldMatrices()', 'function paintZone('));
  const THREE = require(path.join(assets, 'www/three.min.js'));
  const scene = new THREE.Scene(), staticMapMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3), new THREE.MeshBasicMaterial());
  const movingActor = new THREE.Group(), movingWeaponChild = new THREE.Group();
  staticMapMesh.position.set(5, 0, -3);
  movingActor.position.set(1, 0, 0); movingWeaponChild.position.set(0, 2, 0);
  movingActor.add(movingWeaponChild); scene.add(staticMapMesh, movingActor);
  const worldObjs = [staticMapMesh];
  let staticCompositions = 0, staticWorldRecomputes = 0, actorCompositions = 0, childCompositions = 0;
  for (const [object, counter] of [[staticMapMesh, 'static'], [movingActor, 'actor'], [movingWeaponChild, 'child']]) {
    const update = object.updateMatrix;
    object.updateMatrix = function () {
      if (counter === 'static') staticCompositions++;
      else if (counter === 'actor') actorCompositions++;
      else childCompositions++;
      return update.apply(this, arguments);
    };
  }
  const updateStaticWorld = staticMapMesh.updateMatrixWorld;
  staticMapMesh.updateMatrixWorld = function (force) {
    if (force || this.matrixWorldNeedsUpdate || this.matrixAutoUpdate) staticWorldRecomputes++;
    return updateStaticWorld.apply(this, arguments);
  };
  const context = vm.createContext({ scene, worldObjs });
  if (helper) { vm.runInContext(helper, context); context.freezeStaticWorldMatrices(); }
  scene.updateMatrixWorld(true);
  staticCompositions = staticWorldRecomputes = actorCompositions = childCompositions = 0;
  for (let frame = 1; frame <= 3; frame++) {
    movingActor.position.x = frame;
    scene.updateMatrixWorld();
  }
  assert.equal(staticCompositions, 0, 'unchanged map roots should not recompose on rendered frames');
  assert.equal(staticWorldRecomputes, 0, 'unchanged map roots should not recalculate world matrices on rendered frames');
  assert.equal(actorCompositions, 3, 'moving actor transforms still update every frame');
  assert.equal(childCompositions, 3, 'dynamic weapon child transforms still inherit actor movement');
  assert.equal(movingWeaponChild.matrixWorld.elements[12], 3, 'weapon child world position includes the latest actor position');
  assert.equal(staticMapMesh.matrixWorld.elements[12], 5, 'static map world position remains intact');

  const nextMapMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
  nextMapMesh.position.set(-7, 0, 4);
  let nextMapCompositions = 0, nextMapWorldRecomputes = 0;
  const nextMapUpdate = nextMapMesh.updateMatrix;
  nextMapMesh.updateMatrix = function () { nextMapCompositions++; return nextMapUpdate.apply(this, arguments); };
  const nextMapWorldUpdate = nextMapMesh.updateMatrixWorld;
  nextMapMesh.updateMatrixWorld = function (force) {
    if (force || this.matrixWorldNeedsUpdate || this.matrixAutoUpdate) nextMapWorldRecomputes++;
    return nextMapWorldUpdate.apply(this, arguments);
  };
  scene.remove(staticMapMesh); worldObjs.splice(0, worldObjs.length, nextMapMesh); scene.add(nextMapMesh);
  context.freezeStaticWorldMatrices();
  assert.equal(nextMapCompositions, 1, 'new map root is composed once when the map is built');
  nextMapCompositions = 0;
  movingActor.position.x = 4;
  scene.updateMatrixWorld();
  assert.equal(nextMapCompositions, 0, 'new map root does not recompose on the next rendered frame');
  assert.equal(nextMapWorldRecomputes, 1, 'new map world matrix is propagated once on the first normal traversal');
  assert.equal(nextMapMesh.matrixWorld.elements[12], -7, 'new map root still receives its world transform');
  assert.equal(movingWeaponChild.matrixWorld.elements[12], 4, 'movement continues to propagate after a map rebuild');
  nextMapWorldRecomputes = 0; movingActor.position.x = 5; scene.updateMatrixWorld();
  assert.equal(nextMapWorldRecomputes, 0, 'subsequent frames do not recalculate the new map world matrix');
  assert.equal(movingWeaponChild.matrixWorld.elements[12], 5, 'dynamic child transforms remain current after static matrices are cached');
});

test('map masonry uses each box face dimensions without changing positions or indices', () => {
  const THREE = require(path.join(assets,'www/three.min.js'));
  const policy = section(pages[0],'function mobileTilesBoxFaces','function buildWorld(');
  const v=vm.createContext({touchMode:true});
  vm.runInContext(policy,v);
  for (const type of ['brick','stone','plaster','stucco','asphalt','cobble','plate'])
    assert.equal(v.mobileTilesBoxFaces({t:type}),true,type);
  for (const type of ['crate','shop','glass','balcony','cont'])
    assert.equal(v.mobileTilesBoxFaces({t:type}),false,type);
  v.touchMode=false;
  assert.equal(v.mobileTilesBoxFaces({t:'brick'}),false);

  const geometry = new THREE.BoxGeometry(12,6,1.5);
  const position = geometry.attributes.position.array.slice();
  const index = geometry.index.array.slice();
  v.tileMapBoxFaces(geometry,12,6,1.5);
  const uv = geometry.attributes.uv;
  const normals = geometry.attributes.normal;
  for (const [axis,expected] of [[0,[.5,2]],[1,[4,.5]],[2,[4,2]]]) {
    const scale = [0,0];
    for (let i=0;i<normals.count;i++) {
      if (![normals.getX(i),normals.getY(i),normals.getZ(i)][axis]) continue;
      scale[0]=Math.max(scale[0],uv.getX(i));
      scale[1]=Math.max(scale[1],uv.getY(i));
    }
    assert.deepEqual(scale,expected);
  }
  assert.deepEqual(geometry.attributes.position.array,position);
  assert.deepEqual(geometry.index.array,index);
  const canvasTexture=new THREE.CanvasTexture({});
  assert.equal(canvasTexture.generateMipmaps,true);
  assert.equal(canvasTexture.minFilter,THREE.LinearMipmapLinearFilter);
});
