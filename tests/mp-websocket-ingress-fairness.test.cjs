'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

const serverPath = path.resolve(__dirname, '../AndroidProject/app/src/main/assets/phone-host/server.js');
const source = fs.readFileSync(serverPath, 'utf8');
const start = source.indexOf('const WS_FRAME_BATCH = 32, WS_FRAME_RATE_MAX = 600, WS_MESSAGE_RATE_MAX = 150;');
const end = source.indexOf('/* ---------------- game state ---------------- */', start);
assert.ok(start >= 0 && end > start, 'test extracts the actual phone-host Conn implementation');

function harness() {
  let now = 1000;
  const immediate = [];
  const context = {
    Buffer,
    Date: class extends Date { static now() { return now; } },
    WS_TEXT_DECODER: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }),
    performance: { now: () => now },
    setImmediate(fn) { immediate.push(fn); return immediate.length; },
    clearImmediate() {},
    log() {}
  };
  vm.runInNewContext(source.slice(start, end) + '\nthis.Conn = Conn;', context, { timeout: 10000 });
  function peer(onMessage = () => {}) {
    const sock = {
      writableLength: 0, writes: [], ends: [], destroyed: false, ended: false,
      setNoDelay() {}, setTimeout() {}, setKeepAlive() {}, on() {},
      write(data) { this.writes.push(Buffer.from(data)); return true; },
      end(data) { this.ended = true; if (data) this.ends.push(Buffer.from(data)); },
      destroy() { this.destroyed = true; }
    };
    let closeCalls = 0;
    const conn = new context.Conn(sock, onMessage, () => { closeCalls++; });
    return { sock, conn, closeCalls: () => closeCalls };
  }
  return {
    peer,
    now: () => now,
    setNow(value) { now = value; },
    pendingImmediates: () => immediate.length,
    runOneTurn() {
      const work = immediate.splice(0);
      for (const fn of work) fn();
      return work.length;
    },
    drainAll(limit = 10000) {
      let turns = 0;
      while (immediate.length) {
        if (++turns > limit) throw new Error('parser failed to drain within the deterministic turn limit');
        this.runOneTurn();
      }
      return turns;
    }
  };
}

function clientFrame(op, payload = Buffer.alloc(0), fin = true, mask = [7, 31, 99, 201]) {
  assert.ok(payload.length <= 65535);
  const ext = payload.length < 126 ? 0 : 2;
  const out = Buffer.allocUnsafe(2 + ext + 4 + payload.length);
  out[0] = (fin ? 0x80 : 0) | op;
  out[1] = 0x80 | (ext ? 126 : payload.length);
  if (ext) out.writeUInt16BE(payload.length, 2);
  const maskAt = 2 + ext, payloadAt = maskAt + 4;
  out.set(mask, maskAt);
  for (let i = 0; i < payload.length; i++) out[payloadAt + i] = payload[i] ^ mask[i & 3];
  return out;
}
function many(frame, count) {
  const out = Buffer.allocUnsafe(frame.length * count);
  for (let i = 0; i < count; i++) frame.copy(out, i * frame.length);
  return out;
}
function decodeServerFrame(buf) {
  assert.equal(buf[1] & 0x80, 0, 'server frames are unmasked');
  let len = buf[1] & 127, offset = 2;
  if (len === 126) { len = buf.readUInt16BE(2); offset = 4; }
  else if (len === 127) { len = buf.readUInt32BE(6); offset = 10; }
  return { op: buf[0] & 15, payload: buf.subarray(offset, offset + len) };
}

