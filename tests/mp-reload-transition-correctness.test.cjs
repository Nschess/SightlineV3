'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { G, players, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

function playerWithReload() {
  const p = _t.makeBot(0);
  p.alive = true; p.x = 0; p.y = 0; p.z = 0; p.ep = 1;
  p.creditT = Date.now(); p.lastIn = p.creditT; p.moveCredit = 0.6; p.verticalCredit = 0.35;
  p.hist = []; p.cur = 'pistol'; p.owned.add('smg');
  p.ammo.pistol = { mag: 3, res: 40 };
  p.ammo.smg = { mag: 20, res: 60 };
  p.rl = { w: 'pistol', at: Date.now() - 1 };
  return p;
}

test('expired reload settles before a movement-driven weapon switch; early switch still cancels', () => {
  const old = { mode: G.mode, phase: G.phase, map: G.map };
  const previousPlayers = [...players.entries()];
  try {
    players.clear(); G.mode = 'versus'; G.phase = 'live'; G.map = 'courtyard';
    const p = playerWithReload();
    _t.onMessage(p, JSON.stringify({ t: 'in', ep: p.ep, x: p.x, y: p.y, z: p.z, yaw: 0, pitch: 0, w: 'smg' }));
    assert.equal(p.cur, 'smg');
    assert.equal(p.rl, null);
    assert.equal(p.ammo.pistol.mag, _t.W.pistol.mag, 'completed reload is applied before the old reload state is cleared');
    assert.equal(p.ammo.pistol.res, 40 - (_t.W.pistol.mag - 3), 'reserve is decremented exactly once');

    const early = playerWithReload(); early.rl.at = Date.now() + 1000;
    _t.onMessage(early, JSON.stringify({ t: 'in', ep: early.ep, x: early.x, y: early.y, z: early.z, yaw: 0, pitch: 0, w: 'smg' }));
    assert.equal(early.cur, 'smg');
    assert.equal(early.rl, null, 'switching before completion keeps the existing cancellable-reload behavior');
    assert.equal(early.ammo.pistol.mag, 3, 'early-cancelled reload does not grant rounds');
    assert.equal(early.ammo.pistol.res, 40, 'early-cancelled reload does not spend reserve rounds');
  } finally {
    players.clear(); for (const [id, p] of previousPlayers) players.set(id, p);
    G.mode = old.mode; G.phase = old.phase; G.map = old.map;
  }
});

test('expired reload settles before firing a different weapon', () => {
  const old = { mode: G.mode, phase: G.phase, map: G.map };
  const previousPlayers = [...players.entries()];
  try {
    players.clear(); G.mode = 'versus'; G.phase = 'live'; G.map = 'courtyard';
    const p = playerWithReload();
    p.nextShot = 0; p.lastShot = 0;
    _t.onShot(p, { w: 'smg', d: [[0, 0, -1]] });
    assert.equal(p.cur, 'smg');
    assert.equal(p.rl, null);
    assert.equal(p.ammo.pistol.mag, _t.W.pistol.mag, 'the previous magazine receives completed rounds before switching');
    assert.equal(p.ammo.pistol.res, 40 - (_t.W.pistol.mag - 3));
    assert.equal(p.ammo.smg.mag, 20, 'the weapon-switch delay still prevents firing on the switching trigger');
    p.nextShot = 0;
    _t.onShot(p, { w: 'smg', d: [[0, 0, -1]] });
    assert.equal(p.ammo.smg.mag, 19, 'the selected weapon still fires exactly one round');
  } finally {
    players.clear(); for (const [id, p] of previousPlayers) players.set(id, p);
    G.mode = old.mode; G.phase = old.phase; G.map = old.map;
  }
});

