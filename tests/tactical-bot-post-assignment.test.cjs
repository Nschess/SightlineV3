'use strict';
const assert = require('node:assert/strict');
const host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const { G, players, _t: A } = host;
const oldMode = G.mode, oldMap = G.map, oldPhase = G.phase;
try {
  players.clear();
  G.mode = 'versus'; G.map = 'courtyard'; G.phase = 'lobby';
  players.set(9000, { id:9000, bot:false, alive:true, team:0, x:0, y:0, z:0, yaw:0, hp:100 });
  const bots = Array.from({ length:5 }, () => A.makeBot(0));
  bots.forEach((b, i) => { b.alive=true; b.x=-2+i; b.y=0; b.z=7; });
  const map = A.mapData();
  bots.forEach(b => A.botPickWaypoint(b, map));
  const guards = bots.filter(b => b.ai.guardPlayer);
  assert.equal(guards.length, 1, 'one bot in a five-bot friendly squad receives player-guard duty');
  assert.ok(guards[0].ai.wp, 'guard receives a valid tactical post');
  assert.ok(Math.hypot(guards[0].ai.wp[0], guards[0].ai.wp[1]) > 2.5, 'guard post leaves a clear lane around the player');
  assert.ok(bots.every(b => b.ai.wp), 'every bot receives a patrol/hold position');
  const posts = bots.map(b => ({x:b.ai.wp[0],z:b.ai.wp[1]}));
  for (let i=0;i<posts.length;i++) for (let j=i+1;j<posts.length;j++)
    assert.ok(Math.hypot(posts[i].x-posts[j].x,posts[i].z-posts[j].z)>1.5, 'assigned posts remain spread');
  console.log('PASS: tactical bot posts spread; one of five allies guards the player');
} finally {
  players.clear(); G.mode=oldMode; G.map=oldMap; G.phase=oldPhase;
}
