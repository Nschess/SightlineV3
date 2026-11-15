const test = require('node:test');
const assert = require('node:assert/strict');
const { G, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

test('reusable bot-scan ranking matches stable full sort for nearest-visible candidate order', () => {
  let seed = 0x51a7;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
  for (let trial = 0; trial < 120; trial++) {
    const input = Array.from({ length: Math.floor(random() * 90) }, (_, index) => ({ id: `${trial}:${index}`, score: Math.floor(random() * 30) / 3 }));
    const targets = [], scores = [];
    for (const q of input) _t.insertBotScanCandidate(targets, scores, q, q.score);
    const expected = input.slice().sort((a, b) => a.score - b.score).slice(0, 10);
    assert.deepEqual(targets.map(q => q.id), expected.map(q => q.id));
    assert.deepEqual(scores, expected.map(q => q.score));
    assert.ok(targets.length <= 10);
  }
});

test('bot perception reuses per-bot scratch arrays across scans', () => {
  const previousMode = G.mode;
  try {
    G.mode = 'versus';
    const bot = { id: 90001, team: 0, alive: true, bot: true, x: 0, y: 0, z: 0, yaw: 0,
      ai: { alert: 0, tgt: null, last: null, invest: null, scanT: 0, aimT: 0, seenT: 0 } };
    const skill = { mem: 2, head: 0.1 };
    _t.botScan(bot, skill, { boxes: [] });
    const allies = bot.ai.scanAllies, targets = bot.ai.scanTargets, scores = bot.ai.scanScores;
    _t.botScan(bot, skill, { boxes: [] });
    assert.strictEqual(bot.ai.scanAllies, allies);
    assert.strictEqual(bot.ai.scanTargets, targets);
    assert.strictEqual(bot.ai.scanScores, scores);
    assert.equal(targets.length, 0);
    assert.equal(scores.length, 0);
  } finally {
    G.mode = previousMode;
  }
});

test('the bot scan no longer allocates a foe list or sorts a fresh candidate-object array', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../AndroidProject/app/src/main/assets/phone-host/server.js'), 'utf8');
  const start = source.indexOf('function botScan(b, S, m');
  const end = source.indexOf('\nfunction hearShot', start);
  assert.ok(start >= 0 && end > start, 'botScan source block exists');
  const scan = source.slice(start, end);
  assert.match(scan, /A\.scanTargets\|\|\(A\.scanTargets=\[\]\)/);
  assert.match(scan, /A\.scanScores\|\|\(A\.scanScores=\[\]\)/);
  assert.doesNotMatch(scan, /botFoes\(|candidates\.sort\(|candidates\.push\(\{\s*q\s*,\s*score\s*\}\)/);
});
