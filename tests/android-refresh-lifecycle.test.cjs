'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assetRoot = path.join(__dirname, '../AndroidProject/app/src/main/assets');
const html = fs.readFileSync(path.join(assetRoot, 'www/index.html'), 'utf8');
const host = fs.readFileSync(path.join(assetRoot, 'phone-host/index.html'), 'utf8');
function section(source, begin, end) {
  const start = source.indexOf(begin), stop = source.indexOf(end,start + 1);
  assert.ok(start >= 0 && stop > start,begin);
  return source.slice(start,stop).replace(/\r\n/g,'\n');
}

test('resume discards stale cadence and re-arms the render scheduler', () => {
  const anchor = html.indexOf("document.addEventListener('visibilitychange', function() {", html.indexOf('function performanceInfo()'));
  assert.ok(anchor > 0, 'performance lifecycle listener exists');
  const end = html.indexOf('\n});', anchor);
  const snippet = html.slice(anchor, end + 4);
  const ctx = { androidRefreshHint: true, rafLast: 500, rafCount: 96, rafIndex: 22, rafHz: 120, rafHzBest: 120, rafReportT: 990,
    renderNextDue: 1000, renderCap: 120, last: 500, resetCount: 0,
    performance: { now: () => 5000 }, resetFpsWindow() { ctx.resetCount++; },
    document: { addEventListener(type, fn) { assert.equal(type, 'visibilitychange'); ctx.listener = fn; } } };
  vm.runInNewContext(snippet, ctx);
  ctx.listener();
  assert.equal(ctx.androidRefreshHint,null);
  for (const key of ['rafLast','rafCount','rafIndex','rafHz','rafHzBest','rafReportT','renderNextDue']) assert.equal(ctx[key], 0, key);
  assert.equal(ctx.renderCap, -1); assert.equal(ctx.last, 5000); assert.equal(ctx.resetCount, 1);
});

test('render cap remains paced when the display callback cadence drops from 120 to 60', () => {
  const start = html.indexOf('function effectiveRenderCap(');
  const end = html.indexOf('\nfunction resetFpsWindow()', start);
  assert.ok(start > 0 && end > start);
  const ctx = { Math, Number };
  vm.runInNewContext(html.slice(start, end), ctx);
  const cap = ctx.effectiveRenderCap(30, 60, 96);
  let rendered = 0;
  for (let i = 0; i < 180; i++) if (ctx.renderCapAllows(1000 + i * 1000 / 60, cap)) rendered++;
  assert.ok(rendered >= 89 && rendered <= 91, `expected 30 FPS over three seconds, got ${rendered}`);
});

test('Competitive uses one mobile pixel budget and reacts to sustained missed 120 Hz frames', () => {
  const policy = section(html,'function framePixelBudget()','function fail(msg)');
  assert.equal(policy,section(host,'function framePixelBudget()','function fail(msg)'));
  const scheduler = section(html,'function frameBudgetMs(', 'function resetFpsWindow()');
  const adaptive = section(html,'var perfEma = 16.7','/* Offline AI is decoupled');
  const ctx = { G:{ mobileQuality:'competitive', renderScale:100, adaptive:true, fpsCap:120 },
    window:{devicePixelRatio:2.75}, stage:{clientWidth:667,clientHeight:375},
    touchMode:true, perfLvl:0, T:10, rafHzBest:60, resize(){}, applyShadowBudget(){} };
  vm.runInNewContext(policy+scheduler+adaptive,ctx);
  const initial = ctx.pixelRatio();
  assert.equal(ctx.framePixelBudget(),850000);
  assert.ok(Math.abs(initial ** 2 * 667 * 375 - 850000) < 0.01);
  ctx.rafHzBest = 120;
  assert.equal(ctx.pixelRatio(),initial);
  function run(seconds, hz) {
    for (let i=0; i<seconds*hz; i++) {
      ctx.T += 1/hz;
      ctx.perfTick(1000/hz);
    }
  }
  run(5,120);
  assert.equal(ctx.perfLvl,0);
  run(5,90);
  assert.equal(ctx.perfLvl,2);
  run(5,90);
  assert.equal(ctx.perfLvl,3);
  assert.equal(ctx.pixelRatio(),initial*.87);
  run(5,120);
  assert.equal(ctx.perfLvl,3,'short recovery must not cause a resolution rebound');
  run(12,120);
  assert.ok(ctx.perfLvl < 3,'sustained headroom restores quality');
  for (const hz of [60,90,120,144]) {
    ctx.renderNextDue=0; ctx.renderCap=-1;
    let count=0;
    for(let i=0;i<hz*2;i++) {
      const now=1000+i*1000/hz+Math.sin(i)*.42;
      if(ctx.renderCapAllows(now,ctx.effectiveRenderCap(120,hz,96))) count++;
    }
    assert.ok(Math.abs(count/2-Math.min(hz,120))<=1,'scheduler at '+hz+' callback Hz gave '+count/2);
  }
});

