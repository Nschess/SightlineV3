'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const trees = ['www', 'phone-host'];
const pages = trees.map(tree => fs.readFileSync(path.join(__dirname,
  '../AndroidProject/app/src/main/assets', tree, 'index.html'), 'utf8').replace(/\r\n/g, '\n'));
function section(page, begin, end) {
  const start = page.indexOf(begin), stop = page.indexOf(end, start);
  assert.ok(start >= 0 && stop > start, begin);
  return page.slice(start, stop);
}
function setupContext(page, storage, nativeDisplay) {
  const context = vm.createContext({
    window: { SightlineDisplay: nativeDisplay }, touchMode: true,
    androidRefreshBridge: nativeDisplay, androidDisplay: null, androidPowerCap: 120,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    slLegacyMenuAmbience: () => true,
    resetFpsWindow() {}, applyG() {}, renderNextDue: 0, renderCap: 0
  });
  for (const [start, end] of [
    ['function loadObj(', '/* ---------- match rules ---------- */'],
    ['var MOBILE_HUD_KEY', 'var mobileHud=loadMobileHud()'],
    ['var DEF_G =', '/* P11.5.9'],
    ['var QUALITY =', 'function qualityNow()'],
    ['var MOBILE_SETUP_KEY', 'function mobileSettingsHtml(']
  ]) vm.runInContext(section(page, start, end), context);
  vm.runInContext(`var mobileHud = loadMobileHud();
    function saveMobileHud() { saveObj(MOBILE_HUD_KEY, mobileHud); }
    function importedSettingValid(_, key, value) {
      return typeof DEF_G[key] === typeof value;
    }`, context);
  return context;
}

test('preview and cancel leave storage untouched, and profiles use the existing native FPS policy', () => {
  for (const page of pages) {
    const storage = new Map(), context = setupContext(page, storage, {});
    context.mobileSetupDraft = 'competitive';
    assert.match(context.mobileSetupHtml(), /Up to 60 FPS until the display is detected/);
    context.androidDisplay = { maxHz: 90 };
    assert.match(context.mobileSetupHtml(), /Up to 90 FPS/);
    context.androidDisplay.batterySaver = true;
    assert.match(context.mobileSetupHtml(), /Up to 60 FPS/);
    context.mobileSetupDraft = '';
    assert.equal(storage.size, 0);
    assert.equal(context.G.mobileFov, 75);
    assert.equal(context.applyMobileSetup('constructor', true), false);
    assert.equal(context.applyMobileSetup('beginner', false), true);
    assert.equal(context.G.mobileFov, 72);
    assert.equal(context.G.touchSize, 105);
    assert.equal(context.G.fpsCap, 60);
    assert.equal(context.applyMobileSetup('competitive', false), true);
    assert.equal(context.G.fpsCap, 0);
    assert.equal(context.G.touchSize, 100);
    assert.equal(context.G.adaptive, true);
    const browser = setupContext(page, new Map(), undefined);
    assert.equal(browser.applyMobileSetup('competitive', false), true);
    assert.equal(browser.G.fpsCap, 60);
  }
});

test('custom HUD is kept by default, and opt-in replacement can be undone after reopening', () => {
  for (const page of pages) {
    const hud = { style: 'tactical', hand: 'left', opacity: 75, fire2: true, positions: {'tb-fire': {x: .2, y: .7}} };
    const storage = new Map([
      ['sightline.mobileHud.v1', JSON.stringify(hud)],
      ['sightline.settings.v1', JSON.stringify({touchSize: 110, mobileFov: 85, master: 35})]
    ]);
    let context = setupContext(page, storage, {});
    assert.equal(context.applyMobileSetup('immersive', false), true);
    assert.equal(context.G.mobileQuality, 'high');
    assert.equal(context.G.touchSize, 110);
    assert.deepEqual(JSON.parse(storage.get('sightline.mobileHud.v1')), {...hud, editing: false});
    assert.equal(context.restoreMobileSetup(), true);
    assert.equal(context.G.mobileFov, 85);
    assert.equal(context.applyMobileSetup('beginner', true), true);
    assert.equal(context.G.touchSize, 105);
    assert.equal(context.mobileHud.hand, 'left');
    assert.equal(Object.keys(context.mobileHud.positions).length, 0);
    context = setupContext(page, storage, {});
    assert.equal(context.G.mobileFov, 72);
    assert.equal(context.restoreMobileSetup(), true);
    assert.equal(context.G.mobileFov, 85);
    assert.equal(context.G.touchSize, 110);
    assert.equal(context.G.master, 35);
    assert.deepEqual(JSON.parse(storage.get('sightline.mobileHud.v1')), {...hud, editing: false});
    assert.equal(context.restoreMobileSetup(), false);
  }
});

