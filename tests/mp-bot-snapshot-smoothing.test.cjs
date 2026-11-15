'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { players, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

test('large-lobby bot snapshots smooth staggered AI steps without moving authority state', () => {
  players.clear();
  for (let id = 1; id <= 32; id++) players.set(id, { id });
  const bot = { id: 100, bot: true, x: 10, y: 0, z: 20, ai: { renderVx: 4, renderVz: -2, renderAt: 100, nextThinkAt: 150 } };
  const predicted = _t.botSnapshotPosition(bot, 130);
  assert.deepEqual(predicted, { x: 10.12, z: 19.94 }, 'snapshot projects 30 ms of the known bot velocity');
  assert.deepEqual({ x: bot.x, z: bot.z }, { x: 10, z: 20 }, 'authoritative server coordinates remain unchanged');
  assert.deepEqual(_t.botSnapshotPosition(bot, 200), { x: 10.4, z: 19.8 }, 'projection remains exact through the 100 ms full-speed window');
});

test('small-lobby bot projection uses the shared 50 ms think interval; humans remain unprojected', () => {
  players.clear();
  for (let id = 1; id <= 15; id++) players.set(id, { id });
  const movingBot = { bot: true, x: 10, y: 0, z: 20, ai: { renderVx: 4, renderVz: -2, renderAt: 100, nextThinkAt: 150 } };
  const human = { bot: false, x: 10, y: 0, z: 20, ai: { renderVx: 4, renderVz: -2, renderAt: 100, nextThinkAt: 150 } };
  assert.deepEqual(_t.botSnapshotPosition(movingBot, 110), { x: 10.04, z: 19.98 }, 'small-lobby projection uses cached bot velocity before its next 50 ms decision');
  assert.deepEqual(_t.botSnapshotPosition(movingBot, 200), { x: 10.4, z: 19.8 }, 'prediction remains full speed through 100 ms');
  assert.deepEqual(_t.botSnapshotPosition(human, 130), { x: 10, z: 20 });
});

test('overdue bots keep a short visual velocity projection while a capped AI batch catches up', () => {
  const delayed = { bot: true, x: 10, y: 0, z: 20, ai: { renderVx: 4, renderVz: -2, renderAt: 50, nextThinkAt: 100 } };
  assert.deepEqual(_t.botSnapshotPosition(delayed, 130), { x: 10.32, z: 19.84 }, 'overdue decision does not collapse the visual prediction to zero');
  assert.deepEqual(_t.botSnapshotPosition(delayed, 250), { x: 10.5, z: 19.75 }, 'velocity eases to rest over the 50 ms tail instead of freezing at 100 ms');
  assert.deepEqual(_t.botSnapshotPosition(delayed, 300), { x: 10.5, z: 19.75 }, 'cosmetic projection remains bounded after the fade');
  assert.deepEqual({ x: delayed.x, z: delayed.z }, { x: 10, z: 20 }, 'visual prediction never mutates authoritative position');
});

test('overdue bot snapshot projection eases continuously through the deferral window', () => {
  const delayed = { bot:true, x:0, y:0, z:0, ai:{renderVx:100,renderVz:0,renderAt:100} };
  const at100=_t.botSnapshotPosition(delayed,200).x;
  const at125=_t.botSnapshotPosition(delayed,225).x;
  const at150=_t.botSnapshotPosition(delayed,250).x;
  assert.ok(at100<at125&&at125<at150,'position continues forward while stale velocity smoothly decays');
  assert.ok(Math.abs(at125-11.88)<1e-8,'linear velocity fade integrates to the expected rounded position');
  assert.ok(Math.abs(at150-12.5)<1e-8,'projection reaches its bounded endpoint with zero velocity');
});

test('64-bot motion projection spans the 110 ms AI cadence plus host-tick quantization', () => {
  const bot={bot:true,x:.4,y:0,z:.2,yaw:-3.083185307179586,pitch:.2,ai:{}};
  _t.recordBotRenderMotion(bot.ai,bot,0,0,3.1,0,.1,1000,110,1110);
  assert.equal(bot.ai.renderFullMs,140,'the 110 ms decision deadline rounds to 120 ms service time and includes one bounded host-tick grace');
  const atNextDecision=_t.botSnapshotPosition(bot,1120);
  assert.ok(Math.abs(atNextDecision.x-.8)<1e-8,'projected position meets the next 120 ms server service point without a rewind');
  assert.ok(Math.abs(atNextDecision.z-.4)<1e-8,'both movement axes use wall-clock decision span');
  const angles=_t.botSnapshotAngles(bot,1020);
  assert.equal(angles.yaw,-3.07,'shortest-path yaw advances across the wrap boundary at the snapshot precision');
  assert.equal(angles.pitch,.23,'pitch advances between AI decisions at the snapshot precision');
  assert.deepEqual({x:bot.x,z:bot.z,yaw:bot.yaw,pitch:bot.pitch},{x:.4,z:.2,yaw:-3.083185307179586,pitch:.2},'snapshot projection never mutates authoritative pose');
  const human={bot:false,x:0,y:0,z:0,yaw:.4,pitch:.1,ai:bot.ai};
  assert.deepEqual(_t.botSnapshotAngles(human,1020),{yaw:.4,pitch:.1},'human player angles are never cosmetically predicted');
});

test.after(() => { players.clear(); });
