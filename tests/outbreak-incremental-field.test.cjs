'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Nav = require('../AndroidProject/app/src/main/assets/phone-host/navigation.js');

function graph() {
  return {
    x0: 0, z0: 0, w: 3, h: 1,
    nodes: [
      { x: 0.5, y: 0, z: 0.5, k: 0 },
      { x: 1.5, y: 0, z: 0.5, k: 1 },
      { x: 2.5, y: 0, z: 0.5, k: 2 }
    ],
    columns: [[0], [1], [2]],
    edges: [[[1, 1]], [[0, 1], [2, 2]], [[1, 2]]],
    reverse: [[[1, 1]], [[0, 1], [2, 2]], [[1, 2]]],
    dist: null,
    groundDist: null,
    fieldDiagnostics: { started: 0, completed: 0, steps: 0, lastPops: 0, maxPops: 0, lastTotalPops: 0 }
  };
}

test('incremental Outbreak distance field preserves complete path costs and publishes atomically', () => {
  const N = graph();
  const east = [{ x: 2.5, y: 0, z: 0.5 }];
  assert.equal(Nav.fieldStart(N, east), true);
  assert.equal(N.dist, null, 'unfinished work is not exposed as a complete field');
  let calls = 0;
  while (!Nav.fieldStep(N, 1)) calls++;
  assert.ok(calls >= 2, 'field work is split across bounded steps');
  assert.deepEqual(Array.from(N.dist), [3, 2, 0]);
  assert.deepEqual(Array.from(N.groundDist), [3, 2, 0]);

  const previous = N.dist;
  assert.equal(Nav.fieldStart(N, [{ x: 0.5, y: 0, z: 0.5 }]), true);
  assert.notEqual(N.fieldWork.dist, previous, 'a refresh never mutates the last published field');
  assert.deepEqual(Array.from(N.dist), [3, 2, 0]);
  while (!Nav.fieldStep(N, 1)) {}
  assert.deepEqual(Array.from(N.dist), [0, 1, 3]);
  assert.deepEqual(Array.from(N.groundDist), [0, 1, 3]);
  assert.ok(N.fieldDiagnostics.maxPops <= 1);
});

test('synchronous field API remains compatible with existing navigation callers', () => {
  const N = graph();
  const dist = Nav.field(N, [{ x: 1.5, y: 0, z: 0.5 }]);
  assert.deepEqual(Array.from(dist), [1, 0, 2]);
  assert.deepEqual(Array.from(N.groundDist), [1, 0, 2]);
});
