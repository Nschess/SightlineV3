'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const assetRoot = 'AndroidProject/app/src/main/assets';
const trees = ['www', 'phone-host'];
const reference = process.env.SIGHTLINE_MOVEMENT_REFERENCE;

function section(page, first, last) {
  const start = page.indexOf(first), end = page.indexOf(last, start);
  assert.ok(start >= 0 && end > start, first);
  return page.slice(start, end);
}

function movementContext(page) {
  const context = vm.createContext({
    touchMode: true, touchCrouch: false, touchRun: false, G: { touchAutoSprint: true },
    state: 'live', MP: { on: false }, P: {}, S: { toggleCrouch: false },
    stick: { x: 0, y: 0, ox: 0, oy: 0 }, joyKnob: { style: {} }, mobileGuide: { action() {} },
    proneOn: false, sliding: false, slideCd: 0, freeLook: false, scoped: false, stepT: 0,
    spaceActive: false, jumpQ: false, WEAPONS: { test: { speed: 1, auto: true } }, cur: 'test',
    reloading: 0, bloom: 0, gunKick: 0, thornbloomViewKick: 0, sunforgedViewKick: 0, fireHeld: false,
    P0FrameDiag: { current: () => null }, held: () => false, soloInfectionPlayer: () => false,
    sfxNoise() {}, hearPlayer() {}, buildNav() {}, tryFire() {}
  });
  const stickStart = page.includes('var TOUCH_STICK_DEAD_ZONE') ? 'var TOUCH_STICK_DEAD_ZONE' :
    page.includes('function touchQuietWalk()') ? 'function touchQuietWalk()' : 'function setStick(t)';
  for (const [first, last] of [
    ['function O(x, z, w, d', '/* ---------- shared layered navigation'],
    ['var PR = 0.4;', 'function groundAt'],
    ['function groundAt(', 'function ceilingAt'],
    ['function ceilingAt(', '\nfunction '],
    [stickStart, "tzm.addEventListener('touchstart'"]
  ]) {
    vm.runInContext(section(page, first, last), context);
  }
  vm.runInContext(section(page, 'function updatePlayer(dt)', '  if (alive && G.autoReload') + '\n}', context);
  return context;
}

const courses = [
  { map: 'courtyard', name: 'forward', drag: [0, -50] },
  { map: 'courtyard', name: 'backward', drag: [0, 50] },
  { map: 'courtyard', name: 'strafe', drag: [50, 0] },
  { map: 'courtyard', name: 'diagonal', drag: [40, -40] },
  { map: 'courtyard', name: 'partial-stick threshold', drag: [0, -22] },
  { map: 'courtyard', name: 'mid-stick traversal', drag: [0, -30] },
  { map: 'horror_city', name: 'turn and fire', drag: [0, -50], turn: true, fire: true, ads: true },
  { map: 'horror_city', name: 'partial-stick turn and fire', drag: [0, -22], turn: true, fire: true, ads: true },
  { map: 'horror_city', name: 'precision walk', drag: [0, -16] }
];
const rates = [60, 90, 120];
const round = n => Number(n.toFixed(4));
// DEV24.9 reference traces at 60 Hz. The cadence check also guards the 90/120 Hz runs.
const acceptedAt60 = {
  forward: [0, -10.0139, 10.0139, 5.2],
  backward: [0, 3.6, 3.6, 5.2],
  strafe: [10.0139, 0, 10.0139, 5.2],
  diagonal: [7.0809, -7.0809, 10.0139, 5.2],
  'partial-stick threshold': [0, -5.007, 5.007, 2.6],
  'mid-stick traversal': [0, -6.8277, 6.8277, 3.5455],
  'turn and fire': [-2.6653, -4.95, 6.3858, 3.6378],
  'partial-stick turn and fire': [-1.3327, -3.1379, 3.503, 1.8189],
  'precision walk': [0, -1.8207, 1.8207, .9455]
};

