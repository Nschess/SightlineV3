'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pages = {
  offline: fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/assets/www/index.html'), 'utf8'),
  phoneHost: fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html'), 'utf8')
};
function between(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `missing source block ${start}`);
  return source.slice(a, b);
}

test('Offline and phone-host use the same live operator scene and corrected layout', () => {
  const preview = between(pages.offline, 'var LOBBY_PREVIEW=null', 'var last = performance.now();');
  const layout = between(pages.offline, '<style id="sightline-lobby-production-art-direction">', '</style>');
  for (const source of Object.values(pages)) {
    assert.equal(between(source, 'var LOBBY_PREVIEW=null', 'var last = performance.now();'), preview);
    assert.doesNotMatch(source, /<style id="sightline-lobby-command-reconstruction">/);
    assert.doesNotMatch(source, /#ov-start \.mn-main\{[^}]*width:min\(610px,54vw\)/);
    assert.equal(between(source, '<style id="sightline-lobby-production-art-direction">', '</style>'), layout);
    assert.match(preview, /makeUnit\(spawn\.x-3\.2,spawn\.z-4\.0,operator\)/);
    assert.match(preview, /ensureWorldWeapon\(LOBBY_PREVIEW,weapon\)/);
    assert.match(preview, /sightlineLobbyOperatorFill/);
    assert.doesNotMatch(source, /lobbyBuildStage|lobbyPreviewMaterialize|LOBBY_PREVIEW_(?:LIGHT|RIM|MATERIAL)|LOBBY_STAGE/);
    assert.doesNotMatch(source, /<style id="sightline-lobby-visual-correction">/);
  }
});

test('the five production modes keep their existing selection and lock behavior', () => {
  const picker = between(pages.offline, 'function sl91ModeGlyph(id)', 'function renderPlay()');
  for (const mode of ['tactical', 'ffa', 'bomb', 'outbreak', 'infection']) {
    assert.ok(picker.includes("['" + mode + "'"), `missing ${mode} mode`);
    assert.ok(picker.includes('data-quick-mode'), 'mode controls must use the production action hook');
  }
  assert.match(picker, /canPick\(\)\|\|mpConnected\(\)/);
  assert.match(picker, /aria-pressed=/);
  assert.match(picker, /DEPLOY/);
  const glyph = vm.runInNewContext(between(pages.offline, 'function sl91ModeGlyph(id)', 'function renderModePicker(){') + '\nsl91ModeGlyph');
  const renderedIcons = ['tactical', 'ffa', 'bomb', 'outbreak', 'infection'].map(glyph);
  assert.equal(new Set(renderedIcons).size, 5, 'each mode needs distinct original vector artwork');
  assert.doesNotMatch(renderedIcons.join(''), /<circle cx="12" cy="12" r="6"\/><circle cx="12" cy="12" r="1\.5"\/>/,
    'the generic crosshair artwork must not return');
});

test('lobby layout constrains panels and keeps all mode choices inside the viewport', () => {
  const css = between(pages.offline, '<style id="sightline-lobby-production-art-direction">', '</style>');
  assert.match(css, /\.mn-panel\{box-sizing:border-box;min-width:0;max-width:100%;overflow-wrap:normal;word-break:normal\}/);
  assert.match(css, /\.mn-main\{[^}]*overflow-x:hidden;overflow-y:auto/);
  assert.match(css, /\.mode-grid\{display:grid;width:100%;min-width:0;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)[^}]*overflow:visible/);
  assert.match(css, /\.mode-choice\{[^}]*width:100%;min-width:0;max-width:100%/);
  assert.match(css, /\.mn-main\{[^}]*width:auto;max-width:none;max-height:none;height:auto/);
  assert.match(css, /min-height:clamp\(620px,calc\(100dvh - 110px\),820px\)/);
  assert.match(css, /@media\(max-width:1120px\)[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:560px\)[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /white-space:nowrap;word-break:keep-all;overflow-wrap:normal;writing-mode:horizontal-tb/);
  const menu = pages.offline.match(/function renderMenu\(keep\)\{[^\n]*/)?.[0] || '';
  assert.match(menu, /main\.scrollLeft=0/);
  const cases = [
    {name:'desktop 1919px', viewport:1919, width:1919-128, columns:5, gap:13},
    {name:'landscape 800x360', viewport:800, width:800-48, columns:3, gap:8},
    {name:'mobile 390px', viewport:390, width:390 - 28, columns:2, gap:6}
  ];
  for (const c of cases) {
    const tile = (c.width - c.gap * (c.columns - 1)) / c.columns;
    assert.ok(tile > 56, `${c.name} mode target is too narrow: ${tile}px`);
    assert.ok(tile * c.columns + c.gap * (c.columns - 1) <= c.width + 1e-7,
      `${c.name} mode grid exceeds its assigned width`);
  }
});

test('menu route state and full-screen presentation track overlay lifecycle', () => {
  const route = between(pages.offline, 'function renderBody(keep)', 'function menuOpen()');
  const overlay = between(pages.offline, 'function showOverlay(id)', 'function exitLock()');
  assert.match(route, /data-sl-route/);
  assert.match(route, /data-sl-mode/);
  assert.match(overlay, /classList\.toggle\('sl-lobby-screen', id === '#ov-start'\)/);
  assert.match(overlay, /classList\.remove\('sl-lobby-screen'\)/);
  assert.match(pages.offline, /body\.sl-lobby-screen #stage\{width:100%;height:100%/);
  assert.match(pages.offline, /prefers-reduced-motion:reduce/);
  assert.match(pages.offline, /@media\(max-height:560px\) and \(orientation:landscape\)/);
  assert.match(pages.offline, /:focus-visible/);
});
