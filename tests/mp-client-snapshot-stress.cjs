'use strict';

// Deterministic stress simulation of the actual LAN client snapshot and pose
// functions. This is a source/runtime simulation, not Chromium or Wi-Fi proof.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets');
const sourceFiles = ['www/index.html', 'phone-host/index.html'];
const sourceOverrides = { 'www/index.html': process.env.SIGHTLINE_WWW_HTML, 'phone-host/index.html': process.env.SIGHTLINE_PHONE_HTML };
const clients = sourceFiles.map(rel => { const file = path.resolve(sourceOverrides[rel] || path.join(assets, rel)); return { rel, path: file, html: fs.readFileSync(file, 'utf8') }; });
const startMarker = 'function mpQueueRemotePose(';
const endMarker = 'function mpEnsureZombie(';

function axis() { return { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; }
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function percentile(values, p) { const a = values.slice().sort((x, y) => x - y); return a.length ? +a[Math.min(a.length - 1, Math.ceil(a.length * p) - 1)].toFixed(4) : null; }

function actor(id, netBot, xOffset) {
  return { id, netBot, bot: netBot, team: 1, opIndex: 0, skin: 0, name: netBot ? 'remote-bot' : 'remote-human', finishes: {},
    infected: false, x: xOffset, y: 0, z: 0, yaw: 0, pitch: 0, alive: true, wasAlive: true, fall: 0, gone: 0, phase: 0, cr: 0, pr: 0,
    buf: [], poseSamplePool: [], flashT: 0, hurtT: 0, op: { w: 1, h: 1 }, legs: { rotation: { x: 0 } },
    g: { parent: {}, visible: true, position: axis(), rotation: { x: 0, y: 0, z: 0 }, scale: { set() {} } } };
}

function pathAt(serverMs, offset) {
  const t = Math.max(0, serverMs) / 1000;
  if (t < 4) return { x: offset + t * 4, z: 0, yaw: 0 };
  const turnSec = Math.min(.2, t - 4), angle = turnSec / .2 * Math.PI / 2, radius = 4 * .2 / (Math.PI / 2);
  const turnX = radius * Math.sin(angle), turnZ = radius * (1 - Math.cos(angle));
  return t < 4.2 ? { x: offset + 16 + turnX, z: turnZ, yaw: angle } : { x: offset + 16 + radius, z: turnZ + (t - 4.2) * 4, yaw: Math.PI / 2 };
}

function runScenario(html, scenario) {
  const begin = html.indexOf(startMarker), end = html.indexOf(endMarker, begin);
  const interp = html.match(/function interpMs\(\) \{[^\n]+\}/)?.[0];
  if (begin < 0 || end <= begin || !interp) throw new Error('Actual remote snapshot functions not found');

  const receiveOffset = 10000;
  let now = receiveOffset;
  const bot = actor(7, true, 0), human = actor(8, false, 100);
  const corrections = [];
  const MP = { on: true, id: 0, mode: 'versus', net: { last: 0, gapMax: 0, ema: 20, jit: 0, rn: 0 }, snapN: 0,
    puppets: { 7: bot, 8: human }, zombies: {}, weapons: ['pistol'], dirty: false, lobby: null, infStatus: null };
  const context = vm.createContext({ Math, Number, Array, JSON, MP, G: { interp: 0 }, performance: { now: () => now }, scene: { add() {} },
    SightlinePoses: { apply() {}, weapon() {} }, hurtGlow() {}, ensureWorldWeapon() {}, mpApplyWorldFinish() {},
    worldWeaponUsesModelGrip() { return false; }, WORLD_RIGHT_GRIP: { x: 0, y: 1.3, z: -.4 }, WORLD_WEAPON_PRESENTATION: {},
    poseWorldArms() {}, WEAPONS: { pistol: {} }, LAN_DIAG: { missed() {}, snapshot() {}, correction(distance, radians, source) { corrections.push({ distance, radians, source }); } } });
  vm.runInContext(interp + '\n' + html.slice(begin, end) + '\nthis.snapshot=mpSnapshot;this.step=mpPuppetStep;this.delay=interpMs;', context, { timeout: 10000 });

  const frameMs = 1000 / 60, durationMs = 10000, arrivalPattern = scenario.pattern || [16, 16, 16, 16, 16, 16, 16, 34, 34];
  const packets = [];
  let arrival = receiveOffset, patternIndex = 0;
  for (let serverMs = 0, seq = 1; serverMs <= durationMs; serverMs += 20, seq++) {
    if (seq > 1) { arrival += arrivalPattern[patternIndex++ % arrivalPattern.length]; }
    if (scenario.drop && scenario.drop(seq, serverMs)) continue;
    if (scenario.blackout && serverMs >= scenario.blackout.from && serverMs < scenario.blackout.to) continue;
    // Arrival time advances for every host snapshot, including deliberately
    // dropped ones, so the blackout creates exactly the intended receive gap.
    const b = pathAt(serverMs, 0), h = pathAt(serverMs, 100);
    packets.push({ arrival, serverMs, seq, message: { n: seq, st: serverMs, a: [
      [7, b.x, 0, b.z, b.yaw, 0, 0, 0, 0, 1, 0, 0],
      [8, h.x, 0, h.z, h.yaw, 0, 0, 0, 0, 1, 0, 0]
    ], z: [] } });
  }

  const observed = { bot: { errors: [], steps: [], yawSteps: [], recoveryMax: 0 }, human: { errors: [], steps: [], yawSteps: [], recoveryMax: 0 } };
  let nextFrame = receiveOffset, previous = null, delivered = 0, dropped = 0, lastArrival = receiveOffset, maxBufferDepth = 0, timestampRegressions = 0;
  function renderAt(t) {
    now = t;
    const delay = context.delay(), rt = t - delay;
    context.step(bot, frameMs / 1000, rt); context.step(human, frameMs / 1000, rt);
    maxBufferDepth = Math.max(maxBufferDepth, bot.buf.length, human.buf.length);
    const serverRenderMs = rt - receiveOffset;
    for (const [key, u, offset] of [['bot', bot, 0], ['human', human, 100]]) {
      const expected = pathAt(serverRenderMs, offset);
      observed[key].errors.push(Math.hypot(u.x - expected.x, u.z - expected.z));
      if (u.poseRecovery) observed[key].recoveryMax = Math.max(observed[key].recoveryMax, Math.hypot(u.poseRecovery.x, u.poseRecovery.z));
      const prev = previous && previous[key];
      if (prev) { observed[key].steps.push(Math.hypot(u.x - prev.x, u.z - prev.z)); observed[key].yawSteps.push(Math.abs(Math.atan2(Math.sin(u.yaw - prev.yaw), Math.cos(u.yaw - prev.yaw)))); }
    }
    previous = { bot: { x: bot.x, z: bot.z, yaw: bot.yaw }, human: { x: human.x, z: human.z, yaw: human.yaw } };
  }
  for (const packet of packets) {
    while (nextFrame < packet.arrival) { renderAt(nextFrame); nextFrame += frameMs; }
    now = packet.arrival;
    context.snapshot(packet.message); delivered++; lastArrival = packet.arrival;
    for (const u of [bot, human]) {
      maxBufferDepth = Math.max(maxBufferDepth, u.buf.length);
      for (let i = 1; i < u.buf.length; i++) if (u.buf[i].t < u.buf[i - 1].t) timestampRegressions++;
    }
  }
  while (nextFrame <= lastArrival) { renderAt(nextFrame); nextFrame += frameMs; }
  dropped = scenario.packetCount - delivered;

  function stats(key) {
    const x = observed[key];
    return { positionErrorM: { p50: percentile(x.errors, .5), p95: percentile(x.errors, .95), p99: percentile(x.errors, .99), max: +Math.max(...x.errors).toFixed(4) },
      frameStepM: { p95: percentile(x.steps, .95), max: +Math.max(...x.steps).toFixed(4) },
      yawStepRad: { p95: percentile(x.yawSteps, .95), max: +Math.max(...x.yawSteps).toFixed(4) },
      maxResidualCorrectionM: +x.recoveryMax.toFixed(4) };
  }
  return { name: scenario.name, snapshotCount: scenario.packetCount, deliveredSnapshots: delivered, intentionallyDroppedSnapshots: dropped, maxBufferDepth, timestampRegressions,
    sequenceGapsObserved: MP.net.poseSeqMissed || 0, maxReceiveGapMs: +MP.net.gapMax.toFixed(2), maxHostGapMs: MP.net.poseHostGapMax || 0,
    bot: stats('bot'), human: stats('human'), botHumanMaxPositionDivergenceM: +Math.max(...observed.bot.errors.map((_, i) => Math.abs(observed.bot.errors[i] - observed.human.errors[i]))).toFixed(8),
    recoveryEvents: corrections.length, recoveredCorrections: corrections.filter(c => c.source === 'player-pose-recovery').length };
}

function makeScenario(name, opts = {}) {
  const scenario = { name, ...opts, packetCount: 501 };
  return scenario;
}

const results = [];
for (const client of clients) {
  results.push({ client: client.rel, sourceSha256: hash(client.path), scenarios: [
    runScenario(client.html, makeScenario('irregular 50 Hz delivery; 16/34 ms inter-arrival pattern')),
    runScenario(client.html, makeScenario('deterministic 5% packet loss with irregular delivery', { pattern: [8, 12, 16, 18, 20, 22, 24, 40], drop: (seq) => seq % 20 === 0 })),
    runScenario(client.html, makeScenario('300 ms receive blackout then ordered recovery', { blackout: { from: 4000, to: 4300 }, drop: (_seq, serverMs) => serverMs >= 4000 && serverMs < 4300 }))
  ] });
}

if (process.env.SIGHTLINE_MEASURE_ONLY !== '1') {
  for (const result of results) {
    const regular = result.scenarios[0], loss = result.scenarios[1], blackout = result.scenarios[2];
    for (const [name, row] of [['irregular', regular], ['loss', loss], ['blackout', blackout]]) {
      assert.ok(row.botHumanMaxPositionDivergenceM <= 1e-8, `${result.client} ${name}: bot and remote-human poses must match`);
      assert.deepEqual(row.bot, row.human, `${result.client} ${name}: bot and remote-human interpolation metrics must match`);
    assert.ok(row.maxBufferDepth <= 12, `${result.client} ${name}: bounded interpolation buffer`);
    assert.equal(row.timestampRegressions, 0, `${result.client} ${name}: host-timestamp pose queue remains ordered`);
    }
    assert.equal(regular.sequenceGapsObserved, 0);
  assert.ok(regular.bot.positionErrorM.p95 < .15 && regular.bot.frameStepM.max < .15 && regular.bot.yawStepRad.max < .25, `${result.client}: ordinary jitter remains bounded`);
    assert.equal(loss.intentionallyDroppedSnapshots, 25);
    assert.equal(loss.sequenceGapsObserved, 25);
  assert.ok(loss.bot.positionErrorM.p95 < .15 && loss.bot.frameStepM.max < .15 && loss.bot.yawStepRad.max < .25, `${result.client}: 5% loss remains bounded`);
    assert.equal(blackout.maxHostGapMs, 320);
    assert.equal(blackout.recoveredCorrections, 2);
    assert.ok(blackout.bot.frameStepM.max < .15, `${result.client}: positional recovery stays under 0.15 m/frame`);
    assert.ok(blackout.bot.yawStepRad.max < .20, `${result.client}: heading recovery stays under 0.20 rad/frame`);
  }
  const poseHtml = html => { const a = html.indexOf(startMarker), b = html.indexOf(endMarker, a); return html.slice(a, b).trim(); };
  assert.equal(poseHtml(clients[0].html), poseHtml(clients[1].html), 'Offline and phone-host pose pipelines remain byte-identical');
}

const report = { test: 'LAN client deterministic snapshot stress', createdAt: new Date().toISOString(), measureOnly: process.env.SIGHTLINE_MEASURE_ONLY === '1', method: 'actual mpSnapshot/mpPuppetStep/interpMs in Node VM; 50 Hz host snapshots, 60 Hz simulated render; constant-speed path with a smooth 200 ms 90-degree turn; remote bot and remote human share one packet stream',
  thresholds: { botHumanDivergenceM: 1e-8, ordinaryJitterMaxFrameStepM: .15, blackoutRecoveryMaxFrameStepM: .10 },
  limitations: ['Not Chromium/WebGL or rendered visual evidence.', 'No physical Wi-Fi, Android hardware, browser scheduling, GPU frame time, hit registration, collision, or combat presentation.', 'Synthetic linear path and deterministic delivery schedules; it does not substitute for representative LAN telemetry.'], results };

const out = path.resolve(process.env.SIGHTLINE_STRESS_OUT || path.join(root, 'acceptance/lan-bot-client-snapshot-stress-20261114.json'));
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output: out, results: results.map(r => ({ client: r.client, sourceSha256: r.sourceSha256, scenarios: r.scenarios })) }, null, 2));
