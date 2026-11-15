'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '../../AndroidProject/app/src/main/assets/phone-host/index.html'), 'utf8');
const offlineHtml = fs.readFileSync(path.resolve(__dirname, '../../AndroidProject/app/src/main/assets/www/index.html'), 'utf8');

test('top score label distinguishes offline bots from LAN opponent scores', () => {
  const match = html.match(/function scoreOtherLabel\(\)\s*\{[\s\S]*?\}/);
  assert.ok(match, 'score label helper exists');
  const labelFor = (on, mode) => vm.runInNewContext(`${match[0]}; scoreOtherLabel()`, { MP: { on, mode } });
  assert.equal(labelFor(false, 'ffa'), 'BOTS');
  assert.equal(labelFor(true, 'ffa'), 'TOP');
  assert.equal(labelFor(true, 'bomb'), 'ENEMY');
  assert.match(html, /else \{ setT\(el\.scb, M\.bots\); setT\(el\.scbl, scoreOtherLabel\(\)\); \}/);
  assert.match(html, /setT\(el\.scb, infectionBotCount\); setT\(el\.scbl, 'BOTS'\);/);
});

test('desktop HUD score, squad status and objective use separate vertical lanes in both builds', () => {
  for (const page of [html, offlineHtml]) {
    assert.match(page, /#alive\s*\{[^}]*top:\s*72px/);
    assert.match(page, /#objective-status\s*\{[^}]*top:\s*100px/);
  }
  assert.match(html, /html\.touch-device #objective-status\s*\{top:61px/);
  assert.match(offlineHtml, /html\.touch-device #objective-status\s*\{top:61px/);
});

test('LAN Bomb rule groups stay horizontal while the settings wrapper remains a compact vertical stack', () => {
  assert.match(html, /\.mp-bomb-settings > \.seg\s*\{\s*display:grid;\s*gap:4px;/);
  assert.match(html, /\.mp-bomb-settings \.srow \.seg\s*\{\s*display:flex!important;\s*flex-wrap:wrap;/);
});
