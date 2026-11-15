const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets');
const html = fs.readFileSync(path.join(assets, 'www/index.html'), 'utf8');
const lan = fs.readFileSync(path.join(assets, 'phone-host/index.html'), 'utf8');
function sourceBlock(page, start, end) {
  const a = page.indexOf(start), b = page.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'missing mobile input block: ' + start);
  return page.slice(a, b);
}
for (const [name, start, end] of [
  ['pointer/touch button helper', 'function tbtn(id, down, up) {', 'function updateTouchActions()'],
  ['dual-fire ownership', 'function touchFireDown(e)', "tbtn('#tb-jump'"],
  ['touch cancellation cleanup', 'function resetTouchMotion()', 'function setStick(t)']
]) {
  assert.equal(sourceBlock(html, start, end), sourceBlock(lan, start, end), `Offline and phone-host ${name} must match`);
}
assert.equal((html.match(/id="tb-fire-alt"/g) || []).length, 1, 'there must be one second fire control');
assert.match(html, /aria-label="Fire weapon using left-side trigger"/, 'second trigger needs an explicit accessible name');
assert.match(html, /html\.touch-device #tb-fire-alt\s*\{[^}]*left:2%[^}]*top:32%/s, 'second trigger should occupy the opposite thumb side');
assert.match(html, /function touchFireDown\(e\)[\s\S]*?touchFireOwners\.add\(e\.pointerId\)/, 'fire pointer IDs must be tracked');
assert.match(html, /function touchFireUp\(e\)[\s\S]*?touchFireOwners\.delete\(e&&e\.pointerId\)[\s\S]*?fireHeld=touchFireOwners\.size>0/, 'releasing one trigger must retain fire if another remains held');

const start = html.indexOf('function tbtn(id, down, up) {');
const end = html.indexOf('function updateTouchActions()', start);
const touchHelper = html.slice(start, end);
assert.ok(start >= 0 && end > start, 'could not locate the production touch button helper');
const fireStart = html.indexOf('function touchFireDown(e)');
const fireEnd = html.indexOf("tbtn('#tb-jump'", fireStart);
const fireHandlers = html.slice(fireStart, fireEnd);
assert.ok(fireStart >= 0 && fireEnd > fireStart, 'could not locate the production dual-fire handlers');
const resetStart = html.indexOf('function resetTouchMotion()');
const resetEnd = html.indexOf('function setStick(t)', resetStart);
const resetFunction = html.slice(resetStart, resetEnd);
assert.ok(resetStart >= 0 && resetEnd > resetStart, 'could not locate production touch reset');

function button() {
  const listeners = Object.create(null), classes = new Set();
  return {
    listeners,
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    setPointerCapture() {},
    addEventListener(name, handler) { (listeners[name] ||= []).push(handler); }
  };
}
const buttons = { '#tb-fire': button(), '#tb-fire-alt': button() };
let shotStarts = 0;
const context = {
  window: { PointerEvent: function PointerEvent() {} },
  Set,
  touchButtonResets: [],
  touchFireOwners: new Set(),
  fireHeld: false,
  state: 'live',
  MP: { on: false, menu: false },
  stick: { id: 3, x: 1, y: 1 },
  lookTouch: { id: 4, x: 0, y: 0 },
  joy: { classList: { remove() {} } },
  joyKnob: { style: {} },
  $: selector => buttons[selector],
  tryFire() { shotStarts++; }
};
vm.createContext(context);
vm.runInContext(touchHelper + fireHandlers + resetFunction, context, { filename: 'actual-dual-fire-source.cjs' });

function emit(which, type, pointerId) {
  const list = buttons[which].listeners[type] || [];
  const event = { pointerId, pointerType: 'touch', button: 0, preventDefault() {}, stopPropagation() {} };
  for (const handler of list) handler(event);
}
emit('#tb-fire', 'pointerdown', 10);
assert.equal(context.fireHeld, true);
assert.equal(context.touchFireOwners.size, 1);
emit('#tb-fire-alt', 'pointerdown', 11);
assert.equal(context.fireHeld, true);
assert.equal(context.touchFireOwners.size, 2);
emit('#tb-fire', 'pointerup', 10);
assert.equal(context.fireHeld, true, 'releasing the first trigger must not stop the second');
assert.deepEqual(Array.from(context.touchFireOwners), [11]);
emit('#tb-fire-alt', 'pointercancel', 11);
assert.equal(context.fireHeld, false, 'canceling the remaining trigger must stop firing');
assert.equal(context.touchFireOwners.size, 0);
assert.equal(shotStarts, 2, 'both trigger presses must enter the existing primary-fire path');

emit('#tb-fire', 'pointerdown', 12);
context.resetTouchMotion();
assert.equal(buttons['#tb-fire'].classList.contains('pressed'), false, 'reset clears a stuck visual button state');
assert.equal(context.touchFireOwners.size, 0, 'reset can clear active pointer owners');
assert.equal(context.fireHeld, false, 'reset clears held fire');

console.log('PASS: production touch helper unit simulation covers two independent firing pointers, release, cancel, and reset.');
console.log('LIMIT: this uses a mocked button/event harness; it is not WebGL, browser, or touchscreen runtime acceptance.');
