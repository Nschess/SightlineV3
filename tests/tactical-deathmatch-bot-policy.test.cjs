const assert = require('node:assert/strict');
const { G, players, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const tactics = require('../AndroidProject/app/src/main/assets/phone-host/bot-tactics.js');

const originalMode = G.mode;
try {
  G.mode = 'versus';
  const tactical = _t.botModePolicy();
  G.mode = 'deathmatch';
  const deathmatch = _t.botModePolicy();

  assert.equal(tactical.id, 'tactical');
  assert.equal(tactical.patrolPhase, 'advance');
  assert.equal(tactical.highGround, true);
  assert.equal(tactical.shareIntel, true);
  assert.equal(tactical.flank, true);
  assert.equal(tactical.approachExtra, 5);

  assert.equal(deathmatch.id, 'deathmatch');
  assert.equal(deathmatch.patrolPhase, 'hunt');
  assert.equal(deathmatch.highGround, false);
  assert.equal(deathmatch.shareIntel, false);
  assert.equal(deathmatch.flank, false);
  assert.equal(deathmatch.waypointBase, 5);
  assert.ok(deathmatch.approachExtra < tactical.approachExtra);
  assert.ok(deathmatch.pursuitScale > tactical.pursuitScale);

  const tiers = ['recruit', 'regular', 'veteran', 'elite'].map(k => _t.SKILL[k]);
  for (let i = 0; i < tiers.length; i++) {
    assert.equal(tiers[i].dmg, 1, 'difficulty must not add weapon damage');
    if (!i) continue;
    assert.ok(tiers[i].react < tiers[i - 1].react, 'higher tier reacts sooner');
    assert.ok(tiers[i].err < tiers[i - 1].err, 'higher tier has tighter but bounded aim');
    assert.ok(tiers[i].head > tiers[i - 1].head, 'higher tier has a higher but bounded headshot chance');
    assert.ok(tiers[i].turn > tiers[i - 1].turn, 'higher tier turns faster');
  }
  assert.ok(tiers.at(-1).head <= 0.2, 'Elite headshot probability remains capped');
  const laneHolders = Array.from({ length: 32 }, (_, slot) => slot).filter(slot => tactics.holdsPost(slot, 18));
  assert.equal(laneHolders.length, 8, 'one quarter of tactical slots retain a separate lane post');
  assert.ok(laneHolders.every(slot => slot % 4 === 2));
  assert.equal(tactics.holdsPost(2, 5), false, 'close engagements use normal combat behavior');
  assert.equal(tactics.holdsPost(2, 36), false, 'long-range engagements use normal combat behavior');
  assert.equal(tactics.holdsPost(1, 18, true), true, 'player-guard bots hold their assigned protective post');
  console.log('PASS Tactical/Deathmatch behavior separation, four-tier skill balance, and lane-holder distribution');
} finally {
  G.mode = originalMode;
  players.clear();
}
