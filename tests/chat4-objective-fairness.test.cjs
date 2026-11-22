'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const Rules = require('../AndroidProject/app/src/main/assets/phone-host/gameplay-mode-rules.js');
const Nav = require('../AndroidProject/app/src/main/assets/phone-host/navigation.js');

function spawnSamples(map) {
  const team0 = [], team1 = [];
  for (const fx of [0.08, 0.5, 0.92]) for (const fz of [0.1, 0.5, 0.9]) {
    team0.push({ x: map.spawn.x - 6 + fx * 12, z: map.spawn.z - 5 + fz * 9 });
  }
  for (const fx of [0.08, 0.5, 0.92]) for (const fz of [0.25, 0.75]) {
    team1.push({ x: map.botSpawn.x0 + fx * (map.botSpawn.x1 - map.botSpawn.x0), z: map.botSpawn.z0 + fz * (map.botSpawn.z1 - map.botSpawn.z0) });
  }
  return { team0, team1 };
}

function segmentHitsBox(a, b, box, y) {
  if (box[4] <= y || (box[5] || 0) >= y) return false;
  let lo = 0, hi = 1;
  for (const [origin, delta, min, max] of [[a.x, b.x - a.x, box[0], box[1]], [a.z, b.z - a.z, box[2], box[3]]]) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return false;
      continue;
    }
    let near = (min - origin) / delta, far = (max - origin) / delta;
    if (near > far) [near, far] = [far, near];
    lo = Math.max(lo, near);
    hi = Math.min(hi, far);
    if (lo > hi) return false;
  }
  return hi > 0.015 && lo < 0.985;
}

function routeLength(nav, start, goal) {
  const work = { maxMs: Infinity, maxLandingChecks: Host._t.botPathPolicy.maxLandingChecks, maxSmoothChecks: Host._t.botPathPolicy.maxSmoothChecks };
  const route = Host._t.astar(nav, start.x, start.z, goal.x, goal.z, 0, goal.y || 0, 50000, work);
  assert.ok(Array.isArray(route) && route.length, `path exists from (${start.x},${start.z}) to ${goal.id}`);
  const end = route[route.length - 1];
  assert.ok(Math.hypot(end[0] - goal.x, end[1] - goal.z) <= 1.5, `route reaches ${goal.id}`);
  return route.reduce((sum, point, i) => i ? sum + Math.hypot(point[0] - route[i - 1][0], point[1] - route[i - 1][1]) : 0, 0);
}

function approachSectors(nav, site) {
  const sectors = new Set();
  for (let id = 0; id < nav.nodes.length; id++) {
    const node = nav.nodes[id];
    if (Math.abs(node.y) > 0.15 || nav.reachable && !nav.reachable[id]) continue;
    const dx = node.x - site.x, dz = node.z - site.z, radius = Math.hypot(dx, dz);
    if (radius < 2.05 || radius > 9) continue;
    const end = { x: site.x + dx / radius * 1.65, z: site.z + dz / radius * 1.65 };
    const steps = Math.max(1, Math.ceil(Math.hypot(node.x - end.x, node.z - end.z) / 0.15));
    let clear = true;
    for (let i = 1; i <= steps; i++) {
      if (Nav.blocked(nav.boxes, node.x + (end.x - node.x) * i / steps, 0, node.z + (end.z - node.z) * i / steps)) { clear = false; break; }
    }
    if (clear) sectors.add(Math.round((((Math.atan2(dz, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4))) % 8);
  }
  return sectors.size;
}

test('Ridgefall Bomb A avoids the spawn sightline while retaining multi-route, balanced access', () => {
  const previousMap = Host.G.map;
  try {
    Host.G.map = 'ridgefall_outpost';
    const map = Host._t.mapData(), nav = Host._t.buildNav(map);
    const sites = Rules.resolveBombSites(nav, map.area, map.bombSites);
    assert.ok(sites, 'Ridgefall A/B resolve');
    assert.ok(Math.hypot(sites.A.x - map.bombSites.A.x, sites.A.z - map.bombSites.A.z) <= 1.5, 'A stays beside its authored marker');

    const samples = spawnSamples(map);
    for (const side of ['team0', 'team1']) for (const site of [sites.A, sites.B]) {
      for (const spawn of samples[side]) routeLength(nav, spawn, site);
    }

    const directSight = side => samples[side].filter(spawn => !map.boxes.some(box => segmentHitsBox(spawn, sites.A, box, 1.5))).length;
    assert.ok(directSight('team0') <= 1, 'no more than one sampled Team 0 spawn has a direct 1.5 m sightline to A');
    assert.ok(directSight('team1') <= 2, 'no more than two sampled Team 1 spawns have a direct 1.5 m sightline to A');
    assert.ok(approachSectors(nav, sites.A) >= 5, 'A retains at least five collision-clear approach sectors');

    const means = {};
    for (const side of ['team0', 'team1']) {
      const routes = samples[side].flatMap(spawn => [sites.A, sites.B].map(site => routeLength(nav, spawn, site)));
      means[side] = routes.reduce((sum, length) => sum + length, 0) / routes.length;
    }
    const imbalance = Math.abs(means.team0 - means.team1) / ((means.team0 + means.team1) / 2);
    assert.ok(imbalance <= 0.05, `combined A/B route-length imbalance remains <=5% (actual ${(imbalance * 100).toFixed(1)}%)`);
  } finally {
    Host.G.map = previousMap;
  }
});
