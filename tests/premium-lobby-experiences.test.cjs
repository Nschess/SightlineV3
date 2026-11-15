'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pages = {
  offline: fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/assets/www/index.html'), 'utf8'),
  phoneHost: fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html'), 'utf8')
};
function block(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'Missing source block: ' + start);
  return source.slice(a, b);
}

test('Offline and phone-host carry identical premium lobby layout rules', () => {
  const css = block(pages.offline, '<style id="sightline-premium-lobby-spaces">', '</style>');
  assert.equal(block(pages.phoneHost, '<style id="sightline-premium-lobby-spaces">', '</style>'), css);
  for (const concept of ['squad-bay-overline', 'operations-table', 'ops-bomb-plan', 'loadout-workbench', 'operator-bay-callout']) {
    assert.ok(css.includes(concept), 'Missing presentation system: ' + concept);
  }
  assert.match(css, /--sl-ivory:[^;]+;--sl-teal:[^;]+;--sl-amber:[^;]+/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-height:560px\) and \(orientation:landscape\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, /backdrop-filter\s*:\s*blur/i, 'Avoid a costly full-screen blur.');
});

test('Offline and phone-host share the custom mode and navigation icon family', () => {
  const modeStart = 'function sl91ModeGlyph(id)';
  const modeEnd = 'function renderModePicker()';
  const navStart = 'function sl82NavGlyph(key)';
  const navEnd = 'function sl82GroupForPage()';
  const modeA = block(pages.offline, modeStart, modeEnd);
  const navA = block(pages.offline, navStart, navEnd);
  assert.equal(block(pages.phoneHost, modeStart, modeEnd), modeA);
  assert.equal(block(pages.phoneHost, navStart, navEnd), navA);
  assert.match(modeA, /tactical:[\s\S]*?ffa:[\s\S]*?bomb:[\s\S]*?outbreak:[\s\S]*?infection:/);
  assert.match(modeA, /tactical:'<path d="M16 3 27 7v7\.2[\s\S]*?M10 23h12/, 'Tactical uses a prominent shield and formation mark.');
  assert.match(modeA, /ffa:'<circle cx="8" cy="8" r="3"\/><circle cx="24" cy="8" r="3"\/>[\s\S]*?M11 13l10 8m0-8-10 8/, 'FFA uses two opposing fighters and a central clash mark.');
  assert.match(modeA, /bomb:'<circle cx="16" cy="19" r="8"\/><path d="M14 11V7h5l2 4m-1-6 2-2/, 'Bomb uses a clear round charge, fuse, and timer hand.');
  assert.match(modeA, /outbreak:'<path d="m5 3 6 8-3 4 8 13M14 2l5 10-3 4 7 12M26 3l-3 9 3 5-2 11/, 'Outbreak uses three jagged claw scars.');
  assert.match(modeA, /infection:'<path d="M16 14c-2\.7-1\.7-6\.3-3\.3-6\.3-6\.3 0-3\.2 2\.6-5\.4 6\.3-5\.4s6\.3 2\.2 6\.3 5\.4c0 3-3\.6 4\.6-6\.3 6\.3Z"[\s\S]*?rotate\(120 16 16\)[\s\S]*?rotate\(240 16 16\)[\s\S]*?circle cx="16" cy="16" r="2\.8"/, 'Infection uses a three-lobed biohazard/cell mark with a central core, not a gear.');
  assert.match(modeA, /viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2\.8"/, 'The marks use a larger viewBox and stronger consistent stroke.');
  assert.doesNotMatch(modeA, /skull|gear|cog/i, 'Do not use generic skull or gear symbols for modes.');
  assert.match(navA, /settings:'<path d="M4 6h16M4 12h16M4 18h16"/, 'Settings uses the matching control-rail symbol.');
  assert.doesNotMatch(navA, /settings:'[^']*gear|settings:'[^']*cog/i);
});

test('visual polish keeps all modes visible and preserves touch-sized actions', () => {
  const css = block(pages.offline, '<style id="sightline-premium-lobby-spaces">', '</style>');
  const art = block(pages.offline, '<style id="sightline-lobby-production-art-direction">', '</style>');
  assert.match(art, /\.mode-grid\{display:grid;width:100%;min-width:0;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/, 'All five modes share a stable five-column desktop row.');
  assert.match(art, /@media\(max-width:1120px\)[\s\S]*?\.mode-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(art, /@media\(max-width:560px\)[\s\S]*?\.mode-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(art, /#ov-start #pn-play \.mode-desc\{grid-column:2;grid-row:2;display:-webkit-box!important/, 'Each mode keeps a concise readable explanation.');
  assert.match(css, /loadout-workbench\{grid-template-columns:minmax\(0,1\.72fr\)/, 'The actual weapon render receives the primary Armory width.');
  assert.match(css, /mode-glyph\{[^}]*stroke-width:2\.15/, 'Mode marks use a heavier line weight on the standard lobby layout.');
  assert.match(art, /#ov-start #btn-start\{min-width:220px;min-height:56px/, 'Deploy remains the primary Play action.');
  assert.match(art, /@media\(max-width:760px\)[\s\S]*?#ov-start #pn-play #btn-start\{min-width:190px;min-height:48px/);
  assert.match(art, /@media\(max-height:560px\) and \(orientation:landscape\)[\s\S]*?#ov-start #pn-play #btn-start\{min-height:42px/);
  assert.match(art, /overflow-x:hidden;overflow-y:auto/, 'The menu main owns horizontal clipping and a deliberate vertical scroll path.');
  assert.doesNotMatch(css, /overflow-wrap:anywhere|word-break:break-all|writing-mode:vertical/);
  assert.doesNotMatch(css, /backdrop-filter\s*:\s*blur/i);
});

test('final lobby keeps the original operator renderer and balances lobby-only lighting', () => {
  for (const page of Object.values(pages)) {
    assert.match(page, /new THREE\.PointLight\(0xffeadb,\.94,8\.5,2\)/);
    assert.match(page, /lobbyFill\.position\.set\(0,2\.22,-\.92\)/, 'Operator key light is raised on the camera-facing side of the rotated preview actor.');
    assert.match(page, /new THREE\.PointLight\(0x70cbb4,\.36,5\.5,2\)/, 'The lobby uses a subtle non-shadowing silhouette rim.');
    assert.match(page, /,d=4\.2;camera\.position\.set\(a\.x\+Math\.sin\(angle\)\*d,2\.05,a\.z\+Math\.cos\(angle\)\*d\)/);
    assert.match(page, /var rx=Math\.cos\(angle\),rz=-Math\.sin\(angle\),off=0;camera\.lookAt\(a\.x-rx\*off,1\.38,a\.z-rz\*off\)/, 'The lobby camera centers the existing operator over the selected playable arena.');
    assert.match(page, /if\(camera\.fov!==50\)\{camera\.fov=50;camera\.updateProjectionMatrix\(\);\}/, 'Lobby framing is isolated to idle menu state; gameplay restores its own view.');
    assert.match(page, /LOBBY_PREVIEW=makeUnit\(spawn\.x-3\.2,spawn\.z-4\.0,operator\)/, 'The existing operator asset and spawn transform remain unchanged.');
    assert.match(page, /sightlineLobbyBackdropMap=CURMAP\.id/, 'The backdrop follows the selected in-game map rather than a random scene.');
    assert.match(page, /function renderPhoneOpticPreview\(k,canvas,previewId\)[\s\S]*?g=gunFor\(k\)/, 'The existing live weapon preview renderer remains active.');
  }
});

test('Fullscreen Play keeps the live mode and Deploy controls while configuration stays in established screens', () => {
  const page = pages.offline;
  const shell = block(page, '<div class="mn-panel image2-lobby lobby-fullscreen-layout" id="pn-play"', '<div class="mn-panel" id="pn-dyn"');
  assert.match(shell, /READY FOR DEPLOYMENT/);
  assert.doesNotMatch(shell, /READY FOR<br\s*\/?\s*>DEPLOYMENT/);
  assert.match(shell, /class="lobby-mode-current"[\s\S]*?id="ov-mode-name"/);
  assert.doesNotMatch(shell, /lobby-deployment-strip|lobby-strip-actions|lobby-scene-breathing-space|lobby-ready-rail|play-map-card|data-go="map"|pl-sum/,
    'Map, squad and rule controls no longer duplicate as a Play dashboard panel.');
  assert.match(page, /\[\['host-play',connected\?'Host modes':'Offline modes'\],\['multiplayer','Multiplayer'\],\['maps',connected\?'Host maps':'Offline maps'\],\['rules',connected\?'Host match rules':'Offline match rules'\]\]/, 'The shared context navigation exposes local setup before connection and host setup afterward.');
  assert.match(shell, /id="mode-select"/);
  assert.match(shell, /id="mode-brief"/);
  assert.match(shell, /id="btn-start"/);
  const picker = block(page, 'function renderModePicker()', 'function updatePlayCopy()');
  for (const mode of ['tactical', 'ffa', 'bomb', 'outbreak', 'infection']) assert.ok(picker.includes("['" + mode + "'"));
  assert.match(picker, /data-quick-mode/);
  assert.match(page, /function mapSvg\(m\)[\s\S]*?m\.obst\.forEach/);
  const hud = block(page, '<style id="sightline-lobby-fullscreen-hud">', '</style>');
  assert.match(hud, /#pn-play\.lobby-fullscreen-layout\{position:absolute;inset:0/);
  assert.match(hud, /\.mode-grid\{display:grid;[\s\S]*?grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/, 'All five modes use one compact horizontal desktop row.');
  assert.match(hud, /\.lobby-deploy-row\{position:absolute;[\s\S]*?bottom:30px/);
  assert.match(hud, /#btn-start\{min-width:174px;min-height:52px[\s\S]*?#c99755/);
  assert.match(hud, /@media\(max-width:900px\)[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(hud, /@media\(max-width:560px\)[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(page, /\['host-play',connected\?'Host modes':'Offline modes'\],\['multiplayer','Multiplayer'\],\['maps',connected\?'Host maps':'Offline maps'\],\['rules',connected\?'Host match rules':'Offline match rules'\]/,
    'Map selection, multiplayer setup and match rules remain accessible on established screens.');
});

test('Mode copy supports all five selectable deployment modes without an empty metadata state', () => {
  const info = block(pages.offline, 'function modeInfo() {', 'function sl91ModeGlyph(id)');
  for (const mode of ['tactical', 'ffa', 'bomb', 'outbreak', 'infection']) {
    assert.match(info, new RegExp('\\b' + mode + ': \\['), 'Missing display metadata for ' + mode);
  }
  assert.match(pages.phoneHost, /function updatePlayCopy\(\)[\s\S]*?textContent='READY FOR DEPLOYMENT'/);
});

test('Operations Table and Bomb rules use the active arena SVG and existing gameplay selectors', () => {
  const page = pages.offline;
  const mapPanel = block(page, "} else if (t === 'map') {", "} else if (t === 'rules') {");
  assert.match(mapPanel, /class="operations-table"/);
  assert.match(mapPanel, /mapSvg\(CURMAP\)/);
  assert.match(mapPanel, /class="mappick" data-pick/);
  assert.match(mapPanel, /CURMAP\.notes\.map/);
  assert.match(mapPanel, /soloBombPrepareSites\(\)/);

  const rules = block(page, "} else if (t === 'rules') {", "} else if (t === 'settings') {");
  assert.match(rules, /ops-bomb-plan/);
  assert.match(rules, /mapSvg\(CURMAP\)/);
  assert.match(rules, /RULE_SPEC\.filter/);
  assert.match(rules, /data-o="R" data-k=/);
  assert.match(page, /function setMap\(id\)[\s\S]*?applyMapData\(m\)/);
});

test('Armory Ready Room renders the selected game weapon and retains saved choices', () => {
  const page = pages.offline;
  const loadout = block(page, 'function lobbyLoadoutHtml()', 'function customizationSettingsHtml()');
  assert.match(loadout, /loadout-weapon-preview/);
  assert.match(loadout, /data-loadout-weapon/);
  assert.match(loadout, /data-loadout-category/);
  assert.match(loadout, /data-loadout-finish/);
  assert.match(loadout, /WEAPONS\[key\]/);
  assert.match(page, /function renderLobbyWeaponPreview\(\)[\s\S]*?renderPhoneOpticPreview\(finishWeapon,canvas,optic\)/);
  assert.match(page, /function renderPhoneOpticPreview\(k,canvas,previewId\)[\s\S]*?g=gunFor\(k\)/);
  assert.match(page, /function chooseLobbyWeapon\(key\)[\s\S]*?localStorage\.setItem\(LOADOUT_WEAPON_KEY,key\)/);
});

test('Operators keeps the playable roster, current 3D selection, faction filters, and confirm persistence', () => {
  const page = pages.offline;
  const operators = block(page, "if (t === 'op') {", "} else if (t === 'map') {");
  assert.match(operators, /operator-bay-callout/);
  assert.match(operators, /opDetail\(opById\(pendingOpId\)\|\|ME\)/);
  assert.match(operators, /data-op-filter/);
  assert.match(operators, /data-ops/);
  assert.match(page, /function renderOps\(\)[\s\S]*?OPS\.filter/);
  assert.match(page, /function setOp\(id\)[\s\S]*?localStorage\.setItem\(OP_KEY, id\)/);
  assert.match(page, /isOp=menuOpen\(\)&&menuTab==='op',isLoadout=/);
  assert.match(page, /operator=isOp\?\(opById\(pendingOpId\)\|\|ME\)/);
});

test('Offline and phone-host production pages both wire all three experiences', () => {
  for (const [label, page] of Object.entries(pages)) {
    assert.ok(page.includes('class="mn-panel image2-lobby lobby-fullscreen-layout"'), label + ' full-screen in-engine Play root');
    assert.ok(page.includes('id="ov-mode-name"'), label + ' selected mode readout');
    assert.ok(page.includes('id="btn-start"'), label + ' live Deploy control');
    assert.ok(!page.includes('class="lobby-deployment-strip"'), label + ' obsolete dashboard strip removed');
    assert.ok(page.includes('class="operations-table"'), label + ' Operations Table');
    assert.ok(page.includes('ops-bomb-plan'), label + ' Bomb plan');
    assert.ok(page.includes('loadout-weapon-preview'), label + ' actual weapon preview');
    assert.ok(page.includes('operator-bay-callout'), label + ' Operators selection');
  }
});

test('Premium page icon system is mirrored and attached to real controls', () => {
  const weaponStart = 'function sl83WeaponGlyph(k)';
  const weaponEnd = 'function loadoutCategoryLabel(key)';
  const settingsStart = 'function sl83SettingsGlyph(k)';
  const settingsEnd = 'function sl82GroupForPage()';
  const cssStart = '<style id="sightline-page-polish-20261109">';
  const cssEnd = '</style>';
  const weaponGlyphs = block(pages.offline, weaponStart, weaponEnd);
  const settingsGlyphs = block(pages.offline, settingsStart, settingsEnd);
  const pageCss = block(pages.offline, cssStart, cssEnd);
  assert.equal(block(pages.phoneHost, weaponStart, weaponEnd), weaponGlyphs);
  assert.equal(block(pages.phoneHost, settingsStart, settingsEnd), settingsGlyphs);
  assert.equal(block(pages.phoneHost, cssStart, cssEnd), pageCss);
  for (const category of ['all', 'assault', 'smg', 'shotgun', 'marksman', 'lmg', 'pistol', 'melee']) {
    assert.match(weaponGlyphs, new RegExp('\\b' + category + ':'));
  }
  for (const tab of ['video', 'audio', 'controls', 'play', 'network']) {
    assert.match(settingsGlyphs, new RegExp('\\b' + tab + ':'));
  }
  assert.match(block(pages.offline, 'function lobbyLoadoutHtml()', 'function customizationSettingsHtml()'), /sl83WeaponGlyph\(c\)/);
  assert.match(block(pages.offline, "} else if (t === 'settings') {", "} else if (t === 'keys') {"), /sl83SettingsGlyph\(s\[0\]\)/);
  assert.match(pages.offline, /function sl82NavGlyph\(key\)[\s\S]*?loadout:'<path d="M2\.5 10/);
  assert.match(pageCss, /loadout-cats\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(pageCss, /data-sl-route=settings\] #ov-start #pn-dyn\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(pageCss, /@media\(max-width:760px\)[\s\S]*?data-sl-route=settings\] #ov-start #pn-dyn\{width:100%;grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(pageCss, /prefers-reduced-motion:reduce/);
  assert.match(pageCss, /#ov-start #pn-play\.lobby-fullscreen-layout \.mode-choice \.mode-glyph\{box-sizing:border-box;display:block;flex:0 0 30px;width:30px;height:30px;min-width:30px;padding:0;border:0;border-radius:0;background:transparent;color:var\(--mode-accent/,
    'High-specificity fullscreen rules keep the complete SVG drawing visible instead of shrinking it or wrapping it in another tiny outlined box.');
  assert.match(pageCss, /#ov-start #pn-play\.lobby-fullscreen-layout \.mode-choice-head\{grid-column:1;grid-row:1\/span 2;width:44px;height:44px/,
    'Desktop mode icons receive a readable, colored 44px badge.');
});
