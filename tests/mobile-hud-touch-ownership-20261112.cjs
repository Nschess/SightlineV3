'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const pages = [
  ['offline', 'AndroidProject/app/src/main/assets/www/index.html'],
  ['phone-host', 'AndroidProject/app/src/main/assets/phone-host/index.html']
].map(([name, rel]) => ({ name, rel, source: fs.readFileSync(path.join(root, rel), 'utf8') }));

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing ${signature}`);
  const open = source.indexOf('{', start);
  assert.notEqual(open, -1, `missing body for ${signature}`);
  let depth = 0, quote = '', escape = false, line = false, block = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i], n = source[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${signature}`);
}

function fakeElement(rect = { left: 0, top: 0, width: 0, height: 0 }) {
  const listeners = Object.create(null), classes = new Set(), props = Object.create(null);
  return {
    id: '', hidden: false, disabled: false, offsetWidth: rect.width || 0,
    dataset: {}, style: { props, setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; } },
    classList: { add(k) { classes.add(k); }, remove(k) { classes.delete(k); }, contains(k) { return classes.has(k); } },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatch(type, event) { for (const fn of listeners[type] || []) fn(event); },
    getBoundingClientRect() { return rect; },
    setPointerCapture() {}, querySelector() { return fakeElement(); },
    _listeners: listeners, _classes: classes
  };
}
function event(pointerId, extra = {}) {
  return Object.assign({ pointerId, pointerType: 'touch', button: 0, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }, extra);
}