test('32-peer input bursts yield after at most 32 frames per connection while respecting the message cap', () => {
  const h = harness();
  const clients = [];
  for (let peer = 0; peer < 32; peer++) {
    const received = [];
    const c = h.peer(raw => received.push(JSON.parse(raw).i));
    const prefix = [];
    for (let i = 0; i < 150; i++) {
      prefix.push(clientFrame(1, Buffer.from(JSON.stringify({ i }))));
      prefix.push(clientFrame(10), clientFrame(10), clientFrame(10));
    }
    c.conn.data(Buffer.concat(prefix));
    clients.push({ ...c, received });
  }
  const consumedWhenEventLoopRegainsControl = clients.map(c => c.received.length);
  assert.deepEqual(consumedWhenEventLoopRegainsControl, Array(32).fill(8));
  assert.ok(clients.every(c => c.conn.frameRateCount === 32), 'each parser turn handles no more than 32 frames');
  assert.equal(clients.reduce((sum, c) => sum + c.received.length, 0), 32 * 8);
  assert.ok(h.pendingImmediates() > 0);
  h.drainAll();
  for (const c of clients) {
    assert.deepEqual(c.received, Array.from({ length: 150 }, (_, i) => i));
    assert.equal(c.conn.frameRateCount, 600);
    assert.equal(c.conn.closed, false, '600 mixed frames remain within the frame cap and 150-message cap');
  }
});

test('PONG control frames share the bounded work budget and a modest control burst remains compatible', () => {
  const h = harness();
  const c = h.peer();
  c.conn.data(many(clientFrame(10), 128));
  assert.equal(c.conn.frameRateCount, 32, 'control frames are included in the same per-turn bound');
  assert.equal(c.conn.closed, false);
  h.drainAll();
  assert.equal(c.conn.frameRateCount, 128);
  assert.equal(c.conn.closed, false);

  h.setNow(h.now() + 1000);
  c.conn.data(many(clientFrame(10), 32));
  h.drainAll();
  assert.equal(c.conn.closed, false, 'ordinary low-rate WebSocket control traffic remains accepted');
  assert.equal(c.conn.frameRateCount, 32, 'expired timestamps leave the rolling window');
});

test('fragmented-message bursts yield, then disconnect at the per-peer frame cap', () => {
  const h = harness();
  let delivered = 0;
  const c = h.peer(() => delivered++);
  const frames = [clientFrame(1, Buffer.from('a'), false)];
  for (let i = 1; i < 8192; i++) frames.push(clientFrame(0, Buffer.from('a'), i === 8191));
  c.conn.data(Buffer.concat(frames));
  assert.equal(c.conn.frameRateCount, 32);
  assert.equal(delivered, 0);
  h.drainAll();
  assert.equal(c.conn.frameRateCount, 600, 'the rejected over-limit frame is not admitted');
  assert.equal(c.conn.closed, true);
  assert.equal(delivered, 0, 'oversized frame-count message is never delivered to game protocol handlers');
});

test('PING flood cannot amplify replies after the peer frame limit', () => {
  const h = harness();
  const c = h.peer();
  c.conn.data(many(clientFrame(9), 8192));
  assert.equal(c.sock.writes.length, 32, 'only the initial bounded frame batch is handled synchronously');
  h.drainAll();
  assert.equal(c.sock.writes.length, 600, 'PONG replies stop when the per-second frame cap closes the peer');
  assert.equal(c.conn.closed, true);
});

test('a failed PING response closes parsing immediately instead of consuming the buffered remainder', () => {
  const h = harness();
  const c = h.peer();
  c.sock.writableLength = 262145;
  c.conn.data(many(clientFrame(9), 128));
  assert.equal(c.conn.closed, true);
  assert.equal(c.sock.writes.length, 0);
  assert.equal(c.conn.frameRateCount, 1, 'no later buffered control frames are parsed after backpressure closes the peer');
});

test('outbound writes stop when a peer queue is already beyond the bounded backpressure threshold', () => {
  const below = harness().peer();
  below.sock.writableLength = 262144;
  below.conn.text('one bounded write at the current threshold');
  assert.equal(below.conn.closed, false);
  assert.equal(below.sock.writes.length, 1);

  const above = harness().peer();
  above.sock.writableLength = 262145;
  assert.equal(above.conn.sendFrame(Buffer.from([0x81, 0x00])), false);
  assert.equal(above.conn.closed, true);
  assert.equal(above.sock.destroyed, true);
  assert.equal(above.sock.writes.length, 0);
  above.conn.text('must not enqueue after close');
  assert.equal(above.sock.writes.length, 0);
});

