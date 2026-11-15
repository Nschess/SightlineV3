'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

function decodeTextFrame(buf) {
  assert.equal(buf[0] & 0x0f, 1, 'host emits a WebSocket text frame');
  const code = buf[1] & 0x7f;
  const offset = code < 126 ? 2 : code === 126 ? 4 : 10;
  return JSON.parse(buf.subarray(offset).toString('utf8'));
}

test('actual host tick emits ordered 50 Hz snapshots matching client pose ingestion contract', () => {
  const { G, players, _t } = Host;
  const previous = { mode: G.mode, map: G.map, phase: G.phase, phaseEnd: G.phaseEnd };
  const previousPlayers = [...players.entries()];
  const frames = [];
  const fakeConn = {
    closed: false, backlog: 0,
    snapshotFrames: 0, snapshotBytes: 0, snapshotSkipped: 0,
    snapshotBackpressure: 0, snapshotQueueBytes: 0, snapshotQueuePeakBytes: 0,
    sendFrame(frame) { frames.push(Buffer.from(frame)); return true; }
  };

  try {
    players.clear();
    G.mode = 'versus'; G.map = 'courtyard'; G.phase = 'buy'; G.phaseEnd = Date.now() + 60000;
    const actor = _t.addPlayer(fakeConn, 'snapshot-contract');
    Object.assign(actor, { team: 0, alive: true, x: 1.25, y: 0, z: -2.5, yaw: 0.25, pitch: 0, cur: 'pistol' });

    _t.tickBody();
    _t.tickBody();

    const snapshots = frames.map(decodeTextFrame).filter(message => message.t === 's');
    assert.equal(_t.tickMs, 20, 'simulation remains at the 20 ms tick');
    assert.equal(_t.snapshotEveryNow(), 1, 'small lobby snapshots remain at 50 Hz');
    assert.equal(snapshots.length, 2, 'one full-state snapshot emitted per host tick');
    assert.deepEqual(snapshots.map(message => message.n), [1, 2], 'sequence increments exactly once and remains ordered');
    assert.ok(snapshots[1].st > snapshots[0].st, 'host timestamps move forward');
    for (const message of snapshots) {
      assert.ok(Number.isFinite(message.st));
      assert.ok(Array.isArray(message.a));
      assert.equal(message.a.length, 1);
      assert.equal(message.a[0].length, 12, 'actor row keeps all fields consumed by mpSnapshot');
      assert.deepEqual(message.a[0], [actor.id, 1.25, 0, -2.5, 0.25, 0, 0, 0, 0, 1, 0, 0]);
    }
    assert.equal(fakeConn.snapshotFrames, 2);
    assert.equal(fakeConn.snapshotSkipped, 0);
  } finally {
    players.clear();
    for (const [id, player] of previousPlayers) players.set(id, player);
    Object.assign(G, previous);
  }
});
