'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Rules = require('../AndroidProject/app/src/main/assets/phone-host/gameplay-mode-rules.js');
const Host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

const assets = path.resolve(__dirname, '../AndroidProject/app/src/main/assets');

function offlineFunction(file, name, nextName) {
  const html = fs.readFileSync(path.join(assets, file, 'index.html'), 'utf8');
  const start = html.indexOf('function ' + name + '(');
  const end = html.indexOf('function ' + nextName + '(', start + 1);
  assert.ok(start >= 0 && end > start, file + ': cannot extract ' + name);
  return html.slice(start, end);
}

function offlineContext(overrides) {
  const stats = new Map();
  return vm.createContext(Object.assign({
    SightlineModeRules: Rules,
    R: { mode: 'ffa', ffaKills: 5, ffaTime: 60, bombBestOf: 3, bombTime: 60, bombSeconds: 20, plantSeconds: 3, defuseSeconds: 4 },
    SOLO_FFA: { match: null, respawns: new Map(), playerShieldUntil: 0, playerLife: 0 },
    SOLO_BOMB: { sites: null, state: null, settings: null, supportMap: null, playerTeam: 0 },
    T: 0, state: 'live', cur: 'pistol', M: { you: 0, bots: 0, round: 1, money: 800 },
    P: { alive: true, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hp: 100, armor: 0 },
    ME: { id: 'human', team: 0 }, bots: [], units: [], mates: [],
    CURMAP: { id: 'courtyard' }, MAPD: { area: { x0: -30, x1: 30, z0: -30, z1: 30 } }, NAV: { nodes: [] },
    guns: { pistol: { visible: true }, knife: { visible: false } }, el: { scope: { hidden: true } },
    ost(id) { if (!stats.has(id)) stats.set(id, { k: 0, d: 0 }); return stats.get(id); },
    showMsg() {}, updateHud() {}, rebuildTargets() {}, endMatch() { this.state = 'matchend'; },
    soloSafeSpawn() { return { x: 8, y: 0, z: 9 }; },
    fireHeld: false, reloading: 0, scoped: false, proneOn: false, sliding: false,
    SightlineModeRules: Rules,
    showMsg() {}, updateHud() {}, sfxTone() {}, endRound() {},
    P: { alive: true, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hp: 100, armor: 0 },
    SOLO_INF: { on: false }, OB: { on: false },
    guns: { pistol: { visible: true }, knife: { visible: false } },
    M: { you: 0, bots: 0, round: 1, money: 800 }
  }, overrides || {}));
}

function installOfflineFFA(ctx) {
  [
    offlineFunction('www', 'soloActorId', 'soloActorData'),
    offlineFunction('www', 'soloActorById', 'soloSafeSpawn'),
    offlineFunction('www', 'startSoloFFA', 'soloFFAStandings'),
    offlineFunction('www', 'soloFFAStandings', 'soloFFAPlacement'),
    offlineFunction('www', 'soloFFAScore', 'updateSoloFFAScores'),
    offlineFunction('www', 'updateSoloFFAScores', 'finishSoloFFA'),
    offlineFunction('www', 'finishSoloFFA', 'recordSoloFFAElimination'),
    offlineFunction('www', 'recordSoloFFAElimination', 'respawnSoloFFA'),
    offlineFunction('www', 'respawnSoloFFA', 'tickSoloFFA'),
    offlineFunction('www', 'tickSoloFFA', 'soloBombPrepareSites')
  ].forEach(src => vm.runInContext(src, ctx));
}

