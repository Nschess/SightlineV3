const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets');
const pages = ['www', 'phone-host'].map(client => fs.readFileSync(path.join(assets, client, 'index.html'), 'utf8'));
assert.ok(pages[0] === pages[1], 'offline and LAN client input code must match');
const source = pages[0];

for (const id of ['fire', 'aim', 'rel', 'swap', 'jump', 'slide', 'more', 'prone', 'buy', 'nade', 'nsel']) {
  assert.ok(source.includes("tbtn('#tb-" + id + "'"), 'touch action is not wired: ' + id);
}
assert.ok((source.match(/id="tb-fire-alt"/g) || []).length === 1, 'the mirrored left-side firing trigger must exist once');
assert.ok(source.includes("tbtn('#tb-fire-alt', touchFireDown, touchFireUp)"), 'the second firing trigger must share the standard fire action');
assert.ok(source.includes("fireHeld = true; tryFire(true)"), 'touch fire must use the regular firing path');
assert.ok(source.includes('touchFireOwners.add(e.pointerId)') && source.includes('touchFireOwners.delete(e&&e.pointerId)'), 'both fire triggers must track independent active pointer IDs');
assert.ok(source.includes('fireHeld=touchFireOwners.size>0'), 'releasing one trigger must preserve fire while another remains held');
assert.ok(source.includes("if (state === 'live') startReload()"), 'touch reload must use the regular reload path');
assert.ok(/tbtn\('#tb-aim',[\s\S]{0,320}scoped = !scoped/.test(source), 'touch aim must use regular ADS state');
assert.ok(/tbtn\('#tb-swap',[\s\S]{0,240}setWeapon\(order\[/.test(source), 'touch weapon switch must use the regular weapon path');
assert.ok(/b\.addEventListener\('pointerup', finish\)[\s\S]{0,100}b\.addEventListener\('pointercancel', finish\)/.test(source), 'pointer release/cancel must clear held button state');
assert.ok(/b\.addEventListener\('touchend', finishTouch[\s\S]{0,120}b\.addEventListener\('touchcancel', finishTouch/.test(source), 'fallback touch release/cancel must clear held button state');
assert.ok(/tzm\.addEventListener\('touchstart'/.test(source), 'movement joystick touch zone is missing');
assert.ok(/tzl\.addEventListener\('touchstart'/.test(source), 'look touch zone is missing');
assert.ok(/window\.addEventListener\('blur', resetTouchMotion\)/.test(source), 'focus loss must clear held movement/fire');
assert.ok(/document\.addEventListener\('visibilitychange', function \(\) \{ if \(document\.hidden\) resetTouchMotion\(\); \}\)/.test(source), 'backgrounding must clear held movement/fire');
assert.ok(/function setTouchTray\(open\)[\s\S]{0,260}tray-open/.test(source), 'utility controls must be reachable through the touch action tray');
console.log('PASS: offline/LAN touch source parity, dual fire-trigger wiring, movement/look zones, fire/ADS/reload/swap routes, cancel handling, and utility tray');
console.log('NOTE: source wiring only; no touchscreen device or browser interaction was available. The second trigger mirrors primary fire; it is not a weapon alternate-fire mode.');