for (const page of pages) {
  let fireStarts = 0;
  for (const path of ["tbtn('#tb-rel', function () { if (state === 'live') startReload(); });", "else if (reloading <= 0) scoped = !scoped;", "setWeapon(order[(order.indexOf(cur) + 1) % order.length]);", 'function pause() {', 'resetTouchMotion();', 'function resume() {', 'if (touchMode) enterTouchSession();']) assert.ok(page.source.includes(path), `${page.name}: existing reload/ADS/switch/pause/resume action path missing: ${path}`);
  const stageEls = new Map([
    ['#tz-move', fakeElement({ left: 0, top: 0, width: 300, height: 300 })],
    ['#tz-look', fakeElement({ left: 300, top: 0, width: 400, height: 300 })],
    ['#touch-joystick', fakeElement({ left: 0, top: 0, width: 100, height: 100 })]
  ]);
  const context = vm.createContext({
    $, Math, window: { PointerEvent: function PointerEvent() {} },
    stick: { id: null, x: 0, y: 0, ox: 0, oy: 0 }, lookTouch: { id: null, x: 0, y: 0 },
    joy: stageEls.get('#touch-joystick'), joyKnob: fakeElement(), state: 'live', MP: { on: false, menu: false },
    P: { alive: true, yaw: 0, pitch: 0 }, G: { touchSens: 100, touchAdsSens: 100 }, scoped: false, S: { invertY: false },
    touchButtonResets: [], touchFireOwners: new Set(), fireHeld: false,
    tryFire() { fireStarts++; }
  });
  function $(selector) { return stageEls.get(selector); }
  context.$ = $;
  const zoneStart = page.source.indexOf('function touchById(list, id)');
  const zoneEnd = page.source.indexOf('function tbtn(id, down, up, options)', zoneStart);
  assert.ok(zoneStart >= 0 && zoneEnd > zoneStart, `${page.name}: touch-zone source range missing`);
  vm.runInContext(page.source.slice(zoneStart, zoneEnd), context, { filename: page.rel + ':touch-zones' });

  const touch = (identifier, clientX, clientY) => ({ changedTouches: [{ identifier, clientX, clientY }], preventDefault() {} });
  stageEls.get('#tz-move').dispatch('touchstart', touch(11, 80, 100));
  stageEls.get('#tz-look').dispatch('touchstart', touch(22, 500, 100));
  assert.equal(context.stick.id, 11, `${page.name}: movement touch acquired`);
  assert.equal(context.lookTouch.id, 22, `${page.name}: look touch acquired independently`);
  const initialYaw = context.P.yaw, initialStickX = context.stick.x;
  stageEls.get('#tz-move').dispatch('touchmove', touch(22, 150, 100));
  stageEls.get('#tz-look').dispatch('touchmove', touch(11, 150, 100));
  assert.equal(context.stick.x, initialStickX, `${page.name}: unrelated finger cannot move joystick`);
  assert.equal(context.P.yaw, initialYaw, `${page.name}: unrelated finger cannot move camera`);
  stageEls.get('#tz-move').dispatch('touchmove', touch(11, 120, 100));
  stageEls.get('#tz-look').dispatch('touchmove', touch(22, 540, 120));
  assert.ok(context.stick.x > 0.5, `${page.name}: owning finger drives movement`);
  assert.notEqual(context.P.yaw, initialYaw, `${page.name}: owning finger drives camera aim`);
  stageEls.get('#tz-move').dispatch('touchend', touch(11, 120, 100));
  assert.equal(context.stick.id, null, `${page.name}: movement releases its own finger`);
  assert.equal(context.lookTouch.id, 22, `${page.name}: movement release does not cancel aim`);
  stageEls.get('#tz-look').dispatch('touchcancel', touch(11, 120, 100));
  assert.equal(context.lookTouch.id, 22, `${page.name}: unrelated cancel cannot release aim`);

  vm.runInContext(extractFunction(page.source, 'function touchFireDown(e)'), context, { filename: page.rel + ':touch-fire-down' });
  vm.runInContext(extractFunction(page.source, 'function touchFireUp(e)'), context, { filename: page.rel + ':touch-fire-up' });
  vm.runInContext(extractFunction(page.source, 'function resetTouchMotion()'), context, { filename: page.rel + ':reset-touch' });
  const fire = fakeElement(); fire.id = 'tb-fire'; stageEls.set('#tb-fire', fire);
  const objective = fakeElement(); objective.id = 'tb-objective'; stageEls.set('#tb-objective', objective);
  vm.runInContext(extractFunction(page.source, 'function tbtn(id, down, up, options)'), context, { filename: page.rel + ':tbtn' });
  context.tbtn('#tb-fire', context.touchFireDown, context.touchFireUp, { perPointer: true });
  stageEls.get('#tz-move').dispatch('touchstart', touch(12, 65, 120));
  assert.equal(context.stick.id, 12, `${page.name}: movement is active before firing begins`);
  assert.equal(context.lookTouch.id, 22, `${page.name}: camera aim is active before firing begins`);
  let objectiveStarted = 0, objectiveCanceled = 0, objectiveHeld = false;
  context.tbtn('#tb-objective', () => { objectiveStarted++; objectiveHeld = true; }, () => { objectiveCanceled++; objectiveHeld = false; });
  fire.dispatch('pointerdown', event(31)); fire.dispatch('pointerdown', event(32));
  assert.equal(context.touchFireOwners.size, 2, `${page.name}: both fire fingers are independently owned`);
  assert.equal(fireStarts, 1, `${page.name}: second fire finger does not trigger an extra shot`);
  assert.equal(context.stick.id, 12, `${page.name}: starting fire preserves movement ownership`);
  assert.equal(context.lookTouch.id, 22, `${page.name}: starting fire preserves aim ownership`);
  fire.dispatch('pointerup', event(31));
  assert.equal(context.touchFireOwners.size, 1, `${page.name}: releasing one fire finger preserves the other`);
  assert.equal(context.fireHeld, true, `${page.name}: fire remains held while one owner remains`);
  assert.equal(context.stick.id, 12, `${page.name}: releasing one fire finger preserves movement`);
  assert.equal(context.lookTouch.id, 22, `${page.name}: releasing one fire finger preserves aim`);
  assert.ok(fire._classes.has('pressed'), `${page.name}: fire pressed state remains while owned`);
  fire.dispatch('pointercancel', event(32));
  assert.equal(context.touchFireOwners.size, 0, `${page.name}: pointer cancellation releases fire`);
  assert.equal(context.fireHeld, false, `${page.name}: canceled fire cannot remain stuck`);
  assert.equal(context.stick.id, 12, `${page.name}: canceling fire preserves movement`);
  assert.equal(context.lookTouch.id, 22, `${page.name}: canceling fire preserves aim`);
  stageEls.get('#tz-move').dispatch('touchend', touch(12, 65, 120));
  assert.equal(context.stick.id, null, `${page.name}: movement finger can release independently after firing`);
  assert.equal(context.lookTouch.id, 22, `${page.name}: movement release preserves camera aim`);

  objective.dispatch('pointerdown', event(41)); objective.dispatch('pointerdown', event(42));
  assert.equal(objectiveStarted, 1, `${page.name}: multi-touch starts hold action once`);
  objective.dispatch('pointerup', event(41));
  assert.equal(objectiveCanceled, 0, `${page.name}: first finger release does not cancel shared hold action`);
  assert.equal(objectiveHeld, true);
  objective.dispatch('pointerup', event(42));
  assert.equal(objectiveCanceled, 1, `${page.name}: final finger release cancels hold action`);
  objective.dispatch('pointerdown', event(43));
  context.resetTouchMotion();
  assert.equal(objectiveHeld, false, `${page.name}: blur/reset releases held objective action`);
  assert.equal(objectiveCanceled, 2, `${page.name}: blur/reset dispatches exactly one action cancel`);
  assert.equal(context.lookTouch.id, null, `${page.name}: global reset clears look ownership`);
  assert.equal(context.stick.id, null, `${page.name}: global reset clears movement ownership`);
}