test('rolling 1 s limit rejects a burst placed immediately across the old fixed-window boundary', () => {
  const h = harness();
  const c = h.peer();
  h.setNow(1999);
  c.conn.data(many(clientFrame(10), 600));
  h.drainAll();
  assert.equal(c.conn.frameRateCount, 600);
  assert.equal(c.conn.closed, false);

  h.setNow(2000);
  c.conn.data(clientFrame(10));
  assert.equal(c.conn.closed, true, 'a 601st frame inside the trailing 1000 ms is rejected');
  assert.equal(c.conn.frameRateCount, 600);
});

test('600 frames/s sustained on exact quarter-second boundaries remains accepted', () => {
  const h = harness();
  const c = h.peer();
  const batch = many(clientFrame(10), 150);
  for (const at of [3000, 3250, 3500, 3750, 4000]) {
    h.setNow(at);
    c.conn.data(batch);
    h.drainAll();
    assert.equal(c.conn.closed, false, `limit should admit the documented rate at t=${at}`);
  }
  assert.equal(c.conn.frameRateCount, 600);
});

test('normal 35 frame/s client traffic remains below the rolling abuse limit', () => {
  const h = harness();
  const c = h.peer();
  for (let i = 0; i < 70; i++) {
    h.setNow(5000 + Math.floor(i * 1000 / 35));
    c.conn.data(clientFrame(1, Buffer.from('x')));
  }
  assert.equal(c.conn.closed, false);
  assert.equal(c.conn.frameRateCount, 35, 'only the trailing one-second traffic remains counted');
});

test('fragmented text state and delivery order survive 32-frame yields with interleaved PINGs', () => {
  const h = harness();
  const delivered = [];
  const c = h.peer(raw => delivered.push(raw));
  const frames = [clientFrame(1, Buffer.from('before'), true), clientFrame(1, Buffer.from('{"v":"'), false)];
  for (let i = 0; i < 31; i++) {
    frames.push(clientFrame(0, Buffer.from('a'), false));
    if ((i + 1) % 5 === 0) frames.push(clientFrame(9, Buffer.from(String(i + 1))));
  }
  frames.push(clientFrame(0, Buffer.from('"}'), true), clientFrame(1, Buffer.from('after'), true));
  c.conn.data(Buffer.concat(frames));
  assert.ok(h.pendingImmediates() > 0, 'the coalesced stream yields across multiple parser turns');
  h.drainAll();
  assert.deepEqual(delivered, ['before', JSON.stringify({ v: 'a'.repeat(31) }), 'after']);
  const pongs = c.sock.writes.map(decodeServerFrame);
  assert.equal(pongs.length, 6);
  assert.ok(pongs.every(frame => frame.op === 10));
  assert.deepEqual(pongs.map(frame => frame.payload.toString()), ['5', '10', '15', '20', '25', '30']);
  assert.equal(c.conn.closed, false);
});

test('valid peer Close after a parser yield is echoed once and stops buffered frames', () => {
  const h = harness();
  const delivered = [];
  const c = h.peer(raw => delivered.push(raw));
  const closePayload = Buffer.concat([Buffer.from([0x03, 0xe8]), Buffer.from('normal')]);
  c.conn.data(Buffer.concat([clientFrame(1, Buffer.from('unfinished'), false), many(clientFrame(9), 39), clientFrame(8, closePayload), clientFrame(1, Buffer.from('must-not-deliver'))]));
  assert.ok(h.pendingImmediates() > 0, 'the Close frame remains queued behind a yielded control-frame batch');
  h.drainAll();
  assert.equal(c.conn.closed, true);
  assert.equal(c.sock.ended, true);
  assert.equal(c.sock.destroyed, false, 'valid close response is not discarded by an immediate destroy');
  assert.equal(c.conn.frameRateCount, 41, 'parser stops at Close without accounting later buffered frames');
  assert.equal(c.conn.frag, null, 'Close discards an unfinished fragmented message');
  assert.equal(c.conn.fragBytes, 0);
  assert.equal(c.sock.writes.length, 39, 'PING responses before Close remain ordered and bounded');
  assert.equal(c.sock.ends.length, 1);
  const response = decodeServerFrame(c.sock.ends[0]);
  assert.equal(response.op, 8);
  assert.deepEqual(response.payload, closePayload);
  assert.deepEqual(delivered, []);
  assert.equal(c.closeCalls(), 1);
  c.conn.data(clientFrame(1, Buffer.from('late')));
  assert.equal(c.closeCalls(), 1, 'late socket events cannot repeat cleanup');
});