function installOfflineBomb(ctx) {
  [
    offlineFunction('www', 'soloActorId', 'soloActorData'),
    offlineFunction('www', 'soloActorData', 'soloActorById'),
    offlineFunction('www', 'soloActorById', 'soloSafeSpawn'),
    offlineFunction('www', 'soloBombPrepareSide', 'localSquadNode'),
    offlineFunction('www', 'soloBombDrop', 'soloBombUse'),
    offlineFunction('www', 'soloBombUse', 'mpBombUse'),
    offlineFunction('www', 'soloBombBotPlan', 'soloBombAlive'),
    offlineFunction('www', 'soloBombAlive', 'soloBombCheckRound'),
    offlineFunction('www', 'soloBombCheckRound', 'soloBombTick'),
    offlineFunction('www', 'soloBombTick', 'soloBombPrepareSide'),
    offlineFunction('www', 'startSoloBombRound', 'soloBombDrop'),
    offlineFunction('www', 'bombAttackTeamForSoloRound', 'startSoloBombRound')
  ].forEach(src => vm.runInContext(src, ctx));
}

function actor(id, team, x, z, options = {}) {
  return Object.assign({
    id, team, bot: false, alive: true, spec: false, x, y: 0, z, yaw: 0, pitch: 0, cr: 0, pr: 0, walk: false,
    hp: 100, armor: 0, k: 0, d: 0, hs: 0, ep: 1, money: 800, lostKit: false, rl: null, cur: 'pistol',
    owned: new Set(['pistol', 'knife']), ammo: {}, c: null, hist: [], finishes: {}, spawnShieldUntil: 0,
    lastIn: Date.now(), lastShot: 0, nextShot: 0, msgs: 0, skin: 'default', host: false, rtt: 0
  }, options);
}

test('Offline FFA scores unique life eliminations, respawns safely, and resolves kill-limit/timer winner paths', () => {
  const bots = Array.from({ length: 5 }, (_, i) => ({ soloId: i + 1, op: { id: 'bot-' + i, name: 'Bot ' + i, team: i % 2 }, lifeEpoch: 0, alive: true }));
  let ended = 0, ctx;
  ctx = offlineContext({ bots, M: { you: 0, bots: 0 }, endMatch() { ended++; ctx.state = 'matchend'; } });
  ctx.P.id = 'human';
  installOfflineFFA(ctx);
  ctx.startSoloFFA();
  assert.equal(ctx.SOLO_FFA.match.scores.size, 6, 'human and every bot appear in initial FFA standings');
  assert.equal(ctx.soloFFAStandings().length, 6);
  const first = ctx.recordSoloFFAElimination(ctx.P, bots[0]);
  assert.equal(first.accepted, true);
  assert.equal(ctx.recordSoloFFAElimination(ctx.P, bots[0]).duplicate, true, 'one life cannot score twice');
  bots[0].lifeEpoch++;
  assert.equal(ctx.recordSoloFFAElimination(ctx.P, bots[0]).score, 2, 'a later life may score normally');
  for (let i = 1; i < bots.length; i++) assert.equal(ctx.recordSoloFFAElimination(ctx.P, bots[i]).accepted, true);
  assert.equal(ctx.SOLO_FFA.match.winnerId, -1);
  assert.equal(ended, 1, 'kill limit ends the match exactly once');

  ctx.state = 'live'; ctx.P.alive = false; ctx.SOLO_FFA.respawns.set(-1, 0); ctx.T = 10;
  ctx.guns = { pistol: { visible: true }, knife: { visible: false } };
  ctx.tickSoloFFA();
  assert.equal(ctx.P.alive, true);
  assert.deepEqual([ctx.P.x, ctx.P.y, ctx.P.z], [8, 0, 9]);
  assert.ok(ctx.SOLO_FFA.playerShieldUntil > 10000, 'respawn applies the standard short spawn shield');
  assert.equal(ctx.SOLO_FFA.playerLife, 1);

  // The real timer path calls finishSoloFFA; a unique high score wins and ties draw.
  ctx.SOLO_FFA.match = Rules.createFFA({ killLimit: 20, matchSeconds: 60, startedAt: 0 });
  ctx.SOLO_FFA.match.scores.set(-1, 3); ctx.SOLO_FFA.match.scores.set(1, 1);
  ctx.state = 'live'; ctx.finishSoloFFA('Match time expired');
  assert.equal(ctx.SOLO_FFA.match.winnerId, -1);
  assert.equal(ended, 2);
  const html = fs.readFileSync(path.join(assets, 'www/index.html'), 'utf8');
  assert.match(html, /else if\(R\.mode==='ffa'\)\{if\(roundT<=0\)\{roundT=0;finishSoloFFA\('Match time expired'\);\}\}/,
    'offline game frame invokes the FFA timer completion path');
});