function aimContext(page) {
  const match = {}, bot = { alive: true, x: -.3, z: -10, y: 0, op: {h: 1}, g: {visible: true, parent: {}} };
  const context = vm.createContext({
    touchMode: true, M: match, MP: { on: false, sock: null, id: 0 },
    P: {x: 0, z: 0, yaw: 0, pitch: 0, punch: 0, alive: true},
    state: 'live', document: {hidden: false}, whiteT: 0, scoped: true, reloading: 0,
    WEAPONS: {pistol: {}}, cur: 'pistol', G: {offlineAim: 'training'}, T: 1,
    camera: {fov: 39}, scene: {fog: {far: 50}}, mates: [], bots: [bot], smokes: [],
    losClear: () => true, smokeBlocks: () => false, soloInfectionPlayer: () => false
  });
  vm.runInContext(section(page, 'var offlineAimMatch =', 'function startMatch()'), context);
  context.offlineAimMatch = match;
  context.mobileAimUntil = 1.1;
  return {context, bot};
}

test('offline assistance is bounded, separates swipe assistance from training lock and cannot fire', () => {
  for (const page of pages) {
    const {context, bot} = aimContext(page);
    assert.equal(context.P.yaw, 0);
    context.updateMobileAim(.016, 1.22);
    assert.equal(context.mobileAimTarget, bot);
    assert.ok(context.P.yaw > 0 && context.P.yaw <= .38 * .016);
    context.T = 1.2;
    const oldYaw = context.P.yaw;
    context.updateMobileAim(.016, 1.22);
    assert.ok(context.P.yaw > oldYaw);
    context.P.yaw = .4;
    context.updateMobileAim(.016, 1.22);
    assert.equal(context.P.yaw, .4);
    assert.equal(context.mobileAimTarget, null);
    for (const aim of ['standard', 'strong']) {
      const {context: swipe, bot: enemy} = aimContext(page);
      swipe.G.offlineAim = aim;
      swipe.updateMobileAim(.016, 1.22);
      assert.equal(swipe.mobileAimTarget, enemy);
      swipe.T = 1.2;
      swipe.updateMobileAim(.016, 1.22);
      assert.equal(swipe.mobileAimTarget, null);
    }
  }
});

test('cover, smoke, hidden actors, allies and network transitions release or prevent assistance', () => {
  for (const page of pages) {
    for (const block of [
      c => { c.MP.on = true; },
      c => { c.MP.sock = {}; },
      c => { c.MP.id = 17; },
      c => { c.MP.retryT = 1; },
      c => { c.M = {}; },
      c => { c.touchMode = false; },
      c => { c.scoped = false; },
      c => { c.whiteT = .5; },
      c => { c.G.offlineAim = 'off'; },
      c => { c.losClear = () => false; },
      c => { c.smokes = [{}]; c.smokeBlocks = () => true; },
      (_, enemy) => { enemy.g.visible = false; },
      (_, enemy) => { enemy.mp = true; },
      (_, enemy) => { enemy.rise = .3; },
      c => { c.soloInfectionPlayer = () => true; }
    ]) {
      const {context, bot} = aimContext(page);
      context.updateMobileAim(.016, 1.22);
      assert.equal(context.mobileAimTarget, bot);
      block(context, bot);
      const yaw = context.P.yaw;
      context.updateMobileAim(.016, 1.22);
      assert.equal(context.mobileAimTarget, null);
      assert.equal(context.P.yaw, yaw);
    }
    assert.match(section(page, 'function mpBegin(m)', '  if (MP.on) mpCleanup();'), /blockMobileAimForLan\(\);/);
  }
});

