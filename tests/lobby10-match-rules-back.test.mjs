import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.join(root, 'AndroidProject/app/src/main/assets');
const pages = Object.fromEntries(['www', 'phone-host'].map(name => [name,
  fs.readFileSync(path.join(assetRoot, name, 'index.html'), 'utf8')]));

function routeHarness(page, { host = false, connected = false } = {}) {
  const start = page.indexOf('function sl82ReturnFromRules(){');
  const end = page.indexOf("$('#mn-nav').addEventListener('click'", start);
  assert.ok(start >= 0 && end > start, 'actual Lobby 10 route functions are present');
  const transitions = [];
  const context = {
    touchMode: false,
    SL82_RULES_RETURN_ROUTE: '',
    SL82_HOST_SUBROUTE: 'multiplayer',
    document: { querySelector: () => ({ content: host ? 'lan-host' : 'offline' }) },
    mpConnected: () => connected,
    goTab: (tab, focus) => transitions.push({ tab, focus }),
    setTimeout: () => 0,
    $: () => null
  };
  vm.runInNewContext(page.slice(start, end), context, { timeout: 1000 });
  return { context, transitions };
}

test('Offline Rules has an accessible Back control and routes directly to setup', () => {
  for (const [name, page] of Object.entries(pages)) {
    const rulesStart = page.indexOf("else if (t === 'rules') {");
    const settingsStart = page.indexOf("else if (t === 'settings') {", rulesStart);
    const rulesMarkup = page.slice(rulesStart, settingsStart);
    assert.match(rulesMarkup, /class="btn ghost sl-match-rules-back"[^>]*data-act="rules-back"/i, `${name}: Back control in Rules panel`);
    assert.match(page, /if\(a==='rules-back'\)\{sl82ReturnFromRules\(\);return;\}/, `${name}: Back action dispatch`);
    assert.match(page, /\.mn-panel \.sl-match-rules-back\{justify-self:start;min-height:42px\}/, `${name}: Lobby 10 aligned, touch-sized button`);

    const { context, transitions } = routeHarness(page);
    context.R = { mode: 'infection', bots: 24, mates: 0, rounds: 7 };
    context.CURMAP = { id: 'old-town', name: 'Old Town' };
    const beforeRules = JSON.stringify({ mode: context.R.mode, map: context.CURMAP.id, rules: context.R });
    vm.runInNewContext("sl82GoRoute('rules', false); sl82ReturnFromRules();", context, { timeout: 1000 });
    assert.deepEqual(transitions.map(item => item.tab), ['rules', 'play'], `${name}: rules → Back to setup`);
    assert.equal(context.SL82_RULES_RETURN_ROUTE, 'offline');
    assert.equal(JSON.stringify({ mode: context.R.mode, map: context.CURMAP.id, rules: context.R }), beforeRules,
      `${name}: mode, map and edited rules are unchanged`);
  }
});

test('Host Rules Back returns to the appropriate host setup route', () => {
  const offlineHost = routeHarness(pages.www, { host: true, connected: false });
  vm.runInNewContext("sl82GoRoute('rules', false); sl82ReturnFromRules();", offlineHost.context, { timeout: 1000 });
  assert.deepEqual(offlineHost.transitions.map(item => item.tab), ['rules', 'play']);
  assert.equal(offlineHost.context.SL82_RULES_RETURN_ROUTE, 'host-play');

  const connectedHost = routeHarness(pages['phone-host'], { host: true, connected: true });
  vm.runInNewContext("sl82GoRoute('rules', false); sl82ReturnFromRules();", connectedHost.context, { timeout: 1000 });
  assert.deepEqual(connectedHost.transitions.map(item => item.tab), ['net', 'net']);
  assert.equal(connectedHost.context.SL82_RULES_RETURN_ROUTE, 'multiplayer');
  assert.equal(connectedHost.context.SL82_HOST_SUBROUTE, 'multiplayer');
});

