'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const assets = path.resolve(__dirname, '../AndroidProject/app/src/main/assets');
const clients = ['www', 'phone-host'].map(name => ({
  name,
  html: fs.readFileSync(path.join(assets, name, 'index.html'), 'utf8')
}));

function makeHarness(html) {
  const start = html.indexOf('function mpQueueRemotePose(');
  const end = html.indexOf('function mpEnsureZombie(', start);
  const interp = html.match(/function interpMs\(\) \{[^\n]+\}/)?.[0];
  assert.ok(start >= 0 && end > start && interp, 'actual interpolation functions are present');
  let now = 0;
  const axis = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
  const actor = {
    id: 7, netBot: true, bot: true, team: 1, opIndex: 0, skin: 0, name: 'jitter-test', finishes: {},
    infected: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, alive: true, wasAlive: true,
    fall: 0, gone: 0, phase: 0, cr: 0, pr: 0, buf: [], poseSamplePool: [],
    flashT: 0, hurtT: 0, op: { w: 1, h: 1 }, legs: { rotation: { x: 0 } },
    g: { parent: {}, visible: true, position: axis(), rotation: { x: 0, y: 0, z: 0 }, scale: { set() {} } }
  };
  const MP = {
    on: true, id: 0, mode: 'versus', net: { last: 0, ema: 50, jit: 0, rn: 0 }, snapN: 0,
    puppets: { 7: actor }, zombies: {}, weapons: ['pistol'], dirty: false, lobby: null, infStatus: null
  };
  const context = vm.createContext({
    Math, Number, Array, JSON, MP, G: { interp: 0 },
    performance: { now: () => now }, scene: { add() {} },
    SightlinePoses: { apply() {} }, hurtGlow() {}, ensureWorldWeapon() {}, mpApplyWorldFinish() {}
  });
  vm.runInContext(interp + '\n' + html.slice(start, end) +
    '\nthis.delay=interpMs;this.snapshot=mpSnapshot;this.poseTime=mpSnapshotPoseTime;this.step=mpPuppetStep;',
    context, { timeout: 10000 });
  function snapshot(seq, serverMs, receiveMs) {
    now = receiveMs;
    const x = serverMs * .002;
    const z = serverMs * .001;
    context.snapshot({ n: seq, st: serverMs, a: [[7, x, 0, z, 0, 0, 0, 0, 0, 1, 0, 0]], z: [] });
  }
  function render(frameMs) {
    now = frameMs;
    context.step(actor, 1 / 60, frameMs - context.delay());
    return { x: actor.x, z: actor.z, poseState: actor.poseState, delayMs: context.delay() };
  }
  return { actor, MP, context, snapshot, render, setNow(value) { now = value; } };
}