test('switching weapons while dead does not complete a pending reload', () => {
  const old = { mode: G.mode, phase: G.phase, map: G.map };
  const previousPlayers = [...players.entries()];
  try {
    players.clear(); G.mode = 'versus'; G.phase = 'live'; G.map = 'courtyard';
    const p = playerWithReload(); p.alive = false;
    _t.onMessage(p, JSON.stringify({ t: 'in', ep: p.ep, x: p.x, y: p.y, z: p.z, yaw: 0, pitch: 0, w: 'smg' }));
    assert.equal(p.cur, 'smg', 'weapon selection retains its existing dead-state behavior');
    assert.equal(p.rl, null, 'the pending reload is still cleared on switch');
    assert.equal(p.ammo.pistol.mag, 3, 'dead input cannot grant reload ammunition');
    assert.equal(p.ammo.pistol.res, 40, 'dead input cannot consume reserve ammunition');
  } finally {
    players.clear(); for (const [id, p] of previousPlayers) players.set(id, p);
    G.mode = old.mode; G.phase = old.phase; G.map = old.map;
  }
});

test('respawn clears interrupted reload and rejects combat actions from the previous life epoch', () => {
  const old = { mode: G.mode, phase: G.phase, map: G.map, phaseEnd: G.phaseEnd, kills: G.kills, score: G.score.slice() };
  const previousPlayers = [...players.entries()], previousRespawns = [..._t.DM.respawns.entries()];
  try {
    players.clear(); _t.DM.respawns.clear();
    G.mode = 'deathmatch'; G.phase = 'live'; G.map = 'courtyard';
    G.phaseEnd = Date.now() + 60000; G.kills = 99; G.score = [0, 0];
    const victim = playerWithReload(); victim.team = 0; victim.rl = { w: 'pistol', at: Date.now() + 30000 };
    const attacker = _t.makeBot(1); Object.assign(attacker, { alive: true, hp: 100, armor: 0, x: 3, y: 0, z: 0 });
    const deadEpoch = victim.ep;

    _t.damage(attacker, victim, 200, false, 'pistol');
    assert.equal(victim.alive, false, 'lethal damage interrupts the in-progress reload by ending the life');
    assert.equal(victim.rl.w, 'pistol', 'death does not prematurely settle an unfinished reload');
    assert.equal(_t.deathmatchRespawn(victim), true, 'the normal deathmatch spawn path restores the player');
    assert.equal(victim.ep, deadEpoch + 1, 'respawn creates a new life epoch');
    assert.equal(victim.rl, null, 'spawn refill clears the interrupted reload state');
    assert.deepEqual(victim.ammo.pistol, { mag: _t.W.pistol.mag, res: _t.W.pistol.reserve }, 'respawn grants only the normal fresh-loadout ammunition');

    victim.ammo.smg = { mag: 4, res: 60 };
    const before = { cur: victim.cur, rl: victim.rl, mag: victim.ammo.smg.mag, res: victim.ammo.smg.res };
    _t.onMessage(victim, JSON.stringify({ t: 'rl', ep: deadEpoch, w: 'smg' }));
    _t.onMessage(victim, JSON.stringify({ t: 'shot', ep: deadEpoch, w: 'smg', d: [[0, 0, -1]] }));
    assert.equal(victim.cur, before.cur, 'stale fire cannot switch the weapon after respawn');
    assert.equal(victim.rl, before.rl, 'stale reload cannot start a new reload after respawn');
    assert.equal(victim.ammo.smg.mag, before.mag, 'stale fire cannot consume a round');
    assert.equal(victim.ammo.smg.res, before.res, 'stale reload cannot consume reserve ammunition');

    _t.onMessage(victim, JSON.stringify({ t: 'rl', ep: victim.ep, w: 'smg' }));
    assert.equal(victim.cur, 'smg', 'current-epoch reload actions remain usable');
    assert.equal(victim.rl.w, 'smg');
    victim.rl = null; victim.nextShot = 0; victim.lastShot = 0;
    _t.onMessage(victim, JSON.stringify({ t: 'shot', ep: victim.ep, w: 'smg', d: [[0, 0, -1]] }));
    assert.equal(victim.ammo.smg.mag, before.mag - 1, 'current-epoch fire still spends exactly one round');
  } finally {
    players.clear(); for (const [id, player] of previousPlayers) players.set(id, player);
    _t.DM.respawns.clear(); for (const [id, due] of previousRespawns) _t.DM.respawns.set(id, due);
    Object.assign(G, old);
  }
});
