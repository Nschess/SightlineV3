'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { G, players, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

function peer(id, { bot = false, x = 0, z = 0, backlog = 0 } = {}) {
  let sent = 0, killed = 0;
  const p = { id, bot, x, z, c: { closed: false, backlog, sendFrame() { sent++; }, kill() { killed++; } } };
  Object.defineProperties(p, { sent: { get: () => sent }, killed: { get: () => killed } });
  return p;
}

test('bot fire presentation is bounded per nearby human in every multiplayer mode', () => {
  const source = fs.readFileSync(path.join(__dirname, '../AndroidProject/app/src/main/assets/phone-host/server.js'), 'utf8');
  assert.match(source, /if \(p\.bot\) bcastBotFx\(fx, p\); else bcast\(fx, p\);/,
    'only AI fire cosmetics use the lossy/bounded path; human shot effects keep the original broadcast');
  for (const mode of ['versus', 'deathmatch', 'infection', 'outbreak']) {
    players.clear(); G.mode = mode;
    const near = peer(1), far = peer(2, { x: 100 }), ai = peer(3, { bot: true });
    const slow = peer(4, { backlog: 300000 });
    players.set(near.id, near); players.set(far.id, far); players.set(ai.id, ai); players.set(slow.id, slow);
    const bot = { id: 99, bot: true, x: 0, z: 0 };
    for (let i = 0; i < 200; i++) _t.bcastBotFx({ t: 'fx', id: bot.id, w: 'carbine', e: [1, 1, 1] }, bot, i * 10);
    assert.ok(near.sent <= 61, `${mode}: 10 ms events are capped at about 30 per second`);
    assert.ok(near.sent >= 50, `${mode}: nearby firing ambience is retained instead of suppressed`);
    assert.equal(far.sent, 0, `${mode}: distant clients do not receive irrelevant bot FX`);
    assert.equal(ai.sent, 0, `${mode}: AI entities are not network recipients`);
    assert.equal(slow.sent, 0, `${mode}: a backed-up peer drops cosmetic FX`);
    assert.equal(slow.killed, 0, `${mode}: cosmetic backlog never disconnects a client`);
  }
  players.clear();
});

test.after(() => players.clear());
