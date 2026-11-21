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
