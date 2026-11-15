const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const pages = [
  path.join(root, 'AndroidProject/app/src/main/assets/www/index.html'),
  path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html'),
];

function functionSource(source, name) {
  const marker = `function ${name}()`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} exists`);
  const open = source.indexOf('{', start + marker.length);
  assert.notEqual(open, -1, `${name} has a body`);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed ${name} body`);
}

function runPointerLockChange({ locked, menuOpen, state, expectedUnlock = false, mpMenu = false, finishOpen = false }) {
  const canvas = {};
  let exits = 0;
  let pauses = 0;
  let context;
  const document = {
    pointerLockElement: locked ? canvas : null,
    exitPointerLock() { exits++; this.pointerLockElement = null; },
  };
  context = {
    canvas,
    document,
    finishPicker: { hidden: !finishOpen },
    state,
    MP: { menu: mpMenu, clicks: 7 },
    pointerUnlockExpected: expectedUnlock,
    freeLook: false,
    touchMode: false,
    menuOpen: () => menuOpen,
    pause() { pauses++; },
  };
  vm.runInNewContext(`${functionSource(pageText, 'exitLock')}; ${functionSource(pageText, 'handlePointerLockChange')}; handlePointerLockChange();`, context);
  return { context, exits, pauses };
}

const pageText = fs.readFileSync(pages[0], 'utf8');

test('late pointer-lock grants are released whenever a menu owns the screen', () => {
  const result = runPointerLockChange({ locked: true, menuOpen: true, state: 'idle' });
  assert.equal(result.exits, 1);
  assert.equal(result.pauses, 0);
  assert.equal(result.context.document.pointerLockElement, null);
  assert.equal(result.context.pointerUnlockExpected, true);
});

test('an expected programmatic unlock cannot immediately re-pause a resumed match', () => {
  const result = runPointerLockChange({ locked: false, menuOpen: false, state: 'live', expectedUnlock: true });
  assert.equal(result.pauses, 0);
  assert.equal(result.context.pointerUnlockExpected, false);
});

test('an unexpected gameplay pointer unlock still opens pause', () => {
  const result = runPointerLockChange({ locked: false, menuOpen: false, state: 'live' });
  assert.equal(result.pauses, 1);
});

test('a normal gameplay lock grant remains active and resets LAN click tracking', () => {
  const result = runPointerLockChange({ locked: true, menuOpen: false, state: 'live' });
  assert.equal(result.exits, 0);
  assert.equal(result.pauses, 0);
  assert.equal(result.context.freeLook, false);
  assert.equal(result.context.MP.clicks, 0);
});

test('Offline and phone-host pages use the same pointer-lock recovery handler', () => {
  const offlineHandler = functionSource(pageText, 'handlePointerLockChange');
  const phoneText = fs.readFileSync(pages[1], 'utf8');
  const phoneHandler = functionSource(phoneText, 'handlePointerLockChange');
  assert.equal(phoneHandler, offlineHandler);
  for (const source of [pageText, phoneText]) {
    assert.match(source, /pointerUnlockExpected = true; document\.exitPointerLock\(\)/);
    assert.match(source, /document\.addEventListener\('pointerlockchange', handlePointerLockChange\)/);
  }
});