test('malformed frame classes are rejected before reaching protocol handlers', () => {
  const highLength = Buffer.alloc(14);
  highLength[0] = 0x81; highLength[1] = 0xff;
  highLength.set([7, 31, 99, 201], 2); highLength.writeUInt32BE(1, 6); highLength.writeUInt32BE(0, 10);
  const tooLarge = Buffer.alloc(14);
  tooLarge[0] = 0x81; tooLarge[1] = 0xff;
  tooLarge.set([7, 31, 99, 201], 2); tooLarge.writeUInt32BE(0, 6); tooLarge.writeUInt32BE(65537, 10);
  const rsv = clientFrame(1, Buffer.from('x')); rsv[0] |= 0x40;
  const unknown = clientFrame(3, Buffer.from('x'));
  const binary = clientFrame(2, Buffer.from('x'));
  const fragmentedPing = clientFrame(9, Buffer.from('x'), false);
  const closeLengthOne = clientFrame(8, Buffer.from([0x03]));
  const oversizedControl = clientFrame(9, Buffer.alloc(126));
  const cases = [
    ['unmasked client frame', Buffer.from([0x81, 0x01, 0x78])],
    ['reserved bits', rsv], ['reserved opcode', unknown], ['unsupported binary opcode', binary],
    ['fragmented control frame', fragmentedPing], ['control payload over 125 bytes', oversizedControl],
    ['64-bit length with nonzero high word', highLength], ['payload over parser frame maximum', tooLarge],
    ['continuation without initial fragment', clientFrame(0, Buffer.from('x'))],
    ['one-byte close payload', closeLengthOne],
    ['reserved close status', clientFrame(8, Buffer.from([0x03, 0xed]))],
    ['invalid UTF-8 close reason', clientFrame(8, Buffer.from([0x03, 0xe8, 0xc3, 0x28]))],
    ['invalid UTF-8 text message', clientFrame(1, Buffer.from([0xc3, 0x28]))],
    ['nested fragmented message start', Buffer.concat([clientFrame(1, Buffer.from('a'), false), clientFrame(1, Buffer.from('b'), false)])]
  ];
  for (const [label, bytes] of cases) {
    const h = harness(); let delivered = 0;
    const c = h.peer(() => delivered++);
    c.conn.data(bytes);
    assert.equal(c.conn.closed, true, label);
    assert.equal(delivered, 0, `${label} is never dispatched`);
    if (label.includes('close')) {
      assert.equal(c.sock.ends.length, 0, `${label} is not echoed as a valid Close`);
      assert.equal(c.sock.destroyed, true);
    }
  }
});

test('valid UTF-8 text preserves Unicode and a leading BOM exactly', () => {
  const h = harness(); const delivered = [];
  const c = h.peer(raw => delivered.push(raw));
  const text = '\ufeff{"name":"Vega é 🚀"}';
  c.conn.data(clientFrame(1, Buffer.from(text, 'utf8')));
  assert.deepEqual(delivered, [text]);
  assert.equal(c.conn.closed, false);
});

test('fragmented text enforces the 8192-byte assembled-message limit at its exact boundary', () => {
  const sendFragmented = size => {
    const h = harness(); const delivered = [];
    const c = h.peer(raw => delivered.push(raw));
    const frames = []; let remaining = size, first = true;
    while (remaining > 0) {
      const count = Math.min(125, remaining);
      remaining -= count;
      frames.push(clientFrame(first ? 1 : 0, Buffer.alloc(count, 0x61), remaining === 0));
      first = false;
    }
    c.conn.data(Buffer.concat(frames)); h.drainAll();
    return { c, delivered };
  };
  const atLimit = sendFragmented(8192);
  assert.equal(atLimit.c.conn.closed, false);
  assert.equal(atLimit.delivered.length, 1);
  assert.equal(atLimit.delivered[0].length, 8192);
  const overLimit = sendFragmented(8193);
  assert.equal(overLimit.c.conn.closed, true);
  assert.equal(overLimit.delivered.length, 0);
});

