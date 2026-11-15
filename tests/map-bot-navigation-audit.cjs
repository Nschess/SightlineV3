#!/usr/bin/env node
// Structural and real host-nav reachability audit for every configured map.
// It builds the shipped Nav graph and queries the same A* used by host bots;
// this does not replace rendered or live gameplay QA.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const A = host._t;
const records = [];
const faults = [];
const maps = host.DATA.maps;
const livePathVisitBudget = A.botPathPolicy.maxVisits;
for (const row of maps) {
  host.G.map = row.id;
  const m = A.mapData(), N = A.buildNav(m);
  const reachable = N.reachable.reduce((sum, bit) => sum + (bit ? 1 : 0), 0);
  const routePoints = [];
  for (const fx of [0.08, 0.5, 0.92]) for (const fz of [0.25, 0.75]) {
    const x = m.botSpawn.x0 + (m.botSpawn.x1 - m.botSpawn.x0) * fx;
    const z = m.botSpawn.z0 + (m.botSpawn.z1 - m.botSpawn.z0) * fz;
    // Match botSteer's live per-path visit budget instead of giving the audit
    // a much larger limit than gameplay receives.
    const livePath = A.astar(N, x, z, m.spawn.x, m.spawn.z, 0, 0, livePathVisitBudget);
    const fullPath = A.astar(N, x, z, m.spawn.x, m.spawn.z, 0, 0, 50000);
    const liveEnd = Array.isArray(livePath) && livePath.length ? livePath[livePath.length - 1] : null;
    const fullEnd = Array.isArray(fullPath) && fullPath.length ? fullPath[fullPath.length - 1] : null;
    const liveComplete = !!liveEnd && Math.hypot(liveEnd[0] - m.spawn.x, liveEnd[1] - m.spawn.z) <= 1.5;
    const fullComplete = !!fullEnd && Math.hypot(fullEnd[0] - m.spawn.x, fullEnd[1] - m.spawn.z) <= 1.5;
    routePoints.push({ x:+x.toFixed(1), z:+z.toFixed(1), liveBudgetPathNodes:livePath?.length||0, liveBudgetComplete:liveComplete, fullSearchComplete:fullComplete });
    if (!fullComplete) faults.push(`${row.id}: bot spawn sample (${x.toFixed(1)}, ${z.toFixed(1)}) has no complete route to player spawn`);
  }
  const ratio = reachable / N.nodes.length;
  records.push({ id:row.id, nodes:N.nodes.length, connectedToPlayerSpawn:reachable, reachablePercent:+(ratio*100).toFixed(1), disconnectedNodes:N.nodes.length-reachable, obstacleBoxes:m.boxes.length, liveBudgetPartialSamples:routePoints.filter(p=>!p.liveBudgetComplete).length, spawnSamples:routePoints });
  if (!N.nodes.length || !reachable) faults.push(`${row.id}: no walkable nav nodes connected to player spawn`);
}
const result = { pass:faults.length===0, configuredMapCount:maps.length, mapIds:maps.map(m=>m.id), source:`${path.relative(process.cwd(),path.join(__dirname,'../AndroidProject/app/src/main/assets/phone-host/data.json'))} + shipped navigation.js/A*`, livePathVisitBudget, records, faults, limits:['The pathfinder intentionally returns a legal partial path when it reaches its live search budget; liveBudgetPartialSamples are watch items, not failures.','No WebGL rendering or live player match. Connected-node percentages include elevated or intentionally isolated map geometry; inspect low ratios in game before treating them as defects.'] };
console.log(JSON.stringify(result,null,2));
if (!result.pass) process.exitCode=1;
