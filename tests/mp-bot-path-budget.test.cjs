'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DATA, _t } = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const Nav = require('../AndroidProject/app/src/main/assets/phone-host/navigation.js');
const serverSource = fs.readFileSync(path.join(__dirname, '../AndroidProject/app/src/main/assets/phone-host/server.js'), 'utf8');
const navigationSource = fs.readFileSync(path.join(__dirname, '../AndroidProject/app/src/main/assets/phone-host/navigation.js'), 'utf8');

test('LAN bot path replans use reusable bounded A* work and expose path cost telemetry', () => {
  assert.deepEqual(_t.botPathPolicy, { maxVisits: 450, budgetMs: 4, workBudgetMs: 2.5, maxLandingChecks: 64, maxSmoothChecks: 320 });
  assert.match(serverSource, /pathBudget = 2/);
  assert.match(serverSource, /pathSpentMs<BOT_PATH_BUDGET_MS/);
  assert.match(serverSource, /BOT_PATH_WORK_BUDGET=Object\.freeze\(\{maxMs:2\.5,maxLandingChecks:64,maxSmoothChecks:320\}\)/);
  assert.match(serverSource, /Nav\.prepareCollisionIndex\(OB\.nav\.boxes\)/,'static collision indexing is prepared with the map graph before live bot routing');
  assert.match(serverSource, /A\.path \? 1\.2 \+ Math\.random\(\) \* 0\.8 : 0\.1/);
  assert.match(serverSource, /const roster=\[\.\.\.players\.values\(\)\].*botTickCursor/s);
  assert.ok(Object.hasOwn(_t.botStats, 'pathMaxMs'));
  assert.ok(Object.hasOwn(_t.botStats, 'pathOverBudget'));
  assert.ok(Object.hasOwn(_t.botStats, 'pathBudgetExhausted'));
  assert.match(navigationSource,/function timeBudgetReached\(\)\{return Number\.isFinite\(maxMs\)&&clock\(\)-startedAt>=maxMs;\}/,'finite path budgets are checked at every work step instead of once per eight steps');
  assert.ok(navigationSource.indexOf('const startedAt=Number.isFinite(maxMs)?clock():0;')<navigationSource.indexOf('const s=nearest(N,sx,sy,sz),g=nearest(N,gx,gy,gz);'),'path deadline includes endpoint lookups');
  assert.match(navigationSource,/for\(const \[b,d\]of N\.edges\[a\]\)\{if\(timeBudgetReached\(\)\)\{budgetExhausted=true;break searchLoop;/,'a high-degree node cannot monopolize the event loop after the path deadline');
});

test('moving targets do not force route replans for small position changes',()=>{
  const start=serverSource.indexOf('function botGoalMoved('),end=serverSource.indexOf('\nlet pathBudget',start);
  assert.ok(start>=0&&end>start,'active route-movement helper exists');
  const botGoalMoved=vm.runInNewContext(serverSource.slice(start,end)+'\nbotGoalMoved');
  const route={goal:[0,0,0]};
  assert.equal(botGoalMoved(route,3.5,0,0),false,'small target shifts keep the verified route');
  assert.equal(botGoalMoved(route,7.99,0,0),false,'horizontal repath threshold is 8 m');
  assert.equal(botGoalMoved(route,8.01,0,0),true,'large target shifts may immediately request a route');
  assert.equal(botGoalMoved(route,0,0,.31),true,'a meaningful floor-height change still requests a route');
  assert.equal(botGoalMoved({goal:null},0,0,0),true,'a bot with no previous route still plans immediately');
});

test('static navigation collision index can be prewarmed idempotently before a route uses it', () => {
  const box=[-.5,.5,-.5,.5,2,0],boxes=Array.from({length:48},()=>box.slice());
  assert.equal(Nav.prepareCollisionIndex(boxes),true,'first preparation builds the per-map collision index');
  assert.equal(Nav.prepareCollisionIndex(boxes),false,'repeated preparation reuses the cached index');
  assert.equal(Nav.blocked(boxes,0,0,0),true,'prewarming preserves the exact blocking predicate');
});

test('a failed bot route cannot trigger an unbounded direct obstacle scan', () => {
  assert.equal(_t.walkClear({boxes:[]},0,0,1,0,0,64),true,'short direct fallback still verifies clearance');
  assert.equal(_t.walkClear({boxes:null},0,0,100,0,0,64),false,'long fallback yields before scanning the map');
  assert.match(serverSource,/walkClear\(N,b\.x,b\.z,gx,gz,b\.y,64\)/,'live bot steering caps direct visibility fallback to 64 samples');
});

test('bounded A* returns a legal partial route toward a distant reachable target', () => {
  const map = DATA.maps.find(m => m.id === 'courtyard') || DATA.maps[0];
  const nav = Nav.build(map);
  const start = map.spawn;
  const nearest = Nav.nearest(nav, start.x, 0, start.z);
  assert.ok(nearest >= 0, 'spawn has a navigable node');
  const origin = nav.nodes[nearest];
  let goal = nav.nodes[nearest], best = -1;
  for (const node of nav.nodes) {
    const d = Math.hypot(node.x - origin.x, node.z - origin.z) - Math.abs(node.y - origin.y) * 2;
    if (d > best) { best = d; goal = node; }
  }
  const route = Nav.path(nav, origin.x, origin.y, origin.z, goal.x, goal.y, goal.z, _t.botPathPolicy.maxVisits, {
    maxMs: Infinity,
    maxLandingChecks: _t.botPathPolicy.maxLandingChecks,
    maxSmoothChecks: _t.botPathPolicy.maxSmoothChecks
  });
  assert.ok(Array.isArray(route) && route.length > 1, 'search yields a route or useful bounded partial route');
  assert.ok(route.every(p => p.length === 3 && p.every(Number.isFinite)), 'route nodes remain finite');
  assert.ok(nav.pathDiagnostics.maxVisits <= _t.botPathPolicy.maxVisits);
  assert.ok(nav.pathDiagnostics.maxLandingChecks <= _t.botPathPolicy.maxLandingChecks);
  assert.ok(nav.pathDiagnostics.maxSmoothChecks <= _t.botPathPolicy.maxSmoothChecks);
  const remaining = Math.hypot(goal.x - route.at(-1)[0], goal.z - route.at(-1)[1]);
  assert.ok(remaining < Math.hypot(goal.x - origin.x, goal.z - origin.z), 'partial route makes progress toward its goal');
});

test('LAN path time-budget exhaustion yields bounded work instead of blocking the host tick', () => {
  const map = DATA.maps.find(m => m.id === 'courtyard') || DATA.maps[0];
  const nav = Nav.build(map), start = map.spawn, nearest = Nav.nearest(nav, start.x, 0, start.z);
  assert.ok(nearest >= 0, 'fixture has a navigable spawn');
  const origin = nav.nodes[nearest];
  let goal = origin, farthest = -1;
  for (const node of nav.nodes) {
    const d = Math.hypot(node.x-origin.x,node.z-origin.z)-Math.abs(node.y-origin.y)*2;
    if (d > farthest) { farthest=d; goal=node; }
  }
  Nav.path(nav,origin.x,origin.y,origin.z,goal.x,goal.y,goal.z,_t.botPathPolicy.maxVisits,{maxMs:0,maxLandingChecks:8,maxSmoothChecks:32});
  assert.equal(nav.pathDiagnostics.lastBudgetExhausted,true,'forced zero-time budget is recorded');
  assert.ok(nav.pathDiagnostics.lastVisits < _t.botPathPolicy.maxVisits,'search yields before exhausting the full A* visit limit');
  assert.ok(nav.pathDiagnostics.lastLandingChecks <= 8,'landing visibility checks remain bounded after yielding');
  assert.ok(nav.pathDiagnostics.lastSmoothChecks <= 32,'route smoothing remains bounded after yielding');
});

test('static route-smoothing visibility cache preserves exact routes and avoids repeat collision samples', () => {
  const map=DATA.maps.find(m=>m.id==='courtyard')||DATA.maps[0],nav=Nav.build(map),start=map.spawn;
  const originId=Nav.nearest(nav,start.x,0,start.z);assert.ok(originId>=0,'courtyard spawn has a valid start node');
  const origin=nav.nodes[originId];let goal=origin,best=-1;
  for(const node of nav.nodes){const d=Math.hypot(node.x-origin.x,node.z-origin.z)-Math.abs(node.y-origin.y)*2;if(d>best){best=d;goal=node;}}
  const budget={maxMs:Infinity,maxLandingChecks:10000,maxSmoothChecks:100000};
  nav.smoothVisibilityCache=null;
  const uncached=Nav.path(nav,origin.x,origin.y,origin.z,goal.x,goal.y,goal.z,nav.nodes.length,budget);
  const uncachedSamples=nav.pathDiagnostics.smoothCollisionSamples;
  nav.smoothVisibilityCache=new Map();
  const cold=Nav.path(nav,origin.x,origin.y,origin.z,goal.x,goal.y,goal.z,nav.nodes.length,budget);
  const coldSamples=nav.pathDiagnostics.smoothCollisionSamples;
  const warm=Nav.path(nav,origin.x,origin.y,origin.z,goal.x,goal.y,goal.z,nav.nodes.length,budget);
  assert.deepEqual(cold,uncached,'cached and original collision sampling select the same path');
  assert.deepEqual(warm,uncached,'warm-cache path remains identical');
  assert.ok(nav.pathDiagnostics.smoothCacheHits>0,'repeated static visibility tests are reused');
  assert.ok(nav.pathDiagnostics.smoothCollisionSamples-coldSamples<uncachedSamples,'warm route requires fewer actual collision samples than a cold un-cached route');
  assert.ok(nav.smoothVisibilityCache.size<=16384,'map cache stays within a fixed memory bound');
});