for (const page of pages) {
  const saved = { style: 'text', opacity: 88, fire2: false, hand: 'right', editing: true, positions: {} };
  let writes = 0;
  const pad = fakeElement({ left: 0, top: 0, width: 740, height: 360 });
  pad.dataset = {};
  pad.safe = { left: 24, right: 12, top: 8, bottom: 16 };
  const button = fakeElement({ left: 0, top: 0, width: 88, height: 88 }); button.id = 'tb-fire';
  pad.button = button;
  const posContext = vm.createContext({
    window: { getComputedStyle(el) { return { getPropertyValue(key) { return (el.safe[key.replace('--hud-safe-', '')] || 0) + 'px'; } }; } },
    document: { getElementById(id) { return id === 'touch' ? pad : null; } },
    mobileHud: saved, MOBILE_HUD_KEY: 'sightline.mobileHud.v1', MOBILE_HUD_BUTTON_IDS: ['tb-fire'], MOBILE_HUD_DEFAULT: { style: 'text', opacity: 88, fire2: false },
    localStorage: { getItem() { return JSON.stringify(saved); }, setItem() { writes++; } },
    saveMobileHud() { writes++; }, applyMobileHud() {}
  });
  vm.runInContext(extractFunction(page.source, 'function clampMobileHudPoint'), posContext);
  vm.runInContext(extractFunction(page.source, 'function applyHudPosition'), posContext);
  vm.runInContext(extractFunction(page.source, 'function initMobileHudPositionEditor'), posContext);
  vm.runInContext(extractFunction(page.source, 'function loadMobileHud'), posContext);
  posContext.mobileHud = saved;
  posContext.initMobileHudPositionEditor();
  const editorDown = event(77, { target: { closest() { return button; } } });
  pad.dispatch('pointerdown', editorDown);
  pad.dispatch('pointermove', event(77, { clientX: 1, clientY: 359 }));
  pad.dispatch('pointerup', event(77));
  assert.equal(writes, 1, `${page.name}: editor persists on release`);
  const persisted = saved.positions['tb-fire'];
  assert.ok(persisted.x * 740 >= 24 + 44 + 4 - 0.01, `${page.name}: edit respects left safe inset and control radius`);
  assert.ok(persisted.y * 360 <= 360 - 16 - 44 - 4 + 0.01, `${page.name}: edit respects bottom safe inset and control radius`);

  const restored = posContext.loadMobileHud();
  assert.ok(restored.positions && restored.positions['tb-fire'], `${page.name}: serialized editor layout reloads; saved=${JSON.stringify(saved)} restored=${JSON.stringify(restored)}`);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.positions['tb-fire'])), JSON.parse(JSON.stringify(persisted)), `${page.name}: saved position restores`);
  posContext.mobileHud = restored;
  for (const [width, height] of [[740, 360], [844, 390], [1280, 720]]) {
    pad.getBoundingClientRect = () => ({ left: 0, top: 0, width, height });
    posContext.applyHudPosition(button, 'tb-fire');
    const x = parseFloat(button.style.props['--hud-x']) / 100 * width;
    const y = parseFloat(button.style.props['--hud-y']) / 100 * height;
    assert.ok(x >= 24 + 44 + 4 - 0.1 && x <= width - 12 - 44 - 4 + 0.1, `${page.name} ${width}x${height}: resized x remains safe`);
    assert.ok(y >= 8 + 44 + 4 - 0.1 && y <= height - 16 - 44 - 4 + 0.1, `${page.name} ${width}x${height}: resized y remains safe`);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(restored.positions['tb-fire'])), JSON.parse(JSON.stringify(persisted)), `${page.name}: responsive clamp does not overwrite saved layout`);
  pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 740, height: 360 });
  const hiddenControl = fakeElement({ left: 0, top: 0, width: 0, height: 0 }); hiddenControl.id = 'tb-objective'; hiddenControl.offsetWidth = 0;
  restored.positions['tb-objective'] = { x: 0.06, y: 0.92 }; posContext.mobileHud = restored;
  posContext.applyHudPosition(hiddenControl, 'tb-objective');
  const hiddenX = parseFloat(hiddenControl.style.props['--hud-x']) / 100 * 740;
  const hiddenY = parseFloat(hiddenControl.style.props['--hud-y']) / 100 * 360;
  assert.ok(hiddenX >= 24 + 44 + 4 - 0.1, `${page.name}: hidden objective's stored position is clamped using safe conservative control size`);
  assert.ok(hiddenY <= 360 - 16 - 44 - 4 + 0.1, `${page.name}: hidden objective's stored position is clamped using safe conservative control size`);
  assert.ok(page.source.includes("window.addEventListener('resize',function(){if(mobileHudResizeFrame)return;"), `${page.name}: resize reapplies custom HUD positions`);
}

const rollbackManifest = path.join(root, 'rollback/mobile-hud-p1-prechange-20261112/SHA256SUMS.txt');
for (const line of fs.readFileSync(rollbackManifest, 'utf8').trim().split(/\r?\n/)) {
  const m = line.match(/^([a-f0-9]{64})\s+(.+)$/); assert.ok(m, `invalid P1 rollback row ${line}`);
  const file = path.join(path.dirname(rollbackManifest), m[2]);
  assert.ok(fs.existsSync(file), `P1 rollback file missing: ${m[2]}`);
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(actual, m[1], `P1 rollback integrity mismatch: ${m[2]}`);
}

  console.log(JSON.stringify({ status: 'PASS', tested: ['simultaneous movement/look/fire ownership with independent releases', 'two-finger fire ownership, single initial trigger and cancellation', 'aggregated hold-action release', 'global reset releases held actions', 'layout editor persistence and safe-area drag clamp', 'saved layout resize clamp without overwriting preference', 'P1 rollback inventory integrity'], pages: pages.map(p => p.name), viewports: ['740x360', '844x390', '1280x720'], rollbackFiles: fs.readFileSync(rollbackManifest, 'utf8').trim().split(/\r?\n/).length }, null, 2));