test('Existing rule edit path persists values that remain selected when Rules reopens', () => {
  for (const [name, page] of Object.entries(pages)) {
    const start = page.indexOf('function setVal(o, k, v, commit) {');
    const end = page.indexOf('function squadText()', start);
    assert.ok(start >= 0 && end > start, `${name}: shared settings setter exists`);
    const rulesStart = page.indexOf("else if (t === 'rules') {");
    const settingsStart = page.indexOf("else if (t === 'settings') {", rulesStart);
    const rulesMarkup = page.slice(rulesStart, settingsStart);
    assert.match(rulesMarkup, /String\(p\[0\]\) === String\(R\[it\.k\]\)/, `${name}: Rules render selected values from retained state`);
    const saved = [];
    const context = {
      R: { bots: 12 },
      objOf: () => context.R,
      persist: key => saved.push(key),
      applyRules() {}, refreshSpec() {}, renderOps() {},
      S: {}, G: {}
    };
    vm.runInNewContext(page.slice(start, end), context, { timeout: 1000 });
    vm.runInNewContext("setVal('R', 'bots', 24, true);", context, { timeout: 1000 });
    assert.equal(context.R.bots, 24, `${name}: edited rule retained in match state`);
    assert.deepEqual(saved, ['R'], `${name}: edited rule persisted through existing setter`);
  }
});
test('Play shortcuts and Deploy reach the authoritative LAN rules route in both builds', () => {
  for (const page of Object.values(pages)) {
    const { context, transitions } = routeHarness(page, { connected: true });
    const shortcut = page.slice(page.indexOf('function slGoto(which)'), page.indexOf("document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-sl-goto]')"));
    vm.runInNewContext(shortcut, context);
    context.slGoto('rules');
    assert.equal(context.SL82_HOST_SUBROUTE, 'rules');
    assert.equal(transitions.at(-1).tab, 'net');
    const deploy = page.match(/if \(mpConnected\(\) && state === 'idle'\) \{ sl82GoRoute[^\n]+/)[0];
    context.state = 'idle';
    context.MP = { host: true };
    vm.runInNewContext('(function () { ' + deploy + ' })()', context);
    assert.equal(context.SL82_HOST_SUBROUTE, 'rules');
    context.MP.host = false;
    vm.runInNewContext('(function () { ' + deploy + ' })()', context);
    assert.equal(context.SL82_HOST_SUBROUTE, 'multiplayer');
  }
});

test('Connected host keeps staged rule edits across Maps and Lobby and applies one config', () => {
  for (const page of Object.values(pages)) {
    const { context, transitions } = routeHarness(page, { connected: true });
    const start = page.indexOf('function mpRulesDraft()');
    const end = page.indexOf('function mpBombRulesHtml(', start);
    const sent = [];
    Object.assign(context, {
      MP: { host: true, session: 'host-session', lobby: { phase: 'lobby', cash: 800, bots: { t0: 0 } } },
      mpSend: packet => sent.push(JSON.parse(JSON.stringify(packet))), mpRefreshPanel() {}
    });
    vm.runInNewContext(page.slice(start, end), context);
    context.sl82GoRoute('maps', false);
    assert.equal(context.SL82_HOST_SUBROUTE, 'maps');
    context.sl82GoRoute('rules', false);
    context.mpRulesAction('cash', '2000');
    context.mpRulesAction('bots', '2', 't0');
    assert.equal(sent.length, 0);
    assert.equal(context.MP.lobby.cash, 800);
    assert.equal(context.mpRulesView(context.MP.lobby, context.MP.ruleEdits.patch).cash, 2000);
    context.sl82ReturnFromRules();
    context.sl82GoRoute('rules', false);
    assert.equal(context.MP.ruleEdits.patch.cash, 2000);
    assert(context.mpRulesAction('start'));
    context.mpRulesAction('cancel-rules');
    assert.deepEqual(Object.keys(context.MP.ruleEdits.patch), []);
    context.mpRulesAction('cash', '5000');
    context.mpRulesAction('apply-rules');
    assert.deepEqual(sent, [{ t: 'cfg', cash: 5000 }]);
    assert(context.mpRulesMatch({ cash: 5000 }, context.MP.ruleEdits.patch));
    context.MP.host = false;
    assert.equal(context.mpCanEditRules(), false);
    assert.equal(context.mpRulesAction('cash', '9000'), false);
    assert(transitions.every(({ tab }) => tab === 'net'));
  }
});

test('Mobile mode change is an isolated host-acknowledged draft', () => {
  for (const page of Object.values(pages)) {
    const { context } = routeHarness(page, { connected: true });
    const sent = [];
    let timeout;
    Object.assign(context, {
      touchMode: true,
      MP: { host: true, session: 'host-session', lobby: { phase: 'lobby', mode: 'versus', cash: 800 } },
      mpSend: packet => sent.push(JSON.parse(JSON.stringify(packet))), mpRefreshPanel() {},
      setTimeout: callback => { timeout = callback; return 1; }, clearTimeout() {}
    });
    vm.runInNewContext(page.slice(page.indexOf('function mpRulesDraft()'), page.indexOf('function mpBombRulesHtml(')), context);
    context.sl82GoRoute('rules', false);
    context.mpRulesAction('mode', 'bomb');
    context.mpRulesAction('time', '180');
    assert.equal(context.MP.lobby.mode, 'versus');
    context.sl82GoRoute('maps', false);
    context.sl82GoRoute('rules', false);
    assert.equal(context.MP.ruleEdits.patch.mode, 'bomb');
    assert.equal(sent.length, 0);
    context.mpRulesAction('apply-rules');
    assert.deepEqual(sent, [{ t: 'cfg', mode: 'bomb' }]);
    assert.equal(context.MP.ruleEdits.sending, true);
    assert.equal(context.mpConfirmRules({ mode: 'versus' }), false);
    timeout();
    assert.equal(context.MP.ruleEdits.sending, false);
    assert.equal(context.mpConfirmRules({ mode: 'bomb' }), true);
    assert.equal(context.MP.ruleEdits.pendingPatch, null);
    context.mpRulesAction('mode', 'ffa');
    context.mpRulesAction('apply-rules');
    timeout();
    context.mpRulesAction('mode', 'infection');
    assert.equal(context.mpConfirmRules({ mode: 'ffa' }), false);
    assert.equal(context.MP.ruleEdits.patch.mode, 'infection');
  }
});

test('Mobile offline draft applies only its edited fields and Cancel preserves saved rules', () => {
  for (const page of Object.values(pages)) {
    const saves = [];
    const context = {
      touchMode: true, menuTab: 'rules', R: { mode: 'tactical', cash: 800 }, R_KEY: 'rules',
      canPick: () => true, mpConnected: () => false, renderBody() {}, uiTick() {},
      saveObj: (_, rules) => saves.push({ ...rules }), applyRules() {}, refreshSpec() {}
    };
    const start = page.indexOf('var MOBILE_SET_TABS =');
    const end = page.indexOf('function mobileOfflineRulesHtml()', start);
    vm.runInNewContext(page.slice(start, end), context);
    context.mobileOfflineRuleAction('edit', 'cash', 2000);
    assert.equal(context.R.cash, 800);
    context.mobileOfflineRuleAction('cancel');
    assert.equal(saves.length, 0);
    context.mobileOfflineRuleAction('edit', 'cash', 5000);
    context.menuTab = 'map';
    context.R.mode = 'bomb';
    context.menuTab = 'rules';
    context.mobileOfflineRuleAction('apply');
    assert.deepEqual(saves, [{ mode: 'bomb', cash: 5000 }]);
  }
});
