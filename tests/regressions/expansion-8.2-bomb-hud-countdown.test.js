'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '../../AndroidProject/app/src/main/assets/www/index.html'), 'utf8');
function functionSource(name, nextName) {
  const start = html.indexOf('function ' + name + '('), end = html.indexOf('function ' + nextName + '(', start + 1);
  assert.ok(start >= 0 && end > start, 'missing function boundary: ' + name);
  return html.slice(start, end) + '\nglobalThis.bombHudText = bombHudText;';
}

test('Bomb HUD derives the Offline plant/defuse countdown from authoritative completion time', () => {
  const context = vm.createContext({ T: 10 }); vm.runInContext(functionSource('bombHudText', 'soloBombCancel'), context);
  const objective = { phase: 'planted', attackTeam: 0, siteId: 'A', use: { action: 'defuse', actorId: 22, startedAt: 10000, completeAt: 13000 }, scores: [1, 2] };
  assert.equal(context.bombHudText(objective, 0, 1), 'ATTACK · OPERATIVE 22 IS DEFUSING AT A · 3s · 1–2 rounds');
  context.T = 11.1;
  assert.equal(context.bombHudText(objective, 0, 1), 'ATTACK · OPERATIVE 22 IS DEFUSING AT A · 2s · 1–2 rounds');
});

test('Bomb HUD retains LAN remainingMs support and never renders NaN when timing is absent', () => {
  const context = vm.createContext({ T: 10 }); vm.runInContext(functionSource('bombHudText', 'soloBombCancel'), context);
  const lan = { phase: 'planted', attackTeam: 1, siteId: 'B', use: { action: 'plant', actorId: 9, remainingMs: 2001 }, scores: [0, 0] };
  assert.equal(context.bombHudText(lan, 0, 1), 'DEFEND · OPERATIVE 9 IS PLANTING AT B · 3s · 0–0 rounds');
  const unknown = { phase: 'planted', attackTeam: 1, siteId: 'B', use: { action: 'defuse', actorId: 9 }, scores: [0, 0] };
  const text = context.bombHudText(unknown, 0, 1);
  assert.match(text, /^DEFEND · OPERATIVE 9 IS DEFUSING AT B · 0–0 rounds$/);
  assert.doesNotMatch(text, /NaN|undefined/);
});

test('Offline AI objective actions identify the operator while the local player gets explicit hold instructions', () => {
  const start = html.indexOf('function soloBombUse('), end = html.indexOf('function mpBombUse(', start + 1);
  assert.ok(start >= 0 && end > start, 'missing soloBombUse function');
  const source = html.slice(start, end) + '\nglobalThis.soloBombUse = soloBombUse;';
  const messages = [];
  const context = vm.createContext({
    P: { id: 7, team: 0 }, T: 10, R: { mode: 'bomb' }, state: 'live',
    SOLO_BOMB: { state: { phase: 'planted', attackTeam: 0, use: null } },
    soloActorData: actor => ({ id: actor.id, team: actor.team, alive: true }),
    SightlineModeRules: { beginUse: (s, actor, action) => { s.use = { actorId: actor.id, action, completeAt: 13000 }; return true; } },
    showMsg: (...args) => messages.push(args), sfxTone: () => {}, updateHud: () => {}
  });
  vm.runInContext(source, context);
  assert.equal(context.soloBombUse({ id: 12, team: 1 }), true, 'defender bot should begin defusing');
  assert.equal(messages.length, 1, 'AI action should be visible instead of appearing automatic');
  assert.match(messages[0][0], /is defusing/i);
  assert.match(messages[0][1], /Stay in position/i);
  messages.length = 0;
  context.SOLO_BOMB.state.use = null;
  context.P.team = 1;
  assert.equal(context.soloBombUse(context.P), true, 'local defender should begin defusing');
  assert.equal(messages.length, 1, 'local player action should retain immediate interaction feedback');
  assert.match(messages[0][1], /Stay in position/i);
});
