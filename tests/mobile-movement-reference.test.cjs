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
  { map: 'horror_city', name: 'turn and fire', drag: [0, -50], turn: true, fire: true, ads: true },
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
  'turn and fire': [-2.6653, -4.95, 6.3858, 3.6378],
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
      compare(samples[0], acceptedAt60[course.name]);
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
