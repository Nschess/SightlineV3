#!/usr/bin/env node
// Focused behavioral audit of the host's real botScan function. It creates ten
// nearer but occluded enemies plus one visible enemy just beyond the scan cap.
// The first scan retains the original nearest-ten behavior; the next scan's
// rotating probe must acquire the visible opponent. This is not live gameplay.
'use strict';
const host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const { G, players, _t: A } = host;
players.clear();
G.mode = 'deathmatch';
const bot = A.makeBot(0);
bot.alive = true; bot.x = 0; bot.y = 0; bot.z = 0; bot.yaw = 0; bot.ai.alert = 0;
const addFoe = (id, x, z) => ({ id, bot: false, alive: true, team: 1, x, y: 0, z, cr: 0, pr: 0 });
const hidden = Array.from({ length: 10 }, (_, i) => addFoe(10 + i, (i - 4.5) * 0.25, -10));
const visible = addFoe(99, 7, -10);
const roster = [bot, ...hidden, visible];
const map = { boxes: [[-3, 3, -6, -5, 4, 0]] };
// Control: prove the same target is in the bot's scan cone and unobstructed.
players.clear();
A.botScan(bot, { mem: 5, head: 0 }, { boxes: [] }, [bot, visible]);
const controlCanSeeTarget = bot.ai.tgt === visible;
bot.ai.tgt = null;
bot.ai.scanProbeAfterId = undefined;
A.botScan(bot, { mem: 5, head: 0 }, map, roster);
const firstScanPreserved = bot.ai.tgt === null && bot.ai.scanTargets.length === 10;
const firstScanCandidateIds = bot.ai.scanTargets.map(q => q.id);
let targetAcquisitionScanCount = 1;
while (bot.ai.tgt !== visible && targetAcquisitionScanCount < 9) {
  A.botScan(bot, { mem: 5, head: 0 }, map, roster);
  targetAcquisitionScanCount++;
}
const report = {
  mode: G.mode,
  bot: { id: bot.id, alive: bot.alive, team: bot.team, yaw: bot.yaw },
  foeCount: roster.length - 1,
  visible: { id: visible.id, alive: visible.alive, team: visible.team, x: visible.x, z: visible.z },
  nearerOccludedEnemies: 10,
  visibleEnemyBeyondCandidateLimit: true,
  controlCanSeeSameTargetWithoutOccluders: controlCanSeeTarget,
  firstScanPreserved,
  firstScanCandidateIds,
  targetAcquisitionScanCount,
  maxCandidatesPerScan: 10,
  selectedVisibleEnemy: bot.ai.tgt === visible,
  selectedTargetId: bot.ai.tgt && bot.ai.tgt.id,
  result: controlCanSeeTarget && firstScanPreserved && bot.ai.tgt === visible
    ? 'PASS: initial nearest-ten behavior is preserved and the rotating probe prevents permanent occlusion starvation'
    : 'FAIL: fixture did not meet the perception fairness behavior'
};
console.log(JSON.stringify(report, null, 2));
if (!controlCanSeeTarget || !firstScanPreserved || bot.ai.tgt !== visible || targetAcquisitionScanCount > 8) process.exitCode = 1;
