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

function rectDistance(x, z, box) {
  const dx = Math.max(box[0] - x, 0, x - box[1]);
  const dz = Math.max(box[2] - z, 0, z - box[3]);
  return Math.hypot(dx, dz);
}

function clearPlantRing(nav, map, site, radius = 1.8) {
  let clear = 0;
  for (let i = 0; i < 32; i++) {
    const angle = Math.PI * 2 * i / 32;
    const x = site.x + Math.cos(angle) * radius, z = site.z + Math.sin(angle) * radius;
    if (x > map.area.x0 + 0.5 && x < map.area.x1 - 0.5 && z > map.area.z0 + 0.5 && z < map.area.z1 - 0.5 && !Nav.blocked(nav.boxes, x, 0, z)) clear++;
  }
  return clear;
}

function plantZoneOverlaps(map, site) {
  return map.boxes.filter(box => box[4] > 0.35 && (box[5] || 0) < 1.85 && rectDistance(site.x, site.z, box) <= 2.42);
}

function standingCoverWithin(map, site, radius) {
  return map.boxes.filter(box => box[4] >= 1.8 && rectDistance(site.x, site.z, box) <= radius).length;
}

function combinedRouteImbalance(nav, map, sites) {
  const samples = spawnSamples(map), means = {};
  for (const side of ['team0', 'team1']) {
    const paths = samples[side].flatMap(spawn => [sites.A, sites.B].map(site => routeLength(nav, spawn, site)));
    means[side] = paths.reduce((sum, distance) => sum + distance, 0) / paths.length;
  }
  return Math.abs(means.team0 - means.team1) / ((means.team0 + means.team1) / 2);
}

function openSpawnSight(map, samples, site) {
  return Object.fromEntries(['team0', 'team1'].map(side => [side, samples[side].filter(spawn => !map.boxes.some(box => segmentHitsBox(spawn, site, box, 1.5))).length]));
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

test('Floodline B uses existing factory cover and keeps its full plant ring clear', () => {
  const previousMap = Host.G.map;
  try {
    Host.G.map = 'floodline_district';
    const map = Host._t.mapData(), nav = Host._t.buildNav(map);
    const sites = Rules.resolveBombSites(nav, map.area, map.bombSites), samples = spawnSamples(map);
    assert.ok(sites, 'Floodline A/B resolve');
    assert.ok(Math.hypot(sites.B.x - map.bombSites.B.x, sites.B.z - map.bombSites.B.z) <= 1.5, 'B stays beside its authored marker');
    assert.equal(plantZoneOverlaps(map, sites.B).length, 0, 'the 2 m Bomb use area does not overlap collision geometry');
    assert.equal(clearPlantRing(nav, map, sites.B), 32, 'all 32 sampled bot-plant positions at 1.8 m are collision-clear');
    assert.ok(standingCoverWithin(map, sites.B, 5) >= 1, 'existing standing-height factory cover is within 5 m');
    assert.ok(approachSectors(nav, sites.B) >= 5, 'B retains at least five collision-clear approach sectors');

    for (const side of ['team0', 'team1']) for (const site of [sites.A, sites.B]) {
      for (const spawn of samples[side]) routeLength(nav, spawn, site);
    }
    const exposure = openSpawnSight(map, samples, sites.B);
    assert.ok(exposure.team0 <= 2 && exposure.team1 <= 2, 'the move keeps direct spawn-to-site sightlines limited to two samples per side');
    assert.ok(combinedRouteImbalance(nav, map, sites) <= 0.08, 'combined A/B route imbalance remains within 8%');
  } finally {
    Host.G.map = previousMap;
  }
});

test('Ridgefall B gains checkpoint-wall cover without blocking plant or route access', () => {
  const previousMap = Host.G.map;
  try {
    Host.G.map = 'ridgefall_outpost';
    const map = Host._t.mapData(), nav = Host._t.buildNav(map);
    const sites = Rules.resolveBombSites(nav, map.area, map.bombSites), samples = spawnSamples(map);
    assert.ok(sites, 'Ridgefall A/B resolve');
    assert.ok(Math.hypot(sites.B.x - map.bombSites.B.x, sites.B.z - map.bombSites.B.z) <= 1.5, 'B stays beside its authored marker');
    assert.equal(plantZoneOverlaps(map, sites.B).length, 0, 'the 2 m Bomb use area does not overlap collision geometry');
    assert.equal(clearPlantRing(nav, map, sites.B), 32, 'all 32 sampled bot-plant positions at 1.8 m are collision-clear');
    assert.ok(standingCoverWithin(map, sites.B, 5) >= 1, 'the existing checkpoint wall is within 5 m');
    assert.ok(approachSectors(nav, sites.B) >= 5, 'B retains at least five collision-clear approach sectors');

    for (const side of ['team0', 'team1']) for (const site of [sites.A, sites.B]) {
      for (const spawn of samples[side]) routeLength(nav, spawn, site);
    }
    const exposure = openSpawnSight(map, samples, sites.B);
    assert.ok(exposure.team0 <= 1 && exposure.team1 <= 2, 'the move keeps direct spawn-to-site sightlines limited to one Team 0 and two Team 1 samples');
    assert.ok(combinedRouteImbalance(nav, map, sites) <= 0.05, 'combined A/B route imbalance remains within 5%');
  } finally {
    Host.G.map = previousMap;
  }
});
