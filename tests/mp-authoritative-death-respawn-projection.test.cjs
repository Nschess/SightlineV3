'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

function decodeFrame(buf) {
  assert.equal(buf[0] & 0x0f, 1, 'host emits a WebSocket text frame');
  const code = buf[1] & 0x7f, offset = code < 126 ? 2 : code === 126 ? 4 : 10;
  return JSON.parse(buf.subarray(offset).toString('utf8'));
}

test('authoritative kill, death projection, and deathmatch respawn synchronize in host snapshots', () => {
  const { G, players, _t } = Host;
  const oldGame = { mode: G.mode, map: G.map, phase: G.phase, phaseEnd: G.phaseEnd, kills: G.kills, score: G.score };
  const oldPlayers = [...players.entries()], oldRespawns = [..._t.DM.respawns.entries()];
  const connections = [];
  const conn = () => {
    const c = { closed: false, backlog: 0, frames: [], messages: [],
      text(s) { this.messages.push(JSON.parse(s)); },
      sendFrame(frame) { this.frames.push(Buffer.from(frame)); return true; } };
    connections.push(c); return c;
  };
  try {
    players.clear(); _t.DM.respawns.clear();
    G.mode = 'deathmatch'; G.map = 'courtyard'; G.phase = 'live'; G.phaseEnd = Date.now() + 60000;
    G.kills = 99; G.score = [0, 0];
    const attacker = _t.addPlayer(conn(), 'projection-attacker');
    const victim = _t.addPlayer(conn(), 'projection-victim');
    const concurrentAttacker = _t.addPlayer(conn(), 'projection-concurrent-attacker');
    Object.assign(attacker, { team: 0, alive: true, hp: 100, armor: 0, x: 0, y: 0, z: 0 });
    Object.assign(victim, { team: 1, alive: true, hp: 100, armor: 0, x: 2, y: 0, z: 0 });
    Object.assign(concurrentAttacker, { team: 0, alive: true, hp: 100, armor: 0, x: 1, y: 0, z: 0 });

    _t.damage(attacker, victim, 125, true, 'pistol');
    _t.damage(concurrentAttacker, victim, 125, false, 'smg');
    assert.equal(victim.alive, false);
    assert.equal(victim.hp, 0);
    assert.equal(attacker.k, 1);
    assert.equal(victim.d, 1, 'two same-tick lethal candidates count one death');
    assert.equal(concurrentAttacker.k, 0, 'the second event cannot claim an already-resolved kill');
    assert.equal(connections[2].messages.some(m => m.t === 'hit' && m.v === victim.id), false, 'the duplicate event emits no hit confirmation');
    assert.ok(connections[0].messages.some(m => m.t === 'hit' && m.k === 1 && m.v === victim.id), 'confirmed kill is attributed to attacker');
    assert.ok(connections.every(c => c.frames.some(f => decodeFrame(f).t === 'kill')), 'kill event reaches connected peers');

    _t.tickBody();
    const deathSnapshot = connections[0].frames.map(decodeFrame).findLast(m => m.t === 's');
    const deadRow = deathSnapshot.a.find(row => row[0] === victim.id);
    assert.equal(deadRow[9], 0, 'authoritative death appears in snapshot projection');
    assert.equal(deathSnapshot.n, 1);

    const previousEpoch = victim.ep;
    assert.equal(_t.deathmatchRespawn(victim), true, 'normal server respawn chooser finds a safe spawn');
    assert.equal(victim.alive, true);
    assert.equal(victim.hp, 100);
    assert.equal(victim.ep, previousEpoch + 1, 'respawn advances the movement epoch to reject stale inputs');
    _t.tickBody();
    const respawnSnapshot = connections[0].frames.map(decodeFrame).findLast(m => m.t === 's');
    const aliveRow = respawnSnapshot.a.find(row => row[0] === victim.id);
    assert.equal(aliveRow[9], 1, 'respawn appears in the next authoritative snapshot');
    assert.equal(respawnSnapshot.n, 2, 'snapshot sequence continues monotonically through death/respawn');
    assert.ok(connections[1].messages.some(m => m.t === 'dm-respawn'), 'respawning client receives the authoritative respawn event');
  } finally {
    players.clear(); for (const [id, player] of oldPlayers) players.set(id, player);
    _t.DM.respawns.clear(); for (const [id, due] of oldRespawns) _t.DM.respawns.set(id, due);
    Object.assign(G, oldGame);
  }
});
