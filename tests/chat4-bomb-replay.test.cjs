'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const HostRules = require('../AndroidProject/app/src/main/assets/phone-host/gameplay-mode-rules.js');
const OfflineRules = require('../AndroidProject/app/src/main/assets/www/gameplay-mode-rules.js');
const root = path.resolve(__dirname, '..');
const hostSource = fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/server.js'), 'utf8');
const offlinePage = fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/assets/www/index.html'), 'utf8');

function extractFunction(source, name, nextName) {
  const start = source.indexOf('function ' + name + '(');
  const end = source.indexOf('function ' + nextName + '(', start + 1);
  assert.ok(start >= 0 && end > start, 'cannot extract ' + name);
  return source.slice(start, end);
}

test('shared Bomb rules alternate the opening side and preserve the existing half-match switch', () => {
  assert.equal(fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/assets/www/gameplay-mode-rules.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/gameplay-mode-rules.js'), 'utf8'),
    'Offline and host consume matching Bomb rules');

  const sequence = opening => [1, 2, 3, 4, 5].map(round => HostRules.bombAttackTeamForRound(round, 5, opening));
  assert.deepEqual(sequence(0), [0, 0, 1, 1, 1]);
  assert.deepEqual(sequence(1), [1, 1, 0, 0, 0]);
  assert.deepEqual(sequence(0).map((team, index) => team === sequence(1)[index]), [false, false, false, false, false]);
  assert.equal(OfflineRules.bombAttackTeamForRound(1, 5, 1), 1);
  assert.equal(OfflineRules.bombAttackTeamForRound(3, 5, 1), 0);
});

test('Offline Bomb replay cursor advances only after its first round starts successfully', () => {
  assert.match(offlinePage, /var SOLO_BOMB = \{[^}]*openingTeam: 0, nextOpeningTeam: 0, matchStartConfirmed: false \}/,
    'a page reload resets the in-memory cursor and pending-start flag');
  const context = vm.createContext({
    SightlineModeRules: OfflineRules,
    R: { bombBestOf: 5 },
    SOLO_BOMB: { openingTeam: 0, nextOpeningTeam: 0, matchStartConfirmed: false, state: null }
  });
  vm.runInContext(extractFunction(offlinePage, 'beginSoloBombMatch', 'bombAttackTeamForSoloRound'), context);
  vm.runInContext(extractFunction(offlinePage, 'confirmSoloBombMatchStart', 'bombAttackTeamForSoloRound'), context);
  vm.runInContext(extractFunction(offlinePage, 'bombAttackTeamForSoloRound', 'startSoloBombRound'), context);

  const startMatch = extractFunction(offlinePage, 'startMatch', 'nextRound');
  const validateAt = startMatch.indexOf("if(R.mode==='bomb'&&!soloBombPrepareSites())");
  const selectAt = startMatch.indexOf("if(R.mode==='bomb')beginSoloBombMatch();");
  assert.ok(validateAt >= 0 && selectAt > validateAt, 'failed map validation must not select a pending opener');
  const beginRound = extractFunction(offlinePage, 'beginRound', 'endRound');
  const failAt = beginRound.indexOf('if(bombMode&&!startSoloBombRound())');
  const confirmAt = beginRound.indexOf('if(bombMode&&M.round===1)confirmSoloBombMatchStart();');
  assert.ok(failAt >= 0 && confirmAt > failAt, 'a failed first-round constructor must not consume the opener');

  const matchSequence = () => [1, 2, 3, 4, 5].map(round => context.bombAttackTeamForSoloRound(round));
  context.beginSoloBombMatch();
  assert.deepEqual(matchSequence(), [0, 0, 1, 1, 1]);
  assert.equal(context.SOLO_BOMB.nextOpeningTeam, 0, 'entering buy does not consume a match opener');
  assert.equal(context.confirmSoloBombMatchStart(), false, 'cancellation with no first-round Bomb state leaves the cursor untouched');
  context.beginSoloBombMatch(); // Retry after cancellation: same pending opener.
  assert.deepEqual(matchSequence(), [0, 0, 1, 1, 1]);
  context.SOLO_BOMB.state = { round: 1 };
  assert.equal(context.confirmSoloBombMatchStart(), true);
  assert.equal(context.SOLO_BOMB.nextOpeningTeam, 1);
  assert.equal(context.confirmSoloBombMatchStart(), false, 'duplicate confirmation cannot advance twice');

  context.SOLO_BOMB.state = null; // Failed round initialization on the next match.
  context.beginSoloBombMatch();
  assert.deepEqual(matchSequence(), [1, 1, 0, 0, 0]);
  assert.equal(context.confirmSoloBombMatchStart(), false);
  assert.equal(context.SOLO_BOMB.nextOpeningTeam, 1);
  context.beginSoloBombMatch(); // Retry keeps the same opener after failed initialization.
  assert.deepEqual(matchSequence(), [1, 1, 0, 0, 0]);
  context.SOLO_BOMB.state = { round: 1 };
  assert.equal(context.confirmSoloBombMatchStart(), true);
  assert.equal(context.SOLO_BOMB.nextOpeningTeam, 0);

  const reloaded = vm.createContext({ SightlineModeRules: OfflineRules, R: { bombBestOf: 5 }, SOLO_BOMB: { openingTeam: 0, nextOpeningTeam: 0, matchStartConfirmed: false, state: null } });
  vm.runInContext(extractFunction(offlinePage, 'beginSoloBombMatch', 'bombAttackTeamForSoloRound'), reloaded);
  vm.runInContext(extractFunction(offlinePage, 'bombAttackTeamForSoloRound', 'startSoloBombRound'), reloaded);
  reloaded.beginSoloBombMatch();
  assert.deepEqual([1, 2, 3, 4, 5].map(round => reloaded.bombAttackTeamForSoloRound(round)), [0, 0, 1, 1, 1],
    'a page reload resets the in-memory replay cursor to Team 0');
});

