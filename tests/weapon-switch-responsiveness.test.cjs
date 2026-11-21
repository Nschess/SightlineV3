'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pages = [
  ['Offline', 'AndroidProject/app/src/main/assets/www/index.html'],
  ['phone-host', 'AndroidProject/app/src/main/assets/phone-host/index.html']
];

for (const [label, relative] of pages) {
  test(`${label} weapon switch keeps the local fire lock at 250 ms`, () => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const match = source.match(/function setWeapon\(k\)\s*\{[\s\S]*?\n\}/);
    assert.ok(match, `${label} production setWeapon function is present`);

    const context = {
      T: 12, nextFire: 0, cur: 'pistol', lastCur: 'pistol', reloading: 0,
      scoped: false, zoomLvl: 0, drawT: 0, autoReloadSwitchToken: 0,
      owned: { pistol: true, carbine: true }, state: 'live', P: { alive: true },
      guns: { pistol: { visible: true }, carbine: { visible: false } },
      mel: { t: 0, hit: true },
      legendCancelInspect() {}, gunFor() {}, cancelLongbowCycle() {},
      legendActive() { return false; }, legendCue() {}, updateHud() {}
    };
    vm.runInNewContext(`${match[0]}\nsetWeapon('carbine'); this.lock = nextFire - T;`, context);
    assert.equal(context.cur, 'carbine', 'the selected weapon still changes immediately');
    assert.equal(context.lock, 0.25, 'the shorter delay is 100 ms faster than the previous 350 ms lock');
    assert.equal(context.guns.carbine.visible, true, 'the selected viewmodel remains active during the lock');
  });
}
