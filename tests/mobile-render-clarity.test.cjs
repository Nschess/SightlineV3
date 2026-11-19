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
  for (const [start,end] of [
    ['function framePixelBudget()', 'function fail(msg)'],
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
  const balanced = Math.sqrt(1250000/(667*375))*.85;
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
  assert.ok(Math.abs(initial**2*1200*720-1250000)<0.01);
  v.perfLvl=2; v.perfScale=.94;
  assert.equal(v.pixelRatio(),initial*.96);
  v.perfLvl=3; v.perfScale=.9;
  assert.ok(Math.abs(v.pixelRatio()/initial-.9)<1e-10);
  v.G.adaptive=false;
  assert.equal(v.pixelRatio(),initial);
  v.G.adaptive=true;
  v.G.mobileQuality='low'; assert.equal(v.framePixelBudget(),650000);
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
