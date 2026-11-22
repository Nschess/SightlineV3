'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Rules = require('../AndroidProject/app/src/main/assets/phone-host/gameplay-mode-rules.js');
const Nav = require('../AndroidProject/app/src/main/assets/phone-host/navigation.js');
const Host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const { G, MAPS, players, _t } = Host;
const assets = path.resolve(__dirname, '../AndroidProject/app/src/main/assets');
const html = fs.readFileSync(path.join(assets, 'www/index.html'), 'utf8');

function extractFunction(source, name, nextName) {
  const start = source.indexOf('function ' + name + '(');
  const end = source.indexOf('function ' + nextName + '(', start + 1);
  assert.ok(start >= 0 && end > start, 'function boundary missing: ' + name);
  return source.slice(start, end);
}

test('CMD Offline route serves the actual solo page separately from the LAN host', () => {
  const bat = fs.readFileSync(path.resolve(__dirname, '../SIGHTLINE.bat'), 'utf8');
  const serverSource = fs.readFileSync(path.resolve(__dirname, '../tools/offline-static-server.cjs'), 'utf8');
  assert.match(bat, /if \/I "%~1"=="offline" goto offline/i);
  assert.match(bat, /tools\\offline-static-server\.cjs/);
  assert.match(bat, /open-offline/);
  assert.match(serverSource, /server\.listen\(8090, '127\.0\.0\.1'/);
  assert.match(serverSource, /assets\/www/);
  assert.match(bat, /phone-host/);
  assert.match(bat, /open_offline[\s\S]*127\.0\.0\.1:8090/);
});

test('Offline menu exposes all five modes and routes FFA/Bomb through the real setup path', () => {
  const menu = html.slice(html.indexOf('function renderModePicker()'), html.indexOf('function updatePlayCopy()', html.indexOf('function renderModePicker()')));
  const mapInfo = html.slice(html.indexOf('function renderMapInfo()'), html.indexOf('function setMap(', html.indexOf('function renderMapInfo()')));
  const modeClickStart = html.indexOf("$('#mode-select').addEventListener('click'");
  const click = html.slice(modeClickStart, html.indexOf('function updatePlayCopy()', modeClickStart));
  for (const mode of ['tactical', 'ffa', 'bomb', 'outbreak', 'infection']) assert.match(menu, new RegExp("'" + mode + "'"));
  for (const mode of ['tactical', 'ffa', 'bomb', 'outbreak', 'infection']) assert.ok(click.includes("'" + mode + "'"), 'Current direct mode selector must guard ' + mode);
  assert.match(click, /R\.mode=nextMode;saveObj\(R_KEY,R\);applyRules\(\);refreshSpec\(\);renderOps\(\);renderPlay\(\)/,
    'Current selector persists the chosen mode and refreshes dependent gameplay summaries.');
  assert.match(html, /function startMatch\(\)[\s\S]*if\(R\.mode==='bomb'&&!soloBombPrepareSites\(\)\)/);
  assert.match(html, /if\(ffaMode\)startSoloFFA\(\)/);
  assert.match(html, /if\(bombMode&&!startSoloBombRound\(\)\)/);
  assert.match(mapInfo, /soloBombPrepareSites\(\)[\s\S]*<circle[\s\S]*p\.id/);
  assert.ok(mapInfo.includes('bombSites.A,bombSites.B'), 'Bomb preview must render both validated site markers');
  assert.ok(mapInfo.includes("if (R.mode === 'bomb' && /^[AB]\\s+SITE$/i.test(c.t)) return;"), 'Bomb preview must suppress stale authored A/B site callouts');
  assert.match(html, /bombAttackTeamForSoloRound\(M\.round\)===0\?'Attack · carry the bomb to A\/B, plant and defend it\.'\:'Defend · stop the plant, eliminate attackers or defuse\.'/,
    'The current round HUD gives the player an attacker or defender objective prompt.');
  assert.match(html, /var MPKEY = '[^']+', TEAMKEY = \['blue', 'red'\]/, 'network team 0 is Blue and team 1 is Red');
  assert.match(html, /function beginSoloBombMatch\(\) \{[\s\S]*SOLO_BOMB\.openingTeam = SOLO_BOMB\.nextOpeningTeam === 1 \? 1 : 0;[\s\S]*SOLO_BOMB\.matchStartConfirmed = false;/);
  assert.match(html, /function confirmSoloBombMatchStart\(\) \{[\s\S]*SOLO_BOMB\.state\.round !== 1[\s\S]*SOLO_BOMB\.nextOpeningTeam = 1 - SOLO_BOMB\.openingTeam;/);
  assert.match(html, /function bombAttackTeamForSoloRound\(round\) \{ return SightlineModeRules\.bombAttackTeamForRound\(round,R\.bombBestOf,SOLO_BOMB\.openingTeam\); \}/);
  assert.match(html, /if\(R\.mode==='bomb'\)beginSoloBombMatch\(\);/,
    'site validation selects an opener without consuming the next session side');
  assert.match(html, /if\(bombMode&&M\.round===1\)confirmSoloBombMatchStart\(\);/,
    'only a successful first Bomb round consumes the selected opener');
  assert.match(html, /22 arenas[\s\S]*5 solo modes/);
});

test('all 22 selectable maps validate Offline and LAN geometry, safe spawns, A/B sites, and routes', () => {
  const mapStart = html.indexOf('var MAPS = [');
  const mapEnd = html.indexOf('var CURMAP =', mapStart);
  assert.ok(mapStart >= 0 && mapEnd > mapStart);
  const offlineMapSource = html.slice(mapStart, mapEnd);
  const offlineIds = [...offlineMapSource.matchAll(/\bid\s*:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  assert.deepEqual([...new Set(offlineIds)].sort(), Object.keys(MAPS).sort(), 'Offline map picker and phone-host registry must offer the same set');
  assert.equal(offlineIds.length, 22);
  // Build the Offline map definitions and navigation exactly from the shipped
  // page's map constructors, O(), autoObst(), and its buildNav() collision
  // rectangles. This catches Offline-only geometry drift hidden by ID parity.
  const mapDefsStart = html.indexOf('function O('), mapDefsEnd = html.indexOf('var DEFTEX', mapDefsStart);
  const autoStart = html.indexOf('function autoObst('), autoEnd = html.indexOf('var CURMAP', autoStart);
  assert.ok(mapDefsStart >= 0 && mapDefsEnd > mapDefsStart && autoStart >= 0 && autoEnd > autoStart);
  const offline = vm.createContext({ Math, Array, Object, Number, Uint8Array, Float32Array, Map, Set });
  vm.runInContext(html.slice(mapDefsStart, mapDefsEnd), offline);
  vm.runInContext(html.slice(autoStart, autoEnd), offline);
  assert.equal(offline.MAPS.length, 22, 'actual Offline map constructors must produce 22 maps');
  const offlineById = new Map(offline.MAPS.map(map => [map.id, map]));
  for (const id of Object.keys(MAPS)) {
    const map = offlineById.get(id);
    assert.ok(map, id + ': Offline map constructor missing');
    const area = map.area, cx = (area.x0 + area.x1) / 2, cz = (area.z0 + area.z1) / 2;
    const width = area.x1 - area.x0, depth = area.z1 - area.z0;
    const obstacles = [
      offline.O(cx, area.z0 - .5, width + 2, 1, 6, 'wall'),
      offline.O(cx, area.z1 + .5, width + 2, 1, 6, 'wall'),
      offline.O(area.x0 - .5, cz, 1, depth + 2, 6, 'wall'),
      offline.O(area.x1 + .5, cz, 1, depth + 2, 6, 'wall')
    ].concat(map.obst || [], offline.autoObst(map));
    const boxes = obstacles.map(o => [o.x-o.w/2, o.x+o.w/2, o.z-o.d/2, o.z+o.d/2, o.h, o.bottom || 0]);
    const nav = Nav.build({ area, boxes, optimized: id === 'blackwater_old_quarter' });
    const start = Nav.nearest(nav, map.spawn.x, 0, map.spawn.z);
    nav.reachable = new Uint8Array(nav.nodes.length);
    if (start >= 0) {
      const queue = [start]; nav.reachable[start] = 1;
      for (let i=0; i<queue.length; i++) for (const [next] of nav.edges[queue[i]]) {
        if (!nav.reachable[next]) { nav.reachable[next] = 1; queue.push(next); }
      }
    }
    const sites = Rules.resolveBombSites(nav, area);
    assert.ok(sites, id + ': Offline geometry has no valid A/B site pair');
    for (const site of [sites.A, sites.B]) {
      assert.ok(nav.reachable[site.node], id + ': Offline site ' + site.id + ' is disconnected from player spawn');
      for (const [label, x, z] of [['player spawn', map.spawn.x, map.spawn.z]]) {
        const route = Nav.path(nav, x, 0, z, site.x, site.y, site.z, 50000);
        assert.ok(route && route.length > 1, id + ': Offline ' + label + ' cannot reach site ' + site.id);
      }
    }
    const isSafeSpawn = (n, index, rect, avoid) => nav.reachable[index] && Math.abs(n.y) < .15 &&
      n.x >= Math.max(area.x0 + 1.5, rect.x0) && n.x <= Math.min(area.x1 - 1.5, rect.x1) &&
      n.z >= Math.max(area.z0 + 1.5, rect.z0) && n.z <= Math.min(area.z1 - 1.5, rect.z1) &&
      !Nav.blocked(boxes, n.x, n.y, n.z, .4) && (!avoid || Math.hypot(n.x-avoid.x, n.z-avoid.z) > 1.6);
    const enemyRect = map.botSpawn;
    const allyRect = { x0: map.spawn.x-6, x1: map.spawn.x+6, z0: map.spawn.z-5, z1: map.spawn.z+4 };
    const enemyStart = nav.nodes.find((n, index) => isSafeSpawn(n, index, enemyRect, null));
    const allyStart = nav.nodes.find((n, index) => isSafeSpawn(n, index, allyRect, map.spawn));
    assert.ok(enemyStart, id + ': Offline enemy bot spawn has no reachable, unblocked nav node');
    assert.ok(allyStart, id + ': Offline teammate spawn has no reachable, unblocked nav node');
    for (const [label, point] of [['enemy bot spawn', enemyStart], ['teammate spawn', allyStart]]) {
      for (const site of [sites.A, sites.B]) {
        const route = Nav.path(nav, point.x, point.y, point.z, site.x, site.y, site.z, 50000);
        assert.ok(route && route.length > 1, id + ': Offline ' + label + ' cannot reach site ' + site.id);
      }
    }
  }
  const originalMap = G.map;
  try {
    for (const id of Object.keys(MAPS)) {
      G.map = id;
      const map = _t.mapData(), nav = _t.buildNav(map), sites = Rules.resolveBombSites(nav, map.area);
      assert.ok(sites, id + ': missing A/B sites');
      for (const site of [sites.A, sites.B]) {
        assert.ok(nav.reachable[site.node], id + ': objective node is not reachable');
        for (const [label, x, z] of [['player spawn', map.spawn.x, map.spawn.z], ['bot spawn', (map.botSpawn.x0 + map.botSpawn.x1) / 2, (map.botSpawn.z0 + map.botSpawn.z1) / 2]]) {
          const route = Nav.path(nav, x, 0, z, site.x, site.y, site.z, 50000);
          assert.ok(route && route.length > 1, id + ': ' + label + ' cannot reach site ' + site.id);
          for (const p of route) assert.ok(p.every(Number.isFinite), id + ': route has a non-finite point');
        }
      }
    }
  } finally { G.map = originalMap; }
});

test('Offline bot carrier is selected ahead of the player when an attacking teammate bot exists', () => {
  const start = html.indexOf('function soloActorId('), end = html.indexOf('function soloSafeSpawn(', start);
  const setup = html.slice(start, end) + extractFunction(html, 'soloBombPrepareSide', 'localSquadNode') +
    extractFunction(html, 'startSoloBombRound', 'soloBombDrop') + extractFunction(html, 'bombAttackTeamForSoloRound', 'startSoloBombRound');
  const attacker = { soloId: 11, bombTeam: 0, side: 'ally', alive: true, x: 0, y: 0, z: 0 };
  const ctx = vm.createContext({ SightlineModeRules: Rules, R: { mode: 'bomb', bombBestOf: 3, bombTime: 60, bombSeconds: 20, plantSeconds: 3, defuseSeconds: 4 },
    SOLO_BOMB: { sites: { A: { id: 'A', x: 0, y: 0, z: 0 }, B: { id: 'B', x: 15, y: 0, z: 0 } }, state: null, settings: null, supportMap: 'courtyard', playerTeam: 0 },
    P: { alive: true, x: 0, y: 0, z: 4 }, units: [attacker], M: { round: 1 }, MATE: [], showMsg() {}, updateHud() {} });
  vm.runInContext(setup, ctx);
  assert.equal(ctx.startSoloBombRound(), true);
  assert.equal(ctx.SOLO_BOMB.state.carrierId, attacker.soloId);
});

test('LAN bomb carrier keeps advancing toward the site under visible combat, then holds plant/defuse without movement', () => {
  const oldPlayers = new Map(players);
  const saved = { mode: G.mode, phase: G.phase, map: G.map, round: G.round, score: G.score, time: G.time, phaseEnd: G.phaseEnd,
    settings: _t.BOMB.settings, sites: _t.BOMB.sites, state: _t.BOMB.state, supportMap: _t.BOMB.supportMap, unsupportedReason: _t.BOMB.unsupportedReason };
  try {
    players.clear(); G.mode = 'bomb'; G.phase = 'live'; G.map = 'courtyard'; G.round = 1; G.score = [0, 0]; G.time = 60; G.phaseEnd = Date.now() + 60000;
    const map = _t.mapData(), nav = _t.buildNav(map), sites = Rules.resolveBombSites(nav, map.area), settings = Rules.settings({ plantSeconds: 3, defuseSeconds: 4 });
    _t.BOMB.settings = settings; _t.BOMB.sites = sites; _t.BOMB.supportMap = G.map; _t.BOMB.unsupportedReason = '';
    const carrier = _t.makeBot(0), defender = _t.makeBot(1);
    // Use legal navigation cells with a verified clear LOS. Directly invoking
    // botThink() bypasses botsTick()'s per-tick path budget, so exercise the
    // production scheduler that owns that budget instead of weakening the
    // movement assertion.
    carrier.alive = true; carrier.x = -13.5; carrier.y = 0; carrier.z = -19.5; carrier.homeTeam = 0; carrier.ep = 1;
    defender.alive = true; defender.x = -13.5; defender.y = 0; defender.z = -31.5; defender.homeTeam = 1; defender.ep = 1;
    carrier.ai = _t.newAI(); defender.ai = _t.newAI(); carrier.ai.tacticSeeded = true; defender.ai.tacticSeeded = true;
    carrier.ai.scanT = 10; carrier.ai.seenT = 2; carrier.ai.aimT = 1; carrier.ai.cool = 20; carrier.ai.tgt = defender; carrier.ai.strafeT = 10; carrier.ai.sx = carrier.x; carrier.ai.sz = carrier.z;
    defender.ai.scanT = 10; defender.ai.seenT = 2; defender.ai.aimT = 1; defender.ai.cool = 20; defender.ai.tgt = carrier; defender.ai.strafeT = 10; defender.ai.sx = defender.x; defender.ai.sz = defender.z;
    players.set(carrier.id, carrier); players.set(defender.id, defender);
    const sightDx=defender.x-carrier.x,sightDz=defender.z-carrier.z,sightL=Math.hypot(sightDx,sightDz,1.116-1.65);
    assert.ok(_t.astar(nav,carrier.x,carrier.z,sites.A.x,sites.A.z,carrier.y,sites.A.y,50000), 'carrier starts on a legal route to A');
    assert.ok(_t.wallDist(map,carrier.x,1.65,carrier.z,sightDx/sightL,(1.116-1.65)/sightL,sightDz/sightL,sightL)>=sightL-.05, 'the combat target is actually visible');
    const thinkOnly = (actor, other, at) => { actor.ai.nextThinkAt=at-1; other.ai.nextThinkAt=at+60000; _t.botsTick(.05,at); };
    _t.BOMB.state = Rules.createBombRound({ round: 1, attackTeam: 0, carrierId: carrier.id, sites, settings });
    const initial = Math.hypot(carrier.x - sites.A.x, carrier.z - sites.A.z), now = Date.now();
    thinkOnly(carrier, defender, now);
    assert.equal(carrier.ai.tgt, defender, 'visible combat target remains acquired during objective pursuit');
    assert.ok(Math.hypot(carrier.x - sites.A.x, carrier.z - sites.A.z) < initial, 'visible combat target must not override bomb-site pursuit');
    carrier.x = sites.A.x; carrier.z = sites.A.z; defender.x=sites.A.x+1.2; defender.z=sites.A.z; carrier.ai.tgt = defender; carrier.ai.scanT = 10; carrier.ai.seenT = 2;
    thinkOnly(carrier, defender, now + 50);
    assert.equal(_t.BOMB.state.use && _t.BOMB.state.use.action, 'plant', 'combat visibility must not block the plant start');
    const hold = [carrier.x, carrier.z];
    thinkOnly(carrier, defender, now + 100);
    assert.deepEqual([carrier.x, carrier.z], hold, 'a bot must hold its validated plant position under fire');
    _t.bombTick(now + 3100);
    assert.equal(_t.BOMB.state.phase, 'planted');
    defender.x = sites.A.x+1.2; defender.z = sites.A.z; defender.ai.tgt = carrier; defender.ai.scanT = 10; defender.ai.seenT = 2;
    thinkOnly(defender, carrier, now + 3150);
    assert.equal(_t.BOMB.state.use && _t.BOMB.state.use.action, 'defuse', 'visible combat must not block a defuse start');
    const defuseHold = [defender.x, defender.z];
    thinkOnly(defender, carrier, now + 3200);
    assert.deepEqual([defender.x, defender.z], defuseHold, 'a bot must hold its validated defuse position under fire');
    _t.bombTick(now + 7200);
    assert.equal(_t.BOMB.state.phase, 'defused');
  } finally {
    players.clear(); for (const [id, player] of oldPlayers) players.set(id, player);
    G.mode = saved.mode; G.phase = saved.phase; G.map = saved.map; G.round = saved.round; G.score = saved.score; G.time = saved.time; G.phaseEnd = saved.phaseEnd;
    _t.BOMB.settings = saved.settings; _t.BOMB.sites = saved.sites; _t.BOMB.state = saved.state; _t.BOMB.supportMap = saved.supportMap; _t.BOMB.unsupportedReason = saved.unsupportedReason;
  }
});

test('Offline stepUnit prioritizes Bomb movement during visible combat and preserves combat fire while holding use', () => {
  const solo = extractFunction(html, 'soloActorId', 'soloActorData') + extractFunction(html, 'soloActorData', 'soloActorById') +
    extractFunction(html, 'soloActorById', 'soloSafeSpawn') + extractFunction(html, 'soloBombBotPlan', 'soloBombAlive') +
    extractFunction(html, 'soloBombBotMovement', 'soloBombAlive') + extractFunction(html, 'soloBombUse', 'mpBombUse') +
    extractFunction(html, 'stepUnit', 'stepZombie');
  const site = { id: 'A', x: 10, y: 0, z: 0 }, state = Rules.createBombRound({ round: 1, attackTeam: 0, carrierId: 12,
    sites: { A: site, B: { id: 'B', x: -10, y: 0, z: 0 } }, settings: { plantSeconds: 3 } });
  let shots = 0;
  const ctx = vm.createContext({ SightlineModeRules: Rules, R: { mode: 'bomb', diff: 'normal', bombBestOf: 3, bombTime: 60, bombSeconds: 20, plantSeconds: 3, defuseSeconds: 4 },
    SOLO_BOMB: { state, sites: state.sites, settings: state.settings, playerTeam: 0 }, P: { id: 'player', alive: true, x: 50, y: 0, z: 0, yaw: 0, vx: 0, vz: 0 },
    SOLO_INF: { on: false, chosen: false }, OB: { on: false }, MP: { on: false }, T: 0, state: 'live', units: [], bots: [], mates: [],
    WEAPONS: { rifle: { reload: 2, key: 'rifle', auto: true, mag: 30 } }, MAPD: {}, NAV: {}, DIFF: { normal: { react: 1 } },
    SightlineTactics: {}, SightlinePoses: { apply() {} }, npScratch: {}, steerTo(u,x,z) { return [x,z]; }, turnTo(a,b) { return b; }, resolve() {},
    settleUnitHeight() {}, poseWorldArms() {}, unitShoot() { shots++; }, updateHud() {}, showMsg() {},
    Math, Number, Set, Map, Array, Object, Infinity, isFinite, console });
  const u = { soloId: 12, bombTeam: 0, side: 'ally', slot: 0, alive: true, x: 0, y: 0, z: 0, vx: 0, vy: 0, yaw: 0, pitch: 0, cr: 0, pr: 0,
    hp: 100, maxhp: 100, op: { paceMul: 1, react: 1 }, weapon: 'rifle', weaponPulse: 0, phase: 0, seenT: 2, cool: 0, burst: 0, strafe: 1, strafeT: 10,
    tgt: { id: 'enemy', team: 1, alive: true, x: -3, y: 0, z: 0, cr: 0, pr: 0 }, sees: true, losT: 1, shT: 1, flashT: 0, hurtT: 0, blind: 0, shownT: 0,
    last: { set() {} }, searchUntil: 0, alert: 0, dP: 50, g: { position: {}, rotation: {} }, legs: { rotation: {} }, legR: { rotation: {} } };
  ctx.units.push(u); ctx.ME = { id: 'player' }; ctx.CURMAP = { id: 'courtyard' }; ctx.MAPD = { area: { x0: -50, x1: 50, z0: -50, z1: 50 } };
  vm.runInContext(solo, ctx);
  ctx.stepUnit(u, .05);
  assert.ok(u.x > 0, 'the bot follows its bomb goal even with a visible opponent');
  u.x = site.x; u.z = site.z; u.sees = true; u.tgt.x = 13; u.tgt.z = 0; u.cool = 0; u.seenT = 3;
  ctx.stepUnit(u, .05);
  assert.equal(state.use && state.use.action, 'plant');
  assert.ok(shots > 0, 'bomb interaction does not disable valid combat fire');
  const hold = [u.x, u.z]; ctx.stepUnit(u, .05);
  assert.deepEqual([u.x, u.z], hold, 'the carrier stays inside the authoritative plant radius');
});

test('offline static server resolver rejects traversal and maps assets to local MIME types', () => {
  const { resolveStaticTarget } = require('../tools/offline-static-server.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sightline-offline-www-'));
  try {
    fs.writeFileSync(path.join(root, 'index.html'), '<h1>offline</h1>');
    fs.writeFileSync(path.join(root, 'game.js'), 'void 0;');
    assert.equal(resolveStaticTarget(root, '/').contentType, 'text/html; charset=utf-8');
    assert.equal(resolveStaticTarget(root, '/game.js').contentType, 'text/javascript; charset=utf-8');
    assert.equal(resolveStaticTarget(root, '/%2e%2e/secret.txt'), null);
    assert.equal(resolveStaticTarget(root, '/missing.js'), null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
