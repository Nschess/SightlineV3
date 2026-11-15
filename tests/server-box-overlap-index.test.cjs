'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const { G, DATA, _t } = host;

function bruteOverlap(map, x, z, pad) {
  return map.boxes.some(b => x > b[0] - pad && x < b[1] + pad && z > b[2] - pad && z < b[3] + pad);
}

test('spatial broadphase preserves exact box-overlap answers across all host maps and gameplay padding', () => {
  let seed = 0x51A71E;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
  for (const row of DATA.maps) {
    G.map = row.id;
    const map = _t.mapData();
    const { x0, x1, z0, z1 } = map.area;
    const points = [];
    for (let i = 0; i < 400; i++) points.push([x0 + random() * (x1 - x0), z0 + random() * (z1 - z0)]);
    for (const b of map.boxes) {
      const cx = (b[0] + b[1]) / 2, cz = (b[2] + b[3]) / 2;
      points.push([b[0] - 1.26, cz], [b[0] - 1.24, cz], [b[1] + 1.24, cz], [b[1] + 1.26, cz]);
      points.push([cx, b[2] - 1.26], [cx, b[2] - 1.24], [cx, b[3] + 1.24], [cx, b[3] + 1.26]);
    }
    for (const pad of [0.4, 0.65, 0.8, 0.9, 1.2]) for (const [x, z] of points) {
      assert.equal(_t.boxOverlap(map, x, z, pad), bruteOverlap(map, x, z, pad), `${row.id} at ${x},${z} pad=${pad}`);
    }
  }
});
