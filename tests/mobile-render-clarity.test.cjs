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
  const clear = section(pages[0], 'function clearNades()', 'function updateNades(dt)');
  assert.equal(clear, section(pages[1], 'function clearNades()', 'function updateNades(dt)'));
  let disposed = 0, removed = 0;
  const resource = () => ({ dispose() { disposed++; } });
  const mesh = () => ({ geometry: resource(), material: resource() });
  const flying = [{ m: mesh() }], smokes = [{ g: {}, mat: resource(), geos: [resource()] }];
  const fires = [{ g: {}, geo: resource(), mats: [resource(), resource()] }], decoys = [{ m: mesh() }];
  const context = vm.createContext({
    flying, smokes, fires, decoys, whiteT: 1, elWhite: { style: { opacity: 1 } },
    scene: { remove() { removed++; } }
  });
  vm.runInContext(clear, context);
  context.clearNades();
  assert.equal(disposed, 9, 'flying grenades, smoke, fire and decoy resources must all be released');
  assert.equal(removed, 4);
  assert.deepEqual([context.flying.length, context.smokes.length, context.fires.length, context.decoys.length], [0, 0, 0, 0]);
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
