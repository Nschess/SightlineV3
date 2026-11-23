'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const OfflineRules = require('../AndroidProject/app/src/main/assets/www/gameplay-mode-rules.js');
const HostRules = require('../AndroidProject/app/src/main/assets/phone-host/gameplay-mode-rules.js');
const Host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

const root = path.resolve(__dirname, '..');
const offlinePage = fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/assets/www/index.html'), 'utf8');
const hostSource = fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/server.js'), 'utf8');
const sites = { A: { id: 'A', x: 0, y: 0, z: 0 }, B: { id: 'B', x: 12, y: 0, z: 0 } };

function extractBetween(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, 'source range exists: ' + startText);
  return source.slice(start, end);
}

function pendingPlant(rules, actor, startedAt) {
  const state = rules.createBombRound({
    round: 1,
    attackTeam: 0,
    carrierId: actor.id,
    sites,
    settings: rules.settings({ plantSeconds: 4, bombSeconds: 20 })
  });
  assert.ok(state);
  assert.equal(rules.beginUse(state, actor, 'plant', startedAt), true);
  return state;
}

test('Offline round end clears pending objective progress and rejects a late use request', () => {
  const actor = { id: 10, team: 0, name: 'Attacker', alive: true, x: 2, y: 0, z: 0 };
  const bomb = pendingPlant(OfflineRules, actor, 1000);
  const context = vm.createContext({
    state: 'live', R: { mode: 'bomb' }, SOLO_BOMB: { state: bomb },
    beginnerRun: false, OB: { inf: false },
    SOLO_INF: { on: false }, soloInfectionPlayer() { return false; },
    P: { alive: true }, M: { you: 0, bots: 0, round: 1, money: 800, stats: { shots: 0, hits: 0, hs: 0, kills: 0, deaths: 0 } },
    CFG: { maxMoney: 16000, winBonus: 300, lossBonus: 150 },
    el: { hud: {}, scope: {} }, exitLock() {}, resetTouchMotion() {},
    ME: { team: 0 }, TEAMS: [{ name: 'Blue' }, { name: 'Red' }], foeTeam() { return { name: 'Red' }; },
    recordMatch() {}, showOptionalGoalSummary() {}, showOverlay() {},
    showMsg() {}, updateHud() {}, $() { return { hidden: true }; },
    SightlineModeRules: OfflineRules, soloActorData() { return actor; }
  });
  vm.runInContext(extractBetween(offlinePage, 'function endRound(won, why) {', '\nfunction finishRoundEnd()'), context);
  vm.runInContext(extractBetween(offlinePage, 'function endMatch() {', '\nfunction pause()'), context);
  vm.runInContext(extractBetween(offlinePage, 'function soloBombUse(actor) {', '\nfunction mpBombAction()'), context);

  context.endRound(false, 'round expired during plant');
  assert.equal(context.state, 'roundend');
  assert.equal(context.SOLO_BOMB.state.use, null);
  assert.equal(context.soloBombUse(actor), false, 'a use request after the round transition is rejected');

  context.SOLO_BOMB.state = pendingPlant(OfflineRules, actor, 2000);
  context.state = 'live';
  context.endMatch();
  assert.equal(context.state, 'matchend');
  assert.equal(context.SOLO_BOMB.state.use, null, 'direct match termination also clears pending objective progress');
});

test('LAN timeout clears pending plant progress from round and replicated objective state', () => {
  const { G, players, _t } = Host;
  const priorGame = { mode: G.mode, phase: G.phase, map: G.map, round: G.round, score: G.score, phaseEnd: G.phaseEnd };
  const priorBomb = Object.assign({}, _t.BOMB);
  const priorPlayers = new Map(players);
  const startedAt = Date.now();
  const attacker = { id: 91001, team: 0, name: 'Attacker', alive: true, x: 2, y: 0, z: 0, money: 800, lostKit: false };
  const defender = { id: 91002, team: 1, name: 'Defender', alive: true, x: 8, y: 0, z: 0, money: 800, lostKit: false };
  try {
    players.clear(); players.set(attacker.id, attacker); players.set(defender.id, defender);
    G.mode = 'bomb'; G.phase = 'live'; G.map = 'courtyard'; G.round = 1; G.score = [0, 0]; G.phaseEnd = startedAt + 1000;
    _t.BOMB.settings = HostRules.settings({ plantSeconds: 4, bombSeconds: 20 });
    _t.BOMB.sites = sites;
    _t.BOMB.state = pendingPlant(HostRules, attacker, startedAt);

    _t.bombTick(startedAt + 1001);
    assert.equal(G.phase, 'roundend');
    assert.equal(_t.BOMB.state.phase, 'carried');
    assert.equal(_t.BOMB.state.use, null, 'round timeout cancels the unfinished hold');
    assert.equal(_t.phaseMsg().objective.use, null, 'the roundend phase snapshot has no active hold');
    for (const phase of ['buy', 'roundend', 'matchend']) {
      G.phase = phase;
      assert.equal(_t.bombAction(attacker, 'plant'), false, 'a late LAN action cannot succeed in ' + phase);
      assert.equal(_t.BOMB.state.use, null, 'phase transition does not restore stale progress');
    }
  } finally {
    players.clear(); for (const [id, player] of priorPlayers) players.set(id, player);
    Object.assign(G, priorGame);
    Object.assign(_t.BOMB, priorBomb);
  }
});

