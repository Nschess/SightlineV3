'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { G, players, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

const required = ['session-generation', 'life-epoch', 'action-seq'];
const sink = () => ({ closed: false, backlog: 0, text() {}, sendFrame() { return true; }, kill() { this.closed = true; } });

test('protocol negotiation explicitly rejects v1 and downgrade/missing-capability clients', () => {
  assert.equal(_t.negotiateMultiplayerProtocol({ t: 'hello', v: 2, features: required }).ok, true);
  assert.equal(_t.negotiateMultiplayerProtocol({ t: 'hello', v: 1 }).code, 'protocol_upgrade_required');
  assert.equal(_t.negotiateMultiplayerProtocol({ t: 'hello', v: 3, features: required }).code, 'protocol_unsupported');
  assert.equal(_t.negotiateMultiplayerProtocol({ t: 'hello', v: 2, features: ['life-epoch'] }).code, 'protocol_capabilities_required');
});

test('v2 rejects missing/stale life data, duplicate/out-of-order replays, and cross-session packets', () => {
  players.clear();
  const previous = { phase: G.phase, mode: G.mode };
  G.phase = 'live'; G.mode = 'deathmatch';
  const p = _t.addPlayer(sink(), 'ProtocolTester');
  p.protocol = 2; p.session = 'session-current-0001'; p.lastActionSeq = 0;
  p.alive = true; p.ep = 7; p.x = 0; p.y = 0; p.z = 0; p.moveCredit = 2; p.verticalCredit = 2; p.creditT = Date.now(); p.cur = 'pistol';
  p.owned.add('pistol'); p.ammo.pistol.mag = 12; p.ammo.pistol.res = 36;
  const message = (fields, overrides = {}) => _t.onMessage(p, JSON.stringify({ session: p.session, ...fields, ...overrides }));
  const fire = (seq, ep, session = p.session) => message({ t: 'shot', seq, ep, w: 'pistol', d: [[0, 0, -1]] }, { session });
  const before = p.ammo.pistol.mag;

  fire(undefined, p.ep);
  fire(1, undefined);
  fire(1, p.ep - 1);
  assert.equal(p.ammo.pistol.mag, before, 'missing or old life epoch cannot fire');
  assert.equal(p.lastActionSeq, 0, 'invalid life data does not consume the next valid sequence');

  fire(1, p.ep, 'session-from-old-connection');
  assert.equal(p.ammo.pistol.mag, before, 'a prior session token cannot fire in this session');
  fire(1, p.ep);
  assert.equal(p.ammo.pistol.mag, before - 1, 'a valid current-session action succeeds');
  fire(1, p.ep);
  fire(0, p.ep);
  assert.equal(p.ammo.pistol.mag, before - 1, 'duplicate and out-of-order replays are rejected');
  assert.equal(p.lastActionSeq, 1);

  p.c.closed = true;
  message({ t: 'shot', seq: 2, ep: p.ep, w: 'pistol', d: [[0, 0, -1]] });
  assert.equal(p.ammo.pistol.mag, before - 1, 'a closed socket cannot apply a delayed action');
  p.c.closed = false;

  const reload = { t: 'rl', seq: 2, ep: p.ep, w: 'pistol' };
  message(reload, { session: 'session-from-old-connection' });
  assert.equal(p.rl, null, 'old-session reload cannot start');
  message({ ...reload, ep: p.ep - 1 });
  assert.equal(p.rl, null, 'old-life reload cannot start');
  message(reload);
  const started = p.rl;
  assert.ok(started, 'valid reload starts');
  message(reload);
  assert.equal(p.rl, started, 'replayed reload is ignored');

  const xBefore = p.x;
  message({ t: 'in', seq: 3, ep: p.ep - 1, x: 0.2, y: 0, z: 0, yaw: 0, pitch: 0 });
  assert.equal(p.x, xBefore, 'stale-life movement cannot rewind or relocate the player');
  message({ t: 'in', seq: 3, ep: p.ep, x: 0.2, y: 0, z: 0, yaw: 0, pitch: 0 });
  const movedX = p.x;
  message({ t: 'in', seq: 3, ep: p.ep, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
  assert.equal(p.x, movedX, 'a replayed movement sequence cannot rewind the accepted pose');

  const oldSession = p;
  players.delete(oldSession.id);
  const replacement = _t.addPlayer(sink(), 'ProtocolTester');
  replacement.protocol = 2; replacement.session = 'session-replacement-0002'; replacement.lastActionSeq = 0;
  replacement.alive = true; replacement.ep = 1; replacement.ammo.pistol.mag = 12;
  _t.onMessage(oldSession, JSON.stringify({ t: 'shot', seq: 999, session: oldSession.session, ep: oldSession.ep, w: 'pistol', d: [[0, 0, -1]] }));
  assert.equal(replacement.ammo.pistol.mag, 12, 'removed connection player object cannot mutate the replacement player');

  players.clear(); G.phase = previous.phase; G.mode = previous.mode;
});

test('legacy v1 missing-epoch fire and reload reproduce the gap that v2 negotiation now closes', () => {
  players.clear();
  const previous = { phase: G.phase, mode: G.mode };
  G.phase = 'live'; G.mode = 'deathmatch';
  const p = _t.addPlayer(sink(), 'LegacyGapRepro');
  p.protocol = 1; p.alive = true; p.ep = 2; p.cur = 'pistol';
  p.owned.add('pistol'); p.ammo.pistol.mag = 12; p.ammo.pistol.res = 36;
  p.x = 0; p.y = 0; p.z = 0; p.moveCredit = 5; p.verticalCredit = 2; p.creditT = Date.now();
  _t.onMessage(p, JSON.stringify({ t: 'shot', w: 'pistol', d: [[0, 0, -1]] }));
  assert.equal(p.ammo.pistol.mag, 11, 'the legacy handler accepts a missing-epoch shot while the respawned life is active');
  _t.onMessage(p, JSON.stringify({ t: 'rl', w: 'pistol' }));
  assert.ok(p.rl, 'the legacy handler accepts a missing-epoch reload');
  assert.equal(_t.negotiateMultiplayerProtocol({ t: 'hello', v: 1 }).code, 'protocol_upgrade_required',
    'the real WebSocket handshake blocks this legacy handler path before a player is created');
  players.clear(); G.phase = previous.phase; G.mode = previous.mode;
});

test('offline and phone-host pages negotiate the same v2 capabilities and sequence actions', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const assets = path.resolve(__dirname, '../AndroidProject/app/src/main/assets');
  const offline = fs.readFileSync(path.join(assets, 'www/index.html'), 'utf8');
  const phone = fs.readFileSync(path.join(assets, 'phone-host/index.html'), 'utf8');
  for(const [name,page] of [['www',offline],['phone-host',phone]]){
    assert.match(page, /t: 'hello', v: MP_PROTOCOL, features: MP_FEATURES/, name+' sends the same v2 capability handshake');
    assert.match(page, /packet=Object\.assign\(\{\},o,\{ session:MP\.session, seq:\+\+MP\.actionSeq \}\)/, name+' binds actions to session and order');
    assert.match(page, /m\.protocol!==MP_PROTOCOL/, name+' rejects protocol downgrade/mismatch');
    assert.match(page, /MP_SEQUENCED_TYPES = \{[^\n]*obj:1/, name+' sequences objective actions');
    assert.match(page, /MP_LIFE_TYPES = \{[^\n]*obj:1/, name+' binds objective actions to life epoch');
  }
  function declaration(html,name){const start=html.indexOf(`function ${name}(`);assert.ok(start>=0,`${name} is present`);const end=html.indexOf('\nfunction ',start+1);return html.slice(start,end<0?html.length:end).trim();}
  for(const name of ['mpConnect','mpSend'])assert.equal(declaration(offline,name),declaration(phone,name),`${name} shared protocol path`);
});

test('the shipped page mpSend binds each mutation to the session, sequence, and current life epoch', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const page = fs.readFileSync(path.resolve(__dirname, '../AndroidProject/app/src/main/assets/phone-host/index.html'), 'utf8');
  const start = page.indexOf('function mpSend(o) {');
  const end = page.indexOf('\nfunction mpRefreshPanel', start);
  assert.ok(start >= 0 && end > start, 'find the actual shipped mpSend implementation');
  const sent = [];
  const context = {
    MP: { sock: { readyState: 1, send: value => sent.push(JSON.parse(value)) }, session: 'runtime-session-0001', actionSeq: 4, ep: 12 },
    MP_SEQUENCED_TYPES: { in:1, shot:1, rl:1, buy:1, ammo:1, team:1, map:1, cfg:1, start:1, endmatch:1, cosmetic:1, finish:1, finishes:1 },
    MP_LIFE_TYPES: { in:1, shot:1, rl:1, buy:1, ammo:1 },
    JSON
  };
  vm.runInNewContext(`${page.slice(start, end)}; mpSend({t:'shot',ep:2,w:'pistol'}); mpSend({t:'rl',w:'pistol'}); mpSend({t:'cfg',mode:'infection'});`, context);
  assert.deepEqual(sent.map(packet => packet.t), ['shot', 'rl', 'cfg']);
  assert.deepEqual(sent.map(packet => packet.seq), [5, 6, 7]);
  assert.ok(sent.every(packet => packet.session === 'runtime-session-0001'));
  assert.deepEqual(sent.map(packet => packet.ep), [12, 12, undefined], 'client binds combat to its currently active life epoch, not caller-supplied stale data');
  assert.equal(context.MP.actionSeq, 7);
});

test('the shared loopback client refuses to emit state mutations before v2 welcome or a life epoch', async () => {
  const { protocolHello, observeProtocolV2, protocolV2Packet } = await import('./lib/mp-protocol-v2-client.mjs');
  const peer = { actionSeq: 0, ep: null };
  assert.deepEqual(protocolHello('QA').features, required);
  assert.throws(() => protocolV2Packet(peer, { t: 'cfg' }), /before protocol-v2 welcome/);
  observeProtocolV2(peer, { t: 'welcome', protocol: 2, session: 'test-session-000001', id: 4 });
  assert.throws(() => protocolV2Packet(peer, { t: 'shot', w: 'pistol' }), /before a life epoch is known/);
  observeProtocolV2(peer, { t: 'sp', ep: 9 });
  assert.deepEqual(protocolV2Packet(peer, { t: 'shot', session: 'attacker', seq: 999, ep: 4, w: 'pistol' }), {
    t: 'shot', session: 'test-session-000001', seq: 1, ep: 4, w: 'pistol'
  }, 'an intentional stale-epoch adversarial packet keeps its stale epoch but cannot forge session or sequence');
  assert.deepEqual(protocolV2Packet(peer, { t: 'rl', w: 'pistol' }), {
    t: 'rl', session: 'test-session-000001', seq: 2, w: 'pistol', ep: 9
  });
});
