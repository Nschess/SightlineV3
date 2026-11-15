'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { G, players, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const { OB } = _t;

test('LAN Outbreak creates the selected survivor squad within the reserved horde budget', () => {
  const lobbyHtml = fs.readFileSync(path.join(__dirname, '../AndroidProject/app/src/main/assets/phone-host/index.html'), 'utf8');
  assert.match(lobbyHtml, /L\.mode === 'outbreak' \? 56 : 64/, 'the multiplayer Outbreak squad control must expose the corrected 56-bot maximum');
  G.phase = 'lobby'; G.mode = 'versus'; G.map = 'courtyard';
  const conn = { closed: false, backlog: 0, text() {}, sendFrame() {} };
  const player = _t.addPlayer(conn, 'OutbreakRosterQA');
  assert.equal(player.host, true, 'the first LAN player owns the lobby');
  // The UI sends mode and count as two ordered lobby changes, not one packet.
  _t.onMessage(player, JSON.stringify({ t: 'cfg', mode: 'outbreak' }));
  assert.equal(G.mode, 'outbreak');
  _t.onMessage(player, JSON.stringify({ t: 'cfg', bots: { mode: 'add', coop: 14 } }));
  assert.equal(_t.BOTCFG.coop, 14, 'the lobby configuration message must retain the selected 14 bots');
  const lobbyBots = [...players.values()].filter(p => p.bot);
  assert.equal(lobbyBots.length, 14, 'the lobby must add the requested 14 squad bots');
  assert.deepEqual([0, 1].map(team => lobbyBots.filter(p => p.team === team).length), [7, 7], 'Blue and Red remain visual identities inside the allied survivor squad');
  _t.onMessage(player, JSON.stringify({ t: 'start' }));
  const aliveBots = [...players.values()].filter(p => p.bot && p.alive);
  assert.equal(aliveBots.length, 14, 'the selected survivor bots must remain present after the actual lobby start message');
  _t.goLive(); _t.outbreakTick(0.5);
  assert.ok(OB.zs.size > 0, 'the first active wave spawns Hollowed');
  assert.ok(aliveBots.length + OB.zs.size <= 64, 'living survivor bots plus active Hollowed stay within the AI cap');
  const survivors = [player, ...aliveBots];
  const distances = [...OB.zs.values()].map(z => Math.min(...survivors.map(p => Math.hypot(p.x-z.x,p.z-z.z))));
  assert.ok(distances.every(d => d <= 50), 'wave spawn points stay near enough to create active pressure');
  const before = new Map([...OB.zs.values()].map(z => [z.id, { x: z.x, z: z.z }]));
  // stepZombies reads Date.now() for perception/path deadlines even though
  // this regression advances simulation dt directly. Advance the wall clock
  // alongside simulated time so route and sensing timers receive the same
  // 50 ms cadence they get from the live server tick.
  const wallNow = Date.now;
  let simulatedNow = wallNow();
  try {
    Date.now = () => simulatedNow;
    for (let i = 0; i < 100; i++) {
      simulatedNow += 50;
      _t.stepZombies(0.05);
    }
  } finally {
    Date.now = wallNow;
  }
  const tracked = [...OB.zs.values()].filter(z => before.has(z.id));
  const moved = tracked.filter(z => Math.hypot(z.x-before.get(z.id).x,z.z-before.get(z.id).z) > 0.35);
  assert.ok(tracked.length > 0, 'the sampled LAN horde remains alive during pursuit');
  assert.ok(moved.length >= Math.ceil(tracked.length / 2), 'most sampled LAN Hollowed should advance toward survivors rather than stay parked: ' + moved.length + '/' + tracked.length);

  _t.backToLobby();
  _t.onMessage(player, JSON.stringify({ t: 'cfg', bots: { coop: 64 } }));
  const cappedBots = [...players.values()].filter(p => p.bot);
  assert.equal(cappedBots.length, 56, 'a 64-bot request is limited to 56 to keep at least eight horde slots');
  assert.deepEqual([0, 1].map(team => cappedBots.filter(p => p.team === team).length), [28, 28], 'the capped survivor roster preserves both color identities');
  _t.onMessage(player, JSON.stringify({ t: 'start' }));
  assert.equal([...players.values()].filter(p => p.bot && p.alive).length, 56, 'all 56 effective squad bots survive the match-start transition');
});