test('LAN match termination and forfeit clear pending objective progress', () => {
  const { G, _t } = Host;
  const priorGame = { mode: G.mode, phase: G.phase, score: G.score, phaseEnd: G.phaseEnd };
  const priorBomb = Object.assign({}, _t.BOMB);
  try {
    G.mode = 'bomb'; G.phase = 'live'; G.score = [0, 0];
    _t.BOMB.settings = HostRules.settings({ plantSeconds: 4 });
    _t.BOMB.state = pendingPlant(HostRules, { id: 91003, team: 0, name: 'Attacker', alive: true, x: 2, y: 0, z: 0 }, Date.now());
    _t.endMatch('stress termination');
    assert.equal(G.phase, 'matchend');
    assert.equal(_t.BOMB.state.use, null);
    assert.equal(_t.bombAction({ id: 91003, team: 0, alive: true, x: 2, y: 0, z: 0 }, 'plant'), false);

    G.phase = 'live';
    _t.BOMB.state = pendingPlant(HostRules, { id: 91004, team: 0, name: 'Attacker', alive: true, x: 2, y: 0, z: 0 }, Date.now());
    const sourceLine = hostSource.split(/\r?\n/).find(line => line.startsWith('function endMatchForfeit()'));
    assert.ok(sourceLine, 'host forfeit function is present');
    const context = vm.createContext({
      G, BOMB: _t.BOMB, ModeRules: HostRules, isBomb() { return true; }, now() { return 5000; },
      MATCHEND_SECS: 5, phaseMsg(extra) { return Object.assign({ objective: _t.bombStateMessage() }, extra); }, bcast() {}
    });
    vm.runInContext(sourceLine, context);
    context.endMatchForfeit();
    assert.equal(G.phase, 'matchend');
    assert.equal(_t.BOMB.state.use, null);

    const planted = HostRules.createBombRound({ round: 1, attackTeam: 0, carrierId: 91005, sites, settings: HostRules.settings() });
    planted.phase = 'planted'; planted.siteId = 'A'; planted.x = sites.A.x; planted.y = 0; planted.z = sites.A.z; planted.explodeAt = Date.now() + 20000;
    _t.BOMB.state = planted;
    const defender = { id: 91006, team: 1, alive: true, x: 0, y: 0, z: 0 };
    for (const phase of ['buy', 'roundend', 'matchend']) {
      G.phase = phase;
      assert.equal(_t.bombAction(defender, 'defuse'), false, 'defuse request is rejected during ' + phase);
      assert.equal(_t.BOMB.state.use, null);
    }
  } finally {
    Object.assign(G, priorGame);
    Object.assign(_t.BOMB, priorBomb);
  }
});

