'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const assets = path.join(__dirname, '../AndroidProject/app/src/main/assets');
const pages = ['www', 'phone-host'].map(tree =>
  readFileSync(path.join(assets, tree, 'index.html'), 'utf8').replace(/\r\n/g, '\n'));

function section(page, begin, end) {
  const start = page.indexOf(begin);
  const stop = page.indexOf(end, start);
  assert.ok(start >= 0 && stop > start, begin);
  return page.slice(start, stop);
}

test('Opening the live store releases all mobile inputs and preserves PC input behavior', () => {
  for (const page of pages) {
    let storeOpens = 0, heldReleaseCalls = 0;
    const context = vm.createContext({
      touchMode: true, state: 'live', P: { alive: true }, jumpQ: true, fireHeld: true,
      stick: { id: 1, x: 1, y: 1 }, lookTouch: { id: 2 },
      joy: { classList: { remove() {} } }, joyKnob: { style: {} },
      touchFireOwners: new Set([3, 4]), touchButtonResets: [() => heldReleaseCalls++],
      canBuyNow: () => true, storeNote() {}, renderBuy() {},
      showOverlay(id) { assert.equal(id, '#ov-buy'); storeOpens++; }
    });
    vm.runInContext(section(page, 'function resetTouchMotion()', 'function setStick('), context);
    vm.runInContext(section(page, 'function openStore()', 'function toggleStore()'), context);
    context.openStore();
    assert.equal(storeOpens, 1);
    assert.equal(heldReleaseCalls, 1);
    assert.equal(context.stick.id, null);
    assert.equal(context.lookTouch.id, null);
    assert.equal(context.touchFireOwners.size, 0);
    assert.equal(context.fireHeld, false);
    assert.equal(context.jumpQ, false);
    context.touchMode = false;
    context.fireHeld = true;
    context.openStore();
    assert.equal(storeOpens, 2);
    assert.equal(heldReleaseCalls, 1);
    assert.equal(context.fireHeld, true);
  }
});

test('HUD editing keeps the first drag owner and saves once when that pointer releases', () => {
  for (const page of pages) {
    const listeners = new Map(), positions = {}, captures = [];
    let saves = 0;
    const pad = {
      dataset: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 568, height: 320 }),
      addEventListener: (name, fn) => listeners.set(name, fn)
    };
    const context = vm.createContext({
      document: { getElementById: () => pad }, mobileHud: { editing: true, positions },
      clampMobileHudPoint: (_, __, x, y) => ({ x, y }), applyHudPosition() {}, saveMobileHud: () => saves++
    });
    vm.runInContext(section(page, 'function initMobileHudPositionEditor()', 'initMobileHudPositionEditor();'), context);
    context.initMobileHudPositionEditor();
    const event = (pointerId, action) => ({
      pointerId, clientX: 284, clientY: 160, preventDefault() {}, stopImmediatePropagation() {},
      target: { closest: () => ({ id: action, setPointerCapture: id => captures.push(id) }) }
    });
    listeners.get('pointerdown')(event(11, 'tb-fire'));
    listeners.get('pointerdown')(event(12, 'tb-aim'));
    listeners.get('pointermove')(event(12));
    listeners.get('pointerup')(event(12));
    assert.equal(saves, 0);
    listeners.get('pointermove')(event(11));
    listeners.get('pointerup')(event(11));
    assert.deepEqual(captures, [11]);
    assert.deepEqual(positions, { 'tb-fire': { x: .5, y: .5 } });
    assert.equal(saves, 1);
  }
});
