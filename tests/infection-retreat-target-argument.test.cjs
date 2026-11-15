'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const Tactics = require('../AndroidProject/app/src/main/assets/phone-host/bot-tactics.js');

test('LAN Infection survivor retreat receives the observed infected target, not simulation time', () => {
  const { G, players, _t: A } = host;
  players.clear();
  G.mode = 'infection'; G.phase = 'live'; G.map = 'courtyard';
  const map = A.mapData();
  const bot = A.makeBot(0);
  bot.alive = true; bot.infected = false;
  bot.x = map.spawn.x; bot.y = 0; bot.z = map.spawn.z;
  bot.ai.tacticSeeded = true; bot.ai.scanT = 10; bot.ai.infectionRole = 'hunt';
  const target = { id: 9001, bot: true, alive: true, infected: true, team: 1, x: bot.x + 1.5, y: 0, z: bot.z, cr: 0, pr: 0 };
  players.set(target.id, target);
  bot.ai.tgt = target;

  const original = Tactics.retreat;
  let receivedThreat = null;
  Tactics.retreat = (nav, self, threat, occupied) => {
    receivedThreat = threat;
    return original(nav, self, threat, occupied);
  };
  try {
    A.botThink(bot, 0.05, 1000, map);
  } finally {
    Tactics.retreat = original;
    players.clear();
  }
  assert.equal(receivedThreat, target, 'retreat calculation uses the observed infected entity');
  assert.ok(Number.isFinite(bot.x) && Number.isFinite(bot.z), 'retreat handling keeps the bot position finite');
  assert.equal(A.botStats.invalidTargets, 0, 'the target scan did not encounter an invalid actor');
});
