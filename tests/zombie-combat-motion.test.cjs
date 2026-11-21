'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Hunt = require('../AndroidProject/app/src/main/assets/phone-host/zombie-hunt.js');
const { G, players, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

test('combat orbit gives deterministic lateral motion around an idle target', () => {
  const a = Hunt.attackStrafe(9, 0, 0, 0, 2, 100);
  const b = Hunt.attackStrafe(9, 0, 0, 0, 2, 1200);
  assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-9, 'combat direction is normalized');
  assert.ok(Math.abs(a[0] * 0 + a[1] * 2) < 1e-9, 'combat motion is tangential, not directly toward the target');
  assert.deepEqual(b, [-a[0], -a[1]], 'combat direction changes on a bounded cadence');
  assert.deepEqual(Hunt.attackStrafe(1, 0, 0, 0, 0, 0), [0, 0], 'coincident positions remain finite');
});

test('authoritative LAN Hollowed keep moving while attacking a stationary survivor', () => {
  const realNow = Date.now;
  let simulationTime = 1700000000000;
  Date.now = () => simulationTime;
  try {
    players.clear();
    G.mode = 'outbreak'; G.map = 'courtyard'; G.phase = 'live';
    const survivor = { id: 9001, bot: false, team: 0, alive: true, x: 0, y: 0, z: 36, hp: 100, armor: 0, c: null, hist: [] };
    players.set(survivor.id, survivor);
    _t.obReset(); _t.OB.phase = 'fight';
    const z = _t.makeZ(1.45, 36, 'walker', 1);
    z.rise = 0; z.atkT = 1000; z.tt = 10; z.tgt = survivor;
    Hunt.seen(z.hunt, survivor, simulationTime);
    let previous = { x: z.x, z: z.z }, travelled = 0;
    for (let i = 0; i < 50; i++) {
      simulationTime += 20;
      _t.stepZombies(0.02);
      travelled += Math.hypot(z.x - previous.x, z.z - previous.z);
      previous = { x: z.x, z: z.z };
    }
    assert.equal(z.hunt.state, 'attack', 'the Hollowed remains in its attack state');
    assert.ok(travelled > 0.2, 'server-side enemy travels while the target remains idle');
    assert.equal(survivor.x, 0); assert.equal(survivor.z, 36, 'the test target remained stationary');
  } finally {
    Date.now = realNow;
    players.clear(); _t.obReset(); G.phase = 'lobby'; G.mode = 'versus';
  }
});

test('LAN Outbreak survivor bots use role-diverse primary weapons when the starting budget allows them', () => {
  players.clear(); G.mode = 'outbreak'; G.phase = 'buy';
  const loadouts=[];
  for(let i=0;i<8;i++){
    const b=_t.makeBot(0); b.alive=true; b.money=9000; _t.botBuy(b); loadouts.push(b.cur);
  }
  assert.ok(loadouts.every(k=>k!=='pistol'), 'affordable primaries replace the sidearm for the outbreak squad');
  assert.ok(new Set(loadouts).size>=4, 'squad role preferences produce a diverse set of weapon classes');
  players.clear(); G.phase='lobby'; G.mode='versus';
});

test('offline Infection and Outbreak apply the same combat-motion helper in actual game code', () => {
  const html = fs.readFileSync(path.join(__dirname, '../AndroidProject/app/src/main/assets/www/index.html'), 'utf8');
  const attackBlocks = (html.match(/SightlineZombieHunt\.attackStrafe\(/g) || []).length;
  assert.ok(attackBlocks >= 4, 'offline Outbreak and Infection melee/ranged attack states use the shared motion helper');
  assert.match(html, /spd=\(u\.infectionRole==='hide'\?\.18:\.30\)\*pace/, 'offline Infection survivors do not use near-zero post-contact shuffle speed');
  assert.match(html, /spd = u\.burst > 0 \? 0\.72 \* pace : 1\.[67] \* pace/g, 'offline gun bots retain movement while firing instead of freezing for each burst');
});

test.after(() => { players.clear(); _t.obReset(); G.phase = 'lobby'; G.mode = 'versus'; });
