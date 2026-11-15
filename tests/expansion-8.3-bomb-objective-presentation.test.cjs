'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const assets = path.resolve(__dirname, '../AndroidProject/app/src/main/assets');
const www = fs.readFileSync(path.join(assets, 'www/index.html'), 'utf8');
const phone = fs.readFileSync(path.join(assets, 'phone-host/index.html'), 'utf8');
const server = fs.readFileSync(path.join(assets, 'phone-host/server.js'), 'utf8');

test('Offline and LAN pages render A/B sites, carried/dropped/planted device states, and timed interaction progress', () => {
  for (const [label, page] of [['www', www], ['phone-host', phone]]) {
    assert.match(page, /function makeBombSiteMarker\(label,color\)/, label + ' must display labeled A/B sites');
    assert.match(page, /#msg\.objective-toast/, label + ' must style bomb notifications compactly outside the aiming center');
    assert.match(page, /classList\.toggle\('objective-toast',/, label + ' must apply compact styling to objective notifications');
    assert.match(page, /function ensureBombWorldVisuals\(\)/, label + ' must build a visible bomb device');
    assert.match(page, /post\.position\.set\(1\.48,\.62,0\)/, label + ' must keep the tall A/B beacon offset from the planted-device center');
    assert.match(page, /phase==='dropped'\|\|phase==='planted'/, label + ' must place the bomb prop at its authoritative world position');
    assert.match(page, /use\.action==='plant'/, label + ' must show the physical plant placement animation');
    assert.match(page, /function updateBombHudProgress\(/, label + ' must show hold progress in the HUD');
    assert.match(page, /syncBombWorldVisuals\(now\);\s*try\s*\{ renderer\.render/, label + ' must update objective presentation in the actual render loop');
    assert.match(page, /carrierName|CARRIER /, label + ' must visibly identify the carrier');
    assert.match(page, /plantedBy|PLANTED BY/, label + ' must identify the planter');
    assert.match(page, /defusedBy|DEFUSED/, label + ' must identify the defuser');
  }
});

test('LAN objective replication includes server-derived identity and interaction coordinates', () => {
  assert.match(server, /carrierName:s\.carrierId==null\?null:\(actorName\(s\.carrierId\)/);
  assert.match(server, /actorName:s\.use\.actorName\|\|actorName\(s\.use\.actorId\)/);
  assert.match(server, /siteId:s\.use\.siteId,x:s\.use\.x,y:s\.use\.y\|\|0,z:s\.use\.z/);
  assert.match(server, /event:'planted',site:s\.siteId,actorName:s\.plantedBy/);
  assert.match(server, /event:'defused',actorName:s\.defusedBy/);
});

test('carrier elimination and disconnect produce an attributed dropped-bomb event', () => {
  assert.match(server, /carrierId===q\.id&&bombDropCarrier\(q\)\)\{bombStateBroadcast\(\);bcast\(\{t:'objfx',event:'dropped',actorName:q\.name\|\|null,reason:'eliminated'\}\);\}/);
  assert.match(server, /carrierId===p\.id && bombDropCarrier\(p\)\) \{ bombStateBroadcast\(\); bcast\(\{t:'objfx',event:'dropped',actorName:p\.name\|\|null,reason:'disconnected'\}\); \}/);
  for (const [label, page] of [['www', www], ['phone-host', phone]]) {
    assert.match(page, /m\.reason==='eliminated'/, label + ' explains a carrier death');
    assert.match(page, /m\.reason==='disconnected'/, label + ' explains a carrier disconnect');
  }
});

test('Timer completion remains gated on an active plant or defuse hold, never elapsed round time alone', () => {
  const Rules = require('../AndroidProject/app/src/main/assets/www/gameplay-mode-rules.js');
  const sites = { A: { id: 'A', x: 0, z: 0 }, B: { id: 'B', x: 15, z: 0 } };
  const state = Rules.createBombRound({ round: 1, attackTeam: 0, carrierId: 4, sites });
  assert.equal(Rules.advance(state, 999999, null), null);
  assert.equal(state.phase, 'carried');
  assert.equal(state.explodeAt, 0);
});
