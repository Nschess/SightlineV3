'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Hunt = require('../../AndroidProject/app/src/main/assets/phone-host/zombie-hunt.js');
const SightlineNav = require('../../AndroidProject/app/src/main/assets/phone-host/navigation.js');

const nav = {
  nodes: [{ x: 20, y: 0, z: 0 }],
  edges: [[0]],
  reachable: [1],
  nearest() { return 0; }
};
const fixed = () => 0;

test('visible Outbreak targets become chase goals, then bounded last-known searches', () => {
  const h = Hunt.create(7);
  Hunt.seen(h, { x: 6, y: 0, z: 2 }, 1000);
  assert.equal(h.state, 'chase');
  assert.deepEqual(Hunt.goal(h, nav, { x: 0, y: 0, z: 0 }, 1100, fixed), { x: 6, y: 0, z: 2 });
  const searchGoal = Hunt.goal(h, nav, { x: 0, y: 0, z: 0 }, 2301, fixed);
  assert.equal(h.state, 'search');
  assert.ok(searchGoal && Number.isFinite(searchGoal.x) && Number.isFinite(searchGoal.z));
});

test('heard clues investigate without revealing a live target', () => {
  const h = Hunt.create(8);
  Hunt.hear(h, { x: 4, y: 0, z: -3 }, 1000);
  assert.equal(h.state, 'investigate');
  assert.deepEqual(Hunt.goal(h, nav, { x: 0, y: 0, z: 0 }, 1100, fixed), { x: 4, y: 0, z: -3 });
  assert.equal(h.seen, null);
});

test('blocked routes enter bounded recovery and clear stale sensory memory', () => {
  const h = Hunt.create(9);
  Hunt.seen(h, { x: 6, y: 0, z: 2 }, 1000);
  Hunt.blocked(h, 1100);
  Hunt.blocked(h, 1200);
  Hunt.blocked(h, 1300);
  assert.equal(h.state, 'recover');
  assert.equal(h.seen, null);
  assert.equal(h.heard, null);
  const recoveryGoal = Hunt.goal(h, nav, { x: 0, y: 0, z: 0 }, 1400, fixed);
  assert.equal(h.state, 'recover');
  assert.ok(recoveryGoal && Number.isFinite(recoveryGoal.x));
  Hunt.goal(h, nav, { x: 0, y: 0, z: 0 }, 2501, fixed);
  assert.equal(h.state, 'roam');
});

test('real navigation graph API supplies Outbreak roam and last-known search goals', () => {
  global.SightlineNav = SightlineNav;
  const graph = SightlineNav.build({ area:{x0:-10,x1:10,z0:-10,z1:10}, boxes:[] });
  graph.reachable = new Uint8Array(graph.nodes.length).fill(1);
  const origin = { x:0.5, y:0, z:0.5 };
  const h = Hunt.create(12);
  const roamGoal = Hunt.goal(h, graph, origin, 1000, fixed);
  assert.ok(roamGoal && Number.isFinite(roamGoal.x) && Number.isFinite(roamGoal.z), 'roam goal should resolve through SightlineNav.nearest');
  Hunt.seen(h, { x:6, y:0, z:2 }, 1200);
  Hunt.goal(h, graph, origin, 1250, fixed);
  const searchGoal = Hunt.goal(h, graph, origin, 2501, fixed);
  assert.equal(h.state, 'search');
  assert.ok(searchGoal && Number.isFinite(searchGoal.x) && Number.isFinite(searchGoal.z), 'last-known search goal should use the production graph API');
});