test('Offline Bomb bot roster swaps attack roles, recovers a dropped bomb, plants, and defuses through runtime actions', () => {
  const sites = { A: { id: 'A', x: 0, y: 0, z: 0 }, B: { id: 'B', x: 15, y: 0, z: 0 } };
  const attacker = { soloId: 11, slot: 0, bombTeam: 0, side: 'ally', x: 0, y: 0, z: 0, alive: true };
  const attacker2 = { soloId: 12, slot: 1, bombTeam: 0, side: 'ally', x: 1, y: 0, z: 0, alive: true };
  const defender = { soloId: 21, slot: 0, bombTeam: 1, side: 'foe', x: 0, y: 0, z: 0, alive: true };
  let roundEnd = [];
  const ctx = offlineContext({ R: { mode: 'bomb', bombBestOf: 3, bombTime: 60, bombSeconds: 20, plantSeconds: 3, defuseSeconds: 4 },
    SOLO_BOMB: { sites, state: null, settings: null, supportMap: 'courtyard', playerTeam: 0 },
    P: { alive: false, x: 0, y: 0, z: 0 }, M: { round: 1 }, roundT: 60, units: [attacker, attacker2, defender], bots: [defender], mates: [attacker, attacker2], T: 0,
    endRound(won, why) { roundEnd = [won, why]; } });
  installOfflineBomb(ctx);
  ctx.soloBombPrepareSide(1);
  assert.equal(ctx.bombAttackTeamForSoloRound(1), 0);
  assert.equal(ctx.bombAttackTeamForSoloRound(2), 1, 'attack role changes after the opening half of a best-of-three');
  assert.equal(ctx.bombAttackTeamForSoloRound(3), 1);
  assert.equal(attacker.bombTeam, 0); assert.equal(defender.bombTeam, 1, 'identity stays stable across role changes');

  const cfg = Rules.settings({ bestOf: 3, plantSeconds: 3, defuseSeconds: 4, bombSeconds: 20 });
  ctx.SOLO_BOMB.settings = cfg;
  ctx.SOLO_BOMB.state = Rules.createBombRound({ round: 1, attackTeam: 0, carrierId: attacker.soloId, sites, settings: cfg });
  assert.equal(ctx.soloBombDrop(attacker), true);
  assert.equal(ctx.SOLO_BOMB.state.phase, 'dropped');
  assert.equal(ctx.soloBombBotPlan(attacker2).wait, true);
  assert.equal(ctx.SOLO_BOMB.state.phase, 'carried');
  assert.equal(ctx.SOLO_BOMB.state.carrierId, attacker2.soloId);
  const routeToSite = ctx.soloBombBotPlan(attacker2);
  assert.equal(routeToSite.goal.x, sites.B.x, 'carrier bot receives its selected reachable site as a navigation goal');
  attacker2.x = sites.B.x; attacker2.z = sites.B.z;
  assert.equal(ctx.soloBombBotPlan(attacker2).wait, true);
  assert.equal(ctx.SOLO_BOMB.state.use.action, 'plant');
  ctx.T = 3; ctx.soloBombTick();
  assert.equal(ctx.SOLO_BOMB.state.phase, 'planted');
  assert.equal(ctx.SOLO_BOMB.state.siteId, 'B');
  defender.x = sites.B.x; defender.z = sites.B.z;
  assert.equal(ctx.soloBombBotPlan(defender).wait, true);
  assert.equal(ctx.SOLO_BOMB.state.use.action, 'defuse');
  ctx.T = 7; ctx.soloBombTick();
  assert.equal(ctx.SOLO_BOMB.state.phase, 'defused');
  assert.deepEqual(roundEnd, [false, 'Bomb defused']);

  // The actual next-round constructor flips the attacking roster without changing team identity.
  ctx.M.round = 2; ctx.T = 7; ctx.soloBombPrepareSide(2);
  assert.equal(ctx.startSoloBombRound(), true);
  assert.equal(ctx.SOLO_BOMB.state.attackTeam, 1);
  assert.equal(ctx.SOLO_BOMB.state.carrierId, defender.soloId, 'the newly attacking bot receives the bomb');
  defender.x = sites.A.x; defender.z = sites.A.z;
  assert.equal(ctx.soloBombBotPlan(defender).wait, true);
  ctx.T = 10; ctx.soloBombTick();
  assert.equal(ctx.SOLO_BOMB.state.phase, 'planted');
  ctx.T = 30; ctx.soloBombTick();
  assert.equal(ctx.SOLO_BOMB.state.phase, 'exploded');
  assert.deepEqual(roundEnd, [false, 'Bomb exploded']);
});