test('oversized unparsed TCP input is closed before retaining an unbounded frame buffer', () => {
  const h = harness(); let delivered = 0;
  const c = h.peer(() => delivered++);
  c.conn.data(Buffer.alloc((1 << 20) + 1, 0));
  assert.equal(c.conn.closed, true);
  assert.equal(c.conn.buf.length, 0, 'connection cleanup releases the oversized input buffer');
  assert.equal(delivered, 0);
});

test('real masked WebSocket gameplay packets reach Protocol V2 movement, fire, reload, switch, and respawn guards', async () => {
  const { G, players, _t } = Host;
  const previous = { mode: G.mode, map: G.map, phase: G.phase, phaseEnd: G.phaseEnd, kills: G.kills, score: G.score.slice() };
  const previousPlayers = [...players.entries()];
  const h = harness();
  let player;
  const c = h.peer(raw => _t.onMessage(player, raw));
  try {
    players.clear();
    G.mode = 'deathmatch'; G.map = 'courtyard'; G.phase = 'live'; G.phaseEnd = Date.now() + 60000; G.kills = 99; G.score = [0, 0];
    player = _t.addPlayer(c.conn, 'wire-player');
    Object.assign(player, {
      protocol: 2, session: 'wire-session-0001', lastActionSeq: 0, alive: true, ep: 7,
      x: -25, y: 0, z: -35, yaw: 0, pitch: 0, moveCredit: 2, verticalCredit: 1.6,
      creditT: Date.now(), lastIn: Date.now(), nextShot: 0, lastShot: 0, cur: 'pistol'
    });
    player.owned.add('smg');
    player.ammo.pistol = { mag: 3, res: 12 };
    player.ammo.smg = { mag: 8, res: 24 };
    let seq = 0;
    const send = (t, fields = {}, ep = player.ep) => {
      const packet = { t, ...fields, session: player.session, seq: ++seq, ep };
      c.conn.data(clientFrame(1, Buffer.from(JSON.stringify(packet))));
      h.drainAll();
    };

    send('in', { x: -24.9, y: 0, z: -35, yaw: 0, pitch: 0, cr: 0, pr: 0 });
    assert.equal(player.x, -24.9, 'valid sequenced movement updates the authoritative player through the frame parser');

    const pistolBefore = player.ammo.pistol.mag;
    send('shot', { w: 'pistol', d: [[0, 0, -1]] });
    assert.equal(player.ammo.pistol.mag, pistolBefore - 1, 'valid masked shot consumes one authorized round');
    send('rl', { w: 'pistol' });
    assert.equal(player.rl.w, 'pistol', 'valid masked reload starts through the same parser path');

    send('in', { x: -24.9, y: 0, z: -35, yaw: 0, pitch: 0, w: 'smg' });
    assert.equal(player.cur, 'smg', 'movement input can perform the established weapon-switch action');
    assert.equal(player.rl, null, 'early weapon switch still cancels the pending reload');
    await new Promise(resolve => setTimeout(resolve, 220));
    const smgBefore = player.ammo.smg.mag;
    send('shot', { w: 'smg', d: [[0, 0, -1]] });
    assert.equal(player.ammo.smg.mag, smgBefore - 1, 'a valid fire action after the switch delay remains accepted');

    const deadEpoch = player.ep;
    player.alive = false; player.rl = { w: 'smg', at: Date.now() + 10000 };
    assert.equal(_t.deathmatchRespawn(player), true, 'normal server respawn path restores the player');
    assert.equal(player.ep, deadEpoch + 1);
    assert.equal(player.rl, null);
    const afterRespawnAmmo = player.ammo.smg.mag;
    send('shot', { w: 'smg', d: [[0, 0, -1]] }, deadEpoch);
    assert.equal(player.ammo.smg.mag, afterRespawnAmmo, 'stale pre-respawn packet is rejected after passing through the parser');
    player.ammo.smg.mag = 1;
    send('rl', { w: 'smg' });
    assert.equal(player.rl.w, 'smg', 'current-life reload still works after respawn');
    assert.equal(player.lastActionSeq, 7, 'rejected stale packet does not consume the next current-session sequence');
  } finally {
    players.clear();
    for (const [id, oldPlayer] of previousPlayers) players.set(id, oldPlayer);
    Object.assign(G, previous);
  }
});
