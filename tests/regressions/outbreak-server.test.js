'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { G, players, _t } = require('../../AndroidProject/app/src/main/assets/phone-host/server.js');

test('authoritative Outbreak zombies acquire visible targets using the new hunt state', async () => {
  G.mode = 'outbreak';
  G.phase = 'live';
  G.map = 'courtyard';
  const conn = { closed: false, backlog: 0, text() {}, sendFrame() {} };
  const player = _t.addPlayer(conn, 'OutbreakTest');
  player.team = 0; player.alive = true; player.hp = 100; player.armor = 0;
  player.x = 0; player.y = 0; player.z = 35; player.cr = 0; player.pr = 0;

  const map = _t.mapData();
  _t.buildNav(map);
  const zombie = _t.makeZ(0, 26, 'walker', 1);
  zombie.rise = 0; zombie.yaw = Math.PI; zombie.tt = -1;
  const originalHp = zombie.hp, initialDistance = Math.hypot(player.x - zombie.x, player.z - zombie.z);
  // Route work is bounded by a wall-clock budget and failed searches use a
  // wall-clock retry cooldown. Advance this synthetic 50 ms simulation at a
  // matching real cadence so a temporary budget yield can retry as it would
  // in the live host instead of freezing Date.now() across all 12 steps.
  for (let i = 0; i < 12; i++) {
    _t.stepZombies(0.05);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  assert.equal(zombie.hunt.state, 'chase');
  assert.deepEqual(zombie.hunt.seen && { x: zombie.hunt.seen.x, z: zombie.hunt.seen.z }, { x: player.x, z: player.z });
  assert.ok(zombie.route && zombie.route.length > 0, 'server must build a cached navigation route');
  assert.ok(Math.hypot(player.x - zombie.x, player.z - zombie.z) < initialDistance - 0.05, 'zombie must advance toward its visible target');
  assert.equal(zombie.hp, originalHp, 'perception does not change combat balance');
  assert.equal(players.get(player.id), player);
});
