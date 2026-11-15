const test = require('node:test');
const assert = require('node:assert/strict');
const { G, players, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

test('deathmatch and Infection bots preserve the first scan and reuse the ten-ray budget for five fair probes', () => {
  const previousMode = G.mode;
  const previousPlayers = [...players.entries()];
  try {
    const blockedMap = { boxes: [[-3, 3, -6, -5, 4, 0]] };
    const clearMap = { boxes: [] };
    for (const mode of ['deathmatch', 'infection']) {
      G.mode = mode;
      players.clear();
      const bot = _t.makeBot(0);
      bot.alive = true;
      bot.x = 0; bot.y = 0; bot.z = 0; bot.yaw = 0;
      bot.ai.alert = 0;
      bot.infected = false;

      const hidden = Array.from({ length: 10 }, (_, i) => ({
        id: 100 + i, bot: false, alive: true, team: 1, infected: mode === 'infection',
        x: (i - 4.5) * 0.25, y: 0, z: -10, cr: 0, pr: 0
      }));
      const visible = { id: 999, bot: false, alive: true, team: 1, infected: mode === 'infection', x: 7, y: 0, z: -10, cr: 0, pr: 0 };
      const roster = [bot, ...hidden, visible];

      _t.botScan(bot, { mem: 5, head: 0 }, clearMap, [bot, visible]);
      assert.strictEqual(bot.ai.tgt, visible, `${mode} control target is inside the scan cone and visible`);
      bot.ai.tgt = null;
      bot.ai.scanProbeCursor = undefined;
      bot.ai.scanProbeAfterId = undefined;

      _t.botScan(bot, { mem: 5, head: 0 }, blockedMap, roster);
      assert.equal(bot.ai.tgt, null, `${mode} first pass retains the existing nearest-ten visibility behavior`);
      assert.equal(bot.ai.scanTargets.length, 10);
      assert.deepEqual(new Set(bot.ai.scanTargets), new Set(hidden), `${mode} first scan preserves the original nearest-ten set`);

      _t.botScan(bot, { mem: 5, head: 0 }, blockedMap, roster);
      assert.strictEqual(bot.ai.tgt, visible, `${mode} rotating probe finds the clear opponent beyond the nearest-ten cap`);
      assert.ok(bot.ai.scanTargets.length <= 10, `${mode} visibility-ray budget remains capped at ten candidates`);
    }
  } finally {
    players.clear();
    for (const [id, player] of previousPlayers) players.set(id, player);
    G.mode = previousMode;
  }
});

test('a 64-bot, 96-actor roster acquires an occluded outlier within a bounded multi-probe cycle', () => {
  const previousMode = G.mode;
  const previousPlayers = [...players.entries()];
  try {
    G.mode = 'deathmatch';
    players.clear();
    const roster = [];
    let scanner;
    for (let i = 0; i < 64; i++) {
      const team = i < 32 ? 0 : 1;
      const bot = _t.makeBot(team);
      bot.alive = true;
      bot.x = team ? ((i % 7) - 3) * 0.12 : 0;
      bot.y = 0; bot.z = team ? -10 : 4; bot.yaw = team ? Math.PI : 0;
      if (!scanner) scanner = bot;
      roster.push(bot);
    }
    for (let i = 0; i < 32; i++) {
      const team = i < 16 ? 0 : 1;
      roster.push({ id: 2000 + i, bot: false, alive: true, team,
        x: team ? ((i % 7) - 3) * 0.12 : 0, y: 0, z: team ? -10 : 4, cr: 0, pr: 0 });
    }
    const visible = roster[95];
    visible.x = 7; visible.z = -10;
    assert.equal(roster.length, 96);
    assert.strictEqual(scanner, roster[0]);

    _t.botScan(scanner, { mem: 5, head: 0 }, { boxes: [] }, [scanner, visible]);
    assert.strictEqual(scanner.ai.tgt, visible, 'the same outlier target is visible when nearer opponents are absent');
    scanner.ai.tgt = null;
    scanner.ai.scanProbeCursor = undefined;

    const blockedMap = { boxes: [[-3, 3, -6, -5, 4, 0]] };
    _t.botScan(scanner, { mem: 5, head: 0 }, blockedMap, roster);
    assert.equal(scanner.ai.tgt, null, 'the original first scan still considers only the nearest ten');
    let scans = 1;
    while (scanner.ai.tgt !== visible && scans <= roster.length) {
      _t.botScan(scanner, { mem: 5, head: 0 }, blockedMap, roster);
      scans++;
    }
    assert.strictEqual(scanner.ai.tgt, visible, 'rotating probes reach a late-roster visible opponent');
    assert.ok(scans <= roster.length + 1, `acquisition must be bounded by one roster cycle (scans=${scans})`);
    assert.ok(scanner.ai.scanTargets.length <= 10, 'the candidate/line-of-sight budget stays at ten');
    assert.ok(scans <= 12, `five rotating probes should cover this 48-opponent roster promptly (scans=${scans})`);
  } finally {
    players.clear();
    for (const [id, player] of previousPlayers) players.set(id, player);
    G.mode = previousMode;
  }
});

test('every eligible opponent identity enters the bounded scan set across one stable-ID probe cycle', () => {
  const previousMode = G.mode;
  const previousPlayers = [...players.entries()];
  try {
    G.mode = 'deathmatch'; players.clear();
    const scanner = _t.makeBot(0);
    scanner.alive = true; scanner.x = 0; scanner.y = 0; scanner.z = 0; scanner.yaw = 0;
    const foes = Array.from({ length: 47 }, (_, i) => ({
      id: 100 + i, bot: false, alive: true, team: 1,
      x: ((i % 9) - 4) * 0.18, y: 0, z: -10 - Math.floor(i / 9) * 0.03, cr: 0, pr: 0
    }));
    const roster = [scanner, ...foes], considered = new Set();
    scanner.ai.scanProbeAfterId = undefined;
    let scans = 0;
    while (considered.size < foes.length && scans < 12) {
      _t.botScan(scanner, { mem: 5, head: 0 }, { boxes: [] }, roster);
      for (const candidate of scanner.ai.scanTargets) considered.add(candidate.id);
      assert.ok(scanner.ai.scanTargets.length <= 10, 'each scan preserves the ten-candidate visibility cap');
      scans++;
    }
    assert.equal(considered.size, foes.length, `all 47 eligible identities enter scan consideration (scans=${scans})`);
    assert.ok(scans <= 10, `stable-ID probes cover the roster within ten scans (scans=${scans})`);
  } finally {
    players.clear();
    for (const [id, player] of previousPlayers) players.set(id, player);
    G.mode = previousMode;
  }
});

test('stable actor IDs preserve target coverage through roster reorder, target movement, death, and respawn', () => {
  const previousMode = G.mode;
  const previousPlayers = [...players.entries()];
  try {
    G.mode = 'deathmatch'; players.clear();
    const scanner = _t.makeBot(0);
    scanner.alive = true; scanner.x = 0; scanner.y = 0; scanner.z = 0; scanner.yaw = 0;
    const decoys = Array.from({ length: 46 }, (_, i) => ({
      id: 100 + i, bot: false, alive: true, team: 1,
      x: ((i % 9) - 4) * 0.3, y: 0, z: -10, cr: 0, pr: 0
    }));
    const allies = Array.from({ length: 48 }, (_, i) => ({
      id: 2000 + i, bot: false, alive: true, team: 0,
      x: 20 + (i % 7), y: 0, z: 20 + (i % 5), cr: 0, pr: 0
    }));
    let visible = { id: 9000, bot: false, alive: true, team: 1, x: 7, y: 0, z: -10, cr: 0, pr: 0 };
    const wall = { boxes: [[-3, 3, -6, -5, 4, 0]] };
    const base = () => [scanner, ...decoys, visible, ...allies];
    const churnedRoster = pass => {
      const rest = base().slice(1);
      const shift = (pass * 11) % rest.length;
      rest.push(...rest.splice(0, shift));
      if (pass % 2) rest.reverse();
      return [scanner, ...rest];
    };
    const step = pass => _t.botScan(scanner, { mem: 5, head: 0 }, wall, churnedRoster(pass));

    const clear = { boxes: [] };
    _t.botScan(scanner, { mem: 5, head: 0 }, clear, [scanner, visible]);
    assert.strictEqual(scanner.ai.tgt, visible, 'the outlier is genuinely visible when the obstruction is removed');
    scanner.ai.tgt = null; scanner.ai.scanProbeAfterId = undefined;

    step(0);
    visible.alive = false;
    const respawned = { id: 9001, bot: false, alive: true, team: 1, x: 7.15, y: 0, z: -10, cr: 0, pr: 0 };
    visible = respawned;
    let scans = 0;
    while (scanner.ai.tgt !== respawned && scans < 12) { step(scans + 1); scans++; }
    assert.strictEqual(scanner.ai.tgt, respawned, `a moving respawned target is acquired despite roster churn (scans=${scans})`);
    assert.ok(scanner.ai.scanTargets.length <= 10, 'roster churn never increases the visibility-ray budget');

    respawned.alive = false;
    step(scans + 1);
    assert.equal(scanner.ai.tgt, null, 'a dead target is dropped instead of retained as a stale combat reference');
    const secondRespawn = { id: 9002, bot: false, alive: true, team: 1, x: 7.25, y: 0, z: -10, cr: 0, pr: 0 };
    visible = secondRespawn;
    let secondScans = 0;
    while (scanner.ai.tgt !== secondRespawn && secondScans < 12) { step(scans + 2 + secondScans); secondScans++; }
    assert.strictEqual(scanner.ai.tgt, secondRespawn, 'a later respawn remains eligible after the cursor wraps or advances');
    assert.ok(secondScans <= 12, `a respawn is reacquired within a bounded probe cycle (scans=${secondScans})`);
  } finally {
    players.clear();
    for (const [id, player] of previousPlayers) players.set(id, player);
    G.mode = previousMode;
  }
});

test('bots switch away from a formerly visible target when cover blocks it and a replacement is visible', () => {
  const previousMode = G.mode;
  const previousPlayers = [...players.entries()];
  try {
    G.mode = 'deathmatch'; players.clear();
    const scanner = _t.makeBot(0);
    scanner.alive = true; scanner.x = 0; scanner.y = 0; scanner.z = 0; scanner.yaw = 0;
    const oldTarget = { id: 500, bot: false, alive: true, team: 1, x: 0, y: 0, z: -10, cr: 0, pr: 0 };
    const replacement = { id: 501, bot: false, alive: true, team: 1, x: 7, y: 0, z: -10, cr: 0, pr: 0 };
    const roster = [scanner, oldTarget, replacement];
    _t.botScan(scanner, { mem: 5, head: 0 }, { boxes: [] }, roster);
    assert.strictEqual(scanner.ai.tgt, oldTarget, 'the closer clear target is selected first');
    _t.botScan(scanner, { mem: 5, head: 0 }, { boxes: [[-3, 3, -6, -5, 4, 0]] }, roster);
    assert.strictEqual(scanner.ai.tgt, replacement, 'the bot switches to the visible target instead of retaining a target behind cover');
  } finally {
    players.clear();
    for (const [id, player] of previousPlayers) players.set(id, player);
    G.mode = previousMode;
  }
});
