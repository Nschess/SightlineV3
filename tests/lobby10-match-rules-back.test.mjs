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
