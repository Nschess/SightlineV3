'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

test('Outbreak spawn work is bounded per search and new-wave brutes are queued across ticks', () => {
  assert.deepEqual(_t.outbreakSpawnPolicy, { randomOffers: 24, losRays: 24, maxSpawnedPerTick: 1 });
  assert.equal(_t.OB.zs.size, 0);
  _t.startWave(3);
  assert.equal(_t.OB.spawned, 0, 'startWave schedules seed enemies instead of synchronously running multiple spawn scans');
  assert.equal(_t.OB.zs.size, 0, 'seed enemies are spawned by the bounded live tick path');
  assert.equal(_t.OB.spawnBurstRemaining, 1, 'the initial brute is queued for the next simulation tick');
  assert.equal(_t.OB.spawnBurstType, 'brute');
});