test('LAN FFA authoritative death projects one score, queues one respawn, and honors the match clock', () => {
  const { G, players, MAPS, _t } = Host;
  const original = { mode: G.mode, phase: G.phase, map: G.map, score: G.score, time: G.time, kills: G.kills,
    rounds: G.rounds, phaseEnd: G.phaseEnd, match: _t.FFA.match, respawns: new Map(_t.FFA.respawns) };
  const oldPlayers = new Map(players);
  try {
    players.clear(); G.mode = 'ffa'; G.phase = 'live'; G.map = 'courtyard'; G.score = [0, 0]; G.kills = 20;
    const killer = actor(95001, 0, MAPS.courtyard.spawn.x, MAPS.courtyard.spawn.z);
    const victim = actor(95002, 1, MAPS.courtyard.botSpawn.x0 + 5, MAPS.courtyard.botSpawn.z0 + 5, { hp: 10 });
    players.set(killer.id, killer); players.set(victim.id, victim);
    _t.FFA.match = Rules.createFFA({ killLimit: 20, matchSeconds: 60, startedAt: Date.now() }); _t.FFA.respawns.clear();
    G.phaseEnd = Date.now() + 60000;
    _t.damage(killer, victim, 20, false, 'pistol');
    assert.equal(victim.alive, false);
    assert.equal(_t.FFA.match.scores.get(killer.id), 1);
    assert.ok(_t.FFA.respawns.has(victim.id));
    assert.ok(_t.scoreMsg().ffa.some(row => row.id === killer.id && row.k === 1), 'FFA scoreboard projection includes the authoritative kill');
    const due = _t.FFA.respawns.get(victim.id);
    _t.deathmatchTick(due + 1);
    assert.equal(victim.alive, true);
    assert.equal(victim.ep, 2);
    assert.ok(victim.spawnShieldUntil > Date.now());
    assert.equal(_t.FFA.respawns.has(victim.id), false);
    _t.deathmatchTick(G.phaseEnd + 1);
    assert.equal(G.phase, 'matchend');
  } finally {
    players.clear(); for (const [id, p] of oldPlayers) players.set(id, p);
    G.mode = original.mode; G.phase = original.phase; G.map = original.map; G.score = original.score; G.time = original.time;
    G.kills = original.kills; G.rounds = original.rounds; G.phaseEnd = original.phaseEnd;
    _t.FFA.match = original.match; _t.FFA.respawns.clear(); for (const [id, due] of original.respawns) _t.FFA.respawns.set(id, due);
  }
});

