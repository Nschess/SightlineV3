'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DATA, G, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const missionMapIds = new Set(['floodline_district', 'iron_junction', 'ridgefall_outpost']);
const priorMaps = DATA.maps.filter(row => !missionMapIds.has(row.id));

test('all legal live-budget partial map routes continue to objectives through bounded replans', () => {
  const previousMap = G.map;
  const visitBudget = _t.botPathPolicy.maxVisits;
  const work = {
    maxMs: Infinity,
    maxLandingChecks: _t.botPathPolicy.maxLandingChecks,
    maxSmoothChecks: _t.botPathPolicy.maxSmoothChecks
  };
  let sampled = 0, partial = 0, completed = 0, maxReplans = 0;
  const mapSummary = [];
  try {
    for (const row of priorMaps) {
      G.map = row.id;
      const map = _t.mapData(), nav = _t.buildNav(map);
      let partialOnMap = 0, maxOnMap = 0;
      for (const fx of [0.08, 0.5, 0.92]) for (const fz of [0.25, 0.75]) {
        sampled++;
        let x = map.botSpawn.x0 + (map.botSpawn.x1 - map.botSpawn.x0) * fx;
        let z = map.botSpawn.z0 + (map.botSpawn.z1 - map.botSpawn.z0) * fz;
        const full = _t.astar(nav, x, z, map.spawn.x, map.spawn.z, 0, 0, 50000, work);
        const route = _t.astar(nav, x, z, map.spawn.x, map.spawn.z, 0, 0, visitBudget, work);
        const goalReached = (end) => !!end && Math.hypot(end[0] - map.spawn.x, end[1] - map.spawn.z) <= 1.5;
        assert.ok(goalReached(full && full[full.length - 1]), `${row.id}: full search confirms sampled objective is reachable`);
        let end = route && route[route.length - 1];
        assert.ok(Array.isArray(route) && route.length, `${row.id}: bounded search returns a legal route`);
        if (goalReached(end)) continue;

        partial++; partialOnMap++;
        let replans = 0, remaining = Math.hypot(map.spawn.x - end[0], map.spawn.z - end[1]);
        while (!goalReached(end) && replans < 80) {
          x = end[0]; z = end[1];
          const nextRoute = _t.astar(nav, x, z, map.spawn.x, map.spawn.z, 0, 0, visitBudget, work);
          assert.ok(Array.isArray(nextRoute) && nextRoute.length, `${row.id}: partial endpoint can be replanned`);
          const next = nextRoute[nextRoute.length - 1];
          const nextRemaining = Math.hypot(map.spawn.x - next[0], map.spawn.z - next[1]);
          assert.ok(Math.hypot(next[0] - x, next[1] - z) > 0.02, `${row.id}: replan advances to a new waypoint`);
          assert.ok(nextRemaining < remaining - 0.01, `${row.id}: replan makes objective progress`);
          end = next; remaining = nextRemaining; replans++;
        }
        assert.ok(goalReached(end), `${row.id}: objective is reached after ${replans} bounded replans`);
        completed++; maxReplans = Math.max(maxReplans, replans); maxOnMap = Math.max(maxOnMap, replans);
      }
      if (partialOnMap) mapSummary.push({ id: row.id, partialRoutes: partialOnMap, maxReplans: maxOnMap });
    }
  } finally {
    G.map = previousMap;
  }
  assert.equal(DATA.maps.length, 22, 'the configured registry contains the 19 existing maps and three Missions maps');
  assert.equal(sampled, 114, 'six deterministic spawn samples are checked per map');
  assert.equal(partial, 54, 'the previously reported 54 partial paths are reproduced');
  assert.equal(completed, 54, 'every reproduced partial route reaches its objective');
  assert.ok(maxReplans <= 4, `all objectives complete within four replans (max=${maxReplans})`);
  console.log(JSON.stringify({ maps: DATA.maps.length, sampled, partial, completed, maxReplans, mapSummary }));
});