function androidFixture(cap = 120, mobileQuality = 'competitive') {
  const begin='var androidRefreshBridge', end='function frameBudgetMs(';
  const hint=section(html,begin,end);
  assert.equal(hint,section(host,begin,end));
  const messages=[], events={};
  const bridge={postMessage(command){messages.push(command);}};
  const ctx={G:{fpsCap:cap, mobileQuality, adaptive:true},gameContextLost:false,document:{hidden:false},
    window:{SightlineDisplay:bridge, addEventListener(name,listener){events[name]=listener;}},
    resetFpsWindow(){}, resize(){}};
  vm.createContext(ctx);
  vm.runInContext(hint,ctx);
  function report(activeHz, supportedHz, options={}) {
    bridge.onmessage({data:JSON.stringify({activeHz,modeHz:activeHz,supportedHz,batterySaver:false,hintHz:0,...options})});
  }
  return {ctx,messages,events,report};
}
test('Competitive follows native 60, 90 and 120 Hz and leaves higher panel modes capped', () => {
  for (const [hz,target] of [[60,60],[90,90],[120,120],[144,120]]) {
    const {ctx,report,messages}=androidFixture();
    ctx.updateAndroidRefreshHint(true);
    assert.deepEqual(messages,['auto']);
    report(hz,[60,hz]);
    assert.equal(ctx.syncAndroidGameTarget(100),60);
    ctx.updateAndroidRefreshHint(true);
    ctx.updateAndroidRefreshHint(true);
    assert.deepEqual(messages,['auto',String(target)]);
    assert.equal(ctx.syncAndroidGameTarget(2000),target);
  }
});

test('refresh decrease and battery saver are immediate, increases need stability, and resume re-probes', () => {
  const {ctx,report,messages,events}=androidFixture();
  report(90,[60,90,120]);
  ctx.syncAndroidGameTarget(0);
  assert.equal(ctx.syncAndroidGameTarget(1800),90);
  report(120,[60,90,120],{activeHz:90});
  assert.equal(ctx.syncAndroidGameTarget(2000),90,'effective rate can be lower than the panel mode');
  report(60,[60,90,120],{batterySaver:true});
  assert.equal(ctx.syncAndroidGameTarget(2100),60);
  ctx.updateAndroidRefreshHint(true);
  assert.deepEqual(messages,['auto']);
  report(120,[60,90,120]);
  assert.equal(ctx.syncAndroidGameTarget(2200),60);
  report(90,[60,90,120]);
  assert.equal(ctx.syncAndroidGameTarget(2700),60);
  assert.equal(ctx.syncAndroidGameTarget(4500),90);
  ctx.updateAndroidRefreshHint(true);
  ctx.updateAndroidRefreshHint(false);
  events['sightline-display-resume']();
  assert.equal(ctx.syncAndroidGameTarget(4550),60);
  ctx.updateAndroidRefreshHint(true);
  assert.deepEqual(messages,['auto','120','auto','auto']);
});

test('Auto profiles differ and sustained overload lowers the cap only at the graphics floor', () => {
  const balanced=androidFixture(0,'balanced'), high=androidFixture(0,'high');
  for (const instance of [balanced,high]) {
    instance.report(120,[60,90,120]);
    instance.ctx.syncAndroidGameTarget(0);
  }
  assert.equal(balanced.ctx.syncAndroidGameTarget(1800),90);
  assert.equal(high.ctx.syncAndroidGameTarget(1800),60);
  const {ctx,report}=androidFixture();
  report(90,[60,90]);
  ctx.syncAndroidGameTarget(0);
  assert.equal(ctx.syncAndroidGameTarget(1800),90);
  ctx.touchMode=true; ctx.T=10; ctx.perfLvl=0; ctx.applyShadowBudget=()=>{};
  vm.runInContext(section(html,'var perfEma = 16.7','/* Offline AI is decoupled'),ctx);
  for (let i=0;i<3*60;i++) ctx.perfTick(1000/60);
  assert.ok(ctx.perfLvl>=1);
  assert.equal(ctx.androidAdaptiveLimit,0);
  for (let i=0;i<14*60;i++) ctx.perfTick(1000/60);
  assert.equal(ctx.perfLvl,3);
  assert.equal(ctx.androidAdaptiveLimit,45);
  assert.equal(ctx.syncAndroidGameTarget(20000),45);
  report(60,[60,90]);
  assert.equal(ctx.syncAndroidGameTarget(20100),30,'fall back to an even divisor when Android changes display cadence');
  report(90,[60,90]);
  assert.equal(ctx.syncAndroidGameTarget(20200),30);
  assert.equal(ctx.syncAndroidGameTarget(23000),45);
});