function trace(context, course, hz) {
  const map = context.MAPS.find(m => m.id === course.map);
  assert.ok(map, course.map);
  context.applyMapData(map);
  const { x, z } = map.spawn;
  context.P = { x, z, y: context.groundAt(x, z, 0), vx: 0, vy: 0, vz: 0, yaw: 0, punch: 0,
    pitch: 0, crouch: 0, prone: 0, bob: 0, alive: true, onGround: true };
  context.scoped = !!course.ads;
  context.fireHeld = !!course.fire;
  context.stepT = 0;
  let fireUpdates = 0, distance = 0;
  context.tryFire = () => { fireUpdates++; };
  context.setStick({ clientX: course.drag[0], clientY: course.drag[1] });
  for (let i = 0; i < hz * 2; i++) {
    if (course.turn) context.P.yaw = .42 * i / hz;
    const beforeX = context.P.x, beforeZ = context.P.z;
    context.updatePlayer(1 / hz);
    distance += Math.hypot(context.P.x - beforeX, context.P.z - beforeZ);
  }
  assert.equal(fireUpdates, course.fire ? hz * 2 : 0);
  return { course: course.name, hz, x: round(context.P.x - x), z: round(context.P.z - z),
    distance: round(distance), speed: round(Math.hypot(context.P.vx, context.P.vz)), boxes: context.BOXES.length };
}