test('LAN match replays alternate opening sides and publish the authoritative role in phase and objective state', () => {
  const { G, players, _t } = Host;
  const originalGame = { mode: G.mode, phase: G.phase, map: G.map, round: G.round, rounds: G.rounds, time: G.time,
    kills: G.kills, score: G.score, phaseEnd: G.phaseEnd, liveStart: G.liveStart, lastWin: G.lastWin };
  const originalBomb = { settings: _t.BOMB.settings, sites: _t.BOMB.sites, state: _t.BOMB.state, supportMap: _t.BOMB.supportMap,
    unsupportedReason: _t.BOMB.unsupportedReason, openingTeam: _t.BOMB.openingTeam, nextOpeningTeam: _t.BOMB.nextOpeningTeam,
    matchStartConfirmed: _t.BOMB.matchStartConfirmed, score: _t.BOMB.score };
  const originalBots = { mode: _t.BOTCFG.mode, t0: _t.BOTCFG.t0, t1: _t.BOTCFG.t1, balance: _t.BOTCFG.balance };
  const oldPlayers = new Map(players);
  const floodline = Host.MAPS.floodline_district;
  const authoredFloodlineSites = floodline.bombSites;
  try {
    players.clear();
    G.mode = 'bomb'; G.phase = 'lobby'; G.map = 'floodline_district'; G.round = 0; G.rounds = 3; G.time = 90;
    G.kills = 20; G.score = [0, 0]; G.phaseEnd = 0; G.liveStart = 0; G.lastWin = -1;
    _t.BOMB.settings = HostRules.settings({ bestOf: 5 }); _t.BOMB.sites = null; _t.BOMB.state = null;
    _t.BOMB.supportMap = ''; _t.BOMB.unsupportedReason = ''; _t.BOMB.openingTeam = 0; _t.BOMB.nextOpeningTeam = 0; _t.BOMB.matchStartConfirmed = false;
    _t.BOTCFG.mode = 'add'; _t.BOTCFG.t0 = 0; _t.BOTCFG.t1 = 0; _t.BOTCFG.balance = false;

    floodline.bombSites = { A: { x: floodline.area.x0, z: 0 }, B: authoredFloodlineSites.B };
    assert.equal(_t.startMatch(), false, 'invalid authored sites reject match initialization');
    assert.equal(_t.BOMB.nextOpeningTeam, 0, 'failed site validation does not consume an opener');
    floodline.bombSites = authoredFloodlineSites;

    // A validated match can be canceled during buy before its first live round.
    assert.notEqual(_t.startMatch(), false);
    assert.equal(_t.BOMB.state.attackTeam, 0);
    assert.equal(_t.BOMB.nextOpeningTeam, 0, 'pre-live initialization only reserves the opener');
    _t.backToLobby();
    assert.equal(_t.BOMB.nextOpeningTeam, 0, 'canceling before live play preserves the opener');

    const authoredSitesByMap = new Map();
    const maps = ['floodline_district', 'ridgefall_outpost', 'floodline_district', 'ridgefall_outpost'];
    for (const [index, opening] of [0, 1, 0, 1].entries()) {
      G.phase = 'lobby';
      G.map = maps[index];
      _t.startMatch();
      assert.equal(G.round, 1);
      assert.equal(_t.BOMB.state.attackTeam, opening);
      assert.equal(_t.BOMB.nextOpeningTeam, opening, 'the pending opener is not advanced before the first round goes live');
      const phase = _t.phaseMsg();
      assert.equal(phase.attackTeam, opening);
      assert.equal(phase.objective.attackTeam, opening);
      const sites = JSON.stringify(_t.BOMB.state.sites);
      if (authoredSitesByMap.has(G.map)) assert.equal(sites, authoredSitesByMap.get(G.map), 'replays keep the selected map’s authored sites');
      else authoredSitesByMap.set(G.map, sites);

      _t.goLive();
      assert.equal(_t.BOMB.matchStartConfirmed, true);
      assert.equal(_t.BOMB.nextOpeningTeam, 1 - opening, 'a live match consumes its opener exactly once');
      assert.equal(_t.phaseMsg().attackTeam, opening);
      assert.equal(_t.phaseMsg().objective.attackTeam, opening);
      _t.goLive();
      assert.equal(_t.BOMB.nextOpeningTeam, 1 - opening, 'repeated live notifications do not consume a second opener');

      G.round = 2; G.phase = 'roundend';
      _t.startRound();
      assert.equal(G.round, 3);
      assert.equal(_t.BOMB.state.attackTeam, 1 - opening, 'the existing halfway side switch remains intact');
      assert.equal(_t.phaseMsg().objective.attackTeam, 1 - opening);
      _t.backToLobby();
      assert.equal(_t.BOMB.nextOpeningTeam, 1 - opening, 'match completion or lobby return keeps the session cursor');
    }

    const nextOpening = _t.BOMB.nextOpeningTeam;
    G.mode = 'versus'; G.phase = 'lobby';
    _t.startMatch();
    assert.equal(_t.BOMB.nextOpeningTeam, nextOpening, 'non-Bomb matches do not consume a Bomb opener');
    assert.match(hostSource, /case 'start': \{\s*if \(!p\.host \|\| G\.phase !== 'lobby'\) return;/,
      'duplicate network start messages are ignored after the host leaves lobby');
    assert.match(hostSource, /const BOMB = \{[^}]*openingTeam: 0, nextOpeningTeam: 0, matchStartConfirmed: false \}/,
      'a host process restart initializes a new session cursor at Team 0');
  } finally {
    players.clear(); for (const [id, player] of oldPlayers) players.set(id, player);
    floodline.bombSites = authoredFloodlineSites;
    Object.assign(G, originalGame);
    Object.assign(_t.BOMB, originalBomb);
    Object.assign(_t.BOTCFG, { mode: originalBots.mode, t0: originalBots.t0, t1: originalBots.t1, balance: originalBots.balance });
  }
});
