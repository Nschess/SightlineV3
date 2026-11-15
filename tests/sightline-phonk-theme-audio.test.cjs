'use strict';

// Source/asset routing verification only; actual Android playback remains device QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets');
const offlineDir = path.join(assets, 'www');
const phoneDir = path.join(assets, 'phone-host');
const offline = fs.readFileSync(path.join(offlineDir, 'index.html'), 'utf8');
const phone = fs.readFileSync(path.join(phoneDir, 'index.html'), 'utf8');
const themeName = 'sightline-theme.mp3';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function themeRuntime(html) {
  const start = html.indexOf('var lobbyMusicElement=');
  const end = html.indexOf('/* Procedural multi-layer transients', start);
  assert.ok(start >= 0 && end > start, 'active lobby theme runtime has clear bounds');
  return html.slice(start, end);
}

test('owner-provided theme asset is retained byte-identically in both Android game pages', () => {
  const offlineTheme = fs.readFileSync(path.join(offlineDir, themeName));
  const phoneTheme = fs.readFileSync(path.join(phoneDir, themeName));
  assert.deepEqual(offlineTheme, phoneTheme);
  assert.ok(offlineTheme.length > 1_000_000, 'theme asset is not an empty placeholder');

  // CURRENT-SOURCE-SHA256 intentionally covers source files, not large media.
  // Verify media parity directly and validate its distribution hash below.
  const hostManifest = fs.readFileSync(path.join(phoneDir, 'SHA256SUMS'), 'utf8');
  assert.ok(hostManifest.includes(`${digest(phoneTheme)}  ${themeName}`), 'phone-host bundle pins the current theme hash');
});

test('Offline and phone-host route the current theme through the same autoplay-safe lobby lifecycle', () => {
  const runtime = themeRuntime(offline);
  assert.equal(runtime, themeRuntime(phone), 'Offline and phone-host playback logic is in parity');
  assert.match(runtime, /el\.src='sightline-theme\.mp3';el\.preload='auto';el\.loop=true/);
  assert.match(runtime, /function syncLobbyMusic\(fromGesture\)/);
  assert.match(runtime, /function lobbyMusicGesture\(e\)/);
  assert.match(runtime, /addEventListener\('pointerdown',lobbyMusicGesture,true\)/);
  assert.match(runtime, /addEventListener\('touchstart',lobbyMusicGesture/);
  assert.match(runtime, /addEventListener\('keydown',lobbyMusicGesture,true\)/);
  assert.match(runtime, /if\(attempt&&typeof attempt\.then==='function'\)[\s\S]*\.catch\(function\(\)/,
    'autoplay rejection is handled without pretending playback started');
  assert.match(runtime, /function lobbyMusicLevel\(\)[\s\S]*G\.musicVol/);
  assert.match(offline, /document\.body\.classList\.toggle\('sl-lobby-screen', id === '#ov-start'\); setLobbyMusicActive\(id === '#ov-start'\)/);
  assert.match(offline, /function startMatch\(\) \{[\s\S]*?setLobbyMusicActive\(false\)/);
  assert.doesNotMatch(offline + phone, /sightline-main-theme\.wav|Beyond the Sightline|BREACH VECTOR/,
    'no obsolete theme reference is active');
  new vm.Script(runtime, { filename: 'lobby-theme-runtime.js' });
});

test('Android and phone-host request routing permit the current MP3 asset', () => {
  const server = fs.readFileSync(path.join(phoneDir, 'server.js'), 'utf8');
  assert.match(server, /'\/sightline-theme\.mp3':\['sightline-theme\.mp3','audio\/mpeg'\]/);
  const activity = fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java'), 'utf8');
  const allowlist = activity.match(/private static final Set<String> FILES = new HashSet<>\(Arrays\.asList\(([\s\S]*?)\)\);/);
  assert.ok(allowlist && allowlist[1].includes('"sightline-theme.mp3"'),
    'Android WebView allowlist permits the local audio request');
  const service = fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/java/com/sightline/v3/LanHostService.java'), 'utf8');
  assert.match(service, /hashes\.containsKey\("sightline-theme\.mp3"\)/);
});