test('all profiles persist only intended settings and can be restored after a fresh load', () => {
  const previous = {mobileFov: 83, touchSens: 120, touchAdsSens: 75, mobileQuality: 'low',
    renderScale: 85, fpsCap: 30, adaptive: false, touchSize: 110, offlineAim: 'training'};
  for (const page of pages) {
    for (const [id, fov, look, ads, quality, scale, fps] of [
      ['beginner', 72, 85, 60, 'balanced', 90, 60],
      ['competitive', 80, 110, 70, 'competitive', 100, 0],
      ['immersive', 76, 95, 65, 'high', 100, 60]
    ]) {
      const storage = new Map([['sightline.settings.v1', JSON.stringify(previous)]]);
      assert.equal(setupContext(page, storage, {}).applyMobileSetup(id, false, ['graphics', 'controls', 'sensitivity']), true);
      const restarted = setupContext(page, storage, {});
      const g = restarted.G;
      assert.deepEqual([g.mobileFov, g.touchSens, g.touchAdsSens, g.mobileQuality, g.renderScale,
        g.fpsCap, g.adaptive, g.touchSize, g.offlineAim], [fov, look, ads, quality, scale, fps, true, 110, 'training']);
      assert.equal(restarted.restoreMobileSetup(), true);
      const restored = setupContext(page, storage, {}).G;
      for (const [key, value] of Object.entries(previous)) assert.equal(restored[key], value, id + '/' + key);
    }
  }
});

test('customized categories start unchecked and selected categories undo independently', () => {
  for (const page of pages) {
    const storage = new Map([['sightline.settings.v1', JSON.stringify({master: 30, offlineAim: 'training', touchAdsMode: 'hold'})]]);
    const app = setupContext(page, storage, {});
    assert.deepEqual(Array.from(app.mobileSetupDefaultSelection(app.MOBILE_SETUP_PROFILES.beginner)), ['graphics', 'sensitivity']);
    assert.equal(app.applyMobileSetup('beginner', false, []), false);
    assert.equal(app.applyMobileSetup('beginner', true, ['audio', 'gameplay']), true);
    const restarted = setupContext(page, storage, {});
    assert.equal(restarted.G.master, 55);
    assert.equal(restarted.G.musicVol, 45);
    assert.equal(restarted.G.offlineAim, 'standard');
    assert.equal(restarted.G.touchAdsMode, 'hold');
    assert.equal(restarted.G.mobileFov, 75);
    assert.equal(restarted.restoreMobileSetup(), true);
    assert.equal(restarted.G.master, 30);
    assert.equal(restarted.G.offlineAim, 'training');
  }
});

test('a queued reconnect revokes an active offline lock and saved Training cannot rearm it', () => {
  for (const page of pages) {
    const {context, bot} = aimContext(page);
    let retry;
    Object.assign(context, {
      clearTimeout() {}, setTimeout(cb) { retry = cb; return 1; },
      mpRefreshPanel() {}, mpConnect() { context.MP.sock = {}; }
    });
    vm.runInContext(section(page, 'function mpRetry(n)', 'setInterval('), context);
    context.updateMobileAim(.016, 1.22);
    assert.equal(context.mobileAimTarget, bot);
    context.mpRetry(0);
    assert.equal(context.mobileAimTarget, null);
    assert.equal(context.offlineAimMatch, null);
    assert.equal(context.MP.retryT, 1);
    assert.equal(context.mobileAimPolicy(), null);
    retry();
    assert.equal(context.MP.retryT, 0);
    assert.equal(context.mobileAimPolicy(), null);
    context.MP.sock = null;
    assert.equal(context.G.offlineAim, 'training');
    assert.equal(context.mobileAimPolicy(), null);
  }
});