for (const client of clients) {
  test(`${client.name}: measured 20 ms / 34 ms-P95 arrival trace remains bounded`, () => {
    const h = makeHarness(client.html);
    const pattern = [16, 16, 16, 16, 16, 16, 16, 34, 34];
    const gaps = [];
    const stateCounts = { wait: 0, interpolate: 0, predict: 0, damped: 0 };
    let receiveMs = 1000, serverMs = 0, nextFrame = receiveMs, lastX = 0, maxFrameStep = 0, lastDelay = 50;
    h.snapshot(1, serverMs, receiveMs);
    for (let seq = 2; seq <= 181; seq++) {
      const gap = pattern[(seq - 2) % pattern.length];
      gaps.push(gap);
      receiveMs += gap;
      serverMs += 20;
      h.snapshot(seq, serverMs, receiveMs);
      while (nextFrame <= receiveMs) {
        const pose = h.render(nextFrame);
        assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.z), 'render pose stays finite');
        maxFrameStep = Math.max(maxFrameStep, Math.hypot(pose.x - lastX, pose.z - (h.actor._lastTestZ || 0)));
        lastX = pose.x;
        h.actor._lastTestZ = pose.z;
        lastDelay = pose.delayMs;
        stateCounts[['wait', 'interpolate', 'predict', 'damped'][pose.poseState] || 'wait']++;
        nextFrame += 1000 / 60;
      }
    }
    const sorted = gaps.slice().sort((a, b) => a - b);
    const mean = gaps.reduce((sum, x) => sum + x, 0) / gaps.length;
    const p50 = sorted[Math.floor((sorted.length - 1) * .5)];
    const p95 = sorted[Math.floor((sorted.length - 1) * .95)];
    assert.equal(mean, 20, 'synthetic trace has the observed 20 ms average');
    assert.equal(p50, 16, 'short timer-coalesced intervals are represented');
    assert.equal(p95, 34, 'long intervals match the observed approximate P95');
    assert.ok(lastDelay >= 20 && lastDelay < 60, 'Auto smoothing adapts without excessive delay');
    assert.ok(stateCounts.interpolate + stateCounts.predict > 0, 'poses continue to interpolate or predict');
    assert.ok(maxFrameStep < .15, 'ordinary jitter does not create a visible-size one-frame jump');
    assert.equal(h.MP.net.poseSeqMissed || 0, 0, 'continuous snapshot stream has no sequence gaps');
  });

  test(`${client.name}: omitted snapshot is counted and recovers on the next ordered pose`, () => {
    const h = makeHarness(client.html);
    h.snapshot(1, 0, 1000);
    h.snapshot(2, 20, 1020);
    h.snapshot(4, 60, 1060); // sequence 3 / host time 40 ms intentionally omitted
    assert.equal(h.MP.net.poseSeqMissed, 1);
    assert.equal(h.MP.net.poseHostGapMax, 40);
    const pose = h.render(1066.67);
    assert.ok([0, 2].includes(pose.poseState), 'newest valid poses are bracketed or briefly predicted');
    assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.z));
    assert.ok(h.actor.buf.length <= 3, 'one dropped snapshot does not grow the sample queue');
  });

  test(`${client.name}: stale pose eases to its cap and resumes after a long snapshot gap`, () => {
    const h = makeHarness(client.html);
    h.snapshot(1, 0, 1000);
    h.snapshot(2, 20, 1020);
    let last = { x: h.actor.x, z: h.actor.z };
    for (let t = 1036.67; t <= 1303.34; t += 1000 / 60) {
      const pose = h.render(t);
      assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.z));
      last = pose;
    }
    const stalePose = h.render(1320);
    const cappedPosition = { x: stalePose.x, z: stalePose.z };
    h.snapshot(17, 320, 1320); // 300 ms host gap and 14 omitted snapshots
    assert.equal(h.MP.net.poseSeqMissed, 14);
    assert.equal(h.MP.net.poseHostGapMax, 300);
    const resumed = h.render(1336.67);
    const resumeStep = Math.hypot(resumed.x - cappedPosition.x, resumed.z - cappedPosition.z);
    assert.ok(Number.isFinite(resumed.x) && Number.isFinite(resumed.z));
    assert.ok(resumed.poseState === 0 || resumed.poseState === 2, 'stale pose is replaced by a current bracket/prediction');
    assert.ok(resumeStep < .10, `long-gap recovery avoids a hard rendered snap (measured ${resumeStep.toFixed(3)} m)`);
    assert.ok(resumed.delayMs < 60, `isolated 300 ms loss does not inflate the render buffer (measured ${resumed.delayMs} ms)`);
    const initialOffset = Math.hypot(h.actor.poseRecovery?.x || 0, h.actor.poseRecovery?.z || 0);
    assert.ok(initialOffset > 0, 'large host gap starts a temporary visual correction');
    let maxStep = resumeStep, previous = { x: resumed.x, z: resumed.z }, receive = 1320, server = 320;
    for (let seq = 18; seq <= 77; seq++) {
      receive += 20;
      server += 20;
      h.snapshot(seq, server, receive);
      const pose = h.render(receive + 16.67);
      const step = Math.hypot(pose.x - previous.x, pose.z - previous.z);
      maxStep = Math.max(maxStep, step);
      previous = { x: pose.x, z: pose.z };
    }
    assert.ok(maxStep < .10, `recovery remains smooth while snapshots resume (max ${maxStep.toFixed(3)} m/frame)`);
    assert.ok(!h.actor.poseRecovery, 'temporary correction fully converges during healthy snapshot delivery');
  });
}

test('new multiplayer session resets snapshot clock, sequence, and actor buffers on reconnect', () => {
  const html = clients[1].html;
  const closeAt = html.indexOf('ws.onclose = function (event) {');
  const retryAt = html.indexOf('function mpRetry(', closeAt);
  const beginAt = html.indexOf('function mpBegin(m) {');
  const cleanupAt = html.indexOf('function mpCleanup() {', beginAt);
  assert.ok(closeAt >= 0 && retryAt > closeAt && beginAt >= 0 && cleanupAt > beginAt);
  const closeHandler = html.slice(closeAt, retryAt);
  const begin = html.slice(beginAt, cleanupAt);
  assert.match(closeHandler, /if \(MP\.on\) \{ mpCleanup\(\)/, 'disconnect clears the live session before retry');
  assert.match(begin, /MP\.puppets = \{\}/, 'new match has no stale remote actor buffers');
  assert.match(begin, /MP\.snapN = 0/, 'new match starts a new sequence epoch');
  assert.match(begin, /MP\.net = \{ last: 0, n: 0, gapMax: 0, ema: 50, jit: 0/, 'new match resets the host-clock filter');

  const h = makeHarness(html);
  const freshClock = {};
  assert.equal(h.context.poseTime(5200, 5300, freshClock), 5300,
    'fresh host-clock state anchors to the first receive rather than inheriting an old offset');
  assert.equal(freshClock.poseClockLast, 5200);
});

test('offline and phone-host shared remote-pose pipeline remains byte-identical', () => {
  function posePipeline(html){const start=html.indexOf('function mpQueueRemotePose('),end=html.indexOf('function mpEnsureZombie(',start+1);assert.ok(start>=0&&end>start,'remote-pose pipeline is present');return html.slice(start,end).trim();}
  assert.equal(posePipeline(clients[0].html),posePipeline(clients[1].html),'shared remote-pose functions remain in parity');
});