test('movement through representative maps stays bounded and consistent across display cadences', () => {
  if (reference) assert.match(reference, /^[0-9a-f]{40}$/);
  for (const tree of trees) {
    const file = assetRoot + '/' + tree + '/index.html';
    const candidate = movementContext(fs.readFileSync(path.join(root, file), 'utf8'));
    const baseline = reference && movementContext(execFileSync('git', ['show', reference + ':' + file],
      { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
    for (const course of courses) {
      const samples = rates.map(hz => trace(candidate, course, hz));
      const read = ({ x, z, distance, speed }) => [x, z, distance, speed];
      const compare = (sample, expected) => read(sample).forEach((value, i) =>
        assert.ok(Math.abs(value - expected[i]) <= .025, `${tree} ${sample.course} ${sample.hz}Hz: ${read(sample)} vs ${expected}`));
      if (acceptedAt60[course.name]) compare(samples[0], acceptedAt60[course.name]);
      if (baseline) {
        const comparisons = rates.map(hz => trace(baseline, course, hz));
        samples.forEach((sample, i) => compare(sample, read(comparisons[i])));
        console.log(JSON.stringify({ tree, course: course.name, baseline: comparisons, candidate: samples }));
      }
      for (const sample of samples) {
        assert.ok(sample.distance > .1 && sample.distance <= 10.41, JSON.stringify(sample));
        assert.ok(sample.speed <= (course.ads ? 3.65 : 5.21), JSON.stringify(sample));
        assert.ok(Math.abs(sample.distance - samples[0].distance) <= .12, JSON.stringify(samples));
      }
    }
  }
});

test('low-travel walking reaches the accepted speed without a dead-zone jump', () => {
  for (const tree of trees) {
    const ctx = movementContext(fs.readFileSync(path.join(root, assetRoot, tree, 'index.html'), 'utf8'));
    const steadySpeed = travel => {
      ctx.setStick({ clientX: 0, clientY: -travel });
      return -ctx.stick.y * ctx.touchMoveGain() * 5.2;
    };
    assert.equal(steadySpeed(5) || 0, 0, tree);
    assert.ok(steadySpeed(5.01) < .003, tree + ' dead-zone continuity');
    assert.ok(steadySpeed(6) > .17, tree + ' responds to a small walking drag');
    for (const travel of [8, 9, 10, 16]) {
      assert.ok(Math.abs(steadySpeed(travel) - travel * 5.2 / 88) < 1e-9, tree + ' DEV24.9 walk speed at ' + travel);
    }
    for (let travel = 5.02; travel <= 10; travel += .01) {
      const change = steadySpeed(travel) - steadySpeed(travel - .01);
      assert.ok(change >= 0 && change < .0031, tree + ' bounded walk response at ' + travel);
    }
    for (const travel of [18, 19, 20, 21, 21.9, 21.99, 22.01, 23, 24, 30, 35, 44]) {
      ctx.setStick({ clientX: 0, clientY: -travel });
      const referenceMagnitude = Math.min(1, travel / 44);
      const blendStart = 18.26 / 44;
      let blend = Math.max(0, Math.min(1, (referenceMagnitude - blendStart) / (.5 - blendStart)));
      blend *= blend * (3 - 2 * blend);
      let expected = referenceMagnitude;
      if (referenceMagnitude < .5) expected *= .5 + .5 * blend;
      const onsetX = Math.min(1, Math.max(0, (travel - 5) / 2));
      expected *= onsetX * onsetX * (3 - 2 * onsetX);
      assert.ok(Math.abs(steadySpeed(travel) - expected * 5.2) < 1e-9,
        tree + ' DEV24.9-scaled movement at ' + travel + 'px');
    }
    ctx.setStick({ clientX: 0, clientY: -21.99 });
    assert.equal(ctx.touchQuietWalk(), true, tree + ' original quiet-walk boundary');
    ctx.setStick({ clientX: 0, clientY: -22.01 });
    assert.equal(ctx.touchQuietWalk(), false, tree + ' original full-speed boundary');
    assert.ok(Math.abs(steadySpeed(22.01) - steadySpeed(21.99)) < .0025, tree + ' blended walk threshold');
    ctx.setStick({ clientX: 0, clientY: -35.19 });
    assert.equal(ctx.touchForwardSprint(), false, tree + ' original auto-sprint boundary');
    ctx.setStick({ clientX: 0, clientY: -35.21 });
    assert.equal(ctx.touchForwardSprint(), true, tree + ' original auto-sprint boundary');
    assert.ok(Math.abs(steadySpeed(50) - 5.2) < 1e-9, tree + ' full-stick speed');
  }
});

test('capped walking keeps movement, combat, camera and LAN input on the accepted frame pose', () => {
  for (const tree of trees) {
    const page = fs.readFileSync(path.join(root, assetRoot, tree, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
    const ctx = movementContext(page);
    const map = ctx.MAPS.find(entry => entry.id === 'courtyard');
    ctx.applyMapData(map);
    const { x, z } = map.spawn;
    ctx.P = { x, z, y: ctx.groundAt(x, z, 0), vx: 0, vy: 0, vz: 0, yaw: .2, pitch: .1,
      punch: 0, crouch: 0, prone: 0, bob: 0, alive: true, onGround: true };
    ctx.scoped = true;
    ctx.fireHeld = true;
    ctx.setStick({ clientX: 0, clientY: -16 });
    const integrate = ctx.updatePlayer;
    let now = 1000, fires = 0, reloads = 0, scheduled = 0;
    const frames = [], packets = [], cameraPose = [];
    const noOp = () => {};
    Object.assign(ctx, {
      MP: { on: true, mode: 'tactical', puppets: {}, ep: 7, lastSend: 0 },
      T: 0, last: now, fpsT: 0, fpsWasPlaying: true, rafHzBest: 60, rafCount: 96, playerCpuEma: 0,
      androidRefreshBridge: {}, androidPerf: { pendingQuality: false }, LAN_DIAG: null, M: null,
      gameContextLost: false, frameSkipNext: false, document: { hidden: false },
      performance: { now: () => now }, P0FrameDiag: { begin: () => null, current: () => null },
      requestAnimationFrame: () => { scheduled++; }, sampleRafCadence: noOp,
      syncAndroidGameTarget: () => 30, updateAndroidRefreshHint: noOp,
      updateLobbyPreviewForFrame: noOp, updateMobileAim: noOp,
      camera: { position: { set: (...position) => { cameraPose.push(position); } }, rotation: {} },
      vb: 0, adsT: 1, SEND_MS: 20, interpMs: () => 65, r4: round, mpSend: packet => packets.push(packet),
      tryFire: () => { fires++; }, finishReload: () => { reloads++; }, reloading: .045,
      updatePlayer(dt) {
        frames.push({ now, dt });
        integrate(dt);
        ctx.syncCamera(dt);
        ctx.mpUpdate(dt);
      }
    });
    vm.runInContext(section(page, 'function effectiveRenderCap(', 'function resetFpsWindow()'), ctx);
    vm.runInContext(section(page, 'function mpUpdate(dt)', '/* ---- combat events ---- */'), ctx);
    vm.runInContext('function syncCamera(dt) {\n' +
      section(page, '  /* camera */\n  var eyeY', '  if (!P.alive && state !==') + '\n}', ctx);
    const frame = section(page, 'function frame(now)', '\nvar slFinishTags');
    assert.match(frame, /updatePlayer\(dt\)[\s\S]*runOfflineBots\(dt\)[\s\S]*renderer\.render\(scene, camera\)/);
    assert.match(section(page, 'function runOfflineBots(dt)', 'function renderOfflineBots('),
      /if \(MP\.on\) \{\s*botStepAcc = 0; botTickRate = 1; updateBots\(dt\); return;/);
    assert.match(page, /function updateBots\(dt\) \{\s*if \(MP\.on\) \{ mpUpdate\(dt\); return; \}/);
    vm.runInContext(frame.slice(0, frame.indexOf('    var botStarted =')) + '\n  }\n}', ctx);
    const callbacks = [1000, 1016.667, 1033.333, 1100, 1116.667, 1133.333];
    for (const time of callbacks) {
      now = time;
      ctx.frame(time);
    }
    assert.equal(scheduled, callbacks.length);
    assert.deepEqual(frames.map(frame => frame.now), [1000, 1033.333, 1100, 1133.333]);
    assert.deepEqual(frames.map(frame => round(frame.dt)), [0, .0333, .05, .0333]);
    assert.equal(fires, frames.length);
    assert.equal(reloads, 1);
    assert.ok(ctx.P.z < z, tree);
    assert.equal(ctx.camera.rotation.y, ctx.P.yaw);
    assert.equal(ctx.camera.rotation.x, ctx.P.pitch + ctx.P.punch);
    assert.equal(cameraPose.length, frames.length);
    assert.deepEqual(packets.map(({x,z}) => [x,z]), cameraPose.map(([x,,z]) => [round(x),round(z)]));
    for (const packet of packets) {
      assert.equal(packet.t, 'in');
      assert.equal(packet.ep, 7);
      assert.equal(packet.wk, 1);
    }
  }
});

test('walking across radar cells keeps map scans off the render path and preserves the radar view', () => {
  for (const tree of trees) {
    const page = fs.readFileSync(path.join(root, assetRoot, tree, 'index.html'), 'utf8');
    const ctx = movementContext(page);
    const rects = [];
    const noOp = () => {};
    ctx.el = { radar: { width: 128 } };
    ctx.rctx = { setTransform: noOp, clearRect: noOp, save: noOp, restore: noOp, beginPath: noOp,
      arc: noOp, clip: noOp, fill: noOp, moveTo: noOp, lineTo: noOp, closePath: noOp,
      fillRect: (...rect) => rects.push(rect) };
    Object.assign(ctx, { ME: { team: 0 }, TEAMS: [{ color: 'blue' }], mates: [], bots: [],
      specCur: null, markerColor: () => 'red' });
    const radarStart = page.includes('var emptyRadarObstacles') ? 'var emptyRadarObstacles' : 'var radarNearbyCache';
    vm.runInContext(section(page, radarStart, '/* ---------- weapons ---------- */'), ctx);

    function drawAt(obstacles, x, z, yaw) {
      ctx.P.x = x; ctx.P.z = z; ctx.P.yaw = yaw;
      rects.length = 0;
      ctx.drawRadar();
      const expected = Array.from(obstacles).filter(o =>
        Math.abs(o.x - x) <= 36 + o.w / 2 && Math.abs(o.z - z) <= 36 + o.d / 2
      ).map(o => [o.x - o.w / 2, o.z - o.d / 2, o.w, o.d]);
      assert.deepEqual(rects, expected, tree + ' ' + ctx.MAPD.id);
    }

    for (const map of ctx.MAPS) {
      ctx.applyMapData(map);
      const obstacles = ctx.OBST;
      const { x0, x1, z0, z1 } = ctx.AREA;
      ctx.P = { alive: true };
      for (const x of [x0, x1, map.spawn.x, (x0 + x1) / 2, x1 + 9]) {
        for (const z of [z0, z1, map.spawn.z, (z0 + z1) / 2]) drawAt(obstacles, x, z, .6);
      }
    }

    for (const mapId of ['courtyard', 'horror_city']) {
      const map = ctx.MAPS.find(m => m.id === mapId);
      ctx.applyMapData(map);
      const obstacles = ctx.OBST;
      let liveWideReads = 0;
      ctx.OBST = new Proxy(obstacles, { get(target, key) {
        if (key === 'length') liveWideReads++;
        return Reflect.get(target, key);
      } });
      const midZ = (ctx.AREA.z0 + ctx.AREA.z1) / 2;
      drawAt(obstacles, map.spawn.x, midZ, 0);
      liveWideReads = 0;
      for (let i = 0; i <= 32; i++) drawAt(obstacles, map.spawn.x, midZ, i * .08);
      assert.equal(liveWideReads, 0, tree + ' stationary map scans');
      const cells = new Set();
      for (let i = 0; i <= 32; i++) {
        const x = ctx.AREA.x0 + (ctx.AREA.x1 - ctx.AREA.x0) * i / 32;
        cells.add(Math.floor(x / 8));
        drawAt(obstacles, x, midZ, i * .08);
      }
      assert.ok(cells.size > 3, tree + ' test crosses multiple radar cells');
      assert.equal(liveWideReads, 0, tree + ' walking map scans');
    }
  }
});