test('LAN Bomb bot AI plants and defuses authoritatively; a new round switches attack side', () => {
  const { G, players, MAPS, _t } = Host;
  const original = { mode: G.mode, phase: G.phase, map: G.map, round: G.round, rounds: G.rounds, score: G.score,
    phaseEnd: G.phaseEnd, kills: G.kills, time: G.time, settings: _t.BOMB.settings, sites: _t.BOMB.sites,
    supportMap: _t.BOMB.supportMap, state: _t.BOMB.state, botMode: _t.BOTCFG.mode, t0: _t.BOTCFG.t0, t1: _t.BOTCFG.t1,
    balance: _t.BOTCFG.balance };
  const oldPlayers = new Map(players);
  try {
    players.clear(); G.mode = 'bomb'; G.phase = 'live'; G.map = 'courtyard'; G.round = 1; G.score = [0, 0]; G.kills = 20; G.time = 60;
    G.phaseEnd = Date.now() + 60000; _t.BOMB.settings = Rules.settings({ bestOf: 3, roundSeconds: 60, bombSeconds: 20, plantSeconds: 3, defuseSeconds: 4 });
    const map = _t.mapData(), nav = _t.buildNav(map), sites = Rules.resolveBombSites(nav, map.area);
    assert.ok(sites);
    const attacker = actor(96001, 0, sites.A.x, sites.A.z, { bot: true, ai: { bombGoal: null } });
    const defender = actor(96002, 1, sites.A.x, sites.A.z, { bot: true, ai: { bombGoal: null } });
    attacker.homeTeam = 0; defender.homeTeam = 1;
    players.set(attacker.id, attacker); players.set(defender.id, defender);
    _t.BOMB.sites = sites; _t.BOMB.supportMap = G.map;
    _t.BOMB.state = Rules.createBombRound({ round: 1, attackTeam: 0, carrierId: attacker.id, sites, settings: _t.BOMB.settings });
    _t.bombBotObjective(attacker, Date.now(), true);
    assert.equal(_t.BOMB.state.use.action, 'plant');
    const plantedAt = _t.BOMB.state.use.completeAt + 1;
    _t.bombTick(plantedAt);
    assert.equal(_t.BOMB.state.phase, 'planted');
    _t.bombBotObjective(defender, Date.now(), true);
    assert.equal(_t.BOMB.state.use.action, 'defuse');
    _t.bombTick(_t.BOMB.state.use.completeAt + 1);
    assert.equal(_t.BOMB.state.phase, 'defused');
    assert.equal(G.phase, 'roundend');
    assert.equal(G.score[1], 1);

    // Verify the actual LAN round-start path changes roles at halftime.
    players.clear();
    const p0 = actor(96011, 0, map.spawn.x, map.spawn.z), p1 = actor(96012, 1, map.botSpawn.x0, map.botSpawn.z0);
    players.set(p0.id, p0); players.set(p1.id, p1);
    _t.BOTCFG.mode = 'add'; _t.BOTCFG.t0 = 0; _t.BOTCFG.t1 = 0; _t.BOTCFG.balance = false;
    G.round = 1; G.phase = 'roundend';
    _t.startRound();
    assert.equal(G.round, 2);
    assert.equal(_t.BOMB.state.attackTeam, 1, 'best-of-three changes attack side for round two');
  } finally {
    players.clear(); for (const [id, p] of oldPlayers) players.set(id, p);
    G.mode = original.mode; G.phase = original.phase; G.map = original.map; G.round = original.round; G.rounds = original.rounds;
    G.score = original.score; G.phaseEnd = original.phaseEnd; G.kills = original.kills; G.time = original.time;
    _t.BOMB.settings = original.settings; _t.BOMB.sites = original.sites; _t.BOMB.supportMap = original.supportMap; _t.BOMB.state = original.state;
    _t.BOTCFG.mode = original.botMode; _t.BOTCFG.t0 = original.t0; _t.BOTCFG.t1 = original.t1; _t.BOTCFG.balance = original.balance;
  }
});

