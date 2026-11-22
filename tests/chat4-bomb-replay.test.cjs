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

test('Offline Bomb replay starts alternate only after validated sites are ready', () => {
  const context = vm.createContext({
    SightlineModeRules: OfflineRules,
    R: { bombBestOf: 5 },
    SOLO_BOMB: { openingTeam: 0, nextOpeningTeam: 0 }
  });
  vm.runInContext(extractFunction(offlinePage, 'beginSoloBombMatch', 'bombAttackTeamForSoloRound'), context);
  vm.runInContext(extractFunction(offlinePage, 'bombAttackTeamForSoloRound', 'startSoloBombRound'), context);

  const startMatch = extractFunction(offlinePage, 'startMatch', 'nextRound');
  const validateAt = startMatch.indexOf("if(R.mode==='bomb'&&!soloBombPrepareSites())");
  const advanceAt = startMatch.indexOf("if(R.mode==='bomb')beginSoloBombMatch();");
  assert.ok(validateAt >= 0 && advanceAt > validateAt, 'failed map validation must not consume an opening-side turn');

  const matchSequence = () => {
    context.beginSoloBombMatch();
    return [1, 2, 3, 4, 5].map(round => context.bombAttackTeamForSoloRound(round));
  };
  assert.deepEqual(matchSequence(), [0, 0, 1, 1, 1]);
  assert.deepEqual(matchSequence(), [1, 1, 0, 0, 0]);
  assert.deepEqual(matchSequence(), [0, 0, 1, 1, 1]);
});

test('LAN match replays alternate opening sides and publish the authoritative role in phase and objective state', () => {
  const { G, players, _t } = Host;
  const originalGame = { mode: G.mode, phase: G.phase, map: G.map, round: G.round, rounds: G.rounds, time: G.time,
    kills: G.kills, score: G.score, phaseEnd: G.phaseEnd, liveStart: G.liveStart, lastWin: G.lastWin };
  const originalBomb = { settings: _t.BOMB.settings, sites: _t.BOMB.sites, state: _t.BOMB.state, supportMap: _t.BOMB.supportMap,
    unsupportedReason: _t.BOMB.unsupportedReason, openingTeam: _t.BOMB.openingTeam, nextOpeningTeam: _t.BOMB.nextOpeningTeam, score: _t.BOMB.score };
  const originalBots = { mode: _t.BOTCFG.mode, t0: _t.BOTCFG.t0, t1: _t.BOTCFG.t1, balance: _t.BOTCFG.balance };
  const oldPlayers = new Map(players);
  try {
    players.clear();
    G.mode = 'bomb'; G.phase = 'lobby'; G.map = 'floodline_district'; G.round = 0; G.rounds = 3; G.time = 90;
    G.kills = 20; G.score = [0, 0]; G.phaseEnd = 0; G.liveStart = 0; G.lastWin = -1;
    _t.BOMB.settings = HostRules.settings({ bestOf: 5 }); _t.BOMB.sites = null; _t.BOMB.state = null;
    _t.BOMB.supportMap = ''; _t.BOMB.unsupportedReason = ''; _t.BOMB.openingTeam = 0; _t.BOMB.nextOpeningTeam = 0;
    _t.BOTCFG.mode = 'add'; _t.BOTCFG.t0 = 0; _t.BOTCFG.t1 = 0; _t.BOTCFG.balance = false;

    let authoredSites = null;
    for (const opening of [0, 1, 0, 1]) {
      G.phase = 'lobby';
      _t.startMatch();
      assert.equal(G.round, 1);
      assert.equal(_t.BOMB.state.attackTeam, opening);
      const phase = _t.phaseMsg();
      assert.equal(phase.attackTeam, opening);
      assert.equal(phase.objective.attackTeam, opening);
      const sites = JSON.stringify(_t.BOMB.state.sites);
      if (authoredSites === null) authoredSites = sites;
      else assert.equal(sites, authoredSites, 'replay variation does not move the authored objective sites');

      G.round = 2; G.phase = 'roundend';
      _t.startRound();
      assert.equal(G.round, 3);
      assert.equal(_t.BOMB.state.attackTeam, 1 - opening, 'the existing halfway side switch remains intact');
      assert.equal(_t.phaseMsg().objective.attackTeam, 1 - opening);
    }
  } finally {
    players.clear(); for (const [id, player] of oldPlayers) players.set(id, player);
    Object.assign(G, originalGame);
    Object.assign(_t.BOMB, originalBomb);
    Object.assign(_t.BOTCFG, { mode: originalBots.mode, t0: originalBots.t0, t1: originalBots.t1, balance: originalBots.balance });
  }
});
