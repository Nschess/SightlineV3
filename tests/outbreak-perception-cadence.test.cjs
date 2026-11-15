'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MAPS, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const Hunt = require('../AndroidProject/app/src/main/assets/phone-host/zombie-hunt.js');

test('phone-host Outbreak perception matches Offline scan bounds with deterministic roster staggering', () => {
  for (const count of [16, 32, 56]) {
    const intervals = Array.from({ length: count }, (_, i) => _t.zombiePerceptionInterval(i + 1));
    assert.ok(intervals.every(value => value >= 0.24 && value < 0.35), `all ${count} zombies remain inside Offline's 240–350 ms range`);
    assert.ok(new Set(intervals).size >= Math.min(count, 16), `the ${count}-zombie roster is not synchronized into a few scan cohorts`);
    const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    assert.ok(mean >= 0.29 && mean <= 0.30, `mean cadence stays near the Offline midpoint (${mean})`);
  }
});

test('authoritative zombie perception rearms its timer from the shared offline-compatible cadence', () => {
  const zombie = { id: 23, hunt: Hunt.create(23), tt: 0, senseDt: 0.02, tgt: null, x: 0, y: 0, z: 0, yaw: 0 };
  const expected = _t.zombiePerceptionInterval(zombie.id);
  assert.equal(_t.zombiePerceive(zombie, [], MAPS.courtyard, 1000), null);
  assert.equal(zombie.tt, expected);
  assert.ok(zombie.tt >= 0.24 && zombie.tt < 0.35);
});