test('duplicate LAN start packets during buy do not initialize another Bomb round', () => {
  const { G, players, _t } = Host;
  const priorGame = { mode: G.mode, phase: G.phase, map: G.map, round: G.round, rounds: G.rounds, time: G.time, kills: G.kills, score: G.score, phaseEnd: G.phaseEnd };
  const priorBomb = Object.assign({}, _t.BOMB);
  const priorBots = { mode: _t.BOTCFG.mode, t0: _t.BOTCFG.t0, t1: _t.BOTCFG.t1, balance: _t.BOTCFG.balance };
  const priorPlayers = new Map(players);
  function lobbyPlayer(id, team, host) {
    return {
      id, team, host, name: 'Player ' + id, bot: false, alive: false, spec: false,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hp: 100, armor: 0, money: 800,
      lostKit: false, cur: 'pistol', owned: new Set(['pistol', 'knife']), ammo: {},
      c: null, msgs: 0, ep: 0, lastIn: Date.now(), hist: [], finishes: {},
      spawnShieldUntil: 0, k: 0, d: 0, hs: 0
    };
  }
  try {
    players.clear();
    const host = lobbyPlayer(92001, 0, true), guest = lobbyPlayer(92002, 1, false);
    players.set(host.id, host); players.set(guest.id, guest);
    G.mode = 'bomb'; G.phase = 'lobby'; G.map = 'iron_junction'; G.round = 0; G.rounds = 3; G.time = 90; G.kills = 20; G.score = [0, 0];
    _t.BOMB.settings = HostRules.settings({ bestOf: 3 }); _t.BOMB.state = null; _t.BOMB.nextOpeningTeam = 0; _t.BOMB.openingTeam = 0;
    _t.BOTCFG.mode = 'add'; _t.BOTCFG.t0 = 0; _t.BOTCFG.t1 = 0; _t.BOTCFG.balance = false;

    const request = JSON.stringify({ t: 'start' });
    _t.onMessage(host, request);
    assert.equal(G.phase, 'buy');
    assert.equal(G.round, 1);
    const firstRound = _t.BOMB.state;
    const serializedFirstRound = JSON.stringify(firstRound);
    _t.onMessage(host, request);
    assert.equal(G.phase, 'buy');
    assert.equal(G.round, 1);
    assert.equal(_t.BOMB.state, firstRound);
    assert.equal(JSON.stringify(_t.BOMB.state), serializedFirstRound);
    assert.equal(_t.BOMB.nextOpeningTeam, 0, 'the ignored duplicate does not reserve or consume another opener');
  } finally {
    players.clear(); for (const [id, player] of priorPlayers) players.set(id, player);
    Object.assign(G, priorGame);
    Object.assign(_t.BOMB, priorBomb);
    Object.assign(_t.BOTCFG, priorBots);
  }
});

test('Plant and defuse holds accept the exact 2 m edge and reject points beyond it', () => {
  for (const rules of [OfflineRules, HostRules]) {
    const plantActor = { id: 20, team: 0, alive: true, x: 2, y: 0, z: 0 };
    const plant = rules.createBombRound({ round: 1, attackTeam: 0, carrierId: 20, sites, settings: rules.settings({ plantSeconds: 3 }) });
    assert.equal(rules.beginUse(plant, plantActor, 'plant', 1000), true);
    assert.equal(rules.advance(plant, 4000, plantActor).event, 'planted');

    const beyond = rules.createBombRound({ round: 1, attackTeam: 0, carrierId: 21, sites, settings: rules.settings() });
    assert.equal(rules.beginUse(beyond, { id: 21, team: 0, alive: true, x: 2.0001, y: 0, z: 0 }, 'plant', 1000), false);

    const defuse = rules.createBombRound({ round: 1, attackTeam: 0, carrierId: 20, sites, settings: rules.settings({ defuseSeconds: 4 }) });
    defuse.phase = 'planted'; defuse.siteId = 'A'; defuse.x = sites.A.x; defuse.y = 0; defuse.z = sites.A.z; defuse.explodeAt = 50000;
    const defuser = { id: 22, team: 1, alive: true, x: 2, y: 0, z: 0 };
    assert.equal(rules.beginUse(defuse, defuser, 'defuse', 1000), true);
    assert.equal(rules.advance(defuse, 5000, defuser).event, 'defused');

    const outsideDefuse = rules.createBombRound({ round: 1, attackTeam: 0, carrierId: 20, sites, settings: rules.settings() });
    outsideDefuse.phase = 'planted'; outsideDefuse.siteId = 'A'; outsideDefuse.x = sites.A.x; outsideDefuse.y = 0; outsideDefuse.z = sites.A.z; outsideDefuse.explodeAt = 50000;
    assert.equal(rules.beginUse(outsideDefuse, { id: 23, team: 1, alive: true, x: 2.0001, y: 0, z: 0 }, 'defuse', 1000), false);
  }
});

test('Bomb site validation rejects collapsed A/B anchors instead of relocating sites away from map markers', () => {
  const previousMap = Host.G.map;
  try {
    Host.G.map = 'iron_junction';
    const map = Host._t.mapData(), nav = Host._t.buildNav(map), a = map.bombSites.A;
    const collapsed = { A: a, B: { x: a.x, z: a.z } };
    assert.equal(HostRules.resolveBombSites(nav, map.area, collapsed), null,
      'LAN match setup must reject a collapsed authored site pair');
    assert.equal(OfflineRules.resolveBombSites(nav, map.area, collapsed), null,
      'Offline setup must reject the same malformed site pair');
  } finally {
    Host.G.map = previousMap;
  }
});
