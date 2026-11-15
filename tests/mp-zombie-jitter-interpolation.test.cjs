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

function makeZombieHarness(html) {
  const start = html.indexOf('function mpQueueRemotePose(');
  const end = html.indexOf('function mpEnsureZombie(', start);
  const interp = html.match(/function interpMs\(\) \{[^\n]+\}/)?.[0];
  assert.ok(start >= 0 && end > start && interp, 'actual remote pose code is present');
  let now = 0;
  const axis = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
  const MP = { on: true, id: 0, mode: 'outbreak', net: { last: 0, ema: 50, jit: 0 }, snapN: 0, puppets: {}, zombies: {}, weapons: [] };
  const scene = { add() {} };
  const context = vm.createContext({
    Math, Number, Array, JSON, MP, G: { interp: 0 }, performance: { now: () => now }, scene,
    SightlinePoses: { apply() {}, weapon() {} }, hurtGlow() {},
    mpEnsureZombie(id, type) {
      let u = MP.zombies[id];
      if (u) return u;
      u = { id, zombie: true, alive: false, wasAlive: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, op: { w: 1, h: 1 }, legs: { rotation: { x: 0 } },
        buf: [], poseSamplePool: [], fall: 1, gone: 0, g: { parent: {}, visible: false, position: axis(), rotation: { x: 0, y: 0, z: 0 }, scale: { set() {} } } };
      MP.zombies[id] = u;
      return u;
    }
  });
  vm.runInContext(interp + '\n' + html.slice(start, end) + '\nthis.delay=interpMs;this.snapshot=mpSnapshot;this.step=mpPuppetStep;', context, { timeout: 10000 });
  const zombie = context.mpEnsureZombie(77, 0);
  function snapshot(seq, serverMs, receiveMs, yawOverride) {
    now = receiveMs;
    const x = serverMs * .002, z = serverMs * .001;
    const yaw = Number.isFinite(yawOverride) ? yawOverride : serverMs < 320 ? 2.9 : -2.9;
    context.snapshot({ n: seq, st: serverMs, a: [], z: [[77, 0, x, z, yaw, 0]] });
  }
  function render(frameMs) {
    now = frameMs;
    context.step(zombie, 1 / 60, frameMs - context.delay());
    return { x: zombie.x, z: zombie.z, yaw: zombie.yaw, poseState: zombie.poseState, recovery: zombie.poseRecovery && { ...zombie.poseRecovery } };
  }
  return { zombie, MP, snapshot, render };
}

for (const client of clients) {
  test(`${client.name}: Outbreak zombie stays continuous under 20 ms / 34 ms-P95 arrival jitter`, () => {
    const h = makeZombieHarness(client.html);
    const pattern = [16, 16, 16, 16, 16, 16, 16, 34, 34], gaps = [];
    let receiveMs = 1000, serverMs = 0, nextFrame = receiveMs, prior = null, maxFrameStep = 0, maxYawStep = 0;
    const observe = frameMs => {
      const pose = h.render(frameMs);
      if (prior) {
        maxFrameStep = Math.max(maxFrameStep, Math.hypot(pose.x - prior.x, pose.z - prior.z));
        maxYawStep = Math.max(maxYawStep, Math.abs(Math.atan2(Math.sin(pose.yaw - prior.yaw), Math.cos(pose.yaw - prior.yaw))));
      }
      prior = { x: pose.x, z: pose.z, yaw: pose.yaw };
    };
    h.snapshot(1, serverMs, receiveMs, 0);
    for (let seq = 2; seq <= 181; seq++) {
      const gap = pattern[(seq - 2) % pattern.length]; gaps.push(gap);
      receiveMs += gap; serverMs += 20;
      h.snapshot(seq, serverMs, receiveMs, serverMs * .0025);
      while (nextFrame <= receiveMs) { observe(nextFrame); nextFrame += 1000 / 60; }
    }
    const ordered = gaps.slice().sort((a, b) => a - b), mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    assert.equal(mean, 20);
    assert.equal(ordered[Math.floor((ordered.length - 1) * .95)], 34);
    assert.ok(maxFrameStep < .15, `no large bot-motion step under ordinary jitter (max ${maxFrameStep.toFixed(3)} m/frame)`);
    assert.ok(maxYawStep < .15, `turning remains continuous under ordinary jitter (max ${maxYawStep.toFixed(3)} rad/frame)`);
    assert.ok(h.zombie.buf.length <= 12, 'zombie pose queue remains bounded');
  });

  test(`${client.name}: established Outbreak zombie eases a long snapshot-gap correction`, () => {
    const h = makeZombieHarness(client.html);
    h.snapshot(1, 0, 1000);
    h.snapshot(2, 20, 1020);
    let last = h.render(1036.67);
    for (let t = 1053.34; t <= 1303.34; t += 1000 / 60) last = h.render(t);
    const beforeGap = { x: last.x, z: last.z, yaw: last.yaw };
    h.snapshot(17, 320, 1320); // 300 ms gap / 14 omitted snapshots
    assert.equal(h.MP.net.poseSeqMissed, 14);
    const resumed = h.render(1336.67);
    assert.ok(resumed.recovery, 'a previously visible zombie starts bounded pose recovery');
    let maxStep = Math.hypot(resumed.x - beforeGap.x, resumed.z - beforeGap.z);
    let maxYawStep = Math.abs(Math.atan2(Math.sin(resumed.yaw - beforeGap.yaw), Math.cos(resumed.yaw - beforeGap.yaw)));
    let previous = { x: resumed.x, z: resumed.z, yaw: resumed.yaw };
    for (let seq = 18, receive = 1340, server = 340; seq <= 77; seq++, receive += 20, server += 20) {
      h.snapshot(seq, server, receive);
      const pose = h.render(receive + 16.67);
      const step = Math.hypot(pose.x - previous.x, pose.z - previous.z);
      maxStep = Math.max(maxStep, step);
      const yawStep = Math.abs(Math.atan2(Math.sin(pose.yaw - previous.yaw), Math.cos(pose.yaw - previous.yaw)));
      maxYawStep = Math.max(maxYawStep, yawStep);
      previous = { x: pose.x, z: pose.z, yaw: pose.yaw };
    }
    assert.ok(maxStep < .10, `long-gap recovery limits a rendered frame correction (max ${maxStep.toFixed(3)} m)`);
    assert.ok(maxYawStep < .15, `long-gap recovery limits an abrupt rendered turn (max ${maxYawStep.toFixed(3)} rad/frame)`);
    assert.ok(!h.zombie.poseRecovery, 'temporary correction converges after healthy delivery resumes');
  });
}
