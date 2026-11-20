'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const page = fs.readFileSync(path.join(__dirname, '../AndroidProject/app/src/main/assets/www/index.html'), 'utf8');
const start = page.indexOf('/* P0 FRAME DIAGNOSTICS BEGIN');
const stop = page.indexOf('/* P0 FRAME DIAGNOSTICS END */', start);
assert.ok(start >= 0 && stop > start, 'opt-in frame diagnostics are present');
const moduleSource = page.slice(start, stop + '/* P0 FRAME DIAGNOSTICS END */'.length);

function diagnostic(api = 'webgl2') {
  let ready = false, disjoint = false, resultReads = 0, deleted = 0;
  const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2, QUERY_RESULT_AVAILABLE_EXT: 3, QUERY_RESULT_EXT: 4 };
  const gl = {
    QUERY_RESULT_AVAILABLE: 5, QUERY_RESULT: 6,
    getExtension(name) { return api !== 'unsupported' && name === (api === 'webgl2' ? 'EXT_disjoint_timer_query_webgl2' : 'EXT_disjoint_timer_query') ? ext : null; },
    getParameter(parameter) { assert.equal(parameter, ext.GPU_DISJOINT_EXT); return disjoint; }
  };
  if (api === 'webgl2') {
    gl.createQuery = () => ({});
    gl.beginQuery = (target, query) => { assert.equal(target, ext.TIME_ELAPSED_EXT); assert.ok(query); };
    gl.endQuery = target => assert.equal(target, ext.TIME_ELAPSED_EXT);
    gl.getQueryParameter = (query, parameter) => {
      if (parameter === gl.QUERY_RESULT_AVAILABLE) return ready;
      resultReads++;
      assert.equal(parameter, gl.QUERY_RESULT);
      assert.ok(ready, 'GPU result must never be read until available');
      return 4200000;
    };
    gl.deleteQuery = () => { deleted++; };
  } else if (api === 'webgl1') {
    ext.createQueryEXT = () => ({});
    ext.beginQueryEXT = (target, query) => { assert.equal(target, ext.TIME_ELAPSED_EXT); assert.ok(query); };
    ext.endQueryEXT = target => assert.equal(target, ext.TIME_ELAPSED_EXT);
    ext.getQueryObjectEXT = (query, parameter) => {
      if (parameter === ext.QUERY_RESULT_AVAILABLE_EXT) return ready;
      resultReads++;
      assert.equal(parameter, ext.QUERY_RESULT_EXT);
      assert.ok(ready, 'GPU result must never be read until available');
      return 4200000;
    };
    ext.deleteQueryEXT = () => { deleted++; };
  }
  const ctx = {
    renderer: { getContext: () => gl, domElement: { width: 800, height: 450 } },
    performance: { now: (() => { let t = 0; return () => ++t; })() },
    window: { devicePixelRatio: 2 }, G: { fpsCap: 60, renderScale: 100, mobileQuality: 'high' },
    androidGameTarget: 90, androidDisplay: { activeHz: 90, supportedHz: [60, 90] }, perfLvl: 2, units: new Array(5), MP: { on: false },
    CURMAP: { id: 'diagnostic-map' }, R: { mode: 'infection' }, P: { x: 0, z: 0, vx: 0, vz: 0, yaw: 0 },
    resolve() {}, groundAt() {}, ceilingAt() {}, navLine() {}, findPath() {}, hearPlayer() {},
    updateHud() {}, drawRadar() {}, renderScore() {}
  };
  vm.createContext(ctx);
  vm.runInContext(moduleSource, ctx);
  ctx.P0FrameDiag.start();
  function sample() {
    const frame = ctx.P0FrameDiag.begin();
    ctx.P0FrameDiag.gpuBegin(frame);
    frame.effectsMs = 1.25;
    ctx.P0FrameDiag.gpuEnd(frame);
    ctx.P0FrameDiag.finish(frame, 16.7, 12, 3000);
  }
  return { ctx, gl, sample, setReady: value => { ready = value; }, setDisjoint: value => { disjoint = value; }, resultReads: () => resultReads, deleted: () => deleted };
}

for (const api of ['webgl2', 'webgl1']) {
  test(`${api} GPU timers are polled asynchronously and exported as separate GPU time`, () => {
    const d = diagnostic(api);
    d.sample();
    const early = d.ctx.P0FrameDiag.report();
    assert.equal(early.gpuTimer.status.startsWith('supported:'), true);
    assert.equal(d.resultReads(), 0, 'no blocking result read while GPU work is pending');
    d.setReady(true);
    d.sample();
    const report = d.ctx.P0FrameDiag.report();
    assert.equal(report.currentContext.effectiveFpsTarget, 90);
    assert.equal(report.currentContext.mobileQuality, 'high');
    assert.equal(report.currentContext.activeRefreshHz, 90);
    assert.equal(report.currentContext.activeUnits, 5);
    assert.equal(report.currentContext.adaptiveLevel, 2);
    assert.equal(report.scenarios.stationary.effectsMs.p50, 1.25);
    assert.equal(report.scenarios.stationary.gpuElapsedMs.p50, 4.2);
    assert.equal(d.resultReads() >= 1, true);
    assert.equal(d.deleted() >= 1, true);
  });
}

test('disjoint GPU samples are discarded instead of reported as valid timings', () => {
  const d = diagnostic('webgl2');
  d.sample();
  d.setDisjoint(true);
  const report = d.ctx.P0FrameDiag.report();
  assert.equal(report.gpuTimer.disjointDiscarded, 1);
  assert.equal(report.scenarios.stationary.gpuElapsedMs, null);
});

test('unsupported timer extensions remain optional and are reported as unavailable', () => {
  const d = diagnostic('unsupported');
  d.sample();
  const report = d.ctx.P0FrameDiag.report();
  assert.equal(report.gpuTimer.status, 'unsupported');
  assert.equal(report.scenarios.stationary.gpuElapsedMs, null);
});
