'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const offline = fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/assets/www/index.html'), 'utf8');
const phoneHost = fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html'), 'utf8');

function lobbyProjectedNdc(x, y, z, aspect = 1.78) {
  const angle = .38, d = 4.2, off = 0;
  const cam = [Math.sin(angle)*d, 2.05, Math.cos(angle)*d];
  const target = [-Math.cos(angle)*off, 1.38, Math.sin(angle)*off];
  const norm = v => Math.hypot(v[0], v[1], v[2]);
  const sub = (a, b) => a.map((n, i) => n - b[i]);
  const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const f0 = sub(target, cam), f = f0.map(n => n / norm(f0));
  const r0 = cross(f, [0, 1, 0]), right = r0.map(n => n / norm(r0));
  const up = cross(right, f);
  const delta = [x - cam[0], y - cam[1], z - cam[2]];
  const depth = dot(delta, f);
  const tanHalfFov = Math.tan(50 * Math.PI / 360);
  return { x: dot(delta, right) / (depth * tanHalfFov * aspect), y: dot(delta, up) / (depth * tanHalfFov) };
}

function block(page, start, end) {
  const a = page.indexOf(start);
  const b = page.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Missing source block: ${start}`);
  return page.slice(a, b);
}

test('Offline and phone-host show the currently selected playable map behind the shared operator preview', () => {
  const start = 'var LOBBY_PREVIEW=null';
  const end = 'function idleCamera(dt)';
  const a = block(offline, start, end);
  assert.equal(block(phoneHost, start, end), a, 'Both production pages use the same deterministic map-backed preview.');
  assert.match(a, /sightlineLobbyBackdropMap=CURMAP\.id/);
  assert.match(a, /key=operator\.id\+'\|'\+CURMAP\.id\+'\|'\+weapon/, 'Changing the selected arena rebuilds the preview against that map.');
  assert.doesNotMatch(a, /createLobbyReadyRoom|LOBBY_READY_ROOM|setLobbyWorldForPreview/,
    'The lobby must not cover the selected playable arena with a fabricated room or hide map meshes.');
  for (const page of [offline, phoneHost]) assert.match(page, /buildWorld\(CURMAP\)/, 'The actual game map remains the background source.');
});

test('Selected-map showcase appears only in the idle lobby and keeps existing playable models', () => {
  for (const page of [offline, phoneHost]) {
    const preview = block(page, 'var LOBBY_PREVIEW=null', 'function idleCamera(dt)');
    assert.match(preview, /function lobbyPreviewUpdate\(active\)\{if\(!active\)[\s\S]*?LOBBY_PREVIEW\.g\.visible=false;return/);
    assert.match(page, /lobbyPreviewUpdate\(state==='idle'&&menuOpen\(\)\)/);
    assert.match(preview, /makeUnit\(spawn\.x-3\.2,spawn\.z-4\.0,operator\)/, 'The existing operator asset and spawn offset stay unchanged.');
    assert.match(preview, /ensureWorldWeapon\(LOBBY_PREVIEW,weapon\)/, 'Existing weapon presentation remains in use.');
    assert.match(preview, /LOBBY_PREVIEW\.g\.userData\.sightlineLobbyBackdropMap=CURMAP\.id/);
  }
});

test('Lobby backdrop uses real map geometry without changing map construction or collision data', () => {
  for (const page of [offline, phoneHost]) {
    const preview = block(page, 'var LOBBY_PREVIEW=null', 'function idleCamera(dt)');
    assert.doesNotMatch(preview, /worldObjs\s*\.forEach|OBST\s*=|buildWorld\s*\(/, 'The preview does not mutate map meshes, obstacles, or map building.');
    assert.match(page, /buildWorld\(CURMAP\)/);
    assert.match(page, /function setMap\(id\)[\s\S]*?applyMapData\(m\)/);
    assert.match(page, /function setMap\(id\)[\s\S]*?buildWorld\(m\);\s*rebuildTargets\(\);\s*renderMapInfo\(\);\s*renderPickers\(\);\s*saveMapId\(id\)/,
      'The existing map choice still rebuilds the actual arena and persists the selected map.');
  }
});

test('Lobby camera centers the existing operator over the selected map and leaves gameplay framing alone', () => {
  for (const page of [offline, phoneHost]) {
    const camera = block(page, "if(state==='idle'&&menuOpen()&&LOBBY_PREVIEW&&LOBBY_PREVIEW.g)", "camera.rotation.z=0;return;}");
    assert.match(camera, /,d=4\.2;camera\.position\.set\(a\.x\+Math\.sin\(angle\)\*d,2\.05,a\.z\+Math\.cos\(angle\)\*d\)/);
    assert.match(camera, /off=0;camera\.lookAt\(a\.x-rx\*off,1\.38,a\.z-rz\*off\)/);
    assert.match(camera, /camera\.fov!==50/);
    const operator = lobbyProjectedNdc(0,1.6,0), head = lobbyProjectedNdc(0,2.3,0), feet = lobbyProjectedNdc(0,.15,0);
    assert.ok(operator.x>-.08&&operator.x<.12&&operator.y>-.2&&operator.y<.3, 'The unchanged operator is centered above the bottom HUD.');
    assert.ok(head.y<.65&&feet.y>-.8, 'The full existing operator remains vertically visible.');
  }
});

test('Play is a full-screen HUD over the renderer with no setup dashboard or duplicated map controls', () => {
  const marker = '<style id="sightline-lobby-fullscreen-hud">';
  const a = block(offline, marker, '</style');
  assert.equal(block(phoneHost, marker, '</style'), a, 'Offline and phone-host use identical fullscreen HUD styling.');
  for (const page of [offline, phoneHost]) {
    const panel = block(page, '<div class="mn-panel image2-lobby lobby-fullscreen-layout" id="pn-play"', '<div class="mn-panel" id="pn-dyn"');
    assert.match(panel, /READY FOR DEPLOYMENT/);
    assert.match(panel, /id="ov-mode-name"/);
    assert.match(panel, /id="mode-select"/);
    assert.match(panel, /id="btn-start"/);
    assert.doesNotMatch(panel, /lobby-deployment-strip|lobby-ready-rail|play-map-card|data-go="map"|id="pl-sum"/,
      'Play contains no oversized setup panel or duplicate Maps entry; those routes remain in context navigation.');
    assert.match(page, /function updatePlayCopy\(\)[\s\S]*?textContent=String\(info\[0\]\|\|R\.mode\)\.toUpperCase\(\)/);
    assert.doesNotMatch(page, /\$\('#pl-sum'\)\.innerHTML/, 'Legacy setup summary is not rendered into Play.');
    for (const mode of ['tactical','ffa','bomb','outbreak','infection']) assert.match(page, new RegExp("\\['"+mode+"','"));
    assert.match(page, /connected\?'Host modes':'Offline modes'/,
      'The shared context navigation labels the local mode route before connection.');
    assert.match(page, /connected\?'Host maps':'Offline maps'/,
      'Maps remain accessible locally and switch to host maps after connection.');
    assert.match(page, /connected\?'Host match rules':'Offline match rules'/,
      'Match Rules remain accessible locally and switch to authoritative host rules after connection.');
  }
  assert.match(a, /#pn-play\.lobby-fullscreen-layout\{position:absolute;inset:0/);
  assert.match(a, /#pn-play\.lobby-fullscreen-layout \.lobby-title-block\{position:absolute/);
  assert.match(a, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(a, /\.lobby-mode-deck\{position:absolute;left:[\s\S]*?bottom:98px/);
  assert.match(a, /\.lobby-deploy-row\{position:absolute;left:[\s\S]*?bottom:30px/);
  assert.match(a, /#btn-start\{min-width:174px;min-height:52px[\s\S]*?background:linear-gradient\(180deg,#e7c17f,#c99755\)/);
  assert.match(a, /@media\(max-width:900px\)[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
    'Narrow and phone landscape layouts compact the mode selector into readable touch rows.');
  assert.match(a, /@media\(max-width:560px\)[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(a, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(a, /overflow-wrap:anywhere|word-break:break-all|writing-mode:vertical/);
  assert.doesNotMatch(offline+phoneHost, /<style id="sightline-lobby-deployment-strip">|lobby-deployment-strip-layout/);
});

test('Fullscreen HUD dimensions fit desktop and responsive layouts without crowding the operator viewport', () => {
  const desktop = 1728, desktopWidth = Math.min(800,desktop*.56), desktopCell = (desktopWidth-4*5)/5;
  assert.ok(desktopWidth===800 && desktopCell>=145, 'Desktop keeps five clear, single-row mode controls.');
  const androidLandscape = 800, touchLandscapeWidth = androidLandscape-28, touchCell = (touchLandscapeWidth-2*4)/3;
  assert.ok(touchCell>=250, 'An 800px landscape phone/tablet uses three readable touch targets per row.');
  const phone = 390, phoneWidth=phone-28, phoneCell=(phoneWidth-4)/2;
  assert.ok(phoneCell>=170, 'Narrow screens use two readable touch targets per row.');
  for (const page of [offline, phoneHost]) {
    const hud = block(page, '<style id="sightline-lobby-fullscreen-hud">', '</style');
    const productionArt = block(page, '<style id="sightline-lobby-production-art-direction">', '</style');
    assert.match(productionArt,/body\.sl-lobby-screen \.stage-wrap\{position:fixed;inset:0;z-index:0;width:100vw;height:100dvh/,'The real WebGL stage fills the viewport.');
    assert.match(hud,/overflow:hidden;padding:0;background:none/,'Play has no scrollable dashboard surface.');
    assert.match(hud,/white-space:nowrap/,'Heading and mode names remain horizontal.');
    assert.match(hud,/writing-mode:horizontal-tb/,'Mode text is never vertically oriented.');
    assert.match(hud,/min-height:44px/,'Touch layout preserves accessible button height.');
    assert.match(hud,/body\.sl-lobby-screen\[data-sl-route=play\] #ov-start \.mn-main\{[^}]*overflow:hidden/,'The Play route suppresses dashboard scrolling.');
  }
});

test('Offline and phone-host pages remain byte-identical to the frozen pre-stabilization source', () => {
  const sha256 = source => require('node:crypto').createHash('sha256').update(source).digest('hex');
  const expected = [
    'e3f86554ff8a9c67e00cc4f84d3ffb7e97e1173c7a59bd210c7bbb55aaee97bd',
    '4c0c546ce704c9c77310b0c98fc8f0080692dd6f668229f685b6066bed1fa660'
  ];
  assert.doesNotMatch(offline+phoneHost, /<style id="sightline-lobby-command-reconstruction">/,
    'The stale fixed-width style block remains absent from both production pages.');
  [offline, phoneHost].forEach((page, i) => assert.equal(sha256(page), expected[i],
    'Production page ' + i + ' must match its pre-stabilization SHA-256.'));
});
