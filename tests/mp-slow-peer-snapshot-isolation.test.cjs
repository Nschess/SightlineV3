'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

function decodeTextFrame(buf) {
  assert.equal(buf[0] & 0x0f, 1, 'host emits a WebSocket text frame');
  let len = buf[1] & 0x7f, offset = 2;
  if (len === 126) { len = buf.readUInt16BE(2); offset = 4; }
  else if (len === 127) { len = buf.readUInt32BE(6); offset = 10; }
  return JSON.parse(buf.subarray(offset, offset + len).toString('utf8'));
}

test('slow peer snapshot queues are skipped per client without stalling healthy peers', () => {
  const { G, players, _t } = Host;
  const previous = { mode: G.mode, map: G.map, phase: G.phase, phaseEnd: G.phaseEnd };
  const previousPlayers = [...players.entries()];
  const healthyFrames = [];
  const slowFrames = [];
  const healthyConn = {
    closed: false, backlog: 0, snapshotFrames: 0, snapshotSkipped: 0,
    snapshotBytes: 0, snapshotBackpressure: 0, snapshotQueueBytes: 0, snapshotQueuePeakBytes: 0,
    text() {}, sendFrame(frame) { healthyFrames.push(Buffer.from(frame)); return true; }
  };
  const slowConn = {
    closed: false, backlog: 250000, snapshotFrames: 0, snapshotSkipped: 0,
    snapshotBytes: 0, snapshotBackpressure: 0, snapshotQueueBytes: 250000, snapshotQueuePeakBytes: 250000,
    text() {}, sendFrame(frame) { slowFrames.push(Buffer.from(frame)); return true; }
  };
  try {
    players.clear();
    G.mode = 'versus'; G.map = 'courtyard'; G.phase = 'buy'; G.phaseEnd = Date.now() + 60000;
    const healthy = _t.addPlayer(healthyConn, 'snapshot-healthy');
    const slow = _t.addPlayer(slowConn, 'snapshot-slow');
    for (const actor of [healthy, slow]) Object.assign(actor, {
      team: actor === healthy ? 0 : 1, alive: true, x: actor.id, y: 0, z: -2.5,
      yaw: 0.25, pitch: 0, cur: 'pistol'
    });
    _t.tickBody(); _t.tickBody();
    const snapshots = healthyFrames.map(decodeTextFrame).filter(message => message.t === 's');
    assert.equal(snapshots.length, 2, 'healthy peer keeps receiving current snapshots');
    assert.equal(snapshots[0].a.length, 2, 'host simulation still includes both players');
    assert.equal(slowConn.snapshotSkipped, 2, 'stale full snapshots are dropped only for the queued peer');
    assert.equal(slowConn.snapshotFrames, 0);
    assert.equal(slowConn.closed, false, 'replaceable snapshot pressure does not itself evict the peer');
    assert.equal(healthyConn.snapshotSkipped, 0);
    assert.equal(slowFrames.map(decodeTextFrame).filter(message => message.t === 's').length, 0,
      'only nonreplaceable control/state messages may use the independent slow-peer queue');
  } finally {
    players.clear();
    for (const [id, player] of previousPlayers) players.set(id, player);
    Object.assign(G, previous);
  }
});
