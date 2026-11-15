const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets');
const pages = ['www/index.html', 'phone-host/index.html'].map(file =>
  fs.readFileSync(path.join(assets, file), 'utf8'));

function section(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);
  assert(start >= 0 && end > start, `missing source section ${startToken}`);
  return source.slice(start, end);
}

const common = [
  ['cosmetic failure reporter and confirmed-hit handler', 'var legendCosmeticFailures=', 'var legendKillVisualFailures='],
  ['pack effect builder', 'var legendPackFxFailures=', 'function legendaryPackElimination('],
  ['confirmed elimination handler', 'function legendConfirmedElimination(', 'function legendEliminationBurst('],
  ['weapon animation tick', 'function legendTick(', 'function legendBoltsTick('],
  ['weapon fire presentation', 'function legendFire(', 'var legendPackWarmPending=']
];
for (const [name, start, end] of common) {
  assert.equal(section(pages[0], start, end), section(pages[1], start, end), `${name} stays identical in Offline and phone-host`);
}

const hitBlock = section(pages[0], 'var legendCosmeticFailures=', 'var legendKillVisualFailures=');
const packBlock = section(pages[0], 'var legendPackFxFailures=', 'function legendaryPackElimination(');
const eliminationBlock = section(pages[0], 'function legendConfirmedElimination(', 'function legendEliminationBurst(');
const tickBlock = section(pages[0], 'function legendTick(', 'function legendBoltsTick(');
const fireBlock = section(pages[0], 'function legendFire(', 'var legendPackWarmPending=');

function context(extra = {}) {
  return vm.createContext({
    Object, String, Math, Number, console: { warn() {} },
    legendCosmeticFailures: Object.create(null), legendPackFxFailures: Object.create(null), legendPackFxs: Object.create(null),
    legendKillVisualFailures: Object.create(null), reportLegendCosmeticFailure() {},
    ...extra
  });
}

{
  let fireBuilds = 0;
  const sandbox = context({
    LEGENDARY_PACK_FX_KEYS: { rampart: 1 }, THREE: {}, scene: {},
    legendaryPackForAudio: () => ({ createFx() { fireBuilds++; throw new Error('injected renderer failure'); } })
  });
  vm.runInContext(packBlock, sandbox);
  assert.equal(sandbox.legendaryPackFx('rampart'), null, 'failed optional effect construction returns a safe null');
  assert.equal(sandbox.legendaryPackFx('rampart'), null, 'failed builder remains disabled for this session');
  assert.equal(fireBuilds, 1, 'a broken effect builder is not retried for every shot');
  console.log('PASS Legendary pack builder failure is contained and quarantined');
}

{
  let hitAudio = 0;
  const rig = { hit() { throw new Error('injected hit animation failure'); } };
  const sandbox = context({
    guns: { stinger: { userData: { legendRig: rig } } },
    selectedLegendaryFinish: () => ({ legendary: true }), legendActive: () => true,
    claimLegendEvent: () => true, legendaryEffectsEnabled: () => true,
    tmpLegendPos: { set() { return this; } }, spawnLegendFx() { throw new Error('injected hit effect failure'); },
    legendAudioEvent() { hitAudio++; }
  });
  vm.runInContext(hitBlock, sandbox);
  assert.doesNotThrow(() => sandbox.legendConfirmedHit('stinger', { x: 1, y: 0, z: 2 }, 'hit-1', false));
  assert.equal(hitAudio, 1, 'hit feedback audio still routes when the cosmetic rig fails');
  console.log('PASS confirmed-hit cosmetics cannot interrupt the caller or suppress hit audio');
}

{
  const sandbox = context({
    selectedLegendaryFinish: () => ({ legendary: true }), claimLegendEvent: () => true,
    guns: {}, legendaryEffectsReduced: () => true, legendaryEffectsEnabled: () => false,
    legendAudioEvent() { throw new Error('injected blocked audio context'); }, legendKillAudio() { throw new Error('injected audio failure'); }
  });
  vm.runInContext(hitBlock + eliminationBlock, sandbox);
  assert.doesNotThrow(() => sandbox.legendConfirmedElimination('rook117', { x: 0, y: 0, z: 0 }, 'kill-1', { legendary: true }, 0, false, .5));
  console.log('PASS confirmed-elimination audio failure cannot escape the cosmetic event handler');
}

{
  let animationUpdates = 0;
  const rig = { setDetail() {}, setReload() {}, update() { animationUpdates++; throw new Error('injected rig update failure'); } };
  const userData = { weaponKey: 'carbine', legendRig: rig };
  const sandbox = context({
    G: { fx: 'high', adaptive: false }, window: { matchMedia() { return { matches: false }; } }, perfLvl: 0,
    legendaryEffectsEnabled: () => true, legendActive: () => true, legendReloadAudioTick() {}
  });
  vm.runInContext(hitBlock + tickBlock, sandbox);
  assert.doesNotThrow(() => sandbox.legendTick({ userData }, .016, .4, false));
  assert.doesNotThrow(() => sandbox.legendTick({ userData }, .016, .4, false));
  assert.equal(animationUpdates, 1, 'a broken presentation rig is quarantined after one fault');
  console.log('PASS failed Legendary animation is quarantined without repeating exceptions each frame');
}

{
  const sandbox = context({
    LEGENDARY_PACK_FX_KEYS: { rampart: 1 }, THREE: {}, scene: {},
    G: { fx: 'high' }, adsT: 0, camera: { quaternion: {}, position: {} },
    legendaryEffectsEnabled: () => true, legendaryEffectsReduced: () => false,
    legendaryPackForAudio: () => ({ createFx() { throw new Error('injected effect construction failure'); } })
  });
  const rig = { fire() {} }, gun = { userData: { weaponKey: 'rampart', legendRig: rig } };
  vm.runInContext(hitBlock + packBlock + fireBlock, sandbox);
  assert.doesNotThrow(() => sandbox.legendFire(gun, { clone() { return {}; } }, {}, false));
  console.log('PASS fire presentation builder failure does not escape into weapon firing');
}

{
  let fireEffects = 0;
  const sandbox = context({
    LEGENDARY_PACK_FX_KEYS: { rampart: 1 }, THREE: {}, scene: {}, G: { fx: 'high' }, adsT: 0,
    camera: { quaternion: {}, position: {} }, legendaryEffectsEnabled: () => true,
    legendaryEffectsReduced: () => false,
    legendaryPackForAudio: () => ({ createFx() { return { setLow() {}, spawn() { fireEffects++; } }; } })
  });
  const gun = { userData: { weaponKey: 'rampart', legendRig: { fire() { throw new Error('injected recoil animation failure'); } } } };
  vm.runInContext(hitBlock + packBlock + fireBlock, sandbox);
  assert.doesNotThrow(() => sandbox.legendFire(gun, { clone() { return {}; } }, {}, false));
  assert.equal(fireEffects, 1, 'authored shot effect remains active when the viewmodel animation fails');
  console.log('PASS firing animation failure does not suppress the authored shot effect');
}
